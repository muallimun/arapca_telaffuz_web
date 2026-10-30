"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import {
  playSuccess,
  playError,
  playFanfare,
  playClick,
} from "@/lib/sfxManager";
import { Dialogue, DictionaryItem } from "@/types/data";
import { shuffleArray, selectSmartWordDistractors } from "@/lib/quiz";
import {
  CheckCircle2,
  XCircle,
  RefreshCcw,
  Trophy,
  Timer,
  AlertCircle,
  Volume2,
  ArrowLeft,
  ArrowRight,
  MessageSquareQuote,
  BookOpen,
  Play,
  Target,
  X,
  ListChecks,
  Eye,
  Share2,
  Sparkles,
} from "lucide-react";
import { useCountdown } from "@/lib/useTimer";
import { speakHybrid, playTTS } from "@/lib/audio";
import { useSettings } from "@/store/settings";
import { useUserStore } from "@/store/userStore";
import { formatArabicText } from "@/lib/arabicTextUtils";
import ShareAchievementModal from "@/components/ui/ShareAchievementModal";
import { ArabicIdiom } from "@/lib/arabicIdioms";
import { normalizeToCanonicalMistakeId } from "@/lib/mistakeUtils";

export type QuizContentType = "words" | "idioms" | "sentences" | "mixed";
export type FeedbackMode = "instant" | "end";

export interface QuizQuestionItem {
  id: string;
  kind: "word" | "idiom" | "sentence";
  arabic: string;
  turkish: string;
  metaLabel: string;
  wordId?: string;
  literalTr?: string;
  usageNote?: string;
  options: { text: string; isCorrect: boolean }[];
}

function formatWordTurLabel(tur?: string): string {
  const normalized = (tur || "").trim().toLowerCase();
  if (normalized === "isim") return "İsim";
  if (normalized === "fiil") return "Fiil";
  if (normalized === "edat" || normalized === "harf") return "Edat";
  if (normalized === "ifade") return "Kalıp İfade";
  if (
    normalized === "ozel-isim" ||
    normalized === "özel isim" ||
    normalized === "özel-isim"
  ) {
    return "Özel İsim";
  }
  if (!normalized) return "İsim";
  return (
    normalized.charAt(0).toLocaleUpperCase("tr-TR") + normalized.slice(1)
  );
}

interface Props {
  vocabulary: DictionaryItem[];
  idioms?: ArabicIdiom[];
  dialogues?: Dialogue[];
  contentType?: QuizContentType;
  feedbackMode?: FeedbackMode;
  timeLimit: number | null;
  questionCount?: number;
  isMistakesMode?: boolean;
  onClose?: () => void;
}

