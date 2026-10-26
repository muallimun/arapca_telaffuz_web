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
  BookOpen,
  Users,
  BookMarked,
  Check,
  Languages,
  Gauge,
  ListMusic,
  Eye,
  Sparkles,
  Repeat,
  Columns2,
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
import { useSettings, SpeechRate, ViewMode } from "@/store/settings";
import { useUserStore } from "@/store/userStore";
import { playClick, playSuccess } from "@/lib/sfxManager";
import WordTooltip from "@/components/ui/WordTooltip";
import ShadowingButton from "@/components/ui/ShadowingButton";
import ShadowingModal from "@/components/ui/ShadowingModal";
import { getDialogueVocabulary, DialogueVocabularyEntry } from "@/lib/dict";
import { DialogueLine, DictionaryItem } from "@/types/data";

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
    arabicFontSize,
    turkishFontSize,
    speechRate,
    setSpeechRate,
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
  } = useUserStore();

  const [mounted, setMounted] = useState(false);
  const [manifestLoaded, setManifestLoaded] = useState(false);
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

  // Rol Yapma (Roleplay) State
  const [selectedRoleSpeaker, setSelectedRoleSpeaker] = useState<string>("");
  const [roleplayActiveLine, setRoleplayActiveLine] = useState<number | null>(
    null
  );

  // Gölgeleme Modal State
  const [shadowingTarget, setShadowingTarget] = useState<{
    text: string;
    audioUrl?: string;
    voice?: VoiceOption;
    forms?: { label: string; arabic: string }[];
  } | null>(null);

  const playToken = useRef(0);
  const lineRefs = useRef<{ [key: number]: HTMLDivElement | null }>({});

  useEffect(() => {
    setMounted(true);
    loadAudioManifest().then(() => setManifestLoaded(true));
    return () => {
      playToken.current += 1;
      stop();
    };
  }, [stop]);

  useEffect(() => {
    if (dialogue && dialogue.satirlar.length > 0 && !selectedRoleSpeaker) {
      setSelectedRoleSpeaker(dialogue.satirlar[0].konusmaci);
    }
  }, [dialogue, selectedRoleSpeaker]);

  useEffect(() => {
    if (playingLineId !== null && lineRefs.current[playingLineId]) {
      lineRefs.current[playingLineId]?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }
  }, [playingLineId]);

  if (!dialogue) return notFound();

  const currentIndex = diyaloglar.findIndex((d) => d.id === dialogue.id);
  const prevDialogue = currentIndex > 0 ? diyaloglar[currentIndex - 1] : null;
  const nextDialogue =
    currentIndex < diyaloglar.length - 1 ? diyaloglar[currentIndex + 1] : null;

  // 5 Kademeli Morfolojik Çözümleyici ile diyalogdaki TÜM kelimeleri (çekimli bağlamıyla) çıkar
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

  const removeTashkeel = (text: string) => text.replace(/[\u064B-\u0652]/g, "");
  const getDisplayText = (text: string) =>
    !mounted || showHareke ? text : removeTashkeel(text);

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

  // --- 3 KATMANLI DOĞAL SESLENDİRME + CÜMLE DÖNGÜSÜ (LOOP) + OTOMATİK GÖLGELEME ---
  const playSentence = async (
    line: DialogueLine,
    autoAdvance = false,
    isLooping = false
  ): Promise<void> => {
    const currentToken = playToken.current;
    const isMp3 = hasMp3(dialogue.id, line.sira);
    const lineAudioUrl = isMp3
      ? getMp3Path(dialogue.id, line.sira)
      : undefined;
    const voice = getSpeakerVoice(line);
    const rate = mounted ? speechRate : 1;

    if (playToken.current !== currentToken) return;

    try {
      if (isMp3 && lineAudioUrl) {
        await playAudio(lineAudioUrl, line.sira, rate);
      } else {
        await playTTS(line.arapca, line.sira, rate, voice);
      }
    } catch {
      if (playToken.current !== currentToken) return;
      await playTTS(line.arapca, line.sira, rate, voice);
    }

    if (playToken.current !== currentToken) return;

    // 1. Eğer bu cümle için Tekrarla (Loop) aktifse 1 saniye bekleyip tekrar çal
    if (isLooping) {
      await new Promise((r) => setTimeout(r, 1000));
      if (playToken.current !== currentToken) return;
      await playSentence(line, false, true);
      return;
    }

    // 2. Eğer "2. Telaffuz & Mahreç Stüdyosu" modunda Otomatik Gölgeleme Akışı açıksa,
    // cümle okunduktan hemen sonra otomatik olarak ShadowingModal'ı aç
    if (studyMode === "shadowing" && autoShadowingFlow && !autoAdvance) {
      stop();
      setShadowingTarget({
        text: line.arapca,
        audioUrl: lineAudioUrl,
        voice,
      });
      return;
    }

    // 3. Sıralı Oynatma (Sequential) aktifse sonraki cümleye geç
    if (autoAdvance) {
      await new Promise((r) => setTimeout(r, 320));
      if (playToken.current !== currentToken) return;
      const nextLine = dialogue.satirlar.find((s) => s.sira === line.sira + 1);
      if (nextLine) {
        if (
          studyMode === "roleplay" &&
          nextLine.konusmaci === selectedRoleSpeaker
        ) {
          setIsPlayingAll(false);
          setRoleplayActiveLine(nextLine.sira);
          lineRefs.current[nextLine.sira]?.scrollIntoView({
            behavior: "smooth",
            block: "center",
          });
          return;
        }
        await playSentence(nextLine, true, false);
      } else {
        setIsPlayingAll(false);
        setRoleplayActiveLine(null);
        stop();
      }
    }
  };

  const handlePlayLine = (line: DialogueLine) => {
    playClick();
    playToken.current += 1;
    stop();
    setLoopingLineSira(null);
    setRoleplayActiveLine(null);

    if (flowMode === "sequential") {
      setIsPlayingAll(true);
      playSentence(line, true, false);
    } else {
      setIsPlayingAll(false);
      playSentence(line, false, false);
    }
  };

  const handleToggleLoopLine = (line: DialogueLine) => {
    playClick();
    playToken.current += 1;
    stop();
    setIsPlayingAll(false);
    setRoleplayActiveLine(null);

    if (loopingLineSira === line.sira) {
      setLoopingLineSira(null);
    } else {
      setLoopingLineSira(line.sira);
      playSentence(line, false, true);
    }
  };

  const handleTogglePlayAll = () => {
    playClick();
    setLoopingLineSira(null);
    if (isPlayingAll) {
      playToken.current += 1;
      stop();
      setIsPlayingAll(false);
      setRoleplayActiveLine(null);
    } else {
      setFlowMode("sequential");
      setIsPlayingAll(true);
      playToken.current += 1;
      const firstLine = dialogue.satirlar[0];
      if (
        studyMode === "roleplay" &&
        firstLine.konusmaci === selectedRoleSpeaker
      ) {
        setIsPlayingAll(false);
        setRoleplayActiveLine(firstLine.sira);
      } else {
        playSentence(firstLine, true, false);
      }
    }
  };

  const handleContinueRoleplayFromLine = (sira: number) => {
    playClick();
    setRoleplayActiveLine(null);
    const nextLine = dialogue.satirlar.find((s) => s.sira === sira + 1);
    if (!nextLine) {
      playSuccess();
      return;
    }
    if (nextLine.konusmaci === selectedRoleSpeaker) {
      setRoleplayActiveLine(nextLine.sira);
    } else {
      setIsPlayingAll(true);
      playToken.current += 1;
      playSentence(nextLine, true, false);
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

  const studyModes: {
    id: StudyMode;
    title: string;
    subtitle: string;
    icon: typeof BookOpen;
  }[] = [
    {
      id: "listen",
      title: "1. Dinle ve İncele",
      subtitle: "Doğal seslendirme ve morfolojik kelime ipuçlarıyla oku",
      icon: BookOpen,
    },
    {
      id: "shadowing",
      title: "2. Telaffuz & Mahreç Stüdyosu",
      subtitle: "Cümleleri 16kHz kendi sesinle kaydet ve mahrecini ölç",
      icon: Mic,
    },
    {
      id: "roleplay",
      title: "3. Karşılıklı Rol Yapma",
      subtitle: "Konuşmacı seçerek diyalogda sırayla konuş",
      icon: Users,
    },
    {
      id: "vocabulary",
      title: "4. Diyalog Sözlüğü",
      subtitle: `Bu diyalogdaki tüm kelimeler (${dialogueVocabEntries.length} Kelime)`,
      icon: BookMarked,
    },
  ];

  return (
    <div className="space-y-5">
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

      {/* BÖLÜM 1: DİYALOG KAPAK GÖRSELİ VE ÜST BAŞLIK KARTI */}
      <section className="bg-[#F7EFE1] dark:bg-[var(--surface)] rounded-2xl border-2 border-[#E6D7BE] dark:border-[var(--border)] border-b-4 overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-stretch">
          {/* Sol: Kapak Görseli (001.jpg - 060.jpg) */}
          <div className="relative h-40 md:h-auto md:w-64 lg:w-72 shrink-0 bg-[#E6D7BE]">
            <img
              src={imagePath}
              alt={dialogue.baslik_tr}
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/15 to-transparent md:bg-gradient-to-r md:from-transparent md:to-black/25" />
            <div className="absolute top-3 left-3 flex items-center gap-1.5">
              <Link
                href="/kutuphane"
                onClick={() => playClick()}
                className="h-9 px-3 rounded-xl bg-white/95 text-[#2b241d] font-extrabold text-xs border-2 border-[#E6D7BE] border-b-3 flex items-center gap-1 hover:bg-white transition-all"
              >
                <ChevronLeft size={16} />
                <span>Kütüphane</span>
              </Link>
              <span className="h-9 px-3 rounded-xl bg-[#0CA678] text-white font-extrabold text-xs flex items-center">
                {dialogue.seviye}
              </span>
            </div>
          </div>

          {/* Sağ: Başlık, İlerleme ve Hızlı Oynat */}
          <div className="p-4 sm:p-5 flex-1 flex flex-col justify-between gap-4">
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 border-b border-dashed border-[#E2D3B8] dark:border-[var(--border-dashed)] pb-3.5">
              <div>
                <span className="text-xs font-extrabold uppercase tracking-wider text-[#087F5B] dark:text-[#20c997]">
                  Diyalog #{String(rawNum).padStart(2, "0")} ·{" "}
                  {dialogue.satirlar.length} Cümle ·{" "}
                  {dialogueVocabEntries.length} Kelime
                </span>
                <h1 className="text-xl sm:text-2xl font-extrabold text-[var(--foreground)] mt-0.5">
                  {dialogue.baslik_tr}
                </h1>
              </div>

              <p
                dir="rtl"
                className="arabic text-3xl sm:text-4xl font-bold text-[#087F5B] dark:text-[#20c997] leading-none"
              >
                {getDisplayText(dialogue.baslik_ar)}
              </p>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleTogglePlayAll}
                  className={`h-10 px-4 rounded-xl font-bold text-xs border-b-4 transition-all flex items-center gap-2 cursor-pointer ${
                    isPlayingAll
                      ? "bg-red-600 hover:bg-red-700 text-white border-red-800"
                      : "bg-[#0CA678] hover:bg-[#099268] text-white border-[#087F5B]"
                  }`}
                >
                  {isPlayingAll ? (
                    <Square size={14} fill="currentColor" />
                  ) : (
                    <Play size={14} fill="currentColor" />
                  )}
                  <span>
                    {isPlayingAll
                      ? "Seslendirmeyi Durdur"
                      : "Tüm Diyaloğu Doğal Sesle Dinle"}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    playClick();
                    toggleFavoriteDialogue(dialogue.id);
                  }}
                  className={`h-10 px-3.5 rounded-xl border-2 border-b-4 text-xs font-extrabold flex items-center gap-1.5 transition-all cursor-pointer ${
                    isFav
                      ? "bg-red-50 border-red-300 text-red-600"
                      : "bg-white dark:bg-[var(--background)] border-[#E6D7BE] dark:border-[var(--border)] text-[var(--muted)] hover:text-red-500"
                  }`}
                >
                  <Heart size={15} fill={isFav ? "currentColor" : "none"} />
                  <span>{isFav ? "Favorilerde" : "Favori"}</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    playClick();
                    toggleCompletedDialogue(dialogue.id);
                  }}
                  className={`h-10 px-3.5 rounded-xl border-2 border-b-4 text-xs font-extrabold flex items-center gap-1.5 transition-all cursor-pointer ${
                    isCompleted
                      ? "bg-[#F3F0FF] border-[#6741D9] text-[#6741D9]"
                      : "bg-white dark:bg-[var(--background)] border-[#E6D7BE] dark:border-[var(--border)] text-[var(--muted)] hover:text-[#087F5B]"
                  }`}
                >
                  <CheckCircle2 size={15} />
                  <span>{isCompleted ? "Tamamlandı" : "Tamamla"}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* BÖLÜM 2: 4'LÜ ÇALIŞMA MODU SEÇİCİ KARTLAR */}
      <section aria-label="Diyalog Çalışma Modu">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          {studyModes.map((mode) => {
            const isSelected = studyMode === mode.id;
            const Icon = mode.icon;
            return (
              <button
                key={mode.id}
                type="button"
                onClick={() => {
                  playClick();
                  setStudyMode(mode.id);
                  setRoleplayActiveLine(null);
                }}
                className={`relative text-left p-4 rounded-2xl border-2 border-b-4 transition-all cursor-pointer ${
                  isSelected
                    ? "bg-[#F3F0FF] dark:bg-[var(--lavender-bg)] border-[#6741D9] -translate-y-0.5"
                    : "bg-[#F7EFE1] dark:bg-[var(--surface)] border-[#E6D7BE] dark:border-[var(--border)] hover:border-[#cbb692]"
                }`}
              >
                {isSelected && (
                  <span className="absolute top-3 right-3 w-6 h-6 rounded-full bg-[#6741D9] text-white flex items-center justify-center">
                    <Check size={14} strokeWidth={3} />
                  </span>
                )}
                <div className="flex items-center gap-2.5 mb-1.5">
                  <div
                    className={`w-8 h-8 rounded-xl border flex items-center justify-center shrink-0 ${
                      isSelected
                        ? "bg-[#6741D9] border-[#5230B5] text-white"
                        : "bg-white dark:bg-[var(--background)] border-[#E6D7BE] text-[#087F5B]"
                    }`}
                  >
                    <Icon size={16} strokeWidth={2.4} />
                  </div>
                  <span
                    className={`text-sm font-extrabold pr-6 ${
                      isSelected
                        ? "text-[#4C28B5] dark:text-[#d0bfff]"
                        : "text-[var(--foreground)]"
                    }`}
                  >
                    {mode.title}
                  </span>
                </div>
                <p className="text-xs text-[var(--muted)] leading-snug">
                  {mode.subtitle}
                </p>
              </button>
            );
          })}
        </div>
      </section>

      {/* BÖLÜM 3: KESİK ÇİZGİLİ KONTROL SATIRLARI (GLOBAL AYARLARLA TAM SENKRON) */}
      <section className="bg-[#F7EFE1] dark:bg-[var(--surface)] rounded-2xl border-2 border-[#E6D7BE] dark:border-[var(--border)] border-b-4 px-4 sm:px-6 py-2">
        {/* Satır 1: Görünüm ve Çeviri Modu (useSettings().viewMode + Tıkla-Gör) */}
        <div className="py-3 border-b border-dashed border-[#E2D3B8] dark:border-[var(--border-dashed)] flex flex-col lg:flex-row lg:items-center justify-between gap-2.5">
          <div className="flex items-center gap-2">
            <Columns2 size={17} className="text-[#087F5B] shrink-0" />
            <div>
              <span className="text-sm font-extrabold text-[var(--foreground)]">
                Diyalog Görünüm & Çeviri Modu
              </span>
              <span className="block text-[11px] text-[var(--muted)]">
                Alt alta, iki sütun, sadece Arapça, sadece Türkçe (kendini sına)
                veya tıkla-gör
              </span>
            </div>
          </div>

          <div className="bg-white dark:bg-[var(--background)] rounded-xl p-1 border border-[#E6D7BE] dark:border-[var(--border)] flex flex-wrap items-center gap-1 self-start lg:self-auto">
            {(
              [
                { id: "stacked", label: "Alt Alta" },
                { id: "columns", label: "İki Sütun" },
                { id: "arabic-only", label: "Sadece Arapça" },
                { id: "turkish-only", label: "Sadece Türkçe" },
              ] as { id: ViewMode; label: string }[]
            ).map((opt) => {
              const active =
                !clickToRevealTr && currentViewMode === opt.id;
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
                  className={`px-3 py-1.5 text-xs rounded-lg transition-all whitespace-nowrap cursor-pointer ${
                    active
                      ? "bg-[#0CA678] text-white font-semibold"
                      : "text-[var(--muted)] font-medium hover:text-[var(--foreground)]"
                  }`}
                >
                  {opt.label}
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
              className={`px-3 py-1.5 text-xs rounded-lg transition-all whitespace-nowrap cursor-pointer ${
                clickToRevealTr
                  ? "bg-[#0CA678] text-white font-semibold"
                  : "text-[var(--muted)] font-medium hover:text-[var(--foreground)]"
              }`}
            >
              Tıkla-Gör
            </button>
          </div>
        </div>

        {/* Satır 2: Okuma Hızı */}
        <div className="py-3 border-b border-dashed border-[#E2D3B8] dark:border-[var(--border-dashed)] flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div className="flex items-center gap-2">
            <Gauge size={17} className="text-[#087F5B] shrink-0" />
            <span className="text-sm font-extrabold text-[var(--foreground)]">
              Okuma Hızı
            </span>
          </div>

          <div className="bg-white dark:bg-[var(--background)] rounded-xl p-1 border border-[#E6D7BE] dark:border-[var(--border)] flex flex-wrap items-center gap-1 self-start sm:self-auto">
            {(
              [
                { rate: 0.5, label: "Çok Yavaş (0.5x)" },
                { rate: 0.75, label: "Yavaş (0.75x)" },
                { rate: 1, label: "Normal (1.0x)" },
                { rate: 1.25, label: "Hızlı (1.25x)" },
              ] as { rate: SpeechRate; label: string }[]
            ).map((item) => (
              <button
                key={item.rate}
                type="button"
                onClick={() => {
                  playClick();
                  setSpeechRate(item.rate);
                }}
                className={`px-3 py-1.5 text-xs tabular-nums rounded-lg transition-all whitespace-nowrap cursor-pointer ${
                  (mounted ? speechRate : 1) === item.rate
                    ? "bg-[#0CA678] text-white font-semibold"
                    : "text-[var(--muted)] font-medium hover:text-[var(--foreground)]"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {/* Satır 3: Akış Modu */}
        <div
          className={`py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 ${
            studyMode === "roleplay" || studyMode === "shadowing"
              ? "border-b border-dashed border-[#E2D3B8] dark:border-[var(--border-dashed)]"
              : ""
          }`}
        >
          <div className="flex items-center gap-2">
            <ListMusic size={17} className="text-[#087F5B] shrink-0" />
            <span className="text-sm font-extrabold text-[var(--foreground)]">
              Akış Modu
            </span>
          </div>

          <div className="bg-white dark:bg-[var(--background)] rounded-xl p-1 border border-[#E6D7BE] dark:border-[var(--border)] flex flex-wrap items-center gap-1 self-start sm:self-auto">
            <button
              type="button"
              onClick={() => {
                playClick();
                setFlowMode("single");
                if (isPlayingAll) {
                  playToken.current += 1;
                  stop();
                  setIsPlayingAll(false);
                }
              }}
              className={`px-3 py-1.5 text-xs rounded-lg transition-all whitespace-nowrap cursor-pointer ${
                flowMode === "single"
                  ? "bg-[#0CA678] text-white font-semibold"
                  : "text-[var(--muted)] font-medium hover:text-[var(--foreground)]"
              }`}
            >
              Cümle Cümle
            </button>
            <button
              type="button"
              onClick={() => {
                playClick();
                setFlowMode("sequential");
                if (!isPlayingAll) handleTogglePlayAll();
              }}
              className={`px-3 py-1.5 text-xs rounded-lg transition-all whitespace-nowrap cursor-pointer ${
                flowMode === "sequential"
                  ? "bg-[#0CA678] text-white font-semibold"
                  : "text-[var(--muted)] font-medium hover:text-[var(--foreground)]"
              }`}
            >
              Tüm Diyaloğu Sırayla Çal
            </button>
          </div>
        </div>

        {/* Satır 4A (Sadece 2. Telaffuz & Mahreç Stüdyosu Modunda): Otomatik Gölgeleme Akışı */}
        {studyMode === "shadowing" && (
          <div className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <div className="flex items-center gap-2">
              <Mic size={17} className="text-[#6741D9] shrink-0" />
              <div>
                <span className="text-sm font-extrabold text-[var(--foreground)]">
                  🎙️ Otomatik Gölgeleme Akışı
                </span>
                <span className="block text-xs text-[var(--muted)]">
                  Cümleyi doğal sesle dinledikten hemen sonra Gölgeleme &
                  Mahreç Koçunu otomatik aç
                </span>
              </div>
            </div>

            <div className="bg-white dark:bg-[var(--background)] rounded-xl p-1 border border-[#E6D7BE] dark:border-[var(--border)] flex items-center gap-1 self-start sm:self-auto">
              <button
                type="button"
                onClick={() => {
                  playClick();
                  setAutoShadowingFlow(true);
                }}
                className={`px-3.5 py-1.5 text-xs rounded-lg transition-all cursor-pointer ${
                  autoShadowingFlow
                    ? "bg-[#0CA678] text-white font-semibold"
                    : "text-[var(--muted)] font-medium hover:text-[var(--foreground)]"
                }`}
              >
                Açık (Otomatik Koç)
              </button>
              <button
                type="button"
                onClick={() => {
                  playClick();
                  setAutoShadowingFlow(false);
                }}
                className={`px-3.5 py-1.5 text-xs rounded-lg transition-all cursor-pointer ${
                  !autoShadowingFlow
                    ? "bg-[#0CA678] text-white font-semibold"
                    : "text-[var(--muted)] font-medium hover:text-[var(--foreground)]"
                }`}
              >
                Manuel
              </button>
            </div>
          </div>
        )}

        {/* Satır 4B (Sadece Rol Yapma Modunda): Karakter Seçimi */}
        {studyMode === "roleplay" && speakers.length > 0 && (
          <div className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <div className="flex items-center gap-2">
              <Users size={17} className="text-[#6741D9] shrink-0" />
              <div>
                <span className="text-sm font-extrabold text-[var(--foreground)]">
                  Canlandıracağınız Karakteri Seçin
                </span>
                <span className="block text-xs text-[var(--muted)]">
                  Diğer karakteri uygulama doğal sesle okur, sıra size gelince
                  bekler
                </span>
              </div>
            </div>

            <div className="bg-white dark:bg-[var(--background)] rounded-xl p-1 border border-[#E6D7BE] dark:border-[var(--border)] flex flex-wrap items-center gap-1 self-start sm:self-auto">
              {speakers.map((sp, idx) => (
                <button
                  key={sp}
                  type="button"
                  onClick={() => {
                    playClick();
                    setSelectedRoleSpeaker(sp);
                    setRoleplayActiveLine(null);
                  }}
                  className={`px-3.5 py-1.5 text-xs rounded-lg transition-all whitespace-nowrap cursor-pointer ${
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
        )}
      </section>

      {/* BÖLÜM 4: DİYALOG SATIRLARI VEYA MORFOLOJİK DİYALOG SÖZLÜĞÜ */}
      {studyMode === "vocabulary" ? (
        <section className="space-y-4">
          <div className="bg-[#F7EFE1] dark:bg-[var(--surface)] rounded-2xl border-2 border-[#E6D7BE] dark:border-[var(--border)] border-b-4 px-4 py-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm sm:text-base font-extrabold text-[var(--foreground)]">
                Bu Diyalogdaki Tüm Kelimeler ({dialogueVocabEntries.length})
              </h2>
              <p className="text-xs font-medium text-[var(--muted)]">
                Metindeki çekimli halleri, ek/zamir çözümlemesi ve sözlükteki
                yalın kök formları
              </p>
            </div>
            <button
              type="button"
              onClick={() => setStudyMode("listen")}
              className="px-3.5 py-1.5 rounded-xl bg-[#0CA678] text-white text-xs font-bold border-b-3 border-[#087F5B] cursor-pointer"
            >
              ← Diyalog Metnine Dön
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {dialogueVocabEntries.map((entry: DialogueVocabularyEntry) => {
              const word = entry.item;
              const isFav = mounted && isWordFavorite(word.id);
              const isLearned = mounted && isWordLearned(word.id);
              const mainAr = word.mufret || word.mazi || "";

              return (
                <div
                  key={word.id}
                  className={`rounded-2xl border-2 border-b-4 p-4 flex flex-col justify-between space-y-3 ${
                    isLearned
                      ? "bg-[#F3F0FF] dark:bg-[var(--lavender-bg)] border-[#6741D9]"
                      : "bg-[#F7EFE1] dark:bg-[var(--surface)] border-[#E6D7BE] dark:border-[var(--border)]"
                  }`}
                >
                  <div className="space-y-2.5">
                    {/* Üst: Tür, Kök, Türkçe Anlam ve Yalın Arapça */}
                    <div className="flex items-start justify-between gap-2 border-b border-dashed border-[#E2D3B8] pb-2.5">
                      <div>
                        <span className="text-[11px] font-bold uppercase text-[#087F5B]">
                          {word.tur} · Kök: {word.kok}
                        </span>
                        <p className="text-sm font-extrabold text-[var(--foreground)] mt-1">
                          {word.anlam_tr}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <span
                          dir="rtl"
                          className="arabic text-3xl font-bold text-[#087F5B] dark:text-[#20c997] block leading-tight"
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

                    {/* Morfolojik Çözümleme Notu */}
                    {entry.morphologyNote && (
                      <div className="bg-white dark:bg-[var(--background)] rounded-xl px-3 py-1.5 border border-[#E6D7BE] text-[11px] font-bold text-[#4C28B5] dark:text-[#d0bfff]">
                        <span className="text-[10px] uppercase tracking-wider text-[#6741D9] block">
                          Morfolojik Çözümleme (Cümle #{entry.lineNumber}):
                        </span>
                        <span dir="rtl" className="block text-right">
                          {entry.morphologyNote}
                        </span>
                      </div>
                    )}

                    {/* Çoğul / Muzari / Masdar Bilgisi */}
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

                  {/* Alt Butonlar */}
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
                        isFav
                          ? "bg-red-50 border-red-300 text-red-600"
                          : "bg-white dark:bg-[var(--background)] border-[#E6D7BE] text-[var(--muted)]"
                      }`}
                    >
                      <Heart size={14} fill={isFav ? "currentColor" : "none"} />
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
          </div>
        </section>
      ) : (
        <section className="space-y-3">
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

            // Çeviri ve Arapça görünürlük durumları
            const isTrRevealed =
              (!clickToRevealTr &&
                currentViewMode !== "arabic-only") ||
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
                className={`rounded-2xl border-2 border-b-4 p-4 sm:p-5 transition-all scroll-mt-28 ${
                  isPlaying || isWaitingUser || isLooping
                    ? "bg-[#F3F0FF] dark:bg-[var(--lavender-bg)] border-[#6741D9] shadow-md"
                    : isUserRoleTurn
                    ? "bg-[#FDFBF7] dark:bg-[var(--background)] border-[#0CA678]"
                    : "bg-[#F7EFE1] dark:bg-[var(--surface)] border-[#E6D7BE] dark:border-[var(--border)]"
                }`}
              >
                {/* Üst Satır: Konuşmacı Rozeti + Seslendirme, Döngü (Loop) & Gölgeleme Butonları */}
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-dashed border-[#E2D3B8] dark:border-[var(--border-dashed)] pb-3 mb-3">
                  <div className="flex items-center gap-2">
                    <span
                      className={`px-3 py-1 rounded-xl text-xs font-extrabold border-b-2 ${
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
                  </div>

                  {/* Aksiyon Kontrolleri */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    {/* Doğal Ses / MP3 Dinleme Butonu */}
                    <button
                      type="button"
                      onClick={() => handlePlayLine(line)}
                      className={`h-9 px-3 rounded-xl border-2 border-b-3 text-xs font-extrabold inline-flex items-center gap-1.5 transition-all cursor-pointer ${
                        isPlaying && !isLooping
                          ? "bg-[#0CA678] border-[#087F5B] text-white"
                          : "bg-white dark:bg-[var(--background)] border-[#E6D7BE] dark:border-[var(--border)] text-[var(--foreground)] hover:border-[#0CA678]"
                      }`}
                      title="Doğal Sesle Dinle"
                    >
                      <Volume2
                        size={14}
                        className={
                          isPlaying && !isLooping
                            ? "text-white"
                            : "text-[#0CA678]"
                        }
                      />
                      <span>
                        {isPlaying && !isLooping ? "Çalıyor" : "Dinle"}
                      </span>
                    </button>

                    {/* 🔁 Tekrarla (Loop) Butonu */}
                    <button
                      type="button"
                      onClick={() => handleToggleLoopLine(line)}
                      className={`h-9 px-2.5 rounded-xl border-2 border-b-3 text-xs font-extrabold inline-flex items-center gap-1 transition-all cursor-pointer ${
                        isLooping
                          ? "bg-[#6741D9] border-[#5230B5] text-white"
                          : "bg-white dark:bg-[var(--background)] border-[#E6D7BE] dark:border-[var(--border)] text-[var(--muted)] hover:text-[#6741D9] hover:border-[#6741D9]"
                      }`}
                      title="Bu cümleyi durdurana kadar 1 sn arayla döngüde çal"
                    >
                      <Repeat size={13} className={isLooping ? "animate-spin" : ""} />
                      <span className="hidden sm:inline">
                        {isLooping ? "Döngüde" : "Tekrarla"}
                      </span>
                    </button>

                    {/* Gölgeleme & Ses Kaydı Butonu (showShadowing ayarına bağlı) */}
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

                {/* CÜMLE İÇERİĞİ: columns (İki Sütun) vs stacked / arabic-only / turkish-only */}
                {currentViewMode === "columns" && !clickToRevealTr ? (
                  <div className="md:grid md:grid-cols-2 md:gap-6 items-center space-y-3 md:space-y-0">
                    {/* Sol Sütun (Masaüstü): Türkçe Çeviri */}
                    <div
                      dir="ltr"
                      className="order-2 md:order-1 bg-white/70 dark:bg-[var(--background)]/60 rounded-xl p-3 border border-[#E6D7BE] dark:border-[var(--border)]"
                    >
                      <p
                        style={{ fontSize: `${turkishFontSize}px` }}
                        className="text-[var(--muted)] font-semibold leading-snug"
                      >
                        {line.turkce}
                      </p>
                    </div>

                    {/* Sağ Sütun (Masaüstü): Harekeli Arapça */}
                    <div
                      dir="rtl"
                      style={{ fontSize: `${arabicFontSize}px` }}
                      className="order-1 md:order-2 arabic font-bold text-[var(--foreground)] text-right leading-[1.9] py-1"
                    >
                      <WordTooltip text={getDisplayText(line.arapca)} />
                    </div>
                  </div>
                ) : (
                  <>
                    {/* Sadece Türkçe (Kendini Sına Modu) ise Önce Türkçe Gösterilir */}
                    {currentViewMode === "turkish-only" && (
                      <div
                        dir="ltr"
                        className="mb-3 pb-2.5 border-b border-dashed border-[#E2D3B8] dark:border-[var(--border-dashed)]"
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

                    {/* Orta Satır: Harekeli Arapça Cümle (Arakom Fontu + Morfolojik WordTooltip) */}
                    {isArRevealed ? (
                      <div
                        dir="rtl"
                        style={{ fontSize: `${arabicFontSize}px` }}
                        className="arabic font-bold text-[var(--foreground)] text-right leading-[1.9] py-1"
                      >
                        <WordTooltip text={getDisplayText(line.arapca)} />
                      </div>
                    ) : (
                      <div className="flex items-center justify-between gap-3 bg-white/80 dark:bg-[var(--background)] rounded-xl p-3 border border-[#E6D7BE]">
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
                          className="inline-flex items-center gap-1.5 text-xs font-extrabold text-white bg-[#0CA678] hover:bg-[#099268] px-3.5 py-2 rounded-xl border-b-3 border-[#087F5B] shrink-0 cursor-pointer"
                        >
                          <Eye size={14} />
                          <span>Arapçasını Göster</span>
                        </button>
                      </div>
                    )}

                    {/* Alt Satır: Türkçe Çeviri (stacked, arabic-only veya click-to-reveal) */}
                    {currentViewMode !== "turkish-only" && (
                      <div
                        dir="ltr"
                        className="mt-3 pt-2.5 border-t border-dashed border-[#E2D3B8] dark:border-[var(--border-dashed)]"
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
                            className="inline-flex items-center gap-1.5 text-xs font-bold text-[#087F5B] bg-white dark:bg-[var(--background)] px-3 py-1.5 rounded-xl border border-[#E6D7BE] hover:border-[#0CA678] cursor-pointer"
                          >
                            <Eye size={13} />
                            <span>Türkçe Çeviriyi Göster</span>
                          </button>
                        )}
                      </div>
                    )}
                  </>
                )}

                {/* Telaffuz Antrenmanı Modunda Hızlı Koçluk Çubuğu */}
                {studyMode === "shadowing" && (
                  <div className="mt-3 pt-2.5 border-t border-dashed border-[#E2D3B8] flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-[var(--muted)]">
                      Bu cümleyi yüksek sesle okuyup mahreç puanınızı ölçün:
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        playClick();
                        setShadowingTarget({
                          text: line.arapca,
                          audioUrl: lineAudioUrl,
                          voice: voiceForLine,
                        });
                      }}
                      className="px-3.5 py-1.5 rounded-xl bg-[#0CA678] text-white text-xs font-bold border-b-3 border-[#087F5B] inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <Sparkles size={13} />
                      <span>Mahreç Analizi Yap</span>
                    </button>
                  </div>
                )}

                {/* Rol Yapma Modunda Sıra Öğrencideyse Gösterilen Rehber */}
                {isWaitingUser && (
                  <div className="mt-3 p-3 rounded-xl bg-white dark:bg-[var(--background)] border-2 border-[#6741D9] flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                    <span className="text-xs font-extrabold text-[#6741D9]">
                      🎤 Sıra Sizde ({line.konusmaci}): Cümleyi yüksek sesle
                      okuyun veya kaydedin, ardından diyaloğu sürdürün.
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
                        className="px-3 py-1.5 rounded-xl bg-[#F3F0FF] border border-[#6741D9] text-xs font-extrabold text-[#6741D9] cursor-pointer"
                      >
                        Telaffuzumu Ölç
                      </button>
                      <button
                        type="button"
                        onClick={() => handleContinueRoleplayFromLine(line.sira)}
                        className="px-3.5 py-1.5 rounded-xl bg-[#0CA678] text-white text-xs font-extrabold border-b-3 border-[#087F5B] cursor-pointer"
                      >
                        Okudum, Devam Et →
                      </button>
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
          className="w-full py-4 px-6 bg-[#0CA678] hover:bg-[#099268] text-white font-bold text-base sm:text-lg rounded-2xl border-b-4 border-[#087F5B] active:border-b-0 active:translate-y-1 transition-all flex items-center justify-center gap-2.5 shadow-sm cursor-pointer"
        >
          <CheckCircle2 size={20} />
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
              className="p-3.5 rounded-2xl bg-[#F7EFE1] dark:bg-[var(--surface)] border-2 border-[#E6D7BE] dark:border-[var(--border)] border-b-4 flex items-center gap-2 text-xs font-extrabold text-[var(--foreground)] hover:border-[#0CA678] transition-all"
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
              className="p-3.5 rounded-2xl bg-[#F7EFE1] dark:bg-[var(--surface)] border-2 border-[#E6D7BE] dark:border-[var(--border)] border-b-4 flex items-center justify-end gap-2 text-xs font-extrabold text-[var(--foreground)] hover:border-[#0CA678] transition-all text-right"
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