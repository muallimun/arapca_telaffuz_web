"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import {
  playSuccess,
  playError,
  playFanfare,
  playClick,
} from "@/lib/sfxManager";
import { Dialogue, DictionaryItem } from "@/types/data";
import { shuffleArray } from "@/lib/quiz";
import {
  XCircle,
  Trophy,
  RefreshCcw,
  Timer,
  AlertCircle,
  Volume2,
  CheckCircle2,
} from "lucide-react";
import { useCountdown } from "@/lib/useTimer";
import { playTTS } from "@/lib/audio";
import { useSettings } from "@/store/settings";
import { useUserStore } from "@/store/userStore";

interface Props {
  dialogues: Dialogue[];
  vocabulary: DictionaryItem[];
  timeLimit: number | null;
  questionCount?: number;
}

export default function FillInBlanks({
  dialogues,
  vocabulary,
  timeLimit,
  questionCount = 10,
}: Props) {
  const fanfarePlayedRef = useRef(false);
  const [roundSeed, setRoundSeed] = useState(0);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [isFinished, setIsFinished] = useState(false);
  const [isTimeUp, setIsTimeUp] = useState(false);
  const [feedback, setFeedback] = useState<"correct" | "wrong" | null>(null);
  const [selectedWord, setSelectedWord] = useState<string | null>(null);

  const { speechRate, showHareke } = useSettings();
  const { addStudyMinutes } = useUserStore();
  const removeTashkeel = (t: string) => t.replace(/[\u064B-\u0652]/g, "");
  const formatAr = (t: string) => (showHareke ? t : removeTashkeel(t));

  const handleTimeout = () => setIsTimeUp(true);
  const timeLeft = useCountdown(
    timeLimit,
    handleTimeout,
    !isFinished && !isTimeUp
  );

  const questions = useMemo(() => {
    const generated: {
      sentenceWithBlank: string;
      fullArabic: string;
      correctWord: string;
      options: string[];
      turkce: string;
    }[] = [];

    const stripPunct = (w: string) =>
      w.replace(/[.,!?؟،؛:"'«»()]/g, "").trim();

    // Vocabulary havuzundaki kelimelerin harekeli ve harekesiz formları
    const vocabFormsSet = new Set<string>();
    for (const v of vocabulary) {
      const rawForms = [v.mufret, v.cemi, v.mazi, v.muzari, v.masdar];
      for (const f of rawForms) {
        if (!f || f === "-") continue;
        for (const part of f.split("/")) {
          const clean = stripPunct(part);
          if (clean.length > 1) {
            vocabFormsSet.add(clean);
            vocabFormsSet.add(removeTashkeel(clean));
          }
        }
      }
    }

    for (const dlg of dialogues) {
      for (const line of dlg.satirlar) {
        const words = line.arapca.split(/\s+/);
        const validCandidates = words.filter(
          (w) => stripPunct(w).length > 2
        );
        if (validCandidates.length === 0) continue;

        const vocabMatchedCandidates = validCandidates.filter((w) => {
          const clean = stripPunct(w);
          const bare = removeTashkeel(clean);
          const bareNoAl = bare.startsWith("ال") ? bare.slice(2) : bare;
          return (
            vocabFormsSet.has(clean) ||
            vocabFormsSet.has(bare) ||
            (bareNoAl.length > 2 && vocabFormsSet.has(bareNoAl))
          );
        });

        const candidatePool =
          vocabMatchedCandidates.length > 0
            ? vocabMatchedCandidates
            : validCandidates;
        const candidateWord = shuffleArray(candidatePool)[0];

        if (candidateWord) {
          const cleanTarget = stripPunct(candidateWord);
          const distractorWords = shuffleArray(vocabulary)
            .map((v) => (v.mufret || v.mazi || "").split("/")[0].trim())
            .filter((w) => w && w !== cleanTarget)
            .slice(0, 3);

          if (distractorWords.length === 3) {
            const allOptions = shuffleArray([
              cleanTarget,
              ...distractorWords,
            ]);
            const sentenceWithBlank = line.arapca.replace(
              candidateWord,
              " [ ? ] "
            );
            generated.push({
              sentenceWithBlank,
              fullArabic: line.arapca,
              correctWord: cleanTarget,
              options: allOptions,
              turkce: line.turkce,
            });
          }
        }
      }
    }
    return shuffleArray(generated).slice(0, questionCount);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dialogues, vocabulary, questionCount, roundSeed]);

  useEffect(() => {
    setFeedback(null);
    setSelectedWord(null);
  }, [currentIndex]);

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

  if (questions.length === 0) {
    return (
      <p className="text-center p-8 text-sm font-bold text-[var(--muted)]">
        Seçilen aralıkta boşluk doldurma sorusu üretilemedi.
      </p>
    );
  }

  const currentQ = questions[currentIndex];

  const handleChooseOption = (word: string) => {
    if (feedback === "correct" || isTimeUp) return;
    setSelectedWord(word);
    if (word === currentQ.correctWord) {
      setFeedback("correct");
      setScore((s) => s + 1);
      playSuccess();
      setTimeout(() => {
        if (currentIndex < questions.length - 1) {
          setCurrentIndex((prev) => prev + 1);
        } else {
          setIsFinished(true);
        }
      }, 1100);
    } else {
      setFeedback("wrong");
      playError();
      setTimeout(() => {
        setFeedback(null);
        setSelectedWord(null);
      }, 850);
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
    setFeedback(null);
    setSelectedWord(null);
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
            {isFinished ? "Boşluk Doldurma Tamamlandı!" : "Süre Doldu!"}
          </h3>
          <p className="text-xs font-semibold text-[var(--muted)]">
            {questions.length} cümleden {score} tanesini doğru tamamladınız
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
          <span>Yeniden Oyna</span>
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      {/* ÜST DURUM ÇUBUĞU */}
      <div className="bg-[#F7EFE1] dark:bg-[var(--surface)] rounded-2xl border-2 border-[#E6D7BE] dark:border-[var(--border)] border-b-4 px-4 py-3 flex items-center justify-between gap-2">
        <span className="text-xs sm:text-sm font-extrabold text-[var(--foreground)] tabular-nums">
          Cümle {currentIndex + 1} / {questions.length}
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

      {/* CÜMLE KARTI */}
      <div
        className={`rounded-2xl border-2 border-b-4 p-6 sm:p-8 text-center space-y-4 transition-all ${
          feedback === "correct"
            ? "bg-emerald-50 border-[#0CA678]"
            : feedback === "wrong"
            ? "bg-rose-50 border-rose-400"
            : "bg-[#F7EFE1] dark:bg-[var(--surface)] border-[#E6D7BE] dark:border-[var(--border)]"
        }`}
      >
        <div className="flex items-center justify-between border-b border-dashed border-[#E2D3B8] pb-2.5 text-xs font-bold text-[var(--muted)]">
          <span>Boşluğa uygun Arapça kelimeyi seçin</span>
          <button
            type="button"
            onClick={() => {
              playClick();
              playTTS(currentQ.fullArabic, speechRate);
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#0CA678] text-white font-bold border-b-2 border-[#087F5B] cursor-pointer"
          >
            <Volume2 size={14} />
            <span>Cümleyi Dinle</span>
          </button>
        </div>

        <div
          dir="rtl"
          className="arabic text-3xl sm:text-4xl leading-[2.1] font-bold text-[var(--foreground)] flex flex-wrap justify-center items-center gap-2 py-2"
        >
          {currentQ.sentenceWithBlank.split("[ ? ]").map((part, i, arr) => (
            <span key={i} className="inline-flex items-center flex-wrap gap-2">
              <span>{formatAr(part)}</span>
              {i < arr.length - 1 && (
                <span
                  className={`inline-flex items-center justify-center min-w-[120px] px-4 py-1 rounded-xl border-2 border-dashed mx-1 transition-all ${
                    feedback === "correct"
                      ? "border-[#0CA678] bg-[#0CA678] text-white"
                      : "border-[#6741D9] bg-[#F3F0FF] text-[#6741D9]"
                  }`}
                >
                  {feedback === "correct"
                    ? formatAr(currentQ.correctWord)
                    : "؟"}
                </span>
              )}
            </span>
          ))}
        </div>

        <p className="pt-3 border-t border-dashed border-[#E2D3B8] text-sm font-semibold text-[var(--muted)]">
          “{currentQ.turkce}”
        </p>
      </div>

      {/* KELİME SEÇENEKLERİ */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {currentQ.options.map((word, idx) => {
          const isChosen = selectedWord === word;
          const isRight = feedback === "correct" && word === currentQ.correctWord;
          const isWrong = feedback === "wrong" && isChosen;

          return (
            <button
              key={idx}
              type="button"
              onClick={() => handleChooseOption(word)}
              className={`py-4 px-3 rounded-2xl border-2 border-b-4 arabic text-2xl sm:text-3xl font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
                isRight
                  ? "bg-[#0CA678] border-[#087F5B] text-white"
                  : isWrong
                  ? "bg-rose-100 border-rose-400 text-rose-800"
                  : "bg-[#F7EFE1] dark:bg-[var(--surface)] border-[#E6D7BE] dark:border-[var(--border)] hover:border-[#6741D9] text-[var(--foreground)] active:border-b-2 active:translate-y-0.5"
              }`}
            >
              <span dir="rtl">{formatAr(word)}</span>
              {isRight && <CheckCircle2 size={18} className="shrink-0" />}
              {isWrong && <XCircle size={18} className="shrink-0" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}