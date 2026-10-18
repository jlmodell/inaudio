import { create } from 'zustand';

export const ROUTES = ['dictation', 'live', 'history', 'read-aloud', 'models', 'audio', 'companion', 'settings'] as const;
export type Route = (typeof ROUTES)[number];

interface UiState {
  route: Route;
  navigate(route: Route): void;
}

export const useUi = create<UiState>((set) => ({
  route: 'dictation',
  navigate: (route) => set({ route }),
}));
