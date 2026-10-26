// src/lib/audioAnalysis.ts

/**
 * Verilen AudioBuffer'dan RMS (Kök Ortalama Kare) tabanlı zarf çıkarır.
 * Python'daki extract_audio_envelope fonksiyonunun JS karşılığıdır.
 */
export function extractAudioEnvelope(audioBuffer: AudioBuffer, numBars: number = 48): { bars: number[], duration: number } {
  const channelData = audioBuffer.getChannelData(0); // Mono kanal
  const samplesPerBar = Math.floor(channelData.length / numBars);
  const bars: number[] = [];

  for (let i = 0; i < numBars; i++) {
    const start = i * samplesPerBar;
    const end = Math.min(start + samplesPerBar, channelData.length);
    let sumSquares = 0;
    for (let j = start; j < end; j++) {
      sumSquares += channelData[j] * channelData[j];
    }
    const rms = Math.sqrt(sumSquares / (end - start));
    bars.push(rms);
  }

  // 0-1 aralığına normalize et
  const maxVal = Math.max(...bars, 0.0001);
  const normalizedBars = bars.map(b => b / maxVal);

  return { bars: normalizedBars, duration: audioBuffer.duration };
}

/**
 * İki zarf dizisi arasındaki Kosinüs Benzerliği (Ritim Korelasyonu).
 * Python: np.dot(ref, usr) / (np.linalg.norm(ref) * np.linalg.norm(usr))
 */
export function calculateRhythmMatch(refBars: number[], userBars: number[]): number {
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
export function calculateTempoScore(refDuration: number, userDuration: number): number {
  if (refDuration <= 0 || userDuration <= 0) return 0;
  const diff = Math.abs(refDuration - userDuration);
  const ratio = diff / Math.max(refDuration, 1);
  const score = Math.round(100 * Math.max(0, 1 - ratio));
  return Math.max(0, Math.min(100, score));
}

/**
 * Nihai Akıcılık Puanı (Telaffuz %65 + Ritim %35)
 */
export function calculateOverallFluency(pronunciationScore: number, rhythmScore: number): number {
  return Math.round((pronunciationScore * 0.65) + (rhythmScore * 0.35));
}

/**
 * AudioBuffer'ı standart 16-bit PCM .wav Blob'una dönüştürür.
 */
export function audioBufferToWav(audioBuffer: AudioBuffer): Blob {
  const numChannels = audioBuffer.numberOfChannels;
  const sampleRate = audioBuffer.sampleRate;
  const length = audioBuffer.length;
  const bytesPerSample = 2;
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = length * blockAlign;
  const bufferSize = 44 + dataSize;

  const arrayBuffer = new ArrayBuffer(bufferSize);
  const view = new DataView(arrayBuffer);

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };

  writeString(0, 'RIFF');
  view.setUint32(4, bufferSize - 8, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, dataSize, true);

  const channelData = audioBuffer.getChannelData(0);
  let offset = 44;
  for (let i = 0; i < length; i++) {
    const sample = Math.max(-1, Math.min(1, channelData[i]));
    view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
    offset += 2;
  }

  return new Blob([arrayBuffer], { type: 'audio/wav' });
}

/**
 * Herhangi bir AudioBuffer'ı Whisper'ın beklediği 16.000 Hz Mono Float32'ye çevirir.
 */
export async function resampleTo16kHz(audioBuffer: AudioBuffer): Promise<Float32Array> {
  const targetSampleRate = 16000;
  if (audioBuffer.sampleRate === targetSampleRate) {
    return audioBuffer.getChannelData(0);
  }

  const offlineCtx = new OfflineAudioContext(1, Math.ceil(audioBuffer.duration * targetSampleRate), targetSampleRate);
  const source = offlineCtx.createBufferSource();
  source.buffer = audioBuffer;
  source.connect(offlineCtx.destination);
  source.start(0);

  const resampled = await offlineCtx.startRendering();
  return resampled.getChannelData(0);
}

/**
 * Sesteki baş ve sondaki sessizlik kısımlarını kırpar (VAD).
 */
export function trimSilence(float32Data: Float32Array, threshold: number = 0.01): Float32Array {
  let start = 0;
  let end = float32Data.length - 1;

  for (let i = 0; i < float32Data.length; i++) {
    if (Math.abs(float32Data[i]) > threshold) { start = i; break; }
  }
  for (let i = float32Data.length - 1; i >= 0; i--) {
    if (Math.abs(float32Data[i]) > threshold) { end = i; break; }
  }

  // En az 0.1 saniyelik bir kesit olsun
  if (end - start < 1600) return float32Data;
  return float32Data.slice(start, end + 1);
}