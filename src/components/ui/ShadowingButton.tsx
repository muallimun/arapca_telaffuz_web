"use client";

import { useState, useRef, useEffect } from "react";
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
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);
  const isMountedRef = useRef<boolean>(true);
  const sessionTokenRef = useRef<number>(0);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      sessionTokenRef.current += 1;
      if (sessionRef.current) {
        try {
          sessionRef.current.getStream()?.getTracks().forEach((t) => t.stop());
          sessionRef.current.killStreamImmediately();
        } catch {
          // ignore
        }
        sessionRef.current = null;
      }
      const player = audioPlayerRef.current;
      if (player) player.pause();
    };
  }, []);

  useEffect(() => {
    return () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
  }, [audioUrl]);

  const startRecording = async () => {
    setErrorMsg(null);
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioUrl(null);
    playRecordStart();
    const myToken = ++sessionTokenRef.current;

    try {
      const targetWords = (text || "").trim().split(/\s+/).filter(Boolean);
      const maxRecordingDurationMs = Math.max(
        15000,
        Math.min(45000, targetWords.length * 1800 + 8000)
      );
      const session = await start16kHzRecorder({
        silenceDurationMs: 2500,
        maxDurationMs: maxRecordingDurationMs,
        onAutoSilenceStop: () => {
          stopRecording();
        },
      });
      if (!isMountedRef.current || myToken !== sessionTokenRef.current) {
        try {
          session.getStream()?.getTracks().forEach((t) => t.stop());
          session.killStreamImmediately();
        } catch {
          // ignore
        }
        return;
      }
      sessionRef.current = session;
      setIsRecording(true);
    } catch {
      if (isMountedRef.current) {
        setErrorMsg("Mikrofon izni gerekli");
      }
    }
  };

  const stopRecording = async () => {
    if (sessionRef.current) {
      const activeSession = sessionRef.current;
      sessionRef.current = null;
      playRecordStop();
      setIsRecording(false);
      try {
        const res = await activeSession.stop();
        setAudioUrl(res.wavUrl);
      } catch {
        setErrorMsg("Kayıt tamamlanamadı");
      }
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
    <div className="inline-flex items-center gap-1.5">
      {/* 🎤 Sesimi Kaydet (16kHz) */}
      {!isRecording && !audioUrl && (
        <button
          type="button"
          onClick={startRecording}
          className="group relative w-9 h-9 rounded-xl bg-white dark:bg-[var(--background)] border-2 border-[#E6D7BE] dark:border-[var(--border)] border-b-3 text-[var(--foreground)] hover:border-[#0CA678] active:border-b-1 active:translate-y-0.5 transition-all inline-flex items-center justify-center cursor-pointer"
          data-tooltip="Sesimi Kaydet (16kHz)"
          aria-label="Sesimi Kaydet (16kHz)"
        >
          <Mic size={15} className="text-[#0CA678]" />
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
                ? "bg-[#0CA678] border-[#087F5B] text-white"
                : "bg-white dark:bg-[var(--background)] border-[#0CA678] text-[#087F5B]"
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

      {errorMsg && (
        <span className="text-[10px] text-red-600 font-bold">{errorMsg}</span>
      )}

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