"use client";

import { useEffect, useState, useRef, useSyncExternalStore } from "react";
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
  Home,
  BookOpen,
  Gamepad2,
  BookMarked,
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

const emptySubscribe = () => () => {};

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
  const { isInstallable, isInstalled, isIOS, installApp } = usePwaInstall();

  const mounted = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  );
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [iosInstallOpen, setIosInstallOpen] = useState(false);
  const [viewMenuOpen, setViewMenuOpen] = useState(false);
  const viewMenuRef = useRef<HTMLDivElement | null>(null);

  // Mikrofon Testi Modal/Popover State & İzin Yarışı Koruması
  const [micModalOpen, setMicModalOpen] = useState(false);
  const [micStatus, setMicStatus] = useState<
    "idle" | "testing" | "ok" | "error"
  >("idle");
  const [micLevel, setMicLevel] = useState(0);
  const [micMessage, setMicMessage] = useState("");
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);
  const micTestSessionIdRef = useRef<number>(0);
  const isMountedRef = useRef<boolean>(true);

  useEffect(() => {
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

  const stopMicTest = () => {
    micTestSessionIdRef.current += 1;
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (streamRef.current) {
      try {
        streamRef.current.getTracks().forEach((t) => t.stop());
      } catch {
        // ignore
      }
      streamRef.current = null;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
    setMicLevel(0);
  };

  useEffect(() => {
    isMountedRef.current = true;
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
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        stopMicTest();
        setMicModalOpen(false);
        setMicStatus("idle");
      }
    };
    const handlePageHide = () => {
      stopMicTest();
      setMicModalOpen(false);
      setMicStatus("idle");
    };
    document.addEventListener("fullscreenchange", handleFsChange);
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pagehide", handlePageHide);
    return () => {
      isMountedRef.current = false;
      document.removeEventListener("fullscreenchange", handleFsChange);
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pagehide", handlePageHide);
      stopMicTest();
    };
  }, []);

  const startMicTest = async () => {
    stopMicTest();
    const sessionId = ++micTestSessionIdRef.current;
    setMicStatus("testing");
    setMicMessage("Mikrofona doğru Arapça bir kelime söyleyin...");
    let acquiredStream: MediaStream | null = null;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      acquiredStream = stream;
      if (
        !isMountedRef.current ||
        sessionId !== micTestSessionIdRef.current
      ) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
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
        if (
          !isMountedRef.current ||
          sessionId !== micTestSessionIdRef.current
        ) {
          return;
        }
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
      if (acquiredStream) {
        try {
          acquiredStream.getTracks().forEach((t) => t.stop());
        } catch {
          // ignore
        }
      }
      stopMicTest();
      if (isMountedRef.current && sessionId === micTestSessionIdRef.current) {
        setMicStatus("error");
        setMicMessage(
          "Mikrofon izni alınamadı. Tarayıcı adres çubuğundan mikrofon iznini kontrol edin."
        );
      }
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
      const docEl = document.documentElement as HTMLElement & {
        webkitRequestFullscreen?: () => Promise<void>;
      };
      const doc = document as Document & {
        webkitFullscreenElement?: Element | null;
        webkitExitFullscreen?: () => Promise<void>;
      };
      const isFs = Boolean(
        document.fullscreenElement || doc.webkitFullscreenElement
      );
      if (!isFs) {
        if (typeof docEl.requestFullscreen === "function") {
          await docEl.requestFullscreen();
        } else if (typeof docEl.webkitRequestFullscreen === "function") {
          await docEl.webkitRequestFullscreen();
        } else if (isIOS && !isInstalled) {
          setIosInstallOpen(true);
        }
      } else {
        if (typeof document.exitFullscreen === "function") {
          await document.exitFullscreen();
        } else if (typeof doc.webkitExitFullscreen === "function") {
          await doc.webkitExitFullscreen();
        }
      }
    } catch {
      // Desteklenmeyen iOS tarayıcılarda veya iFrame kısıtlamasında hata fırlatmadan geç
      if (isIOS && !isInstalled) {
        setIosInstallOpen(true);
      }
    }
  };

  const navLinks = [
    {
      href: "/",
      label: "Ana Sayfa",
      Icon: Home,
      tooltip: "Günlük Çalışma Planı ve Modül Merkezi",
    },
    {
      href: "/kutuphane",
      label: "Kütüphane",
      Icon: BookOpen,
      tooltip: "60 Sesli Diyalog Kütüphanesi (A1–B2)",
    },
    {
      href: "/alistirmalar",
      label: "Alıştırmalar",
      Icon: Gamepad2,
      tooltip: "5 Farklı Etkileşimli Kelime ve Cümle Alıştırması",
    },
    {
      href: "/sozluk",
      label: "Sözlük",
      Icon: BookMarked,
      tooltip: "Morfolojik Kök Ailesi ve Sesli Arapça-Türkçe Sözlük",
    },
    {
      href: "/ayarlar",
      label: "Ayarlar",
      Icon: Settings,
      tooltip: "Yazı Boyutu, Ses Motoru, Yedekleme ve Çevrimdışı Paket Ayarları",
    },
  ];

  const isHarekeOn = !mounted || showHareke;
  const currentViewMode: ViewMode = mounted ? viewMode : "stacked";
  const isDark = mounted && theme === "dark";
  const canInstall = (isInstallable || isIOS) && !isInstalled;

  return (
    <>
      <header className="fixed top-0 left-0 right-0 z-40 print:hidden w-full h-12 py-1.5 pt-[env(safe-area-inset-top)] bg-[#FDFBF7]/95 dark:bg-[var(--background)]/95 backdrop-blur-md border-b-2 border-[#E6D7BE] dark:border-[var(--border)] shadow-xs flex items-center">
        <div className="w-full max-w-6xl mx-auto px-2 sm:px-4 xl:px-6 h-full flex items-center justify-between gap-1 sm:gap-2">
          {/* SOL: Sabit Uygulama Logosu (shrink-0) + Yanında Ayrı PWA Kurulum Butonu + Masaüstü Menü */}
          <div className="flex items-center gap-1.5 sm:gap-2 min-w-0 shrink-0">
            <Link
              href="/"
              onClick={() => playClick()}
              className="flex items-center gap-1.5 sm:gap-2 group shrink-0"
              data-tooltip="Ana Sayfaya Dön"
              data-tooltip-pos="bottom"
              data-tooltip-align="left"
              aria-label="Ana Sayfaya Dön"
            >
              <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-white dark:bg-[var(--surface)] border-2 border-[#E6D7BE] dark:border-[var(--border)] border-b-3 flex items-center justify-center shrink-0 group-active:translate-y-0.5 transition-transform p-0.5">
                <img
                  src="/icons/android-chrome-192x192.png"
                  alt="Logo"
                  className="w-6 h-6 object-contain rounded-lg"
                />
              </div>
              <div className="hidden xl:block min-w-0">
                <span className="block text-xs sm:text-sm font-extrabold tracking-tight text-[var(--foreground)] truncate leading-tight">
                  Arapça Telaffuz & Diyalog
                </span>
              </div>
            </Link>

            {/* PWA Uygulamayı Kur Butonu */}
            {mounted && canInstall && (
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
                data-tooltip="Uygulamayı Bilgisayarınıza Yükleyin (İnternetsiz Çalışma Desteği)"
                data-tooltip-pos="bottom"
                data-tooltip-align="left"
                aria-label="Uygulamayı Cihaza Kur"
                className="group relative min-w-[38px] min-h-[38px] sm:min-w-[40px] sm:min-h-[40px] xl:w-auto xl:px-2.5 rounded-xl bg-[#087F5B] hover:bg-[#065F46] text-white border-b-3 border-[#065F46] active:border-b-0 active:translate-y-0.5 transition-all flex items-center justify-center gap-1 text-xs font-extrabold cursor-pointer shrink-0"
              >
                <Download size={14} className="shrink-0" />
                <span className="hidden xl:inline">Kur</span>
              </button>
            )}

            {/* Masaüstü İkonlu ve Çerçeveli Premium Navigasyon Kutusu (1024px altı tabletlerde MobileNav kullanıldığı için hidden lg:flex ile taşma 0px) */}
            <nav className="hidden lg:flex items-center gap-0.5 xl:gap-1 ml-1 bg-slate-200/50 dark:bg-slate-800/60 p-1 rounded-xl border border-slate-300/60 dark:border-slate-700/60">
              {navLinks.map((item) => {
                const isActive =
                  item.href === "/"
                    ? pathname === "/"
                    : pathname.startsWith(item.href);
                const NavIcon = item.Icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => playClick()}
                    data-tooltip={item.tooltip}
                    data-tooltip-pos="bottom"
                    className={
                      isActive
                        ? "px-2.5 py-1.5 text-xs xl:text-sm xl:px-3 rounded-lg font-bold bg-[#087F5B] text-white shadow-sm flex items-center gap-1 xl:gap-1.5 whitespace-nowrap transition-all"
                        : "px-2.5 py-1.5 text-xs xl:text-sm xl:px-3 rounded-lg font-semibold text-slate-700 dark:text-slate-300 hover:bg-white/80 dark:hover:bg-slate-700/60 hover:text-[#065F46] transition-all flex items-center gap-1 xl:gap-1.5 whitespace-nowrap"
                    }
                  >
                    <NavIcon className="w-3.5 h-3.5 shrink-0" />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </nav>
          </div>

          {/* SAĞ: 3B Dokunsal Global Hızlı Ayar İkonları */}
          <div className="flex items-center gap-1 xl:gap-1.5 shrink-0">
            {/* 1. Hareke Aç/Kapa İkonu */}
            <button
              type="button"
              onClick={() => {
                toggleHareke();
                playClick();
              }}
              data-tooltip="Harekeleri Göster / Gizle (Okuma Zorluk Ayarı)"
              data-tooltip-pos="bottom"
              aria-label="Harekeleri Göster / Gizle"
              className={`group relative min-w-[38px] min-h-[38px] sm:min-w-[40px] sm:min-h-[40px] rounded-xl border-2 border-b-3 flex items-center justify-center active:border-b-1 active:translate-y-0.5 transition-all cursor-pointer shrink-0 ${
                isHarekeOn
                  ? "bg-[#087F5B]/15 border-[#087F5B] text-[#065F46] dark:text-emerald-400"
                  : "bg-[#F7EFE1] dark:bg-[var(--surface)] border-[#E6D7BE] dark:border-[var(--border)] text-[var(--muted)] opacity-75"
              }`}
            >
              <Sparkles size={14} strokeWidth={2.4} />
            </button>

            {/* 2. Çeviri Görünümü İkonu + Popover Menü */}
            <div className="relative shrink-0" ref={viewMenuRef}>
              <button
                type="button"
                onClick={() => {
                  playClick();
                  setViewMenuOpen((o) => !o);
                }}
                data-tooltip="Türkçe Çevirileri Göster / Gizle"
                data-tooltip-pos="bottom"
                aria-label="Türkçe Çevirileri Göster / Gizle"
                className={`group relative min-w-[38px] min-h-[38px] sm:min-w-[40px] sm:min-h-[40px] rounded-xl border-2 border-b-3 flex items-center justify-center active:border-b-1 active:translate-y-0.5 transition-all cursor-pointer ${
                  currentViewMode !== "arabic-only"
                    ? "bg-[#087F5B]/15 border-[#087F5B] text-[#065F46] dark:text-emerald-400"
                    : "bg-[#F7EFE1] dark:bg-[var(--surface)] border-[#E6D7BE] dark:border-[var(--border)] text-[var(--muted)]"
                }`}
              >
                <Languages size={14} strokeWidth={2.4} />
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
                            ? "bg-[#087F5B] text-white"
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
              data-tooltip="Seslendirme Hızını Değiştir (0.5x – 1.5x)"
              data-tooltip-pos="bottom"
              aria-label="Seslendirme Hızını Değiştir"
              className="group relative min-w-[38px] min-h-[38px] sm:min-w-[40px] sm:min-h-[40px] xl:w-auto px-1 xl:px-2 rounded-xl bg-[#F7EFE1] dark:bg-[var(--surface)] border-2 border-[#E6D7BE] dark:border-[var(--border)] border-b-3 flex items-center justify-center gap-1 text-[var(--foreground)] hover:bg-[#EFE3CE] active:border-b-1 active:translate-y-0.5 transition-all cursor-pointer shrink-0"
            >
              <Gauge
                size={13}
                className="hidden xl:inline text-[#065F46] dark:text-emerald-400 shrink-0"
              />
              <span className="text-[11px] font-extrabold tabular-nums">
                {mounted ? `${speechRate}x` : "1x"}
              </span>
            </button>

            {/* 4. Tema Değiştirici (Sun / Moon) */}
            <button
              type="button"
              onClick={() => {
                toggleTheme();
                playClick();
              }}
              data-tooltip="Gece / Gündüz Görünüm Modunu Değiştir"
              data-tooltip-pos="bottom"
              aria-label="Gece / Gündüz Görünüm Modunu Değiştir"
              className="group relative min-w-[38px] min-h-[38px] sm:min-w-[40px] sm:min-h-[40px] rounded-xl bg-[#F7EFE1] dark:bg-[var(--surface)] border-2 border-[#E6D7BE] dark:border-[var(--border)] border-b-3 flex items-center justify-center text-[var(--foreground)] hover:bg-[#EFE3CE] active:border-b-1 active:translate-y-0.5 transition-all cursor-pointer shrink-0"
            >
              {isDark ? (
                <Sun size={14} strokeWidth={2.4} className="text-amber-400" />
              ) : (
                <Moon size={14} strokeWidth={2.4} className="text-[#6741D9]" />
              )}
            </button>

            {/* 5. Ses Efektleri Aç/Kapa */}
            <button
              type="button"
              onClick={() => {
                toggleSfx();
                playClick();
              }}
              data-tooltip="Arayüz Ses Efektlerini Aç / Kapat"
              data-tooltip-pos="bottom"
              aria-label="Arayüz Ses Efektlerini Aç / Kapat"
              className={`group relative hidden sm:inline-flex min-w-[38px] min-h-[38px] sm:min-w-[40px] sm:min-h-[40px] rounded-xl bg-[#F7EFE1] dark:bg-[var(--surface)] border-2 border-[#E6D7BE] dark:border-[var(--border)] border-b-3 items-center justify-center hover:bg-[#EFE3CE] active:border-b-1 active:translate-y-0.5 transition-all cursor-pointer shrink-0 ${
                mounted && sfxEnabled
                  ? "text-[#065F46] dark:text-emerald-400"
                  : "text-[var(--muted)] opacity-75"
              }`}
            >
              {mounted && sfxEnabled ? (
                <Volume2 size={14} strokeWidth={2.4} />
              ) : (
                <VolumeX size={14} strokeWidth={2.4} />
              )}
            </button>

            {/* 6. Mikrofon Testi / Gölgeleme */}
            <button
              type="button"
              onClick={handleToggleMicModal}
              data-tooltip="Serbest Telaffuz ve 38 Çiftlik Mahreç Koçunu Aç"
              data-tooltip-pos="bottom"
              data-tooltip-align="right"
              aria-label="Serbest Telaffuz ve Mahreç Koçu"
              className={`group relative min-w-[38px] min-h-[38px] sm:min-w-[40px] sm:min-h-[40px] rounded-xl border-2 border-b-3 flex items-center justify-center active:border-b-1 active:translate-y-0.5 transition-all cursor-pointer shrink-0 ${
                micModalOpen
                  ? "bg-[#F3F0FF] border-[#6741D9] text-[#6741D9]"
                  : "bg-[#F7EFE1] dark:bg-[var(--surface)] border-[#E6D7BE] dark:border-[var(--border)] text-[var(--foreground)] hover:bg-[#EFE3CE]"
              }`}
            >
              <Mic size={14} strokeWidth={2.4} />
            </button>

            {/* 7. Kullanım Kılavuzu & İnfo [❓] */}
            <button
              type="button"
              onClick={() => {
                playClick();
                triggerGuideModal("quickstart");
              }}
              data-tooltip="Uygulama Kullanım Rehberi ve İletişim / Hata Bildirimi"
              data-tooltip-pos="bottom"
              data-tooltip-align="right"
              aria-label="Uygulama Kullanım Rehberi ve İletişim / Hata Bildirimi"
              className="group relative min-w-[38px] min-h-[38px] sm:min-w-[40px] sm:min-h-[40px] rounded-xl bg-[#F3F0FF] dark:bg-[var(--lavender-bg)] border-2 border-[#6741D9] border-b-3 flex items-center justify-center text-[#6741D9] dark:text-[#d0bfff] hover:bg-[#e8e2ff] active:border-b-1 active:translate-y-0.5 transition-all cursor-pointer shrink-0"
            >
              <HelpCircle size={14} strokeWidth={2.4} />
            </button>

            {/* 8. Tam Ekran */}
            <button
              type="button"
              onClick={handleToggleFullscreen}
              data-tooltip="Tam Ekran Moduna Geç / Çık"
              data-tooltip-pos="bottom"
              data-tooltip-align="right"
              aria-label="Tam Ekran Moduna Geç / Çık"
              className="group relative hidden sm:inline-flex min-w-[38px] min-h-[38px] sm:min-w-[40px] sm:min-h-[40px] rounded-xl bg-[#F7EFE1] dark:bg-[var(--surface)] border-2 border-[#E6D7BE] dark:border-[var(--border)] border-b-3 items-center justify-center text-[var(--foreground)] hover:bg-[#EFE3CE] active:border-b-1 active:translate-y-0.5 transition-all cursor-pointer shrink-0"
            >
              {isFullscreen ? (
                <Minimize2 size={14} strokeWidth={2.4} />
              ) : (
                <Maximize2 size={14} strokeWidth={2.4} />
              )}
            </button>

            {/* 9. Ayarlar Kısayolu (Tabletlerde hızlı erişim: hidden md:flex lg:hidden) */}
            <Link
              href="/ayarlar"
              onClick={() => playClick()}
              data-tooltip="Yazı Boyutu, Ses Motoru, Yedekleme ve Çevrimdışı Paket Ayarları"
              data-tooltip-pos="bottom"
              data-tooltip-align="right"
              aria-label="Ayarlar"
              className={`hidden md:flex lg:hidden min-w-[38px] min-h-[38px] sm:min-w-[40px] sm:min-h-[40px] rounded-xl border-2 border-b-3 items-center justify-center active:border-b-1 active:translate-y-0.5 transition-all shrink-0 ${
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
              className="w-full py-2.5 px-4 rounded-xl bg-[#087F5B] text-white text-xs font-bold border-b-4 border-[#065F46]"
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
                <div className="w-9 h-9 rounded-xl bg-[#087F5B] text-white flex items-center justify-center">
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
                <span className="tabular-nums text-[#065F46] dark:text-emerald-400">%{micLevel}</span>
              </div>
              <div className="w-full h-3 bg-[#F7EFE1] dark:bg-[var(--surface)] rounded-full overflow-hidden border border-[#E6D7BE]">
                <div
                  className="h-full bg-[#087F5B] transition-all duration-75 rounded-full"
                  style={{ width: `${micLevel}%` }}
                />
              </div>
              <div className="flex items-center gap-2 text-xs font-semibold">
                {micStatus === "ok" && (
                  <CheckCircle2 size={16} className="text-[#065F46] dark:text-emerald-400 shrink-0" />
                )}
                {micStatus === "error" && (
                  <AlertCircle size={16} className="text-red-600 shrink-0" />
                )}
                <span
                  className={
                    micStatus === "ok"
                      ? "text-[#065F46] dark:text-emerald-400"
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
                className="flex-1 py-2.5 px-4 rounded-xl bg-[#087F5B] hover:bg-[#065F46] text-white text-xs font-bold border-b-4 border-[#065F46] active:border-b-0 active:translate-y-1 transition-all"
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