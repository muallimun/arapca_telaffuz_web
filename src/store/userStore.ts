import { create } from "zustand";
import { persist } from "zustand/middleware";
import { DictionaryItem } from "@/types/data";

export function formatIstanbulDate(date: Date = new Date()): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Istanbul",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date);
  } catch {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
}

export function getTodayDateString(): string {
  return formatIstanbulDate(new Date());
}

export function getYesterdayDateString(): string {
  return formatIstanbulDate(new Date(Date.now() - 86400000));
}

function isValidIsoOrDateString(val: unknown): val is string {
  if (typeof val !== "string" || !/^\d{4}-\d{2}-\d{2}/.test(val.trim())) {
    return false;
  }
  return Number.isFinite(Date.parse(val.trim()));
}

function computeNextStreak(
  currentStreak: number,
  lastStudyDate: string
): { streakDays: number; lastStudyDate: string } {
  const today = getTodayDateString();
  if (lastStudyDate === today) {
    return {
      streakDays: Math.max(1, currentStreak),
      lastStudyDate: today,
    };
  }
  const yesterday = getYesterdayDateString();
  if (lastStudyDate === yesterday) {
    return {
      streakDays: Math.max(1, currentStreak) + 1,
      lastStudyDate: today,
    };
  }
  return {
    streakDays: 1,
    lastStudyDate: today,
  };
}

function sanitizeStringArray(arr: unknown): string[] {
  if (!Array.isArray(arr)) return [];
  return Array.from(
    new Set(
      arr
        .filter((x): x is string => typeof x === "string")
        .map((x) => x.trim())
        .filter((x) => x.length > 0 && x.length <= 200)
    )
  );
}

function sanitizeDictionaryItems(arr: unknown): DictionaryItem[] {
  if (!Array.isArray(arr)) return [];
  const seenIds = new Set<string>();
  const validItems: DictionaryItem[] = [];
  for (const raw of arr) {
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) continue;
    const item = raw as Record<string, unknown>;
    const id = typeof item.id === "string" ? item.id.trim() : "";
    const hasWordField =
      (typeof item.mufret === "string" && item.mufret.trim().length > 0) ||
      (typeof item.mazi === "string" && item.mazi.trim().length > 0);
    if (!id || !hasWordField || seenIds.has(id)) continue;
    seenIds.add(id);
    validItems.push({
      id,
      kok: typeof item.kok === "string" ? item.kok : "-",
      tur: typeof item.tur === "string" ? item.tur : "isim",
      mufret: typeof item.mufret === "string" ? item.mufret : undefined,
      cemi: typeof item.cemi === "string" ? item.cemi : undefined,
      mazi: typeof item.mazi === "string" ? item.mazi : undefined,
      muzari: typeof item.muzari === "string" ? item.muzari : undefined,
      masdar: typeof item.masdar === "string" ? item.masdar : undefined,
      anlam_tr: typeof item.anlam_tr === "string" ? item.anlam_tr : "",
    });
  }
  return validItems;
}

export interface PronunciationHistoryItem {
  id: string;
  score: number;
  timestamp: string;
}

export interface SrsItemRecord {
  id: string; // kelime id, kalıp id veya cümle/hata id
  type: "word" | "idiom" | "sentence";
  stage: number; // 0: Hemen/Bugün, 1: 1 gün, 2: 3 gün, 3: 7 gün, 4: 14 gün, 5: 30 gün (Uzun Süreli Öğrenildi)
  status: "learning" | "reviewing" | "mastered"; // "Bugün doğru cevapladım" (reviewing) vs "Uzun süreli öğrendim" (mastered)
  lastReviewedAt: string; // ISO date
  nextReviewAt: string; // ISO date
  correctCount: number;
  wrongCount: number;
  hintUsedCount: number;
  lastScore?: number;
  reasonTag?: string; // Örn: "Telaffuzda zorlanıldı", "2 kez yanlış yapıldı", "Tekrar Kademesi: 1/5"
  lastStageUpDate?: string; // YYYY-MM-DD (Europe/Istanbul) - Aynı gün içinde birden fazla kademe atlamayı önler
}

const SRS_STAGE_DAYS: Record<number, number> = {
  0: 0,
  1: 1,
  2: 3,
  3: 7,
  4: 14,
  5: 30,
};

/**
 * Hedef tekrar tarihini tam takvim günü (Europe/Istanbul YYYY-MM-DDT00:00:00+03:00)
 * üzerinden hesaplar; böylece aynı gün içinde saat farkından dolayı vade kayması yaşanmaz.
 */
function computeNextReviewIso(stage: number, forceDays?: number): string {
  const days =
    forceDays !== undefined
      ? forceDays
      : SRS_STAGE_DAYS[Math.max(0, Math.min(5, stage))] ?? 0;
  if (days <= 0) {
    return new Date().toISOString();
  }
  const todayStr = getTodayDateString();
  const baseDate = new Date(`${todayStr}T00:00:00+03:00`);
  if (!Number.isFinite(baseDate.getTime())) {
    return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
  }
  baseDate.setUTCDate(baseDate.getUTCDate() + days);
  return baseDate.toISOString();
}

const FORBIDDEN_OBJECT_KEYS = new Set(["__proto__", "constructor", "prototype"]);

function sanitizePronunciationHistory(
  rawHistory: unknown,
  fallbackScores?: unknown,
  seedPrefix = "hist"
): PronunciationHistoryItem[] {
  const result: PronunciationHistoryItem[] = [];
  const seenIds = new Set<string>();

  if (Array.isArray(rawHistory)) {
    for (let i = 0; i < rawHistory.length; i++) {
      const item = rawHistory[i];
      if (typeof item !== "object" || item === null || Array.isArray(item)) {
        continue;
      }
      const rec = item as Record<string, unknown>;
      const rawScore = Number(rec.score);
      if (!Number.isFinite(rawScore) || rawScore < 0 || rawScore > 100) {
        continue;
      }
      const score = Math.round(rawScore);
      const timestamp = isValidIsoOrDateString(rec.timestamp)
        ? String(rec.timestamp).trim()
        : new Date(0).toISOString();
      const rawId =
        typeof rec.id === "string" && rec.id.trim().length > 0
          ? rec.id.trim().slice(0, 120)
          : `${seedPrefix}_${timestamp}_${i}_${score}`;
      if (seenIds.has(rawId)) continue;
      seenIds.add(rawId);
      result.push({ id: rawId, score, timestamp });
    }
  }

  if (result.length === 0 && Array.isArray(fallbackScores)) {
    for (let i = 0; i < fallbackScores.length; i++) {
      const s = fallbackScores[i];
      if (typeof s === "number" && Number.isFinite(s) && s >= 0 && s <= 100) {
        const score = Math.round(s);
        const id = `${seedPrefix}_legacy_${i}_${score}`;
        if (!seenIds.has(id)) {
          seenIds.add(id);
          result.push({
            id,
            score,
            timestamp: new Date(0).toISOString(),
          });
        }
      }
    }
  }

  return result.slice(-200);
}