export default function MultipleChoice({
  vocabulary,
  idioms = [],
  dialogues = [],
  contentType = "words",
  feedbackMode = "instant",
  timeLimit,
  questionCount = 10,
  isMistakesMode: _isMistakesMode = false,
  onClose,
}: Props) {
  const fanfarePlayedRef = useRef(false);
  const wrongAttemptedQuestionsRef = useRef<Set<string>>(new Set());
  const [roundSeed, setRoundSeed] = useState(0);
  const [customQuestions, setCustomQuestions] = useState<
    QuizQuestionItem[] | null
  >(null);
  const { speechRate, showHareke, arabicFont } = useSettings();
  const { addStudyMinutes, addMistake, recordItemAttempt } = useUserStore();

  const itemsSignature = useMemo(
    () =>
      `${vocabulary.map((v) => v.id).join("|")}::${idioms
        .map((i) => i.id)
        .join("|")}::${dialogues.map((d) => d.id).join("|")}`,
    [vocabulary, idioms, dialogues]
  );

  const generatedQuestions: QuizQuestionItem[] = useMemo(() => {
    const wordPool: {
      id: string;
      arabic: string;
      turkish: string;
      metaLabel: string;
      wordId: string;
    }[] = vocabulary
      .map((w) => ({
        id: `w-${w.id}`,
        arabic: (w.mufret || w.mazi || "").split("/")[0].trim(),
        turkish: w.anlam_tr,
        metaLabel: `Tür: ${formatWordTurLabel(w.tur)}${
          w.kok && w.kok !== "-" ? ` · Kök: ${w.kok}` : ""
        }`,
        wordId: w.id,
      }))
      .filter((w) => w.arabic.length > 0 && w.turkish.length > 0);

    const idiomPool: {
      id: string;
      arabic: string;
      turkish: string;
      metaLabel: string;
      literalTr?: string;
      usageNote?: string;
    }[] = idioms
      .map((idm) => ({
        id: `idm-${idm.id}`,
        arabic: idm.arabic.trim(),
        turkish: idm.meaningTr.trim(),
        metaLabel: `✨ Kalıp İfade · Seviye: ${idm.level || "A1-B2"}`,
        literalTr: idm.literalTr,
        usageNote: idm.usageNote,
      }))
      .filter((i) => i.arabic.length > 0 && i.turkish.length > 0);

    const sentencePool: {
      id: string;
      arabic: string;
      turkish: string;
      metaLabel: string;
    }[] = [];

    dialogues.forEach((dlg) => {
      const dlgNum = dlg.id.replace("dlg_", "");
      dlg.satirlar.forEach((line) => {
        if (line.arapca.trim() && line.turkce.trim()) {
          sentencePool.push({
            id: `s-${dlg.id}-${line.sira}`,
            arabic: line.arapca.trim(),
            turkish: line.turkce.trim(),
            metaLabel: `Diyalog #${dlgNum}: ${dlg.baslik_tr} (${line.konusmaci})`,
          });
        }
      });
    });

    const vocabById = new Map<string, DictionaryItem>();
    for (const w of vocabulary) {
      vocabById.set(w.id, w);
    }

    const buildWordQuestion = (
      target: (typeof wordPool)[number]
    ): QuizQuestionItem => {
      const targetItem = vocabById.get(target.wordId);
      const distractors = targetItem
        ? selectSmartWordDistractors(targetItem, vocabulary, 3).map((d) => ({
            text: d.anlam_tr,
            isCorrect: false,
          }))
        : shuffleArray(
            wordPool.filter(
              (w) => w.id !== target.id && w.turkish !== target.turkish
            )
          )
            .slice(0, 3)
            .map((d) => ({ text: d.turkish, isCorrect: false }));

      return {
        id: target.id,
        kind: "word",
        arabic: target.arabic,
        turkish: target.turkish,
        metaLabel: target.metaLabel,
        wordId: target.wordId,
        options: shuffleArray([
          { text: target.turkish, isCorrect: true },
          ...distractors,
        ]),
      };
    };

    const buildIdiomQuestion = (
      target: (typeof idiomPool)[number]
    ): QuizQuestionItem => {
      let distractorCandidates = idiomPool.filter(
        (i) => i.id !== target.id && i.turkish !== target.turkish
      );
      if (distractorCandidates.length < 3) {
        const fallbackWords = wordPool
          .filter((w) => w.turkish !== target.turkish)
          .map((w) => ({
            id: w.id,
            arabic: w.arabic,
            turkish: w.turkish,
            metaLabel: w.metaLabel,
          }));
        distractorCandidates = [...distractorCandidates, ...fallbackWords];
      }
      const distractors = shuffleArray(distractorCandidates)
        .slice(0, 3)
        .map((d) => ({ text: d.turkish, isCorrect: false }));

      return {
        id: target.id,
        kind: "idiom",
        arabic: target.arabic,
        turkish: target.turkish,
        metaLabel: target.metaLabel,
        literalTr: target.literalTr,
        usageNote: target.usageNote,
        options: shuffleArray([
          { text: target.turkish, isCorrect: true },
          ...distractors,
        ]),
      };
    };

    const buildSentenceQuestion = (
      target: (typeof sentencePool)[number]
    ): QuizQuestionItem => {
      const distractors = shuffleArray(
        sentencePool.filter(
          (s) => s.id !== target.id && s.turkish !== target.turkish
        )
      )
        .slice(0, 3)
        .map((d) => ({ text: d.turkish, isCorrect: false }));

      return {
        id: target.id,
        kind: "sentence",
        arabic: target.arabic,
        turkish: target.turkish,
        metaLabel: target.metaLabel,
        options: shuffleArray([
          { text: target.turkish, isCorrect: true },
          ...distractors,
        ]),
      };
    };

    if (contentType === "idioms" && idiomPool.length > 0) {
      return shuffleArray(idiomPool)
        .slice(0, questionCount)
        .map(buildIdiomQuestion);
    }

    if (contentType === "sentences" && sentencePool.length >= 4) {
      return shuffleArray(sentencePool)
        .slice(0, questionCount)
        .map(buildSentenceQuestion);
    }

    if (contentType === "mixed") {
      const combinedQuestions: QuizQuestionItem[] = [
        ...shuffleArray(wordPool).slice(0, questionCount).map(buildWordQuestion),
        ...shuffleArray(idiomPool).slice(0, questionCount).map(buildIdiomQuestion),
        ...shuffleArray(sentencePool)
          .slice(0, questionCount)
          .map(buildSentenceQuestion),
      ];
      return shuffleArray(combinedQuestions).slice(0, questionCount);
    }

    return shuffleArray(wordPool)
      .slice(0, questionCount)
      .map(buildWordQuestion);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemsSignature, contentType, questionCount, roundSeed]);

  const questions = customQuestions || generatedQuestions;
  const questionsSignature = useMemo(
    () => questions.map((q) => q.id).join("|"),
    [questions]
  );

  const [currentIndex, setCurrentIndex] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [userAnswers, setUserAnswers] = useState<
    Record<number, { chosen: string; isCorrect: boolean }>
  >({});
  const [isFinished, setIsFinished] = useState(false);
  const [isTimeUp, setIsTimeUp] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [resultViewMode, setResultViewMode] = useState<"summary" | "review">(
    "summary"
  );
  const [reviewIndex, setReviewIndex] = useState(0);

  const handleTimeout = () => setIsTimeUp(true);
  const timeLeft = useCountdown(
    timeLimit,
    handleTimeout,
    !isFinished && !isTimeUp
  );

  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      setSelected(userAnswers[currentIndex]?.chosen ?? null);
    });
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex, questionsSignature]);

  useEffect(() => {
    if (isFinished && !fanfarePlayedRef.current) {
      fanfarePlayedRef.current = true;
      addStudyMinutes(3);
      playFanfare();
    } else if (isTimeUp && !fanfarePlayedRef.current) {
      fanfarePlayedRef.current = true;
      playError();
    }
  }, [isFinished, isTimeUp, addStudyMinutes]);

  if (questions.length < 1) {
    return (
      <p className="text-center p-8 text-sm font-bold text-[var(--muted)]">
        Test oluşturmak için yeterli soru kaynağı bulunamadı.
      </p>
    );
  }

  const currentQuestion = questions[currentIndex] || questions[0];
  const displayArabic = formatArabicText(
    currentQuestion.arabic,
    showHareke,
    arabicFont
  );

  const correctCount = Object.values(userAnswers).filter(
    (a) => a.isCorrect
  ).length;

  const handleListenQuestion = (qTarget: QuizQuestionItem = currentQuestion) => {
    playClick();
    if (qTarget.kind === "word" && qTarget.wordId) {
      speakHybrid({
        text: qTarget.arabic,
        wordId: qTarget.wordId,
        rate: speechRate,
      });
    } else {
      playTTS(qTarget.arabic, speechRate);
    }
  };

  const handleSelect = (text: string, isCorrect: boolean) => {
    if (isTimeUp) return;
    if (feedbackMode === "instant" && selected) return;

    const hadPreviousAttempt =
      wrongAttemptedQuestionsRef.current.has(currentQuestion.id) ||
      userAnswers[currentIndex] !== undefined;
    const canonicalId = normalizeToCanonicalMistakeId(
      currentQuestion.wordId || currentQuestion.id,
      currentQuestion.arabic
    );

    if (!isCorrect) {
      wrongAttemptedQuestionsRef.current.add(currentQuestion.id);
      if (canonicalId) {
        addMistake(canonicalId);
        recordItemAttempt(canonicalId, currentQuestion.kind, false, false);
      }
    } else if (!hadPreviousAttempt && canonicalId) {
      recordItemAttempt(canonicalId, currentQuestion.kind, true, false);
    }

    setSelected(text);
    setUserAnswers((prev) => ({
      ...prev,
      [currentIndex]: { chosen: text, isCorrect },
    }));

    if (feedbackMode === "instant") {
      if (isCorrect) {
        playSuccess();
      } else {
        playError();
      }
    } else {
      playClick();
    }
  };

  const prevQuestion = () => {
    if (currentIndex > 0) {
      playClick();
      setCurrentIndex((prev) => prev - 1);
    }
  };

  const nextQuestion = () => {
    playClick();
    if (currentIndex < questions.length - 1) {
      setCurrentIndex((prev) => prev + 1);
    } else {
      setResultViewMode("summary");
      setReviewIndex(0);
      setIsFinished(true);
    }
  };

  // 1) Tekrar Yap (Aynı soruları karıştırarak baştan başlat)
  const handleRepeatSameSet = () => {
    playClick();
    fanfarePlayedRef.current = false;
    const reshuffled = shuffleArray(
      questions.map((q) => ({
        ...q,
        options: shuffleArray([...q.options]),
      }))
    );
    setCustomQuestions(reshuffled);
    setCurrentIndex(0);
    setUserAnswers({});
    setSelected(null);
    setResultViewMode("summary");
    setReviewIndex(0);
    setIsFinished(false);
    setIsTimeUp(false);
  };

  // 2) Devam Et (Yeni Set)
  const handleStartNewSet = () => {
    playClick();
    fanfarePlayedRef.current = false;
    setCustomQuestions(null);
    setRoundSeed((s) => s + 1);
    setCurrentIndex(0);
    setUserAnswers({});
    setSelected(null);
    setResultViewMode("summary");
    setReviewIndex(0);
    setIsFinished(false);
    setIsTimeUp(false);
  };

  // 3) Yanlışlarımı Tekrarla
  const wrongQuestions = questions.filter(
    (_, idx) => !userAnswers[idx]?.isCorrect
  );

  const handleRetryWrongOnly = () => {
    if (wrongQuestions.length === 0) return;
    playClick();
    fanfarePlayedRef.current = false;
    const retryList = shuffleArray(
      wrongQuestions.map((q) => ({
        ...q,
        options: shuffleArray([...q.options]),
      }))
    );
    setCustomQuestions(retryList);
    setCurrentIndex(0);
    setUserAnswers({});
    setSelected(null);
    setResultViewMode("summary");
    setReviewIndex(0);
    setIsFinished(false);
    setIsTimeUp(false);
  };

  if (isFinished || isTimeUp) {
    const wrongCount = questions.length - correctCount;
    const pct = Math.round((correctCount / questions.length) * 100);
    const totalPoints = correctCount * 10;
    const reviewQ = questions[reviewIndex] || questions[0];
    const reviewAns = userAnswers[reviewIndex];

    return (
      <div className="bg-[#F7EFE1] dark:bg-[var(--surface)] rounded-2xl border-2 border-[#E6D7BE] dark:border-[var(--border)] border-b-4 p-5 sm:p-7 space-y-4 max-w-2xl mx-auto">
        <div className="text-center space-y-3">
          <div
            className={`w-16 h-16 rounded-2xl border-2 border-b-4 flex items-center justify-center mx-auto ${
              isFinished
                ? "bg-[#F3F0FF] border-[#6741D9] text-[#6741D9]"
                : "bg-red-50 border-red-300 text-red-600"
            }`}
          >
            {isFinished ? <Trophy size={32} /> : <AlertCircle size={32} />}
          </div>

          <div className="space-y-1">
            <h3 className="text-xl sm:text-2xl font-extrabold text-[var(--foreground)]">
              {isFinished ? "Çoktan Seçmeli Test Tamamlandı!" : "Süre Doldu!"}
            </h3>
            <p className="text-xs font-semibold text-[var(--muted)]">
              Toplam {questions.length} sorudan {correctCount} doğru,{" "}
              {wrongCount} yanlış yanıt verdiniz
            </p>
          </div>

          <div className="grid grid-cols-4 gap-2 text-center pt-1">
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
                Doğru
              </span>
              <span className="text-lg font-black text-emerald-700 tabular-nums">
                {correctCount}
              </span>
            </div>
            <div className="bg-rose-50 dark:bg-rose-950/40 rounded-xl p-2.5 border border-rose-300">
              <span className="block text-[10px] font-bold text-rose-700 uppercase">
                Yanlış
              </span>
              <span className="text-lg font-black text-rose-700 tabular-nums">
                {wrongCount}
              </span>
            </div>
            <div className="bg-amber-50 dark:bg-amber-950/40 rounded-xl p-2.5 border border-amber-300">
              <span className="block text-[10px] font-bold text-amber-800 uppercase">
                Puan
              </span>
              <span className="text-lg font-black text-amber-800 tabular-nums">
                {totalPoints}
              </span>
            </div>
          </div>
        </div>

        {/* SONUÇ EKRANI SORU GEZGİNİ (1..N) + GÖRÜNÜM MODU ANAHTARI */}
        <div className="bg-white/70 dark:bg-[var(--background)] rounded-xl p-3 border border-[#E6D7BE] dark:border-[var(--border)] space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-[var(--muted)]">
              Soru Gezgini (İncelemek için numaraya tıklayın)
            </span>
            <div className="flex items-center gap-1 bg-[#F7EFE1] dark:bg-[var(--surface)] p-0.5 rounded-lg border border-[#E6D7BE]">
              <button
                type="button"
                onClick={() => {
                  playClick();
                  setResultViewMode("summary");
                }}
                className={`px-2.5 py-1 rounded-md text-[11px] font-extrabold flex items-center gap-1 transition-all cursor-pointer ${
                  resultViewMode === "summary"
                    ? "bg-[#087F5B] text-white shadow-2xs"
                    : "text-[var(--muted)] hover:text-[var(--foreground)]"
                }`}
              >
                <ListChecks size={12} />
                <span>Toplu Sonuç Özeti</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  playClick();
                  setResultViewMode("review");
                }}
                className={`px-2.5 py-1 rounded-md text-[11px] font-extrabold flex items-center gap-1 transition-all cursor-pointer ${
                  resultViewMode === "review"
                    ? "bg-[#6741D9] text-white shadow-2xs"
                    : "text-[var(--muted)] hover:text-[var(--foreground)]"
                }`}
              >
                <Eye size={12} />
                <span>Soruları Tek Tek İncele</span>
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-1.5 pt-0.5">
            {questions.map((_, idx) => {
              const ans = userAnswers[idx];
              const isSelectedReview =
                resultViewMode === "review" && reviewIndex === idx;
              const statusCls = ans
                ? ans.isCorrect
                  ? "bg-emerald-500 text-white border-emerald-600"
                  : "bg-rose-500 text-white border-rose-600"
                : "bg-slate-100 text-slate-600 border-slate-300 dark:bg-slate-800 dark:text-slate-400";

              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => {
                    playClick();
                    setReviewIndex(idx);
                    setResultViewMode("review");
                  }}
                  className={`w-7 h-7 sm:w-8 sm:h-8 rounded-lg border text-xs font-extrabold tabular-nums transition-all cursor-pointer flex items-center justify-center ${statusCls} ${
                    isSelectedReview
                      ? "ring-2 ring-offset-1 ring-[#6741D9] scale-110"
                      : "hover:opacity-90"
                  }`}
                  title={`Soru ${idx + 1}`}
                >
                  {idx + 1}
                </button>
              );
            })}
          </div>
        </div>

        {/* GÖRÜNÜM 1: TOPLU SONUÇ ÖZETİ VEYA GÖRÜNÜM 2: TEK TEK SORU İNCELEME */}
        {resultViewMode === "summary" ? (
          <div className="space-y-2 max-h-64 overflow-y-auto pr-1 border-t border-b border-dashed border-[#E2D3B8] pt-3 pb-3 mt-2">
            <h4 className="text-xs font-extrabold uppercase tracking-wider text-[var(--muted)]">
              Soru Dökümü ({questions.length} Soru)
            </h4>
            {questions.map((q, idx) => {
              const ans = userAnswers[idx];
              const isOk = ans?.isCorrect;
              return (
                <button
                  key={q.id + idx}
                  type="button"
                  onClick={() => {
                    playClick();
                    setReviewIndex(idx);
                    setResultViewMode("review");
                  }}
                  className={`w-full text-left p-2.5 rounded-xl border text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2 transition-all cursor-pointer ${
                    isOk
                      ? "bg-emerald-50/70 dark:bg-emerald-950/30 border-emerald-300 hover:border-emerald-500"
                      : "bg-rose-50/70 dark:bg-rose-950/30 border-rose-300 hover:border-rose-500"
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-5 h-5 rounded-md bg-white/80 dark:bg-slate-800 border border-slate-300 text-[10px] font-extrabold flex items-center justify-center shrink-0 tabular-nums">
                      {idx + 1}
                    </span>
                    {isOk ? (
                      <CheckCircle2
                        size={16}
                        className="text-[#065F46] dark:text-emerald-400 shrink-0"
                      />
                    ) : (
                      <XCircle size={16} className="text-rose-600 shrink-0" />
                    )}
                    <span
                      dir="rtl"
                      className="arabic text-lg font-bold text-[var(--foreground)]"
                    >
                      {formatArabicText(q.arabic, showHareke, arabicFont)}
                    </span>
                  </div>
                  <div className="text-right text-[11px] font-bold">
                    {!isOk && ans?.chosen && (
                      <span className="text-rose-700 line-through block">
                        Seçiminiz: {ans.chosen}
                      </span>
                    )}
                    {!ans && (
                      <span className="text-slate-500 italic block">
                        Boş Bırakıldı
                      </span>
                    )}
                    <span className="text-emerald-800 dark:text-emerald-300 block">
                      Doğru: {q.turkish}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="bg-white dark:bg-[var(--background)] rounded-2xl border-2 border-[#E6D7BE] dark:border-[var(--border)] p-4 space-y-3">
            <div className="flex items-center justify-between gap-2 border-b border-dashed border-[#E2D3B8] pb-2">
              <span className="text-xs font-extrabold text-[#6741D9]">
                Soru {reviewIndex + 1} / {questions.length} İncelemesi
              </span>
              <button
                type="button"
                onClick={() => handleListenQuestion(reviewQ)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#087F5B] text-white text-xs font-bold cursor-pointer"
              >
                <Volume2 size={13} />
                <span>Sesli Dinle</span>
              </button>
            </div>

            <div className="text-center py-1">
              <h4
                dir="rtl"
                className="arabic text-3xl sm:text-4xl font-bold text-[#065F46] dark:text-emerald-400"
              >
                {formatArabicText(reviewQ.arabic, showHareke, arabicFont)}
              </h4>
              <p className="text-[11px] font-bold text-[var(--muted)] mt-1">
                {reviewQ.metaLabel}
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {reviewQ.options.map((opt, oIdx) => {
                const isUserChoice = reviewAns?.chosen === opt.text;
                const isRight = opt.isCorrect;
                return (
                  <div
                    key={oIdx}
                    className={`p-3 rounded-xl border-2 text-xs font-extrabold flex items-center justify-between gap-2 ${
                      isRight
                        ? "bg-emerald-50 border-emerald-500 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200"
                        : isUserChoice
                        ? "bg-rose-50 border-rose-500 text-rose-900 dark:bg-rose-950/40 dark:text-rose-200"
                        : "bg-[#F7EFE1]/50 dark:bg-[var(--surface)] border-[#E6D7BE] text-[var(--muted)] opacity-75"
                    }`}
                  >
                    <span>{opt.text}</span>
                    {isRight && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-black text-emerald-700 shrink-0">
                        <CheckCircle2 size={15} />
                        <span>Doğru</span>
                      </span>
                    )}
                    {!isRight && isUserChoice && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-black text-rose-700 shrink-0">
                        <XCircle size={15} />
                        <span>Seçiminiz</span>
                      </span>
                    )}
                  </div>
                );
              })}
            </div>

            {reviewQ.kind === "idiom" &&
              (reviewQ.literalTr || reviewQ.usageNote) && (
                <div className="rounded-xl bg-[#F3F0FF] dark:bg-[var(--lavender-bg)] border border-[#6741D9]/30 p-3 text-left text-xs space-y-1">
                  {reviewQ.literalTr && (
                    <p className="font-bold text-[#4C28B5] dark:text-[#d0bfff]">
                      <span className="font-extrabold">✨ Harfiyen Anlamı:</span>{" "}
                      {reviewQ.literalTr}
                    </p>
                  )}
                  {reviewQ.usageNote && (
                    <p className="text-[var(--foreground)] font-semibold">
                      <span className="font-extrabold text-[#065F46] dark:text-emerald-400">
                        💡 Kullanım İpucu:
                      </span>{" "}
                      {reviewQ.usageNote}
                    </p>
                  )}
                </div>
              )}

            <div className="flex items-center justify-between gap-2 pt-2 border-t border-dashed border-[#E2D3B8]">
              <button
                type="button"
                disabled={reviewIndex === 0}
                onClick={() => {
                  playClick();
                  setReviewIndex((i) => Math.max(0, i - 1));
                }}
                className="px-3 py-1.5 rounded-xl bg-[#F7EFE1] dark:bg-[var(--surface)] border border-[#E6D7BE] disabled:opacity-40 text-xs font-extrabold flex items-center gap-1 cursor-pointer"
              >
                <ArrowLeft size={14} />
                <span>Önceki Soru</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  playClick();
                  setResultViewMode("summary");
                }}
                className="px-3 py-1.5 rounded-xl bg-[#F3F0FF] text-[#6741D9] border border-[#6741D9]/30 text-xs font-extrabold cursor-pointer"
              >
                Toplu Sonuçları Gör
              </button>

              <button
                type="button"
                disabled={reviewIndex === questions.length - 1}
                onClick={() => {
                  playClick();
                  setReviewIndex((i) =>
                    Math.min(questions.length - 1, i + 1)
                  );
                }}
                className="px-3 py-1.5 rounded-xl bg-[#F7EFE1] dark:bg-[var(--surface)] border border-[#E6D7BE] disabled:opacity-40 text-xs font-extrabold flex items-center gap-1 cursor-pointer"
              >
                <span>Sonraki Soru</span>
                <ArrowRight size={14} />
              </button>
            </div>
          </div>
        )}

        {/* BAŞARI KARTINI PAYLAŞ / İNDİR */}
        <ShareAchievementModal
          isOpen={shareOpen}
          onClose={() => setShareOpen(false)}
          title="Çoktan Seçmeli Kelime & Cümle Testi"
          subtitle={`${questions.length} Sorudan ${correctCount} Doğru Yanıt`}
          levelLabel="A1-B2"
          scorePercent={pct}
          pointsText={`${totalPoints} Puan`}
          wordsCount={questions.length}
          badgeType="exercise"
        />

        <button
          type="button"
          onClick={() => {
            playClick();
            setShareOpen(true);
          }}
          className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white border-b-4 border-amber-800 font-extrabold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-sm cursor-pointer"
        >
          <Share2 size={16} />
          <span>🏆 Başarı Kartını Paylaş / İndir</span>
        </button>

        {/* 4 AKSİYON BUTONU (ÇİFT İKON / EMOJİ TEMİZLENDİ) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <button
            type="button"
            onClick={handleRepeatSameSet}
            className="py-3 px-4 rounded-xl bg-white dark:bg-[var(--background)] border-2 border-[#E6D7BE] border-b-4 font-extrabold text-xs text-[var(--foreground)] hover:border-[#6741D9] flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <RefreshCcw size={15} className="text-[#6741D9]" />
            <span>Tekrar Yap</span>
          </button>

          <button
            type="button"
            onClick={handleStartNewSet}
            className="py-3 px-4 rounded-xl bg-[#087F5B] hover:bg-[#065F46] text-white border-b-4 border-[#087F5B] font-extrabold text-xs flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <Play size={15} fill="currentColor" />
            <span>Devam Et (Yeni Set)</span>
          </button>

          {wrongQuestions.length > 0 && (
            <button
              type="button"
              onClick={handleRetryWrongOnly}
              className="sm:col-span-2 py-3 px-4 rounded-xl bg-amber-500 hover:bg-amber-600 text-white border-b-4 border-amber-700 font-extrabold text-xs flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Target size={15} />
              <span>Yanlışlarımı Tekrarla ({wrongQuestions.length})</span>
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
              <span>Kapat / Alıştırma Merkezine Dön</span>
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-3.5">
      {/* ÜST DURUM, SÜRE VE SORU GEZGİNİ (1..N) ÇUBUĞU */}
      <div className="bg-[#F7EFE1] dark:bg-[var(--surface)] rounded-2xl border-2 border-[#E6D7BE] dark:border-[var(--border)] border-b-4 px-4 py-2.5 space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-xs sm:text-sm font-extrabold text-[var(--foreground)] tabular-nums">
              Soru {currentIndex + 1} / {questions.length}
            </span>
            <span
              className={`px-2 py-0.5 rounded-lg text-[10px] font-extrabold inline-flex items-center gap-1 ${
                currentQuestion.kind === "sentence" ||
                currentQuestion.kind === "idiom"
                  ? "bg-[#F3F0FF] text-[#6741D9] border border-[#6741D9]/30"
                  : "bg-[#E6FCF5] text-[#065F46] dark:text-emerald-400 border border-[#087F5B]/30"
              }`}
            >
              {currentQuestion.kind === "sentence" ? (
                <>
                  <MessageSquareQuote size={11} />
                  <span>Diyalog Cümlesi</span>
                </>
              ) : currentQuestion.kind === "idiom" ? (
                <>
                  <Sparkles size={11} />
                  <span>Kalıp İfade</span>
                </>
              ) : (
                <>
                  <BookOpen size={11} />
                  <span>Sözlük Kelimesi</span>
                </>
              )}
            </span>
          </div>

          {timeLeft !== null && (
            <div
              className={`flex items-center gap-1.5 px-3 py-1 rounded-xl border text-xs sm:text-sm font-black tabular-nums ${
                timeLeft <= 5
                  ? "bg-red-100 border-red-300 text-red-700 animate-pulse"
                  : "bg-white dark:bg-[var(--background)] border-[#E6D7BE] text-amber-700"
              }`}
            >
              <Timer size={16} />
              <span>{timeLeft} sn</span>
            </div>
          )}

          <span className="text-xs sm:text-sm font-extrabold text-[#065F46] dark:text-emerald-400 bg-white dark:bg-[var(--background)] border border-[#E6D7BE] px-3 py-1 rounded-xl tabular-nums">
            {feedbackMode === "instant"
              ? `Doğru: ${correctCount}`
              : `Yanıtlanan: ${Object.keys(userAnswers).length}/${questions.length}`}
          </span>
        </div>

        {/* Numaralı Soru Gezgini (1..N) */}
        <div className="flex flex-wrap items-center justify-center gap-1.5 pt-1 border-t border-dashed border-[#E2D3B8]">
          {questions.map((_, idx) => {
            const isActive = idx === currentIndex;
            const isAnswered = Boolean(userAnswers[idx]);
            return (
              <button
                key={idx}
                type="button"
                onClick={() => {
                  playClick();
                  setCurrentIndex(idx);
                }}
                className={`w-7 h-7 sm:w-8 sm:h-8 rounded-lg border text-xs tabular-nums transition-all cursor-pointer flex items-center justify-center ${
                  isActive
                    ? "ring-2 ring-emerald-600 bg-emerald-600 text-white font-bold scale-105 border-emerald-700"
                    : isAnswered
                    ? "bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-900/50 dark:text-emerald-200 font-bold"
                    : "bg-white/80 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 font-semibold hover:border-emerald-400"
                }`}
                title={`Soru ${idx + 1}`}
              >
                {idx + 1}
              </button>
            );
          })}
        </div>
      </div>

      {/* SORU KARTI */}
      <div className="bg-[#F7EFE1] dark:bg-[var(--surface)] rounded-2xl border-2 border-[#E6D7BE] dark:border-[var(--border)] border-b-4 p-4 sm:p-6 text-center space-y-3">
        <div className="flex items-center justify-between gap-2 text-xs font-bold text-[var(--muted)] border-b border-dashed border-[#E2D3B8] pb-2.5">
          <span className="text-left">
            {currentQuestion.kind === "sentence"
              ? "Aşağıdaki Arapça diyalog cümlesinin doğru Türkçe çevirisi hangisidir?"
              : currentQuestion.kind === "idiom"
              ? "Aşağıdaki Arapça kalıp ifadenin doğru deyimsel anlamı hangisidir?"
              : "Aşağıdaki Arapça kelimenin Türkçe karşılığı nedir?"}
          </span>
          <button
            type="button"
            onClick={() => handleListenQuestion(currentQuestion)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#087F5B] text-white font-bold border-b-2 border-[#087F5B] shrink-0 cursor-pointer"
          >
            <Volume2 size={14} />
            <span>Sesli Dinle</span>
          </button>
        </div>

        <h3
          dir="rtl"
          className={`arabic font-bold text-[#065F46] dark:text-emerald-400 py-2 ${
            currentQuestion.kind === "sentence"
              ? "text-2xl sm:text-4xl leading-relaxed"
              : currentQuestion.kind === "idiom"
              ? "text-3xl sm:text-5xl leading-relaxed"
              : "text-4xl sm:text-6xl"
          }`}
        >
          {displayArabic}
        </h3>

        <p className="text-xs font-bold text-[var(--muted)]">
          {currentQuestion.metaLabel}
        </p>
      </div>

      {/* ŞIKLAR */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {currentQuestion.options.map((opt, idx) => {
          const isChosen = selected === opt.text;
          const showCorrect =
            feedbackMode === "instant" && Boolean(selected) && opt.isCorrect;
          const showWrong =
            feedbackMode === "instant" && isChosen && !opt.isCorrect;
          const showNeutralSelected = feedbackMode === "end" && isChosen;

          return (
            <button
              key={idx}
              type="button"
              onClick={() => handleSelect(opt.text, opt.isCorrect)}
              disabled={
                (feedbackMode === "instant" && Boolean(selected)) || isTimeUp
              }
              className={`p-3.5 sm:p-4 rounded-2xl border-2 border-b-4 text-left font-extrabold text-xs sm:text-sm leading-snug transition-all flex items-center justify-between gap-2 cursor-pointer ${
                !selected
                  ? "bg-[#F7EFE1] dark:bg-[var(--surface)] border-[#E6D7BE] dark:border-[var(--border)] hover:border-[#6741D9] text-[var(--foreground)]"
                  : showNeutralSelected
                  ? "bg-[#F3F0FF] dark:bg-[var(--lavender-bg)] border-[#6741D9] text-[#4C28B5] dark:text-[#d0bfff] -translate-y-0.5 shadow-xs"
                  : showCorrect
                  ? "bg-emerald-50 border-[#087F5B] text-[#065F46] dark:text-emerald-400"
                  : showWrong
                  ? "bg-rose-50 border-rose-400 text-rose-800"
                  : "bg-[#F7EFE1]/50 border-[#E6D7BE] text-[var(--muted)] opacity-65"
              }`}
            >
              <span>{opt.text}</span>
              {showCorrect && (
                <CheckCircle2 size={20} className="text-[#065F46] shrink-0" />
              )}
              {showWrong && (
                <XCircle size={20} className="text-rose-600 shrink-0" />
              )}
              {showNeutralSelected && (
                <span className="px-2 py-0.5 rounded-md bg-[#6741D9] text-white text-[10px] font-extrabold shrink-0">
                  Seçildi
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* KALIP İFADE CEVAPLANDIĞINDA HARFİYEN ANLAMI VE KULLANIM İPUCU KUTUSU */}
      {feedbackMode === "instant" &&
        Boolean(selected) &&
        currentQuestion.kind === "idiom" &&
        (currentQuestion.literalTr || currentQuestion.usageNote) && (
          <div className="rounded-2xl bg-[#F3F0FF] dark:bg-[var(--lavender-bg)] border-2 border-[#6741D9]/40 p-3.5 text-left text-xs space-y-1.5 animate-in fade-in duration-150">
            {currentQuestion.literalTr && (
              <p className="font-bold text-[#4C28B5] dark:text-[#d0bfff]">
                <span className="font-extrabold">✨ Harfiyen Anlamı:</span>{" "}
                {currentQuestion.literalTr}
              </p>
            )}
            {currentQuestion.usageNote && (
              <p className="text-[var(--foreground)] font-semibold">
                <span className="font-extrabold text-[#065F46] dark:text-emerald-400">
                  💡 Kullanım İpucu:
                </span>{" "}
                {currentQuestion.usageNote}
              </p>
            )}
          </div>
        )}

      {/* ÖNCEKİ SORU / SONRAKİ SORU (VEYA TESTİ BİTİR) NAVİGASYON BAR */}
      <div className="flex items-center justify-between gap-3 pt-1">
        <button
          type="button"
          onClick={prevQuestion}
          disabled={currentIndex === 0}
          className="px-4 py-3 rounded-2xl bg-[#F7EFE1] dark:bg-[var(--surface)] border-2 border-[#E6D7BE] dark:border-[var(--border)] border-b-4 disabled:opacity-40 font-extrabold text-xs sm:text-sm text-[var(--foreground)] hover:border-[#6741D9] flex items-center gap-1.5 transition-all cursor-pointer"
        >
          <ArrowLeft size={16} />
          <span>Önceki Soru</span>
        </button>

        <button
          type="button"
          onClick={nextQuestion}
          className="flex-1 py-3 px-5 bg-[#087F5B] hover:bg-[#065F46] text-white font-extrabold text-xs sm:text-sm rounded-2xl border-b-4 border-[#087F5B] active:border-b-0 active:translate-y-0.5 transition-all flex items-center justify-center gap-2 cursor-pointer"
        >
          <span>
            {currentIndex === questions.length - 1
              ? "Testi Bitir ✓"
              : "Sonraki Soru"}
          </span>
          <ArrowRight size={16} />
        </button>
      </div>
    </div>
  );
}