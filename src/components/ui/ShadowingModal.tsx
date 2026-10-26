"use client";

import { useState, useEffect, useRef } from "react";
import WaveSurfer from "wavesurfer.js";
import RecordPlugin from "wavesurfer.js/dist/plugins/record.esm.js";
import { useUserStore } from "@/store/userStore";
import { sozluk } from "@/lib/data";
import { 
  X, Play, Square, Mic, RotateCcw, Activity, Volume2, 
  AlertTriangle, ShieldCheck, Loader2, Cpu, Info, Download, Award
} from "lucide-react";

import { 
  buildProactiveMakhrajGuide, 
  evaluateSentenceWords, 
  ProactiveGuide, 
  SentenceEvaluationResult,
  WordEvaluationResult,
} from "@/lib/arabicNlpEngine";

import {
  extractAudioEnvelope,
  calculateRhythmMatch,
  calculateTempoScore,
  calculateOverallFluency,
  audioBufferToWav,
  resampleTo16kHz,
  trimSilence,
} from "@/lib/audioAnalysis";
import {
  playRecordStart,
  playRecordStop,
  playSuccess,
  playPartial,
  playError,
} from "@/lib/sfxManager";

// YENİ: Form tipi tanımlandı
export interface TargetForm {
  label: string;
  arabic: string;
}

interface Props {
  text: string;
  refAudioUrl?: string;
  forms?: TargetForm[]; // YENİ: Sözlükten gelen formlar
  onClose: () => void;
}

