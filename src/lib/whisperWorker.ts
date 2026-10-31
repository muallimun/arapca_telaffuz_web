// src/lib/whisperWorker.ts
// Web Worker içinde çalışan Çevrimdışı Yapay Zeka (Whisper) STT Motoru
// Varsa WebGPU, yoksa veya hata verirse anında WASM (q8 kuantize) ile ana iş parçacığını (Main Thread) dondurmadan çalışır.

import { pipeline, env } from "@huggingface/transformers";

const isMobile = /Android|iPhone|iPad|iPod/i.test(
  typeof self !== "undefined" ? self.navigator?.userAgent || "" : ""
);

env.allowLocalModels = false;
env.useBrowserCache = true;
if (env.backends?.onnx?.wasm) {
  // Mobilde SharedArrayBuffer sub-worker kilitlenmesini önlemek için numThreads = 1 zorunlu!
  env.backends.onnx.wasm.numThreads = isMobile
    ? 1
    : Math.min(
        4,
        typeof self !== "undefined"
          ? self.navigator?.hardwareConcurrency || 2
          : 2
      );
  env.backends.onnx.wasm.proxy = false;
}

export interface WhisperWorkerRequest {
  type: "transcribe" | "preload" | "abort";
  requestId?: string;
  audioData?: Float32Array;
  sampleRate?: number;
  language?: string;
}

export interface WhisperWorkerResponse {
  requestId?: string;
  status:
    | "loading"
    | "progress"
    | "ready"
    | "transcribing"
    | "completed"
    | "error";
  ignored?: boolean;
  data?: {
    progress?: number;
    file?: string;
    status?: string;
  };
  text?: string;
  device?: "webgpu" | "wasm";
  error?: string;
}

type AsrOutputItem = { text?: string };
type AsrOutput = AsrOutputItem | AsrOutputItem[];
type AsrPipelineFn = (
  audio: Float32Array,
  options: Record<string, unknown>
) => Promise<AsrOutput>;

interface NavigatorWithGpu extends Navigator {
  gpu?: {
    requestAdapter: () => Promise<{
      requestDevice?: () => Promise<unknown>;
    } | null>;
  };
}

let transcriber: AsrPipelineFn | null = null;
let activeDevice: "webgpu" | "wasm" = "wasm";
let activeModelId: string = isMobile
  ? "onnx-community/whisper-tiny"
  : "onnx-community/whisper-base";
let currentActiveRequestId: string | undefined = undefined;
let latestTranscribeRequestId: string | undefined = undefined;
const abortedRequestIds = new Set<string>();
const requestQueue: WhisperWorkerRequest[] = [];
let isProcessingQueue = false;

const MODEL_CANDIDATES = isMobile
  ? [
      "onnx-community/whisper-tiny",
      "Xenova/whisper-tiny",
      "onnx-community/whisper-base",
      "Xenova/whisper-base",
    ]
  : [
      "onnx-community/whisper-base",
      "Xenova/whisper-base",
      "onnx-community/whisper-tiny",
      "Xenova/whisper-tiny",
    ];

/**
 * Gerçekten kullanılabilir bir WebGPU adaptörü ve cihazı olup olmadığını kontrol eder.
 * Mobil cihazlarda ve Firefox gibi WebGPU'nun deneysel/kısmi olduğu ortamlarda güvenli şekilde false döner.
 */
