"use client";

import Link from "next/link";
import {
  WifiOff,
  BookOpen,
  BookMarked,
  Gamepad2,
  RefreshCw,
  Home,
  Sparkles,
} from "lucide-react";

export default function OfflinePage() {
  return (
    <div className="min-h-[75vh] flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-xl bg-[#F7EFE1] dark:bg-[var(--surface)] rounded-2xl border-2 border-[#E6D7BE] dark:border-[var(--border)] border-b-4 p-5 sm:p-8 text-center space-y-5 shadow-lg">
        <div className="w-20 h-20 rounded-2xl bg-white dark:bg-[var(--background)] border-2 border-[#E6D7BE] dark:border-[var(--border)] border-b-4 flex items-center justify-center mx-auto p-2 relative">
          <img
            src="/icons/android-chrome-192x192.png"
            alt="Arapça Telaffuz ve Diyalog Asistanı"
            className="w-14 h-14 object-contain rounded-xl"
          />
          <span className="absolute -bottom-2 -right-2 w-8 h-8 rounded-full bg-amber-500 text-white border-2 border-white flex items-center justify-center shadow-xs">
            <WifiOff size={15} />
          </span>
        </div>

        <div className="space-y-2 border-b border-dashed border-[#E2D3B8] dark:border-[var(--border-dashed)] pb-4">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-800 dark:text-amber-300 text-[11px] font-extrabold">
            <Sparkles size={12} />
            PWA Akıllı Çevrimdışı Önbellek Aktif
          </span>
          <h1 className="text-xl sm:text-2xl font-extrabold text-[var(--foreground)]">
            Çevrimdışı Çalışma Modu
          </h1>
          <p className="text-xs sm:text-sm font-medium text-[var(--muted)] leading-relaxed">
            İnternet bağlantınız şu an yok; ancak daha önce ziyaret ettiğiniz{" "}
            <strong className="text-[var(--foreground)]">
              60 CEFR diyalog metni, morfolojik sözlük, ✨ kalıp ifadeler ve 5
              modlu alıştırma merkezi
            </strong>{" "}
            cihazınızın çevrimdışı önbelleğinden kesintisiz çalışmaya devam
            eder.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-left">
          <Link
            href="/kutuphane"
            className="p-3.5 rounded-2xl bg-white dark:bg-[var(--background)] border-2 border-[#E6D7BE] dark:border-[var(--border)] border-b-4 hover:border-[#0CA678] transition-all flex flex-col justify-between gap-2"
          >
            <div className="w-9 h-9 rounded-xl bg-[#0CA678]/15 text-[#087F5B] flex items-center justify-center">
              <BookOpen size={18} />
            </div>
            <div>
              <span className="block text-xs font-extrabold text-[var(--foreground)]">
                Diyalog Kütüphanesi
              </span>
              <span className="block text-[11px] text-[var(--muted)]">
                60 Diyalog & Kalıp İfadeler
              </span>
            </div>
          </Link>

          <Link
            href="/sozluk"
            className="p-3.5 rounded-2xl bg-white dark:bg-[var(--background)] border-2 border-[#E6D7BE] dark:border-[var(--border)] border-b-4 hover:border-[#0CA678] transition-all flex flex-col justify-between gap-2"
          >
            <div className="w-9 h-9 rounded-xl bg-[#6741D9]/15 text-[#6741D9] flex items-center justify-center">
              <BookMarked size={18} />
            </div>
            <div>
              <span className="block text-xs font-extrabold text-[var(--foreground)]">
                İnteraktif Sözlük
              </span>
              <span className="block text-[11px] text-[var(--muted)]">
                1075+ Kelime & Kök Analizi
              </span>
            </div>
          </Link>

          <Link
            href="/alistirmalar"
            className="p-3.5 rounded-2xl bg-white dark:bg-[var(--background)] border-2 border-[#E6D7BE] dark:border-[var(--border)] border-b-4 hover:border-[#0CA678] transition-all flex flex-col justify-between gap-2"
          >
            <div className="w-9 h-9 rounded-xl bg-amber-500/15 text-amber-700 flex items-center justify-center">
              <Gamepad2 size={18} />
            </div>
            <div>
              <span className="block text-xs font-extrabold text-[var(--foreground)]">
                Alıştırma Merkezi
              </span>
              <span className="block text-[11px] text-[var(--muted)]">
                5 Mod & Akıllı Hata Defteri
              </span>
            </div>
          </Link>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
          <Link
            href="/"
            className="py-3 px-5 rounded-2xl bg-white dark:bg-[var(--background)] border-2 border-[#E6D7BE] dark:border-[var(--border)] border-b-4 hover:border-[#0CA678] text-[var(--foreground)] font-extrabold text-xs sm:text-sm flex items-center justify-center gap-2 transition-all"
          >
            <Home size={16} className="text-[#0CA678]" />
            <span>Ana Sayfaya Dön</span>
          </Link>

          <button
            type="button"
            onClick={() => window.location.reload()}
            className="py-3 px-5 bg-[#0CA678] hover:bg-[#099268] text-white font-extrabold text-xs sm:text-sm rounded-2xl border-b-4 border-[#087F5B] active:border-b-0 active:translate-y-1 transition-all flex items-center justify-center gap-2 cursor-pointer"
          >
            <RefreshCw size={16} />
            <span>Tekrar Dene</span>
          </button>
        </div>
      </div>
    </div>
  );
}
