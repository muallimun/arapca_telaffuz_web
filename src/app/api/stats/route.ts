import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";

export const dynamic = "force-dynamic";

const PRIMARY_STATS_FILE = "/var/tmp/muallimun-visitor-stats.json";
const BACKUP_STATS_FILE = path.join(
  process.cwd(),
  ".muallimun-visitor-stats.json"
);

const GOOGLE_SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycbxnozrFJ9z1X2TMsO-S1TJm70bu-mreYtuOqU96Oyu_hArYspQaQPvv9rbNeRX8zaGt/exec";

const COUNTER_API_BASE = "https://api.counterapi.dev/v1/muallimun_arapca_app";

const SESSION_IDLE_TIMEOUT_MS = 15 * 60 * 1000; // 15 dakika
const MAX_TRACKED_VISITORS = 10_000;
const MAX_CLIENT_SANITY_LIMIT = 10_000_000;

interface VisitorSeenRecord {
  lastSessionId: string;
  lastTimestamp: number;
}

interface PersistentStatsStore {
  dateKey: string;
  totalUsers: number;
  todayUsers: number;
  totalSessions: number;
  knownVisitorIds: string[];
  todayVisitorIds: string[];
  visitorLastSeen: Record<string, VisitorSeenRecord>;
}

declare global {
  var __muallimunPersistentStats: PersistentStatsStore | undefined;
}

export function getIstanbulDateKey(): string {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Istanbul",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date());
    const year = parts.find((p) => p.type === "year")?.value ?? "2026";
    const month = parts.find((p) => p.type === "month")?.value ?? "01";
    const day = parts.find((p) => p.type === "day")?.value ?? "01";
    return `${year}-${month}-${day}`;
  } catch {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
}

function createInitialStore(todayKey: string): PersistentStatsStore {
  return {
    dateKey: todayKey,
    totalUsers: 1,
    todayUsers: 1,
    totalSessions: 1,
    knownVisitorIds: [],
    todayVisitorIds: [],
    visitorLastSeen: {},
  };
}

function readStoreFromFile(filePath: string): PersistentStatsStore | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, "utf8");
    if (!raw || !raw.trim()) return null;
    const parsed = JSON.parse(raw) as Partial<PersistentStatsStore> & {
      totalUnique?: number;
      todayVisits?: number;
      totalViews?: number;
    };
    if (!parsed || typeof parsed !== "object") return null;

    const todayKey = getIstanbulDateKey();
    const rawTotalUsers = Number(
      parsed.totalUsers ?? parsed.totalUnique ?? 1
    );
    const rawTodayUsers = Number(
      parsed.todayUsers ?? parsed.todayVisits ?? 1
    );
    const rawTotalSessions = Number(
      parsed.totalSessions ?? parsed.totalViews ?? 1
    );

    const totalUsers =
      Number.isFinite(rawTotalUsers) && rawTotalUsers > 0
        ? Math.floor(rawTotalUsers)
        : 1;
    const todayUsers =
      Number.isFinite(rawTodayUsers) && rawTodayUsers >= 0
        ? Math.floor(rawTodayUsers)
        : 1;
    const totalSessions =
      Number.isFinite(rawTotalSessions) && rawTotalSessions > 0
        ? Math.floor(rawTotalSessions)
        : Math.max(1, totalUsers);

    const knownVisitorIds = Array.isArray(parsed.knownVisitorIds)
      ? parsed.knownVisitorIds.filter((x): x is string => typeof x === "string")
      : [];
    const todayVisitorIds = Array.isArray(parsed.todayVisitorIds)
      ? parsed.todayVisitorIds.filter((x): x is string => typeof x === "string")
      : [];
    const visitorLastSeen =
      parsed.visitorLastSeen &&
      typeof parsed.visitorLastSeen === "object" &&
      !Array.isArray(parsed.visitorLastSeen)
        ? parsed.visitorLastSeen
        : {};

    return {
      dateKey: typeof parsed.dateKey === "string" ? parsed.dateKey : todayKey,
      totalUsers,
      todayUsers: Math.max(1, todayUsers),
      totalSessions: Math.max(totalSessions, totalUsers),
      knownVisitorIds,
      todayVisitorIds,
      visitorLastSeen,
    };
  } catch {
    return null;
  }
}

