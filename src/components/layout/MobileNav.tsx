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
    { href: "/alistirmalar", icon: Gamepad2, label: "Alıştırma" },
    { href: "/sozluk", icon: BookMarked, label: "Sözlük" },
    { href: "/ayarlar", icon: Settings, label: "Ayarlar" },
  ];

  return (
    <nav
      aria-label="Mobil Alt Navigasyon"
      className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-[#FDFBF7]/95 dark:bg-[var(--background)]/95 backdrop-blur-md border-t-2 border-[#E6D7BE] dark:border-[var(--border)] px-2 py-1.5"
    >
      <div className="max-w-md mx-auto grid grid-cols-5 gap-1.5">
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
              className={`flex flex-col items-center justify-center py-1.5 px-1 rounded-xl border-2 transition-all ${
                isActive
                  ? "bg-[#F3F0FF] border-[#6741D9] border-b-4 text-[#6741D9] font-extrabold -translate-y-0.5"
                  : "bg-[#F7EFE1] dark:bg-[var(--surface)] border-[#E6D7BE] dark:border-[var(--border)] border-b-4 text-[var(--muted)] hover:text-[var(--foreground)]"
              }`}
            >
              <Icon size={18} strokeWidth={isActive ? 2.5 : 2} />
              <span className="text-[10px] mt-0.5 truncate max-w-full">
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}