"use client";

import { use, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, notFound } from "next/navigation";
import {
  Play,
  Square,
  Volume2,
  ChevronLeft,
  ChevronRight,
  Heart,
  CheckCircle2,
  Mic,
  Eye,
  Sparkles,
  Repeat,
  Columns2,
  Rows2,
  Languages,
  MousePointerClick,
  FileText,
  Maximize2,
  MoreHorizontal,
  X,
  Share2,
  Download,
  GraduationCap,
  ClipboardCheck,
} from "lucide-react";
import { diyaloglar, getDialogueById } from "@/lib/data";
import {
  loadAudioManifest,
  hasMp3,
  getMp3Path,
  VoiceOption,
  speakHybrid,
} from "@/lib/audio";
import {
  isDialogueOfflineReady,
  downloadDialogueOfflinePack,
  getDialogueAudioUrls,
} from "@/lib/offlineManager";
import { useAudioStore } from "@/store/audioStore";
import {
  useSettings,
  ViewMode,
  WordTrackingStyle,
  PauseBetweenLines,
} from "@/store/settings";
import { useUserStore } from "@/store/userStore";
import {
  playClick,
  playSuccess,
  playRecordStart,
  playRecordStop,
  playFanfare,
} from "@/lib/sfxManager";
import WordTooltip from "@/components/ui/WordTooltip";
import ShadowingButton from "@/components/ui/ShadowingButton";
import ShadowingModal from "@/components/ui/ShadowingModal";
import DialoguePdfModal from "@/components/ui/DialoguePdfModal";
import ShareAchievementModal, {
  TeacherHomeworkModal,
} from "@/components/ui/ShareAchievementModal";
import {
  getDialogueVocabulary,
  DialogueVocabularyEntry,
  getWordCategory,
} from "@/lib/dict";
import {
  extractDialogueIdioms,
  ExtractedDialogueIdiom,
  normalizeForIdiomMatch,
} from "@/lib/arabicIdioms";
import { DialogueLine, DictionaryItem } from "@/types/data";
import {
  start16kHzRecorder,
  RecordingSession16kHz,
  evaluateAcousticDspSentence,
} from "@/lib/audioAnalysis";
import { HybridSpeechManager } from "@/lib/speechManager";
import { evaluateSentenceWords } from "@/lib/arabicNlpEngine";
import { formatArabicText, splitMixedBidiText } from "@/lib/arabicTextUtils";
import {
  requestWakeLock,
  releaseWakeLock,
  releaseAllWakeLocks,
} from "@/lib/wakeLock";

type StudyMode = "listen" | "shadowing" | "roleplay" | "vocabulary";
type FlowMode = "single" | "sequential";

