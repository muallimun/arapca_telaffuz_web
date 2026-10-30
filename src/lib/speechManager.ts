// src/lib/speechManager.ts
// Çift Motorlu (Hibrit) Ses Tanıma (STT) Yöneticisi
// Motor 1: Çevrimdışı Yapay Zeka (Whisper Web Worker - WebGPU / WASM q8)
// Motor 2: Hızlı Tarayıcı Motoru (Web Speech API - ar-SA, interimResults: true)
// Otomatik Fallback: Seçili motor başarısız olursa veya boş dönerse diğer motor devreye girer.

import type { WhisperWorkerResponse } from "./whisperWorker";
import { useSettings } from "@/store/settings";

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

interface SpeechRecognitionResultAlternativeLike {
  transcript?: string;
}

interface SpeechRecognitionResultLike {
  isFinal?: boolean;
  0?: SpeechRecognitionResultAlternativeLike;
}

interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResultLike>;
}

interface SpeechRecognitionInstanceLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event?: unknown) => void) | null;
  onend: ((event?: unknown) => void) | null;
  start: () => void;
  stop: () => void;
}

type WindowWithSpeechRecognition = Window & {
  SpeechRecognition?: new () => SpeechRecognitionInstanceLike;
  webkitSpeechRecognition?: new () => SpeechRecognitionInstanceLike;
};

