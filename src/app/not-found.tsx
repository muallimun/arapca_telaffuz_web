import Link from "next/link";
import { Compass, BookOpen, Home } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-[72vh] flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-lg bg-[#F7EFE1] dark:bg-[var(--surface)] rounded-3xl border-2 border-[#E6D7BE] dark:border-[var(--border)] border-b-4 p-6 sm:p-8 text-center space-y-5 shadow-lg">
        {/* İKON ROZETİ */}
        <div className="w-20 h-20 rounded-2xl bg-white dark:bg-[var(--background)] border-2 border-[#E6D7BE] dark:border-[var(--border)] border-b-4 flex items-center justify-center mx-auto relative text-[#065F46]">
          <Compass size={40} strokeWidth={2.2} />
          <span className="absolute -bottom-2 -right-2 px-2 py-0.5 rounded-full bg-[#6741D9] text-white text-[11px] font-black border-2 border-white shadow-xs">
            404
          </span>
        </div>

        {/* ARAPÇA VE TÜRKÇE BAŞLIK */}
        <div className="space-y-2 border-b border-dashed border-[#E2D3B8] dark:border-[var(--border-dashed)] pb-4">
          <p
            dir="rtl"
            className="arabic text-3xl sm:text-4xl font-bold text-[#065F46] dark:text-emerald-400 leading-relaxed"
          >
            عَفْوًا! الصَّفْحَةُ غَيْرُ مَوْجُودَةٍ
          </p>
          <h1 className="text-lg sm:text-xl font-extrabold text-[var(--foreground)]">
            Sayfa Bulunamadı
          </h1>
          <p className="text-xs sm:text-sm font-medium text-[var(--muted)] leading-relaxed">
            Aradığınız sayfa taşınmış veya kaldırılmış olabilir.
          </p>
        </div>

        {/* YÖNLENDİRME BUTONLARI */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
          <Link
            href="/"
            className="py-3 px-4 rounded-2xl bg-white dark:bg-[var(--background)] border-2 border-[#E6D7BE] dark:border-[var(--border)] border-b-4 hover:border-[#087F5B] text-[var(--foreground)] font-extrabold text-xs sm:text-sm flex items-center justify-center gap-2 transition-all"
          >
            <Home size={16} className="text-[#065F46] shrink-0" />
            <span>🏠 Ana Sayfaya Dön</span>
          </Link>

          <Link
            href="/kutuphane"
            className="py-3 px-4 rounded-2xl bg-[#087F5B] hover:bg-[#065F46] text-white font-extrabold text-xs sm:text-sm border-b-4 border-[#087F5B] active:border-b-0 active:translate-y-0.5 flex items-center justify-center gap-2 transition-all"
          >
            <BookOpen size={16} className="shrink-0" />
            <span>📚 Diyalog Kütüphanesine Git</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
