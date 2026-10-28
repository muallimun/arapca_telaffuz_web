"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { Volume2, Heart, CheckCircle2, X, Sparkles, Mic } from "lucide-react";
import { analyzeAndMatchWord, getWordCategory, WordCategory } from "@/lib/dict";
import { useSettings } from "@/store/settings";
import { useUserStore } from "@/store/userStore";
import { useAudioStore } from "@/store/audioStore";
import { speakHybrid } from "@/lib/audio";
import { playClick } from "@/lib/sfxManager";
import ShadowingModal, { TargetForm } from "@/components/ui/ShadowingModal";
import { DictionaryItem } from "@/types/data";
import { formatArabicText, splitMixedBidiText } from "@/lib/arabicTextUtils";

interface Props {
  text: string;
  isLineSpeaking?: boolean;
  activeWordIndex?: number | null;
  activeWordProgress?: number;
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

function getCategoryStyle(category: WordCategory) {
  if (category === "fiil") {
    return {
      underline:
        "border-amber-500/75 hover:bg-amber-500/15 hover:text-amber-700 dark:hover:text-amber-300",
      badgeText: "⚡ Fiil (فعل)",
      badgeClass:
        "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-700/60",
      popoverLeftBorder: "border-l-4 border-l-amber-500",
      arabicAccent: "text-amber-700 dark:text-amber-300",
    };
  }
  if (category === "edat") {
    return {
      underline:
        "border-purple-400/70 hover:bg-purple-500/15 hover:text-purple-700 dark:hover:text-purple-300",
      badgeText: "🔗 Edat / Kalıp",
      badgeClass:
        "bg-purple-100 text-purple-800 border-purple-300 dark:bg-purple-950/60 dark:text-purple-300 dark:border-purple-700/60",
      popoverLeftBorder: "border-l-4 border-l-purple-500",
      arabicAccent: "text-purple-700 dark:text-purple-300",
    };
  }
  if (category === "ozel-isim") {
    return {
      underline:
        "border-teal-500/75 hover:bg-teal-500/15 hover:text-teal-700 dark:hover:text-teal-300",
      badgeText: "👤 Özel İsim (اسم علم)",
      badgeClass:
        "bg-teal-100 text-teal-800 border-teal-300 dark:bg-teal-950/60 dark:text-teal-300 dark:border-teal-700/60",
      popoverLeftBorder: "border-l-4 border-l-teal-500",
      arabicAccent: "text-teal-700 dark:text-teal-300",
    };
  }
  return {
    underline:
      "border-sky-500/75 hover:bg-sky-500/15 hover:text-sky-700 dark:hover:text-sky-300",
    badgeText: "📘 İsim (اسم)",
    badgeClass:
      "bg-sky-100 text-sky-800 border-sky-300 dark:bg-sky-950/60 dark:text-sky-300 dark:border-sky-700/60",
    popoverLeftBorder: "border-l-4 border-l-sky-500",
    arabicAccent: "text-sky-700 dark:text-sky-300",
  };
}

export default function WordTooltip({
  text,
  isLineSpeaking = false,
  activeWordIndex = null,
  activeWordProgress = 0,
}: Props) {
  const {
    showTooltips,
    showHareke,
    speechRate,
    arabicFont,
    wordTrackingStyle,
  } = useSettings();
  const {
    toggleFavoriteWord,
    isWordFavorite,
    toggleLearnedWord,
    isWordLearned,
  } = useUserStore();

  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{
    top?: number;
    bottom?: number;
    left: number;
    width: number;
  }>({ left: 12, width: 320 });
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [coachTarget, setCoachTarget] = useState<{
    text: string;
    forms: TargetForm[];
  } | null>(null);
  const [mounted, setMounted] = useState(false);

  const containerRef = useRef<HTMLSpanElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const activeWordElRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const computePosition = useCallback((el: HTMLElement) => {
    const rect = el.getBoundingClientRect();
    const vw = typeof window !== "undefined" ? window.innerWidth : 1024;
    const vh = typeof window !== "undefined" ? window.innerHeight : 768;
    const safeMargin = 12;
    const tooltipWidth = Math.min(336, vw - safeMargin * 2);
    const estimatedHeight = 255;

    const spaceBelow = vh - rect.bottom - 72;
    const spaceAbove = rect.top - 56;
    // Varsayılan olarak kelimenin hemen altında aç, alt kenara sığmıyorsa üstünde aç
    const placeAbove = spaceBelow < estimatedHeight && spaceAbove > spaceBelow;

    const rawLeft = rect.left + rect.width / 2 - tooltipWidth / 2;
    const clampedLeft = Math.max(
      safeMargin,
      Math.min(rawLeft, vw - tooltipWidth - safeMargin)
    );

    if (placeAbove) {
      const rawBottom = vh - rect.top + 8;
      const clampedBottom = Math.max(
        safeMargin,
        Math.min(rawBottom, vh - estimatedHeight - safeMargin)
      );
      setTooltipPos({
        bottom: clampedBottom,
        left: clampedLeft,
        width: tooltipWidth,
      });
    } else {
      const clampedTop = Math.max(
        52,
        Math.min(rect.bottom + 8, vh - estimatedHeight - safeMargin)
      );
      setTooltipPos({
        top: clampedTop,
        left: clampedLeft,
        width: tooltipWidth,
      });
    }
  }, []);

  useEffect(() => {
    if (activeIndex === null) return;

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        containerRef.current &&
        !containerRef.current.contains(target) &&
        (!popoverRef.current || !popoverRef.current.contains(target))
      ) {
        setActiveIndex(null);
      }
    };

    const handleScrollOrResize = () => {
      if (activeWordElRef.current) {
        const rect = activeWordElRef.current.getBoundingClientRect();
        if (rect.bottom < 0 || rect.top > window.innerHeight) {
          setActiveIndex(null);
          return;
        }
        computePosition(activeWordElRef.current);
      } else {
        setActiveIndex(null);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    window.addEventListener("scroll", handleScrollOrResize, {
      passive: true,
      capture: true,
    });
    window.addEventListener("resize", handleScrollOrResize);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("scroll", handleScrollOrResize, true);
      window.removeEventListener("resize", handleScrollOrResize);
    };
  }, [activeIndex, computePosition]);

