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
  CheckCircle2,
  XCircle,
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
  questionCount = 10,
  feedbackMode = "instant",
  onClose,
}: Props) {
  const pairTarget = Math.min(8, Math.max(4, Math.floor(questionCount / 2)));
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

  // Score tracking
  const [exerciseScore, setExerciseScore] = useState(0);
  const [totalCumulativeScore, setTotalCumulativeScore] = useState(0);

  // End-mode evaluation state
  const [isExamEvaluated, setIsExamEvaluated] = useState(false);
  const [showEndModal, setShowEndModal] = useState(false);
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
    isInstantCompleted || (feedbackMode === "end" && showEndModal);

  const handleTimeout = () => {
    if (feedbackMode === "end" && !isExamEvaluated) {
      evaluateEndModeConnections();
    }
    setIsGameOver(true);
    setShowEndModal(true);
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
    setExerciseScore(0);
    setSelectedAr(null);
    setSelectedTr(null);
    setIsExamEvaluated(false);
    setShowEndModal(false);
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
    const timer = setTimeout(updateSocketCoordinates, 40);
    window.addEventListener("resize", updateSocketCoordinates);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("resize", updateSocketCoordinates);
    };
  }, [trCards, arCards, connections, showEndModal, updateSocketCoordinates]);

  useEffect(() => {
    if (isInstantCompleted && !fanfarePlayedRef.current) {
      fanfarePlayedRef.current = true;
      addStudyMinutes(3);
      playFanfare();
      const t = setTimeout(() => setShowEndModal(true), 650);
      return () => clearTimeout(t);
    } else if (isGameOver && !fanfarePlayedRef.current) {
      fanfarePlayedRef.current = true;
      playError();
    }
  }, [isInstantCompleted, isGameOver, addStudyMinutes]);

  const recordWrongPair = (trMatchId: string, arMatchId: string) => {
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
    const evaluated: ArrowConnection[] = connections.map((c) => {
      const isOk = c.trMatchId === c.arMatchId;
      if (isOk) {
        gained += 10;
      } else {
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

    setConnections(evaluated);
    setExerciseScore(gained);
    setTotalCumulativeScore((s) => s + gained);
    setIsExamEvaluated(true);
    addStudyMinutes(3);
    playFanfare();
    setShowEndModal(true);
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
      const arCardEl = targetEl.closest("[data-ar-card-id]") as HTMLElement | null;
      const targetArId = arCardEl?.getAttribute("data-ar-card-id");
      if (targetArId) {
        const arObj = arCards.find((c) => c.id === targetArId);
        if (arObj) playTTS(arObj.text, speechRate);
        connectPair(currentDrag.sourceId, targetArId);
      }
    } else {
      const trCardEl = targetEl.closest("[data-tr-card-id]") as HTMLElement | null;
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
    // Pad to at least 2 pairs if only 1 wrong pair exists so matching works smoothly
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

  const wrongCount =
    feedbackMode === "end" && isExamEvaluated
      ? totalPairs - correctConnectionsCount
      : wrongPairsHistory.length;

  const accuracyPct =
    totalPairs > 0
      ? Math.round((correctConnectionsCount / totalPairs) * 100)
      : 0;

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      {/* BİTİŞ / SONUÇ EKRANI KARTI */}
      {showEndModal && (
        <div className="bg-[#F7EFE1] dark:bg-[var(--surface)] rounded-2xl border-2 border-[#E6D7BE] dark:border-[var(--border)] border-b-4 p-5 sm:p-7 text-center space-y-5 animate-in fade-in zoom-in-95 duration-200">
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 border-b border-dashed border-[#E2D3B8] pb-4">
            <div
              className={`w-16 h-16 rounded-2xl border-2 border-b-4 flex items-center justify-center shrink-0 ${
                correctConnectionsCount === totalPairs
                  ? "bg-emerald-50 border-[#0CA678] text-[#0CA678]"
                  : "bg-[#F3F0FF] border-[#6741D9] text-[#6741D9]"
              }`}
            >
              {isGameOver && correctConnectionsCount < totalPairs ? (
                <AlertCircle size={34} />
              ) : (
                <Trophy size={34} />
              )}
            </div>
            <div className="text-center sm:text-left">
              <h3 className="text-xl sm:text-2xl font-extrabold text-[var(--foreground)]">
                {isGameOver && correctConnectionsCount < totalPairs
                  ? "Süre Doldu! Eşleştirme Sonuçları"
                  : "Eşleştirme Alıştırması Tamamlandı!"}
              </h3>
              <p className="text-xs font-semibold text-[var(--muted)]">
                Oklarla yaptığınız eşleştirmelerin başarı özeti ve detaylı dökümü
              </p>
            </div>
          </div>

          {/* İSTATİSTİK KUTULARI */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <div className="bg-white dark:bg-[var(--background)] p-3 rounded-xl border border-[#E6D7BE]">
              <span className="block text-[10px] font-bold uppercase text-[var(--muted)]">
                Başarı Yüzdesi
              </span>
              <span className="text-xl font-black text-[#6741D9]">
                %{accuracyPct}
              </span>
            </div>
            <div className="bg-emerald-50/80 dark:bg-emerald-950/30 p-3 rounded-xl border border-emerald-300">
              <span className="block text-[10px] font-bold uppercase text-emerald-700 dark:text-emerald-300">
                Doğru Eşleşme
              </span>
              <span className="text-xl font-black text-emerald-700 dark:text-emerald-300">
                {correctConnectionsCount} / {totalPairs}
              </span>
            </div>
            <div className="bg-rose-50/80 dark:bg-rose-950/30 p-3 rounded-xl border border-rose-300">
              <span className="block text-[10px] font-bold uppercase text-rose-700 dark:text-rose-300">
                Hatalı Deneme
              </span>
              <span className="text-xl font-black text-rose-700 dark:text-rose-300">
                {wrongPairsHistory.length}
              </span>
            </div>
            <div className="bg-amber-50/80 dark:bg-amber-950/30 p-3 rounded-xl border border-amber-300">
              <span className="block text-[10px] font-bold uppercase text-amber-800 dark:text-amber-300">
                Bu Alıştırma Puanı
              </span>
              <span className="text-xl font-black text-amber-700 dark:text-amber-300">
                {exerciseScore} Puan
              </span>
            </div>
          </div>

          {/* EŞLEŞTİRME DÖKÜMÜ */}
          <div className="text-left space-y-1.5 max-h-52 overflow-y-auto pr-1">
            {currentPairs.map((pair) => {
              const userConn = connections.find(
                (c) => c.trMatchId === pair.matchId
              );
              const isOk =
                userConn?.status === "correct" &&
                !wrongPairsHistory.some((w) => w.matchId === pair.matchId);
              return (
                <div
                  key={pair.matchId}
                  className={`flex items-center justify-between gap-2 px-3 py-2 rounded-xl border text-xs ${
                    isOk
                      ? "bg-emerald-50/60 dark:bg-emerald-950/20 border-emerald-300"
                      : "bg-rose-50/60 dark:bg-rose-950/20 border-rose-300"
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {isOk ? (
                      <CheckCircle2
                        size={15}
                        className="text-emerald-600 shrink-0"
                      />
                    ) : (
                      <XCircle size={15} className="text-rose-600 shrink-0" />
                    )}
                    <span className="font-bold text-[var(--foreground)] truncate">
                      {pair.trText}
                    </span>
                  </div>
                  <span
                    dir="rtl"
                    className="arabic text-lg font-bold text-[#087F5B] dark:text-emerald-300 shrink-0"
                  >
                    {formatAr(pair.arText)}
                  </span>
                </div>
              );
            })}
          </div>

          {/* 4 STANDART BİTİŞ AKSİYON BUTONU */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
            <button
              type="button"
              onClick={handleRepeatSameSet}
              className="py-3 px-4 bg-white dark:bg-[var(--background)] hover:bg-[#EFE3CE] text-[var(--foreground)] font-extrabold text-xs sm:text-sm rounded-xl border-2 border-[#E6D7BE] border-b-4 active:border-b-2 active:translate-y-0.5 transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <RotateCcw size={16} className="text-[#6741D9]" />
              <span>🔄 Tekrar Yap (Aynı Set)</span>
            </button>

            <button
              type="button"
              onClick={() => {
                playClick();
                initNewSet();
              }}
              className="py-3 px-4 bg-[#0CA678] hover:bg-[#099268] text-white font-extrabold text-xs sm:text-sm rounded-xl border-b-4 border-[#087F5B] active:border-b-0 active:translate-y-0.5 transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <Play size={16} fill="currentColor" />
              <span>▶️ Devam Et (Yeni Set)</span>
            </button>

            {wrongPairsHistory.length > 0 && (
              <button
                type="button"
                onClick={handleRetryWrongPairs}
                className="py-3 px-4 bg-amber-500 hover:bg-amber-600 text-white font-extrabold text-xs sm:text-sm rounded-xl border-b-4 border-amber-700 active:border-b-0 active:translate-y-0.5 transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <Target size={16} />
                <span>
                  🎯 Yanlışlarımı Tekrarla ({wrongPairsHistory.length})
                </span>
              </button>
            )}

            {onClose && (
              <button
                type="button"
                onClick={() => {
                  playClick();
                  onClose();
                }}
                className={`py-3 px-4 bg-white dark:bg-[var(--background)] hover:bg-rose-50 text-rose-700 font-extrabold text-xs sm:text-sm rounded-xl border-2 border-rose-200 border-b-4 active:border-b-2 active:translate-y-0.5 transition-all flex items-center justify-center gap-2 cursor-pointer ${
                  wrongPairsHistory.length === 0 ? "sm:col-span-2" : ""
                }`}
              >
                <X size={16} />
                <span>✖️ Kapat / Alıştırma Merkezine Dön</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* ÜST DURUM VE YÖNERGE ÇUBUĞU */}
      <div className="bg-[#F7EFE1] dark:bg-[var(--surface)] rounded-2xl border-2 border-[#E6D7BE] dark:border-[var(--border)] border-b-4 px-4 py-2.5 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <span className="text-xs sm:text-sm font-extrabold text-[var(--foreground)] tabular-nums">
            Bağlanan: {connections.length} / {totalPairs}
          </span>
          <span className="hidden sm:inline text-[11px] font-semibold text-[var(--muted)]">
            • Soketlerden sürükleyip bırakın veya iki karta tıklayarak ok çizin
          </span>
        </div>

        <div className="flex items-center gap-2">
          {timeLeft !== null && (
            <div
              className={`flex items-center gap-1.5 px-3 py-1 rounded-xl border text-xs sm:text-sm font-black tabular-nums ${
                timeLeft <= 5
                  ? "bg-red-100 border-red-300 text-red-700 animate-pulse"
                  : "bg-white dark:bg-[var(--background)] border-[#E6D7BE] text-amber-700"
              }`}
            >
              <Timer size={15} />
              <span>00:{timeLeft.toString().padStart(2, "0")}</span>
            </div>
          )}

          {feedbackMode === "end" && !isExamEvaluated && (
            <button
              type="button"
              onClick={evaluateEndModeConnections}
              disabled={connections.length === 0}
              className="px-3.5 py-1.5 rounded-xl bg-[#6741D9] hover:bg-[#5230B5] disabled:opacity-45 text-white text-xs font-extrabold border-b-2 border-[#3b1f8c] flex items-center gap-1.5 cursor-pointer"
            >
              <Check size={14} />
              <span>✅ Alıştırmayı Bitir ve Sonuçları Gör</span>
            </button>
          )}
        </div>
      </div>

      {/* SÜTUN BAŞLIKLARI */}
      <div className="grid grid-cols-2 gap-10 sm:gap-20 px-2 text-[11px] font-extrabold uppercase tracking-wider text-[var(--muted)]">
        <div className="text-center">🇹🇷 Türkçe Anlam / Çeviri</div>
        <div className="text-center">🇸🇦 Arapça İfade / Kelime</div>
      </div>

      {/* İNTERAKTİF OK ÇİZMELİ (SVG ARROW DRAG & DROP) EŞLEŞTİRME TAHTASI */}
      <div
        ref={boardRef}
        onPointerMove={handleBoardPointerMove}
        onPointerUp={handleBoardPointerUp}
        className="relative grid grid-cols-2 gap-10 sm:gap-20 items-stretch auto-rows-fr select-none touch-pan-y"
      >
        {/* DİNAMİK VEKTÖREL SVG OK KATMANI */}
        <svg
          className="absolute inset-0 w-full h-full pointer-events-none z-10 overflow-visible"
          aria-hidden="true"
        >
          <defs>
            <marker
              id="arrow-green"
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 1 L 10 5 L 0 9 z" fill="#10b981" />
            </marker>
            <marker
              id="arrow-red"
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 1 L 10 5 L 0 9 z" fill="#ef4444" />
            </marker>
            <marker
              id="arrow-indigo"
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 1 L 10 5 L 0 9 z" fill="#6366f1" />
            </marker>
          </defs>

          {/* Kalıcı Bağlantı Okları */}
          {connections.map((conn) => {
            const p1 = socketCoords.tr[conn.trId];
            const p2 = socketCoords.ar[conn.arId];
            if (!p1 || !p2) return null;

            const strokeColor =
              conn.status === "correct"
                ? "#10b981"
                : conn.status === "wrong"
                ? "#ef4444"
                : "#6366f1";
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
                  strokeWidth={3.5}
                  strokeLinecap="round"
                  markerEnd={markerId}
                />
                <circle cx={p1.x} cy={p1.y} r={4.5} fill={strokeColor} />
              </g>
            );
          })}

          {/* Sürükleme Esnasında Canlı Çizilen Ok */}
          {dragState && (
            <g>
              <line
                x1={dragState.startPoint.x}
                y1={dragState.startPoint.y}
                x2={dragState.currentPoint.x}
                y2={dragState.currentPoint.y}
                stroke="#6366f1"
                strokeWidth={3}
                strokeDasharray="5 4"
                strokeLinecap="round"
                markerEnd="url(#arrow-indigo)"
              />
              <circle
                cx={dragState.startPoint.x}
                cy={dragState.startPoint.y}
                r={5}
                fill="#6366f1"
              />
            </g>
          )}
        </svg>

        {trCards.map((trCard, idx) => {
          const arCard = arCards[idx];
          if (!arCard) return null;

          const trConn = connections.find((c) => c.trId === trCard.id);
          const arConn = connections.find((c) => c.arId === arCard.id);

          const isTrSelected =
            selectedTr === trCard.id || dragState?.sourceId === trCard.id;
          const isArSelected =
            selectedAr === arCard.id || dragState?.sourceId === arCard.id;

          const trBorderStyle =
            trConn?.status === "correct"
              ? "bg-emerald-50/90 dark:bg-emerald-950/30 border-emerald-500 text-emerald-900 dark:text-emerald-200"
              : trConn?.status === "wrong"
              ? "bg-rose-50/90 dark:bg-rose-950/30 border-rose-500 text-rose-900 dark:text-rose-200"
              : trConn?.status === "pending" || isTrSelected
              ? "bg-[#F3F0FF] dark:bg-[var(--lavender-bg)] border-[#6741D9] text-[#4C28B5]"
              : "bg-[#F7EFE1] dark:bg-[var(--surface)] border-[#E6D7BE] dark:border-[var(--border)] hover:border-[#6741D9] text-[var(--foreground)]";

          const arBorderStyle =
            arConn?.status === "correct"
              ? "bg-emerald-50/90 dark:bg-emerald-950/30 border-emerald-500 text-emerald-900 dark:text-emerald-200"
              : arConn?.status === "wrong"
              ? "bg-rose-50/90 dark:bg-rose-950/30 border-rose-500 text-rose-900 dark:text-rose-200"
              : arConn?.status === "pending" || isArSelected
              ? "bg-[#F3F0FF] dark:bg-[var(--lavender-bg)] border-[#6741D9] text-[#4C28B5]"
              : "bg-[#F7EFE1] dark:bg-[var(--surface)] border-[#E6D7BE] dark:border-[var(--border)] hover:border-[#6741D9] text-[var(--foreground)]";

          const trSocketColor =
            trConn?.status === "correct"
              ? "bg-emerald-500 border-emerald-700"
              : trConn?.status === "wrong"
              ? "bg-rose-500 border-rose-700"
              : trConn?.status === "pending" || isTrSelected
              ? "bg-[#6741D9] border-[#4C28B5]"
              : "bg-slate-600 border-slate-800";

          const arSocketColor =
            arConn?.status === "correct"
              ? "bg-emerald-500 border-emerald-700"
              : arConn?.status === "wrong"
              ? "bg-rose-500 border-rose-700"
              : arConn?.status === "pending" || isArSelected
              ? "bg-[#6741D9] border-[#4C28B5]"
              : "bg-slate-600 border-slate-800";

          return (
            <div key={`${trCard.id}-${arCard.id}`} className="contents">
              {/* SOL SÜTUN: TÜRKÇE KART (SAĞ İÇ KENARINDA BAĞLANTI SOKETİ ▪) */}
              <button
                type="button"
                data-tr-card-id={trCard.id}
                onPointerDown={(e) => handlePointerDownCard(e, trCard)}
                onClick={() => handleCardSelect(trCard)}
                className={`relative w-full h-full min-h-[74px] sm:min-h-[84px] flex items-center justify-center text-center px-3.5 py-2.5 pr-6 rounded-2xl border-2 border-b-4 transition-all font-extrabold text-xs sm:text-sm leading-snug cursor-pointer ${trBorderStyle}`}
              >
                <span className="line-clamp-3">{trCard.text}</span>

                {/* Sağ İç Kenar Soket Noktası (▪) */}
                <span
                  ref={(el) => {
                    trSocketRefs.current[trCard.id] = el;
                  }}
                  className={`absolute -right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-xs border-2 shadow-xs transition-transform ${trSocketColor}`}
                  aria-hidden="true"
                />
              </button>

              {/* SAĞ SÜTUN: ARAPÇA KART (SOL İÇ KENARINDA BAĞLANTI SOKETİ ▪) */}
              <button
                type="button"
                data-ar-card-id={arCard.id}
                onPointerDown={(e) => handlePointerDownCard(e, arCard)}
                onClick={() => handleCardSelect(arCard)}
                className={`relative w-full h-full min-h-[74px] sm:min-h-[84px] flex items-center justify-center text-center px-3.5 py-2.5 pl-6 rounded-2xl border-2 border-b-4 transition-all cursor-pointer ${arBorderStyle}`}
              >
                {/* Sol İç Kenar Soket Noktası (▪) */}
                <span
                  ref={(el) => {
                    arSocketRefs.current[arCard.id] = el;
                  }}
                  className={`absolute -left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-xs border-2 shadow-xs transition-transform ${arSocketColor}`}
                  aria-hidden="true"
                />

                <div className="flex items-center justify-center gap-1.5">
                  <Volume2
                    size={13}
                    className="text-[#0CA678] opacity-75 shrink-0"
                  />
                  <span
                    dir="rtl"
                    className={`arabic font-bold leading-snug line-clamp-2 ${
                      arCard.isSentence
                        ? "text-lg sm:text-2xl"
                        : "text-2xl sm:text-3xl"
                    }`}
                  >
                    {formatAr(arCard.text)}
                  </span>
                </div>
              </button>
            </div>
          );
        })}
      </div>

      {/* ALT PUAN VE SIFIRLAMA KONTROL ÇUBUĞU */}
      <div className="bg-[#F7EFE1] dark:bg-[var(--surface)] rounded-2xl border-2 border-[#E6D7BE] dark:border-[var(--border)] border-b-4 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="bg-white dark:bg-[var(--background)] px-3.5 py-1.5 rounded-xl border border-[#E6D7BE] text-center">
            <span className="block text-[10px] font-bold text-[var(--muted)]">
              Bu Alıştırma Puanı
            </span>
            <span className="text-sm sm:text-base font-black text-[#087F5B] tabular-nums">
              {exerciseScore}
            </span>
          </div>

          <div className="bg-white dark:bg-[var(--background)] px-3.5 py-1.5 rounded-xl border border-[#E6D7BE] text-center">
            <span className="block text-[10px] font-bold text-[var(--muted)]">
              Toplam Puan
            </span>
            <span className="text-sm sm:text-base font-black text-[#6741D9] tabular-nums">
              {totalCumulativeScore}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {feedbackMode === "end" && !isExamEvaluated && (
            <button
              type="button"
              onClick={evaluateEndModeConnections}
              disabled={connections.length === 0}
              className="px-4 py-2 rounded-xl bg-[#6741D9] hover:bg-[#5230B5] disabled:opacity-45 text-white text-xs sm:text-sm font-extrabold border-b-3 border-[#3b1f8c] flex items-center gap-1.5 cursor-pointer"
            >
              <Check size={15} />
              <span>Kontrol Et</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleRepeatSameSet}
            className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs sm:text-sm font-extrabold border-b-3 border-amber-700 active:border-b-0 active:translate-y-0.5 transition-all flex items-center gap-1.5 cursor-pointer"
          >
            <RotateCcw size={14} />
            <span>🔄 Alıştırmayı Sıfırla</span>
          </button>
        </div>
      </div>
    </div>
  );
}