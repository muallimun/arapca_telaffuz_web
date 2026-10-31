"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import {
  Volume2,
  RotateCcw,
  CheckCircle2,
  XCircle,
  Trophy,
  AlertCircle,
  Play,
  RefreshCcw,
  Target,
  Eye,
  Lightbulb,
  ArrowRight,
  ArrowLeft,
  X,
  Timer,
  Share2,
} from "lucide-react";
import { Dialogue } from "@/types/data";
import { hasMp3, getMp3Path, VoiceOption } from "@/lib/audio";
import { useAudioStore } from "@/store/audioStore";
import { useSettings } from "@/store/settings";
import { useUserStore } from "@/store/userStore";
import { formatArabicText } from "@/lib/arabicTextUtils";
import {
  playClick,
  playSuccess,
  playError,
  playFanfare,
} from "@/lib/sfxManager";
import ShareAchievementModal from "@/components/ui/ShareAchievementModal";
import { ArabicIdiom, extractDialoguesIdioms } from "@/lib/arabicIdioms";
import { QuizContentType } from "./MultipleChoice";
import { normalizeToCanonicalMistakeId } from "@/lib/mistakeUtils";

export interface SentenceBuilderQuestion {
  id: string;
  dialogueId: string;
  dialogueTitle: string;
  level: string;
  lineSira: number;
  fullArabic: string;
  turkish: string;
  words: string[];
  voice: VoiceOption;
}

interface WordToken {
  tokenId: string;
  text: string;
  originalIndex: number;
}

interface SentenceBuilderProps {
  dialogues: Dialogue[];
  idioms?: ArabicIdiom[];
  contentType?: QuizContentType;
  questionCount?: 10 | 20 | 30;
  timeLimit?: number | null;
  feedbackMode?: "instant" | "end";
  isMistakesMode?: boolean;
  onClose?: () => void;
}

