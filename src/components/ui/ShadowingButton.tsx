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

export default function ShadowingButton({ onOpenCoach }: Props) {
  const [isRecording, setIsRecording] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  const sessionRef = useRef<RecordingSession16kHz | null>(null);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    return () => {
      if (sessionRef.current) {
        sessionRef.current.stop().catch(() => {});
        sessionRef.current = null;
      }
      if (audioPlayerRef.current) audioPlayerRef.current.pause();
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

    try {
      const session = await start16kHzRecorder({
        onAutoSilenceStop: () => {
          stopRecording();
        },
      });
      sessionRef.current = session;
      setIsRecording(true);
    } catch {
      setErrorMsg("Mikrofon izni gerekli");
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
          title="Sesimi Kaydet (16kHz)"
          aria-label="Sesimi Kaydet (16kHz)"
        >
          <Mic size={15} className="text-[#0CA678]" />
          <span className="pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-lg bg-[#2b241d] px-2.5 py-1 text-[10px] font-bold text-white opacity-0 group-hover:opacity-100 group-focus:opacity-100 transition-opacity z-50 shadow-md">
            Sesimi Kaydet (16kHz)
          </span>
        </button>
      )}

      {/* ⏹️ Kaydı Durdur */}
      {isRecording && (
        <button
          type="button"
          onClick={stopRecording}
          className="group relative w-9 h-9 rounded-xl bg-red-600 text-white border-b-3 border-red-800 animate-pulse inline-flex items-center justify-center cursor-pointer"
          title="Kaydı Durdur"
          aria-label="Kaydı Durdur"
        >
          <Square size={14} fill="currentColor" />
          <span className="pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-lg bg-[#2b241d] px-2.5 py-1 text-[10px] font-bold text-white opacity-0 group-hover:opacity-100 group-focus:opacity-100 transition-opacity z-50 shadow-md">
            Kaydı Durdur
          </span>
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
            title={isPlaying ? "Durdur" : "Kaydımı Dinle"}
            aria-label={isPlaying ? "Durdur" : "Kaydımı Dinle"}
          >
            {isPlaying ? (
              <Square size={13} fill="currentColor" />
            ) : (
              <Play size={14} fill="currentColor" />
            )}
            <span className="pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-lg bg-[#2b241d] px-2.5 py-1 text-[10px] font-bold text-white opacity-0 group-hover:opacity-100 group-focus:opacity-100 transition-opacity z-50 shadow-md">
              {isPlaying ? "Durdur" : "Kaydımı Dinle"}
            </span>
          </button>

          <button
            type="button"
            onClick={resetRecording}
            className="group relative w-9 h-9 rounded-xl bg-white dark:bg-[var(--background)] border-2 border-[#E6D7BE] border-b-3 flex items-center justify-center text-[var(--muted)] hover:text-[var(--foreground)] cursor-pointer"
            title="Yeniden Kaydet"
            aria-label="Yeniden Kaydet"
          >
            <RotateCcw size={14} />
            <span className="pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-lg bg-[#2b241d] px-2.5 py-1 text-[10px] font-bold text-white opacity-0 group-hover:opacity-100 group-focus:opacity-100 transition-opacity z-50 shadow-md">
              Yeniden Kaydet
            </span>
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
          title="Yapay Zeka Telaffuz & Mahreç Koçu"
          aria-label="Yapay Zeka Telaffuz & Mahreç Koçu"
        >
          <Sparkles size={15} />
          <span className="pointer-events-none absolute -top-8 right-0 whitespace-nowrap rounded-lg bg-[#2b241d] px-2.5 py-1 text-[10px] font-bold text-white opacity-0 group-hover:opacity-100 group-focus:opacity-100 transition-opacity z-50 shadow-md">
            Yapay Zeka Telaffuz & Mahreç Koçu
          </span>
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