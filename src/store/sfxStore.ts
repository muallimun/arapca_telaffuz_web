// src/store/sfxStore.ts
// Ses efekti aç/kapat tercihi. localStorage anahtarı: arabic_assistant_sfx_enabled
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { sfx } from "@/lib/sfxManager";

interface SfxState {
  enabled: boolean;
  toggle: () => void;
  setEnabled: (value: boolean) => void;
}

export const useSfxStore = create<SfxState>()(
  persist(
    (set) => ({
      enabled: true,

      toggle: () =>
        set((state) => {
          const next = !state.enabled;
          sfx.setEnabled(next);
          return { enabled: next };
        }),

      setEnabled: (value) => {
        sfx.setEnabled(value);
        set({ enabled: value });
      },
    }),
    {
      name: "arabic_assistant_sfx_enabled",
      // Sadece boolean'ı sakla (JSON tam obje yerine)
      partialize: (state) => ({ enabled: state.enabled }),
      // Rehydration sonrası sfxManager'ı senkronize et
      onRehydrateStorage: () => (state) => {
        if (state?.enabled !== undefined) {
          sfx.setEnabled(state.enabled);
        }
      },
    }
  )
);