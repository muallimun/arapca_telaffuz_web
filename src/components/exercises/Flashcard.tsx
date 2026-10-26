"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import { DictionaryItem } from "@/types/data";
import {
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Heart,
  Volume2,
  Mic,
} from "lucide-react";
import { useUserStore } from "@/store/userStore";
import { useSettings } from "@/store/settings";
import { playFlip, playClick } from "@/lib/sfxManager";
import { speakHybrid } from "@/lib/audio";
import { shuffleArray } from "@/lib/quiz";
import ShadowingModal from "@/components/ui/ShadowingModal";

interface Props {
  vocabulary: DictionaryItem[];
  questionCount?: number;
}

export default function Flashcard({ vocabulary, questionCount = 20 }: Props) {
  const deck = useMemo(
    () => shuffleArray(vocabulary).slice(0, questionCount),
    [vocabulary, questionCount]
  );

  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [coachOpen, setCoachOpen] = useState(false);

  const {
    toggleFavoriteWord,
    isWordFavorite,
    toggleLearnedWord,
    isWordLearned,
  } = useUserStore();
  const { speechRate, showHareke } = useSettings();

  const nextCard = useCallback(() => {
    if (deck.length === 0) return;
    playClick();
    setIsFlipped(false);
    setTimeout(
      () => setCurrentIndex((prev) => (prev + 1) % deck.length),
      120
    );
  }, [deck.length]);

  const prevCard = useCallback(() => {
    if (deck.length === 0) return;
    playClick();
    setIsFlipped(false);
    setTimeout(
      () => setCurrentIndex((prev) => (prev - 1 + deck.length) % deck.length),
      120
    );
  }, [deck.length]);

  // Klavye Kısayolları: Space (Çevir), ArrowRight (Sonraki), ArrowLeft (Önceki)
  useEffect(() => {
    if (coachOpen || deck.length === 0) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.code === "Space") {
        e.preventDefault();
        setIsFlipped((f) => !f);
        playFlip();
      } else if (e.code === "ArrowRight") {
        e.preventDefault();
        nextCard();
      } else if (e.code === "ArrowLeft") {
        e.preventDefault();
        prevCard();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [coachOpen, deck.length, nextCard, prevCard]);

  if (deck.length === 0) {
    return (
      <p className="text-center text-sm font-bold text-[var(--muted)] py-10">
        Seçilen aralıkta kelime bulunamadı.
      </p>
    );
  }

  const currentWord = deck[currentIndex % deck.length];
  const isFav = isWordFavorite(currentWord.id);
  const isLearned = isWordLearned(currentWord.id);
  const primaryArabic = currentWord.mufret || currentWord.mazi || "";
  const cleanArabic = primaryArabic.split("/")[0].trim();
  const removeTashkeel = (t: string) => t.replace(/[\u064B-\u0652]/g, "");
  const formatAr = (t: string) => (showHareke ? t : removeTashkeel(t));
  const displayArabic = formatAr(primaryArabic);

  const handleSpeak = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    playClick();
    speakHybrid({
      text: cleanArabic,
      wordId: currentWord.id,
      rate: speechRate,
    });
  };

  const prepareWordForms = (word: DictionaryItem) => {
    const forms: { label: string; arabic: string }[] = [];
    if (word.tur === "isim") {
      if (word.mufret)
        forms.push({
          label: "Müfret (Tekil)",
          arabic: word.mufret.split("/")[0].trim(),
        });
      if (word.cemi && word.cemi !== "-")
        forms.push({
          label: "Cemî (Çoğul)",
          arabic: word.cemi.split("/")[0].trim(),
        });
    } else if (word.tur === "fiil") {
      if (word.mazi)
        forms.push({
          label: "Mâzî (Geçmiş)",
          arabic: word.mazi.split("/")[0].trim(),
        });
      if (word.muzari)
        forms.push({
          label: "Muzâri (Şimdiki)",
          arabic: word.muzari.split("/")[0].trim(),
        });
      if (word.masdar)
        forms.push({
          label: "Masdar (İsim)",
          arabic: word.masdar.split("/")[0].trim(),
        });
    }
    return forms.length > 0 ? forms : undefined;
  };

  const wordForms = prepareWordForms(currentWord);

  return (
    <div className="flex flex-col items-center justify-center space-y-5 w-full max-w-lg mx-auto py-2">
      {coachOpen && (
        <ShadowingModal
          text={wordForms?.[0]?.arabic || cleanArabic}
          forms={wordForms}
          onClose={() => setCoachOpen(false)}
        />
      )}

      {/* ÜST İLERLEME SATIRI */}
      <div className="w-full bg-[#F7EFE1] dark:bg-[var(--surface)] rounded-2xl border-2 border-[#E6D7BE] dark:border-[var(--border)] border-b-4 px-4 py-2.5 flex items-center justify-between text-xs font-extrabold">
        <span className="text-[var(--muted)]">
          Kart{" "}
          <strong className="text-[var(--foreground)] tabular-nums">
            {currentIndex + 1} / {deck.length}
          </strong>
        </span>
        <span className="uppercase text-[#087F5B]">
          {currentWord.tur} · Kök: {currentWord.kok}
        </span>
      </div>

      {/* 3B DÖNEN KART ALANI */}
      <div
        className="relative w-full h-76 sm:h-80 cursor-pointer [perspective:1000px]"
        onClick={() => {
          setIsFlipped(!isFlipped);
          playFlip();
        }}
      >
        <div
          className={`relative w-full h-full transition-transform duration-500 [transform-style:preserve-3d] ${
            isFlipped ? "[transform:rotateY(180deg)]" : ""
          }`}
        >
          {/* ÖN YÜZ (Arapça) */}
          <div
            className={`absolute inset-0 [backface-visibility:hidden] rounded-2xl border-2 border-b-4 flex flex-col items-center justify-between p-5 sm:p-6 ${
              isLearned
                ? "bg-[#F3F0FF] dark:bg-[var(--lavender-bg)] border-[#6741D9]"
                : "bg-[#F7EFE1] dark:bg-[var(--surface)] border-[#E6D7BE] dark:border-[var(--border)]"
            }`}
          >
            {/* Üst Köşe Kontrolleri */}
            <div className="w-full flex flex-wrap items-center justify-between gap-1.5 border-b border-dashed border-[#E2D3B8] dark:border-[var(--border-dashed)] pb-3">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleFavoriteWord(currentWord);
                  playClick();
                }}
                className={`h-9 px-2.5 rounded-xl border-2 border-b-3 text-xs font-bold flex items-center gap-1 transition-all cursor-pointer ${
                  isFav
                    ? "bg-red-50 border-red-300 text-red-600"
                    : "bg-white dark:bg-[var(--background)] border-[#E6D7BE] text-[var(--muted)]"
                }`}
              >
                <Heart size={14} fill={isFav ? "currentColor" : "none"} />
                <span>{isFav ? "Kayıtlı" : "Kaydet"}</span>
              </button>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={handleSpeak}
                  className="h-9 px-3 rounded-xl bg-[#0CA678] hover:bg-[#099268] text-white border-b-3 border-[#087F5B] text-xs font-bold flex items-center gap-1 cursor-pointer"
                >
                  <Volume2 size={14} />
                  <span>Dinle</span>
                </button>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    playClick();
                    setCoachOpen(true);
                  }}
                  className="h-9 px-2.5 rounded-xl bg-[#F3F0FF] border-2 border-[#6741D9] border-b-3 text-xs font-extrabold text-[#6741D9] flex items-center gap-1 cursor-pointer"
                >
                  <Mic size={13} />
                  <span>Telaffuz</span>
                </button>
              </div>

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleLearnedWord(currentWord.id);
                  playClick();
                }}
                className={`h-9 px-2.5 rounded-xl border-2 border-b-3 text-xs font-bold flex items-center gap-1 transition-all cursor-pointer ${
                  isLearned
                    ? "bg-[#6741D9] border-[#5230B5] text-white"
                    : "bg-white dark:bg-[var(--background)] border-[#E6D7BE] text-[var(--muted)]"
                }`}
              >
                <CheckCircle2 size={14} />
                <span>{isLearned ? "Öğrendim" : "Öğren"}</span>
              </button>
            </div>

            {/* Orta Arapça Kelime */}
            <div className="my-auto text-center space-y-2">
              <span
                dir="rtl"
                className="arabic text-5xl sm:text-6xl font-bold text-[#087F5B] dark:text-[#20c997] block leading-relaxed"
              >
                {displayArabic}
              </span>
              {currentWord.cemi && currentWord.cemi !== "-" && (
                <span className="text-xs font-bold text-[var(--muted)] block">
                  Çoğul:{" "}
                  <strong className="arabic text-base text-[var(--foreground)]">
                    {formatAr(currentWord.cemi)}
                  </strong>
                </span>
              )}
              {currentWord.muzari && (
                <span className="text-xs font-bold text-[var(--muted)] block">
                  Muzâri:{" "}
                  <strong className="arabic text-base text-[var(--foreground)]">
                    {formatAr(currentWord.muzari)}
                  </strong>
                </span>
              )}
            </div>

            <div className="w-full pt-2.5 border-t border-dashed border-[#E2D3B8] text-center text-xs font-bold text-[var(--muted)] flex items-center justify-center gap-1.5">
              <RotateCcw size={13} />
              <span>Türkçe anlamını görmek için tıklayın veya Boşluk tuşuna basın</span>
            </div>
          </div>

          {/* ARKA YÜZ (Türkçe Anlamı) */}
          <div className="absolute inset-0 [backface-visibility:hidden] [transform:rotateY(180deg)] rounded-2xl bg-[#F3F0FF] dark:bg-[var(--lavender-bg)] border-2 border-[#6741D9] border-b-4 flex flex-col items-center justify-between p-6 text-center">
            <div className="w-full flex items-center justify-between border-b border-dashed border-[#6741D9]/30 pb-2.5 text-xs font-extrabold text-[#6741D9] dark:text-[#d0bfff]">
              <span>TÜRKÇE ANLAMI</span>
              <span className="arabic text-lg">{displayArabic}</span>
            </div>

            <div className="my-auto space-y-3">
              <p className="text-xl sm:text-2xl font-extrabold text-[var(--foreground)] leading-snug">
                {currentWord.anlam_tr}
              </p>
              <p className="text-xs font-bold text-[var(--muted)]">
                Tür: {currentWord.tur.toUpperCase()} · Kök:{" "}
                <span className="arabic text-base font-bold text-[#6741D9]">
                  {currentWord.kok}
                </span>
              </p>
            </div>

            <div className="w-full pt-2.5 border-t border-dashed border-[#6741D9]/30 text-xs font-bold text-[#6741D9] flex items-center justify-center gap-1.5">
              <RotateCcw size={13} />
              <span>Arapça yüzüne dönmek için tıklayın (Boşluk / ← →)</span>
            </div>
          </div>
        </div>
      </div>

      {/* ALT GEZİNME BUTONLARI */}
      <div className="flex items-center justify-between gap-3 w-full">
        <button
          type="button"
          onClick={prevCard}
          className="flex-1 py-3 px-4 rounded-2xl bg-[#F7EFE1] dark:bg-[var(--surface)] border-2 border-[#E6D7BE] dark:border-[var(--border)] border-b-4 text-xs font-extrabold text-[var(--foreground)] hover:border-[#0CA678] active:border-b-2 active:translate-y-0.5 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
        >
          <ChevronLeft size={18} />
          <span>Önceki Kart</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setIsFlipped(!isFlipped);
            playFlip();
          }}
          className="py-3 px-4 rounded-2xl bg-white dark:bg-[var(--background)] border-2 border-[#E6D7BE] dark:border-[var(--border)] border-b-4 text-xs font-extrabold text-[#6741D9] flex items-center justify-center gap-1.5 cursor-pointer"
        >
          <RotateCcw size={15} />
          <span>Çevir</span>
        </button>

        <button
          type="button"
          onClick={nextCard}
          className="flex-1 py-3 px-4 rounded-2xl bg-[#0CA678] hover:bg-[#099268] text-white border-b-4 border-[#087F5B] active:border-b-0 active:translate-y-1 transition-all text-xs font-extrabold flex items-center justify-center gap-1.5 cursor-pointer"
        >
          <span>Sonraki Kart</span>
          <ChevronRight size={18} />
        </button>
      </div>
    </div>
  );
}