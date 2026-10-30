"use client";

import { useState, useEffect } from "react";
import {
  X,
  Share2,
  Copy,
  Check,
  Smartphone,
  MessageCircle,
  Send,
  ExternalLink,
} from "lucide-react";
import { playClick, playSuccess } from "@/lib/sfxManager";
import {
  SHARE_APP_TITLE,
  SHARE_APP_TEXT,
  SHARE_APP_URL,
  getWhatsAppShareUrl,
  getTelegramShareUrl,
  copyAppShareToClipboard,
  canUseNativeWebShare,
  triggerNativeAppShare,
  triggerShareAppModal,
} from "@/lib/shareApp";

export function FooterShareButton() {
  return (
    <button
      type="button"
      onClick={() => {
        playClick();
        triggerShareAppModal();
      }}
      data-tooltip="Uygulamayı Paylaş"
      data-tooltip-pos="top"
      data-tooltip-align="right"
      aria-label="Uygulamayı Paylaş"
      className="w-8 h-8 rounded-lg flex items-center justify-center bg-white dark:bg-slate-800 border border-stone-200/80 dark:border-slate-700 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 hover:border-indigo-300 transition-all shadow-xs cursor-pointer shrink-0"
    >
      <Share2 className="w-4 h-4" />
    </button>
  );
}

