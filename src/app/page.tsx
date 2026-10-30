"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import {
  BookOpen,
  Mic,
  Gamepad2,
  BookMarked,
  Volume2,
  ArrowRight,
  RefreshCw,
  CheckCircle2,
  Brain,
  Award,
  Clock,
  Flame,
  Target,
  Sparkles,
  Play,
} from "lucide-react";
import {
  diyaloglar,
  sozluk,
  getDialoguesSortedPedagogically,
} from "@/lib/data";
import {
  useUserStore,
  getTodayDateString,
  getYesterdayDateString,
} from "@/store/userStore";
import { useSettings } from "@/store/settings";
import { playClick } from "@/lib/sfxManager";
import { playTTS, loadAudioManifest, hasMp3, getMp3Path } from "@/lib/audio";
import { useAudioStore } from "@/store/audioStore";
import ShadowingModal from "@/components/ui/ShadowingModal";
import { buildDailyStudyPackage } from "@/lib/mistakeUtils";

type ModuleKey = "kutuphane" | "telaffuz" | "alistirmalar" | "sozluk";

interface ModuleItem {
  id: ModuleKey;
  title: string;
  arabicBadge: string;
  subtitle: string;
  meta: string;
  tooltip: string;
  icon: typeof BookOpen;
  targetHref: string;
  accentColor: "emerald" | "purple";
}

