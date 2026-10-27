"use client";

import { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import {
  Search,
  ChevronLeft,
  Heart,
  CheckCircle2,
  Mic,
  Volume2,
  X,
  Sparkles,
  SlidersHorizontal,
} from "lucide-react";
import { sozluk, diyaloglar } from "@/lib/data";
import { DictionaryItem } from "@/types/data";
import {
  getDialogueVocabulary,
  DialogueVocabularyEntry,
  cleanArabicText,
  analyzeAndMatchWord,
  getWordCategory,
  WordCategory,
} from "@/lib/dict";
import { loadAudioManifest, playTTS } from "@/lib/audio";
import { useAudioStore } from "@/store/audioStore";
import { useUserStore } from "@/store/userStore";
import { useSettings } from "@/store/settings";
import { playClick } from "@/lib/sfxManager";
import ShadowingModal from "@/components/ui/ShadowingModal";
import { formatArabicText } from "@/lib/arabicTextUtils";

type StatusFilter = "all" | "learned" | "unlearned" | "favorites";
type TypeFilter = "all" | "isim" | "ozel-isim" | "fiil" | "edat";

function getCategoryCardTheme(category: WordCategory) {
  if (category === "fiil") {
    return {
      leftBorder: "border-l-4 border-l-amber-500",
      badgeText: "⚡ Fiil (فعل)",
      badgeClass:
        "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-700/60",
      arabicColor:
        "text-amber-700 dark:text-amber-300 group-hover:text-amber-600",
    };
  }
  if (category === "edat") {
    return {
      leftBorder: "border-l-4 border-l-purple-500",
      badgeText: "🔗 Edat / Kalıp",
      badgeClass:
        "bg-purple-100 text-purple-800 border-purple-300 dark:bg-purple-950/60 dark:text-purple-300 dark:border-purple-700/60",
      arabicColor:
        "text-purple-700 dark:text-purple-300 group-hover:text-purple-600",
    };
  }
  if (category === "ozel-isim") {
    return {
      leftBorder: "border-l-4 border-l-teal-500",
      badgeText: "👤 Özel İsim (اسم علم)",
      badgeClass:
        "bg-teal-100 text-teal-800 border-teal-300 dark:bg-teal-950/60 dark:text-teal-300 dark:border-teal-700/60",
      arabicColor:
        "text-teal-700 dark:text-teal-300 group-hover:text-teal-600",
    };
  }
  return {
    leftBorder: "border-l-4 border-l-sky-500",
    badgeText: "📘 İsim (اسم)",
    badgeClass:
      "bg-sky-100 text-sky-800 border-sky-300 dark:bg-sky-950/60 dark:text-sky-300 dark:border-sky-700/60",
    arabicColor: "text-sky-700 dark:text-sky-300 group-hover:text-sky-600",
  };
}

export default function DictionaryPage() {
  const [mounted, setMounted] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedDialogueId, setSelectedDialogueId] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [speakingWordId, setSpeakingWordId] = useState<string | null>(null);
  const [manifest, setManifest] = useState<Record<string, string[]>>({});

  const [shadowingTarget, setShadowingTarget] = useState<{
    text: string;
    forms: { label: string; arabic: string }[];
  } | null>(null);

  const {
    toggleFavoriteWord,
    isWordFavorite,
    toggleLearnedWord,
    isWordLearned,
    favoriteWords,
    learnedWords,
  } = useUserStore();

  const { speechRate, showHareke, arabicFont } = useSettings();
  const { playAudio } = useAudioStore();

  useEffect(() => {
    setMounted(true);
    loadAudioManifest().then((m) => setManifest(m || {}));
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const durum = params.get("durum");
      const dlg = params.get("diyalog");
      if (durum === "learned") setStatusFilter("learned");
      if (dlg) setSelectedDialogueId(dlg);
    }
  }, []);

  const getDisplayArabic = (text: string) =>
    formatArabicText(text, !mounted || showHareke, arabicFont);

  // Seçili diyaloğun morfolojik kelime haritası (getDialogueVocabulary ile)
  const dialogueContextMap = useMemo(() => {
    if (selectedDialogueId === "all") return null;
    const entries = getDialogueVocabulary(selectedDialogueId);
    const map = new Map<string, DialogueVocabularyEntry>();
    entries.forEach((e) => map.set(e.item.id, e));
    return map;
  }, [selectedDialogueId]);

  const filteredWords = useMemo(() => {
    let result: DictionaryItem[] = dialogueContextMap
      ? Array.from(dialogueContextMap.values()).map((e) => e.item)
      : sozluk;

    // 1. Kelime türüne göre filtreleme (getWordCategory ile)
    if (typeFilter !== "all") {
      result = result.filter((w) => getWordCategory(w) === typeFilter);
    }

    // 2. Öğrenilme / Favori durumuna göre filtreleme
    if (mounted) {
      if (statusFilter === "learned") {
        result = result.filter((w) => learnedWords.includes(w.id));
      } else if (statusFilter === "unlearned") {
        result = result.filter((w) => !learnedWords.includes(w.id));
      } else if (statusFilter === "favorites") {
        const favIds = new Set(favoriteWords.map((fw) => fw.id));
        result = result.filter((w) => favIds.has(w.id));
      }
    }

    // 3. Arapça (çekimli/yalın) veya Türkçe Anlık Arama
    if (search.trim()) {
      const qLower = search.trim().toLowerCase();
      const qCleanAr = cleanArabicText(search.trim());
      const morphMatched = analyzeAndMatchWord(search.trim());

      result = result.filter((word) => {
        if (morphMatched && morphMatched.item.id === word.id) return true;
        const matchesTurkish = word.anlam_tr.toLowerCase().includes(qLower);
        const rawArFields = [
          word.mufret || "",
          word.cemi || "",
          word.mazi || "",
          word.muzari || "",
          word.masdar || "",
          word.kok || "",
        ];
        const matchesArabicRaw = rawArFields.some((f) =>
          f.includes(search.trim())
        );
        const matchesArabicClean =
          qCleanAr.length > 0 &&
          rawArFields.some((f) => cleanArabicText(f).includes(qCleanAr));

        return matchesTurkish || matchesArabicRaw || matchesArabicClean;
      });
    }

    return result;
  }, [
    dialogueContextMap,
    typeFilter,
    statusFilter,
    search,
    mounted,
    learnedWords,
    favoriteWords,
  ]);

  // Kelimeyi sesli dinle (MP3 varsa MP3, yoksa TTS)
  const handleListenWord = async (
    word: DictionaryItem,
    customArabic?: string
  ) => {
    playClick();
    const primaryArabic =
      customArabic ||
      (word.mufret || word.mazi || word.muzari || "").split("/")[0].trim();
    if (!primaryArabic) return;

    const rate = mounted ? speechRate : 1;
    setSpeakingWordId(word.id);

    try {
      if (manifest.words && manifest.words.includes(word.id) && !customArabic) {
        await playAudio(`/audio/words/${word.id}.mp3`, 0, rate);
      } else {
        await playTTS(primaryArabic, rate);
      }
    } catch {
      await playTTS(primaryArabic, rate);
    } finally {
      setSpeakingWordId(null);
    }
  };

  // Kelimenin tüm formlarını hazırla (Gölgeleme modalı için)
  const prepareForms = (word: DictionaryItem) => {
    const forms: { label: string; arabic: string }[] = [];
    const category = getWordCategory(word);
    if (category === "fiil" || word.mazi || word.muzari) {
      if (word.mazi) forms.push({ label: "Mâzî (Geçmiş)", arabic: word.mazi });
      if (word.muzari)
        forms.push({ label: "Muzâri (Şimdiki/Geniş)", arabic: word.muzari });
      if (word.masdar)
        forms.push({ label: "Masdar (İsim Hali)", arabic: word.masdar });
      if (forms.length === 0 && word.mufret) {
        forms.push({ label: "Fiil Formu", arabic: word.mufret });
      }
    } else {
      if (word.mufret)
        forms.push({ label: "Müfret (Tekil)", arabic: word.mufret });
      if (word.cemi && word.cemi !== "-")
        forms.push({ label: "Cemî (Çoğul)", arabic: word.cemi });
    }
    return forms.length > 0 ? forms : null;
  };

  const handleMicClick = (word: DictionaryItem) => {
    playClick();
    const forms = prepareForms(word);
    if (forms && forms.length > 0) {
      setShadowingTarget({ text: forms[0].arabic, forms });
    }
  };

  const hasActiveFilter =
    selectedDialogueId !== "all" ||
    statusFilter !== "all" ||
    typeFilter !== "all";

  return (
    <div className="space-y-3 sm:space-y-4">
      {/* GÖLGELEME MODALI */}
      {shadowingTarget && (
        <ShadowingModal
          text={shadowingTarget.text}
          forms={shadowingTarget.forms}
          onClose={() => setShadowingTarget(null)}
        />
      )}

      {/* ÜST BAŞLIK */}
      <div className="flex items-center justify-between gap-2.5">
        <div className="flex items-center gap-2.5 min-w-0">
          <Link
            href="/"
            onClick={() => playClick()}
            className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-[#F7EFE1] dark:bg-[var(--surface)] border-2 border-[#E6D7BE] dark:border-[var(--border)] border-b-4 flex items-center justify-center text-[var(--foreground)] hover:bg-[#EFE3CE] active:border-b-2 active:translate-y-0.5 transition-all shrink-0"
            aria-label="Ana Sayfaya Dön"
          >
            <ChevronLeft size={19} strokeWidth={2.5} />
          </Link>
          <div className="min-w-0">
            <h1 className="text-lg sm:text-2xl font-extrabold text-[var(--foreground)] tracking-tight leading-tight truncate">
              İnteraktif Arapça Sözlük
            </h1>
            <p className="text-[11px] sm:text-xs font-medium text-[var(--muted)] truncate">
              Fiil / İsim / Edat renk kodlamalı morfolojik kök sözlüğü
            </p>
          </div>
        </div>

        <div className="bg-[#F7EFE1] dark:bg-[var(--surface)] border-2 border-[#E6D7BE] dark:border-[var(--border)] border-b-4 rounded-xl px-2.5 py-1.5 text-[11px] sm:text-xs font-extrabold text-[var(--foreground)] tabular-nums shrink-0">
          {filteredWords.length} / {sozluk.length}
        </div>
      </div>

      {/* KOMPAKT KONTROL ŞERİDİ (MOBİLDE TEK SATIR ARAMA + [SlidersHorizontal] FİLTRELER + YATAY KAYDIRILABİLİR HAPLAR) */}
      <section className="bg-[#F7EFE1] dark:bg-[var(--surface)] rounded-2xl border-2 border-[#E6D7BE] dark:border-[var(--border)] border-b-4 p-2 sm:p-2.5 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          {/* 1. Anlık Arapça/Türkçe Arama */}
          <div className="relative flex-1 min-w-[160px]">
            <Search
              size={15}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)] pointer-events-none"
            />
            <input
              type="text"
              placeholder="Arapça, Türkçe anlam veya kök ara (ör: أستودعك)..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full h-9 bg-white dark:bg-[var(--background)] border border-[#E6D7BE] dark:border-[var(--border)] rounded-xl pl-8 pr-8 text-xs font-semibold text-[var(--foreground)] placeholder:text-[var(--muted)] focus:outline-none focus:border-[#0CA678]"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--muted)] hover:text-[var(--foreground)] cursor-pointer"
                aria-label="Aramayı Temizle"
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Mobilde [SlidersHorizontal] Filtreler Açılır/Kapanır Butonu */}
          <button
            type="button"
            onClick={() => {
              playClick();
              setMobileFiltersOpen((v) => !v);
            }}
            className={`sm:hidden h-9 px-3 rounded-xl border-2 border-b-3 text-xs font-extrabold flex items-center gap-1.5 shrink-0 cursor-pointer transition-all ${
              mobileFiltersOpen || hasActiveFilter
                ? "bg-[#6741D9] border-[#5230B5] text-white"
                : "bg-white dark:bg-[var(--background)] border-[#E6D7BE] dark:border-[var(--border)] text-[var(--foreground)]"
            }`}
          >
            <SlidersHorizontal size={14} />
            <span>Filtreler</span>
          </button>

          {/* 2. Diyaloğa Göre Filtreleme Dropdown (Masaüstünde görünür, mobilde Filtreler içinde) */}
          <div className="hidden sm:flex bg-white dark:bg-[var(--background)] rounded-xl px-2 h-9 border border-[#E6D7BE] dark:border-[var(--border)] items-center">
            <select
              value={selectedDialogueId}
              onChange={(e) => {
                playClick();
                setSelectedDialogueId(e.target.value);
              }}
              className="bg-transparent text-xs font-bold text-[var(--foreground)] focus:outline-none cursor-pointer max-w-[190px] truncate"
            >
              <option value="all">Tüm Sözlük ({sozluk.length})</option>
              {diyaloglar.map((dlg) => {
                const num = dlg.id.replace("dlg_", "");
                return (
                  <option key={dlg.id} value={dlg.id}>
                    #{num} — {dlg.baslik_tr} ({dlg.seviye})
                  </option>
                );
              })}
            </select>
          </div>

          {/* 3. Öğrenme Durumu Hapları (Masaüstünde görünür) */}
          <div className="hidden sm:flex bg-white dark:bg-[var(--background)] rounded-xl p-1 border border-[#E6D7BE] dark:border-[var(--border)] items-center gap-1">
            {(
              [
                { id: "all", label: "Tümü" },
                {
                  id: "learned",
                  label: `Öğrendim (${mounted ? learnedWords.length : 0})`,
                },
                { id: "unlearned", label: "Yeni" },
                {
                  id: "favorites",
                  label: `Favori (${mounted ? favoriteWords.length : 0})`,
                },
              ] as { id: StatusFilter; label: string }[]
            ).map((tab) => {
              const active = statusFilter === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => {
                    playClick();
                    setStatusFilter(tab.id);
                  }}
                  className={`px-2 py-1 text-xs rounded-lg transition-all whitespace-nowrap cursor-pointer ${
                    active
                      ? "bg-[#0CA678] text-white font-semibold shadow-2xs"
                      : "text-[var(--muted)] font-medium hover:text-[var(--foreground)]"
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* 4. Tek Satırda Yatay Kaydırılabilir Kelime Türü & Durum Hapları Şeridi */}
        <div className="flex overflow-x-auto no-scrollbar items-center gap-1.5 py-0.5">
          {(
            [
              {
                id: "all",
                label: "Tümü",
                activeClass: "bg-[#0CA678] border-[#087F5B] text-white",
              },
              {
                id: "isim",
                label: "📘 İsimler",
                activeClass: "bg-sky-600 border-sky-700 text-white",
              },
              {
                id: "ozel-isim",
                label: "👤 Özel İsimler",
                activeClass: "bg-teal-600 border-teal-700 text-white",
              },
              {
                id: "fiil",
                label: "⚡ Fiiller",
                activeClass: "bg-amber-600 border-amber-700 text-white",
              },
              {
                id: "edat",
                label: "🔗 Edat & Kalıplar",
                activeClass: "bg-purple-600 border-purple-700 text-white",
              },
            ] as { id: TypeFilter; label: string; activeClass: string }[]
          ).map((t) => {
            const active = typeFilter === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  playClick();
                  setTypeFilter(t.id);
                }}
                className={`px-2.5 py-1 text-xs rounded-lg border transition-all whitespace-nowrap shrink-0 cursor-pointer ${
                  active
                    ? `${t.activeClass} font-bold shadow-2xs`
                    : "bg-white dark:bg-[var(--background)] border-[#E6D7BE] dark:border-[var(--border)] text-[var(--muted)] font-medium hover:text-[var(--foreground)]"
                }`}
              >
                {t.label}
              </button>
            );
          })}
        </div>

        {/* Mobilde [SlidersHorizontal] Filtreler Açıkken Diyalog Seçici ve Öğrenme Durumu */}
        {mobileFiltersOpen && (
          <div className="sm:hidden pt-2 border-t border-dashed border-[#E2D3B8] space-y-2">
            <div className="bg-white dark:bg-[var(--background)] rounded-xl px-2.5 h-9 border border-[#E6D7BE] dark:border-[var(--border)] flex items-center justify-between">
              <span className="text-[11px] font-bold text-[var(--muted)] mr-2 shrink-0">
                Diyalog:
              </span>
              <select
                value={selectedDialogueId}
                onChange={(e) => {
                  playClick();
                  setSelectedDialogueId(e.target.value);
                }}
                className="bg-transparent text-xs font-bold text-[var(--foreground)] focus:outline-none cursor-pointer w-full truncate"
              >
                <option value="all">Tüm Sözlük ({sozluk.length})</option>
                {diyaloglar.map((dlg) => {
                  const num = dlg.id.replace("dlg_", "");
                  return (
                    <option key={dlg.id} value={dlg.id}>
                      #{num} — {dlg.baslik_tr} ({dlg.seviye})
                    </option>
                  );
                })}
              </select>
            </div>

            <div className="flex flex-wrap items-center gap-1">
              {(
                [
                  { id: "all", label: "Tümü" },
                  {
                    id: "learned",
                    label: `Öğrendim (${mounted ? learnedWords.length : 0})`,
                  },
                  { id: "unlearned", label: "Yeni" },
                  {
                    id: "favorites",
                    label: `Favori (${mounted ? favoriteWords.length : 0})`,
                  },
                ] as { id: StatusFilter; label: string }[]
              ).map((tab) => {
                const active = statusFilter === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => {
                      playClick();
                      setStatusFilter(tab.id);
                    }}
                    className={`px-2.5 py-1 text-xs rounded-lg border transition-all whitespace-nowrap cursor-pointer ${
                      active
                        ? "bg-[#0CA678] border-[#087F5B] text-white font-semibold"
                        : "bg-white dark:bg-[var(--background)] border-[#E6D7BE] text-[var(--muted)] font-medium"
                    }`}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </section>

      {/* SÖZLÜK KARTLARI IZGARASI */}
      {filteredWords.length === 0 ? (
        <div className="bg-[#F7EFE1] dark:bg-[var(--surface)] rounded-2xl border-2 border-[#E6D7BE] dark:border-[var(--border)] border-b-4 p-10 text-center space-y-3">
          <p className="text-base font-extrabold text-[var(--foreground)]">
            Arama kriterlerinize uygun kelime bulunamadı.
          </p>
          <button
            type="button"
            onClick={() => {
              playClick();
              setSearch("");
              setSelectedDialogueId("all");
              setStatusFilter("all");
              setTypeFilter("all");
            }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#0CA678] text-white text-xs font-bold border-b-4 border-[#087F5B] cursor-pointer"
          >
            Filtreleri Temizle
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredWords.map((word) => {
            const isFav = mounted && isWordFavorite(word.id);
            const isLearned = mounted && isWordLearned(word.id);
            const isSpeaking = speakingWordId === word.id;
            const mainArabic = word.mufret || word.mazi || "";
            const contextEntry = dialogueContextMap?.get(word.id);
            const category = getWordCategory(word);
            const theme = getCategoryCardTheme(category);

            return (
              <div
                key={word.id}
                className={`rounded-2xl border-2 border-b-4 ${
                  theme.leftBorder
                } p-4 flex flex-col justify-between transition-all ${
                  isLearned
                    ? "bg-[#F3F0FF] dark:bg-[var(--lavender-bg)] border-[#6741D9]"
                    : "bg-[#F7EFE1] dark:bg-[var(--surface)] border-[#E6D7BE] dark:border-[var(--border)]"
                }`}
              >
                <div className="space-y-2.5">
                  {/* Üst Satır: Tür Rozeti (Fiil/İsim/Edat) + Kök + Arapça Ana Kelime */}
                  <div className="flex items-start justify-between gap-3 border-b border-dashed border-[#E2D3B8] dark:border-[var(--border-dashed)] pb-3">
                    <div className="space-y-1.5">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span
                          className={`px-2 py-0.5 rounded-md border text-[11px] font-extrabold ${theme.badgeClass}`}
                        >
                          {theme.badgeText}
                        </span>
                        {word.kok && word.kok !== "-" && (
                          <span className="text-xs font-bold text-[var(--muted)]">
                            Kök:{" "}
                            <strong className="arabic text-sm text-[var(--foreground)]">
                              {getDisplayArabic(word.kok)}
                            </strong>
                          </span>
                        )}
                      </div>

                      <p className="text-sm font-extrabold text-[var(--foreground)] leading-snug">
                        {word.anlam_tr}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleListenWord(word)}
                      title="Dinlemek için tıkla"
                      className="text-right group cursor-pointer shrink-0"
                    >
                      <span
                        dir="rtl"
                        className={`arabic text-3xl font-bold transition-colors block leading-tight ${theme.arabicColor}`}
                      >
                        {getDisplayArabic(mainArabic)}
                      </span>
                      {contextEntry?.contextWord && (
                        <span
                          dir="rtl"
                          className="text-xs md:text-sm font-medium text-[#6741D9] block mt-0.5"
                        >
                          Metinde:{" "}
                          <strong className="arabic text-base md:text-lg font-arabic font-bold">
                            {getDisplayArabic(contextEntry.contextWord)}
                          </strong>
                        </span>
                      )}
                    </button>
                  </div>

                  {/* Seçili Diyalog Bağlamı & Morfolojik Not */}
                  {contextEntry?.morphologyNote && (
                    <div className="bg-white dark:bg-[var(--background)] rounded-xl px-2.5 py-1.5 border border-[#E6D7BE] text-[11px] font-bold text-[#4C28B5]">
                      <span className="inline-flex items-center gap-1 text-[10px] uppercase text-[#6741D9] block">
                        <Sparkles size={10} />
                        <span>Diyalogdaki Morfolojik Yapı:</span>
                      </span>
                      <span dir="rtl" className="block text-right">
                        {getDisplayArabic(contextEntry.morphologyNote)}
                      </span>
                    </div>
                  )}

                  {/* Orta Satır: Çekimler / Formlar (Tıklanabilir Sesli) */}
                  <div className="py-1.5 border-b border-dashed border-[#E2D3B8] dark:border-[var(--border-dashed)] flex flex-wrap items-center justify-between gap-2 text-xs md:text-sm font-medium">
                    {category === "fiil" || word.mazi || word.muzari ? (
                      <div className="flex flex-wrap items-center gap-1.5">
                        {word.muzari && (
                          <button
                            type="button"
                            onClick={() => handleListenWord(word, word.muzari)}
                            className="inline-flex items-center gap-1 bg-white dark:bg-[var(--background)] px-2 py-0.5 rounded-lg border border-[#E6D7BE] dark:border-[var(--border)] hover:border-amber-500 cursor-pointer"
                            title="Muzâri halini dinle"
                          >
                            <span className="text-xs md:text-sm font-medium text-[var(--muted)]">
                              Muzâri:
                            </span>
                            <span
                              dir="rtl"
                              className="arabic text-base md:text-lg font-arabic font-bold text-[var(--foreground)]"
                            >
                              {getDisplayArabic(word.muzari)}
                            </span>
                          </button>
                        )}
                        {word.masdar && (
                          <button
                            type="button"
                            onClick={() => handleListenWord(word, word.masdar)}
                            className="inline-flex items-center gap-1 bg-white dark:bg-[var(--background)] px-2 py-0.5 rounded-lg border border-[#E6D7BE] dark:border-[var(--border)] hover:border-amber-500 cursor-pointer"
                            title="Masdar halini dinle"
                          >
                            <span className="text-xs md:text-sm font-medium text-[var(--muted)]">
                              Masdar:
                            </span>
                            <span
                              dir="rtl"
                              className="arabic text-base md:text-lg font-arabic font-bold text-[var(--foreground)]"
                            >
                              {getDisplayArabic(word.masdar)}
                            </span>
                          </button>
                        )}
                        {!word.muzari && !word.masdar && (
                          <span className="text-[11px] font-medium text-amber-700 dark:text-amber-300">
                            Fiil Çekim Formu
                          </span>
                        )}
                      </div>
                    ) : category === "edat" ? (
                      <span className="text-[11px] font-medium text-purple-700 dark:text-purple-300">
                        Sabit Edat / Konuşma Kalıbı
                      </span>
                    ) : category === "ozel-isim" ? (
                      <span className="text-xs md:text-sm font-medium text-teal-700 dark:text-teal-300">
                        Müfret:{" "}
                        <strong className="arabic text-base md:text-lg font-arabic font-bold text-[var(--foreground)]">
                          {getDisplayArabic(mainArabic)}
                        </strong>
                      </span>
                    ) : (
                      <div className="flex flex-wrap items-center gap-2">
                        {word.mufret && (
                          <span className="text-xs md:text-sm font-medium text-[var(--muted)]">
                            Müfret:{" "}
                            <strong className="arabic text-base md:text-lg font-arabic font-bold text-[var(--foreground)]">
                              {getDisplayArabic(word.mufret)}
                            </strong>
                          </span>
                        )}
                        {word.cemi && word.cemi !== "-" ? (
                          <button
                            type="button"
                            onClick={() => handleListenWord(word, word.cemi)}
                            className="inline-flex items-center gap-1.5 bg-white dark:bg-[var(--background)] px-2.5 py-1 rounded-lg border border-[#E6D7BE] dark:border-[var(--border)] hover:border-sky-500 transition-colors cursor-pointer"
                            title="Çoğul halini sesli dinle"
                          >
                            <span className="text-xs md:text-sm font-medium text-[var(--muted)]">
                              Cemî:
                            </span>
                            <span
                              dir="rtl"
                              className="arabic text-base md:text-lg font-arabic font-bold text-[var(--foreground)]"
                            >
                              {getDisplayArabic(word.cemi)}
                            </span>
                            <Volume2 size={12} className="text-sky-600" />
                          </button>
                        ) : (
                          !word.mufret && (
                            <span className="text-[11px] font-medium text-[var(--muted)]">
                              Tekil İsim Formu
                            </span>
                          )
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Alt Aksiyon Butonları */}
                <div className="pt-3 flex items-center justify-between gap-2">
                  {/* Sesli Dinle Butonu */}
                  <button
                    type="button"
                    onClick={() => handleListenWord(word)}
                    className={`flex-1 h-9 px-3 rounded-xl border-2 border-b-3 text-xs font-extrabold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                      isSpeaking
                        ? "bg-[#0CA678] border-[#087F5B] text-white"
                        : "bg-white dark:bg-[var(--background)] border-[#E6D7BE] dark:border-[var(--border)] text-[var(--foreground)] hover:border-[#0CA678]"
                    }`}
                  >
                    <Volume2
                      size={15}
                      className={isSpeaking ? "text-white" : "text-[#0CA678]"}
                    />
                    <span>Dinle</span>
                  </button>

                  {/* Telaffuz / Gölgeleme Butonu */}
                  <button
                    type="button"
                    onClick={() => handleMicClick(word)}
                    className="h-9 px-3 rounded-xl bg-white dark:bg-[var(--background)] border-2 border-[#E6D7BE] dark:border-[var(--border)] border-b-3 text-xs font-extrabold text-[var(--foreground)] hover:border-[#6741D9] hover:text-[#6741D9] flex items-center justify-center gap-1 transition-all cursor-pointer"
                    title="Telaffuz & Mahreç Kontrolü"
                  >
                    <Mic size={14} />
                    <span>Telaffuz</span>
                  </button>

                  {/* Favori Butonu */}
                  <button
                    type="button"
                    onClick={() => {
                      playClick();
                      toggleFavoriteWord(word);
                    }}
                    title={isFav ? "Favorilerden Çıkar" : "Favorilere Ekle"}
                    className={`h-9 w-9 rounded-xl border-2 border-b-3 flex items-center justify-center transition-all cursor-pointer shrink-0 ${
                      isFav
                        ? "bg-red-50 border-red-300 text-red-600"
                        : "bg-white dark:bg-[var(--background)] border-[#E6D7BE] dark:border-[var(--border)] text-[var(--muted)] hover:text-red-500"
                    }`}
                  >
                    <Heart size={15} fill={isFav ? "currentColor" : "none"} />
                  </button>

                  {/* Öğrendim Butonu */}
                  <button
                    type="button"
                    onClick={() => {
                      playClick();
                      toggleLearnedWord(word.id);
                    }}
                    title={
                      isLearned
                        ? "Öğrenildi İşaretini Kaldır"
                        : "Öğrendim Olarak İşaretle"
                    }
                    className={`h-9 w-9 rounded-xl border-2 border-b-3 flex items-center justify-center transition-all cursor-pointer shrink-0 ${
                      isLearned
                        ? "bg-[#6741D9] border-[#5230B5] text-white"
                        : "bg-white dark:bg-[var(--background)] border-[#E6D7BE] dark:border-[var(--border)] text-[var(--muted)] hover:text-[#0CA678]"
                    }`}
                  >
                    <CheckCircle2 size={15} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}