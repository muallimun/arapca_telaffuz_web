"use client";
import { useSfxStore } from "@/store/sfxStore";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Settings, Library, LayoutGrid, BookMarked, Sun, Moon } from "lucide-react";
import { useSettings } from "@/store/settings";

export default function Header() {
  const { enabled: sfxEnabled, toggle: toggleSfx } = useSfxStore();
  const { theme, toggleTheme } = useSettings();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    // Tema değişimini html etiketine uygula
    if (theme === "dark") document.documentElement.classList.add("dark");
    else document.documentElement.classList.remove("dark");
  }, [theme]);

  return (
    <header className="sticky top-0 z-50 h-14 border-b border-[var(--border)] bg-[var(--surface)]/80 backdrop-blur-md flex items-center justify-between px-4 md:px-8 shadow-sm">
      <Link href="/" className="text-lg font-bold text-[var(--foreground)] flex items-center gap-2 hover:opacity-80 transition-opacity">
        {/* YENİ: 'ع' harfi yerine Logo (İkon) eklendi */}
        <img 
          src="/icons/android-chrome-192x192.png" 
          alt="Arapça Platformu Logo" 
          className="w-7 h-7 rounded-lg object-cover shadow-sm" 
        />
        <span className="tracking-tight hidden sm:block">Arapça Platformu</span>
      </Link>
      
      <nav className="flex items-center gap-1 md:gap-2">
        <Link href="/" className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-[var(--muted)] hover:bg-[var(--border)] hover:text-[var(--foreground)] transition-all">
          <LayoutGrid size={16} /> <span className="hidden md:block">Diyaloglar</span>
        </Link>
        <Link href="/sozluk" className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-[var(--muted)] hover:bg-[var(--border)] hover:text-[var(--foreground)] transition-all">
          <BookMarked size={16} /> <span className="hidden md:block">Sözlük</span>
        </Link>
        <Link href="/alistirmalar" className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-[var(--muted)] hover:bg-[var(--border)] hover:text-[var(--foreground)] transition-all">
          <Library size={16} /> <span className="hidden md:block">Alıştırmalar</span>
        </Link>
        <Link href="/kutuphane" className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-[var(--muted)] hover:bg-[var(--border)] hover:text-[var(--foreground)] transition-all">
          <Library size={16} /> <span className="hidden md:block">Kütüphanem</span>
        </Link>
        
        <div className="w-px h-6 bg-[var(--border)] mx-1"></div>
        
        {/* HIZLI TEMA DEĞİŞTİRİCİ */}
        <button 
          onClick={toggleTheme} 
          className="flex items-center justify-center w-8 h-8 rounded-lg text-[var(--muted)] hover:bg-[var(--border)] hover:text-brand-700 transition-colors"
          title="Temayı Değiştir"
        >
          {mounted && theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
        </button>
        
        {/* SES EFEKTİ BUTONU */}
        <button
          onClick={toggleSfx}
          className="p-2 rounded-lg text-[var(--muted)] hover:text-brand-700 hover:bg-brand-50 transition-colors"
          title={sfxEnabled ? "Ses efektlerini kapat" : "Ses efektlerini aç"}
          aria-label={sfxEnabled ? "Ses efektlerini kapat" : "Ses efektlerini aç"}
        >
          {sfxEnabled ? "🔊" : "🔇"}
        </button>

        <Link href="/ayarlar" className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-[var(--muted)] hover:bg-[var(--border)] hover:text-[var(--foreground)] transition-all">
          <Settings size={16} /> <span className="hidden md:block">Ayarlar</span>
        </Link>
      </nav>
    </header>
  );
}