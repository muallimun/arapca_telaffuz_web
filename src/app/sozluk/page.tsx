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
import {
  formatArabicText,
  splitMixedBidiText,
  normalizeArabicText,
} from "@/lib/arabicTextUtils";
import {
  ArabicIdiom,
  getCombinedIdiomsCatalog,
  extractDialogueIdioms,
} from "@/lib/arabicIdioms";
import { resolveMistakesPool } from "@/lib/mistakeUtils";

type StatusFilter = "all" | "learned" | "unlearned" | "favorites" | "mistakes";
type TypeFilter =
  | "all"
  | "isim"
  | "ozel-isim"
  | "fiil"
  | "edat"
  | "ifade";

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
    itemId?: string;
    forms: { label: string; arabic: string }[];
  } | null>(null);

  const {
    toggleFavoriteWord,
    isWordFavorite,
    toggleLearnedWord,
    isWordLearned,
    favoriteWords,
    learnedWords,
    mistakeIds,
    removeMistake,
    isMistake,
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

  // Kalıp ifade (idiom_ / idm_) ID'lerini ve zengin detaylarını çözümleyen katalog haritası
  const { idiomsByIdMap, idiomDetailsByIdMap, mergedCatalogIdiomsAsItems } =
    useMemo(() => {
      const idMap = new Map<string, DictionaryItem>();
      const detailMap = new Map<string, ArabicIdiom>();
      const catalogItems: DictionaryItem[] = [];
      const seenCleanAr = new Set<string>();

      // Önce sozluk içindeki mevcut "ifade" kayıtlarının Arapça metinlerini kaydet (mükerrerliği önlemek için)
      for (const w of sozluk) {
        if ((w.tur || "").toLowerCase() === "ifade" && (w.mufret || w.mazi)) {
          seenCleanAr.add(cleanArabicText(w.mufret || w.mazi || ""));
        }
      }

      const catalog = getCombinedIdiomsCatalog();
      for (const idm of catalog) {
        const canonicalId = idm.id.startsWith("idiom_")
          ? idm.id
          : `idiom_${idm.id}`;
        const item: DictionaryItem = {
          id: canonicalId,
          mufret: idm.arabic,
          anlam_tr: idm.meaningTr,
          kok: "-",
          tur: "ifade",
        };
        idMap.set(idm.id, item);
        idMap.set(canonicalId, item);
        idMap.set(`idm_${idm.id}`, item);

        detailMap.set(idm.id, idm);
        detailMap.set(canonicalId, idm);
        detailMap.set(`idm_${idm.id}`, idm);

        const cleanAr = cleanArabicText(idm.arabic);
        // Eğer sozluk içinde aynı Arapça kalıp ifade varsa ona da detailMap bilgisini bağla
        const existingInSozluk = sozluk.find(
          (w) => cleanArabicText(w.mufret || w.mazi || "") === cleanAr
        );
        if (existingInSozluk) {
          detailMap.set(existingInSozluk.id, idm);
        }

        if (!seenCleanAr.has(cleanAr)) {
          seenCleanAr.add(cleanAr);
          catalogItems.push(item);
        }
      }
      return {
        idiomsByIdMap: idMap,
        idiomDetailsByIdMap: detailMap,
        mergedCatalogIdiomsAsItems: catalogItems,
      };
    }, []);

  // Seçili diyaloğun morfolojik kelime haritası (getDialogueVocabulary ile)
  const dialogueContextMap = useMemo(() => {
    if (selectedDialogueId === "all") return null;
    const entries = getDialogueVocabulary(selectedDialogueId);
    const map = new Map<string, DialogueVocabularyEntry>();
    entries.forEach((e) => map.set(e.item.id, e));
    return map;
  }, [selectedDialogueId]);

  const totalAllItemsCount =
    sozluk.length + mergedCatalogIdiomsAsItems.length;

  const basePool = useMemo(() => {
    if (dialogueContextMap) {
      const vocabItems = Array.from(dialogueContextMap.values()).map(
        (e) => e.item
      );
      const dlgObj = diyaloglar.find((d) => d.id === selectedDialogueId);
      const dlgIdioms = dlgObj
        ? extractDialogueIdioms(dlgObj.satirlar, dlgObj.seviye)
        : [];
      const seenAr = new Set(
        vocabItems.map((v) => cleanArabicText(v.mufret || v.mazi || ""))
      );
      const extraDlgIdiomItems: DictionaryItem[] = [];
      for (const dIdm of dlgIdioms) {
        const cleanAr = cleanArabicText(dIdm.arabic);
        if (!seenAr.has(cleanAr)) {
          seenAr.add(cleanAr);
          const resolved = idiomsByIdMap.get(dIdm.id) || {
            id: `idiom_${dIdm.id}`,
            mufret: dIdm.arabic,
            anlam_tr: dIdm.meaningTr,
            kok: "-",
            tur: "ifade",
          };
          extraDlgIdiomItems.push(resolved);
        }
      }
      return [...vocabItems, ...extraDlgIdiomItems];
    }
    // Tüm sözlük + mükerrer olmayan Kalıp İfadeler kataloğu
    return [...sozluk, ...mergedCatalogIdiomsAsItems];
  }, [
    dialogueContextMap,
    selectedDialogueId,
    idiomsByIdMap,
    mergedCatalogIdiomsAsItems,
  ]);

  const filteredWords = useMemo(() => {
    let result: DictionaryItem[] = basePool;

    // 1. Öğrenilme / Favori / Zorlandıklarım durumuna göre filtreleme
    if (mounted) {
      if (statusFilter === "mistakes") {
        const resolvedMistakes = resolveMistakesPool(mistakeIds);
        const mistakeWordIds = new Set(resolvedMistakes.words.map((w) => w.id));
        const baseMap = new Map(result.map((w) => [w.id, w]));
        const finalMistakeWords: DictionaryItem[] = [];
        const seenM = new Set<string>();

        for (const mw of resolvedMistakes.words) {
          if (dialogueContextMap && !baseMap.has(mw.id)) continue;
          if (!seenM.has(mw.id)) {
            seenM.add(mw.id);
            finalMistakeWords.push(baseMap.get(mw.id) || mw);
          }
        }
        // Ayrıca raw mistakeIds içinde eşleşenleri kontrol et
        for (const w of result) {
          if (
            (mistakeWordIds.has(w.id) || isMistake(w.id)) &&
            !seenM.has(w.id)
          ) {
            seenM.add(w.id);
            finalMistakeWords.push(w);
          }
        }
        result = finalMistakeWords;
      } else if (statusFilter === "learned") {
        const baseIds = new Set(result.map((w) => w.id));
        const extraLearnedIdioms: DictionaryItem[] = [];
        if (!dialogueContextMap) {
          for (const lId of learnedWords) {
            if (!baseIds.has(lId) && idiomsByIdMap.has(lId)) {
              const resolved = idiomsByIdMap.get(lId)!;
              if (!baseIds.has(resolved.id)) {
                baseIds.add(resolved.id);
                extraLearnedIdioms.push(resolved);
              }
            }
          }
        }
        const learnedSet = new Set(learnedWords);
        result = [...result, ...extraLearnedIdioms].filter(
          (w) =>
            Boolean(w && w.id && (w.mufret || w.mazi) && w.anlam_tr) &&
            (learnedSet.has(w.id) ||
              learnedSet.has(w.id.replace(/^idiom_/, "")))
        );
      } else if (statusFilter === "unlearned") {
        const learnedSet = new Set(learnedWords);
        result = result.filter(
          (w) =>
            !learnedSet.has(w.id) &&
            !learnedSet.has(w.id.replace(/^idiom_/, ""))
        );
      } else if (statusFilter === "favorites") {
        const baseMap = new Map<string, DictionaryItem>();
        result.forEach((w) => baseMap.set(w.id, w));

        const resolvedFavorites: DictionaryItem[] = [];
        const seenFavIds = new Set<string>();

        for (const fw of favoriteWords) {
          if (!fw || !fw.id) continue;
          const fromBase = baseMap.get(fw.id);
          const fromIdiom = idiomsByIdMap.get(fw.id);
          const candidate: DictionaryItem | undefined =
            fromBase ||
            (fw.mufret || fw.mazi ? fw : undefined) ||
            fromIdiom;

          if (
            candidate &&
            (candidate.mufret || candidate.mazi) &&
            candidate.anlam_tr &&
            !seenFavIds.has(candidate.id)
          ) {
            if (!dialogueContextMap || baseMap.has(candidate.id)) {
              seenFavIds.add(candidate.id);
              resolvedFavorites.push(candidate);
            }
          }
        }
        result = resolvedFavorites;
      }
    }

    // 2. Kelime türüne göre filtreleme
    if (typeFilter === "ifade") {
      result = result.filter(
        (w) =>
          (w.tur || "").toLowerCase() === "ifade" ||
          w.id.startsWith("idiom_") ||
          idiomDetailsByIdMap.has(w.id)
      );
    } else if (typeFilter !== "all") {
      result = result.filter(
        (w) =>
          (w.tur || "").toLowerCase() !== "ifade" &&
          !w.id.startsWith("idiom_") &&
          getWordCategory(w) === typeFilter
      );
    }

    // 3. Arapça (çekimli/yalın/harekesiz/fonetik) veya Türkçe Anlık Arama
    if (search.trim()) {
      const qLower = search.trim().toLowerCase();
      const qCleanAr = cleanArabicText(search.trim());
      const qNormAr = normalizeArabicText(search.trim());
      const morphMatched = analyzeAndMatchWord(search.trim());

      result = result.filter((word) => {
        if (morphMatched && morphMatched.item.id === word.id) return true;
        const idmDetail = idiomDetailsByIdMap.get(word.id);
        const matchesTurkish =
          word.anlam_tr.toLowerCase().includes(qLower) ||
          Boolean(idmDetail?.literalTr?.toLowerCase().includes(qLower)) ||
          Boolean(idmDetail?.usageNote?.toLowerCase().includes(qLower));
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
        const matchesArabicNorm =
          qNormAr.length > 0 &&
          rawArFields.some((f) => normalizeArabicText(f).includes(qNormAr));

        return (
          matchesTurkish ||
          matchesArabicRaw ||
          matchesArabicClean ||
          matchesArabicNorm
        );
      });
    }

    return result.filter((w) =>
      Boolean(w && w.id && (w.mufret || w.mazi) && w.anlam_tr)
    );
  }, [
    basePool,
    dialogueContextMap,
    selectedDialogueId,
    typeFilter,
    statusFilter,
    search,
    mounted,
    learnedWords,
    favoriteWords,
    mistakeIds,
    isMistake,
    idiomsByIdMap,
    idiomDetailsByIdMap,
    mergedCatalogIdiomsAsItems,
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
      setShadowingTarget({ text: forms[0].arabic, itemId: word.id, forms });
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
          itemId={shadowingTarget.itemId}
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
          {filteredWords.length} / {basePool.length}
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
              <option value="all">Tüm Sözlük ({totalAllItemsCount})</option>
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
          <div className="hidden sm:flex bg-white dark:bg-[var(--background)] rounded-xl p-1 border border-[#E6D7BE] dark:border-[var(--border)] items-center gap-1 flex-wrap">
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
                {
                  id: "mistakes",
                  label: `⚡ Zorlandıklarım (${mounted ? mistakeIds.length : 0})`,
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
                      ? tab.id === "mistakes"
                        ? "bg-amber-600 text-white font-semibold shadow-2xs"
                        : "bg-[#0CA678] text-white font-semibold shadow-2xs"
                      : "text-[var(--muted)] font-medium hover:text-[var(--foreground)]"
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* 4. Mobil Uyumlu Kategori ve Hızlı Filtre Sekmeleri (Taşmasız Esnek Haplar) */}
        <div className="flex flex-wrap gap-1.5 sm:gap-2 items-center py-0.5">
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
                id: "fiil",
                label: "⚡ Fiiller",
                activeClass: "bg-amber-600 border-amber-700 text-white",
              },
              {
                id: "edat",
                label: "🔗 Edatlar",
                activeClass: "bg-purple-600 border-purple-700 text-white",
              },
              {
                id: "ozel-isim",
                label: "👤 Özel İsimler",
                activeClass: "bg-teal-600 border-teal-700 text-white",
              },
              {
                id: "ifade",
                label: "✨ Kalıp İfadeler",
                activeClass: "bg-[#6741D9] border-[#5230B5] text-white",
              },
            ] as { id: TypeFilter; label: string; activeClass: string }[]
          ).map((t) => {
            const active = typeFilter === t.id && statusFilter !== "mistakes";
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  playClick();
                  setTypeFilter(t.id);
                  if (statusFilter === "mistakes" && t.id === "all") {
                    setStatusFilter("all");
                  }
                }}
                className={`whitespace-nowrap px-3 py-1.5 text-xs sm:text-sm rounded-xl border transition-all shrink-0 cursor-pointer ${
                  active
                    ? `${t.activeClass} font-bold shadow-2xs`
                    : "bg-white dark:bg-[var(--background)] border-[#E6D7BE] dark:border-[var(--border)] text-[var(--muted)] font-medium hover:text-[var(--foreground)]"
                }`}
              >
                {t.label}
              </button>
            );
          })}

          {/* Hızlı Filtre: ⚡ Zorlandıklarım (Hem Mobil Hem Masaüstünde Tek Dokunuşla) */}
          <button
            type="button"
            onClick={() => {
              playClick();
              setStatusFilter((prev) =>
                prev === "mistakes" ? "all" : "mistakes"
              );
            }}
            className={`whitespace-nowrap px-3 py-1.5 text-xs sm:text-sm rounded-xl border transition-all shrink-0 cursor-pointer ${
              statusFilter === "mistakes"
                ? "bg-amber-600 border-amber-700 text-white font-bold shadow-2xs"
                : "bg-white dark:bg-[var(--background)] border-[#E6D7BE] dark:border-[var(--border)] text-amber-700 dark:text-amber-300 font-semibold hover:border-amber-400"
            }`}
          >
            ⚡ Zorlandıklarım ({mounted ? mistakeIds.length : 0})
          </button>
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
                <option value="all">Tüm Sözlük ({totalAllItemsCount})</option>
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

            <div className="flex flex-wrap items-center gap-1.5">
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
                  {
                    id: "mistakes",
                    label: `⚡ Zorlandıklarım (${mounted ? mistakeIds.length : 0})`,
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
                    className={`whitespace-nowrap px-3 py-1.5 text-xs rounded-xl border transition-all shrink-0 cursor-pointer ${
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
            {statusFilter === "mistakes"
              ? "Harika! Şu an hata defterinizde zorlandığınız bir kelime veya kalıp ifade bulunmuyor."
              : "Arama kriterlerinize uygun kelime veya kalıp ifade bulunamadı."}
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
            const isLearned =
              mounted &&
              (isWordLearned(word.id) ||
                isWordLearned(word.id.replace(/^idiom_/, "")));
            const isSpeaking = speakingWordId === word.id;
            const mainArabic = word.mufret || word.mazi || "";
            const contextEntry = dialogueContextMap?.get(word.id);
            const isIdiomCard =
              (word.tur || "").toLowerCase() === "ifade" ||
              word.id.startsWith("idiom_") ||
              idiomDetailsByIdMap.has(word.id);
            const idiomDetail = idiomDetailsByIdMap.get(word.id);
            const category = getWordCategory(word);
            const theme = isIdiomCard
              ? {
                  leftBorder: "border-l-4 border-l-[#6741D9]",
                  badgeText: "✨ Kalıp İfade (تعبير اصطلاحي)",
                  badgeClass:
                    "bg-[#F3F0FF] text-[#6741D9] border-[#6741D9]/30 dark:bg-indigo-950/70 dark:text-indigo-200 dark:border-indigo-500/40",
                  arabicColor:
                    "text-[#087F5B] dark:text-[#20c997] group-hover:text-[#0CA678]",
                }
              : getCategoryCardTheme(category);

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
                  {/* Üst Satır: Tür Rozeti + Kök + Arapça Ana Kelime / Kalıp İfade */}
                  <div className="flex items-start justify-between gap-3 border-b border-dashed border-[#E2D3B8] dark:border-[var(--border-dashed)] pb-3">
                    <div className="space-y-1.5 min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span
                          className={`px-2 py-0.5 rounded-md border text-[11px] font-extrabold ${theme.badgeClass}`}
                        >
                          {theme.badgeText}
                        </span>
                        {idiomDetail?.level && (
                          <span className="px-1.5 py-0.5 rounded-md bg-emerald-100 dark:bg-emerald-950/70 text-[#087F5B] dark:text-emerald-300 text-[10px] font-extrabold">
                            {idiomDetail.level}
                          </span>
                        )}
                        {!isIdiomCard && word.kok && word.kok !== "-" && (
                          <span
                            dir="ltr"
                            className="inline-flex items-center gap-1 text-xs font-bold text-[var(--muted)]"
                          >
                            <span>Kök:</span>
                            <bdi
                              dir="rtl"
                              className="arabic font-arabic text-sm font-bold text-[var(--foreground)] inline-block"
                            >
                              {getDisplayArabic(word.kok)}
                            </bdi>
                          </span>
                        )}
                      </div>

                      <p
                        dir="ltr"
                        className="text-sm font-extrabold text-[var(--foreground)] leading-snug text-left"
                      >
                        {splitMixedBidiText(word.anlam_tr).map((seg, sIdx) =>
                          seg.isArabic ? (
                            <bdi
                              key={sIdx}
                              dir="rtl"
                              className="arabic font-arabic font-bold inline-block mx-0.5"
                            >
                              {getDisplayArabic(seg.text)}
                            </bdi>
                          ) : (
                            <span key={sIdx}>{seg.text}</span>
                          )
                        )}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleListenWord(word)}
                      title="Dinlemek için tıkla"
                      className="text-right group cursor-pointer shrink-0 max-w-[55%]"
                    >
                      <span
                        dir="rtl"
                        className={`arabic font-arabic ${
                          isIdiomCard ? "text-2xl sm:text-3xl" : "text-3xl"
                        } font-bold transition-colors block leading-tight ${
                          theme.arabicColor
                        }`}
                      >
                        {getDisplayArabic(mainArabic)}
                      </span>
                      {contextEntry?.contextWord && (
                        <span
                          dir="ltr"
                          className="inline-flex items-center justify-end gap-1 text-xs md:text-sm font-medium text-[#6741D9] mt-0.5"
                        >
                          <span>Metinde:</span>
                          <bdi
                            dir="rtl"
                            className="arabic text-base md:text-lg font-arabic font-bold inline-block"
                          >
                            {getDisplayArabic(contextEntry.contextWord)}
                          </bdi>
                        </span>
                      )}
                    </button>
                  </div>

                  {/* Kalıp İfade Harfiyen Anlamı ve Kullanım İpucu Kutucuğu (Gece modu dark: uyumlu) */}
                  {isIdiomCard &&
                    (idiomDetail?.literalTr || idiomDetail?.usageNote) && (
                      <div
                        dir="ltr"
                        className="rounded-xl bg-white dark:bg-slate-900/90 border border-[#E6D7BE] dark:border-slate-700 p-2.5 space-y-1 text-left"
                      >
                        {idiomDetail.literalTr && (
                          <p className="text-xs font-bold text-[#4C28B5] dark:text-indigo-200 leading-snug">
                            <span className="font-extrabold">
                              Harfiyen Anlamı:
                            </span>{" "}
                            <span className="font-semibold text-[var(--foreground)] dark:text-slate-200">
                              {idiomDetail.literalTr}
                            </span>
                          </p>
                        )}
                        {idiomDetail.usageNote && (
                          <p className="text-[11px] font-semibold text-[var(--muted)] dark:text-slate-300 leading-snug">
                            <span className="font-extrabold text-[#087F5B] dark:text-emerald-300">
                              💡 Kullanım İpucu:
                            </span>{" "}
                            {idiomDetail.usageNote}
                          </p>
                        )}
                      </div>
                    )}

                  {/* Seçili Diyalog Bağlamı & Morfolojik Not */}
                  {contextEntry?.morphologyNote && (
                    <div
                      dir="ltr"
                      className="bg-white dark:bg-[var(--background)] rounded-xl px-2.5 py-1.5 border border-[#E6D7BE] text-[11px] font-bold text-[#4C28B5] text-left"
                    >
                      <span className="inline-flex items-center gap-1 text-[10px] uppercase text-[#6741D9] block mb-0.5">
                        <Sparkles size={10} />
                        <span>Diyalogdaki Morfolojik Yapı:</span>
                      </span>
                      <span dir="ltr" className="block text-left leading-relaxed">
                        {splitMixedBidiText(contextEntry.morphologyNote).map(
                          (seg, sIdx) =>
                            seg.isArabic ? (
                              <bdi
                                key={sIdx}
                                dir="rtl"
                                className="arabic font-arabic text-sm font-bold inline-block mx-0.5"
                              >
                                {getDisplayArabic(seg.text)}
                              </bdi>
                            ) : (
                              <span key={sIdx}>{seg.text}</span>
                            )
                        )}
                      </span>
                    </div>
                  )}

                  {/* Orta Satır: Çekimler / Formlar (Tıklanabilir Sesli) */}
                  {!isIdiomCard && (
                    <div className="py-1.5 border-b border-dashed border-[#E2D3B8] dark:border-[var(--border-dashed)] flex flex-wrap items-center justify-between gap-2 text-xs md:text-sm font-medium">
                      {category === "fiil" || word.mazi || word.muzari ? (
                        <div className="flex flex-wrap items-center gap-1.5">
                          {word.muzari && (
                            <button
                              type="button"
                              onClick={() =>
                                handleListenWord(word, word.muzari)
                              }
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
                              onClick={() =>
                                handleListenWord(word, word.masdar)
                              }
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
                  )}
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
                    <span>{isIdiomCard ? "Telaffuz Et" : "Telaffuz"}</span>
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
                      if (!isLearned && isMistake(word.id)) {
                        removeMistake(word.id);
                      }
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