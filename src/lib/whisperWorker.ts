// src/lib/whisperWorker.ts
// Web Worker içinde çalışan Çevrimdışı Yapay Zeka (Whisper) STT Motoru
// Varsa WebGPU, yoksa veya hata verirse anında WASM (q8 kuantize) ile ana iş parçacığını (Main Thread) dondurmadan çalışır.

import { pipeline, env } from "@huggingface/transformers";

env.allowLocalModels = false;
env.useBrowserCache = true;

export interface WhisperWorkerRequest {
  type: "transcribe" | "preload";
  audioData?: Float32Array;
  language?: string;
}

export interface WhisperWorkerResponse {
  status: "loading" | "progress" | "ready" | "transcribing" | "completed" | "error";
  data?: {
    progress?: number;
    file?: string;
    status?: string;
  };
  text?: string;
  device?: "webgpu" | "wasm";
  error?: string;
}

let transcriber: any = null;
let activeDevice: "webgpu" | "wasm" = "wasm";
let activeModelId: string = "onnx-community/whisper-base";

const MODEL_CANDIDATES = [
  "onnx-community/whisper-base",
  "Xenova/whisper-base",
  "Xenova/whisper-tiny",
];

/**
 * Gerçekten kullanılabilir bir WebGPU adaptörü ve cihazı olup olmadığını kontrol eder.
 * Firefox gibi WebGPU'nun deneysel/kısmi olduğu veya adaptör döndürmediği ortamlarda güvenli şekilde false döner.
 */