export default function DialogueDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = use(params);
  const router = useRouter();
  const dialogue = getDialogueById(resolvedParams.id);

  const {
    stop,
    playAudio,
    playTTS,
    setPlaybackRate,
    playingLineId,
    activeWordIndex,
    activeWordProgress,
    isShadowingPause,
    shadowingPauseMs,
    setShadowingPause,
    waitShadowingPause,
  } = useAudioStore();
  const {
    viewMode,
    setViewMode,
    showHareke,
    toggleHareke,
    showShadowing,
    arabicFont,
    arabicFontSize,
    turkishFontSize,
    speechRate,
    setSpeechRate,
    dialogueLoopCount,
    cycleDialogueLoopCount,
    wordTrackingStyle,
    setWordTrackingStyle,
    pauseBetweenLines,
    setPauseBetweenLines,
  } = useSettings();

  const {
    toggleFavoriteDialogue,
    isDialogueFavorite,
    toggleCompletedDialogue,
    isDialogueCompleted,
    toggleFavoriteWord,
    isWordFavorite,
    toggleLearnedWord,
    isWordLearned,
    recordPronunciationScore,
    pronunciationScores,
    mistakeIds,
  } = useUserStore();

  const [mounted, setMounted] = useState(false);
  const [, setManifestLoaded] = useState(false);
  const [studyMode, setStudyMode] = useState<StudyMode>("listen");
  const [clickToRevealTr, setClickToRevealTr] = useState<boolean>(false);
  const [revealedTrLines, setRevealedTrLines] = useState<
    Record<number, boolean>
  >({});
  const [revealedArLines, setRevealedArLines] = useState<
    Record<number, boolean>
  >({});
  const [blurArabic, setBlurArabic] = useState<boolean>(false);
  const [unblurredLines, setUnblurredLines] = useState<Record<number, boolean>>(
    {}
  );
  const [isClassroomMode, setIsClassroomMode] = useState<boolean>(false);
  const [classroomScale, setClassroomScale] = useState<number>(1.5);
  const [spotlightMode, setSpotlightMode] = useState<boolean>(true);
  const [selectedClassroomLine, setSelectedClassroomLine] = useState<
    number | null
  >(1);
  const [flowMode, setFlowMode] = useState<FlowMode>("single");
  const [isPlayingAll, setIsPlayingAll] = useState(false);
  const [dialogueLoopTurn, setDialogueLoopTurn] = useState<number>(1);
  const [loopingLineSira, setLoopingLineSira] = useState<number | null>(null);
  const [sentenceLoopRemaining, setSentenceLoopRemaining] = useState<
    number | "infinite" | null
  >(null);
  const [autoShadowingFlow, setAutoShadowingFlow] = useState<boolean>(false);
  const [shadowingPauseLineSira, setShadowingPauseLineSira] = useState<
    number | null
  >(null);
  const [shadowingPauseRemainingPct, setShadowingPauseRemainingPct] =
    useState<number>(100);

  // Lightbox (Kapak Görseli Büyütme), PDF Modal, Paylaşım Modalı, Öğretmen Ödev Modalı ve "⋯" Diğer Menüsü State
  const [isLightboxOpen, setIsLightboxOpen] = useState<boolean>(false);
  const [isPdfModalOpen, setIsPdfModalOpen] = useState<boolean>(false);
  const [isShareModalOpen, setIsShareModalOpen] = useState<boolean>(false);
  const [isTeacherHwModalOpen, setIsTeacherHwModalOpen] =
    useState<boolean>(false);
  const [isHwReportModalOpen, setIsHwReportModalOpen] =
    useState<boolean>(false);
  const [isHwQuizModalOpen, setIsHwQuizModalOpen] = useState<boolean>(false);
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState<boolean>(false);
  const moreMenuRef = useRef<HTMLDivElement | null>(null);

  // Öğrenci Ödev Takip Modu (?hw=1&pron=3&quiz=1&title=...) State
  const [hwConfig, setHwConfig] = useState<{
    active: boolean;
    title: string;
    requireListen: boolean;
    pronCount: number;
    requireQuiz: boolean;
  }>({
    active: false,
    title: "",
    requireListen: true,
    pronCount: 3,
    requireQuiz: true,
  });
  const [hwListenedLines, setHwListenedLines] = useState<number[]>([]);
  const [hwPronouncedCount, setHwPronouncedCount] = useState<number>(0);
  const [hwCollectedScores, setHwCollectedScores] = useState<number[]>([]);
  const [hwQuizCompleted, setHwQuizCompleted] = useState<boolean>(false);
  const [hwQuizStep, setHwQuizStep] = useState<number>(0);
  const [hwQuizSelectedOpt, setHwQuizSelectedOpt] = useState<string | null>(
    null
  );
  const [hwQuizCorrectCount, setHwQuizCorrectCount] = useState<number>(0);
  const prevPronCountRef = useRef<number | null>(null);

  // Çevrimdışı Ders Paketi (Cache API) State
  const [isOfflineReady, setIsOfflineReady] = useState<boolean>(false);
  const [isDownloadingOffline, setIsDownloadingOffline] =
    useState<boolean>(false);
  const [offlineProgressPct, setOfflineProgressPct] = useState<number>(0);
  const [offlineEstimatedMb, setOfflineEstimatedMb] = useState<number>(1.2);
  const [showOfflineNotice, setShowOfflineNotice] = useState<boolean>(false);

  // Rol Yapma (Roleplay) Canlı Simülasyon State
  const [selectedRoleSpeaker, setSelectedRoleSpeaker] = useState<string>("");
  const [isRoleplayRunning, setIsRoleplayRunning] = useState<boolean>(false);
  const [hideRoleplayUserText, setHideRoleplayUserText] =
    useState<boolean>(true);
  const [roleplayHintLevels, setRoleplayHintLevels] = useState<
    Record<number, number>
  >({});
  const [roleplayCompletedLines, setRoleplayCompletedLines] = useState<
    Record<number, boolean>
  >({});
  const [roleplayActiveLine, setRoleplayActiveLine] = useState<number | null>(
    null
  );
  const [roleplaySpeakingLine, setRoleplaySpeakingLine] = useState<
    number | null
  >(null);
  const [, setRoleplayTransitionNotice] = useState<boolean>(false);
  const [roleplayMicLevel, setRoleplayMicLevel] = useState<number>(0);
  const [roleplayLiveBars, setRoleplayLiveBars] = useState<number[]>(
    Array(24).fill(0.08)
  );
  const [roleplayInterimText, setRoleplayInterimText] = useState<string>("");
  const [roleplayLineScores, setRoleplayLineScores] = useState<
    Record<number, number>
  >({});
  const [roleplayCompletedBanner, setRoleplayCompletedBanner] =
    useState<boolean>(false);
  const [roleplayWaitDurationMs, setRoleplayWaitDurationMs] =
    useState<number>(5500);
  const [roleplayRemainingPct, setRoleplayRemainingPct] =
    useState<number>(100);

  // Gölgeleme Modal State
  const [shadowingTarget, setShadowingTarget] = useState<{
    text: string;
    itemId?: string;
    audioUrl?: string;
    voice?: VoiceOption;
    forms?: { label: string; arabic: string }[];
  } | null>(null);

  const playToken = useRef(0);
  const lineRefs = useRef<{ [key: number]: HTMLDivElement | null }>({});
  const roleplaySummaryRef = useRef<HTMLDivElement | null>(null);
  const roleplayRecorderRef = useRef<RecordingSession16kHz | null>(null);
  const roleplaySpeechRef = useRef<HybridSpeechManager | null>(null);
  const roleplayFinalTranscriptRef = useRef<string>("");
  const roleplayInterimTranscriptRef = useRef<string>("");
  const roleplayFinishingRef = useRef<boolean>(false);
  const roleplayTurnTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const roleplayTurnRafRef = useRef<number | null>(null);
  const roleplaySessionTokenRef = useRef<number>(0);

  useEffect(() => {
    if (!roleplayCompletedBanner) return;
    const timer = setTimeout(() => {
      roleplaySummaryRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }, 150);
    return () => clearTimeout(timer);
  }, [roleplayCompletedBanner]);

  const cleanupRoleplayMic = () => {
    roleplaySessionTokenRef.current += 1;
    roleplayFinishingRef.current = true;
    if (roleplayTurnTimerRef.current !== null) {
      clearTimeout(roleplayTurnTimerRef.current);
      roleplayTurnTimerRef.current = null;
    }
    if (roleplayTurnRafRef.current !== null) {
      cancelAnimationFrame(roleplayTurnRafRef.current);
      roleplayTurnRafRef.current = null;
    }
    if (roleplayRecorderRef.current) {
      const rec = roleplayRecorderRef.current;
      roleplayRecorderRef.current = null;
      try {
        rec.getStream()?.getTracks().forEach((t) => t.stop());
      } catch {
        // ignore
      }
      try {
        rec.killStreamImmediately();
      } catch {
        // ignore
      }
      try {
        const ctx = rec.getAudioContext();
        if (ctx && ctx.state !== "closed") {
          void ctx.close().catch(() => {});
        }
      } catch {
        // ignore
      }
      try {
        rec.stop().catch(() => {});
      } catch {
        // ignore
      }
    }
    roleplaySpeechRef.current?.stopLiveWebSpeech();
    roleplayFinalTranscriptRef.current = "";
    roleplayInterimTranscriptRef.current = "";
    setRoleplayMicLevel(0);
    setRoleplayLiveBars(Array(24).fill(0.08));
    setRoleplayInterimText("");
    setRoleplayRemainingPct(100);
  };

  // Sekme (studyMode) değiştiğinde veya başka bir diyaloğa geçildiğinde aktif rol yapma mikrofonunu derhal kapat
  useEffect(() => {
    if (studyMode !== "roleplay") {
      cleanupRoleplayMic();
      setIsRoleplayRunning(false);
      setRoleplayActiveLine(null);
      setRoleplaySpeakingLine(null);
      setRoleplayTransitionNotice(false);
    }
    return () => {
      cleanupRoleplayMic();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studyMode, resolvedParams.id]);

  useEffect(() => {
    setMounted(true);
    roleplaySpeechRef.current = new HybridSpeechManager();
    loadAudioManifest().then(() => {
      setManifestLoaded(true);
      void getDialogueAudioUrls(resolvedParams.id).then(
        ({ estimatedSizeMb }) => {
          setOfflineEstimatedMb(estimatedSizeMb);
        }
      );
      void isDialogueOfflineReady(resolvedParams.id).then((ready) => {
        setIsOfflineReady(ready);
      });
    });

    // URL'den Öğretmen-Öğrenci Ödev Parametrelerini (?hw=1&pron=3&quiz=1&title=...) Çözümle
    if (typeof window !== "undefined") {
      const sp = new URLSearchParams(window.location.search);
      if (sp.get("hw") === "1") {
        const titleParam = sp.get("title") || "";
        const listenParam = sp.get("listen") !== "0";
        const pronParam = Math.max(0, parseInt(sp.get("pron") || "3", 10) || 0);
        const quizParam = sp.get("quiz") !== "0";
        setHwConfig({
          active: true,
          title: titleParam,
          requireListen: listenParam,
          pronCount: pronParam,
          requireQuiz: quizParam,
        });
        try {
          const savedRaw = sessionStorage.getItem(
            `muallimun-hw-${resolvedParams.id}`
          );
          if (savedRaw) {
            const parsed = JSON.parse(savedRaw);
            if (Array.isArray(parsed.listened))
              setHwListenedLines(parsed.listened);
            if (typeof parsed.pronCount === "number")
              setHwPronouncedCount(parsed.pronCount);
            if (Array.isArray(parsed.scores))
              setHwCollectedScores(parsed.scores);
            if (Boolean(parsed.quizDone)) setHwQuizCompleted(true);
          }
        } catch {
          // ignore
        }
      }
    }

    return () => {
      playToken.current += 1;
      stop();
      cleanupRoleplayMic();
      roleplaySpeechRef.current?.terminate();
      void releaseAllWakeLocks();
    };
  }, [stop, resolvedParams.id]);

  // Ödev ilerlemesini sessionStorage'da sakla
  useEffect(() => {
    if (!hwConfig.active) return;
    try {
      sessionStorage.setItem(
        `muallimun-hw-${resolvedParams.id}`,
        JSON.stringify({
          listened: hwListenedLines,
          pronCount: hwPronouncedCount,
          scores: hwCollectedScores,
          quizDone: hwQuizCompleted,
        })
      );
    } catch {
      // ignore
    }
  }, [
    hwConfig.active,
    resolvedParams.id,
    hwListenedLines,
    hwPronouncedCount,
    hwCollectedScores,
    hwQuizCompleted,
  ]);

  // Cümle içi ShadowingButton veya telaffuz puanı kaydedildiğinde ödev telaffuz sayacını otomatik artır
  useEffect(() => {
    const scoreLen = pronunciationScores.length;
    if (prevPronCountRef.current === null) {
      prevPronCountRef.current = scoreLen;
      return;
    }
    if (scoreLen > prevPronCountRef.current) {
      prevPronCountRef.current = scoreLen;
      if (hwConfig.active) {
        const lastScore =
          pronunciationScores[pronunciationScores.length - 1] ?? 75;
        setHwPronouncedCount((c) => c + 1);
        if (lastScore > 0) {
          setHwCollectedScores((prev) => [...prev, lastScore]);
        }
      }
    }
  }, [pronunciationScores, hwConfig.active]);

  // Diyalog dinlerken, rol yaparken veya gölgeleme çalışırken mobil ekranın kararmasını önle
  const isWakeLockNeeded =
    isPlayingAll ||
    playingLineId !== null ||
    isRoleplayRunning ||
    loopingLineSira !== null ||
    Boolean(shadowingTarget);

  useEffect(() => {
    if (isWakeLockNeeded) {
      void requestWakeLock("dialogue-session");
    } else {
      void releaseWakeLock("dialogue-session");
    }
    return () => {
      void releaseWakeLock("dialogue-session");
    };
  }, [isWakeLockNeeded]);

  useEffect(() => {
    if (!isLightboxOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsLightboxOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isLightboxOpen]);

  useEffect(() => {
    if (!isMoreMenuOpen) return;
    const handleOutsideClick = (e: MouseEvent) => {
      if (
        moreMenuRef.current &&
        !moreMenuRef.current.contains(e.target as Node)
      ) {
        setIsMoreMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [isMoreMenuOpen]);

  useEffect(() => {
    if (dialogue && dialogue.satirlar.length > 0 && !selectedRoleSpeaker) {
      setSelectedRoleSpeaker(dialogue.satirlar[0].konusmaci);
    }
  }, [dialogue, selectedRoleSpeaker]);

  useEffect(() => {
    const targetLine =
      roleplayActiveLine ??
      roleplaySpeakingLine ??
      playingLineId ??
      shadowingPauseLineSira ??
      (isClassroomMode ? selectedClassroomLine : null);
    if (targetLine !== null && lineRefs.current[targetLine]) {
      lineRefs.current[targetLine]?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }
  }, [
    playingLineId,
    shadowingPauseLineSira,
    roleplayActiveLine,
    roleplaySpeakingLine,
    isClassroomMode,
    selectedClassroomLine,
  ]);

  useEffect(() => {
    if (playingLineId !== null) {
      setSelectedClassroomLine(playingLineId);
    } else if (shadowingPauseLineSira !== null) {
      setSelectedClassroomLine(shadowingPauseLineSira);
    }
  }, [playingLineId, shadowingPauseLineSira]);

  // Gölgeleme Boşluğu (Shadowing Pause) görsel geri sayım animasyonu
  useEffect(() => {
    if (!isShadowingPause || shadowingPauseMs <= 0) {
      setShadowingPauseRemainingPct(100);
      return;
    }
    const startAt = performance.now();
    let rafId: number | null = null;

    const tick = () => {
      const elapsed = performance.now() - startAt;
      const ratio = Math.max(0, 1 - elapsed / shadowingPauseMs);
      setShadowingPauseRemainingPct(Math.round(ratio * 100));
      if (ratio > 0) {
        rafId = requestAnimationFrame(tick);
      }
    };

    setShadowingPauseRemainingPct(100);
    rafId = requestAnimationFrame(tick);
    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, [isShadowingPause, shadowingPauseMs]);

  if (!dialogue) return notFound();

  const currentIndex = diyaloglar.findIndex((d) => d.id === dialogue.id);
  const prevDialogue = currentIndex > 0 ? diyaloglar[currentIndex - 1] : null;
  const nextDialogue =
    currentIndex < diyaloglar.length - 1 ? diyaloglar[currentIndex + 1] : null;

  const dialogueVocabEntries: DialogueVocabularyEntry[] = getDialogueVocabulary(
    dialogue.id
  );
  const dialogueIdioms: ExtractedDialogueIdiom[] = extractDialogueIdioms(
    dialogue.satirlar,
    dialogue.seviye
  );

  const speakers = Array.from(
    new Set(dialogue.satirlar.map((s) => s.konusmaci))
  );

  // Konuşmacı cinsiyetine göre doğal ses seçimi (yalnızca K -> ZariyahNeural, E -> HamedNeural)
  const getSpeakerVoice = (line: DialogueLine): VoiceOption => {
    if (line.cinsiyet === "K") return "ar-SA-ZariyahNeural";
    if (line.cinsiyet === "E") return "ar-SA-HamedNeural";
    return "ar-SA-HamedNeural";
  };

  // Kapak görseli (001.jpg - 060.jpg)
  const rawNum = parseInt(dialogue.id.replace("dlg_", ""), 10) || 1;
  const mappedImgIndex = ((rawNum - 1) % 60) + 1;
  const imagePath = `/gorseller/${String(mappedImgIndex).padStart(3, "0")}.jpg`;

  const getDisplayText = (text: string) =>
    formatArabicText(text, !mounted || showHareke, arabicFont);

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
          arabic: word.mufret || word.mazi.split("/")[0].trim(),
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

  // --- ROL YAPMA GERÇEK MİKROFON DİNLEMESİ VE GERÇEK TELAFFUZ PUANLAMASI ---
  const activateUserRoleplayTurn = async (line: DialogueLine) => {
    stop();
    cleanupRoleplayMic();
    const mySessionToken = roleplaySessionTokenRef.current;
    roleplayFinishingRef.current = false;
    setRoleplayTransitionNotice(false);
    setRoleplaySpeakingLine(null);
    setRoleplayActiveLine(line.sira);
    setIsPlayingAll(false);
    playRecordStart();

    // Kelime sayısına göre dinamik maksimum kayıt süresi (15 sn - 45 sn arası) ve 2.5 sn sessizlik toleransı
    const wordCount = line.arapca.trim().split(/\s+/).filter(Boolean).length;
    const waitDurationMs = Math.max(
      15000,
      Math.min(45000, wordCount * 1800 + 8000)
    );
    setRoleplayWaitDurationMs(waitDurationMs);
    setRoleplayRemainingPct(100);

    // 1. Canlı SpeechRecognition başlat
    roleplayFinalTranscriptRef.current = "";
    roleplayInterimTranscriptRef.current = "";
    roleplaySpeechRef.current?.startLiveWebSpeech({
      onInterimTranscript: (combined, finalPart, interimPart) => {
        if (typeof finalPart === "string" && finalPart.trim()) {
          roleplayFinalTranscriptRef.current = finalPart.trim();
        }
        if (typeof interimPart === "string") {
          roleplayInterimTranscriptRef.current = interimPart.trim();
        } else if (combined && !roleplayFinalTranscriptRef.current) {
          roleplayInterimTranscriptRef.current = combined.trim();
        }
        setRoleplayInterimText(combined);
      },
    });

    // 2. Canlı 16kHz AudioContext RMS ve ses dalgası kaydını başlat
    try {
      const recSession = await start16kHzRecorder({
        silenceDurationMs: 2500,
        maxDurationMs: waitDurationMs,
        onLiveRms: (rms, history) => {
          setRoleplayMicLevel(rms);
          const tail = history.slice(-24);
          const padded = [
            ...Array(Math.max(0, 24 - tail.length)).fill(0.08),
            ...tail,
          ];
          setRoleplayLiveBars(padded);
        },
        onAutoSilenceStop: () => {
          void finishUserRoleplayTurn(line, false);
        },
      });
      if (
        !roleplayFinishingRef.current &&
        mySessionToken === roleplaySessionTokenRef.current
      ) {
        roleplayRecorderRef.current = recSession;
      } else {
        try {
          recSession.getStream()?.getTracks().forEach((t) => t.stop());
        } catch {
          // ignore
        }
        recSession.killStreamImmediately();
      }
    } catch {
      // Mikrofon izni verilmediyse veya açılamadıysa sayaç yine çalışır, ses olmadığı için %0 kaydedilir
      roleplayRecorderRef.current = null;
    }

    if (
      roleplayFinishingRef.current ||
      mySessionToken !== roleplaySessionTokenRef.current
    ) {
      return;
    }

    const startAt = performance.now();
    const tick = () => {
      const elapsed = performance.now() - startAt;
      const ratio = Math.max(0, 1 - elapsed / waitDurationMs);
      setRoleplayRemainingPct(Math.round(ratio * 100));
      if (ratio > 0 && !roleplayFinishingRef.current) {
        roleplayTurnRafRef.current = requestAnimationFrame(tick);
      }
    };
    roleplayTurnRafRef.current = requestAnimationFrame(tick);

    roleplayTurnTimerRef.current = setTimeout(() => {
      roleplayTurnTimerRef.current = null;
      void finishUserRoleplayTurn(line, false);
    }, waitDurationMs);
  };

  const finishUserRoleplayTurn = async (
    line: DialogueLine,
    isSkipped: boolean = false
  ) => {
    if (roleplayFinishingRef.current) return;
    roleplayFinishingRef.current = true;

    if (roleplayTurnTimerRef.current !== null) {
      clearTimeout(roleplayTurnTimerRef.current);
      roleplayTurnTimerRef.current = null;
    }
    if (roleplayTurnRafRef.current !== null) {
      cancelAnimationFrame(roleplayTurnRafRef.current);
      roleplayTurnRafRef.current = null;
    }

    const stoppedSpeech = roleplaySpeechRef.current?.stopLiveWebSpeech() || "";
    const fullSpokenText = (
      roleplayFinalTranscriptRef.current +
      " " +
      roleplayInterimTranscriptRef.current
    ).trim();
    const capturedText = fullSpokenText || stoppedSpeech;

    const activeRec = roleplayRecorderRef.current;
    roleplayRecorderRef.current = null;

    let computedScore = 0;

    if (isSkipped) {
      try {
        activeRec?.killStreamImmediately();
      } catch {
        // ignore
      }
      computedScore = 0;
    } else {
      let recordedData: Awaited<ReturnType<RecordingSession16kHz["stop"]>> | null =
        null;
      if (activeRec) {
        try {
          recordedData = await activeRec.stop();
        } catch {
          recordedData = null;
        }
      }

      const hasArabicSpeechText =
        Boolean(capturedText) && /[\u0600-\u06FF]/.test(capturedText);
      const hasMicSpeechEnergy = Boolean(
        recordedData &&
          !recordedData.isSilent &&
          (recordedData.voicedDuration >= 0.16 ||
            recordedData.peakRms >= 0.011 ||
            recordedData.envelopeBars.some((b) => b > 0.15))
      );

      if (!hasArabicSpeechText && !hasMicSpeechEnergy) {
        // Kullanıcı süre boyunca susup hiçbir şey söylemediyse puan %0 (Okunmadı / Ses Yok)
        computedScore = 0;
      } else if (hasArabicSpeechText) {
        // SpeechRecognition Arapça metin yakaladıysa hedef cümle ile karşılaştırarak gerçek puan hesapla
        const evalRes = evaluateSentenceWords(line.arapca, capturedText);
        computedScore = evalRes.overallScore;
        if (computedScore > 0) {
          recordPronunciationScore(computedScore);
        }
      } else if (recordedData && hasMicSpeechEnergy) {
        // Ses dalgası var ama metin çözümlenemediyse sahte telaffuz puanı üretme ve istatistiklere kaydetme;
        // yalnızca ritim uyumunu hesapla
        const wordCount = line.arapca.trim().split(/\s+/).length;
        const expectedDur = Math.max(1.4, wordCount * 0.65 + 0.5);
        const estRefBars = Array.from({ length: 48 }, (_, idx) =>
          Math.max(0.14, Math.abs(Math.sin(idx * 0.35)) * 0.85)
        );
        const dspEval = evaluateAcousticDspSentence(
          line.arapca,
          recordedData.envelopeBars,
          estRefBars,
          recordedData.duration,
          expectedDur,
          ""
        );
        computedScore = dspEval.rhythmScore ?? 0;
      }
    }

    cleanupRoleplayMic();
    playRecordStop();

    setRoleplayActiveLine(null);
    setRoleplayTransitionNotice(false);
    setRoleplayCompletedLines((prev) => ({ ...prev, [line.sira]: true }));
    setRoleplayHintLevels((prev) => ({ ...prev, [line.sira]: 3 }));
    setRoleplayLineScores((prev) => ({
      ...prev,
      [line.sira]: computedScore,
    }));

    setTimeout(() => {
      handleContinueRoleplayFromLine(line.sira);
    }, 220);
  };

  const playSentence = async (
    line: DialogueLine,
    autoAdvance = false,
    isLooping = false,
    inRoleplay = false,
    loopRemaining: number | "infinite" | null = null,
    currentDlgTurn: number = 1
  ) => {
    const currentToken = playToken.current;
    const lineHasMp3 = hasMp3(dialogue.id, line.sira);
    const lineAudioUrl = lineHasMp3
      ? getMp3Path(dialogue.id, line.sira)
      : undefined;
    const voice = getSpeakerVoice(line);

    if (inRoleplay) {
      setRoleplayTransitionNotice(false);
      setRoleplaySpeakingLine(line.sira);
      setRoleplayActiveLine(null);
    }

    if (lineHasMp3 && lineAudioUrl) {
      await playAudio(lineAudioUrl, line.sira, speechRate, line.arapca);
    } else {
      await playTTS(line.arapca, line.sira, speechRate, voice);
    }

    setHwListenedLines((prev) =>
      prev.includes(line.sira) ? prev : [...prev, line.sira]
    );

    if (playToken.current !== currentToken) return;

    if (inRoleplay) {
      setRoleplaySpeakingLine(null);
    }

    // 1. Eğer bu cümle için Tekrarla (Loop) aktifse 800ms es vererek kullanıcı durdurana veya başka cümleye geçene kadar tekrar çal
    if (isLooping) {
      const nextRem =
        loopRemaining === "infinite"
          ? "infinite"
          : typeof loopRemaining === "number"
          ? loopRemaining - 1
          : 0;

      if (nextRem === "infinite" || (typeof nextRem === "number" && nextRem > 0)) {
        setSentenceLoopRemaining(nextRem);
        const loopWaitOk = await waitShadowingPause(800, false);
        if (!loopWaitOk || playToken.current !== currentToken) return;
        await playSentence(line, false, true, false, nextRem, currentDlgTurn);
        return;
      } else {
        setLoopingLineSira(null);
        setSentenceLoopRemaining(null);
        stop();
        return;
      }
    }

    // 2. Eğer "2. Telaffuz & Mahreç Stüdyosu" modunda Otomatik Gölgeleme Akışı açıksa
    if (studyMode === "shadowing" && autoShadowingFlow && !autoAdvance) {
      stop();
      setShadowingTarget({
        text: line.arapca,
        audioUrl: lineAudioUrl,
        voice,
      });
      return;
    }

    // 3. Sıralı Oynatma (Sequential) veya Rol Yapma (Roleplay) aktifse sonraki cümleye geç
    if (autoAdvance) {
      const pauseSetting = useSettings.getState().pauseBetweenLines;
      const lastDurSec = useAudioStore.getState().lastPlayedDurationSec || 2.5;
      const isShadowWait =
        !inRoleplay && (pauseSetting === 2 || pauseSetting === "auto");
      const waitMs = inRoleplay
        ? 220
        : pauseSetting === 2
        ? 2000
        : pauseSetting === "auto"
        ? Math.min(8000, Math.max(1500, Math.round(lastDurSec * 1000)))
        : 240;

      if (isShadowWait) {
        setShadowingPauseLineSira(line.sira);
      }

      const waitCompleted = await waitShadowingPause(waitMs, isShadowWait);

      if (isShadowWait) {
        setShadowingPause(false, 0);
        setShadowingPauseLineSira(null);
      }

      if (!waitCompleted || playToken.current !== currentToken) return;
      const nextLine = dialogue.satirlar.find((s) => s.sira === line.sira + 1);
      if (nextLine) {
        if (inRoleplay && nextLine.konusmaci === selectedRoleSpeaker) {
          await activateUserRoleplayTurn(nextLine);
          return;
        }
        await playSentence(
          nextLine,
          true,
          false,
          inRoleplay,
          null,
          currentDlgTurn
        );
      } else {
        // Diyalog sonuna gelindi: Eğer Rol Yapma değilse ve dialogueLoopCount > 1 veya infinite ise baştan başlat
        const targetDlgLoops = useSettings.getState().dialogueLoopCount;
        const shouldRepeatDialogue =
          !inRoleplay &&
          (targetDlgLoops === "infinite" ||
            (typeof targetDlgLoops === "number" &&
              currentDlgTurn < targetDlgLoops));

        if (shouldRepeatDialogue) {
          const nextTurn = currentDlgTurn + 1;
          setDialogueLoopTurn(nextTurn);
          const dlgRepeatOk = await waitShadowingPause(750, false);
          if (!dlgRepeatOk || playToken.current !== currentToken) return;
          const firstLine = dialogue.satirlar[0];
          await playSentence(firstLine, true, false, false, null, nextTurn);
          return;
        }

        setIsPlayingAll(false);
        setDialogueLoopTurn(1);
        setRoleplayActiveLine(null);
        setRoleplaySpeakingLine(null);
        setRoleplayTransitionNotice(false);
        if (inRoleplay) {
          setIsRoleplayRunning(false);
          setRoleplayCompletedBanner(true);
          playFanfare();
        }
        stop();
      }
    }
  };

  const handlePlayLine = (line: DialogueLine) => {
    playClick();
    playToken.current += 1;
    stop();
    cleanupRoleplayMic();
    setLoopingLineSira(null);
    setSentenceLoopRemaining(null);
    setRoleplayActiveLine(null);
    setRoleplaySpeakingLine(null);
    setRoleplayTransitionNotice(false);
    setIsRoleplayRunning(false);

    if (flowMode === "sequential") {
      setIsPlayingAll(true);
      setDialogueLoopTurn(1);
      playSentence(line, true, false, false, null, 1);
    } else {
      setIsPlayingAll(false);
      playSentence(line, false, false, false, null, 1);
    }
  };

  const openShadowingCoach = (target: {
    text: string;
    itemId?: string;
    audioUrl?: string;
    voice?: VoiceOption;
    forms?: { label: string; arabic: string }[];
  }) => {
    playToken.current += 1;
    stop();
    cleanupRoleplayMic();
    setIsPlayingAll(false);
    setLoopingLineSira(null);
    setSentenceLoopRemaining(null);
    setIsRoleplayRunning(false);
    setRoleplayActiveLine(null);
    setRoleplaySpeakingLine(null);
    setRoleplayTransitionNotice(false);
    setShadowingTarget(target);
  };

  const handleToggleLoopLine = (line: DialogueLine) => {
    playClick();
    playToken.current += 1;
    stop();
    cleanupRoleplayMic();
    setIsPlayingAll(false);
    setIsRoleplayRunning(false);
    setRoleplayActiveLine(null);
    setRoleplaySpeakingLine(null);
    setRoleplayTransitionNotice(false);

    if (loopingLineSira === line.sira) {
      setLoopingLineSira(null);
      setSentenceLoopRemaining(null);
    } else {
      // Kullanıcı durdurana veya başka bir cümleye geçene kadar 800ms es ile sürekli tekrarla
      const targetLoops: number | "infinite" = "infinite";
      setLoopingLineSira(line.sira);
      setSentenceLoopRemaining(targetLoops);
      playSentence(line, false, true, false, targetLoops, 1);
    }
  };

  const handleTogglePlayAll = () => {
    playClick();
    setLoopingLineSira(null);
    setSentenceLoopRemaining(null);
    cleanupRoleplayMic();
    setIsRoleplayRunning(false);
    setRoleplayActiveLine(null);
    setRoleplaySpeakingLine(null);
    setRoleplayTransitionNotice(false);

    if (isPlayingAll) {
      playToken.current += 1;
      stop();
      setIsPlayingAll(false);
      setDialogueLoopTurn(1);
    } else {
      setFlowMode("sequential");
      setIsPlayingAll(true);
      setDialogueLoopTurn(1);
      playToken.current += 1;
      const firstLine = dialogue.satirlar[0];
      playSentence(firstLine, true, false, false, null, 1);
    }
  };

  // Sınıf Modu: Sadece seçili tek cümleyi seslendirir ve durur
  const handlePlaySingleClassroomLine = (line: DialogueLine) => {
    playClick();
    if (!isPlayingAll && playingLineId === line.sira) {
      playToken.current += 1;
      stop();
      setLoopingLineSira(null);
      setSentenceLoopRemaining(null);
      return;
    }
    playToken.current += 1;
    stop();
    cleanupRoleplayMic();
    setIsPlayingAll(false);
    setLoopingLineSira(null);
    setSentenceLoopRemaining(null);
    setRoleplayActiveLine(null);
    setRoleplaySpeakingLine(null);
    setRoleplayTransitionNotice(false);
    setIsRoleplayRunning(false);
    setSelectedClassroomLine(line.sira);
    playSentence(line, false, false, false, null, 1);
  };

  // Sınıf Modu: Odaklanılan cümleden itibaren (veya baştan) tüm diyaloğu sırayla oynatır / duraklatır
  const handleToggleClassroomPlayAll = (startLineOverride?: DialogueLine) => {
    playClick();
    setLoopingLineSira(null);
    setSentenceLoopRemaining(null);
    cleanupRoleplayMic();
    setIsRoleplayRunning(false);
    setRoleplayActiveLine(null);
    setRoleplaySpeakingLine(null);
    setRoleplayTransitionNotice(false);

    if (isPlayingAll) {
      playToken.current += 1;
      stop();
      setIsPlayingAll(false);
      setDialogueLoopTurn(1);
    } else {
      setFlowMode("sequential");
      setIsPlayingAll(true);
      setDialogueLoopTurn(1);
      playToken.current += 1;
      const targetStartLine = startLineOverride || dialogue.satirlar[0];
      if (targetStartLine) {
        setSelectedClassroomLine(targetStartLine.sira);
        playSentence(targetStartLine, true, false, false, null, 1);
      }
    }
  };

  const togglePlayAllShortcutRef = useRef<() => void>(() => {});
  togglePlayAllShortcutRef.current = () => {
    if (isRoleplayRunning) return;
    if (
      !isPlayingAll &&
      (playingLineId !== null || isShadowingPause || loopingLineSira !== null)
    ) {
      playClick();
      playToken.current += 1;
      stop();
      setLoopingLineSira(null);
      setSentenceLoopRemaining(null);
      return;
    }
    handleTogglePlayAll();
  };

  const classroomKeyHandlerRef = useRef<(e: KeyboardEvent) => void>(() => {});
  classroomKeyHandlerRef.current = (e: KeyboardEvent) => {
    if (!dialogue) return;
    const totalLines = dialogue.satirlar.length;
    const currentSira =
      playingLineId ??
      shadowingPauseLineSira ??
      loopingLineSira ??
      selectedClassroomLine ??
      dialogue.satirlar[0]?.sira ??
      1;
    const currentIdx = Math.max(
      0,
      dialogue.satirlar.findIndex((s) => s.sira === currentSira)
    );
    const activeLineObj =
      dialogue.satirlar[currentIdx] || dialogue.satirlar[0];

    if (isClassroomMode && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      e.preventDefault();
      playClick();
      if (isPlayingAll || playingLineId !== null) {
        playToken.current += 1;
        stop();
        setIsPlayingAll(false);
      }
      const nextIdx =
        e.key === "ArrowDown"
          ? Math.min(totalLines - 1, currentIdx + 1)
          : Math.max(0, currentIdx - 1);
      const nextLineObj = dialogue.satirlar[nextIdx];
      if (nextLineObj) {
        setSelectedClassroomLine(nextLineObj.sira);
      }
      return;
    }

    // Sınıf Modunda Shift+Space veya P tuşu: Tüm Diyaloğu Oynat / Duraklat
    if (
      isClassroomMode &&
      !e.repeat &&
      ((e.code === "Space" && e.shiftKey) ||
        e.key === "p" ||
        e.key === "P")
    ) {
      e.preventDefault();
      handleToggleClassroomPlayAll(activeLineObj);
      return;
    }

    if (e.code === "Space" && !e.repeat) {
      e.preventDefault();
      if (isClassroomMode) {
        if (activeLineObj) {
          handlePlaySingleClassroomLine(activeLineObj);
        }
        return;
      }
      togglePlayAllShortcutRef.current();
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isClassroomNavKey =
        isClassroomMode &&
        (e.key === "ArrowDown" ||
          e.key === "ArrowUp" ||
          e.key === "p" ||
          e.key === "P");
      if (e.code !== "Space" && !isClassroomNavKey) {
        return;
      }
      if (e.ctrlKey || e.altKey || e.metaKey) return;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        tag === "BUTTON" ||
        tag === "A" ||
        target?.isContentEditable
      ) {
        return;
      }
      if (
        shadowingTarget ||
        isPdfModalOpen ||
        isShareModalOpen ||
        isLightboxOpen ||
        document.querySelector(".fixed.inset-0")
      ) {
        return;
      }
      classroomKeyHandlerRef.current(e);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    isClassroomMode,
    shadowingTarget,
    isPdfModalOpen,
    isShareModalOpen,
    isLightboxOpen,
  ]);

  const cycleRoleplayHintLevel = (sira: number) => {
    playClick();
    setRoleplayHintLevels((prev) => {
      const current = prev[sira] ?? 0;
      const next = (current + 1) % 4;
      return { ...prev, [sira]: next };
    });
  };

  const handlePlayRoleplayModelAudio = async (line: DialogueLine) => {
    playClick();
    const wasWaitingThisLine = roleplayActiveLine === line.sira;
    if (wasWaitingThisLine) {
      // Hoparlör sesinin mikrofona karışıp sahte puan üretmemesi için dinlerken mikrofonu geçici kapat
      cleanupRoleplayMic();
    }
    const voice = getSpeakerVoice(line);
    await speakHybrid({
      text: line.arapca,
      rate: speechRate,
      voice,
      dialogueId: dialogue.id,
      lineSira: line.sira,
    });
    if (wasWaitingThisLine && isRoleplayRunning && !roleplayFinishingRef.current) {
      await activateUserRoleplayTurn(line);
    }
  };

  // --- ROL YAPMA (ROLEPLAY) BAŞLAT / BİTİR VE DEVAM ET ---
  const startRoleplayWithSpeaker = (speakerName: string) => {
    playToken.current += 1;
    stop();
    cleanupRoleplayMic();
    setLoopingLineSira(null);
    setRoleplayCompletedBanner(false);
    setRoleplayTransitionNotice(false);
    setRoleplayCompletedLines({});
    setRoleplayHintLevels({});
    setRoleplayLineScores({});
    setIsRoleplayRunning(true);

    const firstLine = dialogue.satirlar[0];
    if (firstLine.konusmaci === speakerName) {
      activateUserRoleplayTurn(firstLine);
    } else {
      setIsPlayingAll(true);
      playSentence(firstLine, true, false, true);
    }
  };

  const handleToggleRoleplay = () => {
    playClick();
    setLoopingLineSira(null);
    setRoleplayCompletedBanner(false);
    setRoleplayTransitionNotice(false);

    if (isRoleplayRunning) {
      playToken.current += 1;
      stop();
      cleanupRoleplayMic();
      setIsRoleplayRunning(false);
      setIsPlayingAll(false);
      setRoleplayActiveLine(null);
      setRoleplaySpeakingLine(null);
    } else {
      startRoleplayWithSpeaker(selectedRoleSpeaker);
    }
  };

  const handleContinueRoleplayFromLine = (sira: number) => {
    cleanupRoleplayMic();
    setRoleplayActiveLine(null);
    setRoleplaySpeakingLine(null);

    const nextLine = dialogue.satirlar.find((s) => s.sira === sira + 1);
    if (!nextLine) {
      setIsRoleplayRunning(false);
      setIsPlayingAll(false);
      setRoleplayTransitionNotice(false);
      setRoleplayCompletedBanner(true);
      playFanfare();
      return;
    }

    if (nextLine.konusmaci === selectedRoleSpeaker) {
      activateUserRoleplayTurn(nextLine);
    } else {
      setIsPlayingAll(true);
      playToken.current += 1;
      playSentence(nextLine, true, false, true);
    }
  };

  const handleCompleteAndContinue = () => {
    playClick();
    if (!isDialogueCompleted(dialogue.id)) {
      toggleCompletedDialogue(dialogue.id);
      playSuccess();
    }
    if (nextDialogue) {
      router.push(`/diyalog/${nextDialogue.id}`);
    } else {
      router.push("/kutuphane");
    }
  };

  const isFav = mounted ? isDialogueFavorite(dialogue.id) : false;
  const isCompleted = mounted ? isDialogueCompleted(dialogue.id) : false;
  const currentViewMode: ViewMode = mounted ? viewMode : "stacked";
  const shouldShowShadowingButton =
    !mounted || showShadowing || studyMode === "shadowing";

  const handleDownloadOfflineDialogue = async () => {
    if (isDownloadingOffline) return;
    playClick();
    setIsDownloadingOffline(true);
    setOfflineProgressPct(5);
    const ok = await downloadDialogueOfflinePack(
      dialogue.id,
      (percent, _completed, _total, estMb) => {
        setOfflineProgressPct(percent);
        if (estMb > 0) setOfflineEstimatedMb(estMb);
      }
    );
    setIsDownloadingOffline(false);
    if (ok) {
      setIsOfflineReady(true);
      setShowOfflineNotice(true);
      playSuccess();
    }
  };

  // Ödev Hızlı Alıştırması (Boşluk Doldurma & Kelime Eşleştirme) Soruları
  const hwMiniQuizQuestions = (() => {
    const qs: {
      promptLabel: string;
      arabicDisplay: string;
      subHint: string;
      correctOption: string;
      options: string[];
    }[] = [];

    // 1-2. Soru: Diyalogdan Boşluk Doldurma
    const linesForBlank = dialogue.satirlar.slice(0, 2);
    linesForBlank.forEach((ln, idx) => {
      const words = ln.arapca.trim().split(/\s+/).filter(Boolean);
      const targetIdx = words.length > 2 ? 1 : 0;
      const targetWord = words[targetIdx] || words[0] || "";
      const blankedAr = words
        .map((w, i) => (i === targetIdx ? ".........." : w))
        .join(" ");
      const distractors = dialogueVocabEntries
        .map((v) => (v.contextWord || v.item.mufret || v.item.mazi || "").trim())
        .filter((w) => w && w !== targetWord)
        .slice(idx * 3, idx * 3 + 3);
      const opts = Array.from(
        new Set([targetWord, ...distractors, "نَعَمْ", "شُكْراً", "هُنَا"])
      ).slice(0, 4);
      // Deterministik karıştırma
      const rotated = opts
        .slice()
        .sort((a, b) => a.localeCompare(b, "ar"));
      qs.push({
        promptLabel: `Bölüm 1: Boşluk Doldurma (${idx + 1}/4)`,
        arabicDisplay: blankedAr,
        subHint: `Türkçesi: "${ln.turkce}"`,
        correctOption: targetWord,
        options: rotated,
      });
    });

    // 3-4. Soru: Kelime Eşleştirme
    const vocabSample = dialogueVocabEntries.slice(0, 2);
    vocabSample.forEach((v, idx) => {
      const arWord =
        v.contextWord ||
        (v.item.mufret || v.item.mazi || "").split("/")[0].trim();
      const correctTr = v.item.anlam_tr;
      const otherTrs = dialogueVocabEntries
        .map((o) => o.item.anlam_tr)
        .filter((t) => t && t !== correctTr)
        .slice(idx * 2, idx * 2 + 3);
      const opts = Array.from(
        new Set([
          correctTr,
          ...otherTrs,
          "Merhaba / Hoş geldiniz",
          "Teşekkür ederim",
          "İyi günler",
        ])
      ).slice(0, 4);
      const rotated = opts.slice().sort((a, b) => a.localeCompare(b, "tr"));
      qs.push({
        promptLabel: `Bölüm 2: Kelime Eşleştirme (${idx + 3}/4)`,
        arabicDisplay: arWord,
        subHint: "Yukarıdaki kelimenin Türkçe karşılığını seçin:",
        correctOption: correctTr,
        options: rotated,
      });
    });

    return qs;
  })();

  const hwListenTarget = Math.min(3, dialogue.satirlar.length);
  const isHwListenDone =
    !hwConfig.requireListen ||
    hwListenedLines.length >= hwListenTarget ||
    isCompleted;
  const isHwPronDone =
    hwConfig.pronCount <= 0 || hwPronouncedCount >= hwConfig.pronCount;
  const isHwQuizDone = !hwConfig.requireQuiz || hwQuizCompleted;

  const hwTotalTasks =
    (hwConfig.requireListen ? 1 : 0) +
    (hwConfig.pronCount > 0 ? 1 : 0) +
    (hwConfig.requireQuiz ? 1 : 0);
  const hwCompletedTasks =
    (hwConfig.requireListen && isHwListenDone ? 1 : 0) +
    (hwConfig.pronCount > 0 && isHwPronDone ? 1 : 0) +
    (hwConfig.requireQuiz && isHwQuizDone ? 1 : 0);
  const hwCompletionRatioPct =
    hwTotalTasks > 0 ? Math.round((hwCompletedTasks / hwTotalTasks) * 100) : 100;

  const hwAverageScore = (() => {
    if (hwCollectedScores.length > 0) {
      return Math.round(
        hwCollectedScores.reduce((a, b) => a + b, 0) / hwCollectedScores.length
      );
    }
    const roleplayVals = Object.values(roleplayLineScores).filter((s) => s > 0);
    if (roleplayVals.length > 0) {
      return Math.round(
        roleplayVals.reduce((a, b) => a + b, 0) / roleplayVals.length
      );
    }
    return hwQuizCompleted ? 88 : hwCompletedTasks > 0 ? 85 : 0;
  })();

  const hwWeakWordsList: { arabic: string; turkish: string }[] = (() => {
    const matchedMistakes = dialogueVocabEntries
      .filter((v) => mistakeIds.includes(v.item.id))
      .map((v) => ({
        arabic: (v.item.mufret || v.item.mazi || "").split("/")[0].trim(),
        turkish: v.item.anlam_tr.split(",")[0].trim(),
      }));
    if (matchedMistakes.length > 0) return matchedMistakes.slice(0, 4);
    return dialogueVocabEntries.slice(0, 3).map((v) => ({
      arabic: (v.item.mufret || v.item.mazi || "").split("/")[0].trim(),
      turkish: v.item.anlam_tr.split(",")[0].trim(),
    }));
  })();

  const activeClassroomSira =
    playingLineId ??
    shadowingPauseLineSira ??
    loopingLineSira ??
    roleplayActiveLine ??
    roleplaySpeakingLine ??
    selectedClassroomLine ??
    dialogue.satirlar[0]?.sira ??
    1;
  const activeClassroomLineIndex = Math.max(
    0,
    dialogue.satirlar.findIndex((s) => s.sira === activeClassroomSira)
  );
  const activeClassroomLineObj =
    dialogue.satirlar[activeClassroomLineIndex] || dialogue.satirlar[0];

  return (
    <div
      className={
        isClassroomMode
          ? "space-y-4 max-w-7xl w-full lg:w-[min(80rem,calc(100vw-2rem))] lg:relative lg:left-1/2 lg:-translate-x-1/2 px-1 sm:px-4 md:px-8 transition-all duration-300"
          : "space-y-3"
      }
    >
      {/* GÖLGELEME VE TELAFFUZ KOÇU MODALI */}
      {shadowingTarget && (
        <ShadowingModal
          text={shadowingTarget.text}
          itemId={shadowingTarget.itemId}
          refAudioUrl={shadowingTarget.audioUrl}
          voice={shadowingTarget.voice}
          forms={shadowingTarget.forms}
          level={dialogue.seviye}
          onEvaluated={(score) => {
            if (score > 0 && hwConfig.active) {
              // pronunciationScores effect zaten sayacı artırır
            }
          }}
          onClose={() => setShadowingTarget(null)}
        />
      )}

      {/* DERS NOTU / PDF ÇIKTI VE A4 QUIZ YAPRAĞI MODALI */}
      {isPdfModalOpen && (
        <DialoguePdfModal
          dialogue={dialogue}
          vocabEntries={dialogueVocabEntries}
          imagePath={imagePath}
          rawNum={rawNum}
          onClose={() => setIsPdfModalOpen(false)}
        />
      )}

      {/* ÖĞRETMEN İÇİN "🎓 ÖDEV OLUŞTUR" MODALI */}
      <TeacherHomeworkModal
        isOpen={isTeacherHwModalOpen}
        onClose={() => setIsTeacherHwModalOpen(false)}
        dialogueId={dialogue.id}
        dialogueTitleTr={dialogue.baslik_tr}
        dialogueTitleAr={getDisplayText(dialogue.baslik_ar)}
        levelLabel={dialogue.seviye}
        totalLines={dialogue.satirlar.length}
      />

      {/* ÖĞRENCİ ÖDEV TAMAMLAMA VE DOĞRULAMA RAPORU MODALI */}
      <ShareAchievementModal
        isOpen={isHwReportModalOpen}
        onClose={() => setIsHwReportModalOpen(false)}
        title={dialogue.baslik_tr}
        arabicTitle={getDisplayText(dialogue.baslik_ar)}
        subtitle={`Diyalog #${String(rawNum).padStart(2, "0")} • ${dialogue.satirlar.length} Cümle • ${dialogueVocabEntries.length} Kelime`}
        levelLabel={dialogue.seviye}
        scorePercent={hwAverageScore}
        pointsText={`${hwCompletedTasks}/${hwTotalTasks} Görev`}
        wordsCount={dialogueVocabEntries.length}
        badgeType="homework"
        homeworkTitle={hwConfig.title || `${dialogue.baslik_tr} Ödevi`}
        completionPercent={hwCompletionRatioPct}
        listenedCount={hwListenedLines.length}
        totalLinesCount={dialogue.satirlar.length}
        pronPracticedCount={hwPronouncedCount}
        pronTargetCount={hwConfig.pronCount}
        quizCompleted={isHwQuizDone}
        weakWordsList={hwWeakWordsList}
        dialogueId={dialogue.id}
      />

      {/* BAŞARI KARTINI PAYLAŞ / İNDİR MODALI */}
      <ShareAchievementModal
        isOpen={isShareModalOpen}
        onClose={() => setIsShareModalOpen(false)}
        title={dialogue.baslik_tr}
        arabicTitle={getDisplayText(dialogue.baslik_ar)}
        subtitle={`Diyalog #${String(rawNum).padStart(2, "0")} • ${dialogue.satirlar.length} Cümle • ${dialogueVocabEntries.length} Kelime`}
        levelLabel={dialogue.seviye}
        scorePercent={(() => {
          const userLines = dialogue.satirlar.filter(
            (l) => l.konusmaci === selectedRoleSpeaker
          );
          if (userLines.length === 0) return 0;
          const total = userLines.reduce(
            (acc, l) => acc + (roleplayLineScores[l.sira] ?? 0),
            0
          );
          return Math.round(total / userLines.length);
        })()}
        pointsText={`${dialogue.satirlar.length} Cümle`}
        wordsCount={dialogueVocabEntries.length}
        badgeType="dialogue"
      />

      {/* ÖDEV İÇİ HIZLI ALIŞTIRMA (BOŞLUK DOLDURMA & EŞLEŞTİRME) MODALI */}
      {isHwQuizModalOpen && hwMiniQuizQuestions.length > 0 && (
        <div
          className="fixed inset-0 z-[75] bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setIsHwQuizModalOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-3xl bg-[#FDFBF7] dark:bg-[var(--surface)] border-2 border-[#E6D7BE] dark:border-[var(--border)] border-b-4 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-4 py-3 bg-[#6741D9] text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ClipboardCheck size={17} />
                <span className="text-xs sm:text-sm font-extrabold">
                  📝 Ödev Alıştırması (Boşluk Doldurma &amp; Eşleştirme)
                </span>
              </div>
              <button
                type="button"
                onClick={() => setIsHwQuizModalOpen(false)}
                className="w-7 h-7 rounded-xl bg-white/15 hover:bg-white/25 flex items-center justify-center cursor-pointer"
              >
                <X size={15} />
              </button>
            </div>

            <div className="p-4 space-y-3.5">
              {(() => {
                const currentQ =
                  hwMiniQuizQuestions[
                    Math.min(hwQuizStep, hwMiniQuizQuestions.length - 1)
                  ];
                return (
                  <>
                    <div className="flex items-center justify-between text-xs font-extrabold text-slate-600 dark:text-slate-300">
                      <span>{currentQ.promptLabel}</span>
                      <span>
                        Soru {hwQuizStep + 1} / {hwMiniQuizQuestions.length}
                      </span>
                    </div>

                    <div className="p-3.5 rounded-2xl bg-[#F7EFE1] dark:bg-[var(--background)] border-2 border-[#E6D7BE] dark:border-[var(--border)] space-y-1.5 text-center">
                      <p
                        dir="rtl"
                        className="arabic text-2xl sm:text-3xl font-bold text-[#087F5B] dark:text-[#20c997]"
                      >
                        {getDisplayText(currentQ.arabicDisplay)}
                      </p>
                      <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                        {currentQ.subHint}
                      </p>
                    </div>

                    <div className="grid grid-cols-1 gap-2">
                      {currentQ.options.map((opt) => {
                        const isSelected = hwQuizSelectedOpt === opt;
                        const isCorrect = opt === currentQ.correctOption;
                        const isArOpt = /[\u0600-\u06FF]/.test(opt);
                        let btnStyle =
                          "bg-white dark:bg-[var(--background)] border-[#E6D7BE] dark:border-[var(--border)] text-[var(--foreground)] hover:border-[#6741D9]";
                        if (hwQuizSelectedOpt !== null) {
                          if (isCorrect) {
                            btnStyle =
                              "bg-emerald-600 border-emerald-800 text-white";
                          } else if (isSelected) {
                            btnStyle = "bg-rose-600 border-rose-800 text-white";
                          }
                        }

                        return (
                          <button
                            key={opt}
                            type="button"
                            disabled={hwQuizSelectedOpt !== null}
                            onClick={() => {
                              playClick();
                              setHwQuizSelectedOpt(opt);
                              const nextCorrect =
                                opt === currentQ.correctOption
                                  ? hwQuizCorrectCount + 1
                                  : hwQuizCorrectCount;
                              if (opt === currentQ.correctOption) {
                                setHwQuizCorrectCount(nextCorrect);
                                playSuccess();
                              }
                              setTimeout(() => {
                                if (
                                  hwQuizStep + 1 <
                                  hwMiniQuizQuestions.length
                                ) {
                                  setHwQuizStep((s) => s + 1);
                                  setHwQuizSelectedOpt(null);
                                } else {
                                  const finalQuizPct = Math.round(
                                    (nextCorrect /
                                      hwMiniQuizQuestions.length) *
                                      100
                                  );
                                  setHwCollectedScores((prev) => [
                                    ...prev,
                                    Math.max(60, finalQuizPct),
                                  ]);
                                  setHwQuizCompleted(true);
                                  setIsHwQuizModalOpen(false);
                                  playFanfare();
                                }
                              }, 700);
                            }}
                            dir={isArOpt ? "rtl" : "ltr"}
                            className={`w-full py-2.5 px-3.5 rounded-xl border-2 border-b-3 font-extrabold transition-all cursor-pointer ${
                              isArOpt ? "arabic text-xl" : "text-xs sm:text-sm"
                            } ${btnStyle}`}
                          >
                            {isArOpt ? getDisplayText(opt) : opt}
                          </button>
                        );
                      })}
                    </div>
                  </>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* ÖĞRENCİ İÇİN "📋 ÖDEV TAKİP ÇUBUĞU" (?hw=1 parametresiyle gelindiğinde en üstte görünür) */}
      {hwConfig.active && (
        <section className="rounded-2xl bg-gradient-to-r from-[#F3F0FF] via-[#FDFBF7] to-emerald-50/80 dark:from-indigo-950/70 dark:via-slate-900 dark:to-emerald-950/50 border-2 border-[#6741D9] border-b-4 p-3 sm:p-4 shadow-md space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className="px-2.5 py-1 rounded-xl bg-[#6741D9] text-white text-xs font-black flex items-center gap-1.5 shrink-0">
                <GraduationCap size={14} />
                <span>📋 Ödev Modu</span>
              </span>
              <h2 className="text-xs sm:text-sm font-black text-[var(--foreground)] truncate">
                {hwConfig.title || `${dialogue.baslik_tr} Sınıf Ödevi`}
              </h2>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <span className="px-2.5 py-1 rounded-xl bg-white dark:bg-slate-800 border border-[#6741D9]/40 text-[11px] font-extrabold text-[#6741D9] dark:text-indigo-300 tabular-nums">
                Tamamlanma: {hwCompletedTasks}/{hwTotalTasks} (%
                {hwCompletionRatioPct})
              </span>
              <button
                type="button"
                onClick={() => {
                  playClick();
                  setIsHwReportModalOpen(true);
                }}
                className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs border-b-2 border-emerald-800 flex items-center gap-1.5 cursor-pointer shadow-xs"
              >
                <span>📤 Ödevi Tamamla ve Rapor Oluştur</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            {hwConfig.requireListen && (
              <div
                className={`p-2.5 rounded-xl border-2 flex items-center justify-between gap-2 ${
                  isHwListenDone
                    ? "bg-emerald-50/90 dark:bg-emerald-950/50 border-emerald-600 text-emerald-900 dark:text-emerald-200"
                    : "bg-white/90 dark:bg-slate-900/80 border-[#E6D7BE] dark:border-slate-700 text-[var(--foreground)]"
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className={`w-5 h-5 rounded-md flex items-center justify-center text-xs font-black shrink-0 ${
                      isHwListenDone
                        ? "bg-emerald-600 text-white"
                        : "bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300"
                    }`}
                  >
                    {isHwListenDone ? "✓" : "1"}
                  </span>
                  <span className="text-xs font-extrabold truncate">
                    1. Diyaloğu Dinle ve İncele
                  </span>
                </div>
                <span className="text-[11px] font-black tabular-nums shrink-0 text-slate-600 dark:text-slate-300">
                  {Math.min(hwListenedLines.length, hwListenTarget)}/
                  {hwListenTarget} Cümle
                </span>
              </div>
            )}

            {hwConfig.pronCount > 0 && (
              <div
                className={`p-2.5 rounded-xl border-2 flex items-center justify-between gap-2 ${
                  isHwPronDone
                    ? "bg-emerald-50/90 dark:bg-emerald-950/50 border-emerald-600 text-emerald-900 dark:text-emerald-200"
                    : "bg-white/90 dark:bg-slate-900/80 border-[#E6D7BE] dark:border-slate-700 text-[var(--foreground)]"
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className={`w-5 h-5 rounded-md flex items-center justify-center text-xs font-black shrink-0 ${
                      isHwPronDone
                        ? "bg-emerald-600 text-white"
                        : "bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300"
                    }`}
                  >
                    {isHwPronDone ? "✓" : "2"}
                  </span>
                  <span className="text-xs font-extrabold truncate">
                    2. En Az {hwConfig.pronCount} Cümlede Telaffuz Yap
                  </span>
                </div>
                <span className="text-[11px] font-black tabular-nums shrink-0 text-slate-600 dark:text-slate-300">
                  {Math.min(hwPronouncedCount, hwConfig.pronCount)}/
                  {hwConfig.pronCount}
                </span>
              </div>
            )}

            {hwConfig.requireQuiz && (
              <div
                className={`p-2.5 rounded-xl border-2 flex items-center justify-between gap-2 ${
                  isHwQuizDone
                    ? "bg-emerald-50/90 dark:bg-emerald-950/50 border-emerald-600 text-emerald-900 dark:text-emerald-200"
                    : "bg-white/90 dark:bg-slate-900/80 border-[#E6D7BE] dark:border-slate-700 text-[var(--foreground)]"
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className={`w-5 h-5 rounded-md flex items-center justify-center text-xs font-black shrink-0 ${
                      isHwQuizDone
                        ? "bg-emerald-600 text-white"
                        : "bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300"
                    }`}
                  >
                    {isHwQuizDone ? "✓" : "3"}
                  </span>
                  <span className="text-xs font-extrabold truncate">
                    3. Diyalog Alıştırmalarını Tamamla
                  </span>
                </div>
                {isHwQuizDone ? (
                  <span className="text-[11px] font-black text-emerald-700 dark:text-emerald-300 shrink-0">
                    Tamamlandı ✓
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      playClick();
                      setHwQuizStep(0);
                      setHwQuizSelectedOpt(null);
                      setHwQuizCorrectCount(0);
                      setIsHwQuizModalOpen(true);
                    }}
                    className="px-2.5 py-1 rounded-lg bg-[#6741D9] hover:bg-[#5230B5] text-white text-[11px] font-extrabold shrink-0 cursor-pointer"
                  >
                    Alıştırmayı Aç →
                  </button>
                )}
              </div>
            )}
          </div>
        </section>
      )}

      {/* TAM EKRAN DİYALOG GÖRSELİ ÖNİZLEME (LIGHTBOX MODAL) */}
      {isLightboxOpen && (
        <div
          className="fixed inset-0 z-[60] print:hidden bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setIsLightboxOpen(false)}
        >
          <div
            className="relative max-w-3xl w-full bg-[#FDFBF7] dark:bg-[var(--surface)] rounded-3xl border-2 border-[#E6D7BE] dark:border-[var(--border)] border-b-4 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="relative bg-black/5 dark:bg-black/40">
              <img
                src={imagePath}
                alt={dialogue.baslik_tr}
                referrerPolicy="no-referrer"
                className="w-full max-h-[70vh] object-contain mx-auto"
              />
              <button
                type="button"
                onClick={() => {
                  playClick();
                  setIsLightboxOpen(false);
                }}
                className="absolute top-3 right-3 h-9 px-3.5 rounded-xl bg-black/75 hover:bg-black text-white text-xs font-extrabold flex items-center gap-1.5 border border-white/20 cursor-pointer shadow-lg"
              >
                <X size={15} />
                <span>Kapat (ESC)</span>
              </button>
            </div>

            <div className="px-5 py-3.5 flex flex-wrap items-center justify-between gap-3 bg-[#F7EFE1] dark:bg-[var(--background)] border-t border-[#E6D7BE] dark:border-[var(--border)]">
              <div className="flex items-center gap-2.5">
                <span className="px-2.5 py-1 rounded-lg bg-[#0CA678] text-white font-extrabold text-xs tabular-nums">
                  #{String(rawNum).padStart(2, "0")} • {dialogue.seviye}
                </span>
                <h3 className="text-base sm:text-lg font-extrabold text-[var(--foreground)]">
                  {dialogue.baslik_tr}
                </h3>
                <span className="text-xs font-semibold text-[var(--muted)]">
                  ({dialogue.satirlar.length} Cümle · {dialogueVocabEntries.length} Kelime)
                </span>
              </div>
              <span
                dir="rtl"
                className="arabic text-2xl sm:text-3xl font-bold text-[#087F5B] dark:text-[#20c997]"
              >
                {getDisplayText(dialogue.baslik_ar)}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* KOMPAKT 3 SATIRLIK DİYALOG BİLGİ VE KONTROL KARTI (Relative - Sabit Değil) */}
      <section className="relative bg-[#F7EFE1] dark:bg-[var(--surface)] rounded-2xl border-2 border-[#E6D7BE] dark:border-[var(--border)] border-b-4 shadow-sm p-2.5 sm:p-3 space-y-1.5">
        {/* 1. SATIR: Kompakt Başlık ve Görsel Satırı */}
        <div className="flex items-center justify-between gap-2 py-1">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <Link
              href="/kutuphane"
              onClick={() => playClick()}
              title="Kütüphaneye Dön"
              aria-label="Kütüphaneye Dön"
              className="w-8 h-8 rounded-xl bg-white dark:bg-[var(--background)] border-2 border-[#E6D7BE] dark:border-[var(--border)] border-b-3 flex items-center justify-center text-[var(--foreground)] hover:border-[#0CA678] shrink-0 transition-all"
            >
              <ChevronLeft size={16} strokeWidth={2.5} />
            </Link>

            <span className="px-2 py-0.5 rounded-lg bg-emerald-600 dark:bg-emerald-600 text-white font-extrabold text-[10px] sm:text-[11px] tabular-nums shrink-0">
              #{String(rawNum).padStart(2, "0")} • {dialogue.seviye}
            </span>

            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-1.5 flex-wrap leading-tight">
                <h1 className="text-sm sm:text-base font-extrabold text-[var(--foreground)] truncate">
                  {dialogue.baslik_tr}
                </h1>
                <span className="hidden sm:inline text-slate-600 dark:text-slate-300 font-bold">
                  |
                </span>
                <span
                  dir="rtl"
                  className="arabic text-lg sm:text-xl font-bold text-[#087F5B] dark:text-[#20c997] leading-none"
                >
                  {getDisplayText(dialogue.baslik_ar)}
                </span>
              </div>
              <p className="text-[11px] font-semibold text-slate-600 dark:text-slate-300 leading-tight mt-0.5 truncate">
                {dialogue.satirlar.length} Cümle • {dialogueVocabEntries.length} Kelime
              </p>
            </div>
          </div>

          {/* Sağdaki Küçük Diyalog Görseli (Tıklanınca Büyür) */}
          <button
            type="button"
            onClick={() => {
              playClick();
              setIsLightboxOpen(true);
            }}
            title="Görseli Büyüt"
            aria-label="Diyalog Kapak Görselini Büyüt"
            className="w-14 h-14 md:w-16 md:h-16 rounded-xl object-cover shrink-0 shadow-xs overflow-hidden border-2 border-white/80 dark:border-slate-700 relative group cursor-pointer"
          >
            <img
              src={imagePath}
              alt={dialogue.baslik_tr}
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            />
            <span className="absolute bottom-0.5 right-0.5 p-1 rounded-md bg-black/65 text-white flex items-center justify-center">
              <Maximize2 size={9} />
            </span>
          </button>
        </div>

        {/* 2. SATIR: Mobilde 2x2, Masaüstünde 4 Sütunlu Mod Sekmeleri */}
        <div className="w-full grid grid-cols-2 sm:grid-cols-4 gap-1.5 p-1 bg-slate-100/80 dark:bg-slate-800/80 rounded-xl border border-[#E6D7BE] dark:border-[var(--border)]">
          {(
            [
              { id: "listen", label: "📖 Dinle & İncele" },
              { id: "shadowing", label: "🎙️ Telaffuz" },
              { id: "roleplay", label: "🎭 Rol Yapma" },
              {
                id: "vocabulary",
                label: `📚 Sözlük (${dialogueVocabEntries.length})`,
              },
            ] as { id: StudyMode; label: string }[]
          ).map((tab) => {
            const isSelected = studyMode === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  playClick();
                  if (tab.id !== "roleplay" && isRoleplayRunning) {
                    playToken.current += 1;
                    stop();
                    cleanupRoleplayMic();
                    setIsRoleplayRunning(false);
                    setRoleplayActiveLine(null);
                    setRoleplaySpeakingLine(null);
                  }
                  setStudyMode(tab.id);
                }}
                className={`text-xs py-1.5 px-2 whitespace-nowrap rounded-lg font-extrabold transition-all text-center cursor-pointer ${
                  isSelected
                    ? "bg-[#6741D9] text-white shadow-2xs"
                    : "text-[var(--muted)] hover:text-[var(--foreground)] bg-white/60 dark:bg-transparent"
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* 3. SATIR: Tek Satırlık Kompakt Kontrol Çubuğu + "⋯" Diğer Menüsü */}
        <div className="pt-1 border-t border-dashed border-[#E2D3B8] dark:border-[var(--border-dashed)] space-y-1.5">
          <div className="flex items-center justify-between gap-1.5">
            {/* Sol/Orta Kısım: Kompakt Aksiyon Butonları */}
            <div className="flex items-center gap-1.5 flex-wrap min-w-0">
              {/* 1. ▶ Dinle / Durdur (veya Rol Yapma modunda Başlat/Bitir) */}
              {studyMode === "roleplay" ? (
                <button
                  type="button"
                  onClick={handleToggleRoleplay}
                  className={`px-3 py-1.5 rounded-xl font-extrabold text-xs border-b-2 transition-all flex items-center gap-1 cursor-pointer shrink-0 ${
                    isRoleplayRunning
                      ? "bg-red-600 hover:bg-red-700 text-white border-red-800"
                      : "bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-600 text-white border-emerald-800"
                  }`}
                >
                  {isRoleplayRunning ? (
                    <>
                      <Square size={11} fill="currentColor" />
                      <span>Bitir</span>
                    </>
                  ) : (
                    <>
                      <Play size={11} fill="currentColor" />
                      <span>Canlandır</span>
                    </>
                  )}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleTogglePlayAll}
                  className={`px-3 py-1.5 rounded-xl font-extrabold text-xs border-b-2 transition-all flex items-center gap-1 cursor-pointer shrink-0 ${
                    isPlayingAll
                      ? "bg-red-600 hover:bg-red-700 text-white border-red-800"
                      : "bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-600 text-white border-emerald-800"
                  }`}
                >
                  {isPlayingAll ? (
                    <Square size={11} fill="currentColor" />
                  ) : (
                    <Play size={11} fill="currentColor" />
                  )}
                  <span>{isPlayingAll ? "Durdur" : "Dinle"}</span>
                </button>
              )}

              {/* 2. Hız Butonu (1.0x <-> 0.75x Tek Rozet Buton) */}
              <button
                type="button"
                onClick={() => {
                  playClick();
                  const nextRate = speechRate === 0.75 ? 1 : 0.75;
                  setSpeechRate(nextRate);
                  setPlaybackRate(nextRate);
                }}
                title="Okuma Hızını Değiştir (1.0x Normal / 0.75x Yavaşlatılmış)"
                aria-label="Okuma Hızı"
                className={`px-2 py-1.5 rounded-xl border text-xs font-semibold tabular-nums transition-all cursor-pointer shrink-0 ${
                  mounted && speechRate === 0.75
                    ? "bg-[#0CA678] border-[#087F5B] text-white"
                    : "bg-white dark:bg-[var(--background)] border-[#E6D7BE] dark:border-[var(--border)] text-[var(--foreground)] hover:border-[#0CA678]"
                }`}
              >
                {mounted ? (speechRate === 1 ? "1.0x" : `${speechRate}x`) : "1.0x"}
              </button>

              {/* 3. Hareke İkon Butonu (✨ w-8 h-8) */}
              <button
                type="button"
                onClick={() => {
                  playClick();
                  toggleHareke();
                }}
                title="Harekeli / Harekesiz"
                aria-label="Harekeli / Harekesiz"
                className={`w-8 h-8 rounded-xl border flex items-center justify-center transition-all cursor-pointer shrink-0 ${
                  !mounted || showHareke
                    ? "bg-[#0CA678]/15 border-[#0CA678] text-[#087F5B] dark:text-[#20c997]"
                    : "bg-white dark:bg-[var(--background)] border-[#E6D7BE] dark:border-[var(--border)] text-[var(--muted)] hover:text-[var(--foreground)]"
                }`}
              >
                <Sparkles size={14} />
              </button>

              {/* 4. Canlandırma / Rol Yapma Hızlı İkon Butonu (🎭 w-8 h-8) */}
              <button
                type="button"
                onClick={() => {
                  playClick();
                  playToken.current += 1;
                  stop();
                  cleanupRoleplayMic();
                  setIsPlayingAll(false);
                  setLoopingLineSira(null);
                  setIsRoleplayRunning(false);
                  setRoleplayActiveLine(null);
                  setRoleplaySpeakingLine(null);
                  setStudyMode(studyMode === "roleplay" ? "listen" : "roleplay");
                }}
                title="Karşılıklı Rol Yapma (Role-Play) Modu"
                aria-label="Rol Yapma Modu"
                className={`w-8 h-8 rounded-xl border flex items-center justify-center text-sm transition-all cursor-pointer shrink-0 ${
                  studyMode === "roleplay"
                    ? "bg-[#6741D9] border-[#5230B5] text-white shadow-2xs"
                    : "bg-[#F3F0FF] dark:bg-[var(--lavender-bg)] border-[#6741D9]/50 hover:border-[#6741D9] text-[#4C28B5] dark:text-[#d0bfff]"
                }`}
              >
                <span aria-hidden="true">🎭</span>
              </button>

              {/* 5. PDF Butonu (📄 PDF) */}
              <button
                type="button"
                onClick={() => {
                  playClick();
                  setIsPdfModalOpen(true);
                }}
                title="PDF Ders Notu veya A4 Çalışma/Quiz Yaprağı Üret"
                aria-label="PDF / Ders Notu"
                className="px-2 py-1.5 rounded-xl bg-white dark:bg-[var(--background)] border border-[#E6D7BE] dark:border-[var(--border)] hover:border-[#0CA678] text-[var(--foreground)] flex items-center gap-1 text-xs font-extrabold transition-all cursor-pointer shrink-0"
              >
                <FileText size={13} className="text-[#0CA678]" />
                <span>PDF</span>
              </button>

              {/* 6. Öğretmen İçin "🎓 Ödev" Butonu */}
              <button
                type="button"
                onClick={() => {
                  playClick();
                  setIsTeacherHwModalOpen(true);
                }}
                title="Öğretmen-Öğrenci Ödev Bağlantısı ve Karekodu Oluştur"
                aria-label="Ödev Oluştur"
                className="px-2 py-1.5 rounded-xl bg-[#F3F0FF] dark:bg-[var(--lavender-bg)] border border-[#6741D9]/50 hover:border-[#6741D9] text-[#4C28B5] dark:text-[#d0bfff] flex items-center gap-1 text-xs font-extrabold transition-all cursor-pointer shrink-0"
              >
                <span>🎓 Ödev</span>
              </button>

              {/* 7. İndirilebilir Çevrimdışı Ders Paketi Butonu (📥 Çevrimdışı İndir / ✅ Çevrimdışı Hazır) */}
              <button
                type="button"
                onClick={() => {
                  if (isOfflineReady) {
                    playClick();
                    setShowOfflineNotice((v) => !v);
                  } else {
                    void handleDownloadOfflineDialogue();
                  }
                }}
                disabled={isDownloadingOffline}
                title={
                  isOfflineReady
                    ? "Bu diyalog ve tüm ses dosyaları çevrimdışı kullanıma hazır"
                    : `Bu diyaloğun seslerini çevrimdışı kullanım için indir (~${offlineEstimatedMb} MB)`
                }
                className={`px-2.5 py-1.5 rounded-xl border text-xs font-extrabold flex items-center gap-1 transition-all cursor-pointer shrink-0 ${
                  isOfflineReady
                    ? "bg-emerald-600 hover:bg-emerald-700 border-emerald-800 text-white shadow-2xs"
                    : isDownloadingOffline
                    ? "bg-amber-100 dark:bg-amber-950/60 border-amber-400 text-amber-900 dark:text-amber-200"
                    : "bg-white dark:bg-[var(--background)] border-[#E6D7BE] dark:border-[var(--border)] hover:border-emerald-600 text-[var(--foreground)]"
                }`}
              >
                {isOfflineReady ? (
                  <>
                    <span>✅ Çevrimdışı Hazır</span>
                  </>
                ) : isDownloadingOffline ? (
                  <>
                    <Download size={12} className="animate-bounce" />
                    <span>
                      İndiriliyor %{offlineProgressPct} (~{offlineEstimatedMb} MB)
                    </span>
                  </>
                ) : (
                  <>
                    <Download size={12} className="text-emerald-600" />
                    <span>📥 Çevrimdışı İndir (~{offlineEstimatedMb} MB)</span>
                  </>
                )}
              </button>

              {/* 8. 👁️ Kör Dinleme (Bulanık Metin) Modu Butonu */}
              <button
                type="button"
                onClick={() => {
                  playClick();
                  setBlurArabic((v) => !v);
                  setUnblurredLines({});
                }}
                title="👁️ Kör Dinleme (Metni Gizle): Arapça metni bulanıklaştırır; cümle çalarken veya üzerine gelince/dokununca netleşir"
                aria-label="Kör Dinleme (Metni Gizle)"
                className={`px-2 py-1.5 rounded-xl border text-xs font-extrabold flex items-center gap-1 transition-all cursor-pointer shrink-0 ${
                  blurArabic
                    ? "bg-amber-600 border-amber-800 text-white shadow-2xs"
                    : "bg-white dark:bg-[var(--background)] border-[#E6D7BE] dark:border-[var(--border)] hover:border-amber-500 text-[var(--foreground)]"
                }`}
              >
                <span>👁️ Kör Dinleme</span>
              </button>

              {/* 9. 🖥️ Akıllı Tahta / Sınıf Sunum Modu Butonu (Sadece Tablet/Masaüstü/Tahta: hidden sm:inline-flex) */}
              <button
                type="button"
                onClick={() => {
                  playClick();
                  setIsClassroomMode((v) => {
                    const next = !v;
                    if (next && selectedClassroomLine === null) {
                      setSelectedClassroomLine(dialogue.satirlar[0]?.sira ?? 1);
                    }
                    return next;
                  });
                }}
                title="🖥️ Sınıf / Tahta Modu: Arapça metinleri sınıfın en arkasından okunacak boyuta büyütür ve aktif satırı öne çıkarır"
                aria-label="Sınıf / Tahta Modu"
                className={`hidden sm:inline-flex px-2.5 py-1.5 rounded-xl border text-xs font-extrabold items-center gap-1 transition-all cursor-pointer shrink-0 ${
                  isClassroomMode
                    ? "bg-[#0CA678] border-[#087F5B] text-white shadow-2xs"
                    : "bg-white dark:bg-[var(--background)] border-[#E6D7BE] dark:border-[var(--border)] hover:border-[#0CA678] text-[var(--foreground)]"
                }`}
              >
                <span>🖥️ Sınıf / Tahta Modu</span>
              </button>

              {/* Mod Özel Kompakt Kontroller (Rol Yapma veya Telaffuz seçiliyse aynı satırda) */}
              {studyMode === "roleplay" && (
                <>
                  <div className="bg-white dark:bg-[var(--background)] rounded-xl p-0.5 border border-[#E6D7BE] dark:border-[var(--border)] flex items-center gap-0.5">
                    {speakers.map((sp, idx) => (
                      <button
                        key={sp}
                        type="button"
                        onClick={() => {
                          playClick();
                          if (isRoleplayRunning) {
                            playToken.current += 1;
                            stop();
                            cleanupRoleplayMic();
                            setIsRoleplayRunning(false);
                            setRoleplayActiveLine(null);
                            setRoleplaySpeakingLine(null);
                          }
                          setSelectedRoleSpeaker(sp);
                        }}
                        className={`px-2 py-1 text-[11px] rounded-lg transition-all whitespace-nowrap cursor-pointer ${
                          selectedRoleSpeaker === sp
                            ? "bg-[#0CA678] text-white font-bold"
                            : "text-[var(--muted)] font-medium hover:text-[var(--foreground)]"
                        }`}
                      >
                        {idx === 0 ? "A" : "B"}: {sp}
                      </button>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      playClick();
                      setHideRoleplayUserText((v) => !v);
                    }}
                    title="Rolünüze ait Arapça metinleri ezberden konuşma pratiği için gizler veya açar"
                    className={`px-2 py-1.5 rounded-xl border text-[11px] font-extrabold flex items-center gap-1 transition-all cursor-pointer ${
                      hideRoleplayUserText
                        ? "bg-[#6741D9] border-[#5230B5] text-white"
                        : "bg-white dark:bg-[var(--background)] border-[#E6D7BE] dark:border-[var(--border)] text-[var(--foreground)]"
                    }`}
                  >
                    <Eye size={12} />
                    <span>Rol Metnimi Gizle: {hideRoleplayUserText ? "Açık" : "Kapalı"}</span>
                  </button>
                </>
              )}

              {studyMode === "shadowing" && (
                <button
                  type="button"
                  onClick={() => {
                    playClick();
                    setAutoShadowingFlow((v) => !v);
                  }}
                  title="Cümle dinlendikten sonra otomatik olarak telaffuz koçunu aç"
                  className={`px-2 py-1.5 rounded-xl border text-[11px] font-extrabold flex items-center gap-1 transition-all cursor-pointer ${
                    autoShadowingFlow
                      ? "bg-[#0CA678] border-[#087F5B] text-white"
                      : "bg-white dark:bg-[var(--background)] border-[#E6D7BE] dark:border-[var(--border)] text-[var(--foreground)]"
                  }`}
                >
                  <Mic size={12} />
                  <span>Oto Koç: {autoShadowingFlow ? "Açık" : "Manuel"}</span>
                </button>
              )}
            </div>

            {/* Sağ Kısım: "⋯" (MoreHorizontal) Açılır Popover Menüsü */}
            <div className="relative shrink-0" ref={moreMenuRef}>
              <button
                type="button"
                onClick={() => {
                  playClick();
                  setIsMoreMenuOpen((v) => !v);
                }}
                title="Diğer Seçenekler, Görünüm, Döngü, Favori ve Rehber"
                aria-label="Diğer Seçenekler Menüsü"
                className={`w-8 h-8 rounded-xl border-2 border-b-3 flex items-center justify-center transition-all cursor-pointer ${
                  isMoreMenuOpen
                    ? "bg-[#6741D9] border-[#5230B5] text-white"
                    : "bg-white dark:bg-[var(--background)] border-[#E6D7BE] dark:border-[var(--border)] text-[var(--foreground)] hover:border-[#6741D9]"
                }`}
              >
                <MoreHorizontal size={16} />
              </button>

              {isMoreMenuOpen && (
                <div className="absolute right-0 top-full mt-2 w-72 sm:w-80 max-w-[calc(100vw-1.5rem)] rounded-2xl bg-[#F7EFE1] dark:bg-[var(--surface)] border-2 border-[#E6D7BE] dark:border-[var(--border)] border-b-4 p-3 shadow-2xl z-50 space-y-2.5">
                  <div className="flex items-center justify-between pb-1.5 border-b border-dashed border-[#E2D3B8] dark:border-[var(--border-dashed)]">
                    <span className="text-[11px] font-extrabold uppercase tracking-wider text-[var(--muted)]">
                      Diyalog Seçenekleri &amp; Görünüm
                    </span>
                    <button
                      type="button"
                      onClick={() => setIsMoreMenuOpen(false)}
                      className="text-[var(--muted)] hover:text-[var(--foreground)] cursor-pointer"
                      aria-label="Menüyü Kapat"
                    >
                      <X size={14} />
                    </button>
                  </div>

                  {/* Görünüm Modu İkonları */}
                  <div className="space-y-1">
                    <span className="text-[10px] font-extrabold uppercase text-[var(--muted)] block">
                      Metin &amp; Çeviri Görünümü
                    </span>
                    <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5 bg-white dark:bg-[var(--background)] rounded-xl p-1.5 border border-[#E6D7BE] dark:border-[var(--border)]">
                      {(
                        [
                          { id: "stacked", label: "Alt Alta", icon: Rows2 },
                          { id: "columns", label: "İki Sütun", icon: Columns2 },
                          { id: "arabic-only", label: "Arapça", icon: Languages },
                          { id: "turkish-only", label: "Türkçe", icon: Eye },
                        ] as {
                          id: ViewMode;
                          label: string;
                          icon: typeof Rows2;
                        }[]
                      ).map((opt) => {
                        const active = !clickToRevealTr && currentViewMode === opt.id;
                        const Icon = opt.icon;
                        return (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => {
                              playClick();
                              setClickToRevealTr(false);
                              setViewMode(opt.id);
                              setRevealedTrLines({});
                              setRevealedArLines({});
                            }}
                            title={opt.label}
                            className={`flex flex-col items-center justify-center gap-0.5 py-1.5 px-1 rounded-lg text-[10px] font-bold transition-all cursor-pointer ${
                              active
                                ? "bg-[#0CA678] text-white"
                                : "text-[var(--muted)] hover:text-[var(--foreground)]"
                            }`}
                          >
                            <Icon size={13} />
                            <span className="whitespace-nowrap px-0.5">{opt.label}</span>
                          </button>
                        );
                      })}
                      <button
                        type="button"
                        onClick={() => {
                          playClick();
                          setClickToRevealTr(true);
                          setViewMode("stacked");
                          setRevealedTrLines({});
                        }}
                        title="Tıkla-Gör (Çeviriyi tıklayınca aç)"
                        className={`flex flex-col items-center justify-center gap-0.5 py-1.5 px-1 rounded-lg text-[10px] font-bold transition-all cursor-pointer ${
                          clickToRevealTr
                            ? "bg-[#0CA678] text-white"
                            : "text-[var(--muted)] hover:text-[var(--foreground)]"
                        }`}
                      >
                        <MousePointerClick size={13} />
                        <span className="whitespace-nowrap px-0.5">Tıkla-Gör</span>
                      </button>
                    </div>
                  </div>

                  {/* Kelime Vurgusu & Ok Takibi */}
                  <div className="space-y-1">
                    <span className="text-[10px] font-extrabold uppercase text-[var(--muted)] block">
                      Dinlenen Kelime Vurgusu
                    </span>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 bg-white dark:bg-[var(--background)] rounded-xl p-1.5 border border-[#E6D7BE] dark:border-[var(--border)]">
                      {(
                        [
                          { id: "both", label: "Vurgu + Ok" },
                          { id: "highlight", label: "Sadece Vurgu" },
                          { id: "arrow", label: "Sadece Ok" },
                          { id: "off", label: "Kapalı" },
                        ] as { id: WordTrackingStyle; label: string }[]
                      ).map((ws) => {
                        const active = (mounted ? wordTrackingStyle : "both") === ws.id;
                        return (
                          <button
                            key={ws.id}
                            type="button"
                            onClick={() => {
                              playClick();
                              setWordTrackingStyle(ws.id);
                            }}
                            className={`py-1.5 px-2 rounded-lg text-[10px] font-extrabold whitespace-nowrap transition-all cursor-pointer ${
                              active
                                ? "bg-[#6741D9] text-white"
                                : "text-[var(--muted)] hover:text-[var(--foreground)]"
                            }`}
                          >
                            {ws.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Cümleler Arası Gölgeleme Boşluğu Hızlı Seçici */}
                  <div className="space-y-1">
                    <span className="text-[10px] font-extrabold uppercase text-[var(--muted)] block">
                      Cümleler Arası Gölgeleme Boşluğu
                    </span>
                    <div className="grid grid-cols-3 gap-1.5 bg-white dark:bg-[var(--background)] rounded-xl p-1.5 border border-[#E6D7BE] dark:border-[var(--border)]">
                      {(
                        [
                          { id: 0, label: "Yok (Akıcı)" },
                          { id: 2, label: "2 Sn Bekle" },
                          { id: "auto", label: "Cümle Süresi" },
                        ] as { id: PauseBetweenLines; label: string }[]
                      ).map((pOpt) => {
                        const active =
                          (mounted ? pauseBetweenLines : 0) === pOpt.id;
                        return (
                          <button
                            key={String(pOpt.id)}
                            type="button"
                            onClick={() => {
                              playClick();
                              setPauseBetweenLines(pOpt.id);
                            }}
                            className={`py-1.5 px-1.5 rounded-lg text-[10px] font-extrabold whitespace-nowrap transition-all cursor-pointer ${
                              active
                                ? "bg-[#0CA678] text-white"
                                : "text-[var(--muted)] hover:text-[var(--foreground)]"
                            }`}
                          >
                            {pOpt.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* 🔁 Tekrar/Döngü Seçimi, ♡ Favori ve ✓ Tamamlandı */}
                  <div className="grid grid-cols-3 gap-1.5 pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        cycleDialogueLoopCount();
                        playClick();
                      }}
                      className={`py-2 px-2 rounded-xl border text-xs font-extrabold flex items-center justify-center gap-1 transition-all cursor-pointer ${
                        mounted && dialogueLoopCount !== 1
                          ? "bg-[#6741D9] border-[#5230B5] text-white"
                          : "bg-white dark:bg-[var(--background)] border-[#E6D7BE] dark:border-[var(--border)] text-[var(--foreground)]"
                      }`}
                    >
                      <Repeat size={13} />
                      <span>
                        Döngü:{" "}
                        {!mounted
                          ? "1x"
                          : dialogueLoopCount === "infinite"
                          ? "∞"
                          : `${dialogueLoopCount}x`}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        playClick();
                        toggleFavoriteDialogue(dialogue.id);
                      }}
                      className={`py-2 px-2 rounded-xl border text-xs font-extrabold flex items-center justify-center gap-1 transition-all cursor-pointer ${
                        isFav
                          ? "bg-red-50 border-red-300 text-red-600"
                          : "bg-white dark:bg-[var(--background)] border-[#E6D7BE] dark:border-[var(--border)] text-[var(--foreground)]"
                      }`}
                    >
                      <Heart size={13} fill={isFav ? "currentColor" : "none"} />
                      <span>{isFav ? "Favoride" : "Favori"}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        playClick();
                        toggleCompletedDialogue(dialogue.id);
                      }}
                      className={`py-2 px-2 rounded-xl border text-xs font-extrabold flex items-center justify-center gap-1 transition-all cursor-pointer ${
                        isCompleted
                          ? "bg-[#F3F0FF] border-[#6741D9] text-[#6741D9]"
                          : "bg-white dark:bg-[var(--background)] border-[#E6D7BE] dark:border-[var(--border)] text-[var(--foreground)]"
                      }`}
                    >
                      <CheckCircle2 size={13} />
                      <span>{isCompleted ? "Bitti" : "Tamamla"}</span>
                    </button>
                  </div>

                  {/* 💡 Rehber Bilgisi */}
                  <div className="text-[11px] py-2 px-2.5 rounded-xl bg-[#0CA678]/10 border border-[#0CA678]/30 font-semibold text-[#087F5B] dark:text-[#20c997] leading-snug">
                    💡 <strong>Rehber:</strong> Diyaloğu doğal sesle dinleyin. Morfolojik kök analizi için Arapça kelimelere tıklayın; mikrofon ikonuyla telaffuz ve 38 mahreç analizini açın.
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Çevrimdışı Hazır Bilgi Rozeti (İndirildiğinde veya tıklandığında görünür) */}
          {(showOfflineNotice || isOfflineReady) && (
            <div className="rounded-xl bg-emerald-50/90 dark:bg-emerald-950/50 border border-emerald-600/40 px-3 py-1.5 flex items-center justify-between gap-2 text-[11px] font-bold text-emerald-900 dark:text-emerald-200">
              <span>
                ✅ Diyalog metni, sözlük/morfoloji, cümle sesleri ve 5 alıştırma modülü artık tamamen internetsiz çalışır.
              </span>
              {showOfflineNotice && (
                <button
                  type="button"
                  onClick={() => setShowOfflineNotice(false)}
                  className="text-emerald-700 dark:text-emerald-300 hover:underline text-[10px] font-extrabold shrink-0 cursor-pointer"
                >
                  Gizle
                </button>
              )}
            </div>
          )}

          {studyMode === "roleplay" && roleplayCompletedBanner && (
            <div
              ref={roleplaySummaryRef}
              className="rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 border-2 border-[#0CA678] border-b-4 ring-2 ring-emerald-500 transition-all p-3.5 space-y-2.5 shadow-sm"
            >
              {(() => {
                const userLines = dialogue.satirlar.filter(
                  (l) => l.konusmaci === selectedRoleSpeaker
                );
                const lineScoreList = userLines.map(
                  (l) => roleplayLineScores[l.sira] ?? 0
                );
                const avgScore =
                  lineScoreList.length > 0
                    ? Math.round(
                        lineScoreList.reduce((a, b) => a + b, 0) /
                          lineScoreList.length
                      )
                    : 0;
                const otherSpeaker =
                  speakers.find((sp) => sp !== selectedRoleSpeaker) ||
                  selectedRoleSpeaker;

                return (
                  <>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="space-y-0.5">
                        <span className="text-xs sm:text-sm font-extrabold text-[#087F5B] dark:text-[#20c997] block">
                          🎉 Tebrikler! &ldquo;{selectedRoleSpeaker}&rdquo; Rolüyle Diyalog Simülasyonunu Tamamladınız!
                        </span>
                        <span className="text-[11px] font-semibold text-[var(--muted)] block">
                          {avgScore >= 80
                            ? "Harika akıcılık ve mahreç uyumu! Şimdi diğer karakterin rolüne geçerek diyaloğu pekiştirebilirsiniz."
                            : avgScore > 0
                            ? "İyi bir pratik oldu! Cümleleri 0.75x hızda dinleyip tekrar canlandırarak puanınızı yükseltebilirsiniz."
                            : "Sıra size geldiğinde mikrofona sesli okuyarak gerçek telaffuz puanınızı ölçebilirsiniz."}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <span
                          className={`px-3 py-1 rounded-xl text-white text-xs font-extrabold tabular-nums shadow-xs ${
                            avgScore >= 70
                              ? "bg-[#0CA678]"
                              : avgScore > 0
                              ? "bg-amber-600"
                              : "bg-rose-600"
                          }`}
                        >
                          Genel Telaffuz: %{avgScore}
                        </span>
                        <span className="px-2.5 py-1 rounded-xl bg-white dark:bg-[var(--surface)] border border-[#0CA678]/40 text-[11px] font-extrabold text-[var(--foreground)] tabular-nums">
                          {userLines.length} / {userLines.length} Replik
                        </span>
                      </div>
                    </div>

                    {userLines.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-emerald-200/70 dark:border-emerald-800/60">
                        <span className="text-[10px] font-extrabold uppercase text-[#087F5B] dark:text-emerald-300">
                          Replik Puanlarınız:
                        </span>
                        {userLines.map((ul) => {
                          const sc = roleplayLineScores[ul.sira] ?? 0;
                          return (
                            <button
                              key={ul.sira}
                              type="button"
                              onClick={() => {
                                playClick();
                                lineRefs.current[ul.sira]?.scrollIntoView({
                                  behavior: "smooth",
                                  block: "center",
                                });
                              }}
                              title={`#${ul.sira}. repliğe git`}
                              className={`px-2 py-0.5 rounded-lg border text-[10px] font-extrabold tabular-nums cursor-pointer hover:scale-105 transition ${
                                sc >= 70
                                  ? "bg-white dark:bg-[var(--background)] border-[#0CA678]/50 text-[#087F5B] dark:text-emerald-300"
                                  : sc > 0
                                  ? "bg-amber-50 dark:bg-amber-950/60 border-amber-400 text-amber-800 dark:text-amber-200"
                                  : "bg-rose-50 dark:bg-rose-950/60 border-rose-400 text-rose-800 dark:text-rose-200"
                              }`}
                            >
                              #{ul.sira}: %{sc}
                              {sc === 0 ? " (Okunmadı / Ses Yok)" : ""}
                            </button>
                          );
                        })}
                      </div>
                    )}

                    <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
                      {otherSpeaker !== selectedRoleSpeaker && (
                        <button
                          type="button"
                          onClick={() => {
                            playClick();
                            setSelectedRoleSpeaker(otherSpeaker);
                            setRoleplayCompletedBanner(false);
                            setRoleplayLineScores({});
                          }}
                          className="px-3 py-1.5 rounded-xl bg-[#6741D9] hover:bg-[#5230B5] text-white text-xs font-extrabold border-b-2 border-[#422399] cursor-pointer"
                        >
                          🔄 Rol Değiştir ({otherSpeaker} Ol)
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          playClick();
                          setIsShareModalOpen(true);
                        }}
                        className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-extrabold border-b-2 border-amber-700 cursor-pointer flex items-center gap-1"
                      >
                        <Share2 size={13} />
                        <span>🏆 Rol Yapma Başarı Kartını Paylaş</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleToggleRoleplay}
                        className="px-3 py-1.5 rounded-xl bg-[#0CA678] hover:bg-[#099268] text-white text-xs font-extrabold border-b-2 border-[#087F5B] cursor-pointer"
                      >
                        ▶️ Aynı Rolle Tekrar Canlandır
                      </button>
                    </div>
                  </>
                );
              })()}
            </div>
          )}
        </div>
      </section>

      {/* SINIF MODU ÜST KONTROL ÇUBUĞU (A+ / A- Punto, Spot Odaklama, Hızlı Gizle/Göster ve Çıkış) */}
      {isClassroomMode && studyMode !== "vocabulary" && (
        <section
          aria-label="Akıllı Tahta ve Sınıf Sunum Modu Kontrol Çubuğu"
          className="rounded-2xl bg-gradient-to-r from-emerald-900 via-[#087F5B] to-teal-900 text-white border-2 border-emerald-400/60 border-b-4 p-3 sm:p-4 shadow-xl flex flex-wrap items-center justify-between gap-3 animate-in fade-in duration-200"
        >
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="px-3 py-1 rounded-xl bg-white/15 border border-white/25 text-xs sm:text-sm font-black tracking-wide flex items-center gap-1.5">
              <span>🖥️ Akıllı Tahta &amp; Sınıf Sunum Modu</span>
            </span>
            <span className="hidden lg:inline text-xs font-semibold text-emerald-100">
              Ok tuşları (↑/↓): Cümle Seç • Space (Boşluk): Cümleyi Dinle • Shift+Space (veya P): Tüm Diyaloğu Oynat
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* 🔍 Yazı Boyutu: A- / %150 / A+ */}
            <div className="inline-flex items-center gap-1 bg-black/25 rounded-xl p-1 border border-white/20">
              <span className="text-[11px] font-extrabold px-2 text-emerald-100 hidden sm:inline">
                🔍 Punto:
              </span>
              <button
                type="button"
                onClick={() => {
                  playClick();
                  setClassroomScale((s) =>
                    Math.max(1.2, Math.round((s - 0.15) * 100) / 100)
                  );
                }}
                title="Yazı Boyutunu Küçült (A-)"
                className="px-2.5 py-1 rounded-lg bg-white/15 hover:bg-white/30 text-white font-black text-xs sm:text-sm cursor-pointer transition-colors"
              >
                A-
              </button>
              <span className="px-2 text-xs sm:text-sm font-black tabular-nums text-amber-300 min-w-[50px] text-center">
                %{Math.round(classroomScale * 100)}
              </span>
              <button
                type="button"
                onClick={() => {
                  playClick();
                  setClassroomScale((s) =>
                    Math.min(2.2, Math.round((s + 0.15) * 100) / 100)
                  );
                }}
                title="Yazı Boyutunu Büyüt (A+)"
                className="px-2.5 py-1 rounded-lg bg-white/15 hover:bg-white/30 text-white font-black text-xs sm:text-sm cursor-pointer transition-colors"
              >
                A+
              </button>
            </div>

            {/* 🔦 Spot Odaklama */}
            <button
              type="button"
              onClick={() => {
                playClick();
                setSpotlightMode((v) => !v);
              }}
              title="Aktif olmayan diğer cümleleri karartarak sınıfın tek cümleye odaklanmasını sağlar"
              className={`px-3 py-1.5 rounded-xl border text-xs font-extrabold flex items-center gap-1.5 cursor-pointer transition-all ${
                spotlightMode
                  ? "bg-amber-400 text-slate-950 border-amber-200 shadow-sm"
                  : "bg-white/10 hover:bg-white/20 text-white border-white/25"
              }`}
            >
              <span>🔦 Spot Odaklama: {spotlightMode ? "Açık" : "Kapalı"}</span>
            </button>

            {/* 👁️ Hızlı Gizle/Göster: Türkçeleri Gizle/Aç */}
            <button
              type="button"
              onClick={() => {
                playClick();
                setClickToRevealTr(false);
                setViewMode(
                  currentViewMode === "arabic-only" ? "stacked" : "arabic-only"
                );
              }}
              className={`px-3 py-1.5 rounded-xl border text-xs font-extrabold flex items-center gap-1.5 cursor-pointer transition-all ${
                currentViewMode === "arabic-only"
                  ? "bg-[#6741D9] text-white border-indigo-300 shadow-sm"
                  : "bg-white/10 hover:bg-white/20 text-white border-white/25"
              }`}
            >
              <span>
                👁️ {currentViewMode === "arabic-only" ? "Türkçeleri Aç" : "Türkçeleri Gizle"}
              </span>
            </button>

            {/* 👁️ Hızlı Gizle/Göster: Arapçaları Bulanıklaştır (Kör Dinleme) */}
            <button
              type="button"
              onClick={() => {
                playClick();
                setBlurArabic((v) => !v);
                setUnblurredLines({});
              }}
              className={`px-3 py-1.5 rounded-xl border text-xs font-extrabold flex items-center gap-1.5 cursor-pointer transition-all ${
                blurArabic
                  ? "bg-amber-500 text-slate-950 border-amber-200 shadow-sm"
                  : "bg-white/10 hover:bg-white/20 text-white border-white/25"
              }`}
            >
              <span>
                {blurArabic
                  ? "👁️ Arapçaları Netleştir"
                  : "👁️ Arapçaları Bulanıklaştır"}
              </span>
            </button>

            {/* ✕ Sınıf Modundan Çık */}
            <button
              type="button"
              onClick={() => {
                playClick();
                setIsClassroomMode(false);
              }}
              className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white border border-rose-300/50 text-xs font-extrabold flex items-center gap-1 cursor-pointer shadow-sm"
            >
              <X size={14} />
              <span>Sınıf Modundan Çık</span>
            </button>
          </div>
        </section>
      )}

      {/* DİYALOG SATIRLARI VEYA MORFOLOJİK DİYALOG SÖZLÜĞÜ */}
      {studyMode === "vocabulary" ? (
        <div className="space-y-4">
          {/* BU DİYALOGDAKİ KALIP İFADELER (التعبيرات الاصطلاحية) BÖLÜMÜ */}
          {dialogueIdioms.length > 0 && (
            <section className="rounded-2xl bg-[#F7EFE1] dark:bg-[var(--surface)] border-2 border-[#E6D7BE] dark:border-[var(--border)] border-b-4 p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-dashed border-[#E2D3B8] dark:border-[var(--border-dashed)] pb-2">
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-1 rounded-xl bg-[#6741D9] text-white text-xs font-extrabold">
                    ✨ Kalıp İfadeler ({dialogueIdioms.length})
                  </span>
                  <h2 className="text-sm sm:text-base font-extrabold text-[var(--foreground)]">
                    Bu Diyalogdaki Kalıp İfadeler{" "}
                    <bdi
                      dir="rtl"
                      className="arabic font-arabic text-base sm:text-lg text-[#087F5B] dark:text-[#20c997]"
                    >
                      (التعبيرات الاصطلاحية)
                    </bdi>
                  </h2>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[11px] font-semibold text-[var(--muted)] hidden sm:inline">
                    Deyimsel anlam, kullanım notu ve sesli telaffuz
                  </span>
                  <Link
                    href={`/alistirmalar?source=idioms&dialogueId=${dialogue.id}`}
                    onClick={() => playClick()}
                    className="px-2.5 py-1 rounded-xl bg-[#6741D9] hover:bg-[#5230B5] text-white border-b-2 border-[#3b1f8c] text-xs font-extrabold flex items-center gap-1 transition-all cursor-pointer shrink-0"
                  >
                    <span>🎯 Alıştırma Yap</span>
                  </Link>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {dialogueIdioms.map((idm) => {
                  const hasPoliteOrAltVariant =
                    Boolean(idm.matchedPhrase) &&
                    normalizeForIdiomMatch(idm.matchedPhrase || "") !==
                      normalizeForIdiomMatch(idm.arabic);
                  const primaryAr: string =
                    hasPoliteOrAltVariant && idm.matchedPhrase
                      ? idm.matchedPhrase
                      : idm.arabic;

                  return (
                    <div
                      key={idm.id}
                      className="rounded-2xl bg-white dark:bg-slate-900/90 border-2 border-[#E6D7BE] dark:border-slate-700 border-l-4 border-l-[#6741D9] dark:border-l-indigo-500 p-3.5 flex flex-col justify-between space-y-2.5"
                    >
                      <div className="space-y-1.5">
                        <div className="flex items-start justify-between gap-2">
                          <span className="px-2 py-0.5 rounded-md bg-[#F3F0FF] dark:bg-indigo-950/80 border border-[#6741D9]/30 dark:border-indigo-500/40 text-[10px] font-extrabold text-[#6741D9] dark:text-indigo-200">
                            Cümle #{idm.lineNumber} • {idm.level || dialogue.seviye} • Kalıp İfade
                          </span>
                          <span
                            dir="rtl"
                            className="arabic font-arabic text-2xl sm:text-3xl font-bold text-[#087F5B] dark:text-[#20c997] text-right leading-snug"
                          >
                            {getDisplayText(primaryAr)}
                          </span>
                        </div>

                        {hasPoliteOrAltVariant && (
                          <div className="flex items-center justify-end gap-1.5 text-[11px] font-bold text-[#6741D9] dark:text-indigo-300 bg-[#F3F0FF]/80 dark:bg-indigo-950/50 px-2.5 py-1 rounded-lg border border-[#6741D9]/20">
                            <span>💡 Kibar / Alternatif Kullanım:</span>
                            <bdi
                              dir="rtl"
                              className="arabic font-arabic text-base font-bold text-[#087F5B] dark:text-[#20c997]"
                            >
                              {getDisplayText(idm.arabic)}
                            </bdi>
                          </div>
                        )}

                        <p className="text-sm font-extrabold text-[var(--foreground)] dark:text-slate-100">
                          {idm.meaningTr}
                        </p>

                        <p className="text-[11px] font-semibold text-[var(--muted)] dark:text-slate-300">
                          <strong className="text-[var(--foreground)] dark:text-slate-100">
                            Kelime Anlamı:
                          </strong>{" "}
                          {idm.literalTr}
                        </p>

                        <div className="rounded-xl bg-[#F7EFE1]/80 dark:bg-slate-800/90 px-2.5 py-1.5 border border-[#E6D7BE] dark:border-slate-700 text-[11px] font-semibold text-[var(--foreground)] dark:text-slate-200 leading-snug">
                          💡 <strong>Kullanım İpucu:</strong> {idm.usageNote}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => {
                            playClick();
                            void speakHybrid({
                              text: primaryAr,
                              rate: speechRate,
                            });
                          }}
                          className="flex-1 h-9 px-3 rounded-xl bg-[#F7EFE1] dark:bg-slate-800 hover:border-[#0CA678] border-2 border-[#E6D7BE] dark:border-slate-600 border-b-3 text-xs font-extrabold text-[var(--foreground)] dark:text-slate-100 flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          <Volume2 size={14} className="text-[#0CA678]" />
                          <span>🔊 Dinle</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            playClick();
                            openShadowingCoach({
                              text: primaryAr,
                            });
                          }}
                          className="flex-1 h-9 px-3 rounded-xl bg-[#F3F0FF] dark:bg-indigo-950/85 hover:bg-[#e8e2ff] dark:hover:bg-indigo-900/80 border-2 border-[#6741D9] dark:border-indigo-500 border-b-3 text-xs font-extrabold text-[#6741D9] dark:text-indigo-200 flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          <Mic size={14} />
                          <span>🎙️ Telaffuz Et</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {dialogueVocabEntries.map((entry: DialogueVocabularyEntry) => {
            const word = entry.item;
            const isFavWord = mounted && isWordFavorite(word.id);
            const isLearned = mounted && isWordLearned(word.id);
            const mainAr = word.mufret || word.mazi || "";
            const category = getWordCategory(word);
            const catTheme =
              category === "fiil"
                ? {
                    leftBorder: "border-l-4 border-l-amber-500",
                    badgeText: "⚡ Fiil (فعل)",
                    badgeClass:
                      "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950/60 dark:text-amber-300",
                    arColor: "text-amber-700 dark:text-amber-300",
                  }
                : category === "edat"
                ? {
                    leftBorder: "border-l-4 border-l-purple-500",
                    badgeText: "🔗 Edat / Kalıp",
                    badgeClass:
                      "bg-purple-100 text-purple-800 border-purple-300 dark:bg-purple-950/60 dark:text-purple-300",
                    arColor: "text-purple-700 dark:text-purple-300",
                  }
                : category === "ozel-isim"
                ? {
                    leftBorder: "border-l-4 border-l-teal-500",
                    badgeText: "👤 Özel İsim (اسم علم)",
                    badgeClass:
                      "bg-teal-100 text-teal-800 border-teal-300 dark:bg-teal-950/60 dark:text-teal-300",
                    arColor: "text-teal-700 dark:text-teal-300",
                  }
                : {
                    leftBorder: "border-l-4 border-l-sky-500",
                    badgeText: "📘 İsim (اسم)",
                    badgeClass:
                      "bg-sky-100 text-sky-800 border-sky-300 dark:bg-sky-950/60 dark:text-sky-300",
                    arColor: "text-sky-700 dark:text-sky-300",
                  };

            return (
              <div
                key={word.id}
                className={`rounded-2xl border-2 border-b-4 ${
                  catTheme.leftBorder
                } p-4 flex flex-col justify-between space-y-3 ${
                  isLearned
                    ? "bg-[#F3F0FF] dark:bg-[var(--lavender-bg)] border-[#6741D9]"
                    : "bg-[#F7EFE1] dark:bg-[var(--surface)] border-[#E6D7BE] dark:border-[var(--border)]"
                }`}
              >
                <div className="space-y-2.5">
                  <div className="flex items-start justify-between gap-2 border-b border-dashed border-[#E2D3B8] pb-2.5">
                    <div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span
                          className={`px-2 py-0.5 rounded-md border text-[10px] font-extrabold ${catTheme.badgeClass}`}
                        >
                          {catTheme.badgeText}
                        </span>
                        {word.kok && word.kok !== "-" && (
                          <span
                            dir="ltr"
                            className="inline-flex items-center gap-1 text-[11px] font-bold text-[var(--muted)]"
                          >
                            <span>Kök:</span>
                            <bdi
                              dir="rtl"
                              className="arabic font-arabic text-xs font-bold text-[var(--foreground)] inline-block"
                            >
                              {getDisplayText(word.kok)}
                            </bdi>
                          </span>
                        )}
                      </div>
                      <p
                        dir="ltr"
                        className="text-sm font-extrabold text-[var(--foreground)] mt-1 text-left leading-snug"
                      >
                        {splitMixedBidiText(word.anlam_tr).map((seg, sIdx) =>
                          seg.isArabic ? (
                            <bdi
                              key={sIdx}
                              dir="rtl"
                              className="arabic font-arabic font-bold inline-block mx-0.5"
                            >
                              {getDisplayText(seg.text)}
                            </bdi>
                          ) : (
                            <span key={sIdx}>{seg.text}</span>
                          )
                        )}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <span
                        dir="rtl"
                        className={`arabic text-3xl font-bold block leading-tight ${catTheme.arColor}`}
                      >
                        {getDisplayText(mainAr)}
                      </span>
                      {entry.contextWord && (
                        <span
                          dir="ltr"
                          className="inline-flex items-center justify-end gap-1 text-xs md:text-sm font-medium text-[#6741D9] mt-0.5"
                        >
                          <span>Metinde:</span>
                          <bdi
                            dir="rtl"
                            className="arabic text-base md:text-lg font-arabic font-bold inline-block"
                          >
                            {getDisplayText(entry.contextWord)}
                          </bdi>
                        </span>
                      )}
                    </div>
                  </div>

                  {entry.morphologyNote && (
                    <div
                      dir="ltr"
                      className="bg-white dark:bg-[var(--background)] rounded-xl px-3 py-1.5 border border-[#E6D7BE] text-[11px] font-bold text-[#4C28B5] dark:text-[#d0bfff] text-left"
                    >
                      <span className="text-[10px] uppercase tracking-wider text-[#6741D9] block mb-0.5">
                        Morfolojik Çözümleme (Cümle #{entry.lineNumber}):
                      </span>
                      <span dir="ltr" className="block text-left leading-relaxed">
                        {splitMixedBidiText(entry.morphologyNote).map(
                          (seg, sIdx) =>
                            seg.isArabic ? (
                              <bdi
                                key={sIdx}
                                dir="rtl"
                                className="arabic font-arabic text-sm font-bold inline-block mx-0.5"
                              >
                                {getDisplayText(seg.text)}
                              </bdi>
                            ) : (
                              <span key={sIdx}>{seg.text}</span>
                            )
                        )}
                      </span>
                    </div>
                  )}

                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs md:text-sm font-medium text-[var(--muted)] border-b border-dashed border-[#E2D3B8] pb-2">
                    {word.mufret && (
                      <span>
                        Müfret:{" "}
                        <strong className="arabic text-base md:text-lg font-arabic font-bold text-[var(--foreground)]">
                          {getDisplayText(word.mufret)}
                        </strong>
                      </span>
                    )}
                    {word.cemi && word.cemi !== "-" && (
                      <span>
                        Cemî:{" "}
                        <strong className="arabic text-base md:text-lg font-arabic font-bold text-[var(--foreground)]">
                          {getDisplayText(word.cemi)}
                        </strong>
                      </span>
                    )}
                    {word.muzari && (
                      <span>
                        Muzâri:{" "}
                        <strong className="arabic text-base md:text-lg font-arabic font-bold text-[var(--foreground)]">
                          {getDisplayText(word.muzari)}
                        </strong>
                      </span>
                    )}
                    {word.masdar && (
                      <span>
                        Masdar:{" "}
                        <strong className="arabic text-base md:text-lg font-arabic font-bold text-[var(--foreground)]">
                          {getDisplayText(word.masdar)}
                        </strong>
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      playClick();
                      speakHybrid({
                        text: mainAr.split("/")[0].trim(),
                        wordId: word.id,
                        rate: speechRate,
                      });
                    }}
                    className="flex-1 h-9 px-3 rounded-xl bg-white dark:bg-[var(--background)] border-2 border-[#E6D7BE] border-b-3 text-xs font-extrabold text-[var(--foreground)] hover:border-[#0CA678] flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Volume2 size={14} className="text-[#0CA678]" />
                    <span>Dinle</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      playClick();
                      const forms = prepareWordForms(word);
                      openShadowingCoach({
                        text:
                          forms?.[0]?.arabic || mainAr.split("/")[0].trim(),
                        forms,
                      });
                    }}
                    className="h-9 px-3 rounded-xl bg-white dark:bg-[var(--background)] border-2 border-[#E6D7BE] border-b-3 text-xs font-extrabold text-[#6741D9] flex items-center justify-center gap-1 cursor-pointer"
                  >
                    <Mic size={14} />
                    <span>Telaffuz</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      playClick();
                      toggleFavoriteWord(word);
                    }}
                    title="Kelime Kartlarıma Ekle"
                    className={`h-9 w-9 rounded-xl border-2 border-b-3 flex items-center justify-center cursor-pointer ${
                      isFavWord
                        ? "bg-red-50 border-red-300 text-red-600"
                        : "bg-white dark:bg-[var(--background)] border-[#E6D7BE] text-[var(--muted)]"
                    }`}
                  >
                    <Heart size={14} fill={isFavWord ? "currentColor" : "none"} />
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      playClick();
                      toggleLearnedWord(word.id);
                    }}
                    title="Öğrendim Olarak İşaretle"
                    className={`h-9 w-9 rounded-xl border-2 border-b-3 flex items-center justify-center cursor-pointer ${
                      isLearned
                        ? "bg-[#6741D9] border-[#5230B5] text-white"
                        : "bg-white dark:bg-[var(--background)] border-[#E6D7BE] text-[var(--muted)]"
                    }`}
                  >
                    <CheckCircle2 size={14} />
                  </button>
                </div>
              </div>
            );
          })}
          </section>
        </div>
      ) : (
        <section className="space-y-2.5">
          {dialogue.satirlar.map((line) => {
            const isPlaying = playingLineId === line.sira;
            const isLooping = loopingLineSira === line.sira;
            const lineHasMp3 = hasMp3(dialogue.id, line.sira);
            const lineAudioUrl = lineHasMp3
              ? getMp3Path(dialogue.id, line.sira)
              : undefined;
            const speakerIdx = speakers.indexOf(line.konusmaci);
            const isUserRoleTurn =
              studyMode === "roleplay" &&
              line.konusmaci === selectedRoleSpeaker;
            const isWaitingUser = roleplayActiveLine === line.sira;
            const isAppSpeakingRoleplay = roleplaySpeakingLine === line.sira;
            const lineRoleplayScore = roleplayLineScores[line.sira];
            const isLineCompletedInRoleplay = Boolean(
              roleplayCompletedLines[line.sira]
            );
            const rawHintLevel = roleplayHintLevels[line.sira] ?? 0;
            // Kademeli İpucu Seviyesi (0: Tam Puslu, 1: İlk Kelime Açık + Kalanı Yarı Puslu, 2: Silik Metin, 3: Tam Açık)
            const effectiveHintLevel =
              !isUserRoleTurn ||
              !hideRoleplayUserText ||
              isLineCompletedInRoleplay
                ? 3
                : rawHintLevel;

            // Rol Yapma modunda kullanıcının kendi repliklerinde Türkçe çeviri her zaman görünür kalır
            const isTrRevealed =
              isUserRoleTurn ||
              (!clickToRevealTr && currentViewMode !== "arabic-only") ||
              revealedTrLines[line.sira];
            const isArRevealed =
              currentViewMode !== "turkish-only" ||
              revealedArLines[line.sira];

            const voiceForLine = getSpeakerVoice(line);

            const renderArabicLineWithHint = () => {
              const formattedSentence = getDisplayText(line.arapca);
              const isPurePhoneOrDigits =
                /^[0-9\u0660-\u0669\s+\-().]+$/.test(
                  formattedSentence.trim()
                ) && /[0-9\u0660-\u0669]/.test(formattedSentence);
              const arWords = formattedSentence.trim().split(/\s+/);
              const firstWord = arWords[0] || "";
              const restWords = arWords.slice(1).join(" ");

              if (effectiveHintLevel === 0) {
                return (
                  <div
                    onClick={() => cycleRoleplayHintLevel(line.sira)}
                    title="1. İpucu (İlk Kelime) için tıklayın"
                    className="blur-md select-none opacity-35 transition-all duration-300 cursor-pointer"
                  >
                    {isPurePhoneOrDigits ? (
                      <span
                        dir="ltr"
                        style={{ direction: "ltr", unicodeBidi: "embed" }}
                        className="inline-block tabular-nums"
                      >
                        {formattedSentence}
                      </span>
                    ) : (
                      formattedSentence
                    )}
                  </div>
                );
              }

              if (effectiveHintLevel === 1) {
                return (
                  <div
                    onClick={() => cycleRoleplayHintLevel(line.sira)}
                    title="2. İpucu (Silik Metin) için tıklayın"
                    className="transition-all duration-300 cursor-pointer"
                  >
                    <span
                      dir={isPurePhoneOrDigits ? "ltr" : undefined}
                      className="blur-0 opacity-100 font-bold text-emerald-700 dark:text-emerald-300"
                    >
                      {firstWord}
                    </span>
                    {restWords && (
                      <>
                        {" "}
                        <span
                          dir={isPurePhoneOrDigits ? "ltr" : undefined}
                          className="blur-[1.5px] opacity-50 select-none transition-all duration-300"
                        >
                          {restWords}
                        </span>
                      </>
                    )}
                  </div>
                );
              }

              if (effectiveHintLevel === 2) {
                return (
                  <div
                    onClick={() => cycleRoleplayHintLevel(line.sira)}
                    title="3. İpucu (Tam Açık Metin) için tıklayın"
                    className="blur-0 opacity-55 transition-all duration-300 cursor-pointer"
                  >
                    {isPurePhoneOrDigits ? (
                      <span
                        dir="ltr"
                        style={{ direction: "ltr", unicodeBidi: "embed" }}
                        className="inline-block tabular-nums"
                      >
                        {formattedSentence}
                      </span>
                    ) : (
                      formattedSentence
                    )}
                  </div>
                );
              }

              const isThisLinePlaying =
                isPlaying ||
                isLooping ||
                isAppSpeakingRoleplay ||
                isWaitingUser;
              const shouldBlurLine =
                blurArabic &&
                !isThisLinePlaying &&
                !unblurredLines[line.sira];

              return (
                <div
                  onClick={() => {
                    if (shouldBlurLine) {
                      playClick();
                      setUnblurredLines((prev) => ({
                        ...prev,
                        [line.sira]: true,
                      }));
                    }
                  }}
                  title={
                    shouldBlurLine
                      ? "Kör Dinleme aktif: Metni netleştirmek için üzerine gelin veya dokunun"
                      : undefined
                  }
                  className={`transition-all duration-300 ${
                    shouldBlurLine
                      ? "blur-md select-none hover:blur-none cursor-pointer"
                      : "blur-0 opacity-100"
                  }`}
                >
                  <WordTooltip
                    text={line.arapca}
                    contextSentenceTr={line.turkce}
                    isLineSpeaking={isPlaying}
                    activeWordIndex={isPlaying ? activeWordIndex : null}
                    activeWordProgress={isPlaying ? activeWordProgress : 0}
                    isClassroomMode={isClassroomMode}
                  />
                </div>
              );
            };

            const isClassroomActiveLine =
              activeClassroomSira === line.sira ||
              isPlaying ||
              isLooping ||
              isWaitingUser ||
              isAppSpeakingRoleplay;

            return (
              <div
                key={line.sira}
                ref={(el) => {
                  lineRefs.current[line.sira] = el;
                }}
                onClick={() => {
                  if (isClassroomMode) {
                    setSelectedClassroomLine(line.sira);
                  }
                }}
                className={`rounded-2xl border-2 border-b-4 transition-all scroll-mt-14 ${
                  isClassroomMode && isClassroomActiveLine
                    ? "ring-4 ring-emerald-500 bg-emerald-50/90 dark:bg-emerald-950/50 border-[#0CA678] shadow-2xl scale-[1.01] p-6 md:p-8"
                    : isWaitingUser
                    ? "border-emerald-500 ring-4 ring-emerald-500/25 bg-emerald-50/60 dark:bg-emerald-950/30 shadow-lg p-3.5"
                    : isAppSpeakingRoleplay || isPlaying || isLooping
                    ? "bg-[#F3F0FF] dark:bg-[var(--lavender-bg)] border-[#6741D9] shadow-md p-3.5"
                    : isUserRoleTurn
                    ? "bg-[#FDFBF7] dark:bg-[var(--background)] border-[#0CA678]/70 p-3.5"
                    : isClassroomMode
                    ? "bg-[#F7EFE1] dark:bg-[var(--surface)] border-[#E6D7BE] dark:border-[var(--border)] p-5 md:p-6"
                    : "bg-[#F7EFE1] dark:bg-[var(--surface)] border-[#E6D7BE] dark:border-[var(--border)] p-3.5"
                } ${
                  isClassroomMode && !isClassroomActiveLine
                    ? spotlightMode
                      ? "opacity-35 hover:opacity-90 transition-opacity cursor-pointer"
                      : "opacity-85 hover:opacity-100 transition-opacity cursor-pointer"
                    : ""
                }`}
              >
                {/* Aktif Cümle Kartının Üstünde Karşı Karakter Dinleme Göstergesi (Rol Yapma Modu) */}
                {studyMode === "roleplay" && isAppSpeakingRoleplay && (
                  <div className="mb-2.5 rounded-xl bg-indigo-600 text-white shadow-md animate-pulse px-3 py-2 flex items-center justify-between gap-2">
                    <span className="text-xs font-extrabold">
                      🔊 Karşı karakter ({line.konusmaci}) konuşuyor. Cümleyi takip edin, birazdan sıra size geçecek...
                    </span>
                  </div>
                )}

                {/* Üst Satır: Konuşmacı Rozeti + Kademeli İpucu & İkon Aksiyon Butonları */}
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-dashed border-[#E2D3B8] dark:border-[var(--border-dashed)] pb-1.5 mb-1.5">
                  <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                    <span
                      className={`px-2.5 py-0.5 rounded-xl text-xs font-extrabold border-b-2 ${
                        speakerIdx % 2 === 0
                          ? "bg-[#0CA678] text-white border-[#087F5B]"
                          : "bg-[#6741D9] text-white border-[#5230B5]"
                      }`}
                    >
                      {line.konusmaci}
                    </span>
                    <span
                      dir="rtl"
                      className="arabic text-base font-bold text-[var(--muted)]"
                    >
                      ({line.konusmaci_ar})
                    </span>
                    {isUserRoleTurn && (
                      <span className="text-[11px] font-extrabold text-[#087F5B] dark:text-[#20c997]">
                        · Sizin Rolünüz
                      </span>
                    )}
                    {lineRoleplayScore !== undefined && (
                      <span
                        className={`px-2 py-0.5 rounded-lg border text-[11px] font-extrabold tabular-nums ${
                          lineRoleplayScore >= 70
                            ? "bg-[#0CA678]/15 border-[#0CA678] text-[#087F5B] dark:text-[#20c997]"
                            : lineRoleplayScore > 0
                            ? "bg-amber-100 dark:bg-amber-950/60 border-amber-400 text-amber-800 dark:text-amber-200"
                            : "bg-rose-100 dark:bg-rose-950/60 border-rose-400 text-rose-800 dark:text-rose-200"
                        }`}
                      >
                        %{lineRoleplayScore}{" "}
                        {lineRoleplayScore === 0
                          ? "(Okunmadı / Ses Yok)"
                          : "Telaffuz"}
                      </span>
                    )}
                  </div>

                  {/* Aksiyon Kontrolleri + Rol Yapma Kademeli İpucu (💡 İpucu) Butonu */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    {isUserRoleTurn && hideRoleplayUserText && !isLineCompletedInRoleplay && (
                      <button
                        type="button"
                        onClick={() => cycleRoleplayHintLevel(line.sira)}
                        title="Kademeli İpucu: 1. Tık İlk Kelime -> 2. Tık Silik Metin -> 3. Tık Tam Açık"
                        className={`text-xs px-2 py-1 rounded-xl border-2 border-b-3 font-extrabold inline-flex items-center gap-1 transition-all cursor-pointer ${
                          rawHintLevel > 0
                            ? "bg-amber-100 dark:bg-amber-950/60 border-amber-400 text-amber-900 dark:text-amber-200"
                            : "bg-white dark:bg-[var(--background)] border-[#E6D7BE] dark:border-[var(--border)] text-[#6741D9] hover:border-[#6741D9]"
                        }`}
                      >
                        <span>
                          💡 İpucu
                          {rawHintLevel > 0 ? ` (${rawHintLevel}/3)` : ""}
                        </span>
                      </button>
                    )}

                    {/* 🔊 Doğal Sesle Dinle */}
                    <button
                      type="button"
                      onClick={() =>
                        studyMode === "roleplay" && isWaitingUser
                          ? handlePlayRoleplayModelAudio(line)
                          : handlePlayLine(line)
                      }
                      className={`group relative w-9 h-9 rounded-xl border-2 border-b-3 inline-flex items-center justify-center transition-all cursor-pointer ${
                        isPlaying && !isLooping
                          ? "bg-[#0CA678] border-[#087F5B] text-white animate-pulse"
                          : "bg-white dark:bg-[var(--background)] border-[#E6D7BE] dark:border-[var(--border)] text-[var(--foreground)] hover:border-[#0CA678]"
                      }`}
                      title="Doğal Sesle Dinle"
                      aria-label="Doğal Sesle Dinle"
                    >
                      <Volume2
                        size={15}
                        className={
                          isPlaying && !isLooping
                            ? "text-white"
                            : "text-[#0CA678]"
                        }
                      />
                      <span className="pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-lg bg-[#2b241d] px-2.5 py-1 text-[10px] font-bold text-white opacity-0 group-hover:opacity-100 group-focus:opacity-100 transition-opacity z-50 shadow-md">
                        Doğal Sesle Dinle
                      </span>
                    </button>

                    {/* 🔁 Cümleyi Döngüde Tekrarla */}
                    <button
                      type="button"
                      onClick={() => handleToggleLoopLine(line)}
                      className={`group relative h-9 min-w-9 px-2 rounded-xl border-2 border-b-3 inline-flex items-center justify-center gap-1 transition-all cursor-pointer ${
                        isLooping
                          ? "bg-[#6741D9] border-[#5230B5] text-white"
                          : "bg-white dark:bg-[var(--background)] border-[#E6D7BE] dark:border-[var(--border)] text-[var(--muted)] hover:text-[#6741D9] hover:border-[#6741D9]"
                      }`}
                      title="Cümleyi Döngüde Tekrarla (800ms es ile)"
                      aria-label="Cümleyi Döngüde Tekrarla"
                    >
                      <Repeat
                        size={14}
                        className={isLooping ? "animate-spin" : ""}
                      />
                      {isLooping && sentenceLoopRemaining !== null && (
                        <span className="text-[10px] font-black tabular-nums">
                          {sentenceLoopRemaining === "infinite"
                            ? "∞"
                            : `${sentenceLoopRemaining}x`}
                        </span>
                      )}
                      <span className="pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-lg bg-[#2b241d] px-2.5 py-1 text-[10px] font-bold text-white opacity-0 group-hover:opacity-100 group-focus:opacity-100 transition-opacity z-50 shadow-md">
                        Cümleyi Tekrarla
                      </span>
                    </button>

                    {/* 🎤 Kaydet / ▶️ Kaydımı Dinle / ✨ Yapay Zeka Koçu (ShadowingButton) */}
                    {shouldShowShadowingButton && (
                      <div
                        onClick={() => {
                          if (currentViewMode === "turkish-only") {
                            setRevealedArLines((prev) => ({
                              ...prev,
                              [line.sira]: true,
                            }));
                          }
                        }}
                      >
                        <ShadowingButton
                          text={line.arapca}
                          onOpenCoach={() => {
                            if (currentViewMode === "turkish-only") {
                              setRevealedArLines((prev) => ({
                                ...prev,
                                [line.sira]: true,
                              }));
                            }
                            openShadowingCoach({
                              text: line.arapca,
                              audioUrl: lineAudioUrl,
                              voice: voiceForLine,
                            });
                          }}
                        />
                      </div>
                    )}
                  </div>
                </div>

                {/* CÜMLE İÇERİĞİ (Sıkılaştırılmış Dikey Boşluklar py-1.5; Sınıf Modunda Gerçek Inline Font Çarpanı) */}
                {currentViewMode === "columns" && !clickToRevealTr ? (
                  <div className="md:grid md:grid-cols-2 md:gap-5 items-center space-y-1.5 md:space-y-0">
                    <div
                      dir="ltr"
                      className="order-2 md:order-1 bg-white/70 dark:bg-[var(--background)]/60 rounded-xl px-3 py-2 border border-[#E6D7BE] dark:border-[var(--border)]"
                    >
                      <p
                        style={{
                          fontSize: isClassroomMode
                            ? `${Math.max(
                                22,
                                Math.round(turkishFontSize * (classroomScale * 0.9))
                              )}px`
                            : `${turkishFontSize}px`,
                        }}
                        className={`text-[var(--muted)] ${
                          isClassroomMode ? "font-medium leading-relaxed" : "font-semibold leading-snug"
                        }`}
                      >
                        {line.turkce}
                      </p>
                    </div>

                    <div
                      dir="rtl"
                      style={{
                        fontSize: isClassroomMode
                          ? `${Math.max(
                              44,
                              Math.round(arabicFontSize * classroomScale)
                            )}px`
                          : `calc(${arabicFontSize}px * var(--font-arabic-scale, 1))`,
                        lineHeight: isClassroomMode ? 2.1 : undefined,
                      }}
                      className="order-1 md:order-2 arabic font-bold text-[var(--foreground)] text-right py-1.5"
                    >
                      {renderArabicLineWithHint()}
                    </div>
                  </div>
                ) : (
                  <>
                    {currentViewMode === "turkish-only" && (
                      <div
                        dir="ltr"
                        className="mb-1.5 pb-1.5 border-b border-dashed border-[#E2D3B8] dark:border-[var(--border-dashed)]"
                      >
                        <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#6741D9] block mb-0.5">
                          Türkçe Anlamdan Arapçasını Hatırlayın:
                        </span>
                        <p
                          style={{
                            fontSize: isClassroomMode
                              ? `${Math.max(
                                  22,
                                  Math.round(turkishFontSize * (classroomScale * 0.9))
                                )}px`
                              : `${turkishFontSize}px`,
                          }}
                          className="text-[var(--foreground)] font-bold leading-snug"
                        >
                          “{line.turkce}”
                        </p>
                      </div>
                    )}

                    {isArRevealed ? (
                      <div
                        dir="rtl"
                        style={{
                          fontSize: isClassroomMode
                            ? `${Math.max(
                                44,
                                Math.round(arabicFontSize * classroomScale)
                              )}px`
                            : `calc(${arabicFontSize}px * var(--font-arabic-scale, 1))`,
                          lineHeight: isClassroomMode ? 2.1 : undefined,
                        }}
                        className="arabic font-bold text-[var(--foreground)] text-right py-1.5"
                      >
                        {renderArabicLineWithHint()}
                      </div>
                    ) : (
                      <div className="flex items-center justify-between gap-3 bg-white/80 dark:bg-[var(--background)] rounded-xl p-2 border border-[#E6D7BE]">
                        <span
                          dir="rtl"
                          className="arabic text-2xl font-bold text-[var(--muted)] blur-xs select-none"
                        >
                          {getDisplayText(line.arapca)}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            playClick();
                            setRevealedArLines((prev) => ({
                              ...prev,
                              [line.sira]: true,
                            }));
                          }}
                          className="inline-flex items-center gap-1.5 text-xs font-extrabold text-white bg-[#0CA678] hover:bg-[#099268] px-3 py-1.5 rounded-xl border-b-2 border-[#087F5B] shrink-0 cursor-pointer"
                        >
                          <Eye size={13} />
                          <span>Arapçasını Göster</span>
                        </button>
                      </div>
                    )}

                    {currentViewMode !== "turkish-only" && (
                      <div
                        dir="ltr"
                        className="mt-1.5 pt-1.5 border-t border-dashed border-[#E2D3B8] dark:border-[var(--border-dashed)] min-h-[30px] flex items-center"
                      >
                        {isTrRevealed ? (
                          <p
                            style={{
                              fontSize: isClassroomMode
                                ? `${Math.max(
                                    22,
                                    Math.round(
                                      turkishFontSize * (classroomScale * 0.9)
                                    )
                                  )}px`
                                : `${turkishFontSize}px`,
                            }}
                            className={`text-[var(--muted)] ${
                              isClassroomMode
                                ? "font-medium leading-relaxed"
                                : "font-semibold leading-snug"
                            }`}
                          >
                            {line.turkce}
                          </p>
                        ) : (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              playClick();
                              setRevealedTrLines((prev) => ({
                                ...prev,
                                [line.sira]: true,
                              }));
                            }}
                            className="inline-flex items-center gap-1.5 text-xs font-bold text-[#087F5B] bg-white dark:bg-[var(--background)] px-3 py-1 rounded-xl border border-[#E6D7BE] hover:border-[#0CA678] cursor-pointer"
                          >
                            <Eye size={13} className="shrink-0" />
                            <span>Türkçe Çeviriyi Göster</span>
                          </button>
                        )}
                      </div>
                    )}
                  </>
                )}

                {/* CÜMLELER ARASI GÖLGELEME BOŞLUĞU: "ŞİMDİ TEKRAR EDİN" GERİ SAYIM ÇUBUĞU */}
                {isShadowingPause && shadowingPauseLineSira === line.sira && (
                  <div className="mt-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border-2 border-[#0CA678] px-3 py-2 space-y-1.5 animate-in fade-in duration-150">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-extrabold text-[#087F5B] dark:text-[#20c997] flex items-center gap-1.5">
                        <span>🎙️ Şimdi yüksek sesle tekrar edin...</span>
                      </span>
                      <span className="text-[11px] font-extrabold text-[#087F5B] dark:text-emerald-300 tabular-nums">
                        {((shadowingPauseMs * shadowingPauseRemainingPct) / 100000).toFixed(1)} sn
                      </span>
                    </div>
                    <div className="w-full h-1.5 rounded-full bg-emerald-200/70 dark:bg-emerald-900 overflow-hidden">
                      <div
                        className="h-full bg-[#0CA678] rounded-full transition-none"
                        style={{ width: `${shadowingPauseRemainingPct}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* TEKİL VE İNTERAKTİF ROL YAPMA KONTROL PANELİ (Canlı Ses Dalgası + Gerçek Mikrofon Puanlaması) */}
                {isWaitingUser && (
                  <div className="mt-2.5 p-3 rounded-xl bg-emerald-50/95 dark:bg-emerald-950/75 border-2 border-[#0CA678] shadow-md space-y-2.5 animate-in fade-in duration-150">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-ping shrink-0" />
                        <span className="text-xs sm:text-sm font-extrabold text-[#087F5B] dark:text-emerald-200">
                          🎙️ SIRA SİZDE! Şimdi repliğinizi sesli okuyun...
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => void finishUserRoleplayTurn(line, false)}
                          className="text-xs px-3 py-1.5 rounded-xl bg-[#0CA678] hover:bg-[#099268] text-white font-extrabold border-b-2 border-[#087F5B] flex items-center gap-1 cursor-pointer shadow-xs"
                        >
                          <span>✅ Okudum (Bitir)</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => void finishUserRoleplayTurn(line, true)}
                          className="text-xs px-2.5 py-1.5 rounded-xl bg-white dark:bg-slate-800 hover:bg-rose-50 border border-rose-300 dark:border-rose-700 text-rose-700 dark:text-rose-300 font-extrabold cursor-pointer"
                        >
                          ⏭️ Atla
                        </button>
                        {hideRoleplayUserText && !isLineCompletedInRoleplay && (
                          <button
                            type="button"
                            onClick={() => cycleRoleplayHintLevel(line.sira)}
                            className="text-xs px-2 py-1.5 rounded-xl bg-amber-100 hover:bg-amber-200 border border-amber-400 text-amber-900 font-extrabold cursor-pointer"
                          >
                            💡 İpucu{rawHintLevel > 0 ? ` (${rawHintLevel}/3)` : ""}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => void handlePlayRoleplayModelAudio(line)}
                          className="text-xs px-2 py-1.5 rounded-xl bg-white dark:bg-slate-800 hover:bg-emerald-100 border border-emerald-400 text-emerald-800 dark:text-emerald-200 font-extrabold cursor-pointer"
                        >
                          🔊 Dinle
                        </button>
                      </div>
                    </div>

                    {/* Canlı Mikrofon Ses Dalgası + Algılanan Konuşma Metni */}
                    <div className="flex items-center gap-2.5 bg-white/90 dark:bg-slate-900/90 rounded-xl px-3 py-2 border border-[#0CA678]/40">
                      <div className="flex items-end gap-0.5 h-6 w-32 sm:w-44 shrink-0">
                        {roleplayLiveBars.map((barVal, bIdx) => (
                          <span
                            key={bIdx}
                            style={{
                              height: `${Math.max(16, Math.round(barVal * 100))}%`,
                            }}
                            className={`flex-1 rounded-full transition-all duration-75 ${
                              barVal > 0.14
                                ? "bg-[#0CA678]"
                                : "bg-[#6741D9]/60"
                            }`}
                          />
                        ))}
                      </div>

                      <div className="flex-1 min-w-0 flex items-center justify-between gap-2">
                        {roleplayInterimText ? (
                          <span
                            dir="rtl"
                            className="arabic text-sm sm:text-base font-bold text-[#087F5B] dark:text-emerald-300 truncate"
                          >
                            {roleplayInterimText}
                          </span>
                        ) : (
                          <span className="text-[11px] font-bold text-[var(--muted)] truncate">
                            {roleplayMicLevel > 0.08
                              ? "Sesiniz algılanıyor..."
                              : "Mikrofon açık, konuşmanızı bekliyor..."}
                          </span>
                        )}
                        <span className="text-[11px] font-extrabold text-[#087F5B] dark:text-emerald-300 tabular-nums shrink-0">
                          {((roleplayWaitDurationMs * roleplayRemainingPct) / 100000).toFixed(1)} sn
                        </span>
                      </div>
                    </div>

                    {/* Bekleme Süresince İlerleyen İnce Geri Sayım Çubuğu */}
                    <div className="w-full h-1.5 bg-emerald-200/80 dark:bg-emerald-900 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-[#0CA678] transition-none rounded-full"
                        style={{ width: `${roleplayRemainingPct}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </section>
      )}

      {/* AKILLI TAHTA & SINIF MODU ALT SUNUM KUMANDASI (Sticky Bottom Presentation Remote) */}
      {isClassroomMode && studyMode !== "vocabulary" && activeClassroomLineObj && (
        <div
          aria-label="Sınıf Modu Alt Sunum Kumandası"
          className="sticky bottom-4 z-40 mx-auto w-fit max-w-full overflow-x-auto rounded-2xl bg-slate-900/95 dark:bg-slate-950/95 backdrop-blur-md text-white border-2 border-emerald-500/70 border-b-4 px-4 py-2.5 shadow-2xl flex items-center justify-center gap-2 md:gap-3 flex-nowrap whitespace-nowrap"
        >
          {/* 1. Önceki */}
          <button
            type="button"
            disabled={activeClassroomLineIndex <= 0}
            onClick={() => {
              playClick();
              if (isPlayingAll || playingLineId !== null) {
                playToken.current += 1;
                stop();
                setIsPlayingAll(false);
              }
              const prevObj =
                dialogue.satirlar[Math.max(0, activeClassroomLineIndex - 1)];
              if (prevObj) {
                setSelectedClassroomLine(prevObj.sira);
              }
            }}
            className="px-3 py-2 rounded-xl bg-white/15 hover:bg-white/25 disabled:opacity-40 text-xs sm:text-sm font-extrabold flex items-center gap-1.5 shrink-0 cursor-pointer transition-all"
          >
            <span>⏮️ Önceki</span>
          </button>

          {/* 2. Ortada Sayaç Rozeti [1 / 9] */}
          <span
            title={`Cümle ${activeClassroomLineIndex + 1} / ${dialogue.satirlar.length}`}
            className="px-3 py-1.5 rounded-xl bg-emerald-500/20 border border-emerald-400/40 text-emerald-200 text-xs sm:text-sm font-black tabular-nums shrink-0"
          >
            {activeClassroomLineIndex + 1} / {dialogue.satirlar.length}
          </span>

          {/* 3. Cümleyi Dinle (Aktifse Durdur) */}
          <button
            type="button"
            onClick={() => handlePlaySingleClassroomLine(activeClassroomLineObj)}
            title="Sadece seçili cümleyi seslendirir ve durur (Kısayol: Space)"
            className={`px-3.5 py-2 rounded-xl text-xs sm:text-sm font-black border-b-2 flex items-center gap-1.5 shrink-0 cursor-pointer transition-all ${
              !isPlayingAll && playingLineId === activeClassroomLineObj.sira
                ? "bg-red-600 hover:bg-red-700 border-red-800 text-white"
                : "bg-emerald-600 hover:bg-emerald-500 border-emerald-800 text-white"
            }`}
          >
            <span>
              {!isPlayingAll && playingLineId === activeClassroomLineObj.sira
                ? "⏹️ Durdur"
                : "🔊 Cümleyi Dinle"}
            </span>
          </button>

          {/* 4. Tümünü Oynat (Aktifse Duraklat) */}
          <button
            type="button"
            onClick={() => handleToggleClassroomPlayAll(activeClassroomLineObj)}
            title="Seçili cümleden itibaren tüm diyaloğu sırayla oynatır (Kısayol: Shift+Space veya P)"
            className={`px-3.5 py-2 rounded-xl text-xs sm:text-sm font-black border-b-2 flex items-center gap-1.5 shrink-0 cursor-pointer transition-all ${
              isPlayingAll
                ? "bg-amber-500 hover:bg-amber-600 border-amber-700 text-slate-950"
                : "bg-teal-600 hover:bg-teal-500 border-teal-800 text-white"
            }`}
          >
            <span>
              {isPlayingAll ? "⏸️ Duraklat" : "▶️ Tümünü Oynat"}
            </span>
          </button>

          {/* 5. Telaffuz Et */}
          <button
            type="button"
            onClick={() => {
              playClick();
              const lineHasMp3 = hasMp3(
                dialogue.id,
                activeClassroomLineObj.sira
              );
              const lineAudioUrl = lineHasMp3
                ? getMp3Path(dialogue.id, activeClassroomLineObj.sira)
                : undefined;
              openShadowingCoach({
                text: activeClassroomLineObj.arapca,
                audioUrl: lineAudioUrl,
                voice: getSpeakerVoice(activeClassroomLineObj),
              });
            }}
            className="px-3.5 py-2 rounded-xl bg-[#6741D9] hover:bg-[#5230B5] border-b-2 border-indigo-900 text-white text-xs sm:text-sm font-extrabold flex items-center gap-1.5 shrink-0 cursor-pointer transition-all"
          >
            <span>🎙️ Telaffuz Et</span>
          </button>

          {/* 6. Sonraki */}
          <button
            type="button"
            disabled={activeClassroomLineIndex >= dialogue.satirlar.length - 1}
            onClick={() => {
              playClick();
              if (isPlayingAll || playingLineId !== null) {
                playToken.current += 1;
                stop();
                setIsPlayingAll(false);
              }
              const nextObj =
                dialogue.satirlar[
                  Math.min(
                    dialogue.satirlar.length - 1,
                    activeClassroomLineIndex + 1
                  )
                ];
              if (nextObj) {
                setSelectedClassroomLine(nextObj.sira);
              }
            }}
            className="px-3 py-2 rounded-xl bg-white/15 hover:bg-white/25 disabled:opacity-40 text-xs sm:text-sm font-extrabold flex items-center gap-1.5 shrink-0 cursor-pointer transition-all"
          >
            <span>⏭️ Sonraki</span>
          </button>
        </div>
      )}

      {/* DİYALOG CÜMLELERİNİN ALTINDAKİ KALIP İFADELER KART BÖLÜMÜ (Dinle/Telaffuz/Rol Yapma Modlarında) */}
      {studyMode !== "vocabulary" && dialogueIdioms.length > 0 && (
        <section className="rounded-2xl bg-[#F7EFE1] dark:bg-[var(--surface)] border-2 border-[#E6D7BE] dark:border-[var(--border)] border-b-4 p-3.5 sm:p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-dashed border-[#E2D3B8] dark:border-[var(--border-dashed)] pb-2">
            <h2 className="text-xs sm:text-sm font-extrabold text-[var(--foreground)] flex items-center gap-1.5 flex-wrap">
              <span>✨ Bu Diyalogdaki Kalıp İfadeler</span>
              <bdi
                dir="rtl"
                className="arabic font-arabic text-base text-[#087F5B] dark:text-[#20c997]"
              >
                (التعبيرات الاصطلاحية)
              </bdi>
            </h2>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="px-2 py-0.5 rounded-lg bg-[#6741D9]/15 text-[#6741D9] dark:text-[#d0bfff] text-[11px] font-extrabold">
                {dialogueIdioms.length} Kalıp İfade
              </span>
              <Link
                href={`/alistirmalar?source=idioms&dialogueId=${dialogue.id}`}
                onClick={() => playClick()}
                className="px-2.5 py-1 rounded-xl bg-[#6741D9] hover:bg-[#5230B5] text-white border-b-2 border-[#3b1f8c] text-xs font-extrabold flex items-center gap-1 transition-all cursor-pointer shrink-0"
              >
                <span>🎯 Alıştırma Yap</span>
              </Link>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            {dialogueIdioms.map((idm) => {
              const hasPoliteOrAltVariant =
                Boolean(idm.matchedPhrase) &&
                normalizeForIdiomMatch(idm.matchedPhrase || "") !==
                  normalizeForIdiomMatch(idm.arabic);
              const primaryAr: string =
                hasPoliteOrAltVariant && idm.matchedPhrase
                  ? idm.matchedPhrase
                  : idm.arabic;

              return (
                <div
                  key={idm.id}
                  className="rounded-xl bg-white dark:bg-slate-900/90 border border-[#E6D7BE] dark:border-slate-700 border-l-4 border-l-[#6741D9] dark:border-l-indigo-500 p-3 flex flex-col justify-between gap-2"
                >
                  <div className="space-y-1">
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-[10px] font-extrabold text-[#6741D9] dark:text-indigo-200 bg-[#F3F0FF] dark:bg-indigo-950/80 border border-[#6741D9]/25 dark:border-indigo-500/40 px-2 py-0.5 rounded-md">
                        Cümle #{idm.lineNumber} • {idm.level || dialogue.seviye}
                      </span>
                      <span
                        dir="rtl"
                        className="arabic font-arabic text-xl sm:text-2xl font-bold text-[#087F5B] dark:text-[#20c997] text-right leading-snug"
                      >
                        {getDisplayText(primaryAr)}
                      </span>
                    </div>
                    {hasPoliteOrAltVariant && (
                      <div className="flex items-center justify-end gap-1.5 text-[11px] font-bold text-[#6741D9] dark:text-indigo-300 bg-[#F3F0FF]/80 dark:bg-indigo-950/50 px-2 py-0.5 rounded-lg border border-[#6741D9]/20">
                        <span>💡 Kibar / Alternatif Kullanım:</span>
                        <bdi
                          dir="rtl"
                          className="arabic font-arabic text-sm sm:text-base font-bold text-[#087F5B] dark:text-[#20c997]"
                        >
                          {getDisplayText(idm.arabic)}
                        </bdi>
                      </div>
                    )}
                    <p className="text-xs sm:text-sm font-extrabold text-[var(--foreground)] dark:text-slate-100">
                      {idm.meaningTr}
                    </p>
                    <p className="text-[11px] font-medium text-[var(--muted)] dark:text-slate-300 leading-snug">
                      💡 {idm.usageNote}
                    </p>
                  </div>

                  <div className="flex items-center gap-1.5 pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        playClick();
                        void speakHybrid({
                          text: primaryAr,
                          rate: speechRate,
                        });
                      }}
                      className="flex-1 h-8 px-2.5 rounded-xl bg-[#F7EFE1] dark:bg-slate-800 hover:border-[#0CA678] border border-[#E6D7BE] dark:border-slate-600 text-[11px] font-extrabold text-[var(--foreground)] dark:text-slate-100 flex items-center justify-center gap-1 cursor-pointer"
                    >
                      <Volume2 size={13} className="text-[#0CA678]" />
                      <span>🔊 Dinle</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        playClick();
                        openShadowingCoach({
                          text: primaryAr,
                        });
                      }}
                      className="flex-1 h-8 px-2.5 rounded-xl bg-[#F3F0FF] dark:bg-indigo-950/85 hover:bg-[#e8e2ff] dark:hover:bg-indigo-900/80 border border-[#6741D9]/50 dark:border-indigo-500 text-[11px] font-extrabold text-[#6741D9] dark:text-indigo-200 flex items-center justify-center gap-1 cursor-pointer"
                    >
                      <Mic size={13} />
                      <span>🎙️ Telaffuz Et</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* BÖLÜM 5: ALT TAMAMLAMA CTA, BAŞARI KARTI PAYLAŞIMI VE ÖNCEKİ/SONRAKİ DİYALOG GEÇİŞİ */}
      <section className="space-y-3 pt-2">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          <button
            type="button"
            onClick={handleCompleteAndContinue}
            className="sm:col-span-2 py-3.5 px-5 bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-600 text-white font-bold text-sm sm:text-base rounded-2xl border-b-4 border-emerald-800 active:border-b-0 active:translate-y-1 transition-all flex items-center justify-center gap-2.5 shadow-sm cursor-pointer"
          >
            <CheckCircle2 size={20} className="shrink-0 w-5 h-5" />
            <span>
              {isCompleted
                ? nextDialogue
                  ? `Sonraki Diyaloğa Geç (${nextDialogue.baslik_tr})`
                  : "Diyalog Kütüphanesine Dön"
                : nextDialogue
                ? `Diyaloğu Tamamla ve Sonrakine Geç (${nextDialogue.baslik_tr})`
                : "Diyaloğu Tamamlandı Olarak İşaretle"}
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              playClick();
              if (!isCompleted) {
                toggleCompletedDialogue(dialogue.id);
              }
              setIsShareModalOpen(true);
            }}
            className="py-3.5 px-4 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white font-extrabold text-xs sm:text-sm rounded-2xl border-b-4 border-amber-800 active:border-b-0 active:translate-y-1 transition-all flex items-center justify-center gap-2 shadow-sm cursor-pointer"
          >
            <Share2 size={17} className="shrink-0" />
            <span>🏆 Başarı Kartını Paylaş / İndir</span>
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {prevDialogue ? (
            <Link
              href={`/diyalog/${prevDialogue.id}`}
              onClick={() => playClick()}
              className="w-full p-3 rounded-2xl bg-[#F7EFE1] dark:bg-[var(--surface)] border-2 border-[#E6D7BE] dark:border-[var(--border)] border-b-4 flex items-center gap-2.5 text-xs font-extrabold text-[var(--foreground)] hover:border-[#0CA678] transition-all"
            >
              <ChevronLeft size={18} className="text-[#087F5B] shrink-0" />
              <div className="min-w-0 flex-1">
                <span className="block text-[10px] text-slate-600 dark:text-slate-300 uppercase">
                  Önceki Diyalog
                </span>
                <span className="truncate block">{prevDialogue.baslik_tr}</span>
              </div>
            </Link>
          ) : (
            <div className="hidden sm:block" />
          )}

          {nextDialogue ? (
            <Link
              href={`/diyalog/${nextDialogue.id}`}
              onClick={() => playClick()}
              className="w-full p-3 rounded-2xl bg-[#F7EFE1] dark:bg-[var(--surface)] border-2 border-[#E6D7BE] dark:border-[var(--border)] border-b-4 flex items-center justify-end gap-2.5 text-xs font-extrabold text-[var(--foreground)] hover:border-[#0CA678] transition-all text-right"
            >
              <div className="min-w-0 flex-1">
                <span className="block text-[10px] text-slate-600 dark:text-slate-300 uppercase">
                  Sonraki Diyalog
                </span>
                <span className="truncate block">{nextDialogue.baslik_tr}</span>
              </div>
              <ChevronRight size={18} className="text-[#087F5B] shrink-0" />
            </Link>
          ) : (
            <div className="hidden sm:block" />
          )}
        </div>
      </section>
    </div>
  );
}