"use client";

import { use, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Play, Square, Volume2, ChevronLeft, ChevronRight, Settings2, Heart, CheckCircle2, BrainCircuit, Repeat, ListVideo, Mic, Infinity as InfinityIcon, SlidersHorizontal } from "lucide-react";
import { diyaloglar, getDialogueById } from "@/lib/data";
import { loadAudioManifest, hasMp3, getMp3Path } from "@/lib/audio";
import { useAudioStore } from "@/store/audioStore";
import { useSettings, ViewMode } from "@/store/settings";
import { useUserStore } from "@/store/userStore";
import WordTooltip from "@/components/ui/WordTooltip";
import ShadowingModal from "@/components/ui/ShadowingModal";
import { extractDialogueVocabulary } from "@/lib/dict";
import { DialogueLine } from "@/types/data";

export default function DialogueDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const dialogue = getDialogueById(resolvedParams.id);
  
  const { stop, playAudio, playTTS, playingLineId } = useAudioStore();
  const { viewMode, setViewMode, showHareke, arabicFontSize, turkishFontSize, showShadowing } = useSettings();
  
  const { 
    toggleFavoriteDialogue, isDialogueFavorite, 
    toggleCompletedDialogue, isDialogueCompleted,
    toggleFavoriteWord, isWordFavorite,
    toggleLearnedWord, isWordLearned 
  } = useUserStore();

  const [manifestLoaded, setManifestLoaded] = useState(false);
  const [isPlayingAll, setIsPlayingAll] = useState(false);
  const [rate, setRate] = useState(1);
  const [imageError, setImageError] = useState(false); 
  const [mounted, setMounted] = useState(false);
  
  // --- YENİ TEKRAR VE AYAR PANELİ STATE'LERİ ---
  const [lineRepeat, setLineRepeat] = useState<number | 'infinite'>(1); // Cümle tekrarı
  const [dialogueRepeat, setDialogueRepeat] = useState<number>(1);      // Tüm diyalog tekrarı
  const [currentDialogueLoop, setCurrentDialogueLoop] = useState<number>(1); // Kaçıncı turdayız
  const [showSettings, setShowSettings] = useState(false); // Ayar paneli açık mı?
  
  const [scrollProgress, setScrollProgress] = useState(0);

  // Gölgeleme Modal State
  const [shadowingTarget, setShadowingTarget] = useState<{ text: string, audioUrl?: string } | null>(null);

  const playToken = useRef(0);
  const lineRefs = useRef<{ [key: number]: HTMLDivElement | null }>({});

  useEffect(() => {
    setMounted(true);
    return () => stop();
  }, [stop]);

  useEffect(() => {
    loadAudioManifest().then(() => setManifestLoaded(true));
  }, []);

  useEffect(() => {
    const handleScroll = () => {
      const totalHeight = document.documentElement.scrollHeight - window.innerHeight;
      const progress = (window.scrollY / totalHeight) * 100;
      setScrollProgress(progress);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    if (playingLineId !== null && lineRefs.current[playingLineId]) {
      lineRefs.current[playingLineId]?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [playingLineId]);

  if (!dialogue) return notFound();

  const currentIndex = diyaloglar.findIndex(d => d.id === dialogue.id);
  const prevDialogue = currentIndex > 0 ? diyaloglar[currentIndex - 1] : null;
  const nextDialogue = currentIndex < diyaloglar.length - 1 ? diyaloglar[currentIndex + 1] : null;

  const vocabulary = extractDialogueVocabulary(dialogue.satirlar.map(s => s.arapca));
  const speakers = Array.from(new Set(dialogue.satirlar.map((s) => s.konusmaci)));
  const getSpeakerColor = (name: string) => `var(--speaker-${(speakers.indexOf(name) % 6) + 1})`;
  const dialogueNumber = dialogue.id.replace("dlg_", "").padStart(3, "0");
  const imagePath = `/gorseller/${dialogueNumber}.jpg`;

  const levelColors: Record<string, string> = { a1: "#7c9082", a2: "#a3b18a", b1: "#d4af37", b2: "#bc6c25" };
  const badgeColor = levelColors[dialogue.seviye.toLowerCase()] || "#7c9082";

  const removeTashkeel = (text: string) => text.replace(/[\u064B-\u0652]/g, "");
  const getDisplayText = (text: string) => showHareke ? text : removeTashkeel(text);

  // --- SESLENDİRME MANTIĞI ---

  const playSentence = async (line: DialogueLine, autoAdvance = false, repeatOverride?: number) => {
    const currentToken = playToken.current;
    const isMp3 = manifestLoaded && hasMp3(dialogue.id, line.sira);
    
    // Eğer sarmal döngüdeyse (repeatOverride verilmişse) onu kullan, yoksa state'i kullan
    const effectiveRepeat = repeatOverride !== undefined ? repeatOverride : lineRepeat;

    let i = 0;
    while (true) {
      if (playToken.current !== currentToken) return;

      try {
        if (isMp3) await playAudio(getMp3Path(dialogue.id, line.sira), line.sira, rate);
        else await playTTS(line.arapca, line.sira, rate);
      } catch {
        if (playToken.current !== currentToken) return;
        await playTTS(line.arapca, line.sira, rate);
      }

      i++;
      if (effectiveRepeat !== 'infinite' && i >= effectiveRepeat) break;

      if (playToken.current !== currentToken) return;
      await new Promise(r => setTimeout(r, 300)); // Cümle arası es
    }

    if (playToken.current !== currentToken) return;
    
    if (autoAdvance) {
      playNext(line.sira);
    }
  };

  const playLine = (line: DialogueLine) => {
    setShowSettings(false); // Tekli oynatmada paneli kapat
    playToken.current += 1;
    stop();
    setIsPlayingAll(false); 
    playSentence(line, false);
  };

  const playNext = (currentSira: number) => {
    if (!isPlayingAll) return;
    const nextLine = dialogue.satirlar.find((s) => s.sira === currentSira + 1);
    
    if (nextLine) {
      // Sarmal döngüdeyken cümle tekrarı sonsuz olamaz, ama state zaten togglePlayAll'da 1'e çekiliyor.
      playSentence(nextLine, true);
    } else {
      // Son cümle bitti, diyalog tekrar sayısını kontrol et
      if (currentDialogueLoop < dialogueRepeat) {
        setCurrentDialogueLoop(prev => prev + 1);
        playSentence(dialogue.satirlar[0], true); // Başa dön
      } else {
        // Tüm turlar bitti, durdur
        setIsPlayingAll(false);
        setCurrentDialogueLoop(1);
        stop();
      }
    }
  };

  const togglePlayAll = () => {
    setShowSettings(false); // Oynatma başlarken paneli kapat
    if (isPlayingAll) {
      playToken.current += 1;
      stop();
      setIsPlayingAll(false);
    } else {
      // Sarmal döngü başlarken eğer cümle tekrarı sonsuz ise, bunu 1 kabul et ve state'i güncelle
      const effectiveRepeat = lineRepeat === 'infinite' ? 1 : lineRepeat;
      if (lineRepeat === 'infinite') setLineRepeat(1);

      setIsPlayingAll(true);
      setCurrentDialogueLoop(1);
      playToken.current += 1;
      playSentence(dialogue.satirlar[0], true, effectiveRepeat);
    }
  };

  // Sonsuzun kilitli olup olmadığını belirleyen durum
  const isInfiniteDisabled = isPlayingAll || dialogueRepeat > 1;

  const isFav = mounted ? isDialogueFavorite(dialogue.id) : false;
  const isCompleted = mounted ? isDialogueCompleted(dialogue.id) : false;

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-4 pb-24 md:pb-20 relative">
      
      {/* GÖLGELEME MODALI */}
      {shadowingTarget && (
        <ShadowingModal 
          text={shadowingTarget.text} 
          refAudioUrl={shadowingTarget.audioUrl} 
          onClose={() => setShadowingTarget(null)} 
        />
      )}

      <div className="fixed top-14 left-0 w-full h-1 bg-transparent z-50">
        <div className="h-full bg-brand-500 transition-all duration-150 ease-out" style={{ width: `${scrollProgress}%` }} />
      </div>

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-[var(--border)] pb-3">
        <div className="flex items-center gap-3">
          <Link href="/" className="flex items-center justify-center w-8 h-8 rounded-full bg-[var(--surface)] border border-[var(--border)] hover:bg-[var(--border)] transition-colors shrink-0">
            <ChevronLeft size={18} />
          </Link>
          <div>
            <h1 className="arabic text-2xl md:text-3xl font-bold text-brand-700 dark:text-brand-500 leading-tight">{dialogue.baslik_ar}</h1>
            <h2 className="text-sm text-[var(--muted)] font-medium">{dialogue.baslik_tr}</h2>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="rounded-md px-2.5 py-1 text-[10px] font-bold text-white shadow-sm" style={{ backgroundColor: badgeColor }}>
            {dialogue.seviye}
          </span>
          <button onClick={() => toggleFavoriteDialogue(dialogue.id)} className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${isFav ? "bg-red-50 border-red-200 text-red-600" : "bg-[var(--surface)] border-[var(--border)] text-[var(--muted)] hover:border-red-200 hover:text-red-500"}`}>
            <Heart size={14} fill={isFav ? "currentColor" : "none"} /> {isFav ? "FAVORİLERDE" : "FAVORİ"}
          </button>
          <button onClick={() => toggleCompletedDialogue(dialogue.id)} className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${isCompleted ? "bg-green-50 border-green-200 text-green-600" : "bg-[var(--surface)] border-[var(--border)] text-[var(--muted)] hover:border-green-200 hover:text-green-500"}`}>
            <CheckCircle2 size={14} fill={isCompleted ? "currentColor" : "none"} /> {isCompleted ? "TAMAMLANDI" : "TAMAMLA"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 animate-in fade-in duration-300">
        
        <div className="lg:col-span-8 xl:col-span-9 flex flex-col gap-3">
          
          {/* ARAÇ ÇUBUĞU (SADELEŞTİRİLDİ) */}
          <section className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-2 shadow-sm sticky top-16 z-40 backdrop-blur-xl">
            <div className="flex flex-wrap items-center gap-2">
              {/* OYNAT BUTONU */}
              <button onClick={togglePlayAll} className={`flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-bold text-white shadow-sm transition-all ${isPlayingAll ? "bg-red-500 hover:bg-red-600" : "bg-brand-700 hover:bg-brand-600"}`}>
                {isPlayingAll ? <Square size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" />}
                {isPlayingAll ? "DURDUR" : "TÜMÜNÜ OYNAT"}
              </button>

              {/* GÖRÜNÜM SEÇİCİ */}
              <div className="flex items-center gap-1 text-xs bg-[var(--background)] px-2 py-1.5 rounded-lg border border-[var(--border)]">
                <Settings2 size={14} className="text-[var(--muted)]" />
                <select value={viewMode} onChange={(e) => setViewMode(e.target.value as ViewMode)} className="bg-transparent font-semibold focus:outline-none cursor-pointer text-xs">
                  <option value="stacked">Alt Alta</option>
                  <option value="columns">Yan Yana</option>
                  <option value="arabic-only">Sadece Arapça</option>
                  <option value="turkish-only">Sadece Türkçe</option>
                </select>
              </div>
            </div>

            {/* AYARLAR (HIZ & TEKRAR) POPOVER */}
            <div className="relative">
              <button
                onClick={() => setShowSettings(!showSettings)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-bold transition-all ${showSettings ? "bg-brand-50 border-brand-300 text-brand-700" : "bg-[var(--background)] border-[var(--border)] text-[var(--muted)] hover:text-brand-700 hover:border-brand-300"}`}
              >
                <SlidersHorizontal size={14} />
                <span className="hidden sm:inline">Hız & Tekrar</span>
                <span className="flex items-center gap-1.5 text-[10px] bg-brand-100 text-brand-700 px-1.5 py-0.5 rounded ml-1">
                  <span>{rate}x</span>
                  <span className="opacity-50">•</span>
                  <span title="Cümle Tekrarı">C:{lineRepeat === 'infinite' ? '∞' : `x${lineRepeat}`}</span>
                  <span className="opacity-50">•</span>
                  <span title="Diyalog Tekrarı">D:x{dialogueRepeat}</span>
                </span>
              </button>

              {/* AÇILIR PANEL */}
              {showSettings && (
                <>
                  {/* Dışarı tıklayınca kapatmak için görünmez arka plan */}
                  <div className="fixed inset-0 z-[45]" onClick={() => setShowSettings(false)} />
                  
                  <div className="absolute right-0 top-full mt-2 w-[280px] p-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-2xl z-50 flex flex-col gap-4 animate-in fade-in zoom-in-95">
                    {/* HIZ */}
                    <div className="space-y-1.5">
                      <span className="text-[10px] font-bold text-[var(--muted)] uppercase flex items-center gap-1"><ActivityIcon /> Oynatma Hızı</span>
                      <div className="flex items-center gap-1 bg-[var(--background)] rounded-md border border-[var(--border)] p-1">
                        {[0.5, 0.75, 1, 1.25, 1.5].map((r) => (
                          <button key={r} onClick={() => setRate(r)} className={`flex-1 py-1.5 text-xs font-bold rounded transition-all ${rate === r ? "bg-white shadow-sm text-brand-700" : "text-[var(--muted)] hover:bg-[var(--border)]"}`}>
                            {r}x
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* CÜMLE TEKRARI */}
                    <div className="space-y-1.5">
                      <span className="text-[10px] font-bold text-[var(--muted)] uppercase flex items-center gap-1"><ListVideo size={12} /> Cümle Tekrarı</span>
                      <div className="flex items-center gap-1 bg-[var(--background)] rounded-md border border-[var(--border)] p-1">
                        {[1, 2, 3, 5].map((num) => (
                          <button key={num} onClick={() => setLineRepeat(num)} className={`flex-1 py-1.5 text-xs font-bold rounded transition-all ${lineRepeat === num ? "bg-brand-700 text-white shadow-sm" : "text-[var(--muted)] hover:bg-[var(--border)]"}`}>
                            x{num}
                          </button>
                        ))}
                        <button 
                          disabled={isInfiniteDisabled}
                          onClick={() => setLineRepeat('infinite')} 
                          className={`flex-1 flex justify-center py-1.5 text-xs font-bold rounded transition-all ${lineRepeat === 'infinite' ? "bg-brand-700 text-white shadow-sm" : "text-[var(--muted)] hover:bg-[var(--border)]"} ${isInfiniteDisabled ? "opacity-30 cursor-not-allowed" : ""}`} 
                          title={isInfiniteDisabled ? "Sarmal tekrarda sınırsız cümle kullanılamaz" : "Sınırsız Cümle Tekrarı"}
                        >
                          <InfinityIcon size={14} />
                        </button>
                      </div>
                    </div>

                    {/* DİYALOG TEKRARI */}
                    <div className={`space-y-1.5 transition-all duration-200 ${lineRepeat === 'infinite' ? 'opacity-40 pointer-events-none grayscale' : ''}`}>
                      <span className="text-[10px] font-bold text-[var(--muted)] uppercase flex items-center gap-1">
                        <Repeat size={12} /> Diyalog Tekrarı {lineRepeat === 'infinite' && <span className="text-[9px] text-red-500 ml-1">(Sınırsızda Pasif)</span>}
                      </span>
                      <div className="flex items-center gap-1 bg-[var(--background)] rounded-md border border-[var(--border)] p-1">
                        {[1, 2, 3, 5].map((num) => (
                          <button 
                            key={num} 
                            onClick={() => setDialogueRepeat(num)} 
                            className={`flex-1 py-1.5 text-xs font-bold rounded transition-all ${dialogueRepeat === num ? "bg-amber-600 text-white shadow-sm" : "text-[var(--muted)] hover:bg-[var(--border)]"}`}
                          >
                            x{num}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          </section>

          {/* RTL DÜZELTMESİ: Columns modunda kapsayıcıya dir="rtl" veriyoruz ki ilk kart sağda başlasın */}
          <div 
            className={`space-y-1.5 ${viewMode === "columns" ? "grid grid-cols-1 md:grid-cols-2 md:gap-3 md:space-y-0" : ""}`}
            dir={viewMode === "columns" ? "rtl" : "ltr"}
          >
            {dialogue.satirlar.map((line) => {
              const isPlaying = playingLineId === line.sira;
              const lineHasMp3 = manifestLoaded && hasMp3(dialogue.id, line.sira);
              const lineAudioUrl = lineHasMp3 ? getMp3Path(dialogue.id, line.sira) : undefined;

              return (
                <div key={line.sira} ref={(el) => { lineRefs.current[line.sira] = el; }} className={`group rounded-lg border p-2.5 transition-all duration-200 scroll-mt-32 ${isPlaying ? "border-brand-500 bg-brand-50/60 shadow-sm ring-1 ring-brand-500/20" : "border-[var(--border)] bg-[var(--surface)] hover:border-brand-300"}`}>
                  
                  <div className="flex items-center justify-between mb-0.5">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: getSpeakerColor(line.konusmaci) }}>{line.konusmaci}</span>
                      <span className="font-arabic text-[10px] opacity-40">({line.konusmaci_ar})</span>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      {showShadowing && (
                        <button 
                          onClick={() => setShadowingTarget({ text: line.arapca, audioUrl: lineAudioUrl })}
                          className="flex items-center justify-center w-6 h-6 rounded-full bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 transition-colors"
                          title="Gölgeleme Antrenmanı Yap"
                        >
                          <Mic size={12} />
                        </button>
                      )}
                      
                      <button onClick={() => playLine(line)} className={`flex items-center justify-center w-6 h-6 rounded-full transition-all ${isPlaying ? "bg-brand-500 text-white scale-110" : "bg-[var(--background)] text-brand-600 hover:bg-brand-100"}`}>
                        <Volume2 size={12} />
                      </button>
                    </div>
                  </div>

                  {viewMode !== "turkish-only" && (
                    <p className={`arabic text-right ${isPlaying ? 'text-brand-800' : 'text-[var(--foreground)]'}`} style={{ fontSize: `${arabicFontSize}px`, lineHeight: 1.4 }}>
                      <WordTooltip text={getDisplayText(line.arapca)} />
                    </p>
                  )}
                  
                  {/* Türkçe metinleri LTR (Soldan Sağa) ve Sola Yaslı yapıyoruz ki RTL kapsayıcı içinde bozulmasın */}
                  {viewMode !== "arabic-only" && (
                    <div className={`mt-1 ${viewMode === "columns" ? "pt-1" : "border-t border-[var(--border)] border-dashed pt-1.5"}`} dir="ltr">
                      <p className="text-left text-[var(--muted)]" style={{ fontSize: `${turkishFontSize}px`, lineHeight: 1.3 }}>{line.turkce}</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="flex items-center justify-between mt-4">
            {prevDialogue ? (
              <Link href={`/diyalog/${prevDialogue.id}`} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--surface)] border border-[var(--border)] hover:border-brand-500 hover:shadow-md transition-all text-sm font-bold text-brand-700">
                <ChevronLeft size={16} /> Önceki Diyalog
              </Link>
            ) : <div />}
            {nextDialogue ? (
              <Link href={`/diyalog/${nextDialogue.id}`} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--surface)] border border-[var(--border)] hover:border-brand-500 hover:shadow-md transition-all text-sm font-bold text-brand-700">
                Sonraki Diyalog <ChevronRight size={16} />
              </Link>
            ) : <div />}
          </div>

          <div className="mt-2 p-4 bg-gradient-to-r from-brand-50 to-[var(--surface)] border border-brand-200 rounded-xl flex flex-col md:flex-row items-center justify-between gap-4">
            <div>
              <h3 className="text-base font-bold text-brand-700 mb-0.5">Öğrendiklerini pekiştir!</h3>
              <p className="text-xs text-[var(--muted)]">Bu diyalogdaki kelimelerle test çöz veya kart çevir.</p>
            </div>
            <Link href="/alistirmalar" className="flex items-center gap-2 bg-brand-700 text-white px-4 py-2 rounded-lg text-sm font-bold shadow-md hover:bg-brand-600 transition-all whitespace-nowrap">
              <BrainCircuit size={16} /> Alıştırma Merkezi
            </Link>
          </div>

        </div>

        <div className="hidden lg:block lg:col-span-4 xl:col-span-3 relative">
          <div className="sticky top-24 space-y-3">
            {!imageError && (
              <div className="rounded-xl overflow-hidden border border-[var(--border)] shadow-sm bg-[var(--surface)] p-1">
                <img src={imagePath} alt={dialogue.baslik_tr} className="w-full h-auto rounded-lg object-cover" onError={() => setImageError(true)} />
              </div>
            )}

            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 shadow-sm">
              <h3 className="text-xs font-bold mb-3 flex items-center justify-between uppercase tracking-wider text-[var(--muted)] border-b border-[var(--border)] pb-2">
                <span>Kelime Hazinesi</span>
                <span className="bg-brand-100 text-brand-700 text-[10px] px-1.5 py-0.5 rounded">{vocabulary.length}</span>
              </h3>
              <div className="max-h-[350px] overflow-y-auto pr-1 space-y-2 custom-scrollbar">
                {vocabulary.slice(0, 30).map(item => {
                  const isWordFav = mounted ? isWordFavorite(item.id) : false;
                  const isWordMastered = mounted ? isWordLearned(item.id) : false; 
                  
                  return (
                    <div key={item.id} className="flex justify-between items-center border-b border-[var(--border)] pb-2 last:border-0 group">
                      <div className="flex flex-col items-end text-right w-full pr-2">
                        <span className="arabic text-xl font-bold text-brand-700 leading-none mb-1">{item.mufret || item.mazi}</span>
                        <span className="text-[10px] text-[var(--muted)] leading-tight">{item.anlam_tr}</span>
                      </div>
                      <div className="flex flex-col gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button 
                          onClick={() => toggleFavoriteWord(item)} 
                          className={`p-1 rounded-md transition-colors ${isWordFav ? "text-red-500 bg-red-50" : "text-[var(--muted)] hover:text-red-400 hover:bg-red-50"}`}
                        >
                          <Heart size={14} fill={isWordFav ? "currentColor" : "none"} />
                        </button>
                        <button 
                          onClick={() => toggleLearnedWord(item.id)}
                          className={`p-1 rounded-md transition-colors ${isWordMastered ? "text-green-500 bg-green-50" : "text-[var(--muted)] hover:text-green-500 hover:bg-green-50"}`}
                        >
                          <CheckCircle2 size={14} fill={isWordMastered ? "currentColor" : "none"} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}

// Ufak bir yardımcı ikon (Hız için)
function ActivityIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
    </svg>
  );
}