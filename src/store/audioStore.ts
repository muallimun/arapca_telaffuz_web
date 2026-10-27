import { create } from "zustand";
import {
  playTTS as playHybridTTS,
  setActiveAudio,
  getActiveAudio,
  stopAllAudio,
  VoiceOption,
  calculateWordPhoneticWeights,
  getWordIndexAtProgress,
  WordTimingSegment,
} from "@/lib/audio";

interface AudioState {
  activeAudio: HTMLAudioElement | null;
  playingLineId: number | null;
  activeWordIndex: number | null;
  activeWordProgress: number;
  lastPlayedDurationSec: number;
  playAudio: (
    url: string,
    lineId: number,
    rate: number,
    sentenceText?: string
  ) => Promise<void>;
  playTTS: (
    text: string,
    lineId: number,
    rate: number,
    voice?: VoiceOption
  ) => Promise<void>;
  stop: () => void;
}

let currentResolve: (() => void) | null = null;
let trackingRafId: number | null = null;

function stopWordTrackingLoop() {
  if (trackingRafId !== null && typeof window !== "undefined") {
    cancelAnimationFrame(trackingRafId);
    trackingRafId = null;
  }
}

export const useAudioStore = create<AudioState>((set) => {
  const startPhoneticTracking = (
    sentenceText: string | undefined,
    rate: number,
    getAudioEl: () => HTMLAudioElement | null
  ) => {
    stopWordTrackingLoop();
    if (!sentenceText || !sentenceText.trim() || typeof window === "undefined") {
      set({ activeWordIndex: null, activeWordProgress: 0 });
      return;
    }

    const { segments, estimatedDurationSec }: {
      segments: WordTimingSegment[];
      estimatedDurationSec: number;
    } = calculateWordPhoneticWeights(sentenceText);

    const startTimeMs = performance.now();
    const fallbackDurationSec = Math.max(1.0, estimatedDurationSec / rate);

    set({ activeWordIndex: 0, activeWordProgress: 0 });

    const tick = () => {
      const audioEl = getAudioEl();
      let progressRatio = 0;

      if (
        audioEl &&
        Number.isFinite(audioEl.duration) &&
        audioEl.duration > 0.15
      ) {
        // Gerçek HTMLAudioElement currentTime / duration senkronizasyonu
        const effectiveDuration = Math.max(0.2, audioEl.duration * 0.96);
        progressRatio = Math.min(1, audioEl.currentTime / effectiveDuration);
      } else {
        // Web Speech API veya metadata öncesi fonetik süre tahmini
        const elapsedSec = (performance.now() - startTimeMs) / 1000;
        progressRatio = Math.min(0.98, elapsedSec / fallbackDurationSec);
      }

      const { wordIndex, wordProgress } = getWordIndexAtProgress(
        segments,
        progressRatio
      );

      set({
        activeWordIndex: wordIndex,
        activeWordProgress: wordProgress,
      });

      trackingRafId = requestAnimationFrame(tick);
    };

    trackingRafId = requestAnimationFrame(tick);
  };

  return {
    activeAudio: null,
    playingLineId: null,
    activeWordIndex: null,
    activeWordProgress: 0,
    lastPlayedDurationSec: 2.5,

    stop: () => {
      stopWordTrackingLoop();
      stopAllAudio();
      set({
        activeAudio: null,
        playingLineId: null,
        activeWordIndex: null,
        activeWordProgress: 0,
      });

      if (currentResolve) {
        currentResolve();
        currentResolve = null;
      }
    },

    playAudio: async (url, lineId, rate, sentenceText) => {
      stopWordTrackingLoop();
      stopAllAudio();
      if (currentResolve) {
        currentResolve();
        currentResolve = null;
      }

      const startedAt =
        typeof performance !== "undefined" ? performance.now() : Date.now();

      const tryPlayUrl = (targetUrl: string) =>
        new Promise<void>((resolve, reject) => {
          currentResolve = resolve;
          const audio = new Audio(targetUrl);
          audio.preload = "auto";
          audio.defaultPlaybackRate = rate;
          audio.playbackRate = rate;
          setActiveAudio(audio);
          set({ playingLineId: lineId, activeAudio: audio });

          startPhoneticTracking(sentenceText, rate, () => audio);

          audio.onloadedmetadata = () => {
            audio.playbackRate = rate;
          };

          audio.onended = () => {
            stopWordTrackingLoop();
            const durSec =
              Number.isFinite(audio.duration) && audio.duration > 0
                ? audio.duration / rate
                : ((typeof performance !== "undefined"
                    ? performance.now()
                    : Date.now()) -
                    startedAt) /
                  1000;
            setActiveAudio(null);
            set({
              playingLineId: null,
              activeAudio: null,
              activeWordIndex: null,
              activeWordProgress: 0,
              lastPlayedDurationSec: Math.max(1.2, durSec),
            });
            if (currentResolve === resolve) currentResolve = null;
            resolve();
          };

          audio.onerror = () => {
            stopWordTrackingLoop();
            setActiveAudio(null);
            set({
              playingLineId: null,
              activeAudio: null,
              activeWordIndex: null,
              activeWordProgress: 0,
            });
            if (currentResolve === resolve) currentResolve = null;
            reject(new Error(`Failed to load audio: ${targetUrl}`));
          };

          audio.play().catch((err) => {
            stopWordTrackingLoop();
            setActiveAudio(null);
            set({
              playingLineId: null,
              activeAudio: null,
              activeWordIndex: null,
              activeWordProgress: 0,
            });
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
      stopWordTrackingLoop();
      stopAllAudio();
      if (currentResolve) {
        currentResolve();
        currentResolve = null;
      }
      set({ playingLineId: lineId });

      const startedAt =
        typeof performance !== "undefined" ? performance.now() : Date.now();

      startPhoneticTracking(text, rate, () => getActiveAudio());

      return new Promise<void>((resolve) => {
        currentResolve = resolve;
        playHybridTTS(text, rate, voice)
          .then(() => {
            stopWordTrackingLoop();
            const elapsedSec =
              ((typeof performance !== "undefined"
                ? performance.now()
                : Date.now()) -
                startedAt) /
              1000;
            set({
              playingLineId: null,
              activeAudio: null,
              activeWordIndex: null,
              activeWordProgress: 0,
              lastPlayedDurationSec: Math.max(1.2, elapsedSec),
            });
            if (currentResolve === resolve) currentResolve = null;
            resolve();
          })
          .catch(() => {
            stopWordTrackingLoop();
            set({
              playingLineId: null,
              activeAudio: null,
              activeWordIndex: null,
              activeWordProgress: 0,
            });
            if (currentResolve === resolve) currentResolve = null;
            resolve();
          });
      });
    },
  };
});