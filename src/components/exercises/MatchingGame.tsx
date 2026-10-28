"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  playSuccess,
  playError,
  playFanfare,
  playClick,
} from "@/lib/sfxManager";
import { Dialogue, DictionaryItem } from "@/types/data";
import { shuffleArray } from "@/lib/quiz";
import {
  RotateCcw,
  Trophy,
  Timer,
  AlertCircle,
  Volume2,
  Check,
  Play,
  Target,
  X,
} from "lucide-react";
import { useCountdown } from "@/lib/useTimer";
import { playTTS } from "@/lib/audio";
import { useSettings } from "@/store/settings";
import { useUserStore } from "@/store/userStore";
import { formatArabicText } from "@/lib/arabicTextUtils";
import { FeedbackMode, QuizContentType } from "./MultipleChoice";

interface Props {
  vocabulary: DictionaryItem[];
  dialogues?: Dialogue[];
  contentType?: QuizContentType;
  timeLimit: number | null;
  questionCount?: number;
  feedbackMode?: FeedbackMode;
  onClose?: () => void;
}

export interface PairDefinition {
  matchId: string;
  arText: string;
  trText: string;
  isSentence: boolean;
}

interface MatchCardItem {
  id: string;
  text: string;
  type: "ar" | "tr";
  matchId: string;
  isSentence?: boolean;
}

interface ArrowConnection {
  trId: string;
  arId: string;
  trMatchId: string;
  arMatchId: string;
  status: "correct" | "wrong" | "pending";
}

interface Point {
  x: number;
  y: number;
}

