"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Search, Sparkles, BookOpen, Clock, Hash } from "lucide-react";
import { diyaloglar } from "@/lib/data";
import { Level } from "@/types/data";
import { extractDialogueVocabulary } from "@/lib/dict";

export default function Home() {
  const [search, setSearch] = useState("");
  const [levelFilter, setLevelFilter] = useState<Level | "all">("all");

  const filteredDialogues = useMemo(() => {
    return diyaloglar.filter((d) => {
      const matchesSearch =
        d.baslik_tr.toLowerCase().includes(search.toLowerCase()) ||
        d.baslik_ar.includes(search);
      const matchesLevel = levelFilter === "all" || d.seviye === levelFilter;
      return matchesSearch && matchesLevel;
    });
  }, [search, levelFilter]);

  const levels: (Level | "all")[] = ["all", "A1", "A2", "B1", "B2"];

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6">
      
      {/* KOMPAKT BAŞLIK VE ARAMA ALANI */}
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-[var(--foreground)] tracking-tight flex items-center gap-2">
            <Sparkles className="text-brand-600 w-6 h-6" /> Kütüphane
          </h1>
          <p className="text-sm text-[var(--muted)] mt-1">
            Seviyene uygun diyaloglarla Arapça pratiği yap.
          </p>
        </div>

        {/* Arama Çubuğu */}
        <div className="relative w-full md:w-96">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-4 w-4 text-[var(--muted)]" />
          </div>
          <input
            type="text"
            placeholder="Diyalog ara..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-lg pl-9 pr-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 transition-all shadow-sm"
          />
        </div>
      </header>

      {/* KOMPAKT FİLTRELER */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-hide">
        <span className="text-xs font-bold text-[var(--muted)] uppercase tracking-wider mr-2">Seviye</span>
        {levels.map((lvl) => (
          <button
            key={lvl}
            onClick={() => setLevelFilter(lvl)}
            className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all border ${
              levelFilter === lvl
                ? "bg-brand-700 text-white border-brand-700 shadow-sm"
                : "bg-[var(--surface)] text-[var(--muted)] border-[var(--border)] hover:border-brand-400"
            }`}
          >
            {lvl === "all" ? "TÜMÜ" : lvl}
          </button>
        ))}
      </div>

      {/* DİYALOG GRID */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-6">
        {filteredDialogues.map((dlg) => {
          const dlgNo = dlg.id.replace("dlg_", "");
          const imagePath = `/gorseller/${dlgNo.padStart(3, "0")}.jpg`;
          const wordCount = extractDialogueVocabulary(dlg.satirlar.map(s => s.arapca)).length;
          const readTime = Math.ceil(dlg.satirlar.length * 0.5);

          return (
            <Link
              key={dlg.id}
              href={`/diyalog/${dlg.id}`}
              className="group flex flex-col rounded-xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden transition-all duration-300 hover:border-brand-500 hover:shadow-lg hover:-translate-y-1"
            >
              {/* KAPAK (Daha kısa) */}
              <div className="relative h-32 w-full bg-brand-50 overflow-hidden">
                <img
                  src={imagePath}
                  alt={dlg.baslik_tr}
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                  onError={(e) => {
                    const target = e.target as HTMLImageElement;
                    if (target.src.endsWith('.jpg')) target.src = target.src.replace('.jpg', '.png');
                    else if (target.src.endsWith('.png')) target.src = target.src.replace('.png', '.jpeg');
                    else target.style.display = 'none';
                  }}
                />
                <div className="absolute top-2 left-2 bg-black/60 backdrop-blur-md text-white font-bold text-[10px] px-2 py-1 rounded-md flex items-center gap-1">
                  <Hash size={10} /> {dlgNo}
                </div>
                <div className={`absolute top-2 right-2 bg-level-${dlg.seviye.toLowerCase()} text-white font-bold text-[10px] px-2 py-1 rounded-md shadow-sm`}>
                  {dlg.seviye}
                </div>
              </div>

              {/* İÇERİK */}
              <div className="p-4 flex flex-col justify-between flex-1">
                <div>
                  <h2 className="arabic text-xl font-bold mb-1 text-[var(--foreground)] group-hover:text-brand-700 transition-colors leading-tight">
                    {dlg.baslik_ar}
                  </h2>
                  <h3 className="text-xs font-medium text-[var(--muted)] line-clamp-1">
                    {dlg.baslik_tr}
                  </h3>
                </div>

                <div className="pt-3 mt-3 border-t border-[var(--border)] flex items-center justify-between text-[10px] font-bold text-[var(--muted)] uppercase tracking-wider">
                  <span className="flex items-center gap-1"><BookOpen size={12} /> {wordCount} KELİME</span>
                  <span className="flex items-center gap-1"><Clock size={12} /> {readTime} DK</span>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}