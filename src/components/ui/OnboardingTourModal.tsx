"use client";

import { useState, useEffect } from "react";
import {
  X,
  Sparkles,
  Languages,
  Gauge,
  Mic,
  Repeat,
  BookOpen,
  FileText,
  ChevronLeft,
  ChevronRight,
  Rocket,
  Volume2,
  Sun,
  PenTool,
  Link2,
  CheckSquare,
} from "lucide-react";
import { playClick, playSuccess } from "@/lib/sfxManager";
import { formatArabicText } from "@/lib/arabicTextUtils";
import { useSettings } from "@/store/settings";

export const ONBOARDING_STORAGE_KEY = "arapca_onboarding_done_v1";

export function triggerOnboardingTour() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("open-onboarding-tour"));
  }
}

export default function OnboardingTourModal() {
  const { showHareke, arabicFont } = useSettings();
  const [isOpen, setIsOpen] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    try {
      const done = localStorage.getItem(ONBOARDING_STORAGE_KEY);
      if (!done) {
        setIsOpen(true);
        setStep(0);
      }
    } catch {
      // ignore storage errors
    }

    const handleOpenEvent = () => {
      setStep(0);
      setIsOpen(true);
    };

    window.addEventListener("open-onboarding-tour", handleOpenEvent);
    return () => {
      window.removeEventListener("open-onboarding-tour", handleOpenEvent);
    };
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleComplete();
      if (e.key === "ArrowRight" && step < 5) setStep((s) => s + 1);
      if (e.key === "ArrowLeft" && step > 0) setStep((s) => s - 1);
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [isOpen, step]);

  const handleComplete = () => {
    playClick();
    try {
      localStorage.setItem(ONBOARDING_STORAGE_KEY, "true");
    } catch {
      // ignore
    }
    setIsOpen(false);
  };

  if (!isOpen) return null;

  const formatAr = (t: string) => formatArabicText(t, showHareke, arabicFont);

  const steps = [
    {
      badge: "ADIM 1 / 6 — HOŞ GELDİNİZ",
      title: "Arapça Konuşma, Mahreç ve Diyalog Stüdyosu",
      subtitle:
        "Modern, dokunsal ve yapay zeka destekli Arapça öğrenim platformuna hoş geldiniz!",
      visual: (
        <div className="grid grid-cols-2 gap-2.5">
          <div className="p-3 rounded-2xl bg-white dark:bg-[var(--background)] border-2 border-[#E6D7BE] dark:border-[var(--border)] space-y-1">
            <span className="text-lg font-black text-[#0CA678] block">
              60 Sesli Diyalog
            </span>
            <p className="text-[11px] font-semibold text-[var(--muted)]">
              CEFR A1–B2 seviyelerinde özel görselli ve doğal seslendirmeli
              günlük konuşmalar
            </p>
          </div>
          <div className="p-3 rounded-2xl bg-white dark:bg-[var(--background)] border-2 border-[#E6D7BE] dark:border-[var(--border)] space-y-1">
            <span className="text-lg font-black text-[#6741D9] block">
              930+ Kök Sözlük
            </span>
            <p className="text-[11px] font-semibold text-[var(--muted)]">
              5 kademeli morfolojik çözümleyici ile cümle içinden kök, müfret ve
              cemî analizi
            </p>
          </div>
          <div className="p-3 rounded-2xl bg-white dark:bg-[var(--background)] border-2 border-[#E6D7BE] dark:border-[var(--border)] space-y-1">
            <span className="text-lg font-black text-amber-600 block">
              16kHz DSP Analiz
            </span>
            <p className="text-[11px] font-semibold text-[var(--muted)]">
              Gerçek zamanlı ses dalga formu, ritim ve tempo uyumu karşılaştırması
            </p>
          </div>
          <div className="p-3 rounded-2xl bg-white dark:bg-[var(--background)] border-2 border-[#E6D7BE] dark:border-[var(--border)] space-y-1">
            <span className="text-lg font-black text-rose-600 block">
              38 Mahreç Çifti
            </span>
            <p className="text-[11px] font-semibold text-[var(--muted)]">
              Türk öğrencilerin sık karıştırdığı ح/ه, ص/س, ذ/ز, ض/د harflerine
              özel koçluk
            </p>
          </div>
        </div>
      ),
    },
    {
      badge: "ADIM 2 / 6 — HIZLI KONTROLLER",
      title: "Üst Bar Hızlı Ayar İkonları",
      subtitle:
        "Sayfadan ayrılmadan tek tıkla okuma ve dinleme deneyiminizi özelleştirin:",
      visual: (
        <div className="space-y-2">
          {[
            {
              icon: Sparkles,
              color: "bg-[#0CA678]/15 text-[#087F5B] border-[#0CA678]",
              name: "Hareke Aç / Kapa (Tashkeel)",
              desc: "Metinleri tek tıkla harekeli veya harekesiz okumaya geçirin.",
            },
            {
              icon: Languages,
              color: "bg-[#6741D9]/15 text-[#6741D9] border-[#6741D9]",
              name: "4 Çeviri Görünüm Modu",
              desc: "Alt Alta, İki Sütun, Sadece Arapça veya Sadece Türkçe modları.",
            },
            {
              icon: Gauge,
              color: "bg-amber-100 text-amber-800 border-amber-400",
              name: "Okuma Hızı (0.5x – 1.25x)",
              desc: "Seslendirmeyi yavaşlatarak her harfin mahrecini net duyun.",
            },
            {
              icon: Sun,
              color: "bg-sky-100 text-sky-800 border-sky-400",
              name: "Tema & Canlı Mikrofon Testi",
              desc: "Sıcak Krem / Gece Modu geçişi ve mikrofon sinyal doğrulaması.",
            },
          ].map((item, idx) => {
            const Icon = item.icon;
            return (
              <div
                key={idx}
                className="flex items-center gap-3 p-2.5 rounded-xl bg-white dark:bg-[var(--background)] border border-[#E6D7BE] dark:border-[var(--border)]"
              >
                <div
                  className={`w-9 h-9 rounded-xl border-2 flex items-center justify-center shrink-0 ${item.color}`}
                >
                  <Icon size={16} />
                </div>
                <div className="min-w-0">
                  <span className="block text-xs font-extrabold text-[var(--foreground)]">
                    {item.name}
                  </span>
                  <span className="block text-[11px] font-medium text-[var(--muted)]">
                    {item.desc}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      ),
    },
    {
      badge: "ADIM 3 / 6 — DİYALOG STÜDYOSU",
      title: "4 Çalışma Modu, Canlı Ok Takibi & Döngü",
      subtitle:
        "Her diyalog sayfasında 4 farklı pedagojik çalışma modu ve canlı kelime takibi bulunur:",
      visual: (
        <div className="space-y-3">
          {/* Canlı Kelime & Ok Takibi Önizlemesi */}
          <div className="p-3.5 rounded-2xl bg-white dark:bg-[var(--background)] border-2 border-[#0CA678] space-y-2">
            <div className="flex items-center justify-between text-[11px] font-extrabold text-[#087F5B]">
              <span>🎯 Canlı Karaoke Kelime & Ok Takibi (RTL)</span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#6741D9] text-white">
                <Repeat size={11} /> Döngü: 1x / 2x / 3x / ∞
              </span>
            </div>
            <div
              dir="rtl"
              className="arabic text-2xl sm:text-3xl font-bold text-right py-2 px-2"
            >
              <span>السَّلَامُ </span>
              <span className="inline-block relative bg-emerald-500/20 text-emerald-800 dark:text-emerald-200 ring-2 ring-emerald-500/40 rounded-lg px-1.5 mx-0.5">
                <span className="pointer-events-none absolute -top-3.5 left-1/2 -translate-x-1/2 text-[11px] font-black text-emerald-600">
                  ▼
                </span>
                {formatAr("عَلَيْكُمْ")}
                <span className="pointer-events-none absolute -bottom-0.5 right-0 w-3/4 h-0.5 rounded-full bg-emerald-500" />
              </span>
              <span> يَا أَخِي</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="p-2.5 rounded-xl bg-white dark:bg-[var(--background)] border border-[#E6D7BE]">
              <strong className="text-[#087F5B] block">
                📖 1. Dinle & İncele
              </strong>
              <span className="text-[11px] text-[var(--muted)]">
                Ok takipli sesli okuma ve çoklu döngü (loop)
              </span>
            </div>
            <div className="p-2.5 rounded-xl bg-white dark:bg-[var(--background)] border border-[#E6D7BE]">
              <strong className="text-[#6741D9] block">
                🎙️ 2. Telaffuz Stüdyosu
              </strong>
              <span className="text-[11px] text-[var(--muted)]">
                Ses kaydı ve 38 mahreç çifti analizi
              </span>
            </div>
            <div className="p-2.5 rounded-xl bg-white dark:bg-[var(--background)] border border-[#E6D7BE]">
              <strong className="text-amber-700 block">🎭 3. Rol Yapma</strong>
              <span className="text-[11px] text-[var(--muted)]">
                Karakter seçip otomatik mikrofonla karşılıklı konuşma
              </span>
            </div>
            <div className="p-2.5 rounded-xl bg-white dark:bg-[var(--background)] border border-[#E6D7BE]">
              <strong className="text-sky-700 block">📚 4. Diyalog Sözlüğü</strong>
              <span className="text-[11px] text-[var(--muted)]">
                Diyalogdaki tüm kelimelerin çekimli ve yalın halleri
              </span>
            </div>
          </div>
        </div>
      ),
    },
    {
      badge: "ADIM 4 / 6 — MORFOLOJİK SÖZLÜK",
      title: "Tıklanabilir Kök Analizi & Kelime Renk Kodları",
      subtitle:
        "Cümle içindeki herhangi bir Arapça kelimeye tıkladığınızda morfolojik ayrıştırma ve tür rengi açılır:",
      visual: (
        <div className="space-y-2.5">
          <div className="p-3 rounded-2xl bg-amber-50/90 dark:bg-amber-950/30 border-2 border-amber-300 border-l-4 border-l-amber-500 flex items-center justify-between gap-3">
            <div>
              <span className="px-2 py-0.5 rounded-md bg-amber-100 text-amber-800 border border-amber-300 text-[10px] font-extrabold">
                ⚡ Fiil (فعل) — Kehribar Vurgu
              </span>
              <p className="text-xs font-bold text-[var(--foreground)] mt-1">
                Mâzî, Muzâri, Masdar ve Kök harflerini gösterir
              </p>
            </div>
            <span
              dir="rtl"
              className="arabic text-2xl font-bold text-amber-700 dark:text-amber-300 shrink-0"
            >
              {formatAr("أَسْتَوْدِعُكَ")}
            </span>
          </div>

          <div className="p-3 rounded-2xl bg-sky-50/90 dark:bg-sky-950/30 border-2 border-sky-300 border-l-4 border-l-sky-500 flex items-center justify-between gap-3">
            <div>
              <span className="px-2 py-0.5 rounded-md bg-sky-100 text-sky-800 border border-sky-300 text-[10px] font-extrabold">
                📘 İsim (اسم) — Mavi Vurgu
              </span>
              <p className="text-xs font-bold text-[var(--foreground)] mt-1">
                Müfret (Tekil), Cemî (Çoğul) ve harf-i tarif yapısını gösterir
              </p>
            </div>
            <span
              dir="rtl"
              className="arabic text-2xl font-bold text-sky-700 dark:text-sky-300 shrink-0"
            >
              {formatAr("الْمُسَافِرُ")}
            </span>
          </div>

          <div className="p-3 rounded-2xl bg-purple-50/90 dark:bg-purple-950/30 border-2 border-purple-300 border-l-4 border-l-purple-500 flex items-center justify-between gap-3">
            <div>
              <span className="px-2 py-0.5 rounded-md bg-purple-100 text-purple-800 border border-purple-300 text-[10px] font-extrabold">
                🔗 Edat / Kalıp (حرف) — Mor Vurgu
              </span>
              <p className="text-xs font-bold text-[var(--foreground)] mt-1">
                Harf-i cerler, bağlaçlar, zarflar ve kalıp ifadeleri gösterir
              </p>
            </div>
            <span
              dir="rtl"
              className="arabic text-2xl font-bold text-purple-700 dark:text-purple-300 shrink-0"
            >
              {formatAr("عَلَى خَيْرٍ")}
            </span>
          </div>
        </div>
      ),
    },
    {
      badge: "ADIM 5 / 6 — ALIŞTIRMA MERKEZİ",
      title: "4 İnteraktif Alıştırma & Sınav Modu",
      subtitle:
        "İster '⚡ Hemen Göster' ister '🏁 Bitince Göster (Sınav Modu)' ile kelime ve cümleleri pekiştirin:",
      visual: (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <div className="p-3 rounded-2xl bg-white dark:bg-[var(--background)] border-2 border-[#E6D7BE] flex items-start gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-[#0CA678]/15 text-[#087F5B] flex items-center justify-center shrink-0">
              <BookOpen size={16} />
            </div>
            <div>
              <span className="block text-xs font-extrabold text-[var(--foreground)]">
                3B Kelime & Kısa Cümle Kartları
              </span>
              <span className="block text-[11px] text-[var(--muted)]">
                Sesli ön/arka yüz çevirmeli kelime ve kalıp cümle kartları
              </span>
            </div>
          </div>

          <div className="p-3 rounded-2xl bg-white dark:bg-[var(--background)] border-2 border-[#E6D7BE] flex items-start gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-[#6741D9]/15 text-[#6741D9] flex items-center justify-center shrink-0">
              <CheckSquare size={16} />
            </div>
            <div>
              <span className="block text-xs font-extrabold text-[var(--foreground)]">
                Çoktan Seçmeli Test
              </span>
              <span className="block text-[11px] text-[var(--muted)]">
                Kelime, cümle veya karışık havuzdan süreli/süresiz testler
              </span>
            </div>
          </div>

          <div className="p-3 rounded-2xl bg-white dark:bg-[var(--background)] border-2 border-[#E6D7BE] flex items-start gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center shrink-0">
              <PenTool size={16} />
            </div>
            <div>
              <span className="block text-xs font-extrabold text-[var(--foreground)]">
                Sürükle-Bırak & Dinle-Yaz İmla
              </span>
              <span className="block text-[11px] text-[var(--muted)]">
                Kelimeyi boşluğa sürükleyin veya sanal Arapça klavyeyle yazın
              </span>
            </div>
          </div>

          <div className="p-3 rounded-2xl bg-white dark:bg-[var(--background)] border-2 border-[#E6D7BE] flex items-start gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center shrink-0">
              <Link2 size={16} />
            </div>
            <div>
              <span className="block text-xs font-extrabold text-[var(--foreground)]">
                Ok Çizimli Eşleştirme
              </span>
              <span className="block text-[11px] text-[var(--muted)]">
                Soketlerden sürükleyip ok çizerek Türkçe-Arapça eşleştirme
              </span>
            </div>
          </div>
        </div>
      ),
    },
    {
      badge: "ADIM 6 / 6 — PDF DERS NOTU & TİPOGRAFİ",
      title: "Kurumsal A4 PDF Çıktısı & 5 Seçkin Arapça Font",
      subtitle:
        "Her diyaloğu çalışma kağıdı olarak yazdırabilir ve gözünüze en uygun hattı seçebilirsiniz:",
      visual: (
        <div className="space-y-3">
          <div className="p-3.5 rounded-2xl bg-white dark:bg-[var(--background)] border-2 border-[#0CA678] flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#0CA678] text-white flex items-center justify-center shrink-0">
              <FileText size={20} />
            </div>
            <div className="space-y-1">
              <span className="block text-xs sm:text-sm font-extrabold text-[var(--foreground)]">
                Özelleştirilebilir Vektörel A4 Ders Notu (PDF)
              </span>
              <p className="text-[11px] font-medium text-[var(--muted)] leading-snug">
                Harekeli/Harekesiz, Sağda Arapça – Solda Türkçe iki sütunlu
                tablo, noktalı boşluklu Kelime/İmla Testi tablosu ve Boşluk
                Doldurma çalışma kağıdı üretimi.
              </p>
            </div>
          </div>

          <div className="p-3 rounded-2xl bg-white dark:bg-[var(--background)] border border-[#E6D7BE] space-y-1.5">
            <span className="block text-xs font-extrabold text-[#4C28B5] dark:text-[#d0bfff]">
              🔤 5 Seçkin Arapça Font & Lafzatullah Tipografi Motoru:
            </span>
            <div className="flex flex-wrap gap-1.5 text-[11px] font-bold">
              {[
                "1. Arakom (Varsayılan)",
                "2. Amiri (Klasik Mushaf)",
                "3. Scheherazade New",
                "4. Noto Naskh Arabic",
                "5. Lateef",
              ].map((f) => (
                <span
                  key={f}
                  className="px-2.5 py-1 rounded-lg bg-[#F7EFE1] dark:bg-[var(--surface)] border border-[#E6D7BE] text-[var(--foreground)]"
                >
                  {f}
                </span>
              ))}
            </div>
          </div>
        </div>
      ),
    },
  ];

  const current = steps[step];

  return (
    <div
      className="fixed inset-0 z-[60] print:hidden bg-black/65 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4"
      onClick={handleComplete}
    >
      <div
        className="w-full max-w-lg bg-[#FDFBF7] dark:bg-[var(--surface)] rounded-3xl border-2 border-[#E6D7BE] dark:border-[var(--border)] border-b-4 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ÜST BAR */}
        <div className="bg-[#F7EFE1] dark:bg-[var(--background)] px-5 py-3.5 border-b-2 border-[#E6D7BE] dark:border-[var(--border)] flex items-center justify-between gap-2">
          <span className="px-2.5 py-1 rounded-lg bg-[#6741D9] text-white text-[10px] font-extrabold tracking-wider uppercase">
            {current.badge}
          </span>

          <button
            type="button"
            onClick={handleComplete}
            className="px-2.5 py-1 rounded-lg bg-white dark:bg-[var(--surface)] border border-[#E6D7BE] text-xs font-extrabold text-[var(--muted)] hover:text-[var(--foreground)] flex items-center gap-1 cursor-pointer"
          >
            <span>Turu Atla</span>
            <X size={13} />
          </button>
        </div>

        {/* GÖVDE */}
        <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
          <div className="space-y-1">
            <h2 className="text-lg sm:text-xl font-extrabold text-[var(--foreground)] leading-snug">
              {current.title}
            </h2>
            <p className="text-xs font-semibold text-[var(--muted)] leading-relaxed">
              {current.subtitle}
            </p>
          </div>

          {current.visual}
        </div>

        {/* ALT NAVİGASYON VE İLERLEME NOKTALARI */}
        <div className="bg-[#F7EFE1] dark:bg-[var(--background)] px-5 py-3.5 border-t-2 border-[#E6D7BE] dark:border-[var(--border)] flex items-center justify-between gap-3">
          {/* İlerleme Noktaları */}
          <div className="flex items-center gap-1.5">
            {steps.map((_, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => {
                  playClick();
                  setStep(idx);
                }}
                aria-label={`Adım ${idx + 1}`}
                className={`h-2.5 rounded-full transition-all cursor-pointer ${
                  idx === step
                    ? "w-6 bg-[#0CA678]"
                    : "w-2.5 bg-[#cbb692] dark:bg-slate-600"
                }`}
              />
            ))}
          </div>

          {/* Geri / İleri / Başla Butonları */}
          <div className="flex items-center gap-2">
            {step > 0 && (
              <button
                type="button"
                onClick={() => {
                  playClick();
                  setStep((s) => s - 1);
                }}
                className="h-9 px-3.5 rounded-xl bg-white dark:bg-[var(--surface)] border-2 border-[#E6D7BE] dark:border-[var(--border)] text-xs font-extrabold text-[var(--foreground)] flex items-center gap-1 cursor-pointer"
              >
                <ChevronLeft size={14} />
                <span>Geri</span>
              </button>
            )}

            {step < steps.length - 1 ? (
              <button
                type="button"
                onClick={() => {
                  playClick();
                  setStep((s) => s + 1);
                }}
                className="h-9 px-4 rounded-xl bg-[#0CA678] hover:bg-[#099268] text-white text-xs font-extrabold border-b-3 border-[#087F5B] flex items-center gap-1 cursor-pointer"
              >
                <span>İleri</span>
                <ChevronRight size={14} />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  playSuccess();
                  handleComplete();
                }}
                className="h-9 px-4 rounded-xl bg-[#6741D9] hover:bg-[#5230B5] text-white text-xs font-extrabold border-b-3 border-[#3b1f8c] flex items-center gap-1.5 cursor-pointer"
              >
                <Rocket size={14} />
                <span>🚀 Uygulamaya Başla</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
