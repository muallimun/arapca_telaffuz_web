// src/lib/speechManager.ts
// Çift Motorlu (Hibrit) Ses Tanıma (STT) Yöneticisi
// Motor 1: Çevrimdışı Yapay Zeka (Whisper Web Worker - WebGPU / WASM q8)
// Motor 2: Hızlı Tarayıcı Motoru (Web Speech API - ar-SA, interimResults: true)
// Otomatik Fallback: Seçili motor başarısız olursa veya boş dönerse diğer motor devreye girer.

import type { WhisperWorkerResponse } from "./whisperWorker";

export type SttEngineType = "whisper" | "webspeech";

export interface SttCallbacks {
  onStatusChange?: (statusText: string) => void;
  onInterimTranscript?: (interimText: string) => void;
}

export class HybridSpeechManager {
  private worker: Worker | null = null;
  private recognition: any = null;
  private webSpeechFinalTranscript = "";
  private webSpeechInterimTranscript = "";
  private isWebSpeechActive = false;

  constructor() {
    if (typeof window !== "undefined") {
      this.initWorker();
    }
  }

  private initWorker() {
    if (this.worker || typeof window === "undefined") return;
    try {
      this.worker = new Worker(new URL("./whisperWorker.ts", import.meta.url), {
        type: "module",
      });
    } catch {
      this.worker = null;
    }
  }

  public isWebSpeechSupported(): boolean {
    if (typeof window === "undefined") return false;
    return Boolean(
      (window as any).SpeechRecognition ||
        (window as any).webkitSpeechRecognition
    );
  }

  /**
   * Kayıt başlarken Web Speech API'yi paralel veya birincil olarak başlatır
   * (Böylece Whisper başarısız olursa bile Web Speech çıktısı hazırda bekler)
   */
  public startLiveWebSpeech(callbacks?: SttCallbacks) {
    this.webSpeechFinalTranscript = "";
    this.webSpeechInterimTranscript = "";

    if (!this.isWebSpeechSupported()) return;

    try {
      const SR =
        (window as any).SpeechRecognition ||
        (window as any).webkitSpeechRecognition;
      const rec = new SR();
      rec.lang = "ar-SA";
      rec.continuous = true;
      rec.interimResults = true;

      rec.onresult = (event: any) => {
        let finalChunk = "";
        let interimChunk = "";
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalChunk += transcript + " ";
          } else {
            interimChunk += transcript;
          }
        }
        if (finalChunk) {
          this.webSpeechFinalTranscript += finalChunk;
        }
        this.webSpeechInterimTranscript = interimChunk;
        const combined = (
          this.webSpeechFinalTranscript +
          " " +
          this.webSpeechInterimTranscript
        ).trim();
        if (combined && callbacks?.onInterimTranscript) {
          callbacks.onInterimTranscript(combined);
        }
      };

      rec.onerror = () => {
        this.isWebSpeechActive = false;
      };

      rec.onend = () => {
        this.isWebSpeechActive = false;
      };

