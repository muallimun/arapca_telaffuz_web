"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Type,
  Monitor,
  Eye,
  ChevronLeft,
  Mic,
  Volume2,
  BookOpen,
  Sparkles,
  Gauge,
  Check,
  Database,
  Download,
  Upload,
  Trash2,
  Smartphone,
  Flame,
  CheckCircle2,
  AlertTriangle,
  HelpCircle,
  Target,
  Repeat,
  Timer,
  Share2,
} from "lucide-react";
import {
  useSettings,
  ViewMode,
  SpeechRate,
  ArabicFontSizePreset,
  WordTrackingStyle,
  DialogueLoopCount,
  SentenceLoopCount,
  PauseBetweenLines,
} from "@/store/settings";
import { useSfxStore } from "@/store/sfxStore";
import { useUserStore } from "@/store/userStore";
import { usePwaInstall } from "@/lib/usePwaInstall";
import { playClick, playSuccess } from "@/lib/sfxManager";
import { playTTS, loadAudioManifest } from "@/lib/audio";
import { diyaloglar } from "@/lib/data";
import {
  getDownloadedDialogueIds,
  downloadAllDialoguesOffline,
  clearOfflineAudioCache,
} from "@/lib/offlineManager";
import {
  ARABIC_FONT_OPTIONS,
  ARABIC_FONT_SIZE_PRESETS,
  formatArabicText,
  getArabicFontConfig,
} from "@/lib/arabicTextUtils";
import { triggerGuideModal } from "@/components/ui/GuideAndInfoModal";
import { triggerOnboardingTour } from "@/components/ui/OnboardingTourModal";
import { triggerShareAppModal } from "@/lib/shareApp";

type SettingsCategory = "all" | "appearance" | "audio" | "data";