export default function HomePage() {
  const [mounted, setMounted] = useState(false);
  const [tipIndex, setTipIndex] = useState(0);
  const [manifestLoaded, setManifestLoaded] = useState(false);
  const [shadowingModalData, setShadowingModalData] = useState<{
    text: string;
    audioUrl?: string;
  } | null>(null);

  const {
    completedDialogues,
    learnedWords,
    mistakeIds,
    srsRecords,
    pronunciationScores,
    studyMinutes,
    streakDays,
    lastStudyDate,
    dailyGoalMinutes,
    addStudyMinutes,
    syncDailyProgress,
  } = useUserStore();

  const { preferredLevel, viewMode, speechRate, showHareke } = useSettings();
  const { playAudio } = useAudioStore();

  useEffect(() => {
    const raf = requestAnimationFrame(() => setMounted(true));
    syncDailyProgress();
    loadAudioManifest().then(() => setManifestLoaded(true));

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        syncDailyProgress();
      }
    };
    const studyTimer = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        addStudyMinutes(1);
      }
    }, 60000);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", handleVisibilityChange);
    return () => {
      cancelAnimationFrame(raf);
      window.clearInterval(studyTimer);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", handleVisibilityChange);
    };
  }, [syncDailyProgress, addStudyMinutes]);

  const dailyPackage = useMemo(() => {
    return buildDailyStudyPackage({
      srsRecords: mounted ? srsRecords || {} : {},
      mistakeIds: mounted ? mistakeIds || [] : [],
      completedDialogues: mounted ? completedDialogues || [] : [],
      learnedWords: mounted ? learnedWords || [] : [],
      preferredLevel,
    });
  }, [
    mounted,
    srsRecords,
    mistakeIds,
    completedDialogues,
    learnedWords,
    preferredLevel,
  ]);

  const recommendedDialogue = dailyPackage.dailyDialogue.dialogue;
  const recommendedDialogueId = recommendedDialogue.id || "dlg_01";
  const recRawNum =
    parseInt(recommendedDialogueId.replace("dlg_", ""), 10) || 1;
  const recImgIndex = ((recRawNum - 1) % 60) + 1;
  const recommendedCoverSrc =
    (recommendedDialogue as unknown as { gorsel?: string }).gorsel ||
    `/gorseller/${String(recImgIndex).padStart(3, "0")}.jpg`;
  const recommendedSentenceCount =
    (recommendedDialogue as unknown as { cumleler?: unknown[] }).cumleler
      ?.length ?? recommendedDialogue.satirlar.length;
  const [failedCoverId, setFailedCoverId] = useState<string | null>(null);
  const recImgFailed = failedCoverId === recommendedDialogueId;

  const modules: ModuleItem[] = useMemo(
    () => [
      {
        id: "kutuphane",
        title: "Diyalog Kütüphanesi",
        arabicBadge: "الحِوَارَات",
        subtitle: "Günlük hayattan sesli Arapça konuşma metinleri",
        meta: `${diyaloglar.length} Diyalog · A1-B2`,
        tooltip: "A1'den B2'ye 60 sesli Arapça diyaloğu inceleyin ve dinleyin",
        icon: BookOpen,
        targetHref: "/kutuphane",
        accentColor: "emerald",
      },
      {
        id: "telaffuz",
        title: "Telaffuz & Gölgeleme",
        arabicBadge: "التَّلَفُّظ",
        subtitle: "Mahreç analizi, ses dalgası ve yapay zeka koçluğu",
        meta: "Canlı Mikrofon · 38 Mahreç Çifti",
        tooltip: "16kHz ses analizi ve 38 mahreç çifti ile telaffuz pratiği yapın",
        icon: Mic,
        targetHref: `/diyalog/${recommendedDialogueId}`,
        accentColor: "purple",
      },
      {
        id: "alistirmalar",
        title: "Kelime Alıştırmaları",
        arabicBadge: "التَّدْرِيبَات",
        subtitle: "Kartlar, çoktan seçmeli test, eşleştirme ve boşluk doldurma",
        meta: "5 Farklı Modül · Süreli/Süresiz",
        tooltip: "Kelime kartları, test, eşleştirme, boşluk doldurma ve cümle sıralama",
        icon: Gamepad2,
        targetHref: "/alistirmalar",
        accentColor: "emerald",
      },
      {
        id: "sozluk",
        title: "İnteraktif Sözlük",
        arabicBadge: "المُعْجَم",
        subtitle: "Kök harfler, müfret-cemî, mâzî-muzâri ve sesli telaffuz",
        meta: `${sozluk.length} Kelime · Sesli Sözlük`,
        tooltip: "Kök harflere göre kelimeleri, çoğulları, fiil çekimlerini ve kalıpları arayın",
        icon: BookMarked,
        targetHref: "/sozluk",
        accentColor: "purple",
      },
    ],
    [recommendedDialogueId]
  );

  const pedagogicalDialogues = useMemo(
    () => getDialoguesSortedPedagogically(),
    []
  );

  // Kullanıcının tamamladığı diyaloglara göre aktif CEFR seviyesini belirle (A1 bitmeden üst seviyelerden cümle gösterilmez)
  const activeLevel = useMemo(() => {
    const doneSet = new Set(mounted ? completedDialogues || [] : []);
    const levels: Array<"A1" | "A2" | "B1" | "B2"> = ["A1", "A2", "B1", "B2"];
    for (const lvl of levels) {
      const dlgsInLvl = pedagogicalDialogues.filter((d) => d.seviye === lvl);
      if (dlgsInLvl.some((d) => !doneSet.has(d.id))) {
        return lvl;
      }
    }
    return "A1";
  }, [mounted, completedDialogues, pedagogicalDialogues]);

  // Günün Konuşma Kalıbı Havuzu: Önce Günün Diyaloğundan, ardından kullanıcının aktif seviyesindeki (ör. A1) diyaloglardan seçilir
  const levelQuotesPool = useMemo(() => {
    const dailyDlg = dailyPackage.dailyDialogue.dialogue;
    const sameLevelDlgs = pedagogicalDialogues.filter(
      (d) => d.seviye === activeLevel
    );
    const orderedDlgs = [
      ...(dailyDlg && dailyDlg.seviye === activeLevel ? [dailyDlg] : []),
      ...sameLevelDlgs.filter((d) => d.id !== dailyDlg?.id),
    ];

    const pool: { dlg: (typeof diyaloglar)[0]; line: (typeof diyaloglar)[0]["satirlar"][0] }[] = [];
    for (const dlg of orderedDlgs) {
      // Çok kısa tek kelimelik ("مَرْحَباً.") satırlar yerine en az 2 kelimelik pedagojik konuşma kalıplarını öncelikle ekle
      const meaningfulLines = dlg.satirlar.filter(
        (s) => s.arapca.trim().split(/\s+/).length >= 2
      );
      const sourceLines =
        meaningfulLines.length > 0 ? meaningfulLines : dlg.satirlar;
      for (const line of sourceLines) {
        pool.push({ dlg, line });
      }
    }
    if (pool.length === 0) {
      const fallbackDlg = diyaloglar[0];
      return [{ dlg: fallbackDlg, line: fallbackDlg.satirlar[0] }];
    }
    return pool;
  }, [activeLevel, dailyPackage.dailyDialogue.dialogue, pedagogicalDialogues]);

  // Günün Arapça Diyaloğu / Kalıp İpucu
  const featuredDialogue = useMemo(() => {
    return levelQuotesPool[tipIndex % levelQuotesPool.length] || levelQuotesPool[0];
  }, [levelQuotesPool, tipIndex]);

  const removeTashkeel = (text: string) => text.replace(/[\u064B-\u0652]/g, "");
  const displayArabic = (text: string) =>
    !mounted || showHareke ? text : removeTashkeel(text);

  // Telaffuz Başarısı Hesaplama (Gerçek mikrofon denemeleri yoksa sahte %88 gösterme)
  const pronunciationAccuracy = useMemo(() => {
    if (!mounted) return null;
    if (pronunciationScores && pronunciationScores.length > 0) {
      const sum = pronunciationScores.reduce((acc, s) => acc + s, 0);
      return Math.round(sum / pronunciationScores.length);
    }
    return null;
  }, [mounted, pronunciationScores]);

  // Gün değişiminde bugünkü çalışma süresini ve seriyi Europe/Istanbul zaman dilimiyle doğrula
  const { todayStudyMinutes, activeStreakDays } = useMemo(() => {
    if (!mounted) {
      return { todayStudyMinutes: 0, activeStreakDays: 0 };
    }
    const todayStr = getTodayDateString();
    const yesterdayStr = getYesterdayDateString();

    const isToday = lastStudyDate === todayStr;
    const isYesterday = lastStudyDate === yesterdayStr;

    return {
      todayStudyMinutes: isToday ? studyMinutes : 0,
      activeStreakDays: isToday || isYesterday ? streakDays : 0,
    };
  }, [mounted, lastStudyDate, studyMinutes, streakDays]);

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

  const isTranslationVisible = viewMode !== "arabic-only";

  return (
    <div className="space-y-4">
      {/* GÖLGELEME MODALI */}
      {shadowingModalData && (
        <ShadowingModal
          text={shadowingModalData.text}
          refAudioUrl={shadowingModalData.audioUrl}
          onClose={() => setShadowingModalData(null)}
        />
      )}

      {/* BÖLÜM 1: ÜSTTE 4'LÜ DOĞRUDAN NAVİGASYON KARTLARI */}
      <section aria-label="Çalışma Modülleri" className="space-y-2.5">
        <div className="flex items-center justify-between px-1">
          <div>
            <h1 className="text-lg sm:text-xl font-extrabold text-[var(--foreground)] tracking-tight">
              Çalışma Modülleri
            </h1>
            <p className="text-xs font-medium text-slate-600 dark:text-slate-300">
              Başlamak istediğiniz Arapça eğitim modülüne tıklayın
            </p>
          </div>
          <span className="arabic text-xl sm:text-2xl font-bold text-[#065F46] dark:text-emerald-400">
            أَهْلًا وَسَهْلًا
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {modules.map((mod) => {
            const Icon = mod.icon;
            const isPurple = mod.accentColor === "purple";

            return (
              <Link
                key={mod.id}
                href={mod.targetHref}
                onClick={() => playClick()}
                data-tooltip={mod.tooltip}
                className="group relative text-left p-3.5 rounded-2xl border-2 border-b-4 bg-[#F7EFE1] dark:bg-[var(--surface)] border-[#E6D7BE] dark:border-[var(--border)] hover:border-[#087F5B] dark:hover:border-[#087F5B] hover:-translate-y-0.5 active:translate-y-0 transition-all flex flex-col justify-between min-h-[138px]"
              >
                <span className="arabic absolute top-2.5 right-3.5 text-lg font-bold text-[var(--muted)] opacity-80 group-hover:text-[#087F5B] dark:group-hover:text-[#20c997] transition-colors">
                  {mod.arabicBadge}
                </span>

                <div>
                  <div
                    className={`w-9 h-9 rounded-xl border-2 border-b-3 flex items-center justify-center mb-2.5 transition-colors ${
                      isPurple
                        ? "bg-[#F3F0FF] dark:bg-[var(--lavender-bg)] border-[#6741D9] text-[#6741D9] dark:text-[#d0bfff] group-hover:bg-[#6741D9] group-hover:text-white"
                        : "bg-white dark:bg-[var(--background)] border-[#E6D7BE] dark:border-[var(--border)] text-[#065F46] dark:text-emerald-400 group-hover:bg-[#087F5B] group-hover:border-[#065F46] group-hover:text-white"
                    }`}
                  >
                    <Icon size={18} strokeWidth={2.3} />
                  </div>

                  <h2 className="text-sm sm:text-base font-extrabold text-[var(--foreground)] group-hover:text-[#087F5B] dark:group-hover:text-[#20c997] leading-snug transition-colors">
                    {mod.title}
                  </h2>
                  <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 leading-snug line-clamp-2">
                    {mod.subtitle}
                  </p>
                </div>

                <div className="mt-2.5 pt-2 border-t border-dashed border-[#E2D3B8] dark:border-[var(--border-dashed)] flex items-center justify-between text-[11px] font-bold">
                  <span className="text-slate-600 dark:text-slate-300 truncate">{mod.meta}</span>
                  <span className="inline-flex items-center gap-1 shrink-0 text-[#065F46] dark:text-emerald-400 group-hover:translate-x-0.5 transition-transform">
                    <span>Başla</span>
                    <ArrowRight size={12} />
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      {/* BÖLÜM 1.5: BUGÜN NE ÇALIŞMALIYIM? (~12 DAKİKALIK AKILLI PAKET) */}
      <section
        aria-label="Bugün Ne Çalışmalıyım? Akıllı Günlük Çalışma Paketi"
        className="bg-[#F7EFE1] dark:bg-[var(--surface)] rounded-2xl border-2 border-[#087F5B] dark:border-[#087F5B]/80 border-b-4 pt-4 sm:pt-5 px-3.5 sm:px-4 pb-3.5 sm:pb-4 space-y-3"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 border-b border-dashed border-[#E2D3B8] dark:border-[var(--border-dashed)] pb-3">
          <div className="space-y-0.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg bg-emerald-600 dark:bg-emerald-600 text-white text-xs font-extrabold">
                <Target size={15} />
                <span>Bugün Ne Çalışmalıyım?</span>
              </span>
              <span className="px-2 py-0.5 rounded-lg bg-[#F3F0FF] dark:bg-[var(--lavender-bg)] border border-[#6741D9]/30 text-[11px] font-extrabold text-[#6741D9] dark:text-[#d0bfff]">
                ~12 Dakikalık Akıllı Paket
              </span>
            </div>
            <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">
              Aralıklı tekrar (SRS) geçmişinize, hata defterinize ve seviyenize göre hazırlanan günlük kişisel çalışma planınız
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <Link
              href={`/diyalog/${dailyPackage.dailyDialogue.dialogue.id}`}
              onClick={() => playClick()}
              data-tooltip="Bugün için önerilen sesli diyaloğu açın ve dinleyin"
              className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-white dark:bg-[var(--background)] border-2 border-[#E6D7BE] dark:border-[var(--border)] border-b-3 text-xs font-extrabold text-[var(--foreground)] hover:border-[#087F5B] transition-all whitespace-nowrap"
            >
              <BookOpen size={14} className="text-[#065F46] dark:text-emerald-400" />
              <span>Günün Diyaloğuna Git</span>
            </Link>

            <Link
              href="/alistirmalar?plan=daily"
              onClick={() => playClick()}
              data-tooltip="Aralıklı tekrar (SRS) algoritmasıyla seçilen kelimelerle günlük çalışmayı başlatın"
              data-tooltip-align="right"
              className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-600 text-white border-b-3 border-emerald-800 text-xs font-extrabold active:border-b-0 active:translate-y-0.5 transition-all whitespace-nowrap shadow-xs"
            >
              <Play size={14} fill="currentColor" />
              <span>12 Dakikalık Günlük Paketi Başlat</span>
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
          {/* 1. Günün Diyaloğu (3 sütun) */}
          <div className="lg:col-span-4 bg-white dark:bg-[var(--background)] rounded-xl border border-[#E6D7BE] dark:border-[var(--border)] p-3 flex flex-col justify-between gap-2">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-1.5">
                <span className="text-[11px] font-extrabold text-[#065F46] dark:text-emerald-400 uppercase tracking-wide">
                  📖 1. Günün Diyaloğu
                </span>
                <span className="px-2 py-0.5 rounded-md bg-emerald-100 dark:bg-emerald-950/70 text-[#065F46] dark:text-emerald-300 text-[10px] font-extrabold">
                  Seviye {recommendedDialogue.seviye}
                </span>
              </div>

              <Link
                href={`/diyalog/${recommendedDialogue.id}`}
                onClick={() => playClick()}
                data-tooltip="Diyaloğu açmak, cümleleri dinlemek ve telaffuz çalışmak için tıklayın"
                className="relative h-28 sm:h-32 w-full rounded-xl overflow-hidden border border-emerald-500/15 shadow-sm block group"
              >
                {!recImgFailed ? (
                  <img
                    src={recommendedCoverSrc}
                    alt={recommendedDialogue.baslik_tr}
                    onError={() => setFailedCoverId(recommendedDialogueId)}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-emerald-700 via-teal-800 to-indigo-900 flex items-center justify-center">
                    <BookOpen size={32} className="text-white/80" />
                  </div>
                )}

                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/35 to-black/10 p-3 flex flex-col justify-between">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-xs sm:text-sm font-extrabold text-white drop-shadow-sm leading-snug line-clamp-2">
                      #{recommendedDialogue.id.replace("dlg_", "")} —{" "}
                      {recommendedDialogue.baslik_tr}
                    </h3>
                    <p
                      dir="rtl"
                      className="arabic text-base sm:text-lg font-bold text-emerald-200 drop-shadow-sm leading-none shrink-0"
                    >
                      {displayArabic(recommendedDialogue.baslik_ar)}
                    </p>
                  </div>

                  <span className="w-fit bg-black/60 backdrop-blur-sm text-white text-[11px] font-bold px-2.5 py-1 rounded-lg">
                    {recommendedSentenceCount} Cümle • Sesli Diyalog
                  </span>
                </div>
              </Link>
            </div>

            <div className="pt-2 border-t border-dashed border-[#E2D3B8] dark:border-[var(--border-dashed)] flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-50 dark:bg-amber-950/50 border border-amber-300/80 dark:border-amber-700/60 text-[10px] font-extrabold text-amber-800 dark:text-amber-300">
                <Sparkles size={11} className="shrink-0" />
                <span>{dailyPackage.dailyDialogue.reasonBadge}</span>
              </span>
              <Link
                href={`/diyalog/${recommendedDialogue.id}`}
                onClick={() => playClick()}
                data-tooltip="Diyaloğu açmak, cümleleri dinlemek ve telaffuz çalışmak için tıklayın"
                className="text-[11px] font-extrabold text-[#065F46] dark:text-emerald-400 inline-flex items-center gap-0.5 hover:underline shrink-0"
              >
                <span>Aç</span>
                <ArrowRight size={11} />
              </Link>
            </div>
          </div>

          {/* 2. Zamanı Gelen veya Bugün Öğrenilecek 6 Kelime (5 sütun) */}
          <div className="lg:col-span-5 bg-white dark:bg-[var(--background)] rounded-xl border border-[#E6D7BE] dark:border-[var(--border)] p-3 flex flex-col justify-between gap-2">
            <div className="flex items-center justify-between gap-1.5">
              <span className="text-[11px] font-extrabold text-[#6741D9] dark:text-[#d0bfff] uppercase tracking-wide">
                {dailyPackage.dailyWords.some(
                  (dw) => dw.badgeTone === "due" || dw.badgeTone === "mistake"
                )
                  ? "🔄 2. Zamanı Gelen 6 Kelime"
                  : "🌱 2. Bugün Öğrenilecek 6 Yeni Kelime"}
              </span>
              <Link
                href="/alistirmalar?plan=daily"
                onClick={() => playClick()}
                className="text-[10px] font-extrabold text-[#6741D9] dark:text-[#d0bfff] hover:underline"
              >
                Tümünü Çalış →
              </Link>
            </div>

            <div className="flex-1 grid grid-cols-2 sm:grid-cols-3 gap-2.5 content-stretch">
              {dailyPackage.dailyWords.map((dw) => {
                const ar = (dw.item.mufret || dw.item.mazi || "")
                  .split("/")[0]
                  .trim();
                const badgeCls =
                  dw.badgeTone === "mistake"
                    ? "bg-rose-50 text-rose-800 border-rose-300 dark:bg-rose-950/50 dark:text-rose-200 dark:border-rose-700"
                    : dw.badgeTone === "due"
                    ? "bg-amber-50 text-amber-900 border-amber-300 dark:bg-amber-950/50 dark:text-amber-200 dark:border-amber-700"
                    : "bg-emerald-50 text-emerald-900 border-emerald-300 dark:bg-emerald-950/50 dark:text-emerald-200 dark:border-emerald-700";

                return (
                  <button
                    key={dw.item.id}
                    type="button"
                    onClick={() => {
                      playClick();
                      playTTS(ar, mounted ? speechRate : 1);
                    }}
                    data-tooltip="Kelimeyi sesli dinlemek için tıklayın"
                    className="p-2 rounded-lg bg-[#F7EFE1]/60 dark:bg-[var(--surface)] border border-[#E6D7BE] dark:border-[var(--border)] hover:border-[#087F5B] text-left flex flex-col justify-between gap-1 transition-colors cursor-pointer"
                  >
                    <div className="flex items-start justify-between gap-1 w-full">
                      <span className="text-[10px] font-bold text-[var(--foreground)] line-clamp-1">
                        {dw.item.anlam_tr}
                      </span>
                      <span
                        dir="rtl"
                        className="arabic text-base font-bold text-[#065F46] dark:text-emerald-400 leading-none shrink-0"
                      >
                        {displayArabic(ar)}
                      </span>
                    </div>
                    <span
                      className={`inline-block text-[9px] font-extrabold px-1.5 py-0.5 rounded border truncate w-full text-center ${badgeCls}`}
                    >
                      {dw.statusBadge}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 3. Zorlandığınız / Günlük 2 Kalıp İfade (3 sütun) */}
          <div className="lg:col-span-3 bg-white dark:bg-[var(--background)] rounded-xl border border-[#E6D7BE] dark:border-[var(--border)] p-3 flex flex-col justify-between gap-2">
            <span className="text-[11px] font-extrabold text-[#065F46] dark:text-emerald-400 uppercase tracking-wide block">
              💬 3. Günün 2 Kalıp İfadesi
            </span>

            <div className="space-y-1.5 flex-1 flex flex-col justify-center">
              {dailyPackage.dailyIdioms.map((di) => (
                <button
                  key={di.idiom.id}
                  type="button"
                  onClick={() => {
                    playClick();
                    playTTS(di.idiom.arabic, mounted ? speechRate : 1);
                  }}
                  data-tooltip="Kalıp ifadeyi sesli dinlemek için tıklayın"
                  className="w-full p-2 rounded-lg bg-[#F3F0FF]/70 dark:bg-[var(--lavender-bg)] border border-[#6741D9]/30 hover:border-[#6741D9] text-left space-y-0.5 transition-colors cursor-pointer"
                >
                  <div className="flex items-center justify-between gap-1.5">
                    <span className="text-[10px] font-extrabold text-[#6741D9] dark:text-[#d0bfff]">
                      {di.statusBadge}
                    </span>
                    <Volume2 size={11} className="text-[#6741D9] shrink-0" />
                  </div>
                  <p
                    dir="rtl"
                    className="arabic text-base font-bold text-[var(--foreground)] text-right leading-snug"
                  >
                    {displayArabic(di.idiom.arabic)}
                  </p>
                  <p className="text-[10px] font-bold text-[var(--muted)] line-clamp-1">
                    {di.idiom.meaningTr}
                  </p>
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* BÖLÜM 2: GÜNÜN ARAPÇA DİYALOĞU / KALIP İPUCU ŞERİDİ (KOMPAKT) */}
      <section
        aria-label="Günün Arapça Kalıbı ve Diyalog İpucu"
        className="bg-[#F7EFE1] dark:bg-[var(--surface)] rounded-2xl border-2 border-[#E6D7BE] dark:border-[var(--border)] border-b-4 p-3.5 sm:p-4"
      >
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="space-y-1 flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-xs font-bold text-[#065F46] dark:text-emerald-400">
              <span>Günün Konuşma Kalıbı</span>
              <span aria-hidden="true">·</span>
              <span className="text-[var(--muted)]">
                {featuredDialogue.dlg.baslik_tr} ({featuredDialogue.dlg.seviye})
              </span>
              <button
                type="button"
                onClick={() => {
                  playClick();
                  setTipIndex((prev) => (prev + 1) % levelQuotesPool.length);
                }}
                className="ml-auto md:ml-2 inline-flex items-center gap-1 text-[11px] font-bold text-[var(--muted)] hover:text-[var(--foreground)] bg-white dark:bg-[var(--background)] px-2.5 py-0.5 rounded-lg border border-[#E6D7BE] dark:border-[var(--border)] transition-colors cursor-pointer"
                data-tooltip="Farklı bir günlük Arapça konuşma kalıbı göster"
              >
                <RefreshCw size={11} />
                <span>Değiştir</span>
              </button>
            </div>

            <p
              dir="rtl"
              className="arabic text-2xl sm:text-3xl font-bold text-[var(--foreground)] py-0.5 leading-relaxed break-words"
            >
              {displayArabic(featuredDialogue.line.arapca)}
            </p>

            {isTranslationVisible && (
              <p className="text-xs sm:text-sm font-semibold text-[var(--muted)]">
                “{featuredDialogue.line.turkce}”
              </p>
            )}
          </div>

          <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleListenFeatured}
              data-tooltip="Cümleyi doğal Arapça seslendirmeyle dinle"
              className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-white dark:bg-[var(--background)] border-2 border-[#E6D7BE] dark:border-[var(--border)] border-b-3 text-xs font-extrabold text-[var(--foreground)] hover:bg-[#FDFBF7] active:border-b-1 active:translate-y-0.5 transition-all whitespace-nowrap cursor-pointer"
            >
              <Volume2 size={15} className="text-[#065F46] dark:text-emerald-400" />
              <span>Sesli Dinle</span>
            </button>

            <button
              type="button"
              onClick={handlePracticeFeatured}
              data-tooltip="Bu cümleyi mikrofona okuyarak telaffuz puanınızı ölçün"
              className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-[#F3F0FF] dark:bg-[var(--lavender-bg)] border-2 border-[#6741D9] border-b-3 text-xs font-extrabold text-[#6741D9] dark:text-[#d0bfff] hover:opacity-95 active:border-b-1 active:translate-y-0.5 transition-all whitespace-nowrap cursor-pointer"
            >
              <Mic size={15} />
              <span>Telaffuz Et</span>
            </button>

            <Link
              href={`/diyalog/${featuredDialogue.dlg.id}`}
              onClick={() => playClick()}
              data-tooltip="Bu cümlenin yer aldığı diyaloğun tamamını aç"
              data-tooltip-align="right"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-600 text-white border-b-3 border-emerald-800 text-xs font-extrabold active:border-b-0 active:translate-y-0.5 transition-all whitespace-nowrap"
            >
              <span>Diyaloğa Git</span>
              <ArrowRight size={14} />
            </Link>
          </div>
        </div>
      </section>

      {/* BÖLÜM 3: 4 SÜTUNLU ÖĞRENCİ İLERLEME ÖZETİ (KOMPAKT) */}
      <section aria-label="Öğrenci İlerleme Özeti">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {/* 1. Tamamlanan Diyalog */}
          <Link
            href="/kutuphane?durum=completed"
            onClick={() => playClick()}
            data-tooltip="Tamamladığınız diyalogların toplam ilerleme durumu"
            className="bg-[#F7EFE1] dark:bg-[var(--surface)] rounded-2xl border-2 border-[#E6D7BE] dark:border-[var(--border)] border-b-4 px-3.5 pb-3.5 pt-3.5 sm:pt-4 flex items-center gap-3 hover:border-[#087F5B] transition-colors"
          >
            <div className="w-10 h-10 rounded-xl bg-white dark:bg-[var(--background)] border border-[#E6D7BE] dark:border-[var(--border)] flex items-center justify-center text-[#065F46] dark:text-emerald-400 shrink-0">
              <CheckCircle2 size={20} strokeWidth={2.4} />
            </div>
            <div className="min-w-0">
              <span className="block text-xl font-black tabular-nums text-[var(--foreground)] leading-normal">
                {mounted ? completedDialogues.length : 0}
                <span className="text-xs font-bold text-[var(--muted)]">
                  /{diyaloglar.length}
                </span>
              </span>
              <span className="block text-xs font-bold text-[var(--muted)] mt-0.5 line-clamp-2 leading-tight">
                Tamamlanan Diyalog
              </span>
            </div>
          </Link>

          {/* 2. Öğrenilen Kelime */}
          <Link
            href="/sozluk?durum=learned"
            onClick={() => playClick()}
            data-tooltip="Sözlükte 'Öğrendim' olarak işaretlediğiniz kelime sayısı"
            className="bg-[#F7EFE1] dark:bg-[var(--surface)] rounded-2xl border-2 border-[#E6D7BE] dark:border-[var(--border)] border-b-4 px-3.5 pb-3.5 pt-3.5 sm:pt-4 flex items-center gap-3 hover:border-[#087F5B] transition-colors"
          >
            <div className="w-10 h-10 rounded-xl bg-white dark:bg-[var(--background)] border border-[#E6D7BE] dark:border-[var(--border)] flex items-center justify-center text-[#6741D9] shrink-0">
              <Brain size={20} strokeWidth={2.4} />
            </div>
            <div className="min-w-0">
              <span className="block text-xl font-black tabular-nums text-[var(--foreground)] leading-normal">
                {mounted
                  ? Math.min(
                      sozluk.length,
                      learnedWords.filter(
                        (id) =>
                          Boolean(id) &&
                          !id.startsWith("idiom_") &&
                          !id.startsWith("idm_") &&
                          !id.startsWith("sent_")
                      ).length
                    )
                  : 0}
                <span className="text-xs font-bold text-[var(--muted)]">
                  /{sozluk.length}
                </span>
              </span>
              <span className="block text-xs font-bold text-[var(--muted)] mt-0.5 line-clamp-2 leading-tight">
                Öğrenilen Kelime
              </span>
            </div>
          </Link>

          {/* 3. Telaffuz Başarısı */}
          <button
            type="button"
            onClick={handlePracticeFeatured}
            data-tooltip="Gölgeleme ve Mahreç Koçu denemelerinizin ortalama başarı skoru"
            className="bg-[#F7EFE1] dark:bg-[var(--surface)] rounded-2xl border-2 border-[#E6D7BE] dark:border-[var(--border)] border-b-4 px-3.5 pb-3.5 pt-3.5 sm:pt-4 flex items-center gap-3 text-left hover:border-[#087F5B] transition-colors cursor-pointer"
          >
            <div className="w-10 h-10 rounded-xl bg-white dark:bg-[var(--background)] border border-[#E6D7BE] dark:border-[var(--border)] flex items-center justify-center text-amber-600 shrink-0">
              <Award size={20} strokeWidth={2.4} />
            </div>
            <div className="min-w-0">
              {pronunciationAccuracy !== null ? (
                <div className="flex items-baseline gap-1.5 flex-wrap">
                  <span className="text-xl font-black tabular-nums text-[var(--foreground)] leading-normal">
                    %{pronunciationAccuracy}
                  </span>
                  <span className="text-[11px] font-bold text-[var(--muted)] tabular-nums">
                    ({pronunciationScores.length} deneme)
                  </span>
                </div>
              ) : (
                <span className="block text-sm sm:text-base font-extrabold text-[var(--muted)] leading-snug">
                  Henüz ölçülmedi
                </span>
              )}
              <span className="block text-xs font-bold text-[var(--muted)] mt-0.5 line-clamp-2 leading-tight">
                Telaffuz Başarısı
              </span>
            </div>
          </button>

          {/* 4. Günlük Hedef & Seri */}
          <Link
            href="/alistirmalar"
            onClick={() => playClick()}
            data-tooltip="Kesintisiz çalışma seriniz (Streak) ve bugünkü çalışma süreniz"
            data-tooltip-align="right"
            className="bg-[#F7EFE1] dark:bg-[var(--surface)] rounded-2xl border-2 border-[#E6D7BE] dark:border-[var(--border)] border-b-4 px-3.5 pb-3.5 pt-3.5 sm:pt-4 flex flex-col justify-between gap-2 hover:border-[#087F5B] transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white dark:bg-[var(--background)] border border-[#E6D7BE] dark:border-[var(--border)] flex items-center justify-center text-orange-500 shrink-0">
                <Flame size={20} strokeWidth={2.4} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-1.5 flex-wrap">
                  <span className="text-xl font-black tabular-nums text-[var(--foreground)] leading-normal">
                    🔥 {activeStreakDays}
                  </span>
                  <span className="text-xs font-extrabold text-orange-600 dark:text-orange-400">
                    Gün
                  </span>
                  <span className="text-[11px] font-bold text-[var(--muted)] ml-auto inline-flex items-center gap-0.5 tabular-nums">
                    <Clock size={11} />
                    {todayStudyMinutes}/{mounted ? dailyGoalMinutes : 15} dk
                  </span>
                </div>
                <span className="block text-xs font-bold text-[var(--muted)] mt-0.5 line-clamp-2 leading-tight">
                  Günlük Hedef
                </span>
              </div>
            </div>
            <div className="w-full h-1.5 bg-white dark:bg-[var(--background)] rounded-full overflow-hidden border border-[#E6D7BE]/70 dark:border-[var(--border)]">
              <div
                className="h-full bg-[#087F5B] rounded-full transition-all duration-500"
                style={{
                  width: `${Math.min(
                    100,
                    Math.round(
                      (todayStudyMinutes /
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
    </div>
  );
}