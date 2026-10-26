// src/lib/audio.ts

let activeAudio: HTMLAudioElement | null = null;
let audioManifest: Record<string, string[]> | null = null;

export async function loadAudioManifest() {
  if (audioManifest) return audioManifest;
  try {
    const res = await fetch('/mp3/manifest.json');
    if (!res.ok) {
      audioManifest = {};
      return {};
    }
    audioManifest = await res.json();
    return audioManifest;
  } catch {
    audioManifest = {};
    return {};
  }
}

export function hasMp3(dlgId: string, sira: number): boolean {
  if (!audioManifest || !audioManifest[dlgId]) return false;
  const key = String(sira).padStart(3, '0');
  return audioManifest[dlgId].includes(key);
}

export function getMp3Path(dlgId: string, sira: number): string {
  const key = String(sira).padStart(3, '0');
  return `/mp3/${dlgId}/${dlgId}_${key}.mp3`;
}

// Global ses durdurucu
export function stopAllAudio() {
  if (activeAudio) {
    activeAudio.pause();
    activeAudio.currentTime = 0;
    activeAudio.src = ""; // TARAYICIYI TAMAMEN SUSTURMAK İÇİN KAYNAĞI BOŞALT
    activeAudio = null;
  }
  if (typeof window !== 'undefined' && window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
}

// ... (kalan kodlar aynı)

// YENİ: Aktif mp3'ü global değişkene ata
export function setActiveAudio(audio: HTMLAudioElement | null) {
  activeAudio = audio;
}

export function playTTS(text: string, rate: number = 1): Promise<void> {
  return new Promise((resolve) => {
    if (!('speechSynthesis' in window)) {
      console.warn('Tarayıcınız TTS desteklemiyor.');
      resolve();
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'ar-SA';
    utterance.rate = rate;
    utterance.onend = () => resolve();
    utterance.onerror = () => resolve();
    window.speechSynthesis.speak(utterance);
  });
}