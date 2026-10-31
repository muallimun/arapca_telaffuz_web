"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Mic, Square, Play, RotateCcw, Sparkles } from "lucide-react";
import {
  playRecordStart,
  playRecordStop,
  playClick,
} from "@/lib/sfxManager";
import {
  start16kHzRecorder,
  RecordingSession16kHz,
} from "@/lib/audioAnalysis";
import { useSettings } from "@/store/settings";

interface Props {
  text: string;
  onOpenCoach?: () => void;
}

export default function ShadowingButton({ text, onOpenCoach }: Props) {
  const [isRecording, setIsRecording] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  const sessionRef = useRef<RecordingSession16kHz | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);
  const isMountedRef = useRef<boolean>(true);
  const sessionTokenRef = useRef<number>(0);
  const recordingSampleRateRef = useRef<number>(48000);

  const closePreviousSessionOnly = useCallback(() => {
    if (sessionRef.current) {
      const activeSession = sessionRef.current;
      sessionRef.current = null;
      try {
        activeSession.getStream()?.getTracks().forEach((t) => t.stop());
        activeSession.killStreamImmediately();
      } catch {
        // ignore
      }
    }
    if (streamRef.current) {
      try {
        streamRef.current.getTracks().forEach((t) => t.stop());
      } catch {
        // ignore
      }
      streamRef.current = null;
    }
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    const initialPlayer = audioPlayerRef.current;

    const forceStopActiveMic = () => {
      sessionTokenRef.current += 1;
      closePreviousSessionOnly();
      setIsRecording(false);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        forceStopActiveMic();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pagehide", forceStopActiveMic);

    return () => {
      isMountedRef.current = false;
      sessionTokenRef.current += 1;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pagehide", forceStopActiveMic);
      closePreviousSessionOnly();
      if (initialPlayer) initialPlayer.pause();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    return () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
  }, [audioUrl]);

  const startRecording = async () => {
    // 1. İLK SATIRDA kayıt durumunu derhal true yap ki buton anında kırmızı "Kaydı Durdur" butonuna dönüşsün
    setErrorMsg(null);
    setIsRecording(true);
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioUrl(null);

    // 2. Önce eski medya akışını kapat (sessionToken artırmadan!)
    closePreviousSessionOnly();

    // 3. Sonra yeni oturum numarasını artır
    const sessionId = ++sessionTokenRef.current;
    playRecordStart();

    let stream: MediaStream | null = null;
    try {
      const { micNoiseSuppression } = useSettings.getState();
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: Boolean(micNoiseSuppression),
            noiseSuppression: Boolean(micNoiseSuppression),
            autoGainControl: true,
          },
        });
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      }

      if (!isMountedRef.current || sessionId !== sessionTokenRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }

      streamRef.current = stream;

      const targetWords = (text || "").trim().split(/\s+/).filter(Boolean);
      const maxRecordingDurationMs = Math.max(
        15000,
        Math.min(45000, targetWords.length * 1800 + 8000)
      );
      const session = await start16kHzRecorder({
        stream,
        micNoiseSuppression,
        silenceDurationMs: 2500,
        maxDurationMs: maxRecordingDurationMs,
        onAutoSilenceStop: () => {
          void stopRecording();
        },
      });
      if (!isMountedRef.current || sessionId !== sessionTokenRef.current) {
        try {
          session.getStream()?.getTracks().forEach((t) => t.stop());
          session.killStreamImmediately();
        } catch {
          // ignore
        }
        return;
      }
      sessionRef.current = session;
      const actualSampleRate = session.getAudioContext().sampleRate || 48000;
      recordingSampleRateRef.current = actualSampleRate;
    } catch (err) {
      if (stream) {
        try {
          stream.getTracks().forEach((t) => t.stop());
        } catch {
          // ignore
        }
      }
      closePreviousSessionOnly();
      if (isMountedRef.current) {
        setIsRecording(false);
        const errMsg =
          err instanceof Error && err.message
            ? err.message
            : "Tarayıcı mikrofon izni vermedi.";
        setErrorMsg("Mikrofon açılamadı: " + errMsg);
      }
    }
  };

  const stopRecording = async () => {
    if (sessionRef.current) {
      const activeSession = sessionRef.current;
      sessionRef.current = null;
      streamRef.current = null;
      playRecordStop();
      setIsRecording(false);
      try {
        const res = await activeSession.stop();
        setAudioUrl(res.wavUrl);
      } catch {
        try {
          activeSession.getStream()?.getTracks().forEach((t) => t.stop());
          activeSession.killStreamImmediately();
        } catch {
          // ignore
        }
        setErrorMsg("Kayıt tamamlanamadı");
      }
    } else {
      closePreviousSessionOnly();
      setIsRecording(false);
    }
  };

  const playRecording = () => {
    playClick();
    if (audioUrl && audioPlayerRef.current) {
      if (isPlaying) {
        audioPlayerRef.current.pause();
        audioPlayerRef.current.currentTime = 0;
        setIsPlaying(false);
      } else {
        audioPlayerRef.current.play();
        setIsPlaying(true);
      }
    }
  };

  const resetRecording = () => {
    playClick();
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioUrl(null);
    setIsPlaying(false);
    setErrorMsg(null);
  };

  return (
    <div className="inline-flex flex-col items-end gap-1">
      {errorMsg && (
        <div className="rounded-lg bg-red-50 dark:bg-red-950/60 border border-red-400 px-2 py-1 text-[10px] text-red-700 dark:text-red-200 font-bold max-w-[220px] text-right">
          {errorMsg}
        </div>
      )}
      <div className="inline-flex items-center gap-1.5">
        {/* 🎤 Sesimi Kaydet (16kHz) */}
        {!isRecording && !audioUrl && (
          <button
            type="button"
            onClick={startRecording}
            className="group relative w-9 h-9 rounded-xl bg-white dark:bg-[var(--background)] border-2 border-[#E6D7BE] dark:border-[var(--border)] border-b-3 text-[var(--foreground)] hover:border-[#087F5B] active:border-b-1 active:translate-y-0.5 transition-all inline-flex items-center justify-center cursor-pointer"
            data-tooltip="Sesimi Kaydet (16kHz)"
            aria-label="Sesimi Kaydet (16kHz)"
          >
            <Mic size={15} className="text-[#065F46] dark:text-emerald-400" />
          </button>
        )}

        {/* ⏹️ Kaydı Durdur */}
        {isRecording && (
          <button
            type="button"
            onClick={stopRecording}
            className="group relative w-9 h-9 rounded-xl bg-red-600 text-white border-b-3 border-red-800 animate-pulse inline-flex items-center justify-center cursor-pointer"
            data-tooltip="Kaydı Durdur"
            aria-label="Kaydı Durdur"
          >
            <Square size={14} fill="currentColor" />
          </button>
        )}

        {/* ▶️ Kaydımı Dinle & 🔄 Yeniden Kaydet */}
        {audioUrl && !isRecording && (
          <div className="inline-flex items-center gap-1">
            <button
              type="button"
              onClick={playRecording}
              className={`group relative w-9 h-9 rounded-xl border-2 border-b-3 inline-flex items-center justify-center transition-all cursor-pointer ${
                isPlaying
                  ? "bg-[#087F5B] border-[#065F46] text-white"
                  : "bg-white dark:bg-[var(--background)] border-[#087F5B] text-[#065F46] dark:text-emerald-400"
              }`}
              data-tooltip={isPlaying ? "Durdur" : "Kaydımı Dinle"}
              aria-label={isPlaying ? "Durdur" : "Kaydımı Dinle"}
            >
              {isPlaying ? (
                <Square size={13} fill="currentColor" />
              ) : (
                <Play size={14} fill="currentColor" />
              )}
            </button>

            <button
              type="button"
              onClick={resetRecording}
              className="group relative w-9 h-9 rounded-xl bg-white dark:bg-[var(--background)] border-2 border-[#E6D7BE] border-b-3 flex items-center justify-center text-[var(--muted)] hover:text-[var(--foreground)] cursor-pointer"
              data-tooltip="Yeniden Kaydet"
              aria-label="Yeniden Kaydet"
            >
              <RotateCcw size={14} />
            </button>
          </div>
        )}

        {/* ✨ Yapay Zeka Telaffuz & Mahreç Koçu */}
        {onOpenCoach && (
          <button
            type="button"
            onClick={() => {
              playClick();
              onOpenCoach();
            }}
            className="group relative w-9 h-9 rounded-xl bg-[#F3F0FF] dark:bg-[var(--lavender-bg)] border-2 border-[#6741D9] border-b-3 text-[#6741D9] dark:text-[#d0bfff] hover:opacity-95 active:border-b-1 active:translate-y-0.5 transition-all inline-flex items-center justify-center cursor-pointer"
            data-tooltip="Yapay Zeka Telaffuz & Mahreç Koçu"
            data-tooltip-align="right"
            aria-label="Yapay Zeka Telaffuz & Mahreç Koçu"
          >
            <Sparkles size={15} />
          </button>
        )}
      </div>

      {audioUrl && (
        <audio
          ref={audioPlayerRef}
          src={audioUrl}
          onEnded={() => setIsPlaying(false)}
          className="hidden"
        />
      )}
    </div>
  );
}