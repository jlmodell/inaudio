import { create } from 'zustand';

export const ROUTES = ['dictation', 'live', 'history', 'read-aloud', 'models', 'audio', 'companion', 'settings'] as const;
export type Route = (typeof ROUTES)[number];

interface UiState {
  route: Route;
  navigate(route: Route): void;
  /** The transcript open in the History drawer: an id, the newest one, or none. */
  transcript: string | 'latest' | null;
  openTranscript(id: string | 'latest' | null): void;
}

export const useUi = create<UiState>((set) => ({
  route: 'dictation',
  navigate: (route) => set({ route }),
  transcript: null,
  openTranscript: (transcript) => set({ transcript }),
}));
