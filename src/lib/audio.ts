// src/lib/audio.ts
// 3 Katmanlı Hibrit ve Doğal Arapça Seslendirme Motoru:
// Katman 1: Yerel MP3 (/audio/dialogues/{dialogueId}/{sira}.mp3 ve public/audio/manifest.json)
// Katman 2: Sunucu Destekli Neural TTS API (/api/tts - HamedNeural / ZariyahNeural + Google TTS Fallback) + Bellek/CacheStorage Önbelleği
// Katman 3: Akıllı Web Speech API (Offline Fallback - en kaliteli Arapça sistem sesini seçer)

export type VoiceOption =
  | "male"
  | "female"
  | "E"
  | "K"
  | "ar-SA-HamedNeural"
  | "ar-SA-ZariyahNeural";

let activeAudio: HTMLAudioElement | null = null;
let audioManifest: Record<string, string[]> | null = null;

// İstemci tarafı bellek içi Blob URL önbelleği (Tekrar tıklamalarda 0ms gecikme)
const memoryBlobUrlCache = new Map<string, string>();
const TTS_CACHE_STORAGE_NAME = "arabic-neural-tts-cache-v2";

export async function loadAudioManifest(): Promise<Record<string, string[]>> {
  if (audioManifest) return audioManifest;
  try {
    const res = await fetch("/audio/manifest.json");
    if (!res.ok) {
      audioManifest = {};
      return {};
    }
    audioManifest = await res.json();
    return audioManifest || {};
  } catch {
    audioManifest = {};
    return {};
  }
}

export function hasMp3(dialogueId: string, sira: number): boolean {
  if (!dialogueId || sira < 1) return false;
  // 60 diyaloğun (dlg_01 - dlg_60) tüm satırları için yerel MP3 önceliğini garanti altına al
  if (/^dlg_\d+$/.test(dialogueId)) {
    return true;
  }
  if (!audioManifest || !audioManifest[dialogueId]) return false;
  const entry = audioManifest[dialogueId];
  if (Array.isArray(entry)) {
    const siraStr = String(sira);
    const padded = siraStr.padStart(3, "0");
    return (
      entry.includes(siraStr) ||
      entry.includes(padded) ||
      entry.some((item) => String(item) === siraStr)
    );
  }
  return Boolean((entry as Record<string, string>)[String(sira)]);
}

export function getMp3Path(dialogueId: string, sira: number): string {
  // Manifest içinde özel bir dosya yolu tanımlıysa onu kullan
  if (audioManifest && audioManifest[dialogueId]) {
    const entry = audioManifest[dialogueId] as
      | string[]
      | Record<string, string>;
    if (!Array.isArray(entry) && typeof entry === "object") {
      const customPath = entry[String(sira)];
      if (customPath) return customPath;
    } else if (Array.isArray(entry)) {
      const found = entry.find(
        (item) =>
          typeof item === "string" &&
          item.startsWith("/") &&
          item.endsWith(`/${sira}.mp3`)
      );
      if (typeof found === "string") return found;
    }
  }
  return `/audio/dialogues/${dialogueId}/${sira}.mp3`;
}

export function getFallbackMp3Path(dialogueId: string, sira: number): string {
  return `/audio/dialogues/${dialogueId}/${sira}.mp3`;
}

export function setActiveAudio(audio: HTMLAudioElement | null) {
  activeAudio = audio;
}

export function stopAllAudio() {
  if (activeAudio) {
    try {
      activeAudio.pause();
      activeAudio.currentTime = 0;
      activeAudio.src = "";
      activeAudio.onended = null;
      activeAudio.onerror = null;
    } catch {
      // sessizce geç
    }
    activeAudio = null;
  }
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    try {
      window.speechSynthesis.cancel();
    } catch {
      // sessizce geç
    }
  }
}

function normalizeVoiceGender(voice?: VoiceOption): "male" | "female" {
  if (
    voice === "female" ||
    voice === "K" ||
    voice === "ar-SA-ZariyahNeural"
  ) {
    return "female";
  }
  return "male";
}

/**
 * Katman 3: Akıllı Web Speech API Seçicisi (Çevrimdışı / Hata durumunda devreye girer)
 */
