"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import {
  ChevronLeft,
  Check,
  Play,
  BookOpen,
  CheckSquare,
  PenTool,
  Link2,
  Info,
  Layers,
  Timer,
  ListOrdered,
} from "lucide-react";
import { playClick } from "@/lib/sfxManager";
import { diyaloglar, sozluk } from "@/lib/data";
import { getDialogueVocabulary } from "@/lib/dict";
import { DictionaryItem } from "@/types/data";
import { useUserStore } from "@/store/userStore";

import Flashcard, {
  getShortDialogueSentences,
} from "@/components/exercises/Flashcard";
import MultipleChoice, {
  FeedbackMode,
  QuizContentType,
} from "@/components/exercises/MultipleChoice";
import FillInBlanks, {
  FillSubMode,
} from "@/components/exercises/FillInBlanks";
import MatchingGame from "@/components/exercises/MatchingGame";
import SentenceBuilder from "@/components/exercises/SentenceBuilder";

type ExerciseType =
  | "flashcard"
  | "multiple-choice"
  | "fill-in-blanks"
  | "matching"
  | "sentence-builder";

export default function ExercisesPage() {
  const [selectedType, setSelectedType] = useState<ExerciseType>("flashcard");
  const [isPlaying, setIsPlaying] = useState(false);

  const { favoriteWords, weakWords } = useUserStore();

  // Kompakt Ayar Barı State
  const [rangePreset, setRangePreset] = useState<string>("all-dict");
  const [singleDialogueId, setSingleDialogueId] = useState<string>("all");
  const [startNum, setStartNum] = useState(1);
  const [endNum, setEndNum] = useState(60);
  const [contentType, setContentType] = useState<QuizContentType>("words");
  const [questionCount, setQuestionCount] = useState<10 | 20 | 30>(10);
  const [timeLimit, setTimeLimit] = useState<number | null>(null);
  const [feedbackMode, setFeedbackMode] = useState<FeedbackMode>("instant");
  const [fillSubMode, setFillSubMode] = useState<FillSubMode>("choices");

  const selectedDialogues = useMemo(() => {
    if (singleDialogueId !== "all") {
      return diyaloglar.filter((dlg) => dlg.id === singleDialogueId);
    }
    return diyaloglar.filter((dlg) => {
      const num = parseInt(dlg.id.replace("dlg_", ""), 10);
      return num >= startNum && num <= endNum;
    });
  }, [singleDialogueId, startNum, endNum]);

  const sentenceCountInPool = useMemo(() => {
    return selectedDialogues.reduce(
      (sum, dlg) => sum + dlg.satirlar.length,
      0
    );
  }, [selectedDialogues]);

  const shortSentenceCountInPool = useMemo(() => {
    return getShortDialogueSentences(selectedDialogues).length;
  }, [selectedDialogues]);

  const { combinedVocabulary, poolNotice } = useMemo(() => {
    if (singleDialogueId !== "all") {
      return {
        combinedVocabulary: getDialogueVocabulary(singleDialogueId).map(
          (e) => e.item
        ),
        poolNotice: null as string | null,
      };
    }

    if (rangePreset === "favorites") {
      if (favoriteWords.length >= 4) {
        return {
          combinedVocabulary: favoriteWords,
          poolNotice: null,
        };
      }
      const padded = [
        ...favoriteWords,
        ...sozluk
          .filter((w) => !favoriteWords.some((fw) => fw.id === w.id))
          .slice(0, 12 - favoriteWords.length),
      ];
      return {
        combinedVocabulary: padded,
        poolNotice: `Favori listenizde şu an ${favoriteWords.length} kelime bulunduğu için alıştırma havuzu genel sözlük kelimeleriyle tamamlandı.`,
      };
    }

    if (rangePreset === "weak-words") {
      if (weakWords.length >= 4) {
        return {
          combinedVocabulary: weakWords,
          poolNotice: null,
        };
      }
      const padded = [
        ...weakWords,
        ...sozluk
          .filter((w) => !weakWords.some((ww) => ww.id === w.id))
          .slice(0, 12 - weakWords.length),
      ];
      return {
        combinedVocabulary: padded,
        poolNotice: `Mahreç Tekrarı (Zayıf Kelimeler) listenizde şu an ${weakWords.length} kelime bulunduğu için alıştırma havuzu genel sözlük kelimeleriyle tamamlandı.`,
      };
    }

    if (rangePreset === "all-dict") {
      return {
        combinedVocabulary: sozluk,
        poolNotice: null,
      };
    }

    const allVocabMap = new Map<string, DictionaryItem>();
    selectedDialogues.forEach((dlg) => {
      const entries = getDialogueVocabulary(dlg.id);
      entries.forEach((entry) => allVocabMap.set(entry.item.id, entry.item));
    });
    return {
      combinedVocabulary: Array.from(allVocabMap.values()),
      poolNotice: null,
    };
  }, [
    singleDialogueId,
    rangePreset,
    selectedDialogues,
    favoriteWords,
    weakWords,
  ]);

  const exerciseCards: {
    id: ExerciseType;
    title: string;
    arabicBadge: string;
    subtitle: string;
    icon: typeof BookOpen;
  }[] = [
    {
      id: "flashcard",
      title: "Kelime & Cümle Kartları",
      arabicBadge: "البِطَاقَات",
      subtitle: "Sesli Arapça-Türkçe 3B kelime ve kısa cümle kartları",
      icon: BookOpen,
    },
    {
      id: "multiple-choice",
      title: "Çoktan Seçmeli Test",
      arabicBadge: "الاخْتِبَار",
      subtitle: "Kelime veya diyalog cümleleriyle 4 şıklı anlam testi",
      icon: CheckSquare,
    },
    {
      id: "fill-in-blanks",
      title: "Boşluk Doldurma & İmla",
      arabicBadge: "الفَرَاغَات",
      subtitle: "Seçmeli sürükle-bırak veya dinleyip klavyeyle yazma",
      icon: PenTool,
    },
    {
      id: "matching",
      title: "Ok Çizerek Eşleştirme",
      arabicBadge: "المُطَابَقَة",
      subtitle: "Kelime ve cümleleri interaktif ok çizerek eşleştirin",
      icon: Link2,
    },
    {
      id: "sentence-builder",
      title: "Cümle Kurma (Kelime Sıralama)",
      arabicBadge: "تَرْتِيبُ الْجُمَل",
      subtitle: "Dinlediğiniz diyalog cümlesinin kelimelerini sağdan sola sıralayın",
      icon: ListOrdered,
    },
  ];

  const rangeOptions = [
    { id: "all-dict", label: `Tüm Sözlük (${sozluk.length})`, s: 1, e: 60 },
    { id: "1-15", label: "Başlangıç Kuru (1-15)", s: 1, e: 15 },
    { id: "16-35", label: "Orta Kur (16-35)", s: 16, e: 35 },
    { id: "36-60", label: "İleri Kur (36-60)", s: 36, e: 60 },
    {
      id: "favorites",
      label: `Favori Kelimelerim (${favoriteWords.length})`,
      s: 1,
      e: 60,
    },
    {
      id: "weak-words",
      label: `Mahreç Tekrarı (${weakWords.length})`,
      s: 1,
      e: 60,
    },
  ];

  const handlePoolSelectChange = (presetId: string) => {
    playClick();
    const found = rangeOptions.find((r) => r.id === presetId);
    setSingleDialogueId("all");
    setRangePreset(presetId);
    if (found) {
      setStartNum(found.s);
      setEndNum(found.e);
    }
  };

  const handleStartExercise = () => {
    playClick();
    if (combinedVocabulary.length < 4 && sentenceCountInPool < 4) return;
    setIsPlaying(true);
  };

  const effectiveSentenceCount =
    selectedType === "flashcard"
      ? shortSentenceCountInPool
      : sentenceCountInPool;

  const activePoolCountLabel =
    selectedType === "fill-in-blanks" || selectedType === "sentence-builder"
      ? `${sentenceCountInPool} Cümle`
      : contentType === "sentences"
      ? `${effectiveSentenceCount} Cümle`
      : contentType === "mixed"
      ? `${combinedVocabulary.length} Kelime + ${effectiveSentenceCount} Cümle`
      : `${combinedVocabulary.length} Kelime`;

  return (
    <div className="space-y-3 sm:space-y-4">
      {/* ÜST BAŞLIK */}
      <div className="flex items-center justify-between gap-2.5">
        <div className="flex items-center gap-2.5 min-w-0">
          {isPlaying ? (
            <button
              type="button"
              onClick={() => {
                playClick();
                setIsPlaying(false);
              }}
              className="h-9 px-3 rounded-xl bg-[#F7EFE1] dark:bg-[var(--surface)] border-2 border-[#E6D7BE] dark:border-[var(--border)] border-b-3 flex items-center gap-1.5 text-xs font-extrabold text-[var(--foreground)] hover:bg-[#EFE3CE] cursor-pointer shrink-0"
            >
              <ChevronLeft size={16} />
              <span>Ayarlara Dön</span>
            </button>
          ) : (
            <Link
              href="/"
              onClick={() => playClick()}
              className="w-9 h-9 rounded-xl bg-[#F7EFE1] dark:bg-[var(--surface)] border-2 border-[#E6D7BE] dark:border-[var(--border)] border-b-3 flex items-center justify-center text-[var(--foreground)] hover:bg-[#EFE3CE] shrink-0"
              aria-label="Ana Sayfaya Dön"
            >
              <ChevronLeft size={18} strokeWidth={2.5} />
            </Link>
          )}

          <div className="min-w-0">
            <h1 className="text-base sm:text-xl font-extrabold text-[var(--foreground)] tracking-tight leading-tight truncate">
              İnteraktif Alıştırma Merkezi
            </h1>
            <p className="text-[11px] sm:text-xs font-medium text-[var(--muted)] truncate">
              Kelime ve diyalog cümleleriyle interaktif pratik yapın
            </p>
          </div>
        </div>

        <div className="hidden sm:flex items-center gap-2 bg-[#F7EFE1] dark:bg-[var(--surface)] border-2 border-[#E6D7BE] dark:border-[var(--border)] border-b-3 rounded-xl px-3 py-1.5 text-xs font-extrabold text-[#087F5B] tabular-nums shrink-0">
          <span>
            {singleDialogueId !== "all"
              ? `Diyalog #${singleDialogueId.replace("dlg_", "")}`
              : `${selectedDialogues.length} Diyalog`}
          </span>
          <span>·</span>
          <span>{activePoolCountLabel}</span>
        </div>
      </div>

      {!isPlaying ? (
        <>
          {/* 1. ÜSTTE 2 SÜTUNLU (MOBİL) / 5'Lİ (MASAÜSTÜ) KOMPAKT ALIŞTIRMA TÜRÜ SEÇİM IZGARASI */}
          <section aria-label="Alıştırma Türü Seçimi">
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-2.5">
              {exerciseCards.map((card) => {
                const isSelected = selectedType === card.id;
                const Icon = card.icon;

                return (
                  <button
                    key={card.id}
                    type="button"
                    onClick={() => {
                      playClick();
                      setSelectedType(card.id);
                    }}
                    className={`relative text-left p-3 rounded-2xl border-2 border-b-4 transition-all flex flex-col justify-between min-h-[88px] sm:min-h-[96px] cursor-pointer ${
                      isSelected
                        ? "bg-[#F3F0FF] dark:bg-[var(--lavender-bg)] border-[#6741D9] -translate-y-0.5 shadow-xs"
                        : "bg-[#F7EFE1] dark:bg-[var(--surface)] border-[#E6D7BE] dark:border-[var(--border)] hover:border-[#cbb692]"
                    }`}
                  >
                    {isSelected ? (
                      <span className="absolute top-2 right-2 w-5 h-5 rounded-full bg-[#6741D9] text-white flex items-center justify-center">
                        <Check size={11} strokeWidth={3} />
                      </span>
                    ) : (
                      <span className="arabic hidden sm:inline absolute top-1.5 right-2.5 text-sm font-bold text-[var(--muted)] opacity-75">
                        {card.arabicBadge}
                      </span>
                    )}

                    <div className="space-y-1">
                      <div className="flex items-center gap-2 pr-5">
                        <div
                          className={`w-7 h-7 sm:w-8 sm:h-8 rounded-xl border-2 border-b-3 flex items-center justify-center shrink-0 ${
                            isSelected
                              ? "bg-[#6741D9] border-[#5230B5] text-white"
                              : "bg-white dark:bg-[var(--background)] border-[#E6D7BE] text-[#087F5B]"
                          }`}
                        >
                          <Icon size={15} strokeWidth={2.3} />
                        </div>
                        <h2
                          className={`text-xs sm:text-sm font-extrabold leading-tight ${
                            isSelected
                              ? "text-[#4C28B5] dark:text-[#d0bfff]"
                              : "text-[var(--foreground)]"
                          }`}
                        >
                          {card.title}
                        </h2>
                      </div>
                      <p className="text-[11px] sm:text-xs text-[var(--muted)] leading-snug line-clamp-2">
                        {card.subtitle}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          {/* 2. KOMPAKT AYAR PANELİ + HER ZAMAN GÖRÜNÜR BAŞLAT BUTONU */}
          <section className="bg-[#F7EFE1] dark:bg-[var(--surface)] rounded-2xl border-2 border-[#E6D7BE] dark:border-[var(--border)] border-b-4 p-2.5 space-y-2.5">
            {/* Üst Ayar Satırı: Mobilde 2 Sütunlu Grid, Masaüstünde Flex */}
            <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2">
              {/* 1. Kelime Havuzu Select */}
              <div className="bg-white dark:bg-[var(--background)] rounded-xl px-2.5 h-9 border border-[#E6D7BE] dark:border-[var(--border)] flex items-center gap-1.5 min-w-0">
                <Layers size={13} className="text-[#0CA678] shrink-0" />
                <span className="hidden sm:inline text-[11px] font-bold text-[var(--muted)] whitespace-nowrap">
                  Havuz:
                </span>
                <select
                  value={singleDialogueId !== "all" ? "all-dict" : rangePreset}
                  onChange={(e) => handlePoolSelectChange(e.target.value)}
                  aria-label="Kelime Havuzu Seçimi"
                  className="bg-transparent text-xs font-extrabold text-[var(--foreground)] focus:outline-none cursor-pointer w-full truncate"
                >
                  {rangeOptions.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* 2. Diyalog / Kur Select */}
              <div className="bg-white dark:bg-[var(--background)] rounded-xl px-2.5 h-9 border border-[#E6D7BE] dark:border-[var(--border)] flex items-center gap-1.5 min-w-0">
                <span className="hidden sm:inline text-[11px] font-bold text-[var(--muted)] whitespace-nowrap">
                  Diyalog:
                </span>
                <select
                  value={singleDialogueId}
                  onChange={(e) => {
                    playClick();
                    setSingleDialogueId(e.target.value);
                  }}
                  aria-label="Diyalog Seçimi"
                  className="bg-transparent text-xs font-extrabold text-[var(--foreground)] focus:outline-none cursor-pointer w-full sm:max-w-[180px] truncate"
                >
                  <option value="all">Tüm Kurlar / Seçili Havuz</option>
                  {diyaloglar.map((dlg) => {
                    const num = dlg.id.replace("dlg_", "");
                    return (
                      <option key={dlg.id} value={dlg.id}>
                        #{num} — {dlg.baslik_tr} ({dlg.seviye})
                      </option>
                    );
                  })}
                </select>
              </div>

              {/* 3. İçerik Türü (Soru Kaynağı: Kelimeler | Cümleler | Karışık) */}
              {selectedType !== "fill-in-blanks" &&
                selectedType !== "sentence-builder" && (
                <div className="col-span-2 sm:col-span-1 bg-white dark:bg-[var(--background)] rounded-xl p-1.5 h-auto border border-[#E6D7BE] dark:border-[var(--border)] flex flex-col sm:flex-row sm:items-center justify-between sm:justify-start gap-1.5">
                  <span className="text-[11px] font-bold text-[var(--muted)] px-1 whitespace-nowrap">
                    İçerik:
                  </span>
                  <div className="grid grid-cols-3 sm:flex items-center gap-1 w-full sm:w-auto">
                    {(
                      [
                        { id: "words", label: "🔤 Kelimeler" },
                        { id: "sentences", label: "💬 Cümleler" },
                        { id: "mixed", label: "🔀 Karışık" },
                      ] as { id: QuizContentType; label: string }[]
                    ).map((item) => {
                      const active = contentType === item.id;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => {
                            playClick();
                            setContentType(item.id);
                          }}
                          className={`px-2 py-1.5 text-xs rounded-lg transition-all whitespace-nowrap text-center cursor-pointer ${
                            active
                              ? "bg-[#6741D9] text-white font-bold shadow-2xs"
                              : "text-[var(--muted)] font-semibold hover:text-[var(--foreground)]"
                          }`}
                        >
                          {item.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Boşluk Doldurma Alt Mod Seçicisi */}
              {selectedType === "fill-in-blanks" && (
                <div className="col-span-2 sm:col-span-1 bg-white dark:bg-[var(--background)] rounded-xl p-1.5 h-auto border border-[#E6D7BE] dark:border-[var(--border)] flex flex-col sm:flex-row sm:items-center justify-between sm:justify-start gap-1.5">
                  <span className="text-[11px] font-bold text-[var(--muted)] px-1 whitespace-nowrap">
                    Mod:
                  </span>
                  <div className="grid grid-cols-2 sm:flex items-center gap-1 w-full sm:w-auto">
                    {(
                      [
                        { id: "choices", label: "🧩 Seçmeli / Sürükle" },
                        { id: "dictation", label: "🎧 Dinle & Yaz (İmla)" },
                      ] as { id: FillSubMode; label: string }[]
                    ).map((m) => {
                      const active = fillSubMode === m.id;
                      return (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => {
                            playClick();
                            setFillSubMode(m.id);
                          }}
                          className={`px-2 py-1.5 text-xs rounded-lg transition-all whitespace-nowrap text-center cursor-pointer ${
                            active
                              ? "bg-[#6741D9] text-white font-bold shadow-2xs"
                              : "text-[var(--muted)] font-semibold hover:text-[var(--foreground)]"
                          }`}
                        >
                          {m.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* 4. Değerlendirme Zamanı Seçicisi (⚡ Hemen Göster | 🏁 Bitince Göster) */}
              {selectedType !== "flashcard" && (
                <div className="col-span-2 sm:col-span-1 bg-white dark:bg-[var(--background)] rounded-xl p-1.5 h-auto border border-[#E6D7BE] dark:border-[var(--border)] flex flex-col sm:flex-row sm:items-center justify-between sm:justify-start gap-1.5">
                  <span className="text-[11px] font-bold text-[var(--muted)] px-1 whitespace-nowrap">
                    Sonuçlar:
                  </span>
                  <div className="grid grid-cols-2 sm:flex items-center gap-1 w-full sm:w-auto">
                    {(
                      [
                        { id: "instant", label: "⚡ Hemen Göster" },
                        { id: "end", label: "🏁 Bitince Göster" },
                      ] as { id: FeedbackMode; label: string }[]
                    ).map((fb) => {
                      const active = feedbackMode === fb.id;
                      return (
                        <button
                          key={fb.id}
                          type="button"
                          onClick={() => {
                            playClick();
                            setFeedbackMode(fb.id);
                          }}
                          className={`px-2 py-1.5 text-xs rounded-lg transition-all whitespace-nowrap text-center cursor-pointer ${
                            active
                              ? "bg-[#0CA678] text-white font-bold shadow-2xs"
                              : "text-[var(--muted)] font-semibold hover:text-[var(--foreground)]"
                          }`}
                        >
                          {fb.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* 5 & 6. Soru Sayısı (10 | 20 | 30) ve Süre (Süresiz | 60s | 30s) */}
              <div className="col-span-2 sm:col-span-1 grid grid-cols-1 sm:grid-cols-2 gap-2 w-full sm:w-auto">
                <div className="bg-white dark:bg-[var(--background)] rounded-xl p-1 h-9 border border-[#E6D7BE] dark:border-[var(--border)] flex items-center justify-between gap-1">
                  <span className="text-[11px] font-bold text-[var(--muted)] px-1.5 whitespace-nowrap">
                    Soru:
                  </span>
                  {([10, 20, 30] as (10 | 20 | 30)[]).map((cnt) => (
                    <button
                      key={cnt}
                      type="button"
                      onClick={() => {
                        playClick();
                        setQuestionCount(cnt);
                      }}
                      className={`flex-1 px-2.5 py-1 text-xs tabular-nums rounded-lg transition-all whitespace-nowrap cursor-pointer ${
                        questionCount === cnt
                          ? "bg-[#0CA678] text-white font-bold"
                          : "text-[var(--muted)] font-semibold hover:text-[var(--foreground)]"
                      }`}
                    >
                      {cnt}
                    </button>
                  ))}
                </div>

                <div className="bg-white dark:bg-[var(--background)] rounded-xl p-1 h-9 border border-[#E6D7BE] dark:border-[var(--border)] flex items-center justify-between gap-1">
                  <Timer size={13} className="text-[#6741D9] ml-1.5 shrink-0" />
                  {[
                    { val: null, label: "Süresiz" },
                    { val: 60, label: "60s" },
                    { val: 30, label: "30s" },
                  ].map((t) => (
                    <button
                      key={String(t.val)}
                      type="button"
                      onClick={() => {
                        playClick();
                        setTimeLimit(t.val);
                      }}
                      className={`flex-1 px-2 py-1 text-xs rounded-lg transition-all whitespace-nowrap cursor-pointer ${
                        timeLimit === t.val
                          ? "bg-[#0CA678] text-white font-bold"
                          : "text-[var(--muted)] font-semibold hover:text-[var(--foreground)]"
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* 7. Sağ Uç / Alt Sticky: Vurgulu [▶ Alıştırmayı Başlat] Butonu */}
              <button
                type="button"
                onClick={handleStartExercise}
                disabled={
                  combinedVocabulary.length < 4 && sentenceCountInPool < 4
                }
                className="col-span-2 sm:col-span-1 sm:ml-auto w-full sm:w-auto h-10 px-5 bg-[#0CA678] hover:bg-[#099268] disabled:opacity-50 text-white font-extrabold text-xs sm:text-sm rounded-xl border-b-3 border-[#087F5B] active:border-b-0 active:translate-y-0.5 transition-all flex items-center justify-center gap-2 shadow-sm shrink-0 cursor-pointer whitespace-nowrap sticky bottom-2 z-20"
              >
                <Play size={15} fill="currentColor" />
                <span>Alıştırmayı Başlat ({activePoolCountLabel})</span>
              </button>
            </div>

            {poolNotice && (
              <div className="bg-white dark:bg-[var(--background)] rounded-xl px-3 py-1.5 border border-[#E6D7BE] flex items-center gap-2 text-xs font-semibold text-[#6741D9] dark:text-[#d0bfff]">
                <Info size={14} className="shrink-0" />
                <span>{poolNotice}</span>
              </div>
            )}
          </section>
        </>
      ) : (
        /* AKTİF ALIŞTIRMA EKRANI */
        <div className="space-y-4">
          {selectedType === "flashcard" && (
            <Flashcard
              vocabulary={combinedVocabulary}
              dialogues={selectedDialogues}
              contentType={contentType}
              questionCount={questionCount}
              onClose={() => setIsPlaying(false)}
            />
          )}
          {selectedType === "multiple-choice" && (
            <MultipleChoice
              vocabulary={combinedVocabulary}
              dialogues={selectedDialogues}
              contentType={contentType}
              timeLimit={timeLimit}
              questionCount={questionCount}
              feedbackMode={feedbackMode}
              onClose={() => setIsPlaying(false)}
            />
          )}
          {selectedType === "fill-in-blanks" && (
            <FillInBlanks
              dialogues={selectedDialogues}
              vocabulary={combinedVocabulary}
              timeLimit={timeLimit}
              questionCount={questionCount}
              feedbackMode={feedbackMode}
              initialSubMode={fillSubMode}
              onClose={() => setIsPlaying(false)}
            />
          )}
          {selectedType === "matching" && (
            <MatchingGame
              vocabulary={combinedVocabulary}
              dialogues={selectedDialogues}
              contentType={contentType}
              timeLimit={timeLimit}
              questionCount={questionCount}
              feedbackMode={feedbackMode}
              onClose={() => setIsPlaying(false)}
            />
          )}
          {selectedType === "sentence-builder" && (
            <SentenceBuilder
              dialogues={selectedDialogues}
              questionCount={questionCount}
              timeLimit={timeLimit}
              feedbackMode={feedbackMode}
              onClose={() => setIsPlaying(false)}
            />
          )}
        </div>
      )}
    </div>
  );
}