"use client";

import { useState, useRef, useEffect } from "react";
import { Mic, Square, Play, RotateCcw } from "lucide-react";

interface Props {
  text: string;
}

export default function ShadowingButton({ text }: Props) {
  const [isRecording, setIsRecording] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);

  // Bileşen ekrandan kalkarken kaynakları temizle
  useEffect(() => {
    return () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      if (audioPlayerRef.current) audioPlayerRef.current.pause();
    };
  }, [audioUrl]);

  const startRecording = async () => {
    setErrorMsg(null);
    setAudioUrl(null);
    audioChunksRef.current = [];

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const url = URL.createObjectURL(audioBlob);
        setAudioUrl(url);
        // Kayıt bittikten sonra mikrofonu serbest bırak
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      console.error(err);
      setErrorMsg("Mikrofon erişimi reddedildi veya bulunamadı.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const playRecording = () => {
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
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioUrl(null);
    setIsPlaying(false);
    setErrorMsg(null);
  };

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1">
        {!isRecording && !audioUrl && (
          <button 
            onClick={startRecording}
            className="flex items-center justify-center w-7 h-7 rounded-full bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition-colors"
            title="Kendi Sesini Kaydet (Gölgeleme)"
          >
            <Mic size={14} />
          </button>
        )}

        {isRecording && (
          <button 
            onClick={stopRecording}
            className="flex items-center justify-center w-7 h-7 rounded-full bg-red-100 text-red-600 animate-pulse transition-colors"
            title="Kaydı Durdur"
          >
            <Square size={12} fill="currentColor" />
          </button>
        )}

        {audioUrl && !isRecording && (
          <>
            <button 
              onClick={playRecording}
              className={`flex items-center justify-center w-7 h-7 rounded-full transition-colors ${isPlaying ? "bg-brand-100 text-brand-700" : "bg-green-100 text-green-700"}`}
              title={isPlaying ? "Durdur" : "Kaydı Dinle"}
            >
              {isPlaying ? <Square size={12} fill="currentColor" /> : <Play size={14} fill="currentColor" />}
            </button>
            <button 
              onClick={resetRecording}
              className="flex items-center justify-center w-7 h-7 rounded-full bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 transition-colors"
              title="Yeniden Kaydet"
            >
              <RotateCcw size={14} />
            </button>
          </>
        )}
      </div>
      
      {errorMsg && <span className="text-[10px] text-red-500 font-medium">{errorMsg}</span>}
      
      {/* Gizli ses oynatıcı */}
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