import { NextRequest, NextResponse } from "next/server";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const GOOGLE_SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycbxnozrFJ9z1X2TMsO-S1TJm70bu-mreYtuOqU96Oyu_hArYspQaQPvv9rbNeRX8zaGt/exec";

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 5;
const MAX_MAP_SIZE = 2000;
const MAX_BODY_BYTES = 16_384;
const ipRequestTimestamps = new Map<string, number[]>();

/**
 * Google Sheets formül enjeksiyonunu (=, +, -, @, sekme/satır başı) önler.
 */
function sanitizeSheetCell(value: string): string {
  const cleaned = value.replace(/^[\s\u0000-\u001F]+/, "").trim();
  if (/^[=+\-@]/.test(cleaned)) {
    return `'${cleaned}`;
  }
  return cleaned;
}

function getClientIp(req: NextRequest): string {
  const forwardedFor = req.headers.get("x-forwarded-for");
  if (forwardedFor) {
    const firstIp = forwardedFor.split(",")[0]?.trim();
    if (firstIp) return firstIp;
  }
  const realIp = req.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;
  return "unknown";
}

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const timestamps = ipRequestTimestamps.get(ip) ?? [];
  const recent = timestamps.filter((ts) => now - ts < RATE_LIMIT_WINDOW_MS);

  if (recent.length >= RATE_LIMIT_MAX_REQUESTS) {
    ipRequestTimestamps.set(ip, recent);
    return true;
  }

  recent.push(now);
  ipRequestTimestamps.set(ip, recent);

  if (ipRequestTimestamps.size > MAX_MAP_SIZE) {
    for (const [key, list] of ipRequestTimestamps.entries()) {
      if (list.every((ts) => now - ts >= RATE_LIMIT_WINDOW_MS)) {
        ipRequestTimestamps.delete(key);
      }
    }
    if (ipRequestTimestamps.size > MAX_MAP_SIZE) {
      const oldestKey = ipRequestTimestamps.keys().next().value;
      if (oldestKey) ipRequestTimestamps.delete(oldestKey);
    }
  }

  return false;
}

export async function POST(req: NextRequest) {
  const contentLengthHeader = req.headers.get("content-length");
  if (contentLengthHeader) {
    const contentLength = Number(contentLengthHeader);
    if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
      return NextResponse.json(
        { error: "İstek gövdesi çok büyük (en fazla 16 KB kabul edilir)." },
        { status: 413 }
      );
    }
  }

  const clientIp = getClientIp(req);
  if (isRateLimited(clientIp)) {
    return NextResponse.json(
      {
        error:
          "Çok fazla geri bildirim gönderdiniz. Lütfen bir dakika bekleyip tekrar deneyin.",
      },
      { status: 429 }
    );
  }

  let body: Record<string, unknown>;
  try {
    const rawText = await req.text();
    if (rawText.length > MAX_BODY_BYTES) {
      return NextResponse.json(
        { error: "İstek gövdesi çok büyük (en fazla 16 KB kabul edilir)." },
        { status: 413 }
      );
    }
    const parsed: unknown = JSON.parse(rawText);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return NextResponse.json(
        { error: "Geçersiz istek gövdesi (JSON nesnesi bekleniyor)." },
        { status: 400 }
      );
    }
    body = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { error: "Geçersiz JSON formatı." },
      { status: 400 }
    );
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);

  try {
    const {
      category = "Genel Görüş & Teşekkür",
      name,
      email,
      dialogueRef = "Genel / Tüm Uygulama",
      message,
      pageUrl = "",
      website = "",
    } = body;

    // Honeypot spam kontrolü
    if (typeof website === "string" && website.trim().length > 0) {
      return NextResponse.json({ ok: true });
    }

    if (
      typeof name !== "string" ||
      typeof email !== "string" ||
      typeof category !== "string" ||
      typeof dialogueRef !== "string" ||
      typeof pageUrl !== "string" ||
      typeof message !== "string"
    ) {
      return NextResponse.json(
        { error: "Gönderilen form alanları geçerli metin formatında olmalıdır." },
        { status: 400 }
      );
    }

    const trimmedName = name.trim();
    const trimmedEmail = email.trim();
    const trimmedMessage = message.trim();
    const trimmedCategory = category.trim() || "Genel Görüş & Teşekkür";
    const trimmedDialogueRef =
      dialogueRef.trim() || "Genel / Tüm Uygulama";
    const trimmedPageUrl = pageUrl.trim();

    if (trimmedName.length < 3 || trimmedName.length > 100) {
      return NextResponse.json(
        {
          error:
            "Lütfen adınızı ve soyadınızı 3 ile 100 karakter arasında girin.",
        },
        { status: 400 }
      );
    }

    if (trimmedEmail.length > 150 || !EMAIL_REGEX.test(trimmedEmail)) {
      return NextResponse.json(
        {
          error:
            "Lütfen geçerli bir e-posta adresi girin (en fazla 150 karakter).",
        },
        { status: 400 }
      );
    }

    if (trimmedMessage.length < 10 || trimmedMessage.length > 3000) {
      return NextResponse.json(
        {
          error:
            "Lütfen mesajınızı 10 ile 3000 karakter arasında yazın.",
        },
        { status: 400 }
      );
    }

    const res = await fetch(GOOGLE_SCRIPT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain;charset=utf-8",
      },
      body: JSON.stringify({
        category: sanitizeSheetCell(trimmedCategory.slice(0, 150)),
        name: sanitizeSheetCell(trimmedName),
        email: sanitizeSheetCell(trimmedEmail),
        dialogueRef: sanitizeSheetCell(trimmedDialogueRef.slice(0, 200)),
        message: sanitizeSheetCell(trimmedMessage),
        pageUrl: sanitizeSheetCell(trimmedPageUrl.slice(0, 500)),
      }),
      redirect: "follow",
      signal: controller.signal,
    });

    if (!res.ok) {
      return NextResponse.json(
        {
          error:
            "Bildirim servisine şu an ulaşılamadı. Lütfen kısa bir süre sonra tekrar deneyin.",
        },
        { status: 502 }
      );
    }

    const responseText = await res.text();
    if (responseText) {
      try {
        const responseJson = JSON.parse(responseText) as { ok?: boolean };
        if (responseJson && responseJson.ok === false) {
          return NextResponse.json(
            {
              error:
                "Bildirim servisi mesajı işleyemedi. Lütfen kısa bir süre sonra tekrar deneyin.",
            },
            { status: 502 }
          );
        }
      } catch {
        // Yanıt JSON değilse ancak HTTP 200 ise geçerli kabul et
      }
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { error: "Mesaj gönderilirken beklenmeyen bir hata veya zaman aşımı oluştu." },
      { status: 502 }
    );
  } finally {
    clearTimeout(timeoutId);
  }
}
