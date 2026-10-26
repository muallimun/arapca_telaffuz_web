"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutGrid, BookMarked, Library, Heart } from "lucide-react";

export default function MobileNav() {
  const pathname = usePathname();

  const navItems = [
    { href: "/", icon: LayoutGrid, label: "Diyaloglar" },
    { href: "/sozluk", icon: BookMarked, label: "Sözlük" },
    { href: "/alistirmalar", icon: Library, label: "Alıştırma" },
    { href: "/kutuphane", icon: Heart, label: "Kütüphane" },
  ];

  return (
    <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-[var(--surface)] border-t border-[var(--border)] pb-safe">
      <div className="flex items-center justify-around h-16">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center justify-center w-full h-full space-y-1 transition-colors ${
                isActive ? "text-brand-700" : "text-[var(--muted)] hover:text-[var(--foreground)]"
              }`}
            >
              <Icon size={20} className={isActive ? "fill-brand-100" : ""} />
              <span className={`text-[10px] font-medium ${isActive ? "font-bold" : ""}`}>
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}