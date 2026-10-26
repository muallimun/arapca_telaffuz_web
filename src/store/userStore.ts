import { create } from "zustand";
import { persist } from "zustand/middleware";
import { DictionaryItem } from "@/types/data";

interface UserState {
  favoriteDialogues: string[];
  completedDialogues: string[];
  favoriteWords: DictionaryItem[];
  learnedWords: string[];
  weakWords: DictionaryItem[]; // YENİ: Zayıf kelimeler
  
  toggleFavoriteDialogue: (id: string) => void;
  toggleCompletedDialogue: (id: string) => void;
  toggleFavoriteWord: (word: DictionaryItem) => void;
  toggleLearnedWord: (id: string) => void;
  addWeakWord: (word: DictionaryItem) => void; // YENİ
  removeWeakWord: (id: string) => void; // YENİ
  
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

      toggleFavoriteDialogue: (id) => set((state) => ({
        favoriteDialogues: state.favoriteDialogues.includes(id)
          ? state.favoriteDialogues.filter((d) => d !== id)
          : [...state.favoriteDialogues, id]
      })),

      toggleCompletedDialogue: (id) => set((state) => ({
        completedDialogues: state.completedDialogues.includes(id)
          ? state.completedDialogues.filter((d) => d !== id)
          : [...state.completedDialogues, id]
      })),

      toggleFavoriteWord: (word) => set((state) => {
        const exists = state.favoriteWords.find((w) => w.id === word.id);
        return {
          favoriteWords: exists
            ? state.favoriteWords.filter((w) => w.id !== word.id)
            : [...state.favoriteWords, word]
        };
      }),

      toggleLearnedWord: (id) => set((state) => ({
        learnedWords: state.learnedWords.includes(id)
          ? state.learnedWords.filter((wId) => wId !== id)
          : [...state.learnedWords, id]
      })),

      // YENİ: Zayıf kelime ekle (varsa tekrar ekleme)
      addWeakWord: (word) => set((state) => {
        const exists = state.weakWords.find(w => w.id === word.id);
        if (exists) return state;
        return { weakWords: [...state.weakWords, word] };
      }),

      // YENİ: Zayıf kelimeyi sil
      removeWeakWord: (id) => set((state) => ({
        weakWords: state.weakWords.filter(w => w.id !== id)
      })),

      isDialogueFavorite: (id) => get().favoriteDialogues.includes(id),
      isDialogueCompleted: (id) => get().completedDialogues.includes(id),
      isWordFavorite: (id) => get().favoriteWords.some((w) => w.id === id),
      isWordLearned: (id) => get().learnedWords.includes(id),
    }),
    { name: "user-progress" }
  )
);