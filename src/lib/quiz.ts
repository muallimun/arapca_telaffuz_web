import { DictionaryItem, DialogueLine } from "@/types/data";

export function shuffleArray<T>(array: T[]): T[] {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

const CEFR_ORDER: Record<string, number> = {
  A1: 1,
  A2: 2,
  B1: 3,
  B2: 4,
  C1: 5,
  C2: 6,
};

export function normalizeWordPartOfSpeech(
  tur?: string
): "isim" | "fiil" | "edat" | "ifade" {
  const raw = (tur || "").trim().toLowerCase();
  if (raw.includes("fiil")) return "fiil";
  if (raw.includes("edat") || raw.includes("harf") || raw.includes("bağlaç") || raw.includes("zarf"))
    return "edat";
  if (raw.includes("ifade") || raw.includes("kalıp")) return "ifade";
  return "isim";
}

function getWordPrimaryArabic(item: DictionaryItem): string {
  return (item.mufret || item.mazi || "").split("/")[0].trim();
}

/**
 * Akıllı Çeldirici (Smart Distractor) Motoru:
 * 1. Öncelik: Hedef kelime ile aynı sözcük türü (isim / fiil / edat) VE aynı CEFR seviyesi (A1/A2/B1/B2),
 *    kelime uzunluğu / yapısal yakınlığa göre sıralı.
 * 2. Öncelik: Aynı sözcük türü VE komşu CEFR seviyesi (fark === 1).
 * 3. Öncelik: Aynı sözcük türü (herhangi bir seviye).
 * 4. Yedek: Kalan adaylar.
 */
export function selectSmartWordDistractors(
  correctItem: DictionaryItem,
  allVocabulary: DictionaryItem[],
  count = 3
): DictionaryItem[] {
  const targetTur = normalizeWordPartOfSpeech(correctItem.tur);
  const targetCefrNum = CEFR_ORDER[correctItem.cefr || "A1"] ?? 1;
  const targetArLen = getWordPrimaryArabic(correctItem).length || 4;
  const targetTrLen = (correctItem.anlam_tr || "").trim().length || 6;

  const uniqueCandidates: DictionaryItem[] = [];
  const seenMeanings = new Set<string>([
    (correctItem.anlam_tr || "").trim().toLowerCase(),
  ]);

  for (const item of allVocabulary) {
    if (!item || item.id === correctItem.id) continue;
    const meaningKey = (item.anlam_tr || "").trim().toLowerCase();
    if (!meaningKey || seenMeanings.has(meaningKey)) continue;
    seenMeanings.add(meaningKey);
    uniqueCandidates.push(item);
  }

  const scoreProximity = (candidate: DictionaryItem): number => {
    const arLen = getWordPrimaryArabic(candidate).length || 4;
    const trLen = (candidate.anlam_tr || "").trim().length || 6;
    const lenDiff =
      Math.abs(arLen - targetArLen) * 1.5 + Math.abs(trLen - targetTrLen) * 0.4;
    // Aynı uzunluk kümesinde çeşitlilik için küçük rastgele sapma
    return lenDiff + Math.random() * 2.2;
  };

  // Katman 1: Aynı tür + aynı CEFR seviyesi
  const tier1 = uniqueCandidates
    .filter(
      (c) =>
        normalizeWordPartOfSpeech(c.tur) === targetTur &&
        (CEFR_ORDER[c.cefr || "A1"] ?? 1) === targetCefrNum
    )
    .sort((a, b) => scoreProximity(a) - scoreProximity(b));

  // Katman 2: Aynı tür + komşu CEFR seviyesi (|fark| === 1)
  const tier2 = uniqueCandidates
    .filter(
      (c) =>
        normalizeWordPartOfSpeech(c.tur) === targetTur &&
        Math.abs((CEFR_ORDER[c.cefr || "A1"] ?? 1) - targetCefrNum) === 1
    )
    .sort((a, b) => scoreProximity(a) - scoreProximity(b));

  // Katman 3: Aynı tür + diğer CEFR seviyeleri
  const tier3 = uniqueCandidates
    .filter(
      (c) =>
        normalizeWordPartOfSpeech(c.tur) === targetTur &&
        Math.abs((CEFR_ORDER[c.cefr || "A1"] ?? 1) - targetCefrNum) > 1
    )
    .sort((a, b) => scoreProximity(a) - scoreProximity(b));

  // Katman 4: Farklı türden yedek adaylar (yalnızca havuzda < count aday varsa)
  const tier4 = shuffleArray(
    uniqueCandidates.filter(
      (c) => normalizeWordPartOfSpeech(c.tur) !== targetTur
    )
  );

  const selected: DictionaryItem[] = [];
  const pickedIds = new Set<string>();

  for (const tier of [tier1, tier2, tier3, tier4]) {
    for (const item of tier) {
      if (selected.length >= count) break;
      if (pickedIds.has(item.id)) continue;
      pickedIds.add(item.id);
      selected.push(item);
    }
    if (selected.length >= count) break;
  }

  return selected;
}

// Çoktan seçmeli test için akıllı şıklar üret
export function generateMultipleChoiceOptions(
  correctItem: DictionaryItem,
  allVocabulary: DictionaryItem[]
): { text: string; isCorrect: boolean }[] {
  const correctText = correctItem.anlam_tr;
  const smartDistractors = selectSmartWordDistractors(
    correctItem,
    allVocabulary,
    3
  ).map((item) => item.anlam_tr);

  return shuffleArray([
    { text: correctText, isCorrect: true },
    ...smartDistractors.map((text) => ({ text, isCorrect: false })),
  ]);
}

// Boşluk Doldurma için cümle ve akıllı şıklar üret
export function generateFillInBlanks(
  lines: DialogueLine[],
  vocabulary: DictionaryItem[]
): {
  sentenceWithBlank: string;
  options: { text: string; isCorrect: boolean }[];
  originalWord: string;
}[] {
  const questions: {
    sentenceWithBlank: string;
    options: { text: string; isCorrect: boolean }[];
    originalWord: string;
  }[] = [];

  lines.forEach((line) => {
    const words = line.arapca.split(" ");

    words.forEach((word) => {
      const cleanWord = word.replace(/[.,!?؟،]/g, "");
      const vocabItem = vocabulary.find(
        (v) =>
          v.mufret?.includes(cleanWord) ||
          v.mazi?.includes(cleanWord) ||
          cleanWord.includes(v.mufret || "___")
      );

      if (vocabItem && cleanWord.length > 2) {
        const sentenceWithBlank = line.arapca.replace(word, "______");
        const correctText = cleanWord;
        const wrongOptions = selectSmartWordDistractors(
          vocabItem,
          vocabulary,
          3
        )
          .map((v) => getWordPrimaryArabic(v))
          .filter((w) => w !== "" && w !== correctText);

        if (wrongOptions.length === 3) {
          questions.push({
            sentenceWithBlank,
            originalWord: cleanWord,
            options: shuffleArray([
              { text: correctText, isCorrect: true },
              ...wrongOptions.map((text) => ({ text, isCorrect: false })),
            ]),
          });
        }
      }
    });
  });

  return shuffleArray(questions).slice(0, 5);
}