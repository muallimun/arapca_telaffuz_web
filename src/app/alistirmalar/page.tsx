"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import {
  ChevronLeft,
  SlidersHorizontal,
  Timer,
  Layers,
  Check,
  Play,
  BookOpen,
  CheckSquare,
  PenTool,
  Link2,
  Info,
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

  // Ayar Satırları State
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
      subtitle: "Diyalog cümlelerindeki eksik Arapça kelimeleri tamamlayın",
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
    { id: "all-dict", label: "Tüm Sözlük", s: 1, e: 60 },
    { id: "1-15", label: "Başlangıç (1-15)", s: 1, e: 15 },
    { id: "16-35", label: "Orta (16-35)", s: 16, e: 35 },
    { id: "36-60", label: "İleri (36-60)", s: 36, e: 60 },
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

  const handleStartExercise = () => {
    playClick();
    if (combinedVocabulary.length < 4) return;
    setIsPlaying(true);
  };

  return (
    <div className="space-y-5">
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
              className="h-10 px-3.5 rounded-xl bg-[#F7EFE1] dark:bg-[var(--surface)] border-2 border-[#E6D7BE] dark:border-[var(--border)] border-b-4 flex items-center gap-1.5 text-xs font-extrabold text-[var(--foreground)] hover:bg-[#EFE3CE] cursor-pointer"
            >
              <ChevronLeft size={18} />
              <span>Ayarlara Dön</span>
            </button>
          ) : (
            <Link
              href="/"
              onClick={() => playClick()}
              className="w-10 h-10 rounded-xl bg-[#F7EFE1] dark:bg-[var(--surface)] border-2 border-[#E6D7BE] dark:border-[var(--border)] border-b-4 flex items-center justify-center text-[var(--foreground)] hover:bg-[#EFE3CE] shrink-0"
              aria-label="Ana Sayfaya Dön"
            >
              <ChevronLeft size={20} strokeWidth={2.5} />
            </Link>
          )}

          <div>
            <h1 className="text-xl sm:text-2xl font-extrabold text-[var(--foreground)] tracking-tight">
              İnteraktif Alıştırma Merkezi
            </h1>
            <p className="text-xs font-medium text-[var(--muted)]">
              Morfolojik sözlük motoruyla diyalog kelimelerini kalıcı hale
              getirin
            </p>
          </div>
        </div>

        <div className="hidden sm:flex items-center gap-2 bg-[#F7EFE1] dark:bg-[var(--surface)] border-2 border-[#E6D7BE] dark:border-[var(--border)] border-b-4 rounded-xl px-3.5 py-2 text-xs font-extrabold text-[#087F5B] tabular-nums">
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
          {/* 1. ÜSTTE 4'LÜ ALIŞTIRMA TÜRÜ SEÇİM IZGARASI */}
          <section aria-label="Alıştırma Türü Seçimi">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
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
                    className={`relative text-left p-4 rounded-2xl border-2 border-b-4 transition-all flex flex-col justify-between min-h-[148px] cursor-pointer ${
                      isSelected
                        ? "bg-[#F3F0FF] dark:bg-[var(--lavender-bg)] border-[#6741D9] -translate-y-0.5"
                        : "bg-[#F7EFE1] dark:bg-[var(--surface)] border-[#E6D7BE] dark:border-[var(--border)] hover:border-[#cbb692]"
                    }`}
                  >
                    {isSelected ? (
                      <span className="absolute top-3 right-3 w-6 h-6 rounded-full bg-[#6741D9] text-white flex items-center justify-center">
                        <Check size={14} strokeWidth={3} />
                      </span>
                    ) : (
                      <span className="arabic absolute top-2.5 right-3.5 text-lg font-bold text-[var(--muted)] opacity-75">
                        {card.arabicBadge}
                      </span>
                    )}

                    <div>
                      <div
                        className={`w-10 h-10 rounded-xl border-2 border-b-3 flex items-center justify-center mb-3 ${
                          isSelected
                            ? "bg-[#6741D9] border-[#5230B5] text-white"
                            : "bg-white dark:bg-[var(--background)] border-[#E6D7BE] text-[#087F5B]"
                        }`}
                      >
                        <Icon size={19} strokeWidth={2.3} />
                      </div>

                      <h2
                        className={`text-base font-extrabold ${
                          isSelected
                            ? "text-[#4C28B5] dark:text-[#d0bfff]"
                            : "text-[var(--foreground)]"
                        }`}
                      >
                        {card.title}
                      </h2>
                      <p className="text-xs text-[var(--muted)] mt-1 leading-relaxed">
                        {card.subtitle}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          {/* 2. KESİK ÇİZGİLİ AYAR SATIRLARI */}
          <section className="bg-[#F7EFE1] dark:bg-[var(--surface)] rounded-2xl border-2 border-[#E6D7BE] dark:border-[var(--border)] border-b-4 px-4 sm:px-6 py-2">
            {/* Satır 1: Seviye / Sözlük / Favoriler / Mahreç Tekrarı Havuzu */}
            <div className="py-3.5 border-b border-dashed border-[#E2D3B8] dark:border-[var(--border-dashed)] flex flex-col gap-3">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <SlidersHorizontal
                    size={18}
                    className="text-[#087F5B] shrink-0"
                  />
                  <div>
                    <span className="block text-sm font-extrabold text-[var(--foreground)]">
                      Kelime Havuzu Seçimi ({combinedVocabulary.length} Kelime)
                    </span>
                    <span className="block text-xs text-[var(--muted)]">
                      Tüm sözlükten, kur aralığından, favorilerinizden veya
                      zayıf kelimelerinizden çalışın
                    </span>
                  </div>
                </div>

                <div className="bg-white dark:bg-[var(--background)] rounded-xl p-1 border border-[#E6D7BE] dark:border-[var(--border)] flex flex-wrap items-center gap-1 self-start lg:self-auto">
                  {rangeOptions.map((r) => {
                    const active =
                      singleDialogueId === "all" && rangePreset === r.id;
                    return (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => {
                          playClick();
                          setSingleDialogueId("all");
                          setRangePreset(r.id);
                          setStartNum(r.s);
                          setEndNum(r.e);
                        }}
                        className={`px-3 py-1.5 text-xs rounded-lg transition-all whitespace-nowrap cursor-pointer ${
                          active
                            ? "bg-[#0CA678] text-white font-semibold"
                            : "text-[var(--muted)] font-medium hover:text-[var(--foreground)]"
                        }`}
                      >
                        {r.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {poolNotice && (
                <div className="bg-white dark:bg-[var(--background)] rounded-xl px-3.5 py-2 border border-[#E6D7BE] flex items-center gap-2 text-xs font-semibold text-[#6741D9] dark:text-[#d0bfff]">
                  <Info size={15} className="shrink-0" />
                  <span>{poolNotice}</span>
                </div>
              )}
            </div>

            {/* Satır 2: Belirli Bir Diyaloğun Kelimeleri (dlg_01 - dlg_60) */}
            <div className="py-3.5 border-b border-dashed border-[#E2D3B8] dark:border-[var(--border-dashed)] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <BookOpen size={18} className="text-[#087F5B] shrink-0" />
                <div>
                  <span className="block text-sm font-extrabold text-[var(--foreground)]">
                    Belirli Bir Diyaloğun Kelimeleri (dlg_01 - dlg_60)
                  </span>
                  <span className="block text-xs text-[var(--muted)]">
                    Sadece seçtiğiniz diyalogda geçen kelimelerle alıştırma yapın
                  </span>
                </div>
              </div>

              <div className="bg-white dark:bg-[var(--background)] rounded-xl p-1 border border-[#E6D7BE] dark:border-[var(--border)] w-full sm:w-auto sm:min-w-[290px]">
                <select
                  value={singleDialogueId}
                  onChange={(e) => {
                    playClick();
                    setSingleDialogueId(e.target.value);
                  }}
                  className="w-full bg-transparent px-3 py-1.5 text-xs font-bold text-[var(--foreground)] focus:outline-none cursor-pointer"
                >
                  <option value="all">
                    Seçili Kur Aralığı / Tüm Sözlük
                  </option>
                  {diyaloglar.map((dlg) => {
                    const num = dlg.id.replace("dlg_", "");
                    return (
                      <option key={dlg.id} value={dlg.id}>
                        Diyalog #{num} — {dlg.baslik_tr} ({dlg.seviye})
                      </option>
                    );
                  })}
                </select>
              </div>
            </div>

            {/* Satır 3: Soru Sayısı (10 | 20 | 30) */}
            <div className="py-3.5 border-b border-dashed border-[#E2D3B8] dark:border-[var(--border-dashed)] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <Layers size={18} className="text-[#087F5B] shrink-0" />
                <div>
                  <span className="block text-sm font-extrabold text-[var(--foreground)]">
                    Soru / Kart Sayısı
                  </span>
                  <span className="block text-xs text-[var(--muted)]">
                    Bir turda karşınıza çıkacak toplam kelime veya cümle adedi
                  </span>
                </div>
              </div>

              <div className="bg-white dark:bg-[var(--background)] rounded-xl p-1 border border-[#E6D7BE] dark:border-[var(--border)] flex items-center gap-1 self-start sm:self-auto">
                {([10, 20, 30] as (10 | 20 | 30)[]).map((cnt) => (
                  <button
                    key={cnt}
                    type="button"
                    onClick={() => {
                      playClick();
                      setQuestionCount(cnt);
                    }}
                    className={`px-4 py-1.5 text-xs tabular-nums rounded-lg transition-all whitespace-nowrap cursor-pointer ${
                      questionCount === cnt
                        ? "bg-[#0CA678] text-white font-semibold"
                        : "text-[var(--muted)] font-medium hover:text-[var(--foreground)]"
                    }`}
                  >
                    {cnt} Soru
                  </button>
                ))}
              </div>
            </div>

            {/* Satır 4: Süre Modu (Süresiz | Zamana Karşı) */}
            <div className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <Timer size={18} className="text-[#087F5B] shrink-0" />
                <div>
                  <span className="block text-sm font-extrabold text-[var(--foreground)]">
                    Süre Modu
                  </span>
                  <span className="block text-xs text-[var(--muted)]">
                    Rahat çalışma için süresiz veya heyecan için zamana karşı
                  </span>
                </div>
              </div>

              <div className="bg-white dark:bg-[var(--background)] rounded-xl p-1 border border-[#E6D7BE] dark:border-[var(--border)] flex flex-wrap items-center gap-1 self-start sm:self-auto">
                {[
                  { val: null, label: "Süresiz" },
                  { val: 60, label: "Zamana Karşı (60 sn)" },
                  { val: 30, label: "Hızlı Tur (30 sn)" },
                ].map((t) => (
                  <button
                    key={String(t.val)}
                    type="button"
                    onClick={() => {
                      playClick();
                      setTimeLimit(t.val);
                    }}
                    className={`px-3.5 py-1.5 text-xs rounded-lg transition-all whitespace-nowrap cursor-pointer ${
                      timeLimit === t.val
                        ? "bg-[#0CA678] text-white font-semibold"
                        : "text-[var(--muted)] font-medium hover:text-[var(--foreground)]"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
          </section>

          {/* 3. ANA AKSİYON BUTONU (CTA) */}
          <button
            type="button"
            onClick={handleStartExercise}
            disabled={combinedVocabulary.length < 4}
            className="w-full py-4 px-6 bg-[#0CA678] hover:bg-[#099268] disabled:opacity-50 text-white font-bold text-base sm:text-lg rounded-2xl border-b-4 border-[#087F5B] active:border-b-0 active:translate-y-1 transition-all flex items-center justify-center gap-2.5 shadow-sm cursor-pointer"
          >
            <Play size={20} fill="currentColor" />
            <span>
              {exerciseCards.find((c) => c.id === selectedType)?.title}{" "}
              Alıştırmasını Başlat ({combinedVocabulary.length} Kelime)
            </span>
          </button>
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