function sanitizeSrsRecords(raw: unknown): Record<string, SrsItemRecord> {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return {};
  const safeMap: Record<string, SrsItemRecord> = Object.create(null);
  for (const [key, val] of Object.entries(raw as Record<string, unknown>)) {
    if (FORBIDDEN_OBJECT_KEYS.has(key.trim())) continue;
    if (typeof val !== "object" || val === null || Array.isArray(val)) continue;
    const rec = val as Record<string, unknown>;
    const id =
      typeof rec.id === "string" && rec.id.trim()
        ? rec.id.trim()
        : key.trim();
    if (!id || id.length > 200 || FORBIDDEN_OBJECT_KEYS.has(id)) continue;
    const rawType = rec.type;
    const type: "word" | "idiom" | "sentence" =
      rawType === "idiom" || rawType === "sentence" ? rawType : "word";
    const rawStage = Number(rec.stage);
    const stage = Number.isFinite(rawStage)
      ? Math.max(0, Math.min(5, Math.floor(rawStage)))
      : 0;
    const rawStatus = rec.status;
    const status: "learning" | "reviewing" | "mastered" =
      rawStatus === "mastered" || rawStatus === "reviewing" || rawStatus === "learning"
        ? rawStatus
        : stage >= 3
        ? "mastered"
        : stage >= 1
        ? "reviewing"
        : "learning";
    const nowIso = new Date().toISOString();
    const lastReviewedAt = isValidIsoOrDateString(rec.lastReviewedAt)
      ? rec.lastReviewedAt.trim()
      : nowIso;
    const nextReviewAt = isValidIsoOrDateString(rec.nextReviewAt)
      ? rec.nextReviewAt.trim()
      : lastReviewedAt;
    const rawCorrect = Number(rec.correctCount);
    const rawWrong = Number(rec.wrongCount);
    const rawHint = Number(rec.hintUsedCount);
    const lastStageUpDate =
      typeof rec.lastStageUpDate === "string" &&
      /^\d{4}-\d{2}-\d{2}$/.test(rec.lastStageUpDate.trim()) &&
      isValidIsoOrDateString(rec.lastStageUpDate.trim())
        ? rec.lastStageUpDate.trim()
        : undefined;

    safeMap[id] = {
      id,
      type,
      stage,
      status,
      lastReviewedAt,
      nextReviewAt,
      correctCount: Number.isFinite(rawCorrect)
        ? Math.max(0, Math.min(10000, Math.floor(rawCorrect)))
        : 0,
      wrongCount: Number.isFinite(rawWrong)
        ? Math.max(0, Math.min(10000, Math.floor(rawWrong)))
        : 0,
      hintUsedCount: Number.isFinite(rawHint)
        ? Math.max(0, Math.min(10000, Math.floor(rawHint)))
        : 0,
      lastScore:
        typeof rec.lastScore === "number" && Number.isFinite(rec.lastScore)
          ? Math.max(0, Math.min(100, Math.round(rec.lastScore)))
          : undefined,
      reasonTag:
        typeof rec.reasonTag === "string"
          ? rec.reasonTag.slice(0, 160)
          : undefined,
      ...(lastStageUpDate ? { lastStageUpDate } : {}),
    };
  }
  return { ...safeMap };
}

interface UserState {
  favoriteDialogues: string[];
  completedDialogues: string[];
  rewardedDialogues: string[];
  rewardedWords: string[];
  favoriteWords: DictionaryItem[];
  learnedWords: string[];
  weakWords: DictionaryItem[];
  mistakeIds: string[];
  srsRecords: Record<string, SrsItemRecord>;
  pronunciationScores: number[];
  pronunciationHistory: PronunciationHistoryItem[];
  totalPronunciationAttempts: number;
  studyMinutes: number;
  activityXp: number;
  streakDays: number;
  lastStudyDate: string;
  dailyGoalMinutes: number;

  toggleFavoriteDialogue: (id: string) => void;
  toggleCompletedDialogue: (id: string) => void;
  toggleFavoriteWord: (word: DictionaryItem) => void;
  toggleLearnedWord: (id: string) => void;
  addWeakWord: (word: DictionaryItem) => void;
  removeWeakWord: (id: string) => void;
  addMistake: (id: string) => void;
  removeMistake: (id: string) => void;
  clearMistakes: () => void;
  isMistake: (id: string) => boolean;
  recordItemAttempt: (
    id: string,
    type: "word" | "idiom" | "sentence",
    isCorrect: boolean,
    usedHint?: boolean,
    score?: number,
    reason?: string
  ) => SrsItemRecord | null;
  updateSrsRecord: (
    id: string,
    type: "word" | "idiom" | "sentence",
    isCorrect: boolean,
    usedHint?: boolean,
    score?: number,
    reason?: string
  ) => SrsItemRecord | null;
  getSrsRecord: (id: string) => SrsItemRecord | undefined;
  recordPronunciationScore: (score: number) => void;
  addStudyMinutes: (minutes: number) => void;
  setDailyGoalMinutes: (minutes: number) => void;
  syncDailyProgress: () => void;

  exportProgress: () => string;
  importProgress: (jsonData: string, mode?: "merge" | "overwrite") => boolean;
  restoreLastAutoBackup: () => boolean;
  resetProgress: () => void;

  isDialogueFavorite: (id: string) => boolean;
  isDialogueCompleted: (id: string) => boolean;
  isWordFavorite: (id: string) => boolean;
  isWordLearned: (id: string) => boolean;
}

