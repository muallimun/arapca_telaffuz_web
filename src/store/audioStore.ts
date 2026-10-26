import { create } from "zustand";

interface AudioState {
  activeAudio: HTMLAudioElement | null;
  playingLineId: number | null;
  playAudio: (url: string, lineId: number, rate: number) => Promise<void>;
  playTTS: (text: string, lineId: number, rate: number) => Promise<void>;
  stop: () => void;
}

// Beklemede kalan promise'i sonlandırmak için global değişken
let currentResolve: (() => void) | null = null;

export const useAudioStore = create<AudioState>((set, get) => ({
  activeAudio: null,
  playingLineId: null,

  stop: () => {
    const { activeAudio } = get();
    if (activeAudio) {
      activeAudio.pause();
      activeAudio.currentTime = 0;
      activeAudio.src = ""; 
      activeAudio.onended = null; // Olay dinleyicisini temizle
    }
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    set({ activeAudio: null, playingLineId: null });

    // Eğer askıda bekleyen bir ses döngüsü varsa onu serbest bırak
    if (currentResolve) {
      currentResolve();
      currentResolve = null;
    }
  },

  playAudio: async (url, lineId, rate) => {
    get().stop(); 
    set({ playingLineId: lineId });
    
    const audio = new Audio(url);
    audio.playbackRate = rate;
    set({ activeAudio: audio });

    return new Promise((resolve, reject) => {
      currentResolve = resolve; // Bu promise'i kaydet

      audio.onended = () => {
        set({ playingLineId: null, activeAudio: null });
        if (currentResolve === resolve) currentResolve = null;
        resolve();
      };
      audio.onerror = () => {
        set({ playingLineId: null, activeAudio: null });
        if (currentResolve === resolve) currentResolve = null;
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
      
      currentResolve = resolve;

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = "ar-SA";
      utterance.rate = rate;
      
      utterance.onend = () => {
        set({ playingLineId: null });
        if (currentResolve === resolve) currentResolve = null;
        resolve();
      };
      utterance.onerror = () => {
        set({ playingLineId: null });
        if (currentResolve === resolve) currentResolve = null;
        resolve();
      };
      
      window.speechSynthesis.speak(utterance);
    });
  },
}));