import { create } from "zustand";
import {
  playTTS as playHybridTTS,
  setActiveAudio,
  getActiveAudio,
  setActiveAudioPlaybackRate,
  stopAllAudio,
  VoiceOption,
  calculateWordPhoneticWeights,
  getWordIndexAtProgress,
  WordTimingSegment,
} from "@/lib/audio";
import { requestWakeLock, releaseWakeLock } from "@/lib/wakeLock";

interface AudioState {
  activeAudio: HTMLAudioElement | null;
  playingLineId: number | null;
  activeWordIndex: number | null;
  activeWordProgress: number;
  lastPlayedDurationSec: number;
  isShadowingPause: boolean;
  shadowingPauseMs: number;
  shadowingTimerId: ReturnType<typeof setTimeout> | null;
  setShadowingPause: (isPaused: boolean, durationMs?: number) => void;
  waitShadowingPause: (
    durationMs: number,
    showVisualPause?: boolean
  ) => Promise<boolean>;
  clearShadowingTimer: () => void;
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
  setPlaybackRate: (rate: number) => void;
  pause: () => void;
  stop: () => void;
}

let currentResolve: (() => void) | null = null;
let trackingRafId: number | null = null;
let activeShadowingTimerId: ReturnType<typeof setTimeout> | null = null;
let activeShadowingResolve: ((completed: boolean) => void) | null = null;

function stopWordTrackingLoop() {
  if (trackingRafId !== null && typeof window !== "undefined") {
    cancelAnimationFrame(trackingRafId);
    trackingRafId = null;
  }
}

function cancelActiveShadowingTimer() {
  if (activeShadowingTimerId !== null) {
    clearTimeout(activeShadowingTimerId);
    activeShadowingTimerId = null;
  }
  if (activeShadowingResolve) {
    const res = activeShadowingResolve;
    activeShadowingResolve = null;
    res(false);
  }
}

export const useAudioStore = create<AudioState>((set, get) => {
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
    isShadowingPause: false,
    shadowingPauseMs: 0,
    shadowingTimerId: null,

    setShadowingPause: (isPaused: boolean, durationMs = 0) => {
      if (!isPaused) {
        cancelActiveShadowingTimer();
      }
      set({
        isShadowingPause: isPaused,
        shadowingPauseMs: isPaused ? durationMs : 0,
        shadowingTimerId: isPaused ? activeShadowingTimerId : null,
      });
    },

    clearShadowingTimer: () => {
      cancelActiveShadowingTimer();
      set({
        shadowingTimerId: null,
        isShadowingPause: false,
        shadowingPauseMs: 0,
      });
    },

    waitShadowingPause: (durationMs: number, showVisualPause = false) => {
      cancelActiveShadowingTimer();
      return new Promise<boolean>((resolve) => {
        activeShadowingResolve = resolve;
        const timerId = setTimeout(() => {
          if (activeShadowingTimerId === timerId) {
            activeShadowingTimerId = null;
          }
          if (activeShadowingResolve === resolve) {
            activeShadowingResolve = null;
          }
          set({
            shadowingTimerId: null,
            isShadowingPause: false,
            shadowingPauseMs: 0,
          });
          resolve(true);
        }, durationMs);

        activeShadowingTimerId = timerId;
        set({
          shadowingTimerId: timerId,
          isShadowingPause: showVisualPause,
          shadowingPauseMs: showVisualPause ? durationMs : 0,
        });
      });
    },

    setPlaybackRate: (rate: number) => {
      setActiveAudioPlaybackRate(rate);
      const current = get().activeAudio;
      if (current) {
        try {
          current.defaultPlaybackRate = rate;
          current.playbackRate = rate;
          current.preservesPitch = true;
        } catch {
          // ignore
        }
      }
    },

    pause: () => {
      cancelActiveShadowingTimer();
      stopWordTrackingLoop();
      stopAllAudio();
      void releaseWakeLock("audio");
      set({
        activeAudio: null,
        playingLineId: null,
        activeWordIndex: null,
        activeWordProgress: 0,
        isShadowingPause: false,
        shadowingPauseMs: 0,
        shadowingTimerId: null,
      });

      if (currentResolve) {
        currentResolve();
        currentResolve = null;
      }
    },

    stop: () => {
      cancelActiveShadowingTimer();
      stopWordTrackingLoop();
      stopAllAudio();
      void releaseWakeLock("audio");
      set({
        activeAudio: null,
        playingLineId: null,
        activeWordIndex: null,
        activeWordProgress: 0,
        isShadowingPause: false,
        shadowingPauseMs: 0,
        shadowingTimerId: null,
      });

      if (currentResolve) {
        currentResolve();
        currentResolve = null;
      }
    },

    playAudio: async (url, lineId, rate, sentenceText) => {
      cancelActiveShadowingTimer();
      stopWordTrackingLoop();
      stopAllAudio();
      if (currentResolve) {
        currentResolve();
        currentResolve = null;
      }
      set({
        isShadowingPause: false,
        shadowingPauseMs: 0,
        shadowingTimerId: null,
      });
      void requestWakeLock("audio");

      const startedAt =
        typeof performance !== "undefined" ? performance.now() : Date.now();

      const tryPlayUrl = (targetUrl: string) =>
        new Promise<void>((resolve, reject) => {
          currentResolve = resolve;
          const audio = new Audio(targetUrl);
          audio.preload = "auto";
          audio.defaultPlaybackRate = rate;
          audio.playbackRate = rate;
          audio.preservesPitch = true;
          const extAudio = audio as HTMLAudioElement & {
            webkitPreservesPitch?: boolean;
            mozPreservesPitch?: boolean;
          };
          if ("webkitPreservesPitch" in extAudio) {
            extAudio.webkitPreservesPitch = true;
          }
          if ("mozPreservesPitch" in extAudio) {
            extAudio.mozPreservesPitch = true;
          }
          setActiveAudio(audio);
          set({ playingLineId: lineId, activeAudio: audio });

          startPhoneticTracking(sentenceText, rate, () => audio);

          audio.onloadedmetadata = () => {
            audio.playbackRate = rate;
            audio.preservesPitch = true;
          };

          audio.onended = () => {
            stopWordTrackingLoop();
            void releaseWakeLock("audio");
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
            void releaseWakeLock("audio");
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
            void releaseWakeLock("audio");
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

      await tryPlayUrl(url);
    },

    playTTS: async (text, lineId, rate, voice = "male") => {
      cancelActiveShadowingTimer();
      stopWordTrackingLoop();
      stopAllAudio();
      if (currentResolve) {
        currentResolve();
        currentResolve = null;
      }
      void requestWakeLock("audio");
      set({
        playingLineId: lineId,
        isShadowingPause: false,
        shadowingPauseMs: 0,
        shadowingTimerId: null,
      });

      const startedAt =
        typeof performance !== "undefined" ? performance.now() : Date.now();

      startPhoneticTracking(text, rate, () => getActiveAudio());

      return new Promise<void>((resolve) => {
        currentResolve = resolve;
        playHybridTTS(text, rate, voice)
          .then(() => {
            stopWordTrackingLoop();
            void releaseWakeLock("audio");
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
            void releaseWakeLock("audio");
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