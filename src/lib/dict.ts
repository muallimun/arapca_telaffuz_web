import sozluk from "@/data/sozluk.json";
import { DictionaryItem } from "@/types/data";

// Arapça metindeki harekeleri ve noktalama işaretlerini temizle
export function cleanArabicText(text: string): string {
  return text
    .replace(/[\u064B-\u0652]/g, "") // Harekeler
    .replace(/[أإآ]/g, "ا")          // Elif çeşitleri
    .replace(/ة/g, "ه")              // Kapalı te
    .replace(/ى/g, "ي")              // Elif-i maksura
    .replace(/[.,!?؟،;؛:"'()\[\]{}]/g, "") // Noktalama
    .trim();
}

// Anlamları kısalt (Eşleştirme oyununda tasarımı bozmasın diye)
function cleanMeaning(meaning: string): string {
  // Parantez içindekileri sil (örn: "aile, halk (hoş geldiniz)")
  let cleaned = meaning.replace(/\(.*?\)/g, "").trim();
  // Virgülden sonrasını al (ilk 2 anlamı göster)
  const parts = cleaned.split(",");
  return parts.slice(0, 2).join(", ").trim();
}

const dictIndex = new Map<string, DictionaryItem>();

sozluk.forEach((item) => {
  // Sözlükteki tüm varyasyonları indeksle
  const rawWords = [
    item.mufret, item.cemi, item.mazi, item.muzari, item.masdar
  ].filter(Boolean);

  rawWords.forEach((raw) => {
    const variants = raw!.split(/[\/\-]/).map((v) => v.trim());
    variants.forEach((v) => {
      if (v.length > 0) {
        // Anlamı temizleyerek kaydet
        const cleanedItem = { ...item, anlam_tr: cleanMeaning(item.anlam_tr) };
        dictIndex.set(cleanArabicText(v), cleanedItem);
      }
    });
  });
});

// Kelimeyi sözlükte ara (Agresif Ek Temizleme Algoritması)
export function lookupWord(rawWord: string): DictionaryItem | null {
  const word = rawWord.replace(/^[.,!?؟،;؛:"'()\[\]{}]+|[.,!?؟،;؛:"'()\[\]{}]+$/g, "");
  if (!word) return null;

  const normalized = cleanArabicText(word);
  
  // 1. Doğrudan ara
  if (dictIndex.has(normalized)) return dictIndex.get(normalized)!;

  // 2. Ön ekleri (ال, و, ب, ل, ك, ف) temizle
  const prefixes = ["ال", "و", "ب", "ل", "ك", "ف", "وب", "ول", "بال", "كال", "فال"];
  
  // 3. Son ekleri temizle (Benim, senin, onun, çoğul vb.)
  const suffixes = ["ه", "ها", "هم", "هن", "كم", "كن", "نا", "ي", "ات", "ون", "ين", "ان", "تين", "وا", "ا", "ت", "ة"];

  // 4. Kombinasyonları dene (Önce ön ek, sonra son ek)
  for (const p of prefixes) {
    if (normalized.startsWith(p)) {
      const withoutPrefix = normalized.slice(p.length);
      
      // Ön ek silinmiş haliyle ara
      if (dictIndex.has(withoutPrefix)) return dictIndex.get(withoutPrefix)!;

      for (const s of suffixes) {
        if (withoutPrefix.endsWith(s)) {
          const strippedBoth = withoutPrefix.slice(0, -s.length);
          if (dictIndex.has(strippedBoth)) return dictIndex.get(strippedBoth)!;
        }
      }
    }
  }

  // 5. Sadece son ekleri temizleyerek ara
  for (const s of suffixes) {
    if (normalized.endsWith(s) && normalized.length > s.length + 1) {
      const stripped = normalized.slice(0, -s.length);
      if (dictIndex.has(stripped)) return dictIndex.get(stripped)!;
    }
  }

  return null;
}

// Bir diyalogdaki tüm cümleleri tarayıp eşleşen kelimeleri döndür
export function extractDialogueVocabulary(sentences: string[]): DictionaryItem[] {
  const foundItems = new Map<string, DictionaryItem>();
  
  sentences.forEach((sentence) => {
    const cleanSentence = sentence.replace(/[.,!?؟،;؛:"'()\[\]{}]/g, " ");
    const words = cleanSentence.split(/\s+/);
    
    words.forEach((word) => {
      const item = lookupWord(word);
      if (item && !foundItems.has(item.id)) {
        foundItems.set(item.id, item);
      }
    });
  });

  return Array.from(foundItems.values());
}