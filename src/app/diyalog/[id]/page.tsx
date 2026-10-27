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
  Gauge,
  FileText,
  Maximize2,
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
import { useSettings, ViewMode } from "@/store/settings";
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
import { formatArabicText } from "@/lib/arabicTextUtils";

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

  const { stop, playAudio, playTTS, playingLineId } = useAudioStore();
  const {
    viewMode,
    setViewMode,
    showHareke,
    showShadowing,
    arabicFont,
    arabicFontSize,
    turkishFontSize,
    speechRate,
    cycleSpeechRate,
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
  const [loopingLineSira, setLoopingLineSira] = useState<number | null>(null);
  const [autoShadowingFlow, setAutoShadowingFlow] = useState<boolean>(false);

  // Lightbox (Kapak Görseli Büyütme) ve PDF / Ders Notu Modal State
  const [isLightboxOpen, setIsLightboxOpen] = useState<boolean>(false);
  const [isPdfModalOpen, setIsPdfModalOpen] = useState<boolean>(false);

  // Rol Yapma (Roleplay) Canlı Simülasyon State
  const [selectedRoleSpeaker, setSelectedRoleSpeaker] = useState<string>("");
  const [isRoleplayRunning, setIsRoleplayRunning] = useState<boolean>(false);
  const [roleplayActiveLine, setRoleplayActiveLine] = useState<number | null>(
    null
  );
  const [roleplaySpeakingLine, setRoleplaySpeakingLine] = useState<
    number | null
  >(null);
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
      roleplayRecorderRef.current.stop().catch(() => {});
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
    };
  }, [stop]);

  useEffect(() => {
    if (!isLightboxOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsLightboxOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isLightboxOpen]);

  useEffect(() => {
    if (dialogue && dialogue.satirlar.length > 0 && !selectedRoleSpeaker) {
      setSelectedRoleSpeaker(dialogue.satirlar[0].konusmaci);
    }
  }, [dialogue, selectedRoleSpeaker]);

  useEffect(() => {
    const targetLine = roleplayActiveLine ?? playingLineId;
    if (targetLine !== null && lineRefs.current[targetLine]) {
      lineRefs.current[targetLine]?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }
  }, [playingLineId, roleplayActiveLine]);

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

  // --- OTOMATİK ROL YAPMA MİKROFON BAŞLATICI VE SIRA GEÇİŞİ ---
  const activateUserRoleplayTurn = async (line: DialogueLine) => {
    cleanupRoleplayMic();
    roleplayFinishingRef.current = false;
    setRoleplaySpeakingLine(null);
    setRoleplayActiveLine(line.sira);
    setIsPlayingAll(false);
    playRecordStart();

    try {
      roleplaySpeechRef.current?.startLiveWebSpeech({
        onInterimTranscript: (interim) => {
          setRoleplayInterimText(interim);
        },
      });

      const session = await start16kHzRecorder({
        onLiveRms: (rms) => {
          setRoleplayMicLevel(Math.min(100, Math.round(rms * 320)));
        },
        onAutoSilenceStop: () => {
          finishUserRoleplayTurn(line);
        },
      });
      roleplayRecorderRef.current = session;
    } catch {
      // Mikrofon izni yoksa manuel devam butonuna basılabilir
    }
  };

  const finishUserRoleplayTurn = async (line: DialogueLine) => {
    if (roleplayFinishingRef.current) return;
    roleplayFinishingRef.current = true;

    playRecordStop();
    let recognized = roleplaySpeechRef.current?.stopLiveWebSpeech() || "";

    if (roleplayRecorderRef.current) {
      const activeSession = roleplayRecorderRef.current;
      roleplayRecorderRef.current = null;
      try {
        const rec = await activeSession.stop();
        if (!recognized && roleplaySpeechRef.current) {
          const hybrid = await roleplaySpeechRef.current.transcribeHybrid(
            "webspeech",
            rec.trimmedSamples
          );
          recognized = hybrid.text;
        }
      } catch {
        // sessizce geç
      }
    }

    setRoleplayMicLevel(0);
    setRoleplayInterimText("");

    // Hızlı telaffuz puanı hesapla ve kart üstünde rozet olarak göster
    const evalRes = evaluateSentenceWords(
      line.arapca,
      recognized || line.arapca
    );
    const computedScore = recognized.trim()
      ? Math.max(65, evalRes.overallScore)
      : 85;
    setRoleplayLineScores((prev) => ({
      ...prev,
      [line.sira]: computedScore,
    }));
    recordPronunciationScore(computedScore);

    // 450ms sonra otomatik olarak sıradaki cümleye geç
    setTimeout(() => {
      handleContinueRoleplayFromLine(line.sira);
    }, 450);
  };

  const playSentence = async (
    line: DialogueLine,
    autoAdvance = false,
    isLooping = false,
    inRoleplay = false
  ) => {
    const currentToken = playToken.current;
    const lineHasMp3 = hasMp3(dialogue.id, line.sira);
    const lineAudioUrl = lineHasMp3
      ? getMp3Path(dialogue.id, line.sira)
      : undefined;
    const voice = getSpeakerVoice(line);

    if (inRoleplay) {
      setRoleplaySpeakingLine(line.sira);
      setRoleplayActiveLine(null);
    }

    if (lineHasMp3 && lineAudioUrl) {
      await playAudio(lineAudioUrl, line.sira, speechRate);
    } else {
      await playTTS(line.arapca, line.sira, speechRate, voice);
    }

    if (playToken.current !== currentToken) return;

    if (inRoleplay) {
      setRoleplaySpeakingLine(null);
    }

    // 1. Eğer bu cümle için Tekrarla (Loop) aktifse 1 saniye bekleyip tekrar çal
    if (isLooping) {
      await new Promise((r) => setTimeout(r, 1000));
      if (playToken.current !== currentToken) return;
      await playSentence(line, false, true, false);
      return;
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
      await new Promise((r) => setTimeout(r, 280));
      if (playToken.current !== currentToken) return;
      const nextLine = dialogue.satirlar.find((s) => s.sira === line.sira + 1);
      if (nextLine) {
        if (inRoleplay && nextLine.konusmaci === selectedRoleSpeaker) {
          await activateUserRoleplayTurn(nextLine);
          return;
        }
        await playSentence(nextLine, true, false, inRoleplay);
      } else {
        setIsPlayingAll(false);
        setRoleplayActiveLine(null);
        setRoleplaySpeakingLine(null);
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
    setRoleplayActiveLine(null);
    setRoleplaySpeakingLine(null);
    setIsRoleplayRunning(false);

    if (flowMode === "sequential") {
      setIsPlayingAll(true);
      playSentence(line, true, false, false);
    } else {
      setIsPlayingAll(false);
      playSentence(line, false, false, false);
    }
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

    if (loopingLineSira === line.sira) {
      setLoopingLineSira(null);
    } else {
      setLoopingLineSira(line.sira);
      playSentence(line, false, true, false);
    }
  };

  const handleTogglePlayAll = () => {
    playClick();
    setLoopingLineSira(null);
    cleanupRoleplayMic();
    setIsRoleplayRunning(false);
    setRoleplayActiveLine(null);
    setRoleplaySpeakingLine(null);

    if (isPlayingAll) {
      playToken.current += 1;
      stop();
      setIsPlayingAll(false);
    } else {
      setFlowMode("sequential");
      setIsPlayingAll(true);
      playToken.current += 1;
      const firstLine = dialogue.satirlar[0];
      playSentence(firstLine, true, false, false);
    }
  };

  // --- ROL YAPMA (ROLEPLAY) BAŞLAT / BİTİR VE DEVAM ET ---
  const handleToggleRoleplay = () => {
    playClick();
    setLoopingLineSira(null);
    setRoleplayCompletedBanner(false);

    if (isRoleplayRunning) {
      playToken.current += 1;
      stop();
      cleanupRoleplayMic();
      setIsRoleplayRunning(false);
      setIsPlayingAll(false);
      setRoleplayActiveLine(null);
      setRoleplaySpeakingLine(null);
    } else {
      playToken.current += 1;
      stop();
      cleanupRoleplayMic();
      setIsRoleplayRunning(true);
      const firstLine = dialogue.satirlar[0];
      if (firstLine.konusmaci === selectedRoleSpeaker) {
        activateUserRoleplayTurn(firstLine);
      } else {
        setIsPlayingAll(true);
        playSentence(firstLine, true, false, true);
      }
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
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
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

      {/* STICKY İKİ SÜTUNLU ASİMETRİK ÜST KART */}
      <section className="sticky top-15 z-40 bg-[#F7EFE1]/95 dark:bg-[var(--surface)]/95 backdrop-blur-md rounded-2xl border-2 border-[#E6D7BE] dark:border-[var(--border)] border-b-4 shadow-sm p-3.5 space-y-2">
        <div className="flex items-stretch justify-between gap-4">
          {/* SOL SÜTUN: 2 Satırlı Kompakt Başlık, Sekmeler, Kontroller ve Rehber */}
          <div className="flex-1 flex flex-col justify-between gap-2 min-w-0">
            {/* 1. SATIR: Geri + #01•A1 + Başlıklar + Cümle/Kelime Sayısı + 4 Mod Sekmesi + Favori / Tamamla / PDF */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 flex-wrap min-w-0">
                <Link
                  href="/kutuphane"
                  onClick={() => playClick()}
                  title="Kütüphaneye Dön"
                  aria-label="Kütüphaneye Dön"
                  className="group relative w-8 h-8 rounded-xl bg-white dark:bg-[var(--background)] border-2 border-[#E6D7BE] dark:border-[var(--border)] border-b-3 flex items-center justify-center text-[var(--foreground)] hover:border-[#0CA678] shrink-0 transition-all"
                >
                  <ChevronLeft size={17} strokeWidth={2.5} />
                  <span className="pointer-events-none absolute -bottom-8 left-0 whitespace-nowrap rounded-lg bg-[#2b241d] px-2 py-1 text-[10px] font-bold text-white opacity-0 group-hover:opacity-100 transition-opacity z-50 shadow-md">
                    Kütüphaneye Dön
                  </span>
                </Link>

                <span className="px-2 py-0.5 rounded-lg bg-[#0CA678] text-white font-extrabold text-[11px] tabular-nums shrink-0">
                  #{String(rawNum).padStart(2, "0")} • {dialogue.seviye}
                </span>

                <div className="flex items-baseline gap-1.5 flex-wrap">
                  <h1 className="text-sm sm:text-base font-extrabold text-[var(--foreground)] leading-tight">
                    {dialogue.baslik_tr}
                  </h1>
                  <span className="text-[var(--muted)] font-bold">|</span>
                  <span
                    dir="rtl"
                    className="arabic text-xl sm:text-2xl font-bold text-[#087F5B] dark:text-[#20c997] leading-none"
                  >
                    {getDisplayText(dialogue.baslik_ar)}
                  </span>
                </div>

                <span className="hidden xl:inline-block text-[11px] font-bold text-[var(--muted)] bg-white/70 dark:bg-[var(--background)] px-2 py-0.5 rounded-md border border-[#E6D7BE]">
                  {dialogue.satirlar.length} Cümle · {dialogueVocabEntries.length} Kelime
                </span>
              </div>

              {/* Sağ Grup: 4 Çalışma Modu Sekmesi + Favori + Tamamlandı + PDF / Ders Notu */}
              <div className="flex flex-wrap items-center gap-1.5">
                <div className="bg-white dark:bg-[var(--background)] p-0.5 rounded-xl border border-[#E6D7BE] dark:border-[var(--border)] flex flex-wrap items-center gap-0.5">
                  {(
                    [
                      { id: "listen", label: "📖 Dinle & İncele" },
                      { id: "shadowing", label: "🎙️ Telaffuz Stüdyosu" },
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
                        className={`px-2 py-1 rounded-lg text-[11px] font-extrabold transition-all whitespace-nowrap cursor-pointer ${
                          isSelected
                            ? "bg-[#6741D9] text-white shadow-2xs"
                            : "text-[var(--muted)] hover:text-[var(--foreground)]"
                        }`}
                      >
                        {tab.label}
                      </button>
                    );
                  })}
                </div>

                {/* Favori İkon Butonu */}
                <button
                  type="button"
                  onClick={() => {
                    playClick();
                    toggleFavoriteDialogue(dialogue.id);
                  }}
                  title={isFav ? "Favorilerden Çıkar" : "Favorilere Ekle"}
                  aria-label="Favori"
                  className={`group relative w-8 h-8 rounded-xl border-2 border-b-3 flex items-center justify-center transition-all cursor-pointer ${
                    isFav
                      ? "bg-red-50 border-red-300 text-red-600"
                      : "bg-white dark:bg-[var(--background)] border-[#E6D7BE] dark:border-[var(--border)] text-[var(--muted)] hover:text-red-500"
                  }`}
                >
                  <Heart size={14} fill={isFav ? "currentColor" : "none"} />
                  <span className="pointer-events-none absolute -bottom-8 right-0 whitespace-nowrap rounded-lg bg-[#2b241d] px-2 py-1 text-[10px] font-bold text-white opacity-0 group-hover:opacity-100 transition-opacity z-50 shadow-md">
                    {isFav ? "Favorilerde" : "Favorilere Ekle"}
                  </span>
                </button>

                {/* Tamamla İkon Butonu */}
                <button
                  type="button"
                  onClick={() => {
                    playClick();
                    toggleCompletedDialogue(dialogue.id);
                  }}
                  title={isCompleted ? "Tamamlandı" : "Tamamlandı Olarak İşaretle"}
                  aria-label="Tamamla"
                  className={`group relative w-8 h-8 rounded-xl border-2 border-b-3 flex items-center justify-center transition-all cursor-pointer ${
                    isCompleted
                      ? "bg-[#F3F0FF] border-[#6741D9] text-[#6741D9]"
                      : "bg-white dark:bg-[var(--background)] border-[#E6D7BE] dark:border-[var(--border)] text-[var(--muted)] hover:text-[#087F5B]"
                  }`}
                >
                  <CheckCircle2 size={14} />
                  <span className="pointer-events-none absolute -bottom-8 right-0 whitespace-nowrap rounded-lg bg-[#2b241d] px-2 py-1 text-[10px] font-bold text-white opacity-0 group-hover:opacity-100 transition-opacity z-50 shadow-md">
                    {isCompleted ? "Tamamlandı" : "Diyaloğu Tamamla"}
                  </span>
                </button>

                {/* 📄 PDF / Ders Notu Butonu */}
                <button
                  type="button"
                  onClick={() => {
                    playClick();
                    setIsPdfModalOpen(true);
                  }}
                  title="PDF / Ders Notu (Handout) Üret"
                  aria-label="PDF / Ders Notu"
                  className="group relative h-8 px-2.5 rounded-xl bg-white dark:bg-[var(--background)] border-2 border-[#E6D7BE] dark:border-[var(--border)] border-b-3 hover:border-[#0CA678] text-[var(--foreground)] flex items-center gap-1 text-[11px] font-extrabold transition-all cursor-pointer"
                >
                  <FileText size={14} className="text-[#0CA678]" />
                  <span className="hidden sm:inline">PDF / Ders Notu</span>
                  <span className="pointer-events-none absolute -bottom-8 right-0 whitespace-nowrap rounded-lg bg-[#2b241d] px-2 py-1 text-[10px] font-bold text-white opacity-0 group-hover:opacity-100 transition-opacity z-50 shadow-md">
                    A4 PDF / Ders Notu Üret
                  </span>
                </button>
              </div>
            </div>

            {/* 2. SATIR: Sol uçta Kontroller ([▶ Tümünü Dinle], Görünüm İkonları, Hız 1x) + Hemen Sağında Aynı Satırda Kompakt Rehber Rozeti */}
            <div className="pt-1.5 border-t border-dashed border-[#E2D3B8] dark:border-[var(--border-dashed)] flex flex-wrap items-center justify-between gap-2">
              {studyMode === "listen" && (
                <>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {/* Tümünü Dinle / Durdur */}
                    <button
                      type="button"
                      onClick={handleTogglePlayAll}
                      className={`h-8 px-3 rounded-xl font-extrabold text-xs border-b-3 transition-all flex items-center gap-1.5 cursor-pointer ${
                        isPlayingAll
                          ? "bg-red-600 hover:bg-red-700 text-white border-red-800"
                          : "bg-[#0CA678] hover:bg-[#099268] text-white border-[#087F5B]"
                      }`}
                    >
                      {isPlayingAll ? (
                        <Square size={12} fill="currentColor" />
                      ) : (
                        <Play size={12} fill="currentColor" />
                      )}
                      <span>{isPlayingAll ? "Durdur" : "Tümünü Dinle"}</span>
                    </button>

                    {/* Görünüm Modu İkonları + Tooltip */}
                    <div className="bg-white dark:bg-[var(--background)] rounded-xl p-0.5 border border-[#E6D7BE] dark:border-[var(--border)] flex items-center gap-0.5">
                      {(
                        [
                          {
                            id: "stacked",
                            label: "Alt Alta Görünüm",
                            icon: Rows2,
                          },
                          {
                            id: "columns",
                            label: "İki Sütun Görünüm",
                            icon: Columns2,
                          },
                          {
                            id: "arabic-only",
                            label: "Sadece Arapça",
                            icon: Languages,
                          },
                          {
                            id: "turkish-only",
                            label: "Sadece Türkçe (Kendini Sına)",
                            icon: Eye,
                          },
                        ] as {
                          id: ViewMode;
                          label: string;
                          icon: typeof Rows2;
                        }[]
                      ).map((opt) => {
                        const active =
                          !clickToRevealTr && currentViewMode === opt.id;
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
                            aria-label={opt.label}
                            className={`group relative w-7 h-7 rounded-lg flex items-center justify-center transition-all cursor-pointer ${
                              active
                                ? "bg-[#0CA678] text-white"
                                : "text-[var(--muted)] hover:text-[var(--foreground)]"
                            }`}
                          >
                            <Icon size={14} />
                            <span className="pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-lg bg-[#2b241d] px-2 py-1 text-[10px] font-bold text-white opacity-0 group-hover:opacity-100 transition-opacity z-50 shadow-md">
                              {opt.label}
                            </span>
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
                        aria-label="Tıkla-Gör"
                        className={`group relative w-7 h-7 rounded-lg flex items-center justify-center transition-all cursor-pointer ${
                          clickToRevealTr
                            ? "bg-[#0CA678] text-white"
                            : "text-[var(--muted)] hover:text-[var(--foreground)]"
                        }`}
                      >
                        <MousePointerClick size={14} />
                        <span className="pointer-events-none absolute -top-8 right-0 whitespace-nowrap rounded-lg bg-[#2b241d] px-2 py-1 text-[10px] font-bold text-white opacity-0 group-hover:opacity-100 transition-opacity z-50 shadow-md">
                          Tıkla-Gör Çeviri
                        </span>
                      </button>
                    </div>

                    {/* Hız Seçici */}
                    <button
                      type="button"
                      onClick={() => {
                        cycleSpeechRate();
                        playClick();
                      }}
                      title="Okuma Hızını Değiştir"
                      className="h-8 px-2.5 rounded-xl bg-white dark:bg-[var(--background)] border border-[#E6D7BE] dark:border-[var(--border)] flex items-center gap-1 text-xs font-extrabold text-[var(--foreground)] cursor-pointer"
                    >
                      <Gauge size={13} className="text-[#0CA678]" />
                      <span className="tabular-nums">
                        {mounted ? `${speechRate}x` : "1x"}
                      </span>
                    </button>
                  </div>

                  <div className="px-2.5 py-1 rounded-xl bg-[#0CA678]/10 border border-[#0CA678]/30 text-[11px] font-bold text-[#087F5B] dark:text-[#20c997]">
                    💡 Rehber: Diyaloğu doğal sesle dinleyin. Morfolojik kök ve
                    ek analizi için Arapça kelimelere tıklayın.
                  </div>
                </>
              )}

              {studyMode === "shadowing" && (
                <>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-extrabold text-[var(--foreground)]">
                      Otomatik Gölgeleme Koçu:
                    </span>
                    <div className="bg-white dark:bg-[var(--background)] rounded-xl p-0.5 border border-[#E6D7BE] dark:border-[var(--border)] flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          playClick();
                          setAutoShadowingFlow(true);
                        }}
                        className={`px-2.5 py-1 text-xs rounded-lg transition-all cursor-pointer ${
                          autoShadowingFlow
                            ? "bg-[#0CA678] text-white font-semibold"
                            : "text-[var(--muted)] font-medium hover:text-[var(--foreground)]"
                        }`}
                      >
                        Açık
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          playClick();
                          setAutoShadowingFlow(false);
                        }}
                        className={`px-2.5 py-1 text-xs rounded-lg transition-all cursor-pointer ${
                          !autoShadowingFlow
                            ? "bg-[#0CA678] text-white font-semibold"
                            : "text-[var(--muted)] font-medium hover:text-[var(--foreground)]"
                        }`}
                      >
                        Manuel
                      </button>
                    </div>
                  </div>

                  <div className="px-2.5 py-1 rounded-xl bg-[#F3F0FF] dark:bg-[var(--lavender-bg)] border border-[#6741D9]/40 text-[11px] font-bold text-[#4C28B5] dark:text-[#d0bfff]">
                    🎙️ Telaffuz Stüdyosu: Cümleyi dinledikten sonra mikrofon
                    ikonuna basarak sesinizi kaydedin veya ✨ ikonuyla 38 mahreç
                    analizini açın.
                  </div>
                </>
              )}

              {studyMode === "roleplay" && (
                <div className="w-full flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-extrabold text-[#4C28B5] dark:text-[#d0bfff]">
                      🎭 Rolünüzü Seçin:
                    </span>
                    <div className="bg-white dark:bg-[var(--background)] rounded-xl p-0.5 border border-[#E6D7BE] dark:border-[var(--border)] flex flex-wrap items-center gap-1">
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
                          className={`px-2.5 py-1 text-xs rounded-lg transition-all whitespace-nowrap cursor-pointer ${
                            selectedRoleSpeaker === sp
                              ? "bg-[#0CA678] text-white font-semibold"
                              : "text-[var(--muted)] font-medium hover:text-[var(--foreground)]"
                          }`}
                        >
                          Karakter {idx === 0 ? "A" : "B"}: {sp}
                        </button>
                      ))}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleToggleRoleplay}
                    className={`h-8 px-3.5 rounded-xl font-extrabold text-xs border-b-3 transition-all flex items-center gap-1.5 cursor-pointer ${
                      isRoleplayRunning
                        ? "bg-red-600 hover:bg-red-700 text-white border-red-800"
                        : "bg-[#0CA678] hover:bg-[#099268] text-white border-[#087F5B]"
                    }`}
                  >
                    {isRoleplayRunning ? (
                      <>
                        <Square size={12} fill="currentColor" />
                        <span>⏹️ Canlandırmayı Bitir</span>
                      </>
                    ) : (
                      <>
                        <Play size={12} fill="currentColor" />
                        <span>▶️ Canlandırmayı Başlat</span>
                      </>
                    )}
                  </button>
                </div>
              )}

              {studyMode === "vocabulary" && (
                <div className="w-full flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-[#087F5B] dark:text-[#20c997]">
                    📚 Bu diyalogdaki tüm kelimeler ({dialogueVocabEntries.length}
                    ) — metindeki çekimli halleri ve yalın kök formları
                  </span>
                  <button
                    type="button"
                    onClick={() => setStudyMode("listen")}
                    className="px-3 py-1 rounded-xl bg-[#0CA678] text-white text-xs font-bold border-b-2 border-[#087F5B] cursor-pointer"
                  >
                    ← Diyalog Metnine Dön
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* SAĞ SÜTUN: İnteraktif Diyalog Kapak Görseli & Lightbox Tetikleyici */}
          <button
            type="button"
            onClick={() => {
              playClick();
              setIsLightboxOpen(true);
            }}
            title="Görseli Büyüt"
            aria-label="Diyalog Kapak Görselini Büyüt"
            className="w-36 sm:w-44 h-24 sm:h-28 rounded-2xl overflow-hidden shadow-md border-2 border-white/80 dark:border-slate-700 relative group cursor-pointer shrink-0 self-center"
          >
            <img
              src={imagePath}
              alt={dialogue.baslik_tr}
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            />
            <span className="absolute bottom-1.5 right-1.5 px-2 py-0.5 rounded-lg bg-black/70 backdrop-blur-xs text-white text-[10px] font-extrabold flex items-center gap-1 shadow-xs">
              <Maximize2 size={11} />
              <span>Büyüt</span>
            </span>
          </button>
        </div>

        {/* ROL YAPMA CANLI DURUM UYARI BALONU (LIVE STATUS BANNER) */}
        {studyMode === "roleplay" && isRoleplayRunning && (
          <div>
            {activeSpeakingLineObj && (
              <div className="rounded-xl bg-[#F3F0FF] dark:bg-[var(--lavender-bg)] border-2 border-[#6741D9] px-3 py-2 flex items-center justify-between gap-2 animate-pulse">
                <span className="text-xs font-extrabold text-[#4C28B5] dark:text-[#d0bfff]">
                  🔊 {activeSpeakingLineObj.konusmaci} konuşuyor... Lütfen
                  dinleyin
                </span>
                <div className="flex items-end gap-1 h-4">
                  <span className="w-1 h-2 bg-[#6741D9] rounded-full animate-bounce" />
                  <span className="w-1 h-4 bg-[#6741D9] rounded-full animate-bounce [animation-delay:120ms]" />
                  <span className="w-1 h-3 bg-[#6741D9] rounded-full animate-bounce [animation-delay:240ms]" />
                </div>
              </div>
            )}

            {roleplayActiveLine !== null && (
              <div className="rounded-xl bg-emerald-50 dark:bg-emerald-950/50 border-2 border-emerald-500 px-3 py-2 flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-extrabold text-emerald-800 dark:text-emerald-200">
                  🎙️ Sıra Sizde ({selectedRoleSpeaker})! Sizi dinliyorum, yeşil
                  çerçeveli cümleyi seslendirin...
                </span>
                <span className="text-[11px] font-extrabold text-emerald-700 dark:text-emerald-300 tabular-nums">
                  Canlı Ses: %{roleplayMicLevel}
                </span>
              </div>
            )}
          </div>
        )}

        {studyMode === "roleplay" && roleplayCompletedBanner && (
          <div className="rounded-xl bg-emerald-50 dark:bg-emerald-950/50 border-2 border-[#0CA678] px-3.5 py-2 flex items-center justify-between gap-2">
            <span className="text-xs font-extrabold text-[#087F5B] dark:text-[#20c997]">
              🎉 Tebrikler! Diyalog canlandırmasını başarıyla tamamladınız.
            </span>
            <button
              type="button"
              onClick={handleToggleRoleplay}
              className="px-2.5 py-1 rounded-lg bg-[#0CA678] text-white text-xs font-bold cursor-pointer"
            >
              Tekrar Canlandır
            </button>
          </div>
        )}
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
                          <span className="text-[11px] font-bold text-[var(--muted)]">
                            Kök: {getDisplayText(word.kok)}
                          </span>
                        )}
                      </div>
                      <p className="text-sm font-extrabold text-[var(--foreground)] mt-1">
                        {word.anlam_tr}
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
                          dir="rtl"
                          className="arabic text-sm font-bold text-[#6741D9] block"
                        >
                          Metinde: {getDisplayText(entry.contextWord)}
                        </span>
                      )}
                    </div>
                  </div>

                  {entry.morphologyNote && (
                    <div className="bg-white dark:bg-[var(--background)] rounded-xl px-3 py-1.5 border border-[#E6D7BE] text-[11px] font-bold text-[#4C28B5] dark:text-[#d0bfff]">
                      <span className="text-[10px] uppercase tracking-wider text-[#6741D9] block">
                        Morfolojik Çözümleme (Cümle #{entry.lineNumber}):
                      </span>
                      <span dir="rtl" className="block text-right">
                        {getDisplayText(entry.morphologyNote)}
                      </span>
                    </div>
                  )}

                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--muted)] border-b border-dashed border-[#E2D3B8] pb-2">
                    {word.cemi && word.cemi !== "-" && (
                      <span>
                        Cemî:{" "}
                        <strong className="arabic text-base text-[var(--foreground)]">
                          {getDisplayText(word.cemi)}
                        </strong>
                      </span>
                    )}
                    {word.muzari && (
                      <span>
                        Muzâri:{" "}
                        <strong className="arabic text-base text-[var(--foreground)]">
                          {getDisplayText(word.muzari)}
                        </strong>
                      </span>
                    )}
                    {word.masdar && (
                      <span>
                        Masdar:{" "}
                        <strong className="arabic text-base text-[var(--foreground)]">
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
                      setShadowingTarget({
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

            const isTrRevealed =
              (!clickToRevealTr && currentViewMode !== "arabic-only") ||
              revealedTrLines[line.sira];
            const isArRevealed =
              currentViewMode !== "turkish-only" ||
              revealedArLines[line.sira];

            const voiceForLine = getSpeakerVoice(line);

            return (
              <div
                key={line.sira}
                ref={(el) => {
                  lineRefs.current[line.sira] = el;
                }}
                className={`rounded-2xl border-2 border-b-4 p-3.5 transition-all scroll-mt-36 ${
                  isWaitingUser
                    ? "border-emerald-500 ring-4 ring-emerald-500/25 bg-emerald-50/60 dark:bg-emerald-950/30 shadow-lg"
                    : isAppSpeakingRoleplay || isPlaying || isLooping
                    ? "bg-[#F3F0FF] dark:bg-[var(--lavender-bg)] border-[#6741D9] shadow-md"
                    : isUserRoleTurn
                    ? "bg-[#FDFBF7] dark:bg-[var(--background)] border-[#0CA678]/70"
                    : "bg-[#F7EFE1] dark:bg-[var(--surface)] border-[#E6D7BE] dark:border-[var(--border)]"
                }`}
              >
                {/* Üst Satır: Konuşmacı Rozeti + Sadece İkon Aksiyon Butonları (Zengin Tooltipli) */}
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-dashed border-[#E2D3B8] dark:border-[var(--border-dashed)] pb-1.5 mb-1.5">
                  <div className="flex items-center gap-2 flex-wrap">
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

                  {/* Sadece İkon Aksiyon Kontrolleri (w-9 h-9 rounded-xl + CSS Tooltip) */}
                  <div className="flex items-center gap-1.5">
                    {/* 🔊 Doğal Sesle Dinle */}
                    <button
                      type="button"
                      onClick={() => handlePlayLine(line)}
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
                      className={`group relative w-9 h-9 rounded-xl border-2 border-b-3 inline-flex items-center justify-center transition-all cursor-pointer ${
                        isLooping
                          ? "bg-[#6741D9] border-[#5230B5] text-white"
                          : "bg-white dark:bg-[var(--background)] border-[#E6D7BE] dark:border-[var(--border)] text-[var(--muted)] hover:text-[#6741D9] hover:border-[#6741D9]"
                      }`}
                      title="Cümleyi Döngüde Tekrarla"
                      aria-label="Cümleyi Döngüde Tekrarla"
                    >
                      <Repeat
                        size={14}
                        className={isLooping ? "animate-spin" : ""}
                      />
                      <span className="pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-lg bg-[#2b241d] px-2.5 py-1 text-[10px] font-bold text-white opacity-0 group-hover:opacity-100 group-focus:opacity-100 transition-opacity z-50 shadow-md">
                        Cümleyi Döngüde Tekrarla
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
                            setShadowingTarget({
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
                      <WordTooltip text={getDisplayText(line.arapca)} />
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
                        <WordTooltip text={getDisplayText(line.arapca)} />
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
                        className="mt-1.5 pt-1.5 border-t border-dashed border-[#E2D3B8] dark:border-[var(--border-dashed)]"
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
                            onClick={() => {
                              playClick();
                              setRevealedTrLines((prev) => ({
                                ...prev,
                                [line.sira]: true,
                              }));
                            }}
                            className="inline-flex items-center gap-1.5 text-xs font-bold text-[#087F5B] bg-white dark:bg-[var(--background)] px-3 py-1 rounded-xl border border-[#E6D7BE] hover:border-[#0CA678] cursor-pointer"
                          >
                            <Eye size={13} />
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
                        🎙️ Sıra Sizde ({line.konusmaci})! Sizi dinliyorum, yeşil
                        çerçeveli cümleyi seslendirin...
                      </span>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() =>
                            setShadowingTarget({
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
                          className="px-3.5 py-1.5 rounded-xl bg-[#0CA678] hover:bg-[#099268] text-white text-xs font-extrabold border-b-3 border-[#087F5B] cursor-pointer"
                        >
                          ✅ Konuşmayı Bitir / Devam Et
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
          <CheckCircle2 size={18} />
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

        <div className="grid grid-cols-2 gap-3">
          {prevDialogue ? (
            <Link
              href={`/diyalog/${prevDialogue.id}`}
              onClick={() => playClick()}
              className="p-3 rounded-2xl bg-[#F7EFE1] dark:bg-[var(--surface)] border-2 border-[#E6D7BE] dark:border-[var(--border)] border-b-4 flex items-center gap-2 text-xs font-extrabold text-[var(--foreground)] hover:border-[#0CA678] transition-all"
            >
              <ChevronLeft size={18} className="text-[#087F5B] shrink-0" />
              <div className="truncate">
                <span className="block text-[10px] text-[var(--muted)] uppercase">
                  Önceki Diyalog
                </span>
                <span className="truncate block">{prevDialogue.baslik_tr}</span>
              </div>
            </Link>
          ) : (
            <div />
          )}

          {nextDialogue ? (
            <Link
              href={`/diyalog/${nextDialogue.id}`}
              onClick={() => playClick()}
              className="p-3 rounded-2xl bg-[#F7EFE1] dark:bg-[var(--surface)] border-2 border-[#E6D7BE] dark:border-[var(--border)] border-b-4 flex items-center justify-end gap-2 text-xs font-extrabold text-[var(--foreground)] hover:border-[#0CA678] transition-all text-right"
            >
              <div className="truncate">
                <span className="block text-[10px] text-[var(--muted)] uppercase">
                  Sonraki Diyalog
                </span>
                <span className="truncate block">{nextDialogue.baslik_tr}</span>
              </div>
              <ChevronRight size={18} className="text-[#087F5B] shrink-0" />
            </Link>
          ) : (
            <div />
          )}
        </div>
      </section>
    </div>
  );
}