"use client";

import { useState, useEffect } from "react";
import {
  X,
  BookOpen,
  Rocket,
  Palette,
  GraduationCap,
  Info,
  Volume2,
  Repeat,
  Mic,
  Sparkles,
  FileText,
  Keyboard,
  Languages,
  Gauge,
  Heart,
  CheckCircle2,
  Target,
  Cpu,
  Smartphone,
} from "lucide-react";
import { playClick } from "@/lib/sfxManager";
import { triggerOnboardingTour } from "./OnboardingTourModal";

type GuideTab = "quickstart" | "icons" | "pedagogy" | "about";

export function triggerGuideModal(initialTab?: GuideTab) {
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("open-guide-modal", { detail: { tab: initialTab } })
    );
  }
}

export default function GuideAndInfoModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<GuideTab>("quickstart");

  useEffect(() => {
    const handleOpen = (e: Event) => {
      const custom = e as CustomEvent<{ tab?: GuideTab }>;
      if (custom.detail?.tab) {
        setActiveTab(custom.detail.tab);
      }
      setIsOpen(true);
    };
    window.addEventListener("open-guide-modal", handleOpen);
    return () => window.removeEventListener("open-guide-modal", handleOpen);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsOpen(false);
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [isOpen]);

  if (!isOpen) return null;

  const tabs: { id: GuideTab; label: string; icon: typeof Rocket }[] = [
    { id: "quickstart", label: "🚀 Hızlı Başlangıç", icon: Rocket },
    { id: "icons", label: "🎨 İkonlar & Renkler", icon: Palette },
    { id: "pedagogy", label: "🎓 5 Adımda Yöntem", icon: GraduationCap },
    { id: "about", label: "ℹ️ Uygulama Hakkında", icon: Info },
  ];

  return (
    <div
      className="fixed inset-0 z-50 bg-black/65 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4"
      onClick={() => setIsOpen(false)}
    >
      <div
        className="w-full max-w-2xl bg-[#FDFBF7] dark:bg-[var(--surface)] rounded-3xl border-2 border-[#E6D7BE] dark:border-[var(--border)] border-b-4 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150 flex flex-col max-h-[86vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* MODAL ÜST BAŞLIK */}
        <div className="bg-[#F7EFE1] dark:bg-[var(--background)] px-5 py-4 border-b-2 border-[#E6D7BE] dark:border-[var(--border)] flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#0CA678] border-b-3 border-[#087F5B] text-white flex items-center justify-center shrink-0">
              <BookOpen size={20} />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-extrabold text-[var(--foreground)] leading-tight">
                📖 Kullanım Kılavuzu & Uygulama Bilgisi
              </h2>
              <p className="text-xs font-semibold text-[var(--muted)]">
                Modüller, İkon Rehberi, 5 Adımlı Çalışma Yöntemi ve Teknik Künye
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              playClick();
              setIsOpen(false);
            }}
            className="w-9 h-9 rounded-xl bg-white dark:bg-[var(--surface)] border-2 border-[#E6D7BE] dark:border-[var(--border)] flex items-center justify-center text-[var(--muted)] hover:text-[var(--foreground)] cursor-pointer shrink-0"
            aria-label="Kapat"
          >
            <X size={18} />
          </button>
        </div>

        {/* 4 SEKME SEÇİCİ */}
        <div className="bg-[#F7EFE1]/60 dark:bg-[var(--background)]/60 px-4 py-2 border-b border-[#E6D7BE] dark:border-[var(--border)] grid grid-cols-2 sm:grid-cols-4 gap-1.5 shrink-0">
          {tabs.map((tab) => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  playClick();
                  setActiveTab(tab.id);
                }}
                className={`px-2.5 py-2 rounded-xl text-xs font-extrabold transition-all text-center truncate cursor-pointer ${
                  active
                    ? "bg-[#6741D9] text-white shadow-2xs"
                    : "bg-white dark:bg-[var(--surface)] text-[var(--muted)] hover:text-[var(--foreground)] border border-[#E6D7BE] dark:border-[var(--border)]"
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* SEKME İÇERİĞİ */}
        <div className="p-5 overflow-y-auto space-y-4 flex-1">
          {activeTab === "quickstart" && (
            <div className="space-y-4">
              {/* Tanıtım Turu Başlatma Kartı */}
              <div className="p-4 rounded-2xl bg-[#F3F0FF] dark:bg-[var(--lavender-bg)] border-2 border-[#6741D9] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <span className="text-xs sm:text-sm font-extrabold text-[#4C28B5] dark:text-[#d0bfff] block">
                    🎯 6 Adımlı Görsel Tanıtım Turu
                  </span>
                  <p className="text-xs text-[var(--muted)]">
                    Uygulamanın tüm özelliklerini adım adım interaktif kartlarla
                    inceleyin.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    playClick();
                    setIsOpen(false);
                    triggerOnboardingTour();
                  }}
                  className="px-4 py-2.5 rounded-xl bg-[#6741D9] hover:bg-[#5230B5] text-white text-xs font-extrabold border-b-3 border-[#3b1f8c] flex items-center justify-center gap-1.5 shrink-0 cursor-pointer"
                >
                  <Target size={15} />
                  <span>🎯 Etkileşimli Tanıtım Turunu Şimdi Başlat</span>
                </button>
              </div>

              {/* Modül Özeti */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-3.5 rounded-2xl bg-[#F7EFE1] dark:bg-[var(--background)] border border-[#E6D7BE] space-y-1">
                  <h3 className="text-xs sm:text-sm font-extrabold text-[#087F5B]">
                    1. Diyalog Kütüphanesi (60 Diyalog)
                  </h3>
                  <p className="text-xs text-[var(--muted)] leading-relaxed">
                    Başlangıç (A1-A2), Orta (B1) ve İleri (B2) kurlarında 60
                    özel görselli günlük konuşma diyaloğu.
                  </p>
                </div>

                <div className="p-3.5 rounded-2xl bg-[#F7EFE1] dark:bg-[var(--background)] border border-[#E6D7BE] space-y-1">
                  <h3 className="text-xs sm:text-sm font-extrabold text-[#6741D9]">
                    2. 4 Çalışma Modu & Ok Takibi
                  </h3>
                  <p className="text-xs text-[var(--muted)] leading-relaxed">
                    Dinle & İncele (canlı kelime/ok takibi + döngü), Telaffuz
                    Stüdyosu, Otomatik Mikrofonlu Rol Yapma ve Diyalog Sözlüğü.
                  </p>
                </div>

                <div className="p-3.5 rounded-2xl bg-[#F7EFE1] dark:bg-[var(--background)] border border-[#E6D7BE] space-y-1">
                  <h3 className="text-xs sm:text-sm font-extrabold text-amber-700">
                    3. İnteraktif Alıştırma Merkezi
                  </h3>
                  <p className="text-xs text-[var(--muted)] leading-relaxed">
                    3B Kelime/Cümle Kartları, Çoktan Seçmeli Test, Sürükle-Bırak
                    ve Dinle-Yaz (Klavyeli İmla) Boşluk Doldurma, Ok Çizimli
                    Eşleştirme.
                  </p>
                </div>

                <div className="p-3.5 rounded-2xl bg-[#F7EFE1] dark:bg-[var(--background)] border border-[#E6D7BE] space-y-1">
                  <h3 className="text-xs sm:text-sm font-extrabold text-sky-700">
                    4. Kurumsal A4 PDF Ders Notu
                  </h3>
                  <p className="text-xs text-[var(--muted)] leading-relaxed">
                    İki sütunlu tercüme (Sağda Arapça / Solda Türkçe), noktalı
                    boşluklu Kelime/İmla Testi tablosu ve Boşluk Doldurma çalışma
                    kağıdı.
                  </p>
                </div>
              </div>
            </div>
          )}

          {activeTab === "icons" && (
            <div className="space-y-4">
              {/* Kelime Türü Renk Sistemi */}
              <div className="space-y-2">
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-[#087F5B]">
                  Morfolojik Kelime Türü Renk Kodları
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border-2 border-amber-300 border-l-4 border-l-amber-500">
                    <span className="text-xs font-extrabold text-amber-800 dark:text-amber-300 block">
                      ⚡ Fiil (فعل) — Kehribar
                    </span>
                    <span className="text-[11px] text-[var(--muted)]">
                      Mâzî, Muzâri, Emir ve Masdar fiil çekimleri
                    </span>
                  </div>
                  <div className="p-3 rounded-xl bg-sky-50 dark:bg-sky-950/40 border-2 border-sky-300 border-l-4 border-l-sky-500">
                    <span className="text-xs font-extrabold text-sky-800 dark:text-sky-300 block">
                      📘 İsim (اسم) — Mavi
                    </span>
                    <span className="text-[11px] text-[var(--muted)]">
                      İsimler, sıfatlar, müfret (tekil) ve cemî (çoğul) kelimeler
                    </span>
                  </div>
                  <div className="p-3 rounded-xl bg-purple-50 dark:bg-purple-950/40 border-2 border-purple-300 border-l-4 border-l-purple-500">
                    <span className="text-xs font-extrabold text-purple-800 dark:text-purple-300 block">
                      🔗 Edat / Kalıp — Mor
                    </span>
                    <span className="text-[11px] text-[var(--muted)]">
                      Harf-i cerler, bağlaçlar, soru edatları ve kalıp ifadeler
                    </span>
                  </div>
                </div>
              </div>

              {/* İkon Rehberi Tablosu */}
              <div className="space-y-2">
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-[#6741D9]">
                  Uygulama İkonları ve Görevleri
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {[
                    {
                      icon: Volume2,
                      label: "🔊 Doğal Sesle Dinle",
                      desc: "Cümleyi veya kelimeyi yerel MP3 / Neural TTS ile seslendirir.",
                    },
                    {
                      icon: Repeat,
                      label: "🔁 Döngüde Tekrarla (Loop)",
                      desc: "Diyaloğu veya cümleyi 2x, 3x, 5x veya ∞ sonsuz döngüde çalar.",
                    },
                    {
                      icon: Mic,
                      label: "🎤 Gölgeleme Ses Kaydı",
                      desc: "Kendi telaffuzunuzu kaydedip referans sesle karşılaştırır.",
                    },
                    {
                      icon: Sparkles,
                      label: "✨ Mahreç Koçu / Hareke",
                      desc: "Üst barda harekeleri açıp kapatır; cümlede 38 mahreç analizini açar.",
                    },
                    {
                      icon: Languages,
                      label: "🌐 Çeviri Görünüm Modu",
                      desc: "Alt Alta, İki Sütun, Sadece Arapça ve Sadece Türkçe geçişi.",
                    },
                    {
                      icon: Gauge,
                      label: "⏱️ Seslendirme Hızı",
                      desc: "Konuşma hızını 0.5x, 0.75x, 1x ve 1.25x arasında değiştirir.",
                    },
                    {
                      icon: FileText,
                      label: "📄 A4 PDF Ders Notu",
                      desc: "Diyaloğu, kelime tablosunu ve boşluk doldurma testini A4 yazdırır.",
                    },
                    {
                      icon: Keyboard,
                      label: "⌨️ Sanal Arapça Klavye",
                      desc: "Boşluk doldurma İmla modunda ekrandan Arapça harf/hareke yazar.",
                    },
                    {
                      icon: Heart,
                      label: "❤️ Favori & Kelime Kartım",
                      desc: "Diyaloğu veya kelimeyi kişisel tekrar havuzunuza ekler.",
                    },
                    {
                      icon: CheckCircle2,
                      label: "✅ Tamamlandı / Öğrendim",
                      desc: "Diyaloğu veya kelimeyi öğrenildi olarak işaretler.",
                    },
                  ].map((item, i) => {
                    const Icon = item.icon;
                    return (
                      <div
                        key={i}
                        className="flex items-start gap-2.5 p-2.5 rounded-xl bg-white dark:bg-[var(--background)] border border-[#E6D7BE]"
                      >
                        <div className="w-8 h-8 rounded-lg bg-[#F7EFE1] dark:bg-[var(--surface)] border border-[#E6D7BE] flex items-center justify-center text-[#087F5B] shrink-0">
                          <Icon size={15} />
                        </div>
                        <div>
                          <span className="block text-xs font-extrabold text-[var(--foreground)]">
                            {item.label}
                          </span>
                          <span className="block text-[11px] text-[var(--muted)] leading-snug">
                            {item.desc}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {activeTab === "pedagogy" && (
            <div className="space-y-3">
              <p className="text-xs font-semibold text-[var(--muted)]">
                Bir diyaloğu en kalıcı ve akıcı şekilde öğrenmek için önerilen
                5 adımlı çalışma sırası:
              </p>

              {[
                {
                  step: "1",
                  title: "Gözle ve Canlı Ok Takibiyle Dinleyin",
                  desc: "Önce 'Dinle & İncele' modunda diyaloğu 0.75x veya 1x hızda çalıştırın. Zümrüt karaoke vurgusu ve ok (▼) ile her kelimenin telaffuz süresini ve med/şedde vurgularını gözünüzle takip edin.",
                },
                {
                  step: "2",
                  title: "Kelime Köklerini ve Tür Renklerini İnceleyin",
                  desc: "Cümledeki kelimelere tıklayarak üçlü sülâsî kökünü, Fiil (Kehribar) / İsim (Mavi) / Edat (Mor) türünü ve çekim eklerini inceleyin; yeni kelimeleri ❤️ ile kartlarınıza ekleyin.",
                },
                {
                  step: "3",
                  title: "Telaffuz Stüdyosunda Mahreç Ölçümü Yapın",
                  desc: "Zorlandığınız cümlelerde 🎤 mikrofon veya ✨ koç ikonuna basarak kendi sesinizi kaydedin; 16kHz dalga zarfı ve 38 mahreç çifti geri bildirimine göre telaffuzunuzu düzeltin.",
                },
                {
                  step: "4",
                  title: "Rol Yapma (Roleplay) ile Canlandırın",
                  desc: "'🎭 Rol Yapma' sekmesine geçip bir karakter seçin. Uygulama karşı karakteri seslendirdikten sonra mikrofonunuz otomatik açılır; diyaloğu gerçek bir konuşma gibi tamamlayın.",
                },
                {
                  step: "5",
                  title: "İnteraktif Alıştırma & A4 PDF ile Pekiştirin",
                  desc: "Alıştırma Merkezi'nde Ok Çizimli Eşleştirme ve Dinle-Yaz İmla testlerini çözün; diyaloğun A4 PDF çıktısını alıp kağıt üzerinde kelime testiyle öğreniminizi kalıcı hale getirin.",
                },
              ].map((item) => (
                <div
                  key={item.step}
                  className="p-3.5 rounded-2xl bg-[#F7EFE1] dark:bg-[var(--background)] border-2 border-[#E6D7BE] flex items-start gap-3"
                >
                  <span className="w-8 h-8 rounded-xl bg-[#0CA678] text-white font-black text-sm flex items-center justify-center shrink-0">
                    {item.step}
                  </span>
                  <div className="space-y-0.5">
                    <h4 className="text-xs sm:text-sm font-extrabold text-[var(--foreground)]">
                      {item.title}
                    </h4>
                    <p className="text-xs text-[var(--muted)] leading-relaxed">
                      {item.desc}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {activeTab === "about" && (
            <div className="space-y-3.5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-3.5 rounded-2xl bg-white dark:bg-[var(--background)] border border-[#E6D7BE] space-y-1">
                  <div className="flex items-center gap-2 text-xs font-extrabold text-[#087F5B]">
                    <BookOpen size={15} />
                    <span>Dilbilimsel Veri Tabanı</span>
                  </div>
                  <p className="text-xs text-[var(--muted)] leading-relaxed">
                    CEFR (A1–B2) standartlarına uyumlu 60 özgün diyalog, 930+
                    müfret/cemî/mâzî/muzâri/masdar kayıtlı sözlük ve 5 kademeli
                    Arapça morfolojik çözümleyici.
                  </p>
                </div>

                <div className="p-3.5 rounded-2xl bg-white dark:bg-[var(--background)] border border-[#E6D7BE] space-y-1">
                  <div className="flex items-center gap-2 text-xs font-extrabold text-[#6741D9]">
                    <Cpu size={15} />
                    <span>16kHz DSP & 38 Mahreç Motoru</span>
                  </div>
                  <p className="text-xs text-[var(--muted)] leading-relaxed">
                    Web Audio API tabanlı 16kHz ses zarfı (envelope) analizi,
                    dinamik zaman bükme (DTW) ritim skoru ve 38 Arapça mahreç
                    çifti için fonetik teşhis motoru.
                  </p>
                </div>

                <div className="p-3.5 rounded-2xl bg-white dark:bg-[var(--background)] border border-[#E6D7BE] space-y-1">
                  <div className="flex items-center gap-2 text-xs font-extrabold text-amber-700">
                    <Sparkles size={15} />
                    <span>Akıllı Tipografi & Hibrit Ses</span>
                  </div>
                  <p className="text-xs text-[var(--muted)] leading-relaxed">
                    Lafzatullah ve şedde/hareke çakışmalarını önleyen OpenType
                    tipografi motoru; Yerel MP3 + Neural TTS + Offline Web
                    Speech 3 katmanlı ses mimarisi.
                  </p>
                </div>

                <div className="p-3.5 rounded-2xl bg-white dark:bg-[var(--background)] border border-[#E6D7BE] space-y-1">
                  <div className="flex items-center gap-2 text-xs font-extrabold text-sky-700">
                    <Smartphone size={15} />
                    <span>Çevrimdışı PWA & Veri Gizliliği</span>
                  </div>
                  <p className="text-xs text-[var(--muted)] leading-relaxed">
                    Tüm çalışma ilerlemeniz ve ses kayıtlarınız cihazınızda
                    güvenle saklanır; JSON yedekleme ve çevrimdışı PWA kurulum
                    desteği sunar.
                  </p>
                </div>
              </div>

              <div className="p-3.5 rounded-2xl bg-[#F7EFE1] dark:bg-[var(--background)] border border-dashed border-[#cbb692] flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="font-extrabold text-[var(--foreground)]">
                  Arapça Telaffuz ve Diyalog Stüdyosu · Sürüm 2.5 (Kurumsal Eğitim Sürümü)
                </span>
                <a
                  href="https://muallimun.net"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-extrabold text-[#087F5B] underline"
                >
                  muallimun.net
                </a>
              </div>
            </div>
          )}
        </div>

        {/* ALT KAPAT BUTONU */}
        <div className="bg-[#F7EFE1] dark:bg-[var(--background)] px-5 py-3 border-t-2 border-[#E6D7BE] dark:border-[var(--border)] flex items-center justify-end shrink-0">
          <button
            type="button"
            onClick={() => {
              playClick();
              setIsOpen(false);
            }}
            className="h-9 px-5 rounded-xl bg-[#0CA678] hover:bg-[#099268] text-white text-xs font-extrabold border-b-3 border-[#087F5B] cursor-pointer"
          >
            Anladım, Kapat
          </button>
        </div>
      </div>
    </div>
  );
}
