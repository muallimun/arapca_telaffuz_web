import { sozluk, diyaloglar } from "@/lib/data";
import { DictionaryItem, Dialogue } from "@/types/data";
import { cleanArabicText, analyzeAndMatchWord } from "@/lib/dict";
import {
  ArabicIdiom,
  getCombinedIdiomsCatalog,
  extractDialoguesIdioms,
} from "@/lib/arabicIdioms";

/**
 * Herhangi bir alıştırma veya telaffuz öğesinin ID'sini veya Arapça metnini
 * standart Hata Defteri (mistakeIds) kimliğine dönüştürür:
 * - Sözlük kelimesi -> word.id (ör: "12" veya "sup_5")
 * - Kalıp ifade -> "idiom_" + idm.id (ör: "idiom_idm_01")
 * - Diyalog cümlesi -> "sent_" + dialogueId + "_" + lineSira (ör: "sent_dlg_01_2")
 */
export function normalizeToCanonicalMistakeId(
  rawId?: string,
  arabicText?: string
): string | null {
  if (rawId) {
    const trimmed = rawId.trim();
    // 1. Kelime önekleri: w-12, w_12, mc_w_12, mg_w_12, word_12
    if (/^(mc_w_|mg_w_|word_|w-|w_)/.test(trimmed)) {
      const rest = trimmed.replace(/^(mc_w_|mg_w_|word_|w-|w_)/, "");
      if (rest.startsWith("idiom_")) return rest;
      if (rest.startsWith("idm_")) return `idiom_${rest}`;
      return rest;
    }

    // 2. Kalıp ifade önekleri: idm-idm_01, idm_idm_01, fill_idm_dlg_idm_01_3, fill_idm_idm_01, sb_idm_dlg_idm_01_3, sb_idm_idm_01, idiom_idm_01
    if (
      /^(mc_idm_|mg_idm_|sb_idm_|fill_idm_|idiom_|idm-|idm_)/.test(trimmed)
    ) {
      let core = trimmed
        .replace(/^(mc_idm_|mg_idm_|sb_idm_|fill_idm_|idiom_|idm-)/, "")
        .replace(/^dlg_/, "");
      // Sonda satır numarası varsa (ör: idm_01_3 -> idm_01, sup_idm_101_2 -> sup_idm_101)
      const catalog = getCombinedIdiomsCatalog();
      if (!catalog.some((c) => c.id === core)) {
        const withoutLine = core.replace(/_\d+$/, "");
        if (catalog.some((c) => c.id === withoutLine)) {
          core = withoutLine;
        }
      }
      return `idiom_${core}`;
    }

    // 3. Diyalog cümlesi önekleri: s-dlg_01-2, s_dlg_01_2, sent_dlg_01_2, fill_dlg_01_2, sb_dlg_01_2, mc_sent_dlg_01_2
    const sentMatch = trimmed.match(/(dlg_\d+)[-_](\d+)/);
    if (
      sentMatch &&
      /^(s-|s_|sent_|fill_|sb_|mc_sent_|mg_s_|fb_)/.test(trimmed)
    ) {
      return `sent_${sentMatch[1]}_${sentMatch[2]}`;
    }

    if (/^dlg_\d+_\d+$/.test(trimmed)) {
      return `sent_${trimmed}`;
    }

    // Doğrudan sözlük ID'si mi?
    if (sozluk.some((w) => w.id === trimmed)) {
      return trimmed;
    }

    // Kalıp ifade kataloğunda var mı?
    const catalog = getCombinedIdiomsCatalog();
    const foundIdm = catalog.find(
      (i) => i.id === trimmed || `idiom_${i.id}` === trimmed
    );
    if (foundIdm) {
      return `idiom_${foundIdm.id}`;
    }
  }

  // 4. Arapça metinden çözümleme (ShadowingModal veya metin bazlı alıştırmalar için)
  if (arabicText && arabicText.trim()) {
    const cleanTarget = cleanArabicText(arabicText.trim());
    if (!cleanTarget) return rawId || null;

    // A) Kalıp ifade eşleşmesi
    const catalog = getCombinedIdiomsCatalog();
    const matchedIdiom = catalog.find(
      (idm) => cleanArabicText(idm.arabic) === cleanTarget
    );
    if (matchedIdiom) {
      return `idiom_${matchedIdiom.id}`;
    }

    // B) Diyalog cümlesi eşleşmesi
    for (const dlg of diyaloglar) {
      for (const line of dlg.satirlar) {
        if (cleanArabicText(line.arapca) === cleanTarget) {
          return `sent_${dlg.id}_${line.sira}`;
        }
      }
    }

    // C) Sözlük kelimesi eşleşmesi
    const exactWord = sozluk.find((w) => {
      const mufretClean = cleanArabicText((w.mufret || "").split("/")[0]);
      const maziClean = cleanArabicText((w.mazi || "").split("/")[0]);
      const cemiClean = cleanArabicText((w.cemi || "").split("/")[0]);
      const muzariClean = cleanArabicText((w.muzari || "").split("/")[0]);
      return (
        mufretClean === cleanTarget ||
        maziClean === cleanTarget ||
        cemiClean === cleanTarget ||
        muzariClean === cleanTarget
      );
    });
    if (exactWord) {
      return exactWord.id;
    }

    const morph = analyzeAndMatchWord(arabicText.trim());
    if (morph?.item) {
      return morph.item.id;
    }
  }

  return rawId ? rawId.trim() : null;
}

