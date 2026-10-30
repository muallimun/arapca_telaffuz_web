import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

export const runtime = "nodejs";

// Sunucu tarafı bellek içi ses önbelleği (Aynı cümle tekrar istendiğinde anında döner)
const serverAudioCache = new Map<string, ArrayBuffer>();
const MAX_CACHE_ITEMS = 300;

// IP bazlı bellek içi hız sınırlaması (Rate Limiting: dakikada maksimum 45 istek)
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 45;

function checkIpRateLimit(ip: string): boolean {
  const now = Date.now();
  // Süresi dolmuş eski IP kayıtlarını temizle (Bellek sızıntısı önlemi)
  if (rateLimitMap.size > 500) {
    for (const [key, entry] of rateLimitMap.entries()) {
      if (now >= entry.resetAt) {
        rateLimitMap.delete(key);
      }
    }
  }

  const current = rateLimitMap.get(ip);
  if (!current || now >= current.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }

  if (current.count >= RATE_LIMIT_MAX_REQUESTS) {
    return false;
  }

  current.count += 1;
  return true;
}

function setServerCache(key: string, buffer: ArrayBuffer) {
  if (serverAudioCache.size >= MAX_CACHE_ITEMS) {
    const firstKey = serverAudioCache.keys().next().value;
    if (firstKey) serverAudioCache.delete(firstKey);
  }
  serverAudioCache.set(key, buffer);
}

/**
 * Katman 2A: Microsoft Edge Neural TTS (Ücretsiz WebSocket/REST Sentezleyici)
 * Sesler: ar-SA-HamedNeural (Erkek), ar-SA-ZariyahNeural (Kadın)
 */
async function fetchEdgeNeuralTTS(
  text: string,
  voiceName: string,
  rate: number
): Promise<ArrayBuffer | null> {
  try {
    // StreamElements / Edge Neural ses uç noktası veya doğrudan MS Edge uyumlu ses akışı
    // Hız değerini SSML prosody formatına dönüştür (%-25, %0, %+25)
    const ratePercent = Math.round((rate - 1) * 100);
    const rateStr = ratePercent >= 0 ? `+${ratePercent}%` : `${ratePercent}%`;

    // 1. Deneme: Microsoft Edge Read-Aloud / Neural Proxy Uç Noktası
    const edgeVoicesMap: Record<string, string> = {
      "ar-SA-HamedNeural": "ar-SA-HamedNeural",
      "ar-SA-ZariyahNeural": "ar-SA-ZariyahNeural",
      male: "ar-SA-HamedNeural",
      female: "ar-SA-ZariyahNeural",
    };
    const resolvedVoice = edgeVoicesMap[voiceName] || "ar-SA-HamedNeural";

    // Edge DRM Sec-MS-GEC Token Üretimi (TrustedClientToken: 6A5AA1D4EAFF4E9FB37E23D68491D6F4)
    const trustedToken = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";
    const ticks =
      Math.floor(Date.now() / 1000 + 11644473600) -
      (Math.floor(Date.now() / 1000 + 11644473600) % 300);
    const strToHash = `${ticks * 1e7}${trustedToken}`;
    const secMsGec = crypto
      .createHash("sha256")
      .update(strToHash, "ascii")
      .digest("hex")
      .toUpperCase();

    // Node.js 22 native WebSocket varsa doğrudan Edge Neural WSS üzerinden MP3 al
    if (typeof WebSocket !== "undefined") {
      const mp3Buffer = await new Promise<ArrayBuffer | null>((resolve) => {
        const timeout = setTimeout(() => {
          resolve(null);
        }, 3800);

        try {
          const reqId = crypto.randomUUID().replace(/-/g, "");
          const wsUrl = `wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=${trustedToken}&Sec-MS-GEC=${secMsGec}&Sec-MS-GEC-Version=1-130.0.2849.68&ConnectionId=${reqId}`;
          const ws = new WebSocket(wsUrl);
          ws.binaryType = "arraybuffer";
          const audioChunks: Uint8Array[] = [];

          ws.onopen = () => {
            const configMsg =
              `X-Timestamp:${new Date().toISOString()}\r\n` +
              `Content-Type:application/json; charset=utf-8\r\n` +
              `Path:speech.config\r\n\r\n` +
              JSON.stringify({
                context: {
                  synthesis: {
                    audio: {
                      metadataoptions: {
                        sentenceBoundaryEnabled: "false",
                        wordBoundaryEnabled: "false",
                      },
                      outputFormat: "audio-24khz-48kbitrate-mono-mp3",
                    },
                  },
                },
              });
            ws.send(configMsg);

            const escapedText = text
              .replace(/&/g, "&amp;")
              .replace(/</g, "&lt;")
              .replace(/>/g, "&gt;");

            const ssml =
              `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='ar-SA'>` +
              `<voice name='${resolvedVoice}'>` +
              `<prosody pitch='+0Hz' rate='${rateStr}' volume='+0%'>${escapedText}</prosody>` +
              `</voice></speak>`;

            const ssmlMsg =
              `X-RequestId:${reqId}\r\n` +
              `Content-Type:application/ssml+xml\r\n` +
              `X-Timestamp:${new Date().toISOString()}Z\r\n` +
              `Path:ssml\r\n\r\n` +
              ssml;

            ws.send(ssmlMsg);
          };

          ws.onmessage = (event) => {
            if (typeof event.data === "string") {
              if (event.data.includes("Path:turn.end")) {
                clearTimeout(timeout);
                ws.close();
                if (audioChunks.length === 0) {
                  resolve(null);
                  return;
                }
                const totalLen = audioChunks.reduce(
                  (acc, c) => acc + c.byteLength,
                  0
                );
                const merged = new Uint8Array(totalLen);
                let offset = 0;
                for (const chunk of audioChunks) {
                  merged.set(chunk, offset);
                  offset += chunk.byteLength;
                }
                resolve(merged.buffer);
              }
            } else if (event.data instanceof ArrayBuffer) {
              const view = new DataView(event.data);
              const headerLen = view.getUint16(0, false);
              if (event.data.byteLength > headerLen + 2) {
                const body = new Uint8Array(event.data, headerLen + 2);
                audioChunks.push(body);
              }
            }
          };

          ws.onerror = () => {
            clearTimeout(timeout);
            resolve(null);
          };
        } catch {
          clearTimeout(timeout);
          resolve(null);
        }
      });

      if (mp3Buffer && mp3Buffer.byteLength > 256) {
        return mp3Buffer;
      }
    }
  } catch {
    // Fallback'e geç
  }
  return null;
}

