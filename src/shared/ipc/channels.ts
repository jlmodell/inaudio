/** Every IPC channel in the app. Nothing outside this list is handled or exposed. */
export const IPC = {
  systemStatus: 'system:status',
  systemOpenLink: 'system:open-link',
  systemRevealModels: 'system:reveal-models',
  systemWindow: 'system:window',
  systemMenu: 'system:menu',
  updateStatus: 'update:status',
  updateCheck: 'update:check',
  updateDownload: 'update:download',
  updateInstall: 'update:install',
  updateReleaseNotes: 'update:release-notes',
  settingsGet: 'settings:get',
  settingsUpdate: 'settings:update',
  modelsList: 'models:list',
  modelsDownload: 'models:download',
  modelsCancel: 'models:cancel',
  modelsRemove: 'models:remove',
  modelsLoad: 'models:load',
  modelsUnload: 'models:unload',
  modelsActivate: 'models:activate',
  modelsVerify: 'models:verify',
  modelsReveal: 'models:reveal',
  clipboardWrite: 'clipboard:write',
  ttsSpeak: 'tts:speak',
  readAloudGet: 'read-aloud:get',
  readAloudStart: 'read-aloud:start',
  readAloudControl: 'read-aloud:control',
  readAloudReport: 'read-aloud:report',
  systemOpenSoundSettings: 'system:open-sound-settings',
  companionGet: 'companion:get',
  companionSelect: 'companion:select',
  companionVisibility: 'companion:visibility',
  companionHover: 'companion:hover',
  companionClick: 'companion:click',
} as const;

/** Main → renderer push events. */
export const EVENTS = {
  command: 'event:command',
  modelProgress: 'event:model-progress',
  statusChanged: 'event:status-changed',
  settingsChanged: 'event:settings-changed',
  companionState: 'event:companion-state',
  updateState: 'event:update-state',
  readAloudSession: 'event:read-aloud-session',
  readAloudState: 'event:read-aloud-state',
  readAloudChunk: 'event:read-aloud-chunk',
} as const;

export type IpcChannel = (typeof IPC)[keyof typeof IPC];
export type EventChannel = (typeof EVENTS)[keyof typeof EVENTS];
