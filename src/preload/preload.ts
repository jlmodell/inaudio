import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import { EVENTS, IPC, type EventChannel } from '@shared/ipc/channels';
import type { InaudioApi } from '@shared/ipc/api';
import type { UpdateStatus } from '@shared/domain/update';

function subscribe<T>(channel: EventChannel, listener: (payload: T) => void) {
  const wrapped = (_event: IpcRendererEvent, payload: T) => listener(payload);
  ipcRenderer.on(channel, wrapped);
  return () => {
    ipcRenderer.removeListener(channel, wrapped);
  };
}

const api: InaudioApi = {
  system: {
    status: () => ipcRenderer.invoke(IPC.systemStatus),
    openLink: (id) => ipcRenderer.invoke(IPC.systemOpenLink, id),
    revealModels: () => ipcRenderer.invoke(IPC.systemRevealModels),
    window: (action) => ipcRenderer.invoke(IPC.systemWindow, action),
    menu: (command) => ipcRenderer.invoke(IPC.systemMenu, command),
    openSoundSettings: () => ipcRenderer.invoke(IPC.systemOpenSoundSettings),
  },
  updates: {
    status: () => ipcRenderer.invoke(IPC.updateStatus),
    check: () => ipcRenderer.invoke(IPC.updateCheck),
    download: () => ipcRenderer.invoke(IPC.updateDownload),
    install: () => ipcRenderer.invoke(IPC.updateInstall),
    releaseNotes: (force) => ipcRenderer.invoke(IPC.updateReleaseNotes, { force }),
  },
  settings: {
    get: () => ipcRenderer.invoke(IPC.settingsGet),
    update: (patch) => ipcRenderer.invoke(IPC.settingsUpdate, patch),
  },
  models: {
    list: () => ipcRenderer.invoke(IPC.modelsList),
    download: (id) => ipcRenderer.invoke(IPC.modelsDownload, id),
    cancel: (id) => ipcRenderer.invoke(IPC.modelsCancel, id),
    remove: (id) => ipcRenderer.invoke(IPC.modelsRemove, id),
    load: (id) => ipcRenderer.invoke(IPC.modelsLoad, id),
    unload: (id) => ipcRenderer.invoke(IPC.modelsUnload, id),
    activate: (id) => ipcRenderer.invoke(IPC.modelsActivate, id),
    verify: (id) => ipcRenderer.invoke(IPC.modelsVerify, id),
    reveal: (id) => ipcRenderer.invoke(IPC.modelsReveal, id),
  },
  text: {
    copy: (text) => ipcRenderer.invoke(IPC.clipboardWrite, text),
  },
  tts: {
    speak: (input) => ipcRenderer.invoke(IPC.ttsSpeak, input),
  },
  readAloud: {
    get: () => ipcRenderer.invoke(IPC.readAloudGet),
    start: (input) => ipcRenderer.invoke(IPC.readAloudStart, input),
    control: (input) => ipcRenderer.invoke(IPC.readAloudControl, input),
    report: (report) => ipcRenderer.send(IPC.readAloudReport, report),
  },
  companions: {
    get: () => ipcRenderer.invoke(IPC.companionGet),
    select: (id) => ipcRenderer.invoke(IPC.companionSelect, id),
    setVisibility: (visible) => ipcRenderer.invoke(IPC.companionVisibility, visible),
    hover: (hovering) => ipcRenderer.send(IPC.companionHover, hovering),
    click: () => ipcRenderer.invoke(IPC.companionClick),
  },
  events: {
    onCommand: (listener) => subscribe(EVENTS.command, listener),
    onModelProgress: (listener) => subscribe(EVENTS.modelProgress, listener),
    onStatusChanged: (listener) => subscribe(EVENTS.statusChanged, listener),
    onSettingsChanged: (listener) => subscribe(EVENTS.settingsChanged, listener),
    onCompanionState: (listener) => subscribe(EVENTS.companionState, listener),
    onUpdateState: (listener: (status: UpdateStatus) => void) => subscribe(EVENTS.updateState, listener),
    onReadAloudSession: (listener) => subscribe(EVENTS.readAloudSession, listener),
    onReadAloudState: (listener) => subscribe(EVENTS.readAloudState, listener),
    onReadAloudChunk: (listener) => subscribe(EVENTS.readAloudChunk, listener),
  },
};

contextBridge.exposeInMainWorld('inaudio', api);
