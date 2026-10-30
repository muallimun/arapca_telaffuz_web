import { NextRequest, NextResponse } from "next/server";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RECIPIENT_ENDPOINT = "https://formsubmit.co/ajax/abdullahtat@gmail.com";

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
      return NextResponse.json(
        { error: "İstek doğrulanamadı." },
        { status: 400 }
      );
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
        { error: "Lütfen adınızı ve soyadınızı eksiksiz girin (en az 3 karakter)." },
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
        { error: "Lütfen mesajınızı biraz daha açıklayıcı yazın (en az 10 karakter)." },
        { status: 400 }
      );
    }

    const payload = {
      "Bildirim Türü": trimmedCategory,
      "Ad Soyad": trimmedName,
      "E-posta": trimmedEmail,
      "İlgili Diyalog / Bölüm": trimmedDialogueRef,
      "Mesaj": trimmedMessage,
      "Sayfa Bağlantısı": trimmedPageUrl || "-",
      _replyto: trimmedEmail,
      _subject: `Arapça Telaffuz & Diyalog - Bildirim: [${trimmedCategory}] (${trimmedName})`,
      _template: "table",
      _captcha: "false",
    };

    const res = await fetch(RECIPIENT_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Origin: "https://app.muallimun.net",
        Referer: "https://app.muallimun.net/",
      },
      body: JSON.stringify(payload),
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
