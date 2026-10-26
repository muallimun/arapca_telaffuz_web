"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { playSuccess, playError, playFanfare } from "@/lib/sfxManager";
import { motion, useAnimation } from "framer-motion";
import { Dialogue, DictionaryItem } from "@/types/data";
import { shuffleArray } from "@/lib/quiz";
import { XCircle, Trophy, RefreshCcw, Timer, AlertCircle } from "lucide-react";
import { useCountdown } from "@/lib/useTimer";

interface Props {
  dialogues: Dialogue[];
  vocabulary: DictionaryItem[];
  timeLimit: number | null;
}

function DraggableWord({ word, onDrop }: { word: string; onDrop: (word: string) => void }) {
  const controls = useAnimation();
  const [isDragging, setIsDragging] = useState(false);

  return (
    <motion.div
      drag
      dragSnapToOrigin={true}
      dragElastic={0.2}
      onDragStart={() => setIsDragging(true)}
      onDragEnd={(e, info) => {
        setIsDragging(false);
        if (info.offset.y < -50) onDrop(word);
        else controls.start({ x: 0, y: 0, transition: { type: "spring", stiffness: 300 } });
      }}
      animate={controls}
      whileDrag={{ scale: 1.1, zIndex: 50, cursor: "grabbing" }}
      className={`cursor-grab rounded-xl border-2 px-5 py-3 font-bold arabic text-2xl transition-colors select-none shadow-sm ${
        isDragging ? "bg-brand-100 border-brand-500 text-brand-800 shadow-xl" : "bg-[var(--surface)] border-[var(--border)] text-[var(--foreground)] hover:border-brand-400"
      }`}
    >
      {word}
    </motion.div>
  );
}

