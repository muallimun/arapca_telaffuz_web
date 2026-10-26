"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Volume2,
  VolumeX,
  Gauge,
  Mic,
  Maximize2,
  Minimize2,
  Settings,
  CheckCircle2,
  AlertCircle,
  X,
  Download,
} from "lucide-react";
import { useSfxStore } from "@/store/sfxStore";
import { useSettings } from "@/store/settings";
import { playClick, playSuccess } from "@/lib/sfxManager";
import { usePwaInstall } from "@/lib/usePwaInstall";

export default function Header() {
  const pathname = usePathname();
  const { enabled: sfxEnabled, toggle: toggleSfx } = useSfxStore();
  const { theme, speechRate, cycleSpeechRate } = useSettings();
  const { isInstallable, isIOS, installApp } = usePwaInstall();

  const [mounted, setMounted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [iosInstallOpen, setIosInstallOpen] = useState(false);

  // Mikrofon Testi Modal/Popover State
  const [micModalOpen, setMicModalOpen] = useState(false);
  const [micStatus, setMicStatus] = useState<
    "idle" | "testing" | "ok" | "error"
  >("idle");
  const [micLevel, setMicLevel] = useState(0);
  const [micMessage, setMicMessage] = useState("");
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    setMounted(true);
    if (theme === "dark") document.documentElement.classList.add("dark");
    else document.documentElement.classList.remove("dark");
  }, [theme]);

  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener("fullscreenchange", handleFsChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleFsChange);
      stopMicTest();
    };
  }, []);

  const stopMicTest = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
    setMicLevel(0);
  };

  const startMicTest = async () => {
    stopMicTest();
    setMicStatus("testing");
    setMicMessage("Mikrofona doğru Arapça bir kelime söyleyin...");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      const ctx = new AC();
      audioCtxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);

      let peakDetected = false;
      const tick = () => {
        analyser.getByteFrequencyData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) sum += data[i];
        const avg = Math.min(100, Math.round((sum / data.length) * 1.8));
        setMicLevel(avg);
        if (avg > 22 && !peakDetected) {
          peakDetected = true;
          setMicStatus("ok");
          setMicMessage("Harika! Mikrofonunuz net şekilde ses alıyor.");
          playSuccess();
        }
        rafRef.current = requestAnimationFrame(tick);
      };
      tick();
    } catch {
      setMicStatus("error");
      setMicMessage(
        "Mikrofon izni alınamadı. Tarayıcı adres çubuğundan mikrofon iznini kontrol edin."
      );
    }
  };

  const handleToggleMicModal = () => {
    playClick();
    if (micModalOpen) {
      stopMicTest();
      setMicModalOpen(false);
      setMicStatus("idle");
    } else {
      setMicModalOpen(true);
      startMicTest();
    }
  };

  const handleToggleFullscreen = async () => {
    playClick();
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch {
      // iFrame kısıtlaması varsa sessizce geç
    }
  };

  const navLinks = [
    { href: "/", label: "Ana Sayfa" },
    { href: "/kutuphane", label: "Kütüphane" },
    { href: "/alistirmalar", label: "Alıştırmalar" },
    { href: "/sozluk", label: "Sözlük" },
    { href: "/ayarlar", label: "Ayarlar" },
  ];

  return (
    <>
      <header className="sticky top-0 z-50 w-full bg-[#FDFBF7]/95 dark:bg-[var(--background)]/95 backdrop-blur-md border-b-2 border-[#E6D7BE] dark:border-[var(--border)]">
        <div className="max-w-6xl mx-auto px-3 sm:px-6 h-16 flex items-center justify-between gap-3">
          {/* SOL: 3B Dokunsal Rozetli Gerçek Logo + Başlık */}
          <div className="flex items-center gap-3 min-w-0">
            <Link
              href="/"
              onClick={() => playClick()}
              className="flex items-center gap-2.5 group min-w-0"
            >
              <div className="w-10 h-10 rounded-xl bg-white dark:bg-[var(--surface)] border-2 border-[#E6D7BE] dark:border-[var(--border)] border-b-4 flex items-center justify-center shrink-0 group-active:translate-y-0.5 transition-transform p-0.5">
                <img
                  src="/icons/android-chrome-192x192.png"
                  alt="Logo"
                  className="w-8 h-8 object-contain rounded-lg"
                />
              </div>
              <div className="min-w-0">
                <span className="block text-sm sm:text-base font-extrabold tracking-tight text-[var(--foreground)] truncate">
                  Arapça Telaffuz & Diyalog
                </span>
                <span className="hidden sm:block text-[11px] font-semibold text-[var(--muted)] truncate">
                  İnteraktif Konuşma, Mahreç ve Sözlük Asistanı
                </span>
              </div>
            </Link>

            {/* Masaüstü Hızlı Navigasyon */}
            <nav className="hidden lg:flex items-center gap-1 ml-4 bg-[#F7EFE1] dark:bg-[var(--surface)] p-1 rounded-xl border border-[#E6D7BE] dark:border-[var(--border)]">
              {navLinks.map((item) => {
                const isActive =
                  item.href === "/"
                    ? pathname === "/"
                    : pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => playClick()}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all ${
                      isActive
                        ? "bg-[#0CA678] text-white shadow-xs"
                        : "text-[var(--muted)] hover:text-[var(--foreground)]"
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>

          {/* SAĞ: 3B Dokunsal Kontrol Butonları */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {/* PWA Uygulamayı Kur Butonu */}
            {mounted && (isInstallable || isIOS) && (
              <button
                type="button"
                onClick={async () => {
                  playClick();
                  if (isInstallable) {
                    await installApp();
                  } else if (isIOS) {
                    setIosInstallOpen(true);
                  }
                }}
                title="Uygulamayı Cihaza Kur"
                className="h-10 px-2.5 sm:px-3 rounded-xl bg-[#0CA678] hover:bg-[#099268] text-white border-b-4 border-[#087F5B] active:border-b-0 active:translate-y-0.5 transition-all flex items-center gap-1.5 text-xs font-extrabold cursor-pointer"
              >
                <Download size={15} />
                <span className="hidden md:inline">Uygulamayı Kur</span>
              </button>
            )}

            {/* 1. Ses Efektleri Aç/Kapa */}
            <button
              type="button"
              onClick={() => {
                toggleSfx();
                playClick();
              }}
              title={
                mounted && sfxEnabled
                  ? "Ses Efektleri: Açık (Kapatmak için tıkla)"
                  : "Ses Efektleri: Kapalı (Açmak için tıkla)"
              }
              aria-label="Ses Efektleri Aç/Kapa"
              className={`relative h-10 px-2.5 sm:w-10 sm:px-0 rounded-xl bg-[#F7EFE1] dark:bg-[var(--surface)] border-2 border-[#E6D7BE] dark:border-[var(--border)] border-b-4 flex items-center justify-center hover:bg-[#EFE3CE] active:border-b-2 active:translate-y-0.5 transition-all ${
                mounted && sfxEnabled
                  ? "text-[#087F5B] dark:text-[#20c997]"
                  : "text-[var(--muted)] opacity-75"
              }`}
            >
              {mounted && sfxEnabled ? (
                <Volume2 size={18} strokeWidth={2.4} />
              ) : (
                <VolumeX size={18} strokeWidth={2.4} />
              )}
            </button>

            {/* 2. TTS Okuma Hızı */}
            <button
              type="button"
              onClick={() => {
                cycleSpeechRate();
                playClick();
              }}
              title={`TTS Okuma Hızı: ${mounted ? speechRate : 1}x (Değiştirmek için tıkla)`}
              aria-label="TTS Okuma Hızı"
              className="h-10 px-2.5 rounded-xl bg-[#F7EFE1] dark:bg-[var(--surface)] border-2 border-[#E6D7BE] dark:border-[var(--border)] border-b-4 flex items-center justify-center gap-1 text-[var(--foreground)] hover:bg-[#EFE3CE] active:border-b-2 active:translate-y-0.5 transition-all"
            >
              <Gauge size={16} className="text-[#0CA678] shrink-0" />
              <span className="text-xs font-extrabold tabular-nums">
                {mounted ? `${speechRate}x` : "1x"}
              </span>
            </button>

            {/* 3. Mikrofon Testi */}
            <button
              type="button"
              onClick={handleToggleMicModal}
              title="Mikrofon Testi"
              aria-label="Mikrofon Testi"
              className={`h-10 w-10 rounded-xl border-2 border-b-4 flex items-center justify-center active:border-b-2 active:translate-y-0.5 transition-all ${
                micModalOpen
                  ? "bg-[#F3F0FF] border-[#6741D9] text-[#6741D9]"
                  : "bg-[#F7EFE1] dark:bg-[var(--surface)] border-[#E6D7BE] dark:border-[var(--border)] text-[var(--foreground)] hover:bg-[#EFE3CE]"
              }`}
            >
              <Mic size={18} strokeWidth={2.4} />
            </button>

            {/* 4. Tam Ekran */}
            <button
              type="button"
              onClick={handleToggleFullscreen}
              title={isFullscreen ? "Tam Ekrandan Çık" : "Tam Ekran"}
              aria-label="Tam Ekran"
              className="hidden sm:flex h-10 w-10 rounded-xl bg-[#F7EFE1] dark:bg-[var(--surface)] border-2 border-[#E6D7BE] dark:border-[var(--border)] border-b-4 items-center justify-center text-[var(--foreground)] hover:bg-[#EFE3CE] active:border-b-2 active:translate-y-0.5 transition-all"
            >
              {isFullscreen ? (
                <Minimize2 size={17} strokeWidth={2.4} />
              ) : (
                <Maximize2 size={17} strokeWidth={2.4} />
              )}
            </button>

            {/* 5. Ayarlar Kısayolu (Tablet/Mobil için) */}
            <Link
              href="/ayarlar"
              onClick={() => playClick()}
              title="Ayarlar"
              aria-label="Ayarlar"
              className={`lg:hidden h-10 w-10 rounded-xl border-2 border-b-4 flex items-center justify-center active:border-b-2 active:translate-y-0.5 transition-all ${
                pathname === "/ayarlar"
                  ? "bg-[#F3F0FF] border-[#6741D9] text-[#6741D9]"
                  : "bg-[#F7EFE1] dark:bg-[var(--surface)] border-[#E6D7BE] dark:border-[var(--border)] text-[var(--foreground)]"
              }`}
            >
              <Settings size={18} strokeWidth={2.4} />
            </Link>
          </div>
        </div>
      </header>

      {/* iOS KURULUM REHBERİ MODALI */}
      {iosInstallOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/50 backdrop-blur-xs">
          <div className="w-full max-w-sm bg-[#F7EFE1] dark:bg-[var(--surface)] rounded-2xl border-2 border-[#E6D7BE] dark:border-[var(--border)] border-b-4 p-5 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-dashed border-[#E2D3B8] pb-3">
              <div className="flex items-center gap-2.5">
                <img
                  src="/icons/android-chrome-192x192.png"
                  alt="Logo"
                  className="w-8 h-8 object-contain rounded-lg"
                />
                <h3 className="text-sm font-extrabold text-[var(--foreground)]">
                  iPhone / iPad Ana Ekrana Ekle
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIosInstallOpen(false)}
                className="w-8 h-8 rounded-lg bg-white dark:bg-[var(--background)] border border-[#E6D7BE] flex items-center justify-center text-[var(--muted)]"
              >
                <X size={15} />
              </button>
            </div>
            <p className="text-xs font-semibold text-[var(--foreground)] leading-relaxed">
              1. Safari alt çubuğundaki <strong>Paylaş</strong> simgesine dokunun.
              <br />
              2. Listeyi aşağı kaydırıp <strong>Ana Ekrana Ekle</strong> seçeneğine basın.
            </p>
            <button
              type="button"
              onClick={() => setIosInstallOpen(false)}
              className="w-full py-2.5 px-4 rounded-xl bg-[#0CA678] text-white text-xs font-bold border-b-4 border-[#087F5B]"
            >
              Anladım
            </button>
          </div>
        </div>
      )}

      {/* MİKROFON TESTİ PANELİ */}
      {micModalOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 px-4 bg-black/40 backdrop-blur-xs">
          <div className="w-full max-w-md bg-[#F7EFE1] dark:bg-[var(--surface)] rounded-2xl border-2 border-[#E6D7BE] dark:border-[var(--border)] border-b-4 p-5 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-dashed border-[#E2D3B8] pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-[#0CA678] text-white flex items-center justify-center">
                  <Mic size={18} />
                </div>
                <div>
                  <h3 className="text-sm font-extrabold text-[var(--foreground)]">
                    Mikrofon ve Ses Seviyesi Testi
                  </h3>
                  <p className="text-xs text-[var(--muted)]">
                    Gölgeleme çalışmaları öncesi mikrofonunuzu doğrulayın
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleToggleMicModal}
                className="w-8 h-8 rounded-lg bg-white dark:bg-[var(--background)] border border-[#E6D7BE] flex items-center justify-center text-[var(--muted)] hover:text-[var(--foreground)]"
              >
                <X size={16} />
              </button>
            </div>

            {/* Canlı Ses Seviyesi Çubuğu */}
            <div className="bg-white dark:bg-[var(--background)] rounded-xl p-4 border border-[#E6D7BE] dark:border-[var(--border)] space-y-3">
              <div className="flex items-center justify-between text-xs font-bold">
                <span className="text-[var(--muted)]">Giriş Sinyali</span>
                <span className="tabular-nums text-[#087F5B]">%{micLevel}</span>
              </div>
              <div className="w-full h-3 bg-[#F7EFE1] dark:bg-[var(--surface)] rounded-full overflow-hidden border border-[#E6D7BE]">
                <div
                  className="h-full bg-[#0CA678] transition-all duration-75 rounded-full"
                  style={{ width: `${micLevel}%` }}
                />
              </div>
              <div className="flex items-center gap-2 text-xs font-semibold">
                {micStatus === "ok" && (
                  <CheckCircle2 size={16} className="text-[#0CA678] shrink-0" />
                )}
                {micStatus === "error" && (
                  <AlertCircle size={16} className="text-red-600 shrink-0" />
                )}
                <span
                  className={
                    micStatus === "ok"
                      ? "text-[#087F5B]"
                      : micStatus === "error"
                      ? "text-red-600"
                      : "text-[var(--muted)]"
                  }
                >
                  {micMessage}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={startMicTest}
                className="flex-1 py-2.5 px-4 rounded-xl bg-white dark:bg-[var(--background)] border-2 border-[#E6D7BE] border-b-4 text-xs font-bold text-[var(--foreground)] hover:bg-[#FDFBF7] active:border-b-2 active:translate-y-0.5 transition-all"
              >
                Yeniden Test Et
              </button>
              <button
                type="button"
                onClick={handleToggleMicModal}
                className="flex-1 py-2.5 px-4 rounded-xl bg-[#0CA678] hover:bg-[#099268] text-white text-xs font-bold border-b-4 border-[#087F5B] active:border-b-0 active:translate-y-1 transition-all"
              >
                Tamam
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}