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
} from "lucide-react";
import { playClick } from "@/lib/sfxManager";
import { diyaloglar, sozluk } from "@/lib/data";
import { getDialogueVocabulary } from "@/lib/dict";
import { DictionaryItem } from "@/types/data";
import { useUserStore } from "@/store/userStore";

import Flashcard from "@/components/exercises/Flashcard";
import MultipleChoice from "@/components/exercises/MultipleChoice";
import FillInBlanks from "@/components/exercises/FillInBlanks";
import MatchingGame from "@/components/exercises/MatchingGame";

type ExerciseType =
  | "flashcard"
  | "multiple-choice"
  | "fill-in-blanks"
  | "matching";

export default function ExercisesPage() {
  const [selectedType, setSelectedType] = useState<ExerciseType>("flashcard");
  const [isPlaying, setIsPlaying] = useState(false);

  const { favoriteWords, weakWords } = useUserStore();

  // Tek Satırlık Ultra-Kompakt Ayar Barı State
  const [rangePreset, setRangePreset] = useState<string>("all-dict");
  const [singleDialogueId, setSingleDialogueId] = useState<string>("all");
  const [startNum, setStartNum] = useState(1);
  const [endNum, setEndNum] = useState(60);
  const [questionCount, setQuestionCount] = useState<10 | 20 | 30>(10);
  const [timeLimit, setTimeLimit] = useState<number | null>(null);

  const selectedDialogues = useMemo(() => {
    if (singleDialogueId !== "all") {
      return diyaloglar.filter((dlg) => dlg.id === singleDialogueId);
    }
    return diyaloglar.filter((dlg) => {
      const num = parseInt(dlg.id.replace("dlg_", ""), 10);
      return num >= startNum && num <= endNum;
    });
  }, [singleDialogueId, startNum, endNum]);

  const { combinedVocabulary, poolNotice } = useMemo(() => {
    // Tek bir diyalog seçildiyse o diyaloğun tüm kelimelerini morfolojik motorla getir
    if (singleDialogueId !== "all") {
      return {
        combinedVocabulary: getDialogueVocabulary(singleDialogueId).map(
          (e) => e.item
        ),
        poolNotice: null as string | null,
      };
    }

    // Favori Kelimelerim Havuzu
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

    // Mahreç Tekrarı (Zayıf Kelimelerim) Havuzu
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

    // "Tüm Sözlük" seçildiyse birleştirilmiş tam sözlüğü döndür
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
      title: "Kelime Kartları",
      arabicBadge: "البِطَاقَات",
      subtitle: "Sesli Arapça-Türkçe 3B kelime kartlarıyla hızlı tekrar",
      icon: BookOpen,
    },
    {
      id: "multiple-choice",
      title: "Çoktan Seçmeli Test",
      arabicBadge: "الاخْتِبَار",
      subtitle: "4 şıklı kelime anlamı testi ile bilginizi ölçün",
      icon: CheckSquare,
    },
    {
      id: "fill-in-blanks",
      title: "Boşluk Doldurma",
      arabicBadge: "الفَرَاغَات",
      subtitle: "Cümledeki eksik Arapça kelimeyi tıklayın veya sürükleyin",
      icon: PenTool,
    },
    {
      id: "matching",
      title: "Kelime Eşleştirme",
      arabicBadge: "المُطَابَقَة",
      subtitle: "Arapça kelimelerle Türkçe anlamlarını eşleştirin",
      icon: Link2,
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
    if (combinedVocabulary.length < 4) return;
    setIsPlaying(true);
  };

  return (
    <div className="space-y-4">
      {/* ÜST BAŞLIK */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {isPlaying ? (
            <button
              type="button"
              onClick={() => {
                playClick();
                setIsPlaying(false);
              }}
              className="h-9 px-3 rounded-xl bg-[#F7EFE1] dark:bg-[var(--surface)] border-2 border-[#E6D7BE] dark:border-[var(--border)] border-b-3 flex items-center gap-1.5 text-xs font-extrabold text-[var(--foreground)] hover:bg-[#EFE3CE] cursor-pointer"
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

          <div>
            <h1 className="text-lg sm:text-xl font-extrabold text-[var(--foreground)] tracking-tight leading-tight">
              İnteraktif Alıştırma Merkezi
            </h1>
            <p className="text-xs font-medium text-[var(--muted)]">
              Morfolojik sözlük motoruyla diyalog kelimelerini kalıcı hale getirin
            </p>
          </div>
        </div>

        <div className="hidden sm:flex items-center gap-2 bg-[#F7EFE1] dark:bg-[var(--surface)] border-2 border-[#E6D7BE] dark:border-[var(--border)] border-b-3 rounded-xl px-3 py-1.5 text-xs font-extrabold text-[#087F5B] tabular-nums">
          <span>
            {singleDialogueId !== "all"
              ? `Diyalog #${singleDialogueId.replace("dlg_", "")}`
              : `${selectedDialogues.length} Diyalog`}
          </span>
          <span>·</span>
          <span>{combinedVocabulary.length} Kelime Havuzu</span>
        </div>
      </div>

      {!isPlaying ? (
        <>
          {/* 1. ÜSTTE 4'LÜ KOMPAKT ALIŞTIRMA TÜRÜ SEÇİM IZGARASI */}
          <section aria-label="Alıştırma Türü Seçimi">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
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
                    className={`relative text-left p-3.5 rounded-2xl border-2 border-b-4 transition-all flex flex-col justify-between min-h-[98px] cursor-pointer ${
                      isSelected
                        ? "bg-[#F3F0FF] dark:bg-[var(--lavender-bg)] border-[#6741D9] -translate-y-0.5"
                        : "bg-[#F7EFE1] dark:bg-[var(--surface)] border-[#E6D7BE] dark:border-[var(--border)] hover:border-[#cbb692]"
                    }`}
                  >
                    {isSelected ? (
                      <span className="absolute top-2.5 right-2.5 w-5 h-5 rounded-full bg-[#6741D9] text-white flex items-center justify-center">
                        <Check size={12} strokeWidth={3} />
                      </span>
                    ) : (
                      <span className="arabic absolute top-2 right-3 text-base font-bold text-[var(--muted)] opacity-75">
                        {card.arabicBadge}
                      </span>
                    )}

                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2.5 pr-6">
                        <div
                          className={`w-8 h-8 rounded-xl border-2 border-b-3 flex items-center justify-center shrink-0 ${
                            isSelected
                              ? "bg-[#6741D9] border-[#5230B5] text-white"
                              : "bg-white dark:bg-[var(--background)] border-[#E6D7BE] text-[#087F5B]"
                          }`}
                        >
                          <Icon size={16} strokeWidth={2.3} />
                        </div>
                        <h2
                          className={`text-sm font-extrabold leading-tight ${
                            isSelected
                              ? "text-[#4C28B5] dark:text-[#d0bfff]"
                              : "text-[var(--foreground)]"
                          }`}
                        >
                          {card.title}
                        </h2>
                      </div>
                      <p className="text-xs text-[var(--muted)] leading-snug line-clamp-2">
                        {card.subtitle}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          {/* 2. TEK SATIRLIK ULTRA-KOMPAKT AYAR BARI + ENTEGRE BAŞLAT BUTONU */}
          <section className="bg-[#F7EFE1] dark:bg-[var(--surface)] rounded-2xl border-2 border-[#E6D7BE] dark:border-[var(--border)] border-b-4 p-2.5 space-y-2">
            <div className="flex flex-wrap lg:flex-nowrap items-center justify-between gap-2.5">
              {/* Sol & Orta Kontroller */}
              <div className="flex flex-wrap items-center gap-2 flex-1 min-w-0">
                {/* 1. Kelime Havuzu Select */}
                <div className="bg-white dark:bg-[var(--background)] rounded-xl px-2.5 h-9 border border-[#E6D7BE] dark:border-[var(--border)] flex items-center gap-1.5 shrink-0">
                  <Layers size={14} className="text-[#0CA678] shrink-0" />
                  <span className="text-[11px] font-bold text-[var(--muted)] whitespace-nowrap">
                    Havuz:
                  </span>
                  <select
                    value={singleDialogueId !== "all" ? "all-dict" : rangePreset}
                    onChange={(e) => handlePoolSelectChange(e.target.value)}
                    aria-label="Kelime Havuzu Seçimi"
                    className="bg-transparent text-xs font-extrabold text-[var(--foreground)] focus:outline-none cursor-pointer pr-1"
                  >
                    {rangeOptions.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* 2. Diyalog / Kur Select */}
                <div className="bg-white dark:bg-[var(--background)] rounded-xl px-2.5 h-9 border border-[#E6D7BE] dark:border-[var(--border)] flex items-center gap-1.5 shrink-0">
                  <span className="text-[11px] font-bold text-[var(--muted)] whitespace-nowrap">
                    Diyalog:
                  </span>
                  <select
                    value={singleDialogueId}
                    onChange={(e) => {
                      playClick();
                      setSingleDialogueId(e.target.value);
                    }}
                    aria-label="Diyalog Seçimi"
                    className="bg-transparent text-xs font-extrabold text-[var(--foreground)] focus:outline-none cursor-pointer max-w-[185px] truncate"
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

                {/* 3. Soru Sayısı (10 | 20 | 30) */}
                <div className="bg-white dark:bg-[var(--background)] rounded-xl p-1 h-9 border border-[#E6D7BE] dark:border-[var(--border)] flex items-center gap-1 shrink-0">
                  {([10, 20, 30] as (10 | 20 | 30)[]).map((cnt) => (
                    <button
                      key={cnt}
                      type="button"
                      onClick={() => {
                        playClick();
                        setQuestionCount(cnt);
                      }}
                      className={`px-2 py-1 text-xs tabular-nums rounded-lg transition-all whitespace-nowrap cursor-pointer ${
                        questionCount === cnt
                          ? "bg-[#0CA678] text-white font-bold"
                          : "text-[var(--muted)] font-semibold hover:text-[var(--foreground)]"
                      }`}
                    >
                      {cnt} Soru
                    </button>
                  ))}
                </div>

                {/* 4. Süre (Süresiz | 60sn | 30sn) */}
                <div className="bg-white dark:bg-[var(--background)] rounded-xl p-1 h-9 border border-[#E6D7BE] dark:border-[var(--border)] flex items-center gap-1 shrink-0">
                  <Timer size={13} className="text-[#6741D9] ml-1 shrink-0" />
                  {[
                    { val: null, label: "Süresiz" },
                    { val: 60, label: "60sn" },
                    { val: 30, label: "30sn" },
                  ].map((t) => (
                    <button
                      key={String(t.val)}
                      type="button"
                      onClick={() => {
                        playClick();
                        setTimeLimit(t.val);
                      }}
                      className={`px-2 py-1 text-xs rounded-lg transition-all whitespace-nowrap cursor-pointer ${
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

              {/* 5. Sağ Uç: Kompakt ve Vurgulu [▶ Alıştırmayı Başlat] Butonu */}
              <button
                type="button"
                onClick={handleStartExercise}
                disabled={combinedVocabulary.length < 4}
                className="w-full lg:w-auto h-10 px-5 bg-[#0CA678] hover:bg-[#099268] disabled:opacity-50 text-white font-extrabold text-xs sm:text-sm rounded-xl border-b-3 border-[#087F5B] active:border-b-0 active:translate-y-0.5 transition-all flex items-center justify-center gap-2 shadow-xs shrink-0 cursor-pointer whitespace-nowrap"
              >
                <Play size={15} fill="currentColor" />
                <span>
                  Alıştırmayı Başlat ({combinedVocabulary.length})
                </span>
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
              questionCount={questionCount}
            />
          )}
          {selectedType === "multiple-choice" && (
            <MultipleChoice
              vocabulary={combinedVocabulary}
              timeLimit={timeLimit}
              questionCount={questionCount}
            />
          )}
          {selectedType === "fill-in-blanks" && (
            <FillInBlanks
              dialogues={selectedDialogues}
              vocabulary={combinedVocabulary}
              timeLimit={timeLimit}
              questionCount={questionCount}
            />
          )}
          {selectedType === "matching" && (
            <MatchingGame
              vocabulary={combinedVocabulary}
              timeLimit={timeLimit}
              questionCount={questionCount}
            />
          )}
        </div>
      )}
    </div>
  );
}