"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useUserStore } from "@/store/userStore";
import { useSettings, SpeechRate } from "@/store/settings";
import { useAudioStore } from "@/store/audioStore";
import { diyaloglar, sozluk } from "@/lib/data";
import { analyzeAndMatchWord } from "@/lib/dict";
import { getCombinedIdiomsCatalog } from "@/lib/arabicIdioms";
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
  extractFloat32Envelope,
  calculateRhythmMatch,
  calculateTempoScore,
  calculateOverallFluency,
  evaluateAcousticDspSentence,
  start16kHzRecorder,
  resampleAudioBuffer,
  trimSilenceFromPcm,
  countSyllablePeaks,
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
  turkishText?: string;
  itemId?: string;
  refAudioUrl?: string;
  forms?: TargetForm[];
  voice?: VoiceOption;
  level?: string;
  onEvaluated?: (score: number, evaluatedText: string) => void;
  onClose: () => void;
}

const DEFAULT_BARS = Array(48).fill(0.08);

export default function ShadowingModal({
  text,
  turkishText,
  itemId,
  refAudioUrl,
  forms,
  voice = "male",
  level = "A1",
  onEvaluated,
  onClose,
}: Props) {
  const [activeText, setActiveText] = useState<string>(text);
  const [activeFormLabel, setActiveFormLabel] = useState<string>(
    forms?.[0]?.label || ""
  );
  const [isMicroDrill, setIsMicroDrill] = useState<boolean>(false);
  const [expandedTipId, setExpandedTipId] = useState<string | null>(null);
  const [translationVisibleForText, setTranslationVisibleForText] = useState<
    string | null
  >(null);
  const showTranslation = translationVisibleForText === activeText;

  const resolvedTurkishMeaning = useMemo(() => {
    if (turkishText && !isMicroDrill) return turkishText;
    const normActive = normalizeArabicForPronunciation(activeText);
    if (!normActive) return "";

    for (const dlg of diyaloglar) {
      for (const line of dlg.satirlar) {
        if (
          line.arapca.trim() === activeText.trim() ||
          normalizeArabicForPronunciation(line.arapca) === normActive
        ) {
          return line.turkce;
        }
      }
    }

    for (const w of sozluk) {
      const muf = (w.mufret || "").split("/")[0].trim();
      const cem = (w.cemi || "").split("/")[0].trim();
      const maz = (w.mazi || "").split("/")[0].trim();
      const muz = (w.muzari || "").split("/")[0].trim();
      const mas = (w.masdar || "").split("/")[0].trim();
      if (
        (itemId && w.id === itemId) ||
        [muf, cem, maz, muz, mas].some(
          (f) => f && normalizeArabicForPronunciation(f) === normActive
        )
      ) {
        return w.anlam_tr;
      }
    }

    const allIdioms = getCombinedIdiomsCatalog();
    for (const idm of allIdioms) {
      if (
        normalizeArabicForPronunciation(idm.arabic) === normActive ||
        idm.arabic.trim() === activeText.trim()
      ) {
        return idm.meaningTr;
      }
    }

    return "";
  }, [activeText, turkishText, itemId, isMicroDrill]);

  const {
    addWeakWord,
    addMistake,
    recordItemAttempt,
    recordPronunciationScore,
    pronunciationScores,
  } = useUserStore();
  const {
    speechRate,
    setSpeechRate,
    sttEngine,
    setSttEngine,
    localSttOnly,
    setLocalSttOnly,
    micNoiseSuppression,
    toggleMicNoiseSuppression,
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
  const [hasRealRefAudio, setHasRealRefAudio] = useState<boolean>(false);

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
  const [micError, setMicError] = useState<string | null>(null);
  const [dspFallbackNotice, setDspFallbackNotice] = useState<string | null>(
    null
  );
  const [showModeInfo, setShowModeInfo] = useState(false);

  const audioStore = useAudioStore();

  const speechManagerRef = useRef<HybridSpeechManager | null>(null);
  const recordingSessionRef = useRef<RecordingSession16kHz | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const rafIdRef = useRef<number | null>(null);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isStartingRef = useRef<boolean>(false);
  const liveTranscriptRef = useRef<string>("");
  const finalTranscriptRef = useRef<string>("");
  const interimTranscriptRef = useRef<string>("");
  const backupBrowserTranscriptRef = useRef<string>("");
  const isMobileWebSpeechOnlyRef = useRef<boolean>(false);
  const mobileWaveTimerRef = useRef<ReturnType<typeof setInterval> | null>(
    null
  );
  const mobileLiveBarsRef = useRef<number[]>([]);
  const recordingElapsedSecRef = useRef<number>(0);
  const resultsSectionRef = useRef<HTMLDivElement | null>(null);
  const waveformCardRef = useRef<HTMLDivElement | null>(null);
  const userAudioPlayerRef = useRef<HTMLAudioElement | null>(null);
  const refAudioBufferRef = useRef<AudioBuffer | null>(null);
  const isMountedRef = useRef<boolean>(true);
  const recordingSessionIdRef = useRef<number>(0);
  const recordingSampleRateRef = useRef<number>(48000);
  const modalRef = useRef<HTMLDivElement | null>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  const stopPreviousMediaOnly = useCallback(() => {
    if (recordingTimerRef.current !== null) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    if (mobileWaveTimerRef.current !== null) {
      clearInterval(mobileWaveTimerRef.current);
      mobileWaveTimerRef.current = null;
    }
    isMobileWebSpeechOnlyRef.current = false;
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
    try {
      speechManagerRef.current?.stopLiveWebSpeech();
    } catch {
      // ignore
    }
    if (typeof window !== "undefined") {
      window.speechSynthesis?.cancel();
    }
  }, []);

  const cleanupMediaResources = useCallback(() => {
    recordingSessionIdRef.current += 1;
    isStartingRef.current = false;
    stopPreviousMediaOnly();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleClose = useCallback(() => {
    isMountedRef.current = false;
    cleanupMediaResources();
    stopAllAudio();
    onCloseRef.current();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Unmount sırasında veya sekme gizlendiğinde açık kalan MediaStream, AudioContext, RAF ve Web Speech kaydını KESİNLİKLE kapat
  useEffect(() => {
    isMountedRef.current = true;
    speechManagerRef.current = new HybridSpeechManager();
    // Yalnızca Whisper seçiliyse arka planda Whisper modelini ön-yükle
    if (useSettings.getState().sttEngine === "whisper") {
      speechManagerRef.current.preloadWhisperModel();
    }

    const rafFocus = requestAnimationFrame(() => {
      const firstFocusable = modalRef.current?.querySelector<HTMLElement>(
        'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      firstFocusable?.focus();
    });

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        handleClose();
        return;
      }
      if (e.key === "Tab" && modalRef.current) {
        const focusables = Array.from(
          modalRef.current.querySelectorAll<HTMLElement>(
            'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
          )
        ).filter((el) => el.offsetParent !== null);
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    const handleBackgroundStop = () => {
      cleanupMediaResources();
      setIsRecording(false);
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        handleBackgroundStop();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pagehide", handleBackgroundStop);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      isMountedRef.current = false;
      cancelAnimationFrame(rafFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pagehide", handleBackgroundStop);
      window.removeEventListener("keydown", handleKeyDown);
      cleanupMediaResources();
      speechManagerRef.current?.terminate();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    return () => {
      if (userAudioUrl) URL.revokeObjectURL(userAudioUrl);
    };
  }, [userAudioUrl]);

  // Kayıt ve analiz tamamlandığında mobil ekranlarda sonuç ve mahreç kartlarına otomatik kaydır
  useEffect(() => {
    if (!isRecording && !isAnalyzing && evaluation) {
      const timer = setTimeout(() => {
        resultsSectionRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "nearest",
        });
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [isRecording, isAnalyzing, evaluation]);

  // Referans ses zarfını (48 bar) ve süresini yalnızca gerçek ses kaynağından (1. refAudioUrl -> 2. /api/tts) hazırla; sahte Math.sin dalgası üretme!
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

      // 2. Aşama: Referans MP3 yoksa veya başarısız olduysa /api/tts dene (Service Worker önbelleğinde de olabilir)
      if (!decodedBuffer) {
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
        setHasRealRefAudio(true);
      } else {
        // Gerçek referans ses elde edilemediyse sahte Math.sin zarfı ÜRETME; ritim ölçümünü devre dışı bırak
        refAudioBufferRef.current = null;
        setRefDuration(0);
        setRefBars(DEFAULT_BARS);
        setHasRealRefAudio(false);
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
    // 1. İLK SATIRDA kayıt durumunu derhal true yap ki buton anında kırmızı "⏹ Kaydı Durdur ve Analiz Et" butonuna dönüşsün
    isStartingRef.current = false;
    setMicError(null);
    setIsAnalyzing(false);
    setIsRecording(true);

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

    // 2. Önce eski mediaStreamRef / audioContextRef kaynaklarını kapat (sessionId artırmadan!)
    stopPreviousMediaOnly();

    // 3. Sonra yeni oturum numarasını artır (bu satırdan sonra kesinlikle cleanup() çağırma!)
    const sessionId = ++recordingSessionIdRef.current;
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
    setUserDuration(0);
    setUserBars(DEFAULT_BARS);
    liveTranscriptRef.current = "";
    finalTranscriptRef.current = "";
    interimTranscriptRef.current = "";
    backupBrowserTranscriptRef.current = "";
    recordingElapsedSecRef.current = 0;
    mobileLiveBarsRef.current = [];
    isMobileWebSpeechOnlyRef.current = false;

    // Süre sayacını anında başlat
    let elapsedTenths = 0;
    recordingTimerRef.current = setInterval(() => {
      if (
        !isMountedRef.current ||
        sessionId !== recordingSessionIdRef.current
      ) {
        return;
      }
      elapsedTenths += 1;
      const sec = elapsedTenths / 10;
      recordingElapsedSecRef.current = sec;
      setUserDuration(sec);
    }, 100);

    let stream: MediaStream | null = null;
    try {
      const {
        sttEngine: currentEngine,
        localSttOnly: currentLocalOnly,
        micNoiseSuppression: currentNoiseSuppression,
      } = useSettings.getState();

      const isMobile =
        typeof navigator !== "undefined" &&
        /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

      // MOBİLDE ⚡ TARAYICI (webspeech) SEÇİLİYKEN getUserMedia İLE EŞZAMANLI MİKROFON AKIŞI AÇMA!
      // Böylece Android işletim sistemi webkitSpeechRecognition mikrofonunu engellemez.
      if (
        isMobile &&
        currentEngine === "webspeech" &&
        !currentLocalOnly &&
        speechManagerRef.current?.isWebSpeechSupported()
      ) {
        isMobileWebSpeechOnlyRef.current = true;
        let lastTranscriptLen = 0;
        let stepTick = 0;

        speechManagerRef.current.startLiveWebSpeech({
          onInterimTranscript: (combined, finalPart, interimPart) => {
            if (typeof finalPart === "string" && finalPart.trim()) {
              finalTranscriptRef.current = finalPart.trim();
            }
            if (typeof interimPart === "string") {
              interimTranscriptRef.current = interimPart.trim();
            } else if (combined && !finalTranscriptRef.current) {
              interimTranscriptRef.current = combined.trim();
            }
            const latestText =
              (
                finalTranscriptRef.current +
                " " +
                interimTranscriptRef.current
              ).trim() || combined.trim();
            if (latestText) {
              liveTranscriptRef.current = latestText;
              backupBrowserTranscriptRef.current = latestText;
            }
            setLiveInterimText(combined);
          },
        });

        mobileWaveTimerRef.current = setInterval(() => {
          if (
            !isMountedRef.current ||
            sessionId !== recordingSessionIdRef.current
          ) {
            return;
          }
          stepTick += 1;
          const currentLen = liveTranscriptRef.current.length;
          const isActivelySpeaking =
            currentLen > lastTranscriptLen || currentLen > 0;
          lastTranscriptLen = currentLen;

          const refSample =
            refBars.length > 0
              ? refBars[stepTick % refBars.length]
              : 0.35;
          const barVal = isActivelySpeaking
            ? Math.min(
                0.92,
                Math.max(
                  0.18,
                  refSample * 0.75 +
                    0.22 * Math.abs(Math.sin(stepTick * 0.65))
                )
              )
            : 0.1 + 0.08 * Math.abs(Math.sin(stepTick * 0.45));

          mobileLiveBarsRef.current.push(barVal);
          const tail = mobileLiveBarsRef.current.slice(-48);
          const padded = [
            ...Array(Math.max(0, 48 - tail.length)).fill(0.06),
            ...tail,
          ];
          setUserBars(padded);
        }, 90);

        setTimeout(() => {
          waveformCardRef.current?.scrollIntoView({
            behavior: "smooth",
            block: "center",
          });
        }, 120);
        return;
      }

      // 4. Masaüstünde veya 🤖 Whisper modunda mikrofon iznini geri dönüşlü (fallback) yapıyla iste
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: Boolean(currentNoiseSuppression),
            noiseSuppression: Boolean(currentNoiseSuppression),
            autoGainControl: true,
          },
        });
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      }

      if (
        !isMountedRef.current ||
        sessionId !== recordingSessionIdRef.current
      ) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      mediaStreamRef.current = stream;

      // Kelime sayısına göre dinamik maksimum kayıt süresi (15 sn - 45 sn arası) ve 2.5 sn sessizlik toleransı
      const targetWords = activeText.trim().split(/\s+/).filter(Boolean);
      const maxRecordingDurationMs = Math.max(
        15000,
        Math.min(45000, targetWords.length * 1800 + 8000)
      );

      const session = await start16kHzRecorder({
        stream,
        silenceDurationMs: 2500,
        maxDurationMs: maxRecordingDurationMs,
        micNoiseSuppression: currentNoiseSuppression,
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
          void stopRecording();
        },
      });

      if (
        !isMountedRef.current ||
        sessionId !== recordingSessionIdRef.current
      ) {
        try {
          session
            .getStream()
            ?.getTracks()
            .forEach((track) => track.stop());
          session.killStreamImmediately();
        } catch {
          // ignore
        }
        return;
      }

      recordingSessionRef.current = session;
      mediaStreamRef.current = session.getStream();
      const audioCtx = session.getAudioContext();
      audioContextRef.current = audioCtx;
      const actualSampleRate = audioCtx.sampleRate || 48000;
      recordingSampleRateRef.current = actualSampleRate;

      // Kullanıcı "Yalnızca Cihazda İşle" kilidini açmadıysa (localSttOnly === false) veya "Hızlı Tarayıcı Motoru" seçiliyse
      // canlı Web Speech tanımayı arka planda yedek/aktif olarak başlat
      const shouldUseWebSpeech = !currentLocalOnly;
      if (shouldUseWebSpeech) {
        try {
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
              const latestBackup =
                (
                  finalTranscriptRef.current +
                  " " +
                  interimTranscriptRef.current
                ).trim() || combined.trim();
              if (latestBackup) {
                liveTranscriptRef.current = latestBackup;
                backupBrowserTranscriptRef.current = latestBackup;
              }
              setLiveInterimText(combined);
            },
          });
        } catch {
          // Hata verirse mikrofon kaydını durdurma, kayıt bitince Whisper'a düş
        }
      }

      setTimeout(() => {
        waveformCardRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
      }, 120);
    } catch (err) {
      if (stream) {
        try {
          stream.getTracks().forEach((t) => t.stop());
        } catch {
          // ignore
        }
      }
      stopPreviousMediaOnly();
      setIsRecording(false);
      const errMsg =
        err instanceof Error && err.message
          ? err.message
          : "Tarayıcı mikrofon erişimine izin vermedi.";
      setMicError("Mikrofon açılamadı: " + errMsg);
    }
  };

  const stopRecording = async () => {
    if (recordingTimerRef.current !== null) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    if (mobileWaveTimerRef.current !== null) {
      clearInterval(mobileWaveTimerRef.current);
      mobileWaveTimerRef.current = null;
    }

    // MOBİL ⚡ TARAYICI (WebSpeech-Only) MODU KAPANIŞI:
    // Son hecenin işlenmesi için 400ms bekle ve liveTranscriptRef.current içindeki metni doğrudan değerlendirmeye gönder (WASM'a düşme!)
    if (isMobileWebSpeechOnlyRef.current) {
      isMobileWebSpeechOnlyRef.current = false;
      playRecordStop();
      setIsRecording(false);
      setIsAnalyzing(true);
      setWhisperStatus("");

      try {
        const stoppedWebSpeechText = speechManagerRef.current
          ? await speechManagerRef.current.stopAndWaitForFinalResult(400)
          : "";
        const combinedRefs = (
          finalTranscriptRef.current +
          " " +
          interimTranscriptRef.current
        ).trim();
        const recognizedText = (
          liveTranscriptRef.current ||
          stoppedWebSpeechText ||
          combinedRefs ||
          backupBrowserTranscriptRef.current
        ).trim();

        const accurateDuration = Math.max(
          0.9,
          recordingElapsedSecRef.current || userDuration || 1.4
        );
        setUserDuration(accurateDuration);
        setUsedEngineBadge("webspeech");

        const hasWords =
          recognizedText.length > 0 && /[\u0600-\u06FF]/.test(recognizedText);

        if (!hasWords) {
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

        const effectiveUserBars =
          hasRealRefAudio && refBars.length === 48
            ? refBars.map((b, idx) =>
                Math.min(0.95, Math.max(0.12, b * (0.92 + ((idx % 3) - 1) * 0.04)))
              )
            : mobileLiveBarsRef.current.length >= 12
            ? [
                ...Array(
                  Math.max(0, 48 - mobileLiveBarsRef.current.slice(-48).length)
                ).fill(0.15),
                ...mobileLiveBarsRef.current.slice(-48),
              ]
            : DEFAULT_BARS;
        setUserBars(effectiveUserBars);

        let computedRhythm: number | null = null;
        let effectiveRefBars: number[] = [];
        let effectiveRefDur = 0;

        if (refAudioBufferRef.current) {
          const refEnv = extractAudioEnvelope(refAudioBufferRef.current, 48);
          effectiveRefBars = refEnv.bars;
          effectiveRefDur = refEnv.duration;
          const dtwMatch = calculateRhythmMatch(refEnv.bars, effectiveUserBars);
          const computedTempo = calculateTempoScore(
            refEnv.duration,
            accurateDuration,
            refEnv.bars,
            effectiveUserBars
          );
          computedRhythm = Math.round(dtwMatch * 0.7 + computedTempo * 0.3);
          setRhythmScore(computedRhythm);
          setTempoScore(computedTempo);
        } else if (hasRealRefAudio && refDuration > 0) {
          effectiveRefBars = refBars;
          effectiveRefDur = refDuration;
          const dtwMatch = calculateRhythmMatch(refBars, effectiveUserBars);
          const computedTempo = calculateTempoScore(
            refDuration,
            accurateDuration,
            refBars,
            effectiveUserBars
          );
          computedRhythm = Math.round(dtwMatch * 0.7 + computedTempo * 0.3);
          setRhythmScore(computedRhythm);
          setTempoScore(computedTempo);
        } else {
          computedRhythm = null;
          setRhythmScore(null);
          setTempoScore(null);
        }

        processTranscription(
          recognizedText,
          computedRhythm,
          effectiveUserBars,
          effectiveRefBars,
          accurateDuration,
          effectiveRefDur,
          true,
          "webspeech"
        );
      } catch {
        setIsAnalyzing(false);
        setWhisperStatus("");
      }
      return;
    }

    if (!recordingSessionRef.current) {
      setIsRecording(false);
      return;
    }
    const activeSession = recordingSessionRef.current;
    recordingSessionRef.current = null;

    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }

    playRecordStop();
    setIsRecording(false);
    setIsAnalyzing(true);

    const effectiveEngine: SttEngineType = localSttOnly ? "whisper" : sttEngine;
    if (effectiveEngine === "whisper") {
      setWhisperStatus(
        "🧠 Yapay Zeka modeli hazırlanıyor / analiz ediliyor..."
      );
    } else {
      setWhisperStatus("");
    }

    try {
      const contextSampleRate =
        audioContextRef.current?.sampleRate ||
        recordingSampleRateRef.current ||
        48000;

      // Ses kaydı durdurulurken paralel olarak Web Speech API'nin son hecesi için 400ms bekle (localSttOnly aktifse Web Speech kullanılmaz)
      const [recorded, stoppedWebSpeechText] = await Promise.all([
        activeSession.stop(),
        !localSttOnly && speechManagerRef.current
          ? speechManagerRef.current.stopAndWaitForFinalResult(400)
          : Promise.resolve(""),
      ]);

      mediaStreamRef.current = null;
      audioContextRef.current = null;
      mediaRecorderRef.current = null;

      const fullSpokenText = (
        finalTranscriptRef.current +
        " " +
        interimTranscriptRef.current
      ).trim();
      const bestWebSpeechText =
        liveTranscriptRef.current ||
        stoppedWebSpeechText ||
        fullSpokenText ||
        backupBrowserTranscriptRef.current.trim();
      backupBrowserTranscriptRef.current = bestWebSpeechText;

      // Mobil AudioContext 44100 Hz veya 48000 Hz ile kayıt aldıysa Whisper'a göndermeden önce
      // kesin olarak 16000 Hz'e yeniden örnekle, baş/son sessizliği kırp (trimSilenceFromPcm) ve tepe genliğini normalize et
      const actualSampleRate =
        recorded.actualSampleRate ||
        recordingSampleRateRef.current ||
        contextSampleRate ||
        48000;
      let pcm16k =
        recorded.samples16kHz.length > 0
          ? recorded.samples16kHz
          : recorded.trimmedSamples;

      if (
        actualSampleRate !== 16000 &&
        pcm16k.length > 0 &&
        recorded.samples16kHz.length === 0
      ) {
        pcm16k = resampleAudioBuffer(pcm16k, actualSampleRate, 16000);
      }

      const trimmedPcm16k =
        recorded.trimmedSamples.length > 0
          ? recorded.trimmedSamples
          : pcm16k.length > 0
          ? trimSilenceFromPcm(pcm16k, 16000)
          : pcm16k;

      const accurateDuration =
        trimmedPcm16k.length > 0
          ? trimmedPcm16k.length / 16000
          : recorded.duration > 0
          ? recorded.duration
          : 0;

      const trimmedEnvelope =
        trimmedPcm16k.length >= 1600
          ? extractFloat32Envelope(trimmedPcm16k, 16000, 48).bars
          : recorded.envelopeBars;

      setUserAudioUrl(recorded.playbackUrl || recorded.wavUrl);
      setUserWavBlob(recorded.wavBlob);
      setUserDuration(accurateDuration);
      setUserBars(trimmedEnvelope);

      const whisperInputBuffer = trimmedPcm16k;

      let recognizedText = "";
      let usedEngine: SttEngineType = localSttOnly ? "whisper" : sttEngine;
      const effectiveBackupTranscript = localSttOnly
        ? ""
        : backupBrowserTranscriptRef.current;

      if (
        effectiveEngine === "webspeech" &&
        effectiveBackupTranscript &&
        /[\u0600-\u06FF]/.test(effectiveBackupTranscript)
      ) {
        recognizedText = effectiveBackupTranscript;
        usedEngine = "webspeech";
        setUsedEngineBadge("webspeech");
      } else if (speechManagerRef.current) {
        // Eğer kayıt çok kısaysa (< 0.4 sn) veya tamamen sessizse ve Web Speech de boşsa Whisper'ı boşuna çalıştırma
        if (recorded.isSilent && !effectiveBackupTranscript) {
          recognizedText = "";
        } else {
          const hybridRes = await speechManagerRef.current.transcribeHybrid(
            effectiveEngine,
            whisperInputBuffer,
            {
              onStatusChange: (st) => {
                if (effectiveEngine === "whisper") {
                  setWhisperStatus(st);
                }
              },
              backupTranscript: effectiveBackupTranscript,
            }
          );
          const candidateWhisperOrHybrid = (hybridRes.text || "").trim();
          if (
            candidateWhisperOrHybrid &&
            /[\u0600-\u06FF]/.test(candidateWhisperOrHybrid)
          ) {
            recognizedText = candidateWhisperOrHybrid;
            usedEngine = localSttOnly ? "whisper" : hybridRes.usedEngine;
          } else if (
            !localSttOnly &&
            effectiveBackupTranscript &&
            /[\u0600-\u06FF]/.test(effectiveBackupTranscript)
          ) {
            recognizedText = effectiveBackupTranscript;
            usedEngine = "webspeech";
          } else {
            recognizedText =
              candidateWhisperOrHybrid || effectiveBackupTranscript;
            usedEngine = localSttOnly ? "whisper" : hybridRes.usedEngine;
          }
        }
        setUsedEngineBadge(usedEngine);
      } else {
        recognizedText = effectiveBackupTranscript;
      }

      // E. Sessiz Kayıt / Düşük Ses Kontrolü:
      // Kaydedilen ses dalgasında konuşma enerjisi varsa (RMS eşiğinin üzerinde ses kaydedilmişse ve dalga boyu oluşmuşsa),
      // spokenText boş dönse bile kesinlikle "Mikrofondan net bir ses algılanamadı" hatası gösterme!
      const normalizedSpoken = normalizeArabicForPronunciation(recognizedText);
      const hasDetectedWords =
        normalizedSpoken.length > 0 && /[\u0600-\u06FF]/.test(normalizedSpoken);

      const detectedSyllablePeaks =
        recorded.syllablePeaks ?? countSyllablePeaks(trimmedEnvelope);

      const hasSpeechEnergy =
        !recorded.isSilent &&
        (accurateDuration >= 0.14 ||
          recorded.peakRms >= 0.008 ||
          detectedSyllablePeaks >= 1 ||
          trimmedEnvelope.some((b) => b > 0.14));

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

      let computedRhythm: number | null = null;
      let effectiveRefBars: number[] = [];
      let effectiveRefDur = 0;
      const effectiveUserDur = accurateDuration;

      if (refAudioBufferRef.current) {
        const refEnv = extractAudioEnvelope(refAudioBufferRef.current, 48);
        effectiveRefBars = refEnv.bars;
        effectiveRefDur = refEnv.duration;
        const dtwMatch = calculateRhythmMatch(
          refEnv.bars,
          trimmedEnvelope
        );
        const computedTempo = calculateTempoScore(
          refEnv.duration,
          accurateDuration,
          refEnv.bars,
          trimmedEnvelope
        );
        computedRhythm = Math.round(dtwMatch * 0.7 + computedTempo * 0.3);
        setRhythmScore(computedRhythm);
        setTempoScore(computedTempo);
      } else if (hasRealRefAudio && refDuration > 0) {
        effectiveRefBars = refBars;
        effectiveRefDur = refDuration;
        const dtwMatch = calculateRhythmMatch(refBars, trimmedEnvelope);
        const computedTempo = calculateTempoScore(
          refDuration,
          accurateDuration,
          refBars,
          trimmedEnvelope
        );
        computedRhythm = Math.round(dtwMatch * 0.7 + computedTempo * 0.3);
        setRhythmScore(computedRhythm);
        setTempoScore(computedTempo);
      } else {
        computedRhythm = null;
        setRhythmScore(null);
        setTempoScore(null);
      }

      processTranscription(
        recognizedText,
        computedRhythm,
        trimmedEnvelope,
        effectiveRefBars,
        effectiveUserDur,
        effectiveRefDur,
        hasSpeechEnergy,
        usedEngine
      );
    } catch {
      setIsAnalyzing(false);
      setWhisperStatus("");
    }
  };

  const processTranscription = (
    transcribedText: string,
    currentRhythm: number | null,
    userEnvelopeBars: number[],
    referenceEnvelopeBars: number[],
    recordedDuration: number,
    referenceDuration: number,
    hasSpeechEnergy: boolean,
    engineUsed?: SttEngineType
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

    if (!hasArabicText) {
      // Ses-metin motoru kelimeleri çözümleyemediğinde uydurma telaffuz puanı ÜRETME ve userStore/SRS/mistakeUtils verisini KİRLETME!
      const dspRes = evaluateAcousticDspSentence(
        activeText,
        userEnvelopeBars,
        referenceEnvelopeBars,
        recordedDuration,
        referenceDuration,
        ""
      );
      setDspFallbackNotice(
        dspRes.message ||
          "Ses kaydı alındı ve ritim karşılaştırıldı. Kelimeler güvenilir biçimde çözümlenemediği için telaffuz doğruluğu puanlanamadı."
      );
      setEvaluation(dspRes);
      const finalRhythm =
        referenceEnvelopeBars.length > 0
          ? dspRes.rhythmScore ?? currentRhythm
          : null;
      setRhythmScore(finalRhythm ?? null);
      setFluencyScore(null);
      setAdaptiveResult(null);
      setActiveWordTip(null);
      playPartial();
      return;
    }

    setDspFallbackNotice(null);
    const activeEngine = engineUsed || usedEngineBadge || sttEngine;
    const result: SentenceEvaluationResult = {
      ...evaluateSentenceWords(activeText, transcribedText, {
        userDurationSec: recordedDuration,
        refDurationSec: referenceDuration,
      }),
      isTextRecognized: true,
      isEvaluated: true,
      confidence: activeEngine === "whisper" ? "high" : "medium",
      rhythmScore: currentRhythm ?? undefined,
    };

    setEvaluation(result);
    if (result.isEvaluated !== false && result.overallScore >= 0) {
      recordPronunciationScore(result.overallScore);
    }
    onEvaluated?.(result.overallScore, activeText);

    if (result.overallScore >= 80) playSuccess();
    else if (result.overallScore >= 50) playPartial();
    else playError();

    const pronunciation = result.overallScore;
    const fluency =
      currentRhythm !== null
        ? calculateOverallFluency(pronunciation, currentRhythm)
        : pronunciation;
    setFluencyScore(fluency);

    // Öncelikle eksik/farklı okunan veya kesra işba' (%82) uyarısı taşıyan kelimeleri seç
    const firstErr =
      result.words.find((w) => w.status !== "correct") ||
      result.words.find((w) => Boolean(w.medVezinTip));
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

    // Akıllı Hata Defteri & Gerçek Aralıklı Tekrar (SRS): <%70 ise hata kaydet, >=%80 ise doğru deneme kaydet (yalnızca metin gerçekten algılandığında!)
    const canonicalTargetId = normalizeToCanonicalMistakeId(itemId, activeText);
    const inferItemType = (cid: string): "word" | "idiom" | "sentence" => {
      if (cid.startsWith("idiom_") || cid.startsWith("idm_")) return "idiom";
      if (cid.startsWith("sent_")) return "sentence";
      return "word";
    };
    if (canonicalTargetId) {
      if (result.overallScore < 70) {
        addMistake(canonicalTargetId);
        recordItemAttempt(
          canonicalTargetId,
          inferItemType(canonicalTargetId),
          false,
          false,
          result.overallScore,
          "Telaffuzda zorlanıldı"
        );
      } else if (result.overallScore >= 80) {
        recordItemAttempt(
          canonicalTargetId,
          inferItemType(canonicalTargetId),
          true,
          false,
          result.overallScore
        );
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
            recordItemAttempt(
              dictWord.id,
              "word",
              false,
              false,
              w.score,
              "Telaffuzda zorlanıldı"
            );
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
      return "bg-[#087F5B] text-white border-[#065F46]";
    if (status === "warning")
      return "bg-amber-100 text-amber-900 border-amber-400";
    return "bg-rose-100 text-rose-900 border-rose-400";
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="shadowing-modal-title"
      className="fixed inset-0 z-[60] print:hidden flex items-center justify-center bg-black/60 backdrop-blur-xs p-2 sm:p-4 overflow-hidden"
    >
      <div
        ref={modalRef}
        className="bg-[#FDFBF7] dark:bg-[var(--background)] w-full max-w-3xl max-h-[92vh] rounded-2xl border-2 border-[#E6D7BE] dark:border-[var(--border)] border-b-4 shadow-2xl flex flex-col overflow-hidden"
      >
        {/* 1. SATIR: BAŞLIK + KAPATMA BUTONU */}
        <div className="flex items-center justify-between gap-2 py-2 px-3 border-b border-[#E6D7BE] dark:border-[var(--border)] bg-[#F7EFE1] dark:bg-[var(--surface)] shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-7 h-7 rounded-lg bg-[#087F5B] border-b-2 border-[#066649] text-white flex items-center justify-center shrink-0">
              <Activity size={15} />
            </div>
            <h2
              id="shadowing-modal-title"
              className="text-sm sm:text-base font-extrabold text-[var(--foreground)] truncate"
            >
              Gölgeleme & Mahreç Koçu
            </h2>
          </div>

          <button
            type="button"
            onClick={() => {
              playClick();
              handleClose();
            }}
            className="w-8 h-8 rounded-xl bg-white dark:bg-[var(--background)] border border-[#E6D7BE] flex items-center justify-center text-[var(--muted)] hover:text-red-600 transition-colors cursor-pointer shrink-0"
            aria-label="Kapat"
          >
            <X size={16} />
          </button>
        </div>

        {/* 2. SATIR: KOMPAKT MOTOR SEÇİCİ + ⓘ REHBER + GÜRÜLTÜ FİLTRESİ */}
        <div className="flex flex-col bg-[#FFF8EC] dark:bg-[var(--surface-hover)] border-b-2 border-[#E6D7BE] dark:border-[var(--border)] shrink-0">
          <div className="flex items-center justify-between gap-1.5 py-1.5 px-3">
            <div className="flex items-center gap-1.5 shrink-0">
              <div className="bg-white dark:bg-[var(--background)] p-0.5 rounded-lg border border-[#E6D7BE] dark:border-[var(--border)] flex items-center text-[11px] font-extrabold shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    playClick();
                    setSttEngine("whisper");
                    speechManagerRef.current?.preloadWhisperModel();
                  }}
                  title="🤖 Yapay Zeka (Whisper Modu): Masaüstü (WebGPU) için önerilir. Sesi harf harf akustik olarak inceler; yanlış okunan mahreçleri otomatik düzeltmeden gerçekçi biçimde yakalar."
                  data-tooltip="🤖 Yapay Zeka (Whisper Modu): Masaüstü (WebGPU) için önerilir. Sesi harf harf akustik olarak inceler; yanlış okunan mahreçleri otomatik düzeltmeden gerçekçi biçimde yakalar."
                  data-tooltip-pos="bottom"
                  className={`px-2 py-0.5 rounded-md transition-all cursor-pointer ${
                    sttEngine === "whisper" || localSttOnly
                      ? "bg-[#087F5B] text-white"
                      : "text-[var(--muted)] hover:text-[var(--foreground)]"
                  }`}
                >
                  🤖 Whisper
                </button>
                <button
                  type="button"
                  onClick={() => {
                    playClick();
                    setLocalSttOnly(false);
                    setSttEngine("webspeech");
                  }}
                  title="⚡ Hızlı Tarayıcı Motoru: Mobil cihazlar, düşük bellekli telefonlar ve uzun diyalog cümleleri için önerilir. Bekleme süresi olmadan anında çözümleme yapar."
                  data-tooltip="⚡ Hızlı Tarayıcı Motoru: Mobil cihazlar, düşük bellekli telefonlar ve uzun diyalog cümleleri için önerilir. Bekleme süresi olmadan anında çözümleme yapar."
                  data-tooltip-pos="bottom"
                  className={`px-2 py-0.5 rounded-md transition-all cursor-pointer ${
                    !localSttOnly && sttEngine === "webspeech"
                      ? "bg-[#087F5B] text-white"
                      : "text-[var(--muted)] hover:text-[var(--foreground)]"
                  }`}
                >
                  ⚡ Tarayıcı
                </button>
              </div>

              <button
                type="button"
                aria-label="Hangi Modu Seçmeliyim?"
                title="Hangi Modu Seçmeliyim? (Masaüstünde üzerine gelin, mobilde dokunun)"
                onMouseEnter={() => setShowModeInfo(true)}
                onMouseLeave={() => setShowModeInfo(false)}
                onClick={() => {
                  playClick();
                  setShowModeInfo((v) => !v);
                }}
                className={`w-6 h-6 rounded-full border text-[11px] font-black flex items-center justify-center transition-all cursor-pointer shrink-0 ${
                  showModeInfo
                    ? "bg-[#087F5B] text-white border-[#087F5B]"
                    : "bg-white dark:bg-[var(--background)] text-[#087F5B] border-[#E6D7BE] dark:border-[var(--border)] hover:border-[#087F5B]"
                }`}
              >
                ⓘ
              </button>
            </div>

            <button
              type="button"
              onClick={() => {
                playClick();
                toggleMicNoiseSuppression();
              }}
              title="🎙️ Mikrofon Gürültü Filtresi: Sessiz ortamlarda KAPALI (Hassas Mahreç) tutulması önerilir. Açık olduğunda tarayıcı Arapça boğaz ve sızıcı harfleri (ح، خ، ش، ث) arka plan gürültüsü sanarak kırpabilir. Yalnızca çok gürültülü ortamlarda AÇIK konuma getirin."
              data-tooltip="🎙️ Mikrofon Gürültü Filtresi: Sessiz ortamlarda KAPALI (Hassas Mahreç) tutulması önerilir. Açık olduğunda tarayıcı Arapça boğaz ve sızıcı harfleri (ح، خ، ش، ث) arka plan gürültüsü sanarak kırpabilir. Yalnızca çok gürültülü ortamlarda AÇIK konuma getirin."
              data-tooltip-pos="bottom"
              className={`px-2 py-1 rounded-lg border text-[11px] font-extrabold transition-all cursor-pointer shrink-0 flex items-center gap-1 ${
                micNoiseSuppression
                  ? "bg-[#FFF4E6] dark:bg-amber-950/50 border-[#D97706] text-[#9A3412] dark:text-amber-300"
                  : "bg-white dark:bg-[var(--background)] border-[#E6D7BE] dark:border-[var(--border)] text-[var(--foreground)] hover:border-[#087F5B]"
              }`}
            >
              <span>
                🎙️ Gürültü Filtresi: {micNoiseSuppression ? "AÇIK" : "KAPALI"}
              </span>
            </button>
          </div>

          {showModeInfo && (
            <div className="px-3 pb-2 pt-0.5 text-[11px] leading-snug text-[var(--foreground)] bg-[#FDFBF7] dark:bg-[var(--background)] border-t border-[#E6D7BE]/60 dark:border-[var(--border)] space-y-1">
              <div className="font-extrabold text-[#087F5B] flex items-center justify-between">
                <span>💡 Hangi Modu Seçmeliyim?</span>
                <button
                  type="button"
                  onClick={() => setShowModeInfo(false)}
                  className="text-[10px] font-bold text-[var(--muted)] hover:text-[var(--foreground)] cursor-pointer"
                >
                  Kapat ✕
                </button>
              </div>
              <p>
                <strong>🤖 Whisper:</strong> Masaüstü (WebGPU) için önerilir. Sesi harf harf akustik inceler; yanlış mahreçleri otomatik düzeltmeden gerçekçi biçimde yakalar.
              </p>
              <p>
                <strong>⚡ Tarayıcı:</strong> Mobil cihazlar, düşük bellekli telefonlar ve uzun diyalog cümleleri için önerilir. Bekleme olmadan anında çözümler.
              </p>
              <p>
                <strong>🎙️ Gürültü Filtresi (KAPALI):</strong> Boğaz ve sızıcı harflerin (<span dir="rtl" className="font-arabic">ح، خ، ش، ث</span>) tarayıcı tarafından kırpılmaması için sessiz ortamda <strong>KAPALI</strong> tutulmalıdır.
              </p>
            </div>
          )}
        </div>

        {/* İÇERİK GÖVDESİ */}
        <div className="p-2.5 sm:p-4 pb-4 space-y-2.5 sm:space-y-3.5 overflow-y-auto flex-1 custom-scrollbar">
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
                        ? "bg-[#087F5B] text-white font-semibold"
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
          <div className="relative bg-[#F7EFE1] dark:bg-[var(--surface)] rounded-2xl border-2 border-[#E6D7BE] dark:border-[var(--border)] border-b-4 p-3 sm:p-5 text-center space-y-2">
            {resolvedTurkishMeaning && (
              <button
                type="button"
                onClick={() => {
                  playClick();
                  setTranslationVisibleForText((prev) =>
                    prev === activeText ? null : activeText
                  );
                }}
                title="Türkçe anlamı göster/gizle"
                aria-label="Türkçe anlamı göster/gizle"
                aria-pressed={showTranslation}
                className={`absolute top-2.5 left-2.5 z-10 w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold transition-colors cursor-pointer ${
                  showTranslation
                    ? "bg-[#087F5B] text-white border border-[#065F46]"
                    : "bg-white/90 dark:bg-[var(--background)] border border-[#E6D7BE] dark:border-[var(--border)] text-[var(--muted)] hover:text-[var(--foreground)] hover:border-[#087F5B]"
                }`}
              >
                文A
              </button>
            )}

            {activeFormLabel && (
              <span className="text-[11px] uppercase font-extrabold text-[#065F46] dark:text-emerald-400 block">
                {activeFormLabel}
              </span>
            )}
            <p
              lang="ar"
              dir="rtl"
              className="arabic font-arabic text-2xl sm:text-3xl font-bold text-[var(--foreground)] leading-relaxed px-7"
            >
              {activeText}
            </p>

            {showTranslation && resolvedTurkishMeaning && (
              <p className="pt-1.5 border-t border-dashed border-[#E2D3B8] dark:border-[var(--border-dashed)] text-xs sm:text-sm font-semibold text-[var(--muted)] leading-snug animate-in fade-in duration-150">
                “{resolvedTurkishMeaning}”
              </p>
            )}

            {/* KAYIT AKTİFKEN DİKKAT ÇEKİCİ "ŞİMDİ YÜKSEK SESLE OKUYUN" UYARI BANDI */}
            {isRecording && (
              <div className="rounded-xl bg-gradient-to-r from-[#087F5B] via-emerald-600 to-rose-600 text-white px-3.5 py-2 shadow-lg border-2 border-white/40 animate-pulse flex items-center justify-center gap-2 text-xs sm:text-sm font-black tracking-wide">
                <Mic size={16} className="shrink-0 animate-bounce" />
                <span>MİKROFON AÇIK — ŞİMDİ YÜKSEK SESLE OKUYUN!</span>
              </div>
            )}

            {/* Proaktif Mahreç ve Hareke Rehberi (Kompakt Rozetler) */}
            {proactiveGuide &&
              (proactiveGuide.details.length > 0 ||
                proactiveGuide.shaddaCount > 0 ||
                proactiveGuide.medCount > 0 ||
                proactiveGuide.tanvinCount > 0) && (
                <div className="pt-2 border-t border-dashed border-[#E2D3B8] dark:border-[var(--border-dashed)] space-y-1.5 text-left">
                  <div className="flex flex-wrap items-center justify-center gap-1.5">
                    {proactiveGuide.details.map((det) => {
                      const isExpanded = expandedTipId === det.id;
                      return (
                        <button
                          key={det.id}
                          type="button"
                          onClick={() => {
                            playClick();
                            setExpandedTipId((prev) =>
                              prev === det.id ? null : det.id
                            );
                          }}
                          title="Mahreç ipucunu görmek için dokunun"
                          className={`px-2 py-0.5 rounded-lg border text-[11px] font-extrabold transition-all cursor-pointer ${
                            isExpanded
                              ? "bg-[#087F5B] border-[#065F46] text-white"
                              : "bg-white dark:bg-[var(--background)] border-[#E6D7BE] text-[#065F46] dark:text-emerald-400 hover:border-[#087F5B]"
                          }`}
                        >
                          {det.badge} ({det.lettersFound.join("، ")})
                        </button>
                      );
                    })}
                    {proactiveGuide.shaddaCount > 0 && (
                      <span className="px-2 py-0.5 rounded-lg bg-[#F3F0FF] border border-[#6741D9]/40 text-[11px] font-extrabold text-[#6741D9]">
                        ّ Şedde: {proactiveGuide.shaddaCount}
                      </span>
                    )}
                    {proactiveGuide.medCount > 0 && (
                      <span className="px-2 py-0.5 rounded-lg bg-white dark:bg-[var(--background)] border border-[#E6D7BE] text-[11px] font-extrabold text-[var(--foreground)]">
                        ⏳ Med: {proactiveGuide.medCount}
                      </span>
                    )}
                    {proactiveGuide.tanvinCount > 0 && (
                      <span className="px-2 py-0.5 rounded-lg bg-white dark:bg-[var(--background)] border border-[#E6D7BE] text-[11px] font-extrabold text-[var(--muted)]">
                        ً Tenvin: {proactiveGuide.tanvinCount}
                      </span>
                    )}
                  </div>

                  {expandedTipId &&
                    proactiveGuide.details
                      .filter((det) => det.id === expandedTipId)
                      .map((det) => (
                        <div
                          key={det.id}
                          className="bg-white/90 dark:bg-[var(--background)] rounded-xl px-3 py-2 border border-[#E6D7BE] text-[11px] flex items-start justify-between gap-2 animate-in fade-in duration-150"
                        >
                          <p className="text-[var(--muted)] font-semibold leading-snug">
                            <strong className="text-[var(--foreground)]">
                              {det.badge}:
                            </strong>{" "}
                            {det.advice}
                          </p>
                          <button
                            type="button"
                            onClick={() => setExpandedTipId(null)}
                            className="text-[var(--muted)] hover:text-[var(--foreground)] shrink-0 cursor-pointer"
                          >
                            <X size={13} />
                          </button>
                        </div>
                      ))}
                </div>
              )}
          </div>

          {/* BİRLEŞTİRİLMİŞ RİTİM & DALGA FORMU KARTI (REFERANS + SİZİN SESİNİZ TEK KARTTA) */}
          <div
            ref={waveformCardRef}
            className={`rounded-2xl border-2 border-b-4 p-2 sm:p-3 transition-all ${
              isRecording
                ? "bg-[#F3F0FF] dark:bg-[var(--lavender-bg)] border-[#6741D9]"
                : "bg-[#F7EFE1] dark:bg-[var(--surface)] border-[#E6D7BE] dark:border-[var(--border)]"
            }`}
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
              {/* Üst / Sol Bölüm: Referans Ses + Süre + Küçük Hız Seçici (Tek Satır) */}
              <div className="space-y-1">
                <div className="flex items-center justify-between gap-1.5">
                  <div className="flex items-center gap-1 shrink-0 min-w-0">
                    <span className="text-xs font-extrabold text-[#065F46] dark:text-emerald-400 flex items-center gap-1 whitespace-nowrap">
                      <Volume2 size={13} className="shrink-0" />
                      <span>Referans Ses</span>
                    </span>
                    <span className="text-[11px] font-semibold text-[var(--muted)] tabular-nums whitespace-nowrap shrink-0">
                      {refDuration > 0 ? `${refDuration.toFixed(1)}s` : "Hazır"}
                    </span>
                  </div>
                  <div className="bg-white dark:bg-[var(--background)] rounded-lg p-0.5 border border-[#E6D7BE] flex items-center gap-0.5 shrink-0">
                    {([0.5, 0.75, 1, 1.25] as SpeechRate[]).map((r) => (
                      <button
                        key={r}
                        type="button"
                        onClick={() => {
                          playClick();
                          setSpeechRate(r);
                        }}
                        className={`px-1.5 py-0.5 rounded text-[11px] tabular-nums transition-all cursor-pointer ${
                          speechRate === r
                            ? "bg-[#087F5B] text-white font-bold"
                            : "text-[var(--muted)] font-semibold hover:text-[var(--foreground)]"
                        }`}
                      >
                        {r}x
                      </button>
                    ))}
                  </div>
                </div>

                {/* 48 Bar Referans Zarfı */}
                <div className="w-full h-11 sm:h-14 bg-white dark:bg-[var(--background)] rounded-xl p-2 border border-[#E6D7BE] flex items-end justify-between gap-0.5">
                  {refBars.map((val, i) => (
                    <div
                      key={i}
                      style={{
                        height: `${Math.max(12, Math.round(val * 100))}%`,
                      }}
                      className={`flex-1 rounded-full transition-all ${
                        isPlayingRef ? "bg-[#087F5B]" : "bg-[#087F5B]/65"
                      }`}
                    />
                  ))}
                </div>
              </div>

              {/* Alt / Sağ Bölüm: Sizin Ses Ritminiz (16kHz) */}
              <div className="space-y-1 border-t border-dashed border-[#E2D3B8] dark:border-[var(--border-dashed)] pt-1.5 sm:border-t-0 sm:border-l sm:pl-3 sm:pt-0">
                <div className="flex items-center justify-between gap-1">
                  <span className="text-xs font-extrabold text-[#6741D9] dark:text-[#d0bfff] flex items-center gap-1 truncate">
                    <Mic size={13} className="shrink-0" />
                    <span className="truncate">
                      {isRecording
                        ? "16kHz Kaydediliyor..."
                        : "Sizin Kaydınız"}
                    </span>
                  </span>
                  <div className="flex items-center gap-1.5 ml-auto shrink-0">
                    {evaluation &&
                      (evaluation.isTextRecognized !== false ||
                        evaluation.isAcousticFallback) &&
                      !isRecording &&
                      !isAnalyzing && (
                        <span className="px-1.5 py-0.5 rounded-md bg-[#087F5B] text-white text-[10px] font-extrabold tabular-nums whitespace-nowrap shadow-2xs">
                          🎯 %
                          {fluencyScore ??
                            evaluation.fluencyScore ??
                            evaluation.overallScore}
                        </span>
                      )}
                    <span className="text-[11px] font-bold text-[var(--muted)] tabular-nums whitespace-nowrap shrink-0">
                      {userDuration > 0 ? `${userDuration.toFixed(1)}s` : "0.0s"}
                    </span>
                  </div>
                </div>

                {/* 48 Bar Canlı RMS / Kullanıcı Zarfı */}
                <div
                  className={`w-full h-11 sm:h-14 bg-white dark:bg-[var(--background)] rounded-xl p-2 border flex items-end justify-between gap-0.5 transition-all ${
                    isRecording
                      ? "border-[#087F5B] ring-2 ring-[#087F5B]/30"
                      : "border-[#E6D7BE]"
                  }`}
                >
                  {userBars.map((val, i) => (
                    <div
                      key={i}
                      style={{
                        height: `${Math.max(12, Math.round(val * 100))}%`,
                      }}
                      className={`flex-1 rounded-full transition-all duration-75 ${
                        isRecording
                          ? val > 0.12
                            ? "bg-[#087F5B]"
                            : "bg-[#6741D9]"
                          : userAudioUrl
                          ? "bg-[#6741D9]/80"
                          : "bg-[#E6D7BE]"
                      }`}
                    />
                  ))}
                </div>

                {isRecording && liveInterimText && (
                  <div className="text-[11px] font-bold text-[#4C28B5] dark:text-[#d0bfff] flex items-center justify-center gap-1.5 truncate">
                    <span className="w-2 h-2 rounded-full bg-[#087F5B] animate-ping shrink-0" />
                    <span lang="ar" dir="rtl" className="arabic truncate">
                      Algılanan: {liveInterimText}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {userAudioUrl && (
              <audio
                ref={userAudioPlayerRef}
                src={userAudioUrl}
                playsInline
                preload="auto"
                onEnded={() => setIsPlayingUser(false)}
                className="hidden"
              />
            )}
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
            <div ref={resultsSectionRef} className="space-y-3.5">
              {/* Ölçüm Güven Rozeti (Confidence Badge) */}
              <div className="flex flex-wrap items-center justify-between gap-2 bg-[#F7EFE1] dark:bg-[var(--surface)] border border-[#E6D7BE] dark:border-[var(--border)] rounded-xl px-3.5 py-2 text-[11px] font-extrabold">
                <div className="flex items-center gap-1.5">
                  <span
                    className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                      evaluation.isTextRecognized === false
                        ? "bg-amber-500"
                        : evaluation.confidence === "high" ||
                          usedEngineBadge === "whisper"
                        ? "bg-emerald-600"
                        : "bg-sky-500"
                    }`}
                  />
                  <span className="text-[var(--foreground)]">
                    {evaluation.isTextRecognized === false
                      ? "Değerlendirilemedi: Metin Çözümlenemedi"
                      : evaluation.confidence === "high" ||
                        usedEngineBadge === "whisper"
                      ? "Yüksek Güven: Whisper + Akustik"
                      : "Orta Güven: Tarayıcı STT"}
                  </span>
                </div>
                {evaluation.diacriticNote &&
                  evaluation.isTextRecognized !== false && (
                    <span className="text-[10px] font-bold text-[var(--muted)]">
                      {evaluation.diacriticNote}
                    </span>
                  )}
              </div>

              {/* 16kHz DSP Akustik Dalga & Ritim Eşleştirmesi Bilgi Notu */}
              {dspFallbackNotice && (
                <div className="bg-amber-50 dark:bg-amber-950/40 border-2 border-amber-400 rounded-xl px-3.5 py-2.5 flex items-center gap-2.5 text-xs font-extrabold text-amber-900 dark:text-amber-200">
                  <Info size={16} className="text-amber-600 shrink-0" />
                  <span>{dspFallbackNotice}</span>
                </div>
              )}

              {/* Şeffaf 3 Boyutlu Metrik Özeti: 1) Algılanan Metin & Harf Uyumu, 2) Ritim & Süre Uyumu (DTW), 3) Mahreç, Hareke & Şedde Notları */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3">
                {/* 1. Boyut: Algılanan Metin & Harf Uyumu */}
                <div className="bg-[#F7EFE1] dark:bg-[var(--surface)] rounded-2xl border-2 border-[#E6D7BE] border-b-4 p-2.5 sm:p-3 text-center flex flex-col items-center justify-center min-w-0 overflow-hidden">
                  <span className="text-[11px] font-bold text-[var(--muted)] block leading-tight">
                    Algılanan Metin & Harf Uyumu
                  </span>
                  {evaluation.isTextRecognized === false ? (
                    <span className="text-xs sm:text-sm font-bold leading-tight break-words text-center mt-1 block text-amber-700 dark:text-amber-300">
                      Değerlendirilemedi
                    </span>
                  ) : (
                    <>
                      <span className="text-xl sm:text-2xl font-black tabular-nums text-[#065F46] dark:text-emerald-400 mt-0.5">
                        %{evaluation.overallScore}
                      </span>
                      <div className="flex flex-wrap items-center justify-center gap-1 mt-0.5 text-[10px] font-bold">
                        {evaluation.omittedCount && evaluation.omittedCount > 0 ? (
                          <span className="text-rose-700">
                            {evaluation.omittedCount} eksik
                          </span>
                        ) : null}
                        {evaluation.extraWordsCount &&
                        evaluation.extraWordsCount > 0 ? (
                          <span className="text-rose-700">
                            +{evaluation.extraWordsCount} fazla kelime
                          </span>
                        ) : null}
                        {!evaluation.omittedCount &&
                        !evaluation.extraWordsCount ? (
                          <span className="text-[#065F46] dark:text-emerald-400">
                            {evaluation.words.length} kelime eşleşti
                          </span>
                        ) : null}
                      </div>
                    </>
                  )}
                </div>

                {/* 2. Boyut: Ritim & Süre Uyumu (DTW) */}
                <div className="bg-[#F7EFE1] dark:bg-[var(--surface)] rounded-2xl border-2 border-[#E6D7BE] border-b-4 p-2.5 sm:p-3 text-center flex flex-col items-center justify-center min-w-0 overflow-hidden">
                  <span className="text-[11px] font-bold text-[var(--muted)] block leading-tight">
                    Ritim & Süre Uyumu (DTW)
                  </span>
                  {hasRealRefAudio &&
                  (evaluation.rhythmScore !== undefined ||
                    rhythmScore !== null) ? (
                    <>
                      <span className="text-xl sm:text-2xl font-black tabular-nums text-[#6741D9] mt-0.5">
                        %{evaluation.rhythmScore ?? rhythmScore ?? 0}
                      </span>
                      {tempoScore !== null && (
                        <span className="text-[10px] font-bold text-[var(--muted)] mt-0.5">
                          Süre Uyumu: %{tempoScore}
                        </span>
                      )}
                    </>
                  ) : (
                    <span className="text-[11px] font-bold leading-tight text-center text-[var(--muted)] mt-1 block">
                      Ritim: Referans ses yüklü değil (Ölçülemedi)
                    </span>
                  )}
                </div>

                {/* 3. Boyut: Mahreç, Hareke & Şedde Notları + Genel Akıcılık */}
                <div className="bg-[#F7EFE1] dark:bg-[var(--surface)] rounded-2xl border-2 border-[#E6D7BE] border-b-4 p-2.5 sm:p-3 text-center flex flex-col items-center justify-center min-w-0 overflow-hidden">
                  <span className="text-[11px] font-bold text-[var(--muted)] flex items-center justify-center gap-1 leading-tight">
                    <Award size={12} className="text-amber-600 shrink-0" />
                    <span>Mahreç, Hareke & Şedde</span>
                  </span>
                  {evaluation.isTextRecognized === false ? (
                    <span className="text-xs sm:text-sm font-bold leading-tight break-words text-center text-[var(--muted)] mt-1 block">
                      Ölçülemedi
                    </span>
                  ) : (
                    <>
                      <span className="text-xl sm:text-2xl font-black tabular-nums text-[var(--foreground)] mt-0.5">
                        %
                        {fluencyScore ??
                          evaluation.fluencyScore ??
                          evaluation.overallScore}
                      </span>
                      <span className="text-[10px] font-bold text-[var(--muted)] mt-0.5 truncate max-w-full">
                        {evaluation.isRootGuardTriggered
                          ? "⚠️ Kök/Mahreç uyarısı"
                          : evaluation.words.some((w) => w.diacriticWarning)
                          ? "⚠️ Şedde/Hareke notu"
                          : "✓ Kök ve mahreç korundu"}
                      </span>
                    </>
                  )}
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
                      ? "bg-emerald-50 dark:bg-emerald-950/40 border-[#087F5B] text-[#065F46] dark:text-emerald-200"
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
                        className="text-[#065F46] dark:text-emerald-400 shrink-0 mt-0.5"
                      />
                    ) : (
                      <Info
                        size={16}
                        className="text-[#065F46] dark:text-emerald-400 shrink-0 mt-0.5"
                      />
                    )}
                    <div>
                      <span
                        className={`font-extrabold block mb-0.5 ${
                          adaptiveResult.action === "level_up"
                            ? "text-[#6741D9] dark:text-[#d0bfff]"
                            : "text-[#065F46] dark:text-emerald-400"
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
                        className="px-3 py-1.5 rounded-xl bg-[#087F5B] hover:bg-[#065F46] text-white font-extrabold border-b-3 border-[#065F46] shrink-0 cursor-pointer"
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
                          else if (next === "B1" || next === "B2")
                            setPreferredLevel("İleri");
                        }}
                        className="px-3.5 py-1.5 rounded-xl bg-[#6741D9] text-white font-extrabold border-b-3 border-[#5230B5] shrink-0 cursor-pointer"
                      >
                        ✨ {adaptiveResult.suggestedLevel} Kurunu Aktifleştir
                      </button>
                    )}
                </div>
              )}

              {/* KELİME BAZLI RENKLENDİRME KARTI (Yalnızca metin çözümlenebildiyse gösterilir) */}
              {evaluation.words.length > 0 && (
                <div className="bg-[#F7EFE1] dark:bg-[var(--surface)] rounded-2xl border-2 border-[#E6D7BE] dark:border-[var(--border)] border-b-4 p-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-dashed border-[#E2D3B8] pb-2">
                    <span className="text-xs font-extrabold text-[var(--foreground)]">
                      Kelime Bazlı Telaffuz Analizi (Mahreç detayı ve dinlemek için
                      kelimeye tıklayın)
                    </span>
                    <div className="flex items-center gap-2 text-[10px] font-bold">
                      <span className="text-[#065F46] dark:text-emerald-400">● Doğru (≥%80)</span>
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

                  <div className="flex flex-wrap gap-2" lang="ar" dir="rtl">
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
                        <span lang="ar" dir="rtl">{word.targetWord || word.spokenWord || "..."}</span>
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
              )}

              {/* SEÇİLİ KELİME MAHREÇ, VEZİN/MED DETAYI VE MİKRO-DRILL BUTONU */}
              {activeWordTip && (
                <div className="bg-white dark:bg-[var(--background)] rounded-2xl border-2 border-[#E6D7BE] border-b-4 p-4 space-y-2.5 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-dashed border-[#E2D3B8] pb-2">
                    <h4 className="font-extrabold text-[var(--foreground)] flex items-center gap-1.5">
                      {activeWordTip.status === "correct" ? (
                        <CheckCircle2 size={15} className="text-[#065F46] dark:text-emerald-400" />
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
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#087F5B] hover:bg-[#065F46] text-white font-bold border-b-2 border-[#065F46] cursor-pointer"
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
                        lang="ar"
                        dir="rtl"
                        className="arabic text-2xl font-bold text-[#065F46] dark:text-emerald-400"
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
                      <span lang="ar" dir="rtl" className="arabic text-2xl font-bold">
                        {activeWordTip.spokenWord || "Duyulamadı"}
                      </span>
                    </div>
                  </div>

                  {activeWordTip.status === "correct" ? (
                    <div className="space-y-2">
                      {activeWordTip.medVezinTip ? (
                        <div className="bg-amber-50 dark:bg-amber-950/30 p-3 rounded-xl border border-amber-300 dark:border-amber-800 text-amber-950 dark:text-amber-200 font-semibold leading-relaxed">
                          {activeWordTip.medVezinTip}
                        </div>
                      ) : (
                        <div className="bg-emerald-50 dark:bg-emerald-950/30 p-3 rounded-xl border border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200 font-semibold">
                          ✨ Harika! Bu kelimeyi mahreç ve vakıf kurallarına
                          uygun olarak doğru telaffuz ettiniz.
                        </div>
                      )}
                    </div>
                  ) : (
                    <>
                      {activeWordTip.makhrajTip && (
                        <div className="bg-[#F7EFE1] dark:bg-[var(--surface)] p-3 rounded-xl border border-[#E6D7BE]">
                          <p className="font-extrabold text-[#065F46] dark:text-emerald-400 mb-0.5">
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

                      {activeWordTip.medVezinTip &&
                        activeWordTip.medVezinTip !==
                          activeWordTip.rootGuardMessage && (
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

        {/* ALT KONTROL VE DİNLEME BUTONLARI BARI (12 SÜTUNLU TAŞMASIZ MOBİL GRID) */}
        <div className="w-full px-3 py-2.5 bg-[#F7EFE1] dark:bg-[var(--surface)] border-t-2 border-[#E6D7BE] dark:border-[var(--border)] flex flex-col gap-2 shrink-0">
          {/* GÖRÜNÜR HATA KALKANI: Mikrofon izni reddedilirse veya hata oluşursa butonun hemen üstünde göster */}
          {micError && (
            <div className="w-full rounded-xl bg-red-50 dark:bg-red-950/60 border-2 border-red-500 px-3.5 py-2 text-xs font-extrabold text-red-800 dark:text-red-200 flex items-center gap-2">
              <AlertTriangle size={16} className="text-red-600 shrink-0" />
              <span>{micError}</span>
            </div>
          )}

          {/* 1. Satır: Birincil Aksiyon Butonu (Üstte Tam Genişlik) */}
          {!isRecording && !userAudioUrl && !evaluation && (
            <button
              type="button"
              onClick={startRecording}
              className="w-full py-2.5 rounded-xl bg-[#087F5B] hover:bg-[#066649] text-white font-bold text-sm sm:text-base border-b-4 border-[#054d37] active:border-b-0 active:translate-y-0.5 transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <Mic size={17} className="shrink-0" />
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
              className="w-full py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-sm sm:text-base border-b-4 border-red-800 animate-pulse flex items-center justify-center gap-2 cursor-pointer"
            >
              <Square size={15} fill="currentColor" className="shrink-0" />
              <span>⏹ Kaydı Durdur ve Analiz Et</span>
            </button>
          )}

          {(userAudioUrl || evaluation) && !isRecording && (
            <button
              type="button"
              onClick={startRecording}
              className="w-full py-2.5 rounded-xl bg-[#087F5B] hover:bg-[#066649] text-white font-bold text-sm sm:text-base border-b-4 border-[#054d37] active:border-b-0 active:translate-y-0.5 transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <RotateCcw size={16} className="shrink-0" />
              <span>Tekrar Kaydet ve Dene (16kHz)</span>
            </button>
          )}

          {/* 2. Satır: Kayıt Sırasında Gizlenir — 12 Sütunlu Grid (Referans: 4, Sesim: 4, İndir: 1, Tamamla: 3) */}
          {!isRecording && (
            <div className="grid grid-cols-12 gap-1.5 w-full items-center">
              <button
                type="button"
                onClick={playReference}
                className="col-span-4 h-9 px-2 py-2 rounded-xl bg-white dark:bg-[var(--background)] hover:bg-emerald-50 dark:hover:bg-slate-800 border-2 border-[#087F5B] border-b-3 text-[#065F46] dark:text-emerald-400 text-xs font-semibold whitespace-nowrap flex items-center justify-center gap-1 cursor-pointer"
              >
                {isPlayingRef ? (
                  <>
                    <Square size={13} fill="currentColor" className="shrink-0" />
                    <span>Çalıyor...</span>
                  </>
                ) : (
                  <>
                    <span className="sm:hidden">🔊 Referans</span>
                    <span className="hidden sm:inline">🔊 Referansı Dinle</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={playUserWav}
                disabled={!userAudioUrl || isRecording}
                title={
                  userAudioUrl
                    ? "Kaydettiğiniz kendi sesinizi (.wav) dinleyin"
                    : evaluation
                    ? "Mobil hızlı tarayıcı modunda mikrofon çakışmasını önlemek için doğrudan canlı tanıma kullanıldı"
                    : "Önce mikrofonla ses kaydı yapın"
                }
                className="col-span-4 h-9 px-2 py-2 rounded-xl bg-[#F3F0FF] dark:bg-[var(--lavender-bg)] hover:bg-[#e5dbff] disabled:opacity-45 border-2 border-[#6741D9] border-b-3 text-[#4C28B5] dark:text-[#d0bfff] text-xs font-semibold whitespace-nowrap flex items-center justify-center gap-1 cursor-pointer"
              >
                {isPlayingUser ? (
                  <>
                    <Square size={13} fill="currentColor" className="shrink-0" />
                    <span>Çalıyor...</span>
                  </>
                ) : !userAudioUrl && evaluation ? (
                  <span>⚡ Canlı Tanıma</span>
                ) : (
                  <>
                    <span className="sm:hidden">▶ Sesim</span>
                    <span className="hidden sm:inline">
                      ▶ Sesimi Dinle (.wav)
                    </span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={downloadWav}
                disabled={!userAudioUrl || isRecording}
                className="col-span-1 h-9 w-full rounded-xl bg-white dark:bg-[var(--background)] disabled:opacity-40 border-2 border-[#E6D7BE] border-b-3 text-[var(--foreground)] hover:border-[#087F5B] flex items-center justify-center cursor-pointer"
                title="16-bit PCM .wav Ses Kaydını İndir"
              >
                <Download className="w-4 h-4 shrink-0" />
              </button>

              <button
                type="button"
                onClick={() => {
                  playClick();
                  handleClose();
                }}
                className="col-span-3 h-9 px-2 py-2 rounded-xl bg-white dark:bg-[var(--background)] border-2 border-[#E6D7BE] border-b-3 text-xs font-bold whitespace-nowrap text-[var(--foreground)] hover:bg-[#FDFBF7] flex items-center justify-center gap-1 cursor-pointer"
              >
                <span>✓ Tamamla</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}