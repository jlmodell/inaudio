import { app, dialog, shell, type SaveDialogOptions } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { MODEL_CATALOG, voiceSid, type ModelId } from '@shared/domain/models';
import type { ExportFormat, Transcript } from '@shared/domain/history';
import { exportFileName, exportTranscripts } from '@shared/history/export';
import type { TranscribeResult } from '@shared/ipc/api';
import { EVENTS, IPC } from '@shared/ipc/channels';
import { EXTERNAL_LINKS, schemas } from '@shared/ipc/schemas';
import { applyReplacements } from '@shared/text/replacements';
import { openTrustedExternal } from '../security/hardening';
import type { Services } from '../services/container';
import { handle, handleOn, listen } from './handle';

const none = z.undefined();

const EXPORT_NAME: Record<ExportFormat, string> = { txt: 'Plain text', md: 'Markdown', json: 'JSON' };

export function registerIpc(services: Services): void {
  const { settings, history, models, stt, tts: synthesis, inserter, paths, companion } = services;

  handle(IPC.systemStatus, none, () => services.status());
  handle(IPC.systemOpenLink, schemas.openLink, (id) => openTrustedExternal(EXTERNAL_LINKS[id]));
  // A fixed OS page, never a URL from the renderer: where an app's output device is chosen.
  handleOn('main', IPC.systemOpenSoundSettings, none, async () => {
    if (process.platform === 'win32') await shell.openExternal('ms-settings:apps-volume');
    else if (process.platform === 'darwin') await shell.openExternal('x-apple.systempreferences:com.apple.preference.sound');
    else throw new Error('Open your desktop’s sound settings to change an app’s output.');
  });
  handle(IPC.systemRevealModels, none, async () => {
    await shell.openPath(paths.models);
  });
  handle(IPC.systemWindow, schemas.windowAction, (action) => {
    const win = services.window();
    if (!win || win.isDestroyed()) return;
    if (action === 'minimize') {
      win.minimize();
      return;
    }
    if (action === 'close') {
      win.close();
      return;
    }
    if (win.isMaximized()) win.unmaximize();
    else win.maximize();
  });
  handle(IPC.systemMenu, schemas.menuCommand, async (command) => {
    if (command === 'file.open-models-folder') {
      await shell.openPath(paths.models);
      return;
    }
    if (command === 'file.run-setup') {
      settings.update({ onboardingComplete: false });
      return;
    }
    if (command === 'file.quit') {
      app.quit();
      return;
    }
    const win = services.window();
    if (!win || win.isDestroyed()) return;
    win.show();
    win.focus();
    const route = command.slice('view.'.length);
    win.webContents.send(EVENTS.command, `navigate:${route}`);
  });
  handle(IPC.updateStatus, none, () => services.updater.get());
  handle(IPC.updateCheck, none, () => services.updater.check());
  handle(IPC.updateDownload, none, () => services.updater.download());
  handle(IPC.updateInstall, none, () =>
    services.updater.install(async () => {
      await services.dispose();
    }),
  );

  handle(IPC.settingsGet, none, () => settings.get());
  handleOn('main', IPC.settingsUpdate, schemas.settingsPatch, (patch) =>
    services.updateSettings(patch),
  );

  handle(IPC.modelsList, none, () => services.modelStatuses());
  handle(IPC.modelsDownload, schemas.modelId, (id) => {
    // Progress is pushed as events; the promise settles when the job ends.
    return models.download(id);
  });
  handle(IPC.modelsCancel, schemas.modelId, (id) => models.cancel(id));
  handle(IPC.modelsRemove, schemas.modelId, (id) => services.removeModel(id));
  handle(IPC.modelsLoad, schemas.modelId, (id) => services.ensureLoaded(id));
  handle(IPC.modelsUnload, schemas.modelId, (id) => services.unloadModel(id));
  handle(IPC.modelsActivate, schemas.modelId, (id) => services.activateModel(id));
  handle(IPC.modelsVerify, schemas.modelId, (id) => services.verifyModel(id));
  handle(IPC.modelsReveal, schemas.modelId, (id) => {
    if (!models.isInstalled(id)) throw new Error('Model is not installed');
    shell.showItemInFolder(models.directory(id));
  });

  handle(IPC.dictationTranscribe, schemas.transcribe, async ({ samples, sampleRate, insert }) => {
    const current = settings.get();
    const modelId: ModelId = current.stt.modelId;
    // Synthesis runs in its own worker and queue, so companion speech cannot extend this wait.
    const cleanup = services.sttCleanup('dictation');
    const raw = await services.runModel(modelId, () => stt.transcribe(samples, sampleRate, cleanup), 100);
    // Custom words fix names and terms the engine mishears, before anything is saved or typed.
    const result = { ...raw, text: applyReplacements(raw.text, current.stt.replacements) };
    const response: TranscribeResult = { transcript: null, text: result.text, inserted: false };
    if (!result.text) return response;
    companion.react('transcription.completed', 'ready');

    const transcript: Transcript = {
      id: randomUUID(),
      text: result.text.slice(0, 20_000),
      modelId,
      durationMs: Math.round((samples.length / sampleRate) * 1000),
      inferenceMs: result.inferenceMs,
      language: result.language.slice(0, 16),
      createdAt: Date.now(),
      source: 'microphone',
      title: '',
      pinned: false,
    };
    if (current.dictation.saveHistory) {
      history.add(transcript);
      services.send(EVENTS.historyChanged, null);
    }
    response.transcript = transcript;
    // The overlay shows the text inline, so this is a no-op unless the overlay is off and
    // the user asked for native notifications.
    services.dictation.notifyTranscript(transcript.text);

    if (insert) {
      const mode = current.dictation.insertMode;
      try {
        if (mode === 'paste') {
          await inserter.insert(transcript.text, { restoreClipboard: current.dictation.restoreClipboard });
          response.inserted = true;
        } else if (mode === 'clipboard') {
          await inserter.copy(transcript.text);
        }
      } catch (error) {
        await inserter.copy(transcript.text).catch(() => undefined);
        response.insertError = error instanceof Error ? error.message : String(error);
      }
    }
    return response;
  });

  // The capturing window reports what it is actually doing; the controller owns the phase
  // and mirrors it into the tray and the overlay, so no other surface can set it.
  listen('main', IPC.dictationState, schemas.dictationState, (state) => {
    services.dictation.report(state);
  });
  // Device ids only ever come from the window that can enumerate them. The report feeds
  // the tray submenu and becomes the allow-list for settings:update.
  listen('main', IPC.audioDevices, schemas.audioDevices, (devices) => {
    services.reportDevices(devices);
  });

  // Live transcripts: only the app window may start, feed or report a session, because it is
  // the only window the capture grant is ever armed for.
  handleOn('main', IPC.liveGet, none, () => services.live.snapshot());
  handleOn('main', IPC.liveStart, schemas.liveStart, (input) => services.live.start(input));
  handleOn('main', IPC.liveStop, none, () => services.live.stop());
  handleOn('main', IPC.liveCancel, none, () => services.live.cancel());
  handleOn('main', IPC.liveChunk, schemas.liveChunk, (chunk) => services.live.chunk(chunk));
  listen('main', IPC.liveReport, schemas.liveReport, (report) => services.live.report(report));
  // The provisional line: dropped by the controller whenever the engine has better things to do.
  handleOn('main', IPC.livePreview, schemas.livePreview, (preview) => services.live.preview(preview));
  handleOn('main', IPC.liveWindowOpen, none, () => services.liveWindow.show());

  // The floating live window shows a session and asks for a fixed list of things. It cannot
  // capture, read history or send text: copy reads the transcript the main process holds.
  handleOn('live', IPC.liveWindowAction, schemas.liveWindowAction, async (action) => {
    switch (action) {
      case 'start':
        return services.live.start({ source: settings.get().live.source, acknowledged: false });
      case 'stop':
        return services.live.stop();
      case 'cancel':
        return services.live.cancel();
      case 'copy': {
        const text = services.live.snapshot().text;
        if (text) await inserter.copy(text);
        return;
      }
      case 'hide':
        return services.liveWindow.hide();
      case 'pin':
        services.updateSettings({ liveWindow: { alwaysOnTop: !settings.get().liveWindow.alwaysOnTop } });
        return;
      case 'collapse':
        return services.liveWindow.setCollapsed(true);
      case 'expand':
        return services.liveWindow.setCollapsed(false);
      case 'source-system':
      case 'source-system+mic':
      case 'source-device':
        if (services.live.active()) return;
        services.updateSettings({ live: { source: action === 'source-system' ? 'system' : action === 'source-device' ? 'device' : 'system+mic' } });
        return;
      case 'open-app':
      case 'open-audio': {
        const win = services.window();
        if (!win || win.isDestroyed()) {
          services.showWindow();
          return;
        }
        win.show();
        win.focus();
        win.webContents.send(EVENTS.command, action === 'open-audio' ? 'navigate:audio' : 'navigate:live');
      }
    }
  });

  // The overlay may only ask for its fixed command list, and only from the overlay window.
  handleOn('overlay', IPC.overlayAction, schemas.overlayAction, (action) => {
    if (action.type === 'select-microphone') {
      // Only a device this process has already been told about. The switch restarts
      // capture, so it goes through the same validated path the tray and settings use.
      if (!services.listDevices().some((device) => device.id === action.id)) {
        throw new Error('Unknown input device');
      }
      services.updateSettings({ audio: { inputDeviceId: action.id } });
      return;
    }
    if (action.type === 'select-model') {
      // Persisting the id alone would leave the old model resident, so activation does both.
      if (!services.installedSttModels().some((model) => model.id === action.id)) {
        throw new Error('Unknown recognition model');
      }
      return services.activateModel(action.id);
    }
    const command = action.type;
    if (command === 'start') {
      services.dictation.start();
      return;
    }
    if (command === 'stop') {
      services.dictation.stop();
      return;
    }
    if (command === 'cancel') {
      services.dictation.cancel();
      return;
    }
    if (command === 'hide') {
      settings.update({ overlay: { enabled: false } });
      return;
    }
    if (command === 'read-pause') {
      services.readAloud.pause();
      return;
    }
    if (command === 'read-resume') {
      services.readAloud.resume();
      return;
    }
    if (command === 'read-stop') {
      services.readAloud.stop();
      return;
    }
    if (command === 'live-stop') {
      services.live.stop();
      return;
    }
    if (command === 'live-cancel') {
      services.live.cancel();
      return;
    }
    if (command === 'live-window') {
      services.liveWindow.toggle();
      return;
    }
    if (command === 'reset-position') {
      services.updateSettings({ overlay: { customX: null, customY: null } });
      return;
    }
    if (command === 'open-latest' || command === 'open-history') {
      services.showWindow();
      const target = services.window();
      if (target && !target.isDestroyed()) {
        target.webContents.send(EVENTS.command, command === 'open-latest' ? 'history:open-latest' : 'navigate:history');
      }
      return;
    }
    // open-app and open-audio both need the real window, which the overlay does not own.
    const win = services.window();
    if (!win || win.isDestroyed()) return;
    win.show();
    win.focus();
    if (command === 'open-audio') win.webContents.send(EVENTS.command, 'navigate:audio');
  });
  // Hover is a hint, not a command: it only widens what the pill can receive.
  listen('overlay', IPC.overlayHover, schemas.overlayHover, (hovering) => {
    services.overlay.setHover(hovering);
  });
  // Dragging by the handle moves the overlay window; main keeps it on a screen and saves it.
  listen('overlay', IPC.overlayDrag, schemas.overlayDrag, ({ phase, x, y }) => {
    services.overlay.dragTo(phase, x, y);
  });
  // The live window has no native frame to resize by, so its edges report pointer moves.
  listen('live', IPC.liveWindowResize, schemas.liveWindowResize, ({ phase, edge, x, y }) => {
    services.liveWindow.resizeTo(phase, edge, x, y);
  });
  // A menu opening is not a command either: it only grows the window so the panel fits.
  listen('overlay', IPC.overlayMenu, schemas.overlayMenu, (open) => {
    services.overlay.setMenu(open);
  });

  handle(IPC.textInsert, schemas.text, (text) =>
    inserter.insert(text, { restoreClipboard: settings.get().dictation.restoreClipboard }),
  );
  handle(IPC.clipboardWrite, schemas.text, (text) => inserter.copy(text));

  handleOn('main', IPC.readAloudGet, none, () => services.readAloud.snapshot());
  handleOn('main', IPC.readAloudStart, schemas.readAloudStart, (input) => services.readAloud.start(input));
  handleOn('main', IPC.readAloudControl, schemas.readAloudControl, (input) => services.readAloud.control(input));
  listen('main', IPC.readAloudReport, schemas.readAloudReport, (report) => services.readAloud.report(report));

  handle(IPC.ttsSpeak, schemas.speak, async ({ text, voiceId, speed }) => {
    const tts = settings.get().tts;
    companion.react('tts.started', 'speaking');
    try {
      return await services.runModel(tts.modelId, () =>
        synthesis.speak(text, voiceSid(voiceId ?? tts.voiceId), speed ?? tts.speed),
      );
    } finally {
      companion.react('tts.completed', 'ready');
    }
  });

  // Saved transcripts are only ever read or changed by the app window. The overlay, the
  // companion and the live window never see History.
  handleOn('main', IPC.historyList, schemas.historyQuery, (query) => history.list(query));
  handleOn('main', IPC.historyRemove, schemas.historyId, (id) => {
    history.remove(id);
    services.send(EVENTS.historyChanged, null);
  });
  handleOn('main', IPC.historyClear, none, () => {
    history.clear();
    services.send(EVENTS.historyChanged, null);
  });
  handleOn('main', IPC.historyUpdate, schemas.historyUpdate, ({ id, patch }) => {
    const saved = history.update(id, patch);
    services.send(EVENTS.historyChanged, null);
    return saved;
  });
  handleOn('main', IPC.historyExport, schemas.historyExport, async ({ ids, kind, format }) => {
    const items = ids ? history.getMany(ids) : history.all(kind);
    if (!items.length) return 0;
    const options: SaveDialogOptions = {
      title: items.length === 1 ? 'Export transcript' : `Export ${items.length} transcripts`,
      defaultPath: path.join(app.getPath('documents'), exportFileName(items, format)),
      filters: [{ name: EXPORT_NAME[format], extensions: [format] }],
      properties: ['createDirectory', 'showOverwriteConfirmation'],
    };
    const parent = services.window();
    const result = parent && !parent.isDestroyed() ? await dialog.showSaveDialog(parent, options) : await dialog.showSaveDialog(options);
    if (result.canceled || !result.filePath) return 0;
    // The path comes from the native dialog only; the extension is forced to the format.
    const file = path.extname(result.filePath).toLowerCase() === `.${format}` ? result.filePath : `${result.filePath}.${format}`;
    const body = exportTranscripts(items, format, { model: (id) => MODEL_CATALOG[id as ModelId]?.name ?? id });
    await fs.promises.writeFile(file, body, { encoding: 'utf8', mode: 0o600 });
    return items.length;
  });
  handle(IPC.companionGet, none, () => companion.snapshot());
  handle(IPC.companionSelect, schemas.companionId, (id) => companion.select(id));
  handle(IPC.companionVisibility, schemas.companionVisibility, (visible) => {
    if (visible) companion.show();
    else companion.hide();
    return companion.snapshot();
  });
  listen('companion', IPC.companionHover, schemas.companionHover, (hovering) => {
    companion.hover(hovering);
  });
  handleOn('companion', IPC.companionClick, none, () => companion.click());
}