export interface ResolvedMistakesPool {
  words: DictionaryItem[];
  idioms: ArabicIdiom[];
  dialogues: Dialogue[];
  sentenceCount: number;
  totalMistakeItems: number;
}

/**
 * userStore.mistakeIds dizisini Alıştırmalar Merkezi ve Sözlük için
 * gerçek kelime, kalıp ifade ve diyalog cümlesi nesnelerine dönüştürür.
 */
export function resolveMistakesPool(mistakeIds: string[]): ResolvedMistakesPool {
  const wordsMap = new Map<string, DictionaryItem>();
  const idiomsMap = new Map<string, ArabicIdiom>();
  const dialogueLinesMap = new Map<string, Set<number>>();

  const catalog = getCombinedIdiomsCatalog();
  const extractedIdioms = extractDialoguesIdioms(diyaloglar);

  for (const rawId of mistakeIds) {
    if (!rawId) continue;
    const id = normalizeToCanonicalMistakeId(rawId) || rawId.trim();

    // 1. Diyalog cümlesi mi? (sent_dlg_01_2 vb.)
    const sentMatch = id.match(/(dlg_\d+)[-_](\d+)/);
    if (sentMatch && id.startsWith("sent_")) {
      const dlgId = sentMatch[1];
      const sira = parseInt(sentMatch[2], 10);
      if (!dialogueLinesMap.has(dlgId)) {
        dialogueLinesMap.set(dlgId, new Set());
      }
      dialogueLinesMap.get(dlgId)!.add(sira);
      continue;
    }

    // 2. Kalıp ifade mi?
    const strippedIdm = id.replace(/^idiom_/, "");
    const foundIdm =
      catalog.find((i) => i.id === strippedIdm || i.id === id) ||
      extractedIdioms.find((i) => i.id === strippedIdm || i.id === id);

    if (foundIdm) {
      idiomsMap.set(foundIdm.id, foundIdm);
      const asDictItem: DictionaryItem = {
        id: `idiom_${foundIdm.id}`,
        mufret: foundIdm.arabic,
        anlam_tr: foundIdm.meaningTr,
        kok: "-",
        tur: "ifade",
      };
      wordsMap.set(asDictItem.id, asDictItem);
      continue;
    }

    // 3. Sözlük kelimesi mi?
    const strippedWordId = id.replace(/^word_/, "");
    const foundWord = sozluk.find(
      (w) => w.id === strippedWordId || w.id === id
    );
    if (foundWord) {
      wordsMap.set(foundWord.id, foundWord);
      if (foundWord.tur === "ifade") {
        const syntheticIdm: ArabicIdiom = {
          id: foundWord.id,
          arabic: foundWord.mufret || foundWord.mazi || "",
          meaningTr: foundWord.anlam_tr,
          literalTr: foundWord.anlam_tr,
          usageNote: "Diyalog ve sözlük kalıp ifadesi.",
          level: "A1-A2",
        };
        idiomsMap.set(syntheticIdm.id, syntheticIdm);
      }
    }
  }

  // Diyalog cümlelerini oluştur
  const dialogues: Dialogue[] = [];
  let sentenceCount = 0;

  for (const [dlgId, siraSet] of dialogueLinesMap.entries()) {
    const origDlg = diyaloglar.find((d) => d.id === dlgId);
    if (!origDlg) continue;
    const filteredLines = origDlg.satirlar.filter((l) => siraSet.has(l.sira));
    if (filteredLines.length > 0) {
      sentenceCount += filteredLines.length;
      dialogues.push({
        ...origDlg,
        satirlar: filteredLines,
      });
    }
  }

  const words = Array.from(wordsMap.values());
  const idioms = Array.from(idiomsMap.values());

  return {
    words,
    idioms,
    dialogues,
    sentenceCount,
    totalMistakeItems: words.length + sentenceCount,
  };
}
