"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import { Dialogue, DictionaryItem } from "@/types/data";
import {
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Heart,
  Volume2,
  Mic,
  MessageSquareQuote,
  BookOpen,
  Trophy,
  Play,
  Target,
  X,
} from "lucide-react";
import { useUserStore } from "@/store/userStore";
import { useSettings } from "@/store/settings";
import { useAudioStore } from "@/store/audioStore";
import { playFlip, playClick, playFanfare } from "@/lib/sfxManager";
import {
  speakHybrid,
  loadAudioManifest,
  hasMp3,
  getMp3Path,
  VoiceOption,
} from "@/lib/audio";
import { shuffleArray } from "@/lib/quiz";
import ShadowingModal from "@/components/ui/ShadowingModal";
import { formatArabicText } from "@/lib/arabicTextUtils";
import { QuizContentType } from "./MultipleChoice";

export interface FlashcardItem {
  id: string;
  kind: "word" | "sentence";
  arabic: string;
  turkish: string;
  badgeText: string;
  subLabel?: string;
  wordItem?: DictionaryItem;
  dialogueId?: string;
  lineSira?: number;
  voice?: VoiceOption;
}

interface Props {
  vocabulary: DictionaryItem[];
  dialogues?: Dialogue[];
  contentType?: QuizContentType;
  questionCount?: number;
  onClose?: () => void;
}

export function getShortDialogueSentences(dialogues: Dialogue[]): FlashcardItem[] {
  const items: FlashcardItem[] = [];
  dialogues.forEach((dlg) => {
    const dlgNum = dlg.id.replace("dlg_", "");
    dlg.satirlar.forEach((line) => {
      const ar = line.arapca.trim();
      const tr = line.turkce.trim();
      if (!ar || !tr) return;
      const words = ar.split(/\s+/).filter(Boolean);
      if (words.length >= 2 && words.length <= 6) {
        items.push({
          id: `sent_${dlg.id}_${line.sira}`,
          kind: "sentence",
          arabic: ar,
          turkish: tr,
          badgeText: `💬 Diyalog #${dlgNum}: ${dlg.baslik_tr} · ${line.konusmaci}`,
          subLabel: `${line.konusmaci} (${line.konusmaci_ar})`,
          dialogueId: dlg.id,
          lineSira: line.sira,
          voice:
            line.cinsiyet === "K" ? "ar-SA-ZariyahNeural" : "ar-SA-HamedNeural",
        });
      }
    });
  });
  return items;
}

