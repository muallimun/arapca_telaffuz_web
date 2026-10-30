type WindowWithWebkitAudio = Window & {
  webkitAudioContext?: typeof AudioContext;
};

export const playTickSound = (isCritical: boolean = false) => {
  if (typeof window === "undefined") return;

  try {
    const AC =
      window.AudioContext || (window as WindowWithWebkitAudio).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    // Son saniyede daha tiz (heyecanlı), normalde daha tok bir ses
    osc.frequency.setValueAtTime(isCritical ? 880 : 440, ctx.currentTime);

    gain.gain.setValueAtTime(0.1, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.00001, ctx.currentTime + 0.1);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.1);
  } catch (e) {
    console.error("Ses çalınamadı", e);
  }
};

export const playSuccessSound = () => {
  if (typeof window === "undefined") return;
  try {
    const AC =
      window.AudioContext || (window as WindowWithWebkitAudio).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(523.25, ctx.currentTime); // C5
    osc.frequency.setValueAtTime(659.25, ctx.currentTime + 0.1); // E5
    osc.frequency.setValueAtTime(783.99, ctx.currentTime + 0.2); // G5
    gain.gain.setValueAtTime(0.1, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.00001, ctx.currentTime + 0.4);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.4);
  } catch {
    // ignore
  }
};