export default function ShareAppModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [supportsWebShare, setSupportsWebShare] = useState(false);

  useEffect(() => {
    setSupportsWebShare(canUseNativeWebShare());

    const handleOpen = () => {
      setCopied(false);
      setIsOpen(true);
    };
    window.addEventListener("open-share-app-modal", handleOpen);
    return () => window.removeEventListener("open-share-app-modal", handleOpen);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsOpen(false);
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [isOpen]);

  if (!isOpen) return null;

  const handleCopy = async () => {
    playClick();
    const ok = await copyAppShareToClipboard();
    if (ok) {
      playSuccess();
      setCopied(true);
      setTimeout(() => {
        setCopied(false);
      }, 2000);
    }
  };

  const handleNativeShare = async () => {
    playClick();
    await triggerNativeAppShare();
  };

  return (
    <div
      className="fixed inset-0 z-[70] print:hidden bg-black/65 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4"
      onClick={() => setIsOpen(false)}
    >
      <div
        className="w-[95vw] max-w-lg bg-[#FDFBF7] dark:bg-[var(--surface)] rounded-3xl border-2 border-[#E6D7BE] dark:border-[var(--border)] border-b-4 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ÜST BAŞLIK */}
        <div className="bg-[#F7EFE1] dark:bg-[var(--background)] px-5 py-4 border-b-2 border-[#E6D7BE] dark:border-[var(--border)] flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#0CA678] to-[#6741D9] border-b-3 border-[#087F5B] text-white flex items-center justify-center shrink-0">
              <Share2 size={20} />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-extrabold text-[var(--foreground)] leading-tight">
                Uygulamayı Paylaş &amp; Arkadaşına Öner
              </h2>
              <p className="text-xs font-semibold text-[var(--muted)]">
                Öğrencilerinizle, arkadaşlarınızla ve çalışma gruplarınızla paylaşın
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              playClick();
              setIsOpen(false);
            }}
            className="w-9 h-9 rounded-xl bg-white dark:bg-[var(--surface)] border-2 border-[#E6D7BE] dark:border-[var(--border)] flex items-center justify-center text-[var(--muted)] hover:text-[var(--foreground)] cursor-pointer shrink-0"
            aria-label="Kapat"
          >
            <X size={18} />
          </button>
        </div>

        {/* GÖVDE */}
        <div className="p-4 sm:p-5 space-y-4">
          {/* PAYLAŞIM METNİ ÖNİZLEME KARTI */}
          <div className="p-3.5 rounded-2xl bg-[#F7EFE1] dark:bg-[var(--background)] border-2 border-[#E6D7BE] dark:border-[var(--border)] space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-extrabold text-[#087F5B] dark:text-emerald-300">
                {SHARE_APP_TITLE}
              </span>
              <span className="px-2 py-0.5 rounded-md bg-white dark:bg-[var(--surface)] border border-[#E6D7BE] dark:border-[var(--border)] text-[10px] font-extrabold text-[#6741D9] dark:text-[#d0bfff]">
                Ücretsiz Eğitim PWA
              </span>
            </div>
            <p className="text-xs text-[var(--foreground)] font-medium leading-relaxed">
              {SHARE_APP_TEXT}
            </p>
            <div className="pt-1 flex items-center gap-1.5 text-xs font-extrabold text-[#0CA678]">
              <ExternalLink size={13} />
              <span>👉 {SHARE_APP_URL}</span>
            </div>
          </div>

          {/* 4 HIZLI PAYLAŞIM AKSİYONU */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {/* 1. WhatsApp'ta Paylaş */}
            <a
              href={getWhatsAppShareUrl()}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => playClick()}
              className="py-3 px-4 rounded-2xl bg-[#0CA678] hover:bg-[#099268] text-white font-extrabold text-xs sm:text-sm border-b-4 border-[#087F5B] active:border-b-0 active:translate-y-0.5 transition-all flex items-center justify-center gap-2 shadow-xs"
            >
              <MessageCircle size={17} className="shrink-0" />
              <span>💬 WhatsApp&apos;ta Paylaş</span>
            </a>

            {/* 2. Telegram'da Paylaş */}
            <a
              href={getTelegramShareUrl()}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => playClick()}
              className="py-3 px-4 rounded-2xl bg-sky-600 hover:bg-sky-700 text-white font-extrabold text-xs sm:text-sm border-b-4 border-sky-800 active:border-b-0 active:translate-y-0.5 transition-all flex items-center justify-center gap-2 shadow-xs"
            >
              <Send size={16} className="shrink-0" />
              <span>✈️ Telegram&apos;da Paylaş</span>
            </a>

            {/* 3. Bağlantıyı ve Tanıtımı Kopyala */}
            <button
              type="button"
              onClick={handleCopy}
              className={`py-3 px-4 rounded-2xl font-extrabold text-xs sm:text-sm border-2 border-b-4 active:border-b-2 active:translate-y-0.5 transition-all flex items-center justify-center gap-2 cursor-pointer ${
                copied
                  ? "bg-emerald-600 text-white border-emerald-800"
                  : "bg-white dark:bg-[var(--background)] text-[var(--foreground)] border-[#E6D7BE] dark:border-[var(--border)] hover:border-[#0CA678]"
              } ${supportsWebShare ? "" : "sm:col-span-2"}`}
            >
              {copied ? (
                <>
                  <Check size={17} className="shrink-0" />
                  <span>✅ Kopyalandı!</span>
                </>
              ) : (
                <>
                  <Copy size={16} className="text-[#6741D9] shrink-0" />
                  <span>📋 Bağlantıyı ve Tanıtımı Kopyala</span>
                </>
              )}
            </button>

            {/* 4. Cihazda Paylaş (Web Share API) */}
            {supportsWebShare && (
              <button
                type="button"
                onClick={handleNativeShare}
                className="py-3 px-4 rounded-2xl bg-[#6741D9] hover:bg-[#5230B5] text-white font-extrabold text-xs sm:text-sm border-b-4 border-[#3b1f8c] active:border-b-0 active:translate-y-0.5 transition-all flex items-center justify-center gap-2 cursor-pointer shadow-xs"
              >
                <Smartphone size={17} className="shrink-0" />
                <span>📲 Cihazda Paylaş</span>
              </button>
            )}
          </div>
        </div>

        {/* ALT BAR */}
        <div className="bg-[#F7EFE1] dark:bg-[var(--background)] px-5 py-3 border-t-2 border-[#E6D7BE] dark:border-[var(--border)] flex items-center justify-between gap-2">
          <span className="text-[11px] font-semibold text-[var(--muted)]">
            İlmin yayılmasına katkınız için teşekkür ederiz.
          </span>
          <button
            type="button"
            onClick={() => {
              playClick();
              setIsOpen(false);
            }}
            className="h-8 px-4 rounded-xl bg-white dark:bg-[var(--surface)] border border-[#E6D7BE] dark:border-[var(--border)] text-xs font-extrabold text-[var(--foreground)] hover:border-[#0CA678] cursor-pointer"
          >
            Kapat
          </button>
        </div>
      </div>
    </div>
  );
}
