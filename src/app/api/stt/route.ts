import { NextRequest, NextResponse } from "next/server";
import { pipeline, env } from "@huggingface/transformers";

env.allowLocalModels = false;

type ServerAsrOutputItem = { text?: string };
type ServerAsrOutput = ServerAsrOutputItem | ServerAsrOutputItem[];
type ServerAsrPipelineFn = (
  audio: Float32Array,
  options: Record<string, unknown>
) => Promise<ServerAsrOutput>;

let serverTranscriberPromise: Promise<ServerAsrPipelineFn> | null = null;

async function getServerTranscriber(): Promise<ServerAsrPipelineFn> {
  if (!serverTranscriberPromise) {
    serverTranscriberPromise = (async () => {
      const candidates = [
        "onnx-community/whisper-tiny",
        "Xenova/whisper-tiny",
        "onnx-community/whisper-base",
      ];
      let lastErr: unknown = null;
      for (const modelId of candidates) {
        try {
          const pipe = await pipeline(
            "automatic-speech-recognition",
            modelId,
            {
              dtype: "q8",
            }
          );
          return pipe as unknown as ServerAsrPipelineFn;
        } catch (err) {
          lastErr = err;
        }
      }
      serverTranscriberPromise = null;
      throw lastErr || new Error("Sunucu STT modeli yüklenemedi.");
    })();
  }
  return serverTranscriberPromise;
}

/**
 * 16-bit PCM RIFF/WAVE ikili verisini (ArrayBuffer) 16000 Hz Float32Array dizisine dönüştürür.
 */
function parseWavBufferToFloat32(buffer: ArrayBuffer): Float32Array {
  if (!buffer || buffer.byteLength <= 44) {
    return new Float32Array(0);
  }
  const view = new DataView(buffer);
  let dataOffset = 44;
  let dataLength = buffer.byteLength - 44;

  // RIFF başlığı varsa "data" alt-parçasını (subchunk) bul
  if (
    view.getUint8(0) === 0x52 && // R
    view.getUint8(1) === 0x49 && // I
    view.getUint8(2) === 0x46 && // F
    view.getUint8(3) === 0x46 // F
  ) {
    let offset = 12;
    while (offset + 8 <= buffer.byteLength) {
      const chunkId = String.fromCharCode(
        view.getUint8(offset),
        view.getUint8(offset + 1),
        view.getUint8(offset + 2),
        view.getUint8(offset + 3)
      );
      const chunkSize = view.getUint32(offset + 4, true);
      if (chunkId === "data") {
        dataOffset = offset + 8;
        dataLength = Math.min(chunkSize, buffer.byteLength - dataOffset);
        break;
      }
      offset += 8 + chunkSize + (chunkSize % 2);
    }
  }

  const numSamples = Math.floor(dataLength / 2);
  const float32 = new Float32Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    const int16 = view.getInt16(dataOffset + i * 2, true);
    float32[i] = int16 < 0 ? int16 / 0x8000 : int16 / 0x7fff;
  }
  return float32;
}

const MAX_BODY_BYTES = 2 * 1024 * 1024; // 2 MB
const MAX_AUDIO_SAMPLES = 16000 * 30; // 30 saniye @ 16kHz
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 dakika
const RATE_LIMIT_MAX_REQUESTS = 20;

const ipRequestHistory = new Map<string, number[]>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const prev = ipRequestHistory.get(ip) || [];
  const valid = prev.filter((ts) => now - ts < RATE_LIMIT_WINDOW_MS);
  if (valid.length >= RATE_LIMIT_MAX_REQUESTS) {
    ipRequestHistory.set(ip, valid);
    return true;
  }
  valid.push(now);
  ipRequestHistory.set(ip, valid);
  if (ipRequestHistory.size > 500) {
    for (const [k, list] of ipRequestHistory.entries()) {
      if (list.every((ts) => now - ts >= RATE_LIMIT_WINDOW_MS)) {
        ipRequestHistory.delete(k);
      }
    }
  }
  return false;
}

export async function GET() {
  return NextResponse.json(
    {
      ok: true,
      service: "stt",
      status: "ready",
      maxBytes: MAX_BODY_BYTES,
      maxDurationSec: 30,
      rateLimitPerMinute: RATE_LIMIT_MAX_REQUESTS,
    },
    { status: 200 }
  );
}