export default function ShadowingModal({ text, refAudioUrl, forms, onClose }: Props) {
  // Aktif hedef metin (form seçimine göre değişir)
  const [activeText, setActiveText] = useState<string>(text);
  const [activeFormLabel, setActiveFormLabel] = useState<string>(forms?.[0]?.label || "");

  const [isRecording, setIsRecording] = useState(false);
  const [userAudioUrl, setUserAudioUrl] = useState<string | null>(null);
  const [isPlayingRef, setIsPlayingRef] = useState(false);
  const [isPlayingUser, setIsPlayingUser] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [whisperStatus, setWhisperStatus] = useState<string>("");
  const [engine, setEngine] = useState<"whisper" | "webspeech">("whisper");
  const { addWeakWord } = useUserStore();

  const [evaluation, setEvaluation] = useState<SentenceEvaluationResult | null>(null);
  const [proactiveGuide, setProactiveGuide] = useState<ProactiveGuide | null>(null);
  const [activeWordTip, setActiveWordTip] = useState<WordEvaluationResult | null>(null);
  const [rhythmScore, setRhythmScore] = useState<number | null>(null);
  const [tempoScore, setTempoScore] = useState<number | null>(null);
  const [fluencyScore, setFluencyScore] = useState<number | null>(null);
  const [refDuration, setRefDuration] = useState<number>(0);
  const [userDuration, setUserDuration] = useState<number>(0);
  const [adaptiveMessage, setAdaptiveMessage] = useState<string | null>(null);

  const refWaveformRef = useRef<HTMLDivElement>(null);
  const userWaveformRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WaveSurfer | null>(null);
  const wsUser = useRef<WaveSurfer | null>(null);
  const recordPluginRef = useRef<RecordPlugin | null>(null);

  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const hasSpokenRef = useRef<boolean>(false);

  const workerRef = useRef<Worker | null>(null);
  const recognitionRef = useRef<any>(null);
  const transcriptRef = useRef<string>("");

  const userAudioBufferRef = useRef<AudioBuffer | null>(null);
  const refAudioBufferRef = useRef<AudioBuffer | null>(null);

  // Kelime Telaffuzunu Dinle
  const speakWord = (wordToSpeak: string) => {
    if (!wordToSpeak || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const utt = new SpeechSynthesisUtterance(wordToSpeak);
    utt.lang = 'ar-SA';
    utt.rate = 0.85;
    window.speechSynthesis.speak(utt);
  };

  // Form değiştirildiğinde
  const handleFormChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selectedArabic = e.target.value;
    const selectedLabel = forms?.find(f => f.arabic === selectedArabic)?.label || "";
    setActiveText(selectedArabic);
    setActiveFormLabel(selectedLabel);
    // Sıfırla
    setEvaluation(null);
    setActiveWordTip(null);
    setRhythmScore(null);
    setTempoScore(null);
    setFluencyScore(null);
    setUserAudioUrl(null);
    setRefDuration(0);
  };

  useEffect(() => {
    setActiveText(text);
  }, [text]);

  useEffect(() => {
    setProactiveGuide(buildProactiveMakhrajGuide(activeText));
  }, [activeText]);

  useEffect(() => {
    if (refAudioUrl && activeText === text) {
      (async () => {
        try {
          const res = await fetch(refAudioUrl);
          const ab = await res.arrayBuffer();
          const ctx = new AudioContext();
          const buf = await ctx.decodeAudioData(ab);
          refAudioBufferRef.current = buf;
          setRefDuration(buf.duration);
          ctx.close();
        } catch (e) { console.error("Referans ses çözümlenemedi:", e); }
      })();
    } else {
      const estimated = (activeText.trim().split(/\s+/).length * 0.65) + 0.5;
      setRefDuration(estimated);
    }
  }, [refAudioUrl, activeText, text]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        workerRef.current = new Worker(new URL('../../lib/whisperWorker.js', import.meta.url), { type: 'module' });
        workerRef.current.onerror = () => {
          setWhisperStatus("");
          setIsAnalyzing(false);
          setEngine("webspeech");
        };
        workerRef.current.onmessage = (event) => {
          const { status, data, text: recognizedText } = event.data;
          if (status === 'progress') setWhisperStatus(`Model İndiriliyor: ${Math.round(data?.progress || 0)}%`);
          else if (status === 'loading') setWhisperStatus("Yapay Zeka Yükleniyor...");
          else if (status === 'transcribing') setWhisperStatus("Sesiniz Metne Dökülüyor...");
          else if (status === 'completed') {
            setWhisperStatus("");
            processTranscription(recognizedText);
          } else if (status === 'error') {
            setWhisperStatus("");
            setIsAnalyzing(false);
          }
        };
      } catch (err) { console.error(err); }
    }
    return () => workerRef.current?.terminate();
  }, [engine]);

  // Referans WaveSurfer
  useEffect(() => {
    if (refWaveformRef.current) {
      wsRef.current?.destroy();
      if (refAudioUrl && activeText === text) {
        wsRef.current = WaveSurfer.create({
          container: refWaveformRef.current,
          waveColor: "#93c5fd", progressColor: "#2563eb",
          barWidth: 3, barGap: 2, barRadius: 3, height: 36, cursorWidth: 0,
        });
        wsRef.current.load(refAudioUrl);
        wsRef.current.on("play", () => setIsPlayingRef(true));
        wsRef.current.on("pause", () => setIsPlayingRef(false));
        wsRef.current.on("finish", () => setIsPlayingRef(false));
      }
    }
  }, [refAudioUrl, activeText, text]);

  useEffect(() => {
    if (userWaveformRef.current && userAudioUrl) {
      wsUser.current = WaveSurfer.create({
        container: userWaveformRef.current,
        waveColor: "#86efac", progressColor: "#16a34a",
        barWidth: 3, barGap: 2, barRadius: 3, height: 36, cursorWidth: 0,
      });
      wsUser.current.load(userAudioUrl);
      wsUser.current.on("play", () => setIsPlayingUser(true));
      wsUser.current.on("pause", () => setIsPlayingUser(false));
      wsUser.current.on("finish", () => setIsPlayingUser(false));
    }
    return () => wsUser.current?.destroy();
  }, [userAudioUrl]);

  const playReference = () => {
    if (refAudioUrl && wsRef.current && activeText === text) wsRef.current.playPause();
    else if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utt = new SpeechSynthesisUtterance(activeText);
      utt.lang = 'ar-SA';
      utt.onstart = () => setIsPlayingRef(true);
      utt.onend = () => setIsPlayingRef(false);
      window.speechSynthesis.speak(utt);
    }
  };

  const setupSilenceDetection = (stream: MediaStream) => {
    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const analyser = audioCtx.createAnalyser();
    const source = audioCtx.createMediaStreamSource(stream);
    source.connect(analyser);
    analyser.fftSize = 512;
    const dataArray = new Uint8Array(analyser.frequencyBinCount);

    audioCtxRef.current = audioCtx;
    hasSpokenRef.current = false;
    let silentFrames = 0;
    const startTime = Date.now();

    const checkSilence = () => {
      analyser.getByteFrequencyData(dataArray);
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
      if (sum / dataArray.length > 25) { 
        hasSpokenRef.current = true; silentFrames = 0; 
      } else if (hasSpokenRef.current) {
        silentFrames++;
        if (silentFrames > 120) { stopRecording(); return; }
      } else if (Date.now() - startTime > 10000) { stopRecording(); return; }
      animationFrameRef.current = requestAnimationFrame(checkSilence);
    };
    checkSilence();
  };

  const startRecording = async () => {
    if (!userWaveformRef.current) return;

    // SFX: Kayıt başlangıç sesi + titreşim (mikrofona geri kaydedilmesin diye ÖNCE çal)
    playRecordStart();

    setUserAudioUrl(null); setEvaluation(null); setActiveWordTip(null);
    setWhisperStatus(""); setRhythmScore(null); setTempoScore(null);
    setFluencyScore(null); setAdaptiveMessage(null); transcriptRef.current = "";

    wsUser.current = WaveSurfer.create({
      container: userWaveformRef.current,
      waveColor: "#cbd5e1", progressColor: "#16a34a",
      barWidth: 3, barGap: 2, barRadius: 3, height: 36, cursorWidth: 0,
    });
    const record = wsUser.current.registerPlugin(RecordPlugin.create({ scrollingWaveform: true }));
    recordPluginRef.current = record;

    record.on("record-end", async (blob) => {
      setUserAudioUrl(URL.createObjectURL(blob));
      setIsRecording(false);
      setIsAnalyzing(true);
	  // Mikrofon dinlemesini 120ms geciktir → bip sesi kayda düşmesin
      await new Promise((resolve) => setTimeout(resolve, 120));
    
      try {
        const arrayBuffer = await blob.arrayBuffer();
        const decodeCtx = new AudioContext();
        const audioBuffer = await decodeCtx.decodeAudioData(arrayBuffer);
        userAudioBufferRef.current = audioBuffer;
        setUserDuration(audioBuffer.duration);
        decodeCtx.close();

        const userEnv = extractAudioEnvelope(audioBuffer);
        if (refAudioBufferRef.current && activeText === text) {
          const refEnv = extractAudioEnvelope(refAudioBufferRef.current);
          setRhythmScore(calculateRhythmMatch(refEnv.bars, userEnv.bars));
          setTempoScore(calculateTempoScore(refEnv.duration, userEnv.duration));
        } else {
          setTempoScore(calculateTempoScore(refDuration, userEnv.duration));
        }

        const resampled = await resampleTo16kHz(audioBuffer);
        const trimmed = trimSilence(resampled);

        if (engine === "whisper" && workerRef.current) {
          workerRef.current.postMessage({ type: 'transcribe', audioData: trimmed, language: 'ar' });
        } else if (engine === "webspeech") {
          setTimeout(() => processTranscription(transcriptRef.current), 1000);
        }
      } catch (err) { setIsAnalyzing(false); }
    });

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      setupSilenceDetection(stream);
      record.startRecording();
      setIsRecording(true);

      if (engine === "webspeech") {
        const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (SR) {
          const rec = new SR();
          rec.lang = "ar-SA"; rec.continuous = true; rec.interimResults = false;
          rec.onresult = (e: any) => {
            let final = "";
            for (let i = e.resultIndex; i < e.results.length; ++i) {
              if (e.results[i].isFinal) final += e.results[i][0].transcript + " ";
            }
            if (final) transcriptRef.current += final;
          };
          rec.start(); recognitionRef.current = rec;
        }
      }
    } catch (err) { alert("Mikrofon erişimi reddedildi!"); }
  };

  const stopRecording = () => {
    playRecordStop();
    recordPluginRef.current?.stopRecording();
    setIsRecording(false);
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    if (mediaStreamRef.current) mediaStreamRef.current.getTracks().forEach(t => t.stop());
    if (audioCtxRef.current) audioCtxRef.current.close();
    if (recognitionRef.current) recognitionRef.current.stop();
  };

  const processTranscription = (transcribedText: string) => {
    setIsAnalyzing(false);
        if (!transcribedText || transcribedText.trim().length < 2) {
      setEvaluation({ words: [], overallScore: 0, isRootGuardTriggered: false });
      playError();
      return;
    }
    const result = evaluateSentenceWords(activeText, transcribedText);
    setEvaluation(result);
	    // SFX: Telaffuz puanına göre otomatik ses + titreşim
    if (result.overallScore >= 80) playSuccess();
    else if (result.overallScore >= 50) playPartial();
    else playError();

    const pronunciation = result.overallScore;
    const rhythm = rhythmScore ?? tempoScore ?? 0;
    const fluency = calculateOverallFluency(pronunciation, rhythm);
    setFluencyScore(fluency);

    if (fluency < 60) {
      setAdaptiveMessage("💡 Zorlandınız. Yanlış kelimeye tıklayıp doğrusunu dinleyin, sonra yavaşça tekrar okuyun.");
    } else if (fluency >= 85) {
      setAdaptiveMessage("🌟 Harika gidiyorsunuz! Daha uzun ve zor cümleler denemenin tam zamanı.");
    }

    const firstErr = result.words.find(w => w.status !== 'correct');
	    // YENİ: Yanlış yapılan kelimeleri zayıf kelimeler listesine ekle
    result.words.forEach(w => {
      if (w.status === 'wrong' && w.targetWord && w.targetWord.length > 1) {
        // Sözlükte bu kelimeyi bulmaya çalış (anlamı için)
        const dictWord = sozluk.find(s => 
          s.mufret?.includes(w.targetWord) || 
          s.mazi?.includes(w.targetWord) ||
          w.targetWord.includes(s.mufret || "___")
        );
        if (dictWord) {
          addWeakWord(dictWord);
        }
      }
    });
    if (firstErr) setActiveWordTip(firstErr);
  };

  const downloadWav = () => {
    if (!userAudioBufferRef.current) return;
    const url = URL.createObjectURL(audioBufferToWav(userAudioBufferRef.current));
    const a = document.createElement('a'); a.href = url; a.download = `telaffuz_${Date.now()}.wav`; a.click();
  };

  const getWordColor = (status: string) => {
    if (status === 'correct') return "bg-green-100 text-green-800 border-green-300 dark:bg-green-900/40 dark:text-green-300";
    if (status === 'warning') return "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/40 dark:text-amber-300";
    return "bg-red-100 text-red-800 border-red-300 dark:bg-red-900/40 dark:text-red-300";
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-md p-2 md:p-4 overflow-hidden">
      <div className="bg-[var(--background)] w-full max-w-3xl h-[90vh] md:h-auto md:max-h-[85vh] rounded-2xl border border-[var(--border)] shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-300">
        
        {/* HEADER */}
        <div className="flex items-center justify-between p-3 md:p-4 border-b border-[var(--border)] bg-[var(--surface)] shrink-0">
          <h2 className="text-base md:text-lg font-bold text-brand-700 flex items-center gap-2">
            <Activity size={18} /> Gölgeleme & Mahreç Koçluğu
          </h2>
          <div className="flex items-center gap-2">
            <div className="flex bg-[var(--border)] p-1 rounded-md text-[10px] md:text-xs font-bold">
              <button onClick={() => setEngine("whisper")} className={`px-2 py-1 rounded ${engine === "whisper" ? "bg-white text-brand-700 shadow-sm" : "text-[var(--muted)]"}`}>Yapay Zeka</button>
              <button onClick={() => setEngine("webspeech")} className={`px-2 py-1 rounded ${engine === "webspeech" ? "bg-white text-brand-700 shadow-sm" : "text-[var(--muted)]"}`}>Hızlı Motor</button>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-full hover:bg-red-100 hover:text-red-600 transition-colors">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* İÇERİK */}
        <div className="p-3 md:p-5 space-y-3 overflow-y-auto overflow-x-hidden flex-1 custom-scrollbar">
          
          {/* FORM SEÇİCİ (Sadece sözlükten gelindiyse görünür) */}
          {forms && forms.length > 0 && (
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-2 flex items-center justify-between">
              <span className="text-xs font-bold text-blue-800 dark:text-blue-300">Hangi formu çalışacaksın?</span>
              <select 
                value={activeText}
                onChange={handleFormChange}
                className="bg-white dark:bg-black/50 border border-blue-300 dark:border-blue-700 rounded-lg px-3 py-1.5 text-sm font-bold text-brand-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {forms.map((f, i) => (
                  <option key={i} value={f.arabic}>{f.label} ({f.arabic})</option>
                ))}
              </select>
            </div>
          )}

          {/* HEDEF METİN */}
          <div className="text-center py-3 px-3 bg-[var(--surface)] rounded-xl border border-[var(--border)] shadow-sm relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-0.5 bg-gradient-to-r from-transparent via-brand-500 to-transparent opacity-50"></div>
            {activeFormLabel && <span className="text-[10px] uppercase font-bold text-brand-500 mb-1 block">{activeFormLabel}</span>}
            <h3 className="arabic text-2xl md:text-3xl font-bold text-brand-700 leading-[1.6]">{activeText}</h3>
          </div>

          {/* PROAKTİF REHBER ROZETLERİ */}
          {proactiveGuide && (
            <div className="flex flex-wrap gap-1.5 justify-center">
              {proactiveGuide.categories.map((cat, i) => (
                <span key={i} className="bg-blue-50 text-blue-700 border border-blue-200 text-[10px] font-bold px-2 py-1 rounded-md shadow-sm dark:bg-blue-900/30 dark:border-blue-800 dark:text-blue-300">{cat}</span>
              ))}
              {proactiveGuide.shaddaCount > 0 && <span className="bg-purple-50 text-purple-700 border border-purple-200 text-[10px] font-bold px-2 py-1 rounded-md">Şedde: {proactiveGuide.shaddaCount}</span>}
              {proactiveGuide.medCount > 0 && <span className="bg-indigo-50 text-indigo-700 border border-indigo-200 text-[10px] font-bold px-2 py-1 rounded-md">Med: {proactiveGuide.medCount}</span>}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* REFERANS SES */}
            <div className="bg-blue-50/50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-900 rounded-xl p-2.5 flex flex-col justify-between">
              <div className="flex justify-between items-center mb-1.5">
                <span className="text-[10px] font-bold text-blue-700 uppercase flex items-center gap-1"><Volume2 size={12} /> Referans ({refDuration.toFixed(1)} sn)</span>
              </div>
              <button onClick={playReference} className="w-full flex items-center justify-center gap-1.5 text-xs font-bold bg-blue-600 text-white px-3 py-2 rounded-lg hover:bg-blue-700 transition-all shadow-sm">
                {isPlayingRef ? <Square size={12} fill="currentColor" /> : <Play size={12} fill="currentColor" />} Dinle
              </button>
              {refAudioUrl && activeText === text ? <div ref={refWaveformRef} className="w-full mt-1.5" /> : <div className="text-[9px] text-blue-500 italic text-center py-1">TTS kullanılacak</div>}
            </div>

            {/* KULLANICI KAYIT */}
            <div className={`rounded-xl p-2.5 flex flex-col justify-between transition-all duration-300 border ${isRecording ? 'bg-green-50/80 border-green-400 shadow-sm' : 'bg-[var(--surface)] border-[var(--border)]'}`}>
              <div className="flex justify-between items-center mb-1.5">
                <span className={`text-[10px] font-bold uppercase flex items-center gap-1 ${isRecording ? 'text-green-700' : 'text-[var(--muted)]'}`}>
                  <Mic size={12} className={isRecording ? 'animate-pulse text-green-600' : ''} /> Sizin Sesiniz
                </span>
                {userDuration > 0 && <span className="text-[9px] font-bold bg-green-100 text-green-800 px-1.5 py-0.5 rounded">{userDuration.toFixed(1)} sn</span>}
              </div>
              <div className="relative h-[36px] flex items-center justify-center w-full mb-1.5">
                {isRecording && <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-red-500 text-white px-2 py-0.5 rounded-full text-[9px] font-bold animate-bounce shadow-md z-10 whitespace-nowrap">🎤 Konuşun...</div>}
                <div ref={userWaveformRef} className="w-full" />
              </div>
              {userAudioUrl && !isRecording && (
                <div className="flex gap-1.5">
                  <button onClick={() => wsUser.current?.playPause()} className="flex-1 flex items-center justify-center gap-1 text-xs font-bold bg-green-600 text-white px-2 py-2 rounded-lg hover:bg-green-700 shadow-sm">
                    {isPlayingUser ? <Square size={12} fill="currentColor" /> : <Play size={12} fill="currentColor" />} Dinle
                  </button>
                  <button onClick={downloadWav} className="flex items-center justify-center bg-slate-600 text-white px-2.5 py-2 rounded-lg hover:bg-slate-700 shadow-sm" title="İndir (.wav)">
                    <Download size={12} />
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* WHISPER DURUMU */}
          {whisperStatus && (
            <div className="flex items-center justify-center gap-1.5 text-[10px] font-bold text-brand-700 bg-brand-50 border border-brand-200 p-1.5 rounded-lg animate-pulse">
              <Cpu className="animate-spin" size={12} /> {whisperStatus}
            </div>
          )}

          {/* ANALİZ SONUÇLARI */}
          {evaluation && (
            <div className="space-y-3 animate-in fade-in slide-in-from-bottom-2 duration-300">
              
              {/* SKORLAR */}
              <div className="grid grid-cols-3 gap-2">
                <div className={`rounded-xl p-2 text-center border ${evaluation.overallScore >= 80 ? 'bg-green-50 border-green-300' : evaluation.overallScore >= 60 ? 'bg-amber-50 border-amber-300' : 'bg-red-50 border-red-300'}`}>
                  <span className="text-[9px] uppercase font-bold text-gray-600">Telaffuz</span>
                  <div className="text-lg font-black text-[var(--foreground)]">%{evaluation.overallScore}</div>
                </div>
                <div className={`rounded-xl p-2 text-center border ${(rhythmScore ?? tempoScore ?? 0) >= 80 ? 'bg-blue-50 border-blue-300' : 'bg-amber-50 border-amber-300'}`}>
                  <span className="text-[9px] uppercase font-bold text-gray-600">Ritim</span>
                  <div className="text-lg font-black text-[var(--foreground)]">%{rhythmScore ?? tempoScore ?? 0}</div>
                </div>
                <div className={`rounded-xl p-2 text-center border ${(fluencyScore ?? 0) >= 80 ? 'bg-emerald-50 border-emerald-400' : (fluencyScore ?? 0) >= 60 ? 'bg-amber-50 border-amber-300' : 'bg-red-50 border-red-300'}`}>
                  <span className="text-[9px] uppercase font-bold text-gray-600 flex items-center justify-center gap-1"><Award size={10}/> Akıcılık</span>
                  <div className="text-lg font-black text-[var(--foreground)]">%{fluencyScore ?? 0}</div>
                </div>
              </div>

              {/* ADAPTİF MESAJ */}
              {adaptiveMessage && (
                <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-2 text-xs flex items-start gap-1.5">
                  <Info className="text-indigo-600 shrink-0 mt-0.5" size={14} />
                  <span className="font-medium text-indigo-900">{adaptiveMessage}</span>
                </div>
              )}

              {/* KELİME ÇİPLERİ */}
              <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-3 shadow-sm">
                <span className="text-[10px] font-bold text-[var(--foreground)] block mb-2">Kelime Analizi (Dinlemek İçin Tıkla)</span>
                {evaluation.isRootGuardTriggered && (
                  <div className="mb-2 bg-red-50 border border-red-200 text-red-800 p-1.5 rounded text-[10px] font-bold flex items-center gap-1.5">
                    <AlertTriangle size={12} /> Kök harf değişimi! Puan sınırlandırıldı.
                  </div>
                )}
                <div className="flex flex-wrap gap-1.5" dir="rtl">
                  {evaluation.words.map((word, idx) => (
                    <button 
                      key={idx} 
                      onClick={() => {
                        setActiveWordTip(word);
                        if (word.targetWord) speakWord(word.targetWord);
                      }}
                      className={`px-2 py-1 rounded-md border transition-all arabic text-lg font-bold ${getWordColor(word.status)} ${activeWordTip === word ? 'ring-2 ring-brand-500 scale-105 shadow-sm' : 'hover:scale-105'}`}
                    >
                      {word.targetWord || word.spokenWord || "..."}
                    </button>
                  ))}
                </div>
              </div>

              {/* MAHREÇ DETAY KARTI */}
              {activeWordTip && activeWordTip.status !== 'correct' && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-3 shadow-sm text-xs">
                  <h4 className="font-bold text-red-800 flex items-center gap-1.5 mb-2">
                    <AlertTriangle size={14} /> Mahreç Analizi
                  </h4>
                  <div className="flex items-center gap-3 mb-2">
                    <button 
                      onClick={() => speakWord(activeWordTip.targetWord)}
                      className="bg-white p-1.5 rounded-lg border border-red-100 flex flex-col items-center hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors cursor-pointer group"
                      title="Doğru Telaffuzu Dinle"
                    >
                      <span className="text-[9px] text-gray-500 flex items-center gap-1">Hedef <Volume2 size={10} className="text-blue-500 opacity-50 group-hover:opacity-100 transition-opacity"/></span>
                      <span className="arabic text-xl font-bold text-brand-700">{activeWordTip.targetWord}</span>
                    </button>
                    
                    <span className="text-gray-400">➔</span>
                    
                    <div className="bg-white p-1.5 rounded-lg border border-red-100 flex flex-col items-center">
                      <span className="text-[9px] text-gray-500">Duyulan</span>
                      <span className="arabic text-xl font-bold text-red-600 break-all line-clamp-2 max-w-[180px] text-center" title={activeWordTip.spokenWord}>
                        {activeWordTip.spokenWord || "Anlaşılamadı"}
                      </span>
                    </div>
                  </div>
                  {activeWordTip.makhrajTip ? (
                    <div className="bg-white p-2 rounded-lg border border-red-100">
                      <p className="font-bold text-red-700 mb-0.5">{activeWordTip.makhrajTip.title}</p>
                      <p className="text-gray-700 leading-snug">{activeWordTip.makhrajTip.pair} | {activeWordTip.makhrajTip.tip}</p>
                    </div>
                  ) : activeWordTip.medVezinTip ? (
                    <div className="bg-white p-2 rounded-lg border border-red-100">
                      <p className="font-bold text-amber-700 mb-0.5">Vezin/Med Hatası</p>
                      <p className="text-gray-700 leading-snug">{activeWordTip.medVezinTip}</p>
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          )}
        </div>

        {/* KONTROLLER */}
        <div className="p-3 bg-[var(--surface)] border-t border-[var(--border)] flex items-center justify-center gap-2 shrink-0">
          {!isRecording && !userAudioUrl && (
            <button onClick={startRecording} className="flex items-center gap-1.5 bg-brand-700 text-white px-6 py-2.5 rounded-xl font-bold text-sm shadow-md hover:bg-brand-600 transition-all">
              <Mic size={16} /> Kayda Başla
            </button>
          )}
          {isRecording && (
            <button onClick={stopRecording} className="flex items-center gap-1.5 bg-red-500 text-white px-6 py-2.5 rounded-xl font-bold text-sm shadow-md hover:bg-red-600 transition-all animate-pulse">
              <Square size={16} fill="currentColor" /> Kaydı Bitir
            </button>
          )}
          {userAudioUrl && !isRecording && (
            <button onClick={() => { setUserAudioUrl(null); setEvaluation(null); setActiveWordTip(null); setRhythmScore(null); setTempoScore(null); setFluencyScore(null); }} className="flex items-center gap-1.5 bg-slate-500 text-white px-4 py-2.5 rounded-xl font-bold text-sm shadow-md hover:bg-slate-600 transition-all">
              <RotateCcw size={16} /> Yeniden Dene
            </button>
          )}
          <button onClick={onClose} className="px-4 py-2.5 rounded-xl font-bold text-sm border border-[var(--border)] text-[var(--muted)] hover:bg-[var(--border)] transition-colors">
            Kapat
          </button>
        </div>
      </div>
    </div>
  );
}