export default function SettingsPage() {
  const {
    theme,
    setTheme,
    viewMode,
    setViewMode,
    showHareke,
    setShowHareke,
    showTooltips,
    setShowTooltips,
    showShadowing,
    setShowShadowing,
    arabicFont,
    setArabicFont,
    arabicFontSize,
    arabicFontSizePreset,
    setArabicFontSize,
    turkishFontSize,
    setTurkishFontSize,
    speechRate,
    setSpeechRate,
    wordTrackingStyle,
    setWordTrackingStyle,
    dialogueLoopCount,
    setDialogueLoopCount,
    sentenceLoopCount,
    setSentenceLoopCount,
    pauseBetweenLines,
    setPauseBetweenLines,
  } = useSettings();

  const { enabled: sfxEnabled, setEnabled: setSfxEnabled } = useSfxStore();
  const {
    streakDays,
    dailyGoalMinutes,
    setDailyGoalMinutes,
    exportProgress,
    importProgress,
    restoreLastAutoBackup,
    resetProgress,
  } = useUserStore();
  const { isInstallable, isInstalled, isIOS, installApp } = usePwaInstall();

  const [mounted, setMounted] = useState(false);
  const [activeCategory, setActiveCategory] =
    useState<SettingsCategory>("all");
  const [confirmReset, setConfirmReset] = useState(false);
  const [importMode, setImportMode] = useState<"merge" | "overwrite">("merge");
  const [hasAutoBackup, setHasAutoBackup] = useState(false);
  const [dataMessage, setDataMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [showIosGuide, setShowIosGuide] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Çevrimdışı İndirilen Dersler (Cache API) State
  const [offlineDownloadedIds, setOfflineDownloadedIds] = useState<string[]>(
    []
  );
  const [isDownloadingAllOffline, setIsDownloadingAllOffline] =
    useState<boolean>(false);
  const [offlineAllProgressPct, setOfflineAllProgressPct] = useState<number>(0);

  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      setMounted(true);
      try {
        setHasAutoBackup(
          Boolean(localStorage.getItem("arabic_app_backup_before_import"))
        );
      } catch {
        setHasAutoBackup(false);
      }
    });
    if (theme === "dark") document.documentElement.classList.add("dark");
    else document.documentElement.classList.remove("dark");
    void loadAudioManifest().then(() => {
      void getDownloadedDialogueIds().then((ids) =>
        setOfflineDownloadedIds(ids)
      );
    });
    return () => cancelAnimationFrame(raf);
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

  if (!mounted) return null;

  const handleExportBackup = () => {
    playClick();
    try {
      const jsonStr = exportProgress();
      const blob = new Blob([jsonStr], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const dateStr = new Date().toISOString().slice(0, 10);
      const a = document.createElement("a");
      a.href = url;
      a.download = `arapca-telaffuz-yedek-${dateStr}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setDataMessage({
        type: "success",
        text: "İlerleme verileriniz .json dosyası olarak başarıyla indirildi.",
      });
    } catch {
      setDataMessage({
        type: "error",
        text: "Yedek dosyası oluşturulurken bir hata meydana geldi.",
      });
    }
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      setDataMessage({
        type: "error",
        text: "Dosya boyutu çok büyük (en fazla 2 MB .json yedek dosyası yüklenebilir).",
      });
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const content = typeof reader.result === "string" ? reader.result : "";
      const ok = importProgress(content, importMode);
      if (ok) {
        playClick();
        setHasAutoBackup(true);
        setDataMessage({
          type: "success",
          text:
            importMode === "merge"
              ? "Yedek dosyası mevcut ilerlemenizle güvenli biçimde birleştirildi!"
              : "Yedek dosyası başarıyla yüklendi ve tüm ilerlemeniz geri getirildi!",
        });
      } else {
        setDataMessage({
          type: "error",
          text: "Geçersiz veya bozuk yedek dosyası. Lütfen doğru .json dosyasını seçin.",
        });
      }
      if (fileInputRef.current) fileInputRef.current.value = "";
    };
    reader.readAsText(file);
  };

  const handleRestoreAutoBackup = () => {
    playClick();
    const ok = restoreLastAutoBackup();
    if (ok) {
      setDataMessage({
        type: "success",
        text: "İçe aktarma öncesi alınan otomatik yedek başarıyla geri yüklendi!",
      });
    } else {
      setDataMessage({
        type: "error",
        text: "Geri yüklenecek otomatik yedek kaydı bulunamadı.",
      });
    }
  };

  const handleResetConfirmed = () => {
    playClick();
    resetProgress();
    setConfirmReset(false);
    setDataMessage({
      type: "success",
      text: "Tüm çalışma geçmişiniz ve kelime ilerlemeniz sıfırlandı.",
    });
  };

  const viewModes: { id: ViewMode; label: string; desc: string }[] = [
    {
      id: "stacked",
      label: "Alt Alta Görünüm",
      desc: "Arapça cümle üstte, Türkçe çeviri hemen altında",
    },
    {
      id: "columns",
      label: "İki Sütun Yan Yana",
      desc: "Masaüstünde Arapça ve Türkçe karşılıklı sütunlarda",
    },
    {
      id: "arabic-only",
      label: "Sadece Arapça",
      desc: "Türkçe çeviriyi gizleyerek doğrudan Arapça okuma",
    },
    {
      id: "turkish-only",
      label: "Sadece Türkçe",
      desc: "Arapçayı gizleyerek Türkçe anlam üzerinden kendinizi sınayın",
    },
  ];

  const turkishSizes = [
    { label: "Küçük", value: 14 },
    { label: "Orta", value: 16 },
    { label: "Büyük", value: 18 },
    { label: "Çok Büyük", value: 20 },
  ];

  const categoryTabs: { id: SettingsCategory; label: string }[] = [
    { id: "all", label: "✨ Tümü" },
    { id: "appearance", label: "🔤 Yazı Tipi & Görünüm" },
    { id: "audio", label: "🔊 Ses & Gölgeleme" },
    { id: "data", label: "💾 Hedef & Veri" },
  ];

  const rawSampleArabic =
    "أَسْتَوْدِعُكِ اللّٰهَ يَا أُمِّي، وَأَسْتَوْدِعُكَ اللّٰهَ يَا أَبِي.";
  const sampleArabic = formatArabicText(rawSampleArabic, showHareke, arabicFont);
  const activeFontCfg = getArabicFontConfig(arabicFont);

  const showAppearance =
    activeCategory === "all" || activeCategory === "appearance";
  const showAudio = activeCategory === "all" || activeCategory === "audio";
  const showData = activeCategory === "all" || activeCategory === "data";

  return (
    <div className="space-y-4 overflow-x-hidden">
      {/* ÜST BAŞLIK + HIZLI KATEGORİ FİLTRE SEKMELERİ */}
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              onClick={() => playClick()}
              className="w-10 h-10 rounded-xl bg-[#F7EFE1] dark:bg-[var(--surface)] border-2 border-[#E6D7BE] dark:border-[var(--border)] border-b-4 flex items-center justify-center text-[var(--foreground)] hover:bg-[#EFE3CE] active:border-b-2 active:translate-y-0.5 transition-all shrink-0"
              aria-label="Ana Sayfaya Dön"
            >
              <ChevronLeft size={20} strokeWidth={2.5} />
            </Link>
            <div>
              <h1 className="text-xl sm:text-2xl font-extrabold text-[var(--foreground)] tracking-tight">
                Uygulama ve Okuma Ayarları
              </h1>
              <p className="text-xs font-medium text-[var(--muted)]">
                Arapça yazı tipi (font), hareke, ses hızı ve diyalog görünüm
                tercihlerinizi özelleştirin
              </p>
            </div>
          </div>
        </div>

        {/* Hızlı Kategori Filtre Sekmeleri */}
        <div className="flex flex-wrap gap-1.5 bg-[#F7EFE1] dark:bg-[var(--surface)] p-1.5 rounded-2xl border-2 border-[#E6D7BE] dark:border-[var(--border)]">
          {categoryTabs.map((tab) => {
            const isSelected = activeCategory === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  playClick();
                  setActiveCategory(tab.id);
                }}
                className={`px-3.5 py-2 rounded-xl text-xs font-extrabold transition-all whitespace-nowrap cursor-pointer ${
                  isSelected
                    ? "bg-[#0CA678] text-white shadow-xs"
                    : "bg-white/75 dark:bg-[var(--background)] text-[var(--muted)] hover:text-[var(--foreground)]"
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* 0. KULLANIM KILAVUZU, İKON REHBERİ & TANITIM TURU KARTI (Çift İkon Temizlenmiş) */}
      <section className="bg-[#F3F0FF] dark:bg-[var(--lavender-bg)] rounded-2xl border-2 border-[#6741D9] border-b-4 p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-start sm:items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#6741D9] text-white flex items-center justify-center shrink-0">
            <HelpCircle size={20} />
          </div>
          <div>
            <h2 className="text-sm sm:text-base font-extrabold text-[#4C28B5] dark:text-[#d0bfff]">
              Kullanım Kılavuzu, İkon Rehberi &amp; Tanıtım Turu
            </h2>
            <p className="text-xs font-medium text-[var(--muted)]">
              Uygulamadaki tüm ikonların anlamlarını, 5 adımlı verimli çalışma
              yöntemini ve etkileşimli tanıtım turunu inceleyin
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => {
              playClick();
              triggerGuideModal("quickstart");
            }}
            className="h-9 px-3.5 rounded-xl bg-white dark:bg-[var(--surface)] border-2 border-[#6741D9] border-b-3 text-xs font-extrabold text-[#4C28B5] dark:text-[#d0bfff] hover:bg-[#FDFBF7] flex items-center gap-1.5 cursor-pointer"
          >
            <BookOpen size={14} />
            <span>Kılavuzu Aç</span>
          </button>

          <button
            type="button"
            onClick={() => {
              playClick();
              triggerOnboardingTour();
            }}
            className="h-9 px-3.5 rounded-xl bg-[#6741D9] hover:bg-[#5230B5] text-white text-xs font-extrabold border-b-3 border-[#3b1f8c] flex items-center gap-1.5 cursor-pointer"
          >
            <Target size={14} />
            <span>Tanıtım Turunu Başlat</span>
          </button>
        </div>
      </section>

      {/* KATEGORİ 1: YAZI TİPİ, OKUMA, HAREKE & GÖRÜNÜM TERCİHLERİ */}
      {showAppearance && (
        <>
          {/* 1A. ARAPÇA YAZI TİPİ (FONT) VE BOYUTU + CANLI TİPOGRAFİ ÖNİZLEME */}
          <section className="bg-[#F7EFE1] dark:bg-[var(--surface)] rounded-2xl border-2 border-[#E6D7BE] dark:border-[var(--border)] border-b-4 p-4 sm:p-5 space-y-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-dashed border-[#E2D3B8] dark:border-[var(--border-dashed)] pb-2.5">
              <div className="flex items-center gap-2">
                <Type size={18} className="text-[#087F5B]" />
                <div>
                  <h2 className="text-sm sm:text-base font-extrabold text-[var(--foreground)]">
                    Arapça Yazı Tipi (Font) ve Boyutu
                  </h2>
                  <p className="text-xs text-[var(--muted)]">
                    Arapça metinleri ve harekeleri en rahat okuyabildiğiniz
                    seçkin hat/yazı tipini seçin
                  </p>
                </div>
              </div>

              <span className="px-3 py-1 rounded-xl bg-white dark:bg-[var(--background)] border border-[#E6D7BE] dark:border-[var(--border)] text-xs font-extrabold text-[#087F5B] dark:text-[#20c997]">
                Aktif Font: {activeFontCfg.name.split(" (")[0]} (
                {activeFontCfg.scale > 1
                  ? `${activeFontCfg.scale}x Ölçek`
                  : "1x"}
                )
              </span>
            </div>

            {/* 5 Seçkin Arapça Font Radyo Kartları (Kompakt p-3) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
              {ARABIC_FONT_OPTIONS.map((font) => {
                const isSelected = arabicFont === font.id;
                return (
                  <button
                    key={font.id}
                    type="button"
                    onClick={() => {
                      playClick();
                      setArabicFont(font.id);
                    }}
                    className={`relative text-left p-3 rounded-2xl border-2 border-b-4 transition-all flex flex-col justify-between gap-2 cursor-pointer ${
                      isSelected
                        ? "bg-[#F3F0FF] dark:bg-[var(--lavender-bg)] border-[#6741D9] -translate-y-0.5 shadow-xs"
                        : "bg-white dark:bg-[var(--background)] border-[#E6D7BE] dark:border-[var(--border)] hover:border-[#cbb692]"
                    }`}
                  >
                    {isSelected && (
                      <span className="absolute top-2.5 right-2.5 w-5 h-5 rounded-full bg-[#6741D9] text-white flex items-center justify-center">
                        <Check size={12} strokeWidth={3} />
                      </span>
                    )}

                    <div className="space-y-0.5 pr-5">
                      <span
                        className={`block text-xs font-extrabold leading-snug ${
                          isSelected
                            ? "text-[#4C28B5] dark:text-[#d0bfff]"
                            : "text-[var(--foreground)]"
                        }`}
                      >
                        {font.name}
                      </span>
                      <span className="block text-[11px] text-[var(--muted)] leading-tight">
                        {font.subtitle}
                      </span>
                    </div>

                    <div
                      dir="rtl"
                      style={{
                        fontFamily: font.cssFamily,
                        fontSize: `${Math.round(24 * font.scale)}px`,
                        lineHeight: font.lineHeight,
                      }}
                      className="w-full rounded-xl bg-[#F7EFE1]/70 dark:bg-[var(--surface)] px-2.5 py-1 border border-[#E6D7BE] dark:border-[var(--border)] text-right font-bold text-[#087F5B] dark:text-[#20c997]"
                    >
                      {formatArabicText("أَسْتَوْدِعُكَ اللّٰهَ", showHareke)}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Arapça ve Türkçe Yazı Boyutu Kontrolleri */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2 border-t border-dashed border-[#E2D3B8] dark:border-[var(--border-dashed)]">
              {/* Arapça Yazı Boyutu ('sm' | 'md' | 'lg' | 'xl') */}
              <div className="bg-white dark:bg-[var(--background)] rounded-xl p-3 border border-[#E6D7BE] dark:border-[var(--border)] flex flex-col justify-between gap-2 min-w-0">
                <div>
                  <span className="block text-xs font-extrabold text-[var(--foreground)]">
                    Arapça Yazı Boyutu ({arabicFontSizePreset.toUpperCase()} ·{" "}
                    {arabicFontSize}px)
                  </span>
                  <span className="block text-[11px] text-[var(--muted)]">
                    Diyalog ve sözlükteki Arapça metin büyüklüğü
                  </span>
                </div>

                <div className="bg-[#F7EFE1] dark:bg-[var(--surface)] rounded-xl p-1 border border-[#E6D7BE] dark:border-[var(--border)] grid grid-cols-2 sm:grid-cols-4 gap-1 w-full">
                  {ARABIC_FONT_SIZE_PRESETS.map(
                    (preset: {
                      id: ArabicFontSizePreset;
                      label: string;
                      px: number;
                    }) => {
                      const active =
                        arabicFontSizePreset === preset.id ||
                        arabicFontSize === preset.px;
                      return (
                        <button
                          key={preset.id}
                          type="button"
                          onClick={() => {
                            playClick();
                            setArabicFontSize(preset.id);
                          }}
                          className={`px-2 py-1 text-xs rounded-lg transition-all text-center truncate cursor-pointer ${
                            active
                              ? "bg-[#0CA678] text-white font-bold shadow-2xs"
                              : "bg-white/60 dark:bg-[var(--background)]/50 text-[var(--muted)] font-semibold hover:text-[var(--foreground)]"
                          }`}
                        >
                          {preset.id.toUpperCase()} ({preset.px})
                        </button>
                      );
                    }
                  )}
                </div>
              </div>

              {/* Türkçe Yazı Boyutu */}
              <div className="bg-white dark:bg-[var(--background)] rounded-xl p-3 border border-[#E6D7BE] dark:border-[var(--border)] flex flex-col justify-between gap-2 min-w-0">
                <div>
                  <span className="block text-xs font-extrabold text-[var(--foreground)]">
                    Türkçe Çeviri Boyutu ({turkishFontSize}px)
                  </span>
                  <span className="block text-[11px] text-[var(--muted)]">
                    Diyalog altındaki Türkçe çeviri büyüklüğü
                  </span>
                </div>

                <div className="bg-[#F7EFE1] dark:bg-[var(--surface)] rounded-xl p-1 border border-[#E6D7BE] dark:border-[var(--border)] grid grid-cols-2 sm:grid-cols-4 gap-1 w-full">
                  {turkishSizes.map((s) => {
                    const isSelected =
                      turkishFontSize === s.value ||
                      (s.value === 20 && turkishFontSize === 21);
                    return (
                      <button
                        key={s.value}
                        type="button"
                        onClick={() => {
                          playClick();
                          setTurkishFontSize(s.value);
                        }}
                        className={`px-2 py-1 text-xs rounded-lg transition-all text-center truncate cursor-pointer ${
                          isSelected
                            ? "bg-[#0CA678] text-white font-bold shadow-2xs"
                            : "bg-white/60 dark:bg-[var(--background)]/50 text-[var(--muted)] font-semibold hover:text-[var(--foreground)]"
                        }`}
                      >
                        {s.label} ({s.value})
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Canlı Tipografi Önizleme Kutusu (Diyalog Görünüm Düzeni ile Canlı Senkronize) */}
            <div className="pt-1.5 space-y-1.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-extrabold uppercase tracking-wider text-[#087F5B] dark:text-[#20c997]">
                  Canlı Tipografi Önizleme Kutusu ({viewModes.find((m) => m.id === viewMode)?.label || "Alt Alta Görünüm"})
                </span>
                <button
                  type="button"
                  onClick={() => {
                    playClick();
                    playTTS(rawSampleArabic, speechRate);
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-[#0CA678] text-white text-xs font-bold border-b-2 border-[#087F5B] active:border-b-0 active:translate-y-0.5 transition-all cursor-pointer"
                >
                  <Volume2 size={13} />
                  <span>Örnek Cümleyi Dinle ({speechRate}x)</span>
                </button>
              </div>

              <div className="bg-white dark:bg-[var(--background)] rounded-2xl border-2 border-[#E6D7BE] dark:border-[var(--border)] py-3 px-4 shadow-2xs">
                {viewMode === "columns" ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
                    <p
                      dir="ltr"
                      style={{ fontSize: `${turkishFontSize}px` }}
                      className="font-semibold text-[var(--muted)] text-left md:border-r md:border-dashed md:border-[#E2D3B8] dark:md:border-[var(--border-dashed)] md:pr-4 order-2 md:order-1"
                    >
                      “Anneciğim seni Allah&apos;a emanet ediyorum; babacığım seni
                      de Allah&apos;a emanet ediyorum.”
                    </p>
                    <p
                      dir="rtl"
                      style={{
                        fontFamily: activeFontCfg.cssFamily,
                        fontSize: `${Math.round(
                          arabicFontSize * activeFontCfg.scale
                        )}px`,
                        lineHeight: activeFontCfg.lineHeight,
                      }}
                      className="arabic font-bold text-[var(--foreground)] text-right order-1 md:order-2"
                    >
                      {sampleArabic}
                    </p>
                  </div>
                ) : viewMode === "arabic-only" ? (
                  <div className="space-y-1.5">
                    <p
                      dir="rtl"
                      style={{
                        fontFamily: activeFontCfg.cssFamily,
                        fontSize: `${Math.round(
                          arabicFontSize * activeFontCfg.scale
                        )}px`,
                        lineHeight: activeFontCfg.lineHeight,
                      }}
                      className="arabic font-bold text-[var(--foreground)] text-right"
                    >
                      {sampleArabic}
                    </p>
                    <p className="text-[11px] font-medium text-[var(--muted)] italic border-t border-dashed border-[#E2D3B8] dark:border-[var(--border-dashed)] pt-1">
                      Türkçe çeviri gizlendi (Sadece Arapça modu)
                    </p>
                  </div>
                ) : viewMode === "turkish-only" ? (
                  <div className="space-y-1.5">
                    <p
                      dir="ltr"
                      style={{ fontSize: `${turkishFontSize}px` }}
                      className="font-semibold text-[var(--muted)] text-left"
                    >
                      “Anneciğim seni Allah&apos;a emanet ediyorum; babacığım seni
                      de Allah&apos;a emanet ediyorum.”
                    </p>
                    <p className="text-[11px] font-medium text-[var(--muted)] italic border-t border-dashed border-[#E2D3B8] dark:border-[var(--border-dashed)] pt-1">
                      Arapça metin gizlendi (Sadece Türkçe modu)
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p
                      dir="rtl"
                      style={{
                        fontFamily: activeFontCfg.cssFamily,
                        fontSize: `${Math.round(
                          arabicFontSize * activeFontCfg.scale
                        )}px`,
                        lineHeight: activeFontCfg.lineHeight,
                      }}
                      className="arabic font-bold text-[var(--foreground)] text-right"
                    >
                      {sampleArabic}
                    </p>
                    <p
                      dir="ltr"
                      style={{ fontSize: `${turkishFontSize}px` }}
                      className="font-semibold text-[var(--muted)] text-left border-t border-dashed border-[#E2D3B8] dark:border-[var(--border-dashed)] pt-1.5"
                    >
                      “Anneciğim seni Allah&apos;a emanet ediyorum; babacığım seni
                      de Allah&apos;a emanet ediyorum.”
                    </p>
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* 1B. DİYALOG GÖRÜNÜM MODU (4'lü Seçim Izgarası) */}
          <section className="space-y-2">
            <div className="flex items-center gap-2 px-1">
              <Eye size={17} className="text-[#087F5B]" />
              <h2 className="text-sm font-extrabold text-[var(--foreground)]">
                Diyalog Görünüm Düzeni
              </h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {viewModes.map((mode) => {
                const isSelected = viewMode === mode.id;
                return (
                  <button
                    key={mode.id}
                    type="button"
                    onClick={() => {
                      playClick();
                      setViewMode(mode.id);
                    }}
                    className={`relative text-left p-3.5 rounded-2xl border-2 border-b-4 transition-all cursor-pointer ${
                      isSelected
                        ? "bg-[#F3F0FF] dark:bg-[var(--lavender-bg)] border-[#6741D9] -translate-y-0.5"
                        : "bg-[#F7EFE1] dark:bg-[var(--surface)] border-[#E6D7BE] dark:border-[var(--border)] hover:border-[#cbb692]"
                    }`}
                  >
                    {isSelected && (
                      <span className="absolute top-2.5 right-2.5 w-5 h-5 rounded-full bg-[#6741D9] text-white flex items-center justify-center">
                        <Check size={12} strokeWidth={3} />
                      </span>
                    )}
                    <span
                      className={`block text-xs sm:text-sm font-extrabold pr-6 ${
                        isSelected
                          ? "text-[#4C28B5] dark:text-[#d0bfff]"
                          : "text-[var(--foreground)]"
                      }`}
                    >
                      {mode.label}
                    </span>
                    <span className="block text-[11px] text-[var(--muted)] mt-1 leading-snug">
                      {mode.desc}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          {/* GRUP 1 — OKUMA, HAREKE & GÖRÜNÜM TERCİHLERİ (2 Sütunlu Grid) */}
          <section className="bg-[#F7EFE1] dark:bg-[var(--surface)] rounded-2xl border-2 border-[#E6D7BE] dark:border-[var(--border)] border-b-4 p-4 sm:p-5 space-y-3">
            <div className="flex items-center gap-2 border-b border-dashed border-[#E2D3B8] dark:border-[var(--border-dashed)] pb-2">
              <Sparkles size={17} className="text-[#087F5B]" />
              <h2 className="text-sm sm:text-base font-extrabold text-[var(--foreground)]">
                Okuma, Hareke &amp; Görünüm Tercihleri
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* 1. Arapça Harekeleri Göster (Tashkeel) */}
              <div className="bg-white dark:bg-[var(--background)] p-3 rounded-xl border border-[#E6D7BE] dark:border-[var(--border)] flex flex-col justify-between gap-2.5">
                <div className="flex items-start gap-2.5">
                  <Sparkles size={17} className="text-[#087F5B] shrink-0 mt-0.5" />
                  <div>
                    <span className="block text-xs sm:text-sm font-extrabold text-[var(--foreground)]">
                      Arapça Harekeleri Göster (Tashkeel)
                    </span>
                    <span className="block text-[11px] text-[var(--muted)]">
                      Üstün, esre, ötre ve şedde işaretlerini göster veya gizle
                    </span>
                  </div>
                </div>

                <div className="bg-[#F7EFE1] dark:bg-[var(--surface)] rounded-xl p-1 border border-[#E6D7BE] dark:border-[var(--border)] grid grid-cols-2 gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      playClick();
                      setShowHareke(true);
                    }}
                    className={`px-3 py-1.5 text-xs rounded-lg transition-all cursor-pointer ${
                      showHareke
                        ? "bg-[#0CA678] text-white font-bold"
                        : "text-[var(--muted)] font-semibold hover:text-[var(--foreground)]"
                    }`}
                  >
                    Harekeli
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      playClick();
                      setShowHareke(false);
                    }}
                    className={`px-3 py-1.5 text-xs rounded-lg transition-all cursor-pointer ${
                      !showHareke
                        ? "bg-[#0CA678] text-white font-bold"
                        : "text-[var(--muted)] font-semibold hover:text-[var(--foreground)]"
                    }`}
                  >
                    Harekesiz
                  </button>
                </div>
              </div>

              {/* 2. Kelime Tıklama Sözlük İpuçları */}
              <div className="bg-white dark:bg-[var(--background)] p-3 rounded-xl border border-[#E6D7BE] dark:border-[var(--border)] flex flex-col justify-between gap-2.5">
                <div className="flex items-start gap-2.5">
                  <BookOpen size={17} className="text-[#087F5B] shrink-0 mt-0.5" />
                  <div>
                    <span className="block text-xs sm:text-sm font-extrabold text-[var(--foreground)]">
                      Kelime Tıklama Sözlük İpuçları
                    </span>
                    <span className="block text-[11px] text-[var(--muted)]">
                      Kelimelere tıklayınca morfolojik kök ve anlam penceresini aç
                    </span>
                  </div>
                </div>

                <div className="bg-[#F7EFE1] dark:bg-[var(--surface)] rounded-xl p-1 border border-[#E6D7BE] dark:border-[var(--border)] grid grid-cols-2 gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      playClick();
                      setShowTooltips(true);
                    }}
                    className={`px-3 py-1.5 text-xs rounded-lg transition-all cursor-pointer ${
                      showTooltips
                        ? "bg-[#0CA678] text-white font-bold"
                        : "text-[var(--muted)] font-semibold hover:text-[var(--foreground)]"
                    }`}
                  >
                    Açık
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      playClick();
                      setShowTooltips(false);
                    }}
                    className={`px-3 py-1.5 text-xs rounded-lg transition-all cursor-pointer ${
                      !showTooltips
                        ? "bg-[#0CA678] text-white font-bold"
                        : "text-[var(--muted)] font-semibold hover:text-[var(--foreground)]"
                    }`}
                  >
                    Kapalı
                  </button>
                </div>
              </div>

              {/* 3. Gölgeleme & Mahreç Kayıt Butonları */}
              <div className="bg-white dark:bg-[var(--background)] p-3 rounded-xl border border-[#E6D7BE] dark:border-[var(--border)] flex flex-col justify-between gap-2.5">
                <div className="flex items-start gap-2.5">
                  <Mic size={17} className="text-[#087F5B] shrink-0 mt-0.5" />
                  <div>
                    <span className="block text-xs sm:text-sm font-extrabold text-[var(--foreground)]">
                      Gölgeleme &amp; Mahreç Kayıt Butonları
                    </span>
                    <span className="block text-[11px] text-[var(--muted)]">
                      Diyalog satırlarında ses kaydetme ve mahreç koçu butonunu
                      göster
                    </span>
                  </div>
                </div>

                <div className="bg-[#F7EFE1] dark:bg-[var(--surface)] rounded-xl p-1 border border-[#E6D7BE] dark:border-[var(--border)] grid grid-cols-2 gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      playClick();
                      setShowShadowing(true);
                    }}
                    className={`px-3 py-1.5 text-xs rounded-lg transition-all cursor-pointer ${
                      showShadowing
                        ? "bg-[#0CA678] text-white font-bold"
                        : "text-[var(--muted)] font-semibold hover:text-[var(--foreground)]"
                    }`}
                  >
                    Açık
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      playClick();
                      setShowShadowing(false);
                    }}
                    className={`px-3 py-1.5 text-xs rounded-lg transition-all cursor-pointer ${
                      !showShadowing
                        ? "bg-[#0CA678] text-white font-bold"
                        : "text-[var(--muted)] font-semibold hover:text-[var(--foreground)]"
                    }`}
                  >
                    Kapalı
                  </button>
                </div>
              </div>

              {/* 4. Etkileşim Ses Efektleri (SFX) */}
              <div className="bg-white dark:bg-[var(--background)] p-3 rounded-xl border border-[#E6D7BE] dark:border-[var(--border)] flex flex-col justify-between gap-2.5">
                <div className="flex items-start gap-2.5">
                  <Volume2 size={17} className="text-[#087F5B] shrink-0 mt-0.5" />
                  <div>
                    <span className="block text-xs sm:text-sm font-extrabold text-[var(--foreground)]">
                      Etkileşim Ses Efektleri (SFX)
                    </span>
                    <span className="block text-[11px] text-[var(--muted)]">
                      Buton tıklama, doğru/yanlış cevap ve telaffuz bildirim
                      sesleri
                    </span>
                  </div>
                </div>

                <div className="bg-[#F7EFE1] dark:bg-[var(--surface)] rounded-xl p-1 border border-[#E6D7BE] dark:border-[var(--border)] grid grid-cols-2 gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      setSfxEnabled(true);
                      playClick();
                    }}
                    className={`px-3 py-1.5 text-xs rounded-lg transition-all cursor-pointer ${
                      sfxEnabled
                        ? "bg-[#0CA678] text-white font-bold"
                        : "text-[var(--muted)] font-semibold hover:text-[var(--foreground)]"
                    }`}
                  >
                    Açık
                  </button>
                  <button
                    type="button"
                    onClick={() => setSfxEnabled(false)}
                    className={`px-3 py-1.5 text-xs rounded-lg transition-all cursor-pointer ${
                      !sfxEnabled
                        ? "bg-[#0CA678] text-white font-bold"
                        : "text-[var(--muted)] font-semibold hover:text-[var(--foreground)]"
                    }`}
                  >
                    Kapalı
                  </button>
                </div>
              </div>

              {/* 5. Renk Teması */}
              <div className="bg-white dark:bg-[var(--background)] p-3 rounded-xl border border-[#E6D7BE] dark:border-[var(--border)] flex flex-col justify-between gap-2.5">
                <div className="flex items-start gap-2.5">
                  <Monitor size={17} className="text-[#087F5B] shrink-0 mt-0.5" />
                  <div>
                    <span className="block text-xs sm:text-sm font-extrabold text-[var(--foreground)]">
                      Renk Teması
                    </span>
                    <span className="block text-[11px] text-[var(--muted)]">
                      Sıcak fildişi/krem gündüz modu veya göz yormayan gece modu
                    </span>
                  </div>
                </div>

                <div className="bg-[#F7EFE1] dark:bg-[var(--surface)] rounded-xl p-1 border border-[#E6D7BE] dark:border-[var(--border)] grid grid-cols-2 gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      playClick();
                      setTheme("light");
                    }}
                    className={`px-3 py-1.5 text-xs rounded-lg transition-all cursor-pointer ${
                      theme === "light"
                        ? "bg-[#0CA678] text-white font-bold"
                        : "text-[var(--muted)] font-semibold hover:text-[var(--foreground)]"
                    }`}
                  >
                    Sıcak Krem
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      playClick();
                      setTheme("dark");
                    }}
                    className={`px-3 py-1.5 text-xs rounded-lg transition-all cursor-pointer ${
                      theme === "dark"
                        ? "bg-[#0CA678] text-white font-bold"
                        : "text-[var(--muted)] font-semibold hover:text-[var(--foreground)]"
                    }`}
                  >
                    Gece Modu
                  </button>
                </div>
              </div>

              {/* 6. Sesli Okuma Kelime Takibi (Çift İkon Temizlenmiş) */}
              <div className="bg-white dark:bg-[var(--background)] p-3 rounded-xl border border-[#E6D7BE] dark:border-[var(--border)] flex flex-col justify-between gap-2.5">
                <div className="flex items-start gap-2.5">
                  <Target size={17} className="text-[#087F5B] shrink-0 mt-0.5" />
                  <div>
                    <span className="block text-xs sm:text-sm font-extrabold text-[var(--foreground)]">
                      Sesli Okuma Kelime Takibi
                    </span>
                    <span className="block text-[11px] text-[var(--muted)]">
                      Dinlenen Arapça kelimenin canlı karaoke vurgusu ve ok (▼)
                      takibi
                    </span>
                  </div>
                </div>

                <div className="bg-[#F7EFE1] dark:bg-[var(--surface)] rounded-xl p-1 border border-[#E6D7BE] dark:border-[var(--border)] grid grid-cols-4 gap-1">
                  {(
                    [
                      { id: "both", label: "Renk+Ok" },
                      { id: "highlight", label: "Renk" },
                      { id: "arrow", label: "Ok" },
                      { id: "off", label: "Kapalı" },
                    ] as { id: WordTrackingStyle; label: string }[]
                  ).map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => {
                        playClick();
                        setWordTrackingStyle(opt.id);
                      }}
                      className={`px-2 py-1.5 text-[11px] rounded-lg transition-all whitespace-nowrap cursor-pointer ${
                        wordTrackingStyle === opt.id
                          ? "bg-[#0CA678] text-white font-bold"
                          : "text-[var(--muted)] font-semibold hover:text-[var(--foreground)]"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </section>
        </>
      )}

      {/* KATEGORİ 2 / GRUP 2 — SESLENDİRME HIZI, DÖNGÜ & GÖLGELEME AYARLARI (2 Sütunlu Grid) */}
      {showAudio && (
        <section className="bg-[#F7EFE1] dark:bg-[var(--surface)] rounded-2xl border-2 border-[#E6D7BE] dark:border-[var(--border)] border-b-4 p-4 sm:p-5 space-y-3">
          <div className="flex items-center gap-2 border-b border-dashed border-[#E2D3B8] dark:border-[var(--border-dashed)] pb-2">
            <Volume2 size={17} className="text-[#087F5B]" />
            <h2 className="text-sm sm:text-base font-extrabold text-[var(--foreground)]">
              Seslendirme Hızı, Döngü &amp; Gölgeleme Ayarları
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* 1. Arapça Seslendirme Hızı (TTS / MP3) */}
            <div className="bg-white dark:bg-[var(--background)] p-3 rounded-xl border border-[#E6D7BE] dark:border-[var(--border)] flex flex-col justify-between gap-2.5">
              <div className="flex items-start gap-2.5">
                <Gauge size={17} className="text-[#087F5B] shrink-0 mt-0.5" />
                <div>
                  <span className="block text-xs sm:text-sm font-extrabold text-[var(--foreground)]">
                    Arapça Seslendirme Hızı (TTS / MP3)
                  </span>
                  <span className="block text-[11px] text-[var(--muted)]">
                    Varsayılan konuşma ve telaffuz dinleme hızı (0.5x - 1.25x)
                  </span>
                </div>
              </div>

              <div className="bg-[#F7EFE1] dark:bg-[var(--surface)] rounded-xl p-1 border border-[#E6D7BE] dark:border-[var(--border)] grid grid-cols-4 gap-1">
                {([0.5, 0.75, 1, 1.25] as SpeechRate[]).map((rate) => (
                  <button
                    key={rate}
                    type="button"
                    onClick={() => {
                      playClick();
                      setSpeechRate(rate);
                    }}
                    className={`px-2 py-1.5 text-xs tabular-nums rounded-lg transition-all cursor-pointer ${
                      speechRate === rate
                        ? "bg-[#0CA678] text-white font-bold"
                        : "text-[var(--muted)] font-semibold hover:text-[var(--foreground)]"
                    }`}
                  >
                    {rate}x
                  </button>
                ))}
              </div>
            </div>

            {/* 2. Cümleler Arası Gölgeleme Boşluğu */}
            <div className="bg-white dark:bg-[var(--background)] p-3 rounded-xl border border-[#E6D7BE] dark:border-[var(--border)] flex flex-col justify-between gap-2.5">
              <div className="flex items-start gap-2.5">
                <Timer size={17} className="text-[#087F5B] shrink-0 mt-0.5" />
                <div>
                  <span className="block text-xs sm:text-sm font-extrabold text-[var(--foreground)]">
                    Cümleler Arası Gölgeleme Boşluğu
                  </span>
                  <span className="block text-[11px] text-[var(--muted)]">
                    Diyaloğu dinlerken cümleyi sesli tekrar için bekleme süresi
                  </span>
                </div>
              </div>

              <div className="bg-[#F7EFE1] dark:bg-[var(--surface)] rounded-xl p-1 border border-[#E6D7BE] dark:border-[var(--border)] grid grid-cols-3 gap-1">
                {(
                  [
                    { id: 0, label: "Yok" },
                    { id: 2, label: "2 Sn" },
                    { id: "auto", label: "Cümle Süresi" },
                  ] as { id: PauseBetweenLines; label: string }[]
                ).map((opt) => (
                  <button
                    key={String(opt.id)}
                    type="button"
                    onClick={() => {
                      playClick();
                      setPauseBetweenLines(opt.id);
                    }}
                    className={`px-2 py-1.5 text-[11px] rounded-lg transition-all whitespace-nowrap cursor-pointer ${
                      pauseBetweenLines === opt.id
                        ? "bg-[#0CA678] text-white font-bold"
                        : "text-[var(--muted)] font-semibold hover:text-[var(--foreground)]"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 3. Tüm Diyalog Dinleme Döngüsü (Loop) */}
            <div className="bg-white dark:bg-[var(--background)] p-3 rounded-xl border border-[#E6D7BE] dark:border-[var(--border)] flex flex-col justify-between gap-2.5">
              <div className="flex items-start gap-2.5">
                <Repeat size={17} className="text-[#6741D9] shrink-0 mt-0.5" />
                <div>
                  <span className="block text-xs sm:text-sm font-extrabold text-[var(--foreground)]">
                    Tüm Diyalog Dinleme Döngüsü (Loop)
                  </span>
                  <span className="block text-[11px] text-[var(--muted)]">
                    &ldquo;Dinle&rdquo; başlatıldığında diyaloğun kaç kez
                    tekrarlanacağı
                  </span>
                </div>
              </div>

              <div className="bg-[#F7EFE1] dark:bg-[var(--surface)] rounded-xl p-1 border border-[#E6D7BE] dark:border-[var(--border)] grid grid-cols-5 gap-1">
                {(
                  [
                    { id: 1, label: "1x" },
                    { id: 2, label: "2x" },
                    { id: 3, label: "3x" },
                    { id: 5, label: "5x" },
                    { id: "infinite", label: "∞" },
                  ] as { id: DialogueLoopCount; label: string }[]
                ).map((opt) => (
                  <button
                    key={String(opt.id)}
                    type="button"
                    onClick={() => {
                      playClick();
                      setDialogueLoopCount(opt.id);
                    }}
                    className={`px-2 py-1.5 text-xs rounded-lg transition-all cursor-pointer ${
                      dialogueLoopCount === opt.id
                        ? "bg-[#6741D9] text-white font-bold"
                        : "text-[var(--muted)] font-semibold hover:text-[var(--foreground)]"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 4. Tekli Cümle Tekrar Sayısı */}
            <div className="bg-white dark:bg-[var(--background)] p-3 rounded-xl border border-[#E6D7BE] dark:border-[var(--border)] flex flex-col justify-between gap-2.5">
              <div className="flex items-start gap-2.5">
                <Repeat size={17} className="text-[#087F5B] shrink-0 mt-0.5" />
                <div>
                  <span className="block text-xs sm:text-sm font-extrabold text-[var(--foreground)]">
                    Tekli Cümle Tekrar Sayısı
                  </span>
                  <span className="block text-[11px] text-[var(--muted)]">
                    Cümle kartındaki Tekrarla butonunda varsayılan tekrar sayısı
                  </span>
                </div>
              </div>

              <div className="bg-[#F7EFE1] dark:bg-[var(--surface)] rounded-xl p-1 border border-[#E6D7BE] dark:border-[var(--border)] grid grid-cols-4 gap-1">
                {(
                  [
                    { id: 2, label: "2x" },
                    { id: 3, label: "3x" },
                    { id: 5, label: "5x" },
                    { id: "infinite", label: "∞" },
                  ] as { id: SentenceLoopCount; label: string }[]
                ).map((opt) => (
                  <button
                    key={String(opt.id)}
                    type="button"
                    onClick={() => {
                      playClick();
                      setSentenceLoopCount(opt.id);
                    }}
                    className={`px-2 py-1.5 text-xs rounded-lg transition-all cursor-pointer ${
                      sentenceLoopCount === opt.id
                        ? "bg-[#0CA678] text-white font-bold"
                        : "text-[var(--muted)] font-semibold hover:text-[var(--foreground)]"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* KATEGORİ 3 / GRUP 3 — GÜNLÜK HEDEF, UYGULAMA KURULUMU & VERİ YEDEKLEME */}
      {showData && (
        <section className="bg-[#F7EFE1] dark:bg-[var(--surface)] rounded-2xl border-2 border-[#E6D7BE] dark:border-[var(--border)] border-b-4 p-4 sm:p-5 space-y-3">
          <div className="flex items-center gap-2 border-b border-dashed border-[#E2D3B8] dark:border-[var(--border-dashed)] pb-2">
            <Database size={17} className="text-[#087F5B]" />
            <h2 className="text-sm sm:text-base font-extrabold text-[var(--foreground)]">
              Günlük Hedef, Uygulama Kurulumu &amp; Veri Yedekleme
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* 1. Günlük Çalışma Hedefi ve Seri */}
            <div className="bg-white dark:bg-[var(--background)] p-3 rounded-xl border border-[#E6D7BE] dark:border-[var(--border)] flex flex-col justify-between gap-2.5">
              <div className="flex items-start gap-2.5">
                <Flame size={18} className="text-orange-500 shrink-0 mt-0.5" />
                <div>
                  <span className="block text-xs sm:text-sm font-extrabold text-[var(--foreground)]">
                    Günlük Çalışma Hedefi ({dailyGoalMinutes} dk) · {streakDays}{" "}
                    Gün Seri
                  </span>
                  <span className="block text-[11px] text-[var(--muted)]">
                    Her gün düzenli Arapça pratik için hedef sürenizi belirleyin
                  </span>
                </div>
              </div>

              <div className="bg-[#F7EFE1] dark:bg-[var(--surface)] rounded-xl p-1 border border-[#E6D7BE] dark:border-[var(--border)] grid grid-cols-4 gap-1">
                {[10, 15, 30, 45].map((mins) => (
                  <button
                    key={mins}
                    type="button"
                    onClick={() => {
                      playClick();
                      setDailyGoalMinutes(mins);
                    }}
                    className={`px-2.5 py-1.5 text-xs tabular-nums rounded-lg transition-all cursor-pointer ${
                      dailyGoalMinutes === mins
                        ? "bg-[#0CA678] text-white font-bold"
                        : "text-[var(--muted)] font-semibold hover:text-[var(--foreground)]"
                    }`}
                  >
                    {mins} dk
                  </button>
                ))}
              </div>
            </div>

            {/* 2. Cihaza Uygulama Olarak Kur (PWA) */}
            <div className="bg-white dark:bg-[var(--background)] p-3 rounded-xl border border-[#E6D7BE] dark:border-[var(--border)] flex flex-col justify-between gap-2.5">
              <div className="flex items-start gap-2.5">
                <Smartphone
                  size={18}
                  className="text-[#6741D9] shrink-0 mt-0.5"
                />
                <div>
                  <span className="block text-xs sm:text-sm font-extrabold text-[var(--foreground)]">
                    Uygulamayı Cihaza Kur (Çevrimdışı PWA)
                  </span>
                  <span className="block text-[11px] text-[var(--muted)]">
                    Ana ekrana ekleyerek tam ekran ve internet olmadan da
                    kullanın
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-end">
                {isInstalled ? (
                  <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-[#E6FCF5] dark:bg-emerald-950/50 text-[#087F5B] dark:text-emerald-300 border border-[#0CA678]/40 text-xs font-extrabold">
                    <CheckCircle2 size={14} />
                    Cihaza Kurulu
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={async () => {
                      playClick();
                      if (isInstallable) {
                        await installApp();
                      } else {
                        setShowIosGuide((v) => !v);
                      }
                    }}
                    className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-4 py-1.5 rounded-xl bg-[#6741D9] hover:bg-[#5230B5] text-white border-b-3 border-[#4C28B5] text-xs font-extrabold active:border-b-0 active:translate-y-0.5 transition-all cursor-pointer"
                  >
                    <Download size={14} />
                    <span>Uygulamayı Kur</span>
                  </button>
                )}
              </div>
            </div>
          </div>

          {showIosGuide && !isInstalled && (
            <div className="p-3 rounded-xl bg-white dark:bg-[var(--background)] border border-[#6741D9]/40 text-xs font-semibold text-[var(--foreground)]">
              {isIOS ? (
                <p>
                  <strong>iPhone / iPad Kurulumu:</strong> Safari alt çubuğundaki{" "}
                  <strong>Paylaş</strong> butonuna dokunun ve{" "}
                  <strong>&ldquo;Ana Ekrana Ekle&rdquo;</strong> seçeneğini
                  seçin.
                </p>
              ) : (
                <p>
                  <strong>Masaüstü / Android Kurulumu:</strong> Tarayıcı adres
                  çubuğunun sağındaki <strong>Uygulamayı Yükle</strong>{" "}
                  simgesine veya tarayıcı menüsündeki{" "}
                  <strong>
                    &ldquo;Ana Ekrana Ekle / Uygulamayı Yükle&rdquo;
                  </strong>{" "}
                  seçeneğine tıklayın.
                </p>
              )}
            </div>
          )}

          {/* 2B. Uygulamayı Arkadaşına Öner & Paylaş */}
          <div className="bg-white dark:bg-[var(--background)] p-3.5 rounded-xl border border-[#E6D7BE] dark:border-[var(--border)] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <Share2 size={18} className="text-[#0CA678] shrink-0 mt-0.5" />
              <div>
                <span className="block text-xs sm:text-sm font-extrabold text-[var(--foreground)]">
                  📲 Uygulamayı Arkadaşına Öner &amp; Paylaş
                </span>
                <span className="block text-[11px] text-[var(--muted)]">
                  Uygulamayı WhatsApp, Telegram veya tek tıkla bağlantı kopyalayarak arkadaşlarınız ve öğrencilerinizle paylaşın
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                playClick();
                triggerShareAppModal();
              }}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-[#0CA678] to-[#6741D9] hover:opacity-95 text-white border-b-3 border-[#087F5B] text-xs font-extrabold active:border-b-0 active:translate-y-0.5 transition-all shrink-0 cursor-pointer"
            >
              <Share2 size={14} />
              <span>Uygulamayı Paylaş</span>
            </button>
          </div>

          {/* 2C. 📦 Çevrimdışı İndirilen Dersler (Cache API Ses Önbelleği) */}
          <div className="bg-white dark:bg-[var(--background)] p-3.5 rounded-xl border border-[#E6D7BE] dark:border-[var(--border)] flex flex-col gap-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-start gap-2.5">
                <Download
                  size={18}
                  className="text-emerald-600 shrink-0 mt-0.5"
                />
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs sm:text-sm font-extrabold text-[var(--foreground)]">
                      📦 Çevrimdışı İndirilen Dersler
                    </span>
                    <span className="px-2 py-0.5 rounded-lg bg-emerald-100 dark:bg-emerald-950/60 border border-emerald-400/60 text-[11px] font-black text-emerald-800 dark:text-emerald-300 tabular-nums">
                      {offlineDownloadedIds.length} / {diyaloglar.length} Diyalog İndirildi
                    </span>
                  </div>
                  <span className="block text-[11px] text-slate-600 dark:text-slate-300 mt-0.5">
                    İndirilen diyalogların cümle sesleri, sözlük/morfoloji verileri ve 5 alıştırma modülü uçakta, metroda veya internetin olmadığı sınıflarda tamamen çevrimdışı çalışır.
                  </span>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <button
                  type="button"
                  disabled={
                    isDownloadingAllOffline ||
                    offlineDownloadedIds.length >= diyaloglar.length
                  }
                  onClick={async () => {
                    playClick();
                    setIsDownloadingAllOffline(true);
                    setOfflineAllProgressPct(2);
                    const downloadedCount = await downloadAllDialoguesOffline(
                      (pct) => {
                        setOfflineAllProgressPct(pct);
                        void getDownloadedDialogueIds().then((ids) =>
                          setOfflineDownloadedIds(ids)
                        );
                      }
                    );
                    setIsDownloadingAllOffline(false);
                    const updatedIds = await getDownloadedDialogueIds();
                    setOfflineDownloadedIds(updatedIds);
                    if (downloadedCount > 0) {
                      playSuccess();
                      setDataMessage({
                        type: "success",
                        text: `Tüm ${updatedIds.length} diyalog çevrimdışı ses önbelleğine başarıyla indirildi!`,
                      });
                    }
                  }}
                  className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border-b-3 text-xs font-extrabold transition-all cursor-pointer ${
                    offlineDownloadedIds.length >= diyaloglar.length
                      ? "bg-emerald-600 border-emerald-800 text-white"
                      : isDownloadingAllOffline
                      ? "bg-amber-500 border-amber-700 text-white"
                      : "bg-emerald-600 hover:bg-emerald-700 border-emerald-800 text-white"
                  }`}
                >
                  <Download size={14} />
                  <span>
                    {offlineDownloadedIds.length >= diyaloglar.length
                      ? "✅ Tüm Dersler Çevrimdışı Hazır"
                      : isDownloadingAllOffline
                      ? `İndiriliyor... %${offlineAllProgressPct}`
                      : "Tümünü Çevrimdışı İndir"}
                  </span>
                </button>

                <button
                  type="button"
                  disabled={
                    isDownloadingAllOffline || offlineDownloadedIds.length === 0
                  }
                  onClick={async () => {
                    playClick();
                    await clearOfflineAudioCache();
                    setOfflineDownloadedIds([]);
                    setDataMessage({
                      type: "success",
                      text: "Çevrimdışı ses önbelleği başarıyla temizlendi.",
                    });
                  }}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white dark:bg-[var(--background)] border-2 border-rose-300 dark:border-rose-800 border-b-3 text-xs font-extrabold text-rose-700 dark:text-rose-300 hover:bg-rose-50 disabled:opacity-50 transition-all cursor-pointer"
                >
                  <Trash2 size={14} />
                  <span>Çevrimdışı Ses Önbelleğini Temizle</span>
                </button>
              </div>
            </div>

            {isDownloadingAllOffline && (
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[11px] font-extrabold text-emerald-800 dark:text-emerald-300">
                  <span>Çevrimdışı ders ses paketleri indiriliyor...</span>
                  <span>%{offlineAllProgressPct}</span>
                </div>
                <div className="w-full h-2 rounded-full bg-emerald-100 dark:bg-emerald-950 overflow-hidden">
                  <div
                    className="h-full bg-emerald-600 transition-all duration-150 rounded-full"
                    style={{ width: `${offlineAllProgressPct}%` }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* 3. Veri Yönetimi ve Yedekleme */}
          <div className="bg-white dark:bg-[var(--background)] p-3.5 rounded-xl border border-[#E6D7BE] dark:border-[var(--border)] flex flex-col gap-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-start gap-2.5">
                <Database size={18} className="text-[#087F5B] shrink-0 mt-0.5" />
                <div>
                  <span className="block text-xs sm:text-sm font-extrabold text-[var(--foreground)]">
                    Veri Yönetimi ve Yedekleme
                  </span>
                  <span className="block text-[11px] text-[var(--muted)]">
                    Öğrendiğiniz kelimeleri, telaffuz puanlarınızı ve serinizi
                    .json olarak yedekleyin veya geri yükleyin
                  </span>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleExportBackup}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#0CA678] hover:bg-[#099268] text-white border-b-3 border-[#087F5B] text-xs font-extrabold active:border-b-0 active:translate-y-0.5 transition-all cursor-pointer"
                >
                  <Download size={14} />
                  <span>İlerlemeyi Dışa Aktar (.json)</span>
                </button>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json,application/json"
                  onChange={handleImportFile}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => {
                    playClick();
                    fileInputRef.current?.click();
                  }}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#F7EFE1] dark:bg-[var(--surface)] border-2 border-[#E6D7BE] dark:border-[var(--border)] border-b-3 text-xs font-extrabold text-[var(--foreground)] hover:border-[#6741D9] active:border-b-0 active:translate-y-0.5 transition-all cursor-pointer"
                >
                  <Upload size={14} className="text-[#6741D9]" />
                  <span>Yedek Yükle (.json)</span>
                </button>

                {hasAutoBackup && (
                  <button
                    type="button"
                    onClick={handleRestoreAutoBackup}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#F3F0FF] dark:bg-[var(--lavender-bg)] border-2 border-[#6741D9]/60 border-b-3 text-xs font-extrabold text-[#4C28B5] dark:text-[#d0bfff] hover:border-[#6741D9] active:border-b-0 active:translate-y-0.5 transition-all cursor-pointer"
                  >
                    <span>⏪ İçe Aktarma Öncesi Son Yedeği Geri Yükle</span>
                  </button>
                )}

                {!confirmReset ? (
                  <button
                    type="button"
                    onClick={() => {
                      playClick();
                      setConfirmReset(true);
                    }}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white dark:bg-[var(--background)] border-2 border-rose-300 dark:border-rose-800 border-b-3 text-xs font-extrabold text-rose-700 dark:text-rose-300 hover:bg-rose-50 active:border-b-0 active:translate-y-0.5 transition-all cursor-pointer"
                  >
                    <Trash2 size={14} />
                    <span>İlerlemeyi Sıfırla</span>
                  </button>
                ) : (
                  <div className="inline-flex items-center gap-1.5 bg-rose-50 dark:bg-rose-950/50 border-2 border-rose-400 rounded-xl px-2.5 py-1">
                    <span className="text-xs font-extrabold text-rose-800 dark:text-rose-200">
                      Emin misiniz?
                    </span>
                    <button
                      type="button"
                      onClick={handleResetConfirmed}
                      className="px-2.5 py-1 rounded-lg bg-rose-600 text-white text-xs font-extrabold hover:bg-rose-700 cursor-pointer"
                    >
                      Evet, Sıfırla
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmReset(false)}
                      className="px-2 py-1 rounded-lg bg-white dark:bg-[var(--surface)] text-xs font-bold text-[var(--muted)] cursor-pointer"
                    >
                      Vazgeç
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Yedek İçe Aktarma Modu Seçici (Mevcut İlerlemeyle Birleştir / Tüm Verilerin Üzerine Yaz) */}
            <div className="pt-2 border-t border-dashed border-[#E2D3B8] dark:border-[var(--border-dashed)] flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <span className="text-[11px] font-bold text-[var(--muted)]">
                Yedek (.json) Yükleme Yöntemi:
              </span>
              <div className="bg-[#F7EFE1] dark:bg-[var(--surface)] rounded-xl p-1 border border-[#E6D7BE] dark:border-[var(--border)] grid grid-cols-1 sm:grid-cols-2 gap-1">
                <button
                  type="button"
                  onClick={() => {
                    playClick();
                    setImportMode("merge");
                  }}
                  className={`px-3 py-1.5 text-[11px] rounded-lg transition-all cursor-pointer ${
                    importMode === "merge"
                      ? "bg-[#0CA678] text-white font-bold"
                      : "text-[var(--muted)] font-semibold hover:text-[var(--foreground)]"
                  }`}
                >
                  Mevcut İlerlemeyle Birleştir (Önerilen)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    playClick();
                    setImportMode("overwrite");
                  }}
                  className={`px-3 py-1.5 text-[11px] rounded-lg transition-all cursor-pointer ${
                    importMode === "overwrite"
                      ? "bg-[#6741D9] text-white font-bold"
                      : "text-[var(--muted)] font-semibold hover:text-[var(--foreground)]"
                  }`}
                >
                  Tüm Verilerin Üzerine Yaz
                </button>
              </div>
            </div>

            {dataMessage && (
              <div
                className={`p-3 rounded-xl border text-xs font-bold flex items-center justify-between gap-2 ${
                  dataMessage.type === "success"
                    ? "bg-[#E6FCF5] dark:bg-emerald-950/40 border-[#0CA678]/50 text-[#087F5B] dark:text-emerald-300"
                    : "bg-rose-50 dark:bg-rose-950/40 border-rose-400 text-rose-800 dark:text-rose-200"
                }`}
              >
                <div className="flex items-center gap-2">
                  {dataMessage.type === "success" ? (
                    <CheckCircle2 size={15} className="shrink-0" />
                  ) : (
                    <AlertTriangle size={15} className="shrink-0" />
                  )}
                  <span>{dataMessage.text}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setDataMessage(null)}
                  className="text-[11px] underline opacity-80 hover:opacity-100 cursor-pointer"
                >
                  Kapat
                </button>
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
}