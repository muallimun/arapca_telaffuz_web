'use client';

/**
 * Güvenli Screen Wake Lock API Yöneticisi
 * Mobil cihazlarda diyalog dinlerken, rol yaparken veya telaffuz çalışırken
 * ekranın otomatik kararmasını/uykuya geçmesini önler.
 */

interface WakeLockSentinelLike {
  released?: boolean;
  release: () => Promise<void>;
  addEventListener?: (type: string, listener: () => void) => void;
}

let wakeLockSentinel: WakeLockSentinelLike | null = null;
let activeLocks = new Set<string>();
let visibilityListenerAttached = false;

async function acquireNativeWakeLock(): Promise<void> {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return;
  if (!('wakeLock' in navigator)) return;
  if (document.visibilityState !== 'visible') return;

  try {
    if (wakeLockSentinel && !wakeLockSentinel.released) {
      return;
    }
    const nav = navigator as Navigator & {
      wakeLock?: {
        request: (type: 'screen') => Promise<WakeLockSentinelLike>;
      };
    };
    if (nav.wakeLock && typeof nav.wakeLock.request === 'function') {
      wakeLockSentinel = await nav.wakeLock.request('screen');
      wakeLockSentinel.addEventListener?.('release', () => {
        wakeLockSentinel = null;
      });
    }
  } catch {
    // Desteklenmeyen tarayıcı veya düşük pil modunda sessizce geç
    wakeLockSentinel = null;
  }
}

async function releaseNativeWakeLock(): Promise<void> {
  if (!wakeLockSentinel) return;
  try {
    const current = wakeLockSentinel;
    wakeLockSentinel = null;
    await current.release();
  } catch {
    wakeLockSentinel = null;
  }
}

function ensureVisibilityListener(): void {
  if (visibilityListenerAttached || typeof document === 'undefined') return;
  visibilityListenerAttached = true;

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && activeLocks.size > 0) {
      void acquireNativeWakeLock();
    }
  });
}

/**
 * Belirli bir kaynak (örn: 'audio', 'dialogue', 'recording') için ekran kilidi talep eder.
 */
export async function requestWakeLock(source = 'audio'): Promise<void> {
  if (typeof window === 'undefined') return;
  ensureVisibilityListener();
  activeLocks.add(source);
  await acquireNativeWakeLock();
}

/**
 * Belirli bir kaynağın ekran kilidini serbest bırakır.
 * Eğer başka aktif kaynak kalmadıysa donanım kilidini tamamen kapatır.
 */
export async function releaseWakeLock(source = 'audio'): Promise<void> {
  activeLocks.delete(source);
  if (activeLocks.size === 0) {
    await releaseNativeWakeLock();
  }
}

/**
 * Tüm kaynakların ekran kilidini temizler ve serbest bırakır.
 */
export async function releaseAllWakeLocks(): Promise<void> {
  activeLocks.clear();
  await releaseNativeWakeLock();
}