/**
 * Katman 2B: Google Translate Doğal Arapça TTS Akışı (Harekeli metin uyumlu)
 */
async function fetchGoogleTranslateTTS(
  text: string,
  rate: number
): Promise<ArrayBuffer | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, 8000);

  try {
    const ttsspeed = rate < 0.9 ? "0.24" : "1";
    const googleUrl = `https://translate.google.com/translate_tts?ie=UTF-8&tl=ar&client=tw-ob&ttsspeed=${ttsspeed}&q=${encodeURIComponent(
      text
    )}`;

    const res = await fetch(googleUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
        Referer: "https://translate.google.com/",
      },
      signal: controller.signal,
    });

    if (res.ok) {
      const buf = await res.arrayBuffer();
      if (buf.byteLength > 128) return buf;
    }
  } catch {
    // Sessizce geç
  } finally {
    clearTimeout(timeoutId);
  }
  return null;
}

export async function GET(req: NextRequest) {
  const forwardedFor = req.headers.get("x-forwarded-for");
  const clientIp =
    (forwardedFor ? forwardedFor.split(",")[0].trim() : null) ||
    req.headers.get("x-real-ip") ||
    "anonymous";

  if (!checkIpRateLimit(clientIp)) {
    return NextResponse.json(
      { error: "Çok fazla seslendirme isteği gönderildi. Lütfen kısa bir süre bekleyin." },
      { status: 429 }
    );
  }

  const { searchParams } = new URL(req.url);
  const rawText = (searchParams.get("text") || "").trim();
  const voiceParam = searchParams.get("voice") || "male";
  const rawSpeed = searchParams.get("rate") || searchParams.get("speed") || "1";
  const clampedRate = Math.min(1.5, Math.max(0.5, Number(rawSpeed) || 1.0));

  if (!rawText) {
    return NextResponse.json(
      { error: "Metin parametresi (text) gerekli." },
      { status: 400 }
    );
  }

  const trimmedText = rawText.slice(0, 600);
  const voiceKey =
    voiceParam === "female" ||
    voiceParam === "K" ||
    voiceParam === "ar-SA-ZariyahNeural"
      ? "ar-SA-ZariyahNeural"
      : "ar-SA-HamedNeural";

  const cacheKey = `${voiceKey}:${clampedRate}:${trimmedText}`;
  const cached = serverAudioCache.get(cacheKey);
  if (cached) {
    return new NextResponse(cached, {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "public, max-age=86400, immutable",
        "Cross-Origin-Resource-Policy": "same-origin",
        "X-TTS-Provider": "cache",
      },
    });
  }

  // 1. Birincil: Microsoft Edge Neural TTS (HamedNeural / ZariyahNeural)
  let audioBuffer = await fetchEdgeNeuralTTS(trimmedText, voiceKey, clampedRate);
  let provider = "edge-neural";

  // 2. Yedek: Google Translate Doğal Arapça TTS
  if (!audioBuffer) {
    audioBuffer = await fetchGoogleTranslateTTS(trimmedText, clampedRate);
    provider = "google-tts";
  }

  if (!audioBuffer) {
    return NextResponse.json(
      { error: "Çevrimiçi TTS servisine ulaşılamadı, istemci yedek sesine geçiliyor." },
      { status: 503 }
    );
  }

  setServerCache(cacheKey, audioBuffer);

  return new NextResponse(audioBuffer, {
    status: 200,
    headers: {
      "Content-Type": "audio/mpeg",
      "Cache-Control": "public, max-age=86400, immutable",
      "Cross-Origin-Resource-Policy": "same-origin",
      "X-TTS-Provider": provider,
    },
  });
}
