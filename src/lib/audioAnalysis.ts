// src/lib/audioAnalysis.ts
// Web Audio API (16kHz Kayıt, Canlı RMS, VAD, Çift Dalga Formu Ritim Korelasyonu ve 16-bit PCM .wav Üretimi)

export interface RecordingSession16kHz {
  killStreamImmediately: () => void;
  stop: () => Promise<{
    samples16kHz: Float32Array;
    trimmedSamples: Float32Array;
    wavBlob: Blob;
    wavUrl: string;
    duration: number;
    rmsHistory: number[];
    envelopeBars: number[];
  }>;
  getLiveRms: () => number;
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
 * İki zarf dizisi arasındaki Kosinüs Benzerliği (Ritim Korelasyonu: 0 - 100).
 */
export function calculateRhythmMatch(
  refBars: number[],
  userBars: number[]
): number {
  if (refBars.length !== userBars.length || refBars.length === 0) return 0;

  let dotProduct = 0;
  let refNorm = 0;
  let userNorm = 0;

  for (let i = 0; i < refBars.length; i++) {
    dotProduct += refBars[i] * userBars[i];
    refNorm += refBars[i] * refBars[i];
    userNorm += userBars[i] * userBars[i];
  }

  const denom = Math.sqrt(refNorm) * Math.sqrt(userNorm);
  if (denom < 1e-6) return 0;

  const correlation = dotProduct / denom;
  return Math.round(Math.max(0, Math.min(100, correlation * 100)));
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
 * Herhangi bir AudioBuffer'ı Whisper'ın beklediği 16.000 Hz Mono Float32'ye çevirir.
 */
export async function resampleTo16kHz(
  audioBuffer: AudioBuffer
): Promise<Float32Array> {
  const targetSampleRate = 16000;
  if (audioBuffer.sampleRate === targetSampleRate) {
    return new Float32Array(audioBuffer.getChannelData(0));
  }

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
}

/**
 * Sesteki baş ve sondaki sessizlik kısımlarını kırpar (VAD - Voice Activity Detection).
 */
export function trimSilence(
  float32Data: Float32Array,
  threshold: number = 0.012
): Float32Array {
  let start = 0;
  let end = float32Data.length - 1;

  for (let i = 0; i < float32Data.length; i++) {
    if (Math.abs(float32Data[i]) > threshold) {
      start = Math.max(0, i - 800); // 50ms ön pay
      break;
    }
  }
  for (let i = float32Data.length - 1; i >= 0; i--) {
    if (Math.abs(float32Data[i]) > threshold) {
      end = Math.min(float32Data.length - 1, i + 1200); // 75ms arka pay
      break;
    }
  }

  // En az 0.15 saniyelik (2400 örnek) bir kesit olsun
  if (end - start < 2400) return float32Data;
  return float32Data.slice(start, end + 1);
}

/**
 * Doğrudan AudioContext({ sampleRate: 16000 }) üzerinden 16kHz Mono Float32Array ses kaydı,
 * canlı RMS zarfı (rmsHistory) ve otomatik sessizlik algılama (autoStopOnSilence) başlatır.
 */
export async function start16kHzRecorder(options?: {
  onLiveRms?: (rms: number, rmsHistory: number[]) => void;
  onAutoSilenceStop?: () => void;
  silenceDurationMs?: number;
  maxDurationMs?: number;
}): Promise<RecordingSession16kHz> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      channelCount: 1,
      sampleRate: 16000,
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
  });

  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext })
      .webkitAudioContext;
  let audioCtx: AudioContext;
  try {
    audioCtx = new AudioCtx({ sampleRate: 16000 });
  } catch {
    audioCtx = new AudioCtx();
  }
  const source = audioCtx.createMediaStreamSource(stream);
  const processor = audioCtx.createScriptProcessor(2048, 1, 1);

  const chunks: Float32Array[] = [];
  const rmsHistory: number[] = [];
  let currentRms = 0;
  let hasSpoken = false;
  let firstSpeechAt = 0;
  let lastSpeechAt = Date.now();
  let stopped = false;
  let autoStopTriggered = false;
  const startedAt = Date.now();
  const silenceLimitMs = options?.silenceDurationMs ?? 1000;
  const maxDurationLimitMs = options?.maxDurationMs ?? 10000;

  const killStreamImmediately = () => {
    stopped = true;
    try {
      processor.disconnect();
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
    currentRms = Math.min(1, rms * 4.5);
    rmsHistory.push(currentRms);

    options?.onLiveRms?.(currentRms, rmsHistory.slice(-48));

    const now = Date.now();
    // VAD: Konuşma başladıktan sonra silenceLimitMs (1000ms) sessizlik olursa otomatik durdur
    if (rms > 0.015) {
      if (!hasSpoken) {
        hasSpoken = true;
        firstSpeechAt = now;
      }
      lastSpeechAt = now;
    } else if (
      hasSpoken &&
      now - firstSpeechAt >= 300 &&
      now - lastSpeechAt >= silenceLimitMs
    ) {
      if (!autoStopTriggered) {
        autoStopTriggered = true;
        killStreamImmediately();
        options?.onAutoSilenceStop?.();
      }
    } else if (now - startedAt >= maxDurationLimitMs) {
      if (!autoStopTriggered) {
        autoStopTriggered = true;
        killStreamImmediately();
        options?.onAutoSilenceStop?.();
      }
    }
  };

  source.connect(processor);
  processor.connect(audioCtx.destination);

  return {
    killStreamImmediately,
    getLiveRms: () => currentRms,
    stop: async () => {
      killStreamImmediately();

      const totalLength = chunks.reduce((acc, c) => acc + c.length, 0);
      const merged = new Float32Array(totalLength);
      let offset = 0;
      for (const chunk of chunks) {
        merged.set(chunk, offset);
        offset += chunk.length;
      }

      // Cihaz 16000 Hz desteklemediyse (ör. 48000 Hz açtıysa) 16000 Hz'e resample et
      let samples16kHz: Float32Array = merged;
      if (audioCtx.sampleRate !== 16000 && merged.length > 0) {
        try {
          const tempBuf = audioCtx.createBuffer(
            1,
            merged.length,
            audioCtx.sampleRate
          );
          tempBuf.getChannelData(0).set(merged);
          samples16kHz = await resampleTo16kHz(tempBuf);
        } catch {
          samples16kHz = merged;
        }
      }

      await audioCtx.close().catch(() => {});

      const trimmedSamples = trimSilence(samples16kHz, 0.012);
      const wavBlob = float32ToWavBlob(trimmedSamples, 16000);
      const wavUrl = URL.createObjectURL(wavBlob);
      const env = extractFloat32Envelope(trimmedSamples, 16000, 48);

      return {
        samples16kHz,
        trimmedSamples,
        wavBlob,
        wavUrl,
        duration: trimmedSamples.length / 16000,
        rmsHistory,
        envelopeBars: env.bars,
      };
    },
  };
}