function shuffleArray<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function stripPunctuationFromWord(word: string): string {
  return word.replace(/[.,،؛؟?!()"'«»[\]{}\-–—:…]/g, "").trim();
}

function normalizeWordForCompare(word: string): string {
  return stripPunctuationFromWord(word)
    .replace(/[\u064B-\u065F\u0670\u0640]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .trim();
}

function tokenizeArabicSentence(sentence: string): string[] {
  return sentence
    .split(/\s+/)
    .map((w) => stripPunctuationFromWord(w))
    .filter((w) => w.length > 0);
}

export default function SentenceBuilder({
  dialogues,
  idioms = [],
  contentType = "sentences",
  questionCount = 10,
  timeLimit = null,
  feedbackMode = "instant",
  isMistakesMode: _isMistakesMode = false,
  onClose,
}: SentenceBuilderProps) {
  const { playAudio, playTTS, stop } = useAudioStore();
  const { showHareke, arabicFont, speechRate } = useSettings();
  const { addStudyMinutes, addMistake, recordItemAttempt } = useUserStore();
  const wrongAttemptedQuestionsRef = useRef<Set<string>>(new Set());
  const usedHintQuestionsRef = useRef<Set<string>>(new Set());
  const lastLoadedQuestionKeyRef = useRef<string>("");

  const [roundSeed, setRoundSeed] = useState(0);
  const [customQuestions, setCustomQuestions] = useState<
    SentenceBuilderQuestion[] | null
  >(null);
  const [currentIndex, setCurrentIndex] = useState(0);

  // Mevcut sorudaki kelime havuzu ve kurulan cümle dizisi
  const [poolTokens, setPoolTokens] = useState<WordToken[]>([]);
  const [placedTokens, setPlacedTokens] = useState<WordToken[]>([]);
  const [evalState, setEvalState] = useState<
    "idle" | "correct" | "wrong" | "revealed"
  >("idle");

  // Tüm soruların cevap geçmişi
  const [userAnswers, setUserAnswers] = useState<
    Record<
      number,
      {
        placedWords: string[];
        isCorrect: boolean;
      }
    >
  >({});

  const [isFinished, setIsFinished] = useState(false);
  const [isTimeUp, setIsTimeUp] = useState(false);
  const [timeLeft, setTimeLeft] = useState<number | null>(timeLimit);
  const [shareOpen, setShareOpen] = useState(false);

  const fanfarePlayedRef = useRef(false);

  const itemsSignature = useMemo(
    () =>
      `${dialogues.map((d) => d.id).join("|")}::${idioms
        .map((i) => i.id)
        .join("|")}`,
    [dialogues, idioms]
  );

  // Diyaloglardan veya kalıp ifadelerden cümle kurmaya uygun soruları seç
  const generatedQuestions = useMemo(() => {
    const candidates: SentenceBuilderQuestion[] = [];

    if (contentType === "idioms" || contentType === "mixed") {
      // 2 ve daha fazla kelimeli kalıp ifadeler
      for (const idm of idioms) {
        const tokens = tokenizeArabicSentence(idm.arabic);
        if (tokens.length >= 2 && tokens.length <= 10) {
          candidates.push({
            id: `sb_idm_${idm.id}`,
            dialogueId: "",
            dialogueTitle: "✨ Kalıp İfade",
            level: idm.level || "A1-B2",
            lineSira: 1,
            fullArabic: idm.arabic,
            turkish: `${idm.meaningTr}${
              idm.literalTr ? ` (Harfiyen: ${idm.literalTr})` : ""
            }`,
            words: tokens,
            voice: "ar-SA-HamedNeural",
          });
        }
      }

      // Diyaloglarda geçen kalıp ifade cümleleri
      const extracted = extractDialoguesIdioms(dialogues);
      for (const ext of extracted) {
        const tokens = tokenizeArabicSentence(ext.lineArabic);
        if (tokens.length >= 2 && tokens.length <= 10) {
          candidates.push({
            id: `sb_idm_dlg_${ext.id}_${ext.lineNumber}`,
            dialogueId: "",
            dialogueTitle: `✨ Kalıp İfade Cümlesi`,
            level: ext.level || "A1-B2",
            lineSira: ext.lineNumber,
            fullArabic: ext.lineArabic,
            turkish: `${ext.lineTurkish} (✨ ${ext.meaningTr})`,
            words: tokens,
            voice: "ar-SA-HamedNeural",
          });
        }
      }

      if (contentType === "idioms" && candidates.length > 0) {
        return shuffleArray(candidates).slice(0, questionCount);
      }
    }

    for (const dlg of dialogues) {
      for (const line of dlg.satirlar) {
        const tokens = tokenizeArabicSentence(line.arapca);
        if (tokens.length >= 3 && tokens.length <= 10) {
          candidates.push({
            id: `sb_${dlg.id}_${line.sira}`,
            dialogueId: dlg.id,
            dialogueTitle: dlg.baslik_tr,
            level: dlg.seviye,
            lineSira: line.sira,
            fullArabic: line.arapca,
            turkish: line.turkce,
            words: tokens,
            voice:
              line.cinsiyet === "K"
                ? "ar-SA-ZariyahNeural"
                : "ar-SA-HamedNeural",
          });
        }
      }
    }
    return shuffleArray(candidates).slice(0, questionCount);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemsSignature, contentType, questionCount, roundSeed]);

  const questions = customQuestions || generatedQuestions;
  const currentQ = questions[currentIndex];

  const formatAr = useCallback(
    (text: string) => formatArabicText(text, showHareke, arabicFont),
    [showHareke, arabicFont]
  );

  const playCurrentSentenceAudio = useCallback(
    (q: SentenceBuilderQuestion | undefined, rateOverride?: number) => {
      if (!q) return;
      const rate = rateOverride ?? speechRate;
      if (hasMp3(q.dialogueId, q.lineSira)) {
        void playAudio(
          getMp3Path(q.dialogueId, q.lineSira),
          q.lineSira,
          rate,
          q.fullArabic
        );
      } else {
        void playTTS(q.fullArabic, q.lineSira, rate, q.voice);
      }
    },
    [playAudio, playTTS, speechRate]
  );

  // Soru değiştiğinde kelimeleri karıştır ve state'i hazırla
  useEffect(() => {
    if (!currentQ) return;
    const questionKey = `${currentIndex}_${currentQ.id}_${roundSeed}_${
      customQuestions ? "custom" : "gen"
    }`;
    if (lastLoadedQuestionKeyRef.current === questionKey) return;
    lastLoadedQuestionKeyRef.current = questionKey;

    const baseTokens: WordToken[] = currentQ.words.map((w, idx) => ({
      tokenId: `${currentQ.id}_w_${idx}`,
      text: stripPunctuationFromWord(w),
      originalIndex: idx,
    }));

    // Karıştırılmış sıra orijinal sırayla birebir aynıysa tekrar karıştır
    let shuffled = shuffleArray(baseTokens);
    if (
      shuffled.length > 1 &&
      shuffled.every((t, i) => t.originalIndex === i)
    ) {
      shuffled = [...shuffled.slice(1), shuffled[0]];
    }

    setPoolTokens(shuffled);
    setPlacedTokens([]);
    setEvalState("idle");

    const timer = setTimeout(() => {
      if (!isFinished && !isTimeUp) {
        playCurrentSentenceAudio(currentQ);
      }
    }, 240);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex, currentQ?.id, roundSeed, customQuestions]);

  // Geri sayım sayacı
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      setTimeLeft(timeLimit);
    });
    return () => cancelAnimationFrame(raf);
  }, [timeLimit, roundSeed, customQuestions]);

  useEffect(() => {
    if (timeLeft === null || isFinished || isTimeUp) return;
    if (timeLeft <= 0) {
      const raf = requestAnimationFrame(() => {
        setIsTimeUp(true);
      });
      return () => cancelAnimationFrame(raf);
    }
    const id = setInterval(() => {
      setTimeLeft((prev) => (prev !== null ? prev - 1 : null));
    }, 1000);
    return () => clearInterval(id);
  }, [timeLeft, isFinished, isTimeUp]);

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

  useEffect(() => {
    return () => {
      stop();
    };
  }, [stop]);

  if (!questions.length || !currentQ) {
    return (
      <div className="bg-[#F7EFE1] dark:bg-[var(--surface)] rounded-2xl border-2 border-[#E6D7BE] p-6 text-center space-y-3">
        <p className="text-sm font-extrabold text-[var(--foreground)]">
          Bu aralıkta cümle kurma alıştırması için yeterli diyalog cümlesi bulunamadı.
        </p>
      </div>
    );
  }

  const checkSentenceOrder = (placed: WordToken[]) => {
    if (placed.length !== currentQ.words.length) return;

    const isRight = placed.every(
      (tok, idx) =>
        normalizeWordForCompare(tok.text) ===
        normalizeWordForCompare(currentQ.words[idx])
    );

    const canonicalId = normalizeToCanonicalMistakeId(
      currentQ.id,
      currentQ.fullArabic
    );
    const hadPreviousAttempt = wrongAttemptedQuestionsRef.current.has(
      currentQ.id
    );
    const usedHint = usedHintQuestionsRef.current.has(currentQ.id);
    const inferType = (cid: string): "word" | "idiom" | "sentence" => {
      if (cid.startsWith("idiom_") || cid.startsWith("idm_")) return "idiom";
      if (cid.startsWith("sent_")) return "sentence";
      return "word";
    };

    if (!isRight) {
      wrongAttemptedQuestionsRef.current.add(currentQ.id);
      if (canonicalId) {
        addMistake(canonicalId);
        recordItemAttempt(canonicalId, inferType(canonicalId), false, usedHint);
      }
    } else if (!hadPreviousAttempt && canonicalId) {
      recordItemAttempt(canonicalId, inferType(canonicalId), true, usedHint);
    }

    setUserAnswers((prev) => ({
      ...prev,
      [currentIndex]: {
        placedWords: placed.map((t) => t.text),
        isCorrect: isRight,
      },
    }));

    if (feedbackMode === "end") {
      setEvalState("correct");
      return;
    }

    if (isRight) {
      setEvalState("correct");
      playSuccess();
      setTimeout(() => {
        playCurrentSentenceAudio(currentQ);
      }, 280);
    } else {
      setEvalState("wrong");
      playError();
    }
  };

  const handleSelectFromPool = (token: WordToken) => {
    if (evalState === "correct" || evalState === "revealed") return;
    playClick();

    const nextPool = poolTokens.filter((t) => t.tokenId !== token.tokenId);
    const nextPlaced = [...placedTokens, token];
    setPoolTokens(nextPool);
    setPlacedTokens(nextPlaced);
    setEvalState("idle");

    if (nextPlaced.length === currentQ.words.length) {
      checkSentenceOrder(nextPlaced);
    }
  };

  const handleRemoveFromPlaced = (token: WordToken) => {
    if (evalState === "correct" || evalState === "revealed") return;
    playClick();

    setPlacedTokens((prev) => prev.filter((t) => t.tokenId !== token.tokenId));
    setPoolTokens((prev) => [...prev, token]);
    setEvalState("idle");
  };

  const handleFixWrongWords = () => {
    playClick();
    // Doğru sıradaki ilk ardışık kelimeleri koru, hatalı olanları havuza geri gönder
    const keepPlaced: WordToken[] = [];
    const returnToPool: WordToken[] = [];

    let broken = false;
    placedTokens.forEach((tok, idx) => {
      if (
        !broken &&
        normalizeWordForCompare(tok.text) ===
          normalizeWordForCompare(currentQ.words[idx])
      ) {
        keepPlaced.push(tok);
      } else {
        broken = true;
        returnToPool.push(tok);
      }
    });

    setPlacedTokens(keepPlaced);
    setPoolTokens((prev) => [...prev, ...returnToPool]);
    setEvalState("idle");
  };

  const handleHintNextWord = () => {
    if (evalState === "correct" || evalState === "revealed") return;
    playClick();
    usedHintQuestionsRef.current.add(currentQ.id);

    // Önce yanlış dizilmiş kelime varsa onları havuza geri al
    const validPrefix: WordToken[] = [];
    const returned: WordToken[] = [];
    let broken = false;

    for (let i = 0; i < placedTokens.length; i++) {
      const tok = placedTokens[i];
      if (
        !broken &&
        normalizeWordForCompare(tok.text) ===
          normalizeWordForCompare(currentQ.words[i])
      ) {
        validPrefix.push(tok);
      } else {
        broken = true;
        returned.push(tok);
      }
    }

    const availablePool = [...poolTokens, ...returned];
    const targetIdx = validPrefix.length;
    const expectedWordNorm = normalizeWordForCompare(
      currentQ.words[targetIdx] || ""
    );

    const matchingToken = availablePool.find(
      (t) => normalizeWordForCompare(t.text) === expectedWordNorm
    );

    if (!matchingToken) return;

    const nextPlaced = [...validPrefix, matchingToken];
    const nextPool = availablePool.filter(
      (t) => t.tokenId !== matchingToken.tokenId
    );

    setPlacedTokens(nextPlaced);
    setPoolTokens(nextPool);
    setEvalState("idle");

    if (nextPlaced.length === currentQ.words.length) {
      checkSentenceOrder(nextPlaced);
    }
  };

  const handleShowCorrectAnswer = () => {
    playClick();
    wrongAttemptedQuestionsRef.current.add(currentQ.id);
    const canonicalId = normalizeToCanonicalMistakeId(
      currentQ.id,
      currentQ.fullArabic
    );
    if (canonicalId) {
      addMistake(canonicalId);
      const inferType = canonicalId.startsWith("idiom_")
        ? "idiom"
        : "sentence";
      recordItemAttempt(
        canonicalId,
        inferType,
        false,
        true,
        undefined,
        "Doğru cevap gösterildi"
      );
    }

    const ordered: WordToken[] = currentQ.words.map((w, idx) => ({
      tokenId: `${currentQ.id}_ans_${idx}`,
      text: w,
      originalIndex: idx,
    }));
    setPlacedTokens(ordered);
    setPoolTokens([]);
    setEvalState("revealed");
    setUserAnswers((prev) => ({
      ...prev,
      [currentIndex]: {
        placedWords: currentQ.words,
        isCorrect: false,
      },
    }));
    playCurrentSentenceAudio(currentQ);
  };

  const handleResetCurrent = () => {
    playClick();
    const allTokens = [...placedTokens, ...poolTokens];
    setPlacedTokens([]);
    setPoolTokens(shuffleArray(allTokens));
    setEvalState("idle");
  };

  const handleNext = () => {
    playClick();
    if (currentIndex < questions.length - 1) {
      setCurrentIndex((i) => i + 1);
    } else {
      setIsFinished(true);
    }
  };

  const handlePrev = () => {
    if (currentIndex > 0) {
      playClick();
      setCurrentIndex((i) => i - 1);
    }
  };

  const correctCount = Object.values(userAnswers).filter(
    (a) => a.isCorrect
  ).length;
  const wrongQuestions = questions.filter(
    (_, idx) => !userAnswers[idx]?.isCorrect
  );

  const handleRepeatSameSet = () => {
    playClick();
    fanfarePlayedRef.current = false;
    setCustomQuestions(shuffleArray([...questions]));
    setCurrentIndex(0);
    setUserAnswers({});
    setIsFinished(false);
    setIsTimeUp(false);
  };

  const handleStartNewSet = () => {
    playClick();
    fanfarePlayedRef.current = false;
    setCustomQuestions(null);
    setRoundSeed((s) => s + 1);
    setCurrentIndex(0);
    setUserAnswers({});
    setIsFinished(false);
    setIsTimeUp(false);
  };

  const handleRetryWrongOnly = () => {
    if (wrongQuestions.length === 0) return;
    playClick();
    fanfarePlayedRef.current = false;
    setCustomQuestions(shuffleArray([...wrongQuestions]));
    setCurrentIndex(0);
    setUserAnswers({});
    setIsFinished(false);
    setIsTimeUp(false);
  };

  if (isFinished || isTimeUp) {
    const wrongCount = questions.length - correctCount;
    const pct = Math.round((correctCount / questions.length) * 100);
    const totalPoints = correctCount * 15;

    return (
      <div className="bg-[#F7EFE1] dark:bg-[var(--surface)] rounded-2xl border-2 border-[#E6D7BE] dark:border-[var(--border)] border-b-4 p-4 sm:p-6 space-y-4 max-w-2xl mx-auto">
        <ShareAchievementModal
          isOpen={shareOpen}
          onClose={() => setShareOpen(false)}
          title="Dinle ve Sırala (Cümle Kurma)"
          subtitle={`${questions.length} Diyalog Cümlesinden ${correctCount} Doğru Sıralama`}
          levelLabel={questions[0]?.level || "A1-B2"}
          scorePercent={pct}
          pointsText={`${totalPoints} Puan`}
          wordsCount={questions.reduce((acc, q) => acc + q.words.length, 0)}
          badgeType="exercise"
        />

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
              {isFinished
                ? "Cümle Kurma Alıştırması Tamamlandı!"
                : "Süre Doldu!"}
            </h3>
            <p className="text-xs font-semibold text-[var(--muted)]">
              Toplam {questions.length} cümleden {correctCount} doğru,{" "}
              {wrongCount} hatalı sıralama yaptınız
            </p>
          </div>

          <div className="grid grid-cols-4 gap-2 text-center pt-1">
            <div className="bg-white dark:bg-[var(--background)] rounded-xl p-2.5 border border-[#E6D7BE] dark:border-[var(--border)]">
              <span className="block text-[10px] font-bold text-[var(--muted)] uppercase">
                Başarı
              </span>
              <span className="text-lg font-black text-[#6741D9] dark:text-[#d0bfff] tabular-nums">
                %{pct}
              </span>
            </div>
            <div className="bg-emerald-50 dark:bg-emerald-950/50 rounded-xl p-2.5 border border-emerald-300 dark:border-emerald-800">
              <span className="block text-[10px] font-bold text-emerald-700 dark:text-emerald-300 uppercase">
                Doğru
              </span>
              <span className="text-lg font-black text-emerald-700 dark:text-emerald-300 tabular-nums">
                {correctCount}
              </span>
            </div>
            <div className="bg-rose-50 dark:bg-rose-950/50 rounded-xl p-2.5 border border-rose-300 dark:border-rose-800">
              <span className="block text-[10px] font-bold text-rose-700 dark:text-rose-300 uppercase">
                Hatalı
              </span>
              <span className="text-lg font-black text-rose-700 dark:text-rose-300 tabular-nums">
                {wrongCount}
              </span>
            </div>
            <div className="bg-amber-50 dark:bg-amber-950/50 rounded-xl p-2.5 border border-amber-300 dark:border-amber-800">
              <span className="block text-[10px] font-bold text-amber-800 dark:text-amber-300 uppercase">
                Puan
              </span>
              <span className="text-lg font-black text-amber-800 dark:text-amber-300 tabular-nums">
                {totalPoints}
              </span>
            </div>
          </div>
        </div>

        {/* Cümle Özeti Listesi */}
        <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
          {questions.map((q, idx) => {
            const ans = userAnswers[idx];
            const isOk = Boolean(ans?.isCorrect);
            return (
              <div
                key={q.id}
                className={`p-3 rounded-xl border flex flex-col gap-1.5 ${
                  isOk
                    ? "bg-emerald-50/70 dark:bg-emerald-950/30 border-emerald-300"
                    : "bg-rose-50/70 dark:bg-rose-950/30 border-rose-300"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-extrabold text-[var(--muted)]">
                    #{idx + 1} · {q.dialogueTitle}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      playClick();
                      playCurrentSentenceAudio(q);
                    }}
                    className="px-2 py-0.5 rounded-lg bg-white dark:bg-[var(--background)] border border-[#E6D7BE] text-[11px] font-extrabold text-[#065F46] dark:text-emerald-400 flex items-center gap-1 cursor-pointer"
                  >
                    <Volume2 size={12} />
                    <span>Dinle</span>
                  </button>
                </div>
                <p
                  dir="rtl"
                  className="arabic text-xl font-bold text-[var(--foreground)] text-right"
                >
                  {formatAr(q.fullArabic)}
                </p>
                <p className="text-xs font-semibold text-[var(--muted)]">
                  {q.turkish}
                </p>
              </div>
            );
          })}
        </div>

        {/* Başarı Kartını Paylaş / İndir CTA */}
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

        {/* Aksiyon Butonları */}
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
    <div className="bg-[#F7EFE1] dark:bg-[var(--surface)] rounded-2xl border-2 border-[#E6D7BE] dark:border-[var(--border)] border-b-4 p-3.5 sm:p-5 space-y-3.5 max-w-3xl mx-auto">
      {/* ÜST BAR: Soru Gezgini (1..N) ve Zamanlayıcı */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-dashed border-[#E2D3B8] dark:border-[var(--border-dashed)] pb-2.5">
        <div className="grid grid-cols-10 gap-1 md:flex md:flex-wrap md:gap-1.5 w-full md:w-auto py-0.5">
          {questions.map((q, idx) => {
            const ans = userAnswers[idx];
            const isCurrent = idx === currentIndex;
            let btnStyle =
              "bg-white dark:bg-[var(--background)] border-[#E6D7BE] text-[var(--muted)]";
            if (isCurrent) {
              btnStyle =
                "bg-[#6741D9] border-[#5230B5] text-white ring-2 ring-[#6741D9]/30";
            } else if (ans) {
              btnStyle = ans.isCorrect
                ? "bg-emerald-500 border-emerald-700 text-white"
                : "bg-rose-500 border-rose-700 text-white";
            }
            return (
              <button
                key={q.id}
                type="button"
                onClick={() => {
                  playClick();
                  setCurrentIndex(idx);
                }}
                className={`h-7 w-full md:w-8 md:h-8 rounded-lg border text-xs font-bold tabular-nums flex items-center justify-center shrink-0 transition-all cursor-pointer ${btnStyle}`}
              >
                {idx + 1}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2 shrink-0 ml-auto">
          {timeLeft !== null && (
            <span
              className={`px-2.5 py-1 rounded-xl border text-xs font-extrabold tabular-nums flex items-center gap-1 ${
                timeLeft <= 10
                  ? "bg-rose-100 border-rose-400 text-rose-700 animate-pulse"
                  : "bg-white dark:bg-[var(--background)] border-[#E6D7BE] text-[#6741D9]"
              }`}
            >
              <Timer size={13} />
              <span>{timeLeft}s</span>
            </span>
          )}
          <span className="px-2.5 py-1 rounded-xl bg-white dark:bg-[var(--background)] border border-[#E6D7BE] text-xs font-extrabold text-[#065F46] dark:text-emerald-400 tabular-nums">
            {currentIndex + 1} / {questions.length}
          </span>
        </div>
      </div>

      {/* 1. SESLENDİRME VE TÜRKÇE ÇEVİRİ İPUCU KARTI */}
      <div className="bg-white dark:bg-[var(--background)] rounded-2xl border-2 border-[#E6D7BE] dark:border-[var(--border)] p-3.5 sm:p-4 space-y-2.5 text-center">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="px-2.5 py-0.5 rounded-lg bg-[#F3F0FF] dark:bg-[var(--lavender-bg)] border border-[#6741D9]/30 text-[11px] font-extrabold text-[#6741D9] dark:text-[#d0bfff]">
            {currentQ.dialogueTitle} • {currentQ.level}
          </span>
          <span className="text-[11px] font-bold text-[var(--muted)]">
            {currentQ.words.length} Kelimelik Cümle
          </span>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
          <button
            type="button"
            onClick={() => {
              playClick();
              playCurrentSentenceAudio(currentQ);
            }}
            className="px-4 py-2.5 rounded-2xl bg-[#087F5B] hover:bg-[#065F46] text-white font-extrabold text-xs sm:text-sm border-b-4 border-[#087F5B] active:border-b-0 active:translate-y-0.5 transition-all flex items-center gap-2 shadow-sm cursor-pointer"
          >
            <Volume2 size={18} />
            <span>🔊 Cümleyi Dinle</span>
          </button>

          <button
            type="button"
            onClick={() => {
              playClick();
              playCurrentSentenceAudio(currentQ, 0.75);
            }}
            className="px-3 py-2.5 rounded-2xl bg-[#F7EFE1] dark:bg-[var(--surface)] hover:bg-[#EFE3CE] text-[var(--foreground)] font-extrabold text-xs border-2 border-[#E6D7BE] border-b-4 active:translate-y-0.5 transition-all cursor-pointer"
            title="Cümleyi 0.75x yavaş hızda dinle"
          >
            🐢 0.75x Yavaş
          </button>
        </div>

        <div className="pt-1">
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-[var(--muted)] block">
            Türkçe Anlam İpucu:
          </span>
          <p className="text-sm sm:text-base font-extrabold text-[var(--foreground)] leading-snug mt-0.5">
            “{currentQ.turkish}”
          </p>
        </div>
      </div>

      {/* 2. CÜMLE KURMA ALANI (ÜST KUTU — RTL Sağdan Sola Dizilim) */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2 px-1">
          <span className="text-xs font-extrabold text-[var(--foreground)]">
            Cümle Kurma Alanı (Kelimelere dokunarak sağdan sola sıralayın):
          </span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={handleHintNextWord}
              disabled={
                evalState === "correct" ||
                evalState === "revealed" ||
                placedTokens.length >= currentQ.words.length
              }
              className="px-2.5 py-1 rounded-xl bg-amber-100 dark:bg-amber-950/60 hover:bg-amber-200 disabled:opacity-40 border border-amber-400 text-amber-900 dark:text-amber-200 text-[11px] font-extrabold flex items-center gap-1 cursor-pointer"
              title="Sıradaki doğru kelimeyi yerleştir"
            >
              <Lightbulb size={12} />
              <span>İpucu</span>
            </button>

            <button
              type="button"
              onClick={handleResetCurrent}
              disabled={placedTokens.length === 0}
              className="px-2.5 py-1 rounded-xl bg-white dark:bg-[var(--background)] hover:bg-[#EFE3CE] disabled:opacity-40 border border-[#E6D7BE] text-[11px] font-extrabold text-[var(--muted)] hover:text-[var(--foreground)] flex items-center gap-1 cursor-pointer"
              title="Dizilen kelimeleri temizle"
            >
              <RotateCcw size={12} />
              <span>Sıfırla</span>
            </button>
          </div>
        </div>

        <div
          dir="rtl"
          className={`flex flex-wrap items-center justify-start gap-2 min-h-[76px] p-3.5 rounded-2xl border-2 border-dashed transition-all ${
            evalState === "correct"
              ? "bg-emerald-50 dark:bg-emerald-950/50 border-emerald-500 ring-4 ring-emerald-500/20"
              : evalState === "wrong"
              ? "bg-rose-50 dark:bg-rose-950/50 border-rose-500"
              : evalState === "revealed"
              ? "bg-amber-50 dark:bg-amber-950/40 border-amber-500"
              : "bg-white dark:bg-slate-900/90 border-[#cbb692] dark:border-slate-700"
          }`}
        >
          {placedTokens.length === 0 ? (
            <span
              dir="ltr"
              className="w-full text-center text-xs font-bold text-[var(--muted)] dark:text-slate-300 select-none py-3"
            >
              Aşağıdaki kelime havuzundan kelimelere sırayla dokunun...
            </span>
          ) : (
            placedTokens.map((tok, idx) => {
              const isWordRightInPlace =
                normalizeWordForCompare(tok.text) ===
                normalizeWordForCompare(currentQ.words[idx] || "");

              let tokenColor =
                "bg-[#F3F0FF] dark:bg-indigo-950/85 border-[#6741D9] dark:border-indigo-500 text-[#4C28B5] dark:text-indigo-100";
              if (evalState === "correct" || evalState === "revealed") {
                tokenColor =
                  "bg-emerald-600 border-emerald-800 text-white shadow-xs";
              } else if (evalState === "wrong") {
                tokenColor = isWordRightInPlace
                  ? "bg-emerald-100 dark:bg-emerald-950/90 border-emerald-500 text-emerald-900 dark:text-emerald-200"
                  : "bg-rose-100 dark:bg-rose-950/90 border-rose-500 text-rose-900 dark:text-rose-200 animate-shake";
              }

              return (
                <button
                  key={tok.tokenId}
                  type="button"
                  onClick={() => handleRemoveFromPlaced(tok)}
                  title="Geri kelime havuzuna göndermek için dokunun"
                  className={`min-h-[42px] px-3.5 py-2 text-lg sm:text-xl font-arabic arabic font-bold select-none active:scale-95 transition-transform rounded-xl border-2 border-b-4 cursor-pointer ${tokenColor}`}
                >
                  {formatAr(tok.text)}
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* 3. DEĞERLENDİRME GERİ BİLDİRİM BARI */}
      {evalState === "correct" && (
        <div className="rounded-xl bg-emerald-600 text-white px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2 shadow-sm animate-in fade-in duration-150">
          <div className="flex items-center gap-2 text-xs sm:text-sm font-extrabold">
            <CheckCircle2 size={18} className="shrink-0" />
            <span>Harika! Cümleyi doğru sırayla kurdunuz.</span>
          </div>
          <button
            type="button"
            onClick={handleNext}
            className="px-3.5 py-1.5 rounded-xl bg-white text-emerald-800 hover:bg-emerald-50 font-extrabold text-xs flex items-center gap-1 cursor-pointer shadow-xs"
          >
            <span>
              {currentIndex < questions.length - 1
                ? "Sonraki Cümle"
                : "Sonuçları Gör"}
            </span>
            <ArrowRight size={14} />
          </button>
        </div>
      )}

      {evalState === "wrong" && (
        <div className="rounded-xl bg-rose-50 dark:bg-rose-950/60 border-2 border-rose-400 p-3 flex flex-wrap items-center justify-between gap-2 animate-in fade-in duration-150">
          <div className="flex items-center gap-2 text-xs font-extrabold text-rose-800 dark:text-rose-200">
            <XCircle size={18} className="text-rose-600 shrink-0" />
            <span>
              Bazı kelimelerin sırası hatalı (kırmızı kelimeler). Düzeltip tekrar deneyin!
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={handleFixWrongWords}
              className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-extrabold border-b-2 border-amber-700 cursor-pointer"
            >
              ✏️ Hatalı Kelimeleri Geri Al
            </button>
            <button
              type="button"
              onClick={handleShowCorrectAnswer}
              className="px-3 py-1.5 rounded-xl bg-white dark:bg-[var(--background)] border border-rose-300 text-rose-800 dark:text-rose-200 text-xs font-extrabold flex items-center gap-1 cursor-pointer"
            >
              <Eye size={13} />
              <span>Doğru Cevabı Göster</span>
            </button>
          </div>
        </div>
      )}

      {evalState === "revealed" && (
        <div className="rounded-xl bg-amber-50 dark:bg-amber-950/50 border-2 border-amber-400 px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-extrabold text-amber-900 dark:text-amber-200">
            💡 Doğru cümle dizilimi gösterildi. Dinleyip sıradaki cümleye geçebilirsiniz.
          </span>
          <button
            type="button"
            onClick={handleNext}
            className="px-3.5 py-1.5 rounded-xl bg-[#087F5B] text-white font-extrabold text-xs flex items-center gap-1 cursor-pointer"
          >
            <span>
              {currentIndex < questions.length - 1
                ? "Sonraki Cümle"
                : "Sonuçları Gör"}
            </span>
            <ArrowRight size={14} />
          </button>
        </div>
      )}

      {/* 4. KELİME HAVUZU (ALT KUTU — Karıştırılmış Dokunmatik Butonlar) */}
      <div className="space-y-1.5">
        <span className="text-xs font-extrabold text-[var(--muted)] px-1 block">
          Kelime Havuzu ({poolTokens.length} kelime kaldı):
        </span>
        <div
          dir="rtl"
          className="flex flex-wrap justify-center gap-2 min-h-[68px] p-3 rounded-2xl bg-[#FDFBF7] dark:bg-slate-900/90 border-2 border-[#E6D7BE] dark:border-slate-700"
        >
          {poolTokens.length === 0 ? (
            <span
              dir="ltr"
              className="text-xs font-bold text-[#065F46] dark:text-emerald-400 self-center"
            >
              Tüm kelimeler yerleştirildi ✓
            </span>
          ) : (
            poolTokens.map((tok) => (
              <button
                key={tok.tokenId}
                type="button"
                onClick={() => handleSelectFromPool(tok)}
                className="min-h-[42px] px-3.5 py-2 text-lg sm:text-xl font-arabic arabic font-bold select-none active:scale-95 transition-transform rounded-xl bg-white dark:bg-slate-800 hover:bg-[#F3F0FF] dark:hover:bg-indigo-950/80 text-[var(--foreground)] dark:text-slate-100 border-2 border-[#E6D7BE] dark:border-slate-600 border-b-4 hover:border-[#6741D9] dark:hover:border-indigo-400 cursor-pointer shadow-2xs"
              >
                {formatAr(tok.text)}
              </button>
            ))
          )}
        </div>
      </div>

      {/* 5. ALT GEZİNME ÇUBUĞU */}
      <div className="flex items-center justify-between gap-2 pt-2 border-t border-dashed border-[#E2D3B8] dark:border-[var(--border-dashed)]">
        <button
          type="button"
          onClick={handlePrev}
          disabled={currentIndex === 0}
          className="px-3.5 py-2 rounded-xl bg-white dark:bg-[var(--background)] border-2 border-[#E6D7BE] border-b-3 disabled:opacity-40 text-xs font-extrabold text-[var(--foreground)] flex items-center gap-1.5 cursor-pointer"
        >
          <ArrowLeft size={14} />
          <span>Önceki</span>
        </button>

        <button
          type="button"
          onClick={handleShowCorrectAnswer}
          disabled={evalState === "correct" || evalState === "revealed"}
          className="px-3 py-2 rounded-xl bg-white dark:bg-[var(--background)] border border-[#E6D7BE] disabled:opacity-40 text-xs font-bold text-[var(--muted)] hover:text-[var(--foreground)] flex items-center gap-1 cursor-pointer"
        >
          <Eye size={13} />
          <span>Cevabı Gör</span>
        </button>

        <button
          type="button"
          onClick={handleNext}
          className="px-4 py-2 rounded-xl bg-[#087F5B] hover:bg-[#065F46] text-white border-b-3 border-[#087F5B] text-xs font-extrabold flex items-center gap-1.5 cursor-pointer"
        >
          <span>
            {currentIndex < questions.length - 1 ? "Sonraki" : "Bitir"}
          </span>
          <ArrowRight size={14} />
        </button>
      </div>
    </div>
  );
}
