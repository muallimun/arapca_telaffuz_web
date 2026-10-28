"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useUserStore } from "@/store/userStore";
import { useSettings, SpeechRate } from "@/store/settings";
import { useAudioStore } from "@/store/audioStore";
import { sozluk } from "@/lib/data";
import { analyzeAndMatchWord } from "@/lib/dict";
import { normalizeToCanonicalMistakeId } from "@/lib/mistakeUtils";
import {
  playTTS,
  playAudioElement,
  stopAllAudio,
  VoiceOption,
} from "@/lib/audio";
import { normalizeArabicForPronunciation } from "@/lib/arabicTextUtils";
import { HybridSpeechManager, SttEngineType } from "@/lib/speechManager";
import {
  X,
  Play,
  Square,
  Mic,
  RotateCcw,
  Activity,
  Volume2,
  AlertTriangle,
  Cpu,
  Info,
  Download,
  Award,
  CheckCircle2,
  Gauge,
  Target,
  ArrowLeft,
  TrendingUp,
} from "lucide-react";

import {
  buildProactiveMakhrajGuide,
  evaluateSentenceWords,
  evaluateAdaptiveCoaching,
  ProactiveGuide,
  SentenceEvaluationResult,
  WordEvaluationResult,
  AdaptiveCoachingResult,
} from "@/lib/arabicNlpEngine";

import {
  extractAudioEnvelope,
  calculateRhythmMatch,
  calculateTempoScore,
  calculateOverallFluency,
  evaluateAcousticDspSentence,
  start16kHzRecorder,
  RecordingSession16kHz,
} from "@/lib/audioAnalysis";
import {
  playRecordStart,
  playRecordStop,
  playSuccess,
  playPartial,
  playError,
  playClick,
} from "@/lib/sfxManager";

export interface TargetForm {
  label: string;
  arabic: string;
}

interface Props {
  text: string;
  itemId?: string;
  refAudioUrl?: string;
  forms?: TargetForm[];
  voice?: VoiceOption;
  level?: string;
  onClose: () => void;
}

const DEFAULT_BARS = Array(48).fill(0.08);

