import { create } from "zustand";
import {
  playTTS as playHybridTTS,
  setActiveAudio,
  stopAllAudio,
  VoiceOption,
} from "@/lib/audio";

interface AudioState {
  activeAudio: HTMLAudioElement | null;
  playingLineId: number | null;
  playAudio: (url: string, lineId: number, rate: number) => Promise<void>;
  playTTS: (
    text: string,
    lineId: number,
    rate: number,
    voice?: VoiceOption
  ) => Promise<void>;
  stop: () => void;
}

let currentResolve: (() => void) | null = null;

export const useAudioStore = create<AudioState>((set) => ({
  activeAudio: null,
  playingLineId: null,

  stop: () => {
    stopAllAudio();
    set({ activeAudio: null, playingLineId: null });

    if (currentResolve) {
      currentResolve();
      currentResolve = null;
    }
  },

  playAudio: async (url, lineId, rate) => {
    stopAllAudio();
    if (currentResolve) {
      currentResolve();
      currentResolve = null;
    }

    const tryPlayUrl = (targetUrl: string) =>
      new Promise<void>((resolve, reject) => {
        currentResolve = resolve;
        const audio = new Audio(targetUrl);
        audio.preload = "auto";
        audio.defaultPlaybackRate = rate;
        audio.playbackRate = rate;
        setActiveAudio(audio);
        set({ playingLineId: lineId, activeAudio: audio });

        audio.onloadedmetadata = () => {
          audio.playbackRate = rate;
        };

        audio.onended = () => {
          setActiveAudio(null);
          set({ playingLineId: null, activeAudio: null });
          if (currentResolve === resolve) currentResolve = null;
          resolve();
        };

        audio.onerror = () => {
          setActiveAudio(null);
          set({ playingLineId: null, activeAudio: null });
          if (currentResolve === resolve) currentResolve = null;
          reject(new Error(`Failed to load audio: ${targetUrl}`));
        };

        audio.play().catch((err) => {
          setActiveAudio(null);
          set({ playingLineId: null, activeAudio: null });
          if (currentResolve === resolve) currentResolve = null;
          reject(err);
        });
      });

    try {
      await tryPlayUrl(url);
    } catch (err) {
      if (url.startsWith("/audio/dialogues/")) {
        const altUrl = url.replace("/audio/dialogues/", "/mp3/");
        await tryPlayUrl(altUrl);
        return;
      }
      throw err;
    }
  },

  playTTS: async (text, lineId, rate, voice = "male") => {
    stopAllAudio();
    if (currentResolve) {
      currentResolve();
      currentResolve = null;
    }
    set({ playingLineId: lineId });

    return new Promise<void>((resolve) => {
      currentResolve = resolve;
      playHybridTTS(text, rate, voice)
        .then(() => {
          set({ playingLineId: null, activeAudio: null });
          if (currentResolve === resolve) currentResolve = null;
          resolve();
        })
        .catch(() => {
          set({ playingLineId: null, activeAudio: null });
          if (currentResolve === resolve) currentResolve = null;
          resolve();
        });
    });
  },
}));