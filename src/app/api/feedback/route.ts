import { NextRequest, NextResponse } from "next/server";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RECIPIENT_CODES = [
  97, 98, 100, 117, 108, 108, 97, 104, 116, 97, 116, 64, 103, 109, 97, 105, 108,
  46, 99, 111, 109,
];

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

    const targetEmail = RECIPIENT_CODES.map((c) =>
      String.fromCharCode(c)
    ).join("");

    const formData = new FormData();
    formData.append("Kategori", trimmedCategory);
    formData.append("Ad_Soyad", trimmedName);
    formData.append("Eposta", trimmedEmail);
    formData.append("_replyto", trimmedEmail);
    formData.append("Ilgili_Bolum", trimmedDialogueRef);
    formData.append("Mesaj", trimmedMessage);
    formData.append("Sayfa_URL", trimmedPageUrl || "-");
    formData.append(
      "_subject",
      `Arapça Telaffuz & Diyalog - ${trimmedCategory} (${trimmedName})`
    );
    formData.append("_template", "table");
    formData.append("_captcha", "false");

    const res = await fetch(`https://formsubmit.co/ajax/${targetEmail}`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "User-Agent":
          req.headers.get("user-agent") ||
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
        Origin: "https://app.muallimun.net",
        Referer: "https://app.muallimun.net/",
      },
      body: formData,
    });

    const data = await res.json().catch(() => ({}));
    const msgStr = String(data?.message || "").toLowerCase();
    const isSuccess =
      res.ok ||
      data?.success === "true" ||
      data?.success === true ||
      msgStr.includes("activate") ||
      msgStr.includes("activation");

    if (!isSuccess) {
      return NextResponse.json(
        {
          error:
            "Bildirim servisine şu an ulaşılamadı. Lütfen kısa bir süre sonra tekrar deneyin.",
        },
        { status: 502 }
      );
    }

    return NextResponse.json({ ok: true, success: true });
  } catch {
    return NextResponse.json(
      { error: "Mesaj gönderilirken beklenmeyen bir hata oluştu." },
      { status: 500 }
    );
  }
}
