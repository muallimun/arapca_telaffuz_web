"use client";

import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import {
  playSuccess,
  playError,
  playFanfare,
  playClick,
} from "@/lib/sfxManager";
import { Dialogue, DictionaryItem } from "@/types/data";
import { shuffleArray } from "@/lib/quiz";
import {
  XCircle,
  Trophy,
  RefreshCcw,
  Timer,
  AlertCircle,
  Volume2,
  CheckCircle2,
  GripVertical,
  Keyboard,
  Lightbulb,
  Eye,
  EyeOff,
  ArrowLeft,
  ArrowRight,
  Play,
  Target,
  X,
  Headphones,
  Puzzle,
  ListChecks,
  Share2,
} from "lucide-react";
import { useCountdown } from "@/lib/useTimer";
import {
  loadAudioManifest,
  hasMp3,
  getMp3Path,
  VoiceOption,
} from "@/lib/audio";
import { useAudioStore } from "@/store/audioStore";
import { useSettings } from "@/store/settings";
import { useUserStore } from "@/store/userStore";
import { formatArabicText, removeArabicHarakat } from "@/lib/arabicTextUtils";
import ArabicVirtualKeyboard from "@/components/ui/ArabicVirtualKeyboard";
import ShareAchievementModal from "@/components/ui/ShareAchievementModal";
import { FeedbackMode, QuizContentType } from "./MultipleChoice";
import { ArabicIdiom, extractDialoguesIdioms } from "@/lib/arabicIdioms";
import {
  normalizeToCanonicalMistakeId,
  formatSrsReviewBanner,
  formatMistakeStageProgressText,
} from "@/lib/mistakeUtils";

export type FillSubMode = "choices" | "dictation";

export interface FillQuestionItem {
  id: string;
  sentenceWithBlank: string;
  fullArabic: string;
  correctWord: string;
  options: string[];
  turkce: string;
  dialogueId: string;
  lineSira: number;
  voice: VoiceOption;
}

interface Props {
  dialogues: Dialogue[];
  vocabulary: DictionaryItem[];
  idioms?: ArabicIdiom[];
  contentType?: QuizContentType;
  feedbackMode?: FeedbackMode;
  initialSubMode?: FillSubMode;
  timeLimit: number | null;
  questionCount?: number;
  isMistakesMode?: boolean;
  onClose?: () => void;
}

/**
 * Akıllı Arapça İmla Normalizasyonu:
 * Harekeleri, tatvili ve noktalama işaretlerini soyar;
 * Elif (أ إ آ ٱ -> ا), Ye/Elif-i Maksure (ى -> ي) ve Te-i Merbuta (ة -> ه) varyasyonlarını eşitler.
 */
