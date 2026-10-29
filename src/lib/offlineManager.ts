// src/lib/offlineManager.ts
// İndirilebilir Çevrimdışı Ders Paketleri (Cache API: "muallimun-offline-audio-v1")

import { diyaloglar } from "@/lib/data";
import { loadAudioManifest, getMp3Path } from "@/lib/audio";

export const OFFLINE_AUDIO_CACHE_NAME = "muallimun-offline-audio-v1";
const OFFLINE_STORAGE_KEY = "muallimun-offline-dialogues-v1";

// Ortalama bir diyalog cümlesi MP3 boyutu (~145 KB)
const ESTIMATED_KB_PER_SENTENCE = 145;

function readStoredOfflineList(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(OFFLINE_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function writeStoredOfflineList(ids: string[]): void {
  if (typeof window === "undefined") return;
  try {
    const unique = Array.from(new Set(ids));
    window.localStorage.setItem(OFFLINE_STORAGE_KEY, JSON.stringify(unique));
    window.dispatchEvent(new CustomEvent("muallimun-offline-updated"));
  } catch {
    // ignore storage errors
  }
}

/**
 * manifest.json (hem manifest.dialogues[dialogueId] hem de üst seviye manifest[dialogueId])
 * ve diyalog satırlarını kullanarak ilgili diyaloğun tüm MP3 dosya yollarını döndürür.
 */
export async function getDialogueAudioUrls(dialogueId: string): Promise<{
  urls: string[];
  estimatedSizeMb: number;
}> {
  const manifest = await loadAudioManifest();
  const dlg = diyaloglar.find((d) => d.id === dialogueId);
  const urlsSet = new Set<string>();

  // 1. manifest.dialogues?.[dialogueId] veya manifest[dialogueId] kontrolü
  const dialoguesMap =
    (manifest as unknown as { dialogues?: Record<string, string[]> }).dialogues ||
    manifest;
  const manifestEntry = dialoguesMap?.[dialogueId];

  if (Array.isArray(manifestEntry)) {
    for (const item of manifestEntry) {
      const str = String(item).trim();
      if (!str) continue;
      if (str.startsWith("/")) {
        urlsSet.add(str);
      } else {
        const siraNum = parseInt(str, 10);
        if (!Number.isNaN(siraNum) && siraNum > 0) {
          urlsSet.add(getMp3Path(dialogueId, siraNum));
        } else {
          urlsSet.add(`/audio/dialogues/${dialogueId}/${str}.mp3`);
        }
      }
    }
  }

  // 2. Diyalog satırlarından tamamlayıcı kontrol
  if (dlg && Array.isArray(dlg.satirlar)) {
    for (const line of dlg.satirlar) {
      urlsSet.add(getMp3Path(dialogueId, line.sira));
    }
  }

  const urls = Array.from(urlsSet);
  const estimatedSizeMb = Number(
    Math.max(0.4, (urls.length * ESTIMATED_KB_PER_SENTENCE) / 1024).toFixed(1)
  );

  return { urls, estimatedSizeMb };
}

/**
 * Belirtilen diyaloğun tüm MP3 dosyalarının Cache API'de ("muallimun-offline-audio-v1")
 * kayıtlı olup olmadığını kontrol eder.
 */
export async function isDialogueOfflineReady(
  dialogueId: string
): Promise<boolean> {
  if (typeof window === "undefined" || !("caches" in window)) {
    return false;
  }
  try {
    const { urls } = await getDialogueAudioUrls(dialogueId);
    if (urls.length === 0) return false;

    const cache = await caches.open(OFFLINE_AUDIO_CACHE_NAME);
    let matchedCount = 0;
    for (const url of urls) {
      const match = await cache.match(url);
      if (match && match.ok) {
        matchedCount += 1;
      }
    }
    const isReady = matchedCount >= urls.length;
    const stored = readStoredOfflineList();
    if (isReady && !stored.includes(dialogueId)) {
      writeStoredOfflineList([...stored, dialogueId]);
    } else if (!isReady && stored.includes(dialogueId)) {
      writeStoredOfflineList(stored.filter((id) => id !== dialogueId));
    }
    return isReady;
  } catch {
    return readStoredOfflineList().includes(dialogueId);
  }
}

/**
 * İndirilmiş olan tüm diyalogların ID listesini döndürür.
 */
export async function getDownloadedDialogueIds(): Promise<string[]> {
  if (typeof window === "undefined" || !("caches" in window)) {
    return readStoredOfflineList();
  }
  try {
    const cache = await caches.open(OFFLINE_AUDIO_CACHE_NAME);
    const keys = await cache.keys();
    if (keys.length === 0) {
      writeStoredOfflineList([]);
      return [];
    }

    const cachedPaths = new Set<string>();
    for (const req of keys) {
      try {
        const u = new URL(req.url, window.location.origin);
        cachedPaths.add(u.pathname);
      } catch {
        // ignore
      }
    }

    const readyIds: string[] = [];
    for (const dlg of diyaloglar) {
      const { urls } = await getDialogueAudioUrls(dlg.id);
      if (urls.length > 0 && urls.every((u) => cachedPaths.has(u))) {
        readyIds.push(dlg.id);
      }
    }

    writeStoredOfflineList(readyIds);
    return readyIds;
  } catch {
    return readStoredOfflineList();
  }
}

/**
 * Bir diyaloğa ait tüm cümle MP3 dosyalarını "muallimun-offline-audio-v1" önbelleğine indirir.
 */
export async function downloadDialogueOfflinePack(
  dialogueId: string,
  onProgress?: (
    percent: number,
    completedCount: number,
    totalCount: number,
    estimatedSizeMb: number
  ) => void
): Promise<boolean> {
  if (typeof window === "undefined" || !("caches" in window)) {
    return false;
  }

  const { urls, estimatedSizeMb } = await getDialogueAudioUrls(dialogueId);
  if (urls.length === 0) return false;

  try {
    const cache = await caches.open(OFFLINE_AUDIO_CACHE_NAME);
    let completed = 0;
    onProgress?.(0, 0, urls.length, estimatedSizeMb);

    for (const url of urls) {
      const existing = await cache.match(url);
      if (!existing || !existing.ok) {
        const response = await fetch(url, { cache: "no-cache" });
        if (response.ok) {
          await cache.put(url, response.clone());
        }
      }
      completed += 1;
      const pct = Math.min(100, Math.round((completed / urls.length) * 100));
      onProgress?.(pct, completed, urls.length, estimatedSizeMb);
    }

    const stored = readStoredOfflineList();
    if (!stored.includes(dialogueId)) {
      writeStoredOfflineList([...stored, dialogueId]);
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Tüm 60 diyaloğun ses paketlerini sırayla çevrimdışı önbelleğe indirir.
 */
export async function downloadAllDialoguesOffline(
  onProgress?: (
    percent: number,
    completedDialogues: number,
    totalDialogues: number
  ) => void
): Promise<number> {
  const total = diyaloglar.length;
  let successCount = 0;
  onProgress?.(0, 0, total);

  for (let i = 0; i < total; i++) {
    const dlg = diyaloglar[i];
    const ok = await downloadDialogueOfflinePack(dlg.id);
    if (ok) successCount += 1;
    const pct = Math.min(100, Math.round(((i + 1) / total) * 100));
    onProgress?.(pct, i + 1, total);
  }

  return successCount;
}

/**
 * Çevrimdışı ses önbelleğini ("muallimun-offline-audio-v1") tamamen temizler.
 */
export async function clearOfflineAudioCache(): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    if ("caches" in window) {
      await caches.delete(OFFLINE_AUDIO_CACHE_NAME);
    }
  } catch {
    // ignore
  }
  writeStoredOfflineList([]);
}

/**
 * Oynatma sırasında URL çevrimdışı önbellekte ("muallimun-offline-audio-v1") varsa
 * internetsiz ortamda da kesintisiz çalışması için Blob URL döndürür.
 */
export async function resolveOfflineCachedAudioUrl(
  url: string
): Promise<string> {
  if (
    typeof window === "undefined" ||
    !("caches" in window) ||
    !url.startsWith("/")
  ) {
    return url;
  }
  try {
    const cache = await caches.open(OFFLINE_AUDIO_CACHE_NAME);
    const matched = await cache.match(url);
    if (matched && matched.ok) {
      const blob = await matched.blob();
      if (blob.size > 128) {
        return URL.createObjectURL(blob);
      }
    }
  } catch {
    // ignore
  }
  return url;
}
