"use client";

import { useState, useRef, useEffect } from "react";
import { Volume2, Heart, CheckCircle2, X, Sparkles, Mic } from "lucide-react";
import { analyzeAndMatchWord } from "@/lib/dict";
import { useSettings } from "@/store/settings";
import { useUserStore } from "@/store/userStore";
import { speakHybrid } from "@/lib/audio";
import { playClick } from "@/lib/sfxManager";
import ShadowingModal, { TargetForm } from "@/components/ui/ShadowingModal";
import { DictionaryItem } from "@/types/data";

interface Props {
  text: string;
}

function buildWordForms(item: DictionaryItem): TargetForm[] {
  const forms: TargetForm[] = [];
  if (item.mufret) {
    forms.push({
      label: "Müfret (Tekil)",
      arabic: item.mufret.split("/")[0].trim(),
    });
  }
  if (item.cemi && item.cemi !== "-") {
    forms.push({
      label: "Cemî (Çoğul)",
      arabic: item.cemi.split("/")[0].trim(),
    });
  }
  if (item.mazi) {
    forms.push({
      label: "Mâzî (Geçmiş)",
      arabic: item.mazi.split("/")[0].trim(),
    });
  }
  if (item.muzari) {
    forms.push({
      label: "Muzâri (Geniş)",
      arabic: item.muzari.split("/")[0].trim(),
    });
  }
  if (item.masdar) {
    forms.push({
      label: "Masdar",
      arabic: item.masdar.split("/")[0].trim(),
    });
  }
  return forms;
}

