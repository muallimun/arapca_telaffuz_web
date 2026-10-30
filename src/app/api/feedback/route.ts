import { NextRequest, NextResponse } from "next/server";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const GOOGLE_SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycbxnozrFJ9z1X2TMsO-S1TJm70bu-mreYtuOqU96Oyu_hArYspQaQPvv9rbNeRX8zaGt/exec";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      category = "Genel Görüş & Teşekkür",
      name = "",
      email = "",
      dialogueRef = "Genel / Tüm Uygulama",
      message = "",
      pageUrl = "",
      website = "",
    } = body || {};

    // Honeypot spam kontrolü
    if (website && String(website).trim().length > 0) {
      return NextResponse.json({ ok: true });
    }

    const trimmedName = String(name).trim();
    const trimmedEmail = String(email).trim();
    const trimmedMessage = String(message).trim();
    const trimmedCategory = String(category).trim() || "Genel Görüş & Teşekkür";
    const trimmedDialogueRef =
      String(dialogueRef).trim() || "Genel / Tüm Uygulama";
    const trimmedPageUrl = String(pageUrl).trim();

    if (trimmedName.length < 3) {
      return NextResponse.json(
        {
          error:
            "Lütfen adınızı ve soyadınızı eksiksiz girin (en az 3 karakter).",
        },
        { status: 400 }
      );
    }

    if (!EMAIL_REGEX.test(trimmedEmail)) {
      return NextResponse.json(
        { error: "Lütfen geçerli bir e-posta adresi girin." },
        { status: 400 }
      );
    }

    if (trimmedMessage.length < 10) {
      return NextResponse.json(
        {
          error:
            "Lütfen mesajınızı biraz daha açıklayıcı yazın (en az 10 karakter).",
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
        category: trimmedCategory,
        name: trimmedName,
        email: trimmedEmail,
        dialogueRef: trimmedDialogueRef,
        message: trimmedMessage,
        pageUrl: trimmedPageUrl,
      }),
      redirect: "follow",
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

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { error: "Mesaj gönderilirken beklenmeyen bir hata oluştu." },
      { status: 500 }
    );
  }
}