function pickBestArabicVoice(
  gender: "male" | "female"
): SpeechSynthesisVoice | null {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    return null;
  }
  const voices = window.speechSynthesis.getVoices();
  if (!voices || voices.length === 0) return null;

  const arabicVoices = voices.filter(
    (v) =>
      v.lang.toLowerCase().startsWith("ar") ||
      v.name.includes("Arabic") ||
      v.name.includes("العربية")
  );

  if (arabicVoices.length === 0) return null;

  // Ses kalitesine ve cinsiyete göre puanlama
  const scored = arabicVoices.map((v) => {
    let score = 0;
    const nameL = v.name.toLowerCase();
    const langL = v.lang.toLowerCase();

    if (langL === "ar-sa") score += 30;
    else if (langL === "ar-eg" || langL === "ar-ae") score += 25;
    else score += 15;

    if (nameL.includes("natural") || nameL.includes("neural")) score += 40;
    if (nameL.includes("google") || nameL.includes("microsoft")) score += 25;
    if (
      nameL.includes("hamed") ||
      nameL.includes("zariyah") ||
      nameL.includes("salma") ||
      nameL.includes("shakir") ||
      nameL.includes("maged") ||
      nameL.includes("tarik") ||
      nameL.includes("laila")
    ) {
      score += 20;
    }

    if (gender === "female") {
      if (
        nameL.includes("zariyah") ||
        nameL.includes("salma") ||
        nameL.includes("laila") ||
        nameL.includes("female") ||
        nameL.includes("amira")
      ) {
        score += 18;
      }
    } else {
      if (
        nameL.includes("hamed") ||
        nameL.includes("shakir") ||
        nameL.includes("maged") ||
        nameL.includes("tarik") ||
        nameL.includes("male") ||
        nameL.includes("naayf")
      ) {
        score += 18;
      }
    }

    return { voice: v, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored[0].voice;
}

export function playWebSpeechFallback(
  text: string,
  rate: number = 1,
  voice?: VoiceOption,
  langOverride?: "ar-SA" | "tr-TR"
): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      resolve();
      return;
    }

    stopAllAudio();
    const gender = normalizeVoiceGender(voice);
    const isArabic = /[\u0600-\u06FF]/.test(text);
    const targetLang = langOverride || (isArabic ? "ar-SA" : "tr-TR");

    const speakNow = () => {
      const utterance = new SpeechSynthesisUtterance(text);
      if (targetLang === "ar-SA") {
        const bestVoice = pickBestArabicVoice(gender);
        if (bestVoice) {
          utterance.voice = bestVoice;
          utterance.lang = bestVoice.lang;
        } else {
          utterance.lang = "ar-SA";
        }
      } else {
        const voices = window.speechSynthesis.getVoices();
        const trVoice = voices.find((v) =>
          v.lang.toLowerCase().startsWith("tr")
        );
        if (trVoice) {
          utterance.voice = trVoice;
          utterance.lang = trVoice.lang;
        } else {
          utterance.lang = "tr-TR";
        }
      }
      utterance.rate = rate;
      utterance.pitch = gender === "female" ? 1.05 : 0.98;
      utterance.onend = () => resolve();
      utterance.onerror = () => resolve();
      window.speechSynthesis.speak(utterance);
    };

    if (window.speechSynthesis.getVoices().length === 0) {
      window.speechSynthesis.onvoiceschanged = () => {
        window.speechSynthesis.onvoiceschanged = null;
        speakNow();
      };
      setTimeout(speakNow, 250);
    } else {
      speakNow();
    }
  });
}

export function playTurkishTTS(text: string, rate: number = 1): Promise<void> {
  return playWebSpeechFallback(text, rate, "male", "tr-TR");
}

/**
 * Katman 2: /api/tts üzerinden Neural TTS Sesini İndir ve Önbellekle (Memory + CacheStorage)
 */
async function getOrFetchNeuralTtsBlobUrl(
  text: string,
  gender: "male" | "female"
): Promise<string | null> {
  const cleanText = text.trim();
  if (!cleanText) return null;

  const cacheKey = `${gender}:${cleanText}`;
  if (memoryBlobUrlCache.has(cacheKey)) {
    return memoryBlobUrlCache.get(cacheKey)!;
  }

  const requestUrl = `/api/tts?text=${encodeURIComponent(
    cleanText
  )}&voice=${gender}`;

  try {
    // Önce tarayıcı CacheStorage içinde var mı kontrol et
    if (typeof window !== "undefined" && "caches" in window) {
      try {
        const cache = await caches.open(TTS_CACHE_STORAGE_NAME);
        const cachedRes = await cache.match(requestUrl);
        if (cachedRes && cachedRes.ok) {
          const blob = await cachedRes.blob();
          if (blob.size > 128) {
            const blobUrl = URL.createObjectURL(blob);
            memoryBlobUrlCache.set(cacheKey, blobUrl);
            return blobUrl;
          }
        }
      } catch {
        // CacheStorage erişilemezse devam et
      }
    }

    // Çevrimdışıysa doğrudan null dön (Katman 3 devreye girer)
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      return null;
    }

    const res = await fetch(requestUrl);
    if (!res.ok) return null;

    const blob = await res.blob();
    if (blob.size <= 128) return null;

    // CacheStorage'a kaydet
    if (typeof window !== "undefined" && "caches" in window) {
      try {
        const cache = await caches.open(TTS_CACHE_STORAGE_NAME);
        await cache.put(
          requestUrl,
          new Response(blob, {
            headers: { "Content-Type": "audio/mpeg" },
          })
        );
      } catch {
        // sessizce geç
      }
    }

    const blobUrl = URL.createObjectURL(blob);
    memoryBlobUrlCache.set(cacheKey, blobUrl);
    return blobUrl;
  } catch {
    return null;
  }
}