async function hasUsableWebGPU(): Promise<boolean> {
  try {
    if (typeof navigator === "undefined" || !("gpu" in navigator) || !(navigator as any).gpu) {
      return false;
    }
    // Firefox'ta WebGPU ONNX shader derlemesi çökebildiği için doğrudan kararlı WASM q8 tercih edilir
    if (typeof navigator.userAgent === "string" && /firefox/i.test(navigator.userAgent)) {
      return false;
    }
    const adapter = await (navigator as any).gpu.requestAdapter();
    if (!adapter) return false;
    if (typeof adapter.requestDevice === "function") {
      const device = await adapter.requestDevice();
      if (!device) return false;
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * 16kHz Float32Array PCM ses dizisinin başındaki ve sonundaki sessizlikleri kırpar (trim silence)
 * ve tepe genliğini (peak normalization) 0.95 seviyesine normalize eder.
 */
function preprocessAudioForWhisper(samples: Float32Array): Float32Array {
  if (!samples || samples.length === 0) {
    return new Float32Array(0);
  }

  let maxAbs = 0;
  for (let i = 0; i < samples.length; i++) {
    const v = Math.abs(samples[i]);
    if (v > maxAbs) maxAbs = v;
  }

  // Tamamen sessiz kayıt
  if (maxAbs < 0.0025) {
    return new Float32Array(0);
  }

  // Adaptif sessizlik eşiği: düşük mikrofon kazançlarında bile konuşma başlangıcını yakalar
  const threshold = Math.min(0.015, Math.max(0.0035, maxAbs * 0.1));
  let start = -1;
  let end = -1;

  for (let i = 0; i < samples.length; i++) {
    if (Math.abs(samples[i]) > threshold) {
      start = Math.max(0, i - 1200); // ~75ms ön pay
      break;
    }
  }

  for (let i = samples.length - 1; i >= 0; i--) {
    if (Math.abs(samples[i]) > threshold) {
      end = Math.min(samples.length - 1, i + 1600); // ~100ms arka pay
      break;
    }
  }

  const trimmed =
    start !== -1 && end !== -1 && end > start
      ? samples.slice(start, end + 1)
      : samples.slice();

  // Tepe genliğini (Peak Normalization) 0.95 seviyesine normalize et
  let trimmedPeak = 0;
  for (let i = 0; i < trimmed.length; i++) {
    const v = Math.abs(trimmed[i]);
    if (v > trimmedPeak) trimmedPeak = v;
  }

  if (trimmedPeak > 0.002) {
    const gain = 0.95 / trimmedPeak;
    const normalized = new Float32Array(trimmed.length);
    for (let i = 0; i < trimmed.length; i++) {
      normalized[i] = Math.max(-1, Math.min(1, trimmed[i] * gain));
    }
    return normalized;
  }

  return trimmed;
}

async function createPipelineWithDevice(device: "webgpu" | "wasm"): Promise<any> {
  let lastErr: unknown = null;
  for (const modelId of MODEL_CANDIDATES) {
    try {
      const pipe = await pipeline("automatic-speech-recognition", modelId, {
        device,
        dtype: "q8",
        progress_callback: (progress: any) => {
          self.postMessage({
            status: "progress",
            data: progress,
            device,
          } satisfies WhisperWorkerResponse);
        },
      });
      activeDevice = device;
      activeModelId = modelId;
      return pipe;
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new Error(`Whisper modeli (${device}) yüklenemedi.`);
}

async function getTranscriber(forceWasm: boolean = false) {
  if (transcriber && (!forceWasm || activeDevice === "wasm")) {
    return transcriber;
  }

  transcriber = null;
  const canUseGpu = !forceWasm && (await hasUsableWebGPU());

  if (canUseGpu) {
    try {
      transcriber = await createPipelineWithDevice("webgpu");
      return transcriber;
    } catch {
      // WebGPU pipeline oluşturulamazsa anında WASM q8'e geç
      transcriber = null;
    }
  }

  activeDevice = "wasm";
  transcriber = await createPipelineWithDevice("wasm");
  return transcriber;
}

self.onmessage = async (event: MessageEvent<WhisperWorkerRequest>) => {
  const { type, audioData } = event.data;

  if (type === "preload") {
    try {
      self.postMessage({ status: "loading" } satisfies WhisperWorkerResponse);
      await getTranscriber();
      self.postMessage({
        status: "ready",
        device: activeDevice,
      } satisfies WhisperWorkerResponse);
    } catch (err: any) {
      self.postMessage({
        status: "error",
        error: err?.message || "Model ön yüklemesi başarısız",
      } satisfies WhisperWorkerResponse);
    }
    return;
  }

  if (type === "transcribe" && audioData) {
    try {
      // 1. ÖN İŞLEME: Baştaki ve sondaki sessizlikleri kırp ve tepe genliğini 0.95'e normalize et
      const processedAudio = preprocessAudioForWhisper(audioData);

      // Çok kısa (< 0.15 sn / 2400 örnek) veya tamamen sessiz ses verisinde Whisper halüsinasyonunu önle
      if (!processedAudio || processedAudio.length < 2400) {
        self.postMessage({
          status: "completed",
          text: "",
          device: activeDevice,
        } satisfies WhisperWorkerResponse);
        return;
      }

      self.postMessage({ status: "loading" } satisfies WhisperWorkerResponse);
      let model = await getTranscriber(false);

      self.postMessage({
        status: "transcribing",
        device: activeDevice,
      } satisfies WhisperWorkerResponse);

      const runInference = async (asrPipe: any) => {
        return await asrPipe(processedAudio, {
          language: "arabic",
          task: "transcribe",
          temperature: 0,
          chunk_length_s: 30,
          stride_length_s: 5,
          no_repeat_ngram_size: 3,
          repetition_penalty: 1.2,
          max_new_tokens: 100,
        });
      };

      let output: any;
      try {
        output = await runInference(model);
      } catch (inferErr) {
        // Eğer WebGPU çalışma zamanında (inference aşamasında) çöktüyse kesintisiz WASM q8'e düş!
        if (activeDevice === "webgpu") {
          activeDevice = "wasm";
          transcriber = null;
          self.postMessage({
            status: "transcribing",
            device: "wasm",
          } satisfies WhisperWorkerResponse);
          model = await getTranscriber(true);
          self.postMessage({
            status: "transcribing",
            device: "wasm",
          } satisfies WhisperWorkerResponse);
          output = await runInference(model);
        } else {
          throw inferErr;
        }
      }

      let recognizedText = (
        Array.isArray(output)
          ? output.map((o) => o.text).join(" ")
          : output?.text || ""
      ).trim();

      // Whisper sessizlik halüsinasyonlarını temizle
      const hallucinationPatterns = [
        /اشتركوا في القناة/gi,
        /لا تنسوا الاشتراك/gi,
        /ترجمة نانسي قنقر/gi,
        /شكراً? للمشاهدة/gi,
        /ترجمة وتحرير/gi,
      ];
      for (const pat of hallucinationPatterns) {
        recognizedText = recognizedText.replace(pat, "").trim();
      }

      self.postMessage({
        status: "completed",
        text: recognizedText,
        device: activeDevice,
      } satisfies WhisperWorkerResponse);
    } catch (error: any) {
      self.postMessage({
        status: "error",
        error: error?.message || `Whisper (${activeModelId}) ses çözümleme hatası`,
      } satisfies WhisperWorkerResponse);
    }
  }
};