export const useUserStore = create<UserState>()(
  persist(
    (set, get) => ({
      favoriteDialogues: [],
      completedDialogues: [],
      rewardedDialogues: [],
      rewardedWords: [],
      favoriteWords: [],
      learnedWords: [],
      weakWords: [],
      mistakeIds: [],
      srsRecords: {},
      pronunciationScores: [],
      pronunciationHistory: [],
      totalPronunciationAttempts: 0,
      studyMinutes: 0,
      activityXp: 0,
      streakDays: 0,
      lastStudyDate: "",
      dailyGoalMinutes: 15,

      toggleFavoriteDialogue: (id) =>
        set((state) => ({
          favoriteDialogues: state.favoriteDialogues.includes(id)
            ? state.favoriteDialogues.filter((d) => d !== id)
            : [...state.favoriteDialogues, id],
        })),

      toggleCompletedDialogue: (id) =>
        set((state) => {
          const isCompleted = state.completedDialogues.includes(id);
          const today = getTodayDateString();
          const yesterday = getYesterdayDateString();
          const rewardedList = state.rewardedDialogues || [];
          const alreadyRewarded = rewardedList.includes(id);

          // Gerçek çalışma süresi (studyMinutes) ile etkinlik puanını (activityXp) ayır:
          // Diyalog tamamlama ilk kez yapıldığında +50 XP verir, yapay dakika eklemez.
          const shouldRewardXp = !isCompleted && !alreadyRewarded;
          const baseMinutes =
            state.lastStudyDate === today ? state.studyMinutes : 0;
          const currentEffectiveStreak =
            state.lastStudyDate === today || state.lastStudyDate === yesterday
              ? state.streakDays
              : 0;

          const streakUpdate = shouldRewardXp
            ? computeNextStreak(currentEffectiveStreak, state.lastStudyDate)
            : {
                streakDays: currentEffectiveStreak,
                lastStudyDate: state.lastStudyDate,
              };

          return {
            completedDialogues: isCompleted
              ? state.completedDialogues.filter((d) => d !== id)
              : [...state.completedDialogues, id],
            rewardedDialogues:
              !isCompleted && !alreadyRewarded
                ? [...rewardedList, id]
                : rewardedList,
            studyMinutes: baseMinutes,
            activityXp: shouldRewardXp
              ? (state.activityXp || 0) + 50
              : state.activityXp || 0,
            ...streakUpdate,
          };
        }),

      toggleFavoriteWord: (word) =>
        set((state) => {
          if (
            !word ||
            !word.id ||
            !(word.mufret || word.mazi) ||
            !word.anlam_tr
          ) {
            return state;
          }
          const validFavorites = state.favoriteWords.filter(
            (w) => w && w.id && (w.mufret || w.mazi) && w.anlam_tr
          );
          const exists = validFavorites.find((w) => w.id === word.id);
          return {
            favoriteWords: exists
              ? validFavorites.filter((w) => w.id !== word.id)
              : [...validFavorites, word],
          };
        }),

      toggleLearnedWord: (id) =>
        set((state) => {
          if (!id || typeof id !== "string") return state;
          const cleanId = id.trim();
          const isLearned = state.learnedWords.includes(cleanId);
          const today = getTodayDateString();
          const yesterday = getYesterdayDateString();
          const rewardedWordsList = state.rewardedWords || [];
          const alreadyRewardedWord = rewardedWordsList.includes(cleanId);

          // Kelime öğrenildi işaretlendiğinde ilk kez +10 XP etkinlik puanı verilir; gerçek çalışma süresine (studyMinutes) yapay dakika eklenmez.
          const shouldRewardWordXp = !isLearned && !alreadyRewardedWord;

          const baseMinutes =
            state.lastStudyDate === today ? state.studyMinutes : 0;
          const currentEffectiveStreak =
            state.lastStudyDate === today || state.lastStudyDate === yesterday
              ? state.streakDays
              : 0;
          const streakUpdate = shouldRewardWordXp
            ? computeNextStreak(currentEffectiveStreak, state.lastStudyDate)
            : {
                streakDays: currentEffectiveStreak,
                lastStudyDate: state.lastStudyDate,
              };

          const existingSrs = state.srsRecords[cleanId];
          const inferredType: "word" | "idiom" | "sentence" = cleanId.startsWith(
            "idiom_"
          ) || cleanId.startsWith("idm_")
            ? "idiom"
            : cleanId.startsWith("sent_")
            ? "sentence"
            : "word";

          const nextSrsRecords = { ...state.srsRecords };
          if (!isLearned) {
            const nextStage = Math.max(3, existingSrs?.stage ?? 3);
            nextSrsRecords[cleanId] = {
              id: cleanId,
              type: existingSrs?.type || inferredType,
              stage: nextStage,
              status: "mastered",
              lastReviewedAt: new Date().toISOString(),
              nextReviewAt: computeNextReviewIso(nextStage),
              correctCount: Math.max(1, existingSrs?.correctCount ?? 1),
              wrongCount: existingSrs?.wrongCount ?? 0,
              hintUsedCount: existingSrs?.hintUsedCount ?? 0,
              lastScore: existingSrs?.lastScore,
              reasonTag: "Uzun süreli hafızaya alındı",
              lastStageUpDate: today,
            };
          } else if (existingSrs) {
            nextSrsRecords[cleanId] = {
              ...existingSrs,
              stage: 0,
              status: "learning",
              nextReviewAt: new Date().toISOString(),
              reasonTag: "Tekrar çalışılmak üzere işaretlendi",
            };
          }

          return {
            learnedWords: isLearned
              ? state.learnedWords.filter((wId) => wId !== cleanId)
              : [...state.learnedWords, cleanId],
            rewardedWords:
              !isLearned && !alreadyRewardedWord
                ? [...rewardedWordsList, cleanId]
                : rewardedWordsList,
            srsRecords: nextSrsRecords,
            studyMinutes: baseMinutes,
            activityXp: shouldRewardWordXp
              ? (state.activityXp || 0) + 10
              : state.activityXp || 0,
            ...streakUpdate,
          };
        }),

      addWeakWord: (word) =>
        set((state) => {
          if (!word || !word.id || !(word.mufret || word.mazi)) return state;
          const exists = state.weakWords.find((w) => w.id === word.id);
          if (exists) return state;
          return { weakWords: [...state.weakWords, word] };
        }),

      removeWeakWord: (id) =>
        set((state) => ({
          weakWords: state.weakWords.filter((w) => w.id !== id),
        })),

      addMistake: (id) =>
        set((state) => {
          const cleanId = (id || "").trim();
          if (!cleanId || state.mistakeIds.includes(cleanId)) return state;
          return { mistakeIds: [cleanId, ...state.mistakeIds] };
        }),

      removeMistake: (id) =>
        set((state) => {
          const cleanId = (id || "").trim();
          if (!cleanId) return state;
          const stripped = cleanId.replace(
            /^(word_|idiom_|idm_|mc_w_|mc_idm_|mc_sent_|mg_w_|mg_idm_|mg_s_|sb_idm_|sb_)/,
            ""
          );
          return {
            mistakeIds: state.mistakeIds.filter(
              (m) =>
                m !== cleanId &&
                m !== stripped &&
                m !== `idiom_${stripped}` &&
                m !== `word_${stripped}` &&
                m !== `sent_${stripped}`
            ),
          };
        }),

      clearMistakes: () => set({ mistakeIds: [] }),

      isMistake: (id) => {
        const cleanId = (id || "").trim();
        if (!cleanId) return false;
        const stripped = cleanId.replace(
          /^(word_|idiom_|idm_|mc_w_|mc_idm_|mc_sent_|mg_w_|mg_idm_|mg_s_|sb_idm_|sb_)/,
          ""
        );
        const list = get().mistakeIds;
        return (
          list.includes(cleanId) ||
          list.includes(stripped) ||
          list.includes(`idiom_${stripped}`) ||
          list.includes(`word_${stripped}`) ||
          list.includes(`sent_${stripped}`)
        );
      },

      recordItemAttempt: (
        id,
        type,
        isCorrect,
        usedHint = false,
        score,
        reason
      ) => {
        const cleanId = (id || "").trim();
        if (!cleanId) return null;
        let updatedRecord: SrsItemRecord | null = null;

        set((state) => {
          const stripped = cleanId.replace(
            /^(word_|idiom_|idm_|mc_w_|mc_idm_|mc_sent_|mg_w_|mg_idm_|mg_s_|sb_idm_|sb_)/,
            ""
          );
          const existing =
            state.srsRecords[cleanId] ||
            state.srsRecords[`idiom_${stripped}`] ||
            state.srsRecords[stripped];
          const canonicalKey = existing?.id || cleanId;

          const prevStage = existing?.stage ?? 0;
          const prevCorrect = existing?.correctCount ?? 0;
          const prevWrong = existing?.wrongCount ?? 0;
          const prevHint = existing?.hintUsedCount ?? 0;
          const nowIso = new Date().toISOString();
          const today = getTodayDateString();
          const lastReviewedDate = existing?.lastReviewedAt
            ? formatIstanbulDate(new Date(existing.lastReviewedAt))
            : undefined;
          const existingNextReviewDate = existing?.nextReviewAt
            ? formatIstanbulDate(new Date(existing.nextReviewAt))
            : today;
          const prevLastStageUpDate =
            existing?.lastStageUpDate ||
            (prevStage > 0 ? lastReviewedDate : undefined);

          let nextStage = prevStage;
          let nextStatus: "learning" | "reviewing" | "mastered" = "learning";
          let nextReviewAt = nowIso;
          let nextCorrect = prevCorrect;
          let nextWrong = prevWrong;
          let nextHint = prevHint;
          let nextReasonTag = reason || existing?.reasonTag;
          let nextLastStageUpDate = prevLastStageUpDate;

          if (isCorrect && !usedHint) {
            // SRS "Vadesi Gelen Tekrar (Due Review)" ve "Serbest Pratik" Ayrımı:
            // Eğer öğenin tekrar vadesi henüz gelmemişse (today < existingNextReviewDate)
            // veya bugün zaten kademe atlamışsa (prevLastStageUpDate === today),
            // doğru deneme "Serbest Pratik" olarak kaydedilir: correctCount artar ancak stage erken yükselmez.
            const isNotDueYet =
              Boolean(existing) &&
              prevStage > 0 &&
              today < existingNextReviewDate;
            const alreadyLeveledUpToday =
              Boolean(existing) && prevLastStageUpDate === today;

            if (isNotDueYet || alreadyLeveledUpToday) {
              nextStage = prevStage;
              nextCorrect = prevCorrect + 1;
              nextStatus =
                existing?.status ||
                (nextStage >= 3
                  ? "mastered"
                  : nextStage >= 1
                  ? "reviewing"
                  : "learning");
              nextReviewAt = existing?.nextReviewAt || computeNextReviewIso(nextStage);
              if (!reason) {
                nextReasonTag = isNotDueYet
                  ? `Serbest Pratik (Tekrar Vadesi: ${existingNextReviewDate})`
                  : existing?.reasonTag || `Tekrar Kademesi: ${nextStage}/5`;
              }
            } else {
              nextStage = Math.min(5, prevStage + 1);
              nextLastStageUpDate = today;
              nextCorrect = prevCorrect + 1;
              nextStatus = nextStage >= 3 ? "mastered" : "reviewing";
              nextReviewAt = computeNextReviewIso(nextStage);
              if (!reason) {
                nextReasonTag =
                  nextStage >= 3
                    ? "Uzun süreli hafızaya alındı"
                    : `Tekrar Kademesi: ${nextStage}/5`;
              }
            }
          } else if (isCorrect && usedHint) {
            nextStage = prevStage;
            nextCorrect = prevCorrect + 1;
            nextHint = prevHint + 1;
            nextStatus =
              existing?.status === "mastered" ? "mastered" : "reviewing";
            nextReviewAt = computeNextReviewIso(prevStage, 1);
            nextReasonTag = reason || "İpucu kullanılarak çözüldü";
          } else {
            // Yanlış cevap: Kademeyi doğrudan 0'a sıfırlamak yerine kademeli olarak 1 düşür (Math.max(0, prevStage - 1))
            nextStage = Math.max(0, prevStage - 1);
            nextWrong = prevWrong + 1;
            nextStatus =
              nextStage >= 3
                ? "mastered"
                : nextStage >= 1
                ? "reviewing"
                : "learning";
            nextReviewAt = nowIso;
            nextReasonTag =
              reason ||
              (nextWrong >= 2
                ? `${nextWrong} kez yanlış yapıldı`
                : "Son denemede hata yapıldı");
          }

          const record: SrsItemRecord = {
            id: canonicalKey,
            type,
            stage: nextStage,
            status: nextStatus,
            lastReviewedAt: nowIso,
            nextReviewAt,
            correctCount: nextCorrect,
            wrongCount: nextWrong,
            hintUsedCount: nextHint,
            lastScore:
              typeof score === "number" && Number.isFinite(score)
                ? Math.round(score)
                : existing?.lastScore,
            reasonTag: nextReasonTag,
            ...(nextLastStageUpDate
              ? { lastStageUpDate: nextLastStageUpDate }
              : {}),
          };
          updatedRecord = record;

          const nextSrsRecords = {
            ...state.srsRecords,
            [canonicalKey]: record,
          };

          let nextMistakeIds = state.mistakeIds;
          let nextLearnedWords = state.learnedWords;

          if (!isCorrect) {
            if (!nextMistakeIds.includes(canonicalKey)) {
              nextMistakeIds = [canonicalKey, ...nextMistakeIds];
            }
            // Yanlış cevaplanan bir kelime stage < 3 durumuna düştüğünde learnedWords listesinden çıkarılarak senkronize tutulur
            if (nextStage < 3) {
              nextLearnedWords = nextLearnedWords.filter(
                (lw) =>
                  lw !== canonicalKey &&
                  lw !== cleanId &&
                  lw !== stripped &&
                  lw !== `idiom_${stripped}` &&
                  lw !== `word_${stripped}`
              );
            }
          } else if (isCorrect && !usedHint && nextStage >= 3) {
            // Hata Defterinden Çıkarma Kuralı: Yalnızca stage >= 3 (farklı günlerde pekiştirilerek mezun olduğunda) sil!
            nextMistakeIds = nextMistakeIds.filter(
              (m) =>
                m !== canonicalKey &&
                m !== cleanId &&
                m !== stripped &&
                m !== `idiom_${stripped}` &&
                m !== `word_${stripped}` &&
                m !== `sent_${stripped}`
            );
            if (
              (type === "word" || type === "idiom") &&
              !nextLearnedWords.includes(canonicalKey)
            ) {
              nextLearnedWords = [...nextLearnedWords, canonicalKey];
            }
          }

          return {
            srsRecords: nextSrsRecords,
            mistakeIds: nextMistakeIds,
            learnedWords: nextLearnedWords,
          };
        });

        return updatedRecord;
      },

      updateSrsRecord: (
        id,
        type,
        isCorrect,
        usedHint = false,
        score,
        reason
      ) =>
        get().recordItemAttempt(
          id,
          type,
          isCorrect,
          usedHint,
          score,
          reason
        ),

      getSrsRecord: (id) => {
        const cleanId = (id || "").trim();
        if (!cleanId) return undefined;
        const records = get().srsRecords || {};
        if (records[cleanId]) return records[cleanId];
        const stripped = cleanId.replace(
          /^(word_|idiom_|idm_|mc_w_|mc_idm_|mc_sent_|mg_w_|mg_idm_|mg_s_|sb_idm_|sb_)/,
          ""
        );
        return (
          records[stripped] ||
          records[`idiom_${stripped}`] ||
          records[`idm_${stripped}`] ||
          records[`sent_${stripped}`]
        );
      },

      recordPronunciationScore: (score) =>
        set((state) => {
          // Değerlendirilmiş tüm geçerli puanları (score >= 0) kaydet;
          // Gerçek çalışma süresine (studyMinutes) her tıklamada +1 dk eklemek yerine +5 XP etkinlik puanı (activityXp) ver.
          if (!Number.isFinite(score) || score < 0) return state;
          const clampedScore = Math.min(100, Math.max(0, Math.round(score)));
          const nowIso = new Date().toISOString();
          const today = getTodayDateString();
          const baseMinutes =
            state.lastStudyDate === today ? state.studyMinutes : 0;
          const streakUpdate = computeNextStreak(
            state.streakDays,
            state.lastStudyDate
          );
          const historyEntry: PronunciationHistoryItem = {
            id: `p_${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${clampedScore}`,
            score: clampedScore,
            timestamp: nowIso,
          };
          const existingHistory = sanitizePronunciationHistory(
            state.pronunciationHistory,
            state.pronunciationScores,
            "local"
          );
          const nextHistory = [...existingHistory, historyEntry].slice(-200);
          return {
            pronunciationScores: [
              ...state.pronunciationScores.slice(-49),
              clampedScore,
            ],
            pronunciationHistory: nextHistory,
            totalPronunciationAttempts:
              (state.totalPronunciationAttempts || 0) + 1,
            studyMinutes: baseMinutes,
            activityXp: (state.activityXp || 0) + 5,
            ...streakUpdate,
          };
        }),

      addStudyMinutes: (minutes) =>
        set((state) => {
          const validMinutes = Math.max(0, Math.floor(Number(minutes) || 0));
          if (validMinutes <= 0) return state;
          const today = getTodayDateString();
          const baseMinutes =
            state.lastStudyDate === today ? state.studyMinutes : 0;
          return {
            studyMinutes: Math.min(1440, Math.max(0, baseMinutes + validMinutes)),
            ...computeNextStreak(state.streakDays, state.lastStudyDate),
          };
        }),

      setDailyGoalMinutes: (minutes) =>
        set(() => ({
          dailyGoalMinutes: Math.max(
            5,
            Math.min(180, Math.floor(Number(minutes) || 15))
          ),
        })),

      syncDailyProgress: () =>
        set((state) => {
          const today = getTodayDateString();
          const yesterday = getYesterdayDateString();
          const isToday = state.lastStudyDate === today;
          const isYesterday = state.lastStudyDate === yesterday;

          const effectiveMinutes = isToday ? state.studyMinutes : 0;
          const effectiveStreak =
            isToday || isYesterday ? state.streakDays : 0;

          if (
            effectiveMinutes === state.studyMinutes &&
            effectiveStreak === state.streakDays
          ) {
            return state;
          }
          return {
            studyMinutes: effectiveMinutes,
            streakDays: effectiveStreak,
          };
        }),

      exportProgress: () => {
        const state = get();
        const history = sanitizePronunciationHistory(
          state.pronunciationHistory,
          state.pronunciationScores,
          "export"
        );
        const payload = {
          version: 3,
          exportedAt: new Date().toISOString(),
          favoriteDialogues: state.favoriteDialogues,
          completedDialogues: state.completedDialogues,
          rewardedDialogues: state.rewardedDialogues || [],
          rewardedWords: state.rewardedWords || [],
          favoriteWords: state.favoriteWords,
          learnedWords: state.learnedWords,
          weakWords: state.weakWords,
          mistakeIds: state.mistakeIds,
          srsRecords: state.srsRecords || {},
          pronunciationScores: state.pronunciationScores,
          pronunciationHistory: history,
          totalPronunciationAttempts: state.totalPronunciationAttempts || 0,
          studyMinutes: state.studyMinutes,
          activityXp: state.activityXp || 0,
          streakDays: state.streakDays,
          lastStudyDate: state.lastStudyDate,
          dailyGoalMinutes: state.dailyGoalMinutes,
        };
        return JSON.stringify(payload, null, 2);
      },

      importProgress: (jsonData: string, mode: "merge" | "overwrite" = "merge") => {
        try {
          // 1. Boyut sınırı: > 2 MB dosyaları reddet
          if (
            !jsonData ||
            typeof jsonData !== "string" ||
            jsonData.length > 2 * 1024 * 1024
          ) {
            return false;
          }

          const parsed: unknown = JSON.parse(jsonData);
          if (
            typeof parsed !== "object" ||
            parsed === null ||
            Array.isArray(parsed)
          ) {
            return false;
          }

          const data = parsed as Record<string, unknown>;

          // 2. Sürüm (version) doğrulaması: undefined veya 1..3 arası tam sayı olmalı (ör. version: 999 reddedilir)
          if (data.version !== undefined) {
            if (
              typeof data.version !== "number" ||
              !Number.isFinite(data.version) ||
              !Number.isInteger(data.version) ||
              data.version < 1 ||
              data.version > 3
            ) {
              return false;
            }
          }

          // En az bir beklenen ilerleme alanının bulunduğunu doğrula
          const knownKeys = [
            "favoriteDialogues",
            "completedDialogues",
            "rewardedDialogues",
            "rewardedWords",
            "favoriteWords",
            "learnedWords",
            "weakWords",
            "mistakeIds",
            "srsRecords",
            "pronunciationScores",
            "pronunciationHistory",
            "totalPronunciationAttempts",
            "studyMinutes",
            "activityXp",
            "streakDays",
            "lastStudyDate",
            "dailyGoalMinutes",
          ];
          if (!knownKeys.some((k) => k in data)) {
            return false;
          }

          // "overwrite" (Üzerine Yaz) modunda tek alanlı kısmi JSON'un tüm ilerlemeyi sıfırlamasını önle:
          // Temel ilerleme alanlarının (completedDialogues, learnedWords, srsRecords) mevcut olması zorunludur.
          if (mode === "overwrite") {
            const requiredCoreKeys = [
              "completedDialogues",
              "learnedWords",
              "srsRecords",
            ];
            if (!requiredCoreKeys.every((k) => k in data)) {
              return false;
            }
          }

          // 3. Sayısal ve tarih alanlarının Number.isFinite ve sınır doğrulaması
          if (data.studyMinutes !== undefined) {
            if (
              typeof data.studyMinutes !== "number" ||
              !Number.isFinite(data.studyMinutes) ||
              data.studyMinutes < 0 ||
              data.studyMinutes > 1440
            ) {
              return false;
            }
          }
          if (data.streakDays !== undefined) {
            if (
              typeof data.streakDays !== "number" ||
              !Number.isFinite(data.streakDays) ||
              data.streakDays < 0 ||
              data.streakDays > 3650
            ) {
              return false;
            }
          }
          if (data.dailyGoalMinutes !== undefined) {
            if (
              typeof data.dailyGoalMinutes !== "number" ||
              !Number.isFinite(data.dailyGoalMinutes) ||
              data.dailyGoalMinutes < 5 ||
              data.dailyGoalMinutes > 180
            ) {
              return false;
            }
          }
          if (
            data.lastStudyDate !== undefined &&
            data.lastStudyDate !== ""
          ) {
            if (
              typeof data.lastStudyDate !== "string" ||
              !/^\d{4}-\d{2}-\d{2}$/.test(data.lastStudyDate.trim()) ||
              !isValidIsoOrDateString(data.lastStudyDate.trim())
            ) {
              return false;
            }
          }
          if (data.pronunciationScores !== undefined) {
            if (!Array.isArray(data.pronunciationScores)) {
              return false;
            }
            for (const s of data.pronunciationScores) {
              if (
                typeof s !== "number" ||
                !Number.isFinite(s) ||
                s < 0 ||
                s > 100
              ) {
                return false;
              }
            }
          }

          // 4. Dizi ve nesne alanlarını sıkı şema doğrulamasından geçir
          const importedFavoriteDialogues = sanitizeStringArray(
            data.favoriteDialogues
          );
          const importedCompletedDialogues = sanitizeStringArray(
            data.completedDialogues
          );
          const importedRewardedDialogues = Array.isArray(
            data.rewardedDialogues
          )
            ? sanitizeStringArray(data.rewardedDialogues)
            : importedCompletedDialogues;
          const importedLearnedWords = sanitizeStringArray(data.learnedWords);
          const importedRewardedWords = Array.isArray(data.rewardedWords)
            ? sanitizeStringArray(data.rewardedWords)
            : importedLearnedWords;
          const importedMistakeIds = sanitizeStringArray(data.mistakeIds);
          const importedSrsRecords = sanitizeSrsRecords(data.srsRecords);
          const importedFavoriteWords = sanitizeDictionaryItems(
            data.favoriteWords
          );
          const importedWeakWords = sanitizeDictionaryItems(data.weakWords);

          const rawStudyMinutes =
            typeof data.studyMinutes === "number" &&
            Number.isFinite(data.studyMinutes)
              ? Math.max(0, Math.min(1440, Math.floor(data.studyMinutes)))
              : 0;
          const importedActivityXp =
            typeof data.activityXp === "number" &&
            Number.isFinite(data.activityXp) &&
            data.activityXp >= 0
              ? Math.min(1000000, Math.floor(data.activityXp))
              : importedCompletedDialogues.length * 50 +
                importedLearnedWords.length * 10;
          const rawStreakDays =
            typeof data.streakDays === "number" &&
            Number.isFinite(data.streakDays)
              ? Math.max(0, Math.min(3650, Math.floor(data.streakDays)))
              : 0;
          const importedDailyGoalMinutes =
            typeof data.dailyGoalMinutes === "number" &&
            Number.isFinite(data.dailyGoalMinutes)
              ? Math.max(5, Math.min(180, Math.floor(data.dailyGoalMinutes)))
              : 15;

          const importedLastStudyDate =
            typeof data.lastStudyDate === "string" &&
            /^\d{4}-\d{2}-\d{2}$/.test(data.lastStudyDate.trim()) &&
            isValidIsoOrDateString(data.lastStudyDate.trim())
              ? data.lastStudyDate.trim()
              : "";

          const today = getTodayDateString();
          const yesterday = getYesterdayDateString();
          const effectiveImportedStudyMinutes =
            importedLastStudyDate === today ? rawStudyMinutes : 0;
          const effectiveImportedStreakDays =
            importedLastStudyDate === today ||
            importedLastStudyDate === yesterday
              ? rawStreakDays
              : 0;

          const importedPronunciationScores = Array.isArray(
            data.pronunciationScores
          )
            ? data.pronunciationScores
                .filter(
                  (n): n is number =>
                    typeof n === "number" &&
                    Number.isFinite(n) &&
                    n >= 0 &&
                    n <= 100
                )
                .map((n) => Math.round(n))
                .slice(-50)
            : [];

          const exportSeed =
            typeof data.exportedAt === "string" && data.exportedAt.trim()
              ? `imp_${data.exportedAt.trim().slice(0, 30)}`
              : "imp_static";
          const importedHistory = sanitizePronunciationHistory(
            data.pronunciationHistory,
            importedPronunciationScores,
            exportSeed
          );

          const importedTotalAttempts =
            typeof data.totalPronunciationAttempts === "number" &&
            Number.isFinite(data.totalPronunciationAttempts) &&
            data.totalPronunciationAttempts >= 0
              ? Math.min(100000, Math.floor(data.totalPronunciationAttempts))
              : Math.max(importedPronunciationScores.length, importedHistory.length);

          // 5. Mevcut durumu değiştirmeden önce otomatik yedek al
          if (typeof window !== "undefined") {
            try {
              localStorage.setItem(
                "arabic_app_backup_before_import",
                get().exportProgress()
              );
            } catch {
              // ignore storage quota errors
            }
          }

          if (mode === "overwrite") {
            set({
              favoriteDialogues: importedFavoriteDialogues,
              completedDialogues: importedCompletedDialogues,
              rewardedDialogues: importedRewardedDialogues,
              rewardedWords: importedRewardedWords,
              favoriteWords: importedFavoriteWords,
              learnedWords: importedLearnedWords,
              weakWords: importedWeakWords,
              mistakeIds: importedMistakeIds,
              srsRecords: importedSrsRecords,
              pronunciationScores:
                importedHistory.length > 0
                  ? importedHistory.map((h) => h.score).slice(-50)
                  : importedPronunciationScores,
              pronunciationHistory: importedHistory,
              totalPronunciationAttempts: importedTotalAttempts,
              studyMinutes: effectiveImportedStudyMinutes,
              activityXp: importedActivityXp,
              streakDays: effectiveImportedStreakDays,
              lastStudyDate: importedLastStudyDate,
              dailyGoalMinutes: importedDailyGoalMinutes,
            });
            return true;
          }

          // Varsayılan: "merge" (Mevcut İlerlemeyle Birleştir - İdempotent ve Güncellik Korumalı)
          const current = get();
          const mergedSrs: Record<string, SrsItemRecord> = {
            ...current.srsRecords,
          };
          for (const [k, rec] of Object.entries(importedSrsRecords)) {
            const existingRec = mergedSrs[k];
            if (!existingRec) {
              mergedSrs[k] = rec;
            } else {
              // SRS Güncellik Kuralı: Yüksek stage yerine lastReviewedAt tarihi daha güncel olan kaydı seç
              const incomingTime = Date.parse(rec.lastReviewedAt || "") || 0;
              const existingTime =
                Date.parse(existingRec.lastReviewedAt || "") || 0;
              if (
                incomingTime > existingTime ||
                (incomingTime === existingTime && rec.stage >= existingRec.stage)
              ) {
                mergedSrs[k] = rec;
              }
            }
          }

          // Telaffuz geçmişini benzersiz id üzerinden tekilleştir (aynı yedeği iki kez merge etmek kayıtları ikiye katlamaz)
          const currentHistory = sanitizePronunciationHistory(
            current.pronunciationHistory,
            current.pronunciationScores,
            exportSeed
          );
          const seenHistoryIds = new Set(currentHistory.map((h) => h.id));
          let newlyAddedHistoryCount = 0;
          const mergedHistory = [...currentHistory];

          // Eğer gelen yedekte pronunciationHistory yoksa ve skor dizisi mevcut dizinin sonuyla birebir aynıysa çiftleme yapma
          const isIdenticalScoreSuffix =
            !Array.isArray(data.pronunciationHistory) &&
            importedPronunciationScores.length > 0 &&
            current.pronunciationScores.length >=
              importedPronunciationScores.length &&
            current.pronunciationScores
              .slice(-importedPronunciationScores.length)
              .every((s, idx) => s === importedPronunciationScores[idx]);

          if (!isIdenticalScoreSuffix) {
            for (const item of importedHistory) {
              if (!seenHistoryIds.has(item.id)) {
                seenHistoryIds.add(item.id);
                mergedHistory.push(item);
                newlyAddedHistoryCount += 1;
              }
            }
          }

          const cappedMergedHistory = mergedHistory.slice(-200);
          const mergedScores =
            data.pronunciationScores !== undefined ||
            data.pronunciationHistory !== undefined
              ? cappedMergedHistory.map((h) => h.score).slice(-50)
              : current.pronunciationScores;

          const nextTotalAttempts =
            newlyAddedHistoryCount > 0
              ? Math.max(
                  (current.totalPronunciationAttempts || 0) +
                    newlyAddedHistoryCount,
                  importedTotalAttempts,
                  mergedScores.length
                )
              : Math.max(
                  current.totalPronunciationAttempts || 0,
                  importedTotalAttempts,
                  mergedScores.length
                );

          set({
            favoriteDialogues: sanitizeStringArray([
              ...current.favoriteDialogues,
              ...importedFavoriteDialogues,
            ]),
            completedDialogues: sanitizeStringArray([
              ...current.completedDialogues,
              ...importedCompletedDialogues,
            ]),
            rewardedDialogues: sanitizeStringArray([
              ...(current.rewardedDialogues || []),
              ...importedRewardedDialogues,
            ]),
            rewardedWords: sanitizeStringArray([
              ...(current.rewardedWords || []),
              ...importedRewardedWords,
            ]),
            favoriteWords: sanitizeDictionaryItems([
              ...current.favoriteWords,
              ...importedFavoriteWords,
            ]),
            learnedWords: sanitizeStringArray([
              ...current.learnedWords,
              ...importedLearnedWords,
            ]),
            weakWords: sanitizeDictionaryItems([
              ...current.weakWords,
              ...importedWeakWords,
            ]),
            mistakeIds: sanitizeStringArray([
              ...current.mistakeIds,
              ...importedMistakeIds,
            ]),
            srsRecords: mergedSrs,
            pronunciationScores: mergedScores,
            pronunciationHistory: cappedMergedHistory,
            totalPronunciationAttempts: nextTotalAttempts,
            studyMinutes:
              data.studyMinutes !== undefined
                ? Math.max(current.studyMinutes, effectiveImportedStudyMinutes)
                : current.studyMinutes,
            activityXp: Math.max(current.activityXp || 0, importedActivityXp),
            streakDays:
              data.streakDays !== undefined
                ? Math.max(current.streakDays, effectiveImportedStreakDays)
                : current.streakDays,
            lastStudyDate:
              importedLastStudyDate &&
              importedLastStudyDate > (current.lastStudyDate || "")
                ? importedLastStudyDate
                : current.lastStudyDate,
            dailyGoalMinutes:
              data.dailyGoalMinutes !== undefined
                ? importedDailyGoalMinutes
                : current.dailyGoalMinutes,
          });
          return true;
        } catch {
          return false;
        }
      },

      restoreLastAutoBackup: () => {
        if (typeof window === "undefined") return false;
        try {
          const raw = localStorage.getItem("arabic_app_backup_before_import");
          if (!raw) return false;
          return get().importProgress(raw, "overwrite");
        } catch {
          return false;
        }
      },

      resetProgress: () =>
        set({
          favoriteDialogues: [],
          completedDialogues: [],
          rewardedDialogues: [],
          rewardedWords: [],
          favoriteWords: [],
          learnedWords: [],
          weakWords: [],
          mistakeIds: [],
          srsRecords: {},
          pronunciationScores: [],
          pronunciationHistory: [],
          totalPronunciationAttempts: 0,
          studyMinutes: 0,
          activityXp: 0,
          streakDays: 0,
          lastStudyDate: "",
          dailyGoalMinutes: 15,
        }),

      isDialogueFavorite: (id) => get().favoriteDialogues.includes(id),
      isDialogueCompleted: (id) => get().completedDialogues.includes(id),
      isWordFavorite: (id) => get().favoriteWords.some((w) => w.id === id),
      isWordLearned: (id) => get().learnedWords.includes(id),
    }),
    {
      name: "user-progress",
      merge: (persistedState, currentState) => {
        if (
          typeof persistedState !== "object" ||
          persistedState === null ||
          Array.isArray(persistedState)
        ) {
          return currentState;
        }
        const raw = persistedState as Record<string, unknown>;
        const safeScores = Array.isArray(raw.pronunciationScores)
          ? raw.pronunciationScores
              .filter(
                (n): n is number =>
                  typeof n === "number" &&
                  Number.isFinite(n) &&
                  n >= 0 &&
                  n <= 100
              )
              .map((n) => Math.round(n))
              .slice(-50)
          : currentState.pronunciationScores;
        const safeHistory = sanitizePronunciationHistory(
          raw.pronunciationHistory,
          safeScores,
          "rehydrate"
        );
        const safeLastStudyDate =
          typeof raw.lastStudyDate === "string" &&
          /^\d{4}-\d{2}-\d{2}$/.test(raw.lastStudyDate.trim()) &&
          isValidIsoOrDateString(raw.lastStudyDate.trim())
            ? raw.lastStudyDate.trim()
            : currentState.lastStudyDate;

        return {
          ...currentState,
          favoriteDialogues: sanitizeStringArray(raw.favoriteDialogues),
          completedDialogues: sanitizeStringArray(raw.completedDialogues),
          rewardedDialogues: sanitizeStringArray(raw.rewardedDialogues),
          rewardedWords: sanitizeStringArray(raw.rewardedWords),
          favoriteWords: sanitizeDictionaryItems(raw.favoriteWords),
          learnedWords: sanitizeStringArray(raw.learnedWords),
          weakWords: sanitizeDictionaryItems(raw.weakWords),
          mistakeIds: sanitizeStringArray(raw.mistakeIds),
          srsRecords: sanitizeSrsRecords(raw.srsRecords),
          pronunciationScores: safeScores,
          pronunciationHistory: safeHistory,
          totalPronunciationAttempts:
            typeof raw.totalPronunciationAttempts === "number" &&
            Number.isFinite(raw.totalPronunciationAttempts) &&
            raw.totalPronunciationAttempts >= 0
              ? Math.min(100000, Math.floor(raw.totalPronunciationAttempts))
              : safeScores.length,
          studyMinutes:
            typeof raw.studyMinutes === "number" &&
            Number.isFinite(raw.studyMinutes) &&
            raw.studyMinutes >= 0
              ? Math.min(1440, Math.floor(raw.studyMinutes))
              : 0,
          activityXp:
            typeof raw.activityXp === "number" &&
            Number.isFinite(raw.activityXp) &&
            raw.activityXp >= 0
              ? Math.min(1000000, Math.floor(raw.activityXp))
              : 0,
          streakDays:
            typeof raw.streakDays === "number" &&
            Number.isFinite(raw.streakDays) &&
            raw.streakDays >= 0
              ? Math.min(3650, Math.floor(raw.streakDays))
              : 0,
          lastStudyDate: safeLastStudyDate,
          dailyGoalMinutes:
            typeof raw.dailyGoalMinutes === "number" &&
            Number.isFinite(raw.dailyGoalMinutes) &&
            raw.dailyGoalMinutes >= 5 &&
            raw.dailyGoalMinutes <= 180
              ? Math.floor(raw.dailyGoalMinutes)
              : 15,
        };
      },
    }
  )
);