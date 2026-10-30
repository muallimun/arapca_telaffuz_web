import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const GOOGLE_SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycbxnozrFJ9z1X2TMsO-S1TJm70bu-mreYtuOqU96Oyu_hArYspQaQPvv9rbNeRX8zaGt/exec";

const COUNTER_API_BASE = "https://api.counterapi.dev/v1/muallimun_arapca_app";

interface InMemoryStats {
  dateKey: string;
  totalUnique: number;
  todayVisits: number;
  totalViews: number;
}

declare global {
  var __muallimunStats: InMemoryStats | undefined;
}

function getIstanbulDateKey(): string {
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
    return `${year}_${month}_${day}`;
  } catch {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return `${year}_${month}_${day}`;
  }
}

function getOrUpdateInMemoryStats(
  isUnique: boolean,
  isToday: boolean,
  isSession: boolean
): InMemoryStats {
  const todayKey = getIstanbulDateKey();
  if (!globalThis.__muallimunStats) {
    globalThis.__muallimunStats = {
      dateKey: todayKey,
      totalUnique: 1,
      todayVisits: 1,
      totalViews: 1,
    };
  }

  const mem = globalThis.__muallimunStats;
  if (mem.dateKey !== todayKey) {
    mem.dateKey = todayKey;
    mem.todayVisits = 1;
  } else if (isToday || isUnique) {
    mem.todayVisits += 1;
  }

  if (isUnique) {
    mem.totalUnique += 1;
  }
  if (isSession) {
    mem.totalViews += 1;
  }

  mem.todayVisits = Math.max(1, mem.todayVisits);
  mem.totalUnique = Math.max(mem.totalUnique, mem.todayVisits);
  mem.totalViews = Math.max(mem.totalViews, mem.totalUnique);

  return mem;
}

