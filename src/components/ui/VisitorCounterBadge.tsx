"use client";

import { useEffect, useState } from "react";

export interface VisitorStatsData {
  ok: boolean;
  totalUnique: number;
  todayVisits: number;
  totalViews: number;
}

const GOOGLE_SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycbxnozrFJ9z1X2TMsO-S1TJm70bu-mreYtuOqU96Oyu_hArYspQaQPvv9rbNeRX8zaGt/exec";

const STORAGE_KEY_UNIQUE = "muallimun_visitor_registered";
const STORAGE_KEY_LAST_DATE = "muallimun_last_visit_date";
const STORAGE_KEY_SESSION = "muallimun_session_counted";
const STORAGE_KEY_CACHE = "muallimun_cached_visitor_stats";
const STATS_EVENT_NAME = "muallimun-visitor-stats-updated";

let inFlightPromise: Promise<VisitorStatsData | null> | null = null;
let latestMemoryStats: VisitorStatsData | null = null;

function getTodayDateString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function readCachedStats(): VisitorStatsData | null {
  if (latestMemoryStats) return latestMemoryStats;
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY_CACHE);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed.totalUnique === "number" &&
      typeof parsed.todayVisits === "number" &&
      typeof parsed.totalViews === "number"
    ) {
      return {
        ok: true,
        totalUnique: parsed.totalUnique,
        todayVisits: parsed.todayVisits,
        totalViews: parsed.totalViews,
      };
    }
  } catch {
    // ignore storage errors
  }
  return null;
}

async function fetchAndRegisterVisitorStats(): Promise<VisitorStatsData | null> {
  if (typeof window === "undefined") return null;
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
    const query = `unique=${uniqueParam}&today=${todayParam}&session=${sessionParam}`;

    let result: VisitorStatsData | null = null;

    // 1. Önce sunucu köprüsünü (/api/stats) dene
    try {
      const res = await fetch(`/api/stats?${query}`, {
        method: "GET",
        cache: "no-store",
      });
      if (res.ok) {
        const json = await res.json();
        if (json && json.ok && Number(json.totalUnique) > 0) {
          result = {
            ok: true,
            totalUnique: Number(json.totalUnique),
            todayVisits: Number(json.todayVisits),
            totalViews: Number(json.totalViews),
          };
        }
      }
    } catch {
      // Sunucu köprüsü başarısız olursa doğrudan Google Apps Script'e düş
    }

    // 2. Yedek: Doğrudan Google Apps Script URL'sine istemciden istek at
    if (!result) {
      try {
        const directRes = await fetch(
          `${GOOGLE_SCRIPT_URL}?action=hit&${query}`,
          {
            method: "GET",
            redirect: "follow",
            cache: "no-store",
          }
        );
        if (directRes.ok) {
          const directJson = await directRes.json();
          if (directJson && Number(directJson.totalUnique) > 0) {
            result = {
              ok: true,
              totalUnique: Number(directJson.totalUnique),
              todayVisits: Number(directJson.todayVisits),
              totalViews: Number(directJson.totalViews),
            };
          }
        }
      } catch {
        // ignore network error
      }
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

    return readCachedStats();
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
  const [stats, setStats] = useState<VisitorStatsData | null>(() =>
    readCachedStats()
  );

  useEffect(() => {
    const cached = readCachedStats();
    if (cached) {
      setStats(cached);
    }

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
      window.removeEventListener(STATS_EVENT_NAME, handleStatsUpdate);
    };
  }, []);

  const formattedUnique = stats
    ? stats.totalUnique.toLocaleString("tr-TR")
    : "…";
  const formattedToday = stats
    ? stats.todayVisits.toLocaleString("tr-TR")
    : "…";
  const formattedViews = stats
    ? stats.totalViews.toLocaleString("tr-TR")
    : "…";

  if (variant === "modal") {
    return (
      <div className="p-3.5 rounded-2xl bg-[#F7EFE1] dark:bg-[var(--background)] border-2 border-[#E6D7BE] dark:border-[var(--border)] space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
            <span className="text-xs font-extrabold text-[#087F5B] dark:text-emerald-300 uppercase tracking-wider">
              📊 Canlı Ziyaretçi ve Çalışma İstatistikleri
            </span>
          </div>
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300">
            Gerçek Zamanlı Sayaç
          </span>
        </div>

        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          <div className="p-2.5 sm:p-3 rounded-xl bg-white dark:bg-[var(--surface)] border border-[#E6D7BE] dark:border-[var(--border)] text-center space-y-0.5">
            <span className="text-[10px] sm:text-[11px] font-bold text-[var(--muted)] block">
              👥 Toplam Tekil Ziyaretçi
            </span>
            <span className="text-sm sm:text-base font-black text-[#087F5B] dark:text-emerald-300 block">
              {formattedUnique}
            </span>
          </div>

          <div className="p-2.5 sm:p-3 rounded-xl bg-white dark:bg-[var(--surface)] border border-[#E6D7BE] dark:border-[var(--border)] text-center space-y-0.5">
            <span className="text-[10px] sm:text-[11px] font-bold text-[var(--muted)] block">
              📅 Bugünkü Ziyaretçi
            </span>
            <span className="text-sm sm:text-base font-black text-[#6741D9] dark:text-indigo-300 block">
              {formattedToday}
            </span>
          </div>

          <div className="p-2.5 sm:p-3 rounded-xl bg-white dark:bg-[var(--surface)] border border-[#E6D7BE] dark:border-[var(--border)] text-center space-y-0.5">
            <span className="text-[10px] sm:text-[11px] font-bold text-[var(--muted)] block">
              📈 Toplam Çalışma Oturumu
            </span>
            <span className="text-sm sm:text-base font-black text-amber-700 dark:text-amber-300 block">
              {formattedViews}
            </span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      data-tooltip={`📊 Gerçek Ziyaretçi İstatistiği — Tekil Kişi: ${formattedUnique} | Bugün: ${formattedToday} | Toplam Çalışma Oturumu: ${formattedViews}`}
      data-tooltip-pos="top"
      className="inline-flex items-center gap-1.5 px-2.5 py-1 sm:px-3 sm:py-1.5 text-[11px] sm:text-xs font-semibold rounded-full bg-white dark:bg-slate-800 border border-[#E6D7BE] dark:border-slate-700 text-[var(--foreground)] shadow-xs select-none"
    >
      <span
        className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0"
        aria-hidden="true"
      />
      <span className="whitespace-nowrap">
        Bugün: <strong className="font-extrabold text-[#087F5B] dark:text-emerald-400">{formattedToday}</strong> • Toplam:{" "}
        <strong className="font-extrabold text-[#6741D9] dark:text-indigo-300">{formattedUnique}</strong> Kişi
      </span>
    </div>
  );
}
