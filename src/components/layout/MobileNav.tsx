"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  BookOpen,
  Gamepad2,
  BookMarked,
  Settings,
} from "lucide-react";
import { playClick } from "@/lib/sfxManager";

export default function MobileNav() {
  const pathname = usePathname();

  const navItems = [
    { href: "/", icon: Home, label: "Ana Sayfa" },
    { href: "/kutuphane", icon: BookOpen, label: "Kütüphane" },
    { href: "/alistirmalar", icon: Gamepad2, label: "Alıştırmalar" },
    { href: "/sozluk", icon: BookMarked, label: "Sözlük" },
    { href: "/ayarlar", icon: Settings, label: "Ayarlar" },
  ];

  return (
    <nav
      aria-label="Mobil Alt Navigasyon"
      className="lg:hidden print:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#FDFBF7]/95 dark:bg-[var(--background)]/95 backdrop-blur-md border-t-2 border-[#E6D7BE] dark:border-[var(--border)] px-1.5 pt-1.5 pb-[max(0.375rem,env(safe-area-inset-bottom))] pb-[env(safe-area-inset-bottom)]"
    >
      <div className="max-w-md mx-auto grid grid-cols-5 gap-1">
        {navItems.map((item) => {
          const isActive =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => playClick()}
              className={`min-h-[44px] flex flex-col items-center justify-center py-1.5 px-1 rounded-xl border-2 transition-all ${
                isActive
                  ? "bg-[#F3F0FF] border-[#6741D9] border-b-4 text-[#6741D9] font-extrabold -translate-y-0.5"
                  : "bg-[#F7EFE1] dark:bg-[var(--surface)] border-[#E6D7BE] dark:border-[var(--border)] border-b-4 text-[var(--muted)] hover:text-[var(--foreground)]"
              }`}
            >
              <Icon size={18} strokeWidth={isActive ? 2.5 : 2} />
              <span className="text-[10px] sm:text-xs font-medium tracking-tight whitespace-nowrap text-center leading-tight mt-0.5">
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}