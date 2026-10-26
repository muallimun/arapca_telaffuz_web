import Link from "next/link";
import { WifiOff, ChevronLeft } from "lucide-react";

export default function OfflinePage() {
  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center p-4 text-center">
      <div className="w-24 h-24 bg-[var(--surface)] border border-[var(--border)] rounded-full flex items-center justify-center mb-6 shadow-sm">
        <WifiOff size={48} className="text-[var(--muted)]" />
      </div>
      <h1 className="text-3xl font-black text-[var(--foreground)] mb-2">İnternet Bağlantısı Yok</h1>
      <p className="text-[var(--muted)] max-w-md mb-8">
        Şu anda çevrimdışısınız. İnternet bağlantınızı kontrol edip tekrar deneyin. 
        Daha önce ziyaret ettiğiniz sayfalar önbellekte olabilir.
      </p>
      <Link href="/" className="flex items-center gap-2 bg-brand-700 text-white px-6 py-3 rounded-xl font-bold shadow-md hover:bg-brand-600 transition-all">
        <ChevronLeft size={18} /> Ana Sayfaya Dön
      </Link>
    </div>
  );
}