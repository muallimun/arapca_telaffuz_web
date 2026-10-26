import { create } from "zustand";

interface AudioState {
  activeAudio: HTMLAudioElement | null;
  playingLineId: number | null;
  playAudio: (url: string, lineId: number, rate: number) => Promise<void>;
  playTTS: (text: string, lineId: number, rate: number) => Promise<void>;
  stop: () => void;
}

export const useAudioStore = create<AudioState>((set, get) => ({
  activeAudio: null,
  playingLineId: null,

  stop: () => {
    const { activeAudio } = get();
    if (activeAudio) {
      activeAudio.pause();
      activeAudio.currentTime = 0;
      activeAudio.src = ""; // Kaynağı tamamen kopar
    }
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    set({ activeAudio: null, playingLineId: null });
  },

  playAudio: async (url, lineId, rate) => {
    get().stop(); // Önce eski sesi durdur
    set({ playingLineId: lineId });
    
    const audio = new Audio(url);
    audio.playbackRate = rate;
    set({ activeAudio: audio });

    return new Promise((resolve, reject) => {
      audio.onended = () => {
        set({ playingLineId: null, activeAudio: null });
        resolve();
      };
      audio.onerror = () => {
        set({ playingLineId: null, activeAudio: null });
        reject(new Error("Audio error"));
      };
      audio.play().catch(reject);
    });
  },

  playTTS: (text, lineId, rate) => {
    get().stop();
    set({ playingLineId: lineId });
    
    return new Promise((resolve) => {
      if (!("speechSynthesis" in window)) return resolve();
      
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = "ar-SA";
      utterance.rate = rate;
      
      utterance.onend = () => {
        set({ playingLineId: null });
        resolve();
      };
      utterance.onerror = () => {
        set({ playingLineId: null });
        resolve();
      };
      
      window.speechSynthesis.speak(utterance);
    });
  },
}));