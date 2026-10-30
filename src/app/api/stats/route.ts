import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const GOOGLE_SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycbxnozrFJ9z1X2TMsO-S1TJm70bu-mreYtuOqU96Oyu_hArYspQaQPvv9rbNeRX8zaGt/exec";

const COUNTER_API_BASE = "https://api.counterapi.dev/v1/muallimun_arapca_app";

interface InMemoryStats {
  date: string;
  totalUnique: number;
  todayVisits: number;
  totalViews: number;
}

declare global {
  // eslint-disable-next-line no-var
  var __muallimunStats: InMemoryStats | undefined;
}

function getTodayDateString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getOrUpdateInMemoryStats(
  isUnique: boolean,
  isToday: boolean,
  isSession: boolean
): InMemoryStats {
  const todayStr = getTodayDateString();
  if (!globalThis.__muallimunStats) {
    globalThis.__muallimunStats = {
      date: todayStr,
      totalUnique: 1,
      todayVisits: 1,
      totalViews: 1,
    };
  }

  const mem = globalThis.__muallimunStats;
  if (mem.date !== todayStr) {
    mem.date = todayStr;
    mem.todayVisits = Math.max(1, isToday ? 1 : mem.todayVisits);
  } else if (isToday) {
    mem.todayVisits += 1;
  }

  if (isUnique) {
    mem.totalUnique += 1;
  }
  if (isSession) {
    mem.totalViews += 1;
  }

  mem.totalUnique = Math.max(1, mem.totalUnique);
  mem.todayVisits = Math.max(1, Math.min(mem.todayVisits, mem.totalUnique));
  mem.totalViews = Math.max(mem.totalUnique, mem.totalViews);

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

async function tryGoogleAppsScript(
  unique: string,
  today: string,
  session: string
): Promise<{ totalUnique: number; todayVisits: number; totalViews: number } | null> {
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
      return {
        totalUnique: Math.max(1, Math.floor(data.totalUnique)),
        todayVisits: Math.max(1, Math.floor(Number(data.todayVisits) || 1)),
        totalViews: Math.max(1, Math.floor(Number(data.totalViews) || 1)),
      };
    }
    return null;
  } catch {
    return null;
  }
}

async function hitOrReadCounterKey(
  key: string,
  increment: boolean
): Promise<number | null> {
  try {
    const suffix = increment ? "/up" : "/";
    const res = await fetchWithTimeout(`${COUNTER_API_BASE}/${key}${suffix}`, 3500);
    if (!res.ok) {
      // Eğer henüz oluşturulmamış bir anahtar okunuyorsa /up ile başlat
      if (!increment) {
        const initRes = await fetchWithTimeout(`${COUNTER_API_BASE}/${key}/up`, 3500);
        if (initRes.ok) {
          const initJson = await initRes.json();
          if (typeof initJson?.count === "number" && initJson.count > 0) {
            return initJson.count;
          }
        }
      }
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

async function tryCounterApi(
  isUnique: boolean,
  isToday: boolean,
  isSession: boolean
): Promise<{ totalUnique: number; todayVisits: number; totalViews: number } | null> {
  try {
    const todayKey = `visits_${getTodayDateString().replace(/-/g, "")}`;
    const [uniqueCount, todayCount, viewsCount] = await Promise.all([
      hitOrReadCounterKey("unique_visitors", isUnique),
      hitOrReadCounterKey(todayKey, isToday),
      hitOrReadCounterKey("total_visits", isSession),
    ]);

    if (uniqueCount === null && todayCount === null && viewsCount === null) {
      return null;
    }

    const validUnique = Math.max(1, uniqueCount ?? todayCount ?? 1);
    const validToday = Math.max(1, todayCount ?? 1);
    const validViews = Math.max(validUnique, viewsCount ?? validUnique);

    return {
      totalUnique: validUnique,
      todayVisits: validToday,
      totalViews: validViews,
    };
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const unique = searchParams.get("unique") === "1" ? "1" : "0";
  const today = searchParams.get("today") === "1" ? "1" : "0";
  const session = searchParams.get("session") === "1" ? "1" : "0";

  const isUnique = unique === "1";
  const isToday = today === "1";
  const isSession = session === "1";

  // 1. Sunucu belleğindeki kalıcı sayacı güncelle (her koşulda 200 OK garantisi)
  const memStats = getOrUpdateInMemoryStats(isUnique, isToday, isSession);

  // 2. Paralel olarak CounterAPI ve Google Apps Script'i dene (3500ms timeout)
  const [counterData, gasData] = await Promise.all([
    tryCounterApi(isUnique, isToday, isSession),
    tryGoogleAppsScript(unique, today, session),
  ]);

  const finalTotalUnique = Math.max(
    memStats.totalUnique,
    counterData?.totalUnique ?? 0,
    gasData?.totalUnique ?? 0
  );
  const finalTodayVisits = Math.max(
    memStats.todayVisits,
    counterData?.todayVisits ?? 0,
    gasData?.todayVisits ?? 0
  );
  const finalTotalViews = Math.max(
    finalTotalUnique,
    memStats.totalViews,
    counterData?.totalViews ?? 0,
    gasData?.totalViews ?? 0
  );

  // Bellek içi sayacı da en yüksek gerçek değerlerle senkronize et
  memStats.totalUnique = finalTotalUnique;
  memStats.todayVisits = finalTodayVisits;
  memStats.totalViews = finalTotalViews;

  return NextResponse.json(
    {
      ok: true,
      totalUnique: finalTotalUnique,
      todayVisits: finalTodayVisits,
      totalViews: finalTotalViews,
    },
    {
      status: 200,
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    }
  );
}
