// src/lib/speechManager.ts
// Çift Motorlu (Hibrit) Ses Tanıma (STT) Yöneticisi
// Motor 1: Çevrimdışı Yapay Zeka (Whisper Web Worker - WebGPU / WASM q8)
// Motor 2: Hızlı Tarayıcı Motoru (Web Speech API - ar-SA, interimResults: true)
// Otomatik Fallback: Seçili motor başarısız olursa veya boş dönerse diğer motor devreye girer.

import type { WhisperWorkerResponse } from "./whisperWorker";

export type SttEngineType = "whisper" | "webspeech";

export interface SttCallbacks {
  onStatusChange?: (statusText: string) => void;
  onInterimTranscript?: (
    interimText: string,
    finalTranscript?: string,
    rawInterim?: string
  ) => void;
  backupTranscript?: string;
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
          const transcript = event.results[i][0]?.transcript || "";
          if (event.results[i].isFinal) {
            finalChunk += transcript + " ";
          } else {
            interimChunk += transcript;
          }
        }
        if (finalChunk.trim()) {
          this.webSpeechFinalTranscript = (
            this.webSpeechFinalTranscript +
            " " +
            finalChunk
          ).trim();
          this.webSpeechInterimTranscript = interimChunk.trim();
        } else if (interimChunk.trim()) {
          this.webSpeechInterimTranscript = interimChunk.trim();
        }
        const combined = (
          this.webSpeechFinalTranscript +
          " " +
          this.webSpeechInterimTranscript
        ).trim();
        if (combined && callbacks?.onInterimTranscript) {
          callbacks.onInterimTranscript(
            combined,
            this.webSpeechFinalTranscript,
            this.webSpeechInterimTranscript
          );
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

  private requestCounter = 0;

  /**
   * 16kHz Float32Array ses verisini Whisper Worker ile metne dönüştürür.
   * İlk model indirme/yükleme (loading/progress) için 60 sn (60000ms),
   * model hazırlandıktan sonra ses çözümleme (transcribing) için 20 sn (20000ms) ayrı zaman aşımı uygular.
   * Her isteğe benzersiz bir requestId atanır; eski/zaman aşımına uğramış isteklerin geç yanıtları yeni kaydı ezmez.
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
    const requestId = `req_${Date.now()}_${++this.requestCounter}`;
    const MODEL_LOAD_TIMEOUT_MS = 60000;
    const TRANSCRIBE_TIMEOUT_MS = 20000;

    callbacks?.onStatusChange?.(
      "🧠 Yapay Zeka modeli hazırlanıyor / analiz ediliyor..."
    );

    return new Promise<string>((resolve, reject) => {
      let timeout: ReturnType<typeof setTimeout> | null = null;

      const setPhaseTimeout = (ms: number, label: string) => {
        if (timeout !== null) clearTimeout(timeout);
        timeout = setTimeout(() => {
          activeWorker.removeEventListener("message", handleMessage);
          callbacks?.onStatusChange?.("");
          reject(new Error(`Whisper ${label} zaman aşımı (${ms}ms)`));
        }, ms);
      };

      // Başlangıçta model indirme/yükleme için 60 saniye tanı
      setPhaseTimeout(MODEL_LOAD_TIMEOUT_MS, "model yükleme");

      const handleMessage = (event: MessageEvent<WhisperWorkerResponse>) => {
        const {
          requestId: msgReqId,
          status,
          data,
          text,
          device,
          error,
        } = event.data;

        // Eski bir kayıttan kalan geç yanıtları yoksay
        if (msgReqId && msgReqId !== requestId) {
          return;
        }

        if (status === "progress") {
          const pct = Math.round(data?.progress || 0);
          callbacks?.onStatusChange?.(
            `🧠 Yapay Zeka modeli indiriliyor / hazırlanıyor... (${
              device?.toUpperCase() || "WASM"
            } %${pct})`
          );
        } else if (status === "loading") {
          callbacks?.onStatusChange?.(
            "🧠 Yapay Zeka modeli hazırlanıyor (60 sn yükleme süresi)..."
          );
        } else if (status === "transcribing") {
          // Model hazır, ses çözümleme aşaması başladı: 20 saniyelik çözümleme sayacına geç
          setPhaseTimeout(TRANSCRIBE_TIMEOUT_MS, "ses çözümleme");
          callbacks?.onStatusChange?.(
            `🧠 Sesiniz çözümleniyor (${device?.toUpperCase() || "WASM"})...`
          );
        } else if (status === "completed") {
          if (timeout !== null) clearTimeout(timeout);
          activeWorker.removeEventListener("message", handleMessage);
          callbacks?.onStatusChange?.("");
          resolve((text || "").trim());
        } else if (status === "error") {
          if (timeout !== null) clearTimeout(timeout);
          activeWorker.removeEventListener("message", handleMessage);
          callbacks?.onStatusChange?.("");
          reject(new Error(error || "Whisper hatası"));
        }
      };

      activeWorker.addEventListener("message", handleMessage);
      activeWorker.postMessage({
        type: "transcribe",
        requestId,
        audioData: audioData16kHz,
        language: "arabic",
      });
    });
  }

  /**
   * Çift Motorlu Hibrit Çözümleme (Seçili motor + Yedekleme)
   */
  public async transcribeHybrid(
    preferredEngine: SttEngineType,
    audioData16kHz: Float32Array,
    callbacks?: SttCallbacks
  ): Promise<{ text: string; usedEngine: SttEngineType }> {
    const capturedWebSpeech = (
      this.getCapturedWebSpeechText() ||
      callbacks?.backupTranscript ||
      ""
    ).trim();

    if (preferredEngine === "whisper") {
      try {
        const whisperText = await this.transcribeWithWhisper(
          audioData16kHz,
          callbacks
        );
        if (whisperText && /[\u0600-\u06FF]/.test(whisperText)) {
          return { text: whisperText, usedEngine: "whisper" };
        }
        // Whisper boş döndüyse varsa yedek metni kontrol et
        const latestBackup = (
          this.getCapturedWebSpeechText() ||
          callbacks?.backupTranscript ||
          capturedWebSpeech
        ).trim();
        if (latestBackup && /[\u0600-\u06FF]/.test(latestBackup)) {
          return { text: latestBackup, usedEngine: "webspeech" };
        }
        return { text: whisperText || latestBackup, usedEngine: "whisper" };
      } catch {
        // Whisper zaman aşımı veya hata durumunda yedek metin varsa kullan
        const latestBackup = (
          this.getCapturedWebSpeechText() ||
          callbacks?.backupTranscript ||
          capturedWebSpeech
        ).trim();
        if (latestBackup) {
          callbacks?.onStatusChange?.(
            "Yapay zeka modeli yanıt veremedi, Hızlı Tarayıcı Motoru sonucu kullanılıyor..."
          );
          return { text: latestBackup, usedEngine: "webspeech" };
        }
        callbacks?.onStatusChange?.("");
        return { text: "", usedEngine: "whisper" };
      }
    } else {
      // Tercih edilen motor: Hızlı Tarayıcı Motoru (Web Speech API)
      if (capturedWebSpeech && /[\u0600-\u06FF]/.test(capturedWebSpeech)) {
        return { text: capturedWebSpeech, usedEngine: "webspeech" };
      }
      // Web Speech boş döndüyse kısa bir bekleme sonrası tekrar kontrol et, yine boşsa Whisper'a düş!
      await new Promise((r) => setTimeout(r, 450));
      const retryWebSpeech = (
        this.getCapturedWebSpeechText() ||
        callbacks?.backupTranscript ||
        ""
      ).trim();
      if (retryWebSpeech && /[\u0600-\u06FF]/.test(retryWebSpeech)) {
        return { text: retryWebSpeech, usedEngine: "webspeech" };
      }

      callbacks?.onStatusChange?.(
        "🧠 Yapay Zeka modeli hazırlanıyor / analiz ediliyor..."
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
