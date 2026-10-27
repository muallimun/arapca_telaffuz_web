"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import {
  playSuccess,
  playError,
  playFanfare,
  playClick,
} from "@/lib/sfxManager";
import { Dialogue, DictionaryItem } from "@/types/data";
import { shuffleArray } from "@/lib/quiz";
import {
  CheckCircle2,
  XCircle,
  RefreshCcw,
  Trophy,
  Timer,
  AlertCircle,
  Volume2,
  ArrowRight,
  MessageSquareQuote,
  BookOpen,
} from "lucide-react";
import { useCountdown } from "@/lib/useTimer";
import { speakHybrid, playTTS } from "@/lib/audio";
import { useSettings } from "@/store/settings";
import { useUserStore } from "@/store/userStore";
import { formatArabicText } from "@/lib/arabicTextUtils";

export type QuizContentType = "words" | "sentences" | "mixed";

interface QuizQuestionItem {
  id: string;
  kind: "word" | "sentence";
  arabic: string;
  turkish: string;
  metaLabel: string;
  wordId?: string;
  options: { text: string; isCorrect: boolean }[];
}

interface Props {
  vocabulary: DictionaryItem[];
  dialogues?: Dialogue[];
  contentType?: QuizContentType;
  timeLimit: number | null;
  questionCount?: number;
}

