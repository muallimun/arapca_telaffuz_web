// src/lib/audioAnalysis.ts
// Web Audio API (16kHz Kayıt, Canlı RMS, VAD, Çift Dalga Formu Ritim Korelasyonu ve 16-bit PCM .wav Üretimi)

import {
  SentenceEvaluationResult,
  evaluateSentenceWords,
} from "./arabicNlpEngine";

export interface RecordingSession16kHz {
  killStreamImmediately: () => void;
  stop: () => Promise<{
    samples16kHz: Float32Array;
    trimmedSamples: Float32Array;
    actualSampleRate: number;
    syllablePeaks: number;
    wavBlob: Blob;
    wavUrl: string;
    playbackBlob: Blob;
    playbackUrl: string;
    mimeType: string;
    duration: number;
    rawDuration: number;
    voicedDuration: number;
    peakRms: number;
    avgRms: number;
    isSilent: boolean;
    rmsHistory: number[];
    envelopeBars: number[];
  }>;
  getLiveRms: () => number;
  getStream: () => MediaStream;
  getAudioContext: () => AudioContext;
}

/**
 * Mobil (iOS Safari & Android Chrome) ve masaüstü tarayıcılar için desteklenen
 * en uygun MediaRecorder MIME türünü dinamik olarak seçer.
 */
export function getSupportedAudioMimeType(): string {
  if (
    typeof window === "undefined" ||
    typeof MediaRecorder === "undefined" ||
    typeof MediaRecorder.isTypeSupported !== "function"
  ) {
    return "";
  }
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/ogg",
  ];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) || "";
}

/**
 * Verilen Float32Array örnek dizisinden (mono) normalize edilmiş RMS zarfı çıkarır.
 */
export function extractFloat32Envelope(
  samples: Float32Array,
  sampleRate: number = 16000,
  numBars: number = 48
): { bars: number[]; duration: number } {
  if (!samples || samples.length === 0) {
    return { bars: Array(numBars).fill(0.05), duration: 0 };
  }
  const samplesPerBar = Math.max(1, Math.floor(samples.length / numBars));
  const bars: number[] = [];

  for (let i = 0; i < numBars; i++) {
    const start = i * samplesPerBar;
    const end = Math.min(start + samplesPerBar, samples.length);
    if (end <= start) {
      bars.push(0.05);
      continue;
    }
    let sumSquares = 0;
    for (let j = start; j < end; j++) {
      sumSquares += samples[j] * samples[j];
    }
    const rms = Math.sqrt(sumSquares / (end - start));
    bars.push(rms);
  }

  const maxVal = Math.max(...bars, 0.0001);
  // Eğer en yüksek enerji bile sessizlik eşiğinin altındaysa arka plan gürültüsünü 1.0'a büyütme
  if (maxVal < 0.008) {
    return {
      bars: Array(numBars).fill(0.05),
      duration: 0,
    };
  }
  const normalizedBars = bars.map((b) => Math.max(0.04, b / maxVal));

  return {
    bars: normalizedBars,
    duration: samples.length / sampleRate,
  };
}

/**
 * Verilen AudioBuffer'dan RMS (Kök Ortalama Kare) tabanlı zarf çıkarır.
 */
export function extractAudioEnvelope(
  audioBuffer: AudioBuffer,
  numBars: number = 48
): { bars: number[]; duration: number } {
  const channelData = audioBuffer.getChannelData(0);
  return extractFloat32Envelope(channelData, audioBuffer.sampleRate, numBars);
}

/**
 * İki zarf dizisi arasındaki Sakoe-Chiba bant kısıtlı 1D Dinamik Zaman Bükme (DTW)
 * ve duraklama (sessizlik vadileri) hizalaması (0 - 100).
 */
