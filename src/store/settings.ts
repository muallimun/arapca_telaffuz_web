import { create } from "zustand";
import { persist } from "zustand/middleware";

export type ViewMode = "stacked" | "columns" | "arabic-only" | "turkish-only";
export type PreferredLevel = "Başlangıç" | "Orta" | "İleri";
export type SpeechRate = 0.5 | 0.75 | 1 | 1.25;
export type SttEngine = "whisper" | "webspeech";

interface SettingsState {
  theme: "light" | "dark";
  viewMode: ViewMode;
  showHareke: boolean;
  showTooltips: boolean;
  showShadowing: boolean;
  arabicFontSize: number;
  turkishFontSize: number;
  speechRate: SpeechRate;
  preferredLevel: PreferredLevel;
  sttEngine: SttEngine;

  toggleTheme: () => void;
  setTheme: (theme: "light" | "dark") => void;
  setViewMode: (mode: ViewMode) => void;
  toggleHareke: () => void;
  setShowHareke: (show: boolean) => void;
  toggleTooltips: () => void;
  setShowTooltips: (show: boolean) => void;
  toggleShadowing: () => void;
  setShowShadowing: (show: boolean) => void;
  setArabicFontSize: (size: number) => void;
  setTurkishFontSize: (size: number) => void;
  setSpeechRate: (rate: SpeechRate) => void;
  cycleSpeechRate: () => void;
  setPreferredLevel: (level: PreferredLevel) => void;
  setSttEngine: (engine: SttEngine) => void;
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      theme: "light",
      viewMode: "stacked",
      showHareke: true,
      showTooltips: true,
      showShadowing: true,
      arabicFontSize: 32,
      turkishFontSize: 16,
      speechRate: 1,
      preferredLevel: "Başlangıç",
      sttEngine: "whisper",

      toggleTheme: () =>
        set((state) => ({ theme: state.theme === "light" ? "dark" : "light" })),
      setTheme: (theme) => set({ theme }),
      setViewMode: (mode) => set({ viewMode: mode }),
      toggleHareke: () => set((state) => ({ showHareke: !state.showHareke })),
      setShowHareke: (show) => set({ showHareke: show }),
      toggleTooltips: () =>
        set((state) => ({ showTooltips: !state.showTooltips })),
      setShowTooltips: (show) => set({ showTooltips: show }),
      toggleShadowing: () =>
        set((state) => ({ showShadowing: !state.showShadowing })),
      setShowShadowing: (show) => set({ showShadowing: show }),
      setArabicFontSize: (size) => set({ arabicFontSize: size }),
      setTurkishFontSize: (size) => set({ turkishFontSize: size }),
      setSpeechRate: (rate) => set({ speechRate: rate }),
      cycleSpeechRate: () =>
        set((state) => {
          const next: SpeechRate =
            state.speechRate === 0.5
              ? 0.75
              : state.speechRate === 0.75
              ? 1
              : state.speechRate === 1
              ? 1.25
              : 0.5;
          return { speechRate: next };
        }),
      setPreferredLevel: (level) => set({ preferredLevel: level }),
      setSttEngine: (engine) => set({ sttEngine: engine }),
    }),
    { name: "app-settings" }
  )
);