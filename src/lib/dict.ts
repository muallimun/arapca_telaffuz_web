import sozlukRaw from "@/data/sozluk.json";
import diyaloglarRaw from "@/data/diyaloglar.json";
import { SUPPLEMENT_DICTIONARY } from "./supplementDict";
import { Dialogue, DictionaryItem } from "@/types/data";

export type WordCategory = "fiil" | "isim" | "edat";

export interface MorphologicalMatch {
  item: DictionaryItem;
  originalWord: string;
  matchedStem: string;
  prefixLabel?: string;
  suffixLabel?: string;
  morphologyNote: string;
  matchStage: "exact" | "affix" | "ta-marbuta" | "verb" | "root";
}

export interface DialogueVocabularyEntry {
  item: DictionaryItem;
  contextWord: string;
  contextSentence: string;
  contextTranslation: string;
  morphologyNote: string;
  lineNumber: number;
}

// Harekeleri soyar ancak harfleri korur
export function stripHarakat(text: string): string {
  return text
    .replace(/[\u064B-\u065F\u0670\u0640]/g, "")
    .replace(/[.,!?؟،;؛:"'()\[\]{}\d]/g, "")
    .trim();
}

// Arapça metindeki harekeleri ve noktalama işaretlerini temizle (Karşılaştırma anahtarı)
export function cleanArabicText(text: string): string {
  return text
    .replace(/[\u064B-\u065F\u0670\u0640]/g, "") // Harekeler, asâ/çeker ve tatweel
    .replace(/[أإآٱ]/g, "ا") // Elif çeşitleri
    .replace(/ة/g, "ه") // Kapalı te -> he
    .replace(/ى/g, "ي") // Elif-i maksura -> ye
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/[.,!?؟،;؛:"'()\[\]{}\d]/g, "") // Noktalama ve sayılar
    .trim();
}

// Edat, Harf-i Cer, Zarf, Bağlaç ve Soru Edatları kümesi (normalize edilmiş)
const ARABIC_PARTICLES_SET = new Set<string>([
  "الي",
  "من",
  "يا",
  "في",
  "علي",
  "عن",
  "مع",
  "هل",
  "ما",
  "ماذا",
  "كيف",
  "اين",
  "متي",
  "كم",
  "لماذا",
  "نعم",
  "لا",
  "بلي",
  "هنا",
  "هناك",
  "ايضا",
  "جدا",
  "فقط",
  "قبل",
  "بعد",
  "عند",
  "بين",
  "امام",
  "خلف",
  "فوق",
  "تحت",
  "بجانب",
  "حول",
  "منذ",
  "حتي",
  "او",
  "ام",
  "ثم",
  "بل",
  "لكن",
  "ان",
  "لان",
  "لو",
  "اذا",
  "اذن",
  "ربما",
  "طيب",
  "حسنا",
  "طبعا",
  "فعلا",
  "الآن",
  "الان",
  "غدا",
  "امس",
  "اليوم",
  "دائما",
  "ابدا",
  "معا",
  "سريعا",
  "قليلا",
  "كثيرا",
  "اهلا",
  "سهلا",
  "مرحبا",
  "عفوا",
  "اليس",
  "ليس",
]);

/**
 * Akıllı Kelime Türü Sınıflandırıcı:
 * Her sözlük öğesini 'fiil' | 'isim' | 'edat' olarak sınıflandırır.
 */
export function getWordCategory(item: DictionaryItem): WordCategory {
  const rawTur = (item.tur || "").toLowerCase().trim();

  // 1. Açıkça edat / harf / kalıp olarak işaretlenmişse
  if (
    rawTur === "edat" ||
    rawTur === "harf" ||
    rawTur === "zarf" ||
    rawTur === "kalıp" ||
    rawTur === "bağlaç"
  ) {
    return "edat";
  }

  // 2. Fiil kontrolü:
  // - tur alanı "fiil" ise
  // - mazi veya muzari alanı doluysa
  // - Türkçe anlamı mastar ekiyle (-mak, -mek, -ması, -mesi) bitiyorsa
  // - Arapça alanı "كتب - يكتب" gibi mazi-muzari kalıbındaysa
  if (rawTur === "fiil" || Boolean(item.mazi || item.muzari)) {
    return "fiil";
  }

  const baseTr = (item.anlam_tr || "")
    .replace(/\(.*?\)/g, "")
    .split(/[;,]/)[0]
    .trim()
    .toLowerCase();

  if (/(mak|mek|ması|mesi)$/i.test(baseTr)) {
    return "fiil";
  }

  const primaryArRaw = (item.mufret || "").trim();
  const primaryArClean = cleanArabicText(primaryArRaw.split(/[\/\-]/)[0] || "");

  if (
    primaryArRaw.includes(" - ي") ||
    primaryArRaw.includes(" - ت") ||
    /^(استودع|يستودع|اخرج|يخرج)$/.test(primaryArClean)
  ) {
    return "fiil";
  }

  // 3. Edat / Zarf / Konuşma Kalıbı kontrolü:
  if (ARABIC_PARTICLES_SET.has(primaryArClean)) {
    return "edat";
  }

  if (
    item.kok === "-" &&
    (!item.cemi || item.cemi === "-") &&
    (primaryArClean.split(/\s+/).length >= 2 || primaryArClean.length <= 4)
  ) {
    return "edat";
  }

  return "isim";
}

// Anlamları kısalt (Eşleştirme oyununda ve kısa kartlarda taşmayı önler)
function cleanMeaning(meaning: string): string {
  const cleaned = meaning.replace(/\(.*?\)/g, "").trim();
  const parts = cleaned.split(",");
  return (parts.slice(0, 2).join(", ").trim() || meaning).trim();
}

// Sözlük + Tamamlayıcı Sözlük Yamasını birleştir ve mükerrerleri tekilleştir
function buildUnifiedDictionary(): DictionaryItem[] {
  const combined = [
    ...(sozlukRaw as DictionaryItem[]),
    ...SUPPLEMENT_DICTIONARY,
  ];
  const seenKeys = new Set<string>();
  const deduplicated: DictionaryItem[] = [];

  for (const item of combined) {
    const primary = (item.mufret || item.mazi || item.muzari || "")
      .split(/[\/\-]/)[0]
      .trim();
    const category = getWordCategory(item);
    const key = `${category}_${cleanArabicText(primary)}`;
    if (!primary) continue;

    if (!seenKeys.has(key)) {
      seenKeys.add(key);
      deduplicated.push({
        ...item,
        tur: category,
        anlam_tr: item.anlam_tr.trim(),
      });
    }
  }

  return deduplicated;
}

export const unifiedDictionary: DictionaryItem[] = buildUnifiedDictionary();

// Çoklu Sözlük Alanı İndeksi ve Kök İndeksi
const dictIndex = new Map<string, DictionaryItem>();
const rootIndex = new Map<string, DictionaryItem[]>();

function indexDictionaryItem(item: DictionaryItem) {
  const category = getWordCategory(item);
  const cleanedItem: DictionaryItem = {
    ...item,
    tur: category,
    anlam_tr: cleanMeaning(item.anlam_tr),
  };

  const rawFields = [
    item.mufret,
    item.cemi,
    item.mazi,
    item.muzari,
    item.masdar,
  ].filter(Boolean) as string[];

  for (const raw of rawFields) {
    const withoutParens = raw.replace(/\(.*?\)/g, " ");
    const variants = withoutParens
      .split(/[\/\-،,]/)
      .map((v) => v.trim())
      .filter(Boolean);

    for (const v of variants) {
      const norm = cleanArabicText(v);
      if (norm.length > 0 && !dictIndex.has(norm)) {
        dictIndex.set(norm, cleanedItem);
      }
      const subWords = norm.split(/\s+/).filter((sw) => sw.length >= 2);
      if (subWords.length > 1) {
        for (const sw of subWords) {
          if (!dictIndex.has(sw)) {
            dictIndex.set(sw, cleanedItem);
          }
        }
      }
    }
  }

  // Kök indeksleme ("س ك ن" -> "سكن")
  if (item.kok && item.kok !== "-") {
    const normRoot = cleanArabicText(item.kok).replace(/\s+/g, "");
    if (normRoot.length >= 2) {
      const list = rootIndex.get(normRoot) || [];
      list.push(cleanedItem);
      rootIndex.set(normRoot, list);
    }
  }
}

// Önce tamamlayıcı sözlüğü, sonra ana sözlüğü indeksle
SUPPLEMENT_DICTIONARY.forEach(indexDictionaryItem);
(sozlukRaw as DictionaryItem[]).forEach(indexDictionaryItem);

// ==============================================================================
// ÖN EK (PREFIX) VE SON EK (SUFFIX/ZAMİR) TABLOLARI
// ==============================================================================

const PREFIX_RULES: Array<{ raw: string; label: string }> = [
  { raw: "وبال", label: "وَ (ve) + بِـ (ile) + ال (belirlilik)" },
  { raw: "فبال", label: "فَـ (böylece) + بِـ (ile) + ال (belirlilik)" },
  { raw: "وال", label: "وَ (ve) + ال (belirlilik)" },
  { raw: "فال", label: "فَـ (böylece) + ال (belirlilik)" },
  { raw: "بال", label: "بِـ (ile/-de) + ال (belirlilik)" },
  { raw: "كال", label: "كَـ (gibi) + ال (belirlilik)" },
  { raw: "ولل", label: "وَ (ve) + لِـ (için) + ال (belirlilik)" },
  { raw: "فلل", label: "فَـ + لِـ (için) + ال (belirlilik)" },
  { raw: "لل", label: "لِـ (için/-e) + ال (belirlilik)" },
  { raw: "ال", label: "ال (belirlilik takısı)" },
  { raw: "وب", label: "وَ (ve) + بِـ (ile/-de)" },
  { raw: "ول", label: "وَ (ve) + لِـ (için)" },
  { raw: "وس", label: "وَ (ve) + سَـ (gelecek zaman)" },
  { raw: "فب", label: "فَـ + بِـ (ile)" },
  { raw: "فل", label: "فَـ + لِـ (için)" },
  { raw: "فس", label: "فَـ + سَـ (gelecek zaman)" },
  { raw: "س", label: "سَـ (gelecek zaman -ecek)" },
  { raw: "ل", label: "لِـ (için / -e)" },
  { raw: "ب", label: "بِـ (ile / -de)" },
  { raw: "ك", label: "كَـ (gibi)" },
  { raw: "ف", label: "فَـ (böylece)" },
  { raw: "و", label: "وَ (ve)" },
];

const SUFFIX_RULES: Array<{ raw: string; label: string }> = [
  { raw: "تموني", label: "تُمْ (siz) + نِي (beni/bana)" },
  { raw: "تني", label: "تَ / تْ + نِي (beni/bana)" },
  { raw: "نني", label: "نِي (beni/bana)" },
  { raw: "كما", label: "كُمَا (ikinizin / ikinize)" },
  { raw: "كم", label: "كُمْ (sizin / size)" },
  { raw: "كن", label: "كُنَّ (siz kadınların / size)" },
  { raw: "هما", label: "هُمَا (ikisinin / ikisine)" },
  { raw: "هم", label: "هُمْ (onların / onlara)" },
  { raw: "هن", label: "هُنَّ (o kadınların / onlara)" },
  { raw: "تها", label: "تُ / تَ / تْ + هَا (onu)" },
  { raw: "ته", label: "تُ / تَ / تْ + هُ (onu)" },
  { raw: "تك", label: "تُ + كَ / كِ (seni / sana)" },
  { raw: "ناها", label: "نَا (biz) + هَا (onu)" },
  { raw: "ناه", label: "نَا (biz) + هُ (onu)" },
  { raw: "وها", label: "وا (onlar/çoğul) + هَا (onu)" },
  { raw: "وه", label: "وا (onlar/çoğul) + هُ (onu)" },
  { raw: "يها", label: "ي (muhataba) + هَا (onu)" },
  { raw: "يه", label: "ي (muhataba) + هُ (onu)" },
  { raw: "ني", label: "نِي (beni / bana)" },
  { raw: "نا", label: "نَا (bizim / bizi / bize)" },
  { raw: "ها", label: "هَا (onun / onu [مؤنث])" },
  { raw: "ان", label: "انِ (ikil / tesniye eki)" },
  { raw: "ين", label: "ينَ / يْنِ (çoğul / ikil / muhataba eki)" },
  { raw: "ون", label: "ونَ (kurallı eril çoğul eki)" },
  { raw: "ات", label: "ات (kurallı dişil çoğul eki)" },
  { raw: "تم", label: "تُمْ (siz [mazi])" },
  { raw: "تن", label: "تُنَّ (siz kadınlar [mazi])" },
  { raw: "وا", label: "وا (onlar / emir çoğul)" },
  { raw: "ك", label: "كَ / كِ (senin / seni / sana)" },
  { raw: "ه", label: "هُ (onun / onu [مذكر])" },
  { raw: "ي", label: "ي (benim / muhataba)" },
  { raw: "ت", label: "تُ / تَ / تِ / تْ (mazi şahıs eki)" },
  { raw: "ا", label: "اً (tenvin / mansub eki)" },
];

// 2 harfli düzensiz / mehmuz / misal / ecvef emir kök haritası
const IRREGULAR_IMPERATIVE_MAP: Record<string, string> = {
  خذ: "اخذ",
  كل: "اكل",
  مر: "امر",
  قف: "وقف",
  صل: "وصل",
  ضع: "وضع",
  عد: "وعد",
  جد: "وجد",
  صف: "وصف",
  قل: "قال",
  بع: "باع",
  نم: "نام",
  قم: "قام",
  سر: "سار",
  زر: "زار",
};

function formatPrimaryWord(item: DictionaryItem): string {
  return (item.mufret || item.mazi || item.muzari || "")
    .split("/")[0]
    .trim();
}

function buildMorphologyNote(
  item: DictionaryItem,
  prefixLabel?: string,
  suffixLabel?: string,
  extraNote?: string
): string {
  const parts: string[] = [];
  if (prefixLabel) parts.push(prefixLabel);
  parts.push(`${formatPrimaryWord(item)} (${item.anlam_tr})`);
  if (extraNote) parts.push(extraNote);
  if (suffixLabel) parts.push(suffixLabel);
  return parts.join(" + ");
}

/**
 * Gövdeyi doğrudan, Tâ-i Merbûta (ت -> ة / ه) onarımıyla ve Fiil Çekim Çözücüsüyle sözlükte arar.
 */
function matchStemWithRules(
  stem: string
): {
  item: DictionaryItem;
  stage: "exact" | "ta-marbuta" | "verb";
  extraNote?: string;
} | null {
  if (!stem || stem.length < 2) return null;

  // 1. Doğrudan eşleşme
  if (dictIndex.has(stem)) {
    return { item: dictIndex.get(stem)!, stage: "exact" };
  }

  // 1b. 2 harfli emir fiil eşleşmesi (ör: خذ -> اخذ, قل -> قال, قف -> وقف)
  if (stem.length === 2 && IRREGULAR_IMPERATIVE_MAP[stem]) {
    const mapped = IRREGULAR_IMPERATIVE_MAP[stem];
    if (dictIndex.has(mapped)) {
      return {
        item: dictIndex.get(mapped)!,
        stage: "verb",
        extraNote: "emir kipi",
      };
    }
  }

  // 2. Tâ-i Merbûta (ت -> ة) Onarımı:
  if (stem.endsWith("ت") && stem.length >= 3) {
    const taMarbutaRestored = stem.slice(0, -1) + "ه";
    if (dictIndex.has(taMarbutaRestored)) {
      return {
        item: dictIndex.get(taMarbutaRestored)!,
        stage: "ta-marbuta",
        extraNote: "ت -> ة (Tâ-i Merbûta izafet dönüşümü)",
      };
    }
  }

  const withTaMarbuta = stem + "ه";
  if (dictIndex.has(withTaMarbuta)) {
    return {
      item: dictIndex.get(withTaMarbuta)!,
      stage: "ta-marbuta",
      extraNote: "ة (müenneslik eki)",
    };
  }

  // 3. Fiil Çekim Çözücü (Muzari & Mazi & Emir)
  // 3a. Muzari fiillerde baştaki أ / ن / ت şahıs eklerini ي veya ا (mazi bablar için) ile değiştir
  // (أَسْتَوْدِعُ -> يَسْتَوْدِعُ / اِسْتَوْدَعَ, أَسْكُنُ -> يَسْكُنُ)
  if (/^[انت]/.test(stem) && stem.length >= 3) {
    const muzariPrefixChar = stem[0];
    const personNote =
      muzariPrefixChar === "ا"
        ? "أَ (ben - muzari)"
        : muzariPrefixChar === "ن"
        ? "نَـ (biz - muzari)"
        : "تَـ (sen/o - muzari)";

    const asYa = "ي" + stem.slice(1);
    if (dictIndex.has(asYa)) {
      return {
        item: dictIndex.get(asYa)!,
        stage: "verb",
        extraNote: personNote,
      };
    }

    const asAlifMazi = "ا" + stem.slice(1);
    if (dictIndex.has(asAlifMazi)) {
      return {
        item: dictIndex.get(asAlifMazi)!,
        stage: "verb",
        extraNote: personNote,
      };
    }

    const bareThree = stem.slice(1);
    if (bareThree.length >= 3 && dictIndex.has(bareThree)) {
      return {
        item: dictIndex.get(bareThree)!,
        stage: "verb",
        extraNote: personNote,
      };
    }
  }

  // 3b. سَآكُلُ -> ساكل -> اكل / ياكل ve Emir fiiller (اِمْلَأْ، اِجْلِبْ، أَخْرِجْ)
  if (stem.startsWith("ا") && stem.length >= 3) {
    const asYaWithAlif = "يا" + stem.slice(1);
    if (dictIndex.has(asYaWithAlif)) {
      return {
        item: dictIndex.get(asYaWithAlif)!,
        stage: "verb",
        extraNote: "أَ (ben - muzari)",
      };
    }
    const withoutInitialAlif = stem.slice(1);
    if (withoutInitialAlif.length >= 3 && dictIndex.has(withoutInitialAlif)) {
      return {
        item: dictIndex.get(withoutInitialAlif)!,
        stage: "verb",
        extraNote: "emir / muzari kipi",
      };
    }
    const asYaImperative = "ي" + withoutInitialAlif;
    if (withoutInitialAlif.length >= 3 && dictIndex.has(asYaImperative)) {
      return {
        item: dictIndex.get(asYaImperative)!,
        stage: "verb",
        extraNote: "emir / muzari kipi",
      };
    }
  }

  // 3c. Mudaaf (şeddeli) fiil açılımı: سُرِرْتُ -> سرر -> سر
  if (
    stem.length === 3 &&
    stem[1] === stem[2] &&
    dictIndex.has(stem.slice(0, 2))
  ) {
    return {
      item: dictIndex.get(stem.slice(0, 2))!,
      stage: "verb",
      extraNote: "مضعف (şeddeli fiil çekimi)",
    };
  }

  // 3d. Ecvef (ortası illetli) fiil mazi/emir çekimi: جُعْتُ -> جع -> جاع, قُلْتُ -> قل -> قال
  if (stem.length === 2) {
    const hollowForm = stem[0] + "ا" + stem[1];
    if (dictIndex.has(hollowForm)) {
      return {
        item: dictIndex.get(hollowForm)!,
        stage: "verb",
        extraNote: "أجوف (ortası illetli fiil çekimi)",
      };
    }
  }

  // 3e. Nakıs fiil mazi çekimi: اشْتَرَيْتِ -> اشتري -> اشترى
  if (stem.endsWith("ي") && stem.length >= 4) {
    const withoutYa = stem.slice(0, -1) + "ا";
    if (dictIndex.has(withoutYa)) {
      return {
        item: dictIndex.get(withoutYa)!,
        stage: "verb",
      };
    }
  }

  return null;
}

/**
 * 5 KADEMELİ ARAPÇA MORFOLOJİK ÇÖZÜMLEYİCİ (analyzeAndMatchWord)
 * 1. Doğrudan Eşleşme
 * 2. Ön Ek (Prefix) ve Son Ek (Suffix/Zamir) Soyma
 * 3. Tâ-i Merbûta (ت -> ة) İzafet Onarımı
 * 4. Muzari / Mazi / Emir Fiil Çekim Çözücüsü
 * 5. 3'lü Ünsüz Kök İskeleti (kok) Eşleştirmesi
 */
export function analyzeAndMatchWord(rawWord: string): MorphologicalMatch | null {
  const cleanedRaw = rawWord.replace(
    /^[.,!?؟،;؛:"'()\[\]{}\d]+|[.,!?؟،;؛:"'()\[\]{}\d]+$/g,
    ""
  );
  if (!cleanedRaw || !/[\u0600-\u06FF]/.test(cleanedRaw)) return null;

  const normalized = cleanArabicText(cleanedRaw);
  if (normalized.length < 2) return null;

  // Özel Lafzatullah kontrolü (اللّٰهَ، باللّٰهِ، واللّٰهِ، للّٰهِ، فاللّٰهِ)
  if (/^[وفبتكل]*الله$/.test(normalized) || normalized === "لله" || normalized === "ولله") {
    const allahItem = dictIndex.get("الله");
    if (allahItem) {
      return {
        item: allahItem,
        originalWord: cleanedRaw,
        matchedStem: "الله",
        morphologyNote: buildMorphologyNote(allahItem),
        matchStage: "exact",
      };
    }
  }

  // Kademe 1: Doğrudan Eşleşme
  const direct = matchStemWithRules(normalized);
  if (direct) {
    return {
      item: direct.item,
      originalWord: cleanedRaw,
      matchedStem: normalized,
      morphologyNote: buildMorphologyNote(
        direct.item,
        undefined,
        undefined,
        direct.extraNote
      ),
      matchStage: direct.stage,
    };
  }

  // Kademe 2: Sadece Ön Ek Soyarak Dene
  for (const pref of PREFIX_RULES) {
    if (
      normalized.startsWith(pref.raw) &&
      normalized.length - pref.raw.length >= 2
    ) {
      const stem = normalized.slice(pref.raw.length);
      const matched = matchStemWithRules(stem);
      if (matched) {
        return {
          item: matched.item,
          originalWord: cleanedRaw,
          matchedStem: stem,
          prefixLabel: pref.label,
          morphologyNote: buildMorphologyNote(
            matched.item,
            pref.label,
            undefined,
            matched.extraNote
          ),
          matchStage:
            matched.stage === "exact" ? "affix" : matched.stage,
        };
      }
    }
  }

  // Kademe 3: Sadece Son Ek (Zamir / Çoğul / İkil / Şahıs) Soyarak Dene
  // (ör: أَسْتَوْدِعُكِ، أَسْتَوْدِعُكَ، مَعَكَ، خُذْهَا، أُمِّي، أَبِي)
  for (const suff of SUFFIX_RULES) {
    if (
      normalized.endsWith(suff.raw) &&
      normalized.length - suff.raw.length >= 2
    ) {
      const stem = normalized.slice(0, -suff.raw.length);
      const matched = matchStemWithRules(stem);
      if (matched) {
        return {
          item: matched.item,
          originalWord: cleanedRaw,
          matchedStem: stem,
          suffixLabel: suff.label,
          morphologyNote: buildMorphologyNote(
            matched.item,
            undefined,
            suff.label,
            matched.extraNote
          ),
          matchStage:
            matched.stage === "exact" ? "affix" : matched.stage,
        };
      }
    }
  }

  // Kademe 4: Hem Ön Ek Hem Son Ek Soyarak Dene
  // (ör: وَأَسْتَوْدِعُكَ، وَخُذْهَا، وَبِجَانِبِهَا، بِمَعْرِفَتِكَ، لِتَعَارُفِنَا)
  for (const pref of PREFIX_RULES) {
    if (normalized.startsWith(pref.raw)) {
      const afterPref = normalized.slice(pref.raw.length);
      for (const suff of SUFFIX_RULES) {
        if (
          afterPref.endsWith(suff.raw) &&
          afterPref.length - suff.raw.length >= 2
        ) {
          const stem = afterPref.slice(0, -suff.raw.length);
          const matched = matchStemWithRules(stem);
          if (matched) {
            return {
              item: matched.item,
              originalWord: cleanedRaw,
              matchedStem: stem,
              prefixLabel: pref.label,
              suffixLabel: suff.label,
              morphologyNote: buildMorphologyNote(
                matched.item,
                pref.label,
                suff.label,
                matched.extraNote
              ),
              matchStage:
                matched.stage === "exact" ? "affix" : matched.stage,
            };
          }
        }
      }
    }
  }

  // Kademe 5: Kök (kok) Ünsüz İskeleti Eşleştirmesi
  let candidateCore = normalized;
  for (const pref of PREFIX_RULES) {
    if (
      candidateCore.startsWith(pref.raw) &&
      candidateCore.length - pref.raw.length >= 3
    ) {
      candidateCore = candidateCore.slice(pref.raw.length);
      break;
    }
  }
  for (const suff of SUFFIX_RULES) {
    if (
      candidateCore.endsWith(suff.raw) &&
      candidateCore.length - suff.raw.length >= 3
    ) {
      candidateCore = candidateCore.slice(0, -suff.raw.length);
      break;
    }
  }

  const skeletonCandidates: string[] = [];
  if (candidateCore.startsWith("است") && candidateCore.length >= 6) {
    skeletonCandidates.push(candidateCore.slice(3));
  }
  if (/^[انتي]ست/.test(candidateCore) && candidateCore.length >= 6) {
    skeletonCandidates.push(candidateCore.slice(3));
  }
  if (candidateCore.startsWith("م") && candidateCore.length >= 4) {
    skeletonCandidates.push(candidateCore.slice(1));
  }
  if (/^[انتي]/.test(candidateCore) && candidateCore.length === 4) {
    skeletonCandidates.push(candidateCore.slice(1));
  }
  skeletonCandidates.push(candidateCore);
  skeletonCandidates.push(candidateCore.replace(/[اوي]/g, ""));

  for (const skel of skeletonCandidates) {
    if (skel.length === 3 && rootIndex.has(skel)) {
      const rootItems = rootIndex.get(skel)!;
      const bestItem = rootItems[0];
      return {
        item: bestItem,
        originalWord: cleanedRaw,
        matchedStem: skel,
        morphologyNote: `Kök eşleşmesi (${bestItem.kok}) → ${formatPrimaryWord(
          bestItem
        )} (${bestItem.anlam_tr})`,
        matchStage: "root",
      };
    }
  }

  return null;
}

// Geriye dönük uyumluluk için lookupWord
export function lookupWord(rawWord: string): DictionaryItem | null {
  const analysis = analyzeAndMatchWord(rawWord);
  return analysis ? analysis.item : null;
}

/**
 * Seçilen diyaloğun tüm satırlarını tarayarak o diyalogda geçen TÜM sözlük kelimelerini
 * orijinal çekimli cümle örneği ve morfolojik notuyla çıkarır.
 */
export function getDialogueVocabulary(
  dialogueId: string
): DialogueVocabularyEntry[] {
  const dialogues = diyaloglarRaw as Dialogue[];
  const dlg = dialogues.find((d) => d.id === dialogueId);
  if (!dlg) return [];

  const foundMap = new Map<string, DialogueVocabularyEntry>();

  for (const line of dlg.satirlar) {
    const tokens = line.arapca
      .replace(/[.,!?؟،;؛:"'()\[\]{}\d]/g, " ")
      .split(/\s+/)
      .filter(Boolean);

    for (const token of tokens) {
      const match = analyzeAndMatchWord(token);
      if (match && !foundMap.has(match.item.id)) {
        foundMap.set(match.item.id, {
          item: match.item,
          contextWord: match.originalWord,
          contextSentence: line.arapca,
          contextTranslation: line.turkce,
          morphologyNote: match.morphologyNote,
          lineNumber: line.sira,
        });
      }
    }
  }

  return Array.from(foundMap.values());
}

/**
 * Verilen cümle dizisindeki tüm eşleşen sözlük kelimelerini döndürür.
 */
export function extractDialogueVocabulary(
  sentences: string[]
): DictionaryItem[] {
  const foundItems = new Map<string, DictionaryItem>();

  sentences.forEach((sentence) => {
    const cleanSentence = sentence.replace(/[.,!?؟،;؛:"'()\[\]{}\d]/g, " ");
    const words = cleanSentence.split(/\s+/).filter(Boolean);

    words.forEach((word) => {
      const match = analyzeAndMatchWord(word);
      if (match && !foundItems.has(match.item.id)) {
        foundItems.set(match.item.id, match.item);
      }
    });
  });

  return Array.from(foundItems.values());
}