export function calculateRhythmMatch(
  refBars: number[],
  userBars: number[]
): number {
  if (!refBars || !userBars || refBars.length === 0 || userBars.length === 0) {
    return 0;
  }

  const N = refBars.length;
  const M = userBars.length;

  // 1. Dinamik aralık (varyans) ve tepe/enerji normalizasyonu kontrolü
  let userMin = Infinity;
  let userMax = -Infinity;
  let userSum = 0;
  for (let i = 0; i < M; i++) {
    const v = userBars[i];
    if (v < userMin) userMin = v;
    if (v > userMax) userMax = v;
    userSum += v;
  }
  const userMean = userSum / M;
  let varianceSum = 0;
  for (let i = 0; i < M; i++) {
    const diff = userBars[i] - userMean;
    varianceSum += diff * diff;
  }
  const userStdDev = Math.sqrt(varianceSum / M);
  const userDynamicRange = userMax - userMin;

  // Tamamen sessiz kayıt
  if (userMax < 0.09) return 0;

  const isFlatNoise = userDynamicRange < 0.08 || userStdDev < 0.032;

  const normalizeEnvelope = (bars: number[]): number[] => {
    let minVal = Infinity;
    let maxVal = -Infinity;
    for (let i = 0; i < bars.length; i++) {
      if (bars[i] < minVal) minVal = bars[i];
      if (bars[i] > maxVal) maxVal = bars[i];
    }
    const range = maxVal - minVal;
    if (range < 1e-4) {
      return bars.map(() => 0.5);
    }
    return bars.map((v) => (v - minVal) / range);
  };

  const normRef = normalizeEnvelope(refBars);
  const normUser = normalizeEnvelope(userBars);

  // 2. Sakoe-Chiba bant kısıtlı 1D Dynamic Time Warping (DTW)
  const window = Math.max(4, Math.floor(Math.max(N, M) * 0.22));
  const costMatrix: number[][] = Array.from({ length: N + 1 }, () =>
    Array(M + 1).fill(Infinity)
  );
  costMatrix[0][0] = 0;

  for (let i = 1; i <= N; i++) {
    const jStart = Math.max(1, Math.round((i * M) / N) - window);
    const jEnd = Math.min(M, Math.round((i * M) / N) + window);
    for (let j = jStart; j <= jEnd; j++) {
      const dist = Math.abs(normRef[i - 1] - normUser[j - 1]);
      const prevMin = Math.min(
        costMatrix[i - 1][j],
        costMatrix[i][j - 1],
        costMatrix[i - 1][j - 1]
      );
      costMatrix[i][j] = dist + prevMin;
    }
  }

  let totalCost = costMatrix[N][M];
  if (!Number.isFinite(totalCost)) {
    // Band dışına taşma olursa tam DTW yedek hesaplaması
    for (let i = 1; i <= N; i++) {
      for (let j = 1; j <= M; j++) {
        const dist = Math.abs(normRef[i - 1] - normUser[j - 1]);
        costMatrix[i][j] =
          dist +
          Math.min(
            costMatrix[i - 1][j],
            costMatrix[i][j - 1],
            costMatrix[i - 1][j - 1]
          );
      }
    }
    totalCost = costMatrix[N][M];
  }

  const normalizedDtwDistance = totalCost / Math.max(N, M, 1);
  const dtwScore = Math.max(0, Math.min(1, 1 - normalizedDtwDistance * 1.15));

  // 3. Cümle içi duraklama (sessizlik vadileri) hizalaması (%25 ağırlık)
  const PAUSE_THRESHOLD = 0.24;
  let pauseMatches = 0;
  const compareLen = Math.min(N, M);
  for (let i = 0; i < compareLen; i++) {
    const refIsPause = normRef[i] < PAUSE_THRESHOLD;
    // Sakoe-Chiba komşuluğunda (±2 bar) duraklama/vadi uyumu kontrolü
    let matchedInBand = false;
    for (
      let k = Math.max(0, i - 2);
      k <= Math.min(M - 1, i + 2);
      k++
    ) {
      const userIsPause = normUser[k] < PAUSE_THRESHOLD;
      if (refIsPause === userIsPause) {
        matchedInBand = true;
        break;
      }
    }
    if (matchedInBand) {
      pauseMatches++;
    }
  }
  const pauseAlignmentScore = compareLen > 0 ? pauseMatches / compareLen : 0;

  const combinedScore = Math.round(
    Math.max(
      0,
      Math.min(100, (dtwScore * 0.75 + pauseAlignmentScore * 0.25) * 100)
    )
  );

  // Düz gürültü (çok düşük dinamik aralık/varyans) tespiti varsa puanı <= 35 ile sınırla
  if (isFlatNoise) {
    return Math.min(35, combinedScore);
  }

  return combinedScore;
}

/**
 * Referans ve kullanıcı süreleri arasındaki tempo uyumu.
 */
export function calculateTempoScore(
  refDuration: number,
  userDuration: number
): number {
  if (refDuration <= 0 || userDuration <= 0) return 0;
  const diff = Math.abs(refDuration - userDuration);
  const ratio = diff / Math.max(refDuration, 1);
  const score = Math.round(100 * Math.max(0, 1 - ratio));
  return Math.max(0, Math.min(100, score));
}

/**
 * Nihai Akıcılık Puanı (Telaffuz %65 + Ritim %35)
 */
export function calculateOverallFluency(
  pronunciationScore: number,
  rhythmScore: number
): number {
  return Math.round(pronunciationScore * 0.65 + rhythmScore * 0.35);
}

/**
 * Float32Array (16kHz Mono) ses verisini standart 44-byte RIFF/WAVE başlıklı 16-bit PCM .wav Blob'una dönüştürür.
 */
