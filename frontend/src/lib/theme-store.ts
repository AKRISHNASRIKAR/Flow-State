import { create } from 'zustand';

export type ThemePreference = 'system' | 'light' | 'dark';
interface ThemeState {
  preference: ThemePreference;
  resolved: 'light' | 'dark';
  ready: boolean;
  setPreference: (preference: ThemePreference) => void;
  setResolved: (resolved: 'light' | 'dark') => void;
}
export const THEME_KEY = 'flowstate-theme';
export const useThemeStore = create<ThemeState>((set) => ({
  preference: 'system',
  resolved: 'light',
  ready: false,
  setPreference: (preference) => set({ preference }),
  setResolved: (resolved) => set({ resolved, ready: true }),
}));
