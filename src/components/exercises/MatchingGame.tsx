"use client";

import { useState, useEffect, useRef } from "react";
import {
  playSuccess,
  playError,
  playFanfare,
  playClick,
} from "@/lib/sfxManager";
import { Dialogue, DictionaryItem } from "@/types/data";
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
import { QuizContentType } from "./MultipleChoice";

interface Props {
  vocabulary: DictionaryItem[];
  dialogues?: Dialogue[];
  contentType?: QuizContentType;
  timeLimit: number | null;
  questionCount?: number;
}

interface MatchCardItem {
  id: string;
  text: string;
  type: "ar" | "tr";
  matchId: string;
  isSentence?: boolean;
}

export default function MatchingGame({
  vocabulary,
  dialogues = [],
  contentType = "words",
  timeLimit,
  questionCount = 10,
}: Props) {
  const pairTarget = Math.min(8, Math.max(4, Math.floor(questionCount / 2)));
  const fanfarePlayedRef = useRef(false);
  const { speechRate, showHareke, arabicFont } = useSettings();
  const { addStudyMinutes } = useUserStore();
  const formatAr = (t: string) => formatArabicText(t, showHareke, arabicFont);

  const [arCards, setArCards] = useState<MatchCardItem[]>([]);
  const [trCards, setTrCards] = useState<MatchCardItem[]>([]);
  const [selectedAr, setSelectedAr] = useState<string | null>(null);
  const [selectedTr, setSelectedTr] = useState<string | null>(null);
  const [matchedIds, setMatchedIds] = useState<string[]>([]);
  const [wrongMatch, setWrongMatch] = useState<string | null>(null);
  const [isGameOver, setIsGameOver] = useState(false);

  const totalPairs = arCards.length;
  const isCompleted = matchedIds.length === totalPairs && totalPairs > 0;

  const handleTimeout = () => setIsGameOver(true);
  const timeLeft = useCountdown(
    timeLimit,
    handleTimeout,
    !isCompleted && !isGameOver
  );

  const initGame = () => {
    fanfarePlayedRef.current = false;

    const wordPairs: {
      matchId: string;
      arText: string;
      trText: string;
      isSentence: boolean;
    }[] = vocabulary
      .map((w) => ({
        matchId: `w_${w.id}`,
        arText: (w.mufret || w.mazi || "").split("/")[0].trim(),
        trText: w.anlam_tr,
        isSentence: false,
      }))
      .filter((p) => p.arText.length > 0 && p.trText.length > 0);

    const sentencePairs: {
      matchId: string;
      arText: string;
      trText: string;
      isSentence: boolean;
    }[] = [];

    dialogues.forEach((dlg) => {
      dlg.satirlar.forEach((line) => {
        if (line.arapca.trim() && line.turkce.trim()) {
          sentencePairs.push({
            matchId: `s_${dlg.id}_${line.sira}`,
            arText: line.arapca.trim(),
            trText: line.turkce.trim(),
            isSentence: true,
          });
        }
      });
    });

    let chosenPairs: typeof wordPairs = [];
    if (contentType === "sentences" && sentencePairs.length >= 4) {
      chosenPairs = shuffleArray(sentencePairs).slice(0, pairTarget);
    } else if (
      contentType === "mixed" &&
      sentencePairs.length >= 2 &&
      wordPairs.length >= 2
    ) {
      const sCount = Math.ceil(pairTarget / 2);
      const wCount = pairTarget - sCount;
      chosenPairs = shuffleArray([
        ...shuffleArray(sentencePairs).slice(0, sCount),
        ...shuffleArray(wordPairs).slice(0, wCount),
      ]);
    } else {
      chosenPairs = shuffleArray(wordPairs).slice(0, pairTarget);
    }

    const nextAr: MatchCardItem[] = chosenPairs.map((p) => ({
      id: `ar-${p.matchId}`,
      text: p.arText,
      type: "ar",
      matchId: p.matchId,
      isSentence: p.isSentence,
    }));

    const nextTr: MatchCardItem[] = chosenPairs.map((p) => ({
      id: `tr-${p.matchId}`,
      text: p.trText,
      type: "tr",
      matchId: p.matchId,
      isSentence: p.isSentence,
    }));

    setArCards(shuffleArray(nextAr));
    setTrCards(shuffleArray(nextTr));
    setMatchedIds([]);
    setSelectedAr(null);
    setSelectedTr(null);
    setIsGameOver(false);
  };

  useEffect(() => {
    initGame();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vocabulary, dialogues, contentType, pairTarget]);

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

  if (arCards.length === 0) {
    return (
      <p className="text-center text-sm font-bold text-[var(--muted)] p-8">
        Eşleştirme oyunu için en az 4 öğe gerekiyor.
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
            {matchedIds.length} / {totalPairs} çift doğru eşleştirildi
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
    <div className="max-w-3xl mx-auto space-y-4">
      {/* ÜST DURUM ÇUBUĞU */}
      <div className="bg-[#F7EFE1] dark:bg-[var(--surface)] rounded-2xl border-2 border-[#E6D7BE] dark:border-[var(--border)] border-b-4 px-4 py-2.5 flex items-center justify-between gap-2">
        <span className="text-xs sm:text-sm font-extrabold text-[var(--foreground)] tabular-nums">
          Eşleşen: {matchedIds.length} / {totalPairs}
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

      {/* SÜTUN BAŞLIKLARI */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 px-1 text-[11px] font-extrabold uppercase tracking-wider text-[var(--muted)]">
        <div className="text-center">🇹🇷 Türkçe Anlam / Çeviri</div>
        <div className="text-center">🇸🇦 Arapça İfade / Kelime</div>
      </div>

      {/* İKİ SÜTUNLU SİMETRİK EŞİT BOYUTLU (auto-rows-fr items-stretch) 3B EŞLEŞTİRME IZGARASI */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 items-stretch auto-rows-fr">
        {trCards.map((trCard, idx) => {
          const arCard = arCards[idx];
          if (!arCard) return null;

          const isTrMatched = matchedIds.includes(trCard.matchId);
          const isTrSelected = selectedTr === trCard.id;

          const isArMatched = matchedIds.includes(arCard.matchId);
          const isArSelected = selectedAr === arCard.id;
          const isArWrong = wrongMatch === arCard.id;

          return (
            <div key={`${trCard.id}-${arCard.id}`} className="contents">
              {/* SOL SÜTUN: TÜRKÇE KART */}
              <button
                type="button"
                onClick={() =>
                  handleSelect(trCard.id, "tr", trCard.matchId, trCard.text)
                }
                disabled={isTrMatched}
                className={`relative w-full h-full min-h-[78px] sm:min-h-[88px] flex flex-col items-center justify-center text-center p-3 rounded-2xl border-2 border-b-4 transition-all font-extrabold text-xs sm:text-sm leading-snug cursor-pointer ${
                  isTrMatched
                    ? "bg-[#0CA678]/15 border-[#0CA678] text-[#087F5B] opacity-55"
                    : isTrSelected
                    ? "bg-[#F3F0FF] dark:bg-[var(--lavender-bg)] border-[#6741D9] text-[#4C28B5] -translate-y-0.5 shadow-sm"
                    : "bg-[#F7EFE1] dark:bg-[var(--surface)] border-[#E6D7BE] dark:border-[var(--border)] hover:border-[#6741D9] text-[var(--foreground)]"
                }`}
              >
                {isTrSelected && (
                  <span className="absolute top-2 right-2 w-5 h-5 rounded-full bg-[#6741D9] text-white flex items-center justify-center">
                    <Check size={11} strokeWidth={3} />
                  </span>
                )}
                <span className="line-clamp-3">{trCard.text}</span>
              </button>

              {/* SAĞ SÜTUN: ARAPÇA KART */}
              <button
                type="button"
                onClick={() =>
                  handleSelect(arCard.id, "ar", arCard.matchId, arCard.text)
                }
                disabled={isArMatched}
                className={`relative w-full h-full min-h-[78px] sm:min-h-[88px] flex flex-col items-center justify-center text-center p-3 rounded-2xl border-2 border-b-4 transition-all cursor-pointer ${
                  isArMatched
                    ? "bg-[#0CA678]/15 border-[#0CA678] text-[#087F5B] opacity-55"
                    : isArWrong
                    ? "bg-rose-50 border-rose-400 text-rose-800"
                    : isArSelected
                    ? "bg-[#F3F0FF] dark:bg-[var(--lavender-bg)] border-[#6741D9] text-[#4C28B5] -translate-y-0.5 shadow-sm"
                    : "bg-[#F7EFE1] dark:bg-[var(--surface)] border-[#E6D7BE] dark:border-[var(--border)] hover:border-[#6741D9] text-[var(--foreground)]"
                }`}
              >
                {isArSelected && (
                  <span className="absolute top-2 right-2 w-5 h-5 rounded-full bg-[#6741D9] text-white flex items-center justify-center">
                    <Check size={11} strokeWidth={3} />
                  </span>
                )}
                <div className="flex items-center justify-center gap-1.5">
                  <Volume2
                    size={13}
                    className="text-[#0CA678] opacity-70 shrink-0"
                  />
                  <span
                    dir="rtl"
                    className={`arabic font-bold leading-snug line-clamp-2 ${
                      arCard.isSentence
                        ? "text-lg sm:text-2xl"
                        : "text-2xl sm:text-3xl"
                    }`}
                  >
                    {formatAr(arCard.text)}
                  </span>
                </div>
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}