export function float32ToWavBlob(
  samples: Float32Array,
  sampleRate: number = 16000
): Blob {
  const numChannels = 1;
  const length = samples.length;
  const bytesPerSample = 2;
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = length * blockAlign;
  const bufferSize = 44 + dataSize;

  const arrayBuffer = new ArrayBuffer(bufferSize);
  const view = new DataView(arrayBuffer);

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeString(0, "RIFF");
  view.setUint32(4, bufferSize - 8, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true); // PCM format = 1
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true); // 16-bit
  writeString(36, "data");
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < length; i++) {
    const sample = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(
      offset,
      sample < 0 ? sample * 0x8000 : sample * 0x7fff,
      true
    );
    offset += 2;
  }

  return new Blob([arrayBuffer], { type: "audio/wav" });
}

/**
 * AudioBuffer'ı standart 16-bit PCM .wav Blob'una dönüştürür.
 */
export function audioBufferToWav(audioBuffer: AudioBuffer): Blob {
  return float32ToWavBlob(audioBuffer.getChannelData(0), audioBuffer.sampleRate);
}

/**
 * 44.1kHz / 48kHz -> 16kHz downsampling öncesinde 8kHz üzerindeki yüksek frekanslı
 * sibilantların (س، ص، ش، ث) katlanmasını (aliasing) önleyen hafif FIR alçak geçiren filtre.
 */
function applyLowPassAntiAliasingFilter(
  buffer: Float32Array,
  downsampleRatio: number
): Float32Array {
  if (downsampleRatio <= 1.05 || buffer.length < 5) {
    return buffer;
  }
  const filtered = new Float32Array(buffer.length);
  // 5-tap simetrik Hann ağırlıklı FIR alçak geçiren çekirdek: [0.1, 0.2, 0.4, 0.2, 0.1]
  const n = buffer.length;
  for (let i = 0; i < n; i++) {
    const s0 = buffer[Math.max(0, i - 2)];
    const s1 = buffer[Math.max(0, i - 1)];
    const s2 = buffer[i];
    const s3 = buffer[Math.min(n - 1, i + 1)];
    const s4 = buffer[Math.min(n - 1, i + 2)];
    filtered[i] = 0.1 * s0 + 0.2 * s1 + 0.4 * s2 + 0.2 * s3 + 0.1 * s4;
  }
  return filtered;
}

/**
 * Mobil tarayıcılarda (44100 Hz veya 48000 Hz kayıt alan AudioContext)
 * birleştirilen Float32Array ses tamponunu FIR anti-aliasing alçak geçiren filtre
 * ve lineer interpolasyon ile kesin olarak hedef frekansa (varsayılan 16000 Hz) yeniden örnekler.
 */
export function resampleFloat32Audio(
  buffer: Float32Array,
  fromSampleRate: number,
  toSampleRate: number = 16000
): Float32Array {
  if (!buffer || buffer.length === 0) return new Float32Array(0);
  if (
    !fromSampleRate ||
    fromSampleRate <= 0 ||
    fromSampleRate === toSampleRate
  ) {
    return buffer;
  }
  const ratio = fromSampleRate / toSampleRate;
  const sourceBuffer =
    ratio > 1.05 ? applyLowPassAntiAliasingFilter(buffer, ratio) : buffer;
  const newLength = Math.max(1, Math.round(sourceBuffer.length / ratio));
  const result = new Float32Array(newLength);
  for (let i = 0; i < newLength; i++) {
    const srcIndex = i * ratio;
    const idx0 = Math.floor(srcIndex);
    const idx1 = Math.min(sourceBuffer.length - 1, idx0 + 1);
    const frac = srcIndex - idx0;
    result[i] = sourceBuffer[idx0] * (1 - frac) + sourceBuffer[idx1] * frac;
  }
  return result;
}

/**
 * Kaydedilen ham Float32Array PCM ses verisini kaynak örnekleme hızından (örn. 48000 Hz veya 44100 Hz)
 * hedef örnekleme hızına (16000 Hz) anti-alias filtreli lineer interpolasyon ile dönüştürür.
 */
export function resampleAudioBuffer(
  rawPcm: Float32Array,
  fromSampleRate: number,
  toSampleRate: number = 16000
): Float32Array {
  if (!rawPcm || rawPcm.length === 0) return new Float32Array(0);
  if (!fromSampleRate || fromSampleRate <= 0 || fromSampleRate === toSampleRate) {
    return rawPcm;
  }
  return resampleFloat32Audio(rawPcm, fromSampleRate, toSampleRate);
}

/**
 * Herhangi bir AudioBuffer'ı Whisper'ın beklediği 16.000 Hz Mono Float32'ye çevirir.
 */