export class HybridSpeechManager {
  private worker: Worker | null = null;
  private recognition: SpeechRecognitionInstanceLike | null = null;
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
    const win = window as WindowWithSpeechRecognition;
    return Boolean(win.SpeechRecognition || win.webkitSpeechRecognition);
  }

  /**
   * Kayıt başlarken Web Speech API'yi başlatır.
   * "Yalnızca Cihazda İşle" (localSttOnly) açıksa kesinlikle çevrimiçi SpeechRecognition başlatılmaz.
   */
  public startLiveWebSpeech(callbacks?: SttCallbacks) {
    this.webSpeechFinalTranscript = "";
    this.webSpeechInterimTranscript = "";

    if (useSettings.getState().localSttOnly) {
      this.isWebSpeechActive = false;
      return;
    }

    if (!this.isWebSpeechSupported()) return;

    try {
      const win = window as WindowWithSpeechRecognition;
      const SR = win.SpeechRecognition || win.webkitSpeechRecognition;
      if (!SR) return;
      const rec = new SR();
      rec.lang = "ar-SA";
      rec.continuous = true;
      rec.interimResults = true;

      rec.onresult = (event: SpeechRecognitionEventLike) => {
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

  /**
   * Mobil tarayıcılarda recognition.stop() çağrıldıktan sonra 200-600ms içinde gelen
   * son onresult olayını kaybetmemek için onend tetiklenene veya timeoutMs dolana kadar bekler.
   */
  public stopAndWaitForFinalResult(timeoutMs: number = 1200): Promise<string> {
    if (!this.recognition) {
      this.isWebSpeechActive = false;
      return Promise.resolve(this.getCapturedWebSpeechText());
    }

    const rec = this.recognition;
    this.recognition = null;

    return new Promise<string>((resolve) => {
      let settled = false;

      const finish = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        try {
          rec.onresult = null;
          rec.onerror = null;
          rec.onend = null;
        } catch {
          // ignore
        }
        this.isWebSpeechActive = false;
        resolve(this.getCapturedWebSpeechText());
      };

      const timer = setTimeout(finish, timeoutMs);

      const prevOnEnd = rec.onend;
      rec.onend = (ev?: unknown) => {
        try {
          if (typeof prevOnEnd === "function") prevOnEnd(ev);
        } catch {
          // ignore
        }
        // onend öncesinde kuyrukta bekleyen son onresult'ın işlenmesi için 60ms mikro bekleme
        setTimeout(finish, 60);
      };

      const prevOnError = rec.onerror;
      rec.onerror = (ev?: unknown) => {
        try {
          if (typeof prevOnError === "function") prevOnError(ev);
        } catch {
          // ignore
        }
        setTimeout(finish, 60);
      };

      try {
        if (typeof rec.stop === "function") {
          rec.stop();
        } else {
          finish();
        }
      } catch {
        finish();
      }
    });
  }

  public stopListeningAsync(timeoutMs: number = 1200): Promise<string> {
    return this.stopAndWaitForFinalResult(timeoutMs);
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
  private activeWhisperRequestId: string | null = null;

  public abortActiveWhisperRequest() {
    if (this.worker && this.activeWhisperRequestId) {
      try {
        this.worker.postMessage({
          type: "abort",
          requestId: this.activeWhisperRequestId,
        });
      } catch {
        // ignore
      }
      this.activeWhisperRequestId = null;
    }
  }

  /**
   * 16kHz Float32Array ses verisini Whisper Worker ile metne dönüştürür.
   * İlk model indirme/yükleme (initiate/download/loading/progress) için 90 sn (90000ms),
   * model hazırlandıktan sonra ses çözümleme (status === "transcribing") için 15 sn (15000ms) ayrı zaman aşımı uygular.
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
    this.activeWhisperRequestId = requestId;
    const MODEL_LOAD_TIMEOUT_MS = 90000;
    const TRANSCRIBE_TIMEOUT_MS = 15000;

    callbacks?.onStatusChange?.(
      "Yapay zeka modeli ilk kullanım için hazırlanıyor (%0)..."
    );

    return new Promise<string>((resolve, reject) => {
      let timeout: ReturnType<typeof setTimeout> | null = null;

      const setPhaseTimeout = (ms: number, label: string) => {
        if (timeout !== null) clearTimeout(timeout);
        timeout = setTimeout(() => {
          activeWorker.removeEventListener("message", handleMessage);
          try {
            activeWorker.postMessage({ type: "abort", requestId });
          } catch {
            // ignore
          }
          if (this.activeWhisperRequestId === requestId) {
            this.activeWhisperRequestId = null;
          }
          callbacks?.onStatusChange?.("");
          reject(new Error(`Whisper ${label} zaman aşımı (${ms}ms)`));
        }, ms);
      };

      // Başlangıçta model indirme/yükleme için 90 saniye (90000ms) tanı
      setPhaseTimeout(MODEL_LOAD_TIMEOUT_MS, "model yükleme");

      const handleMessage = (event: MessageEvent<WhisperWorkerResponse>) => {
        const {
          requestId: msgReqId,
          status,
          ignored,
          data,
          text,
          device,
          error,
        } = event.data;

        // Eski bir kayıttan kalan geç yanıtları yoksay
        if (msgReqId && msgReqId !== requestId) {
          return;
        }

        if (ignored) {
          if (timeout !== null) clearTimeout(timeout);
          activeWorker.removeEventListener("message", handleMessage);
          resolve("");
          return;
        }

        if (status === "progress") {
          const pct = Math.round(data?.progress || 0);
          setPhaseTimeout(MODEL_LOAD_TIMEOUT_MS, "model indirme");
          callbacks?.onStatusChange?.(
            `Yapay zeka modeli ilk kullanım için hazırlanıyor (%${pct})`
          );
        } else if (status === "loading") {
          setPhaseTimeout(MODEL_LOAD_TIMEOUT_MS, "model hazırlama");
          callbacks?.onStatusChange?.(
            "Yapay zeka modeli ilk kullanım için hazırlanıyor (%0)..."
          );
        } else if (status === "transcribing") {
          // Yalnızca status === "transcribing" geldiğinde 15 saniyelik çıkarım sayacını başlat
          setPhaseTimeout(TRANSCRIBE_TIMEOUT_MS, "ses çözümleme");
          callbacks?.onStatusChange?.(
            `🧠 Sesiniz çözümleniyor (${device?.toUpperCase() || "WASM"})...`
          );
        } else if (status === "completed") {
          if (timeout !== null) clearTimeout(timeout);
          activeWorker.removeEventListener("message", handleMessage);
          if (this.activeWhisperRequestId === requestId) {
            this.activeWhisperRequestId = null;
          }
          callbacks?.onStatusChange?.("");
          resolve((text || "").trim());
        } else if (status === "error") {
          if (timeout !== null) clearTimeout(timeout);
          activeWorker.removeEventListener("message", handleMessage);
          if (this.activeWhisperRequestId === requestId) {
            this.activeWhisperRequestId = null;
          }
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
    const isLocalOnly = useSettings.getState().localSttOnly;
    const effectiveEngine: SttEngineType = isLocalOnly
      ? "whisper"
      : preferredEngine;
    const capturedWebSpeech = isLocalOnly
      ? ""
      : (
          this.getCapturedWebSpeechText() ||
          callbacks?.backupTranscript ||
          ""
        ).trim();

    if (effectiveEngine === "whisper") {
      try {
        const whisperText = await this.transcribeWithWhisper(
          audioData16kHz,
          callbacks
        );
        if (whisperText && /[\u0600-\u06FF]/.test(whisperText)) {
          return { text: whisperText, usedEngine: "whisper" };
        }
        if (isLocalOnly) {
          return { text: whisperText || "", usedEngine: "whisper" };
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
        if (isLocalOnly) {
          callbacks?.onStatusChange?.("");
          return { text: "", usedEngine: "whisper" };
        }
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