async function hasUsableWebGPU(): Promise<boolean> {
  if (isMobile) {
    return false;
  }
  try {
    const nav =
      typeof navigator !== "undefined"
        ? (navigator as NavigatorWithGpu)
        : undefined;
    if (!nav || !("gpu" in nav) || !nav.gpu) {
      return false;
    }
    // Firefox'ta WebGPU ONNX shader derlemesi çökebildiği için doğrudan kararlı WASM q8 tercih edilir
    if (
      typeof nav.userAgent === "string" &&
      /firefox/i.test(nav.userAgent)
    ) {
      return false;
    }
    const adapter = await nav.gpu.requestAdapter();
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
 * 44.1kHz / 48kHz -> 16kHz downsampling öncesinde 8kHz üzerindeki yüksek frekanslı
 * sibilantların (س، ص، ش، ث) katlanmasını (aliasing) önleyen hafif FIR alçak geçiren filtre.
 */
function applyWorkerAntiAliasFilter(
  buffer: Float32Array,
  ratio: number
): Float32Array {
  if (ratio <= 1.05 || buffer.length < 5) return buffer;
  const filtered = new Float32Array(buffer.length);
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
 * Mobil tarayıcılardan 44100 Hz veya 48000 Hz gelebilecek ses tamponunu
 * FIR anti-aliasing filtresi ve lineer interpolasyon ile kesin olarak 16000 Hz frekansına yeniden örnekler.
 */
function resampleWorkerAudioTo16kHz(
  buffer: Float32Array,
  fromSampleRate: number = 16000
): Float32Array {
  if (!buffer || buffer.length === 0) return new Float32Array(0);
  if (!fromSampleRate || fromSampleRate <= 0 || fromSampleRate === 16000) {
    return buffer;
  }
  const ratio = fromSampleRate / 16000;
  const sourceBuffer =
    ratio > 1.05 ? applyWorkerAntiAliasFilter(buffer, ratio) : buffer;
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
 * 16kHz Float32Array PCM ses dizisinin tepe genliğini 0.90 seviyesine normalize eder,
 * başına 0.30 saniye (4800 sıfır örneği) ve sonuna 0.40 saniye (6400 sıfır örneği) sessizlik yastığı (zero-padding) ekler
 * ve toplam ses uzunluğunun her zaman >= 1.6 saniye (25600 örnek) olmasını garanti eder.
 */
function preprocessAudioForWhisper(
  rawSamples: Float32Array,
  inputSampleRate: number = 16000,
  gainBoost: number = 1.0,
  skipTrim: boolean = false
): Float32Array {
  if (!rawSamples || rawSamples.length === 0) {
    return new Float32Array(0);
  }

  const samples =
    inputSampleRate !== 16000
      ? resampleWorkerAudioTo16kHz(rawSamples, inputSampleRate)
      : rawSamples;

  let maxAbs = 0;
  for (let i = 0; i < samples.length; i++) {
    const v = Math.abs(samples[i]);
    if (v > maxAbs) maxAbs = v;
  }

  // Tamamen sessiz kayıt
  if (maxAbs < 0.002) {
    return new Float32Array(0);
  }

  let coreSamples = samples;
  // Yalnızca 3.5 saniyeyi (56000 örnek) aşan kayıtlarda ve skipTrim === false iken hafif uç sessizlik kırpması yap
  if (!skipTrim && samples.length > 56000) {
    const threshold = Math.max(0.003, maxAbs * 0.03);
    let start = 0;
    let end = samples.length - 1;

    for (let i = 0; i < samples.length; i++) {
      if (Math.abs(samples[i]) >= threshold) {
        start = Math.max(0, i - 6400); // 0.40 sn ön pay
        break;
      }
    }

    for (let i = samples.length - 1; i >= 0; i--) {
      if (Math.abs(samples[i]) >= threshold) {
        end = Math.min(samples.length - 1, i + 7200); // 0.45 sn arka pay
        break;
      }
    }

    const minAllowed = Math.min(samples.length, 28800); // en az 1.8 sn
    if (end > start && end - start + 1 >= minAllowed) {
      coreSamples = samples.slice(start, end + 1);
    }
  }

  // Tepe genliğini (Peak Normalization) 0.90 seviyesine normalize et (ve varsa gainBoost uygula)
  let peak = 0;
  for (let i = 0; i < coreSamples.length; i++) {
    const v = Math.abs(coreSamples[i]);
    if (v > peak) peak = v;
  }

  const normalized = new Float32Array(coreSamples.length);
  if (peak > 0.002) {
    const gain = (0.9 / peak) * gainBoost;
    for (let i = 0; i < coreSamples.length; i++) {
      normalized[i] = Math.max(-0.98, Math.min(0.98, coreSamples[i] * gain));
    }
  } else {
    normalized.set(coreSamples);
  }

  // Başına 0.30 sn (4800 örnek) ve sonuna 0.40 sn (6400 örnek) sessizlik yastığı ekle; toplam uzunluk >= 1.6 sn (25600 örnek) olsun
  const prePad = 4800;
  const postPad = 6400;
  const minTotalSamples = 25600; // 1.6 saniye @ 16kHz
  const totalLen = Math.max(
    minTotalSamples,
    prePad + normalized.length + postPad
  );
  const padded = new Float32Array(totalLen);
  padded.set(normalized, prePad);

  return padded;
}

function cleanWhisperHallucinations(rawText: string): string {
  let cleaned = (rawText || "").trim();
  const hallucinationPatterns = [
    /اشتركوا في القناة/gi,
    /لا تنسوا الاشتراك/gi,
    /ترجمة نانسي قنقر/gi,
    /شكراً? للمشاهدة/gi,
    /ترجمة وتحرير/gi,
  ];
  for (const pat of hallucinationPatterns) {
    cleaned = cleaned.replace(pat, "").trim();
  }
  return cleaned;
}

async function createPipelineWithDevice(
  device: "webgpu" | "wasm"
): Promise<AsrPipelineFn> {
  let lastErr: unknown = null;
  for (const modelId of MODEL_CANDIDATES) {
    try {
      const pipe = await pipeline("automatic-speech-recognition", modelId, {
        device,
        dtype: "q8",
        progress_callback: (progress: {
          progress?: number;
          file?: string;
          status?: string;
        }) => {
          self.postMessage({
            requestId: currentActiveRequestId,
            status: "progress",
            data: progress,
            device,
          } satisfies WhisperWorkerResponse);
        },
      });
      activeDevice = device;
      activeModelId = modelId;
      return pipe as unknown as AsrPipelineFn;
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

function isRequestStaleOrAborted(reqId?: string): boolean {
  if (!reqId) return false;
  if (abortedRequestIds.has(reqId)) return true;
  if (
    latestTranscribeRequestId &&
    reqId !== latestTranscribeRequestId &&
    reqId.startsWith("req_")
  ) {
    return true;
  }
  return false;
}

async function handleSingleRequest(req: WhisperWorkerRequest) {
  const { type, audioData, sampleRate, requestId } = req;
  currentActiveRequestId = requestId;

  if (isRequestStaleOrAborted(requestId)) {
    self.postMessage({
      requestId,
      status: "completed",
      text: "",
      ignored: true,
      device: activeDevice,
    } satisfies WhisperWorkerResponse);
    return;
  }

  if (type === "preload") {
    try {
      self.postMessage({
        requestId,
        status: "loading",
      } satisfies WhisperWorkerResponse);
      await getTranscriber();
      self.postMessage({
        requestId,
        status: "ready",
        device: activeDevice,
      } satisfies WhisperWorkerResponse);
    } catch (err: unknown) {
      const errMsg =
        err instanceof Error ? err.message : "Model ön yüklemesi başarısız";
      self.postMessage({
        requestId,
        status: "error",
        error: errMsg,
      } satisfies WhisperWorkerResponse);
    }
    return;
  }

  if (type === "transcribe" && audioData) {
    try {
      // 1. ÖN İŞLEME: 16kHz'e örnekle, 0.90 tepe normalizasyonu ve 0.30s/0.40s sessizlik yastığı (>= 1.6s) uygula
      const processedAudio = preprocessAudioForWhisper(
        audioData,
        sampleRate || 16000,
        1.0,
        false
      );

      if (!processedAudio || processedAudio.length < 2400) {
        self.postMessage({
          requestId,
          status: "completed",
          text: "",
          device: activeDevice,
        } satisfies WhisperWorkerResponse);
        return;
      }

      self.postMessage({
        requestId,
        status: "loading",
      } satisfies WhisperWorkerResponse);
      let model = await getTranscriber(false);

      if (isRequestStaleOrAborted(requestId)) {
        self.postMessage({
          requestId,
          status: "completed",
          text: "",
          ignored: true,
          device: activeDevice,
        } satisfies WhisperWorkerResponse);
        return;
      }

      self.postMessage({
        requestId,
        status: "transcribing",
        device: activeDevice,
      } satisfies WhisperWorkerResponse);

      const runInference = async (
        asrPipe: AsrPipelineFn,
        inputAudio: Float32Array
      ) => {
        return await asrPipe(inputAudio, {
          language: "arabic",
          task: "transcribe",
          chunk_length_s: 30,
          stride_length_s: 5,
        });
      };

      let output: AsrOutput;
      try {
        output = await runInference(model, processedAudio);
      } catch (inferErr) {
        // Eğer WebGPU çalışma zamanında (inference aşamasında) çöktüyse kesintisiz WASM q8'e düş!
        if (activeDevice === "webgpu") {
          activeDevice = "wasm";
          transcriber = null;
          self.postMessage({
            requestId,
            status: "loading",
            device: "wasm",
          } satisfies WhisperWorkerResponse);
          model = await getTranscriber(true);
          self.postMessage({
            requestId,
            status: "transcribing",
            device: "wasm",
          } satisfies WhisperWorkerResponse);
          output = await runInference(model, processedAudio);
        } else {
          throw inferErr;
        }
      }

      let recognizedText = cleanWhisperHallucinations(
        Array.isArray(output)
          ? output.map((o) => o.text || "").join(" ")
          : output?.text || ""
      );

      // Eğer ilk çözümleme denemesi boş metin döndürdüyse, kırpılmamış ham ses verisini x1.8 kazançla (gain boost) ikinci kez çözümle!
      if (
        (!recognizedText || !/[\u0600-\u06FF]/.test(recognizedText)) &&
        !isRequestStaleOrAborted(requestId)
      ) {
        const boostedAudio = preprocessAudioForWhisper(
          audioData,
          sampleRate || 16000,
          1.8,
          true
        );
        if (boostedAudio.length >= 2400) {
          try {
            const retryOutput = await runInference(model, boostedAudio);
            const retryText = cleanWhisperHallucinations(
              Array.isArray(retryOutput)
                ? retryOutput.map((o) => o.text || "").join(" ")
                : retryOutput?.text || ""
            );
            if (retryText && /[\u0600-\u06FF]/.test(retryText)) {
              recognizedText = retryText;
            }
          } catch {
            // ignore second pass error
          }
        }
      }

      const ignored = isRequestStaleOrAborted(requestId);
      self.postMessage({
        requestId,
        status: "completed",
        text: ignored ? "" : recognizedText,
        ignored,
        device: activeDevice,
      } satisfies WhisperWorkerResponse);
    } catch (error: unknown) {
      const errMsg =
        error instanceof Error
          ? error.message
          : `Whisper (${activeModelId}) ses çözümleme hatası`;
      self.postMessage({
        requestId,
        status: "error",
        ignored: isRequestStaleOrAborted(requestId),
        error: errMsg,
      } satisfies WhisperWorkerResponse);
    }
  }
}

async function processQueue() {
  if (isProcessingQueue) return;
  isProcessingQueue = true;
  try {
    while (requestQueue.length > 0) {
      const nextReq = requestQueue.shift()!;
      await handleSingleRequest(nextReq);
    }
  } finally {
    isProcessingQueue = false;
  }
}

self.onmessage = (event: MessageEvent<WhisperWorkerRequest>) => {
  const data = event.data;
  if (!data) return;

  if (data.type === "abort") {
    if (data.requestId) {
      abortedRequestIds.add(data.requestId);
    }
    return;
  }

  if (data.type === "transcribe" && data.requestId) {
    // Yeni bir transcribe isteği geldiğinde kuyruktaki önceki bekleyen transcribe isteklerini ignored olarak işaretle
    latestTranscribeRequestId = data.requestId;
    for (let i = requestQueue.length - 1; i >= 0; i--) {
      const queued = requestQueue[i];
      if (queued.type === "transcribe" && queued.requestId) {
        abortedRequestIds.add(queued.requestId);
        self.postMessage({
          requestId: queued.requestId,
          status: "completed",
          text: "",
          ignored: true,
          device: activeDevice,
        } satisfies WhisperWorkerResponse);
        requestQueue.splice(i, 1);
      }
    }
  }

  requestQueue.push(data);
  void processQueue();
};
