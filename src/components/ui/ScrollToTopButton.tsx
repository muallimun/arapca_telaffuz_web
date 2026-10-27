"use client";

import { useState, useEffect } from "react";
import { ArrowUp } from "lucide-react";
import { playClick } from "@/lib/sfxManager";

export default function ScrollToTopButton() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setVisible(window.scrollY > 300);
    };
    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const scrollToTop = () => {
    playClick();
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <button
      type="button"
      onClick={scrollToTop}
      title="Yukarı Çık"
      aria-label="Sayfanın En Üstüne Kaydır"
      className={`fixed bottom-20 right-4 md:bottom-6 md:right-6 z-30 print:hidden w-11 h-11 rounded-2xl bg-[#0CA678] hover:bg-[#099268] text-white border-2 border-[#087F5B] border-b-4 shadow-lg flex items-center justify-center cursor-pointer active:border-b-2 active:translate-y-0.5 transition-all duration-300 ${
        visible
          ? "opacity-100 translate-y-0 pointer-events-auto"
          : "opacity-0 translate-y-4 pointer-events-none"
      }`}
    >
      <ArrowUp size={20} strokeWidth={2.75} />
    </button>
  );
}