function saveStoreToDisk(store: PersistentStatsStore): void {
  const serialized = JSON.stringify(store, null, 2);
  for (const targetPath of [PRIMARY_STATS_FILE, BACKUP_STATS_FILE]) {
    try {
      const dir = path.dirname(targetPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(targetPath, serialized, "utf8");
    } catch {
      // Yazılamayan dizini atla, diğer yedek dizin veya bellek kullanılır
    }
  }
}

function loadMergedPersistentStore(): PersistentStatsStore {
  const todayKey = getIstanbulDateKey();
  const primary = readStoreFromFile(PRIMARY_STATS_FILE);
  const backup = readStoreFromFile(BACKUP_STATS_FILE);
  const mem = globalThis.__muallimunPersistentStats ?? null;

  const sources = [primary, backup, mem].filter(
    (s): s is PersistentStatsStore => s !== null
  );

  if (sources.length === 0) {
    const initial = createInitialStore(todayKey);
    globalThis.__muallimunPersistentStats = initial;
    saveStoreToDisk(initial);
    return initial;
  }

  const mergedKnownSet = new Set<string>();
  const mergedTodaySet = new Set<string>();
  const mergedLastSeen: Record<string, VisitorSeenRecord> = {};

  let maxTotalUsers = 1;
  let maxTodayUsers = 0;
  let maxTotalSessions = 1;

  for (const src of sources) {
    maxTotalUsers = Math.max(maxTotalUsers, src.totalUsers || 1);
    maxTotalSessions = Math.max(maxTotalSessions, src.totalSessions || 1);
    for (const id of src.knownVisitorIds || []) {
      mergedKnownSet.add(id);
    }
    if (src.dateKey === todayKey) {
      maxTodayUsers = Math.max(maxTodayUsers, src.todayUsers || 0);
      for (const id of src.todayVisitorIds || []) {
        mergedTodaySet.add(id);
      }
    }
    for (const [vid, rec] of Object.entries(src.visitorLastSeen || {})) {
      const existing = mergedLastSeen[vid];
      if (!existing || (rec?.lastTimestamp ?? 0) > existing.lastTimestamp) {
        mergedLastSeen[vid] = rec;
      }
    }
  }

  const finalKnownIds = Array.from(mergedKnownSet).slice(-MAX_TRACKED_VISITORS);
  const finalTodayIds = Array.from(mergedTodaySet).slice(-MAX_TRACKED_VISITORS);

  const todayUsers = Math.max(1, maxTodayUsers, finalTodayIds.length);
  const totalUsers = Math.max(maxTotalUsers, finalKnownIds.length, todayUsers);
  const totalSessions = Math.max(maxTotalSessions, totalUsers, todayUsers);

  const merged: PersistentStatsStore = {
    dateKey: todayKey,
    totalUsers,
    todayUsers,
    totalSessions,
    knownVisitorIds: finalKnownIds,
    todayVisitorIds: finalTodayIds,
    visitorLastSeen: mergedLastSeen,
  };

  globalThis.__muallimunPersistentStats = merged;
  return merged;
}

async function fetchWithTimeout(
  url: string,
  timeoutMs = 2200
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      method: "GET",
      redirect: "follow",
      cache: "no-store",
      signal: controller.signal,
      headers: {
        Accept: "application/json",
      },
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

async function hitOrReadCounterKey(
  key: string,
  increment: boolean
): Promise<number | null> {
  try {
    const suffix = increment ? "/up" : "/";
    const res = await fetchWithTimeout(
      `${COUNTER_API_BASE}/${key}${suffix}`,
      2200
    );
    if (!res.ok) return null;
    const json = await res.json();
    if (typeof json?.count === "number" && json.count > 0) {
      return json.count;
    }
    return null;
  } catch {
    return null;
  }
}

async function syncExternalCounters(
  incUnique: boolean,
  incToday: boolean,
  incSession: boolean
): Promise<{
  totalUsers: number;
  todayUsers: number;
  totalSessions: number;
} | null> {
  try {
    const todayKey = getIstanbulDateKey().replace(/-/g, "_");
    const uniqueFlag = incUnique ? "1" : "0";
    const todayFlag = incToday ? "1" : "0";
    const sessionFlag = incSession ? "1" : "0";

    const [counterRes, gasRes] = await Promise.all([
      (async () => {
        const [u, d, s] = await Promise.all([
          hitOrReadCounterKey("unique_visitors", incUnique),
          hitOrReadCounterKey(`daily_${todayKey}`, incToday),
          hitOrReadCounterKey("study_sessions", incSession),
        ]);
        if (u === null && d === null && s === null) return null;
        return {
          totalUsers: u ?? 0,
          todayUsers: d ?? 0,
          totalSessions: s ?? 0,
        };
      })(),
      (async () => {
        try {
          const targetUrl = `${GOOGLE_SCRIPT_URL}?action=hit&unique=${uniqueFlag}&today=${todayFlag}&session=${sessionFlag}`;
          const res = await fetchWithTimeout(targetUrl, 2200);
          if (!res.ok) return null;
          const text = await res.text();
          if (!text || text.trim().startsWith("<")) return null;
          const data = JSON.parse(text);
          if (data && typeof data.totalUnique === "number") {
            return {
              totalUsers: Math.max(0, Math.floor(Number(data.totalUnique) || 0)),
              todayUsers: Math.max(0, Math.floor(Number(data.todayVisits) || 0)),
              totalSessions: Math.max(
                0,
                Math.floor(Number(data.totalViews) || 0)
              ),
            };
          }
          return null;
        } catch {
          return null;
        }
      })(),
    ]);

    if (!counterRes && !gasRes) return null;
    return {
      totalUsers: Math.max(counterRes?.totalUsers ?? 0, gasRes?.totalUsers ?? 0),
      todayUsers: Math.max(counterRes?.todayUsers ?? 0, gasRes?.todayUsers ?? 0),
      totalSessions: Math.max(
        counterRes?.totalSessions ?? 0,
        gasRes?.totalSessions ?? 0
      ),
    };
  } catch {
    return null;
  }
}

function buildStatsJsonResponse(store: PersistentStatsStore) {
  const todayUsers = Math.max(1, store.todayUsers);
  const totalUsers = Math.max(store.totalUsers, todayUsers);
  const totalSessions = Math.max(store.totalSessions, totalUsers, todayUsers);

  return NextResponse.json(
    {
      ok: true,
      totalUsers,
      todayUsers,
      totalSessions,
      uniqueTotal: totalUsers,
      todayCount: todayUsers,
      totalVisits: totalSessions,
      totalUnique: totalUsers,
      todayVisits: todayUsers,
      totalViews: totalSessions,
    },
    {
      status: 200,
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
        Pragma: "no-cache",
      },
    }
  );
}

/**
 * GET /api/stats — Salt okunur (Read-Only): Sayaçları artırmadan en güncel istatistikleri döndürür.
 */
export async function GET() {
  const store = loadMergedPersistentStore();
  const ext = await syncExternalCounters(false, false, false);
  if (ext) {
    let changed = false;
    if (ext.todayUsers > store.todayUsers) {
      store.todayUsers = ext.todayUsers;
      changed = true;
    }
    if (ext.totalUsers > store.totalUsers) {
      store.totalUsers = ext.totalUsers;
      changed = true;
    }
    if (ext.totalSessions > store.totalSessions) {
      store.totalSessions = ext.totalSessions;
      changed = true;
    }
    store.totalUsers = Math.max(store.totalUsers, store.todayUsers);
    store.totalSessions = Math.max(
      store.totalSessions,
      store.totalUsers,
      store.todayUsers
    );
    if (changed) {
      saveStoreToDisk(store);
    }
  }
  return buildStatsJsonResponse(store);
}

/**
 * POST /api/stats — Ziyaretçi kimliği (visitorId), sekme oturumu (sessionId) ve
 * istemcinin bildiği son sayaç yedeklerini (knownTotalUsers, knownTotalSessions) işler.
 */
export async function POST(req: NextRequest) {
  const store = loadMergedPersistentStore();
  const todayKey = getIstanbulDateKey();
  const now = Date.now();

  if (store.dateKey !== todayKey) {
    store.dateKey = todayKey;
    store.todayVisitorIds = [];
    store.todayUsers = 0;
  }

  let visitorId = "";
  let sessionId = "";
  let clientKnownTotalUsers = 0;
  let clientKnownTotalSessions = 0;
  let legacyUnique = req.nextUrl.searchParams.get("unique") === "1";
  let legacyToday = req.nextUrl.searchParams.get("today") === "1";
  let legacySession = req.nextUrl.searchParams.get("session") === "1";

  try {
    const body = (await req.json()) as Record<string, unknown>;
    if (body && typeof body === "object") {
      if (typeof body.visitorId === "string") {
        visitorId = body.visitorId.trim().slice(0, 128);
      }
      if (typeof body.sessionId === "string") {
        sessionId = body.sessionId.trim().slice(0, 128);
      }
      if (
        typeof body.knownTotalUsers === "number" &&
        Number.isFinite(body.knownTotalUsers) &&
        body.knownTotalUsers > 0 &&
        body.knownTotalUsers <= MAX_CLIENT_SANITY_LIMIT
      ) {
        clientKnownTotalUsers = Math.floor(body.knownTotalUsers);
      }
      if (
        typeof body.knownTotalSessions === "number" &&
        Number.isFinite(body.knownTotalSessions) &&
        body.knownTotalSessions > 0 &&
        body.knownTotalSessions <= MAX_CLIENT_SANITY_LIMIT
      ) {
        clientKnownTotalSessions = Math.floor(body.knownTotalSessions);
      }
      if (body.unique === "1" || body.unique === true || body.unique === 1) {
        legacyUnique = true;
      }
      if (body.today === "1" || body.today === true || body.today === 1) {
        legacyToday = true;
      }
      if (body.session === "1" || body.session === true || body.session === 1) {
        legacySession = true;
      }
    }
  } catch {
    // Boş gövde veya query param desteklenir
  }

  // 1. Deploy Sonrası Sıfırlanma Koruması:
  // Sunucu yeni deploy/restart sonrası sıfırlanmışsa istemcinin bildiği son toplam değerlerden devam et!
  if (clientKnownTotalUsers > store.totalUsers) {
    store.totalUsers = Math.max(store.totalUsers, clientKnownTotalUsers);
  }
  if (clientKnownTotalSessions > store.totalSessions) {
    store.totalSessions = Math.max(store.totalSessions, clientKnownTotalSessions);
  }

  // 2. "Toplam Kişi", "Bugün" ve "Toplam Oturum" Ayrımı:
  let isNewUniqueVisitor = false;
  let isNewTodayVisitor = false;
  let isNewSessionVisit = false;

  if (visitorId) {
    const knownSet = new Set(store.knownVisitorIds);
    const todaySet = new Set(store.todayVisitorIds);
    const prevSeen = store.visitorLastSeen[visitorId];

    // a) Toplam Kişi (totalUsers): Yalnızca bu visitorId ilk kez geldiğinde +1 artar
    if (!knownSet.has(visitorId)) {
      isNewUniqueVisitor = true;
      knownSet.add(visitorId);
      store.knownVisitorIds = Array.from(knownSet).slice(-MAX_TRACKED_VISITORS);
      store.totalUsers += 1;
    }

    // b) Bugün (todayUsers): İstanbul gününe göre bu visitorId bugün ilk kez geldiğinde +1 artar
    if (!todaySet.has(visitorId)) {
      isNewTodayVisitor = true;
      todaySet.add(visitorId);
      store.todayVisitorIds = Array.from(todaySet).slice(-MAX_TRACKED_VISITORS);
      store.todayUsers = Math.max(store.todayUsers + 1, todaySet.size);
    }

    // c) Toplam Oturum (totalSessions): Yeni sekme (sessionId değişimi) veya son ziyaretten >= 15 dk geçtiğinde +1 artar
    const elapsedSinceLastSeen = prevSeen
      ? now - (prevSeen.lastTimestamp || 0)
      : Number.POSITIVE_INFINITY;
    const isDifferentSession =
      Boolean(sessionId) && (!prevSeen || prevSeen.lastSessionId !== sessionId);
    const isExpiredIdle = elapsedSinceLastSeen >= SESSION_IDLE_TIMEOUT_MS;

    if (isNewUniqueVisitor || isDifferentSession || isExpiredIdle) {
      isNewSessionVisit = true;
      store.totalSessions += 1;
    }

    store.visitorLastSeen[visitorId] = {
      lastSessionId: sessionId || prevSeen?.lastSessionId || "default",
      lastTimestamp: now,
    };
  } else {
    // Legacy istemci回退 (visitorId gönderilmeyen durumlar)
    if (legacyUnique) {
      isNewUniqueVisitor = true;
      store.totalUsers += 1;
    }
    if (legacyToday || legacyUnique) {
      isNewTodayVisitor = true;
      store.todayUsers += 1;
    }
    if (legacySession || legacyUnique) {
      isNewSessionVisit = true;
      store.totalSessions += 1;
    }
  }

  // Harici sayaçlarla da senkronize et
  const ext = await syncExternalCounters(
    isNewUniqueVisitor,
    isNewTodayVisitor,
    isNewSessionVisit
  );
  if (ext) {
    if (ext.todayUsers > store.todayUsers) {
      store.todayUsers = ext.todayUsers;
    }
    if (ext.totalUsers > store.totalUsers) {
      store.totalUsers = ext.totalUsers;
    }
    if (ext.totalSessions > store.totalSessions) {
      store.totalSessions = ext.totalSessions;
    }
  }

  // Değişmez kurallar: Toplam Kişi >= Bugün ve Toplam Oturum >= Toplam Kişi >= Bugün
  store.todayUsers = Math.max(1, store.todayUsers);
  store.totalUsers = Math.max(
    1,
    store.totalUsers,
    clientKnownTotalUsers,
    store.todayUsers
  );
  store.totalSessions = Math.max(
    store.totalSessions,
    clientKnownTotalSessions,
    store.totalUsers,
    store.todayUsers
  );

  globalThis.__muallimunPersistentStats = store;
  saveStoreToDisk(store);

  return buildStatsJsonResponse(store);
}