export default function ShadowingModal({
  text,
  itemId,
  refAudioUrl,
  forms,
  voice = "male",
  level = "A1",
  onClose,
}: Props) {
  const [activeText, setActiveText] = useState<string>(text);
  const [activeFormLabel, setActiveFormLabel] = useState<string>(
    forms?.[0]?.label || ""
  );
  const [isMicroDrill, setIsMicroDrill] = useState<boolean>(false);

  const {
    addWeakWord,
    addMistake,
    removeMistake,
    isMistake,
    recordPronunciationScore,
    pronunciationScores,
  } = useUserStore();
  const {
    speechRate,
    setSpeechRate,
    sttEngine,
    setSttEngine,
    setPreferredLevel,
  } = useSettings();

  const [isRecording, setIsRecording] = useState(false);
  const [userAudioUrl, setUserAudioUrl] = useState<string | null>(null);
  const [userWavBlob, setUserWavBlob] = useState<Blob | null>(null);
  const [isPlayingRef, setIsPlayingRef] = useState(false);
  const [isPlayingUser, setIsPlayingUser] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [whisperStatus, setWhisperStatus] = useState<string>("");
  const [liveInterimText, setLiveInterimText] = useState<string>("");
  const [usedEngineBadge, setUsedEngineBadge] = useState<SttEngineType | null>(
    null
  );

  const [refBars, setRefBars] = useState<number[]>(DEFAULT_BARS);
  const [userBars, setUserBars] = useState<number[]>(DEFAULT_BARS);

  const [evaluation, setEvaluation] =
    useState<SentenceEvaluationResult | null>(null);
  const proactiveGuide: ProactiveGuide = useMemo(
    () => buildProactiveMakhrajGuide(activeText),
    [activeText]
  );
  const [activeWordTip, setActiveWordTip] =
    useState<WordEvaluationResult | null>(null);
  const [rhythmScore, setRhythmScore] = useState<number | null>(null);
  const [tempoScore, setTempoScore] = useState<number | null>(null);
  const [fluencyScore, setFluencyScore] = useState<number | null>(null);
  const [refDuration, setRefDuration] = useState<number>(0);
  const [userDuration, setUserDuration] = useState<number>(0);
  const [adaptiveResult, setAdaptiveResult] =
    useState<AdaptiveCoachingResult | null>(null);
  const [silentWarning, setSilentWarning] = useState<string | null>(null);
  const [dspFallbackNotice, setDspFallbackNotice] = useState<string | null>(
    null
  );

  const audioStore = useAudioStore();

  const speechManagerRef = useRef<HybridSpeechManager | null>(null);
  const recordingSessionRef = useRef<RecordingSession16kHz | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const rafIdRef = useRef<number | null>(null);
  const finalTranscriptRef = useRef<string>("");
  const interimTranscriptRef = useRef<string>("");
  const userAudioPlayerRef = useRef<HTMLAudioElement | null>(null);
  const refAudioBufferRef = useRef<AudioBuffer | null>(null);

  const cleanupMediaResources = useCallback(() => {
    if (rafIdRef.current !== null && typeof window !== "undefined") {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
    if (mediaRecorderRef.current) {
      try {
        if (mediaRecorderRef.current.state !== "inactive") {
          mediaRecorderRef.current.stop();
        }
      } catch {
        // ignore
      }
      mediaRecorderRef.current = null;
    }
    if (recordingSessionRef.current) {
      try {
        recordingSessionRef.current.killStreamImmediately();
      } catch {
        // ignore
      }
      recordingSessionRef.current = null;
    }
    if (mediaStreamRef.current) {
      try {
        mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      } catch {
        // ignore
      }
      mediaStreamRef.current = null;
    }
    if (audioContextRef.current) {
      try {
        if (audioContextRef.current.state !== "closed") {
          audioContextRef.current.close().catch(() => {});
        }
      } catch {
        // ignore
      }
      audioContextRef.current = null;
    }
    speechManagerRef.current?.stopLiveWebSpeech();
    if (typeof window !== "undefined") {
      window.speechSynthesis?.cancel();
    }
  }, []);

  const handleClose = useCallback(() => {
    cleanupMediaResources();
    stopAllAudio();
    onClose();
  }, [cleanupMediaResources, onClose]);

  // Unmount sırasında açık kalan MediaStream, AudioContext, RAF ve Web Speech kaydını KESİNLİKLE kapat
  useEffect(() => {
    speechManagerRef.current = new HybridSpeechManager();
    return () => {
      cleanupMediaResources();
      speechManagerRef.current?.terminate();
    };
  }, [cleanupMediaResources]);

  useEffect(() => {
    return () => {
      if (userAudioUrl) URL.revokeObjectURL(userAudioUrl);
    };
  }, [userAudioUrl]);

  // Referans ses zarfını (48 bar) ve süresini hazırla (2 Aşamalı Fallback: 1. refAudioUrl -> 2. /api/tts -> 3. Math.sin tahmini)
  useEffect(() => {
    let cancelled = false;
    const voiceGender =
      voice === "K" || voice === "female" || voice === "ar-SA-ZariyahNeural"
        ? "female"
        : "male";
    const ttsUrl = `/api/tts?text=${encodeURIComponent(
      activeText
    )}&voice=${voiceGender}`;
    const shouldTryRefUrl = Boolean(
      refAudioUrl && activeText === text && !isMicroDrill
    );

    const decodeFromUrl = async (url: string): Promise<AudioBuffer> => {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Audio fetch failed: ${res.status}`);
      const ab = await res.arrayBuffer();
      if (ab.byteLength <= 128) throw new Error("Empty audio buffer");
      const ctx = new AudioContext();
      try {
        return await ctx.decodeAudioData(ab);
      } finally {
        await ctx.close().catch(() => {});
      }
    };

    (async () => {
      let decodedBuffer: AudioBuffer | null = null;

      // 1. Aşama: Varsa yerel/referans MP3 URL'sini dene
      if (shouldTryRefUrl && refAudioUrl) {
        try {
          decodedBuffer = await decodeFromUrl(refAudioUrl);
        } catch {
          decodedBuffer = null;
        }
      }

      // 2. Aşama: Referans MP3 yoksa veya başarısız olduysa ve çevrimiçiyse /api/tts dene
      if (
        !decodedBuffer &&
        (typeof navigator === "undefined" || navigator.onLine !== false)
      ) {
        try {
          decodedBuffer = await decodeFromUrl(ttsUrl);
        } catch {
          decodedBuffer = null;
        }
      }

      if (cancelled) return;

      if (decodedBuffer) {
        refAudioBufferRef.current = decodedBuffer;
        const env = extractAudioEnvelope(decodedBuffer, 48);
        setRefBars(env.bars);
        setRefDuration(decodedBuffer.duration);
      } else {
        // 3. Aşama: Çevrimdışıysa veya her iki istek de başarısızsa Math.sin tahmini
        refAudioBufferRef.current = null;
        const estimated = activeText.trim().split(/\s+/).length * 0.65 + 0.5;
        setRefDuration(estimated);
        setRefBars(
          Array.from({ length: 48 }, (_, idx) =>
            Math.max(0.12, Math.abs(Math.sin(idx * 0.35)) * 0.85)
          )
        );
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [refAudioUrl, activeText, text, voice, isMicroDrill]);

  // Doğal Sesle Kelimeyi Dinle
  const speakWord = async (wordToSpeak: string) => {
    if (!wordToSpeak) return;
    playClick();
    await playTTS(wordToSpeak, Math.min(1, speechRate), voice);
  };

  const resetAnalysisState = () => {
    setEvaluation(null);
    setActiveWordTip(null);
    setRhythmScore(null);
    setTempoScore(null);
    setFluencyScore(null);
    setSilentWarning(null);
    setDspFallbackNotice(null);
    if (userAudioUrl) URL.revokeObjectURL(userAudioUrl);
    setUserAudioUrl(null);
    setUserWavBlob(null);
    setUserBars(DEFAULT_BARS);
    setAdaptiveResult(null);
  };

  const handleFormChange = (selectedArabic: string) => {
    playClick();
    const selectedLabel =
      forms?.find((f) => f.arabic === selectedArabic)?.label || "";
    setActiveText(selectedArabic);
    setActiveFormLabel(selectedLabel);
    setIsMicroDrill(false);
    resetAnalysisState();
  };

  // Odaklı Kelime Antrenmanı (Micro-Drill) Başlat / Cümleye Dön
  const startMicroDrillOnWord = (targetWord: string) => {
    if (!targetWord) return;
    playClick();
    setActiveText(targetWord);
    setActiveFormLabel("Odaklı Kelime Antrenmanı (Micro-Drill)");
    setIsMicroDrill(true);
    resetAnalysisState();
    speakWord(targetWord);
  };

  const returnToFullSentence = () => {
    playClick();
    setActiveText(text);
    setActiveFormLabel(forms?.[0]?.label || "");
    setIsMicroDrill(false);
    resetAnalysisState();
  };

  const playReference = async () => {
    playClick();
    if (isPlayingRef) return;
    setIsPlayingRef(true);
    try {
      if (refAudioUrl && activeText === text && !isMicroDrill) {
        try {
          await playAudioElement(refAudioUrl, speechRate);
          return;
        } catch {
          // Yerel MP3 oynatılamazsa Neural TTS'e düş
        }
      }
      await playTTS(activeText, speechRate, voice);
    } finally {
      setIsPlayingRef(false);
    }
  };

  const playUserWav = () => {
    playClick();
    if (!userAudioUrl || !userAudioPlayerRef.current) return;
    if (isPlayingUser) {
      userAudioPlayerRef.current.pause();
      userAudioPlayerRef.current.currentTime = 0;
      setIsPlayingUser(false);
    } else {
      audioStore.stop();
      stopAllAudio();
      if (typeof window !== "undefined") {
        window.speechSynthesis?.cancel();
      }
      setIsPlayingRef(false);
      userAudioPlayerRef.current.currentTime = 0;
      userAudioPlayerRef.current
        .play()
        .then(() => setIsPlayingUser(true))
        .catch(() => setIsPlayingUser(false));
    }
  };

  const startRecording = async () => {
    // Arka planda çalan diyalog veya TTS sesinin mikrofona karışmaması için anında sustur
    audioStore.stop();
    stopAllAudio();
    if (typeof window !== "undefined") {
      window.speechSynthesis?.cancel();
    }
    if (userAudioPlayerRef.current) {
      userAudioPlayerRef.current.pause();
      userAudioPlayerRef.current.currentTime = 0;
    }
    setIsPlayingRef(false);
    setIsPlayingUser(false);

    cleanupMediaResources();
    playRecordStart();

    if (userAudioUrl) URL.revokeObjectURL(userAudioUrl);
    setUserAudioUrl(null);
    setUserWavBlob(null);
    setEvaluation(null);
    setActiveWordTip(null);
    setWhisperStatus("");
    setLiveInterimText("");
    setRhythmScore(null);
    setTempoScore(null);
    setFluencyScore(null);
    setAdaptiveResult(null);
    setSilentWarning(null);
    setDspFallbackNotice(null);
    setUsedEngineBadge(null);
    setUserBars(DEFAULT_BARS);
    finalTranscriptRef.current = "";
    interimTranscriptRef.current = "";

    try {
      // Paralel olarak Web Speech API'yi başlat (hem hızlı motor hem de Whisper fallback için)
      speechManagerRef.current?.startLiveWebSpeech({
        onInterimTranscript: (combined, finalPart, interimPart) => {
          if (typeof finalPart === "string" && finalPart.trim()) {
            finalTranscriptRef.current = finalPart.trim();
          }
          if (typeof interimPart === "string") {
            interimTranscriptRef.current = interimPart.trim();
          } else if (combined && !finalTranscriptRef.current) {
            interimTranscriptRef.current = combined.trim();
          }
          setLiveInterimText(combined);
        },
      });

      const session = await start16kHzRecorder({
        onLiveRms: (_rms, liveHistory) => {
          if (rafIdRef.current !== null) {
            cancelAnimationFrame(rafIdRef.current);
          }
          rafIdRef.current = requestAnimationFrame(() => {
            const padded = [
              ...Array(Math.max(0, 48 - liveHistory.length)).fill(0.06),
              ...liveHistory.slice(-48),
            ];
            setUserBars(padded);
            rafIdRef.current = null;
          });
        },
        onAutoSilenceStop: () => {
          stopRecording();
        },
      });

      recordingSessionRef.current = session;
      mediaStreamRef.current = session.getStream();
      audioContextRef.current = session.getAudioContext();

      // Mobil (iOS Safari & Android) ses formatı uyumluluğu için desteklenen MIME türünü dinamik seç
      if (
        typeof window !== "undefined" &&
        typeof MediaRecorder !== "undefined" &&
        mediaStreamRef.current
      ) {
        const supportedType = [
          "audio/webm;codecs=opus",
          "audio/webm",
          "audio/mp4",
          "audio/ogg",
        ].find(
          (type) =>
            typeof MediaRecorder.isTypeSupported === "function" &&
            MediaRecorder.isTypeSupported(type)
        );
        try {
          const rec = supportedType
            ? new MediaRecorder(mediaStreamRef.current, {
                mimeType: supportedType,
              })
            : new MediaRecorder(mediaStreamRef.current);
          mediaRecorderRef.current = rec;
        } catch {
          mediaRecorderRef.current = null;
        }
      }

      setIsRecording(true);
    } catch {
      setAdaptiveResult({
        action: "keep_going",
        message:
          "Mikrofon izni alınamadı. Lütfen tarayıcı ayarlarından mikrofon izni verin.",
      });
    }
  };

  const stopRecording = async () => {
    if (!recordingSessionRef.current) return;
    const activeSession = recordingSessionRef.current;
    recordingSessionRef.current = null;

    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }

    playRecordStop();
    setIsRecording(false);
    setIsAnalyzing(true);

    const stoppedWebSpeechText =
      speechManagerRef.current?.stopLiveWebSpeech() || "";
    const fullSpokenText = (
      finalTranscriptRef.current +
      " " +
      interimTranscriptRef.current
    ).trim();
    const bestWebSpeechText = fullSpokenText || stoppedWebSpeechText;

    try {
      const recorded = await activeSession.stop();
      mediaStreamRef.current = null;
      audioContextRef.current = null;
      mediaRecorderRef.current = null;

      setUserAudioUrl(recorded.playbackUrl || recorded.wavUrl);
      setUserWavBlob(recorded.wavBlob);
      setUserDuration(recorded.duration);
      setUserBars(recorded.envelopeBars);

      let recognizedText = "";
      let usedEngine: SttEngineType = sttEngine;

      if (speechManagerRef.current) {
        // Eğer kayıt çok kısaysa (< 0.4 sn) veya tamamen sessizse ve Web Speech de boşsa Whisper'ı boşuna çalıştırma
        if (recorded.isSilent && !bestWebSpeechText) {
          recognizedText = "";
        } else {
          const hybridRes = await speechManagerRef.current.transcribeHybrid(
            sttEngine,
            recorded.trimmedSamples.length > 0
              ? recorded.trimmedSamples
              : recorded.samples16kHz,
            {
              onStatusChange: (st) => setWhisperStatus(st),
            }
          );
          recognizedText = (hybridRes.text || "").trim() || bestWebSpeechText;
          usedEngine = hybridRes.usedEngine;
        }
        setUsedEngineBadge(usedEngine);
      } else {
        recognizedText = bestWebSpeechText;
      }

      // E. Sessiz Kayıt / Düşük Ses Kontrolü:
      // Kaydedilen ses dalgasında konuşma enerjisi varsa (RMS eşiğinin üzerinde ses kaydedilmişse ve dalga boyu oluşmuşsa),
      // spokenText boş dönse bile kesinlikle "Mikrofondan net bir ses algılanamadı" hatası gösterme!
      const normalizedSpoken = normalizeArabicForPronunciation(recognizedText);
      const hasDetectedWords =
        normalizedSpoken.length > 0 && /[\u0600-\u06FF]/.test(normalizedSpoken);

      const hasSpeechEnergy =
        !recorded.isSilent &&
        (recorded.voicedDuration >= 0.14 ||
          recorded.peakRms >= 0.008 ||
          recorded.envelopeBars.some((b) => b > 0.14));

      if (!hasDetectedWords && !hasSpeechEnergy) {
        setIsAnalyzing(false);
        setWhisperStatus("");
        setEvaluation(null);
        setRhythmScore(null);
        setTempoScore(null);
        setFluencyScore(null);
        setActiveWordTip(null);
        setDspFallbackNotice(null);
        playError();
        setSilentWarning(
          "Mikrofondan net bir ses algılanamadı. Lütfen mikrofona biraz daha yakın ve net bir sesle tekrar okuyun."
        );
        return;
      }

      let computedRhythm = 0;
      let effectiveRefBars = refBars;
      let effectiveRefDur = refDuration;

      if (refAudioBufferRef.current) {
        const refEnv = extractAudioEnvelope(refAudioBufferRef.current, 48);
        effectiveRefBars = refEnv.bars;
        effectiveRefDur = refEnv.duration;
        computedRhythm = calculateRhythmMatch(
          refEnv.bars,
          recorded.envelopeBars
        );
        const computedTempo = calculateTempoScore(
          refEnv.duration,
          recorded.duration
        );
        setRhythmScore(computedRhythm);
        setTempoScore(computedTempo);
      } else {
        const computedTempo = calculateTempoScore(
          refDuration,
          recorded.duration
        );
        const barCorr = calculateRhythmMatch(refBars, recorded.envelopeBars);
        computedRhythm = Math.round(barCorr * 0.6 + computedTempo * 0.4);
        setRhythmScore(computedRhythm);
        setTempoScore(computedTempo);
      }

      processTranscription(
        recognizedText,
        computedRhythm,
        recorded.envelopeBars,
        effectiveRefBars,
        recorded.duration,
        effectiveRefDur,
        hasSpeechEnergy
      );
    } catch {
      setIsAnalyzing(false);
      setWhisperStatus("");
    }
  };

  const processTranscription = (
    transcribedText: string,
    currentRhythm: number,
    userEnvelopeBars: number[],
    referenceEnvelopeBars: number[],
    recordedDuration: number,
    referenceDuration: number,
    hasSpeechEnergy: boolean
  ) => {
    setIsAnalyzing(false);
    setWhisperStatus("");

    const normalizedCheck = normalizeArabicForPronunciation(transcribedText);
    const hasArabicText =
      Boolean(normalizedCheck) && /[\u0600-\u06FF]/.test(normalizedCheck);

    if (!hasArabicText && !hasSpeechEnergy) {
      setEvaluation(null);
      setRhythmScore(null);
      setTempoScore(null);
      setFluencyScore(null);
      setActiveWordTip(null);
      setDspFallbackNotice(null);
      playError();
      setSilentWarning(
        "Mikrofondan net bir ses algılanamadı. Lütfen mikrofona biraz daha yakın ve net bir sesle tekrar okuyun."
      );
      return;
    }

    setSilentWarning(null);

    let result: SentenceEvaluationResult;
    if (hasArabicText) {
      setDspFallbackNotice(null);
      result = evaluateSentenceWords(activeText, transcribedText);
    } else {
      // Kullanıcı konuşmuş ve ses dalgası oluşmuş ama metin motoru (Firefox Web Speech eksikliği / Whisper gecikmesi) metin üretememiş:
      // 16kHz DSP zarf, süre, hece enerjisi ve ritim uyumunu kullanarak analizi tamamla
      setDspFallbackNotice(
        "Tarayıcı ses-metin motoru yanıt vermediği için analiz 16kHz DSP akustik dalga ve ritim eşleştirmesiyle yapıldı."
      );
      result = evaluateAcousticDspSentence(
        activeText,
        userEnvelopeBars,
        referenceEnvelopeBars,
        recordedDuration,
        referenceDuration
      );
    }

    setEvaluation(result);
    if (result.overallScore > 0) {
      recordPronunciationScore(result.overallScore);
    }

    if (result.overallScore >= 80) playSuccess();
    else if (result.overallScore >= 50) playPartial();
    else playError();

    const pronunciation = result.overallScore;
    const fluency = calculateOverallFluency(pronunciation, currentRhythm);
    setFluencyScore(fluency);

    // Öncelikle eksik/farklı (<%85) okunan kelimeleri seç
    const firstErr = result.words.find((w) => w.status !== "correct");
    const detectedMakhrajPair = result.words.find(
      (w) => w.status !== "correct" && w.makhrajTip?.pair
    )?.makhrajTip?.pair;

    const updatedScores = [
      ...pronunciationScores.filter((s) => s > 0),
      ...(result.overallScore > 0 ? [result.overallScore] : []),
    ];
    const coaching = evaluateAdaptiveCoaching(
      updatedScores,
      level,
      detectedMakhrajPair,
      fluency
    );
    setAdaptiveResult(coaching);

    // Akıllı Hata Defteri (Spaced Repetition): <%70 ise ekle, >=%85 ise çıkar
    const canonicalTargetId = normalizeToCanonicalMistakeId(itemId, activeText);
    if (result.overallScore < 70) {
      if (canonicalTargetId) {
        addMistake(canonicalTargetId);
      }
    } else if (result.overallScore >= 85) {
      if (canonicalTargetId && isMistake(canonicalTargetId)) {
        removeMistake(canonicalTargetId);
      }
    }

    result.words.forEach((w) => {
      if (w.status !== "correct" && w.targetWord && w.targetWord.length > 1) {
        const morphMatch = analyzeAndMatchWord(w.targetWord);
        const dictWord =
          morphMatch?.item ||
          sozluk.find(
            (s) =>
              s.mufret?.includes(w.targetWord) ||
              s.mazi?.includes(w.targetWord) ||
              w.targetWord.includes(s.mufret || "___")
          );
        if (dictWord) {
          addWeakWord(dictWord);
          if (result.overallScore < 70) {
            addMistake(dictWord.id);
          }
        }
      }
    });

    if (firstErr) setActiveWordTip(firstErr);
    else if (result.words.length > 0) setActiveWordTip(result.words[0]);
  };

  const downloadWav = () => {
    if (!userWavBlob) return;
    playClick();
    const url = URL.createObjectURL(userWavBlob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `arapca_telaffuz_16khz_${Date.now()}.wav`;
    a.click();
  };

  const getWordColor = (status: string) => {
    if (status === "correct")
      return "bg-[#0CA678] text-white border-[#087F5B]";
    if (status === "warning")
      return "bg-amber-100 text-amber-900 border-amber-400";
    return "bg-rose-100 text-rose-900 border-rose-400";
  };

  return (
    <div className="fixed inset-0 z-[60] print:hidden flex items-center justify-center bg-black/60 backdrop-blur-xs p-2 sm:p-4 overflow-hidden">
      <div className="bg-[#FDFBF7] dark:bg-[var(--background)] w-full max-w-3xl max-h-[92vh] rounded-2xl border-2 border-[#E6D7BE] dark:border-[var(--border)] border-b-4 shadow-2xl flex flex-col overflow-hidden">
        {/* ÜST BAŞLIK + ÇİFT MOTORLU STT SEÇİCİ */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3.5 border-b-2 border-[#E6D7BE] dark:border-[var(--border)] bg-[#F7EFE1] dark:bg-[var(--surface)] shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[#0CA678] border-b-3 border-[#087F5B] text-white flex items-center justify-center shrink-0">
              <Activity size={18} />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-extrabold text-[var(--foreground)]">
                Gölgeleme & 38 Çiftlik Mahreç Koçu
              </h2>
              <p className="text-[11px] font-medium text-[var(--muted)]">
                16kHz DSP Dalga Formu · Kök Harf Kalkanı · Dinamik Kelime Hizalama
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Motor Seçici Yeşil Haplar */}
            <div className="bg-white dark:bg-[var(--background)] p-1 rounded-xl border border-[#E6D7BE] dark:border-[var(--border)] flex text-[11px] font-bold">
              <button
                type="button"
                onClick={() => {
                  playClick();
                  setSttEngine("whisper");
                }}
                className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                  sttEngine === "whisper"
                    ? "bg-[#0CA678] text-white font-semibold"
                    : "text-[var(--muted)]"
                }`}
              >
                Yapay Zeka (Whisper)
              </button>
              <button
                type="button"
                onClick={() => {
                  playClick();
                  setSttEngine("webspeech");
                }}
                className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                  sttEngine === "webspeech"
                    ? "bg-[#0CA678] text-white font-semibold"
                    : "text-[var(--muted)]"
                }`}
              >
                Hızlı Tarayıcı Motoru
              </button>
            </div>

            <button
              type="button"
              onClick={() => {
                playClick();
                handleClose();
              }}
              className="w-9 h-9 rounded-xl bg-white dark:bg-[var(--background)] border-2 border-[#E6D7BE] border-b-3 flex items-center justify-center text-[var(--muted)] hover:text-red-600 transition-colors cursor-pointer"
              aria-label="Kapat"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* İÇERİK GÖVDESİ */}
        <div className="p-4 sm:p-5 pb-6 space-y-4 overflow-y-auto flex-1 custom-scrollbar">
          {/* MİKRO-DRILL (ODAKLI KELİME ANTRENMANI) GERİ DÖNÜŞ ŞERİDİ */}
          {isMicroDrill && (
            <div className="bg-[#F3F0FF] dark:bg-[var(--lavender-bg)] border-2 border-[#6741D9] border-b-4 rounded-2xl px-4 py-2.5 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-extrabold text-[#4C28B5] dark:text-[#d0bfff]">
                <Target size={16} className="text-[#6741D9] shrink-0" />
                <span>
                  Odaklı Kelime Antrenmanı: Seçtiğiniz kelimeyi tek başına
                  pekiştiriyorsunuz
                </span>
              </div>
              <button
                type="button"
                onClick={returnToFullSentence}
                className="px-3 py-1.5 rounded-xl bg-[#6741D9] text-white text-xs font-extrabold border-b-3 border-[#5230B5] flex items-center gap-1 shrink-0 cursor-pointer"
              >
                <ArrowLeft size={14} />
                <span>← Tüm Cümleye Dön</span>
              </button>
            </div>
          )}

          {/* FORM SEÇİCİ (Sözlükten gelindiyse ve micro-drill değilse) */}
          {!isMicroDrill && forms && forms.length > 1 && (
            <div className="bg-[#F7EFE1] dark:bg-[var(--surface)] border-2 border-[#E6D7BE] dark:border-[var(--border)] border-b-4 rounded-2xl px-4 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <span className="text-xs font-extrabold text-[var(--foreground)]">
                Çalışılacak Kelime Formu:
              </span>
              <div className="bg-white dark:bg-[var(--background)] rounded-xl p-1 border border-[#E6D7BE] flex flex-wrap gap-1">
                {forms.map((f, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => handleFormChange(f.arabic)}
                    className={`px-3 py-1 rounded-lg text-xs transition-all cursor-pointer ${
                      activeText === f.arabic
                        ? "bg-[#0CA678] text-white font-semibold"
                        : "text-[var(--muted)] font-medium hover:text-[var(--foreground)]"
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* HEDEF ARAPÇA METİN KARTI + PROAKTİF MAHREÇ VE HAREKE REHBERİ */}
          <div className="bg-[#F7EFE1] dark:bg-[var(--surface)] rounded-2xl border-2 border-[#E6D7BE] dark:border-[var(--border)] border-b-4 p-4 sm:p-5 text-center space-y-3">
            {activeFormLabel && (
              <span className="text-[11px] uppercase font-extrabold text-[#087F5B]">
                {activeFormLabel}
              </span>
            )}
            <p
              dir="rtl"
              className="arabic text-3xl sm:text-4xl font-bold text-[var(--foreground)] leading-relaxed"
            >
              {activeText}
            </p>

            {/* KAYIT AKTİFKEN DİKKAT ÇEKİCİ "ŞİMDİ YÜKSEK SESLE OKUYUN" UYARI BANDI */}
            {isRecording && (
              <div className="rounded-xl bg-gradient-to-r from-[#0CA678] via-emerald-600 to-rose-600 text-white px-4 py-2.5 shadow-lg border-2 border-white/40 animate-pulse flex items-center justify-center gap-2 text-xs sm:text-sm font-black tracking-wide">
                <Mic size={18} className="shrink-0 animate-bounce" />
                <span>MİKROFON AÇIK — ŞİMDİ YÜKSEK SESLE OKUYUN!</span>
              </div>
            )}

            {/* Proaktif Mahreç ve Hareke Rehberi (Konuşma Öncesi) */}
            {proactiveGuide && (
              <div className="pt-2.5 border-t border-dashed border-[#E2D3B8] dark:border-[var(--border-dashed)] space-y-2 text-left">
                <div className="flex flex-wrap gap-1.5 justify-center">
                  {proactiveGuide.details.map((det) => (
                    <span
                      key={det.id}
                      className="px-2.5 py-1 rounded-lg bg-white dark:bg-[var(--background)] border border-[#E6D7BE] text-[11px] font-extrabold text-[#087F5B] dark:text-[#20c997]"
                    >
                      {det.badge} ({det.lettersFound.join("، ")})
                    </span>
                  ))}
                  {proactiveGuide.shaddaCount > 0 && (
                    <span className="px-2.5 py-1 rounded-lg bg-[#F3F0FF] border border-[#6741D9]/40 text-[11px] font-extrabold text-[#6741D9]">
                      ّ Şedde: {proactiveGuide.shaddaCount}
                    </span>
                  )}
                  {proactiveGuide.medCount > 0 && (
                    <span className="px-2.5 py-1 rounded-lg bg-white border border-[#E6D7BE] text-[11px] font-extrabold text-[var(--foreground)]">
                      ⏳ Med Uzatması: {proactiveGuide.medCount}
                    </span>
                  )}
                  {proactiveGuide.tanvinCount > 0 && (
                    <span className="px-2.5 py-1 rounded-lg bg-white border border-[#E6D7BE] text-[11px] font-extrabold text-[var(--muted)]">
                      ً Tenvin: {proactiveGuide.tanvinCount}
                    </span>
                  )}
                </div>

                {proactiveGuide.details.length > 0 && !evaluation && (
                  <div className="bg-white/80 dark:bg-[var(--background)] rounded-xl p-2.5 border border-[#E6D7BE] space-y-1 text-[11px]">
                    {proactiveGuide.details.map((det) => (
                      <p
                        key={det.id}
                        className="text-[var(--muted)] font-semibold leading-snug"
                      >
                        <strong className="text-[var(--foreground)]">
                          {det.badge}:
                        </strong>{" "}
                        {det.advice}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* HIZ KONTROLÜ SATIRI (0.5x | 0.75x | 1.0x | 1.25x) */}
          <div className="bg-[#F7EFE1] dark:bg-[var(--surface)] rounded-2xl border-2 border-[#E6D7BE] dark:border-[var(--border)] border-b-4 px-4 py-2.5 flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-extrabold text-[var(--foreground)] flex items-center gap-1.5">
              <Gauge size={15} className="text-[#087F5B]" />
              <span>Referans Dinleme Hızı:</span>
            </span>
            <div className="bg-white dark:bg-[var(--background)] rounded-xl p-1 border border-[#E6D7BE] flex items-center gap-1">
              {([0.5, 0.75, 1, 1.25] as SpeechRate[]).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => {
                    playClick();
                    setSpeechRate(r);
                  }}
                  className={`px-2.5 py-1 rounded-lg text-xs tabular-nums transition-all cursor-pointer ${
                    speechRate === r
                      ? "bg-[#0CA678] text-white font-semibold"
                      : "text-[var(--muted)] font-medium hover:text-[var(--foreground)]"
                  }`}
                >
                  {r}x
                </button>
              ))}
            </div>
          </div>

          {/* ÇİFT DALGA FORMU (DUAL RMS ENVELOPE): DOĞAL SES REFERANSI VE 16kHz KULLANICI KAYDI */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {/* Referans Doğal Ses */}
            <div className="bg-[#F7EFE1] dark:bg-[var(--surface)] border-2 border-[#E6D7BE] dark:border-[var(--border)] border-b-4 rounded-2xl p-3.5 flex flex-col justify-between space-y-2.5">
              <div className="flex items-center justify-between border-b border-dashed border-[#E2D3B8] pb-2">
                <span className="text-xs font-extrabold text-[#087F5B] flex items-center gap-1.5">
                  <Volume2 size={15} />
                  <span>Doğal Referans Ses</span>
                </span>
                <span className="text-xs font-bold text-[var(--muted)] tabular-nums">
                  {refDuration > 0 ? `${refDuration.toFixed(1)} sn` : "Hazır"}
                </span>
              </div>

              {/* 48 Bar Referans Zarfı */}
              <div className="w-full h-12 bg-white dark:bg-[var(--background)] rounded-xl px-2.5 py-1.5 border border-[#E6D7BE] flex items-end justify-between gap-0.5">
                {refBars.map((val, i) => (
                  <div
                    key={i}
                    style={{ height: `${Math.max(12, Math.round(val * 100))}%` }}
                    className={`flex-1 rounded-full transition-all ${
                      isPlayingRef ? "bg-[#0CA678]" : "bg-[#0CA678]/65"
                    }`}
                  />
                ))}
              </div>

              <button
                type="button"
                onClick={playReference}
                className="w-full py-2.5 px-4 rounded-xl bg-[#0CA678] hover:bg-[#099268] text-white text-xs font-bold border-b-3 border-[#087F5B] active:border-b-0 active:translate-y-0.5 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
              >
                {isPlayingRef ? (
                  <Square size={13} fill="currentColor" />
                ) : (
                  <Play size={13} fill="currentColor" />
                )}
                <span>
                  {isPlayingRef
                    ? "Çalıyor..."
                    : `Doğru Okunuşu Dinle (${speechRate}x)`}
                </span>
              </button>
            </div>

            {/* Öğrenci 16kHz Ses Kaydı */}
            <div
              className={`rounded-2xl border-2 border-b-4 p-3.5 flex flex-col justify-between space-y-2.5 transition-all ${
                isRecording
                  ? "bg-[#F3F0FF] dark:bg-[var(--lavender-bg)] border-[#6741D9]"
                  : "bg-[#F7EFE1] dark:bg-[var(--surface)] border-[#E6D7BE] dark:border-[var(--border)]"
              }`}
            >
              <div className="flex items-center justify-between border-b border-dashed border-[#E2D3B8] pb-2">
                <span className="text-xs font-extrabold text-[#6741D9] dark:text-[#d0bfff] flex items-center gap-1.5">
                  <Mic size={15} />
                  <span>
                    {isRecording
                      ? "16kHz Kaydediliyor... Konuşun"
                      : "Sizin Telaffuzunuz (16kHz WAV)"}
                  </span>
                </span>
                {userDuration > 0 && (
                  <span className="text-xs font-bold text-[var(--muted)] tabular-nums">
                    {userDuration.toFixed(1)} sn
                  </span>
                )}
              </div>

              {/* 48 Bar Canlı RMS / Kullanıcı Zarfı */}
              <div
                className={`w-full h-12 bg-white dark:bg-[var(--background)] rounded-xl px-2.5 py-1.5 border flex items-end justify-between gap-0.5 transition-all ${
                  isRecording
                    ? "border-[#0CA678] ring-2 ring-[#0CA678]/30"
                    : "border-[#E6D7BE]"
                }`}
              >
                {userBars.map((val, i) => (
                  <div
                    key={i}
                    style={{ height: `${Math.max(12, Math.round(val * 100))}%` }}
                    className={`flex-1 rounded-full transition-all duration-75 ${
                      isRecording
                        ? val > 0.12
                          ? "bg-[#0CA678]"
                          : "bg-[#6741D9]"
                        : userAudioUrl
                        ? "bg-[#6741D9]/80"
                        : "bg-[#E6D7BE]"
                    }`}
                  />
                ))}
              </div>

              {userAudioUrl && !isRecording ? (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={playUserWav}
                    className="flex-1 py-2.5 px-3 rounded-xl bg-[#6741D9] text-white text-xs font-bold border-b-3 border-[#5230B5] flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    {isPlayingUser ? (
                      <Square size={13} fill="currentColor" />
                    ) : (
                      <Play size={13} fill="currentColor" />
                    )}
                    <span>Sesimi Dinle (.wav)</span>
                  </button>
                  <button
                    type="button"
                    onClick={downloadWav}
                    className="py-2.5 px-3 rounded-xl bg-white dark:bg-[var(--background)] border-2 border-[#E6D7BE] border-b-3 text-[var(--foreground)] hover:border-[#0CA678] cursor-pointer"
                    title="16-bit PCM .wav Ses Kaydını İndir"
                  >
                    <Download size={14} />
                  </button>
                  <audio
                    ref={userAudioPlayerRef}
                    src={userAudioUrl}
                    playsInline
                    preload="auto"
                    onEnded={() => setIsPlayingUser(false)}
                    className="hidden"
                  />
                </div>
              ) : isRecording ? (
                <div className="w-full py-2.5 px-3 rounded-xl bg-[#6741D9]/15 dark:bg-[#6741D9]/25 border border-[#6741D9]/40 text-xs font-extrabold text-[#4C28B5] dark:text-[#d0bfff] flex items-center justify-center gap-1.5 truncate">
                  <span className="w-2 h-2 rounded-full bg-[#0CA678] animate-ping shrink-0" />
                  {liveInterimText ? (
                    <span dir="rtl" className="arabic text-xs font-bold truncate">
                      Algılanan: {liveInterimText}
                    </span>
                  ) : (
                    <span className="truncate">
                      🗣️ Şimdi Arapça cümleyi yüksek sesle okuyun...
                    </span>
                  )}
                </div>
              ) : (
                <div className="w-full py-2.5 px-3 rounded-xl bg-white/60 dark:bg-[var(--background)]/60 border border-dashed border-[#E6D7BE] text-[11px] font-semibold text-center text-[var(--muted)] truncate">
                  Aşağıdaki &lsquo;Kayda Başla&rsquo; butonuna basıp okuyun
                </div>
              )}
            </div>
          </div>

          {/* ANALİZ DURUMU */}
          {(whisperStatus || isAnalyzing) && (
            <div className="bg-[#F3F0FF] dark:bg-[var(--lavender-bg)] border-2 border-[#6741D9] rounded-xl p-3 flex items-center justify-center gap-2 text-xs font-extrabold text-[#6741D9] dark:text-[#d0bfff]">
              <Cpu size={16} className="animate-spin" />
              <span>
                {whisperStatus ||
                  "Telaffuzunuz ve 38 mahreç çifti analiz ediliyor..."}
              </span>
            </div>
          )}

          {/* SESSİZ KAYIT / DÜŞÜK SES UYARISI */}
          {silentWarning && !isAnalyzing && (
            <div className="bg-amber-50 dark:bg-amber-950/30 border-2 border-amber-400 border-b-4 rounded-2xl p-4 flex items-center gap-3 text-xs sm:text-sm font-bold text-amber-900 dark:text-amber-200">
              <AlertTriangle size={20} className="text-amber-600 shrink-0" />
              <span>{silentWarning}</span>
            </div>
          )}

          {/* DEĞERLENDİRME SONUÇLARI */}
          {evaluation && (
            <div className="space-y-3.5">
              {/* 16kHz DSP Akustik Dalga & Ritim Eşleştirmesi Bilgi Notu */}
              {dspFallbackNotice && (
                <div className="bg-[#F3F0FF] dark:bg-[var(--lavender-bg)] border-2 border-[#6741D9] rounded-xl px-3.5 py-2.5 flex items-center gap-2.5 text-xs font-extrabold text-[#4C28B5] dark:text-[#d0bfff]">
                  <Info size={16} className="text-[#6741D9] shrink-0" />
                  <span>{dspFallbackNotice}</span>
                </div>
              )}

              {/* 3'lü Skor Özeti */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-[#F7EFE1] dark:bg-[var(--surface)] rounded-2xl border-2 border-[#E6D7BE] border-b-4 p-3 text-center">
                  <span className="text-[11px] font-bold text-[var(--muted)] block">
                    Telaffuz Doğruluğu
                  </span>
                  <span className="text-xl sm:text-2xl font-black tabular-nums text-[#087F5B]">
                    %{evaluation.overallScore}
                  </span>
                </div>

                <div className="bg-[#F7EFE1] dark:bg-[var(--surface)] rounded-2xl border-2 border-[#E6D7BE] border-b-4 p-3 text-center">
                  <span className="text-[11px] font-bold text-[var(--muted)] block">
                    Ritim & Dalga Uyumu
                  </span>
                  <span className="text-xl sm:text-2xl font-black tabular-nums text-[#6741D9]">
                    %{rhythmScore ?? tempoScore ?? 0}
                  </span>
                </div>

                <div className="bg-[#F7EFE1] dark:bg-[var(--surface)] rounded-2xl border-2 border-[#E6D7BE] border-b-4 p-3 text-center">
                  <span className="text-[11px] font-bold text-[var(--muted)] flex items-center justify-center gap-1">
                    <Award size={12} className="text-amber-600" />
                    Genel Akıcılık
                  </span>
                  <span className="text-xl sm:text-2xl font-black tabular-nums text-[var(--foreground)]">
                    %{fluencyScore ?? evaluation.overallScore}
                  </span>
                </div>
              </div>

              {/* Adaptif Hız ve Seviye Koçluğu Kartı */}
              {adaptiveResult && (
                <div
                  className={`border-2 border-b-4 rounded-2xl p-3.5 text-xs font-semibold flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 ${
                    adaptiveResult.action === "level_up"
                      ? "bg-[#F3F0FF] dark:bg-[var(--lavender-bg)] border-[#6741D9] text-[#4C28B5] dark:text-[#d0bfff]"
                      : (fluencyScore ?? evaluation.overallScore) >= 75 ||
                        evaluation.overallScore >= 85
                      ? "bg-emerald-50 dark:bg-emerald-950/40 border-[#0CA678] text-[#087F5B] dark:text-emerald-200"
                      : "bg-white dark:bg-[var(--background)] border-[#E6D7BE] text-[var(--foreground)]"
                  }`}
                >
                  <div className="flex items-start gap-2">
                    {adaptiveResult.action === "level_up" ? (
                      <TrendingUp
                        size={18}
                        className="text-[#6741D9] shrink-0 mt-0.5"
                      />
                    ) : (fluencyScore ?? evaluation.overallScore) >= 75 ||
                      evaluation.overallScore >= 85 ? (
                      <CheckCircle2
                        size={16}
                        className="text-[#0CA678] shrink-0 mt-0.5"
                      />
                    ) : (
                      <Info
                        size={16}
                        className="text-[#0CA678] shrink-0 mt-0.5"
                      />
                    )}
                    <div>
                      <span
                        className={`font-extrabold block mb-0.5 ${
                          adaptiveResult.action === "level_up"
                            ? "text-[#6741D9] dark:text-[#d0bfff]"
                            : "text-[#087F5B]"
                        }`}
                      >
                        {adaptiveResult.action === "level_up"
                          ? `🏆 Seviye Atlama Önerisi: ${
                              adaptiveResult.suggestedLevel || "Üst Kur"
                            }`
                          : "Adaptif Telaffuz Koçu"}{" "}
                        {usedEngineBadge
                          ? `(${
                              usedEngineBadge === "whisper"
                                ? "Whisper AI"
                                : "Hızlı Motor"
                            })`
                          : ""}
                      </span>
                      <span>{adaptiveResult.message}</span>
                    </div>
                  </div>

                  {adaptiveResult.action === "slow_down" &&
                    adaptiveResult.suggestedSpeed &&
                    speechRate !== adaptiveResult.suggestedSpeed && (
                      <button
                        type="button"
                        onClick={() => {
                          playClick();
                          setSpeechRate(adaptiveResult.suggestedSpeed!);
                        }}
                        className="px-3 py-1.5 rounded-xl bg-[#0CA678] text-white font-extrabold border-b-3 border-[#087F5B] shrink-0 cursor-pointer"
                      >
                        Hızı {adaptiveResult.suggestedSpeed}x Yap
                      </button>
                    )}

                  {adaptiveResult.action === "level_up" &&
                    adaptiveResult.suggestedLevel && (
                      <button
                        type="button"
                        onClick={() => {
                          playClick();
                          const next = adaptiveResult.suggestedLevel;
                          if (next === "A2") setPreferredLevel("Orta");
                          else if (next === "B1" || next === "B2" || next === "C1")
                            setPreferredLevel("İleri");
                        }}
                        className="px-3.5 py-1.5 rounded-xl bg-[#6741D9] text-white font-extrabold border-b-3 border-[#5230B5] shrink-0 cursor-pointer"
                      >
                        ✨ {adaptiveResult.suggestedLevel} Kurunu Aktifleştir
                      </button>
                    )}
                </div>
              )}

              {/* KELİME BAZLI RENKLENDİRME KARTI */}
              <div className="bg-[#F7EFE1] dark:bg-[var(--surface)] rounded-2xl border-2 border-[#E6D7BE] dark:border-[var(--border)] border-b-4 p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-dashed border-[#E2D3B8] pb-2">
                  <span className="text-xs font-extrabold text-[var(--foreground)]">
                    Kelime Bazlı Telaffuz Analizi (Mahreç detayı ve dinlemek için
                    kelimeye tıklayın)
                  </span>
                  <div className="flex items-center gap-2 text-[10px] font-bold">
                    <span className="text-[#087F5B]">● Doğru (≥%80)</span>
                    <span className="text-amber-700">▲ Yakın (%60-79)</span>
                    <span className="text-rose-700">✕ Hatalı (&lt;%60)</span>
                  </div>
                </div>

                {evaluation.isRootGuardTriggered && (
                  <div className="bg-rose-50 border-2 border-rose-300 text-rose-900 p-2.5 rounded-xl text-xs font-bold flex items-start gap-2">
                    <AlertTriangle size={15} className="shrink-0 mt-0.5" />
                    <span>
                      {evaluation.rootGuardMessage ||
                        "⚠️ Kök harf değişimi tespit edildi! Kelimenin anlamı değiştiği için puan sınırlandırıldı."}
                    </span>
                  </div>
                )}

                <div className="flex flex-wrap gap-2" dir="rtl">
                  {evaluation.words.map((word, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => {
                        setActiveWordTip(word);
                        if (word.targetWord) speakWord(word.targetWord);
                      }}
                      className={`px-3.5 py-1.5 rounded-xl border-2 border-b-3 transition-all arabic text-xl font-bold cursor-pointer flex items-center gap-1.5 ${getWordColor(
                        word.status
                      )} ${
                        activeWordTip === word
                          ? "ring-2 ring-[#6741D9] -translate-y-0.5"
                          : ""
                      }`}
                    >
                      <span>{word.targetWord || word.spokenWord || "..."}</span>
                      <span
                        dir="ltr"
                        className="text-[10px] font-sans font-extrabold opacity-90"
                      >
                        %{word.score}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* SEÇİLİ KELİME MAHREÇ, VEZİN/MED DETAYI VE MİKRO-DRILL BUTONU */}
              {activeWordTip && (
                <div className="bg-white dark:bg-[var(--background)] rounded-2xl border-2 border-[#E6D7BE] border-b-4 p-4 space-y-2.5 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-dashed border-[#E2D3B8] pb-2">
                    <h4 className="font-extrabold text-[var(--foreground)] flex items-center gap-1.5">
                      {activeWordTip.status === "correct" ? (
                        <CheckCircle2 size={15} className="text-[#0CA678]" />
                      ) : (
                        <Target size={15} className="text-[#6741D9]" />
                      )}
                      <span>
                        {activeWordTip.status === "correct"
                          ? "Doğru Telaffuz & Tam Mahreç Uyumu"
                          : "Odaklı Mahreç Koçu & Telaffuz Rehberi"}
                      </span>
                    </h4>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => speakWord(activeWordTip.targetWord)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#0CA678] text-white font-bold border-b-2 border-[#087F5B] cursor-pointer"
                      >
                        <Volume2 size={12} />
                        <span>Doğrusunu Dinle</span>
                      </button>

                      {!isMicroDrill &&
                        activeWordTip.targetWord &&
                        evaluation.words.length > 1 && (
                          <button
                            type="button"
                            onClick={() =>
                              startMicroDrillOnWord(activeWordTip.targetWord)
                            }
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#6741D9] text-white font-bold border-b-2 border-[#5230B5] cursor-pointer"
                          >
                            <Target size={12} />
                            <span>Sadece Bu Kelimeyi Çalış</span>
                          </button>
                        )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-center">
                    <div className="bg-[#F7EFE1] dark:bg-[var(--surface)] p-2.5 rounded-xl border border-[#E6D7BE]">
                      <span className="text-[10px] font-bold text-[var(--muted)] block">
                        Hedef Kelime
                      </span>
                      <span
                        dir="rtl"
                        className="arabic text-2xl font-bold text-[#087F5B]"
                      >
                        {activeWordTip.targetWord}
                      </span>
                    </div>
                    <div
                      className={`p-2.5 rounded-xl border ${
                        activeWordTip.status === "correct"
                          ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                          : "bg-amber-50 border-amber-200 text-amber-900"
                      }`}
                    >
                      <span className="text-[10px] font-bold block">
                        Algılanan Okunuş (%{activeWordTip.score})
                      </span>
                      <span dir="rtl" className="arabic text-2xl font-bold">
                        {activeWordTip.spokenWord || "Duyulamadı"}
                      </span>
                    </div>
                  </div>

                  {activeWordTip.status === "correct" ? (
                    <div className="bg-emerald-50 dark:bg-emerald-950/30 p-3 rounded-xl border border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200 font-semibold">
                      ✨ Harika! Bu kelimeyi mahreç ve vakıf kurallarına uygun
                      olarak doğru telaffuz ettiniz.
                    </div>
                  ) : (
                    <>
                      {activeWordTip.makhrajTip && (
                        <div className="bg-[#F7EFE1] dark:bg-[var(--surface)] p-3 rounded-xl border border-[#E6D7BE]">
                          <p className="font-extrabold text-[#087F5B] mb-0.5">
                            🎯 {activeWordTip.makhrajTip.title} (
                            {activeWordTip.makhrajTip.pair})
                          </p>
                          <p className="text-[var(--foreground)] font-medium leading-relaxed">
                            {activeWordTip.makhrajTip.tip}
                          </p>
                        </div>
                      )}

                      {activeWordTip.rootGuardMessage && (
                        <div className="bg-rose-50 p-3 rounded-xl border border-rose-200">
                          <p className="font-extrabold text-rose-800 mb-0.5">
                            🛡️ Kök Harf Kalkanı
                          </p>
                          <p className="text-rose-950 font-medium">
                            {activeWordTip.rootGuardMessage}
                          </p>
                        </div>
                      )}

                      {activeWordTip.medVezinTip && (
                        <div className="bg-amber-50 p-3 rounded-xl border border-amber-200">
                          <p className="font-extrabold text-amber-800 mb-0.5">
                            📐 Telaffuz & Vezin İpucu
                          </p>
                          <p className="text-amber-950 font-medium">
                            {activeWordTip.medVezinTip}
                          </p>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ALT AKSİYON BAR */}
        <div className="p-3.5 bg-[#F7EFE1] dark:bg-[var(--surface)] border-t-2 border-[#E6D7BE] dark:border-[var(--border)] flex flex-wrap items-center justify-between gap-2.5 shrink-0">
          {!isRecording && !userAudioUrl && (
            <button
              type="button"
              onClick={startRecording}
              className="flex-1 py-3 px-6 bg-[#0CA678] hover:bg-[#099268] text-white font-bold text-sm rounded-2xl border-b-4 border-[#087F5B] active:border-b-0 active:translate-y-1 transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <Mic size={18} />
              <span>
                {isMicroDrill
                  ? "Seçili Kelimeyi Mikrofonla Kaydet (16kHz)"
                  : "Mikrofonla Kayda Başla (16kHz)"}
              </span>
            </button>
          )}

          {isRecording && (
            <button
              type="button"
              onClick={stopRecording}
              className="flex-1 py-3 px-6 bg-red-600 hover:bg-red-700 text-white font-bold text-sm rounded-2xl border-b-4 border-red-800 animate-pulse flex items-center justify-center gap-2 cursor-pointer"
            >
              <Square size={16} fill="currentColor" />
              <span>Kaydı Tamamla ve Analiz Et</span>
            </button>
          )}

          {userAudioUrl && !isRecording && (
            <button
              type="button"
              onClick={startRecording}
              className="flex-1 py-3 px-5 bg-[#0CA678] hover:bg-[#099268] text-white font-bold text-sm rounded-2xl border-b-4 border-[#087F5B] active:border-b-0 active:translate-y-1 transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <RotateCcw size={16} />
              <span>Tekrar Kaydet ve Dene</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              playClick();
              handleClose();
            }}
            className="py-3 px-5 rounded-2xl bg-white dark:bg-[var(--background)] border-2 border-[#E6D7BE] border-b-4 text-xs font-extrabold text-[var(--foreground)] hover:bg-[#FDFBF7] cursor-pointer"
          >
            <span className="inline-flex items-center gap-1">
              <CheckCircle2 size={15} className="text-[#0CA678]" />
              Tamamla
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}