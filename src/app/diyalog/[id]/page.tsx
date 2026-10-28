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
} from "lucide-react";
import { diyaloglar, getDialogueById } from "@/lib/data";
import {
  loadAudioManifest,
  hasMp3,
  getMp3Path,
  VoiceOption,
  speakHybrid,
} from "@/lib/audio";
import { useAudioStore } from "@/store/audioStore";
import { useSettings, ViewMode, WordTrackingStyle } from "@/store/settings";
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
import {
  getDialogueVocabulary,
  DialogueVocabularyEntry,
  getWordCategory,
} from "@/lib/dict";
import { DialogueLine, DictionaryItem } from "@/types/data";
import {
  start16kHzRecorder,
  RecordingSession16kHz,
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
  const [flowMode, setFlowMode] = useState<FlowMode>("single");
  const [isPlayingAll, setIsPlayingAll] = useState(false);
  const [dialogueLoopTurn, setDialogueLoopTurn] = useState<number>(1);
  const [loopingLineSira, setLoopingLineSira] = useState<number | null>(null);
  const [sentenceLoopRemaining, setSentenceLoopRemaining] = useState<
    number | "infinite" | null
  >(null);
  const [autoShadowingFlow, setAutoShadowingFlow] = useState<boolean>(false);

  // Lightbox (Kapak Görseli Büyütme), PDF Modal ve "⋯" Diğer Menüsü State
  const [isLightboxOpen, setIsLightboxOpen] = useState<boolean>(false);
  const [isPdfModalOpen, setIsPdfModalOpen] = useState<boolean>(false);
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState<boolean>(false);
  const moreMenuRef = useRef<HTMLDivElement | null>(null);

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
  const [roleplayTransitionNotice, setRoleplayTransitionNotice] =
    useState<boolean>(false);
  const [roleplayMicLevel, setRoleplayMicLevel] = useState<number>(0);
  const [roleplayInterimText, setRoleplayInterimText] = useState<string>("");
  const [roleplayLineScores, setRoleplayLineScores] = useState<
    Record<number, number>
  >({});
  const [roleplayCompletedBanner, setRoleplayCompletedBanner] =
    useState<boolean>(false);

  // Gölgeleme Modal State
  const [shadowingTarget, setShadowingTarget] = useState<{
    text: string;
    audioUrl?: string;
    voice?: VoiceOption;
    forms?: { label: string; arabic: string }[];
  } | null>(null);

  const playToken = useRef(0);
  const lineRefs = useRef<{ [key: number]: HTMLDivElement | null }>({});
  const roleplayRecorderRef = useRef<RecordingSession16kHz | null>(null);
  const roleplaySpeechRef = useRef<HybridSpeechManager | null>(null);
  const roleplayFinishingRef = useRef<boolean>(false);

  const cleanupRoleplayMic = () => {
    if (roleplayRecorderRef.current) {
      try {
        roleplayRecorderRef.current.killStreamImmediately();
        roleplayRecorderRef.current.stop().catch(() => {});
      } catch {
        // ignore
      }
      roleplayRecorderRef.current = null;
    }
    roleplaySpeechRef.current?.stopLiveWebSpeech();
    setRoleplayMicLevel(0);
    setRoleplayInterimText("");
  };

  useEffect(() => {
    setMounted(true);
    roleplaySpeechRef.current = new HybridSpeechManager();
    loadAudioManifest().then(() => setManifestLoaded(true));
    return () => {
      playToken.current += 1;
      stop();
      cleanupRoleplayMic();
      roleplaySpeechRef.current?.terminate();
      void releaseAllWakeLocks();
    };
  }, [stop]);

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
    const targetLine = roleplayActiveLine ?? roleplaySpeakingLine ?? playingLineId;
    if (targetLine !== null && lineRefs.current[targetLine]) {
      lineRefs.current[targetLine]?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }
  }, [playingLineId, roleplayActiveLine, roleplaySpeakingLine]);

  if (!dialogue) return notFound();

  const currentIndex = diyaloglar.findIndex((d) => d.id === dialogue.id);
  const prevDialogue = currentIndex > 0 ? diyaloglar[currentIndex - 1] : null;
  const nextDialogue =
    currentIndex < diyaloglar.length - 1 ? diyaloglar[currentIndex + 1] : null;

  const dialogueVocabEntries: DialogueVocabularyEntry[] = getDialogueVocabulary(
    dialogue.id
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

  // --- OTOMATİK ROL YAPMA MİKROFON BAŞLATICI VE SIFIR GECİKMELİ SIRA GEÇİŞİ ---
  const activateUserRoleplayTurn = async (line: DialogueLine) => {
    cleanupRoleplayMic();
    roleplayFinishingRef.current = false;
    setRoleplayTransitionNotice(false);
    setRoleplaySpeakingLine(null);
    setRoleplayActiveLine(line.sira);
    setIsPlayingAll(false);
    playRecordStart();

    // Cümle uzunluğuna göre maksimum kayıt süresini sınırla (4.5sn - 10sn)
    const wordCount = line.arapca.trim().split(/\s+/).length;
    const maxDurationMs = Math.min(10000, Math.max(4500, wordCount * 900 + 2500));

    try {
      roleplaySpeechRef.current?.startLiveWebSpeech({
        onInterimTranscript: (interim) => {
          setRoleplayInterimText(interim);
        },
      });

      const session = await start16kHzRecorder({
        silenceDurationMs: 1000, // 1 saniye sessizlikte anında sıra geçişi
        maxDurationMs,
        onLiveRms: (rms) => {
          setRoleplayMicLevel(Math.min(100, Math.round(rms * 320)));
        },
        onAutoSilenceStop: () => {
          finishUserRoleplayTurn(line);
        },
      });
      roleplayRecorderRef.current = session;
    } catch {
      // Mikrofon izni yoksa manuel "Okudum, Sıradakine Geç" butonuna basılabilir
    }
  };

  const finishUserRoleplayTurn = (line: DialogueLine) => {
    if (roleplayFinishingRef.current) return;
    roleplayFinishingRef.current = true;

    playRecordStop();

    // a) İLK İŞ: Mikrofon stream track'lerini ANINDA kapat ve SpeechRecognition'ı abort/stop ile sonlandır
    const activeSession = roleplayRecorderRef.current;
    roleplayRecorderRef.current = null;
    if (activeSession) {
      activeSession.killStreamImmediately();
    }
    const capturedTranscript =
      roleplaySpeechRef.current?.stopLiveWebSpeech() || "";

    setRoleplayMicLevel(0);
    setRoleplayInterimText("");
    setRoleplayActiveLine(null);
    setRoleplayTransitionNotice(true);
    setRoleplayCompletedLines((prev) => ({ ...prev, [line.sira]: true }));
    setRoleplayHintLevels((prev) => ({ ...prev, [line.sira]: 3 }));

    // b) ASENKRON PUANLAMA: Sıra geçişini bloklamadan arka planda çalıştır
    Promise.resolve().then(async () => {
      let peakRms = 0;
      if (activeSession) {
        try {
          const rec = await activeSession.stop();
          if (rec.rmsHistory.length > 0) {
            peakRms = Math.max(...rec.rmsHistory);
          }
        } catch {
          // ignore
        }
      }
      const evalRes = evaluateSentenceWords(
        line.arapca,
        capturedTranscript || line.arapca
      );
      const computedScore = capturedTranscript.trim()
        ? Math.max(68, evalRes.overallScore)
        : peakRms > 0.05
        ? 86
        : 82;
      setRoleplayLineScores((prev) => ({
        ...prev,
        [line.sira]: computedScore,
      }));
      recordPronunciationScore(computedScore);
    });

    // c) ANINDA SONRAKİ REPLİK (250ms <= 300ms): Beklemeden sıradaki diyalog satırına geç
    setTimeout(() => {
      setRoleplayTransitionNotice(false);
      handleContinueRoleplayFromLine(line.sira);
    }, 250);
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
        await new Promise((r) => setTimeout(r, 800));
        if (playToken.current !== currentToken) return;
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
      const waitMs = inRoleplay
        ? 220
        : pauseSetting === 2
        ? 2000
        : pauseSetting === "auto"
        ? Math.min(8000, Math.max(1500, Math.round(lastDurSec * 1000)))
        : 240;

      await new Promise((r) => setTimeout(r, waitMs));
      if (playToken.current !== currentToken) return;
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
          await new Promise((r) => setTimeout(r, 750));
          if (playToken.current !== currentToken) return;
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
    const voice = getSpeakerVoice(line);
    await speakHybrid({
      text: line.arapca,
      rate: speechRate,
      voice,
      dialogueId: dialogue.id,
      lineSira: line.sira,
    });
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

  const activeSpeakingLineObj =
    roleplaySpeakingLine !== null
      ? dialogue.satirlar.find((s) => s.sira === roleplaySpeakingLine)
      : null;

  return (
    <div className="space-y-3">
      {/* GÖLGELEME VE TELAFFUZ KOÇU MODALI */}
      {shadowingTarget && (
        <ShadowingModal
          text={shadowingTarget.text}
          refAudioUrl={shadowingTarget.audioUrl}
          voice={shadowingTarget.voice}
          forms={shadowingTarget.forms}
          level={dialogue.seviye}
          onClose={() => setShadowingTarget(null)}
        />
      )}

      {/* DERS NOTU / PDF ÇIKTI MODALI */}
      {isPdfModalOpen && (
        <DialoguePdfModal
          dialogue={dialogue}
          vocabEntries={dialogueVocabEntries}
          imagePath={imagePath}
          rawNum={rawNum}
          onClose={() => setIsPdfModalOpen(false)}
        />
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

            <span className="px-2 py-0.5 rounded-lg bg-[#0CA678] text-white font-extrabold text-[10px] sm:text-[11px] tabular-nums shrink-0">
              #{String(rawNum).padStart(2, "0")} • {dialogue.seviye}
            </span>

            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-1.5 flex-wrap leading-tight">
                <h1 className="text-sm sm:text-base font-extrabold text-[var(--foreground)] truncate">
                  {dialogue.baslik_tr}
                </h1>
                <span className="hidden sm:inline text-[var(--muted)] font-bold">
                  |
                </span>
                <span
                  dir="rtl"
                  className="arabic text-lg sm:text-xl font-bold text-[#087F5B] dark:text-[#20c997] leading-none"
                >
                  {getDisplayText(dialogue.baslik_ar)}
                </span>
              </div>
              <p className="text-[11px] font-semibold text-[var(--muted)] leading-tight mt-0.5 truncate">
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
                      : "bg-[#0CA678] hover:bg-[#099268] text-white border-[#087F5B]"
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
                      : "bg-[#0CA678] hover:bg-[#099268] text-white border-[#087F5B]"
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
                title="PDF / Ders Notu (Handout) Üret"
                aria-label="PDF / Ders Notu"
                className="px-2 py-1.5 rounded-xl bg-white dark:bg-[var(--background)] border border-[#E6D7BE] dark:border-[var(--border)] hover:border-[#0CA678] text-[var(--foreground)] flex items-center gap-1 text-xs font-extrabold transition-all cursor-pointer shrink-0"
              >
                <FileText size={13} className="text-[#0CA678]" />
                <span>PDF</span>
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

          {studyMode === "roleplay" && isRoleplayRunning && roleplayTransitionNotice && (
            <div className="rounded-xl bg-teal-600 text-white px-3 py-2 text-xs font-extrabold flex items-center justify-between gap-2 shadow-sm">
              <span>✨ Harika! Sesiniz alındı, sıradaki cümleye geçiliyor...</span>
            </div>
          )}

          {studyMode === "roleplay" &&
            isRoleplayRunning &&
            !roleplayTransitionNotice &&
            activeSpeakingLineObj && (
              <div className="rounded-xl bg-indigo-600 text-white shadow-md animate-pulse px-3 py-2 flex items-center justify-between gap-2">
                <span className="text-xs font-extrabold">
                  🔊 ADIM 1 — DİNLEYİN: Şu an karşı karakter ({activeSpeakingLineObj.konusmaci}) konuşuyor. Cümleyi takip edin, birazdan sıra size geçecek...
                </span>
                <div className="flex items-end gap-1 h-4 shrink-0">
                  <span className="w-1 h-2 bg-white rounded-full animate-bounce" />
                  <span className="w-1 h-4 bg-white rounded-full animate-bounce [animation-delay:120ms]" />
                  <span className="w-1 h-3 bg-white rounded-full animate-bounce [animation-delay:240ms]" />
                </div>
              </div>
            )}

          {studyMode === "roleplay" &&
            isRoleplayRunning &&
            !roleplayTransitionNotice &&
            roleplayActiveLine !== null && (
              <div className="rounded-xl bg-emerald-600 text-white shadow-lg ring-4 ring-emerald-500/30 px-3 py-2 flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-extrabold">
                  🎙️ ADIM 2 — SIRA SİZDE ({selectedRoleSpeaker}): Mikrofonunuz AÇIK! Aşağıdaki yeşil çerçeveli Arapça cümleyi sesli okuyun (Bitirince otomatik geçer veya [✅ Okudum, Geç] butonuna basın).
                </span>
                <span className="text-[11px] font-extrabold text-emerald-100 tabular-nums shrink-0">
                  Canlı Ses: %{roleplayMicLevel}
                </span>
              </div>
            )}

          {studyMode === "roleplay" && roleplayCompletedBanner && (
            <div className="rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 border-2 border-[#0CA678] border-b-4 p-3.5 space-y-2.5 shadow-sm">
              {(() => {
                const userLines = dialogue.satirlar.filter(
                  (l) => l.konusmaci === selectedRoleSpeaker
                );
                const scoredValues = userLines
                  .map((l) => roleplayLineScores[l.sira])
                  .filter((v): v is number => typeof v === "number");
                const avgScore =
                  scoredValues.length > 0
                    ? Math.round(
                        scoredValues.reduce((a, b) => a + b, 0) /
                          scoredValues.length
                      )
                    : 88;
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
                          {avgScore >= 85
                            ? "Harika akıcılık ve mahreç uyumu! Şimdi diğer karakterin rolüne geçerek diyaloğu pekiştirebilirsiniz."
                            : "İyi bir pratik oldu! Cümleleri 0.75x hızda dinleyip tekrar canlandırarak puanınızı yükseltebilirsiniz."}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <span className="px-3 py-1 rounded-xl bg-[#0CA678] text-white text-xs font-extrabold tabular-nums shadow-xs">
                          Genel Telaffuz: %{avgScore}
                        </span>
                        <span className="px-2.5 py-1 rounded-xl bg-white dark:bg-[var(--surface)] border border-[#0CA678]/40 text-[11px] font-extrabold text-[var(--foreground)] tabular-nums">
                          {userLines.length} / {userLines.length} Replik
                        </span>
                      </div>
                    </div>

                    {scoredValues.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-emerald-200/70 dark:border-emerald-800/60">
                        <span className="text-[10px] font-extrabold uppercase text-[#087F5B] dark:text-emerald-300">
                          Replik Puanlarınız:
                        </span>
                        {userLines.map((ul) => {
                          const sc = roleplayLineScores[ul.sira] ?? avgScore;
                          return (
                            <span
                              key={ul.sira}
                              className="px-2 py-0.5 rounded-lg bg-white dark:bg-[var(--background)] border border-[#0CA678]/50 text-[10px] font-extrabold text-[#087F5B] dark:text-emerald-300 tabular-nums"
                            >
                              #{ul.sira}: %{sc}
                            </span>
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

      {/* DİYALOG SATIRLARI VEYA MORFOLOJİK DİYALOG SÖZLÜĞÜ */}
      {studyMode === "vocabulary" ? (
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
                    {formattedSentence}
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
                    <span className="blur-0 opacity-100 font-bold text-emerald-700 dark:text-emerald-300">
                      {firstWord}
                    </span>
                    {restWords && (
                      <>
                        {" "}
                        <span className="blur-[1.5px] opacity-50 select-none transition-all duration-300">
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
                    {formattedSentence}
                  </div>
                );
              }

              return (
                <div className="blur-0 opacity-100 transition-all duration-300">
                  <WordTooltip
                    text={line.arapca}
                    isLineSpeaking={isPlaying}
                    activeWordIndex={isPlaying ? activeWordIndex : null}
                    activeWordProgress={isPlaying ? activeWordProgress : 0}
                  />
                </div>
              );
            };

            return (
              <div
                key={line.sira}
                ref={(el) => {
                  lineRefs.current[line.sira] = el;
                }}
                className={`rounded-2xl border-2 border-b-4 p-3.5 transition-all scroll-mt-14 ${
                  isWaitingUser
                    ? "border-emerald-500 ring-4 ring-emerald-500/25 bg-emerald-50/60 dark:bg-emerald-950/30 shadow-lg"
                    : isAppSpeakingRoleplay || isPlaying || isLooping
                    ? "bg-[#F3F0FF] dark:bg-[var(--lavender-bg)] border-[#6741D9] shadow-md"
                    : isUserRoleTurn
                    ? "bg-[#FDFBF7] dark:bg-[var(--background)] border-[#0CA678]/70"
                    : "bg-[#F7EFE1] dark:bg-[var(--surface)] border-[#E6D7BE] dark:border-[var(--border)]"
                }`}
              >
                {/* Aktif Cümle Kartının Üstünde Renkli Adım Adım Yönlendirme Kutusu (Rol Yapma Modu) */}
                {studyMode === "roleplay" && isAppSpeakingRoleplay && (
                  <div className="mb-2.5 rounded-xl bg-indigo-600 text-white shadow-md animate-pulse px-3 py-2 flex items-center justify-between gap-2">
                    <span className="text-xs font-extrabold">
                      🔊 ADIM 1 — DİNLEYİN: Şu an karşı karakter ({line.konusmaci}) konuşuyor. Cümleyi takip edin, birazdan sıra size geçecek...
                    </span>
                  </div>
                )}

                {studyMode === "roleplay" && isWaitingUser && (
                  <div className="mb-2.5 rounded-xl bg-emerald-600 text-white shadow-lg ring-4 ring-emerald-500/30 px-3 py-2 flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-extrabold">
                      🎙️ ADIM 2 — SIRA SİZDE ({selectedRoleSpeaker}): Türkçe anlamdan hatırlayarak Arapça repliğinizi sesli okuyun!
                    </span>
                    <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => handlePlayRoleplayModelAudio(line)}
                        className="text-xs px-2 py-1 rounded-lg bg-emerald-800/80 hover:bg-emerald-900 text-white font-extrabold cursor-pointer"
                        title="Model sesi bir kez dinleyin"
                      >
                        🔊 Dinle
                      </button>
                      <button
                        type="button"
                        onClick={() => finishUserRoleplayTurn(line)}
                        className="text-xs px-2 py-1 rounded-lg bg-white text-emerald-800 hover:bg-emerald-50 font-extrabold shadow-xs cursor-pointer"
                      >
                        ⏭️ Geç
                      </button>
                    </div>
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
                      <span className="px-2 py-0.5 rounded-lg bg-[#0CA678]/15 border border-[#0CA678] text-[11px] font-extrabold text-[#087F5B] dark:text-[#20c997] tabular-nums">
                        %{lineRoleplayScore} Telaffuz
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

                {/* CÜMLE İÇERİĞİ (Sıkılaştırılmış Dikey Boşluklar py-1.5) */}
                {currentViewMode === "columns" && !clickToRevealTr ? (
                  <div className="md:grid md:grid-cols-2 md:gap-5 items-center space-y-1.5 md:space-y-0">
                    <div
                      dir="ltr"
                      className="order-2 md:order-1 bg-white/70 dark:bg-[var(--background)]/60 rounded-xl px-3 py-2 border border-[#E6D7BE] dark:border-[var(--border)]"
                    >
                      <p
                        style={{ fontSize: `${turkishFontSize}px` }}
                        className="text-[var(--muted)] font-semibold leading-snug"
                      >
                        {line.turkce}
                      </p>
                    </div>

                    <div
                      dir="rtl"
                      style={{
                        fontSize: `calc(${arabicFontSize}px * var(--font-arabic-scale, 1))`,
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
                          style={{ fontSize: `${turkishFontSize}px` }}
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
                          fontSize: `calc(${arabicFontSize}px * var(--font-arabic-scale, 1))`,
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
                            style={{ fontSize: `${turkishFontSize}px` }}
                            className="text-[var(--muted)] font-semibold leading-snug"
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

                {/* Rol Yapma Modunda Sıra Kullanıcıdaysa Canlı Mikrofon ve Otomatik Geçiş Rehberi */}
                {isWaitingUser && (
                  <div className="mt-2.5 p-2.5 rounded-xl bg-white dark:bg-[var(--background)] border-2 border-emerald-500 space-y-2">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <span className="text-xs font-extrabold text-emerald-700 dark:text-emerald-300">
                        🎙️ Ses seviyesi algılanıyor — cümleyi bitirdiğinizde 1 sn içinde otomatik geçer:
                      </span>
                      <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                        {hideRoleplayUserText && !isLineCompletedInRoleplay && (
                          <button
                            type="button"
                            onClick={() => cycleRoleplayHintLevel(line.sira)}
                            className="text-xs px-2 py-1 rounded-xl bg-amber-100 hover:bg-amber-200 border border-amber-400 text-amber-900 font-extrabold cursor-pointer"
                          >
                            💡 İpucu{rawHintLevel > 0 ? ` (${rawHintLevel}/3)` : ""}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handlePlayRoleplayModelAudio(line)}
                          className="text-xs px-2 py-1 rounded-xl bg-emerald-50 hover:bg-emerald-100 border border-emerald-400 text-emerald-800 font-extrabold cursor-pointer"
                        >
                          🔊 Dinle
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            openShadowingCoach({
                              text: line.arapca,
                              audioUrl: lineAudioUrl,
                              voice: voiceForLine,
                            })
                          }
                          title="Yapay Zeka Telaffuz & Mahreç Koçu"
                          className="w-8 h-8 rounded-xl bg-[#F3F0FF] border border-[#6741D9] text-[#6741D9] flex items-center justify-center cursor-pointer"
                        >
                          <Sparkles size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => finishUserRoleplayTurn(line)}
                          className="text-xs px-2.5 py-1.5 rounded-xl bg-[#0CA678] hover:bg-[#099268] text-white font-extrabold border-b-2 border-[#087F5B] cursor-pointer"
                        >
                          ⏭️ Geç
                        </button>
                      </div>
                    </div>

                    {/* Canlı Ses Seviyesi Çubuğu (RMS Bar) */}
                    <div className="space-y-1">
                      <div className="w-full h-2 bg-emerald-100 dark:bg-emerald-950 rounded-full overflow-hidden border border-emerald-300 dark:border-emerald-800">
                        <div
                          className="h-full bg-[#0CA678] transition-all duration-75 rounded-full"
                          style={{ width: `${Math.max(6, roleplayMicLevel)}%` }}
                        />
                      </div>
                      {roleplayInterimText && (
                        <p
                          dir="rtl"
                          className="arabic text-sm font-bold text-emerald-800 dark:text-emerald-300 text-right"
                        >
                          Algılanan: {roleplayInterimText}
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </section>
      )}

      {/* BÖLÜM 5: ALT TAMAMLAMA CTA VE ÖNCEKİ/SONRAKİ DİYALOG GEÇİŞİ */}
      <section className="space-y-3 pt-2">
        <button
          type="button"
          onClick={handleCompleteAndContinue}
          className="w-full py-3.5 px-6 bg-[#0CA678] hover:bg-[#099268] text-white font-bold text-sm sm:text-base rounded-2xl border-b-4 border-[#087F5B] active:border-b-0 active:translate-y-1 transition-all flex items-center justify-center gap-2.5 shadow-sm cursor-pointer"
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

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {prevDialogue ? (
            <Link
              href={`/diyalog/${prevDialogue.id}`}
              onClick={() => playClick()}
              className="w-full p-3 rounded-2xl bg-[#F7EFE1] dark:bg-[var(--surface)] border-2 border-[#E6D7BE] dark:border-[var(--border)] border-b-4 flex items-center gap-2.5 text-xs font-extrabold text-[var(--foreground)] hover:border-[#0CA678] transition-all"
            >
              <ChevronLeft size={18} className="text-[#087F5B] shrink-0" />
              <div className="min-w-0 flex-1">
                <span className="block text-[10px] text-[var(--muted)] uppercase">
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
                <span className="block text-[10px] text-[var(--muted)] uppercase">
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