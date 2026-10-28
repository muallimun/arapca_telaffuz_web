"use client";

import { Delete, RotateCcw, CornerDownLeft, X } from "lucide-react";
import { playClick } from "@/lib/sfxManager";

interface ArabicVirtualKeyboardProps {
  onKeyPress: (char: string) => void;
  onBackspace: () => void;
  onClear: () => void;
  onEnter: () => void;
  onClose?: () => void;
  useDeviceKeyboard?: boolean;
  onToggleDeviceKeyboard?: () => void;
}

const LETTER_ROW_1 = ["ض", "ص", "ث", "ق", "ف", "غ", "ع", "ه", "خ", "ح", "ج", "د"];
const LETTER_ROW_2 = ["ش", "س", "ي", "ب", "ل", "ا", "ت", "ن", "م", "ك", "ط"];
const LETTER_ROW_3 = ["ئ", "ء", "ؤ", "ر", "لا", "ى", "ة", "و", "ز", "ظ"];

const HARAKAT_KEYS = [
  { char: "\u064E", label: "ـَ", title: "Fetha (Üstün)" },
  { char: "\u064F", label: "ـُ", title: "Damme (Ötre)" },
  { char: "\u0650", label: "ـِ", title: "Kesra (Esre)" },
  { char: "\u0651", label: "ـّ", title: "Şedde" },
  { char: "\u0652", label: "ـْ", title: "Sükûn (Cezim)" },
];