export default function WordTooltip({ text }: Props) {
  const { showTooltips, showHareke, speechRate } = useSettings();
  const {
    toggleFavoriteWord,
    isWordFavorite,
    toggleLearnedWord,
    isWordLearned,
  } = useUserStore();

  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [alignMode, setAlignMode] = useState<"center" | "left" | "right">(
    "center"
  );
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [coachTarget, setCoachTarget] = useState<{
    text: string;
    forms: TargetForm[];
  } | null>(null);

  const containerRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setActiveIndex(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  if (!showTooltips) return <>{text}</>;

  const removeTashkeel = (str: string) => str.replace(/[\u064B-\u0652]/g, "");
  const formatAr = (str: string) => (showHareke ? str : removeTashkeel(str));

  const words = text.split(" ");

  return (
    <>
      {coachTarget && (
        <ShadowingModal
          text={coachTarget.text}
          forms={coachTarget.forms}
          onClose={() => setCoachTarget(null)}
        />
      )}

      <span ref={containerRef} className="inline">
        {words.map((word, index) => {
          const match = word.match(
            /^([.,!?؟،؛:"'()\[\]{}]*)([\u0600-\u06FF]+)([.,!?؟،؛:"'()\[\]{}]*)$/
          );

          if (!match) return <span key={index}>{word} </span>;

          const [, prefix, coreWord, suffix] = match;
          const analysis = analyzeAndMatchWord(coreWord);

          if (!analysis) {
            return <span key={index}>{word} </span>;
          }

          const { item: dictItem, morphologyNote } = analysis;
          const isOpen = activeIndex === index;
          const isFav = isWordFavorite(dictItem.id);
          const isLearned = isWordLearned(dictItem.id);
          const primaryAr = dictItem.mufret || dictItem.mazi || coreWord;

          const handlePlayWord = async (
            e: React.MouseEvent,
            arabicToSpeak?: string
          ) => {
            e.stopPropagation();
            playClick();
            setIsSpeaking(true);
            try {
              await speakHybrid({
                text: (arabicToSpeak || primaryAr).split("/")[0].trim(),
                wordId: arabicToSpeak ? undefined : dictItem.id,
                rate: speechRate,
                voice: "male",
              });
            } finally {
              setIsSpeaking(false);
            }
          };

          const handleWordClick = (e: React.MouseEvent<HTMLButtonElement>) => {
            e.stopPropagation();
            playClick();
            if (isOpen) {
              setActiveIndex(null);
              return;
            }
            // Ekran kenarı taşma koruması: Tıklanan kelimenin ekran içindeki yatay konumunu ölç
            const rect = e.currentTarget.getBoundingClientRect();
            const vw = typeof window !== "undefined" ? window.innerWidth : 1024;
            if (rect.left < 155) {
              setAlignMode("left");
            } else if (rect.right > vw - 155) {
              setAlignMode("right");
            } else {
              setAlignMode("center");
            }
            setActiveIndex(index);
          };

          const positionClasses =
            alignMode === "left"
              ? "left-0 translate-x-0"
              : alignMode === "right"
              ? "right-0 translate-x-0"
              : "left-1/2 -translate-x-1/2";

          return (
            <span key={index} className="relative inline-block mx-0.5">
              {prefix}
              <button
                type="button"
                onClick={handleWordClick}
                className={`cursor-pointer rounded-lg px-1 transition-all border-b-2 border-dashed ${
                  isOpen
                    ? "bg-[#F3F0FF] dark:bg-[var(--lavender-bg)] text-[#6741D9] dark:text-[#d0bfff] border-[#6741D9]"
                    : "border-[#0CA678]/65 hover:bg-[#0CA678]/10 hover:text-[#087F5B]"
                }`}
              >
                {formatAr(coreWord)}
              </button>
              {suffix}

              {/* 3B Dokunsal Morfolojik Sözlük İpucu Kartı (Ekran Kenarı Korumalı) */}
              {isOpen && (
                <span
                  dir="ltr"
                  onClick={(e) => e.stopPropagation()}
                  className={`absolute bottom-full ${positionClasses} mb-2.5 w-72 sm:w-80 max-w-[90vw] p-3.5 bg-[#F7EFE1] dark:bg-[var(--surface)] border-2 border-[#E6D7BE] dark:border-[var(--border)] border-b-4 rounded-2xl shadow-2xl text-left z-50 block space-y-2`}
                >
                  {/* Üst Satır: Diyalogdaki Hali + Sözlükteki Yalın Hali + Kapat */}
                  <span className="flex items-start justify-between gap-2 border-b border-dashed border-[#E2D3B8] dark:border-[var(--border-dashed)] pb-2">
                    <span className="space-y-0.5">
                      <span className="block text-[10px] font-extrabold uppercase tracking-wider text-[#087F5B] dark:text-[#20c997]">
                        {dictItem.tur.toUpperCase()} · KÖK: {dictItem.kok}
                      </span>
                      <span className="block text-xs font-extrabold text-[var(--foreground)] leading-snug">
                        {dictItem.anlam_tr}
                      </span>
                    </span>

                    <span className="flex items-center gap-1.5 shrink-0">
                      <span className="text-right">
                        <span
                          dir="rtl"
                          className="arabic text-2xl font-bold text-[#087F5B] dark:text-[#20c997] block leading-none"
                        >
                          {formatAr(primaryAr)}
                        </span>
                        {coreWord !== primaryAr && (
                          <span
                            dir="rtl"
                            className="arabic text-xs font-bold text-[#6741D9] block mt-0.5"
                          >
                            Metinde: {formatAr(coreWord)}
                          </span>
                        )}
                      </span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveIndex(null);
                        }}
                        className="w-6 h-6 rounded-lg bg-white dark:bg-[var(--background)] border border-[#E6D7BE] flex items-center justify-center text-[var(--muted)] hover:text-[var(--foreground)] cursor-pointer"
                      >
                        <X size={12} />
                      </button>
                    </span>
                  </span>

                  {/* Morfolojik Çözümleme Notu (Ön ek + Gövde + Zamir/Ek) */}
                  {morphologyNote && (
                    <span className="block bg-white dark:bg-[var(--background)] rounded-xl px-2.5 py-1.5 border border-[#E6D7BE] text-[11px] font-bold text-[#4C28B5] dark:text-[#d0bfff]">
                      <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-[#6741D9] block mb-0.5">
                        <Sparkles size={10} />
                        <span>Morfolojik Çözümleme:</span>
                      </span>
                      <span dir="rtl" className="block text-right leading-snug">
                        {morphologyNote}
                      </span>
                    </span>
                  )}

                  {/* Sözlük Künyesi: Müfret/Cemi veya Mazi/Muzari/Masdar */}
                  <span className="flex flex-wrap items-center justify-between gap-1.5 text-[11px] py-1 border-b border-dashed border-[#E2D3B8] dark:border-[var(--border-dashed)] text-[var(--muted)]">
                    {dictItem.mufret && (
                      <span>
                        Müfret:{" "}
                        <strong className="arabic text-sm text-[var(--foreground)]">
                          {formatAr(dictItem.mufret)}
                        </strong>
                      </span>
                    )}
                    {dictItem.cemi && dictItem.cemi !== "-" && (
                      <span>
                        Cemî:{" "}
                        <strong className="arabic text-sm text-[var(--foreground)]">
                          {formatAr(dictItem.cemi)}
                        </strong>
                      </span>
                    )}
                    {dictItem.mazi && (
                      <span>
                        Mâzî:{" "}
                        <strong className="arabic text-sm text-[var(--foreground)]">
                          {formatAr(dictItem.mazi)}
                        </strong>
                      </span>
                    )}
                    {dictItem.muzari && (
                      <span>
                        Muzâri:{" "}
                        <strong className="arabic text-sm text-[var(--foreground)]">
                          {formatAr(dictItem.muzari)}
                        </strong>
                      </span>
                    )}
                    {dictItem.masdar && (
                      <span>
                        Masdar:{" "}
                        <strong className="arabic text-sm text-[var(--foreground)]">
                          {formatAr(dictItem.masdar)}
                        </strong>
                      </span>
                    )}
                  </span>

                  {/* Alt Aksiyon Butonları (Dinle | 🎤 Telaffuz | Kelime Kartı | Öğrendim) */}
                  <span className="pt-1 flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={(e) => handlePlayWord(e)}
                      className={`h-8 px-2.5 rounded-xl text-[11px] font-extrabold flex items-center justify-center gap-1 border-b-3 transition-all cursor-pointer ${
                        isSpeaking
                          ? "bg-[#087F5B] text-white border-[#065F46]"
                          : "bg-[#0CA678] hover:bg-[#099268] text-white border-[#087F5B]"
                      }`}
                    >
                      <Volume2 size={13} />
                      <span>Dinle</span>
                    </button>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        playClick();
                        const forms = buildWordForms(dictItem);
                        const defaultText =
                          forms[0]?.arabic || primaryAr.split("/")[0].trim();
                        setActiveIndex(null);
                        setCoachTarget({
                          text: defaultText,
                          forms,
                        });
                      }}
                      className="h-8 px-2.5 rounded-xl bg-[#F3F0FF] dark:bg-[var(--lavender-bg)] border-2 border-[#6741D9] border-b-3 text-[11px] font-extrabold text-[#6741D9] dark:text-[#d0bfff] flex items-center justify-center gap-1 transition-all cursor-pointer"
                    >
                      <Mic size={12} />
                      <span>Telaffuz</span>
                    </button>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        playClick();
                        toggleFavoriteWord(dictItem);
                      }}
                      className={`flex-1 h-8 px-2 rounded-xl border-2 border-b-3 text-[11px] font-extrabold flex items-center justify-center gap-1 transition-all cursor-pointer ${
                        isFav
                          ? "bg-red-50 border-red-300 text-red-600"
                          : "bg-white dark:bg-[var(--background)] border-[#E6D7BE] text-[var(--foreground)] hover:border-red-400"
                      }`}
                    >
                      <Heart size={12} fill={isFav ? "currentColor" : "none"} />
                      <span>{isFav ? "Kartlarımda" : "Kartlara Ekle"}</span>
                    </button>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        playClick();
                        toggleLearnedWord(dictItem.id);
                      }}
                      title="Öğrendim Olarak İşaretle"
                      className={`h-8 w-8 rounded-xl border-2 border-b-3 flex items-center justify-center transition-all cursor-pointer shrink-0 ${
                        isLearned
                          ? "bg-[#6741D9] border-[#5230B5] text-white"
                          : "bg-white dark:bg-[var(--background)] border-[#E6D7BE] text-[var(--muted)] hover:text-[#0CA678]"
                      }`}
                    >
                      <CheckCircle2 size={13} />
                    </button>
                  </span>
                </span>
              )}
            </span>
          );
        })}
      </span>
    </>
  );
}