export async function resampleTo16kHz(
  audioBuffer: AudioBuffer
): Promise<Float32Array> {
  const targetSampleRate = 16000;
  const rawChannel = audioBuffer.getChannelData(0);
  if (audioBuffer.sampleRate === targetSampleRate) {
    return new Float32Array(rawChannel);
  }

  try {
    const offlineCtx = new OfflineAudioContext(
      1,
      Math.max(1, Math.ceil(audioBuffer.duration * targetSampleRate)),
      targetSampleRate
    );
    const source = offlineCtx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(offlineCtx.destination);
    source.start(0);

    const resampled = await offlineCtx.startRendering();
    return new Float32Array(resampled.getChannelData(0));
  } catch {
    return resampleFloat32Audio(
      rawChannel,
      audioBuffer.sampleRate,
      targetSampleRate
    );
  }
}

/**
 * Mobil mikrofonlarda düşük kazançlı (kısık) kayıtların Whisper tarafından net anlaşılması için
 * tepe genliğini (peak amplitude) kontrol eder; maxAbs > 0.005 ve maxAbs < 0.75 ise (0.85 / maxAbs) ile güçlendirir.
 */
export function normalizeAudioPeak(
  samples: Float32Array,
  targetPeak: number = 0.85
): Float32Array {
  if (!samples || samples.length === 0) return new Float32Array(0);
  let maxAbs = 0;
  for (let i = 0; i < samples.length; i++) {
    const v = Math.abs(samples[i]);
    if (v > maxAbs) maxAbs = v;
  }
  if (maxAbs < 0.002) return samples;
  if (maxAbs > 0.005 && maxAbs < 0.75) {
    const scale = 0.85 / maxAbs;
    const out = new Float32Array(samples.length);
    for (let i = 0; i < samples.length; i++) {
      out[i] = Math.max(-1, Math.min(1, samples[i] * scale));
    }
    return out;
  }
  const gain = targetPeak / maxAbs;
  const out = new Float32Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    out[i] = Math.max(-1, Math.min(1, samples[i] * gain));
  }
  return out;
}

export function normalizeAudioBuffer(
  buffer: Float32Array,
  targetPeak: number = 0.85
): Float32Array {
  return normalizeAudioPeak(buffer, targetPeak);
}

/**
 * Sesteki baş ve sondaki sessizlik kısımlarını kırpar (VAD - Voice Activity Detection)
 * ve tepe genliğini 0.90 seviyesine normalize eder.
 */
export function trimSilence(
  float32Data: Float32Array,
  threshold: number = 0.012
): Float32Array {
  if (!float32Data || float32Data.length === 0) {
    return new Float32Array(0);
  }

  let maxAbs = 0;
  for (let i = 0; i < float32Data.length; i++) {
    const v = Math.abs(float32Data[i]);
    if (v > maxAbs) maxAbs = v;
  }

  // Tamamen sessiz kayıt
  if (maxAbs < 0.003) {
    return new Float32Array(0);
  }

  // Düşük mikrofon kazançlarında bile konuşma başlangıcını yakalayan adaptif eşik
  const effectiveThreshold = Math.min(threshold, Math.max(0.0035, maxAbs * 0.12));
  let start = -1;
  let end = -1;

  for (let i = 0; i < float32Data.length; i++) {
    if (Math.abs(float32Data[i]) > effectiveThreshold) {
      start = Math.max(0, i - 1000); // ~62ms ön pay
      break;
    }
  }
  for (let i = float32Data.length - 1; i >= 0; i--) {
    if (Math.abs(float32Data[i]) > effectiveThreshold) {
      end = Math.min(float32Data.length - 1, i + 1400); // ~87ms arka pay
      break;
    }
  }

  // Eğer hiçbir örnek sessizlik eşiğini geçmediyse boş dizi döndür
  if (start === -1 || end === -1 || end <= start) {
    return new Float32Array(0);
  }

  const sliced = float32Data.slice(start, end + 1);
  return normalizeAudioPeak(sliced, 0.9);
}

/**
 * Ses zarfı (envelopeBars) içindeki aktif hece tepe noktalarını (syllablePeaks) sayar.
 */
export function countSyllablePeaks(bars: number[]): number {
  if (!bars || bars.length === 0) return 0;
  let peaks = 0;
  let activeBars = 0;
  for (let i = 0; i < bars.length; i++) {
    const val = bars[i];
    if (val >= 0.15) {
      activeBars++;
    }
    const prev = i > 0 ? bars[i - 1] : 0;
    const next = i < bars.length - 1 ? bars[i + 1] : 0;
    if (val >= 0.18 && val >= prev && val > next) {
      peaks++;
    }
  }
  if (peaks === 0 && activeBars >= 2) {
    return Math.max(1, Math.round(activeBars / 4));
  }
  return peaks;
}

