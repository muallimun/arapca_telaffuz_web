"use client";

import { useState, useMemo } from "react";
import { playClick } from "@/lib/sfxManager";
import Link from "next/link";
import { ChevronLeft, Settings, CheckCircle2, SlidersHorizontal, Timer } from "lucide-react";
import { diyaloglar } from "@/lib/data";
import { extractDialogueVocabulary } from "@/lib/dict";
import { DictionaryItem } from "@/types/data";

import Flashcard from "@/components/exercises/Flashcard";
import MultipleChoice from "@/components/exercises/MultipleChoice";
import MatchingGame from "@/components/exercises/MatchingGame";
import FillInBlanks from "@/components/exercises/FillInBlanks";

type ExerciseType = "flashcard" | "multiple-choice" | "matching" | "fill-in-blanks" | null;

export default function ExercisesPage() {
  const [startNum, setStartNum] = useState(1);
  const [endNum, setEndNum] = useState(10);
  const [exerciseType, setExerciseType] = useState<ExerciseType>(null);
  const [timeLimit, setTimeLimit] = useState<number | null>(60); // Varsayılan 60 sn

  const selectedDialogues = useMemo(() => {
    return diyaloglar.filter((dlg) => {
      const num = parseInt(dlg.id.replace("dlg_", ""));
      return num >= startNum && num <= endNum;
    });
  }, [startNum, endNum]);

  const combinedVocabulary = useMemo(() => {
    const allVocabMap = new Map<string, DictionaryItem>();
    selectedDialogues.forEach((dlg) => {
      const dlgVocab = extractDialogueVocabulary(dlg.satirlar.map(s => s.arapca));
      dlgVocab.forEach((word) => allVocabMap.set(word.id, word));
    });
    return Array.from(allVocabMap.values());
  }, [selectedDialogues]);

  const handleStart = (type: ExerciseType) => {
    playClick();
    if (combinedVocabulary.length < 4) {
      alert("Seçilen diyaloglarda yeterli kelime bulunamadı. Lütfen aralığı genişletin.");
      return;
    }
    setExerciseType(type);
  };

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Link href="/" className="p-2 rounded-full bg-[var(--surface)] border border-[var(--border)] hover:bg-[var(--border)] transition-colors">
            <ChevronLeft size={20} />
          </Link>
          <h1 className="text-2xl md:text-3xl font-extrabold text-brand-700">Alıştırma Merkezi</h1>
        </div>
      </div>

      {exerciseType === null ? (
        <div className="space-y-6 animate-in fade-in">
          
          {/* 1. KAYNAK VE SÜRE SEÇİMİ */}
          <section className="bg-[var(--surface)] border border-[var(--border)] rounded-3xl p-6 shadow-sm relative overflow-hidden">
            <div className="absolute top-0 left-0 w-1 h-full bg-brand-500"></div>
            
            <div className="flex flex-col md:flex-row gap-8">
              {/* Diyalog Aralığı */}
              <div className="flex-1">
                <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
                  <SlidersHorizontal className="text-brand-600 w-5 h-5" /> 1. Diyalog Aralığı
                </h2>
                <div className="flex items-center gap-3 bg-[var(--background)] p-3 rounded-2xl border border-[var(--border)] mb-3">
                  <input type="number" min="1" max="60" value={startNum} onChange={(e) => setStartNum(Number(e.target.value))} className="w-full p-2.5 rounded-xl border border-[var(--border)] bg-[var(--surface)] font-bold text-center focus:ring-2 focus:ring-brand-500 outline-none" />
                  <span className="text-[var(--muted)] font-bold">-</span>
                  <input type="number" min="1" max="60" value={endNum} onChange={(e) => setEndNum(Number(e.target.value))} className="w-full p-2.5 rounded-xl border border-[var(--border)] bg-[var(--surface)] font-bold text-center focus:ring-2 focus:ring-brand-500 outline-none" />
                </div>
                <div className="flex flex-wrap gap-2">
                  {[ [1,10], [11,20], [25,60], [1,60] ].map(([s, e]) => (
                    <button
                      key={`${s}-${e}`}
                      onClick={() => { playClick(); setStartNum(s); setEndNum(e); }}
                      className={`text-xs font-bold px-3 py-1.5 rounded-lg border transition-all ${startNum === s && endNum === e ? 'bg-brand-700 text-white border-brand-700' : 'bg-[var(--background)] border-[var(--border)] text-[var(--muted)]'}`}
                    >
                      {s === 1 && e === 60 ? "Tümü" : `${s}-${e}`}
                    </button>
                  ))}
                </div>
              </div>

              {/* Süre Seçimi */}
              <div className="flex-1">
                <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
                  <Timer className="text-amber-500 w-5 h-5" /> 2. Oyun Süresi
                </h2>
                <div className="flex flex-wrap gap-2">
                  {[null, 30, 60, 90, 120].map((t) => (
                    <button 
                      key={t ?? 'none'} 
                      onClick={() => { playClick(); setTimeLimit(t); }} 
                      className={`flex-1 min-w-[70px] py-3 rounded-xl border-2 font-bold transition-all ${timeLimit === t ? 'bg-amber-100 border-amber-500 text-amber-700' : 'bg-[var(--surface)] border-[var(--border)] text-[var(--muted)] hover:border-amber-300'}`}
                    >
                      {t === null ? "Süresiz" : `${t} sn`}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-6 text-sm text-brand-700 bg-brand-50 p-3 rounded-xl flex items-center gap-2 font-medium">
              <CheckCircle2 size={18} className="text-brand-600" /> 
              Havuz: <strong>{selectedDialogues.length} diyalog</strong>, <strong>{combinedVocabulary.length} kelime</strong>.
            </div>
          </section>

          {/* 2. ALIŞTIRMA TÜRÜ SEÇİMİ */}
          <section className="bg-[var(--surface)] border border-[var(--border)] rounded-3xl p-6 shadow-sm relative overflow-hidden">
            <div className="absolute top-0 left-0 w-1 h-full bg-amber-500"></div>
            <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
              <Settings className="text-amber-500 w-5 h-5" /> 3. Alıştırma Modülünü Seç
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <button onClick={() => handleStart("flashcard")} disabled={combinedVocabulary.length < 4} className="group p-6 rounded-2xl border border-[var(--border)] hover:border-brand-500 hover:shadow-xl transition-all text-left bg-gradient-to-br from-[var(--surface)] to-[var(--background)] disabled:opacity-50">
                <span className="block text-4xl mb-3 group-hover:scale-110 transition-transform origin-left">🎴</span>
                <h3 className="font-bold text-lg mb-1 group-hover:text-brand-700">Kelime Kartları</h3>
              </button>
              <button onClick={() => handleStart("multiple-choice")} disabled={combinedVocabulary.length < 4} className="group p-6 rounded-2xl border border-[var(--border)] hover:border-brand-500 hover:shadow-xl transition-all text-left bg-gradient-to-br from-[var(--surface)] to-[var(--background)] disabled:opacity-50">
                <span className="block text-4xl mb-3 group-hover:scale-110 transition-transform origin-left">✅</span>
                <h3 className="font-bold text-lg mb-1 group-hover:text-brand-700">Çoktan Seçmeli Test</h3>
              </button>
              <button onClick={() => handleStart("matching")} disabled={combinedVocabulary.length < 4} className="group p-6 rounded-2xl border border-[var(--border)] hover:border-brand-500 hover:shadow-xl transition-all text-left bg-gradient-to-br from-[var(--surface)] to-[var(--background)] disabled:opacity-50">
                <span className="block text-4xl mb-3 group-hover:scale-110 transition-transform origin-left">🔗</span>
                <h3 className="font-bold text-lg mb-1 group-hover:text-brand-700">Eşleştirme Oyunu</h3>
              </button>
              <button onClick={() => handleStart("fill-in-blanks")} disabled={selectedDialogues.length === 0} className="group p-6 rounded-2xl border border-[var(--border)] hover:border-brand-500 hover:shadow-xl transition-all text-left bg-gradient-to-br from-[var(--surface)] to-[var(--background)] disabled:opacity-50">
                <span className="block text-4xl mb-3 group-hover:scale-110 transition-transform origin-left">🎯</span>
                <h3 className="font-bold text-lg mb-1 group-hover:text-brand-700">Boşluk Doldurma</h3>
              </button>
            </div>
          </section>
        </div>
      ) : (
        /* OYUN EKRANI */
        <div className="space-y-4 animate-in slide-in-from-bottom-8 duration-500">
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-3 flex flex-wrap items-center justify-between gap-4 shadow-sm sticky top-16 z-40">
            <button onClick={() => { playClick(); setExerciseType(null); }} className="text-sm font-bold text-brand-600 bg-brand-50 hover:bg-brand-100 px-4 py-2 rounded-xl transition-colors flex items-center gap-2">
              <ChevronLeft size={16} /> Menüye Dön
            </button>
            <div className="flex items-center gap-2 text-xs font-bold text-[var(--muted)] bg-[var(--background)] px-3 py-1.5 rounded-lg border border-[var(--border)]">
              <span>KAYNAK: {startNum} - {endNum}</span>
              <span className="w-1 h-1 bg-[var(--muted)] rounded-full"></span>
              <span>{combinedVocabulary.length} KELİME</span>
            </div>
          </div>
          
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-3xl p-6 md:p-10 shadow-lg min-h-[500px]">
            {exerciseType === "flashcard" && <Flashcard vocabulary={combinedVocabulary} />}
            {exerciseType === "multiple-choice" && <MultipleChoice vocabulary={combinedVocabulary} timeLimit={timeLimit} />}
            {exerciseType === "matching" && <MatchingGame vocabulary={combinedVocabulary} timeLimit={timeLimit} />}
            {exerciseType === "fill-in-blanks" && <FillInBlanks dialogues={selectedDialogues} vocabulary={combinedVocabulary} timeLimit={timeLimit} />}
          </div>
        </div>
      )}
    </div>
  );
}