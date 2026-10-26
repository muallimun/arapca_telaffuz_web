"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  BookOpen,
  Mic,
  Gamepad2,
  BookMarked,
  Check,
  Volume2,
  ArrowRight,
  RefreshCw,
  CheckCircle2,
  Brain,
  Award,
  Clock,
  Flame,
  SlidersHorizontal,
  Languages,
  Gauge,
  Play,
} from "lucide-react";
import { diyaloglar, sozluk } from "@/lib/data";
import { useUserStore } from "@/store/userStore";
import {
  useSettings,
  PreferredLevel,
  SpeechRate,
} from "@/store/settings";
import { playClick } from "@/lib/sfxManager";
import { playTTS, loadAudioManifest, hasMp3, getMp3Path } from "@/lib/audio";
import { useAudioStore } from "@/store/audioStore";
import ShadowingModal from "@/components/ui/ShadowingModal";

type ModuleKey = "kutuphane" | "telaffuz" | "alistirmalar" | "sozluk";

interface ModuleItem {
  id: ModuleKey;
  title: string;
  arabicBadge: string;
  subtitle: string;
  meta: string;
  icon: typeof BookOpen;
  targetHref: string;
  ctaText: string;
}

export default function HomePage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [selectedModule, setSelectedModule] = useState<ModuleKey>("kutuphane");
  const [tipIndex, setTipIndex] = useState(0);
  const [manifestLoaded, setManifestLoaded] = useState(false);
  const [shadowingModalData, setShadowingModalData] = useState<{
    text: string;
    audioUrl?: string;
  } | null>(null);

  const {
    completedDialogues,
    learnedWords,
    weakWords,
    pronunciationScores,
    studyMinutes,
    streakDays,
    dailyGoalMinutes,
  } = useUserStore();

  const {
    preferredLevel,
    setPreferredLevel,
    viewMode,
    setViewMode,
    speechRate,
    setSpeechRate,
    showHareke,
  } = useSettings();

  const { playAudio } = useAudioStore();

  useEffect(() => {
    setMounted(true);
    // Günün tarihine göre başlangıç ipucu belirle
    const daySeed = new Date().getDate() % Math.max(1, diyaloglar.length);
    setTipIndex(daySeed);
    loadAudioManifest().then(() => setManifestLoaded(true));
  }, []);

  const modules: ModuleItem[] = useMemo(
    () => [
      {
        id: "kutuphane",
        title: "Diyalog Kütüphanesi",
        arabicBadge: "الحِوَارَات",
        subtitle: "Günlük hayattan sesli Arapça konuşma metinleri",
        meta: `${diyaloglar.length} Diyalog · A1-B2`,
        icon: BookOpen,
        targetHref: "/kutuphane",
        ctaText: "Diyalog Kütüphanesini Aç ve Çalışmaya Başla",
      },
      {
        id: "telaffuz",
        title: "Telaffuz & Gölgeleme",
        arabicBadge: "التَّلَفُّظ",
        subtitle: "Mahreç analizi, ses dalgası ve yapay zeka koçluğu",
        meta: "Canlı Mikrofon · Mahreç Rehberi",
        icon: Mic,
        targetHref: "/diyalog/dlg_01",
        ctaText: "Telaffuz & Gölgeleme Stüdyosunu Başlat",
      },
      {
        id: "alistirmalar",
        title: "Kelime Alıştırmaları",
        arabicBadge: "التَّدْرِيبَات",
        subtitle: "Kartlar, çoktan seçmeli test, eşleştirme ve boşluk doldurma",
        meta: "4 Farklı Modül · Süreli/Süresiz",
        icon: Gamepad2,
        targetHref: "/alistirmalar",
        ctaText: "Kelime Alıştırmalarına Başla",
      },
      {
        id: "sozluk",
        title: "İnteraktif Sözlük",
        arabicBadge: "المُعْجَم",
        subtitle: "Kök harfler, müfret-cemî, mâzî-muzâri ve sesli telaffuz",
        meta: `${sozluk.length} Kelime · Sesli Sözlük`,
        icon: BookMarked,
        targetHref: "/sozluk",
        ctaText: "İnteraktif Sözlüğü Keşfetmeye Başla",
      },
    ],
    []
  );

  // Günün Arapça Diyaloğu / Kalıp İpucu
  const featuredDialogue = useMemo(() => {
    const dlg = diyaloglar[tipIndex % diyaloglar.length] || diyaloglar[0];
    // Diyalogdan anlamlı bir cümle seç (tercihen 2. satır)
    const line = dlg.satirlar[1] || dlg.satirlar[0];
    return { dlg, line };
  }, [tipIndex]);

  const removeTashkeel = (text: string) => text.replace(/[\u064B-\u0652]/g, "");
  const displayArabic = (text: string) =>
    !mounted || showHareke ? text : removeTashkeel(text);

  // Telaffuz Başarısı Hesaplama
  const pronunciationAccuracy = useMemo(() => {
    if (!mounted) return 85;
    if (pronunciationScores && pronunciationScores.length > 0) {
      const sum = pronunciationScores.reduce((acc, s) => acc + s, 0);
      return Math.round(sum / pronunciationScores.length);
    }
    const totalPracticed = learnedWords.length + weakWords.length;
    if (totalPracticed > 0) {
      return Math.max(
        60,
        Math.min(98, Math.round((learnedWords.length / totalPracticed) * 100))
      );
    }
    return 88;
  }, [mounted, pronunciationScores, learnedWords.length, weakWords.length]);

  const handleListenFeatured = async () => {
    playClick();
    const { dlg, line } = featuredDialogue;
    const rate = mounted ? speechRate : 1;
    if (manifestLoaded && hasMp3(dlg.id, line.sira)) {
      try {
        await playAudio(getMp3Path(dlg.id, line.sira), line.sira, rate);
        return;
      } catch {
        // TTS fallback
      }
    }
    await playTTS(line.arapca, rate);
  };

  const handlePracticeFeatured = () => {
    playClick();
    const { dlg, line } = featuredDialogue;
    const audioUrl =
      manifestLoaded && hasMp3(dlg.id, line.sira)
        ? getMp3Path(dlg.id, line.sira)
        : undefined;
    setShadowingModalData({ text: line.arapca, audioUrl });
  };

  // Seçilen seviyeye uygun ilk diyaloğu bul
  const recommendedDialogueId = useMemo(() => {
    const targetLevels =
      preferredLevel === "Başlangıç"
        ? ["A1"]
        : preferredLevel === "Orta"
        ? ["A2"]
        : ["B1", "B2"];
    const candidate = diyaloglar.find(
      (d) =>
        targetLevels.includes(d.seviye) &&
        (!mounted || !completedDialogues.includes(d.id))
    );
    return candidate?.id || diyaloglar[0]?.id || "dlg_01";
  }, [preferredLevel, mounted, completedDialogues]);

  const handlePrimaryCTA = () => {
    playClick();
    if (selectedModule === "kutuphane") {
      const levelParam =
        preferredLevel === "Başlangıç"
          ? "A1"
          : preferredLevel === "Orta"
          ? "A2"
          : "B1";
      router.push(`/kutuphane?seviye=${levelParam}`);
    } else if (selectedModule === "telaffuz") {
      router.push(`/diyalog/${recommendedDialogueId}`);
    } else if (selectedModule === "alistirmalar") {
      router.push("/alistirmalar");
    } else {
      router.push("/sozluk");
    }
  };

  const isTranslationVisible = viewMode !== "arabic-only";

  return (
    <div className="space-y-5">
      {/* GÖLGELEME MODALI */}
      {shadowingModalData && (
        <ShadowingModal
          text={shadowingModalData.text}
          refAudioUrl={shadowingModalData.audioUrl}
          onClose={() => setShadowingModalData(null)}
        />
      )}

      {/* BÖLÜM 1: ÜSTTE 4'LÜ SEÇİM KARTI IZGARASI */}
      <section aria-label="Çalışma Modülü Seçimi" className="space-y-2.5">
        <div className="flex items-center justify-between px-1">
          <div>
            <h1 className="text-lg sm:text-xl font-extrabold text-[var(--foreground)] tracking-tight">
              Çalışma Modülünü Seçin
            </h1>
            <p className="text-xs font-medium text-[var(--muted)]">
              Odaklanmak istediğiniz Arapça eğitim modülünü işaretleyin
            </p>
          </div>
          <span className="arabic text-xl sm:text-2xl font-bold text-[#087F5B] dark:text-[#20c997]">
            أَهْلًا وَسَهْلًا
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          {modules.map((mod) => {
            const isSelected = selectedModule === mod.id;
            const Icon = mod.icon;

            return (
              <div
                key={mod.id}
                role="button"
                tabIndex={0}
                onClick={() => {
                  playClick();
                  setSelectedModule(mod.id);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    playClick();
                    setSelectedModule(mod.id);
                  }
                }}
                className={`relative text-left p-4 rounded-2xl border-2 border-b-4 transition-all cursor-pointer select-none flex flex-col justify-between min-h-[156px] ${
                  isSelected
                    ? "bg-[#F3F0FF] dark:bg-[var(--lavender-bg)] border-[#6741D9] -translate-y-0.5 shadow-sm"
                    : "bg-[#F7EFE1] dark:bg-[var(--surface)] border-[#E6D7BE] dark:border-[var(--border)] hover:border-[#cbb692]"
                }`}
              >
                {/* Sağ Üst Yuvarlak Mor Onay (✓) Rozeti */}
                {isSelected ? (
                  <span
                    aria-label="Seçili Modül"
                    className="absolute top-3 right-3 w-6 h-6 rounded-full bg-[#6741D9] text-white flex items-center justify-center shadow-xs"
                  >
                    <Check size={14} strokeWidth={3} />
                  </span>
                ) : (
                  <span className="arabic absolute top-2.5 right-3.5 text-lg font-bold text-[var(--muted)] opacity-75">
                    {mod.arabicBadge}
                  </span>
                )}

                <div>
                  <div
                    className={`w-10 h-10 rounded-xl border-2 border-b-3 flex items-center justify-center mb-3 ${
                      isSelected
                        ? "bg-[#6741D9] border-[#5230B5] text-white"
                        : "bg-white dark:bg-[var(--background)] border-[#E6D7BE] dark:border-[var(--border)] text-[#087F5B]"
                    }`}
                  >
                    <Icon size={20} strokeWidth={2.3} />
                  </div>

                  <h2
                    className={`text-base font-extrabold leading-snug ${
                      isSelected
                        ? "text-[#4C28B5] dark:text-[#d0bfff]"
                        : "text-[var(--foreground)]"
                    }`}
                  >
                    {mod.title}
                  </h2>
                  <p className="text-xs text-[var(--muted)] mt-1 leading-relaxed line-clamp-2">
                    {mod.subtitle}
                  </p>
                </div>

                <div className="mt-3 pt-2.5 border-t border-dashed border-[#E2D3B8] dark:border-[var(--border-dashed)] flex items-center justify-between text-[11px] font-bold">
                  <span className="text-[var(--muted)] truncate">{mod.meta}</span>
                  <Link
                    href={
                      mod.id === "telaffuz"
                        ? `/diyalog/${recommendedDialogueId}`
                        : mod.targetHref
                    }
                    onClick={(e) => {
                      e.stopPropagation();
                      playClick();
                    }}
                    className={`inline-flex items-center gap-1 shrink-0 ${
                      isSelected
                        ? "text-[#6741D9] dark:text-[#b197fc] hover:underline"
                        : "text-[#087F5B] dark:text-[#20c997] hover:underline"
                    }`}
                  >
                    <span>Aç</span>
                    <ArrowRight size={12} />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* BÖLÜM 2: GÜNÜN ARAPÇA DİYALOĞU / KALIP İPUCU ŞERİDİ */}
      <section
        aria-label="Günün Arapça Kalıbı ve Diyalog İpucu"
        className="bg-[#F7EFE1] dark:bg-[var(--surface)] rounded-2xl border-2 border-[#E6D7BE] dark:border-[var(--border)] border-b-4 p-4 sm:p-5"
      >
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1.5 flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-xs font-bold text-[#087F5B] dark:text-[#20c997]">
              <span>Günün Konuşma Kalıbı</span>
              <span aria-hidden="true">·</span>
              <span className="text-[var(--muted)]">
                {featuredDialogue.dlg.baslik_tr} ({featuredDialogue.dlg.seviye})
              </span>
              <button
                type="button"
                onClick={() => {
                  playClick();
                  setTipIndex((prev) => (prev + 1) % diyaloglar.length);
                }}
                className="ml-auto md:ml-2 inline-flex items-center gap-1 text-[11px] font-bold text-[var(--muted)] hover:text-[var(--foreground)] bg-white dark:bg-[var(--background)] px-2.5 py-1 rounded-lg border border-[#E6D7BE] dark:border-[var(--border)] transition-colors"
                title="Farklı bir cümle göster"
              >
                <RefreshCw size={12} />
                <span>Değiştir</span>
              </button>
            </div>

            <p
              dir="rtl"
              className="arabic text-2xl sm:text-3xl font-bold text-[var(--foreground)] py-1 leading-relaxed break-words"
            >
              {displayArabic(featuredDialogue.line.arapca)}
            </p>

            {isTranslationVisible && (
              <p className="text-sm font-semibold text-[var(--muted)]">
                “{featuredDialogue.line.turkce}”
              </p>
            )}
          </div>

          <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleListenFeatured}
              className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-white dark:bg-[var(--background)] border-2 border-[#E6D7BE] dark:border-[var(--border)] border-b-4 text-xs font-extrabold text-[var(--foreground)] hover:bg-[#FDFBF7] active:border-b-2 active:translate-y-0.5 transition-all whitespace-nowrap"
            >
              <Volume2 size={16} className="text-[#0CA678]" />
              <span>Sesli Dinle</span>
            </button>

            <button
              type="button"
              onClick={handlePracticeFeatured}
              className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-[#F3F0FF] dark:bg-[var(--lavender-bg)] border-2 border-[#6741D9] border-b-4 text-xs font-extrabold text-[#6741D9] dark:text-[#d0bfff] hover:opacity-95 active:border-b-2 active:translate-y-0.5 transition-all whitespace-nowrap"
            >
              <Mic size={16} />
              <span>Telaffuz Et</span>
            </button>

            <Link
              href={`/diyalog/${featuredDialogue.dlg.id}`}
              onClick={() => playClick()}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-[#0CA678] hover:bg-[#099268] text-white border-b-4 border-[#087F5B] text-xs font-extrabold active:border-b-0 active:translate-y-1 transition-all whitespace-nowrap"
            >
              <span>Diyaloğa Git</span>
              <ArrowRight size={15} />
            </Link>
          </div>
        </div>
      </section>

      {/* BÖLÜM 3: 4 SÜTUNLU ÖĞRENCİ İLERLEME ÖZETİ */}
      <section aria-label="Öğrenci İlerleme Özeti">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {/* 1. Tamamlanan Diyalog */}
          <Link
            href="/kutuphane?durum=completed"
            onClick={() => playClick()}
            className="bg-[#F7EFE1] dark:bg-[var(--surface)] rounded-2xl border-2 border-[#E6D7BE] dark:border-[var(--border)] border-b-4 p-4 flex items-center gap-3 hover:border-[#0CA678] transition-colors"
          >
            <div className="w-11 h-11 rounded-xl bg-white dark:bg-[var(--background)] border border-[#E6D7BE] dark:border-[var(--border)] flex items-center justify-center text-[#0CA678] shrink-0">
              <CheckCircle2 size={22} strokeWidth={2.4} />
            </div>
            <div className="min-w-0">
              <span className="block text-xl sm:text-2xl font-black tabular-nums text-[var(--foreground)] leading-none">
                {mounted ? completedDialogues.length : 0}
                <span className="text-xs font-bold text-[var(--muted)]">
                  /{diyaloglar.length}
                </span>
              </span>
              <span className="block text-xs font-bold text-[var(--muted)] mt-1 truncate">
                Tamamlanan Diyalog
              </span>
            </div>
          </Link>

          {/* 2. Öğrenilen Kelime */}
          <Link
            href="/sozluk?durum=learned"
            onClick={() => playClick()}
            className="bg-[#F7EFE1] dark:bg-[var(--surface)] rounded-2xl border-2 border-[#E6D7BE] dark:border-[var(--border)] border-b-4 p-4 flex items-center gap-3 hover:border-[#0CA678] transition-colors"
          >
            <div className="w-11 h-11 rounded-xl bg-white dark:bg-[var(--background)] border border-[#E6D7BE] dark:border-[var(--border)] flex items-center justify-center text-[#6741D9] shrink-0">
              <Brain size={22} strokeWidth={2.4} />
            </div>
            <div className="min-w-0">
              <span className="block text-xl sm:text-2xl font-black tabular-nums text-[var(--foreground)] leading-none">
                {mounted ? learnedWords.length : 0}
                <span className="text-xs font-bold text-[var(--muted)]">
                  /{sozluk.length}
                </span>
              </span>
              <span className="block text-xs font-bold text-[var(--muted)] mt-1 truncate">
                Öğrenilen Kelime
              </span>
            </div>
          </Link>

          {/* 3. Telaffuz Başarısı */}
          <button
            type="button"
            onClick={handlePracticeFeatured}
            className="bg-[#F7EFE1] dark:bg-[var(--surface)] rounded-2xl border-2 border-[#E6D7BE] dark:border-[var(--border)] border-b-4 p-4 flex items-center gap-3 text-left hover:border-[#0CA678] transition-colors"
          >
            <div className="w-11 h-11 rounded-xl bg-white dark:bg-[var(--background)] border border-[#E6D7BE] dark:border-[var(--border)] flex items-center justify-center text-amber-600 shrink-0">
              <Award size={22} strokeWidth={2.4} />
            </div>
            <div className="min-w-0">
              <span className="block text-xl sm:text-2xl font-black tabular-nums text-[var(--foreground)] leading-none">
                %{pronunciationAccuracy}
              </span>
              <span className="block text-xs font-bold text-[var(--muted)] mt-1 truncate">
                Telaffuz Başarısı
              </span>
            </div>
          </button>

          {/* 4. Günlük Seri & Çalışma Süresi */}
          <Link
            href="/alistirmalar"
            onClick={() => playClick()}
            className="bg-[#F7EFE1] dark:bg-[var(--surface)] rounded-2xl border-2 border-[#E6D7BE] dark:border-[var(--border)] border-b-4 p-4 flex flex-col justify-between gap-2.5 hover:border-[#0CA678] transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-white dark:bg-[var(--background)] border border-[#E6D7BE] dark:border-[var(--border)] flex items-center justify-center text-orange-500 shrink-0">
                <Flame size={22} strokeWidth={2.4} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-1.5 flex-wrap">
                  <span className="text-xl sm:text-2xl font-black tabular-nums text-[var(--foreground)] leading-none">
                    🔥 {mounted ? streakDays : 1}
                  </span>
                  <span className="text-xs font-extrabold text-orange-600 dark:text-orange-400">
                    Gün
                  </span>
                  <span className="text-[11px] font-bold text-[var(--muted)] ml-auto inline-flex items-center gap-0.5 tabular-nums">
                    <Clock size={11} />
                    {mounted ? studyMinutes : 0}/{mounted ? dailyGoalMinutes : 15} dk
                  </span>
                </div>
                <span className="block text-xs font-bold text-[var(--muted)] mt-1 truncate">
                  Günlük Seri & Süre
                </span>
              </div>
            </div>
            <div className="w-full h-1.5 bg-white dark:bg-[var(--background)] rounded-full overflow-hidden border border-[#E6D7BE]/70 dark:border-[var(--border)]">
              <div
                className="h-full bg-[#0CA678] rounded-full transition-all duration-500"
                style={{
                  width: `${Math.min(
                    100,
                    Math.round(
                      ((mounted ? studyMinutes : 0) /
                        Math.max(1, mounted ? dailyGoalMinutes : 15)) *
                        100
                    )
                  )}%`,
                }}
              />
            </div>
          </Link>
        </div>
      </section>

      {/* BÖLÜM 4: KESİK ÇİZGİLİ SATIRLARDA HIZLI ÇALIŞMA TERCİHLERİ */}
      <section
        aria-label="Hızlı Çalışma Tercihleri"
        className="bg-[#F7EFE1] dark:bg-[var(--surface)] rounded-2xl border-2 border-[#E6D7BE] dark:border-[var(--border)] border-b-4 px-4 sm:px-6 py-2"
      >
        {/* Satır 1: Seviye */}
        <div className="py-3.5 border-b border-dashed border-[#E2D3B8] dark:border-[var(--border-dashed)] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <SlidersHorizontal
              size={18}
              className="text-[#087F5B] dark:text-[#20c997] shrink-0"
            />
            <div>
              <span className="block text-sm font-extrabold text-[var(--foreground)]">
                Eğitim Seviyesi
              </span>
              <span className="block text-xs text-[var(--muted)]">
                Başlangıç (A1), Orta (A2) veya İleri (B1-B2) diyalog havuzu
              </span>
            </div>
          </div>

          <div className="bg-white dark:bg-[var(--background)] rounded-xl p-1 border border-[#E6D7BE] dark:border-[var(--border)] flex items-center gap-1 self-start sm:self-auto">
            {(["Başlangıç", "Orta", "İleri"] as PreferredLevel[]).map((lvl) => {
              const active = (mounted ? preferredLevel : "Başlangıç") === lvl;
              return (
                <button
                  key={lvl}
                  type="button"
                  onClick={() => {
                    playClick();
                    setPreferredLevel(lvl);
                  }}
                  className={`px-3 py-1.5 text-xs rounded-lg transition-all whitespace-nowrap ${
                    active
                      ? "bg-[#0CA678] text-white font-semibold shadow-2xs"
                      : "text-[var(--muted)] font-medium hover:text-[var(--foreground)]"
                  }`}
                >
                  {lvl}
                </button>
              );
            })}
          </div>
        </div>

        {/* Satır 2: Çeviri Görünümü */}
        <div className="py-3.5 border-b border-dashed border-[#E2D3B8] dark:border-[var(--border-dashed)] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <Languages
              size={18}
              className="text-[#087F5B] dark:text-[#20c997] shrink-0"
            />
            <div>
              <span className="block text-sm font-extrabold text-[var(--foreground)]">
                Türkçe Çeviri Görünümü
              </span>
              <span className="block text-xs text-[var(--muted)]">
                Diyaloglarda Arapça cümlelerin altında Türkçe anlamı göster
              </span>
            </div>
          </div>

          <div className="bg-white dark:bg-[var(--background)] rounded-xl p-1 border border-[#E6D7BE] dark:border-[var(--border)] flex items-center gap-1 self-start sm:self-auto">
            <button
              type="button"
              onClick={() => {
                playClick();
                setViewMode("stacked");
              }}
              className={`px-3.5 py-1.5 text-xs rounded-lg transition-all whitespace-nowrap ${
                !mounted || isTranslationVisible
                  ? "bg-[#0CA678] text-white font-semibold shadow-2xs"
                  : "text-[var(--muted)] font-medium hover:text-[var(--foreground)]"
              }`}
            >
              Açık
            </button>
            <button
              type="button"
              onClick={() => {
                playClick();
                setViewMode("arabic-only");
              }}
              className={`px-3.5 py-1.5 text-xs rounded-lg transition-all whitespace-nowrap ${
                mounted && !isTranslationVisible
                  ? "bg-[#0CA678] text-white font-semibold shadow-2xs"
                  : "text-[var(--muted)] font-medium hover:text-[var(--foreground)]"
              }`}
            >
              Gizli
            </button>
          </div>
        </div>

        {/* Satır 3: Ses Hızı */}
        <div className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <Gauge
              size={18}
              className="text-[#087F5B] dark:text-[#20c997] shrink-0"
            />
            <div>
              <span className="block text-sm font-extrabold text-[var(--foreground)]">
                Arapça Seslendirme Hızı
              </span>
              <span className="block text-xs text-[var(--muted)]">
                Diyalog ve sözlük seslendirmeleri için okuma temposu
              </span>
            </div>
          </div>

          <div className="bg-white dark:bg-[var(--background)] rounded-xl p-1 border border-[#E6D7BE] dark:border-[var(--border)] flex items-center gap-1 self-start sm:self-auto">
            {([0.75, 1, 1.25] as SpeechRate[]).map((rate) => {
              const active = (mounted ? speechRate : 1) === rate;
              return (
                <button
                  key={rate}
                  type="button"
                  onClick={() => {
                    playClick();
                    setSpeechRate(rate);
                  }}
                  className={`px-3.5 py-1.5 text-xs tabular-nums rounded-lg transition-all whitespace-nowrap ${
                    active
                      ? "bg-[#0CA678] text-white font-semibold shadow-2xs"
                      : "text-[var(--muted)] font-medium hover:text-[var(--foreground)]"
                  }`}
                >
                  {rate}x
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* BÖLÜM 5: ANA AKSİYON BUTONU (CTA) */}
      <div className="pt-1">
        <button
          type="button"
          onClick={handlePrimaryCTA}
          className="w-full py-4 px-6 bg-[#0CA678] hover:bg-[#099268] text-white font-bold text-base sm:text-lg rounded-2xl border-b-4 border-[#087F5B] active:border-b-0 active:translate-y-1 transition-all flex items-center justify-center gap-2.5 shadow-sm cursor-pointer"
        >
          <Play size={20} fill="currentColor" />
          <span>
            {modules.find((m) => m.id === selectedModule)?.ctaText ||
              "Çalışmaya Başla"}
          </span>
        </button>
      </div>
    </div>
  );
}