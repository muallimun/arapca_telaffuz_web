import { create } from "zustand";
import { persist } from "zustand/middleware";

export type ViewMode = "stacked" | "columns" | "arabic-only" | "turkish-only";

interface SettingsState {
  theme: "light" | "dark";
  viewMode: ViewMode;
  showHareke: boolean;
  showTooltips: boolean;
  showShadowing: boolean; // YENİ
  arabicFontSize: number; 
  turkishFontSize: number; 
  
  toggleTheme: () => void;
  setViewMode: (mode: ViewMode) => void;
  toggleHareke: () => void;
  toggleTooltips: () => void;
  toggleShadowing: () => void; // YENİ
  setArabicFontSize: (size: number) => void; 
  setTurkishFontSize: (size: number) => void; 
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      theme: "light",
      viewMode: "stacked",
      showHareke: true,
      showTooltips: true,
      showShadowing: true, // Varsayılan açık
      arabicFontSize: 32, 
      turkishFontSize: 16, 

      toggleTheme: () => set((state) => ({ theme: state.theme === "light" ? "dark" : "light" })),
      setViewMode: (mode) => set({ viewMode: mode }),
      toggleHareke: () => set((state) => ({ showHareke: !state.showHareke })),
      toggleTooltips: () => set((state) => ({ showTooltips: !state.showTooltips })),
      toggleShadowing: () => set((state) => ({ showShadowing: !state.showShadowing })), // YENİ
      setArabicFontSize: (size) => set({ arabicFontSize: size }),
      setTurkishFontSize: (size) => set({ turkishFontSize: size }),
    }),
    { name: "app-settings" }
  )
);