import { create } from "zustand";
import { persist } from "zustand/middleware";
import { DictionaryItem } from "@/types/data";

function getTodayDateString(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function getYesterdayDateString(): string {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const y = yesterday.getFullYear();
  const m = String(yesterday.getMonth() + 1).padStart(2, "0");
  const d = String(yesterday.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
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
        .filter((x) => x.length > 0)
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
  reasonTag?: string; // Örn: "Telaffuzda zorlanıldı", "2 kez yanlış yapıldı", "Tekrar zamanı geldi"
}

const SRS_STAGE_DAYS: Record<number, number> = {
  0: 0,
  1: 1,
  2: 3,
  3: 7,
  4: 14,
  5: 30,
};

function computeNextReviewIso(stage: number, forceDays?: number): string {
  const days =
    forceDays !== undefined
      ? forceDays
      : SRS_STAGE_DAYS[Math.max(0, Math.min(5, stage))] ?? 0;
  if (days <= 0) {
    return new Date().toISOString();
  }
  const target = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  return target.toISOString();
}

function sanitizeSrsRecords(raw: unknown): Record<string, SrsItemRecord> {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return {};
  const result: Record<string, SrsItemRecord> = {};
  for (const [key, val] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof val !== "object" || val === null || Array.isArray(val)) continue;
    const rec = val as Record<string, unknown>;
    const id = typeof rec.id === "string" && rec.id.trim() ? rec.id.trim() : key.trim();
    if (!id) continue;
    const rawType = rec.type;
    const type: "word" | "idiom" | "sentence" =
      rawType === "idiom" || rawType === "sentence" ? rawType : "word";
    const stage = Math.max(0, Math.min(5, Math.floor(Number(rec.stage) || 0)));
    const rawStatus = rec.status;
    const status: "learning" | "reviewing" | "mastered" =
      rawStatus === "mastered" || rawStatus === "reviewing"
        ? rawStatus
        : stage >= 3
        ? "mastered"
        : stage >= 1
        ? "reviewing"
        : "learning";
    const lastReviewedAt =
      typeof rec.lastReviewedAt === "string" && rec.lastReviewedAt
        ? rec.lastReviewedAt
        : new Date().toISOString();
    const nextReviewAt =
      typeof rec.nextReviewAt === "string" && rec.nextReviewAt
        ? rec.nextReviewAt
        : lastReviewedAt;
    result[id] = {
      id,
      type,
      stage,
      status,
      lastReviewedAt,
      nextReviewAt,
      correctCount: Math.max(0, Math.floor(Number(rec.correctCount) || 0)),
      wrongCount: Math.max(0, Math.floor(Number(rec.wrongCount) || 0)),
      hintUsedCount: Math.max(0, Math.floor(Number(rec.hintUsedCount) || 0)),
      lastScore:
        typeof rec.lastScore === "number" && Number.isFinite(rec.lastScore)
          ? Math.round(rec.lastScore)
          : undefined,
      reasonTag: typeof rec.reasonTag === "string" ? rec.reasonTag : undefined,
    };
  }
  return result;
}

interface UserState {
  favoriteDialogues: string[];
  completedDialogues: string[];
  rewardedDialogues: string[];
  favoriteWords: DictionaryItem[];
  learnedWords: string[];
  weakWords: DictionaryItem[];
  mistakeIds: string[];
  srsRecords: Record<string, SrsItemRecord>;
  pronunciationScores: number[];
  studyMinutes: number;
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
  getSrsRecord: (id: string) => SrsItemRecord | undefined;
  recordPronunciationScore: (score: number) => void;
  addStudyMinutes: (minutes: number) => void;
  setDailyGoalMinutes: (minutes: number) => void;
  syncDailyProgress: () => void;

  exportProgress: () => string;
  importProgress: (jsonData: string) => boolean;
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
      favoriteWords: [],
      learnedWords: [],
      weakWords: [],
      mistakeIds: [],
      srsRecords: {},
      pronunciationScores: [],
      studyMinutes: 0,
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

          // Aynı diyaloğu tekrar tekrar tamamlayıp geri alarak yapay süre (+5 dk) üretilmesini engelle
          const shouldRewardTime = !isCompleted && !alreadyRewarded;
          const baseMinutes =
            state.lastStudyDate === today ? state.studyMinutes : 0;
          const currentEffectiveStreak =
            state.lastStudyDate === today || state.lastStudyDate === yesterday
              ? state.streakDays
              : 0;

          const streakUpdate = shouldRewardTime
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
            studyMinutes: shouldRewardTime ? baseMinutes + 5 : baseMinutes,
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
          const baseMinutes =
            state.lastStudyDate === today ? state.studyMinutes : 0;
          const currentEffectiveStreak =
            state.lastStudyDate === today || state.lastStudyDate === yesterday
              ? state.streakDays
              : 0;
          const streakUpdate = isLearned
            ? {
                streakDays: currentEffectiveStreak,
                lastStudyDate: state.lastStudyDate,
              }
            : computeNextStreak(currentEffectiveStreak, state.lastStudyDate);

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
            srsRecords: nextSrsRecords,
            studyMinutes: isLearned ? baseMinutes : baseMinutes + 1,
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

      recordItemAttempt: (id, type, isCorrect, usedHint = false, score, reason) => {
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

          let nextStage = prevStage;
          let nextStatus: "learning" | "reviewing" | "mastered" = "learning";
          let nextReviewAt = nowIso;
          let nextCorrect = prevCorrect;
          let nextWrong = prevWrong;
          let nextHint = prevHint;
          let nextReasonTag = reason || existing?.reasonTag;

          if (isCorrect && !usedHint) {
            nextStage = Math.min(5, prevStage + 1);
            nextCorrect = prevCorrect + 1;
            nextStatus = nextStage >= 3 ? "mastered" : "reviewing";
            nextReviewAt = computeNextReviewIso(nextStage);
            if (!reason) {
              nextReasonTag =
                nextStage >= 3
                  ? "Uzun süreli hafızaya alındı"
                  : `Tekrar Kademesi: ${nextStage}/3`;
            }
          } else if (isCorrect && usedHint) {
            nextStage = prevStage;
            nextCorrect = prevCorrect + 1;
            nextHint = prevHint + 1;
            nextStatus = "reviewing";
            nextReviewAt = computeNextReviewIso(prevStage, 1);
            nextReasonTag = reason || "İpucu kullanılarak çözüldü";
          } else {
            nextStage = 0;
            nextWrong = prevWrong + 1;
            nextStatus = "learning";
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
          } else if (isCorrect && !usedHint && nextStage >= 3) {
            // Hata Defterinden Çıkarma Kuralı: Yalnızca stage >= 3 (en az 3 ipucusuz doğru deneme) olduğunda sil!
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
          if (!Number.isFinite(score) || score <= 0) return state;
          const clampedScore = Math.min(100, Math.max(0, Math.round(score)));
          const today = getTodayDateString();
          const baseMinutes =
            state.lastStudyDate === today ? state.studyMinutes : 0;
          const streakUpdate = computeNextStreak(
            state.streakDays,
            state.lastStudyDate
          );
          return {
            pronunciationScores: [
              ...state.pronunciationScores.slice(-49),
              clampedScore,
            ],
            studyMinutes: baseMinutes + 1,
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
            studyMinutes: Math.max(0, baseMinutes + validMinutes),
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
        const payload = {
          version: 3,
          exportedAt: new Date().toISOString(),
          favoriteDialogues: state.favoriteDialogues,
          completedDialogues: state.completedDialogues,
          rewardedDialogues: state.rewardedDialogues || [],
          favoriteWords: state.favoriteWords,
          learnedWords: state.learnedWords,
          weakWords: state.weakWords,
          mistakeIds: state.mistakeIds,
          srsRecords: state.srsRecords || {},
          pronunciationScores: state.pronunciationScores,
          studyMinutes: state.studyMinutes,
          streakDays: state.streakDays,
          lastStudyDate: state.lastStudyDate,
          dailyGoalMinutes: state.dailyGoalMinutes,
        };
        return JSON.stringify(payload, null, 2);
      },

      importProgress: (jsonData: string) => {
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

          // En az bir beklenen ilerleme alanının bulunduğunu doğrula
          const knownKeys = [
            "favoriteDialogues",
            "completedDialogues",
            "favoriteWords",
            "learnedWords",
            "weakWords",
            "mistakeIds",
            "srsRecords",
            "pronunciationScores",
            "studyMinutes",
            "streakDays",
            "dailyGoalMinutes",
          ];
          if (!knownKeys.some((k) => k in data)) {
            return false;
          }

          // 2. Dizi ve nesne alanlarını sıkı şema doğrulamasından geçir
          const favoriteDialogues = sanitizeStringArray(data.favoriteDialogues);
          const completedDialogues = sanitizeStringArray(
            data.completedDialogues
          );
          const rewardedDialogues = Array.isArray(data.rewardedDialogues)
            ? sanitizeStringArray(data.rewardedDialogues)
            : completedDialogues;
          const learnedWords = sanitizeStringArray(data.learnedWords);
          const mistakeIds = sanitizeStringArray(data.mistakeIds);
          const srsRecords = sanitizeSrsRecords(data.srsRecords);
          const favoriteWords = sanitizeDictionaryItems(data.favoriteWords);
          const weakWords = sanitizeDictionaryItems(data.weakWords);

          // 3. Sayısal alanları güvenli aralıklara sınırla (clamp)
          const rawStudyMinutes = Math.max(
            0,
            Math.floor(Number(data.studyMinutes) || 0)
          );
          const rawStreakDays = Math.max(
            0,
            Math.floor(Number(data.streakDays) || 0)
          );
          const dailyGoalMinutes = Math.max(
            5,
            Math.min(180, Math.floor(Number(data.dailyGoalMinutes) || 15))
          );

          const lastStudyDate =
            typeof data.lastStudyDate === "string" &&
            /^\d{4}-\d{2}-\d{2}$/.test(data.lastStudyDate.trim())
              ? data.lastStudyDate.trim()
              : "";

          const today = getTodayDateString();
          const yesterday = getYesterdayDateString();
          const studyMinutes = lastStudyDate === today ? rawStudyMinutes : 0;
          const streakDays =
            lastStudyDate === today || lastStudyDate === yesterday
              ? rawStreakDays
              : 0;

          const pronunciationScores = Array.isArray(data.pronunciationScores)
            ? data.pronunciationScores
                .map((n) => Number(n))
                .filter((n) => Number.isFinite(n) && n >= 0 && n <= 100)
                .map((n) => Math.round(n))
                .slice(-50)
            : [];

          // 4. Mevcut durumu ezmeden önce otomatik yedek al
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

          set({
            favoriteDialogues,
            completedDialogues,
            rewardedDialogues,
            favoriteWords,
            learnedWords,
            weakWords,
            mistakeIds,
            srsRecords,
            pronunciationScores,
            studyMinutes,
            streakDays,
            lastStudyDate,
            dailyGoalMinutes,
          });
          return true;
        } catch {
          return false;
        }
      },

      resetProgress: () =>
        set({
          favoriteDialogues: [],
          completedDialogues: [],
          rewardedDialogues: [],
          favoriteWords: [],
          learnedWords: [],
          weakWords: [],
          mistakeIds: [],
          srsRecords: {},
          pronunciationScores: [],
          studyMinutes: 0,
          streakDays: 0,
          lastStudyDate: "",
          dailyGoalMinutes: 15,
        }),

      isDialogueFavorite: (id) => get().favoriteDialogues.includes(id),
      isDialogueCompleted: (id) => get().completedDialogues.includes(id),
      isWordFavorite: (id) => get().favoriteWords.some((w) => w.id === id),
      isWordLearned: (id) => get().learnedWords.includes(id),
    }),
    { name: "user-progress" }
  )
);