  const formatAr = (str: string) =>
    formatArabicText(str, showHareke, arabicFont);

  const words = text.split(/\s+/).filter(Boolean);

  const showHighlight =
    wordTrackingStyle === "both" || wordTrackingStyle === "highlight";
  const showArrow =
    wordTrackingStyle === "both" || wordTrackingStyle === "arrow";

  return (
    <>
      {coachTarget && (
        <ShadowingModal
          text={coachTarget.text}
          forms={coachTarget.forms}
          onClose={() => setCoachTarget(null)}
        />
      )}

      <span
        ref={containerRef}
        dir="rtl"
        onClick={(e) => e.stopPropagation()}
        className="flex flex-wrap items-baseline justify-start gap-x-1.5 gap-y-2 text-right"
      >
        {words.map((word, index) => {
          const isWordSpeaking =
            isLineSpeaking &&
            activeWordIndex === index &&
            wordTrackingStyle !== "off";

          const karaokeHighlightClass =
            isWordSpeaking && showHighlight
              ? "bg-emerald-500/20 dark:bg-emerald-400/25 text-emerald-800 dark:text-emerald-200 ring-2 ring-emerald-500/40 rounded px-1"
              : "";

          const trackingArrowIndicator =
            isWordSpeaking && showArrow ? (
              <span
                aria-hidden="true"
                className="pointer-events-none select-none absolute -top-3.5 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center animate-bounce"
              >
                <span className="text-[11px] leading-none font-black text-emerald-600 dark:text-amber-300 drop-shadow-[0_1px_2px_rgba(16,185,129,0.55)]">
                  ▼
                </span>
              </span>
            ) : null;

          const bottomProgressLine =
            isWordSpeaking && (showHighlight || showArrow) ? (
              <span
                aria-hidden="true"
                className="pointer-events-none absolute -bottom-0.5 right-0 h-0.5 rounded-full bg-gradient-to-l from-emerald-500 via-teal-400 to-amber-400 transition-all duration-75"
                style={{
                  width: `${Math.max(18, Math.round(activeWordProgress * 100))}%`,
                }}
              />
            ) : null;

          if (!showTooltips) {
            return (
              <span
                key={index}
                className={`inline-block align-baseline leading-normal py-0.5 px-1 rounded relative transition-colors duration-150 ${karaokeHighlightClass}`}
              >
                {trackingArrowIndicator}
                {formatAr(word)}
                {bottomProgressLine}
              </span>
            );
          }

          const match = word.match(
            /^([.,!?؟،؛:"'()\[\]{}]*)([\u0600-\u06FF\u0670]+)([.,!?؟،؛:"'()\[\]{}]*)$/
          );

          if (!match) {
            return (
              <span
                key={index}
                className={`inline-block align-baseline leading-normal py-0.5 px-1 rounded relative transition-colors duration-150 ${karaokeHighlightClass}`}
              >
                {trackingArrowIndicator}
                {formatAr(word)}
                {bottomProgressLine}
              </span>
            );
          }

          const [, prefix, coreWord, suffix] = match;
          const analysis = analyzeAndMatchWord(coreWord);

          if (!analysis) {
            return (
              <span
                key={index}
                className={`inline-block align-baseline leading-normal py-0.5 px-1 rounded relative transition-colors duration-150 ${karaokeHighlightClass}`}
              >
                {trackingArrowIndicator}
                {formatAr(word)}
                {bottomProgressLine}
              </span>
            );
          }

          const { item: dictItem, morphologyNote } = analysis;
          const category = getWordCategory(dictItem);
          const catStyle = getCategoryStyle(category);
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
            useAudioStore.getState().stop();
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
              activeWordElRef.current = null;
              return;
            }
            activeWordElRef.current = e.currentTarget;
            computePosition(e.currentTarget);
            setActiveIndex(index);
          };

          return (
            <span
              key={index}
              className="relative inline-block align-baseline leading-normal"
            >
              {trackingArrowIndicator}
              {prefix}
              <button
                type="button"
                onClick={handleWordClick}
                className={`relative inline-block align-baseline leading-normal py-0.5 px-1 rounded cursor-pointer transition-colors duration-150 border-b-2 border-dashed ${
                  isWordSpeaking && showHighlight
                    ? "bg-emerald-500/20 dark:bg-emerald-400/25 text-emerald-800 dark:text-emerald-200 ring-2 ring-emerald-500/40 border-emerald-500"
                    : isOpen
                    ? "bg-[#F3F0FF] dark:bg-[var(--lavender-bg)] text-[#6741D9] dark:text-[#d0bfff] border-[#6741D9]"
                    : catStyle.underline
                }`}
              >
                {formatAr(coreWord)}
                {bottomProgressLine}
              </button>
              {suffix}

              {/* Portal ile doğrudan document.body altında render edilen 3B Sözlük İpucu Kartı */}
              {mounted &&
                isOpen &&
                typeof document !== "undefined" &&
                createPortal(
                  <div
                    ref={popoverRef}
                    dir="ltr"
                    onClick={(e) => e.stopPropagation()}
                    onMouseDown={(e) => e.stopPropagation()}
                    style={{
                      fontFamily:
                        "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
                      top:
                        tooltipPos.top !== undefined
                          ? `${tooltipPos.top}px`
                          : undefined,
                      bottom:
                        tooltipPos.bottom !== undefined
                          ? `${tooltipPos.bottom}px`
                          : undefined,
                      left: `${tooltipPos.left}px`,
                      width: `${tooltipPos.width}px`,
                    }}
                    className={`fixed p-3.5 bg-[#F7EFE1] dark:bg-[var(--surface)] border-2 border-[#E6D7BE] dark:border-[var(--border)] border-b-4 ${catStyle.popoverLeftBorder} rounded-2xl shadow-2xl text-left font-sans z-[9999] block space-y-2`}
                  >
                    {/* Sağ Üst Kapatma (X) Butonu */}
                    <button
                      type="button"
                      aria-label="Kapat"
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveIndex(null);
                      }}
                      className="absolute top-2.5 right-2.5 w-6 h-6 rounded-lg bg-white dark:bg-[var(--background)] border border-[#E6D7BE] flex items-center justify-center text-[var(--muted)] hover:text-[var(--foreground)] cursor-pointer z-10"
                    >
                      <X size={12} />
                    </button>

                    {/* Üst Satır: Tür Rozeti + Kök + Türkçe Anlam + Arapça Ana Kelime */}
                    <div className="flex items-start justify-between gap-2 pr-7 border-b border-dashed border-[#E2D3B8] dark:border-[var(--border-dashed)] pb-2">
                      <div className="space-y-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span
                            className={`px-2 py-0.5 rounded-md border text-[10px] font-sans font-extrabold ${catStyle.badgeClass}`}
                          >
                            {catStyle.badgeText}
                          </span>
                          {dictItem.kok && dictItem.kok !== "-" && (
                            <span
                              dir="ltr"
                              className="inline-flex items-center gap-1 text-[10px] font-sans font-extrabold tracking-wider text-[var(--muted)]"
                            >
                              <span>KÖK:</span>
                              <bdi
                                dir="rtl"
                                className="arabic font-arabic text-xs font-bold text-[var(--foreground)] inline-block"
                              >
                                {dictItem.kok}
                              </bdi>
                            </span>
                          )}
                        </div>
                        <div
                          dir="ltr"
                          className="block text-xs font-sans font-extrabold text-[var(--foreground)] leading-snug text-left"
                        >
                          {splitMixedBidiText(dictItem.anlam_tr).map(
                            (seg, sIdx) =>
                              seg.isArabic ? (
                                <bdi
                                  key={sIdx}
                                  dir="rtl"
                                  className="arabic font-arabic font-bold inline-block mx-0.5"
                                >
                                  {formatAr(seg.text)}
                                </bdi>
                              ) : (
                                <span key={sIdx}>{seg.text}</span>
                              )
                          )}
                        </div>
                      </div>

                      <div className="flex flex-col items-end shrink-0 text-right">
                        <span
                          dir="rtl"
                          className={`arabic font-arabic text-2xl font-bold block leading-none ${catStyle.arabicAccent}`}
                        >
                          {formatAr(primaryAr)}
                        </span>
                        {coreWord !== primaryAr && (
                          <span
                            dir="ltr"
                            className="inline-flex items-center justify-end gap-1 text-xs md:text-sm font-sans font-medium text-[#6741D9] mt-1"
                          >
                            <span>Metinde:</span>
                            <bdi
                              dir="rtl"
                              className="arabic font-arabic text-base md:text-lg font-bold inline-block"
                            >
                              {formatAr(coreWord)}
                            </bdi>
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Morfolojik Çözümleme Notu — LTR / RTL İzoleli */}
                    {morphologyNote && (
                      <div
                        dir="ltr"
                        className="block bg-white dark:bg-[var(--background)] rounded-xl px-2.5 py-1.5 border border-[#E6D7BE] text-[11px] font-sans font-bold text-[#4C28B5] dark:text-[#d0bfff] text-left"
                      >
                        <span className="inline-flex items-center gap-1 text-[10px] font-sans font-extrabold tracking-wider text-[#6741D9] block mb-0.5">
                          <Sparkles size={10} />
                          <span>MORFOLOJİK ÇÖZÜMLEME:</span>
                        </span>
                        <span
                          dir="ltr"
                          className="block text-left leading-relaxed font-sans"
                        >
                          {splitMixedBidiText(morphologyNote).map(
                            (part, pIdx) =>
                              part.isArabic ? (
                                <bdi
                                  key={pIdx}
                                  dir="rtl"
                                  className="arabic font-arabic text-sm font-bold inline-block mx-0.5"
                                >
                                  {formatAr(part.text)}
                                </bdi>
                              ) : (
                                <span key={pIdx} className="font-sans">
                                  {part.text}
                                </span>
                              )
                          )}
                        </span>
                      </div>
                    )}

                    {/* Sözlük Künyesi: Müfret/Cemi veya Mazi/Muzari/Masdar */}
                    <div
                      dir="ltr"
                      className="flex flex-wrap items-center justify-between gap-2 text-xs md:text-sm font-sans font-medium py-1 border-b border-dashed border-[#E2D3B8] dark:border-[var(--border-dashed)] text-[var(--muted)]"
                    >
                      {dictItem.mufret && (
                        <span className="inline-flex items-center gap-1">
                          <span>Müfret:</span>
                          <bdi
                            dir="rtl"
                            className="arabic font-arabic text-base md:text-lg font-bold text-[var(--foreground)] inline-block"
                          >
                            {formatAr(dictItem.mufret)}
                          </bdi>
                        </span>
                      )}
                      {dictItem.cemi && dictItem.cemi !== "-" && (
                        <span className="inline-flex items-center gap-1">
                          <span>Cemî:</span>
                          <bdi
                            dir="rtl"
                            className="arabic font-arabic text-base md:text-lg font-bold text-[var(--foreground)] inline-block"
                          >
                            {formatAr(dictItem.cemi)}
                          </bdi>
                        </span>
                      )}
                      {dictItem.mazi && (
                        <span className="inline-flex items-center gap-1">
                          <span>Mâzî:</span>
                          <bdi
                            dir="rtl"
                            className="arabic font-arabic text-base md:text-lg font-bold text-[var(--foreground)] inline-block"
                          >
                            {formatAr(dictItem.mazi)}
                          </bdi>
                        </span>
                      )}
                      {dictItem.muzari && (
                        <span className="inline-flex items-center gap-1">
                          <span>Muzâri:</span>
                          <bdi
                            dir="rtl"
                            className="arabic font-arabic text-base md:text-lg font-bold text-[var(--foreground)] inline-block"
                          >
                            {formatAr(dictItem.muzari)}
                          </bdi>
                        </span>
                      )}
                      {dictItem.masdar && (
                        <span className="inline-flex items-center gap-1">
                          <span>Masdar:</span>
                          <bdi
                            dir="rtl"
                            className="arabic font-arabic text-base md:text-lg font-bold text-[var(--foreground)] inline-block"
                          >
                            {formatAr(dictItem.masdar)}
                          </bdi>
                        </span>
                      )}
                    </div>

                    {/* Alt Aksiyon Butonları (Dinle | Telaffuz | Kartlara Ekle | Öğrendim) */}
                    <div className="pt-1 flex flex-nowrap items-center justify-between gap-1.5 font-sans">
                      <button
                        type="button"
                        onClick={(e) => handlePlayWord(e)}
                        className={`whitespace-nowrap px-2.5 py-1.5 text-xs font-medium shrink-0 rounded-xl font-sans font-extrabold flex items-center justify-center gap-1 border-b-3 transition-all cursor-pointer ${
                          isSpeaking
                            ? "bg-[#087F5B] text-white border-[#065F46]"
                            : "bg-[#0CA678] hover:bg-[#099268] text-white border-[#087F5B]"
                        }`}
                      >
                        <Volume2 size={13} className="shrink-0" />
                        <span>Dinle</span>
                      </button>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          playClick();
                          useAudioStore.getState().stop();
                          const forms = buildWordForms(dictItem);
                          const defaultText =
                            forms[0]?.arabic || primaryAr.split("/")[0].trim();
                          setActiveIndex(null);
                          setCoachTarget({
                            text: defaultText,
                            forms,
                          });
                        }}
                        className="whitespace-nowrap px-2.5 py-1.5 text-xs font-medium shrink-0 rounded-xl bg-[#F3F0FF] dark:bg-[var(--lavender-bg)] border-2 border-[#6741D9] border-b-3 font-sans font-extrabold text-[#6741D9] dark:text-[#d0bfff] flex items-center justify-center gap-1 transition-all cursor-pointer"
                      >
                        <Mic size={12} className="shrink-0" />
                        <span>Telaffuz</span>
                      </button>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          playClick();
                          toggleFavoriteWord(dictItem);
                        }}
                        className={`whitespace-nowrap px-2.5 py-1.5 text-xs font-medium shrink-0 flex-1 rounded-xl border-2 border-b-3 font-sans font-extrabold flex items-center justify-center gap-1 transition-all cursor-pointer ${
                          isFav
                            ? "bg-red-50 border-red-300 text-red-600"
                            : "bg-white dark:bg-[var(--background)] border-[#E6D7BE] text-[var(--foreground)] hover:border-red-400"
                        }`}
                      >
                        <Heart
                          size={12}
                          className="shrink-0"
                          fill={isFav ? "currentColor" : "none"}
                        />
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
                        className={`h-8 w-8 shrink-0 rounded-xl border-2 border-b-3 flex items-center justify-center transition-all cursor-pointer ${
                          isLearned
                            ? "bg-[#6741D9] border-[#5230B5] text-white"
                            : "bg-white dark:bg-[var(--background)] border-[#E6D7BE] text-[var(--muted)] hover:border-[#6741D9]"
                        }`}
                      >
                        <CheckCircle2 size={14} className="shrink-0" />
                      </button>
                    </div>
                  </div>,
                  document.body
                )}
            </span>
          );
        })}
      </span>
    </>
  );
}