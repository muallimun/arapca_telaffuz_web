import {
  sozluk,
  diyaloglar,
  getDialoguesSortedPedagogically,
} from "@/lib/data";
import { DictionaryItem, Dialogue } from "@/types/data";
import {
  cleanArabicText,
  analyzeAndMatchWord,
  getDialogueVocabulary,
  isProperNounItem,
  getAllWords,
} from "@/lib/dict";
import {
  ArabicIdiom,
  getCombinedIdiomsCatalog,
  extractDialoguesIdioms,
  extractDialogueIdioms,
} from "@/lib/arabicIdioms";
import type { SrsItemRecord } from "@/store/userStore";

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
    const allDict = getAllWords();
    const foundWord =
      allDict.find((w) => w.id === strippedWordId || w.id === id) ||
      sozluk.find((w) => w.id === strippedWordId || w.id === id);
    if (foundWord && !isProperNounItem(foundWord)) {
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

export interface SrsBadgeInfo {
  status: "learning" | "reviewing" | "mastered";
  label: string;
  badgeClass: string;
  statsText: string | null;
  daysUntilNext: number;
}

export function formatSrsBadgeInfo(
  record?: SrsItemRecord | null
): SrsBadgeInfo | null {
  if (!record) return null;
  const nowMs = Date.now();
  const nextMs = new Date(record.nextReviewAt).getTime();
  const diffDays = Number.isFinite(nextMs)
    ? Math.max(0, Math.ceil((nextMs - nowMs) / (1000 * 60 * 60 * 24)))
    : 0;

  const totalAttempts = (record.correctCount || 0) + (record.wrongCount || 0);
  const statsParts: string[] = [];
  if (totalAttempts > 0) {
    statsParts.push(`Doğru: ${record.correctCount || 0}`);
    statsParts.push(`Yanlış: ${record.wrongCount || 0}`);
    if ((record.hintUsedCount || 0) > 0) {
      statsParts.push(`İpucu: ${record.hintUsedCount}`);
    }
  }
  const statsText = statsParts.length > 0 ? statsParts.join(" • ") : null;

  if (record.status === "mastered" || record.stage >= 3) {
    return {
      status: "mastered",
      label: "🟢 Uzun Süreli Öğrenildi ✓",
      badgeClass:
        "bg-emerald-100 text-emerald-900 border-emerald-300 dark:bg-emerald-950/70 dark:text-emerald-200 dark:border-emerald-700/60",
      statsText,
      daysUntilNext: diffDays,
    };
  }

  if (record.status === "reviewing" && record.stage >= 1) {
    const nextText =
      diffDays <= 0
        ? "Bugün"
        : diffDays === 1
        ? "1 gün sonra"
        : `${diffDays} gün sonra`;
    return {
      status: "reviewing",
      label: `🔵 Pekiştiriliyor (Kademe ${record.stage}/5 • Sonraki: ${nextText})`,
      badgeClass:
        "bg-sky-100 text-sky-900 border-sky-300 dark:bg-sky-950/70 dark:text-sky-200 dark:border-sky-700/60",
      statsText,
      daysUntilNext: diffDays,
    };
  }

  return {
    status: "learning",
    label: "🟠 Öğreniliyor (Tekrar: Bugün)",
    badgeClass:
      "bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950/70 dark:text-amber-200 dark:border-amber-700/60",
    statsText,
    daysUntilNext: 0,
  };
}

export function formatSrsReviewBanner(
  _record?: SrsItemRecord | null,
  _isInMistakes?: boolean
): string | null {
  return null;
}

export function formatMistakeStageProgressText(
  record?: SrsItemRecord | null
): string {
  const stage = Math.min(5, Math.max(0, record?.stage ?? 0));
  if (stage >= 3) {
    return `🎉 Tekrar Kademesi: ${stage}/5 — Uzun süreli hafızaya alındı ve Hata Defteri'nden mezun oldu!`;
  }
  const nextLabel =
    stage === 1 ? "Yarın (+1 gün)" : stage === 2 ? "3 gün sonra" : "Bugün";
  return `🔄 Tekrar Kademesi: ${stage}/5 — Sonraki tekrar: ${nextLabel} (Hata Defteri'nden çıkmak için ${
    3 - stage
  } kademe daha gerekli)`;
}

export interface DailyWordRecommendation {
  item: DictionaryItem;
  statusBadge: string;
  badgeTone: "due" | "mistake" | "new";
}

export interface DailyIdiomRecommendation {
  idiom: ArabicIdiom;
  statusBadge: string;
}

export interface DailyStudyPackage {
  dailyDialogue: {
    dialogue: Dialogue;
    reasonBadge: string;
  };
  dailyWords: DailyWordRecommendation[];
  dailyIdioms: DailyIdiomRecommendation[];
  dueReviewPool: {
    words: DictionaryItem[];
    idioms: ArabicIdiom[];
    dialogues: Dialogue[];
    totalDueCount: number;
  };
}

export function buildDailyStudyPackage(params: {
  srsRecords: Record<string, SrsItemRecord>;
  mistakeIds: string[];
  completedDialogues: string[];
  learnedWords: string[];
  preferredLevel?: string;
}): DailyStudyPackage {
  const {
    srsRecords = {},
    mistakeIds = [],
    completedDialogues = [],
    learnedWords = [],
    preferredLevel = "Başlangıç",
  } = params;

  const nowMs = Date.now();
  const learnedSet = new Set(learnedWords);
  const mistakeSet = new Set(mistakeIds);

  // 1. Zamanı gelen (due) veya learning/mistake durumundaki SRS kayıtlarını bul
  const dueSrsEntries = Object.values(srsRecords).filter((rec) => {
    const nextMs = new Date(rec.nextReviewAt).getTime();
    const isDue = !Number.isFinite(nextMs) || nextMs <= nowMs;
    return isDue || rec.status === "learning" || mistakeSet.has(rec.id);
  });

  // 2. Günün Diyaloğu Seçimi:
  // Pedagojik sıra (A1 -> A2 -> B1 -> B2 ve dlg_01 .. dlg_60) ile sıralanmış diyaloglar üzerinden seçim yapılır
  const pedagogicalDialogues = getDialoguesSortedPedagogically();

  const targetLevels =
    preferredLevel === "Başlangıç"
      ? ["A1"]
      : preferredLevel === "Orta"
      ? ["A2"]
      : ["B1", "B2"];

  let bestDialogue: Dialogue = pedagogicalDialogues[0] || diyaloglar[0];
  let reasonBadge = `Sıradaki ${bestDialogue.seviye} diyaloğunuz`;

  const uncompletedInLevel = pedagogicalDialogues.filter(
    (d) =>
      targetLevels.includes(d.seviye) && !completedDialogues.includes(d.id)
  );
  const candidateDialogues =
    uncompletedInLevel.length > 0 ? uncompletedInLevel : pedagogicalDialogues;

  let maxMistakeHits = 0;
  let mistakeMatchedDialogue: Dialogue | null = null;

  if (mistakeIds.length > 0 || dueSrsEntries.length > 0) {
    for (const dlg of candidateDialogues) {
      const dlgVocab = getDialogueVocabulary(dlg.id);
      let hits = 0;
      for (const v of dlgVocab) {
        const srs = srsRecords[v.item.id];
        if (
          mistakeSet.has(v.item.id) ||
          (srs && (srs.wrongCount > 0 || srs.status === "learning"))
        ) {
          hits++;
        }
      }
      if (hits > maxMistakeHits) {
        maxMistakeHits = hits;
        mistakeMatchedDialogue = dlg;
      }
    }
  }

  if (mistakeMatchedDialogue && maxMistakeHits > 0) {
    bestDialogue = mistakeMatchedDialogue;
    reasonBadge = `Bu diyalogda zorlandığınız ${maxMistakeHits} kelime var`;
  } else if (uncompletedInLevel.length > 0) {
    bestDialogue = uncompletedInLevel[0];
    reasonBadge = `Sıradaki ${bestDialogue.seviye} diyaloğunuz`;
  } else {
    const firstUncompleted = pedagogicalDialogues.find(
      (d) => !completedDialogues.includes(d.id)
    );
    if (firstUncompleted) {
      bestDialogue = firstUncompleted;
      reasonBadge = `Sıradaki ${firstUncompleted.seviye} diyaloğunuz`;
    } else {
      bestDialogue = pedagogicalDialogues[0] || diyaloglar[0];
      reasonBadge = "Günlük pekiştirme diyaloğunuz";
    }
  }

  // 3. Zamanı Gelen 6 Kelime Seçimi (Özel İsimler kesinlikle hariç tutulur)
  const dailyWords: DailyWordRecommendation[] = [];
  const pickedWordIds = new Set<string>();
  const allDictWords = getAllWords();

  // 3a. Önce nextReviewAt <= now olan SRS kelimeleri
  for (const rec of dueSrsEntries) {
    if (dailyWords.length >= 6) break;
    if (rec.type !== "word") continue;
    const stripped = rec.id.replace(/^word_/, "");
    const w =
      allDictWords.find((item) => item.id === stripped || item.id === rec.id) ||
      sozluk.find((item) => item.id === stripped || item.id === rec.id);
    if (!w || isProperNounItem(w) || pickedWordIds.has(w.id)) continue;
    pickedWordIds.add(w.id);

    const statusBadge =
      rec.wrongCount > 0
        ? `⚠️ ${rec.wrongCount} hata yapıldı`
        : "⏰ Tekrar günü geldi";
    const badgeTone = rec.wrongCount > 0 ? "mistake" : "due";
    dailyWords.push({ item: w, statusBadge, badgeTone });
  }

  // 3b. Hata defterindeki kelimeler
  const resolvedMistakes = resolveMistakesPool(mistakeIds);
  for (const w of resolvedMistakes.words) {
    if (dailyWords.length >= 6) break;
    if (w.id.startsWith("idiom_") || w.tur === "ifade" || isProperNounItem(w))
      continue;
    if (pickedWordIds.has(w.id)) continue;
    pickedWordIds.add(w.id);
    const rec = srsRecords[w.id];
    const wrongCnt = rec?.wrongCount || 1;
    dailyWords.push({
      item: w,
      statusBadge: `⚠️ ${wrongCnt} hata yapıldı`,
      badgeTone: "mistake",
    });
  }

  // 3c. Günün diyaloğundaki yeni (öğrenilmemiş) kelimeler (Özel isimler hariç, anlamlı diyalog kelimeleri öncelikli)
  const LOW_PRIORITY_PRONOUN_OR_PARTICLE = new Set([
    "ما",
    "انا",
    "انت",
    "انتم",
    "هو",
    "هي",
    "هم",
    "نحن",
    "يا",
    "و",
    "ف",
    "في",
    "من",
    "الي",
    "علي",
    "عن",
  ]);
  const dlgVocabEntries = getDialogueVocabulary(bestDialogue.id).filter(
    (e) => !isProperNounItem(e.item)
  );
  const prioritizedDlgVocab = [
    ...dlgVocabEntries.filter(
      (e) =>
        !LOW_PRIORITY_PRONOUN_OR_PARTICLE.has(
          cleanArabicText((e.item.mufret || e.item.mazi || "").split("/")[0])
        )
    ),
    ...dlgVocabEntries.filter((e) =>
      LOW_PRIORITY_PRONOUN_OR_PARTICLE.has(
        cleanArabicText((e.item.mufret || e.item.mazi || "").split("/")[0])
      )
    ),
  ];

  for (const entry of prioritizedDlgVocab) {
    if (dailyWords.length >= 6) break;
    const w = entry.item;
    if (
      isProperNounItem(w) ||
      pickedWordIds.has(w.id) ||
      learnedSet.has(w.id)
    )
      continue;
    pickedWordIds.add(w.id);
    dailyWords.push({
      item: w,
      statusBadge: "✨ Yeni kelime",
      badgeTone: "new",
    });
  }

  // 3d. Hâlâ 6 kelimeden azsa genel sözlükten (özel isim olmayanlardan) tamamla
  for (const w of sozluk) {
    if (dailyWords.length >= 6) break;
    if (
      isProperNounItem(w) ||
      pickedWordIds.has(w.id) ||
      learnedSet.has(w.id)
    )
      continue;
    pickedWordIds.add(w.id);
    dailyWords.push({
      item: w,
      statusBadge: "✨ Yeni kelime",
      badgeTone: "new",
    });
  }

  // 4. Zorlanılan veya Günün Diyaloğundan 2 Kalıp İfade Seçimi
  const dailyIdioms: DailyIdiomRecommendation[] = [];
  const pickedIdiomIds = new Set<string>();
  const allCatalogIdioms = getCombinedIdiomsCatalog();

  // 4a. Hata defterindeki veya SRS'de zamanı gelen kalıp ifadeler
  for (const idm of resolvedMistakes.idioms) {
    if (dailyIdioms.length >= 2) break;
    if (pickedIdiomIds.has(idm.id)) continue;
    pickedIdiomIds.add(idm.id);
    dailyIdioms.push({
      idiom: idm,
      statusBadge: "⚠️ Zorlandığınız kalıp",
    });
  }

  for (const rec of dueSrsEntries) {
    if (dailyIdioms.length >= 2) break;
    if (rec.type !== "idiom") continue;
    const stripped = rec.id.replace(/^idiom_/, "");
    const idm = allCatalogIdioms.find(
      (i) => i.id === stripped || `idiom_${i.id}` === rec.id
    );
    if (!idm || pickedIdiomIds.has(idm.id)) continue;
    pickedIdiomIds.add(idm.id);
    dailyIdioms.push({
      idiom: idm,
      statusBadge: "⏰ Tekrar günü geldi",
    });
  }

  // 4b. Günün diyaloğundaki kalıp ifadeler
  const dlgIdioms = extractDialogueIdioms(
    bestDialogue.satirlar,
    bestDialogue.seviye
  );
  for (const idm of dlgIdioms) {
    if (dailyIdioms.length >= 2) break;
    if (pickedIdiomIds.has(idm.id)) continue;
    pickedIdiomIds.add(idm.id);
    dailyIdioms.push({
      idiom: idm,
      statusBadge: "💬 Günün diyaloğundan",
    });
  }

  // 4c. Katalogdan tamamla
  for (const idm of allCatalogIdioms) {
    if (dailyIdioms.length >= 2) break;
    if (pickedIdiomIds.has(idm.id)) continue;
    pickedIdiomIds.add(idm.id);
    dailyIdioms.push({
      idiom: idm,
      statusBadge: "✨ Günlük kalıp ifade",
    });
  }

  // 5. Alıştırma Merkezi SRS Günlük Tekrar Kuyruğu Havuzu
  const poolWordsMap = new Map<string, DictionaryItem>();
  const poolIdiomsMap = new Map<string, ArabicIdiom>();
  const poolDialoguesMap = new Map<string, Dialogue>();

  // Due & mistake kelimeleri ekle (Özel isimler hariç)
  for (const w of resolvedMistakes.words) {
    if (!isProperNounItem(w)) poolWordsMap.set(w.id, w);
  }
  for (const dw of dailyWords) {
    if (!isProperNounItem(dw.item)) poolWordsMap.set(dw.item.id, dw.item);
  }
  for (const rec of dueSrsEntries) {
    if (rec.type === "word") {
      const stripped = rec.id.replace(/^word_/, "");
      const found =
        allDictWords.find((w) => w.id === stripped || w.id === rec.id) ||
        sozluk.find((w) => w.id === stripped || w.id === rec.id);
      if (found && !isProperNounItem(found)) poolWordsMap.set(found.id, found);
    }
  }

  // Due & daily kalıp ifadeleri ekle
  for (const idm of resolvedMistakes.idioms) {
    poolIdiomsMap.set(idm.id, idm);
  }
  for (const di of dailyIdioms) {
    poolIdiomsMap.set(di.idiom.id, di.idiom);
  }

  // Due & daily diyalogları ekle
  for (const d of resolvedMistakes.dialogues) {
    poolDialoguesMap.set(d.id, d);
  }
  if (!poolDialoguesMap.has(bestDialogue.id)) {
    poolDialoguesMap.set(bestDialogue.id, bestDialogue);
  }

  const dueCount = Math.max(
    dueSrsEntries.length + mistakeIds.length,
    dailyWords.length + dailyIdioms.length
  );

  return {
    dailyDialogue: {
      dialogue: bestDialogue,
      reasonBadge,
    },
    dailyWords,
    dailyIdioms,
    dueReviewPool: {
      words: Array.from(poolWordsMap.values()),
      idioms: Array.from(poolIdiomsMap.values()),
      dialogues: Array.from(poolDialoguesMap.values()),
      totalDueCount: dueCount,
    },
  };
}

