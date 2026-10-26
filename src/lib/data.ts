import diyaloglarJson from "@/data/diyaloglar.json";
import sozlukJson from "@/data/sozluk.json";
import { Dialogue, DictionaryItem, Level } from "@/types/data";

// JSON verilerini tip güvenli hale getiriyoruz
export const diyaloglar: Dialogue[] = diyaloglarJson as Dialogue[];
export const sozluk: DictionaryItem[] = sozlukJson as DictionaryItem[];

// Tek bir diyalog getir
export function getDialogueById(id: string): Dialogue | undefined {
  return diyaloglar.find((d) => d.id === id);
}

// Seviyeye göre filtrele
export function getDialoguesByLevel(level: Level | "all"): Dialogue[] {
  if (level === "all") return diyaloglar;
  return diyaloglar.filter((d) => d.seviye === level);
}