"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Type,
  AlignLeft,
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
} from "lucide-react";
import { useSettings, ViewMode, SpeechRate } from "@/store/settings";
import { useSfxStore } from "@/store/sfxStore";
import { useUserStore } from "@/store/userStore";
import { usePwaInstall } from "@/lib/usePwaInstall";
import { playClick } from "@/lib/sfxManager";
import { playTTS } from "@/lib/audio";

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
    arabicFontSize,
    setArabicFontSize,
    turkishFontSize,
    setTurkishFontSize,
    speechRate,
    setSpeechRate,
  } = useSettings();

  const { enabled: sfxEnabled, setEnabled: setSfxEnabled } = useSfxStore();
  const {
    streakDays,
    dailyGoalMinutes,
    setDailyGoalMinutes,
    exportProgress,
    importProgress,
    resetProgress,
  } = useUserStore();
  const { isInstallable, isInstalled, isIOS, installApp } = usePwaInstall();

  const [mounted, setMounted] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [dataMessage, setDataMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [showIosGuide, setShowIosGuide] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setMounted(true);
    if (theme === "dark") document.documentElement.classList.add("dark");
    else document.documentElement.classList.remove("dark");
  }, [theme]);

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
    const reader = new FileReader();
    reader.onload = () => {
      const content = typeof reader.result === "string" ? reader.result : "";
      const ok = importProgress(content);
      if (ok) {
        playClick();
        setDataMessage({
          type: "success",
          text: "Yedek dosyası başarıyla yüklendi ve tüm ilerlemeniz geri getirildi!",
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

  const arabicSizes = [
    { label: "Normal", value: 28 },
    { label: "Orta", value: 34 },
    { label: "Büyük", value: 42 },
    { label: "Dev", value: 50 },
  ];

  const turkishSizes = [
    { label: "Küçük", value: 14 },
    { label: "Orta", value: 16 },
    { label: "Büyük", value: 18 },
    { label: "Çok Büyük", value: 21 },
  ];

  const sampleArabic = showHareke
    ? "اَلسَّلَامُ عَلَيْكُمْ، كَيْفَ حَالُكَ الْيَوْمَ؟"
    : "السلام عليكم، كيف حالك اليوم؟";

  return (
    <div className="space-y-5">
      {/* ÜST BAŞLIK */}
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
              Arapça tipografi, hareke, ses hızı ve diyalog görünüm tercihlerinizi
              özelleştirin
            </p>
          </div>
        </div>
      </div>

      {/* 1. DİYALOG GÖRÜNÜM MODU (4'lü Seçim Izgarası) */}
      <section className="space-y-2.5">
        <div className="flex items-center gap-2 px-1">
          <Eye size={17} className="text-[#087F5B]" />
          <h2 className="text-sm font-extrabold text-[var(--foreground)]">
            Diyalog Görünüm Düzeni
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
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
                className={`relative text-left p-4 rounded-2xl border-2 border-b-4 transition-all cursor-pointer ${
                  isSelected
                    ? "bg-[#F3F0FF] dark:bg-[var(--lavender-bg)] border-[#6741D9] -translate-y-0.5"
                    : "bg-[#F7EFE1] dark:bg-[var(--surface)] border-[#E6D7BE] dark:border-[var(--border)] hover:border-[#cbb692]"
                }`}
              >
                {isSelected && (
                  <span className="absolute top-3 right-3 w-6 h-6 rounded-full bg-[#6741D9] text-white flex items-center justify-center">
                    <Check size={14} strokeWidth={3} />
                  </span>
                )}
                <span
                  className={`block text-sm font-extrabold pr-7 ${
                    isSelected
                      ? "text-[#4C28B5] dark:text-[#d0bfff]"
                      : "text-[var(--foreground)]"
                  }`}
                >
                  {mode.label}
                </span>
                <span className="block text-xs text-[var(--muted)] mt-1 leading-relaxed">
                  {mode.desc}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* 2. KESİK ÇİZGİLİ SATIRLAR: OKUMA, SES VE ETKİLEŞİM AYARLARI */}
      <section className="bg-[#F7EFE1] dark:bg-[var(--surface)] rounded-2xl border-2 border-[#E6D7BE] dark:border-[var(--border)] border-b-4 px-4 sm:px-6 py-2">
        {/* Satır 1: Harekeleri Göster */}
        <div className="py-3.5 border-b border-dashed border-[#E2D3B8] dark:border-[var(--border-dashed)] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <Sparkles size={18} className="text-[#087F5B] shrink-0" />
            <div>
              <span className="block text-sm font-extrabold text-[var(--foreground)]">
                Arapça Harekeleri Göster (Tashkeel)
              </span>
              <span className="block text-xs text-[var(--muted)]">
                Üstün, esre, ötre ve şedde işaretlerini metinlerde göster veya
                gizle
              </span>
            </div>
          </div>

          <div className="bg-white dark:bg-[var(--background)] rounded-xl p-1 border border-[#E6D7BE] dark:border-[var(--border)] flex items-center gap-1 self-start sm:self-auto">
            <button
              type="button"
              onClick={() => {
                playClick();
                setShowHareke(true);
              }}
              className={`px-3.5 py-1.5 text-xs rounded-lg transition-all whitespace-nowrap ${
                showHareke
                  ? "bg-[#0CA678] text-white font-semibold"
                  : "text-[var(--muted)] font-medium hover:text-[var(--foreground)]"
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
              className={`px-3.5 py-1.5 text-xs rounded-lg transition-all whitespace-nowrap ${
                !showHareke
                  ? "bg-[#0CA678] text-white font-semibold"
                  : "text-[var(--muted)] font-medium hover:text-[var(--foreground)]"
              }`}
            >
              Harekesiz
            </button>
          </div>
        </div>

        {/* Satır 2: Sözlük İpuçları */}
        <div className="py-3.5 border-b border-dashed border-[#E2D3B8] dark:border-[var(--border-dashed)] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <BookOpen size={18} className="text-[#087F5B] shrink-0" />
            <div>
              <span className="block text-sm font-extrabold text-[var(--foreground)]">
                Kelime Tıklama Sözlük İpuçları
              </span>
              <span className="block text-xs text-[var(--muted)]">
                Diyalog içindeki Arapça kelimelere tıklayınca kök ve anlam
                penceresini aç
              </span>
            </div>
          </div>

          <div className="bg-white dark:bg-[var(--background)] rounded-xl p-1 border border-[#E6D7BE] dark:border-[var(--border)] flex items-center gap-1 self-start sm:self-auto">
            <button
              type="button"
              onClick={() => {
                playClick();
                setShowTooltips(true);
              }}
              className={`px-3.5 py-1.5 text-xs rounded-lg transition-all whitespace-nowrap ${
                showTooltips
                  ? "bg-[#0CA678] text-white font-semibold"
                  : "text-[var(--muted)] font-medium hover:text-[var(--foreground)]"
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
              className={`px-3.5 py-1.5 text-xs rounded-lg transition-all whitespace-nowrap ${
                !showTooltips
                  ? "bg-[#0CA678] text-white font-semibold"
                  : "text-[var(--muted)] font-medium hover:text-[var(--foreground)]"
              }`}
            >
              Kapalı
            </button>
          </div>
        </div>

        {/* Satır 3: Gölgeleme (Ses Kaydı) */}
        <div className="py-3.5 border-b border-dashed border-[#E2D3B8] dark:border-[var(--border-dashed)] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <Mic size={18} className="text-[#087F5B] shrink-0" />
            <div>
              <span className="block text-sm font-extrabold text-[var(--foreground)]">
                Gölgeleme & Mahreç Kayıt Butonları
              </span>
              <span className="block text-xs text-[var(--muted)]">
                Diyalog satırlarında kendi sesinizi kaydedip analiz etme
                butonunu göster
              </span>
            </div>
          </div>

          <div className="bg-white dark:bg-[var(--background)] rounded-xl p-1 border border-[#E6D7BE] dark:border-[var(--border)] flex items-center gap-1 self-start sm:self-auto">
            <button
              type="button"
              onClick={() => {
                playClick();
                setShowShadowing(true);
              }}
              className={`px-3.5 py-1.5 text-xs rounded-lg transition-all whitespace-nowrap ${
                showShadowing
                  ? "bg-[#0CA678] text-white font-semibold"
                  : "text-[var(--muted)] font-medium hover:text-[var(--foreground)]"
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
              className={`px-3.5 py-1.5 text-xs rounded-lg transition-all whitespace-nowrap ${
                !showShadowing
                  ? "bg-[#0CA678] text-white font-semibold"
                  : "text-[var(--muted)] font-medium hover:text-[var(--foreground)]"
              }`}
            >
              Kapalı
            </button>
          </div>
        </div>

        {/* Satır 4: TTS Okuma Hızı */}
        <div className="py-3.5 border-b border-dashed border-[#E2D3B8] dark:border-[var(--border-dashed)] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <Gauge size={18} className="text-[#087F5B] shrink-0" />
            <div>
              <span className="block text-sm font-extrabold text-[var(--foreground)]">
                Arapça Seslendirme Hızı (TTS / MP3)
              </span>
              <span className="block text-xs text-[var(--muted)]">
                Varsayılan konuşma ve telaffuz dinleme hızı (0.5x - 1.25x)
              </span>
            </div>
          </div>

          <div className="bg-white dark:bg-[var(--background)] rounded-xl p-1 border border-[#E6D7BE] dark:border-[var(--border)] flex items-center gap-1 self-start sm:self-auto">
            {([0.5, 0.75, 1, 1.25] as SpeechRate[]).map((rate) => (
              <button
                key={rate}
                type="button"
                onClick={() => {
                  playClick();
                  setSpeechRate(rate);
                }}
                className={`px-3.5 py-1.5 text-xs tabular-nums rounded-lg transition-all whitespace-nowrap ${
                  speechRate === rate
                    ? "bg-[#0CA678] text-white font-semibold"
                    : "text-[var(--muted)] font-medium hover:text-[var(--foreground)]"
                }`}
              >
                {rate}x
              </button>
            ))}
          </div>
        </div>

        {/* Satır 5: Ses Efektleri */}
        <div className="py-3.5 border-b border-dashed border-[#E2D3B8] dark:border-[var(--border-dashed)] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <Volume2 size={18} className="text-[#087F5B] shrink-0" />
            <div>
              <span className="block text-sm font-extrabold text-[var(--foreground)]">
                Etkileşim Ses Efektleri (SFX)
              </span>
              <span className="block text-xs text-[var(--muted)]">
                Buton tıklama, doğru/yanlış cevap ve telaffuz bildirim sesleri
              </span>
            </div>
          </div>

          <div className="bg-white dark:bg-[var(--background)] rounded-xl p-1 border border-[#E6D7BE] dark:border-[var(--border)] flex items-center gap-1 self-start sm:self-auto">
            <button
              type="button"
              onClick={() => {
                setSfxEnabled(true);
                playClick();
              }}
              className={`px-3.5 py-1.5 text-xs rounded-lg transition-all whitespace-nowrap ${
                sfxEnabled
                  ? "bg-[#0CA678] text-white font-semibold"
                  : "text-[var(--muted)] font-medium hover:text-[var(--foreground)]"
              }`}
            >
              Açık
            </button>
            <button
              type="button"
              onClick={() => setSfxEnabled(false)}
              className={`px-3.5 py-1.5 text-xs rounded-lg transition-all whitespace-nowrap ${
                !sfxEnabled
                  ? "bg-[#0CA678] text-white font-semibold"
                  : "text-[var(--muted)] font-medium hover:text-[var(--foreground)]"
              }`}
            >
              Kapalı
            </button>
          </div>
        </div>

        {/* Satır 6: Tema Görünümü */}
        <div className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <Monitor size={18} className="text-[#087F5B] shrink-0" />
            <div>
              <span className="block text-sm font-extrabold text-[var(--foreground)]">
                Renk Teması
              </span>
              <span className="block text-xs text-[var(--muted)]">
                Sıcak fildişi/krem gündüz modu veya göz yormayan gece modu
              </span>
            </div>
          </div>

          <div className="bg-white dark:bg-[var(--background)] rounded-xl p-1 border border-[#E6D7BE] dark:border-[var(--border)] flex items-center gap-1 self-start sm:self-auto">
            <button
              type="button"
              onClick={() => {
                playClick();
                setTheme("light");
              }}
              className={`px-3.5 py-1.5 text-xs rounded-lg transition-all whitespace-nowrap ${
                theme === "light"
                  ? "bg-[#0CA678] text-white font-semibold"
                  : "text-[var(--muted)] font-medium hover:text-[var(--foreground)]"
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
              className={`px-3.5 py-1.5 text-xs rounded-lg transition-all whitespace-nowrap ${
                theme === "dark"
                  ? "bg-[#0CA678] text-white font-semibold"
                  : "text-[var(--muted)] font-medium hover:text-[var(--foreground)]"
              }`}
            >
              Gece Modu
            </button>
          </div>
        </div>
      </section>

      {/* 3. TİPOGRAFİ BOYUTLARI VE CANLI ÖNİZLEME */}
      <section className="bg-[#F7EFE1] dark:bg-[var(--surface)] rounded-2xl border-2 border-[#E6D7BE] dark:border-[var(--border)] border-b-4 px-4 sm:px-6 py-3">
        {/* Satır 1: Arapça Yazı Boyutu */}
        <div className="py-3.5 border-b border-dashed border-[#E2D3B8] dark:border-[var(--border-dashed)] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <Type size={18} className="text-[#087F5B] shrink-0" />
            <div>
              <span className="block text-sm font-extrabold text-[var(--foreground)]">
                Arapça Metin Boyutu ({arabicFontSize}px)
              </span>
              <span className="block text-xs text-[var(--muted)]">
                Arakom fontuyla gösterilen diyalog cümlelerinin punto büyüklüğü
              </span>
            </div>
          </div>

          <div className="bg-white dark:bg-[var(--background)] rounded-xl p-1 border border-[#E6D7BE] dark:border-[var(--border)] flex flex-wrap items-center gap-1 self-start sm:self-auto">
            {arabicSizes.map((s) => (
              <button
                key={s.value}
                type="button"
                onClick={() => {
                  playClick();
                  setArabicFontSize(s.value);
                }}
                className={`px-3 py-1.5 text-xs rounded-lg transition-all whitespace-nowrap ${
                  arabicFontSize === s.value
                    ? "bg-[#0CA678] text-white font-semibold"
                    : "text-[var(--muted)] font-medium hover:text-[var(--foreground)]"
                }`}
              >
                {s.label} ({s.value}px)
              </button>
            ))}
          </div>
        </div>

        {/* Satır 2: Türkçe Yazı Boyutu */}
        <div className="py-3.5 border-b border-dashed border-[#E2D3B8] dark:border-[var(--border-dashed)] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <AlignLeft size={18} className="text-[#087F5B] shrink-0" />
            <div>
              <span className="block text-sm font-extrabold text-[var(--foreground)]">
                Türkçe Çeviri Boyutu ({turkishFontSize}px)
              </span>
              <span className="block text-xs text-[var(--muted)]">
                Diyalog altındaki Türkçe çeviri metinlerinin punto büyüklüğü
              </span>
            </div>
          </div>

          <div className="bg-white dark:bg-[var(--background)] rounded-xl p-1 border border-[#E6D7BE] dark:border-[var(--border)] flex flex-wrap items-center gap-1 self-start sm:self-auto">
            {turkishSizes.map((s) => (
              <button
                key={s.value}
                type="button"
                onClick={() => {
                  playClick();
                  setTurkishFontSize(s.value);
                }}
                className={`px-3 py-1.5 text-xs rounded-lg transition-all whitespace-nowrap ${
                  turkishFontSize === s.value
                    ? "bg-[#0CA678] text-white font-semibold"
                    : "text-[var(--muted)] font-medium hover:text-[var(--foreground)]"
                }`}
              >
                {s.label} ({s.value}px)
              </button>
            ))}
          </div>
        </div>

        {/* Satır 3: Canlı Önizleme Kutusu */}
        <div className="py-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-extrabold uppercase tracking-wider text-[var(--muted)]">
              Canlı Tipografi ve Ses Önizlemesi
            </span>
            <button
              type="button"
              onClick={() => {
                playClick();
                playTTS(sampleArabic, speechRate);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#0CA678] text-white text-xs font-bold border-b-3 border-[#087F5B] active:border-b-0 active:translate-y-0.5 transition-all cursor-pointer"
            >
              <Volume2 size={14} />
              <span>Örnek Cümleyi Dinle ({speechRate}x)</span>
            </button>
          </div>

          <div className="bg-white dark:bg-[var(--background)] rounded-2xl border-2 border-[#E6D7BE] dark:border-[var(--border)] p-4 sm:p-5 space-y-2">
            {viewMode !== "turkish-only" && (
              <p
                dir="rtl"
                style={{ fontSize: `${arabicFontSize}px` }}
                className="arabic font-bold text-[var(--foreground)] leading-relaxed"
              >
                {sampleArabic}
              </p>
            )}
            {viewMode !== "arabic-only" && (
              <p
                style={{ fontSize: `${turkishFontSize}px` }}
                className="font-semibold text-[var(--muted)]"
              >
                “Selamün aleyküm, bugün nasılsınız?”
              </p>
            )}
          </div>
        </div>
      </section>

      {/* 4. VERİ YÖNETİMİ, GÜNLÜK HEDEF VE PWA KURULUMU */}
      <section className="bg-[#F7EFE1] dark:bg-[var(--surface)] rounded-2xl border-2 border-[#E6D7BE] dark:border-[var(--border)] border-b-4 px-4 sm:px-6 py-3 space-y-1">
        {/* Satır 1: Günlük Çalışma Hedefi ve Seri */}
        <div className="py-3.5 border-b border-dashed border-[#E2D3B8] dark:border-[var(--border-dashed)] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <Flame size={18} className="text-orange-500 shrink-0" />
            <div>
              <span className="block text-sm font-extrabold text-[var(--foreground)]">
                Günlük Çalışma Hedefi ({dailyGoalMinutes} dk) · 🔥 {streakDays} Gün Seri
              </span>
              <span className="block text-xs text-[var(--muted)]">
                Her gün düzenli Arapça pratik için hedef sürenizi belirleyin
              </span>
            </div>
          </div>

          <div className="bg-white dark:bg-[var(--background)] rounded-xl p-1 border border-[#E6D7BE] dark:border-[var(--border)] flex items-center gap-1 self-start sm:self-auto">
            {[10, 15, 30, 45].map((mins) => (
              <button
                key={mins}
                type="button"
                onClick={() => {
                  playClick();
                  setDailyGoalMinutes(mins);
                }}
                className={`px-3 py-1.5 text-xs tabular-nums rounded-lg transition-all whitespace-nowrap ${
                  dailyGoalMinutes === mins
                    ? "bg-[#0CA678] text-white font-semibold"
                    : "text-[var(--muted)] font-medium hover:text-[var(--foreground)]"
                }`}
              >
                {mins} dk
              </button>
            ))}
          </div>
        </div>

        {/* Satır 2: Cihaza Uygulama Olarak Kur (PWA) */}
        <div className="py-3.5 border-b border-dashed border-[#E2D3B8] dark:border-[var(--border-dashed)] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <Smartphone size={18} className="text-[#6741D9] shrink-0" />
            <div>
              <span className="block text-sm font-extrabold text-[var(--foreground)]">
                Uygulamayı Cihaza Kur (Çevrimdışı PWA)
              </span>
              <span className="block text-xs text-[var(--muted)]">
                Ana ekrana ekleyerek tam ekran ve internet olmadan da kullanın
              </span>
            </div>
          </div>

          <div>
            {isInstalled ? (
              <span className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#E6FCF5] dark:bg-emerald-950/50 text-[#087F5B] dark:text-emerald-300 border border-[#0CA678]/40 text-xs font-extrabold">
                <CheckCircle2 size={15} />
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
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#6741D9] hover:bg-[#5230B5] text-white border-b-3 border-[#4C28B5] text-xs font-extrabold active:border-b-0 active:translate-y-0.5 transition-all cursor-pointer"
              >
                <Download size={14} />
                <span>Uygulamayı Kur</span>
              </button>
            )}
          </div>
        </div>

        {showIosGuide && !isInstalled && (
          <div className="my-2 p-3.5 rounded-xl bg-white dark:bg-[var(--background)] border border-[#6741D9]/40 text-xs font-semibold text-[var(--foreground)]">
            {isIOS ? (
              <p>
                <strong>iPhone / iPad Kurulumu:</strong> Safari alt çubuğundaki{" "}
                <strong>Paylaş</strong> butonuna dokunun ve{" "}
                <strong>&ldquo;Ana Ekrana Ekle&rdquo;</strong> seçeneğini seçin.
              </p>
            ) : (
              <p>
                <strong>Masaüstü / Android Kurulumu:</strong> Tarayıcı adres
                çubuğunun sağındaki <strong>Uygulamayı Yükle</strong> simgesine
                veya tarayıcı menüsündeki{" "}
                <strong>&ldquo;Ana Ekrana Ekle / Uygulamayı Yükle&rdquo;</strong>{" "}
                seçeneğine tıklayın.
              </p>
            )}
          </div>
        )}

        {/* Satır 3: Veri Yönetimi ve Yedekleme */}
        <div className="py-3.5 flex flex-col gap-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <Database size={18} className="text-[#087F5B] shrink-0" />
              <div>
                <span className="block text-sm font-extrabold text-[var(--foreground)]">
                  Veri Yönetimi ve Yedekleme
                </span>
                <span className="block text-xs text-[var(--muted)]">
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
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white dark:bg-[var(--background)] border-2 border-[#E6D7BE] dark:border-[var(--border)] border-b-3 text-xs font-extrabold text-[var(--foreground)] hover:border-[#6741D9] active:border-b-0 active:translate-y-0.5 transition-all cursor-pointer"
              >
                <Upload size={14} className="text-[#6741D9]" />
                <span>Yedek Yükle (.json)</span>
              </button>

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
    </div>
  );
}