async function fetchWithTimeout(
  url: string,
  timeoutMs = 3500
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

const STATS_RATE_WINDOW_MS = 60_000;
const STATS_MAX_POST_PER_MIN = 10;
const MAX_MAP_SIZE = 2000;
const statsIpTimestamps = new Map<string, number[]>();

function getClientIp(req: NextRequest): string {
  const forwardedFor = req.headers.get("x-forwarded-for");
  if (forwardedFor) {
    const firstIp = forwardedFor.split(",")[0]?.trim();
    if (firstIp) return firstIp;
  }
  const realIp = req.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;
  return "unknown";
}

function isStatsPostRateLimited(ip: string): boolean {
  const now = Date.now();
  const timestamps = statsIpTimestamps.get(ip) ?? [];
  const recent = timestamps.filter((ts) => now - ts < STATS_RATE_WINDOW_MS);

  if (recent.length >= STATS_MAX_POST_PER_MIN) {
    statsIpTimestamps.set(ip, recent);
    return true;
  }

  recent.push(now);
  statsIpTimestamps.set(ip, recent);

  if (statsIpTimestamps.size > MAX_MAP_SIZE) {
    for (const [key, list] of statsIpTimestamps.entries()) {
      if (list.every((ts) => now - ts >= STATS_RATE_WINDOW_MS)) {
        statsIpTimestamps.delete(key);
      }
    }
    if (statsIpTimestamps.size > MAX_MAP_SIZE) {
      const oldestKey = statsIpTimestamps.keys().next().value;
      if (oldestKey) statsIpTimestamps.delete(oldestKey);
    }
  }

  return false;
}

async function hitOrReadCounterKey(
  key: string,
  increment: boolean
): Promise<number | null> {
  try {
    const suffix = increment ? "/up" : "/";
    const res = await fetchWithTimeout(
      `${COUNTER_API_BASE}/${key}${suffix}`,
      3500
    );
    if (!res.ok) {
      return null;
    }
    const json = await res.json();
    if (typeof json?.count === "number" && json.count > 0) {
      return json.count;
    }
    return null;
  } catch {
    return null;
  }
}

async function tryCounterApiThreeKeys(
  isUnique: boolean,
  isToday: boolean,
  isSession: boolean
): Promise<{
  totalUnique: number;
  todayVisits: number;
  totalViews: number;
} | null> {
  try {
    const todayKey = getIstanbulDateKey();
    const [uniqueCount, dailyCount, sessionCount] = await Promise.all([
      hitOrReadCounterKey("unique_visitors", isUnique),
      hitOrReadCounterKey(`daily_${todayKey}`, isToday || isUnique),
      hitOrReadCounterKey("study_sessions", isSession),
    ]);

    if (
      uniqueCount === null &&
      dailyCount === null &&
      sessionCount === null
    ) {
      return null;
    }

    const todayVisits = Math.max(1, dailyCount ?? 1);
    const totalUnique = Math.max(uniqueCount ?? 1, todayVisits);
    const totalViews = Math.max(sessionCount ?? 1, totalUnique);

    return {
      totalUnique,
      todayVisits,
      totalViews,
    };
  } catch {
    return null;
  }
}

async function tryGoogleAppsScript(
  unique: string,
  today: string,
  session: string
): Promise<{
  totalUnique: number;
  todayVisits: number;
  totalViews: number;
} | null> {
  try {
    const targetUrl = `${GOOGLE_SCRIPT_URL}?action=hit&unique=${unique}&today=${today}&session=${session}`;
    const res = await fetchWithTimeout(targetUrl, 3500);
    if (!res.ok) return null;
    const text = await res.text();
    if (!text || text.trim().startsWith("<")) return null;
    const data = JSON.parse(text);
    if (
      data &&
      typeof data.totalUnique === "number" &&
      data.totalUnique > 0
    ) {
      const todayVisits = Math.max(1, Math.floor(Number(data.todayVisits) || 1));
      const totalUnique = Math.max(Math.floor(data.totalUnique), todayVisits);
      const totalViews = Math.max(
        Math.floor(Number(data.totalViews) || 1),
        totalUnique
      );
      return {
        totalUnique,
        todayVisits,
        totalViews,
      };
    }
    return null;
  } catch {
    return null;
  }
}

async function resolveStatsResponse(
  isUnique: boolean,
  isToday: boolean,
  isSession: boolean
) {
  const unique = isUnique ? "1" : "0";
  const today = isToday ? "1" : "0";
  const session = isSession ? "1" : "0";

  const memStats = getOrUpdateInMemoryStats(isUnique, isToday, isSession);

  const [counterData, gasData] = await Promise.all([
    tryCounterApiThreeKeys(isUnique, isToday, isSession),
    tryGoogleAppsScript(unique, today, session),
  ]);

  const resolvedTodayVisits =
    counterData?.todayVisits ??
    gasData?.todayVisits ??
    memStats.todayVisits;

  const resolvedTotalUnique = Math.max(
    counterData?.totalUnique ?? 0,
    gasData?.totalUnique ?? 0,
    memStats.totalUnique,
    resolvedTodayVisits
  );

  const resolvedTotalViews = Math.max(
    counterData?.totalViews ?? 0,
    gasData?.totalViews ?? 0,
    memStats.totalViews,
    resolvedTotalUnique
  );

  memStats.todayVisits = resolvedTodayVisits;
  memStats.totalUnique = resolvedTotalUnique;
  memStats.totalViews = resolvedTotalViews;

  return NextResponse.json(
    {
      ok: true,
      totalUnique: resolvedTotalUnique,
      todayVisits: resolvedTodayVisits,
      totalViews: resolvedTotalViews,
    },
    {
      status: 200,
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    }
  );
}

/**
 * GET /api/stats — Salt okunur (Read-Only): Sayaçları artırmadan mevcut istatistikleri döndürür.
 */
export async function GET() {
  return resolveStatsResponse(false, false, false);
}

/**
 * POST /api/stats — Yeni tekil cihaz, günlük ziyaret veya oturum artışını kaydeder (IP hız sınırlı).
 */
export async function POST(req: NextRequest) {
  const clientIp = getClientIp(req);
  if (isStatsPostRateLimited(clientIp)) {
    return resolveStatsResponse(false, false, false);
  }

  let unique = req.nextUrl.searchParams.get("unique") === "1";
  let today = req.nextUrl.searchParams.get("today") === "1";
  let session = req.nextUrl.searchParams.get("session") === "1";

  try {
    const body = (await req.json()) as Record<string, unknown>;
    if (body && typeof body === "object") {
      if (body.unique === "1" || body.unique === true || body.unique === 1) {
        unique = true;
      }
      if (body.today === "1" || body.today === true || body.today === 1) {
        today = true;
      }
      if (body.session === "1" || body.session === true || body.session === 1) {
        session = true;
      }
    }
  } catch {
    // Query param veya boş gövde kabul edilir
  }

  return resolveStatsResponse(unique, today, session);
}