function applyPlaybackRateAndPitch(audio: HTMLAudioElement, rate: number) {
  const clampedRate = Math.min(1.5, Math.max(0.5, Number(rate) || 1.0));
  audio.defaultPlaybackRate = clampedRate;
  audio.playbackRate = clampedRate;
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
}

export function setActiveAudioPlaybackRate(rate: number) {
  if (activeAudio) {
    try {
      applyPlaybackRateAndPitch(activeAudio, rate);
    } catch {
      // ignore
    }
  }
}

function playSingleAudioUrl(url: string, rate: number = 1): Promise<void> {
  return new Promise((resolve, reject) => {
    stopAllAudio();
    const audio = new Audio(url);
    audio.preload = "auto";
    applyPlaybackRateAndPitch(audio, rate);
    activeAudio = audio;

    audio.onloadedmetadata = () => {
      applyPlaybackRateAndPitch(audio, rate);
    };

    audio.oncanplay = () => {
      applyPlaybackRateAndPitch(audio, rate);
    };

    audio.onplay = () => {
      applyPlaybackRateAndPitch(audio, rate);
    };

    audio.onended = () => {
      if (activeAudio === audio) activeAudio = null;
      resolve();
    };

    audio.onerror = () => {
      if (activeAudio === audio) activeAudio = null;
      reject(new Error("Audio playback failed"));
    };

    audio.play().catch((err) => {
      if (activeAudio === audio) activeAudio = null;
      reject(err);
    });
  });
}

/**
 * Herhangi bir ses URL'sini (Yerel MP3 veya Neural TTS Blob URL) oynatır.
 * Eğer çevrimdışı ders paketi ("muallimun-offline-audio-v1") indirilmişse önbellekten okur.
 */
export async function playAudioElement(
  url: string,
  rate: number = 1
): Promise<void> {
  let effectiveUrl = url;
  if (
    typeof window !== "undefined" &&
    "caches" in window &&
    url.startsWith("/")
  ) {
    try {
      const cache = await caches.open("muallimun-offline-audio-v1");
      const matched = await cache.match(url);
      if (matched && matched.ok) {
        const blob = await matched.blob();
        if (blob.size > 128) {
          effectiveUrl = URL.createObjectURL(blob);
        }
      }
    } catch {
      // ignore cache lookup failure
    }
  }
  await playSingleAudioUrl(effectiveUrl, rate);
}

/**
 * Ana TTS Fonksiyonu (Katman 2 Neural TTS -> Katman 3 Akıllı Web Speech Fallback)
 */
export async function playTTS(
  text: string,
  rate: number = 1,
  voice?: VoiceOption
): Promise<void> {
  const cleanText = text.trim();
  if (!cleanText) return;

  const gender = normalizeVoiceGender(voice);

  // Katman 2: Doğal Neural TTS (/api/tts + Önbellek)
  const neuralBlobUrl = await getOrFetchNeuralTtsBlobUrl(cleanText, gender);
  if (neuralBlobUrl) {
    try {
      await playAudioElement(neuralBlobUrl, rate);
      return;
    } catch {
      // Oynatma hatası olursa Katman 3'e düş
    }
  }

  // Katman 3: Gelişmiş Web Speech API Fallback
  await playWebSpeechFallback(cleanText, rate, gender);
}

/**
 * 3 Katmanlı Hibrit Cümle/Kelime Seslendirici:
 * 1. Yerel MP3 varsa MP3 çalar
 * 2. Yoksa /api/tts üzerinden Doğal Neural TTS çalar (önbellekli)
 * 3. Çevrimdışıysa Akıllı Web Speech API çalar
 */
