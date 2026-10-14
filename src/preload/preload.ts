import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import { EVENTS, IPC, type EventChannel } from '@shared/ipc/channels';
import type { InaudioApi } from '@shared/ipc/api';
import type { UpdateStatus } from '@shared/domain/update';

// The renderer never sees ipcRenderer. Each capability is a fixed function.
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
  },
  updates: {
    status: () => ipcRenderer.invoke(IPC.updateStatus),
    check: () => ipcRenderer.invoke(IPC.updateCheck),
    download: () => ipcRenderer.invoke(IPC.updateDownload),
    install: () => ipcRenderer.invoke(IPC.updateInstall),
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
  dictation: {
    transcribe: (samples, { insert }) =>
      ipcRenderer.invoke(IPC.dictationTranscribe, { samples, sampleRate: 16000, insert }),
    report: (state) => ipcRenderer.send(IPC.dictationState, state),
  },
  audio: {
    report: (devices) => ipcRenderer.send(IPC.audioDevices, devices),
  },
  overlay: {
    act: (action) => ipcRenderer.invoke(IPC.overlayAction, action),
    hover: (hovering) => ipcRenderer.send(IPC.overlayHover, hovering),
    menu: (open) => ipcRenderer.send(IPC.overlayMenu, open),
  },
  text: {
    insert: (text) => ipcRenderer.invoke(IPC.textInsert, text),
    copy: (text) => ipcRenderer.invoke(IPC.clipboardWrite, text),
    readClipboard: () => ipcRenderer.invoke(IPC.clipboardRead),
  },
  tts: {
    speak: (input) => ipcRenderer.invoke(IPC.ttsSpeak, input),
  },
  history: {
    list: (query) => ipcRenderer.invoke(IPC.historyList, query),
    remove: (id) => ipcRenderer.invoke(IPC.historyRemove, id),
    clear: () => ipcRenderer.invoke(IPC.historyClear),
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
    onOverlayState: (listener) => subscribe(EVENTS.overlayState, listener),
    onCompanionState: (listener) => subscribe(EVENTS.companionState, listener),
    onCompanionGaze: (listener) => subscribe(EVENTS.companionGaze, listener),
    onUpdateState: (listener: (status: UpdateStatus) => void) => subscribe(EVENTS.updateState, listener),
  },
};

contextBridge.exposeInMainWorld('inaudio', api);
