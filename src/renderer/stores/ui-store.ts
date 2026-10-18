import { create } from 'zustand';

export const ROUTES = ['dictation', 'live', 'history', 'read-aloud', 'models', 'audio', 'companion', 'settings'] as const;
export type Route = (typeof ROUTES)[number];

/** The pages of Settings, each listed in its own sidebar. */
export const SETTINGS_CATEGORIES = [
  'appearance',
  'app',
  'dictation',
  'quality',
  'read-aloud',
  'shortcuts',
  'overlay',
  'live-window',
  'tray',
  'performance',
  'updates',
  'about',
] as const;
export type SettingsCategory = (typeof SETTINGS_CATEGORIES)[number];

interface UiState {
  route: Route;
  navigate(route: Route): void;
  /** Where "Back to Inaudio" returns to from Settings. */
  previousRoute: Route;
  settingsCategory: SettingsCategory;
  /** Opens Settings at a page, optionally scrolled to one setting by its element id. */
  openSettings(category: SettingsCategory, focus?: string): void;
  /** A setting to scroll to once its page has rendered, then cleared. */
  settingsFocus: string | null;
  clearSettingsFocus(): void;
  /** The transcript open in the History drawer: an id, the newest one, or none. */
  transcript: string | 'latest' | null;
  openTranscript(id: string | 'latest' | null): void;
}

export const useUi = create<UiState>((set, get) => ({
  route: 'dictation',
  navigate: (route) => {
    const current = get().route;
    if (route === current) return;
    set({ route, previousRoute: current === 'settings' ? get().previousRoute : current });
  },
  previousRoute: 'dictation',
  settingsCategory: 'appearance',
  openSettings: (category, focus) => {
    get().navigate('settings');
    set({ settingsCategory: category, settingsFocus: focus ?? null });
  },
  settingsFocus: null,
  clearSettingsFocus: () => set({ settingsFocus: null }),
  transcript: null,
  openTranscript: (transcript) => set({ transcript }),
}));