export async function POST(req: NextRequest) {
  try {
    const clientIp =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip")?.trim() ||
      "anonymous";

    if (isRateLimited(clientIp)) {
      return NextResponse.json(
        {
          ok: false,
          text: "",
          error:
            "Dakikada en fazla 20 ses çözümleme isteği gönderilebilir. Lütfen kısa bir süre bekleyin.",
        },
        { status: 429 }
      );
    }

    const contentLengthHeader = req.headers.get("content-length");
    if (contentLengthHeader) {
      const contentLen = Number(contentLengthHeader);
      if (Number.isFinite(contentLen) && contentLen > MAX_BODY_BYTES) {
        return NextResponse.json(
          {
            ok: false,
            text: "",
            error: "Ses verisi boyutu 2 MB sınırını aşıyor.",
          },
          { status: 413 }
        );
      }
      if (Number.isFinite(contentLen) && contentLen === 0) {
        return NextResponse.json(
          {
            ok: false,
            text: "",
            error: "Boş istek gövdesi gönderildi.",
          },
          { status: 400 }
        );
      }
    }

    const contentType = (req.headers.get("content-type") || "").toLowerCase();
    let pcm16k: Float32Array = new Float32Array(0);

    if (contentType.includes("multipart/form-data")) {
      let formData: FormData;
      try {
        formData = await req.formData();
      } catch {
        return NextResponse.json(
          { ok: false, text: "", error: "Geçersiz multipart/form-data gövdesi." },
          { status: 400 }
        );
      }
      const file = (formData.get("file") || formData.get("audio")) as Blob | null;
      if (!file || typeof file.arrayBuffer !== "function") {
        return NextResponse.json(
          { ok: false, text: "", error: "Ses dosyası (file/audio) bulunamadı." },
          { status: 400 }
        );
      }
      if (file.size > MAX_BODY_BYTES) {
        return NextResponse.json(
          { ok: false, text: "", error: "Ses dosyası 2 MB sınırını aşıyor." },
          { status: 413 }
        );
      }
      const ab = await file.arrayBuffer();
      if (ab.byteLength > MAX_BODY_BYTES) {
        return NextResponse.json(
          { ok: false, text: "", error: "Ses dosyası 2 MB sınırını aşıyor." },
          { status: 413 }
        );
      }
      pcm16k = parseWavBufferToFloat32(ab);
    } else if (contentType.includes("application/json")) {
      const rawText = await req.text();
      if (!rawText || !rawText.trim()) {
        return NextResponse.json(
          { ok: false, text: "", error: "Boş JSON gövdesi gönderildi." },
          { status: 400 }
        );
      }
      if (new TextEncoder().encode(rawText).byteLength > MAX_BODY_BYTES) {
        return NextResponse.json(
          { ok: false, text: "", error: "JSON gövdesi 2 MB sınırını aşıyor." },
          { status: 413 }
        );
      }
      let body: { samples?: number[]; audioBase64?: string };
      try {
        body = JSON.parse(rawText) as {
          samples?: number[];
          audioBase64?: string;
        };
      } catch {
        return NextResponse.json(
          { ok: false, text: "", error: "Geçersiz JSON formatı." },
          { status: 400 }
        );
      }
      if (Array.isArray(body?.samples) && body.samples.length > 0) {
        if (body.samples.length > MAX_AUDIO_SAMPLES) {
          return NextResponse.json(
            {
              ok: false,
              text: "",
              error: "Ses örneği sayısı 30 saniye (480.000 örnek) sınırını aşıyor.",
            },
            { status: 413 }
          );
        }
        pcm16k = Float32Array.from(body.samples);
      } else if (typeof body?.audioBase64 === "string" && body.audioBase64.trim()) {
        const binary = Buffer.from(body.audioBase64, "base64");
        if (binary.byteLength > MAX_BODY_BYTES) {
          return NextResponse.json(
            { ok: false, text: "", error: "Ses verisi 2 MB sınırını aşıyor." },
            { status: 413 }
          );
        }
        const ab = binary.buffer.slice(
          binary.byteOffset,
          binary.byteOffset + binary.byteLength
        );
        pcm16k = parseWavBufferToFloat32(ab);
      } else {
        return NextResponse.json(
          {
            ok: false,
            text: "",
            error: "İstek gövdesinde geçerli 'samples' veya 'audioBase64' alanı bulunamadı.",
          },
          { status: 400 }
        );
      }
    } else {
      const ab = await req.arrayBuffer();
      if (!ab || ab.byteLength === 0) {
        return NextResponse.json(
          { ok: false, text: "", error: "Boş ses gövdesi gönderildi." },
          { status: 400 }
        );
      }
      if (ab.byteLength > MAX_BODY_BYTES) {
        return NextResponse.json(
          { ok: false, text: "", error: "Ses gövdesi 2 MB sınırını aşıyor." },
          { status: 413 }
        );
      }
      pcm16k = parseWavBufferToFloat32(ab);
    }

    if (pcm16k.length > MAX_AUDIO_SAMPLES) {
      pcm16k = pcm16k.slice(0, MAX_AUDIO_SAMPLES);
    }

    // Çok kısa (< 0.15s = 2400 örnek) veya boş ses kontrolü
    if (!pcm16k || pcm16k.length < 2400) {
      return NextResponse.json({ ok: true, text: "" });
    }

    // Tepe genliği normalizasyonu
    let maxAbs = 0;
    for (let i = 0; i < pcm16k.length; i++) {
      const abs = Math.abs(pcm16k[i]);
      if (abs > maxAbs) maxAbs = abs;
    }
    if (maxAbs < 0.002) {
      return NextResponse.json({ ok: true, text: "" });
    }
    if (maxAbs < 0.8) {
      const gain = 0.88 / maxAbs;
      const normalized = new Float32Array(pcm16k.length);
      for (let i = 0; i < pcm16k.length; i++) {
        normalized[i] = Math.max(-1, Math.min(1, pcm16k[i] * gain));
      }
      pcm16k = normalized;
    }

    const asr = await getServerTranscriber();
    const output = await asr(pcm16k, {
      language: "arabic",
      task: "transcribe",
      temperature: 0,
      chunk_length_s: 30,
      stride_length_s: 5,
      no_repeat_ngram_size: 3,
      repetition_penalty: 1.2,
      max_new_tokens: 100,
    });

    let recognizedText = (
      Array.isArray(output)
        ? output.map((o) => o.text || "").join(" ")
        : output?.text || ""
    ).trim();

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

    return NextResponse.json({ ok: true, text: recognizedText });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Sunucu STT çözümleme hatası";
    return NextResponse.json(
      { ok: false, text: "", error: message },
      { status: 503 }
    );
  }
}
