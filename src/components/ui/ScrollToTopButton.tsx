"use client";

import { useState, useEffect } from "react";
import { ArrowUp } from "lucide-react";
import { playClick } from "@/lib/sfxManager";

export default function ScrollToTopButton() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      const scrollY = window.scrollY;
      const isAtFooter =
        window.innerHeight + scrollY >=
        document.documentElement.scrollHeight - 90;
      const isVirtualKeyboardOpen = Boolean(
        document.querySelector('[data-virtual-keyboard="true"]')
      );
      setVisible(scrollY > 300 && !isAtFooter && !isVirtualKeyboardOpen);
    };
    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("resize", handleScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("resize", handleScroll);
    };
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
      className={`fixed right-3 bottom-20 sm:bottom-6 sm:right-6 z-30 print:hidden w-9 h-9 sm:w-11 sm:h-11 rounded-2xl bg-[#087F5B] hover:bg-[#065F46] text-white border-2 border-[#087F5B] border-b-4 shadow-lg flex items-center justify-center cursor-pointer active:border-b-2 active:translate-y-0.5 transition-all duration-300 ${
        visible
          ? "opacity-100 translate-y-0 pointer-events-auto"
          : "opacity-0 pointer-events-none translate-y-2"
      }`}
    >
      <ArrowUp className="w-4 h-4 sm:w-5 sm:h-5" strokeWidth={2.75} />
    </button>
  );
}
