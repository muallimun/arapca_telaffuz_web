"use client";

import { useEffect, useState } from "react";
import { Users, Calendar, Activity } from "lucide-react";

export interface VisitorStatsData {
  ok: boolean;
  totalUsers: number;
  todayUsers: number;
  totalSessions: number;
  totalUnique: number;
  todayVisits: number;
  totalViews: number;
}

const STORAGE_KEY_VISITOR_ID = "muallimun_visitor_id";
const STORAGE_KEY_SESSION_ID = "muallimun_session_id";
const STORAGE_KEY_LAST_SEEN_TS = "muallimun_last_seen_ts";
const STORAGE_KEY_KNOWN_TOTAL_USERS = "knownTotalUsers";
const STORAGE_KEY_KNOWN_TOTAL_SESSIONS = "knownTotalSessions";
const STORAGE_KEY_CACHE = "muallimun_cached_visitor_stats";
const STATS_EVENT_NAME = "muallimun-visitor-stats-updated";

const SESSION_IDLE_MS = 15 * 60 * 1000; // 15 dakika

const DEFAULT_FALLBACK_STATS: VisitorStatsData = {
  ok: true,
  totalUsers: 1,
  todayUsers: 1,
  totalSessions: 1,
  totalUnique: 1,
  todayVisits: 1,
  totalViews: 1,
};

let inFlightPostPromise: Promise<VisitorStatsData> | null = null;
let latestMemoryStats: VisitorStatsData | null = null;
let hasRegisteredThisPageLoad = false;

function generateUuid(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }
  return `v_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 10)}`;
}

function getOrCreateVisitorId(): string {
  try {
    let vid = localStorage.getItem(STORAGE_KEY_VISITOR_ID);
    if (!vid || vid.trim().length < 6) {
      vid = generateUuid();
      localStorage.setItem(STORAGE_KEY_VISITOR_ID, vid);
    }
    return vid;
  } catch {
    return "anon_visitor";
  }
}

