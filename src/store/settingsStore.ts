import { create } from 'zustand';

export interface Settings {
  opacity: number;
  blur: boolean;
  blurRadius: number;
  fontSize: number;
  fontFamily: string;
  theme: string;
  scrollback: number;
  cursorStyle: 'block' | 'underline' | 'bar';
  cursorBlink: boolean;
  predictiveInput: boolean;
  bellEnabled: boolean;
  confirmCmdQ: boolean;
}

interface SettingsState {
  settings: Settings;
  isSettingsOpen: boolean;
  isCommandPaletteOpen: boolean;
  setSettings: (settings: Partial<Settings>) => void;
  toggleSettings: () => void;
  openSettings: () => void;
  toggleCommandPalette: () => void;
  closeCommandPalette: () => void;
  closeSettings: () => void;
}

const defaultSettings: Settings = {
  opacity: 0.85,
  blur: true,
  blurRadius: 10,
  fontSize: 14,
  fontFamily: "MesloLGS NF, Menlo, Monaco, monospace",
  theme: 'dark',
  scrollback: 10000,
  cursorStyle: 'block',
  cursorBlink: true,
  predictiveInput: true,
  bellEnabled: true,
  confirmCmdQ: true,
};

export const useSettingsStore = create<SettingsState>((set) => ({
  settings: defaultSettings,
  isSettingsOpen: false,
  isCommandPaletteOpen: false,

  setSettings: (newSettings) =>
    set((state) => ({
      settings: { ...state.settings, ...newSettings },
    })),

  toggleSettings: () =>
    set((state) => ({ isSettingsOpen: !state.isSettingsOpen })),

  openSettings: () => set({ isSettingsOpen: true }),

  toggleCommandPalette: () =>
    set((state) => ({ isCommandPaletteOpen: !state.isCommandPaletteOpen })),

  closeCommandPalette: () => set({ isCommandPaletteOpen: false }),

  closeSettings: () => set({ isSettingsOpen: false }),
}));