/**
 * Arapça metindeki fonolojik hece sayısını (kısa ünlüler: fetha/damme/kesra, tenvin,
 * med uzatma harfleri: ا/و/ي ve şedde ikiz ünsüz ağırlığı) gerçek dilbilimsel kurallarla hesaplar.
 */
export function estimateArabicSyllables(sentence: string): number {
  const words = sentence
    .replace(/[.,!?؟،؛:"'«»()[\]\d-]/g, " ")
    .trim()
    .split(/\s+/)
    .filter((w) => /[\u0600-\u06FF]/.test(w));

  if (words.length === 0) return 1;

  let totalSyllables = 0;

  for (const word of words) {
    // Kısa ünlüler (\u064E, \u064F, \u0650), tenvin (\u064B, \u064C, \u064D) ve asgari elif (\u0670)
    const shortVowelMatches = word.match(/[\u064E\u064F\u0650\u064B\u064C\u064D\u0670]/g);
    const shortVowelCount = shortVowelMatches ? shortVowelMatches.length : 0;

    // Şedde (\u0651) ikiz ünsüz oluşturarak kapalı hece ağırlığı ekler
    const shaddaMatches = word.match(/\u0651/g);
    const shaddaCount = shaddaMatches ? shaddaMatches.length : 0;

    if (shortVowelCount > 0) {
      // Harekeli kelimede her ünlü çekirdeği 1 hecedir; kelime sonu vakıf (duruş) nedeniyle en az 1 hece korunur
      const wordSyl = Math.max(
        1,
        shortVowelCount + Math.floor(shaddaCount * 0.5)
      );
      totalSyllables += wordSyl;
    } else {
      // Harekesiz kelimede ünsüz iskeleti ve med harflerinden (ا، آ، و، ي، ى) fonolojik tahmin
      const bare = word.replace(/[^\u0621-\u063A\u0641-\u064A\u0671]/g, "");
      const maddMatches = bare.slice(1).match(/[اآىوي]/g);
      const maddCount = maddMatches ? maddMatches.length : 0;
      const remainingConsonants = Math.max(0, bare.length - maddCount);
      const estimatedWordSyl = Math.max(
        1,
        maddCount + Math.round(remainingConsonants * 0.5) + Math.floor(shaddaCount * 0.5)
      );
      totalSyllables += estimatedWordSyl;
    }
  }

  return Math.max(words.length, totalSyllables);
}

/**
 * Ses-metin (STT) motoru yanıt vermediğinde uydurma %58+ telaffuz puanı ÜRETMEZ.
 * Ritim ve süre uyumunu ayrı yardımcı metrik olarak hesaplar, ancak metin çözümlenemediğinde
 * isTextRecognized: false, isEvaluated: false, confidence: "unverified" ve score: null döndürür.
 */
export function evaluateAcousticDspSentence(
  expectedSentence: string,
  userBars: number[],
  refBars: number[],
  userDuration: number,
  refDuration: number,
  recognizedText?: string
): SentenceEvaluationResult {
  const cleanWords = expectedSentence
    .replace(/[.,!?؟،؛:"'«»()[\]-]/g, " ")
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 0);

  if (cleanWords.length === 0) {
    return {
      isTextRecognized: false,
      isEvaluated: false,
      isAcousticFallback: false,
      confidence: "unverified",
      score: null,
      words: [],
      overallScore: 0,
      rhythmScore: undefined,
      isRootGuardTriggered: false,
    };
  }

  const hasRealReference =
    Array.isArray(refBars) &&
    refBars.length > 0 &&
    refBars.some((b) => b > 0.09);

  const safeRefDur =
    refDuration > 0.3
      ? refDuration
      : Math.max(1.2, cleanWords.length * 0.65 + 0.4);
  const overallRhythm = hasRealReference
    ? calculateRhythmMatch(refBars, userBars)
    : 0;
  const overallTempo = calculateTempoScore(safeRefDur, userDuration);
  const syllablePeaks = countSyllablePeaks(userBars);
  const expectedSyllables = estimateArabicSyllables(expectedSentence);

  const syllableRatio =
    Math.min(syllablePeaks, expectedSyllables) /
    Math.max(syllablePeaks, expectedSyllables, 1);
  const syllableHarmonyScore =
    syllablePeaks > 0 ? Math.round(Math.min(100, syllableRatio * 100)) : 0;

  const calculatedRhythmScore = hasRealReference
    ? Math.max(
        0,
        Math.min(
          100,
          Math.round(
            overallRhythm * 0.55 +
              overallTempo * 0.3 +
              syllableHarmonyScore * 0.15
          )
        )
      )
    : undefined;

  // Eğer konuşma tanıma motorundan metin alınamadıysa (recognizedText boşsa):
  // Asla uydurma %58 taban telaffuz puanı verme!
  if (!recognizedText || recognizedText.trim().length === 0) {
    return {
      isTextRecognized: false,
      isEvaluated: false,
      isAcousticFallback: false,
      confidence: "unverified",
      score: null,
      overallScore: 0,
      rhythmScore: calculatedRhythmScore,
      tempoScore: overallTempo,
      fluencyScore: undefined,
      syllablePeaks,
      expectedSyllables,
      words: [],
      isRootGuardTriggered: false,
      message:
        "Ses kaydı alındı ve ritim karşılaştırıldı. Kelimeler güvenilir biçimde çözümlenemediği için telaffuz doğruluğu puanlanamadı.",
    };
  }

  const evalRes = evaluateSentenceWords(expectedSentence, recognizedText, {
    userDurationSec: userDuration,
    refDurationSec: safeRefDur,
  });
  return {
    ...evalRes,
    isTextRecognized: true,
    isEvaluated: true,
    isAcousticFallback: false,
    score: evalRes.overallScore,
    rhythmScore: calculatedRhythmScore,
    tempoScore: overallTempo,
    syllablePeaks,
    expectedSyllables,
  };
}

/**
 * Doğrudan AudioContext({ sampleRate: 16000 }) üzerinden 16kHz Mono Float32Array ses kaydı,
 * mobil uyumlu MediaRecorder (webm/mp4/ogg) kaydı, canlı RMS zarfı ve otomatik sessizlik algılama başlatır.
 */
export async function start16kHzRecorder(options?: {
  stream?: MediaStream;
  onLiveRms?: (rms: number, rmsHistory: number[]) => void;
  onAutoSilenceStop?: () => void;
  silenceDurationMs?: number;
  maxDurationMs?: number;
  micNoiseSuppression?: boolean;
}): Promise<RecordingSession16kHz> {
  const useNoiseFilter = Boolean(options?.micNoiseSuppression);
  let stream: MediaStream;
  if (options?.stream) {
    stream = options.stream;
  } else {
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: Boolean(useNoiseFilter),
          noiseSuppression: Boolean(useNoiseFilter),
          autoGainControl: true,
        },
      });
    } catch {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    }
  }

  let mediaRecorder: MediaRecorder | null = null;
  const mediaChunks: BlobPart[] = [];
  const supportedMimeType = getSupportedAudioMimeType();
  let audioCtx: AudioContext;
  let source: MediaStreamAudioSourceNode;
  let analyser: AnalyserNode;
  let processor: ScriptProcessorNode;
  let silentGain: GainNode;

  try {
    if (typeof MediaRecorder !== "undefined") {
      try {
        mediaRecorder = supportedMimeType
          ? new MediaRecorder(stream, { mimeType: supportedMimeType })
          : new MediaRecorder(stream);
        mediaRecorder.ondataavailable = (e: BlobEvent) => {
          if (e.data && e.data.size > 0) {
            mediaChunks.push(e.data);
          }
        };
        mediaRecorder.start(200);
      } catch {
        mediaRecorder = null;
      }
    }

    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    audioCtx = new AudioCtx();
    if (audioCtx.state === "suspended") {
      await audioCtx.resume().catch(() => {});
    }

    source = audioCtx.createMediaStreamSource(stream);
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 256;
    processor = audioCtx.createScriptProcessor(2048, 1, 1);
    silentGain = audioCtx.createGain();
    silentGain.gain.value = 0;
  } catch (setupError) {
    try {
      if (mediaRecorder && mediaRecorder.state !== "inactive") {
        mediaRecorder.stop();
      }
    } catch {
      // ignore
    }
    try {
      stream.getTracks().forEach((t) => t.stop());
    } catch {
      // ignore
    }
    throw setupError;
  }

  const chunks: Float32Array[] = [];
  const rawRmsValues: number[] = [];
  const rmsHistory: number[] = [];
  let currentRms = 0;
  let peakRawRms = 0;
  let hasSpoken = false;
  let firstSpeechAt = 0;
  let lastSpeechAt = Date.now();
  let stopped = false;
  let autoStopTriggered = false;
  const startedAt = Date.now();
  const silenceLimitMs = options?.silenceDurationMs ?? 2500;
  const maxDurationLimitMs = options?.maxDurationMs ?? 15000;

  let maxDurationTimer: ReturnType<typeof setTimeout> | null = setTimeout(() => {
    if (!autoStopTriggered && !stopped) {
      autoStopTriggered = true;
      killStreamImmediately();
      options?.onAutoSilenceStop?.();
    }
  }, maxDurationLimitMs);

  const clearMaxDurationTimer = () => {
    if (maxDurationTimer !== null) {
      clearTimeout(maxDurationTimer);
      maxDurationTimer = null;
    }
  };

  const killStreamImmediately = () => {
    stopped = true;
    clearMaxDurationTimer();
    try {
      if (mediaRecorder && mediaRecorder.state !== "inactive") {
        mediaRecorder.stop();
      }
    } catch {
      // ignore
    }
    try {
      silentGain.disconnect();
      processor.disconnect();
      analyser.disconnect();
      source.disconnect();
    } catch {
      // ignore
    }
    try {
      stream.getTracks().forEach((t) => t.stop());
    } catch {
      // ignore
    }
  };

  processor.onaudioprocess = (event: AudioProcessingEvent) => {
    // Çıkış kanalını sessizlikle (0) doldur ki hiçbir tarayıcıda yankı/uğultu oluşmasın
    const output = event.outputBuffer.getChannelData(0);
    for (let i = 0; i < output.length; i++) {
      output[i] = 0;
    }

    if (stopped) return;
    const input = event.inputBuffer.getChannelData(0);
    const copy = new Float32Array(input.length);
    copy.set(input);
    chunks.push(copy);

    let sumSq = 0;
    for (let i = 0; i < copy.length; i++) {
      sumSq += copy[i] * copy[i];
    }
    const rms = Math.sqrt(sumSq / copy.length);
    rawRmsValues.push(rms);
    if (rms > peakRawRms) peakRawRms = rms;

    currentRms = Math.min(1, rms * 6);
    rmsHistory.push(currentRms);

    options?.onLiveRms?.(currentRms, rmsHistory.slice(-48));

    const now = Date.now();
    // 1. VAD: Konuşma başladıktan sonra silenceLimitMs (varsayılan 2500ms) sessizlik olursa otomatik durdur
    if (rms > 0.015) {
      if (!hasSpoken) {
        hasSpoken = true;
        firstSpeechAt = now;
      }
      lastSpeechAt = now;
    } else if (
      hasSpoken &&
      now - firstSpeechAt >= 350 &&
      now - lastSpeechAt >= silenceLimitMs
    ) {
      if (!autoStopTriggered) {
        autoStopTriggered = true;
        killStreamImmediately();
        options?.onAutoSilenceStop?.();
      }
    }

    // 2. Gürültülü ortamdan bağımsız üst süre sınırı kontrolü (if/else zincirinin dışında!)
    if (!autoStopTriggered && now - startedAt >= maxDurationLimitMs) {
      autoStopTriggered = true;
      killStreamImmediately();
      options?.onAutoSilenceStop?.();
    }
  };

  source.connect(analyser);
  analyser.connect(processor);
  processor.connect(silentGain);
  silentGain.connect(audioCtx.destination);

  return {
    killStreamImmediately,
    getLiveRms: () => currentRms,
    getStream: () => stream,
    getAudioContext: () => audioCtx,
    stop: async () => {
      stopped = true;
      clearMaxDurationTimer();

      // MediaRecorder varsa son chunk'ın gelmesini bekle
      if (mediaRecorder && mediaRecorder.state !== "inactive") {
        await new Promise<void>((resolve) => {
          const recorder = mediaRecorder!;
          const timer = setTimeout(resolve, 250);
          recorder.onstop = () => {
            clearTimeout(timer);
            resolve();
          };
          try {
            recorder.stop();
          } catch {
            clearTimeout(timer);
            resolve();
          }
        });
      }

      killStreamImmediately();

      const totalLength = chunks.reduce((acc, c) => acc + c.length, 0);
      const merged = new Float32Array(totalLength);
      let offset = 0;
      for (const chunk of chunks) {
        merged.set(chunk, offset);
        offset += chunk.length;
      }

      const actualMimeType =
        mediaRecorder?.mimeType || supportedMimeType || "audio/wav";
      const nativeMediaBlob =
        mediaChunks.length > 0
          ? new Blob(mediaChunks, { type: actualMimeType })
          : null;

      // Mobil ve masaüstü donanımda doğal örnekleme hızını (48000 Hz veya 44100 Hz) tespit et
      const elapsedWallClockSec = Math.max(
        0.25,
        (Date.now() - startedAt) / 1000
      );
      const reportedSampleRate = audioCtx.sampleRate || 48000;
      const empiricalSampleRate =
        elapsedWallClockSec > 0.35 && merged.length > 0
          ? merged.length / elapsedWallClockSec
          : reportedSampleRate;

      const actualSampleRate =
        reportedSampleRate !== 16000 &&
        Math.abs(empiricalSampleRate - reportedSampleRate) /
          reportedSampleRate <
          0.3
          ? reportedSampleRate
          : empiricalSampleRate > 46000
          ? 48000
          : empiricalSampleRate > 42000
          ? 44100
          : empiricalSampleRate > 22000
          ? Math.round(empiricalSampleRate)
          : reportedSampleRate;

      let samples16kHz: Float32Array =
        actualSampleRate !== 16000 && merged.length > 0
          ? resampleAudioBuffer(merged, actualSampleRate, 16000)
          : merged;

      // iOS Safari / Android'de ScriptProcessor bazen sessiz kalabilir; nativeMediaBlob varsa oradan decode et
      if (
        (samples16kHz.length === 0 || peakRawRms < 0.003) &&
        nativeMediaBlob &&
        nativeMediaBlob.size > 256
      ) {
        try {
          const ab = await nativeMediaBlob.arrayBuffer();
          const decoded = await audioCtx.decodeAudioData(ab);
          const decodedCh0 = decoded.getChannelData(0);
          let decodedRate = decoded.sampleRate || actualSampleRate || 48000;
          if (
            decodedRate === 16000 &&
            elapsedWallClockSec > 0.35 &&
            decodedCh0.length / elapsedWallClockSec > 22000
          ) {
            decodedRate =
              decodedCh0.length / elapsedWallClockSec > 46000 ? 48000 : 44100;
          }
          samples16kHz =
            decodedRate !== 16000
              ? resampleAudioBuffer(decodedCh0, decodedRate, 16000)
              : new Float32Array(decodedCh0);
          let sumSq = 0;
          let maxAbs = 0;
          for (let i = 0; i < samples16kHz.length; i++) {
            const v = samples16kHz[i];
            sumSq += v * v;
            if (Math.abs(v) > maxAbs) maxAbs = Math.abs(v);
          }
          const decodedRms = Math.sqrt(
            sumSq / Math.max(1, samples16kHz.length)
          );
          if (decodedRms > peakRawRms) peakRawRms = decodedRms;
          if (maxAbs > 0.02) hasSpoken = true;
        } catch {
          // ignore decode fallback error
        }
      }

      // Telefondaki kısık seslerin Whisper tarafından net anlaşılması için Tepe Genliği Normalizasyonu (Peak Normalization)
      if (samples16kHz.length > 0) {
        samples16kHz = normalizeAudioPeak(samples16kHz, 0.85);
      }

      await audioCtx.close().catch(() => {});

      const rawDuration =
        merged.length > 0 && actualSampleRate > 0
          ? merged.length / actualSampleRate
          : samples16kHz.length > 0
          ? samples16kHz.length / 16000
          : elapsedWallClockSec;

      const trimmedSamples = trimSilence(samples16kHz, 0.01);
      const voicedDuration =
        trimmedSamples.length > 0
          ? Math.min(rawDuration, trimmedSamples.length / 16000)
          : rawDuration;
      const avgRms =
        rawRmsValues.length > 0
          ? rawRmsValues.reduce((a, b) => a + b, 0) / rawRmsValues.length
          : 0;

      const env =
        trimmedSamples.length >= 1600
          ? extractFloat32Envelope(trimmedSamples, 16000, 48)
          : { bars: Array(48).fill(0.05), duration: 0 };

      const syllablePeaks = countSyllablePeaks(env.bars);

      const isSilent =
        rawDuration < 0.3 ||
        (voicedDuration < 0.12 && syllablePeaks === 0) ||
        (peakRawRms < 0.005 && !hasSpoken && syllablePeaks === 0);

      const finalSamplesForWav =
        trimmedSamples.length > 0 ? trimmedSamples : samples16kHz;
      const wavBlob = float32ToWavBlob(finalSamplesForWav, 16000);
      const wavUrl = URL.createObjectURL(wavBlob);

      // Mobil (iOS Safari & Android) uyumluluğu için MediaRecorder Blob'u varsa oynatmada onu tercih et
      const playbackBlob =
        nativeMediaBlob && nativeMediaBlob.size > 256
          ? nativeMediaBlob
          : wavBlob;
      const playbackUrl =
        playbackBlob === wavBlob ? wavUrl : URL.createObjectURL(playbackBlob);

      return {
        samples16kHz,
        trimmedSamples,
        actualSampleRate,
        syllablePeaks,
        wavBlob,
        wavUrl,
        playbackBlob,
        playbackUrl,
        mimeType: playbackBlob.type || "audio/wav",
        duration: voicedDuration > 0 ? voicedDuration : rawDuration,
        rawDuration,
        voicedDuration,
        peakRms: peakRawRms,
        avgRms,
        isSilent,
        rmsHistory,
        envelopeBars: env.bars,
      };
    },
  };
}