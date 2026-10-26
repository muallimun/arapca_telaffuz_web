"use client";

import { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import { Search, ChevronLeft, Heart, CheckCircle2, Brain, Mic } from "lucide-react";
import { sozluk } from "@/lib/data";
import { useUserStore } from "@/store/userStore";
import ShadowingModal from "@/components/ui/ShadowingModal";

export default function DictionaryPage() {
  const [search, setSearch] = useState("");
  const [filterMode, setFilterMode] = useState<"all" | "learned" | "unlearned">("all");
  const [mounted, setMounted] = useState(false);
  
  // YENİ: Modal state - text ve forms tutar
  const [shadowingTarget, setShadowingTarget] = useState<{ text: string; forms: { label: string; arabic: string }[] } | null>(null);

  const { toggleFavoriteWord, isWordFavorite, toggleLearnedWord, isWordLearned } = useUserStore();

  useEffect(() => { setMounted(true); }, []);

  const filteredWords = useMemo(() => {
    let result = sozluk;
    
    if (search.trim()) {
      const lowerSearch = search.toLowerCase();
      result = result.filter((word) => {
        const matchesTurkish = word.anlam_tr.toLowerCase().includes(lowerSearch);
        const matchesArabic = 
          (word.mufret || "").includes(search) || 
          (word.mazi || "").includes(search) || 
          (word.muzari || "").includes(search);
        return matchesTurkish || matchesArabic;
      });
    }

    if (filterMode === "learned") {
      result = result.filter(w => isWordLearned(w.id));
    } else if (filterMode === "unlearned") {
      result = result.filter(w => !isWordLearned(w.id));
    }

    return result;
  }, [search, filterMode, isWordLearned]);

  // YENİ: Kelimenin tüm formlarını hazırlayan fonksiyon
  const prepareForms = (word: any) => {
    const forms = [];
    if (word.tur === "isim") {
      if (word.mufret) forms.push({ label: "Müfret (Tekil)", arabic: word.mufret });
      if (word.cemi && word.cemi !== "-") forms.push({ label: "Cemî (Çoğul)", arabic: word.cemi });
    } else if (word.tur === "fiil") {
      if (word.mazi) forms.push({ label: "Mâzî (Geçmiş)", arabic: word.mazi });
      if (word.muzari) forms.push({ label: "Muzâri (Şimdiki/Geniş)", arabic: word.muzari });
      if (word.masdar) forms.push({ label: "Masdar (İsim Hali)", arabic: word.masdar });
    }
    // Eğer hiç form yoksa (hatalı veri), sadece anlam_tr ile aç ya da hiç açma
    if (forms.length === 0) return null;
    return forms;
  };

  const handleMicClick = (word: any) => {
    const forms = prepareForms(word);
    if (forms && forms.length > 0) {
      setShadowingTarget({ text: forms[0].arabic, forms });
    } else {
      alert("Bu kelimenin telaffuz edilebilecek bir formu bulunamadı.");
    }
  };

  if (!mounted) return null;

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6 min-h-screen pb-24 relative">
      
      {/* GÖLGELEME MODALI */}
      {shadowingTarget && (
        <ShadowingModal 
          text={shadowingTarget.text} 
          forms={shadowingTarget.forms}
          onClose={() => setShadowingTarget(null)} 
        />
      )}

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link href="/" className="p-2 rounded-full bg-[var(--surface)] border border-[var(--border)] hover:bg-[var(--border)] transition-colors">
            <ChevronLeft size={20} />
          </Link>
          <h1 className="text-2xl md:text-3xl font-extrabold text-brand-700">Sözlük</h1>
        </div>
        <div className="text-sm font-bold text-[var(--muted)] bg-[var(--surface)] border border-[var(--border)] px-3 py-1.5 rounded-lg w-fit">
          Toplam: {sozluk.length} Kelime
        </div>
      </div>

      <div className="flex flex-col md:flex-row gap-4">
        <div className="relative w-full md:max-w-md">
          <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
            <Search className="h-5 w-5 text-[var(--muted)]" />
          </div>
          <input
            type="text"
            placeholder="Arapça veya Türkçe kelime ara..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-xl pl-11 pr-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-brand-500 shadow-sm transition-all"
          />
        </div>

        <div className="flex items-center bg-[var(--surface)] border border-[var(--border)] rounded-xl p-1 shadow-sm w-fit overflow-x-auto">
          <button onClick={() => setFilterMode("all")} className={`px-4 py-2 text-xs font-bold rounded-lg transition-all whitespace-nowrap ${filterMode === "all" ? "bg-brand-100 text-brand-700" : "text-[var(--muted)] hover:bg-[var(--border)]"}`}>Tümü</button>
          <button onClick={() => setFilterMode("learned")} className={`px-4 py-2 text-xs font-bold rounded-lg transition-all flex items-center gap-1 whitespace-nowrap ${filterMode === "learned" ? "bg-green-100 text-green-700" : "text-[var(--muted)] hover:bg-[var(--border)]"}`}><CheckCircle2 size={14}/> Öğrendiklerim</button>
          <button onClick={() => setFilterMode("unlearned")} className={`px-4 py-2 text-xs font-bold rounded-lg transition-all flex items-center gap-1 whitespace-nowrap ${filterMode === "unlearned" ? "bg-amber-100 text-amber-700" : "text-[var(--muted)] hover:bg-[var(--border)]"}`}><Brain size={14}/> Öğrenmediklerim</button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredWords.map((word) => {
          const isFav = isWordFavorite(word.id);
          const isLearned = isWordLearned(word.id);
          
          return (
            <div key={word.id} className={`bg-[var(--surface)] border p-4 rounded-xl shadow-sm transition-colors flex flex-col justify-between group ${isLearned ? "border-green-200 bg-green-50/20 dark:bg-green-900/10" : "border-[var(--border)] hover:border-brand-400"}`}>
              <div>
                <div className="flex justify-between items-start mb-2">
                  <div className="flex flex-col">
                    {word.mufret && <span className="arabic text-2xl font-bold text-brand-700">{word.mufret}</span>}
                    {word.mazi && <span className="arabic text-2xl font-bold text-brand-700">{word.mazi}</span>}
                  </div>
                  <div className="flex gap-1">
                    {/* GÖLGELEME BUTONU - handleMicClick ile güncellendi */}
                    <button 
                      onClick={() => handleMicClick(word)}
                      className="p-1.5 rounded-lg transition-colors text-[var(--muted)] hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30"
                      title="Telaffuzunu Kontrol Et (Gölgeleme)"
                    >
                      <Mic size={16} />
                    </button>

                    <button 
                      onClick={() => toggleFavoriteWord(word)} 
                      className={`p-1.5 rounded-lg transition-colors ${isFav ? "text-red-500 bg-red-50" : "text-[var(--muted)] hover:text-red-400 hover:bg-red-50"}`}
                      title="Favorilere Ekle"
                    >
                      <Heart size={16} fill={isFav ? "currentColor" : "none"} />
                    </button>
                    <button 
                      onClick={() => toggleLearnedWord(word.id)} 
                      className={`p-1.5 rounded-lg transition-colors ${isLearned ? "text-green-500 bg-green-100" : "text-[var(--muted)] hover:text-green-500 hover:bg-green-50"}`}
                      title="Öğrendim / Öğrenmedim"
                    >
                      <CheckCircle2 size={16} fill={isLearned ? "currentColor" : "none"} />
                    </button>
                  </div>
                </div>
                
                {word.mufret && word.cemi && (
                  <p className="text-xs text-[var(--muted)] mb-1"><span className="font-bold">Çoğul:</span> <span className="arabic">{word.cemi}</span></p>
                )}
                {word.mazi && (
                  <div className="text-xs text-[var(--muted)] mb-1 flex flex-col gap-0.5">
                    {word.muzari && <p><span className="font-bold">Muzari:</span> <span className="arabic">{word.muzari}</span></p>}
                  </div>
                )}
                
                <p className="text-sm font-medium text-[var(--foreground)] leading-snug mt-2">{word.anlam_tr}</p>
              </div>
              
              <div className="mt-3 pt-2 border-t border-[var(--border)] flex justify-between items-center text-[10px] text-[var(--muted)] uppercase tracking-wider font-bold">
                <span>{word.tur}</span>
                <span className="arabic text-sm opacity-60">Kök: {word.kok}</span>
              </div>
            </div>
          );
        })}
      </div>

      {filteredWords.length === 0 && (
        <div className="text-center py-20 text-[var(--muted)]">
          <p className="text-lg">Arama kriterlerinize uygun kelime bulunamadı.</p>
        </div>
      )}
    </div>
  );
}