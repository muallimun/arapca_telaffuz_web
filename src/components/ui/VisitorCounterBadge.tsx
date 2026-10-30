"use client";

import { useEffect, useState } from "react";
import { Users, Calendar, Activity } from "lucide-react";

export interface VisitorStatsData {
  ok: boolean;
  totalUnique: number;
  todayVisits: number;
  totalViews: number;
}

const STORAGE_KEY_UNIQUE = "muallimun_visitor_registered";
const STORAGE_KEY_LAST_DATE = "muallimun_last_visit_date";
const STORAGE_KEY_SESSION = "muallimun_session_counted";
const STORAGE_KEY_CACHE = "muallimun_cached_visitor_stats";
const STATS_EVENT_NAME = "muallimun-visitor-stats-updated";

const DEFAULT_FALLBACK_STATS: VisitorStatsData = {
  ok: true,
  totalUnique: 1,
  todayVisits: 1,
  totalViews: 1,
};

let inFlightPromise: Promise<VisitorStatsData> | null = null;
let latestMemoryStats: VisitorStatsData | null = null;

function getTodayDateString(): string {
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

function readCachedStats(): VisitorStatsData {
  if (latestMemoryStats) return latestMemoryStats;
  if (typeof window === "undefined") return DEFAULT_FALLBACK_STATS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY_CACHE);
    if (!raw) return DEFAULT_FALLBACK_STATS;
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed.totalUnique === "number" &&
      parsed.totalUnique > 0
    ) {
      const todayVisits = Math.max(1, Number(parsed.todayVisits) || 1);
      const totalUnique = Math.max(todayVisits, Number(parsed.totalUnique) || 1);
      const totalViews = Math.max(totalUnique, Number(parsed.totalViews) || 1);
      return {
        ok: true,
        totalUnique,
        todayVisits,
        totalViews,
      };
    }
  } catch {
    // ignore storage errors
  }
  return DEFAULT_FALLBACK_STATS;
}

async function fetchAndRegisterVisitorStats(): Promise<VisitorStatsData> {
  if (typeof window === "undefined") return DEFAULT_FALLBACK_STATS;
  if (inFlightPromise) return inFlightPromise;

  inFlightPromise = (async () => {
    const todayStr = getTodayDateString();
    let isNewUnique = false;
    let isNewToday = false;
    let isNewSession = false;

    try {
      isNewUnique = !localStorage.getItem(STORAGE_KEY_UNIQUE);
      isNewToday = localStorage.getItem(STORAGE_KEY_LAST_DATE) !== todayStr;
    } catch {
      // ignore localStorage restrictions
    }

    try {
      isNewSession = !sessionStorage.getItem(STORAGE_KEY_SESSION);
    } catch {
      // ignore sessionStorage restrictions
    }

    const uniqueParam = isNewUnique ? "1" : "0";
    const todayParam = isNewToday ? "1" : "0";
    const sessionParam = isNewSession ? "1" : "0";
    const shouldIncrement = isNewUnique || isNewToday || isNewSession;

    let result: VisitorStatsData | null = null;

    try {
      const res = shouldIncrement
        ? await fetch("/api/stats", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              unique: uniqueParam,
              today: todayParam,
              session: sessionParam,
            }),
            cache: "no-store",
          })
        : await fetch("/api/stats", {
            method: "GET",
            cache: "no-store",
          });
      if (res.ok) {
        const json = await res.json();
        if (json && typeof json.totalUnique === "number" && json.totalUnique > 0) {
          const todayVisits = Math.max(1, Number(json.todayVisits) || 1);
          const totalUnique = Math.max(todayVisits, Number(json.totalUnique) || 1);
          const totalViews = Math.max(totalUnique, Number(json.totalViews) || 1);
          result = {
            ok: true,
            totalUnique,
            todayVisits,
            totalViews,
          };
        }
      }
    } catch {
      // ignore network error and fall back to cached stats
    }

    if (result && result.ok) {
      try {
        if (isNewUnique) {
          localStorage.setItem(STORAGE_KEY_UNIQUE, "true");
        }
        if (isNewToday) {
          localStorage.setItem(STORAGE_KEY_LAST_DATE, todayStr);
        }
        localStorage.setItem(STORAGE_KEY_CACHE, JSON.stringify(result));
      } catch {
        // ignore storage errors
      }

      try {
        if (isNewSession) {
          sessionStorage.setItem(STORAGE_KEY_SESSION, "true");
        }
      } catch {
        // ignore sessionStorage errors
      }

      latestMemoryStats = result;
      window.dispatchEvent(
        new CustomEvent<VisitorStatsData>(STATS_EVENT_NAME, { detail: result })
      );
      return result;
    }

    const fallback = readCachedStats();
    latestMemoryStats = fallback;
    return fallback;
  })();

  try {
    return await inFlightPromise;
  } finally {
    inFlightPromise = null;
  }
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

    fetchAndRegisterVisitorStats().then((fresh) => {
      if (fresh) {
        setStats(fresh);
      }
    });

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener(STATS_EVENT_NAME, handleStatsUpdate);
    };
  }, []);

  const formattedUnique = stats.totalUnique.toLocaleString("tr-TR");
  const formattedToday = stats.todayVisits.toLocaleString("tr-TR");
  const formattedViews = stats.totalViews.toLocaleString("tr-TR");

  if (variant === "modal") {
    return (
      <div className="p-3 sm:p-3.5 rounded-2xl bg-[#F7EFE1] dark:bg-[var(--background)] border-2 border-[#E6D7BE] dark:border-[var(--border)] space-y-2.5 overflow-hidden">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
            <span className="text-xs font-bold text-[#087F5B] dark:text-emerald-300 uppercase tracking-wide">
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
            <div className="flex items-center justify-center gap-1 text-[#087F5B] dark:text-emerald-300">
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
      data-tooltip={`📊 Gerçek Ziyaretçi İstatistiği — Tekil Kişi: ${formattedUnique} | Bugün: ${formattedToday} | Toplam Çalışma Oturumu: ${formattedViews}`}
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
