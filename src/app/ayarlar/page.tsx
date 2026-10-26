"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSettings, ViewMode } from "@/store/settings";
import { Type, AlignLeft, Monitor, Eye, Settings2, ChevronLeft, Mic } from "lucide-react";

export default function SettingsPage() {
  const { 
    theme, toggleTheme, 
    viewMode, setViewMode, 
    showHareke, toggleHareke,
    showTooltips, toggleTooltips,
    showShadowing, toggleShadowing, // YENİ
    arabicFontSize, setArabicFontSize,
    turkishFontSize, setTurkishFontSize
  } = useSettings();

  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    if (theme === "dark") document.documentElement.classList.add("dark");
    else document.documentElement.classList.remove("dark");
  }, [theme]);

  if (!mounted) return null;

  const viewModes: { id: ViewMode; label: string; desc: string }[] = [
    { id: "stacked", label: "Alt Alta", desc: "Arapça üstte, Türkçe altta" },
    { id: "columns", label: "İki Sütun", desc: "Yan yana (Masaüstü)" },
    { id: "arabic-only", label: "Sadece Arapça", desc: "Çeviriyi gizle" },
    { id: "turkish-only", label: "Sadece Türkçe", desc: "Arapçayı gizle" },
  ];

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto min-h-[calc(100vh-6rem)]">
      <div className="flex items-center gap-3 mb-8">
        <Link href="/" className="p-2 rounded-full bg-[var(--surface)] border border-[var(--border)] hover:bg-[var(--border)] transition-colors mr-1">
          <ChevronLeft size={20} />
        </Link>
        <div className="p-2 bg-brand-100 text-brand-700 rounded-xl">
          <Settings2 size={24} />
        </div>
        <h1 className="text-2xl md:text-3xl font-extrabold text-[var(--foreground)]">Ayarlar</h1>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        {/* SOL SÜTUN */}
        <div className="space-y-6">
          <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Monitor className="text-[var(--muted)] w-5 h-5" />
                <div>
                  <h2 className="text-sm font-bold text-[var(--foreground)]">Görünüm</h2>
                  <p className="text-xs text-[var(--muted)]">Karanlık veya aydınlık tema seçin.</p>
                </div>
              </div>
              <button onClick={toggleTheme} className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${theme === "dark" ? "bg-brand-700" : "bg-gray-300"}`}>
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${theme === "dark" ? "translate-x-6" : "translate-x-1"}`} />
              </button>
            </div>
          </section>

          <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-sm space-y-5">
            <div className="flex items-center gap-3 border-b border-[var(--border)] pb-3">
              <Type className="text-[var(--muted)] w-5 h-5" />
              <h2 className="text-sm font-bold text-[var(--foreground)]">Metin Boyutları</h2>
            </div>
            
            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="text-xs font-bold text-[var(--muted)] flex items-center gap-2">
                  <span className="arabic font-bold text-lg">ع</span> Arapça Metin
                </label>
                <span className="text-xs font-bold bg-[var(--background)] border border-[var(--border)] px-2 py-0.5 rounded">{arabicFontSize}px</span>
              </div>
              <input type="range" min="20" max="60" step="2" value={arabicFontSize} onChange={(e) => setArabicFontSize(Number(e.target.value))} className="w-full accent-brand-700" />
            </div>

            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="text-xs font-bold text-[var(--muted)] flex items-center gap-2">
                  <AlignLeft className="w-4 h-4" /> Türkçe Metin
                </label>
                <span className="text-xs font-bold bg-[var(--background)] border border-[var(--border)] px-2 py-0.5 rounded">{turkishFontSize}px</span>
              </div>
              <input type="range" min="12" max="24" step="1" value={turkishFontSize} onChange={(e) => setTurkishFontSize(Number(e.target.value))} className="w-full accent-brand-700" />
            </div>
          </section>

          <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-sm space-y-4">
             <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold text-[var(--foreground)]">Harekeleri Göster</h2>
                <p className="text-xs text-[var(--muted)]">Arapça metindeki üstün, esre vb. göster.</p>
              </div>
              <button onClick={toggleHareke} className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${showHareke ? "bg-brand-700" : "bg-gray-300"}`}>
                <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${showHareke ? "translate-x-5" : "translate-x-1"}`} />
              </button>
            </div>

            <div className="flex items-center justify-between border-t border-[var(--border)] pt-4">
              <div>
                <h2 className="text-sm font-bold text-[var(--foreground)]">Sözlük İpuçları</h2>
                <p className="text-xs text-[var(--muted)]">Kelimelere tıklayınca anlamı göster.</p>
              </div>
              <button onClick={toggleTooltips} className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${showTooltips ? "bg-brand-700" : "bg-gray-300"}`}>
                <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${showTooltips ? "translate-x-5" : "translate-x-1"}`} />
              </button>
            </div>

            {/* YENİ: GÖLGELEME AYARI */}
            <div className="flex items-center justify-between border-t border-[var(--border)] pt-4">
              <div>
                <h2 className="text-sm font-bold text-[var(--foreground)] flex items-center gap-2">
                  <Mic size={14} className="text-brand-600"/> Gölgeleme (Ses Kaydı)
                </h2>
                <p className="text-xs text-[var(--muted)]">Cümleleri kendi sesinizle kaydedip dinleyin.</p>
              </div>
              <button onClick={toggleShadowing} className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${showShadowing ? "bg-brand-700" : "bg-gray-300"}`}>
                <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${showShadowing ? "translate-x-5" : "translate-x-1"}`} />
              </button>
            </div>
          </section>

        </div>

        {/* SAĞ SÜTUN */}
        <div className="space-y-6">
          <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-sm">
            <div className="flex items-center gap-3 border-b border-[var(--border)] pb-3 mb-4">
              <Eye className="text-[var(--muted)] w-5 h-5" />
              <h2 className="text-sm font-bold text-[var(--foreground)]">Diyalog Görünüm Modu</h2>
            </div>
            
            <div className="space-y-2">
              {viewModes.map((mode) => (
                <label key={mode.id} className={`flex items-start gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${viewMode === mode.id ? "border-brand-500 bg-brand-50 dark:bg-brand-900/20" : "border-[var(--border)] hover:border-brand-300"}`}>
                  <input type="radio" name="viewMode" value={mode.id} checked={viewMode === mode.id} onChange={() => setViewMode(mode.id)} className="mt-1 w-4 h-4 text-brand-700 focus:ring-brand-500" />
                  <div>
                    <span className="block text-sm font-bold text-[var(--foreground)]">{mode.label}</span>
                    <span className="block text-xs text-[var(--muted)] mt-0.5">{mode.desc}</span>
                  </div>
                </label>
              ))}
            </div>
          </section>
        </div>

      </div>
    </div>
  );
}