function getOrCreateSessionId(): string {
  const now = Date.now();
  try {
    const lastTsRaw = localStorage.getItem(STORAGE_KEY_LAST_SEEN_TS);
    const lastTs = lastTsRaw ? Number(lastTsRaw) : 0;
    const isIdleExpired =
      Number.isFinite(lastTs) && lastTs > 0 && now - lastTs >= SESSION_IDLE_MS;

    let sid = sessionStorage.getItem(STORAGE_KEY_SESSION_ID);
    if (!sid || sid.trim().length < 6 || isIdleExpired) {
      sid = `s_${now.toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
      sessionStorage.setItem(STORAGE_KEY_SESSION_ID, sid);
    }
    localStorage.setItem(STORAGE_KEY_LAST_SEEN_TS, String(now));
    return sid;
  } catch {
    return `s_${now.toString(36)}`;
  }
}

function readKnownClientTotals(): {
  knownTotalUsers: number;
  knownTotalSessions: number;
} {
  let knownTotalUsers = 0;
  let knownTotalSessions = 0;
  if (typeof window === "undefined") {
    return { knownTotalUsers, knownTotalSessions };
  }
  try {
    const rawUsers = Number(
      localStorage.getItem(STORAGE_KEY_KNOWN_TOTAL_USERS) || 0
    );
    const rawSessions = Number(
      localStorage.getItem(STORAGE_KEY_KNOWN_TOTAL_SESSIONS) || 0
    );
    if (Number.isFinite(rawUsers) && rawUsers > 0) {
      knownTotalUsers = Math.floor(rawUsers);
    }
    if (Number.isFinite(rawSessions) && rawSessions > 0) {
      knownTotalSessions = Math.floor(rawSessions);
    }

    const rawCache = localStorage.getItem(STORAGE_KEY_CACHE);
    if (rawCache) {
      const parsed = JSON.parse(rawCache);
      const cachedUsers = Number(
        parsed?.totalUsers ?? parsed?.totalUnique ?? 0
      );
      const cachedSessions = Number(
        parsed?.totalSessions ?? parsed?.totalViews ?? 0
      );
      if (Number.isFinite(cachedUsers) && cachedUsers > knownTotalUsers) {
        knownTotalUsers = Math.floor(cachedUsers);
      }
      if (
        Number.isFinite(cachedSessions) &&
        cachedSessions > knownTotalSessions
      ) {
        knownTotalSessions = Math.floor(cachedSessions);
      }
    }
  } catch {
    // ignore storage errors
  }
  return { knownTotalUsers, knownTotalSessions };
}

function normalizeStatsPayload(
  raw: Record<string, unknown> | null | undefined
): VisitorStatsData | null {
  if (!raw || typeof raw !== "object") return null;
  const rawTotalUsers = Number(
    raw.totalUsers ?? raw.totalUnique ?? raw.uniqueTotal ?? 0
  );
  const rawTodayUsers = Number(
    raw.todayUsers ?? raw.todayVisits ?? raw.todayCount ?? 0
  );
  const rawTotalSessions = Number(
    raw.totalSessions ?? raw.totalViews ?? raw.totalVisits ?? 0
  );

  if (!Number.isFinite(rawTotalUsers) || rawTotalUsers <= 0) {
    return null;
  }

  const todayUsers = Math.max(1, Math.floor(rawTodayUsers || 1));
  const totalUsers = Math.max(todayUsers, Math.floor(rawTotalUsers || 1));
  const totalSessions = Math.max(
    totalUsers,
    todayUsers,
    Math.floor(rawTotalSessions || 1)
  );

  return {
    ok: true,
    totalUsers,
    todayUsers,
    totalSessions,
    totalUnique: totalUsers,
    todayVisits: todayUsers,
    totalViews: totalSessions,
  };
}

function persistStatsToLocalStorage(stats: VisitorStatsData): void {
  if (typeof window === "undefined") return;
  try {
    const prev = readKnownClientTotals();
    const bestUsers = Math.max(stats.totalUsers, prev.knownTotalUsers);
    const bestSessions = Math.max(stats.totalSessions, prev.knownTotalSessions);

    localStorage.setItem(STORAGE_KEY_KNOWN_TOTAL_USERS, String(bestUsers));
    localStorage.setItem(
      STORAGE_KEY_KNOWN_TOTAL_SESSIONS,
      String(bestSessions)
    );
    localStorage.setItem(
      STORAGE_KEY_CACHE,
      JSON.stringify({
        ...stats,
        totalUsers: bestUsers,
        totalUnique: bestUsers,
        totalSessions: bestSessions,
        totalViews: bestSessions,
      })
    );
  } catch {
    // ignore storage errors
  }
}

function readCachedStats(): VisitorStatsData {
  if (latestMemoryStats) return latestMemoryStats;
  if (typeof window === "undefined") return DEFAULT_FALLBACK_STATS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY_CACHE);
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const normalized = normalizeStatsPayload(parsed);
      if (normalized) return normalized;
    }
    const { knownTotalUsers, knownTotalSessions } = readKnownClientTotals();
    if (knownTotalUsers > 0) {
      const totalUsers = Math.max(1, knownTotalUsers);
      const totalSessions = Math.max(totalUsers, knownTotalSessions);
      return {
        ok: true,
        totalUsers,
        todayUsers: 1,
        totalSessions,
        totalUnique: totalUsers,
        todayVisits: 1,
        totalViews: totalSessions,
      };
    }
  } catch {
    // ignore storage errors
  }
  return DEFAULT_FALLBACK_STATS;
}

function broadcastStats(stats: VisitorStatsData): void {
  latestMemoryStats = stats;
  persistStatsToLocalStorage(stats);
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent<VisitorStatsData>(STATS_EVENT_NAME, { detail: stats })
    );
  }
}

/**
 * Her uygulama açılışında (tarayıcı kilidi olmadan!) POST /api/stats göndererek
 * visitorId, sessionId ve bilinen son toplam sayaçları sunucuyla senkronize eder.
 */
export async function registerVisitorSessionOnLoad(): Promise<VisitorStatsData> {
  if (typeof window === "undefined") return DEFAULT_FALLBACK_STATS;
  if (inFlightPostPromise) return inFlightPostPromise;

  inFlightPostPromise = (async () => {
    const visitorId = getOrCreateVisitorId();
    const sessionId = getOrCreateSessionId();
    const { knownTotalUsers, knownTotalSessions } = readKnownClientTotals();

    try {
      const res = await fetch("/api/stats", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
        },
        body: JSON.stringify({
          visitorId,
          sessionId,
          knownTotalUsers,
          knownTotalSessions,
        }),
        cache: "no-store",
      });
      if (res.ok) {
        const json = (await res.json()) as Record<string, unknown>;
        const normalized = normalizeStatsPayload(json);
        if (normalized) {
          hasRegisteredThisPageLoad = true;
          broadcastStats(normalized);
          return normalized;
        }
      }
    } catch {
      // Ağ hatasında önbellekteki son bilinen değere düş
    }

    const fallback = readCachedStats();
    latestMemoryStats = fallback;
    return fallback;
  })();

  try {
    return await inFlightPostPromise;
  } finally {
    inFlightPostPromise = null;
  }
}

/**
 * Kullanım Kılavuzu modalı veya "Hakkında" sekmesi açıldığında sayacı canlı yeniler.
 */
export async function refreshVisitorStatsLive(): Promise<VisitorStatsData> {
  if (typeof window === "undefined") return DEFAULT_FALLBACK_STATS;
  try {
    const { knownTotalUsers, knownTotalSessions } = readKnownClientTotals();
    if (!hasRegisteredThisPageLoad || knownTotalUsers > 0) {
      return await registerVisitorSessionOnLoad();
    }
    const res = await fetch("/api/stats", {
      method: "GET",
      cache: "no-store",
      headers: {
        "Cache-Control": "no-store",
      },
    });
    if (res.ok) {
      const json = (await res.json()) as Record<string, unknown>;
      const normalized = normalizeStatsPayload(json);
      if (normalized) {
        if (
          knownTotalUsers > normalized.totalUsers ||
          knownTotalSessions > normalized.totalSessions
        ) {
          return await registerVisitorSessionOnLoad();
        }
        broadcastStats(normalized);
        return normalized;
      }
    }
  } catch {
    // ignore network error
  }
  return readCachedStats();
}

interface VisitorCounterBadgeProps {
  variant?: "footer" | "modal";
}

export default function VisitorCounterBadge({
  variant = "footer",
}: VisitorCounterBadgeProps) {
  const [stats, setStats] = useState<VisitorStatsData>(DEFAULT_FALLBACK_STATS);

  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      setStats(readCachedStats());
    });

    const handleStatsUpdate = (e: Event) => {
      const custom = e as CustomEvent<VisitorStatsData>;
      if (custom.detail) {
        setStats(custom.detail);
      }
    };

    window.addEventListener(STATS_EVENT_NAME, handleStatsUpdate);

    const syncFn =
      variant === "modal"
        ? refreshVisitorStatsLive
        : registerVisitorSessionOnLoad;

    syncFn().then((fresh) => {
      if (fresh) {
        setStats(fresh);
      }
    });

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener(STATS_EVENT_NAME, handleStatsUpdate);
    };
  }, [variant]);

  const formattedUnique = stats.totalUsers.toLocaleString("tr-TR");
  const formattedToday = stats.todayUsers.toLocaleString("tr-TR");
  const formattedViews = stats.totalSessions.toLocaleString("tr-TR");

  if (variant === "modal") {
    return (
      <div className="p-3 sm:p-3.5 rounded-2xl bg-[#F7EFE1] dark:bg-[var(--background)] border-2 border-[#E6D7BE] dark:border-[var(--border)] space-y-2.5 overflow-hidden">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
            <span className="text-xs font-bold text-[#065F46] dark:text-emerald-300 uppercase tracking-wide">
              CANLI ZİYARETÇİ İSTATİSTİKLERİ
            </span>
          </div>
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 shrink-0">
            Canlı
          </span>
        </div>

        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          <div className="p-2.5 sm:p-3.5 rounded-xl bg-white dark:bg-[var(--surface)] border border-[#E6D7BE] dark:border-[var(--border)] text-center flex flex-col items-center justify-center gap-1 min-w-0">
            <span className="text-[10px] sm:text-xs font-bold text-[var(--muted)] leading-tight whitespace-nowrap">
              Toplam Kişi
            </span>
            <div className="flex items-center justify-center gap-1 text-[#065F46] dark:text-emerald-300">
              <Users className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0 opacity-85" />
              <span className="text-sm sm:text-lg font-black tabular-nums">
                {formattedUnique}
              </span>
            </div>
          </div>

          <div className="p-2.5 sm:p-3.5 rounded-xl bg-white dark:bg-[var(--surface)] border border-[#E6D7BE] dark:border-[var(--border)] text-center flex flex-col items-center justify-center gap-1 min-w-0">
            <span className="text-[10px] sm:text-xs font-bold text-[var(--muted)] leading-tight whitespace-nowrap">
              Bugün
            </span>
            <div className="flex items-center justify-center gap-1 text-[#6741D9] dark:text-indigo-300">
              <Calendar className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0 opacity-85" />
              <span className="text-sm sm:text-lg font-black tabular-nums">
                {formattedToday}
              </span>
            </div>
          </div>

          <div className="p-2.5 sm:p-3.5 rounded-xl bg-white dark:bg-[var(--surface)] border border-[#E6D7BE] dark:border-[var(--border)] text-center flex flex-col items-center justify-center gap-1 min-w-0">
            <span className="text-[10px] sm:text-xs font-bold text-[var(--muted)] leading-tight whitespace-nowrap">
              Toplam Oturum
            </span>
            <div className="flex items-center justify-center gap-1 text-amber-700 dark:text-amber-300">
              <Activity className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0 opacity-85" />
              <span className="text-sm sm:text-lg font-black tabular-nums">
                {formattedViews}
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      data-tooltip={`📊 Gerçek Ziyaretçi İstatistiği — Toplam Kişi: ${formattedUnique} | Bugün: ${formattedToday} | Toplam Oturum: ${formattedViews}`}
      data-tooltip-pos="top"
      className="inline-flex items-center divide-x divide-emerald-500/20 rounded-full bg-white dark:bg-slate-800 border border-[#E6D7BE] dark:border-slate-700 text-[11px] font-semibold text-[var(--foreground)] shadow-xs select-none whitespace-nowrap"
    >
      <div className="flex items-center gap-1.5 px-2.5 py-1">
        <span
          className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0"
          aria-hidden="true"
        />
        <span className="text-[var(--muted)]">Bugün</span>
        <span className="tabular-nums font-bold text-emerald-700 dark:text-emerald-300">
          {formattedToday}
        </span>
      </div>
      <div className="flex items-center gap-1 px-2.5 py-1">
        <Users className="w-3 h-3 text-[#6741D9] dark:text-indigo-400 shrink-0" />
        <span className="text-[var(--muted)]">Toplam</span>
        <span className="tabular-nums font-bold text-[#6741D9] dark:text-indigo-300">
          {formattedUnique}
        </span>
      </div>
    </div>
  );
}