export default function Flashcard({
  vocabulary,
  dialogues = [],
  contentType = "words",
  questionCount = 20,
  onClose,
}: Props) {
  const [roundSeed, setRoundSeed] = useState(0);
  const [customDeck, setCustomDeck] = useState<FlashcardItem[] | null>(null);
  const [hardItems, setHardItems] = useState<FlashcardItem[]>([]);
  const [isFinished, setIsFinished] = useState(false);

  useEffect(() => {
    loadAudioManifest();
  }, []);

  const fullPool = useMemo(() => {
    const formatCatLabel = (tur: string) => {
      const t = (tur || "").toLowerCase();
      if (t === "ozel-isim") return "Özel İsim";
      if (t === "fiil") return "Fiil";
      if (t === "edat") return "Edat";
      return "İsim";
    };
    const wordCards: FlashcardItem[] = vocabulary
      .map((w) => ({
        id: `word_${w.id}`,
        kind: "word" as const,
        arabic: w.mufret || w.mazi || "",
        turkish: w.anlam_tr,
        badgeText:
          w.kok && w.kok !== "-"
            ? `${formatCatLabel(w.tur)} · Kök: ${w.kok}`
            : formatCatLabel(w.tur),
        wordItem: w,
      }))
      .filter((c) => c.arabic.trim().length > 0);

    const sentenceCards = getShortDialogueSentences(dialogues);

    if (contentType === "sentences") {
      return sentenceCards.length > 0 ? sentenceCards : wordCards;
    }
    if (contentType === "mixed") {
      if (sentenceCards.length > 0 && wordCards.length > 0) {
        const halfSent = Math.ceil(questionCount / 2);
        const halfWord = questionCount - halfSent;
        return [
          ...shuffleArray(sentenceCards).slice(0, halfSent),
          ...shuffleArray(wordCards).slice(0, halfWord),
        ];
      }
      return [...sentenceCards, ...wordCards];
    }
    return wordCards;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vocabulary, dialogues, contentType, questionCount, roundSeed]);

  const deck = useMemo(() => {
    if (customDeck && customDeck.length > 0) return customDeck;
    return shuffleArray(fullPool).slice(0, questionCount);
  }, [customDeck, fullPool, questionCount]);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [coachOpen, setCoachOpen] = useState(false);

  const {
    toggleFavoriteWord,
    isWordFavorite,
    toggleLearnedWord,
    isWordLearned,
    addStudyMinutes,
  } = useUserStore();
  const { speechRate, showHareke, arabicFont } = useSettings();
  const { playAudio, playTTS } = useAudioStore();

  const nextCard = useCallback(() => {
    if (deck.length === 0) return;
    playClick();
    setIsFlipped(false);
    if (currentIndex >= deck.length - 1) {
      setIsFinished(true);
      addStudyMinutes(2);
      playFanfare();
      return;
    }
    setTimeout(() => setCurrentIndex((prev) => prev + 1), 120);
  }, [deck.length, currentIndex, addStudyMinutes]);

  const prevCard = useCallback(() => {
    if (deck.length === 0) return;
    playClick();
    setIsFlipped(false);
    setTimeout(
      () => setCurrentIndex((prev) => (prev - 1 + deck.length) % deck.length),
      120
    );
  }, [deck.length]);

  useEffect(() => {
    if (coachOpen || deck.length === 0 || isFinished) return;
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
  }, [coachOpen, deck.length, isFinished, nextCard, prevCard]);

  if (deck.length === 0) {
    return (
      <p className="text-center text-sm font-bold text-[var(--muted)] py-10">
        Seçilen aralıkta kart bulunamadı.
      </p>
    );
  }

  // Sonuç / Bitiş Ekranı
  if (isFinished) {
    const masteredCount = Math.max(0, deck.length - hardItems.length);
    const pct = Math.round((masteredCount / deck.length) * 100);

    return (
      <div className="bg-[#F7EFE1] dark:bg-[var(--surface)] rounded-2xl border-2 border-[#E6D7BE] dark:border-[var(--border)] border-b-4 p-6 sm:p-8 text-center space-y-5 max-w-lg mx-auto">
        <div className="w-18 h-18 rounded-2xl bg-[#F3F0FF] border-2 border-b-4 border-[#6741D9] text-[#6741D9] flex items-center justify-center mx-auto">
          <Trophy size={36} />
        </div>

        <div className="space-y-1 border-b border-dashed border-[#E2D3B8] pb-4">
          <h3 className="text-xl sm:text-2xl font-extrabold text-[var(--foreground)]">
            Kart Turu Tamamlandı!
          </h3>
          <p className="text-xs font-semibold text-[var(--muted)]">
            Toplam {deck.length} kart incelendi · Başarı: %{pct}
          </p>
        </div>

        <div className="grid grid-cols-3 gap-2.5 text-center">
          <div className="bg-white dark:bg-[var(--background)] rounded-xl p-2.5 border border-[#E6D7BE]">
            <span className="block text-[10px] font-bold text-[var(--muted)] uppercase">
              Başarı
            </span>
            <span className="text-lg font-black text-[#6741D9] tabular-nums">
              %{pct}
            </span>
          </div>
          <div className="bg-emerald-50 dark:bg-emerald-950/40 rounded-xl p-2.5 border border-emerald-300">
            <span className="block text-[10px] font-bold text-emerald-700 uppercase">
              Öğrenilen
            </span>
            <span className="text-lg font-black text-emerald-700 tabular-nums">
              {masteredCount}
            </span>
          </div>
          <div className="bg-amber-50 dark:bg-amber-950/40 rounded-xl p-2.5 border border-amber-300">
            <span className="block text-[10px] font-bold text-amber-700 uppercase">
              Tekrar Listesi
            </span>
            <span className="text-lg font-black text-amber-700 tabular-nums">
              {hardItems.length}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
          <button
            type="button"
            onClick={() => {
              playClick();
              setCustomDeck(shuffleArray([...deck]));
              setCurrentIndex(0);
              setIsFlipped(false);
              setIsFinished(false);
            }}
            className="py-3 px-4 rounded-xl bg-white dark:bg-[var(--background)] border-2 border-[#E6D7BE] border-b-4 font-extrabold text-xs text-[var(--foreground)] hover:border-[#6741D9] flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <RotateCcw size={15} className="text-[#6741D9]" />
            <span>🔄 Tekrar Yap</span>
          </button>

          <button
            type="button"
            onClick={() => {
              playClick();
              setCustomDeck(null);
              setHardItems([]);
              setRoundSeed((s) => s + 1);
              setCurrentIndex(0);
              setIsFlipped(false);
              setIsFinished(false);
            }}
            className="py-3 px-4 rounded-xl bg-[#0CA678] hover:bg-[#099268] text-white border-b-4 border-[#087F5B] font-extrabold text-xs flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <Play size={15} fill="currentColor" />
            <span>▶️ Devam Et (Yeni Set)</span>
          </button>

          {hardItems.length > 0 && (
            <button
              type="button"
              onClick={() => {
                playClick();
                const retrySet = shuffleArray([...hardItems]);
                setCustomDeck(retrySet);
                setHardItems([]);
                setCurrentIndex(0);
                setIsFlipped(false);
                setIsFinished(false);
              }}
              className="sm:col-span-2 py-3 px-4 rounded-xl bg-amber-500 hover:bg-amber-600 text-white border-b-4 border-amber-700 font-extrabold text-xs flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Target size={15} />
              <span>🎯 Zorlandıklarımı Tekrarla ({hardItems.length})</span>
            </button>
          )}

          {onClose && (
            <button
              type="button"
              onClick={() => {
                playClick();
                onClose();
              }}
              className="sm:col-span-2 py-2.5 px-4 rounded-xl bg-slate-200/80 dark:bg-slate-800 text-[var(--muted)] hover:text-[var(--foreground)] font-extrabold text-xs flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <X size={15} />
              <span>✖️ Kapat / Alıştırma Merkezine Dön</span>
            </button>
          )}
        </div>
      </div>
    );
  }

  const currentCard = deck[currentIndex % deck.length];
  const currentWord = currentCard.wordItem;
  const isFav = currentWord ? isWordFavorite(currentWord.id) : false;
  const isLearned = currentWord ? isWordLearned(currentWord.id) : false;
  const isMarkedHard = hardItems.some((h) => h.id === currentCard.id);

  const primaryArabic = currentCard.arabic;
  const cleanArabic = primaryArabic.split("/")[0].trim();
  const formatAr = (t: string) => formatArabicText(t, showHareke, arabicFont);
  const displayArabic = formatAr(primaryArabic);

  const handleSpeak = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    playClick();
    if (
      currentCard.kind === "sentence" &&
      currentCard.dialogueId &&
      currentCard.lineSira !== undefined
    ) {
      speakHybrid({
        text: currentCard.arabic,
        rate: speechRate,
        voice: currentCard.voice,
        dialogueId: currentCard.dialogueId,
        lineSira: currentCard.lineSira,
      });
      return;
    }
    if (currentWord) {
      speakHybrid({
        text: cleanArabic,
        wordId: currentWord.id,
        rate: speechRate,
      });
    } else {
      speakHybrid({
        text: cleanArabic,
        rate: speechRate,
      });
    }
  };

  const prepareWordForms = (word?: DictionaryItem) => {
    if (!word) return undefined;
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
  const sentenceAudioUrl =
    currentCard.kind === "sentence" &&
    currentCard.dialogueId &&
    currentCard.lineSira !== undefined &&
    hasMp3(currentCard.dialogueId, currentCard.lineSira)
      ? getMp3Path(currentCard.dialogueId, currentCard.lineSira)
      : undefined;

  return (
    <div className="flex flex-col items-center justify-center space-y-4 w-full max-w-lg mx-auto py-1">
      {coachOpen && (
        <ShadowingModal
          text={wordForms?.[0]?.arabic || cleanArabic}
          refAudioUrl={sentenceAudioUrl}
          voice={currentCard.voice}
          forms={wordForms}
          onClose={() => setCoachOpen(false)}
        />
      )}

      {/* ÜST İLERLEME SATIRI */}
      <div className="w-full bg-[#F7EFE1] dark:bg-[var(--surface)] rounded-2xl border-2 border-[#E6D7BE] dark:border-[var(--border)] border-b-4 px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs font-extrabold">
        <div className="flex items-center gap-2">
          <span className="text-[var(--muted)]">
            Kart{" "}
            <strong className="text-[var(--foreground)] tabular-nums">
              {currentIndex + 1} / {deck.length}
            </strong>
          </span>
          <span
            className={`px-2 py-0.5 rounded-lg text-[10px] font-extrabold inline-flex items-center gap-1 ${
              currentCard.kind === "sentence"
                ? "bg-[#F3F0FF] text-[#6741D9] border border-[#6741D9]/30"
                : "bg-[#E6FCF5] text-[#087F5B] border border-[#0CA678]/30"
            }`}
          >
            {currentCard.kind === "sentence" ? (
              <>
                <MessageSquareQuote size={11} />
                <span>Kısa Cümle</span>
              </>
            ) : (
              <>
                <BookOpen size={11} />
                <span>Kelime</span>
              </>
            )}
          </span>
        </div>
        <span dir="ltr" className="text-[#087F5B] font-extrabold">
          {currentCard.badgeText}
        </span>
      </div>

      {/* 3B DÖNEN KART ALANI */}
      <div
        className="relative w-full h-72 sm:h-78 cursor-pointer [perspective:1000px]"
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
            className={`absolute inset-0 [backface-visibility:hidden] rounded-2xl border-2 border-b-4 flex flex-col items-center justify-between p-4 sm:p-6 ${
              isLearned
                ? "bg-[#F3F0FF] dark:bg-[var(--lavender-bg)] border-[#6741D9]"
                : "bg-[#F7EFE1] dark:bg-[var(--surface)] border-[#E6D7BE] dark:border-[var(--border)]"
            }`}
          >
            {/* Üst Köşe Kontrolleri — Tek Satırda Kompakt Dizilim */}
            <div className="w-full flex flex-wrap items-center justify-center sm:justify-between gap-1.5 border-b border-dashed border-[#E2D3B8] dark:border-[var(--border-dashed)] pb-2.5">
              {currentWord ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleFavoriteWord(currentWord);
                    playClick();
                  }}
                  className={`px-2.5 py-1 rounded-xl border-2 border-b-3 text-xs font-bold flex items-center gap-1 whitespace-nowrap shrink-0 transition-all cursor-pointer ${
                    isFav
                      ? "bg-red-50 border-red-300 text-red-600"
                      : "bg-white dark:bg-[var(--background)] border-[#E6D7BE] text-[var(--muted)]"
                  }`}
                >
                  <Heart size={13} fill={isFav ? "currentColor" : "none"} />
                  <span>{isFav ? "Kayıtlı" : "Kaydet"}</span>
                </button>
              ) : (
                <span className="px-2.5 py-1 rounded-xl bg-white dark:bg-[var(--background)] border border-[#E6D7BE] text-[11px] font-extrabold text-[#6741D9]">
                  {currentCard.badgeText}
                </span>
              )}

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={handleSpeak}
                  className="px-2.5 py-1 rounded-xl bg-[#0CA678] hover:bg-[#099268] text-white border-b-3 border-[#087F5B] text-xs font-bold flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Volume2 size={13} />
                  <span>Dinle</span>
                </button>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    playClick();
                    setCoachOpen(true);
                  }}
                  className="px-2.5 py-1 rounded-xl bg-[#F3F0FF] border-2 border-[#6741D9] border-b-3 text-xs font-extrabold text-[#6741D9] flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Mic size={13} />
                  <span>Telaffuz</span>
                </button>
              </div>

              {currentWord ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleLearnedWord(currentWord.id);
                    playClick();
                  }}
                  className={`px-2.5 py-1 rounded-xl border-2 border-b-3 text-xs font-bold flex items-center gap-1 whitespace-nowrap shrink-0 transition-all cursor-pointer ${
                    isLearned
                      ? "bg-[#6741D9] border-[#5230B5] text-white"
                      : "bg-white dark:bg-[var(--background)] border-[#E6D7BE] text-[var(--muted)]"
                  }`}
                >
                  <CheckCircle2 size={13} />
                  <span>{isLearned ? "Öğrendim" : "Öğren"}</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    playClick();
                    setHardItems((prev) =>
                      prev.some((h) => h.id === currentCard.id)
                        ? prev.filter((h) => h.id !== currentCard.id)
                        : [...prev, currentCard]
                    );
                  }}
                  className={`px-2.5 py-1 rounded-xl border-2 border-b-3 text-xs font-bold flex items-center gap-1 whitespace-nowrap shrink-0 transition-all cursor-pointer ${
                    isMarkedHard
                      ? "bg-amber-500 border-amber-700 text-white"
                      : "bg-white dark:bg-[var(--background)] border-[#E6D7BE] text-[var(--muted)]"
                  }`}
                >
                  <Target size={13} />
                  <span>{isMarkedHard ? "Tekrar Listesinde" : "Tekrara Ekle"}</span>
                </button>
              )}
            </div>

            {/* Orta Arapça Kelime veya Kısa Diyalog Cümlesi */}
            <div className="my-auto text-center space-y-2 px-2">
              <span
                dir="rtl"
                className={`arabic font-bold text-[#087F5B] dark:text-[#20c997] block leading-relaxed ${
                  currentCard.kind === "sentence"
                    ? "text-3xl sm:text-4xl"
                    : "text-5xl sm:text-6xl"
                }`}
              >
                {displayArabic}
              </span>
              {currentWord && currentWord.cemi && currentWord.cemi !== "-" && (
                <span className="text-xs font-bold text-[var(--muted)] block">
                  Çoğul:{" "}
                  <strong className="arabic text-base text-[var(--foreground)]">
                    {formatAr(currentWord.cemi)}
                  </strong>
                </span>
              )}
              {currentWord && currentWord.muzari && (
                <span className="text-xs font-bold text-[var(--muted)] block">
                  Muzâri:{" "}
                  <strong className="arabic text-base text-[var(--foreground)]">
                    {formatAr(currentWord.muzari)}
                  </strong>
                </span>
              )}
            </div>
          </div>

          {/* ARKA YÜZ (Türkçe Anlamı) */}
          <div className="absolute inset-0 [backface-visibility:hidden] [transform:rotateY(180deg)] rounded-2xl bg-[#F3F0FF] dark:bg-[var(--lavender-bg)] border-2 border-[#6741D9] border-b-4 flex flex-col items-center justify-between p-5 sm:p-6 text-center">
            <div className="w-full flex items-center justify-between border-b border-dashed border-[#6741D9]/30 pb-2.5 text-xs font-extrabold text-[#6741D9] dark:text-[#d0bfff]">
              <span>
                {currentCard.kind === "sentence"
                  ? "CÜMLENİN TÜRKÇE ÇEVİRİSİ"
                  : "TÜRKÇE ANLAMI"}
              </span>
              <span className="arabic text-lg truncate max-w-[220px]" dir="rtl">
                {displayArabic}
              </span>
            </div>

            <div className="my-auto space-y-3">
              <p className="text-xl sm:text-2xl font-extrabold text-[var(--foreground)] leading-snug">
                {currentCard.turkish}
              </p>
              <p className="text-xs font-bold text-[var(--muted)]">
                {currentCard.badgeText}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* KART İLE ALT BUTONLAR ARASINDA AYRI İPUCU SATIRI */}
      <div className="mt-2 mb-3 text-center text-xs font-bold text-[var(--muted)] flex items-center justify-center gap-1.5">
        <RotateCcw size={13} className="shrink-0 text-[#6741D9]" />
        <span>
          {isFlipped
            ? "Arapça yüzüne dönmek için tıklayın (Boşluk / ← →)"
            : "Türkçe anlamını görmek için tıklayın veya Boşluk tuşuna basın"}
        </span>
      </div>

      {/* ALT GEZİNME BUTONLARI */}
      <div className="flex items-center justify-between gap-2.5 w-full">
        <button
          type="button"
          onClick={prevCard}
          className="flex-1 py-3 px-4 rounded-2xl bg-[#F7EFE1] dark:bg-[var(--surface)] border-2 border-[#E6D7BE] dark:border-[var(--border)] border-b-4 text-xs font-extrabold text-[var(--foreground)] hover:border-[#0CA678] active:border-b-2 active:translate-y-0.5 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
        >
          <ChevronLeft size={18} />
          <span>Önceki</span>
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
          <span>
            {currentIndex === deck.length - 1 ? "Turu Tamamla" : "Sonraki"}
          </span>
          <ChevronRight size={18} />
        </button>
      </div>
    </div>
  );
}