      rec.start();
      this.recognition = rec;
      this.isWebSpeechActive = true;
    } catch {
      this.isWebSpeechActive = false;
    }
  }

  public stopLiveWebSpeech(): string {
    if (this.recognition) {
      const rec = this.recognition;
      this.recognition = null;
      try {
        rec.onresult = null;
        rec.onerror = null;
        rec.onend = null;
        if (typeof rec.abort === "function") rec.abort();
        if (typeof rec.stop === "function") rec.stop();
      } catch {
        // sessizce geç
      }
    }
    this.isWebSpeechActive = false;
    return (
      this.webSpeechFinalTranscript +
      " " +
      this.webSpeechInterimTranscript
    ).trim();
  }

  public getCapturedWebSpeechText(): string {
    return (
      this.webSpeechFinalTranscript +
      " " +
      this.webSpeechInterimTranscript
    ).trim();
  }

  /**
   * 16kHz Float32Array ses verisini Whisper Worker ile metne dönüştürür
   */
  public transcribeWithWhisper(
    audioData16kHz: Float32Array,
    callbacks?: SttCallbacks
  ): Promise<string> {
    this.initWorker();
    if (!this.worker) {
      return Promise.reject(new Error("Whisper Worker başlatılamadı."));
    }

    const activeWorker = this.worker;
    return new Promise<string>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("Whisper zaman aşımı"));
      }, 28000);

      const handleMessage = (event: MessageEvent<WhisperWorkerResponse>) => {
        const { status, data, text, device, error } = event.data;
        if (status === "progress") {
          const pct = Math.round(data?.progress || 0);
          callbacks?.onStatusChange?.(
            `Yapay Zeka Modeli İndiriliyor (${device?.toUpperCase() || "WASM"}): %${pct}`
          );
        } else if (status === "loading") {
          callbacks?.onStatusChange?.("Whisper Yapay Zeka Motoru Hazırlanıyor...");
        } else if (status === "transcribing") {
          callbacks?.onStatusChange?.(
            `Sesiniz Analiz Ediliyor (${device?.toUpperCase() || "WASM"})...`
          );
        } else if (status === "completed") {
          clearTimeout(timeout);
          activeWorker.removeEventListener("message", handleMessage);
          callbacks?.onStatusChange?.("");
          resolve((text || "").trim());
        } else if (status === "error") {
          clearTimeout(timeout);
          activeWorker.removeEventListener("message", handleMessage);
          callbacks?.onStatusChange?.("");
          reject(new Error(error || "Whisper hatası"));
        }
      };

      activeWorker.addEventListener("message", handleMessage);
      activeWorker.postMessage({
        type: "transcribe",
        audioData: audioData16kHz,
        language: "ar",
      });
    });
  }

  /**
   * Çift Motorlu Hibrit Çözümleme (Seçili motor + Otomatik Fallback)
   */
  public async transcribeHybrid(
    preferredEngine: SttEngineType,
    audioData16kHz: Float32Array,
    callbacks?: SttCallbacks
  ): Promise<{ text: string; usedEngine: SttEngineType }> {
    const capturedWebSpeech = this.getCapturedWebSpeechText();

    if (preferredEngine === "whisper") {
      try {
        const whisperText = await this.transcribeWithWhisper(
          audioData16kHz,
          callbacks
        );
        if (whisperText && /[\u0600-\u06FF]/.test(whisperText)) {
          return { text: whisperText, usedEngine: "whisper" };
        }
        // Whisper boş veya Arapça dışı döndüyse Web Speech yakalamasına bak
        if (capturedWebSpeech && /[\u0600-\u06FF]/.test(capturedWebSpeech)) {
          return { text: capturedWebSpeech, usedEngine: "webspeech" };
        }
        return { text: whisperText || capturedWebSpeech, usedEngine: "whisper" };
      } catch {
        // Fallback -> Web Speech
        callbacks?.onStatusChange?.(
          "Yapay zeka motoru yanıt vermedi, Hızlı Tarayıcı Motoru kullanılıyor..."
        );
        return { text: capturedWebSpeech, usedEngine: "webspeech" };
      }
    } else {
      // Tercih edilen motor: Hızlı Tarayıcı Motoru (Web Speech API)
      if (capturedWebSpeech && /[\u0600-\u06FF]/.test(capturedWebSpeech)) {
        return { text: capturedWebSpeech, usedEngine: "webspeech" };
      }
      // Web Speech boş döndüyse kısa bir bekleme sonrası tekrar kontrol et, yine boşsa Whisper'a düş!
      await new Promise((r) => setTimeout(r, 450));
      const retryWebSpeech = this.getCapturedWebSpeechText();
      if (retryWebSpeech && /[\u0600-\u06FF]/.test(retryWebSpeech)) {
        return { text: retryWebSpeech, usedEngine: "webspeech" };
      }

      callbacks?.onStatusChange?.(
        "Tarayıcı motoru ses algılayamadı, Yapay Zeka (Whisper) devreye giriyor..."
      );
      try {
        const whisperText = await this.transcribeWithWhisper(
          audioData16kHz,
          callbacks
        );
        return { text: whisperText, usedEngine: "whisper" };
      } catch {
        return { text: retryWebSpeech, usedEngine: "webspeech" };
      }
    }
  }

  public terminate() {
    this.stopLiveWebSpeech();
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
  }
}
