import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  ArabicFontId,
  ArabicFontSizePreset,
  ARABIC_FONT_SIZE_PRESETS,
} from "@/lib/arabicTextUtils";

export type ViewMode = "stacked" | "columns" | "arabic-only" | "turkish-only";
export type PreferredLevel = "Başlangıç" | "Orta" | "İleri";
export type SpeechRate = 0.5 | 0.75 | 1 | 1.25 | 1.5;
export type SttEngine = "whisper" | "webspeech";
export type WordTrackingStyle = "both" | "highlight" | "arrow" | "off";
export type DialogueLoopCount = 1 | 2 | 3 | 5 | "infinite";
export type SentenceLoopCount = 2 | 3 | 5 | "infinite";
export type PauseBetweenLines = 0 | 2 | "auto";
export type { ArabicFontId, ArabicFontSizePreset };

interface SettingsState {
  theme: "light" | "dark";
  viewMode: ViewMode;
  showHareke: boolean;
  showTooltips: boolean;
  showShadowing: boolean;
  arabicFont: ArabicFontId;
  arabicFontSize: number;
  arabicFontSizePreset: ArabicFontSizePreset;
  turkishFontSize: number;
  speechRate: SpeechRate;
  preferredLevel: PreferredLevel;
  sttEngine: SttEngine;
  localSttOnly: boolean;
  micNoiseSuppression: boolean;
  wordTrackingStyle: WordTrackingStyle;
  dialogueLoopCount: DialogueLoopCount;
  sentenceLoopCount: SentenceLoopCount;
  pauseBetweenLines: PauseBetweenLines;

  toggleTheme: () => void;
  setTheme: (theme: "light" | "dark") => void;
  setViewMode: (mode: ViewMode) => void;
  toggleHareke: () => void;
  setShowHareke: (show: boolean) => void;
  toggleTooltips: () => void;
  setShowTooltips: (show: boolean) => void;
  toggleShadowing: () => void;
  setShowShadowing: (show: boolean) => void;
  setArabicFont: (font: ArabicFontId) => void;
  setArabicFontSize: (size: number | ArabicFontSizePreset) => void;
  setArabicFontSizePreset: (preset: ArabicFontSizePreset) => void;
  setTurkishFontSize: (size: number) => void;
  setSpeechRate: (rate: SpeechRate) => void;
  cycleSpeechRate: () => void;
  setPreferredLevel: (level: PreferredLevel) => void;
  setSttEngine: (engine: SttEngine) => void;
  setLocalSttOnly: (val: boolean) => void;
  toggleLocalSttOnly: () => void;
  setMicNoiseSuppression: (val: boolean) => void;
  toggleMicNoiseSuppression: () => void;
  setWordTrackingStyle: (style: WordTrackingStyle) => void;
  setDialogueLoopCount: (count: DialogueLoopCount) => void;
  cycleDialogueLoopCount: () => void;
  setSentenceLoopCount: (count: SentenceLoopCount) => void;
  setPauseBetweenLines: (pause: PauseBetweenLines) => void;
}

function resolveSizeFromInput(size: number | ArabicFontSizePreset): {
  px: number;
  preset: ArabicFontSizePreset;
} {
  if (typeof size === "string") {
    const found = ARABIC_FONT_SIZE_PRESETS.find((p) => p.id === size);
    return {
      px: found ? found.px : 34,
      preset: found ? found.id : "md",
    };
  }
  const preset: ArabicFontSizePreset =
    size <= 29 ? "sm" : size <= 36 ? "md" : size <= 44 ? "lg" : "xl";
  return { px: size, preset };
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      theme: "light",
      viewMode: "stacked",
      showHareke: true,
      showTooltips: true,
      showShadowing: true,
      arabicFont: "arakom",
      arabicFontSize: 34,
      arabicFontSizePreset: "md",
      turkishFontSize: 16,
      speechRate: 1,
      preferredLevel: "Başlangıç",
      sttEngine: "whisper",
      localSttOnly: false,
      micNoiseSuppression: false,
      wordTrackingStyle: "both",
      dialogueLoopCount: 1,
      sentenceLoopCount: 3,
      pauseBetweenLines: 0,

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
      setArabicFont: (font) => set({ arabicFont: font }),
      setArabicFontSize: (size) => {
        const resolved = resolveSizeFromInput(size);
        set({
          arabicFontSize: resolved.px,
          arabicFontSizePreset: resolved.preset,
        });
      },
      setArabicFontSizePreset: (preset) => {
        const resolved = resolveSizeFromInput(preset);
        set({
          arabicFontSize: resolved.px,
          arabicFontSizePreset: resolved.preset,
        });
      },
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
              : state.speechRate === 1.25
              ? 1.5
              : 0.5;
          return { speechRate: next };
        }),
      setPreferredLevel: (level) => set({ preferredLevel: level }),
      setSttEngine: (engine) => set({ sttEngine: engine }),
      setLocalSttOnly: (val) =>
        set((state) => ({
          localSttOnly: val,
          sttEngine: val ? "whisper" : state.sttEngine,
        })),
      toggleLocalSttOnly: () =>
        set((state) => {
          const next = !state.localSttOnly;
          return {
            localSttOnly: next,
            sttEngine: next ? "whisper" : state.sttEngine,
          };
        }),
      setMicNoiseSuppression: (val) => set({ micNoiseSuppression: val }),
      toggleMicNoiseSuppression: () =>
        set((state) => ({ micNoiseSuppression: !state.micNoiseSuppression })),
      setWordTrackingStyle: (style) => set({ wordTrackingStyle: style }),
      setDialogueLoopCount: (count) => set({ dialogueLoopCount: count }),
      cycleDialogueLoopCount: () =>
        set((state) => {
          const order: DialogueLoopCount[] = [1, 2, 3, 5, "infinite"];
          const idx = order.indexOf(state.dialogueLoopCount);
          const next = order[(idx + 1) % order.length];
          return { dialogueLoopCount: next };
        }),
      setSentenceLoopCount: (count) => set({ sentenceLoopCount: count }),
      setPauseBetweenLines: (pause) => set({ pauseBetweenLines: pause }),
    }),
    { name: "app-settings" }
  )
);