export async function speakHybrid(options: {
  text: string;
  rate?: number;
  voice?: VoiceOption;
  dialogueId?: string;
  lineSira?: number;
  wordId?: string;
}): Promise<void> {
  const {
    text,
    rate = 1,
    voice = "male",
    dialogueId,
    lineSira,
    wordId,
  } = options;

  await loadAudioManifest();

  // Katman 1A: Diyalog satırı yerel MP3 kontrolü (/audio/dialogues -> Neural TTS)
  if (dialogueId && lineSira !== undefined && hasMp3(dialogueId, lineSira)) {
    try {
      await playAudioElement(getMp3Path(dialogueId, lineSira), rate);
      return;
    } catch {
      // MP3 yüklenemezse Katman 2 Neural TTS'e geç
    }
  }

  // Katman 1B: Sözlük kelimesi yerel MP3 kontrolü
  if (
    wordId &&
    audioManifest &&
    Array.isArray(audioManifest.words) &&
    audioManifest.words.includes(wordId)
  ) {
    try {
      await playAudioElement(`/audio/words/${wordId}.mp3`, rate);
      return;
    } catch {
      // Katman 2'ye geç
    }
  }

  // Katman 2 & 3: Neural TTS -> Web Speech Fallback
  await playTTS(text, rate, voice);
}

export function getActiveAudio(): HTMLAudioElement | null {
  return activeAudio;
}

export interface WordTimingSegment {
  index: number;
  word: string;
  weight: number;
  startRatio: number;
  endRatio: number;
}

/**
 * Fonetik Ağırlıklı Kelime Zamanlama Motoru:
 * Harf sayısı + Med harfleri (ا، و، ي، ى، ٰ -> +1.5 ağırlık) + Şedde (\u0651 -> +1.2 ağırlık) + Noktalama duraksaması (، . ؟ ! ؛ : -> +2.0 ağırlık)
 */
export function calculateWordPhoneticWeights(sentence: string): {
  segments: WordTimingSegment[];
  totalWeight: number;
  estimatedDurationSec: number;
} {
  const words = sentence.split(" ");
  const rawWeights: { index: number; word: string; weight: number }[] = [];

  words.forEach((word, index) => {
    const trimmed = word.trim();
    if (!trimmed) {
      rawWeights.push({ index, word, weight: 0.2 });
      return;
    }

    // Harf sayısı (Harekeler hariç temel Arapça harfler)
    const baseLetters = (trimmed.match(/[\u0621-\u064A]/g) || []).length;
    // Med harfleri (ا، و، ي، ى ve asâ/çeker \u0670 -> +1.5 ağırlık)
    const maddCount = (trimmed.match(/[اويى\u0670]/g) || []).length;
    // Şedde (\u0651 -> +1.2 ağırlık)
    const shaddaCount = (trimmed.match(/\u0651/g) || []).length;
    // Noktalama duraksaması (، . ؟ ! ؛ : -> +2.0 ağırlık)
    const hasPunctPause = /[،.؟!؛:,?]/.test(trimmed);

    const weight =
      Math.max(1, baseLetters) +
      maddCount * 1.5 +
      shaddaCount * 1.2 +
      (hasPunctPause ? 2.0 : 0);

    rawWeights.push({ index, word, weight });
  });

  const totalWeight =
    rawWeights.reduce((sum, item) => sum + item.weight, 0) || 1;

  let cumulative = 0;
  const segments: WordTimingSegment[] = rawWeights.map((item) => {
    const startRatio = cumulative / totalWeight;
    cumulative += item.weight;
    const endRatio = cumulative / totalWeight;
    return {
      index: item.index,
      word: item.word,
      weight: item.weight,
      startRatio,
      endRatio,
    };
  });

  // Ortalama konuşma hızı için tahmini süre (Web Speech API veya duration henüz yüklenmemişse)
  const estimatedDurationSec = Math.max(1.2, totalWeight * 0.088);

  return { segments, totalWeight, estimatedDurationSec };
}

export function getWordIndexAtProgress(
  segments: WordTimingSegment[],
  progressRatio: number
): { wordIndex: number; wordProgress: number } {
  if (segments.length === 0) {
    return { wordIndex: 0, wordProgress: 0 };
  }
  const clamped = Math.max(0, Math.min(0.9999, progressRatio));
  for (const seg of segments) {
    if (clamped >= seg.startRatio && clamped <= seg.endRatio) {
      const span = Math.max(0.0001, seg.endRatio - seg.startRatio);
      const wordProgress = Math.max(
        0,
        Math.min(1, (clamped - seg.startRatio) / span)
      );
      return { wordIndex: seg.index, wordProgress };
    }
  }
  const last = segments[segments.length - 1];
  return { wordIndex: last.index, wordProgress: 1 };
}