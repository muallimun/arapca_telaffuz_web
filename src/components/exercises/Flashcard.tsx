"use client";

import { useState } from "react";
import { DictionaryItem } from "@/types/data";
import { RotateCcw, ChevronLeft, ChevronRight, CheckCircle2, Heart } from "lucide-react";
import { useUserStore } from "@/store/userStore";
import { playFlip, playClick } from "@/lib/sfxManager";

interface Props {
  vocabulary: DictionaryItem[];
}

export default function Flashcard({ vocabulary }: Props) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  
  const { toggleFavoriteWord, isWordFavorite, toggleLearnedWord, isWordLearned } = useUserStore();

  if (vocabulary.length === 0) return <p className="text-center text-[var(--muted)]">Bu diyalogda kelime bulunamadı.</p>;

  const currentWord = vocabulary[currentIndex];
  const isFav = isWordFavorite(currentWord.id);
  const isLearned = isWordLearned(currentWord.id);

  const nextCard = () => {
    playClick();
    setIsFlipped(false);
    setTimeout(() => setCurrentIndex((prev) => (prev + 1) % vocabulary.length), 150);
  };

  const prevCard = () => {
    playClick();
    setIsFlipped(false);
    setTimeout(() => setCurrentIndex((prev) => (prev - 1 + vocabulary.length) % vocabulary.length), 150);
  };

  return (
    <div className="flex flex-col items-center justify-center space-y-6 w-full max-w-md mx-auto py-4">
      
      {/* KART ALANI */}
      <div 
        className="relative w-full h-72 cursor-pointer [perspective:1000px]"
        onClick={() => { setIsFlipped(!isFlipped); playFlip(); }}
      >
        <div className={`relative w-full h-full transition-transform duration-500 [transform-style:preserve-3d] ${isFlipped ? "[transform:rotateY(180deg)]" : ""}`}>
          
          {/* ÖN YÜZ (Arapça) */}
          <div className={`absolute inset-0 [backface-visibility:hidden] rounded-3xl bg-[var(--surface)] border-2 shadow-xl flex flex-col items-center justify-center p-6 bg-gradient-to-br from-brand-50 to-white dark:from-slate-800 dark:to-slate-900 ${isLearned ? 'border-green-500' : 'border-brand-500'}`}>
            
            {/* Köşe İkonları */}
            <div className="absolute top-4 left-4 right-4 flex justify-between">
              <button 
                onClick={(e) => { e.stopPropagation(); toggleFavoriteWord(currentWord); playClick(); }}
                className={`p-2 rounded-full transition-colors ${isFav ? "text-red-500 bg-red-50" : "text-[var(--muted)] hover:bg-white/50"}`}
              >
                <Heart size={20} fill={isFav ? "currentColor" : "none"} />
              </button>
              
              <button 
                onClick={(e) => { e.stopPropagation(); toggleLearnedWord(currentWord.id); playClick(); }}
                className={`p-2 rounded-full transition-colors ${isLearned ? "text-green-600 bg-green-100" : "text-[var(--muted)] hover:bg-white/50"}`}
              >
                <CheckCircle2 size={20} fill={isLearned ? "currentColor" : "none"} />
              </button>
            </div>

            <span className="arabic text-6xl font-bold text-brand-700 dark:text-brand-500 mb-4">{currentWord.mufret || currentWord.mazi}</span>
            <span className="text-sm text-[var(--muted)] animate-pulse">Çevirmek için tıkla</span>
          </div>

          {/* ARKA YÜZ (Türkçe) */}
          <div className="absolute inset-0 [backface-visibility:hidden] [transform:rotateY(180deg)] rounded-3xl bg-brand-700 border-2 border-brand-700 shadow-xl flex flex-col items-center justify-center p-6 text-white text-center">
            <span className="text-3xl font-bold mb-4">{currentWord.anlam_tr}</span>
            <div className="text-sm opacity-80 space-y-1">
              <p>Tür: {currentWord.tur}</p>
              <p className="arabic text-lg mt-2">Kök: {currentWord.kok}</p>
            </div>
          </div>

        </div>
      </div>

      {/* KONTROLLER */}
      <div className="flex items-center justify-between w-full px-4">
        <button onClick={prevCard} className="p-3 rounded-full bg-[var(--surface)] border border-[var(--border)] hover:bg-brand-50 transition-colors shadow-sm">
          <ChevronLeft className="w-6 h-6 text-brand-700" />
        </button>
        
        <span className="text-sm font-bold text-[var(--muted)] tracking-widest">
          {currentIndex + 1} / {vocabulary.length}
        </span>

        <button onClick={nextCard} className="p-3 rounded-full bg-[var(--surface)] border border-[var(--border)] hover:bg-brand-50 transition-colors shadow-sm">
          <ChevronRight className="w-6 h-6 text-brand-700" />
        </button>
      </div>
      <button onClick={() => { setIsFlipped(!isFlipped); playFlip(); }} className="flex items-center gap-2 text-sm font-medium text-brand-600 hover:text-brand-800 mt-2">
        <RotateCcw size={16} /> Kartı Çevir
      </button>
    </div>
  );
}