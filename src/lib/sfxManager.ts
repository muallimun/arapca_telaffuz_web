// src/lib/sfxManager.ts
// Web Audio API tabanlı ses efekt motoru — harici dosya gerektirmez.

type Waveform = OscillatorType;

interface Note {
  frequency: number;
  startOffset: number; // saniye, "şimdi"den itibaren
  duration: number;
  waveform?: Waveform;
  peakGain?: number;
}

class SoundEffectsManager {
  private ctx: AudioContext | null = null;
  private enabled = true;
  private unlockBound = false;

  constructor() {
    if (typeof window !== "undefined") {
      this.bindUnlock();
    }
  }

  /** İlk kullanıcı etkileşiminde AudioContext'i açar (mobil autoplay kısıtı) */
  private bindUnlock() {
    if (this.unlockBound) return;
    this.unlockBound = true;
    const unlock = () => {
      try {
        this.getContext().resume();
      } catch {
        /* sessizce yut */
      }
      document.removeEventListener("click", unlock);
      document.removeEventListener("touchstart", unlock);
      document.removeEventListener("keydown", unlock);
    };
    document.addEventListener("click", unlock, { passive: true });
    document.addEventListener("touchstart", unlock, { passive: true });
    document.addEventListener("keydown", unlock, { passive: true });
  }

  private getContext(): AudioContext {
    if (!this.ctx) {
      const AC =
        window.AudioContext || (window as any).webkitAudioContext;
      this.ctx = new AC();
    }
    return this.ctx;
  }

  /** Ayarlardan aç/kapat */
  setEnabled(value: boolean) {
    this.enabled = value;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  /** TTS çalarken efektleri bastırmamak için çakışma kontrolü */
  private isTTSActive(): boolean {
    if (typeof window === "undefined" || !window.speechSynthesis) return false;
    return window.speechSynthesis.speaking || window.speechSynthesis.pending;
  }

  private canPlay(): boolean {
    return this.enabled && !this.isTTSActive();
  }

  private playNotes(notes: Note[]) {
    if (!this.canPlay()) return;
    try {
      const ctx = this.getContext();
      if (ctx.state === "suspended") ctx.resume();
      const now = ctx.currentTime;

      notes.forEach((note) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = note.waveform ?? "sine";
        osc.frequency.setValueAtTime(note.frequency, now + note.startOffset);

        const peak = note.peakGain ?? 0.18;
        const start = now + note.startOffset;
        const end = start + note.duration;

        // Yumuşak zarf (attack ~15ms, release ~20ms) — kulağı tırmalamaz
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(peak, start + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0001, end);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(start);
        osc.stop(end + 0.02);
      });
    } catch {
      /* sessizce geç */
    }
  }

  private vibrate(pattern: number | number[]) {
    if (typeof navigator === "undefined") return;
    if (typeof navigator.vibrate !== "function") return;
    try {
      navigator.vibrate(pattern);
    } catch {
      /* sessizce geç */
    }
  }

  // ---------------- PUBLIC API ----------------

  /** Başarı / doğru cevap / %80+ telaffuz (C5→E5→G5) */
  playSuccess() {
    this.playNotes([
      { frequency: 523.25, startOffset: 0.0, duration: 0.12, waveform: "sine", peakGain: 0.18 },
      { frequency: 659.25, startOffset: 0.10, duration: 0.12, waveform: "sine", peakGain: 0.18 },
      { frequency: 783.99, startOffset: 0.20, duration: 0.22, waveform: "sine", peakGain: 0.20 },
    ]);
    this.vibrate(40);
  }

  /** Orta seviye / %50–%79 telaffuz (E4→G4) */
  playPartial() {
    this.playNotes([
      { frequency: 329.63, startOffset: 0.0, duration: 0.14, waveform: "triangle", peakGain: 0.15 },
      { frequency: 392.0, startOffset: 0.12, duration: 0.20, waveform: "triangle", peakGain: 0.15 },
    ]);
    this.vibrate(25);
  }

  /** Hata / %50 altı telaffuz (E4→C4, yumuşak) */
  playError() {
    this.playNotes([
      { frequency: 329.63, startOffset: 0.0, duration: 0.18, waveform: "triangle", peakGain: 0.14 },
      { frequency: 261.63, startOffset: 0.15, duration: 0.25, waveform: "triangle", peakGain: 0.14 },
    ]);
    this.vibrate([40, 60, 40]);
  }

  /** Mikrofon kaydı başladı (600→880Hz bip) */
  playRecordStart() {
    this.playNotes([
      { frequency: 600, startOffset: 0.0, duration: 0.06, waveform: "sine", peakGain: 0.14 },
      { frequency: 880, startOffset: 0.05, duration: 0.08, waveform: "sine", peakGain: 0.14 },
    ]);
    this.vibrate(25);
  }

  /** Mikrofon kaydı bitti (880→600Hz bip) */
  playRecordStop() {
    this.playNotes([
      { frequency: 880, startOffset: 0.0, duration: 0.06, waveform: "sine", peakGain: 0.14 },
      { frequency: 600, startOffset: 0.05, duration: 0.08, waveform: "sine", peakGain: 0.14 },
    ]);
    this.vibrate(15);
  }

  /** Kart çevirme — kısa tık */
  playFlip() {
    this.playNotes([
      { frequency: 1200, startOffset: 0.0, duration: 0.03, waveform: "square", peakGain: 0.06 },
    ]);
  }

  /** Buton / sekme tıklaması — çok kısa pop */
  playClick() {
    this.playNotes([
      { frequency: 1000, startOffset: 0.0, duration: 0.025, waveform: "square", peakGain: 0.05 },
    ]);
  }

  /** Test/kategori tamamlama — 4 notalı zafer melodisi */
  playFanfare() {
    this.playNotes([
      { frequency: 523.25, startOffset: 0.0, duration: 0.10, waveform: "sine", peakGain: 0.16 },
      { frequency: 659.25, startOffset: 0.10, duration: 0.10, waveform: "sine", peakGain: 0.16 },
      { frequency: 783.99, startOffset: 0.20, duration: 0.10, waveform: "sine", peakGain: 0.16 },
      { frequency: 1046.5, startOffset: 0.30, duration: 0.35, waveform: "sine", peakGain: 0.20 },
    ]);
    this.vibrate([30, 40, 30, 40, 50]);
  }
}

// Singleton
export const sfx = new SoundEffectsManager();

// Kolaylık için kısayol export'ları
export const playSuccess = () => sfx.playSuccess();
export const playPartial = () => sfx.playPartial();
export const playError = () => sfx.playError();
export const playRecordStart = () => sfx.playRecordStart();
export const playRecordStop = () => sfx.playRecordStop();
export const playFlip = () => sfx.playFlip();
export const playClick = () => sfx.playClick();
export const playFanfare = () => sfx.playFanfare();