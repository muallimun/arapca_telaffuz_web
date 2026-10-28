export const SHARE_APP_TITLE =
  "Arapça Telaffuz ve Diyalog Asistanı — Muallimun";

export const SHARE_APP_TEXT =
  "🎙️ Arapça Telaffuz ve Diyalog Asistanı: 60 günlük konuşma diyaloğu (A1-B2), 38 çiftlik Yapay Zeka Mahreç Koçu, Kalıp İfadeler, 5 modlu interaktif alıştırma merkezi ve akıllı A4 PDF çalışma kağıdı üreticisiyle ücretsiz Arapça pratiği yapın!";

export const SHARE_APP_URL = "https://app.muallimun.net";

export function getWhatsAppShareUrl(): string {
  return `https://wa.me/?text=${encodeURIComponent(
    SHARE_APP_TEXT + "\n\n👉 " + SHARE_APP_URL
  )}`;
}

export function getTelegramShareUrl(): string {
  return `https://t.me/share/url?url=${encodeURIComponent(
    SHARE_APP_URL
  )}&text=${encodeURIComponent(SHARE_APP_TEXT)}`;
}

export function getClipboardShareText(): string {
  return `${SHARE_APP_TEXT}\n👉 ${SHARE_APP_URL}`;
}

export async function copyAppShareToClipboard(): Promise<boolean> {
  const fullText = getClipboardShareText();
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(fullText);
      return true;
    }
  } catch {
    // Fallback below
  }

  if (typeof document !== "undefined") {
    try {
      const textarea = document.createElement("textarea");
      textarea.value = fullText;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      return true;
    } catch {
      return false;
    }
  }
  return false;
}

export function canUseNativeWebShare(): boolean {
  return (
    typeof navigator !== "undefined" && typeof navigator.share === "function"
  );
}

export async function triggerNativeAppShare(): Promise<boolean> {
  if (!canUseNativeWebShare()) return false;
  try {
    await navigator.share({
      title: SHARE_APP_TITLE,
      text: SHARE_APP_TEXT,
      url: SHARE_APP_URL,
    });
    return true;
  } catch {
    return false;
  }
}

export function triggerShareAppModal(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("open-share-app-modal"));
  }
}
