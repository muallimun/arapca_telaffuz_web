"use client";

import { useState, useEffect, useRef } from "react";
import {
  playSuccess,
  playError,
  playFanfare,
  playClick,
} from "@/lib/sfxManager";
import { DictionaryItem } from "@/types/data";
import { shuffleArray } from "@/lib/quiz";
import {
  RotateCcw,
  Trophy,
  Timer,
  AlertCircle,
  Volume2,
  Check,
} from "lucide-react";
import { useCountdown } from "@/lib/useTimer";
import { playTTS } from "@/lib/audio";
import { useSettings } from "@/store/settings";
import { useUserStore } from "@/store/userStore";
import { formatArabicText } from "@/lib/arabicTextUtils";

interface Props {
  vocabulary: DictionaryItem[];
  timeLimit: number | null;
  questionCount?: number;
}

export default function MatchingGame({
  vocabulary,
  timeLimit,
  questionCount = 10,
}: Props) {
  const pairTarget = Math.min(8, Math.max(4, Math.floor(questionCount / 2)));
  const fanfarePlayedRef = useRef(false);
  const { speechRate, showHareke } = useSettings();
  const { addStudyMinutes } = useUserStore();
  const formatAr = (t: string) => formatArabicText(t, showHareke);

  const [cards, setCards] = useState<
    { id: string; text: string; type: "ar" | "tr"; matchId: string }[]
  >([]);
  const [selectedAr, setSelectedAr] = useState<string | null>(null);
  const [selectedTr, setSelectedTr] = useState<string | null>(null);
  const [matchedIds, setMatchedIds] = useState<string[]>([]);
  const [wrongMatch, setWrongMatch] = useState<string | null>(null);
  const [isGameOver, setIsGameOver] = useState(false);

  const isCompleted =
    matchedIds.length === cards.length / 2 && cards.length > 0;

  const handleTimeout = () => setIsGameOver(true);
  const timeLeft = useCountdown(
    timeLimit,
    handleTimeout,
    !isCompleted && !isGameOver
  );

  const initGame = () => {
    fanfarePlayedRef.current = false;
    if (vocabulary.length < 4) return;
    const selectedWords = shuffleArray(vocabulary).slice(0, pairTarget);
    const newCards: {
      id: string;
      text: string;
      type: "ar" | "tr";
      matchId: string;
    }[] = [];

    selectedWords.forEach((w) => {
      const arText = (w.mufret || w.mazi || "").split("/")[0].trim();
      newCards.push({
        id: `ar-${w.id}`,
        text: arText,
        type: "ar",
        matchId: w.id,
      });
      newCards.push({
        id: `tr-${w.id}`,
        text: w.anlam_tr,
        type: "tr",
        matchId: w.id,
      });
    });

    setCards(shuffleArray(newCards));
    setMatchedIds([]);
    setSelectedAr(null);
    setSelectedTr(null);
    setIsGameOver(false);
  };

  useEffect(() => {
    initGame();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vocabulary, pairTarget]);

  useEffect(() => {
    if (isCompleted && !fanfarePlayedRef.current) {
      fanfarePlayedRef.current = true;
      addStudyMinutes(3);
      playFanfare();
    } else if (isGameOver && !fanfarePlayedRef.current) {
      fanfarePlayedRef.current = true;
      playError();
    }
  }, [isCompleted, isGameOver, addStudyMinutes]);

  if (vocabulary.length < 4) {
    return (
      <p className="text-center text-sm font-bold text-[var(--muted)] p-8">
        Eşleştirme oyunu için en az 4 kelime gerekiyor.
      </p>
    );
  }

  const handleSelect = (
    id: string,
    type: "ar" | "tr",
    matchId: string,
    text: string
  ) => {
    if (matchedIds.includes(matchId) || isCompleted || isGameOver) return;
    playClick();

    if (type === "ar") {
      playTTS(text, speechRate);
      if (selectedTr) checkMatch(id, selectedTr);
      else setSelectedAr(id);
    } else {
      if (selectedAr) checkMatch(selectedAr, id);
      else setSelectedTr(id);
    }
  };

  const checkMatch = (arId: string, trId: string) => {
    const arMatchId = arId.replace("ar-", "");
    const trMatchId = trId.replace("tr-", "");
    if (arMatchId === trMatchId) {
      setMatchedIds((prev) => [...prev, arMatchId]);
      setSelectedAr(null);
      setSelectedTr(null);
      playSuccess();
    } else {
      setWrongMatch(arId);
      playError();
      setTimeout(() => {
        setWrongMatch(null);
        setSelectedAr(null);
        setSelectedTr(null);
      }, 550);
    }
  };

  if (isCompleted || isGameOver) {
    return (
      <div className="bg-[#F7EFE1] dark:bg-[var(--surface)] rounded-2xl border-2 border-[#E6D7BE] dark:border-[var(--border)] border-b-4 p-8 text-center space-y-5 max-w-lg mx-auto">
        <div
          className={`w-20 h-20 rounded-2xl border-2 border-b-4 flex items-center justify-center mx-auto ${
            isCompleted
              ? "bg-[#F3F0FF] border-[#6741D9] text-[#6741D9]"
              : "bg-red-50 border-red-300 text-red-600"
          }`}
        >
          {isCompleted ? <Trophy size={40} /> : <AlertCircle size={40} />}
        </div>

        <div className="space-y-1 border-b border-dashed border-[#E2D3B8] pb-4">
          <h3 className="text-2xl font-extrabold text-[var(--foreground)]">
            {isCompleted ? "Tüm Çiftleri Eşleştirdiniz!" : "Süre Doldu!"}
          </h3>
          <p className="text-xs font-semibold text-[var(--muted)]">
            {matchedIds.length} / {cards.length / 2} kelime çifti doğru
            eşleştirildi
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            playClick();
            initGame();
          }}
          className="w-full py-3.5 px-6 bg-[#0CA678] hover:bg-[#099268] text-white font-bold text-sm rounded-2xl border-b-4 border-[#087F5B] active:border-b-0 active:translate-y-1 transition-all flex items-center justify-center gap-2 cursor-pointer"
        >
          <RotateCcw size={17} />
          <span>Yeni Eşleştirme Turu</span>
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      {/* ÜST DURUM ÇUBUĞU */}
      <div className="bg-[#F7EFE1] dark:bg-[var(--surface)] rounded-2xl border-2 border-[#E6D7BE] dark:border-[var(--border)] border-b-4 px-4 py-3 flex items-center justify-between gap-2">
        <span className="text-xs sm:text-sm font-extrabold text-[var(--foreground)] tabular-nums">
          Eşleşen: {matchedIds.length} / {cards.length / 2}
        </span>

        {timeLeft !== null && (
          <div
            className={`flex items-center gap-1.5 px-3 py-1 rounded-xl border text-xs sm:text-sm font-black tabular-nums ${
              timeLeft <= 5
                ? "bg-red-100 border-red-300 text-red-700 animate-pulse"
                : "bg-white dark:bg-[var(--background)] border-[#E6D7BE] text-amber-700"
            }`}
          >
            <Timer size={16} />
            <span>00:{timeLeft.toString().padStart(2, "0")}</span>
          </div>
        )}

        <button
          type="button"
          onClick={() => {
            playClick();
            initGame();
          }}
          className="px-3 py-1.5 rounded-xl bg-white dark:bg-[var(--background)] border border-[#E6D7BE] text-xs font-extrabold text-[#087F5B] flex items-center gap-1 cursor-pointer"
        >
          <RotateCcw size={13} />
          <span>Karıştır</span>
        </button>
      </div>

      {/* İKİ SÜTUNLU 3B EŞLEŞTİRME IZGARASI */}
      <div className="grid grid-cols-2 gap-3 sm:gap-5">
        {/* SOL SÜTUN: ARAPÇA */}
        <div className="flex flex-col gap-3">
          {cards
            .filter((c) => c.type === "ar")
            .map((card) => {
              const isMatched = matchedIds.includes(card.matchId);
              const isSelected = selectedAr === card.id;
              const isWrong = wrongMatch === card.id;

              return (
                <button
                  key={card.id}
                  type="button"
                  onClick={() =>
                    handleSelect(card.id, "ar", card.matchId, card.text)
                  }
                  disabled={isMatched}
                  className={`relative w-full min-h-[76px] p-3 rounded-2xl border-2 border-b-4 transition-all flex items-center justify-center gap-2 arabic text-2xl sm:text-3xl font-bold cursor-pointer ${
                    isMatched
                      ? "bg-[#0CA678]/15 border-[#0CA678] text-[#087F5B] opacity-60"
                      : isWrong
                      ? "bg-rose-50 border-rose-400 text-rose-800"
                      : isSelected
                      ? "bg-[#F3F0FF] dark:bg-[var(--lavender-bg)] border-[#6741D9] text-[#4C28B5] -translate-y-0.5"
                      : "bg-[#F7EFE1] dark:bg-[var(--surface)] border-[#E6D7BE] dark:border-[var(--border)] hover:border-[#6741D9] text-[var(--foreground)]"
                  }`}
                >
                  {isSelected && (
                    <span className="absolute top-2 right-2 w-5 h-5 rounded-full bg-[#6741D9] text-white flex items-center justify-center">
                      <Check size={11} strokeWidth={3} />
                    </span>
                  )}
                  <Volume2
                    size={14}
                    className="text-[#0CA678] opacity-60 shrink-0"
                  />
                  <span dir="rtl">{formatAr(card.text)}</span>
                </button>
              );
            })}
        </div>

        {/* SAĞ SÜTUN: TÜRKÇE */}
        <div className="flex flex-col gap-3">
          {cards
            .filter((c) => c.type === "tr")
            .map((card) => {
              const isMatched = matchedIds.includes(card.matchId);
              const isSelected = selectedTr === card.id;

              return (
                <button
                  key={card.id}
                  type="button"
                  onClick={() =>
                    handleSelect(card.id, "tr", card.matchId, card.text)
                  }
                  disabled={isMatched}
                  className={`relative w-full min-h-[76px] p-3 rounded-2xl border-2 border-b-4 transition-all flex items-center justify-center text-center font-extrabold text-xs sm:text-sm leading-snug cursor-pointer ${
                    isMatched
                      ? "bg-[#0CA678]/15 border-[#0CA678] text-[#087F5B] opacity-60"
                      : isSelected
                      ? "bg-[#F3F0FF] dark:bg-[var(--lavender-bg)] border-[#6741D9] text-[#4C28B5] -translate-y-0.5"
                      : "bg-[#F7EFE1] dark:bg-[var(--surface)] border-[#E6D7BE] dark:border-[var(--border)] hover:border-[#6741D9] text-[var(--foreground)]"
                  }`}
                >
                  {isSelected && (
                    <span className="absolute top-2 right-2 w-5 h-5 rounded-full bg-[#6741D9] text-white flex items-center justify-center">
                      <Check size={11} strokeWidth={3} />
                    </span>
                  )}
                  <span>{card.text}</span>
                </button>
              );
            })}
        </div>
      </div>
    </div>
  );
}