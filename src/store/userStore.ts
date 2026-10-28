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

interface UserState {
  favoriteDialogues: string[];
  completedDialogues: string[];
  favoriteWords: DictionaryItem[];
  learnedWords: string[];
  weakWords: DictionaryItem[];
  mistakeIds: string[];
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
  recordPronunciationScore: (score: number) => void;
  addStudyMinutes: (minutes: number) => void;
  setDailyGoalMinutes: (minutes: number) => void;

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
      favoriteWords: [],
      learnedWords: [],
      weakWords: [],
      mistakeIds: [],
      pronunciationScores: [],
      studyMinutes: 0,
      streakDays: 1,
      lastStudyDate: getTodayDateString(),
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
          const baseMinutes =
            state.lastStudyDate === today ? state.studyMinutes : 0;
          const streakUpdate = isCompleted
            ? {
                streakDays: state.streakDays,
                lastStudyDate: state.lastStudyDate,
              }
            : computeNextStreak(state.streakDays, state.lastStudyDate);
          return {
            completedDialogues: isCompleted
              ? state.completedDialogues.filter((d) => d !== id)
              : [...state.completedDialogues, id],
            studyMinutes: isCompleted ? state.studyMinutes : baseMinutes + 5,
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
          const isLearned = state.learnedWords.includes(id);
          const today = getTodayDateString();
          const baseMinutes =
            state.lastStudyDate === today ? state.studyMinutes : 0;
          const streakUpdate = isLearned
            ? {
                streakDays: state.streakDays,
                lastStudyDate: state.lastStudyDate,
              }
            : computeNextStreak(state.streakDays, state.lastStudyDate);
          return {
            learnedWords: isLearned
              ? state.learnedWords.filter((wId) => wId !== id)
              : [...state.learnedWords, id],
            studyMinutes: isLearned ? state.studyMinutes : baseMinutes + 1,
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

      recordPronunciationScore: (score) =>
        set((state) => {
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
              score,
            ],
            studyMinutes: baseMinutes + 1,
            ...streakUpdate,
          };
        }),

      addStudyMinutes: (minutes) =>
        set((state) => {
          const today = getTodayDateString();
          const baseMinutes =
            state.lastStudyDate === today ? state.studyMinutes : 0;
          return {
            studyMinutes: Math.max(0, baseMinutes + minutes),
            ...computeNextStreak(state.streakDays, state.lastStudyDate),
          };
        }),

      setDailyGoalMinutes: (minutes) =>
        set(() => ({
          dailyGoalMinutes: Math.max(5, Math.min(180, minutes)),
        })),

      exportProgress: () => {
        const state = get();
        const payload = {
          version: 2,
          exportedAt: new Date().toISOString(),
          favoriteDialogues: state.favoriteDialogues,
          completedDialogues: state.completedDialogues,
          favoriteWords: state.favoriteWords,
          learnedWords: state.learnedWords,
          weakWords: state.weakWords,
          mistakeIds: state.mistakeIds,
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
          const parsed = JSON.parse(jsonData);
          if (!parsed || typeof parsed !== "object") return false;
          set((state) => ({
            favoriteDialogues: Array.isArray(parsed.favoriteDialogues)
              ? parsed.favoriteDialogues
              : state.favoriteDialogues,
            completedDialogues: Array.isArray(parsed.completedDialogues)
              ? parsed.completedDialogues
              : state.completedDialogues,
            favoriteWords: Array.isArray(parsed.favoriteWords)
              ? parsed.favoriteWords
              : state.favoriteWords,
            learnedWords: Array.isArray(parsed.learnedWords)
              ? parsed.learnedWords
              : state.learnedWords,
            weakWords: Array.isArray(parsed.weakWords)
              ? parsed.weakWords
              : state.weakWords,
            mistakeIds: Array.isArray(parsed.mistakeIds)
              ? parsed.mistakeIds
              : state.mistakeIds,
            pronunciationScores: Array.isArray(parsed.pronunciationScores)
              ? parsed.pronunciationScores
              : state.pronunciationScores,
            studyMinutes:
              typeof parsed.studyMinutes === "number"
                ? parsed.studyMinutes
                : state.studyMinutes,
            streakDays:
              typeof parsed.streakDays === "number"
                ? parsed.streakDays
                : state.streakDays,
            lastStudyDate:
              typeof parsed.lastStudyDate === "string"
                ? parsed.lastStudyDate
                : state.lastStudyDate,
            dailyGoalMinutes:
              typeof parsed.dailyGoalMinutes === "number"
                ? parsed.dailyGoalMinutes
                : state.dailyGoalMinutes,
          }));
          return true;
        } catch {
          return false;
        }
      },

      resetProgress: () =>
        set({
          favoriteDialogues: [],
          completedDialogues: [],
          favoriteWords: [],
          learnedWords: [],
          weakWords: [],
          mistakeIds: [],
          pronunciationScores: [],
          studyMinutes: 0,
          streakDays: 1,
          lastStudyDate: getTodayDateString(),
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