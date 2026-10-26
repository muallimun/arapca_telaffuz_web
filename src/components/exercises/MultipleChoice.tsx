"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { playSuccess, playError, playFanfare } from "@/lib/sfxManager";
import { DictionaryItem } from "@/types/data";
import { generateMultipleChoiceOptions, shuffleArray } from "@/lib/quiz";
import { CheckCircle2, XCircle, RefreshCcw, Trophy, Timer, AlertCircle } from "lucide-react";
import { useCountdown } from "@/lib/useTimer";

interface Props {
  vocabulary: DictionaryItem[];
  timeLimit: number | null;
}

export default function MultipleChoice({ vocabulary, timeLimit }: Props) {
  const fanfarePlayedRef = useRef(false);
  const questions = useMemo(() => shuffleArray(vocabulary).slice(0, 10), [vocabulary]);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [options, setOptions] = useState<{ text: string; isCorrect: boolean }[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [score, setScore] = useState(0);
  const [isFinished, setIsFinished] = useState(false);
  const [isTimeUp, setIsTimeUp] = useState(false);

  const handleTimeout = () => setIsTimeUp(true);
  const timeLeft = useCountdown(timeLimit, handleTimeout, !isFinished && !isTimeUp);

  useEffect(() => {
    if (questions[currentIndex]) {
      setOptions(generateMultipleChoiceOptions(questions[currentIndex], vocabulary));
      setSelected(null);
    }
  }, [currentIndex, questions, vocabulary]);

  if (questions.length < 4) return <p className="text-center p-10">Yetersiz kelime.</p>;
	  useEffect(() => {
    if (isFinished && !fanfarePlayedRef.current) {
      fanfarePlayedRef.current = true;
      playFanfare();
    } else if (isTimeUp && !fanfarePlayedRef.current) {
      fanfarePlayedRef.current = true;
      playError();
    }
  }, [isFinished, isTimeUp]);
  const currentWord = questions[currentIndex];

    const handleSelect = (text: string, isCorrect: boolean) => {
    if (selected || isTimeUp) return;
    setSelected(text);
    if (isCorrect) {
      setScore(s => s + 1);
      playSuccess();
    } else {
      playError();
    }
  };

  const nextQuestion = () => {
    if (currentIndex < questions.length - 1) {
      setCurrentIndex(prev => prev + 1);
    } else {
      setIsFinished(true);
    }
  };

    const restart = () => {
    fanfarePlayedRef.current = false;
    setCurrentIndex(0);
    setScore(0);
    setIsFinished(false);
    setIsTimeUp(false);
    setSelected(null);
  };

  if (isFinished || isTimeUp) {
    return (
      <div className="text-center py-16 space-y-6 animate-in zoom-in-95">
        <div className={`w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-6 ${isFinished ? 'bg-brand-100 text-brand-700' : 'bg-red-100 text-red-600'}`}>
          {isFinished ? <Trophy size={48} /> : <AlertCircle size={48} />}
        </div>
        <h3 className="text-3xl font-black text-[var(--foreground)]">{isFinished ? "Test Bitti!" : "Süre Doldu!"}</h3>
        <p className="text-5xl font-black text-brand-600">{score} / {questions.length}</p>
        <button onClick={restart} className="bg-brand-700 text-white px-8 py-3 rounded-xl font-bold shadow-lg mx-auto mt-8 flex items-center gap-2">
          <RefreshCcw size={18} /> Tekrar Dene
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto py-4 space-y-8">
      <div className="flex justify-between items-center bg-[var(--background)] p-4 rounded-2xl border border-[var(--border)]">
        <span className="font-bold text-[var(--muted)]">Soru {currentIndex + 1} / {questions.length}</span>
        {timeLeft !== null && (
          <div className={`flex items-center gap-1.5 px-3 py-1 rounded-lg font-black text-lg ${timeLeft <= 5 ? 'bg-red-100 text-red-600 animate-pulse' : 'bg-amber-100 text-amber-700'}`}>
            <Timer size={18} /> {timeLeft} sn
          </div>
        )}
        <span className="font-bold text-brand-700 bg-brand-100 px-3 py-1 rounded-lg">Doğru: {score}</span>
      </div>

      <div className="text-center bg-gradient-to-b from-[var(--surface)] to-[var(--background)] p-10 rounded-3xl border border-[var(--border)]">
        <h3 className="arabic text-6xl font-bold text-brand-700 dark:text-brand-500">{currentWord.mufret || currentWord.mazi}</h3>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {options.map((opt, idx) => {
          const showCorrect = selected && opt.isCorrect;
          const showWrong = selected === opt.text && !opt.isCorrect;
          return (
            <button
              key={idx}
              onClick={() => handleSelect(opt.text, opt.isCorrect)}
              disabled={!!selected || isTimeUp}
              className={`p-5 rounded-2xl border-2 text-left font-bold text-lg transition-all duration-300 flex justify-between
                ${!selected ? "border-[var(--border)] bg-[var(--surface)] hover:border-brand-500" : ""}
                ${showCorrect ? "border-green-500 bg-green-50 text-green-700" : ""}
                ${showWrong ? "border-red-500 bg-red-50 text-red-700" : ""}
                ${selected && !opt.isCorrect && !showWrong ? "opacity-40" : ""}
              `}
            >
              <span>{opt.text}</span>
              {showCorrect && <CheckCircle2 className="text-green-500" />}
              {showWrong && <XCircle className="text-red-500" />}
            </button>
          );
        })}
      </div>

      {selected && (
        <div className="text-center pt-4 animate-in fade-in">
          <button onClick={nextQuestion} className="bg-brand-700 text-white px-10 py-4 rounded-xl font-bold shadow-xl text-lg hover:bg-brand-600">
            {currentIndex === questions.length - 1 ? "Testi Bitir" : "Sonraki Soru →"}
          </button>
        </div>
      )}
    </div>
  );
}