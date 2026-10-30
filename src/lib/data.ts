import diyaloglarJson from "@/data/diyaloglar.json";
import { getCombinedIdiomsCatalog } from "@/lib/arabicIdioms";
import { unifiedDictionary } from "@/lib/dict";
import { Dialogue, DictionaryItem, Level } from "@/types/data";

// JSON verilerini ve birleştirilmiş/tekilleştirilmiş sözlüğü tip güvenli hale getiriyoruz
export const diyaloglar: Dialogue[] = diyaloglarJson as Dialogue[];
export const sozluk: DictionaryItem[] = unifiedDictionary;

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