export default function FillInBlanks({ dialogues, vocabulary, timeLimit }: Props) {
  const fanfarePlayedRef = useRef(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [isFinished, setIsFinished] = useState(false);
  const [isTimeUp, setIsTimeUp] = useState(false);
  const [feedback, setFeedback] = useState<"correct" | "wrong" | null>(null);

  const handleTimeout = () => setIsTimeUp(true);
  const timeLeft = useCountdown(timeLimit, handleTimeout, !isFinished && !isTimeUp);

  const questions = useMemo(() => {
    const generated = [];
    for (const dlg of dialogues) {
      for (const line of dlg.satirlar) {
        const words = line.arapca.split(" ");
        const targetWord = words.find(w => w.length > 2 && vocabulary.some(v => w.includes(v.mufret || "___")));
        if (targetWord) {
          const cleanTarget = targetWord.replace(/[.,!?؟،]/g, "");
          const options = shuffleArray(vocabulary).filter(v => v.id !== targetWord).slice(0, 3).map(v => v.mufret || v.mazi || "");
          const allOptions = shuffleArray([cleanTarget, ...options]);
          const sentenceWithBlank = line.arapca.replace(targetWord, " [ ? ] ");
          generated.push({ sentenceWithBlank, correctWord: cleanTarget, options: allOptions, turkce: line.turkce });
        }
      }
    }
    return shuffleArray(generated).slice(0, 5);
  }, [dialogues, vocabulary]);

  useEffect(() => { setFeedback(null); }, [currentIndex]);
    useEffect(() => {
    if (isFinished && !fanfarePlayedRef.current) {
      fanfarePlayedRef.current = true;
      playFanfare();
    } else if (isTimeUp && !fanfarePlayedRef.current) {
      fanfarePlayedRef.current = true;
      playError();
    }
  }, [isFinished, isTimeUp]);

  if (questions.length === 0) return <p className="text-center p-10">Soru üretilemedi.</p>;

  const currentQ = questions[currentIndex];

    const handleDrop = (droppedWord: string) => {
    if (feedback || isTimeUp) return;
    if (droppedWord === currentQ.correctWord) {
      setFeedback("correct");
      setScore(s => s + 1);
      playSuccess();
      setTimeout(() => {
        if (currentIndex < questions.length - 1) setCurrentIndex(prev => prev + 1);
        else setIsFinished(true);
      }, 1500);
    } else {
      setFeedback("wrong");
      playError();
      setTimeout(() => setFeedback(null), 1000);
    }
  };

    const restart = () => {
    fanfarePlayedRef.current = false;
    setCurrentIndex(0);
    setScore(0);
    setIsFinished(false);
    setIsTimeUp(false);
    setFeedback(null);
  };

  if (isFinished || isTimeUp) {
    return (
      <div className="text-center py-16 space-y-6 animate-in zoom-in-95">
        <div className={`w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-6 ${isFinished ? 'bg-amber-100 text-amber-600' : 'bg-red-100 text-red-600'}`}>
          {isFinished ? <Trophy size={48} /> : <AlertCircle size={48} />}
        </div>
        <h3 className="text-3xl font-black text-[var(--foreground)]">{isFinished ? "Harika!" : "Süre Doldu!"}</h3>
        <p className="text-lg text-[var(--muted)]">{isFinished ? "Tüm boşlukları doldurdun." : `Süre bitti. ${score} doğru yaptın.`}</p>
        <button onClick={restart} className="bg-amber-600 text-white px-8 py-3 rounded-xl font-bold shadow-lg mx-auto mt-4 flex items-center gap-2">
          <RefreshCcw size={18} /> Tekrar Oyna
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto py-4 space-y-10">
      <div className="flex justify-between items-center bg-[var(--background)] p-4 rounded-2xl border border-[var(--border)]">
        <span className="font-bold text-[var(--muted)]">Soru {currentIndex + 1} / {questions.length}</span>
        {timeLeft !== null && (
          <div className={`flex items-center gap-1.5 px-3 py-1 rounded-lg font-black text-lg ${timeLeft <= 5 ? 'bg-red-100 text-red-600 animate-pulse' : 'bg-amber-100 text-amber-700'}`}>
            <Timer size={18} /> {timeLeft} sn
          </div>
        )}
        <span className="font-bold text-amber-700 bg-amber-100 px-4 py-1.5 rounded-xl">Doğru: {score}</span>
      </div>

      <div className={`text-center p-10 rounded-3xl border-2 transition-colors duration-500 shadow-sm ${feedback === "correct" ? "border-green-500 bg-green-50" : feedback === "wrong" ? "border-red-500 bg-red-50 animate-shake" : "border-[var(--border)] bg-[var(--surface)]"}`}>
        <div className="arabic text-4xl leading-[2] font-bold text-[var(--foreground)] flex flex-wrap justify-center items-center gap-2" dir="rtl">
          {currentQ.sentenceWithBlank.split("[ ? ]").map((part, i, arr) => (
            <span key={i} className="inline-flex items-center">
              {part}
              {i < arr.length - 1 && (
                <span className={`inline-block min-w-[120px] h-16 border-b-4 border-dashed mx-2 rounded-lg transition-all ${feedback === "correct" ? "border-green-500 bg-green-100 flex items-center justify-center" : "border-[var(--muted)]"}`}>
                  {feedback === "correct" && <span className="text-green-700 text-2xl">{currentQ.correctWord}</span>}
                </span>
              )}
            </span>
          ))}
        </div>
        <p className="mt-8 text-sm text-[var(--muted)]">{currentQ.turkce}</p>
      </div>

      <div className="flex flex-wrap justify-center gap-4 py-8">
        {currentQ.options.map((word, idx) => (
          <DraggableWord key={idx} word={word} onDrop={handleDrop} />
        ))}
      </div>
      
      {feedback === "wrong" && (
        <div className="text-center text-red-500 font-bold flex items-center justify-center gap-2 animate-in fade-in">
          <XCircle size={20} /> Yanlış kelime!
        </div>
      )}
    </div>
  );
}