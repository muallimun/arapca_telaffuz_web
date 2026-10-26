// src/lib/whisperWorker.ts
// Web Worker içinde çalışan Çevrimdışı Yapay Zeka (Whisper) STT Motoru
// Varsa WebGPU, yoksa WASM (q8 kuantize) ile ana iş parçacığını (Main Thread) dondurmadan çalışır.

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

async function hasWebGPU(): Promise<boolean> {
  try {
    if (typeof navigator !== "undefined" && "gpu" in navigator) {
      const adapter = await (navigator as any).gpu.requestAdapter();
      return Boolean(adapter);
    }
  } catch {
    // WebGPU desteklenmiyor, WASM kullanılacak
  }
  return false;
}

async function getTranscriber() {
  if (transcriber) return transcriber;

  const useGpu = await hasWebGPU();
  activeDevice = useGpu ? "webgpu" : "wasm";

  const modelCandidates = [
    "onnx-community/whisper-base",
    "Xenova/whisper-base",
  ];

  let lastErr: unknown = null;
  for (const modelId of modelCandidates) {
    try {
      transcriber = await pipeline("automatic-speech-recognition", modelId, {
        device: activeDevice,
        dtype: "q8",
        progress_callback: (progress: any) => {
          self.postMessage({
            status: "progress",
            data: progress,
            device: activeDevice,
          } satisfies WhisperWorkerResponse);
        },
      });
      return transcriber;
    } catch (err) {
      lastErr = err;
      // Eğer webgpu ile başarısız olduysa wasm ile tekrar dene
      if (activeDevice === "webgpu") {
        activeDevice = "wasm";
        try {
          transcriber = await pipeline("automatic-speech-recognition", modelId, {
            device: "wasm",
            dtype: "q8",
            progress_callback: (progress: any) => {
              self.postMessage({
                status: "progress",
                data: progress,
                device: "wasm",
              } satisfies WhisperWorkerResponse);
            },
          });
          return transcriber;
        } catch (wasmErr) {
          lastErr = wasmErr;
        }
      }
    }
  }

  throw lastErr || new Error("Whisper modeli yüklenemedi.");
}

self.onmessage = async (event: MessageEvent<WhisperWorkerRequest>) => {
  const { type, audioData, language } = event.data;

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
      self.postMessage({ status: "loading" } satisfies WhisperWorkerResponse);
      const model = await getTranscriber();

      self.postMessage({
        status: "transcribing",
        device: activeDevice,
      } satisfies WhisperWorkerResponse);

      const output = await model(audioData, {
        language: language || "ar",
        task: "transcribe",
        temperature: 0,
        chunk_length_s: 30,
        stride_length_s: 5,
        no_repeat_ngram_size: 3,
        repetition_penalty: 1.2,
        max_new_tokens: 100,
      });

      const recognizedText = Array.isArray(output)
        ? output.map((o) => o.text).join(" ")
        : output?.text || "";

      self.postMessage({
        status: "completed",
        text: recognizedText.trim(),
        device: activeDevice,
      } satisfies WhisperWorkerResponse);
    } catch (error: any) {
      self.postMessage({
        status: "error",
        error: error?.message || "Whisper ses çözümleme hatası",
      } satisfies WhisperWorkerResponse);
    }
  }
};
