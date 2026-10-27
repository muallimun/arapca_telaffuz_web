"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import {
  playSuccess,
  playError,
  playFanfare,
  playClick,
} from "@/lib/sfxManager";
import { DictionaryItem } from "@/types/data";
import { generateMultipleChoiceOptions, shuffleArray } from "@/lib/quiz";
import {
  CheckCircle2,
  XCircle,
  RefreshCcw,
  Trophy,
  Timer,
  AlertCircle,
  Volume2,
  ArrowRight,
} from "lucide-react";
import { useCountdown } from "@/lib/useTimer";
import { speakHybrid } from "@/lib/audio";
import { useSettings } from "@/store/settings";
import { useUserStore } from "@/store/userStore";
import { formatArabicText } from "@/lib/arabicTextUtils";

interface Props {
  vocabulary: DictionaryItem[];
  timeLimit: number | null;
  questionCount?: number;
}

export default function MultipleChoice({
  vocabulary,
  timeLimit,
  questionCount = 10,
}: Props) {
  const fanfarePlayedRef = useRef(false);
  const [roundSeed, setRoundSeed] = useState(0);
  const { speechRate, showHareke } = useSettings();
  const { addStudyMinutes } = useUserStore();

  const questions = useMemo(
    () => shuffleArray(vocabulary).slice(0, questionCount),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [vocabulary, questionCount, roundSeed]
  );

  const [currentIndex, setCurrentIndex] = useState(0);
  const [options, setOptions] = useState<{ text: string; isCorrect: boolean }[]>(
    []
  );
  const [selected, setSelected] = useState<string | null>(null);
  const [score, setScore] = useState(0);
  const [isFinished, setIsFinished] = useState(false);
  const [isTimeUp, setIsTimeUp] = useState(false);

  const handleTimeout = () => setIsTimeUp(true);
  const timeLeft = useCountdown(
    timeLimit,
    handleTimeout,
    !isFinished && !isTimeUp
  );

  useEffect(() => {
    if (questions[currentIndex]) {
      setOptions(
        generateMultipleChoiceOptions(questions[currentIndex], vocabulary)
      );
      setSelected(null);
    }
  }, [currentIndex, questions, vocabulary]);

  useEffect(() => {
    if (isFinished && !fanfarePlayedRef.current) {
      fanfarePlayedRef.current = true;
      addStudyMinutes(3);
      playFanfare();
    } else if (isTimeUp && !fanfarePlayedRef.current) {
      fanfarePlayedRef.current = true;
      playError();
    }
  }, [isFinished, isTimeUp, addStudyMinutes]);

  if (questions.length < 4) {
    return (
      <p className="text-center p-8 text-sm font-bold text-[var(--muted)]">
        Test oluşturmak için en az 4 kelime gerekiyor.
      </p>
    );
  }

  const currentWord = questions[currentIndex];
  const primaryArabic = currentWord.mufret || currentWord.mazi || "";
  const displayArabic = formatArabicText(primaryArabic, showHareke);

  const handleSelect = (text: string, isCorrect: boolean) => {
    if (selected || isTimeUp) return;
    setSelected(text);
    if (isCorrect) {
      setScore((s) => s + 1);
      playSuccess();
    } else {
      playError();
    }
  };

  const nextQuestion = () => {
    playClick();
    if (currentIndex < questions.length - 1) {
      setCurrentIndex((prev) => prev + 1);
    } else {
      setIsFinished(true);
    }
  };

  const restart = () => {
    playClick();
    fanfarePlayedRef.current = false;
    setRoundSeed((s) => s + 1);
    setCurrentIndex(0);
    setScore(0);
    setIsFinished(false);
    setIsTimeUp(false);
    setSelected(null);
  };

  if (isFinished || isTimeUp) {
    return (
      <div className="bg-[#F7EFE1] dark:bg-[var(--surface)] rounded-2xl border-2 border-[#E6D7BE] dark:border-[var(--border)] border-b-4 p-8 text-center space-y-5 max-w-lg mx-auto">
        <div
          className={`w-20 h-20 rounded-2xl border-2 border-b-4 flex items-center justify-center mx-auto ${
            isFinished
              ? "bg-[#F3F0FF] border-[#6741D9] text-[#6741D9]"
              : "bg-red-50 border-red-300 text-red-600"
          }`}
        >
          {isFinished ? <Trophy size={40} /> : <AlertCircle size={40} />}
        </div>

        <div className="space-y-1 border-b border-dashed border-[#E2D3B8] pb-4">
          <h3 className="text-2xl font-extrabold text-[var(--foreground)]">
            {isFinished ? "Çoktan Seçmeli Test Tamamlandı!" : "Süre Doldu!"}
          </h3>
          <p className="text-xs font-semibold text-[var(--muted)]">
            Toplam {questions.length} sorudan {score} doğru yanıt verdiniz
          </p>
        </div>

        <div className="text-4xl font-black tabular-nums text-[#087F5B]">
          {score} / {questions.length}
        </div>

        <button
          type="button"
          onClick={restart}
          className="w-full py-3.5 px-6 bg-[#0CA678] hover:bg-[#099268] text-white font-bold text-sm rounded-2xl border-b-4 border-[#087F5B] active:border-b-0 active:translate-y-1 transition-all flex items-center justify-center gap-2 cursor-pointer"
        >
          <RefreshCcw size={17} />
          <span>Yeni Test Başlat</span>
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      {/* ÜST DURUM VE SÜRE ÇUBUĞU */}
      <div className="bg-[#F7EFE1] dark:bg-[var(--surface)] rounded-2xl border-2 border-[#E6D7BE] dark:border-[var(--border)] border-b-4 px-4 py-3 flex items-center justify-between gap-2">
        <span className="text-xs sm:text-sm font-extrabold text-[var(--foreground)] tabular-nums">
          Soru {currentIndex + 1} / {questions.length}
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
            <span>{timeLeft} sn</span>
          </div>
        )}

        <span className="text-xs sm:text-sm font-extrabold text-[#087F5B] bg-white dark:bg-[var(--background)] border border-[#E6D7BE] px-3 py-1 rounded-xl tabular-nums">
          Doğru: {score}
        </span>
      </div>

      {/* SORU KARTI */}
      <div className="bg-[#F7EFE1] dark:bg-[var(--surface)] rounded-2xl border-2 border-[#E6D7BE] dark:border-[var(--border)] border-b-4 p-6 sm:p-8 text-center space-y-3">
        <div className="flex items-center justify-between text-xs font-bold text-[var(--muted)] border-b border-dashed border-[#E2D3B8] pb-2.5">
          <span>Aşağıdaki Arapça kelimenin Türkçe karşılığı nedir?</span>
          <button
            type="button"
            onClick={() => {
              playClick();
              speakHybrid({
                text: primaryArabic.split("/")[0].trim(),
                wordId: currentWord.id,
                rate: speechRate,
              });
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#0CA678] text-white font-bold border-b-2 border-[#087F5B] cursor-pointer"
          >
            <Volume2 size={14} />
            <span>Sesli Dinle</span>
          </button>
        </div>

        <h3
          dir="rtl"
          className="arabic text-5xl sm:text-6xl font-bold text-[#087F5B] dark:text-[#20c997] py-2"
        >
          {displayArabic}
        </h3>

        <p className="text-xs font-bold text-[var(--muted)]">
          Tür: {currentWord.tur.toUpperCase()} · Kök:{" "}
          <span className="arabic text-sm font-bold text-[var(--foreground)]">
            {currentWord.kok}
          </span>
        </p>
      </div>

      {/* ŞIKLAR */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
        {options.map((opt, idx) => {
          const showCorrect = Boolean(selected) && opt.isCorrect;
          const showWrong = selected === opt.text && !opt.isCorrect;

          return (
            <button
              key={idx}
              type="button"
              onClick={() => handleSelect(opt.text, opt.isCorrect)}
              disabled={Boolean(selected) || isTimeUp}
              className={`p-4 rounded-2xl border-2 border-b-4 text-left font-extrabold text-sm sm:text-base transition-all flex items-center justify-between gap-2 cursor-pointer ${
                !selected
                  ? "bg-[#F7EFE1] dark:bg-[var(--surface)] border-[#E6D7BE] dark:border-[var(--border)] hover:border-[#6741D9] text-[var(--foreground)]"
                  : showCorrect
                  ? "bg-emerald-50 border-[#0CA678] text-[#087F5B]"
                  : showWrong
                  ? "bg-rose-50 border-rose-400 text-rose-800"
                  : "bg-[#F7EFE1]/50 border-[#E6D7BE] text-[var(--muted)] opacity-60"
              }`}
            >
              <span>{opt.text}</span>
              {showCorrect && (
                <CheckCircle2 size={20} className="text-[#0CA678] shrink-0" />
              )}
              {showWrong && (
                <XCircle size={20} className="text-rose-600 shrink-0" />
              )}
            </button>
          );
        })}
      </div>

      {selected && (
        <button
          type="button"
          onClick={nextQuestion}
          className="w-full py-3.5 px-6 bg-[#0CA678] hover:bg-[#099268] text-white font-bold text-base rounded-2xl border-b-4 border-[#087F5B] active:border-b-0 active:translate-y-1 transition-all flex items-center justify-center gap-2 cursor-pointer"
        >
          <span>
            {currentIndex === questions.length - 1
              ? "Sonuçları Gör"
              : "Sonraki Soruya Geç"}
          </span>
          <ArrowRight size={18} />
        </button>
      )}
    </div>
  );
}