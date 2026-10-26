"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Heart, CheckCircle2, BookOpen, ChevronLeft, Brain, Mic, AlertTriangle } from "lucide-react";
import { useUserStore } from "@/store/userStore";
import { diyaloglar, sozluk } from "@/lib/data";
import ShadowingModal from "@/components/ui/ShadowingModal";

export default function LibraryPage() {
  const { 
    favoriteDialogues, favoriteWords, completedDialogues, learnedWords, weakWords,
    toggleFavoriteWord, toggleLearnedWord, removeWeakWord
  } = useUserStore();
  
  const [activeTab, setActiveTab] = useState<"fav-dialogues" | "completed" | "fav-words" | "learned-words" | "weak-words">("fav-dialogues");
  const [mounted, setMounted] = useState(false);
  
  // YENİ: Zayıf kelime çalışma modalı
  const [shadowingTarget, setShadowingTarget] = useState<{ text: string; forms: { label: string; arabic: string }[] } | null>(null);

  useEffect(() => { setMounted(true); }, []);

  const favDlgs = diyaloglar.filter(d => favoriteDialogues.includes(d.id));
  const compDlgs = diyaloglar.filter(d => completedDialogues.includes(d.id));
  const learnedWordItems = sozluk.filter(w => learnedWords.includes(w.id));

  // Zayıf kelime için form hazırlama
  const prepareForms = (word: any) => {
    const forms = [];
    if (word.tur === "isim") {
      if (word.mufret) forms.push({ label: "Müfret (Tekil)", arabic: word.mufret });
      if (word.cemi && word.cemi !== "-") forms.push({ label: "Cemî (Çoğul)", arabic: word.cemi });
    } else if (word.tur === "fiil") {
      if (word.mazi) forms.push({ label: "Mâzî (Geçmiş)", arabic: word.mazi });
      if (word.muzari) forms.push({ label: "Muzâri (Şimdiki)", arabic: word.muzari });
      if (word.masdar) forms.push({ label: "Masdar (İsim)", arabic: word.masdar });
    }
    return forms.length > 0 ? forms : null;
  };

  const handlePracticeWeak = (word: any) => {
    const forms = prepareForms(word);
    if (forms) {
      setShadowingTarget({ text: forms[0].arabic, forms });
    }
  };

  if (!mounted) return null;

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto space-y-6 pb-24 relative">
      
      {/* GÖLGELEME MODALI */}
      {shadowingTarget && (
        <ShadowingModal 
          text={shadowingTarget.text} 
          forms={shadowingTarget.forms}
          onClose={() => setShadowingTarget(null)} 
        />
      )}

      <div className="flex items-center gap-3 mb-6">
        <Link href="/" className="p-2 rounded-full bg-[var(--surface)] border border-[var(--border)] hover:bg-[var(--border)] transition-colors">
          <ChevronLeft size={20} />
        </Link>
        <h1 className="text-2xl md:text-3xl font-extrabold text-brand-700">Kütüphanem</h1>
      </div>

      {/* İstatistik Kartları (5'li) */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-8">
        <button onClick={() => setActiveTab("fav-dialogues")} className={`bg-[var(--surface)] border p-4 rounded-2xl text-center shadow-sm relative overflow-hidden transition-all hover:shadow-md group ${activeTab === "fav-dialogues" ? "border-red-400 ring-2 ring-red-100" : "border-[var(--border)]"}`}>
          <div className="absolute top-0 left-0 w-full h-1 bg-red-500"></div>
          <span className="block text-2xl md:text-3xl font-black text-red-500 mb-1">{favoriteDialogues.length}</span>
          <span className="text-[9px] md:text-[10px] font-bold text-[var(--muted)] uppercase">Favori Diyalog</span>
        </button>

        <button onClick={() => setActiveTab("completed")} className={`bg-[var(--surface)] border p-4 rounded-2xl text-center shadow-sm relative overflow-hidden transition-all hover:shadow-md group ${activeTab === "completed" ? "border-green-400 ring-2 ring-green-100" : "border-[var(--border)]"}`}>
          <div className="absolute top-0 left-0 w-full h-1 bg-green-500"></div>
          <span className="block text-2xl md:text-3xl font-black text-green-500 mb-1">{completedDialogues.length}</span>
          <span className="text-[9px] md:text-[10px] font-bold text-[var(--muted)] uppercase">Tamamlanan</span>
        </button>

        <button onClick={() => setActiveTab("fav-words")} className={`bg-[var(--surface)] border p-4 rounded-2xl text-center shadow-sm relative overflow-hidden transition-all hover:shadow-md group ${activeTab === "fav-words" ? "border-brand-400 ring-2 ring-brand-100" : "border-[var(--border)]"}`}>
          <div className="absolute top-0 left-0 w-full h-1 bg-brand-700"></div>
          <span className="block text-2xl md:text-3xl font-black text-brand-700 mb-1">{favoriteWords.length}</span>
          <span className="text-[9px] md:text-[10px] font-bold text-[var(--muted)] uppercase">Kayıtlı Kelime</span>
        </button>

        <button onClick={() => setActiveTab("learned-words")} className={`bg-[var(--surface)] border p-4 rounded-2xl text-center shadow-sm relative overflow-hidden transition-all hover:shadow-md group ${activeTab === "learned-words" ? "border-blue-400 ring-2 ring-blue-100" : "border-[var(--border)]"}`}>
          <div className="absolute top-0 left-0 w-full h-1 bg-blue-500"></div>
          <span className="block text-2xl md:text-3xl font-black text-blue-500 mb-1">{learnedWords.length}</span>
          <span className="text-[9px] md:text-[10px] font-bold text-[var(--muted)] uppercase">Öğrenilen</span>
        </button>

        {/* YENİ: Zayıf Kelimeler */}
        <button onClick={() => setActiveTab("weak-words")} className={`bg-[var(--surface)] border p-4 rounded-2xl text-center shadow-sm relative overflow-hidden transition-all hover:shadow-md group ${activeTab === "weak-words" ? "border-rose-400 ring-2 ring-rose-100" : "border-[var(--border)]"}`}>
          <div className="absolute top-0 left-0 w-full h-1 bg-rose-500"></div>
          <span className="block text-2xl md:text-3xl font-black text-rose-500 mb-1">{weakWords.length}</span>
          <span className="text-[9px] md:text-[10px] font-bold text-[var(--muted)] uppercase flex items-center justify-center gap-1"><AlertTriangle size={10} /> Zayıf Kelime</span>
        </button>
      </div>

      {/* Sekmeler */}
      <div className="flex gap-2 border-b border-[var(--border)] mb-6 overflow-x-auto pb-px custom-scrollbar">
        <button onClick={() => setActiveTab("fav-dialogues")} className={`px-4 py-3 text-sm font-bold whitespace-nowrap border-b-2 transition-colors flex items-center gap-2 ${activeTab === "fav-dialogues" ? "border-red-500 text-red-600" : "border-transparent text-[var(--muted)] hover:text-[var(--foreground)]"}`}>
          <Heart size={16} /> Favori Diyaloglar
        </button>
        <button onClick={() => setActiveTab("completed")} className={`px-4 py-3 text-sm font-bold whitespace-nowrap border-b-2 transition-colors flex items-center gap-2 ${activeTab === "completed" ? "border-green-500 text-green-600" : "border-transparent text-[var(--muted)] hover:text-[var(--foreground)]"}`}>
          <CheckCircle2 size={16} /> Tamamlananlar
        </button>
        <button onClick={() => setActiveTab("fav-words")} className={`px-4 py-3 text-sm font-bold whitespace-nowrap border-b-2 transition-colors flex items-center gap-2 ${activeTab === "fav-words" ? "border-brand-700 text-brand-700" : "border-transparent text-[var(--muted)] hover:text-[var(--foreground)]"}`}>
          <BookOpen size={16} /> Kelime Defterim
        </button>
        <button onClick={() => setActiveTab("learned-words")} className={`px-4 py-3 text-sm font-bold whitespace-nowrap border-b-2 transition-colors flex items-center gap-2 ${activeTab === "learned-words" ? "border-blue-500 text-blue-600" : "border-transparent text-[var(--muted)] hover:text-[var(--foreground)]"}`}>
          <Brain size={16} /> Öğrendiklerim
        </button>
        {/* YENİ SEKME */}
        <button onClick={() => setActiveTab("weak-words")} className={`px-4 py-3 text-sm font-bold whitespace-nowrap border-b-2 transition-colors flex items-center gap-2 ${activeTab === "weak-words" ? "border-rose-500 text-rose-600" : "border-transparent text-[var(--muted)] hover:text-[var(--foreground)]"}`}>
          <AlertTriangle size={16} /> Mahreç Antrenmanı
        </button>
      </div>

      {/* İçerik */}
      <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
        
        {/* Favori Diyaloglar */}
        {activeTab === "fav-dialogues" && (
          favDlgs.length === 0 ? <p className="text-center py-10 text-[var(--muted)] bg-[var(--surface)] rounded-xl border border-dashed border-[var(--border)]">Henüz favori diyalog eklemediniz.</p> :
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {favDlgs.map(dlg => (
              <Link key={dlg.id} href={`/diyalog/${dlg.id}`} className="flex flex-col justify-between bg-[var(--surface)] border border-[var(--border)] p-5 rounded-2xl hover:border-brand-500 hover:shadow-lg transition-all group">
                <div className="mb-4">
                  <h3 className="arabic text-2xl font-bold text-brand-700 leading-relaxed mb-1 group-hover:text-brand-800 transition-colors">{dlg.baslik_ar}</h3>
                  <p className="text-sm font-medium text-[var(--muted)]">{dlg.baslik_tr}</p>
                </div>
                <div className="flex justify-between items-center pt-3 border-t border-[var(--border)]">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold text-white bg-level-${dlg.seviye.toLowerCase()}`}>{dlg.seviye}</span>
                  <span className="text-xs font-bold text-red-500 bg-red-50 px-2 py-1 rounded-md flex items-center gap-1"><Heart size={12} fill="currentColor" /> Favori</span>
                </div>
              </Link>
            ))}
          </div>
        )}

        {/* Tamamlanan Diyaloglar */}
        {activeTab === "completed" && (
          compDlgs.length === 0 ? <p className="text-center py-10 text-[var(--muted)] bg-[var(--surface)] rounded-xl border border-dashed border-[var(--border)]">Henüz tamamlanan diyalog yok.</p> :
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {compDlgs.map(dlg => (
              <Link key={dlg.id} href={`/diyalog/${dlg.id}`} className="flex flex-col justify-between bg-green-50/30 border border-green-200 p-5 rounded-2xl hover:border-green-500 hover:shadow-lg transition-all group">
                <div className="mb-4">
                  <h3 className="arabic text-2xl font-bold text-green-900 leading-relaxed mb-1 group-hover:text-green-950 transition-colors">{dlg.baslik_ar}</h3>
                  <p className="text-sm font-medium text-green-700/70">{dlg.baslik_tr}</p>
                </div>
                <div className="flex justify-between items-center pt-3 border-t border-green-200">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold text-white bg-level-${dlg.seviye.toLowerCase()}`}>{dlg.seviye}</span>
                  <span className="text-xs font-bold text-green-600 flex items-center gap-1"><CheckCircle2 size={14} /> Tamamlandı</span>
                </div>
              </Link>
            ))}
          </div>
        )}

        {/* Favori Kelimeler */}
        {activeTab === "fav-words" && (
          favoriteWords.length === 0 ? <p className="text-center py-10 text-[var(--muted)] bg-[var(--surface)] rounded-xl border border-dashed border-[var(--border)]">Henüz kelime kaydetmediniz.</p> :
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-5">
            {favoriteWords.map((word) => (
              <div key={word.id} className="bg-[var(--surface)] border border-[var(--border)] p-5 rounded-2xl flex justify-between items-start shadow-sm hover:shadow-md transition-all group">
                <div>
                  <h4 className="arabic text-3xl font-bold text-brand-700 mb-2">{word.mufret || word.mazi}</h4>
                  <p className="text-sm font-bold text-[var(--foreground)] mb-1">{word.anlam_tr}</p>
                  <p className="text-xs text-[var(--muted)]">Kök: <span className="arabic text-sm">{word.kok}</span></p>
                </div>
                <button onClick={() => toggleFavoriteWord(word)} className="text-red-500 hover:bg-red-50 p-1.5 rounded-lg transition-colors opacity-50 group-hover:opacity-100" title="Favorilerden Çıkar">
                  <Heart size={20} fill="currentColor" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Öğrenilen Kelimeler */}
        {activeTab === "learned-words" && (
          learnedWordItems.length === 0 ? <p className="text-center py-10 text-[var(--muted)] bg-[var(--surface)] rounded-xl border border-dashed border-[var(--border)]">Henüz "Öğrendim" olarak işaretlediğiniz kelime yok.</p> :
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-5">
            {learnedWordItems.map((word) => (
              <div key={word.id} className="bg-blue-50/20 border border-blue-200 p-5 rounded-2xl flex justify-between items-start shadow-sm hover:shadow-md transition-all group">
                <div>
                  <h4 className="arabic text-3xl font-bold text-blue-800 mb-2">{word.mufret || word.mazi}</h4>
                  <p className="text-sm font-bold text-blue-950 mb-1">{word.anlam_tr}</p>
                  <p className="text-xs text-blue-700/60">Kök: <span className="arabic text-sm">{word.kok}</span></p>
                </div>
                <button onClick={() => toggleLearnedWord(word.id)} className="text-blue-600 hover:bg-blue-100 p-1.5 rounded-lg transition-colors opacity-50 group-hover:opacity-100" title="Öğrenilenlerden Çıkar">
                  <CheckCircle2 size={20} fill="currentColor" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* YENİ: Zayıf Kelimeler / Mahreç Antrenmanı */}
        {activeTab === "weak-words" && (
          weakWords.length === 0 ? (
            <div className="text-center py-16 bg-[var(--surface)] rounded-xl border border-dashed border-[var(--border)]">
              <AlertTriangle className="mx-auto text-gray-300 mb-3" size={48} />
              <p className="text-lg font-bold text-[var(--muted)]">Harika! Hiç zayıf kelimeniz yok.</p>
              <p className="text-sm text-[var(--muted)] mt-2">Telaffuz antrenmanlarında yanlış yaptığınız kelimeler burada birikir.</p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 text-xs text-rose-800 flex items-center gap-2">
                <AlertTriangle size={16} className="shrink-0" />
                <span>Bu kelimeleri telaffuz antrenmanlarında yanlış yaptınız. Mikrofon ikonuna basarak tekrar çalışabilirsiniz.</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-5">
                {weakWords.map((word) => (
                  <div key={word.id} className="bg-rose-50/30 border border-rose-200 p-5 rounded-2xl flex justify-between items-start shadow-sm hover:shadow-md transition-all group">
                    <div>
                      <h4 className="arabic text-3xl font-bold text-rose-800 mb-2">{word.mufret || word.mazi}</h4>
                      <p className="text-sm font-bold text-rose-950 mb-1">{word.anlam_tr}</p>
                      <p className="text-xs text-rose-700/60">Kök: <span className="arabic text-sm">{word.kok}</span></p>
                    </div>
                    <div className="flex flex-col gap-1">
                      <button onClick={() => handlePracticeWeak(word)} className="text-blue-600 bg-blue-50 hover:bg-blue-100 p-1.5 rounded-lg transition-colors" title="Tekrar Çalış">
                        <Mic size={18} />
                      </button>
                      <button onClick={() => removeWeakWord(word.id)} className="text-rose-600 hover:bg-rose-100 p-1.5 rounded-lg transition-colors opacity-50 group-hover:opacity-100" title="Listeden Çıkar">
                        <CheckCircle2 size={18} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )
        )}
      </div>
    </div>
  );
}