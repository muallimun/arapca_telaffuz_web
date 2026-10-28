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
  BookMarked,
  PenTool,
  Layers,
  FileCheck,
  Calendar,
  ExternalLink,
  Globe,
  Maximize2,
  Trophy,
  Timer,
} from "lucide-react";
import { playClick } from "@/lib/sfxManager";
import { triggerOnboardingTour } from "./OnboardingTourModal";

type GuideTab = "quickstart" | "icons" | "pedagogy" | "about" | "apps";

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
    { id: "apps", label: "🌐 Diğer Uygulamalarımız", icon: Globe },
  ];

  return (
    <div
      className="fixed inset-0 z-[60] print:hidden bg-black/65 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4"
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

        {/* 5 SEKME SEÇİCİ */}
        <div className="bg-[#F7EFE1]/60 dark:bg-[var(--background)]/60 px-3 sm:px-4 py-2 border-b border-[#E6D7BE] dark:border-[var(--border)] flex overflow-x-auto no-scrollbar flex-nowrap gap-1.5 shrink-0">
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
                className={`px-3 py-2 rounded-xl text-[11px] sm:text-xs font-extrabold transition-all text-center whitespace-nowrap shrink-0 cursor-pointer ${
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
        <div className="p-4 sm:p-5 pb-6 overflow-y-auto space-y-4 flex-1">
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
                    2. Diyalog, Sözlük & ✨ Kalıp İfadeler
                  </h3>
                  <p className="text-xs text-[var(--muted)] leading-relaxed">
                    Dinle & İncele (canlı kelime/ok takibi + döngü), Telaffuz
                    Stüdyosu, Otomatik Mikrofonlu Rol Yapma ve Diyalog Sözlüğü.{" "}
                    <strong className="text-[var(--foreground)]">
                      ✨ Kalıp İfadeler (التعبيرات الاصطلاحية):
                    </strong>{" "}
                    Her diyalogda geçen deyim ve kalıp ifadeleri harfiyen ve
                    deyimsel anlamlarıyla inceleyip sesli telaffuz pratiği yapın.
                  </p>
                </div>

                <div className="p-3.5 rounded-2xl bg-[#F7EFE1] dark:bg-[var(--background)] border border-[#E6D7BE] space-y-1">
                  <h3 className="text-xs sm:text-sm font-extrabold text-amber-700">
                    3. İnteraktif Alıştırma Merkezi (5 Mod)
                  </h3>
                  <p className="text-xs text-[var(--muted)] leading-relaxed">
                    3B Kelime/Cümle Kartları, Çoktan Seçmeli Test, Sürükle-Bırak
                    ve Dinle-Yaz (Klavyeli İmla) Boşluk Doldurma, Ok Çizimli
                    Eşleştirme ve{" "}
                    <strong className="text-[var(--foreground)]">
                      🧩 Dinle ve Sırala (Cümle Kurma):
                    </strong>{" "}
                    Diyalog cümlelerini dinleyip karışık verilen Arapça
                    kelimeleri sağdan sola (RTL) doğru sırayla dizerek cümle
                    kurma ve sentaks (nahiv) becerinizi geliştirin.
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

                <div className="sm:col-span-2 p-3.5 rounded-2xl bg-[#F7EFE1] dark:bg-[var(--background)] border border-[#E6D7BE] space-y-1">
                  <h3 className="text-xs sm:text-sm font-extrabold text-amber-800 dark:text-amber-300">
                    5. 🏆 Başarı Kartı Paylaşımı
                  </h3>
                  <p className="text-xs text-[var(--muted)] leading-relaxed">
                    Tamamladığınız diyalog ve alıştırma sonuçlarınızı tek tıkla
                    görsel başarı kartı (PNG) olarak indirip WhatsApp veya
                    Telegram&apos;da paylaşın.
                  </p>
                </div>
              </div>

              {/* Diğer 10 Uygulamamıza Hızlı Geçiş Butonu */}
              <button
                type="button"
                onClick={() => {
                  playClick();
                  setActiveTab("apps");
                }}
                className="w-full p-3.5 rounded-2xl bg-gradient-to-r from-emerald-600/10 via-teal-600/10 to-indigo-600/10 hover:from-emerald-600/20 hover:to-indigo-600/20 border-2 border-emerald-500/40 flex items-center justify-between gap-2 text-left transition-all cursor-pointer group"
              >
                <span className="text-xs sm:text-sm font-extrabold text-[#087F5B] dark:text-emerald-300 group-hover:underline">
                  🌐 Muallimun Ekosistemindeki Diğer 10 Uygulamamıza Göz Atın →
                </span>
                <span className="px-2.5 py-1 rounded-lg bg-[#0CA678] text-white text-[11px] font-extrabold shrink-0">
                  Keşfet
                </span>
              </button>
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
                    {
                      icon: Maximize2,
                      label: "⛶ Tam Ekran (Maximize2 / Minimize2)",
                      desc: "Uygulamayı mobil ve masaüstünde tam ekran (odaklanma) moduna alır.",
                    },
                    {
                      icon: Timer,
                      label: "🎙️ Gölgeleme Boşluğu",
                      desc: "Diyalog seçenekleri (...) menüsünden cümleler arası tekrar boşluğu bırakır.",
                    },
                    {
                      icon: Trophy,
                      label: "🏆 Başarı Kartı Paylaş",
                      desc: "Diyalog ve alıştırma sonunda başarı kartınızı PNG olarak indirir/paylaşır.",
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
                  desc: "Alıştırma Merkezi'nde Ok Çizimli Eşleştirme ve Dinle-Yaz İmla testlerini çözün; Dinle ve Sırala (Cümle Kurma) ile Arapça kelime dizilimini pekiştirin ve Başarı Kartınızı oluşturun; ayrıca diyaloğun A4 PDF çıktısını alıp kağıt üzerinde kelime testiyle öğreniminizi kalıcı hale getirin.",
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

              <button
                type="button"
                onClick={() => {
                  playClick();
                  setActiveTab("apps");
                }}
                className="w-full p-3.5 rounded-2xl bg-gradient-to-r from-emerald-600/10 via-teal-600/10 to-indigo-600/10 hover:from-emerald-600/20 hover:to-indigo-600/20 border-2 border-emerald-500/40 flex items-center justify-between gap-2 text-left transition-all cursor-pointer group"
              >
                <span className="text-xs sm:text-sm font-extrabold text-[#087F5B] dark:text-emerald-300 group-hover:underline">
                  🌐 Muallimun Ekosistemindeki Diğer 10 Uygulamamıza Göz Atın →
                </span>
                <span className="px-2.5 py-1 rounded-lg bg-[#0CA678] text-white text-[11px] font-extrabold shrink-0">
                  Keşfet
                </span>
              </button>
            </div>
          )}

          {activeTab === "apps" && (
            <div className="space-y-4">
              <div className="p-3 rounded-2xl bg-[#F7EFE1] dark:bg-[var(--background)] border border-[#E6D7BE] dark:border-[var(--border)] flex items-center justify-between gap-2">
                <div>
                  <h3 className="text-xs sm:text-sm font-extrabold text-[var(--foreground)]">
                    🌐 Muallimun Dijital Eğitim Ekosistemi (10 Kardeş Uygulama)
                  </h3>
                  <p className="text-[11px] text-[var(--muted)]">
                    İlgili uygulamaya tıklayarak yeni sekmede doğrudan açabilirsiniz.
                  </p>
                </div>
              </div>

              {[
                {
                  categoryTitle: "📖 Kur'an-ı Kerim & Mushaf Uygulamaları",
                  categoryColor: "text-[#087F5B] dark:text-emerald-300",
                  items: [
                    {
                      title: "Muallimun Dijital Mushaf",
                      url: "https://kuran.muallimun.net/mushaf/",
                      desc: "Sesli Kur'an-ı Kerim tilaveti, meal ve interaktif Mushaf inceleme platformu.",
                      icon: BookOpen,
                      badgeBg:
                        "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300",
                    },
                    {
                      title: "Kur'an Kelime & Meal Çalışması",
                      url: "https://kuran.muallimun.net/quran_vocab/",
                      desc: "Kur'an-ı Kerim kelimelerini ayet bağlamıyla öğrenme ve kelime analiz uygulaması.",
                      icon: Sparkles,
                      badgeBg:
                        "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300",
                    },
                  ],
                },
                {
                  categoryTitle: "🎓 Arapça Eğitim, Sözlük & Yazı Atölyesi",
                  categoryColor: "text-[#6741D9] dark:text-indigo-300",
                  items: [
                    {
                      title: "Arapça Telaffuz Asistanı",
                      url: "https://arapca.muallimun.net/arapca-telaffuz-asistani/",
                      desc: "Yapay zeka ve ses analizi destekli interaktif Arapça telaffuz geliştirme aracı.",
                      icon: Mic,
                      badgeBg:
                        "bg-indigo-100 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300",
                    },
                    {
                      title: "Muallimun Asistan Sözlük",
                      url: "https://arapca.muallimun.net/asistan_sozluk/",
                      desc: "Hızlı Arapça-Türkçe kelime arama, kök analizi ve sesli sözlük asistanı.",
                      icon: BookMarked,
                      badgeBg:
                        "bg-indigo-100 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300",
                    },
                    {
                      title: "Kitâbetü'l-Hurûf (Harf Yazma Atölyesi)",
                      url: "https://arapca.muallimun.net/kitabetulhuruf/",
                      desc: "Arapça harflerin yazılış yönlerini çizerek öğrenme ve interaktif hat pratiği.",
                      icon: PenTool,
                      badgeBg:
                        "bg-indigo-100 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300",
                    },
                    {
                      title: "Arapça Mobil Eğitim Portalı",
                      url: "https://arapca.muallimun.net/api/mobile/",
                      desc: "Mobil cihazlara özel interaktif Arapça ders ve alıştırma uygulaması.",
                      icon: Smartphone,
                      badgeBg:
                        "bg-indigo-100 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300",
                    },
                  ],
                },
                {
                  categoryTitle: "🏆 YDS / YÖKDİL Hazırlık & Kültür Araçları",
                  categoryColor: "text-amber-700 dark:text-amber-300",
                  items: [
                    {
                      title: "Arapça YDS Hazırlık Portalı",
                      url: "https://arapca.muallimun.net/YDS/",
                      desc: "Arapça YDS ve YÖKDİL sınavlarına yönelik kapsamlı soru, metin ve çalışma merkezi.",
                      icon: GraduationCap,
                      badgeBg:
                        "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300",
                    },
                    {
                      title: "Arapça YDS Kelimeler",
                      url: "https://arapca.muallimun.net/ydskelimeler/",
                      desc: "Sınavlarda en çok çıkan Arapça YDS kelimeleri, ezber kartları ve testler.",
                      icon: Layers,
                      badgeBg:
                        "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300",
                    },
                    {
                      title: "WhatsArapp YDS Platformu",
                      url: "https://whatsarappyds.rf.gd/Arapca_YDS/",
                      desc: "Pratik Arapça YDS soru çözümleri ve interaktif sınav hazırlık modülü.",
                      icon: FileCheck,
                      badgeBg:
                        "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300",
                    },
                    {
                      title: "Muallimun İnteraktif Takvim",
                      url: "https://www.muallimun.com/takvim/",
                      desc: "Namaz vakitleri, tarihte bugün İslam tarihi olayları ve Osmanlı atasözleri takvimi.",
                      icon: Calendar,
                      badgeBg:
                        "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300",
                    },
                  ],
                },
              ].map((group, gIdx) => (
                <div key={gIdx} className="space-y-2">
                  <h4
                    className={`text-xs font-extrabold uppercase tracking-wider ${group.categoryColor}`}
                  >
                    {group.categoryTitle}
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {group.items.map((app) => {
                      const AppIcon = app.icon;
                      return (
                        <a
                          key={app.url}
                          href={app.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={() => playClick()}
                          className="group p-3 rounded-2xl bg-white dark:bg-[var(--background)] border-2 border-[#E6D7BE] dark:border-[var(--border)] hover:-translate-y-0.5 hover:border-emerald-500/50 hover:shadow-md transition-all flex items-start gap-3"
                        >
                          <div
                            className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${app.badgeBg}`}
                          >
                            <AppIcon size={18} />
                          </div>
                          <div className="min-w-0 flex-1 space-y-0.5">
                            <div className="flex items-center justify-between gap-1.5">
                              <span className="text-xs font-extrabold text-[var(--foreground)] group-hover:text-[#087F5B] dark:group-hover:text-emerald-300 truncate">
                                {app.title}
                              </span>
                              <ExternalLink
                                size={12}
                                className="text-[var(--muted)] group-hover:text-[#087F5B] shrink-0"
                              />
                            </div>
                            <p className="text-[11px] text-[var(--muted)] leading-snug line-clamp-2">
                              {app.desc}
                            </p>
                          </div>
                        </a>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* DUYURU & PAYLAŞIM KANALLARIMIZ ŞERİDİ (TÜM SEKMELERDE GÖRÜNÜR) */}
          <div className="mt-4 pt-3 border-t border-stone-200/80 dark:border-slate-700/80 flex flex-col sm:flex-row items-center justify-between gap-2.5 bg-stone-100/60 dark:bg-slate-800/50 px-3.5 py-2.5 rounded-xl">
            <span className="text-xs font-medium text-slate-600 dark:text-slate-300 text-center sm:text-left">
              📢 Yeni diyalog, PDF ve güncellemelerden haberdar olmak için kanallarımıza katılın:
            </span>
            <div className="flex items-center gap-2 shrink-0">
              <a
                href="https://t.me/muallimun"
                target="_blank"
                rel="noopener noreferrer"
                title="Telegram Kanalımıza Katılın"
                onClick={() => playClick()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-500/10 hover:bg-sky-500/20 text-sky-700 dark:text-sky-300 border border-sky-500/25 text-xs font-semibold transition-all"
              >
                <svg
                  className="w-3.5 h-3.5 fill-current shrink-0"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
                </svg>
                <span>Telegram</span>
              </a>

              <a
                href="https://whatsapp.com/channel/0029VaAif947oQhgdaDMjK1Q"
                target="_blank"
                rel="noopener noreferrer"
                title="WhatsApp Kanalımızı Takip Edin"
                onClick={() => playClick()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-500/25 text-xs font-semibold transition-all"
              >
                <svg
                  className="w-3.5 h-3.5 fill-current shrink-0"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path d="M12.031 6.172c-3.181 0-5.767 2.586-5.768 5.766-.001 1.298.38 2.27 1.019 3.287l-.582 2.128 2.182-.573c.978.58 1.911.928 3.145.929 3.178 0 5.767-2.587 5.768-5.766.001-3.187-2.575-5.77-5.764-5.771zm3.392 8.244c-.144.405-.837.774-1.17.824-.299.045-.677.063-1.092-.069-.252-.08-.575-.187-.988-.365-1.739-.751-2.874-2.502-2.961-2.617-.087-.116-.708-.94-.708-1.793s.448-1.273.607-1.446c.159-.173.346-.217.462-.217l.332.006c.106.005.249-.04.39.298.144.347.491 1.2.534 1.287.043.087.072.188.014.304-.058.116-.087.188-.173.289l-.26.304c-.087.086-.177.18-.076.354.101.174.449.741.964 1.201.662.591 1.221.774 1.394.86s.274.072.376-.043c.101-.116.433-.506.549-.68.116-.173.231-.145.39-.087s1.011.477 1.184.564.289.13.332.202c.045.072.045.419-.1.824zm-3.423-14.416c-6.627 0-12 5.373-12 12 0 2.127.558 4.198 1.613 6.008L0 24l6.135-1.608A11.943 11.943 0 0 0 12.031 24c6.627 0 12-5.373 12-12s-5.373-12-12-12z" />
                </svg>
                <span>WhatsApp</span>
              </a>
            </div>
          </div>
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
