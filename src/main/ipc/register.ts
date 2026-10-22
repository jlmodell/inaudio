import { clipboard, shell } from 'electron';
import { z } from 'zod';
import { ttsSpeakRequest } from '@shared/read-aloud/tts-request';
import { EVENTS, IPC } from '@shared/ipc/channels';
import { EXTERNAL_LINKS, schemas } from '@shared/ipc/schemas';
import { openTrustedExternal } from '../security/hardening';
import type { Services } from '../services/container';
import { ReleaseNotesService } from '../services/release-notes';
import { handle, handleOn, listen } from './handle';

const none = z.undefined();

export function registerIpc(services: Services, requestQuit: () => Promise<void>): void {
  const { settings, models, tts: synthesis, paths, companion } = services;

  handle(IPC.systemStatus, none, () => services.status());
  handle(IPC.systemOpenLink, schemas.openLink, (id) => openTrustedExternal(EXTERNAL_LINKS[id]));
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
      void requestQuit().catch((error: unknown) => console.error('Could not quit Inaudio', error));
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
  const releaseNotes = new ReleaseNotesService();
  handleOn('main', IPC.updateReleaseNotes, schemas.releaseNotes, ({ force }) => releaseNotes.get(force));
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
  handle(IPC.modelsDownload, schemas.modelId, (id) => models.download(id));
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

  handle(IPC.clipboardWrite, schemas.text, (text) => {
    clipboard.writeText(text);
  });

  handleOn('main', IPC.readAloudGet, none, () => services.readAloud.snapshot());
  handleOn('main', IPC.readAloudStart, schemas.readAloudStart, (input) => services.readAloud.start(input));
  handleOn('main', IPC.readAloudControl, schemas.readAloudControl, (input) => services.readAloud.control(input));
  listen('main', IPC.readAloudReport, schemas.readAloudReport, (report) => services.readAloud.report(report));

  handle(IPC.ttsSpeak, schemas.speak, async ({ text, voiceId, speed }) => {
    const request = ttsSpeakRequest({
      ...settings.get().tts,
      voiceId: voiceId ?? settings.get().tts.voiceId,
      speed: speed ?? settings.get().tts.speed,
    });
    companion.react('tts.started', 'speaking');
    try {
      return await services.runModel(request.modelId, () =>
        synthesis.speak(text, request.sid, request.speed),
      );
    } finally {
      companion.react('tts.completed', 'ready');
    }
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
