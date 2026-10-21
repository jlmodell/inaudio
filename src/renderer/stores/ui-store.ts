import { create } from 'zustand';

export const ROUTES = ['read-aloud', 'models', 'companion', 'settings'] as const;
export type Route = (typeof ROUTES)[number];

/** The pages of Settings, each listed in its own sidebar. */
export const SETTINGS_CATEGORIES = [
  'appearance',
  'app',
  'read-aloud',
  'shortcuts',
  'tray',
  'performance',
  'updates',
  'about',
  'privacy',
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
  /** The what's-new billboard and the full release notes drawer. */
  whatsNew: boolean;
  setWhatsNew(open: boolean): void;
  releaseNotes: boolean;
  setReleaseNotes(open: boolean): void;
}

export const useUi = create<UiState>((set, get) => ({
  route: 'read-aloud',
  navigate: (route) => {
    const current = get().route;
    if (route === current) return;
    set({ route, previousRoute: current === 'settings' ? get().previousRoute : current });
  },
  previousRoute: 'read-aloud',
  settingsCategory: 'appearance',
  openSettings: (category, focus) => {
    get().navigate('settings');
    set({ settingsCategory: category, settingsFocus: focus ?? null });
  },
  settingsFocus: null,
  clearSettingsFocus: () => set({ settingsFocus: null }),
  whatsNew: false,
  setWhatsNew: (whatsNew) => set({ whatsNew }),
  releaseNotes: false,
  setReleaseNotes: (releaseNotes) => set({ releaseNotes }),
}));
