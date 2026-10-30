"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { ArrowRight } from "lucide-react";

const INTRO_SESSION_KEY = "muallimun_intro_shown";

export default function AppIntroSplash() {
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);
  const [fadingOut, setFadingOut] = useState(false);
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    try {
      const alreadyShown = sessionStorage.getItem(INTRO_SESSION_KEY);
      if (alreadyShown) {
        return;
      }
      sessionStorage.setItem(INTRO_SESSION_KEY, "1");
    } catch {
      // sessionStorage erişilemezse yine de 1 kez göster
    }

    const enterRaf = requestAnimationFrame(() => {
      setVisible(true);
      setEntered(true);
    });

    const isDirectDialogueLink = pathname?.startsWith("/diyalog/");
    const autoDismissMs = isDirectDialogueLink ? 800 : 2000;

    const fadeTimer = setTimeout(() => {
      setFadingOut(true);
    }, autoDismissMs);

    const unmountTimer = setTimeout(() => {
      setVisible(false);
    }, autoDismissMs + 500);

    return () => {
      cancelAnimationFrame(enterRaf);
      clearTimeout(fadeTimer);
      clearTimeout(unmountTimer);
    };
  }, [pathname]);

  const handleDismiss = () => {
    try {
      sessionStorage.setItem(INTRO_SESSION_KEY, "1");
    } catch {
      // ignore
    }
    setFadingOut(true);
    setTimeout(() => {
      setVisible(false);
    }, 500);
  };

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-label="Arapça Diyalog ve Telaffuz Atölyesi Giriş Ekranı"
      className={`fixed inset-0 z-[100] print:hidden flex flex-col items-center justify-center px-6 bg-gradient-to-br from-slate-900 via-emerald-950 to-slate-900 text-white transition-all duration-500 ${
        fadingOut
          ? "opacity-0 pointer-events-none"
          : "opacity-100"
      }`}
    >
      {/* Arka Plan Hafif Parıltı Efektleri */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-72 h-72 sm:w-96 sm:h-96 rounded-full bg-emerald-500/15 blur-3xl" />
      </div>

      {/* Ana İçerik Bloku */}
      <div
        className={`relative z-10 flex flex-col items-center text-center max-w-md w-full space-y-5 transition-all duration-500 ${
          entered ? "scale-100 opacity-100" : "scale-90 opacity-0"
        }`}
      >
        {/* Uygulama Logosu */}
        <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-3xl bg-white/95 p-3 shadow-2xl shadow-emerald-500/20 ring-2 ring-emerald-400/30 flex items-center justify-center transition-transform duration-500">
          <img
            src="/icons/android-chrome-192x192.png"
            alt="Arapça Telaffuz ve Diyalog Asistanı Logosu"
            className="w-full h-full object-contain rounded-2xl"
          />
        </div>

        {/* Arapça Karşılama & Başlıklar */}
        <div className="space-y-2">
          <p
            dir="rtl"
            className="arabic text-3xl sm:text-4xl font-bold text-emerald-300 tracking-wide drop-shadow-xs"
          >
            أَهْلًا وَسَهْلًا
          </p>
          <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-white">
            Arapça Telaffuz &amp; Diyalog
          </h1>
          <p className="text-xs sm:text-sm font-medium text-emerald-200/85">
            Arapça Diyalog ve Telaffuz Atölyesi
          </p>
        </div>

        {/* İnce Yükleme Şeridi */}
        <div className="w-48 sm:w-56 h-1.5 rounded-full bg-white/10 overflow-hidden border border-emerald-400/20">
          <div
            className={`h-full rounded-full bg-gradient-to-r from-emerald-400 via-teal-300 to-emerald-500 transition-all ease-out ${
              pathname?.startsWith("/diyalog/")
                ? "duration-700"
                : "duration-[1900ms]"
            } ${entered ? "w-full" : "w-6"}`}
          />
        </div>

        {/* Başla Butonu */}
        <button
          type="button"
          onClick={handleDismiss}
          className="mt-1 px-6 py-2.5 rounded-2xl bg-emerald-500 hover:bg-emerald-400 active:translate-y-0.5 text-slate-950 font-extrabold text-xs sm:text-sm shadow-lg shadow-emerald-500/25 border-b-3 border-emerald-700 inline-flex items-center gap-2 transition-all cursor-pointer"
        >
          <span>Başla</span>
          <ArrowRight size={15} strokeWidth={2.6} />
        </button>
      </div>

      {/* Alt Kurumsal İmza */}
      <div className="absolute bottom-6 inset-x-0 text-center print:hidden">
        <span className="text-[11px] font-mono font-semibold tracking-wider text-emerald-300/75">
          www.muallimun.net
        </span>
      </div>
    </div>
  );
}