export default function MatchingGame({
  vocabulary,
  dialogues = [],
  contentType = "words",
  timeLimit,
  feedbackMode = "instant",
  onClose,
}: Props) {
  // Her sette 5 kelime ile tek ekranda kaydırmasız görünüm
  const pairTarget = 5;
  const fanfarePlayedRef = useRef(false);
  const { speechRate, showHareke, arabicFont } = useSettings();
  const { addStudyMinutes } = useUserStore();
  const formatAr = (t: string) => formatArabicText(t, showHareke, arabicFont);

  const [currentPairs, setCurrentPairs] = useState<PairDefinition[]>([]);
  const [arCards, setArCards] = useState<MatchCardItem[]>([]);
  const [trCards, setTrCards] = useState<MatchCardItem[]>([]);
  const [selectedAr, setSelectedAr] = useState<string | null>(null);
  const [selectedTr, setSelectedTr] = useState<string | null>(null);

  // Active arrow connections between trId and arId
  const [connections, setConnections] = useState<ArrowConnection[]>([]);
  // Track any pairs that had at least one wrong attempt
  const [wrongPairsHistory, setWrongPairsHistory] = useState<PairDefinition[]>(
    []
  );
  const [wrongAttemptsCount, setWrongAttemptsCount] = useState(0);

  // Score tracking
  const [exerciseScore, setExerciseScore] = useState(0);
  const [totalCumulativeScore, setTotalCumulativeScore] = useState(0);

  // End-mode evaluation state
  const [isExamEvaluated, setIsExamEvaluated] = useState(false);
  const [showEndBar, setShowEndBar] = useState(false);
  const [isGameOver, setIsGameOver] = useState(false);

  // SVG Board & Socket Refs for coordinate calculation
  const boardRef = useRef<HTMLDivElement | null>(null);
  const trSocketRefs = useRef<Record<string, HTMLSpanElement | null>>({});
  const arSocketRefs = useRef<Record<string, HTMLSpanElement | null>>({});
  const [socketCoords, setSocketCoords] = useState<{
    tr: Record<string, Point>;
    ar: Record<string, Point>;
  }>({ tr: {}, ar: {} });

  // Pointer Drag State
  const [dragState, setDragState] = useState<{
    sourceId: string;
    sourceType: "tr" | "ar";
    sourceMatchId: string;
    startPoint: Point;
    currentPoint: Point;
  } | null>(null);

  const totalPairs = arCards.length;
  const correctConnectionsCount = connections.filter(
    (c) => c.trMatchId === c.arMatchId
  ).length;

  const isInstantCompleted =
    feedbackMode === "instant" &&
    totalPairs > 0 &&
    connections.filter((c) => c.status === "correct").length === totalPairs;

  const isCompleted =
    isInstantCompleted || (feedbackMode === "end" && showEndBar) || showEndBar;

  const handleTimeout = () => {
    if (feedbackMode === "end" && !isExamEvaluated) {
      evaluateEndModeConnections();
    }
    setIsGameOver(true);
    setShowEndBar(true);
  };

  const timeLeft = useCountdown(
    timeLimit,
    handleTimeout,
    !isCompleted && !isGameOver
  );

  // Build candidate pool
  const buildPairPool = useCallback((): PairDefinition[] => {
    const wordPairs: PairDefinition[] = vocabulary
      .map((w) => ({
        matchId: `w_${w.id}`,
        arText: (w.mufret || w.mazi || "").split("/")[0].trim(),
        trText: w.anlam_tr,
        isSentence: false,
      }))
      .filter((p) => p.arText.length > 0 && p.trText.length > 0);

    const sentencePairs: PairDefinition[] = [];
    dialogues.forEach((dlg) => {
      dlg.satirlar.forEach((line) => {
        if (line.arapca.trim() && line.turkce.trim()) {
          sentencePairs.push({
            matchId: `s_${dlg.id}_${line.sira}`,
            arText: line.arapca.trim(),
            trText: line.turkce.trim(),
            isSentence: true,
          });
        }
      });
    });

    if (contentType === "sentences" && sentencePairs.length >= 4) {
      return shuffleArray(sentencePairs).slice(0, pairTarget);
    }
    if (
      contentType === "mixed" &&
      sentencePairs.length >= 2 &&
      wordPairs.length >= 2
    ) {
      const sCount = Math.ceil(pairTarget / 2);
      const wCount = pairTarget - sCount;
      return shuffleArray([
        ...shuffleArray(sentencePairs).slice(0, sCount),
        ...shuffleArray(wordPairs).slice(0, wCount),
      ]);
    }
    return shuffleArray(wordPairs).slice(0, pairTarget);
  }, [vocabulary, dialogues, contentType, pairTarget]);

  const setupBoardFromPairs = useCallback((chosenPairs: PairDefinition[]) => {
    fanfarePlayedRef.current = false;
    setCurrentPairs(chosenPairs);

    const nextAr: MatchCardItem[] = chosenPairs.map((p) => ({
      id: `ar-${p.matchId}`,
      text: p.arText,
      type: "ar",
      matchId: p.matchId,
      isSentence: p.isSentence,
    }));

    const nextTr: MatchCardItem[] = chosenPairs.map((p) => ({
      id: `tr-${p.matchId}`,
      text: p.trText,
      type: "tr",
      matchId: p.matchId,
      isSentence: p.isSentence,
    }));

    setArCards(shuffleArray(nextAr));
    setTrCards(shuffleArray(nextTr));
    setConnections([]);
    setWrongPairsHistory([]);
    setWrongAttemptsCount(0);
    setExerciseScore(0);
    setSelectedAr(null);
    setSelectedTr(null);
    setIsExamEvaluated(false);
    setShowEndBar(false);
    setIsGameOver(false);
  }, []);

  const initNewSet = useCallback(() => {
    const chosen = buildPairPool();
    setupBoardFromPairs(chosen);
  }, [buildPairPool, setupBoardFromPairs]);

  useEffect(() => {
    initNewSet();
  }, [initNewSet]);

  // Measure socket coordinates relative to boardRef
  const updateSocketCoordinates = useCallback(() => {
    const board = boardRef.current;
    if (!board) return;
    const boardRect = board.getBoundingClientRect();
    if (boardRect.width === 0) return;

    const trMap: Record<string, Point> = {};
    const arMap: Record<string, Point> = {};

    Object.entries(trSocketRefs.current).forEach(([id, el]) => {
      if (el) {
        const r = el.getBoundingClientRect();
        trMap[id] = {
          x: r.left - boardRect.left + r.width / 2,
          y: r.top - boardRect.top + r.height / 2,
        };
      }
    });

    Object.entries(arSocketRefs.current).forEach(([id, el]) => {
      if (el) {
        const r = el.getBoundingClientRect();
        arMap[id] = {
          x: r.left - boardRect.left + r.width / 2,
          y: r.top - boardRect.top + r.height / 2,
        };
      }
    });

    setSocketCoords({ tr: trMap, ar: arMap });
  }, []);

  useEffect(() => {
    const timer = setTimeout(updateSocketCoordinates, 30);
    window.addEventListener("resize", updateSocketCoordinates);

    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined" && boardRef.current) {
      observer = new ResizeObserver(() => {
        updateSocketCoordinates();
      });
      observer.observe(boardRef.current);
    }

    return () => {
      clearTimeout(timer);
      window.removeEventListener("resize", updateSocketCoordinates);
      if (observer) observer.disconnect();
    };
  }, [trCards, arCards, connections, showEndBar, updateSocketCoordinates]);

  useEffect(() => {
    if (isInstantCompleted && !fanfarePlayedRef.current) {
      fanfarePlayedRef.current = true;
      addStudyMinutes(3);
      playFanfare();
      setShowEndBar(true);
    } else if (isGameOver && !fanfarePlayedRef.current) {
      fanfarePlayedRef.current = true;
      playError();
    }
  }, [isInstantCompleted, isGameOver, addStudyMinutes]);

  const recordWrongPair = (trMatchId: string, arMatchId: string) => {
    setWrongAttemptsCount((c) => c + 1);
    setWrongPairsHistory((prev) => {
      const next = [...prev];
      const p1 = currentPairs.find((p) => p.matchId === trMatchId);
      const p2 = currentPairs.find((p) => p.matchId === arMatchId);
      if (p1 && !next.some((x) => x.matchId === p1.matchId)) next.push(p1);
      if (p2 && !next.some((x) => x.matchId === p2.matchId)) next.push(p2);
      return next;
    });
  };

  // Connect a Turkish card and an Arabic card
  const connectPair = (trId: string, arId: string) => {
    if (isGameOver || isExamEvaluated) return;
    const trMatchId = trId.replace("tr-", "");
    const arMatchId = arId.replace("ar-", "");

    // In instant mode, do not allow overriding an already locked correct card
    if (feedbackMode === "instant") {
      const lockedCorrect = connections.some(
        (c) =>
          c.status === "correct" && (c.trId === trId || c.arId === arId)
      );
      if (lockedCorrect) return;

      const isMatch = trMatchId === arMatchId;
      if (isMatch) {
        playSuccess();
        setExerciseScore((s) => s + 10);
        setTotalCumulativeScore((s) => s + 10);
      } else {
        playError();
        recordWrongPair(trMatchId, arMatchId);
      }

      setConnections((prev) => {
        // Remove any previous non-correct connection attached to trId or arId
        const filtered = prev.filter(
          (c) =>
            c.status === "correct" ||
            (c.trId !== trId && c.arId !== arId)
        );
        return [
          ...filtered,
          {
            trId,
            arId,
            trMatchId,
            arMatchId,
            status: isMatch ? "correct" : "wrong",
          },
        ];
      });
    } else {
      // End mode: store as pending connection, replacing any existing connection for trId or arId
      playClick();
      setConnections((prev) => {
        const filtered = prev.filter(
          (c) => c.trId !== trId && c.arId !== arId
        );
        return [
          ...filtered,
          {
            trId,
            arId,
            trMatchId,
            arMatchId,
            status: "pending",
          },
        ];
      });
    }

    setSelectedTr(null);
    setSelectedAr(null);
  };

  const evaluateEndModeConnections = () => {
    playClick();
    let gained = 0;
    let wrongs = 0;
    const evaluated: ArrowConnection[] = connections.map((c) => {
      const isOk = c.trMatchId === c.arMatchId;
      if (isOk) {
        gained += 10;
      } else {
        wrongs += 1;
        recordWrongPair(c.trMatchId, c.arMatchId);
      }
      return {
        ...c,
        status: isOk ? "correct" : "wrong",
      };
    });

    // Also mark unconnected pairs as wrong in history
    currentPairs.forEach((p) => {
      const connectedRight = evaluated.some(
        (c) => c.trMatchId === p.matchId && c.status === "correct"
      );
      if (!connectedRight) {
        setWrongPairsHistory((prev) =>
          prev.some((x) => x.matchId === p.matchId) ? prev : [...prev, p]
        );
      }
    });

    setWrongAttemptsCount(wrongs + (totalPairs - evaluated.length));
    setConnections(evaluated);
    setExerciseScore(gained);
    setTotalCumulativeScore((s) => s + gained);
    setIsExamEvaluated(true);
    addStudyMinutes(3);
    playFanfare();
    setShowEndBar(true);
  };

  const handleCardSelect = (card: MatchCardItem) => {
    if (isGameOver || isExamEvaluated) return;

    // Check if already locked in instant mode
    if (
      feedbackMode === "instant" &&
      connections.some(
        (c) =>
          c.status === "correct" &&
          (c.trId === card.id || c.arId === card.id)
      )
    ) {
      return;
    }

    if (card.type === "ar") {
      playTTS(card.text, speechRate);
      if (selectedTr) {
        connectPair(selectedTr, card.id);
      } else {
        playClick();
        setSelectedAr((prev) => (prev === card.id ? null : card.id));
      }
    } else {
      playClick();
      if (selectedAr) {
        connectPair(card.id, selectedAr);
      } else {
        setSelectedTr((prev) => (prev === card.id ? null : card.id));
      }
    }
  };

  // Pointer Drag Handlers
  const handlePointerDownCard = (
    e: React.PointerEvent,
    card: MatchCardItem
  ) => {
    if (isGameOver || isExamEvaluated) return;
    if (
      feedbackMode === "instant" &&
      connections.some(
        (c) =>
          c.status === "correct" &&
          (c.trId === card.id || c.arId === card.id)
      )
    ) {
      return;
    }

    const board = boardRef.current;
    if (!board) return;
    updateSocketCoordinates();
    const boardRect = board.getBoundingClientRect();

    const socketPt =
      card.type === "tr"
        ? socketCoords.tr[card.id]
        : socketCoords.ar[card.id];

    const startPoint: Point = socketPt || {
      x: e.clientX - boardRect.left,
      y: e.clientY - boardRect.top,
    };

    setDragState({
      sourceId: card.id,
      sourceType: card.type,
      sourceMatchId: card.matchId,
      startPoint,
      currentPoint: {
        x: e.clientX - boardRect.left,
        y: e.clientY - boardRect.top,
      },
    });
  };

  const handleBoardPointerMove = (e: React.PointerEvent) => {
    if (!dragState || !boardRef.current) return;
    const boardRect = boardRef.current.getBoundingClientRect();
    setDragState((prev) =>
      prev
        ? {
            ...prev,
            currentPoint: {
              x: e.clientX - boardRect.left,
              y: e.clientY - boardRect.top,
            },
          }
        : null
    );
  };

  const handleBoardPointerUp = (e: React.PointerEvent) => {
    if (!dragState) return;
    const currentDrag = dragState;
    setDragState(null);

    const dx = currentDrag.currentPoint.x - currentDrag.startPoint.x;
    const dy = currentDrag.currentPoint.y - currentDrag.startPoint.y;
    const dist = Math.hypot(dx, dy);

    // If user barely moved pointer, let onClick handle tap-to-connect
    if (dist < 18) return;

    const targetEl = document.elementFromPoint(e.clientX, e.clientY);
    if (!targetEl) return;

    if (currentDrag.sourceType === "tr") {
      const arCardEl = targetEl.closest(
        "[data-ar-card-id]"
      ) as HTMLElement | null;
      const targetArId = arCardEl?.getAttribute("data-ar-card-id");
      if (targetArId) {
        const arObj = arCards.find((c) => c.id === targetArId);
        if (arObj) playTTS(arObj.text, speechRate);
        connectPair(currentDrag.sourceId, targetArId);
      }
    } else {
      const trCardEl = targetEl.closest(
        "[data-tr-card-id]"
      ) as HTMLElement | null;
      const targetTrId = trCardEl?.getAttribute("data-tr-card-id");
      if (targetTrId) {
        connectPair(targetTrId, currentDrag.sourceId);
      }
    }
  };

  // Reset only current connections & reshuffle same pairs
  const handleRepeatSameSet = () => {
    playClick();
    setupBoardFromPairs([...currentPairs]);
  };

  // Repeat only wrong pairs
  const handleRetryWrongPairs = () => {
    playClick();
    if (wrongPairsHistory.length === 0) return;
    let retryPool = [...wrongPairsHistory];
    if (retryPool.length < 2 && currentPairs.length >= 2) {
      const extra = currentPairs.find(
        (p) => !retryPool.some((r) => r.matchId === p.matchId)
      );
      if (extra) retryPool.push(extra);
    }
    setupBoardFromPairs(retryPool);
  };

  if (arCards.length === 0) {
    return (
      <p className="text-center text-sm font-bold text-[var(--muted)] p-8">
        Eşleştirme oyunu için yeterli öğe bulunamadı.
      </p>
    );
  }

  const accuracyPct =
    totalPairs > 0
      ? Math.round((correctConnectionsCount / totalPairs) * 100)
      : 0;

  return (
    <div className="max-w-4xl mx-auto bg-[#F7EFE1] dark:bg-[var(--surface)] rounded-2xl border-2 border-[#E6D7BE] dark:border-[var(--border)] border-b-4 p-3 sm:p-5 shadow-xs">
      {/* 1. ÜST YÖNERGE BAŞLIĞI (ÇİFT DİLLİ KOMPAKT BAŞLIK) */}
      <div className="relative text-center pb-3 mb-3 border-b border-stone-200/80 dark:border-slate-700/80">
        <p
          dir="rtl"
          className="arabic font-arabic text-lg md:text-xl font-bold text-slate-800 dark:text-slate-100 leading-snug"
        >
          {formatAr("صِلْ كُلَّ عُنْصُرٍ بِمَا يُنَاسِبُهُ.")}
        </p>
        <p
          dir="ltr"
          className="text-xs md:text-sm font-medium text-slate-500 dark:text-slate-400 mt-0.5"
        >
          Her bir kelimeyi kendisine uygun olanla eşleştiriniz.
        </p>

        {/* Varsa Süre Sayacı Sağ Üst Köşede Kompakt */}
        {timeLeft !== null && (
          <div
            className={`mt-2 sm:mt-0 sm:absolute sm:right-0 sm:top-1 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl border text-xs font-black tabular-nums ${
              timeLeft <= 5
                ? "bg-red-100 border-red-300 text-red-700 animate-pulse"
                : "bg-white dark:bg-[var(--background)] border-[#E6D7BE] text-amber-700"
            }`}
          >
            <Timer size={13} />
            <span>00:{timeLeft.toString().padStart(2, "0")}</span>
          </div>
        )}
      </div>

      {/* 2. İKİ ANA GRUP KUTUSU VE GENİŞ ORTA ÇİZGİ KORİDORU */}
      <div
        ref={boardRef}
        onPointerMove={handleBoardPointerMove}
        onPointerUp={handleBoardPointerUp}
        className="flex items-stretch justify-between relative w-full overflow-hidden select-none touch-pan-y"
      >
        {/* DİNAMİK VEKTÖREL SVG ÇİZGİ / OK KATMANI */}
        <svg
          className="absolute inset-0 w-full h-full pointer-events-none z-20 overflow-visible"
          aria-hidden="true"
        >
          <defs>
            <marker
              id="arrow-green"
              viewBox="0 0 10 10"
              refX="7"
              refY="5"
              markerWidth="5"
              markerHeight="5"
              orient="auto-start-reverse"
            >
              <path d="M 0 1 L 10 5 L 0 9 z" fill="#10b981" />
            </marker>
            <marker
              id="arrow-red"
              viewBox="0 0 10 10"
              refX="7"
              refY="5"
              markerWidth="5"
              markerHeight="5"
              orient="auto-start-reverse"
            >
              <path d="M 0 1 L 10 5 L 0 9 z" fill="#f43f5e" />
            </marker>
            <marker
              id="arrow-indigo"
              viewBox="0 0 10 10"
              refX="7"
              refY="5"
              markerWidth="5"
              markerHeight="5"
              orient="auto-start-reverse"
            >
              <path d="M 0 1 L 10 5 L 0 9 z" fill="#6741D9" />
            </marker>
          </defs>

          {/* Kalıcı Bağlantı Çizgileri */}
          {connections.map((conn) => {
            const p1 = socketCoords.tr[conn.trId];
            const p2 = socketCoords.ar[conn.arId];
            if (!p1 || !p2) return null;

            const strokeColor =
              conn.status === "correct"
                ? "#10b981"
                : conn.status === "wrong"
                ? "#f43f5e"
                : "#6741D9";
            const markerId =
              conn.status === "correct"
                ? "url(#arrow-green)"
                : conn.status === "wrong"
                ? "url(#arrow-red)"
                : "url(#arrow-indigo)";

            return (
              <g key={`${conn.trId}-${conn.arId}`}>
                <line
                  x1={p1.x}
                  y1={p1.y}
                  x2={p2.x}
                  y2={p2.y}
                  stroke={strokeColor}
                  strokeWidth={2.5}
                  strokeLinecap="round"
                  markerEnd={markerId}
                />
              </g>
            );
          })}

          {/* Sürükleme Esnasında Canlı Çizilen Çizgi */}
          {dragState && (
            <g>
              <line
                x1={dragState.startPoint.x}
                y1={dragState.startPoint.y}
                x2={dragState.currentPoint.x}
                y2={dragState.currentPoint.y}
                stroke="#6741D9"
                strokeWidth={2.5}
                strokeDasharray="4 3"
                strokeLinecap="round"
                markerEnd="url(#arrow-indigo)"
              />
            </g>
          )}
        </svg>

        {/* SOL GRUP KUTUSU (TÜRKÇE — BAĞLANTI TUTAMACI SAĞ İÇ KENARDA) */}
        <div className="bg-[#fdfcf7] dark:bg-slate-800/90 border border-stone-200/90 dark:border-slate-700 rounded-2xl p-2 sm:p-3.5 shadow-sm w-[45%] sm:w-[40%] flex flex-col justify-between gap-2 z-10">
          {trCards.map((trCard) => {
            const trConn = connections.find((c) => c.trId === trCard.id);
            const isTrSelected =
              selectedTr === trCard.id || dragState?.sourceId === trCard.id;

            const rowStyle =
              trConn?.status === "correct"
                ? "bg-emerald-500/15 dark:bg-emerald-500/20 border border-emerald-500/70 text-emerald-900 dark:text-emerald-200"
                : trConn?.status === "wrong"
                ? "bg-rose-500/15 dark:bg-rose-500/20 border border-rose-500/70 text-rose-900 dark:text-rose-200"
                : trConn?.status === "pending" || isTrSelected
                ? "bg-[#F3F0FF] dark:bg-indigo-950/60 border border-[#6741D9] text-[#4C28B5] dark:text-indigo-200 ring-2 ring-[#6741D9]/25"
                : "bg-stone-100/70 dark:bg-slate-700/50 hover:bg-stone-200/70 dark:hover:bg-slate-700 border border-stone-200/80 dark:border-slate-600/70 text-slate-700 dark:text-slate-200";

            const dotStyle =
              trConn?.status === "correct"
                ? "bg-emerald-500 ring-2 ring-emerald-500/30"
                : trConn?.status === "wrong"
                ? "bg-rose-500 ring-2 ring-rose-500/30"
                : trConn?.status === "pending" || isTrSelected
                ? "bg-[#6741D9] ring-2 ring-[#6741D9]/30 scale-110"
                : "bg-slate-500 dark:bg-slate-400";

            return (
              <div
                key={trCard.id}
                role="button"
                tabIndex={0}
                data-tr-card-id={trCard.id}
                onPointerDown={(e) => handlePointerDownCard(e, trCard)}
                onClick={() => handleCardSelect(trCard)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    handleCardSelect(trCard);
                  }
                }}
                className={`h-auto min-h-[48px] px-2.5 py-2 sm:px-4 sm:py-3 rounded-xl flex items-center justify-between gap-2 cursor-pointer transition-all ${rowStyle}`}
              >
                {/* Sol: Türkçe Anlamı */}
                <span className="text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-200 break-words leading-snug line-clamp-2 flex-1 min-w-0 text-left">
                  {trCard.text}
                </span>

                {/* Sağ İç Kenar: Orta Koridora Bakan Bağlantı Noktası (■) */}
                <span
                  ref={(el) => {
                    trSocketRefs.current[trCard.id] = el;
                  }}
                  className={`w-3 h-3 rounded-sm shrink-0 transition-all ${dotStyle}`}
                  aria-hidden="true"
                />
              </div>
            );
          })}
        </div>

        {/* ORTA ÇİZGİ KORİDORU */}
        <div
          className="flex-1 min-w-[24px] sm:min-w-[84px] md:min-w-[128px]"
          aria-hidden="true"
        />

        {/* SAĞ GRUP KUTUSU (ARAPÇA — BAĞLANTI TUTAMACI SOL İÇ KENARDA) */}
        <div className="bg-[#fdfcf7] dark:bg-slate-800/90 border border-stone-200/90 dark:border-slate-700 rounded-2xl p-2 sm:p-3.5 shadow-sm w-[45%] sm:w-[40%] flex flex-col justify-between gap-2 z-10">
          {arCards.map((arCard) => {
            const arConn = connections.find((c) => c.arId === arCard.id);
            const isArSelected =
              selectedAr === arCard.id || dragState?.sourceId === arCard.id;

            const rowStyle =
              arConn?.status === "correct"
                ? "bg-emerald-500/15 dark:bg-emerald-500/20 border border-emerald-500/70 text-emerald-900 dark:text-emerald-200"
                : arConn?.status === "wrong"
                ? "bg-rose-500/15 dark:bg-rose-500/20 border border-rose-500/70 text-rose-900 dark:text-rose-200"
                : arConn?.status === "pending" || isArSelected
                ? "bg-[#F3F0FF] dark:bg-indigo-950/60 border border-[#6741D9] text-[#4C28B5] dark:text-indigo-200 ring-2 ring-[#6741D9]/25"
                : "bg-stone-100/70 dark:bg-slate-700/50 hover:bg-stone-200/70 dark:hover:bg-slate-700 border border-stone-200/80 dark:border-slate-600/70 text-slate-800 dark:text-slate-100";

            const dotStyle =
              arConn?.status === "correct"
                ? "bg-emerald-500 ring-2 ring-emerald-500/30"
                : arConn?.status === "wrong"
                ? "bg-rose-500 ring-2 ring-rose-500/30"
                : arConn?.status === "pending" || isArSelected
                ? "bg-[#6741D9] ring-2 ring-[#6741D9]/30 scale-110"
                : "bg-slate-500 dark:bg-slate-400";

            return (
              <div
                key={arCard.id}
                role="button"
                tabIndex={0}
                data-ar-card-id={arCard.id}
                onPointerDown={(e) => handlePointerDownCard(e, arCard)}
                onClick={() => handleCardSelect(arCard)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    handleCardSelect(arCard);
                  }
                }}
                className={`h-auto min-h-[48px] px-2.5 py-2 sm:px-4 sm:py-3 rounded-xl flex items-center justify-between gap-2 cursor-pointer transition-all ${rowStyle}`}
              >
                {/* Sol İç Kenar: Orta Koridora Bakan Bağlantı Noktası (■) */}
                <span
                  ref={(el) => {
                    arSocketRefs.current[arCard.id] = el;
                  }}
                  className={`w-3 h-3 rounded-sm shrink-0 transition-all ${dotStyle}`}
                  aria-hidden="true"
                />

                {/* Orta/Sağ: Arapça Kelime (Harekeli & Tam Görünür, Kesilmez) */}
                <span
                  dir="rtl"
                  className={`arabic font-arabic font-bold break-words leading-snug line-clamp-2 flex-1 min-w-0 text-right ${
                    arCard.isSentence
                      ? "text-sm sm:text-xl"
                      : "text-lg sm:text-2xl"
                  }`}
                >
                  {formatAr(arCard.text)}
                </span>

                {/* Sağ Dış Kenar: Sadece Seslendirme Butonu (Eşleştirmeyi tetiklemez) */}
                <button
                  type="button"
                  title="Kelimeyi Dinle"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    playTTS(arCard.text, speechRate);
                  }}
                  className="w-6 h-6 sm:w-7 sm:h-7 rounded-lg bg-white/80 dark:bg-slate-800 border border-stone-200 dark:border-slate-600 flex items-center justify-center text-[#0CA678] hover:bg-emerald-50 dark:hover:bg-slate-700 shrink-0 cursor-pointer"
                >
                  <Volume2 size={13} />
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* 3. ALT SONUÇ VE AKSİYON ŞERİDİ (النَّتِيجَة / Sonuç) — TEK EKRAN KOMPAKT BAR */}
      <div className="border-t border-stone-200/80 dark:border-slate-700/80 mt-4 pt-3 transition-all duration-300">
        {!isCompleted && !isGameOver ? (
          <div className="flex flex-wrap items-center justify-between gap-2">
            {/* Sol: Bağlanan, Puan ve Sıfırla */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-2.5 py-1 rounded-xl bg-white dark:bg-[var(--background)] border border-[#E6D7BE] dark:border-slate-700 text-xs font-extrabold text-[var(--foreground)] tabular-nums">
                Bağlanan: {connections.length} / {totalPairs}
              </span>

              <span className="px-2.5 py-1 rounded-xl bg-white dark:bg-[var(--background)] border border-[#E6D7BE] dark:border-slate-700 text-xs font-extrabold text-[#087F5B] dark:text-emerald-400 tabular-nums">
                Bu Alıştırma Puanı: {exerciseScore}
              </span>

              <button
                type="button"
                onClick={handleRepeatSameSet}
                className="px-3 py-1 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-extrabold border-b-2 border-amber-700 active:translate-y-0.5 transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <RotateCcw size={13} />
                <span>Sıfırla</span>
              </button>

              {feedbackMode === "end" && !isExamEvaluated && (
                <button
                  type="button"
                  onClick={evaluateEndModeConnections}
                  disabled={connections.length === 0}
                  className="px-3 py-1 rounded-xl bg-[#6741D9] hover:bg-[#5230B5] disabled:opacity-45 text-white text-xs font-extrabold border-b-2 border-[#3b1f8c] flex items-center gap-1.5 cursor-pointer"
                >
                  <Check size={13} />
                  <span>Sonuçları Gör</span>
                </button>
              )}
            </div>

            {/* Sağ: النَّتِيجَة / Sonuç Göstergesi */}
            <div className="flex items-center gap-2 ml-auto">
              <span className="text-xs font-bold text-slate-600 dark:text-slate-300">
                Sonuç /{" "}
                <span dir="rtl" className="arabic font-arabic text-base font-bold">
                  {formatAr("النَّتِيجَة")}
                </span>
              </span>
              <span className="px-2.5 py-1 rounded-xl bg-[#fdfcf7] dark:bg-slate-800 border border-stone-300 dark:border-slate-600 text-xs font-black text-[#6741D9] dark:text-indigo-300 tabular-nums">
                {feedbackMode === "instant"
                  ? `${correctConnectionsCount} / ${totalPairs}`
                  : `${connections.length} / ${totalPairs}`}
              </span>
            </div>
          </div>
        ) : (
          /* OYUN TAMAMLANDIĞINDA TEK EKRAN GENİŞLEYEN SONUÇ VE AKSİYON BARI */
          <div className="bg-[#fdfcf7] dark:bg-slate-800/90 rounded-2xl border-2 border-emerald-500/40 dark:border-emerald-500/30 p-3 sm:p-3.5 space-y-2.5 animate-in fade-in duration-200">
            <div className="flex flex-wrap items-center justify-between gap-2">
              {/* Başlık & النَّتِيجَة */}
              <div className="flex items-center gap-2">
                <div
                  className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                    isGameOver && correctConnectionsCount < totalPairs
                      ? "bg-rose-100 text-rose-600 dark:bg-rose-950/60 dark:text-rose-300"
                      : "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300"
                  }`}
                >
                  {isGameOver && correctConnectionsCount < totalPairs ? (
                    <AlertCircle size={18} />
                  ) : (
                    <Trophy size={18} />
                  )}
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs sm:text-sm font-extrabold text-[var(--foreground)]">
                      {isGameOver && correctConnectionsCount < totalPairs
                        ? "Süre Doldu!"
                        : "Eşleştirme Tamamlandı!"}
                    </span>
                    <span
                      dir="rtl"
                      className="arabic font-arabic text-base font-bold text-[#087F5B] dark:text-emerald-400"
                    >
                      ({formatAr("النَّتِيجَة")})
                    </span>
                  </div>
                </div>
              </div>

              {/* Kompakt Sonuç Rozetleri */}
              <div className="flex flex-wrap items-center gap-1.5 text-xs font-extrabold tabular-nums">
                <span className="px-2.5 py-1 rounded-lg bg-[#F3F0FF] dark:bg-indigo-950/60 border border-[#6741D9]/40 text-[#6741D9] dark:text-indigo-300">
                  Başarı: %{accuracyPct}
                </span>
                <span className="px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300">
                  Doğru: {correctConnectionsCount}/{totalPairs}
                </span>
                <span className="px-2.5 py-1 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-700 text-rose-700 dark:text-rose-300">
                  Hatalı Deneme: {wrongAttemptsCount}
                </span>
                <span className="px-2.5 py-1 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-300">
                  Puan: {exerciseScore} (Toplam: {totalCumulativeScore})
                </span>
              </div>
            </div>

            {/* Kompakt Aksiyon Butonları */}
            <div className="flex flex-wrap items-center justify-end gap-2 pt-1 border-t border-dashed border-stone-200 dark:border-slate-700">
              <button
                type="button"
                onClick={handleRepeatSameSet}
                className="px-3 py-1.5 bg-white dark:bg-[var(--background)] hover:bg-[#EFE3CE] text-[var(--foreground)] font-extrabold text-xs rounded-xl border border-[#E6D7BE] dark:border-slate-600 border-b-2 active:translate-y-0.5 transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <RotateCcw size={14} className="text-[#6741D9]" />
                <span>Tekrar Yap</span>
              </button>

              {wrongPairsHistory.length > 0 && (
                <button
                  type="button"
                  onClick={handleRetryWrongPairs}
                  className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white font-extrabold text-xs rounded-xl border-b-2 border-amber-700 active:translate-y-0.5 transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <Target size={14} />
                  <span>
                    Yanlışlarımı Tekrarla ({wrongPairsHistory.length})
                  </span>
                </button>
              )}

              <button
                type="button"
                onClick={() => {
                  playClick();
                  initNewSet();
                }}
                className="px-3.5 py-1.5 bg-[#0CA678] hover:bg-[#099268] text-white font-extrabold text-xs rounded-xl border-b-2 border-[#087F5B] active:translate-y-0.5 transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <Play size={14} fill="currentColor" />
                <span>Devam Et (Yeni Set)</span>
              </button>

              {onClose && (
                <button
                  type="button"
                  onClick={() => {
                    playClick();
                    onClose();
                  }}
                  className="px-2.5 py-1.5 bg-white dark:bg-[var(--background)] hover:bg-rose-50 text-rose-700 font-extrabold text-xs rounded-xl border border-rose-200 border-b-2 active:translate-y-0.5 transition-all flex items-center gap-1 cursor-pointer"
                >
                  <X size={14} />
                  <span>Kapat</span>
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}