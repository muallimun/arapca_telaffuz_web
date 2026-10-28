"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import {
  X,
  Download,
  Share2,
  Copy,
  Check,
  Trophy,
  Sparkles,
} from "lucide-react";
import { playClick, playSuccess } from "@/lib/sfxManager";

export interface ShareAchievementProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  arabicTitle?: string;
  subtitle?: string;
  levelLabel?: string;
  scorePercent: number;
  pointsText?: string;
  wordsCount: number;
  badgeType?: "dialogue" | "exercise";
}

const APP_URL = "https://app.muallimun.net";

export default function ShareAchievementModal({
  isOpen,
  onClose,
  title,
  arabicTitle,
  subtitle,
  levelLabel = "A1-B2",
  scorePercent,
  pointsText,
  wordsCount,
  badgeType = "dialogue",
}: ShareAchievementProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [previewDataUrl, setPreviewDataUrl] = useState<string>("");
  const [copiedLink, setCopiedLink] = useState(false);
  const [sharingBusy, setSharingBusy] = useState(false);

  const shareMessage = `🎯 Arapça Telaffuz ve Diyalog Asistanı ile "${title}" çalışmamı %${scorePercent} başarı oranıyla tamamladım! (${wordsCount} Kelime • Seviye: ${levelLabel})\n👉 Hemen ücretsiz dene: ${APP_URL}`;

  const drawRoundRect = (
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    r: number
  ) => {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  };

  const renderCardToCanvas = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (typeof document !== "undefined" && "fonts" in document) {
      await document.fonts.ready;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = 1080;
    const H = 1080;
    canvas.width = W;
    canvas.height = H;

    // 1. Arka Plan (Sıcak Krem & Zümrüt Degrade Çerçeve)
    const bgGrad = ctx.createLinearGradient(0, 0, W, H);
    bgGrad.addColorStop(0, "#FDFBF7");
    bgGrad.addColorStop(0.5, "#F7EFE1");
    bgGrad.addColorStop(1, "#EFE3CE");
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, W, H);

    // Dekoratif Köşe Daireleri
    ctx.save();
    ctx.fillStyle = "rgba(12, 166, 120, 0.06)";
    ctx.beginPath();
    ctx.arc(W - 80, 100, 260, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(103, 65, 217, 0.05)";
    ctx.beginPath();
    ctx.arc(100, H - 140, 240, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Dış Çerçeve
    drawRoundRect(ctx, 36, 36, W - 72, H - 72, 42);
    ctx.lineWidth = 6;
    ctx.strokeStyle = "#E6D7BE";
    ctx.stroke();

    drawRoundRect(ctx, 50, 50, W - 100, H - 100, 34);
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#0CA678";
    ctx.stroke();

    // 2. Üst Başlık Bandı (Logo + Uygulama Adı)
    drawRoundRect(ctx, 84, 84, W - 168, 120, 28);
    ctx.fillStyle = "#FFFFFF";
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#E6D7BE";
    ctx.stroke();

    // Logo Yükleme
    try {
      const logoImg = new Image();
      logoImg.crossOrigin = "anonymous";
      await new Promise<void>((resolve) => {
        logoImg.onload = () => resolve();
        logoImg.onerror = () => resolve();
        logoImg.src = "/icons/android-chrome-192x192.png";
      });
      if (logoImg.complete && logoImg.naturalWidth > 0) {
        drawRoundRect(ctx, 108, 104, 80, 80, 20);
        ctx.fillStyle = "#F7EFE1";
        ctx.fill();
        ctx.drawImage(logoImg, 114, 110, 68, 68);
      }
    } catch {
      // ignore logo error
    }

    ctx.textAlign = "left";
    ctx.fillStyle = "#087F5B";
    ctx.font = "800 22px system-ui, -apple-system, sans-serif";
    ctx.fillText("EĞİTİM VE TELAFFUZ PLATFORMU", 208, 132);

    ctx.fillStyle = "#2B241D";
    ctx.font = "900 32px system-ui, -apple-system, sans-serif";
    ctx.fillText("Arapça Telaffuz ve Diyalog Asistanı", 208, 174);

    // 3. Altın / Zümrüt Başarı Rozeti
    ctx.textAlign = "center";
    drawRoundRect(ctx, W / 2 - 230, 236, 460, 58, 29);
    const pillGrad = ctx.createLinearGradient(W / 2 - 230, 236, W / 2 + 230, 294);
    pillGrad.addColorStop(0, "#0CA678");
    pillGrad.addColorStop(1, "#087F5B");
    ctx.fillStyle = pillGrad;
    ctx.fill();

    ctx.fillStyle = "#FFFFFF";
    ctx.font = "800 24px system-ui, -apple-system, sans-serif";
    ctx.fillText(
      badgeType === "dialogue"
        ? "🏆 DİYALOG BAŞARI BELGESİ"
        : "🏆 ALIŞTIRMA BAŞARI KARTI",
      W / 2,
      274
    );

    // 4. Ana İçerik Kartı (Tamamlanan Diyalog / Alıştırma Başlığı)
    drawRoundRect(ctx, 84, 322, W - 168, 270, 32);
    ctx.fillStyle = "#FFFFFF";
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = "#E6D7BE";
    ctx.stroke();

    // Kur Seviye Rozeti
    drawRoundRect(ctx, W / 2 - 140, 346, 280, 44, 16);
    ctx.fillStyle = "#F3F0FF";
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#6741D9";
    ctx.stroke();

    ctx.fillStyle = "#6741D9";
    ctx.font = "800 21px system-ui, -apple-system, sans-serif";
    ctx.fillText(`KUR SEVİYESİ: ${levelLabel}`, W / 2, 375);

    // Arapça Başlık (varsa)
    if (arabicTitle) {
      ctx.fillStyle = "#087F5B";
      ctx.font = "bold 46px 'Arakom', 'Noto Naskh Arabic', 'Amiri', system-ui, serif";
      ctx.fillText(arabicTitle, W / 2, 448);
    }

    // Türkçe Başlık
    ctx.fillStyle = "#2B241D";
    ctx.font = "900 38px system-ui, -apple-system, sans-serif";
    const truncatedTitle =
      title.length > 38 ? `${title.slice(0, 36)}...` : title;
    ctx.fillText(truncatedTitle, W / 2, arabicTitle ? 512 : 475);

    // Alt açıklama
    ctx.fillStyle = "#7C6F5B";
    ctx.font = "700 24px system-ui, -apple-system, sans-serif";
    ctx.fillText(
      subtitle || "Sesli Telaffuz, Kelime ve Cümle Pratiği Tamamlandı",
      W / 2,
      562
    );

    // 5. 3'lü İstatistik Kutuları (Başarı Oranı | Puan/Durum | Kelime Sayısı)
    const boxY = 622;
    const boxW = 286;
    const boxH = 195;
    const gap = 28;
    const startX = 84;

    const stats = [
      {
        label: "BAŞARI / TELAFFUZ",
        value: `%${scorePercent}`,
        sub: scorePercent >= 85 ? "Mükemmel Uyum" : "Başarılı Pratik",
        bg: "#ECFDF5",
        border: "#0CA678",
        color: "#087F5B",
      },
      {
        label: "ÇALIŞILAN KELİME",
        value: `${wordsCount}`,
        sub: "Kelime & Kalıp",
        bg: "#F3F0FF",
        border: "#6741D9",
        color: "#5230B5",
      },
      {
        label: "DEĞERLENDİRME",
        value: pointsText || `${scorePercent * 10} Puan`,
        sub: new Date().toLocaleDateString("tr-TR", {
          day: "2-digit",
          month: "long",
          year: "numeric",
        }),
        bg: "#FFFBEB",
        border: "#F59E0B",
        color: "#B45309",
      },
    ];

    stats.forEach((st, idx) => {
      const x = startX + idx * (boxW + gap);
      drawRoundRect(ctx, x, boxY, boxW, boxH, 26);
      ctx.fillStyle = st.bg;
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = st.border;
      ctx.stroke();

      ctx.fillStyle = st.color;
      ctx.font = "800 19px system-ui, -apple-system, sans-serif";
      ctx.fillText(st.label, x + boxW / 2, boxY + 46);

      ctx.font = "900 50px system-ui, -apple-system, sans-serif";
      ctx.fillText(st.value, x + boxW / 2, boxY + 116);

      ctx.fillStyle = "#5C5142";
      ctx.font = "700 20px system-ui, -apple-system, sans-serif";
      ctx.fillText(st.sub, x + boxW / 2, boxY + 162);
    });

    // 6. Alt Band (app.muallimun.net)
    drawRoundRect(ctx, 84, 852, W - 168, 136, 28);
    const footerGrad = ctx.createLinearGradient(84, 852, W - 84, 988);
    footerGrad.addColorStop(0, "#087F5B");
    footerGrad.addColorStop(1, "#0CA678");
    ctx.fillStyle = footerGrad;
    ctx.fill();

    ctx.fillStyle = "#FFFFFF";
    ctx.font = "900 36px system-ui, -apple-system, sans-serif";
    ctx.fillText("🌐 app.muallimun.net", W / 2, 912);

    ctx.fillStyle = "#D3F9D8";
    ctx.font = "700 22px system-ui, -apple-system, sans-serif";
    ctx.fillText(
      "60 Sesli Diyalog • 38 Mahreç Koçu • Morfolojik Sözlük • Alıştırmalar",
      W / 2,
      956
    );

    setPreviewDataUrl(canvas.toDataURL("image/png"));
  }, [arabicTitle, badgeType, levelLabel, pointsText, scorePercent, subtitle, title, wordsCount]);

  useEffect(() => {
    if (!isOpen) return;
    const t = setTimeout(() => {
      void renderCardToCanvas();
    }, 40);
    return () => clearTimeout(t);
  }, [isOpen, renderCardToCanvas]);

  if (!isOpen || typeof document === "undefined") return null;

  const handleDownloadPng = () => {
    playClick();
    if (!previewDataUrl) return;
    const a = document.createElement("a");
    a.href = previewDataUrl;
    a.download = "muallimun-basari-karti.png";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    playSuccess();
  };

  const handleNativeShare = async () => {
    playClick();
    if (sharingBusy) return;
    setSharingBusy(true);
    try {
      if (navigator.share && previewDataUrl) {
        const res = await fetch(previewDataUrl);
        const blob = await res.blob();
        const file = new File([blob], "muallimun-basari-karti.png", {
          type: "image/png",
        });

        const navWithCanShare = navigator as Navigator & {
          canShare?: (data?: ShareData) => boolean;
        };

        if (
          navWithCanShare.canShare &&
          navWithCanShare.canShare({ files: [file] })
        ) {
          await navigator.share({
            title: "Arapça Telaffuz ve Diyalog Asistanı — Başarı Kartım",
            text: shareMessage,
            url: APP_URL,
            files: [file],
          });
          playSuccess();
          setSharingBusy(false);
          return;
        }

        await navigator.share({
          title: "Arapça Telaffuz ve Diyalog Asistanı — Başarı Kartım",
          text: shareMessage,
          url: APP_URL,
        });
        playSuccess();
        setSharingBusy(false);
        return;
      }
      // Web Share desteklenmiyorsa görseli indir ve metni kopyala
      handleDownloadPng();
      await navigator.clipboard?.writeText(shareMessage);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    } catch {
      // Kullanıcı paylaşım penceresini kapattıysa sessizce geç
    } finally {
      setSharingBusy(false);
    }
  };

  const handleCopyShareLink = async () => {
    playClick();
    try {
      await navigator.clipboard.writeText(shareMessage);
      setCopiedLink(true);
      playSuccess();
      setTimeout(() => setCopiedLink(false), 2500);
    } catch {
      // ignore
    }
  };

  const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(shareMessage)}`;
  const telegramUrl = `https://t.me/share/url?url=${encodeURIComponent(
    APP_URL
  )}&text=${encodeURIComponent(
    `🎯 Arapça Telaffuz ve Diyalog Asistanı ile "${title}" çalışmamı %${scorePercent} başarı oranıyla tamamladım! (${wordsCount} Kelime • Seviye: ${levelLabel})`
  )}`;

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] bg-black/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg bg-[#FDFBF7] dark:bg-[var(--surface)] rounded-3xl border-2 border-[#E6D7BE] dark:border-[var(--border)] border-b-4 p-4 sm:p-5 shadow-2xl space-y-3.5 my-auto animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Üst Başlık */}
        <div className="flex items-center justify-between gap-2 border-b border-dashed border-[#E2D3B8] dark:border-[var(--border-dashed)] pb-2.5">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-amber-100 dark:bg-amber-950/60 border-2 border-amber-400 flex items-center justify-center text-amber-600 shrink-0">
              <Trophy size={18} />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-extrabold text-[var(--foreground)] leading-tight">
                Başarı Kartını Paylaş / İndir
              </h3>
              <p className="text-[11px] font-semibold text-[var(--muted)]">
                Görseli indirin veya tıklanabilir uygulama linkiyle paylaşın
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              playClick();
              onClose();
            }}
            className="w-8 h-8 rounded-xl bg-[#F7EFE1] dark:bg-[var(--background)] border border-[#E6D7BE] flex items-center justify-center text-[var(--muted)] hover:text-[var(--foreground)] cursor-pointer"
            aria-label="Kapat"
          >
            <X size={16} />
          </button>
        </div>

        {/* Gizli Yüksek Çözünürlüklü Canvas + Canlı Önizleme */}
        <canvas ref={canvasRef} className="hidden" />

        <div className="relative rounded-2xl overflow-hidden border-2 border-[#E6D7BE] dark:border-[var(--border)] bg-[#F7EFE1] shadow-inner max-h-[38vh] sm:max-h-[48vh] w-auto mx-auto flex items-center justify-center">
          {previewDataUrl ? (
            <img
              src={previewDataUrl}
              alt="Başarı Kartı Önizleme"
              className="max-h-[38vh] sm:max-h-[48vh] w-auto mx-auto object-contain"
            />
          ) : (
            <div className="flex items-center gap-2 text-xs font-bold text-[var(--muted)] py-12 px-6">
              <Sparkles size={16} className="animate-spin text-[#0CA678]" />
              <span>Başarı kartı hazırlanıyor...</span>
            </div>
          )}
        </div>

        {/* Tıklanabilir Uygulama Linki Kutusu */}
        <div className="rounded-xl bg-[#F7EFE1] dark:bg-[var(--background)] border border-[#E6D7BE] dark:border-[var(--border)] px-3 py-2 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <span className="text-[10px] font-extrabold uppercase text-[var(--muted)] block">
              Paylaşılacak Tıklanabilir Uygulama Linki
            </span>
            <a
              href={APP_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-extrabold text-[#087F5B] dark:text-[#20c997] hover:underline truncate block"
            >
              {APP_URL}
            </a>
          </div>
          <button
            type="button"
            onClick={handleCopyShareLink}
            className="px-2.5 py-1.5 rounded-xl bg-white dark:bg-[var(--surface)] border border-[#E6D7BE] text-xs font-extrabold text-[var(--foreground)] hover:border-[#0CA678] flex items-center gap-1 shrink-0 cursor-pointer"
          >
            {copiedLink ? (
              <>
                <Check size={13} className="text-[#0CA678]" />
                <span className="text-[#087F5B]">Kopyalandı</span>
              </>
            ) : (
              <>
                <Copy size={13} />
                <span>Metin + Link Kopyala</span>
              </>
            )}
          </button>
        </div>

        {/* Aksiyon Butonları */}
        <div className="space-y-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {/* 1. Paylaş (Resim + Link) */}
            <button
              type="button"
              onClick={handleNativeShare}
              disabled={sharingBusy}
              className="py-2.5 px-4 rounded-xl bg-[#0CA678] hover:bg-[#099268] text-white font-extrabold text-xs border-b-3 border-[#087F5B] active:translate-y-0.5 flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Share2 size={15} />
              <span>📲 Paylaş (Resim + Link)</span>
            </button>

            {/* 3. Görseli İndir (PNG) */}
            <button
              type="button"
              onClick={handleDownloadPng}
              className="py-2.5 px-4 rounded-xl bg-[#6741D9] hover:bg-[#5230B5] text-white font-extrabold text-xs border-b-3 border-[#3b1f8c] active:translate-y-0.5 flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Download size={15} />
              <span>📥 Görseli İndir (PNG)</span>
            </button>
          </div>

          {/* 2. WhatsApp ve Telegram Hızlı Paylaşım Butonları */}
          <div className="grid grid-cols-2 gap-2">
            <a
              href={whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => playClick()}
              className="py-2 px-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 hover:bg-emerald-100 border-2 border-emerald-400 text-emerald-800 dark:text-emerald-300 font-extrabold text-xs flex items-center justify-center gap-1.5 transition-all"
            >
              <span>💬 WhatsApp&apos;ta Paylaş</span>
            </a>

            <a
              href={telegramUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => playClick()}
              className="py-2 px-3 rounded-xl bg-sky-50 dark:bg-sky-950/50 hover:bg-sky-100 border-2 border-sky-400 text-sky-800 dark:text-sky-300 font-extrabold text-xs flex items-center justify-center gap-1.5 transition-all"
            >
              <span>✈️ Telegram&apos;da Paylaş</span>
            </a>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
