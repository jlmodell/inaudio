import { app, shell } from 'electron';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { voiceSid, type ModelId } from '@shared/domain/models';
import type { Transcript } from '@shared/domain/history';
import type { TranscribeResult } from '@shared/ipc/api';
import { EVENTS, IPC } from '@shared/ipc/channels';
import { EXTERNAL_LINKS, schemas } from '@shared/ipc/schemas';
import { openTrustedExternal } from '../security/hardening';
import type { Services } from '../services/container';
import { handle, handleOn, listen } from './handle';

const none = z.undefined();

export function registerIpc(services: Services): void {
  const { settings, history, models, stt, tts: synthesis, inserter, paths, companion } = services;

  handle(IPC.systemStatus, none, () => services.status());
  handle(IPC.systemOpenLink, schemas.openLink, (id) => openTrustedExternal(EXTERNAL_LINKS[id]));
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
    const result = await services.runModel(modelId, () => stt.transcribe(samples, sampleRate), 100);
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
    };
    if (current.dictation.saveHistory) history.add(transcript);
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

  handle(IPC.historyList, schemas.historyQuery, (query) => history.list(query));
  handle(IPC.historyRemove, schemas.historyId, (id) => history.remove(id));
  handle(IPC.historyClear, none, () => history.clear());
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