export default function MultipleChoice({
  vocabulary,
  dialogues = [],
  contentType = "words",
  timeLimit,
  questionCount = 10,
}: Props) {
  const fanfarePlayedRef = useRef(false);
  const [roundSeed, setRoundSeed] = useState(0);
  const { speechRate, showHareke, arabicFont } = useSettings();
  const { addStudyMinutes } = useUserStore();

  const questions: QuizQuestionItem[] = useMemo(() => {
    const wordPool: {
      id: string;
      arabic: string;
      turkish: string;
      metaLabel: string;
      wordId: string;
    }[] = vocabulary
      .map((w) => ({
        id: `w-${w.id}`,
        arabic: (w.mufret || w.mazi || "").split("/")[0].trim(),
        turkish: w.anlam_tr,
        metaLabel: `Tür: ${w.tur.toUpperCase()} · Kök: ${w.kok}`,
        wordId: w.id,
      }))
      .filter((w) => w.arabic.length > 0 && w.turkish.length > 0);

    const sentencePool: {
      id: string;
      arabic: string;
      turkish: string;
      metaLabel: string;
    }[] = [];

    dialogues.forEach((dlg) => {
      const dlgNum = dlg.id.replace("dlg_", "");
      dlg.satirlar.forEach((line) => {
        if (line.arapca.trim() && line.turkce.trim()) {
          sentencePool.push({
            id: `s-${dlg.id}-${line.sira}`,
            arabic: line.arapca.trim(),
            turkish: line.turkce.trim(),
            metaLabel: `Diyalog #${dlgNum}: ${dlg.baslik_tr} (${line.konusmaci})`,
          });
        }
      });
    });

    const buildWordQuestion = (
      target: (typeof wordPool)[number]
    ): QuizQuestionItem => {
      const distractors = shuffleArray(
        wordPool.filter(
          (w) => w.id !== target.id && w.turkish !== target.turkish
        )
      )
        .slice(0, 3)
        .map((d) => ({ text: d.turkish, isCorrect: false }));

      return {
        id: target.id,
        kind: "word",
        arabic: target.arabic,
        turkish: target.turkish,
        metaLabel: target.metaLabel,
        wordId: target.wordId,
        options: shuffleArray([
          { text: target.turkish, isCorrect: true },
          ...distractors,
        ]),
      };
    };

    const buildSentenceQuestion = (
      target: (typeof sentencePool)[number]
    ): QuizQuestionItem => {
      const distractors = shuffleArray(
        sentencePool.filter(
          (s) => s.id !== target.id && s.turkish !== target.turkish
        )
      )
        .slice(0, 3)
        .map((d) => ({ text: d.turkish, isCorrect: false }));

      return {
        id: target.id,
        kind: "sentence",
        arabic: target.arabic,
        turkish: target.turkish,
        metaLabel: target.metaLabel,
        options: shuffleArray([
          { text: target.turkish, isCorrect: true },
          ...distractors,
        ]),
      };
    };

    if (contentType === "sentences" && sentencePool.length >= 4) {
      return shuffleArray(sentencePool)
        .slice(0, questionCount)
        .map(buildSentenceQuestion);
    }

    if (
      contentType === "mixed" &&
      sentencePool.length >= 4 &&
      wordPool.length >= 4
    ) {
      const halfSentences = Math.ceil(questionCount / 2);
      const halfWords = questionCount - halfSentences;
      const pickedSentences = shuffleArray(sentencePool)
        .slice(0, halfSentences)
        .map(buildSentenceQuestion);
      const pickedWords = shuffleArray(wordPool)
        .slice(0, halfWords)
        .map(buildWordQuestion);
      return shuffleArray([...pickedSentences, ...pickedWords]);
    }

    return shuffleArray(wordPool)
      .slice(0, questionCount)
      .map(buildWordQuestion);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vocabulary, dialogues, contentType, questionCount, roundSeed]);

  const [currentIndex, setCurrentIndex] = useState(0);
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
    setSelected(null);
  }, [currentIndex, questions]);

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

  if (questions.length < 2) {
    return (
      <p className="text-center p-8 text-sm font-bold text-[var(--muted)]">
        Test oluşturmak için yeterli soru kaynağı bulunamadı.
      </p>
    );
  }

  const currentQuestion = questions[currentIndex] || questions[0];
  const displayArabic = formatArabicText(
    currentQuestion.arabic,
    showHareke,
    arabicFont
  );

  const handleListenQuestion = () => {
    playClick();
    if (currentQuestion.kind === "word" && currentQuestion.wordId) {
      speakHybrid({
        text: currentQuestion.arabic,
        wordId: currentQuestion.wordId,
        rate: speechRate,
      });
    } else {
      playTTS(currentQuestion.arabic, speechRate);
    }
  };

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
    <div className="max-w-2xl mx-auto space-y-4">
      {/* ÜST DURUM VE SÜRE ÇUBUĞU */}
      <div className="bg-[#F7EFE1] dark:bg-[var(--surface)] rounded-2xl border-2 border-[#E6D7BE] dark:border-[var(--border)] border-b-4 px-4 py-2.5 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-xs sm:text-sm font-extrabold text-[var(--foreground)] tabular-nums">
            Soru {currentIndex + 1} / {questions.length}
          </span>
          <span
            className={`px-2 py-0.5 rounded-lg text-[10px] font-extrabold inline-flex items-center gap-1 ${
              currentQuestion.kind === "sentence"
                ? "bg-[#F3F0FF] text-[#6741D9] border border-[#6741D9]/30"
                : "bg-[#E6FCF5] text-[#087F5B] border border-[#0CA678]/30"
            }`}
          >
            {currentQuestion.kind === "sentence" ? (
              <>
                <MessageSquareQuote size={11} />
                <span>Diyalog Cümlesi</span>
              </>
            ) : (
              <>
                <BookOpen size={11} />
                <span>Sözlük Kelimesi</span>
              </>
            )}
          </span>
        </div>

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
      <div className="bg-[#F7EFE1] dark:bg-[var(--surface)] rounded-2xl border-2 border-[#E6D7BE] dark:border-[var(--border)] border-b-4 p-4 sm:p-6 text-center space-y-3">
        <div className="flex items-center justify-between gap-2 text-xs font-bold text-[var(--muted)] border-b border-dashed border-[#E2D3B8] pb-2.5">
          <span className="text-left">
            {currentQuestion.kind === "sentence"
              ? "Aşağıdaki Arapça diyalog cümlesinin doğru Türkçe çevirisi hangisidir?"
              : "Aşağıdaki Arapça kelimenin Türkçe karşılığı nedir?"}
          </span>
          <button
            type="button"
            onClick={handleListenQuestion}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#0CA678] text-white font-bold border-b-2 border-[#087F5B] shrink-0 cursor-pointer"
          >
            <Volume2 size={14} />
            <span>Sesli Dinle</span>
          </button>
        </div>

        <h3
          dir="rtl"
          className={`arabic font-bold text-[#087F5B] dark:text-[#20c997] py-2 ${
            currentQuestion.kind === "sentence"
              ? "text-2xl sm:text-4xl leading-relaxed"
              : "text-4xl sm:text-6xl"
          }`}
        >
          {displayArabic}
        </h3>

        <p className="text-xs font-bold text-[var(--muted)]">
          {currentQuestion.metaLabel}
        </p>
      </div>

      {/* ŞIKLAR */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {currentQuestion.options.map((opt, idx) => {
          const showCorrect = Boolean(selected) && opt.isCorrect;
          const showWrong = selected === opt.text && !opt.isCorrect;

          return (
            <button
              key={idx}
              type="button"
              onClick={() => handleSelect(opt.text, opt.isCorrect)}
              disabled={Boolean(selected) || isTimeUp}
              className={`p-3.5 sm:p-4 rounded-2xl border-2 border-b-4 text-left font-extrabold text-xs sm:text-sm leading-snug transition-all flex items-center justify-between gap-2 cursor-pointer ${
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
          className="w-full py-3.5 px-6 bg-[#0CA678] hover:bg-[#099268] text-white font-bold text-sm sm:text-base rounded-2xl border-b-4 border-[#087F5B] active:border-b-0 active:translate-y-1 transition-all flex items-center justify-center gap-2 cursor-pointer"
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