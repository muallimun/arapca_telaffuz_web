import diyaloglarJson from "@/data/diyaloglar.json";
import { getCombinedIdiomsCatalog } from "@/lib/arabicIdioms";
import { unifiedDictionary } from "@/lib/dict";
import { Dialogue, DictionaryItem, Level } from "@/types/data";

const LEVEL_UNITE_MAP: Record<Level, string> = {
  A1: "Ünite 1: Temel İletişim",
  A2: "Ünite 2: Günlük Hayat ve Alışveriş",
  B1: "Ünite 3: Sosyal Hayat ve Seyahat",
  B2: "Ünite 4: İleri Düzey Müzakere",
};

const LEVEL_ZORLUK_MAP: Record<Level, 1 | 2 | 3 | 4> = {
  A1: 1,
  A2: 2,
  B1: 3,
  B2: 4,
};

const CEFR_RANK: Record<Level, number> = {
  A1: 1,
  A2: 2,
  B1: 3,
  B2: 4,
};

function normalizeCanonicalArabicLine(text: string): string {
  return (text || "")
    .replace(/\u0640+/g, "")
    .replace(/([\u064B-\u0650\u0652\u0670])\u0651/g, "\u0651$1");
}

function buildDialogueTags(baslikTr: string, seviye: Level): string[] {
  const cleaned = (baslikTr || "")
    .replace(/[().,/#!$%^&*;:{}=\-_`~]/g, " ")
    .split(/\s+/)
    .map((w) => w.trim().toLowerCase())
    .filter((w) => w.length >= 2 && w !== "ve" && w !== "ile");

  const baseTag =
    seviye === "A1"
      ? "temel-iletisim"
      : seviye === "A2"
      ? "gunluk-hayat"
      : seviye === "B1"
      ? "sosyal-hayat"
      : "ileri-duzey";

  return Array.from(new Set([seviye.toLowerCase(), baseTag, ...cleaned]));
}

// JSON verilerini pedagojik üst verilerle (cefr, zorluk, etiketler, kaynak_unite) zenginleştiriyoruz
export const diyaloglar: Dialogue[] = (diyaloglarJson as Dialogue[]).map(
  (d): Dialogue => {
    const lvl: Level = d.seviye || "A1";
    return {
      ...d,
      cefr: d.cefr || lvl,
      zorluk: d.zorluk || LEVEL_ZORLUK_MAP[lvl] || 1,
      etiketler:
        Array.isArray(d.etiketler) && d.etiketler.length > 0
          ? d.etiketler
          : buildDialogueTags(d.baslik_tr, lvl),
      kaynak_unite: d.kaynak_unite || LEVEL_UNITE_MAP[lvl],
      satirlar: Array.isArray(d.satirlar)
        ? d.satirlar.map((line) => ({
            ...line,
            arapca: normalizeCanonicalArabicLine(line.arapca),
          }))
        : [],
    };
  }
);

export const sozluk: DictionaryItem[] = unifiedDictionary;

/**
 * Diyalogları pedagojik olarak önce CEFR seviyesine (A1 -> A2 -> B1 -> B2),
 * ardından kendi sıra numarasına (dlg_01 .. dlg_60) göre sıralar.
 */
export function getDialoguesSortedPedagogically(): Dialogue[] {
  return [...diyaloglar].sort((a, b) => {
    const rankA = CEFR_RANK[a.seviye] ?? 99;
    const rankB = CEFR_RANK[b.seviye] ?? 99;
    if (rankA !== rankB) return rankA - rankB;
    const numA = parseInt(a.id.replace(/\D+/g, ""), 10) || 0;
    const numB = parseInt(b.id.replace(/\D+/g, ""), 10) || 0;
    return numA - numB;
  });
}

// Tek bir diyalog getir
export function getDialogueById(id: string): Dialogue | undefined {
  return diyaloglar.find((d) => d.id === id);
}

// Seviyeye göre filtrele
export function getDialoguesByLevel(level: Level | "all"): Dialogue[] {
  if (level === "all") return diyaloglar;
  return diyaloglar.filter((d) => d.seviye === level);
}

export interface ContentCatalogStats {
  totalDialogues: number;
  totalSentences: number;
  totalDictionaryWords: number;
  totalIdioms: number;
  byLevel: Record<Level, { dialogues: number; sentences: number }>;
}

// Tüm içerik kataloğu istatistiklerini tek merkezden hesapla
export function getContentCatalogStats(): ContentCatalogStats {
  const byLevel: Record<Level, { dialogues: number; sentences: number }> = {
    A1: { dialogues: 0, sentences: 0 },
    A2: { dialogues: 0, sentences: 0 },
    B1: { dialogues: 0, sentences: 0 },
    B2: { dialogues: 0, sentences: 0 },
  };

  let totalSentences = 0;

  for (const d of diyaloglar) {
    const lineCount = Array.isArray(d.satirlar) ? d.satirlar.length : 0;
    totalSentences += lineCount;
    if (byLevel[d.seviye]) {
      byLevel[d.seviye].dialogues += 1;
      byLevel[d.seviye].sentences += lineCount;
    }
  }

  return {
    totalDialogues: diyaloglar.length,
    totalSentences,
    totalDictionaryWords: sozluk.length,
    totalIdioms: getCombinedIdiomsCatalog().length,
    byLevel,
  };
}