export default function ArabicVirtualKeyboard({
  onKeyPress,
  onBackspace,
  onClear,
  onEnter,
  onClose,
  useDeviceKeyboard = false,
  onToggleDeviceKeyboard,
}: ArabicVirtualKeyboardProps) {
  const handleChar = (c: string) => {
    playClick();
    onKeyPress(c);
  };

  return (
    <div
      dir="ltr"
      className="w-full rounded-2xl bg-[#F7EFE1] dark:bg-[var(--surface)] border-2 border-[#E6D7BE] dark:border-[var(--border)] border-b-4 p-2.5 sm:p-3.5 shadow-md space-y-2 select-none animate-in fade-in slide-in-from-top-2 duration-150"
    >
      {/* Üst Başlık ve Hareke Satırı */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-1.5 border-b border-dashed border-[#E2D3B8] dark:border-[var(--border-dashed)]">
        <span className="text-[11px] font-extrabold uppercase tracking-wider text-[#6741D9] dark:text-[#d0bfff]">
          ⌨️ Arapça Ekran Klavyesi
        </span>

        {/* Harekeler */}
        <div className="flex items-center gap-1 flex-wrap">
          <span className="text-[10px] font-bold text-[var(--muted)] mr-1">
            Harekeler:
          </span>
          {HARAKAT_KEYS.map((h) => (
            <button
              key={h.title}
              type="button"
              onClick={() => handleChar(h.char)}
              title={h.title}
              className="h-8 px-2.5 rounded-xl bg-[#F3F0FF] dark:bg-[var(--lavender-bg)] border border-[#6741D9]/40 hover:border-[#6741D9] text-[#4C28B5] dark:text-[#d0bfff] arabic text-lg font-bold flex items-center justify-center transition-all active:scale-95 cursor-pointer"
            >
              {h.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1.5 ml-auto sm:ml-0">
          {onToggleDeviceKeyboard && (
            <button
              type="button"
              onClick={() => {
                playClick();
                onToggleDeviceKeyboard();
              }}
              title="Cihaz Klavyesi ile Sanal Klavye arasında geçiş yap"
              className={`h-7 px-2.5 rounded-lg border text-[10px] font-extrabold flex items-center gap-1 transition-all cursor-pointer ${
                useDeviceKeyboard
                  ? "bg-[#6741D9] border-[#5230B5] text-white"
                  : "bg-white dark:bg-[var(--background)] border-[#E6D7BE] dark:border-[var(--border)] text-[#6741D9] dark:text-[#d0bfff] hover:border-[#6741D9]"
              }`}
            >
              <span>
                {useDeviceKeyboard
                  ? "⌨️ Sanal Klavye"
                  : "⌨️ Cihaz Klavyesi / Sanal Klavye"}
              </span>
            </button>
          )}

          {onClose && (
            <button
              type="button"
              onClick={() => {
                playClick();
                onClose();
              }}
              title="Klavyeyi Kapat"
              className="w-7 h-7 rounded-lg bg-white dark:bg-[var(--background)] border border-[#E6D7BE] dark:border-[var(--border)] flex items-center justify-center text-[var(--muted)] hover:text-[var(--foreground)] cursor-pointer"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* 1. Harf Satırı */}
      <div className="grid grid-cols-12 gap-1 sm:gap-1.5">
        {LETTER_ROW_1.map((ch) => (
          <button
            key={ch}
            type="button"
            onClick={() => handleChar(ch)}
            className="h-10 sm:h-11 rounded-xl bg-white dark:bg-[var(--background)] border-2 border-[#E6D7BE] dark:border-[var(--border)] border-b-3 hover:border-[#0CA678] active:border-b-0 active:translate-y-0.5 arabic text-xl sm:text-2xl font-bold text-[var(--foreground)] flex items-center justify-center transition-all cursor-pointer"
          >
            {ch}
          </button>
        ))}
      </div>

      {/* 2. Harf Satırı */}
      <div className="grid grid-cols-11 gap-1 sm:gap-1.5 px-1 sm:px-3">
        {LETTER_ROW_2.map((ch) => (
          <button
            key={ch}
            type="button"
            onClick={() => handleChar(ch)}
            className="h-10 sm:h-11 rounded-xl bg-white dark:bg-[var(--background)] border-2 border-[#E6D7BE] dark:border-[var(--border)] border-b-3 hover:border-[#0CA678] active:border-b-0 active:translate-y-0.5 arabic text-xl sm:text-2xl font-bold text-[var(--foreground)] flex items-center justify-center transition-all cursor-pointer"
          >
            {ch}
          </button>
        ))}
      </div>

      {/* 3. Harf Satırı */}
      <div className="grid grid-cols-10 gap-1 sm:gap-1.5 px-2 sm:px-6">
        {LETTER_ROW_3.map((ch) => (
          <button
            key={ch}
            type="button"
            onClick={() => handleChar(ch)}
            className="h-10 sm:h-11 rounded-xl bg-white dark:bg-[var(--background)] border-2 border-[#E6D7BE] dark:border-[var(--border)] border-b-3 hover:border-[#0CA678] active:border-b-0 active:translate-y-0.5 arabic text-xl sm:text-2xl font-bold text-[var(--foreground)] flex items-center justify-center transition-all cursor-pointer"
          >
            {ch}
          </button>
        ))}
      </div>

      {/* Alt Kontrol Tuşları: Temizle (Clear), Boşluk, Sil (Bksp), Kontrol Et (Enter) */}
      <div className="grid grid-cols-12 gap-1.5 pt-1">
        <button
          type="button"
          onClick={() => {
            playClick();
            onClear();
          }}
          className="col-span-3 h-10 rounded-xl bg-rose-50 dark:bg-rose-950/40 border-2 border-rose-300 dark:border-rose-800 border-b-3 text-rose-700 dark:text-rose-300 text-xs font-extrabold flex items-center justify-center gap-1 hover:bg-rose-100 active:translate-y-0.5 transition-all cursor-pointer"
        >
          <RotateCcw size={13} />
          <span>Temizle</span>
        </button>

        <button
          type="button"
          onClick={() => handleChar(" ")}
          className="col-span-3 h-10 rounded-xl bg-white dark:bg-[var(--background)] border-2 border-[#E6D7BE] dark:border-[var(--border)] border-b-3 text-xs font-extrabold text-[var(--muted)] hover:border-[#0CA678] active:translate-y-0.5 transition-all cursor-pointer"
        >
          Boşluk
        </button>

        <button
          type="button"
          onClick={() => {
            playClick();
            onBackspace();
          }}
          className="col-span-3 h-10 rounded-xl bg-amber-50 dark:bg-amber-950/40 border-2 border-amber-300 dark:border-amber-800 border-b-3 text-amber-800 dark:text-amber-300 text-xs font-extrabold flex items-center justify-center gap-1 hover:bg-amber-100 active:translate-y-0.5 transition-all cursor-pointer"
        >
          <Delete size={14} />
          <span>Sil (Bksp)</span>
        </button>

        <button
          type="button"
          onClick={() => {
            playClick();
            onEnter();
          }}
          className="col-span-3 h-10 rounded-xl bg-[#0CA678] hover:bg-[#099268] text-white border-b-3 border-[#087F5B] text-xs font-extrabold flex items-center justify-center gap-1 active:translate-y-0.5 transition-all cursor-pointer"
        >
          <CornerDownLeft size={14} />
          <span>Kontrol Et</span>
        </button>
      </div>
    </div>
  );
}
