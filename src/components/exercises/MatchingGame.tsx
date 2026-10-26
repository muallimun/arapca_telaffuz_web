"use client";

import { useState, useEffect, useRef } from "react";
import { playSuccess, playError, playFanfare } from "@/lib/sfxManager";
import { DictionaryItem } from "@/types/data";
import { shuffleArray } from "@/lib/quiz";
import { RotateCcw, Trophy, Timer, AlertCircle } from "lucide-react";
import { useCountdown } from "@/lib/useTimer";

interface Props {
  vocabulary: DictionaryItem[];
  timeLimit: number | null;
}

export default function MatchingGame({ vocabulary, timeLimit }: Props) {
  const fanfarePlayedRef = useRef(false);
  const [cards, setCards] = useState<{ id: string; text: string; type: "ar" | "tr"; matchId: string }[]>([]);
  const [selectedAr, setSelectedAr] = useState<string | null>(null);
  const [selectedTr, setSelectedTr] = useState<string | null>(null);
  const [matchedIds, setMatchedIds] = useState<string[]>([]);
  const [wrongMatch, setWrongMatch] = useState<string | null>(null);
  const [isGameOver, setIsGameOver] = useState(false);

  const isCompleted = matchedIds.length === cards.length / 2 && cards.length > 0;

  const handleTimeout = () => setIsGameOver(true);
  const timeLeft = useCountdown(timeLimit, handleTimeout, !isCompleted && !isGameOver);

  const initGame = () => {
    fanfarePlayedRef.current = false;
    if (vocabulary.length < 4) return;
    const selectedWords = shuffleArray(vocabulary).slice(0, 5);
    const newCards: { id: string; text: string; type: "ar" | "tr"; matchId: string }[] = [];
    selectedWords.forEach((w) => {
      newCards.push({ id: `ar-${w.id}`, text: w.mufret || w.mazi || "", type: "ar", matchId: w.id });
      newCards.push({ id: `tr-${w.id}`, text: w.anlam_tr, type: "tr", matchId: w.id });
    });
    setCards(shuffleArray(newCards));
    setMatchedIds([]);
    setSelectedAr(null);
    setSelectedTr(null);
    setIsGameOver(false);
  };

  useEffect(() => { initGame(); }, [vocabulary]);
    useEffect(() => {
    if (isCompleted && !fanfarePlayedRef.current) {
      fanfarePlayedRef.current = true;
      playFanfare();
    } else if (isGameOver && !fanfarePlayedRef.current) {
      fanfarePlayedRef.current = true;
      playError();
    }
  }, [isCompleted, isGameOver]);

  if (vocabulary.length < 4) return <p className="text-center text-[var(--muted)] p-10">Yetersiz kelime.</p>;

  const handleSelect = (id: string, type: "ar" | "tr", matchId: string) => {
    if (matchedIds.includes(matchId) || isCompleted || isGameOver) return;
    if (type === "ar") {
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
      setMatchedIds(prev => [...prev, arMatchId]);
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
      }, 600);
    }
  };

  if (isCompleted || isGameOver) {
    return (
      <div className="text-center py-16 space-y-6 animate-in zoom-in-95 duration-500">
        <div className={`w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-6 ${isCompleted ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}`}>
          {isCompleted ? <Trophy size={48} /> : <AlertCircle size={48} />}
        </div>
        <h3 className="text-3xl font-black text-[var(--foreground)]">{isCompleted ? "Muhteşem!" : "Süre Doldu!"}</h3>
        <p className="text-lg text-[var(--muted)]">{isCompleted ? "Tüm kelimeleri eşleştirdin." : `Süre bitti. ${matchedIds.length} eşleşme yaptın.`}</p>
        <button onClick={initGame} className="bg-brand-700 text-white px-8 py-3 rounded-xl font-bold shadow-lg hover:bg-brand-600 transition-all flex items-center gap-2 mx-auto mt-4">
          <RotateCcw size={18} /> Tekrar Oyna
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto py-4 space-y-8">
      {/* ÜST BİLGİ VE SAYAÇ */}
      <div className="flex justify-between items-center bg-[var(--background)] p-3 rounded-2xl border border-[var(--border)]">
        <span className="font-bold text-[var(--muted)] text-sm">Eşleşen: {matchedIds.length} / 5</span>
        
        {timeLeft !== null && (
          <div className={`flex items-center gap-1.5 px-3 py-1 rounded-lg font-black text-lg ${timeLeft <= 5 ? 'bg-red-100 text-red-600 animate-pulse' : 'bg-amber-100 text-amber-700'}`}>
            <Timer size={18} /> 00:{timeLeft.toString().padStart(2, '0')}
          </div>
        )}

        <button onClick={initGame} className="text-sm font-bold text-brand-600 hover:text-brand-800 flex items-center gap-1">
          <RotateCcw size={14} /> Yeniden
        </button>
      </div>

      {/* EŞLEŞTİRME ALANI (DENGELİ) */}
      <div className="grid grid-cols-2 gap-3 md:gap-6">
        {/* ARAPÇA SÜTUNU */}
        <div className="flex flex-col gap-3 md:gap-4">
          {cards.filter(c => c.type === "ar").map(card => {
            const isMatched = matchedIds.includes(card.matchId);
            const isSelected = selectedAr === card.id;
            const isWrong = wrongMatch === card.id;
            return (
              <button
                key={card.id}
                onClick={() => handleSelect(card.id, "ar", card.matchId)}
                disabled={isMatched}
                className={`w-full min-h-[5rem] h-full flex items-center justify-center p-3 rounded-2xl border-2 transition-all duration-300 arabic text-2xl md:text-3xl font-bold shadow-sm
                  ${isMatched ? "bg-[var(--background)] border-transparent text-[var(--muted)] opacity-30 scale-95" : ""}
                  ${isSelected ? "border-brand-500 bg-brand-50 scale-[1.02] shadow-md ring-2 ring-brand-500/20" : "border-[var(--border)] bg-[var(--surface)] hover:border-brand-400 hover:-translate-y-1"}
                  ${isWrong ? "border-red-500 bg-red-50 animate-shake" : ""}
                `}
              >
                {card.text}
              </button>
            );
          })}
        </div>

        {/* TÜRKÇE SÜTUNU */}
        <div className="flex flex-col gap-3 md:gap-4">
          {cards.filter(c => c.type === "tr").map(card => {
            const isMatched = matchedIds.includes(card.matchId);
            const isSelected = selectedTr === card.id;
            return (
              <button
                key={card.id}
                onClick={() => handleSelect(card.id, "tr", card.matchId)}
                disabled={isMatched}
                className={`w-full min-h-[5rem] h-full flex items-center justify-center text-center p-3 rounded-2xl border-2 transition-all duration-300 font-semibold text-sm md:text-base shadow-sm leading-tight
                  ${isMatched ? "bg-[var(--background)] border-transparent text-[var(--muted)] opacity-30 scale-95" : ""}
                  ${isSelected ? "border-brand-500 bg-brand-50 scale-[1.02] shadow-md ring-2 ring-brand-500/20" : "border-[var(--border)] bg-[var(--surface)] hover:border-brand-400 hover:-translate-y-1"}
                `}
              >
                {card.text}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}