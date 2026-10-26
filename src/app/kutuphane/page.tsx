"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import {
  Search,
  ChevronLeft,
  Heart,
  CheckCircle2,
  BookOpen,
  Clock,
  Mic,
  AlertTriangle,
  SlidersHorizontal,
  Filter,
  ArrowRight,
  X,
} from "lucide-react";
import { diyaloglar } from "@/lib/data";
import { Level, DictionaryItem } from "@/types/data";
import { extractDialogueVocabulary, cleanArabicText } from "@/lib/dict";
import { useUserStore } from "@/store/userStore";
import { useSettings } from "@/store/settings";
import { playClick } from "@/lib/sfxManager";
import ShadowingModal from "@/components/ui/ShadowingModal";

type StatusFilter = "all" | "completed" | "ongoing" | "favorites";
type ViewSection = "dialogues" | "saved-words" | "weak-words";

export default function LibraryPage() {
  const {
    favoriteDialogues,
    completedDialogues,
    favoriteWords,
    weakWords,
    toggleFavoriteDialogue,
    toggleCompletedDialogue,
    toggleFavoriteWord,
    removeWeakWord,
  } = useUserStore();

  const { showHareke } = useSettings();

  const [mounted, setMounted] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [levelFilter, setLevelFilter] = useState<Level | "all">("all");
  const [activeSection, setActiveSection] = useState<ViewSection>("dialogues");

  const [shadowingTarget, setShadowingTarget] = useState<{
    text: string;
    forms: { label: string; arabic: string }[];
  } | null>(null);

  useEffect(() => {
    setMounted(true);
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const lvl = params.get("seviye") as Level | null;
      const durum = params.get("durum");
      if (lvl && ["A1", "A2", "B1", "B2"].includes(lvl)) {
        setLevelFilter(lvl);
      }
      if (durum === "completed") {
        setStatusFilter("completed");
      }
    }
  }, []);

  const removeTashkeel = (text: string) => text.replace(/[\u064B-\u0652]/g, "");
  const getDisplayArabic = (text: string) =>
    !mounted || showHareke ? text : removeTashkeel(text);

  // Diyalog Filtreleme
  const filteredDialogues = useMemo(() => {
    const q = search.trim().toLowerCase();
    const cleanQ = cleanArabicText(search.trim());

    return diyaloglar.filter((dlg) => {
      // 1. Arama Sorgusu
      if (q) {
        const matchTr = dlg.baslik_tr.toLowerCase().includes(q);
        const matchAr =
          dlg.baslik_ar.includes(search.trim()) ||
          cleanArabicText(dlg.baslik_ar).includes(cleanQ);
        const matchId = dlg.id.replace("dlg_", "").includes(q);
        const matchLines = dlg.satirlar.some(
          (s) =>
            s.turkce.toLowerCase().includes(q) ||
            cleanArabicText(s.arapca).includes(cleanQ)
        );
        if (!matchTr && !matchAr && !matchId && !matchLines) return false;
      }

      // 2. Durum Filtresi (Tümü / Tamamlananlar / Devam Edenler / Favoriler)
      if (mounted) {
        const isComp = completedDialogues.includes(dlg.id);
        const isFav = favoriteDialogues.includes(dlg.id);
        if (statusFilter === "completed" && !isComp) return false;
        if (statusFilter === "ongoing" && isComp) return false;
        if (statusFilter === "favorites" && !isFav) return false;
      }

      // 3. Seviye Filtresi
      if (levelFilter !== "all" && dlg.seviye !== levelFilter) return false;

      return true;
    });
  }, [
    search,
    statusFilter,
    levelFilter,
    mounted,
    completedDialogues,
    favoriteDialogues,
  ]);

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
        forms.push({ label: "Muzâri (Şimdiki)", arabic: word.muzari });
      if (word.masdar)
        forms.push({ label: "Masdar (İsim)", arabic: word.masdar });
    }
    return forms.length > 0 ? forms : null;
  };

  const handlePracticeWord = (word: DictionaryItem) => {
    playClick();
    const forms = prepareForms(word);
    if (forms) {
      setShadowingTarget({ text: forms[0].arabic, forms });
    }
  };

  // 001.jpg - 060.jpg arasında özel kapak görseli eşleştirme
  const getCoverImage = (dlgId: string) => {
    const rawNum = parseInt(dlgId.replace("dlg_", ""), 10) || 1;
    const mappedIndex = ((rawNum - 1) % 60) + 1;
    return `/gorseller/${String(mappedIndex).padStart(3, "0")}.jpg`;
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

      {/* ÜST BAŞLIK & MODÜL SEÇİCİ */}
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
              Diyalog Kütüphanesi
            </h1>
            <p className="text-xs font-medium text-[var(--muted)]">
              {diyaloglar.length} sesli Arapça diyalog, kelime defteri ve mahreç
              antrenmanları
            </p>
          </div>
        </div>

        {/* Alt Bölüm Geçiş Hapları */}
        <div className="bg-white dark:bg-[var(--background)] rounded-xl p-1 border-2 border-[#E6D7BE] dark:border-[var(--border)] flex items-center gap-1 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => {
              playClick();
              setActiveSection("dialogues");
            }}
            className={`px-3 py-1.5 rounded-lg text-xs transition-all whitespace-nowrap ${
              activeSection === "dialogues"
                ? "bg-[#0CA678] text-white font-semibold"
                : "text-[var(--muted)] font-medium hover:text-[var(--foreground)]"
            }`}
          >
            Diyaloglar ({diyaloglar.length})
          </button>
          <button
            type="button"
            onClick={() => {
              playClick();
              setActiveSection("saved-words");
            }}
            className={`px-3 py-1.5 rounded-lg text-xs transition-all whitespace-nowrap ${
              activeSection === "saved-words"
                ? "bg-[#0CA678] text-white font-semibold"
                : "text-[var(--muted)] font-medium hover:text-[var(--foreground)]"
            }`}
          >
            Kelime Defterim ({mounted ? favoriteWords.length : 0})
          </button>
          <button
            type="button"
            onClick={() => {
              playClick();
              setActiveSection("weak-words");
            }}
            className={`px-3 py-1.5 rounded-lg text-xs transition-all whitespace-nowrap ${
              activeSection === "weak-words"
                ? "bg-[#0CA678] text-white font-semibold"
                : "text-[var(--muted)] font-medium hover:text-[var(--foreground)]"
            }`}
          >
            Mahreç ({mounted ? weakWords.length : 0})
          </button>
        </div>
      </div>

      {activeSection === "dialogues" && (
        <>
          {/* ARAMA VE KESİK ÇİZGİLİ FİLTRE PANELİ */}
          <section className="bg-[#F7EFE1] dark:bg-[var(--surface)] rounded-2xl border-2 border-[#E6D7BE] dark:border-[var(--border)] border-b-4 px-4 sm:px-6 py-3">
            {/* Satır 1: Arama Çubuğu */}
            <div className="py-3 border-b border-dashed border-[#E2D3B8] dark:border-[var(--border-dashed)] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="relative flex-1">
                <Search
                  size={18}
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--muted)] pointer-events-none"
                />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Diyalog başlığı, Arapça ifade veya numara ara..."
                  className="w-full bg-white dark:bg-[var(--background)] border border-[#E6D7BE] dark:border-[var(--border)] rounded-xl pl-10 pr-9 py-2.5 text-sm font-medium text-[var(--foreground)] placeholder:text-[var(--muted)] focus:outline-none focus:border-[#0CA678]"
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch("")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--muted)] hover:text-[var(--foreground)]"
                    aria-label="Aramayı Temizle"
                  >
                    <X size={16} />
                  </button>
                )}
              </div>

              <div className="text-xs font-extrabold text-[var(--muted)] tabular-nums shrink-0">
                Gösterilen: {filteredDialogues.length} / {diyaloglar.length}{" "}
                Diyalog
              </div>
            </div>

            {/* Satır 2: İlerleme Durumu Filtresi (Tümü / Tamamlananlar / Devam Edenler) */}
            <div className="py-3 border-b border-dashed border-[#E2D3B8] dark:border-[var(--border-dashed)] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Filter size={16} className="text-[#087F5B]" />
                <span className="text-sm font-extrabold text-[var(--foreground)]">
                  Çalışma Durumu
                </span>
              </div>

              <div className="bg-white dark:bg-[var(--background)] rounded-xl p-1 border border-[#E6D7BE] dark:border-[var(--border)] flex flex-wrap items-center gap-1 self-start sm:self-auto">
                {(
                  [
                    { id: "all", label: "Tümü" },
                    {
                      id: "completed",
                      label: `Tamamlananlar (${
                        mounted ? completedDialogues.length : 0
                      })`,
                    },
                    {
                      id: "ongoing",
                      label: `Devam Edenler (${
                        mounted
                          ? diyaloglar.length - completedDialogues.length
                          : diyaloglar.length
                      })`,
                    },
                    {
                      id: "favorites",
                      label: `Favoriler (${
                        mounted ? favoriteDialogues.length : 0
                      })`,
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
                      className={`px-3 py-1.5 text-xs rounded-lg transition-all whitespace-nowrap ${
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

            {/* Satır 3: Seviye Filtresi */}
            <div className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <SlidersHorizontal size={16} className="text-[#087F5B]" />
                <span className="text-sm font-extrabold text-[var(--foreground)]">
                  Seviye Filtresi
                </span>
              </div>

              <div className="bg-white dark:bg-[var(--background)] rounded-xl p-1 border border-[#E6D7BE] dark:border-[var(--border)] flex items-center gap-1 self-start sm:self-auto">
                {(["all", "A1", "A2", "B1", "B2"] as (Level | "all")[]).map(
                  (lvl) => {
                    const active = levelFilter === lvl;
                    return (
                      <button
                        key={lvl}
                        type="button"
                        onClick={() => {
                          playClick();
                          setLevelFilter(lvl);
                        }}
                        className={`px-3 py-1.5 text-xs rounded-lg transition-all whitespace-nowrap ${
                          active
                            ? "bg-[#0CA678] text-white font-semibold shadow-2xs"
                            : "text-[var(--muted)] font-medium hover:text-[var(--foreground)]"
                        }`}
                      >
                        {lvl === "all" ? "Tümü" : lvl}
                      </button>
                    );
                  }
                )}
              </div>
            </div>
          </section>

          {/* DİYALOG KARTLARI IZGARASI */}
          {filteredDialogues.length === 0 ? (
            <div className="bg-[#F7EFE1] dark:bg-[var(--surface)] rounded-2xl border-2 border-[#E6D7BE] dark:border-[var(--border)] border-b-4 p-10 text-center space-y-3">
              <p className="text-base font-extrabold text-[var(--foreground)]">
                Aradığınız kriterlere uygun diyalog bulunamadı.
              </p>
              <button
                type="button"
                onClick={() => {
                  playClick();
                  setSearch("");
                  setStatusFilter("all");
                  setLevelFilter("all");
                }}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#0CA678] text-white text-xs font-bold border-b-4 border-[#087F5B]"
              >
                Filtreleri Sıfırla
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredDialogues.map((dlg) => {
                const dlgNo = dlg.id.replace("dlg_", "");
                const imagePath = getCoverImage(dlg.id);
                const wordCount = extractDialogueVocabulary(
                  dlg.satirlar.map((s) => s.arapca)
                ).length;
                const readTime = Math.max(
                  1,
                  Math.ceil(dlg.satirlar.length * 0.5)
                );
                const isComp =
                  mounted && completedDialogues.includes(dlg.id);
                const isFav =
                  mounted && favoriteDialogues.includes(dlg.id);

                return (
                  <div
                    key={dlg.id}
                    className={`rounded-2xl border-2 border-b-4 overflow-hidden flex flex-col justify-between transition-all hover:-translate-y-0.5 ${
                      isComp
                        ? "bg-[#F3F0FF] dark:bg-[var(--lavender-bg)] border-[#6741D9]"
                        : "bg-[#F7EFE1] dark:bg-[var(--surface)] border-[#E6D7BE] dark:border-[var(--border)]"
                    }`}
                  >
                    {/* Kapak Görseli (001.jpg - 060.jpg) */}
                    <Link
                      href={`/diyalog/${dlg.id}`}
                      onClick={() => playClick()}
                      className="relative h-36 w-full bg-[#E6D7BE] overflow-hidden block group"
                    >
                      <img
                        src={imagePath}
                        alt={dlg.baslik_tr}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />

                      <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5">
                        <span className="bg-white/95 text-[#2b241d] font-extrabold text-[11px] px-2.5 py-0.5 rounded-lg border border-[#E6D7BE] tabular-nums">
                          #{dlgNo}
                        </span>
                        <span className="bg-[#0CA678] text-white font-extrabold text-[11px] px-2 py-0.5 rounded-lg">
                          {dlg.seviye}
                        </span>
                      </div>

                      {isComp && (
                        <span className="absolute top-2.5 right-2.5 bg-[#6741D9] text-white text-[11px] font-bold px-2.5 py-0.5 rounded-lg flex items-center gap-1 shadow-xs">
                          <CheckCircle2 size={12} />
                          <span>Tamamlandı</span>
                        </span>
                      )}

                      <div className="absolute bottom-2 right-3 left-3 flex items-end justify-between gap-2">
                        <span className="text-white text-xs font-bold truncate drop-shadow-xs">
                          {dlg.baslik_tr}
                        </span>
                        <span
                          dir="rtl"
                          className="arabic text-white text-xl font-bold leading-none drop-shadow-xs shrink-0"
                        >
                          {getDisplayArabic(dlg.baslik_ar)}
                        </span>
                      </div>
                    </Link>

                    {/* Kart Gövdesi */}
                    <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
                      <div className="flex items-center justify-between text-xs text-[var(--muted)] font-semibold border-b border-dashed border-[#E2D3B8] dark:border-[var(--border-dashed)] pb-2.5">
                        <span className="inline-flex items-center gap-1 tabular-nums">
                          <BookOpen size={13} className="text-[#087F5B]" />
                          {dlg.satirlar.length} Cümle · {wordCount} Kelime
                        </span>
                        <span className="inline-flex items-center gap-1 tabular-nums">
                          <Clock size={13} />
                          {readTime} dk
                        </span>
                      </div>

                      {/* Aksiyon Satırı */}
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            playClick();
                            toggleFavoriteDialogue(dlg.id);
                          }}
                          title={
                            isFav ? "Favorilerden Çıkar" : "Favorilere Ekle"
                          }
                          className={`h-9 w-9 rounded-xl border-2 border-b-3 flex items-center justify-center transition-all shrink-0 ${
                            isFav
                              ? "bg-red-50 border-red-300 text-red-600"
                              : "bg-white dark:bg-[var(--background)] border-[#E6D7BE] dark:border-[var(--border)] text-[var(--muted)] hover:text-red-500"
                          }`}
                        >
                          <Heart
                            size={15}
                            fill={isFav ? "currentColor" : "none"}
                          />
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            playClick();
                            toggleCompletedDialogue(dlg.id);
                          }}
                          title={
                            isComp
                              ? "Tamamlandı İşaretini Kaldır"
                              : "Tamamlandı Olarak İşaretle"
                          }
                          className={`h-9 px-2.5 rounded-xl border-2 border-b-3 text-xs font-bold flex items-center gap-1 transition-all shrink-0 ${
                            isComp
                              ? "bg-[#6741D9] border-[#5230B5] text-white"
                              : "bg-white dark:bg-[var(--background)] border-[#E6D7BE] dark:border-[var(--border)] text-[var(--muted)] hover:text-[#087F5B]"
                          }`}
                        >
                          <CheckCircle2 size={14} />
                          <span className="hidden xl:inline">
                            {isComp ? "Bitti" : "Bitir"}
                          </span>
                        </button>

                        <Link
                          href={`/diyalog/${dlg.id}`}
                          onClick={() => playClick()}
                          className="flex-1 h-9 px-3 rounded-xl bg-[#0CA678] hover:bg-[#099268] text-white font-bold text-xs border-b-3 border-[#087F5B] active:border-b-0 active:translate-y-0.5 transition-all flex items-center justify-center gap-1.5"
                        >
                          <span>Diyaloğu Aç</span>
                          <ArrowRight size={14} />
                        </Link>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* KELİME DEFTERİM SEKME İÇERİĞİ */}
      {activeSection === "saved-words" && (
        <section className="space-y-4">
          {!mounted || favoriteWords.length === 0 ? (
            <div className="bg-[#F7EFE1] dark:bg-[var(--surface)] rounded-2xl border-2 border-[#E6D7BE] dark:border-[var(--border)] border-b-4 p-10 text-center space-y-3">
              <p className="text-base font-extrabold text-[var(--foreground)]">
                Kelime defterinizde henüz kayıtlı kelime bulunmuyor.
              </p>
              <p className="text-xs text-[var(--muted)]">
                Diyalog okurken veya Sözlük sayfasında kalp ikonuna tıklayarak
                kelimeleri buraya kaydedebilirsiniz.
              </p>
              <Link
                href="/sozluk"
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#0CA678] text-white text-xs font-bold border-b-4 border-[#087F5B]"
              >
                Sözlüğe Git
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {favoriteWords.map((word) => (
                <div
                  key={word.id}
                  className="bg-[#F7EFE1] dark:bg-[var(--surface)] rounded-2xl border-2 border-[#E6D7BE] dark:border-[var(--border)] border-b-4 p-4 flex flex-col justify-between space-y-3"
                >
                  <div className="flex items-start justify-between gap-2 border-b border-dashed border-[#E2D3B8] pb-3">
                    <div>
                      <span className="text-[11px] font-bold uppercase text-[#087F5B]">
                        {word.tur} · Kök: {word.kok}
                      </span>
                      <p className="text-sm font-extrabold text-[var(--foreground)] mt-1">
                        {word.anlam_tr}
                      </p>
                    </div>
                    <span
                      dir="rtl"
                      className="arabic text-3xl font-bold text-[#087F5B] dark:text-[#20c997]"
                    >
                      {getDisplayArabic(word.mufret || word.mazi || "")}
                    </span>
                  </div>

                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => handlePracticeWord(word)}
                      className="px-3 py-1.5 rounded-xl bg-white dark:bg-[var(--background)] border-2 border-[#E6D7BE] border-b-3 text-xs font-bold text-[var(--foreground)] flex items-center gap-1.5"
                    >
                      <Mic size={14} className="text-[#0CA678]" />
                      <span>Telaffuz Et</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        playClick();
                        toggleFavoriteWord(word);
                      }}
                      className="px-3 py-1.5 rounded-xl bg-red-50 border-2 border-red-200 border-b-3 text-xs font-bold text-red-600 flex items-center gap-1"
                    >
                      <Heart size={14} fill="currentColor" />
                      <span>Çıkar</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* MAHREÇ ANTRENMANI (ZAYIF KELİMELER) SEKME İÇERİĞİ */}
      {activeSection === "weak-words" && (
        <section className="space-y-4">
          {!mounted || weakWords.length === 0 ? (
            <div className="bg-[#F7EFE1] dark:bg-[var(--surface)] rounded-2xl border-2 border-[#E6D7BE] dark:border-[var(--border)] border-b-4 p-10 text-center space-y-2">
              <AlertTriangle
                size={36}
                className="mx-auto text-[#0CA678] mb-2"
              />
              <p className="text-base font-extrabold text-[var(--foreground)]">
                Harika! Mahreç tekrarı gerektiren zayıf kelimeniz yok.
              </p>
              <p className="text-xs text-[var(--muted)]">
                Gölgeleme çalışmalarında zorlandığınız kelimeler otomatik olarak
                buraya eklenir.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {weakWords.map((word) => (
                <div
                  key={word.id}
                  className="bg-[#F7EFE1] dark:bg-[var(--surface)] rounded-2xl border-2 border-[#E6D7BE] dark:border-[var(--border)] border-b-4 p-4 flex flex-col justify-between space-y-3"
                >
                  <div className="flex items-start justify-between gap-2 border-b border-dashed border-[#E2D3B8] pb-3">
                    <div>
                      <span className="text-[11px] font-bold text-amber-700">
                        Mahreç Tekrarı · Kök: {word.kok}
                      </span>
                      <p className="text-sm font-extrabold text-[var(--foreground)] mt-1">
                        {word.anlam_tr}
                      </p>
                    </div>
                    <span
                      dir="rtl"
                      className="arabic text-3xl font-bold text-[#6741D9]"
                    >
                      {getDisplayArabic(word.mufret || word.mazi || "")}
                    </span>
                  </div>

                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => handlePracticeWord(word)}
                      className="flex-1 py-2 px-3 rounded-xl bg-[#0CA678] text-white text-xs font-bold border-b-3 border-[#087F5B] flex items-center justify-center gap-1.5"
                    >
                      <Mic size={14} />
                      <span>Şimdi Çalış</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        playClick();
                        removeWeakWord(word.id);
                      }}
                      className="py-2 px-3 rounded-xl bg-white dark:bg-[var(--background)] border-2 border-[#E6D7BE] border-b-3 text-xs font-bold text-[var(--muted)] hover:text-[#087F5B]"
                      title="Listeden Tamamlandı Olarak Kaldır"
                    >
                      <CheckCircle2 size={15} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}