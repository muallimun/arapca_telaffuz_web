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
  BookOpen,
  Filter,
  Layers,
  X,
  Sparkles,
} from "lucide-react";
import { sozluk, diyaloglar } from "@/lib/data";
import { DictionaryItem } from "@/types/data";
import {
  getDialogueVocabulary,
  DialogueVocabularyEntry,
  cleanArabicText,
  analyzeAndMatchWord,
} from "@/lib/dict";
import { loadAudioManifest, playTTS } from "@/lib/audio";
import { useAudioStore } from "@/store/audioStore";
import { useUserStore } from "@/store/userStore";
import { useSettings } from "@/store/settings";
import { playClick } from "@/lib/sfxManager";
import ShadowingModal from "@/components/ui/ShadowingModal";

type StatusFilter = "all" | "learned" | "unlearned" | "favorites";
type TypeFilter = "all" | "isim" | "fiil";

export default function DictionaryPage() {
  const [mounted, setMounted] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedDialogueId, setSelectedDialogueId] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
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

  const { speechRate, showHareke } = useSettings();
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

  const removeTashkeel = (text: string) => text.replace(/[\u064B-\u0652]/g, "");
  const getDisplayArabic = (text: string) =>
    !mounted || showHareke ? text : removeTashkeel(text);

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

    // 1. Kelime türüne göre filtreleme
    if (typeFilter !== "all") {
      result = result.filter((w) => w.tur.toLowerCase() === typeFilter);
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
        await playAudio(`/mp3/words/${word.id}.mp3`, 0, rate);
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
    if (word.tur === "isim") {
      if (word.mufret)
        forms.push({ label: "Müfret (Tekil)", arabic: word.mufret });
      if (word.cemi && word.cemi !== "-")
        forms.push({ label: "Cemî (Çoğul)", arabic: word.cemi });
    } else if (word.tur === "fiil") {
      if (word.mazi) forms.push({ label: "Mâzî (Geçmiş)", arabic: word.mazi });
      if (word.muzari)
        forms.push({ label: "Muzâri (Şimdiki/Geniş)", arabic: word.muzari });
      if (word.masdar)
        forms.push({ label: "Masdar (İsim Hali)", arabic: word.masdar });
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

  return (
    <div className="space-y-5">
      {/* GÖLGELEME MODALI */}
      {shadowingTarget && (
        <ShadowingModal
          text={shadowingTarget.text}
          forms={shadowingTarget.forms}
          onClose={() => setShadowingTarget(null)}
        />
      )}

      {/* ÜST BAŞLIK */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            onClick={() => playClick()}
            className="w-10 h-10 rounded-xl bg-[#F7EFE1] dark:bg-[var(--surface)] border-2 border-[#E6D7BE] dark:border-[var(--border)] border-b-4 flex items-center justify-center text-[var(--foreground)] hover:bg-[#EFE3CE] active:border-b-2 active:translate-y-0.5 transition-all shrink-0"
            aria-label="Ana Sayfaya Dön"
          >
            <ChevronLeft size={20} strokeWidth={2.5} />
          </Link>
          <div>
            <h1 className="text-xl sm:text-2xl font-extrabold text-[var(--foreground)] tracking-tight">
              İnteraktif Morfolojik Arapça Sözlük
            </h1>
            <p className="text-xs font-medium text-[var(--muted)]">
              5 kademeli ek/zamir çözümleyici, kök harf arama ve diyaloğa göre
              eksiksiz kelime filtreleme
            </p>
          </div>
        </div>

        <div className="bg-[#F7EFE1] dark:bg-[var(--surface)] border-2 border-[#E6D7BE] dark:border-[var(--border)] border-b-4 rounded-xl px-3.5 py-2 text-xs font-extrabold text-[var(--foreground)] tabular-nums self-start sm:self-auto">
          Gösterilen: {filteredWords.length} / {sozluk.length} Kelime
        </div>
      </div>

      {/* ARAMA VE KESİK ÇİZGİLİ FİLTRE PANELİ */}
      <section className="bg-[#F7EFE1] dark:bg-[var(--surface)] rounded-2xl border-2 border-[#E6D7BE] dark:border-[var(--border)] border-b-4 px-4 sm:px-6 py-3">
        {/* Satır 1: Anlık Arapça/Türkçe Arama */}
        <div className="py-3 border-b border-dashed border-[#E2D3B8] dark:border-[var(--border-dashed)]">
          <div className="relative">
            <Search
              size={18}
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--muted)] pointer-events-none"
            />
            <input
              type="text"
              placeholder="Arapça (çekimli veya yalın), Türkçe anlam veya kök harf ara (ör: غرفتكم, بمعرفتك)..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-white dark:bg-[var(--background)] border border-[#E6D7BE] dark:border-[var(--border)] rounded-xl pl-10 pr-9 py-2.5 text-sm font-medium text-[var(--foreground)] placeholder:text-[var(--muted)] focus:outline-none focus:border-[#0CA678]"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--muted)] hover:text-[var(--foreground)] cursor-pointer"
                aria-label="Aramayı Temizle"
              >
                <X size={16} />
              </button>
            )}
          </div>
        </div>

        {/* Satır 2: Diyaloğa Göre Filtreleme */}
        <div className="py-3 border-b border-dashed border-[#E2D3B8] dark:border-[var(--border-dashed)] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <BookOpen size={16} className="text-[#087F5B] shrink-0" />
            <div>
              <span className="text-sm font-extrabold text-[var(--foreground)]">
                Diyaloğa Göre Kelime Filtresi
              </span>
              <span className="block text-xs text-[var(--muted)]">
                Tüm sözlüğü veya belirli bir diyaloğun tüm kelimelerini (dlg_01
                - dlg_60) seçin
              </span>
            </div>
          </div>

          <div className="bg-white dark:bg-[var(--background)] rounded-xl p-1 border border-[#E6D7BE] dark:border-[var(--border)] w-full sm:w-auto sm:min-w-[300px]">
            <select
              value={selectedDialogueId}
              onChange={(e) => {
                playClick();
                setSelectedDialogueId(e.target.value);
              }}
              className="w-full bg-transparent px-3 py-1.5 text-xs font-bold text-[var(--foreground)] focus:outline-none cursor-pointer"
            >
              <option value="all">
                Tüm Sözlük ({sozluk.length} Kelime)
              </option>
              {diyaloglar.map((dlg) => {
                const num = dlg.id.replace("dlg_", "");
                return (
                  <option key={dlg.id} value={dlg.id}>
                    Diyalog #{num} — {dlg.baslik_tr} ({dlg.seviye})
                  </option>
                );
              })}
            </select>
          </div>
        </div>

        {/* Satır 3: Öğrenme Durumu ve Kelime Türü Hapları */}
        <div className="py-3 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          {/* Öğrenme Durumu */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
            <span className="text-xs font-extrabold text-[var(--foreground)] flex items-center gap-1.5 mr-1">
              <Filter size={14} className="text-[#087F5B]" />
              Durum:
            </span>
            <div className="bg-white dark:bg-[var(--background)] rounded-xl p-1 border border-[#E6D7BE] dark:border-[var(--border)] flex flex-wrap items-center gap-1 w-fit">
              {(
                [
                  { id: "all", label: "Tümü" },
                  {
                    id: "learned",
                    label: `Öğrendiklerim (${
                      mounted ? learnedWords.length : 0
                    })`,
                  },
                  { id: "unlearned", label: "Öğrenmediklerim" },
                  {
                    id: "favorites",
                    label: `Favoriler (${mounted ? favoriteWords.length : 0})`,
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
                    className={`px-3 py-1.5 text-xs rounded-lg transition-all whitespace-nowrap cursor-pointer ${
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

          {/* Kelime Türü */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-extrabold text-[var(--foreground)] flex items-center gap-1.5">
              <Layers size={14} className="text-[#087F5B]" />
              Tür:
            </span>
            <div className="bg-white dark:bg-[var(--background)] rounded-xl p-1 border border-[#E6D7BE] dark:border-[var(--border)] flex items-center gap-1">
              {(
                [
                  { id: "all", label: "Tümü" },
                  { id: "isim", label: "İsim" },
                  { id: "fiil", label: "Fiil" },
                ] as { id: TypeFilter; label: string }[]
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
                    className={`px-3 py-1.5 text-xs rounded-lg transition-all whitespace-nowrap cursor-pointer ${
                      active
                        ? "bg-[#0CA678] text-white font-semibold shadow-2xs"
                        : "text-[var(--muted)] font-medium hover:text-[var(--foreground)]"
                    }`}
                  >
                    {t.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
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

            return (
              <div
                key={word.id}
                className={`rounded-2xl border-2 border-b-4 p-4 flex flex-col justify-between transition-all ${
                  isLearned
                    ? "bg-[#F3F0FF] dark:bg-[var(--lavender-bg)] border-[#6741D9]"
                    : "bg-[#F7EFE1] dark:bg-[var(--surface)] border-[#E6D7BE] dark:border-[var(--border)]"
                }`}
              >
                <div className="space-y-2.5">
                  {/* Üst Satır: Kök & Tür Etiketi + Arapça Ana Kelime */}
                  <div className="flex items-start justify-between gap-3 border-b border-dashed border-[#E2D3B8] dark:border-[var(--border-dashed)] pb-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-[var(--muted)]">
                        <span className="uppercase text-[#087F5B] dark:text-[#20c997]">
                          {word.tur}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>
                          Kök:{" "}
                          <strong className="arabic text-sm text-[var(--foreground)]">
                            {word.kok}
                          </strong>
                        </span>
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
                        className="arabic text-3xl font-bold text-[#087F5B] dark:text-[#20c997] group-hover:text-[#0CA678] transition-colors block leading-tight"
                      >
                        {getDisplayArabic(mainArabic)}
                      </span>
                      {contextEntry?.contextWord && (
                        <span
                          dir="rtl"
                          className="arabic text-xs font-bold text-[#6741D9] block mt-0.5"
                        >
                          Diyalogda: {getDisplayArabic(contextEntry.contextWord)}
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
                        {contextEntry.morphologyNote}
                      </span>
                    </div>
                  )}

                  {/* Orta Satır: Çekimler / Formlar (Tıklanabilir Sesli) */}
                  <div className="py-1.5 border-b border-dashed border-[#E2D3B8] dark:border-[var(--border-dashed)] flex flex-wrap items-center justify-between gap-2 text-xs">
                    {word.tur === "isim" ? (
                      <>
                        {word.cemi && word.cemi !== "-" ? (
                          <button
                            type="button"
                            onClick={() => handleListenWord(word, word.cemi)}
                            className="inline-flex items-center gap-1.5 bg-white dark:bg-[var(--background)] px-2.5 py-1 rounded-lg border border-[#E6D7BE] dark:border-[var(--border)] hover:border-[#0CA678] transition-colors cursor-pointer"
                            title="Çoğul halini sesli dinle"
                          >
                            <span className="font-bold text-[var(--muted)]">
                              Cemî:
                            </span>
                            <span
                              dir="rtl"
                              className="arabic text-base font-bold text-[var(--foreground)]"
                            >
                              {getDisplayArabic(word.cemi)}
                            </span>
                            <Volume2 size={12} className="text-[#0CA678]" />
                          </button>
                        ) : (
                          <span className="text-[11px] font-medium text-[var(--muted)]">
                            Tekil İsim Formu
                          </span>
                        )}
                      </>
                    ) : (
                      <div className="flex flex-wrap items-center gap-1.5">
                        {word.muzari && (
                          <button
                            type="button"
                            onClick={() => handleListenWord(word, word.muzari)}
                            className="inline-flex items-center gap-1 bg-white dark:bg-[var(--background)] px-2 py-0.5 rounded-lg border border-[#E6D7BE] dark:border-[var(--border)] hover:border-[#0CA678] cursor-pointer"
                            title="Muzâri halini dinle"
                          >
                            <span className="font-bold text-[var(--muted)]">
                              Muzâri:
                            </span>
                            <span
                              dir="rtl"
                              className="arabic text-base font-bold text-[var(--foreground)]"
                            >
                              {getDisplayArabic(word.muzari)}
                            </span>
                          </button>
                        )}
                        {word.masdar && (
                          <button
                            type="button"
                            onClick={() => handleListenWord(word, word.masdar)}
                            className="inline-flex items-center gap-1 bg-white dark:bg-[var(--background)] px-2 py-0.5 rounded-lg border border-[#E6D7BE] dark:border-[var(--border)] hover:border-[#0CA678] cursor-pointer"
                            title="Masdar halini dinle"
                          >
                            <span className="font-bold text-[var(--muted)]">
                              Masdar:
                            </span>
                            <span
                              dir="rtl"
                              className="arabic text-base font-bold text-[var(--foreground)]"
                            >
                              {getDisplayArabic(word.masdar)}
                            </span>
                          </button>
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