"use client";

import { useState } from "react";
import { lookupWord } from "@/lib/dict";
import { useSettings } from "@/store/settings";

interface Props {
  text: string;
}

export default function WordTooltip({ text }: Props) {
  const { showTooltips } = useSettings();
  const [activeWord, setActiveWord] = useState<string | null>(null);

  if (!showTooltips) return <>{text}</>;

  // Cümleyi kelimelere ayır
  const words = text.split(" ");

  return (
    <span className="inline">
      {words.map((word, index) => {
        // Noktalama işaretlerini ayır (kelimenin ortasında veya sonunda olabilir)
        const match = word.match(/^([.,!?؟،]*)([\u0600-\u06FF]+)([.,!?؟،]*)$/);
        
        if (!match) return <span key={index}>{word} </span>; // Eşleşmiyorsa normal yaz

        const [_, prefix, coreWord, suffix] = match;
        const dictItem = lookupWord(coreWord);

        if (!dictItem) {
          return <span key={index}>{word} </span>; // Sözlükte yoksa normal yaz
        }

        const isOpen = activeWord === coreWord;

        return (
          <span key={index} className="relative inline-block mx-0.5">
            {prefix}
            <span
              className={`cursor-pointer border-b-2 border-dashed border-brand-400 hover:text-brand-600 transition-colors ${
                isOpen ? "bg-brand-100 dark:bg-brand-900/50 text-brand-700 dark:text-brand-300" : ""
              }`}
              onMouseEnter={() => setActiveWord(coreWord)}
              onMouseLeave={() => setActiveWord(null)}
              onClick={() => setActiveWord(isOpen ? null : coreWord)} // Mobil için
            >
              {coreWord}
            </span>
            {suffix}

            {/* Tooltip Kutusu */}
            {isOpen && (
              <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 p-3 bg-[var(--surface)] border border-[var(--border)] shadow-xl rounded-lg text-sm z-50 arabic-tooltip" dir="ltr">
                <span className="block font-bold text-brand-700 dark:text-brand-500 mb-1">
                  {dictItem.mufret || dictItem.mazi}
                </span>
                <span className="block text-[var(--foreground)]">{dictItem.anlam_tr}</span>
                <span className="block text-xs text-[var(--muted)] mt-1 italic">
                  {dictItem.tur} • Kök: {dictItem.kok}
                </span>
              </span>
            )}
          </span>
        );
      })}
    </span>
  );
}