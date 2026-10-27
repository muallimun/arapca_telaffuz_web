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
  Sparkles,
  Languages,
  Sun,
  Moon,
  Check,
  HelpCircle,
} from "lucide-react";
import { useSfxStore } from "@/store/sfxStore";
import { useSettings, ViewMode } from "@/store/settings";
import { playClick, playSuccess } from "@/lib/sfxManager";
import { usePwaInstall } from "@/lib/usePwaInstall";
import { getArabicFontConfig } from "@/lib/arabicTextUtils";
import { triggerGuideModal } from "@/components/ui/GuideAndInfoModal";

const VIEW_MODE_LABELS: Record<ViewMode, string> = {
  stacked: "Alt Alta (Arapça + Türkçe)",
  columns: "İki Sütun (Yan Yana)",
  "arabic-only": "Sadece Arapça",
  "turkish-only": "Sadece Türkçe (Kendini Sına)",
};

export default function Header() {
  const pathname = usePathname();
  const { enabled: sfxEnabled, toggle: toggleSfx } = useSfxStore();
  const {
    theme,
    toggleTheme,
    showHareke,
    toggleHareke,
    viewMode,
    setViewMode,
    speechRate,
    cycleSpeechRate,
    arabicFont,
  } = useSettings();
  const { isInstallable, isIOS, installApp } = usePwaInstall();

  const [mounted, setMounted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [iosInstallOpen, setIosInstallOpen] = useState(false);
  const [viewMenuOpen, setViewMenuOpen] = useState(false);
  const viewMenuRef = useRef<HTMLDivElement | null>(null);

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
    const cfg = getArabicFontConfig(arabicFont);
    document.documentElement.style.setProperty(
      "--font-arabic-family",
      cfg.cssFamily
    );
    document.documentElement.style.setProperty(
      "--font-arabic-scale",
      String(cfg.scale)
    );
    document.documentElement.style.setProperty(
      "--font-arabic-line-height",
      String(cfg.lineHeight)
    );
  }, [arabicFont]);

  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    const handleClickOutside = (e: MouseEvent) => {
      if (
        viewMenuRef.current &&
        !viewMenuRef.current.contains(e.target as Node)
      ) {
        setViewMenuOpen(false);
      }
    };
    document.addEventListener("fullscreenchange", handleFsChange);
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("fullscreenchange", handleFsChange);
      document.removeEventListener("mousedown", handleClickOutside);
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

  const isHarekeOn = !mounted || showHareke;
  const currentViewMode: ViewMode = mounted ? viewMode : "stacked";
  const isDark = mounted && theme === "dark";

  return (
    <>
      <header className="fixed top-0 left-0 right-0 z-40 print:hidden w-full h-12 py-1.5 bg-[#FDFBF7]/95 dark:bg-[var(--background)]/95 backdrop-blur-md border-b-2 border-[#E6D7BE] dark:border-[var(--border)] shadow-xs flex items-center">
        <div className="w-full max-w-6xl mx-auto px-2.5 sm:px-6 h-full flex items-center justify-between gap-1.5 sm:gap-2">
          {/* SOL: 3B Dokunsal Rozetli Gerçek Logo + Başlık */}
          <div className="flex items-center gap-2 min-w-0 shrink">
            <Link
              href="/"
              onClick={() => playClick()}
              className="flex items-center gap-2 group min-w-0"
            >
              <div className="w-8 h-8 rounded-xl bg-white dark:bg-[var(--surface)] border-2 border-[#E6D7BE] dark:border-[var(--border)] border-b-3 flex items-center justify-center shrink-0 group-active:translate-y-0.5 transition-transform p-0.5">
                <img
                  src="/icons/android-chrome-192x192.png"
                  alt="Logo"
                  className="w-6 h-6 object-contain rounded-lg"
                />
              </div>
              <div className="min-w-0">
                <span className="block sm:hidden text-xs font-extrabold tracking-tight text-[var(--foreground)] truncate">
                  Arapça Diyalog
                </span>
                <span className="hidden sm:block text-xs sm:text-sm font-extrabold tracking-tight text-[var(--foreground)] truncate leading-tight">
                  Arapça Telaffuz & Diyalog
                </span>
              </div>
            </Link>

            {/* Masaüstü Hızlı Navigasyon */}
            <nav className="hidden lg:flex items-center gap-1 ml-2 bg-[#F7EFE1] dark:bg-[var(--surface)] p-0.5 rounded-xl border border-[#E6D7BE] dark:border-[var(--border)]">
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
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold whitespace-nowrap transition-all ${
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

          {/* SAĞ: 3B Dokunsal Global Hızlı Ayar İkonları */}
          <div className="flex items-center gap-1 sm:gap-1.5 shrink-0 max-w-full overflow-x-auto sm:overflow-visible no-scrollbar">
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
                className="group relative w-8 h-8 sm:w-auto sm:px-2.5 rounded-xl bg-[#0CA678] hover:bg-[#099268] text-white border-b-3 border-[#087F5B] active:border-b-0 active:translate-y-0.5 transition-all flex items-center justify-center gap-1 text-xs font-extrabold cursor-pointer shrink-0"
              >
                <Download size={14} />
                <span className="hidden xl:inline">Kur</span>
              </button>
            )}

            {/* 1. Hareke Aç/Kapa İkonu */}
            <button
              type="button"
              onClick={() => {
                toggleHareke();
                playClick();
              }}
              title={
                isHarekeOn
                  ? "Harekeler: Açık (Gizlemek için tıkla)"
                  : "Harekeler: Gizli (Göstermek için tıkla)"
              }
              aria-label="Hareke Aç/Kapa"
              className={`group relative w-8 h-8 rounded-xl border-2 border-b-3 flex items-center justify-center active:border-b-1 active:translate-y-0.5 transition-all cursor-pointer shrink-0 ${
                isHarekeOn
                  ? "bg-[#0CA678]/15 border-[#0CA678] text-[#087F5B] dark:text-[#20c997]"
                  : "bg-[#F7EFE1] dark:bg-[var(--surface)] border-[#E6D7BE] dark:border-[var(--border)] text-[var(--muted)] opacity-75"
              }`}
            >
              <Sparkles size={14} strokeWidth={2.4} />
              <span className="hidden sm:block pointer-events-none absolute -bottom-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-lg bg-[#2b241d] px-2 py-1 text-[10px] font-bold text-white opacity-0 group-hover:opacity-100 transition-opacity z-50 shadow-md">
                {isHarekeOn ? "Hareke: Açık" : "Hareke: Kapalı"}
              </span>
            </button>

            {/* 2. Çeviri Görünümü İkonu + Popover Menü */}
            <div className="relative shrink-0" ref={viewMenuRef}>
              <button
                type="button"
                onClick={() => {
                  playClick();
                  setViewMenuOpen((o) => !o);
                }}
                title={`Çeviri Görünümü: ${VIEW_MODE_LABELS[currentViewMode]}`}
                aria-label="Çeviri Görünümü"
                className={`group relative w-8 h-8 rounded-xl border-2 border-b-3 flex items-center justify-center active:border-b-1 active:translate-y-0.5 transition-all cursor-pointer ${
                  currentViewMode !== "arabic-only"
                    ? "bg-[#0CA678]/15 border-[#0CA678] text-[#087F5B] dark:text-[#20c997]"
                    : "bg-[#F7EFE1] dark:bg-[var(--surface)] border-[#E6D7BE] dark:border-[var(--border)] text-[var(--muted)]"
                }`}
              >
                <Languages size={14} strokeWidth={2.4} />
                <span className="hidden sm:block pointer-events-none absolute -bottom-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-lg bg-[#2b241d] px-2 py-1 text-[10px] font-bold text-white opacity-0 group-hover:opacity-100 transition-opacity z-50 shadow-md">
                  Çeviri: {VIEW_MODE_LABELS[currentViewMode].split(" ")[0]}
                </span>
              </button>

              {viewMenuOpen && (
                <div className="fixed inset-x-3 top-13 sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-64 max-w-[calc(100vw-1.5rem)] rounded-2xl bg-[#F7EFE1] dark:bg-[var(--surface)] border-2 border-[#E6D7BE] dark:border-[var(--border)] border-b-4 p-2 shadow-2xl z-50 space-y-1">
                  <div className="flex items-center justify-between px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wider text-[var(--muted)] border-b border-dashed border-[#E2D3B8] dark:border-[var(--border-dashed)]">
                    <span>Görünüm Modu</span>
                    <button
                      type="button"
                      onClick={() => setViewMenuOpen(false)}
                      className="sm:hidden text-[var(--muted)] hover:text-[var(--foreground)]"
                      aria-label="Menüyü Kapat"
                    >
                      <X size={13} />
                    </button>
                  </div>
                  {(Object.keys(VIEW_MODE_LABELS) as ViewMode[]).map((mode) => {
                    const active = currentViewMode === mode;
                    return (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => {
                          playClick();
                          setViewMode(mode);
                          setViewMenuOpen(false);
                        }}
                        className={`w-full px-3 py-2 rounded-xl text-xs font-bold flex items-center justify-between transition-all cursor-pointer ${
                          active
                            ? "bg-[#0CA678] text-white"
                            : "text-[var(--foreground)] hover:bg-white/70 dark:hover:bg-[var(--background)]"
                        }`}
                      >
                        <span>{VIEW_MODE_LABELS[mode]}</span>
                        {active && <Check size={14} strokeWidth={3} />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* 3. TTS Okuma Hızı */}
            <button
              type="button"
              onClick={() => {
                cycleSpeechRate();
                playClick();
              }}
              title={`Okuma Hızı: ${mounted ? speechRate : 1}x (Değiştirmek için tıkla)`}
              aria-label="TTS Okuma Hızı"
              className="group relative h-8 px-1.5 sm:px-2 rounded-xl bg-[#F7EFE1] dark:bg-[var(--surface)] border-2 border-[#E6D7BE] dark:border-[var(--border)] border-b-3 flex items-center justify-center gap-1 text-[var(--foreground)] hover:bg-[#EFE3CE] active:border-b-1 active:translate-y-0.5 transition-all cursor-pointer shrink-0"
            >
              <Gauge size={13} className="text-[#0CA678] shrink-0" />
              <span className="text-[11px] font-extrabold tabular-nums">
                {mounted ? `${speechRate}x` : "1x"}
              </span>
              <span className="hidden sm:block pointer-events-none absolute -bottom-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-lg bg-[#2b241d] px-2 py-1 text-[10px] font-bold text-white opacity-0 group-hover:opacity-100 transition-opacity z-50 shadow-md">
                Okuma Hızı ({mounted ? `${speechRate}x` : "1x"})
              </span>
            </button>

            {/* 4. Tema Değiştirici (Sun / Moon) */}
            <button
              type="button"
              onClick={() => {
                toggleTheme();
                playClick();
              }}
              title={
                isDark
                  ? "Tema: Gece Modu (Sıcak Krem temaya geç)"
                  : "Tema: Sıcak Krem (Gece moduna geç)"
              }
              aria-label="Tema Değiştir"
              className="group relative w-8 h-8 rounded-xl bg-[#F7EFE1] dark:bg-[var(--surface)] border-2 border-[#E6D7BE] dark:border-[var(--border)] border-b-3 flex items-center justify-center text-[var(--foreground)] hover:bg-[#EFE3CE] active:border-b-1 active:translate-y-0.5 transition-all cursor-pointer shrink-0"
            >
              {isDark ? (
                <Sun size={14} strokeWidth={2.4} className="text-amber-400" />
              ) : (
                <Moon size={14} strokeWidth={2.4} className="text-[#6741D9]" />
              )}
              <span className="hidden sm:block pointer-events-none absolute -bottom-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-lg bg-[#2b241d] px-2 py-1 text-[10px] font-bold text-white opacity-0 group-hover:opacity-100 transition-opacity z-50 shadow-md">
                {isDark ? "Sıcak Krem Tema" : "Gece Modu"}
              </span>
            </button>

            {/* 5. Ses Efektleri Aç/Kapa */}
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
              className={`group relative w-8 h-8 rounded-xl bg-[#F7EFE1] dark:bg-[var(--surface)] border-2 border-[#E6D7BE] dark:border-[var(--border)] border-b-3 flex items-center justify-center hover:bg-[#EFE3CE] active:border-b-1 active:translate-y-0.5 transition-all cursor-pointer shrink-0 ${
                mounted && sfxEnabled
                  ? "text-[#087F5B] dark:text-[#20c997]"
                  : "text-[var(--muted)] opacity-75"
              }`}
            >
              {mounted && sfxEnabled ? (
                <Volume2 size={14} strokeWidth={2.4} />
              ) : (
                <VolumeX size={14} strokeWidth={2.4} />
              )}
              <span className="hidden sm:block pointer-events-none absolute -bottom-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-lg bg-[#2b241d] px-2 py-1 text-[10px] font-bold text-white opacity-0 group-hover:opacity-100 transition-opacity z-50 shadow-md">
                {mounted && sfxEnabled ? "SFX: Açık" : "SFX: Kapalı"}
              </span>
            </button>

            {/* 6. Mikrofon Testi */}
            <button
              type="button"
              onClick={handleToggleMicModal}
              title="Mikrofon Testi"
              aria-label="Mikrofon Testi"
              className={`group relative w-8 h-8 rounded-xl border-2 border-b-3 flex items-center justify-center active:border-b-1 active:translate-y-0.5 transition-all cursor-pointer shrink-0 ${
                micModalOpen
                  ? "bg-[#F3F0FF] border-[#6741D9] text-[#6741D9]"
                  : "bg-[#F7EFE1] dark:bg-[var(--surface)] border-[#E6D7BE] dark:border-[var(--border)] text-[var(--foreground)] hover:bg-[#EFE3CE]"
              }`}
            >
              <Mic size={14} strokeWidth={2.4} />
              <span className="hidden sm:block pointer-events-none absolute -bottom-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-lg bg-[#2b241d] px-2 py-1 text-[10px] font-bold text-white opacity-0 group-hover:opacity-100 transition-opacity z-50 shadow-md">
                Mikrofon Testi
              </span>
            </button>

            {/* 7. Kullanım Kılavuzu & İnfo [❓] */}
            <button
              type="button"
              onClick={() => {
                playClick();
                triggerGuideModal("quickstart");
              }}
              title="Kullanım Kılavuzu & Uygulama Bilgisi (İnfo)"
              aria-label="Kullanım Kılavuzu & İnfo"
              className="group relative w-8 h-8 rounded-xl bg-[#F3F0FF] dark:bg-[var(--lavender-bg)] border-2 border-[#6741D9] border-b-3 flex items-center justify-center text-[#6741D9] dark:text-[#d0bfff] hover:bg-[#e8e2ff] active:border-b-1 active:translate-y-0.5 transition-all cursor-pointer shrink-0"
            >
              <HelpCircle size={14} strokeWidth={2.4} />
              <span className="hidden sm:block pointer-events-none absolute -bottom-8 right-0 whitespace-nowrap rounded-lg bg-[#2b241d] px-2 py-1 text-[10px] font-bold text-white opacity-0 group-hover:opacity-100 transition-opacity z-50 shadow-md">
                Kılavuz & İnfo
              </span>
            </button>

            {/* 8. Tam Ekran */}
            <button
              type="button"
              onClick={handleToggleFullscreen}
              title={isFullscreen ? "Tam Ekrandan Çık" : "Tam Ekran"}
              aria-label="Tam Ekran"
              className="group relative hidden sm:flex w-8 h-8 rounded-xl bg-[#F7EFE1] dark:bg-[var(--surface)] border-2 border-[#E6D7BE] dark:border-[var(--border)] border-b-3 items-center justify-center text-[var(--foreground)] hover:bg-[#EFE3CE] active:border-b-1 active:translate-y-0.5 transition-all cursor-pointer shrink-0"
            >
              {isFullscreen ? (
                <Minimize2 size={14} strokeWidth={2.4} />
              ) : (
                <Maximize2 size={14} strokeWidth={2.4} />
              )}
              <span className="pointer-events-none absolute -bottom-8 right-0 whitespace-nowrap rounded-lg bg-[#2b241d] px-2 py-1 text-[10px] font-bold text-white opacity-0 group-hover:opacity-100 transition-opacity z-50 shadow-md">
                {isFullscreen ? "Tam Ekrandan Çık" : "Tam Ekran"}
              </span>
            </button>

            {/* 9. Ayarlar Kısayolu (Tablet/Mobil için) */}
            <Link
              href="/ayarlar"
              onClick={() => playClick()}
              title="Ayarlar"
              aria-label="Ayarlar"
              className={`lg:hidden w-8 h-8 rounded-xl border-2 border-b-3 flex items-center justify-center active:border-b-1 active:translate-y-0.5 transition-all shrink-0 ${
                pathname === "/ayarlar"
                  ? "bg-[#F3F0FF] border-[#6741D9] text-[#6741D9]"
                  : "bg-[#F7EFE1] dark:bg-[var(--surface)] border-[#E6D7BE] dark:border-[var(--border)] text-[var(--foreground)]"
              }`}
            >
              <Settings size={14} strokeWidth={2.4} />
            </Link>
          </div>
        </div>
      </header>
      {/* Sabit İnce Topbar İçin Görünmez Yer Tutucu (Spacer) */}
      <div
        aria-hidden="true"
        className="h-12 w-full shrink-0 print:hidden"
      />

      {/* iOS KURULUM REHBERİ MODALI */}
      {iosInstallOpen && (
        <div className="fixed inset-0 z-[60] print:hidden flex items-center justify-center px-4 bg-black/50 backdrop-blur-xs">
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
        <div className="fixed inset-0 z-[60] print:hidden flex items-start justify-center pt-20 px-4 bg-black/40 backdrop-blur-xs">
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