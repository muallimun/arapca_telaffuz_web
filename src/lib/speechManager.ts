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
  abort?: () => void;
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
      // Kullanıcı kayıt devam ederken "Yalnızca Cihazda İşle" (localSttOnly) seçeneğini açarsa
      // veya motoru "whisper" yaparsa çalışan SpeechRecognition oturumunu anında iptal et ve çevrimiçi metin tamponunu temizle.
      useSettings.subscribe((state, prevState) => {
        if (
          (state.localSttOnly && !prevState.localSttOnly) ||
          (state.sttEngine === "whisper" && prevState.sttEngine !== "whisper")
        ) {
          this.stopLiveWebSpeech(true);
        }
      });
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
   * "Yalnızca Cihazda İşle" (localSttOnly) açıksa veya motor "whisper" ise kesinlikle çevrimiçi SpeechRecognition başlatılmaz.
   */
  public startLiveWebSpeech(callbacks?: SttCallbacks) {
    this.stopLiveWebSpeech(true);
    this.webSpeechFinalTranscript = "";
    this.webSpeechInterimTranscript = "";

    const { localSttOnly } = useSettings.getState();
    if (localSttOnly) {
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
        const currentSettings = useSettings.getState();
        if (currentSettings.localSttOnly) {
          this.stopLiveWebSpeech(true);
          callbacks?.onInterimTranscript?.("", "", "");
          return;
        }
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
    const { localSttOnly } = useSettings.getState();
    if (localSttOnly) {
      this.stopLiveWebSpeech(true);
      return Promise.resolve("");
    }

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

  public stopLiveWebSpeech(clearBuffers: boolean = false): string {
    if (this.recognition) {
      const rec = this.recognition;
      this.recognition = null;
      try {
        rec.onresult = null;
        rec.onerror = null;
        rec.onend = null;
        if (clearBuffers && typeof rec.abort === "function") {
          rec.abort();
        } else if (typeof rec.stop === "function") {
          rec.stop();
        }
      } catch {
        // sessizce geç
      }
    }
    this.isWebSpeechActive = false;
    const { localSttOnly } = useSettings.getState();
    if (clearBuffers || localSttOnly) {
      this.webSpeechFinalTranscript = "";
      this.webSpeechInterimTranscript = "";
      return "";
    }
    return (
      this.webSpeechFinalTranscript +
      " " +
      this.webSpeechInterimTranscript
    ).trim();
  }

  public getCapturedWebSpeechText(): string {
    const { localSttOnly } = useSettings.getState();
    if (localSttOnly) {
      this.webSpeechFinalTranscript = "";
      this.webSpeechInterimTranscript = "";
      return "";
    }
    return (
      this.webSpeechFinalTranscript +
      " " +
      this.webSpeechInterimTranscript
    ).trim();
  }

  private requestCounter = 0;
  private activeWhisperRequestId: string | null = null;
  private hasTriggeredPreload = false;

  /**
   * Gölgeleme Koçu açıldığında arka planda Whisper modelini (mobilde whisper-tiny, masaüstünde whisper-base)
   * sessizce ön-yükler; böylece kullanıcı kayda basana kadar model hazırlanmış olur.
   */
  public preloadWhisperModel() {
    this.initWorker();
    if (!this.worker || this.hasTriggeredPreload) return;
    this.hasTriggeredPreload = true;
    try {
      const preloadReqId = `preload_${Date.now()}_${++this.requestCounter}`;
      this.worker.postMessage({
        type: "preload",
        requestId: preloadReqId,
      });
    } catch {
      // ignore preload error
    }
  }

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
   * 16kHz Float32Array PCM ses verisini 44-byte RIFF/WAVE 16-bit PCM Blob'una dönüştürür.
   */
  private encodePcm16kToWavBlob(samples: Float32Array): Blob {
    const sampleRate = 16000;
    const length = samples.length;
    const bufferSize = 44 + length * 2;
    const arrayBuffer = new ArrayBuffer(bufferSize);
    const view = new DataView(arrayBuffer);

    const writeStr = (offset: number, str: string) => {
      for (let i = 0; i < str.length; i++) {
        view.setUint8(offset + i, str.charCodeAt(i));
      }
    };

    writeStr(0, "RIFF");
    view.setUint32(4, bufferSize - 8, true);
    writeStr(8, "WAVE");
    writeStr(12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeStr(36, "data");
    view.setUint32(40, length * 2, true);

    let offset = 44;
    for (let i = 0; i < length; i++) {
      const s = Math.max(-1, Math.min(1, samples[i]));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      offset += 2;
    }
    return new Blob([arrayBuffer], { type: "audio/wav" });
  }

  /**
   * Whisper'a gönderilen 16kHz sesin tepe genliğini 0.90 seviyesine normalize eder,
   * başına 0.30 saniye (4800 sıfır örneği) ve sonuna 0.40 saniye (6400 sıfır örneği) sessizlik yastığı (zero-padding) ekler
   * ve ses uzunluğunun her zaman >= 1.6 saniye (25600 örnek) olmasını garanti eder.
   */
  private preparePadded16kHzAudio(
    audioData16kHz: Float32Array,
    gainBoost: number = 1.0
  ): Float32Array {
    if (!audioData16kHz || audioData16kHz.length === 0) {
      return new Float32Array(0);
    }
    let maxAbs = 0;
    for (let i = 0; i < audioData16kHz.length; i++) {
      const abs = Math.abs(audioData16kHz[i]);
      if (abs > maxAbs) maxAbs = abs;
    }
    if (maxAbs < 0.002) {
      return audioData16kHz;
    }

    const scale = (0.9 / maxAbs) * gainBoost;
    const prePad = 4800; // 0.30 sn @ 16kHz
    const postPad = 6400; // 0.40 sn @ 16kHz
    const minTotalLen = 25600; // 1.60 sn @ 16kHz
    const totalLen = Math.max(
      minTotalLen,
      prePad + audioData16kHz.length + postPad
    );
    const padded = new Float32Array(totalLen);
    for (let i = 0; i < audioData16kHz.length; i++) {
      padded[prePad + i] = Math.max(
        -0.98,
        Math.min(0.98, audioData16kHz[i] * scale)
      );
    }
    return padded;
  }

  /**
   * Mobilde getUserMedia açıkken Web Speech kilitlendiğinde ve cihaz içi WASM bellek sınırına takıldığında
   * (yalnızca localSttOnly === false iken) 16kHz WAV ses verisini /api/stt sunucu rotasına göndererek çözümler.
   */
  public async transcribeViaServerApi(
    audioData16kHz: Float32Array,
    callbacks?: SttCallbacks
  ): Promise<string> {
    if (useSettings.getState().localSttOnly) {
      return "";
    }
    if (!audioData16kHz || audioData16kHz.length < 2400) {
      return "";
    }
    try {
      callbacks?.onStatusChange?.(
        "🧠 Bulut yedek STT servisi ile sesiniz çözümleniyor..."
      );
      const paddedPcm16k = this.preparePadded16kHzAudio(audioData16kHz, 1.0);
      const wavBlob = this.encodePcm16kToWavBlob(paddedPcm16k);
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 18000);
      try {
        const res = await fetch("/api/stt", {
          method: "POST",
          headers: { "Content-Type": "audio/wav" },
          body: wavBlob,
          signal: controller.signal,
        });
        if (!res.ok) return "";
        const data = (await res.json()) as { text?: string };
        return (data?.text || "").trim();
      } finally {
        clearTimeout(timeoutId);
        callbacks?.onStatusChange?.("");
      }
    } catch {
      callbacks?.onStatusChange?.("");
      return "";
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

    const normalizedPcm16k = this.preparePadded16kHzAudio(audioData16kHz, 1.0);

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

        // Model ön-yükleme (preload) sırasında gelen progress/loading bildirimlerinin de zaman aşımını yenilemesine izin ver
        const isPreloadProgress =
          msgReqId?.startsWith("preload_") &&
          (status === "progress" || status === "loading" || status === "ready");

        if (msgReqId && msgReqId !== requestId && !isPreloadProgress) {
          return;
        }

        if (ignored && msgReqId === requestId) {
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
        } else if (status === "loading" || status === "ready") {
          setPhaseTimeout(MODEL_LOAD_TIMEOUT_MS, "model hazırlama");
          callbacks?.onStatusChange?.(
            "Yapay zeka modeli ilk kullanım için hazırlanıyor (%0)..."
          );
        } else if (status === "transcribing" && msgReqId === requestId) {
          // Yalnızca status === "transcribing" geldiğinde 15 saniyelik çıkarım sayacını başlat
          setPhaseTimeout(TRANSCRIBE_TIMEOUT_MS, "ses çözümleme");
          callbacks?.onStatusChange?.(
            `🧠 Sesiniz çözümleniyor (${device?.toUpperCase() || "WASM"})...`
          );
        } else if (status === "completed" && msgReqId === requestId) {
          if (timeout !== null) clearTimeout(timeout);
          activeWorker.removeEventListener("message", handleMessage);
          if (this.activeWhisperRequestId === requestId) {
            this.activeWhisperRequestId = null;
          }
          callbacks?.onStatusChange?.("");
          resolve((text || "").trim());
        } else if (status === "error" && msgReqId === requestId) {
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
        audioData: normalizedPcm16k,
        sampleRate: 16000,
        language: "arabic",
      });
    });
  }

  /**
   * Çift Motorlu Hibrit Çözümleme (Seçili motor + Yedekleme + Sunucu /api/stt Fallback)
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
        // Whisper boş döndüyse varsa Web Speech yedek metnini kontrol et
        const latestBackup = (
          this.getCapturedWebSpeechText() ||
          callbacks?.backupTranscript ||
          capturedWebSpeech
        ).trim();
        if (latestBackup && /[\u0600-\u06FF]/.test(latestBackup)) {
          return { text: latestBackup, usedEngine: "webspeech" };
        }
        // Her ikisi de boşsa ve localSttOnly kapalıysa /api/stt sunucu yedeğini dene
        const serverText = await this.transcribeViaServerApi(
          audioData16kHz,
          callbacks
        );
        if (serverText && /[\u0600-\u06FF]/.test(serverText)) {
          return { text: serverText, usedEngine: "whisper" };
        }
        return {
          text: whisperText || latestBackup || serverText,
          usedEngine: "whisper",
        };
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
        if (latestBackup && /[\u0600-\u06FF]/.test(latestBackup)) {
          callbacks?.onStatusChange?.(
            "Yapay zeka modeli yanıt veremedi, Hızlı Tarayıcı Motoru sonucu kullanılıyor..."
          );
          return { text: latestBackup, usedEngine: "webspeech" };
        }
        const serverText = await this.transcribeViaServerApi(
          audioData16kHz,
          callbacks
        );
        if (serverText && /[\u0600-\u06FF]/.test(serverText)) {
          return { text: serverText, usedEngine: "whisper" };
        }
        callbacks?.onStatusChange?.("");
        return { text: latestBackup || serverText || "", usedEngine: "whisper" };
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
        if (whisperText && /[\u0600-\u06FF]/.test(whisperText)) {
          return { text: whisperText, usedEngine: "whisper" };
        }
      } catch {
        // Cihaz içi Whisper hata verirse sunucu /api/stt yedeğine geç
      }

      if (!isLocalOnly) {
        const serverText = await this.transcribeViaServerApi(
          audioData16kHz,
          callbacks
        );
        if (serverText && /[\u0600-\u06FF]/.test(serverText)) {
          return { text: serverText, usedEngine: "whisper" };
        }
      }

      return { text: retryWebSpeech, usedEngine: "webspeech" };
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