export function normalizeArabicSpelling(input: string): string {
  return removeArabicHarakat(input)
    .replace(/\u0640/g, "")
    .replace(/[.,!?؟،؛:"'«»()[\]]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/\s+/g, " ")
    .trim();
}

export default function FillInBlanks({
  dialogues,
  vocabulary,
  idioms = [],
  contentType = "sentences",
  feedbackMode = "instant",
  initialSubMode = "choices",
  timeLimit,
  questionCount = 10,
  isMistakesMode = false,
  onClose,
}: Props) {
  const fanfarePlayedRef = useRef(false);
  const wrongAttemptedQuestionsRef = useRef<Set<string>>(new Set());
  const dropZoneRef = useRef<HTMLSpanElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const [subMode, setSubMode] = useState<FillSubMode>(initialSubMode);
  const [roundSeed, setRoundSeed] = useState(0);
  const [customQuestions, setCustomQuestions] = useState<
    FillQuestionItem[] | null
  >(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFinished, setIsFinished] = useState(false);
  const [isTimeUp, setIsTimeUp] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);

  // Instant mode & End mode state
  const [feedback, setFeedback] = useState<"correct" | "wrong" | null>(null);
  const [selectedWord, setSelectedWord] = useState<string | null>(null);
  const [userAnswers, setUserAnswers] = useState<
    Record<number, { answer: string; isCorrect: boolean }>
  >({});
  const [resultViewMode, setResultViewMode] = useState<"summary" | "review">(
    "summary"
  );
  const [reviewIndex, setReviewIndex] = useState(0);

  // İmla (Dictation) modu state'leri
  const [typedText, setTypedText] = useState<string>("");
  const [spellingNote, setSpellingNote] = useState<string | null>(null);
  const [showWordBank, setShowWordBank] = useState<boolean>(false);
  const [showKeyboard, setShowKeyboard] = useState<boolean>(true);
  const [useDeviceKeyboard, setUseDeviceKeyboard] = useState<boolean>(false);
  const [autoAudio, setAutoAudio] = useState<boolean>(true);
  const [hintCount, setHintCount] = useState<number>(0);
  const lastQuestionKeyRef = useRef<string>("");

  // Sürükle-Bırak (Drag & Drop) State
  const [draggingWord, setDraggingWord] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState<boolean>(false);

  const { speechRate, showHareke, arabicFont } = useSettings();
  const { playAudio, playTTS } = useAudioStore();
  const {
    addStudyMinutes,
    addMistake,
    isMistake,
    recordItemAttempt,
    getSrsRecord,
  } = useUserStore();
  const formatAr = (t: string) => formatArabicText(t, showHareke, arabicFont);

  useEffect(() => {
    loadAudioManifest();
  }, []);

  useEffect(() => {
    setSubMode(initialSubMode);
  }, [initialSubMode]);

  const handleTimeout = () => setIsTimeUp(true);
  const timeLeft = useCountdown(
    timeLimit,
    handleTimeout,
    !isFinished && !isTimeUp
  );

  const itemsSignature = useMemo(
    () =>
      `${dialogues.map((d) => d.id).join("|")}::${vocabulary
        .map((v) => v.id)
        .join("|")}::${idioms.map((i) => i.id).join("|")}`,
    [dialogues, vocabulary, idioms]
  );

  const generatedQuestions: FillQuestionItem[] = useMemo(() => {
    const generated: FillQuestionItem[] = [];

    const stripPunct = (w: string) =>
      w.replace(/[.,!?؟،؛:"'«»()[\]…]/g, "").trim();

    const splitWordPunctuation = (rawToken: string) => {
      const m = rawToken.match(
        /^([.,!?؟،؛:"'«»()[\]…]*)([\s\S]*?)([.,!?؟،؛:"'«»()[\]…]*)$/
      );
      if (!m) {
        const clean = stripPunct(rawToken);
        return { leadingPunct: "", coreWord: clean, trailingPunct: "" };
      }
      return {
        leadingPunct: m[1] || "",
        coreWord: stripPunct(m[2] || ""),
        trailingPunct: m[3] || "",
      };
    };

    const replaceTokenKeepingPunctuation = (
      sentence: string,
      rawToken: string
    ) => {
      const { leadingPunct, trailingPunct } = splitWordPunctuation(rawToken);
      return sentence.replace(
        rawToken,
        `${leadingPunct} [ ? ] ${trailingPunct}`
      );
    };

    const vocabDistractorPool = Array.from(
      new Set([
        ...vocabulary
          .map((v) =>
            stripPunct((v.mufret || v.mazi || "").split("/")[0].trim())
          )
          .filter(Boolean),
        ...idioms
          .flatMap((idm) => idm.arabic.split(/\s+/))
          .map(stripPunct)
          .filter((w) => w.length > 2),
      ])
    );

    if (contentType === "idioms") {
      // 1) Diyalog cümlelerinde geçen kalıp ifadelerden boşluk doldurma üret
      const extracted = extractDialoguesIdioms(dialogues);
      for (const ext of extracted) {
        const idiomWords = ext.arabic
          .split(/\s+/)
          .map(stripPunct)
          .filter((w) => w.length >= 2);
        const lineWords = ext.lineArabic.split(/\s+/);
        // Cümlede kalıp ifadeye ait olan kelimeyi bul
        const matchedLineWord = lineWords.find((lw) => {
          const cleanLw = normalizeArabicSpelling(lw);
          return idiomWords.some(
            (iw) =>
              normalizeArabicSpelling(iw) === cleanLw && cleanLw.length >= 2
          );
        });
        const targetRaw =
          matchedLineWord ||
          lineWords.find((lw) => stripPunct(lw).length > 2);
        if (!targetRaw) continue;
        const cleanTarget = stripPunct(targetRaw);
        const distractors = shuffleArray(
          vocabDistractorPool.filter(
            (w) =>
              normalizeArabicSpelling(w) !==
              normalizeArabicSpelling(cleanTarget)
          )
        ).slice(0, 3);
        if (distractors.length === 3) {
          generated.push({
            id: `fill_idm_dlg_${ext.id}_${ext.lineNumber}`,
            sentenceWithBlank: replaceTokenKeepingPunctuation(
              ext.lineArabic,
              targetRaw
            ),
            fullArabic: ext.lineArabic,
            correctWord: cleanTarget,
            options: shuffleArray([cleanTarget, ...distractors]),
            turkce: `${ext.lineTurkish} (✨ Kalıp İfade: ${ext.meaningTr})`,
            dialogueId: "",
            lineSira: ext.lineNumber,
            voice: "ar-SA-HamedNeural",
          });
        }
      }

      // 2) Çok kelimeli kalıp ifadelerin kendisinden boşluk doldurma üret
      for (const idm of idioms) {
        const words = idm.arabic.trim().split(/\s+/);
        const validWords = words.filter((w) => stripPunct(w).length >= 2);
        if (validWords.length < 2) continue;
        const chosenWord = shuffleArray(validWords)[0];
        const cleanTarget = stripPunct(chosenWord);
        const distractors = shuffleArray(
          vocabDistractorPool.filter(
            (w) =>
              normalizeArabicSpelling(w) !==
              normalizeArabicSpelling(cleanTarget)
          )
        ).slice(0, 3);
        if (distractors.length === 3) {
          generated.push({
            id: `fill_idm_${idm.id}`,
            sentenceWithBlank: replaceTokenKeepingPunctuation(
              idm.arabic,
              chosenWord
            ),
            fullArabic: idm.arabic,
            correctWord: cleanTarget,
            options: shuffleArray([cleanTarget, ...distractors]),
            turkce: `✨ ${idm.meaningTr}${
              idm.literalTr ? ` (Harfiyen: ${idm.literalTr})` : ""
            }`,
            dialogueId: "",
            lineSira: 1,
            voice: "ar-SA-HamedNeural",
          });
        }
      }

      if (generated.length > 0) {
        return shuffleArray(generated).slice(0, questionCount);
      }
    }

    const vocabFormsSet = new Set<string>();
    for (const v of vocabulary) {
      const rawForms = [v.mufret, v.cemi, v.mazi, v.muzari, v.masdar];
      for (const f of rawForms) {
        if (!f || f === "-") continue;
        for (const part of f.split("/")) {
          const clean = stripPunct(part);
          if (clean.length > 1) {
            vocabFormsSet.add(clean);
            vocabFormsSet.add(removeArabicHarakat(clean));
          }
        }
      }
    }

    for (const dlg of dialogues) {
      for (const line of dlg.satirlar) {
        const words = line.arapca.split(/\s+/);
        const validCandidates = words.filter((w) => stripPunct(w).length > 2);
        if (validCandidates.length === 0) continue;

        const vocabMatchedCandidates = validCandidates.filter((w) => {
          const clean = stripPunct(w);
          const bare = removeArabicHarakat(clean);
          const bareNoAl = bare.startsWith("ال") ? bare.slice(2) : bare;
          return (
            vocabFormsSet.has(clean) ||
            vocabFormsSet.has(bare) ||
            (bareNoAl.length > 2 && vocabFormsSet.has(bareNoAl))
          );
        });

        const candidatePool =
          vocabMatchedCandidates.length > 0
            ? vocabMatchedCandidates
            : validCandidates;
        const candidateWord = shuffleArray(candidatePool)[0];

        if (candidateWord) {
          const cleanTarget = stripPunct(candidateWord);
          const distractorWords = shuffleArray(vocabDistractorPool)
            .filter(
              (w) =>
                w &&
                normalizeArabicSpelling(w) !==
                  normalizeArabicSpelling(cleanTarget)
            )
            .slice(0, 3);

          if (distractorWords.length === 3) {
            const allOptions = shuffleArray([cleanTarget, ...distractorWords]);
            const sentenceWithBlank = replaceTokenKeepingPunctuation(
              line.arapca,
              candidateWord
            );
            generated.push({
              id: `fill_${dlg.id}_${line.sira}`,
              sentenceWithBlank,
              fullArabic: line.arapca,
              correctWord: cleanTarget,
              options: allOptions,
              turkce: line.turkce,
              dialogueId: dlg.id,
              lineSira: line.sira,
              voice:
                line.cinsiyet === "K"
                  ? "ar-SA-ZariyahNeural"
                  : "ar-SA-HamedNeural",
            });
          }
        }
      }
    }
    return shuffleArray(generated).slice(0, questionCount);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemsSignature, contentType, questionCount, roundSeed]);

  const questions = customQuestions || generatedQuestions;
  const currentQ = questions[currentIndex];

  const playQuestionSentence = useCallback(
    (q: FillQuestionItem | undefined, customRate?: number) => {
      if (!q) return;
      const rateToUse = customRate ?? speechRate;
      if (hasMp3(q.dialogueId, q.lineSira)) {
        playAudio(getMp3Path(q.dialogueId, q.lineSira), q.lineSira, rateToUse);
      } else {
        playTTS(q.fullArabic, rateToUse, q.lineSira, q.voice);
      }
    },
    [playAudio, playTTS, speechRate]
  );

  // Soru değiştiğinde state sıfırlama ve İmla modunda otomatik ses çalma
  useEffect(() => {
    const qKey = `${currentIndex}_${subMode}_${currentQ?.id || ""}_${roundSeed}_${
      customQuestions ? "custom" : "gen"
    }`;
    if (lastQuestionKeyRef.current === qKey) return;
    lastQuestionKeyRef.current = qKey;

    const saved = userAnswers[currentIndex];
    setFeedback(
      feedbackMode === "instant" && saved?.isCorrect ? "correct" : null
    );
    setSelectedWord(saved?.answer ?? null);
    setTypedText(saved?.answer ?? "");
    setSpellingNote(null);
    setHintCount(0);
    setDraggingWord(null);
    setIsDragOver(false);

    if (
      subMode === "dictation" &&
      autoAudio &&
      !isFinished &&
      !isTimeUp &&
      questions[currentIndex]
    ) {
      const timer = setTimeout(() => {
        playQuestionSentence(questions[currentIndex]);
      }, 220);
      return () => clearTimeout(timer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex, subMode, currentQ?.id, roundSeed, customQuestions]);

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

  const wordBankList = useMemo(() => {
    return shuffleArray(questions.map((q) => q.correctWord));
  }, [questions]);

  if (questions.length === 0 || !currentQ) {
    return (
      <p className="text-center p-8 text-sm font-bold text-[var(--muted)]">
        Seçilen aralıkta boşluk doldurma sorusu üretilemedi.
      </p>
    );
  }

  const correctCount = Object.values(userAnswers).filter(
    (a) => a.isCorrect
  ).length;

  const syncMistakeBook = (q: FillQuestionItem, isRight: boolean) => {
    const canonicalSentId = normalizeToCanonicalMistakeId(q.id, q.fullArabic);
    const canonicalWordId = normalizeToCanonicalMistakeId(
      undefined,
      q.correctWord
    );
    const hadPreviousAttempt = wrongAttemptedQuestionsRef.current.has(q.id);
    const usedHint = hintCount > 0 || showWordBank;
    const inferKind = (cid: string): "word" | "idiom" | "sentence" => {
      if (cid.startsWith("idiom_") || cid.startsWith("idm_")) return "idiom";
      if (cid.startsWith("sent_")) return "sentence";
      return "word";
    };

    if (!isRight) {
      wrongAttemptedQuestionsRef.current.add(q.id);
      if (canonicalSentId) {
        addMistake(canonicalSentId);
        recordItemAttempt(
          canonicalSentId,
          inferKind(canonicalSentId),
          false,
          usedHint
        );
      }
      if (canonicalWordId && canonicalWordId !== canonicalSentId) {
        addMistake(canonicalWordId);
        recordItemAttempt(
          canonicalWordId,
          inferKind(canonicalWordId),
          false,
          usedHint
        );
      }
    } else if (!hadPreviousAttempt) {
      if (canonicalSentId) {
        recordItemAttempt(
          canonicalSentId,
          inferKind(canonicalSentId),
          true,
          usedHint
        );
      }
      if (canonicalWordId && canonicalWordId !== canonicalSentId) {
        recordItemAttempt(
          canonicalWordId,
          inferKind(canonicalWordId),
          true,
          usedHint
        );
      }
    }
  };

  // Seçmeli / Sürükle-Bırak Cevaplama
  const handleChooseOption = (word: string) => {
    if (isTimeUp) return;
    if (feedbackMode === "instant" && feedback === "correct") return;

    const isRight =
      normalizeArabicSpelling(word) ===
      normalizeArabicSpelling(currentQ.correctWord);

    syncMistakeBook(currentQ, isRight);
    setSelectedWord(word);

    if (feedbackMode === "end") {
      playClick();
      setUserAnswers((prev) => ({
        ...prev,
        [currentIndex]: { answer: word, isCorrect: isRight },
      }));
      return;
    }

    // Instant mode
    if (isRight) {
      setFeedback("correct");
      setUserAnswers((prev) => ({
        ...prev,
        [currentIndex]: { answer: currentQ.correctWord, isCorrect: true },
      }));
      playSuccess();
      setTimeout(() => {
        if (currentIndex < questions.length - 1) {
          setCurrentIndex((prev) => prev + 1);
        } else {
          setIsFinished(true);
        }
      }, 1050);
    } else {
      setFeedback("wrong");
      setUserAnswers((prev) => ({
        ...prev,
        [currentIndex]: prev[currentIndex]?.isCorrect
          ? prev[currentIndex]
          : { answer: word, isCorrect: false },
      }));
      playError();
      setTimeout(() => {
        setFeedback(null);
        setSelectedWord(null);
      }, 850);
    }
  };

  // İmla (Dictation) Cevaplama
  const handleCheckDictation = () => {
    if (isTimeUp || !typedText.trim()) return;
    if (feedbackMode === "instant" && feedback === "correct") return;

    const rawTyped = typedText.trim();
    const isRight =
      normalizeArabicSpelling(rawTyped) ===
      normalizeArabicSpelling(currentQ.correctWord);

    syncMistakeBook(currentQ, isRight);

    if (feedbackMode === "end") {
      playClick();
      setUserAnswers((prev) => ({
        ...prev,
        [currentIndex]: { answer: rawTyped, isCorrect: isRight },
      }));
      if (currentIndex < questions.length - 1) {
        setCurrentIndex((prev) => prev + 1);
      } else {
        setIsFinished(true);
      }
      return;
    }

    // Instant mode
    if (isRight) {
      const hasSpellingOrHarakatVariation =
        rawTyped !== currentQ.correctWord.trim();
      setSpellingNote(
        hasSpellingOrHarakatVariation ? currentQ.correctWord : null
      );
      setFeedback("correct");
      setTypedText(currentQ.correctWord);
      setUserAnswers((prev) => ({
        ...prev,
        [currentIndex]: { answer: currentQ.correctWord, isCorrect: true },
      }));
      playSuccess();
      setTimeout(
        () => {
          if (currentIndex < questions.length - 1) {
            setCurrentIndex((prev) => prev + 1);
          } else {
            setIsFinished(true);
          }
        },
        hasSpellingOrHarakatVariation ? 1750 : 1150
      );
    } else {
      setSpellingNote(null);
      setFeedback("wrong");
      setUserAnswers((prev) => ({
        ...prev,
        [currentIndex]: prev[currentIndex]?.isCorrect
          ? prev[currentIndex]
          : { answer: rawTyped, isCorrect: false },
      }));
      playError();
      setTimeout(() => {
        setFeedback(null);
      }, 950);
    }
  };

  // Harf İpucu Al (Mevcut doğru harfleri koruyarak sıradaki harfi ekler)
  const handleLetterHint = () => {
    playClick();
    const bareTarget = removeArabicHarakat(currentQ.correctWord);
    const bareTargetChars = Array.from(bareTarget);
    const bareTyped = removeArabicHarakat(typedText.trim());
    const bareTypedChars = Array.from(bareTyped);

    let matchedPrefixLen = 0;
    while (
      matchedPrefixLen < bareTypedChars.length &&
      matchedPrefixLen < bareTargetChars.length &&
      normalizeArabicSpelling(bareTypedChars[matchedPrefixLen]) ===
        normalizeArabicSpelling(bareTargetChars[matchedPrefixLen])
    ) {
      matchedPrefixLen++;
    }

    const baseLen = Math.max(matchedPrefixLen, hintCount);
    const nextLen = Math.min(bareTargetChars.length, baseLen + 1);
    setHintCount(nextLen);
    setTypedText(bareTargetChars.slice(0, nextLen).join(""));
    inputRef.current?.focus();
  };

  // --- HTML5 DRAG & DROP HANDLERS ---
  const handleDragStart = (
    e: React.DragEvent<HTMLButtonElement>,
    word: string
  ) => {
    if (feedback === "correct" || isTimeUp) return;
    setDraggingWord(word);
    e.dataTransfer.setData("text/plain", word);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragEnd = () => {
    setDraggingWord(null);
    setIsDragOver(false);
  };

  const handleDragOver = (e: React.DragEvent<HTMLSpanElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (!isDragOver) setIsDragOver(true);
  };

  const handleDragEnter = (e: React.DragEvent<HTMLSpanElement>) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLSpanElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    const droppedWord = e.dataTransfer.getData("text/plain") || draggingWord;
    setDraggingWord(null);
    if (droppedWord) {
      handleChooseOption(droppedWord);
    }
  };

  // --- MOBİL DOKUNMATİK SÜRÜKLE-BIRAK (TOUCH DRAG) ---
  const handleTouchMove = (
    e: React.TouchEvent<HTMLButtonElement>,
    word: string
  ) => {
    if (feedback === "correct" || isTimeUp) return;
    const touch = e.touches[0];
    if (!touch) return;
    if (draggingWord !== word) setDraggingWord(word);
    const targetEl = document.elementFromPoint(touch.clientX, touch.clientY);
    if (
      dropZoneRef.current &&
      targetEl &&
      (dropZoneRef.current === targetEl ||
        dropZoneRef.current.contains(targetEl))
    ) {
      if (!isDragOver) setIsDragOver(true);
    } else if (isDragOver) {
      setIsDragOver(false);
    }
  };

  const handleTouchEnd = (
    e: React.TouchEvent<HTMLButtonElement>,
    word: string
  ) => {
    if (!draggingWord) return;
    const touch = e.changedTouches[0];
    if (touch && dropZoneRef.current) {
      const targetEl = document.elementFromPoint(touch.clientX, touch.clientY);
      if (
        targetEl &&
        (dropZoneRef.current === targetEl ||
          dropZoneRef.current.contains(targetEl))
      ) {
        setIsDragOver(false);
        setDraggingWord(null);
        handleChooseOption(word);
        return;
      }
    }
    setIsDragOver(false);
    setDraggingWord(null);
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

  // 4 Sonuç Ekranı Aksiyonu
  const handleRepeatSameSet = () => {
    playClick();
    fanfarePlayedRef.current = false;
    setCustomQuestions(
      shuffleArray(
        questions.map((q) => ({
          ...q,
          options: shuffleArray([...q.options]),
        }))
      )
    );
    setCurrentIndex(0);
    setUserAnswers({});
    setFeedback(null);
    setSelectedWord(null);
    setTypedText("");
    setResultViewMode("summary");
    setReviewIndex(0);
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
    setFeedback(null);
    setSelectedWord(null);
    setTypedText("");
    setResultViewMode("summary");
    setReviewIndex(0);
    setIsFinished(false);
    setIsTimeUp(false);
  };

  const wrongQuestions = questions.filter(
    (_, idx) => !userAnswers[idx]?.isCorrect
  );

  const handleRetryWrongOnly = () => {
    if (wrongQuestions.length === 0) return;
    playClick();
    fanfarePlayedRef.current = false;
    setCustomQuestions(
      shuffleArray(
        wrongQuestions.map((q) => ({
          ...q,
          options: shuffleArray([...q.options]),
        }))
      )
    );
    setCurrentIndex(0);
    setUserAnswers({});
    setFeedback(null);
    setSelectedWord(null);
    setTypedText("");
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
        <ShareAchievementModal
          isOpen={shareOpen}
          onClose={() => setShareOpen(false)}
          title="Boşluk Doldurma & İmla Alıştırması"
          subtitle={`${questions.length} Cümleden ${correctCount} Doğru Tamamlama`}
          levelLabel="A1-B2"
          scorePercent={pct}
          pointsText={`${totalPoints} Puan`}
          wordsCount={questions.length}
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
              {isFinished ? "Boşluk Doldurma Tamamlandı!" : "Süre Doldu!"}
            </h3>
            <p className="text-xs font-semibold text-[var(--muted)]">
              {questions.length} cümleden {correctCount} doğru, {wrongCount}{" "}
              yanlış tamamladınız
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
                    ? "bg-[#0CA678] text-white shadow-2xs"
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
              Cümle Dökümü ({questions.length} Cümle)
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
                        className="text-emerald-600 shrink-0"
                      />
                    ) : (
                      <XCircle size={16} className="text-rose-600 shrink-0" />
                    )}
                    <span
                      dir="rtl"
                      className="arabic text-lg font-bold text-[var(--foreground)]"
                    >
                      {formatAr(q.fullArabic)}
                    </span>
                  </div>
                  <div className="text-right text-[11px] font-bold shrink-0">
                    {!isOk && ans?.answer && (
                      <span
                        dir="rtl"
                        className="arabic text-sm text-rose-700 line-through block"
                      >
                        Yanıtınız: {formatAr(ans.answer)}
                      </span>
                    )}
                    {!ans && (
                      <span className="text-slate-500 italic block">
                        Boş Bırakıldı
                      </span>
                    )}
                    <span
                      dir="rtl"
                      className="arabic text-base text-emerald-800 dark:text-emerald-300 block"
                    >
                      Doğru: {formatAr(q.correctWord)}
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
                Cümle {reviewIndex + 1} / {questions.length} İncelemesi
              </span>
              <button
                type="button"
                onClick={() => {
                  playClick();
                  playQuestionSentence(reviewQ);
                }}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#0CA678] text-white text-xs font-bold cursor-pointer"
              >
                <Volume2 size={13} />
                <span>Cümleyi Dinle</span>
              </button>
            </div>

            <div
              dir="rtl"
              className="arabic text-2xl sm:text-3xl leading-[2.0] font-bold text-[var(--foreground)] text-center py-1"
            >
              {reviewQ.sentenceWithBlank.split("[ ? ]").map((part, i, arr) => (
                <span key={i}>
                  {formatAr(part)}
                  {i < arr.length - 1 && (
                    <span className="inline-block px-3 py-0.5 mx-1 rounded-lg bg-emerald-100 text-emerald-900 border border-emerald-400">
                      {formatAr(reviewQ.correctWord)}
                    </span>
                  )}
                </span>
              ))}
            </div>

            <p className="text-center text-xs font-semibold text-[var(--muted)]">
              “{reviewQ.turkce}”
            </p>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
              {reviewQ.options.map((wOpt, oIdx) => {
                const isRight =
                  normalizeArabicSpelling(wOpt) ===
                  normalizeArabicSpelling(reviewQ.correctWord);
                const isUserChoice =
                  Boolean(reviewAns?.answer) &&
                  normalizeArabicSpelling(reviewAns!.answer) ===
                    normalizeArabicSpelling(wOpt);
                return (
                  <div
                    key={oIdx}
                    dir="rtl"
                    className={`py-2.5 px-3 rounded-xl border-2 arabic text-xl font-bold flex items-center justify-center gap-1.5 ${
                      isRight
                        ? "bg-emerald-50 border-emerald-500 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200"
                        : isUserChoice
                        ? "bg-rose-50 border-rose-500 text-rose-900 dark:bg-rose-950/40 dark:text-rose-200"
                        : "bg-[#F7EFE1]/50 dark:bg-[var(--surface)] border-[#E6D7BE] text-[var(--muted)] opacity-75"
                    }`}
                  >
                    <span>{formatAr(wOpt)}</span>
                    {isRight && (
                      <CheckCircle2
                        size={15}
                        className="text-emerald-600 shrink-0"
                      />
                    )}
                    {!isRight && isUserChoice && (
                      <XCircle size={15} className="text-rose-600 shrink-0" />
                    )}
                  </div>
                );
              })}
            </div>

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

        {/* BAŞARI KARTINI PAYLAŞ / İNDİR BUTONU */}
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
            className="py-3 px-4 rounded-xl bg-[#0CA678] hover:bg-[#099268] text-white border-b-4 border-[#087F5B] font-extrabold text-xs flex items-center justify-center gap-1.5 cursor-pointer"
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
    <div className="max-w-3xl mx-auto space-y-3.5 pb-24 sm:pb-10">
      {/* ÜST DURUM, ALT MOD SEÇİCİ VE SORU GEZGİNİ (1..N) ÇUBUĞU */}
      <div className="bg-[#F7EFE1] dark:bg-[var(--surface)] rounded-2xl border-2 border-[#E6D7BE] dark:border-[var(--border)] border-b-4 px-3.5 py-2.5 space-y-2.5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center justify-between sm:justify-start gap-2">
            <span className="text-xs sm:text-sm font-extrabold text-[var(--foreground)] tabular-nums">
              Cümle {currentIndex + 1} / {questions.length}
            </span>

            <div className="flex sm:hidden items-center gap-1.5">
              {timeLeft !== null && (
                <div
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-xl border text-xs font-black tabular-nums ${
                    timeLeft <= 5
                      ? "bg-red-100 border-red-300 text-red-700 animate-pulse"
                      : "bg-white dark:bg-[var(--background)] border-[#E6D7BE] text-amber-700"
                  }`}
                >
                  <Timer size={14} />
                  <span>{timeLeft} sn</span>
                </div>
              )}

              <span className="text-xs font-extrabold text-[#087F5B] bg-white dark:bg-[var(--background)] border border-[#E6D7BE] px-2.5 py-1 rounded-xl tabular-nums">
                {feedbackMode === "instant"
                  ? `Doğru: ${correctCount}`
                  : `Yanıtlanan: ${Object.keys(userAnswers).length}/${questions.length}`}
              </span>
            </div>
          </div>

          {/* Alt Yöntem Anahtarı: Seçmeli / Sürükle-Bırak vs Dinle & Boşluğu Yaz (İmla) */}
          <div className="bg-white dark:bg-[var(--background)] rounded-xl p-1 border border-[#E6D7BE] dark:border-[var(--border)] grid grid-cols-2 gap-1.5 w-full sm:w-auto">
            <button
              type="button"
              onClick={() => {
                playClick();
                setSubMode("choices");
              }}
              className={`px-2.5 py-1.5 rounded-lg text-[11px] font-extrabold flex items-center justify-center gap-1 transition-all cursor-pointer ${
                subMode === "choices"
                  ? "bg-[#6741D9] text-white"
                  : "text-[var(--muted)] hover:text-[var(--foreground)]"
              }`}
            >
              <Puzzle size={12} className="shrink-0" />
              <span className="leading-tight">Seçmeli / Sürükle-Bırak</span>
            </button>
            <button
              type="button"
              onClick={() => {
                playClick();
                setSubMode("dictation");
              }}
              className={`px-2.5 py-1.5 rounded-lg text-[11px] font-extrabold flex items-center justify-center gap-1 transition-all cursor-pointer ${
                subMode === "dictation"
                  ? "bg-[#6741D9] text-white"
                  : "text-[var(--muted)] hover:text-[var(--foreground)]"
              }`}
            >
              <Headphones size={12} className="shrink-0" />
              <span className="leading-tight">Dinle & Boşluğu Yaz (İmla)</span>
            </button>
          </div>

          <div className="hidden sm:flex items-center gap-2">
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

            <span className="text-xs sm:text-sm font-extrabold text-[#087F5B] bg-white dark:bg-[var(--background)] border border-[#E6D7BE] px-3 py-1 rounded-xl tabular-nums">
              {feedbackMode === "instant"
                ? `Doğru: ${correctCount}`
                : `Yanıtlanan: ${Object.keys(userAnswers).length}/${questions.length}`}
            </span>
          </div>
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
                title={`Cümle ${idx + 1}`}
              >
                {idx + 1}
              </button>
            );
          })}
        </div>
      </div>

      {/* SEÇMELİ MODDA ÜST KELİME HAVUZU ŞERİDİ (İMLA MODUNDA GİZLİ) */}
      {subMode === "choices" && (
        <div className="bg-[#F7EFE1] dark:bg-[var(--surface)] rounded-2xl border-2 border-[#E6D7BE] dark:border-[var(--border)] px-3.5 py-2.5 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-extrabold text-[var(--foreground)]">
              📝 Boşlukları uygun kelimelerle doldurunuz
            </span>
            <button
              type="button"
              onClick={() => {
                playClick();
                setShowWordBank((v) => !v);
              }}
              className="px-3 py-1 rounded-xl bg-white dark:bg-[var(--background)] border border-[#E6D7BE] hover:border-[#6741D9] text-xs font-extrabold text-[#6741D9] flex items-center gap-1.5 cursor-pointer"
            >
              {showWordBank ? <EyeOff size={13} /> : <Eye size={13} />}
              <span>
                {showWordBank
                  ? "Kelime Havuzunu Gizle"
                  : "Kelime Havuzunu Göster"}
              </span>
            </button>
          </div>

          {showWordBank && (
            <div
              dir="rtl"
              className="pt-2 border-t border-dashed border-[#E2D3B8] flex flex-wrap items-center justify-center gap-2"
            >
              {wordBankList.map((w, i) => (
                <button
                  key={`${w}-${i}`}
                  type="button"
                  onClick={() => {
                    playClick();
                    handleChooseOption(w);
                  }}
                  className="px-3 py-1 rounded-xl bg-white dark:bg-[var(--background)] border border-[#6741D9]/40 hover:border-[#6741D9] arabic text-xl font-bold text-[#4C28B5] dark:text-[#d0bfff] cursor-pointer"
                >
                  {formatAr(w)}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* CÜMLE KARTI */}
      <div
        className={`rounded-2xl border-2 border-b-4 p-3 sm:p-5 text-center space-y-2.5 sm:space-y-3.5 transition-all ${
          feedback === "correct"
            ? "bg-emerald-50 border-[#0CA678]"
            : feedback === "wrong"
            ? "bg-rose-50 border-rose-400"
            : "bg-[#F7EFE1] dark:bg-[var(--surface)] border-[#E6D7BE] dark:border-[var(--border)]"
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-dashed border-[#E2D3B8] pb-2 text-xs font-bold text-[var(--muted)]">
          <span className="text-[11px] sm:text-xs">
            {subMode === "choices"
              ? "💡 Kelimeye tıklayın veya cümledeki boşluğa sürükleyip bırakın"
              : "🎧 Cümleyi dinleyin ve eksik Arapça kelimeyi boşluğa yazın"}
          </span>

          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                playClick();
                playQuestionSentence(currentQ);
              }}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-[#0CA678] text-white font-bold border-b-2 border-[#087F5B] cursor-pointer"
            >
              <Volume2 size={13} />
              <span>Cümleyi Dinle</span>
            </button>

            {subMode === "dictation" && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    playClick();
                    playQuestionSentence(currentQ, 0.75);
                  }}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-xl bg-white dark:bg-[var(--background)] border border-[#E6D7BE] text-[var(--foreground)] font-extrabold cursor-pointer"
                >
                  <span>🐢 0.75x</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    playClick();
                    setAutoAudio((v) => !v);
                  }}
                  className={`inline-flex items-center gap-1 px-2 py-1 rounded-xl border font-extrabold cursor-pointer ${
                    autoAudio
                      ? "bg-[#E6FCF5] border-[#0CA678] text-[#087F5B]"
                      : "bg-white dark:bg-[var(--background)] border-[#E6D7BE] text-[var(--muted)]"
                  }`}
                >
                  <span>🔄 Oto Ses: {autoAudio ? "Açık" : "Kapalı"}</span>
                </button>
              </>
            )}
          </div>
        </div>

        {/* ARAPÇA CÜMLE VE BOŞLUK ALANI */}
        <div
          dir="rtl"
          className="arabic text-2xl sm:text-4xl leading-[1.9] sm:leading-[2.1] font-bold text-[var(--foreground)] flex flex-wrap justify-center items-center gap-2 py-1"
        >
          {currentQ.sentenceWithBlank.split("[ ? ]").map((part, i, arr) => (
            <span key={i} className="inline-flex items-center flex-wrap gap-2">
              <span>{formatAr(part)}</span>
              {i < arr.length - 1 && (
                <>
                  {subMode === "choices" ? (
                    <span
                      ref={dropZoneRef}
                      onDragOver={handleDragOver}
                      onDragEnter={handleDragEnter}
                      onDragLeave={handleDragLeave}
                      onDrop={handleDrop}
                      className={`inline-flex items-center justify-center min-w-[130px] px-4 py-1 rounded-xl border-2 border-dashed mx-1.5 transition-all select-none ${
                        feedback === "correct"
                          ? "border-[#0CA678] bg-[#0CA678] text-white scale-105"
                          : feedback === "wrong" && selectedWord
                          ? "border-rose-500 bg-rose-100 text-rose-800"
                          : feedbackMode === "end" && selectedWord
                          ? "border-[#6741D9] bg-[#6741D9] text-white"
                          : isDragOver
                          ? "ring-4 ring-emerald-500/30 border-emerald-500 bg-emerald-50/70 dark:bg-emerald-950/60 text-[#087F5B] dark:text-[#20c997] scale-105"
                          : "border-[#6741D9] bg-[#F3F0FF] dark:bg-[var(--lavender-bg)] text-[#6741D9] dark:text-[#d0bfff]"
                      }`}
                    >
                      {feedback === "correct"
                        ? formatAr(currentQ.correctWord)
                        : selectedWord
                        ? formatAr(selectedWord)
                        : isDragOver && draggingWord
                        ? formatAr(draggingWord)
                        : "____"}
                    </span>
                  ) : (
                    /* İMLA MODU: KLAVYELİ METİN KUTUSU + [⌨️] SANAL KLAVYE BUTONU */
                    <span
                      dir="rtl"
                      className="inline-flex items-center gap-1.5 mx-1.5"
                    >
                      {feedback === "correct" ? (
                        <span className="inline-flex items-center gap-1.5 px-4 py-1 rounded-xl bg-[#0CA678] text-white border-2 border-[#087F5B] scale-105">
                          <CheckCircle2 size={18} />
                          <span>{formatAr(currentQ.correctWord)}</span>
                        </span>
                      ) : (
                        <>
                          <input
                            ref={inputRef}
                            type="text"
                            inputMode={
                              showKeyboard && !useDeviceKeyboard
                                ? "none"
                                : "text"
                            }
                            dir="rtl"
                            value={typedText}
                            onChange={(e) => setTypedText(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                handleCheckDictation();
                              }
                            }}
                            placeholder="....."
                            aria-label="Eksik Arapça kelimeyi yazın"
                            className={`w-28 sm:w-40 inline-flex h-10 sm:h-11 px-2.5 rounded-xl border-2 text-center arabic text-xl sm:text-3xl font-bold focus:outline-none transition-all ${
                              feedback === "wrong"
                                ? "bg-rose-50 border-rose-500 text-rose-800"
                                : "bg-white dark:bg-[var(--background)] border-[#6741D9] text-[#087F5B] dark:text-[#20c997] focus:ring-4 focus:ring-[#6741D9]/20"
                            }`}
                          />
                          <button
                            type="button"
                            onClick={() => {
                              playClick();
                              setShowKeyboard((v) => {
                                const next = !v;
                                if (next) setUseDeviceKeyboard(false);
                                return next;
                              });
                            }}
                            title="Arapça Sanal Klavyeyi Aç/Kapat"
                            className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl border-2 border-b-3 flex items-center justify-center transition-all cursor-pointer ${
                              showKeyboard && !useDeviceKeyboard
                                ? "bg-[#6741D9] border-[#5230B5] text-white"
                                : "bg-white dark:bg-[var(--background)] border-[#E6D7BE] text-[#6741D9]"
                            }`}
                          >
                            <Keyboard size={16} />
                          </button>
                        </>
                      )}
                    </span>
                  )}
                </>
              )}
            </span>
          ))}
        </div>

        {/* PEDAGOJİK İMLA VE HEMZE/HAREKE NOTU */}
        {subMode === "dictation" && feedback === "correct" && spellingNote && (
          <div className="mx-auto max-w-xl rounded-xl bg-emerald-100/90 dark:bg-emerald-950/60 border border-emerald-400 px-3 py-2 text-xs sm:text-sm font-bold text-emerald-900 dark:text-emerald-200 flex flex-wrap items-center justify-center gap-1.5 animate-in fade-in duration-150">
            <span>
              ✅ Doğru! İmla Notu: Kelimenin tam harekeli ve hemzeli yazılışı:
            </span>
            <bdi
              dir="rtl"
              className="arabic text-xl sm:text-2xl font-extrabold text-[#087F5B] dark:text-emerald-300 px-1.5"
            >
              {formatAr(spellingNote)}
            </bdi>
          </div>
        )}

        {/* TÜRKÇE ANLAM İPUCU VE İMLA HARF İPUCU TEK KOMPAKT SATIRDA */}
        <div className="mt-1.5 pt-2 border-t border-dashed border-[#E2D3B8] flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs sm:text-sm font-semibold text-[var(--muted)] flex-1 text-center sm:text-left">
            “{currentQ.turkce}”
          </p>

          {subMode === "dictation" && feedback !== "correct" && (
            <div className="flex items-center gap-2 shrink-0 mx-auto sm:mx-0">
              <button
                type="button"
                onClick={handleLetterHint}
                className="h-8 px-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/50 border-2 border-amber-300 border-b-3 text-amber-800 dark:text-amber-300 text-xs font-extrabold flex items-center gap-1 hover:bg-amber-100 cursor-pointer"
              >
                <Lightbulb size={13} />
                <span>Harf İpucu</span>
              </button>

              {!showKeyboard && (
                <button
                  type="button"
                  onClick={handleCheckDictation}
                  disabled={!typedText.trim()}
                  className="h-8 px-3.5 rounded-xl bg-[#0CA678] hover:bg-[#099268] disabled:opacity-50 text-white border-b-3 border-[#087F5B] text-xs font-extrabold flex items-center gap-1 cursor-pointer"
                >
                  <CheckCircle2 size={13} />
                  <span>
                    {feedbackMode === "end"
                      ? currentIndex === questions.length - 1
                        ? "✅ Bitir & Sonuçlar"
                        : "Kaydet & İlerle"
                      : "Kontrol Et"}
                  </span>
                </button>
              )}
            </div>
          )}
        </div>

        {(() => {
          const cid =
            normalizeToCanonicalMistakeId(currentQ.id, currentQ.fullArabic) ||
            normalizeToCanonicalMistakeId(undefined, currentQ.correctWord);
          const srsRec = cid ? getSrsRecord(cid) : undefined;
          const inMistakes = cid ? isMistake(cid) : false;
          const banner = formatSrsReviewBanner(srsRec, inMistakes);
          return (
            <>
              {banner && (
                <div className="rounded-xl bg-[#F3F0FF] dark:bg-[var(--lavender-bg)] border border-[#6741D9]/35 px-3 py-1.5 text-[11px] font-bold text-[#4C28B5] dark:text-[#d0bfff] text-left">
                  {banner}
                </div>
              )}
              {feedback === "correct" &&
                (isMistakesMode || inMistakes) &&
                srsRec && (
                  <div className="rounded-xl bg-emerald-100/90 dark:bg-emerald-950/50 border border-emerald-400 px-3 py-1.5 text-[11px] font-extrabold text-[#087F5B] dark:text-emerald-300 text-left">
                    {formatMistakeStageProgressText(srsRec)}
                  </div>
                )}
            </>
          );
        })()}
      </div>

      {/* ALT BÖLÜM: SEÇMELİ MODDA 4 ŞIK, İMLA MODUNDA CÜMLENİN HEMEN ALTINDA ARAPÇA SANAL KLAVYE */}
      {subMode === "choices" ? (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {currentQ.options.map((word, idx) => {
              const isChosen = selectedWord === word;
              const isRight =
                feedbackMode === "instant" &&
                feedback === "correct" &&
                word === currentQ.correctWord;
              const isWrong =
                feedbackMode === "instant" && feedback === "wrong" && isChosen;
              const isNeutralChosen = feedbackMode === "end" && isChosen;
              const isDragging = draggingWord === word;

              return (
                <button
                  key={idx}
                  type="button"
                  draggable={feedback !== "correct" && !isTimeUp}
                  onDragStart={(e) => handleDragStart(e, word)}
                  onDragEnd={handleDragEnd}
                  onTouchMove={(e) => handleTouchMove(e, word)}
                  onTouchEnd={(e) => handleTouchEnd(e, word)}
                  onClick={() => handleChooseOption(word)}
                  className={`py-4 px-3 rounded-2xl border-2 border-b-4 arabic text-2xl sm:text-3xl font-bold transition-all flex items-center justify-center gap-2 cursor-grab active:cursor-grabbing ${
                    isDragging ? "opacity-60 scale-95 border-[#6741D9]" : ""
                  } ${
                    isRight
                      ? "bg-[#0CA678] border-[#087F5B] text-white"
                      : isWrong
                      ? "bg-rose-100 border-rose-400 text-rose-800"
                      : isNeutralChosen
                      ? "bg-[#F3F0FF] dark:bg-[var(--lavender-bg)] border-[#6741D9] text-[#4C28B5]"
                      : "bg-[#F7EFE1] dark:bg-[var(--surface)] border-[#E6D7BE] dark:border-[var(--border)] hover:border-[#6741D9] text-[var(--foreground)] active:border-b-2 active:translate-y-0.5"
                  }`}
                >
                  <GripVertical
                    size={15}
                    className={`shrink-0 opacity-45 ${
                      isRight ? "text-white" : "text-[var(--muted)]"
                    }`}
                  />
                  <span dir="rtl">{formatAr(word)}</span>
                  {isRight && <CheckCircle2 size={18} className="shrink-0" />}
                  {isWrong && <XCircle size={18} className="shrink-0" />}
                </button>
              );
            })}
          </div>
        </>
      ) : showKeyboard ? (
        <div className="mt-2">
          <ArabicVirtualKeyboard
            onKeyPress={(ch) => setTypedText((prev) => prev + ch)}
            onBackspace={() => setTypedText((prev) => prev.slice(0, -1))}
            onClear={() => setTypedText("")}
            onEnter={handleCheckDictation}
            onClose={() => {
              setShowKeyboard(false);
              setUseDeviceKeyboard(true);
              setTimeout(() => inputRef.current?.focus(), 40);
            }}
            useDeviceKeyboard={useDeviceKeyboard}
            onToggleDeviceKeyboard={() => {
              setUseDeviceKeyboard((prev) => {
                const next = !prev;
                setTimeout(() => inputRef.current?.focus(), 40);
                return next;
              });
            }}
          />
        </div>
      ) : (
        <div className="flex justify-end mt-1.5">
          <button
            type="button"
            onClick={() => {
              playClick();
              setUseDeviceKeyboard(false);
              setShowKeyboard(true);
            }}
            className="px-3 py-1.5 rounded-xl bg-white dark:bg-[var(--surface)] border border-[#6741D9]/40 text-xs font-extrabold text-[#6741D9] dark:text-[#d0bfff] hover:border-[#6741D9] flex items-center gap-1.5 cursor-pointer"
          >
            <span>⌨️ Sanal Klavyeyi Aç</span>
          </button>
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
          className="flex-1 py-3 px-5 bg-[#0CA678] hover:bg-[#099268] text-white font-extrabold text-xs sm:text-sm rounded-2xl border-b-4 border-[#087F5B] active:border-b-0 active:translate-y-0.5 transition-all flex items-center justify-center gap-2 cursor-pointer"
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