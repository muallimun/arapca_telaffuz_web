import sozlukRaw from "@/data/sozluk.json";
import diyaloglarRaw from "@/data/diyaloglar.json";
import { SUPPLEMENT_DICTIONARY } from "./supplementDict";
import { Dialogue, DictionaryItem } from "@/types/data";

export type WordCategory = "fiil" | "isim" | "edat" | "ozel-isim";

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

// Harekeleri soyar ancak harfleri (ة ve ى dahil) korur
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
 * Her sözlük öğesini 'fiil' | 'isim' | 'edat' | 'ozel-isim' olarak sınıflandırır.
 */
export function getWordCategory(item: DictionaryItem): WordCategory {
  const rawTur = (item.tur || "").toLowerCase().trim();

  // 0. Özel İsim (اسم علم) kontrolü
  if (
    rawTur === "ozel-isim" ||
    rawTur === "özel isim" ||
    rawTur === "özel-isim" ||
    item.id.startsWith("prop_") ||
    /özel isim/i.test(item.anlam_tr || "")
  ) {
    return "ozel-isim";
  }

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

// Anlamları kısalt (Eşleştirme oyununda ve kısa kartlarda taşmayı önler; Özel İsim parantezini korur)
function cleanMeaning(meaning: string, category?: WordCategory): string {
  if (category === "ozel-isim" || /özel isim/i.test(meaning)) {
    return meaning.trim();
  }
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
    anlam_tr: cleanMeaning(item.anlam_tr, category),
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
// SABİT ÖNCELİKLİ SÖZLÜK ÖĞELERİ (اِسْم، عَلِيّ، عَلَى، عُمَر، عُمْر، مَرْوَة)
// ==============================================================================

const CANONICAL_ISM_ITEM: DictionaryItem = dictIndex.get("اسم") || {
  id: "supp_20",
  tur: "isim",
  kok: "س م و",
  mufret: "اِسْم",
  cemi: "أَسْمَاء",
  anlam_tr: "isim, ad",
};

const CANONICAL_ALI_ITEM: DictionaryItem = {
  id: "prop_ali",
  tur: "ozel-isim",
  kok: "ع ل و",
  mufret: "عَلِيٌّ",
  cemi: "-",
  anlam_tr: "Ali (Özel İsim / Erkek İsmi)",
};

const CANONICAL_ALA_ITEM: DictionaryItem = dictIndex.get("علي") || {
  id: "supp_211",
  tur: "edat",
  kok: "-",
  mufret: "عَلَى",
  cemi: "-",
  anlam_tr: "üzerinde, üstünde, -e",
};

const CANONICAL_OMAR_ITEM: DictionaryItem = {
  id: "prop_omar",
  tur: "ozel-isim",
  kok: "ع م ر",
  mufret: "عُمَرُ",
  cemi: "-",
  anlam_tr: "Ömer (Özel İsim / Erkek İsmi)",
};

const CANONICAL_UMR_ITEM: DictionaryItem = {
  id: "supp_24",
  tur: "isim",
  kok: "ع م ر",
  mufret: "عُمْر",
  cemi: "أَعْمَار",
  anlam_tr: "yaş, ömür",
};

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

const SUFFIX_RULES: Array<{
  raw: string;
  label: string;
  nounLabel?: string;
  verbOnly?: boolean;
}> = [
  { raw: "تموني", label: "تُمْ (siz) + نِي (beni/bana)", verbOnly: true },
  { raw: "تني", label: "تَ / تْ + نِي (beni/bana)", verbOnly: true },
  { raw: "نني", label: "نِي (beni/bana)", verbOnly: true },
  {
    raw: "كما",
    label: "كُمَا (ikinizin / ikinize)",
    nounLabel: "كُمَا (ikinizin - 2. ikil iyelik zamiri)",
  },
  {
    raw: "كم",
    label: "كُمْ (sizin / size)",
    nounLabel: "كُمْ (sizin - 2. çoğul iyelik zamiri)",
  },
  {
    raw: "كن",
    label: "كُنَّ (siz kadınların / size)",
    nounLabel: "كُنَّ (sizin [مؤنث] - 2. çoğul iyelik zamiri)",
  },
  {
    raw: "هما",
    label: "هُمَا (ikisinin / ikisine)",
    nounLabel: "هُمَا (ikisinin - 3. ikil iyelik zamiri)",
  },
  {
    raw: "هم",
    label: "هُمْ (onların / onlara)",
    nounLabel: "هُمْ (onların - 3. çoğul iyelik zamiri)",
  },
  {
    raw: "هن",
    label: "هُنَّ (o kadınların / onlara)",
    nounLabel: "هُنَّ (onların [مؤنث] - 3. çoğul iyelik zamiri)",
  },
  { raw: "تها", label: "تُ / تَ / تْ + هَا (onu)", verbOnly: true },
  { raw: "ته", label: "تُ / تَ / تْ + هُ (onu)", verbOnly: true },
  { raw: "تك", label: "تُ + كَ / كِ (seni / sana)", verbOnly: true },
  { raw: "ناها", label: "نَا (biz) + هَا (onu)", verbOnly: true },
  { raw: "ناه", label: "نَا (biz) + هُ (onu)", verbOnly: true },
  { raw: "وها", label: "وا (onlar/çoğul) + هَا (onu)", verbOnly: true },
  { raw: "وه", label: "وا (onlar/çoğul) + هُ (onu)", verbOnly: true },
  { raw: "يها", label: "ي (muhataba) + هَا (onu)", verbOnly: true },
  { raw: "يه", label: "ي (muhataba) + هُ (onu)", verbOnly: true },
  { raw: "ني", label: "نِي (beni / bana)", verbOnly: true },
  {
    raw: "نا",
    label: "نَا (bizim / bizi / bize)",
    nounLabel: "نَا (bizim - 1. çoğul iyelik zamiri)",
  },
  {
    raw: "ها",
    label: "هَا (onun / onu [مؤنث])",
    nounLabel: "هَا (onun [مؤنث] - 3. tekil iyelik zamiri)",
  },
  { raw: "ان", label: "انِ (ikil / tesniye eki)" },
  { raw: "ين", label: "ينَ / يْنِ (çoğul / ikil / muhataba eki)" },
  { raw: "ون", label: "ونَ (kurallı eril çoğul eki)" },
  { raw: "ات", label: "ات (kurallı dişil çoğul eki)" },
  { raw: "تم", label: "تُمْ (siz [mazi])", verbOnly: true },
  { raw: "تن", label: "تُنَّ (siz kadınlar [mazi])", verbOnly: true },
  { raw: "وا", label: "وا (onlar / emir çoğul)", verbOnly: true },
  {
    raw: "ك",
    label: "كَ / كِ (senin / seni / sana)",
    nounLabel: "كَ / كِ (senin - 2. tekil iyelik zamiri)",
  },
  {
    raw: "ه",
    label: "هُ (onun / onu [مذكر])",
    nounLabel: "هُ (onun [مذكر] - 3. tekil iyelik zamiri)",
  },
  {
    raw: "ي",
    label: "ي (muhataba - 2. tekil dişil şahıs eki)",
    nounLabel: "ي (benim - 1. tekil iyelik zamiri)",
  },
  { raw: "ت", label: "تُ / تَ / تِ / تْ (mazi şahıs eki)", verbOnly: true },
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

function getSuffixDisplayLabel(
  suff: (typeof SUFFIX_RULES)[number],
  item: DictionaryItem
): string {
  const cat = getWordCategory(item);
  if ((cat === "isim" || cat === "ozel-isim" || cat === "edat") && suff.nounLabel) {
    return suff.nounLabel;
  }
  return suff.label;
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
 * Sadece doğrudan sözlük eşleşmesini ve Tâ-i Merbûta (ت -> ة) izafet onarımını kontrol eder.
 * İsimlerin (ör: اسمك) yanlışlıkla fiil önek kuralına girip başındaki elifin silinmesini engeller.
 */
function matchNominalOrExactStem(
  stem: string
): {
  item: DictionaryItem;
  stage: "exact" | "ta-marbuta";
  extraNote?: string;
} | null {
  if (!stem || stem.length < 2) return null;

  // 1. Doğrudan eşleşme
  if (dictIndex.has(stem)) {
    return { item: dictIndex.get(stem)!, stage: "exact" };
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

  return null;
}

/**
 * Gövdeyi doğrudan, Tâ-i Merbûta (ت -> ة / ه) onarımıyla ve Fiil Çekim Çözücüsüyle sözlükte arar.
 * Eğer endsWithTaMarbuta === true ise (kelimenin aslı ة ile bitiyorsa) ASLA fiil çözümleyicisine girmez.
 */
function matchStemWithRules(
  stem: string,
  endsWithTaMarbuta = false
): {
  item: DictionaryItem;
  stage: "exact" | "ta-marbuta" | "verb";
  extraNote?: string;
} | null {
  if (!stem || stem.length < 2) return null;

  const nominal = matchNominalOrExactStem(stem);
  if (nominal) return nominal;

  // KURAL: Sonu Tâ-i Merbûta (ة / ـة) ile biten kelimeler %100 isimdir, ASLA fiil olarak çözümlenemez!
  if (endsWithTaMarbuta) return null;

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

  // 3. Fiil Çekim Çözücü (Muzari & Mazi & Emir) — Yalnızca bulunan öğe gerçek bir FİİL ise kabul edilir!
  if (/^[انت]/.test(stem) && stem.length >= 3) {
    const muzariPrefixChar = stem[0];
    const personNote =
      muzariPrefixChar === "ا"
        ? "أَ (ben - muzari)"
        : muzariPrefixChar === "ن"
        ? "نَـ (biz - muzari)"
        : "تَـ (sen/o - muzari)";

    const asYa = "ي" + stem.slice(1);
    if (dictIndex.has(asYa) && getWordCategory(dictIndex.get(asYa)!) === "fiil") {
      return {
        item: dictIndex.get(asYa)!,
        stage: "verb",
        extraNote: personNote,
      };
    }

    const asAlifMazi = "ا" + stem.slice(1);
    if (
      dictIndex.has(asAlifMazi) &&
      getWordCategory(dictIndex.get(asAlifMazi)!) === "fiil"
    ) {
      return {
        item: dictIndex.get(asAlifMazi)!,
        stage: "verb",
        extraNote: personNote,
      };
    }

    const bareThree = stem.slice(1);
    if (
      bareThree.length >= 3 &&
      dictIndex.has(bareThree) &&
      getWordCategory(dictIndex.get(bareThree)!) === "fiil"
    ) {
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
    if (
      dictIndex.has(asYaWithAlif) &&
      getWordCategory(dictIndex.get(asYaWithAlif)!) === "fiil"
    ) {
      return {
        item: dictIndex.get(asYaWithAlif)!,
        stage: "verb",
        extraNote: "أَ (ben - muzari)",
      };
    }
    const withoutInitialAlif = stem.slice(1);
    if (
      withoutInitialAlif.length >= 3 &&
      dictIndex.has(withoutInitialAlif) &&
      getWordCategory(dictIndex.get(withoutInitialAlif)!) === "fiil"
    ) {
      return {
        item: dictIndex.get(withoutInitialAlif)!,
        stage: "verb",
        extraNote: "emir / muzari kipi",
      };
    }
    const asYaImperative = "ي" + withoutInitialAlif;
    if (
      withoutInitialAlif.length >= 3 &&
      dictIndex.has(asYaImperative) &&
      getWordCategory(dictIndex.get(asYaImperative)!) === "fiil"
    ) {
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
    dictIndex.has(stem.slice(0, 2)) &&
    getWordCategory(dictIndex.get(stem.slice(0, 2))!) === "fiil"
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
    if (
      dictIndex.has(hollowForm) &&
      getWordCategory(dictIndex.get(hollowForm)!) === "fiil"
    ) {
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
    if (
      dictIndex.has(withoutYa) &&
      getWordCategory(dictIndex.get(withoutYa)!) === "fiil"
    ) {
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
 * + Özel İsim (اسم علم), "اِسْم + zamir", "عَلِيٌّ / عَلَى", "عُمَر / عُمْر" ve "ة" Koruması
 */
export function analyzeAndMatchWord(rawWord: string): MorphologicalMatch | null {
  const cleanedRaw = rawWord.replace(
    /^[.,!?؟،;؛:"'()\[\]{}\d]+|[.,!?؟،;؛:"'()\[\]{}\d]+$/g,
    ""
  );
  if (!cleanedRaw || !/[\u0600-\u06FF]/.test(cleanedRaw)) return null;

  const bareLetters = stripHarakat(cleanedRaw);
  const endsWithTaMarbuta = bareLetters.endsWith("ة");
  const normalized = cleanArabicText(cleanedRaw);
  if (normalized.length < 2) return null;

  // 0. Özel Lafzatullah kontrolü (اللّٰهَ، باللّٰهِ، واللّٰهِ، للّٰهِ، فاللّٰهِ)
  if (
    /^[وفبتكل]*الله$/.test(normalized) ||
    normalized === "لله" ||
    normalized === "ولله"
  ) {
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

  // 0.1. KESİN AYRIM KURALI 1: "عَلِيٌّ" (Ali - Özel İsim) vs "عَلَى" (üzerinde - Harf-i Cer)
  if (bareLetters === "على") {
    return {
      item: CANONICAL_ALA_ITEM,
      originalWord: cleanedRaw,
      matchedStem: "على",
      morphologyNote: buildMorphologyNote(CANONICAL_ALA_ITEM),
      matchStage: "exact",
    };
  }
  if (bareLetters === "علي" || bareLetters === "عليا" || bareLetters === "وعلي") {
    // Eğer ل harfinde fetha ve ي üzerinde şedde+fetha varsa (عَلَيَّ = benim üzerime), عَلَى + ي olarak çözümle
    const isAlayya = /عَلَيَّ|عَلَيَ/.test(cleanedRaw);
    if (isAlayya) {
      return {
        item: CANONICAL_ALA_ITEM,
        originalWord: cleanedRaw,
        matchedStem: "على",
        suffixLabel: "ي (benim - 1. tekil zamir)",
        morphologyNote: buildMorphologyNote(
          CANONICAL_ALA_ITEM,
          undefined,
          "ي (benim - 1. tekil zamir)"
        ),
        matchStage: "affix",
      };
    }
    return {
      item: CANONICAL_ALI_ITEM,
      originalWord: cleanedRaw,
      matchedStem: "علي",
      morphologyNote: buildMorphologyNote(CANONICAL_ALI_ITEM),
      matchStage: "exact",
    };
  }

  // 0.2. KESİN AYRIM KURALI 2: "عُمَرُ / عُمَرَ" (Ömer - Özel İsim) vs "عُمْر / عُمُر" (yaş, ömür - İsim)
  if (normalized === "عمر" || normalized === "وعمر") {
    const hasSukunOrDammaOnMim = /عُمْر|عُمُر/.test(cleanedRaw);
    const chosenItem = hasSukunOrDammaOnMim
      ? CANONICAL_UMR_ITEM
      : CANONICAL_OMAR_ITEM;
    return {
      item: chosenItem,
      originalWord: cleanedRaw,
      matchedStem: "عمر",
      morphologyNote: buildMorphologyNote(chosenItem),
      matchStage: "exact",
    };
  }
  if (/^[وفبكل]*عمر(ي|ك|ه|ها|نا|كم|هم|هما|كما)$/.test(normalized)) {
    const suffRaw = normalized.replace(/^[وفبكل]*عمر/, "");
    const suffObj = SUFFIX_RULES.find((s) => s.raw === suffRaw);
    const suffLabel = suffObj
      ? getSuffixDisplayLabel(suffObj, CANONICAL_UMR_ITEM)
      : undefined;
    return {
      item: CANONICAL_UMR_ITEM,
      originalWord: cleanedRaw,
      matchedStem: "عمر",
      suffixLabel: suffLabel,
      morphologyNote: buildMorphologyNote(
        CANONICAL_UMR_ITEM,
        undefined,
        suffLabel
      ),
      matchStage: "affix",
    };
  }

  // 0.3. KESİN ÖNCELİK KURALI 3: "اِسْم" ve İyelik Zamirli Çekimleri (اِسْمِي، اسْمُكَ، اسْمُكِ، اسْمُهُ، اسْمُهَا، بِاسْمِ، وَاسْمِي)
  // Asla "سَمَك" (balık) ile eşleşmemesi için doğrudan "اِسْم" (isim, ad - Kök: س م و) öğesine bağlanır.
  const ismMatch = normalized.match(
    /^(و|ف|ب|ك|ل|وب|ول|فب|فل)?اسم(ي|ك|ه|ها|نا|كم|كن|هم|هن|هما|كما)?$/
  );
  if (ismMatch) {
    const prefRaw = ismMatch[1] || "";
    const suffRaw = ismMatch[2] || "";
    const prefObj = PREFIX_RULES.find((p) => p.raw === prefRaw);
    const suffObj = SUFFIX_RULES.find((s) => s.raw === suffRaw);
    const prefLabel = prefObj?.label;
    const suffLabel = suffObj
      ? getSuffixDisplayLabel(suffObj, CANONICAL_ISM_ITEM)
      : undefined;

    return {
      item: CANONICAL_ISM_ITEM,
      originalWord: cleanedRaw,
      matchedStem: "اسم",
      prefixLabel: prefLabel,
      suffixLabel: suffLabel,
      morphologyNote: buildMorphologyNote(
        CANONICAL_ISM_ITEM,
        prefLabel,
        suffLabel
      ),
      matchStage: prefRaw || suffRaw ? "affix" : "exact",
    };
  }

  // Kademe 1: Doğrudan Eşleşme (Önce İsim / Tam Eşleşme)
  const directNominal = matchNominalOrExactStem(normalized);
  if (directNominal) {
    return {
      item: directNominal.item,
      originalWord: cleanedRaw,
      matchedStem: normalized,
      morphologyNote: buildMorphologyNote(
        directNominal.item,
        undefined,
        undefined,
        directNominal.extraNote
      ),
      matchStage: directNominal.stage,
    };
  }

  // Kademe 2: İyelik/ Nesne Zamiri ve Ön Ek Soyarak İSİM Eşleşmesi (Fiil önek soyma işleminden ÖNCE çalışır!)
  // Not: Kelime "ة" (Tâ-i Merbûta) ile bitiyorsa sonundaki "ه" zamir değildir, kelime gövdesinin parçasıdır!
  if (!endsWithTaMarbuta) {
    for (const suff of SUFFIX_RULES) {
      if (
        normalized.endsWith(suff.raw) &&
        normalized.length - suff.raw.length >= 2
      ) {
        const stem = normalized.slice(0, -suff.raw.length);
        const matchedNom = matchNominalOrExactStem(stem);
        if (
          matchedNom &&
          (!suff.verbOnly || getWordCategory(matchedNom.item) === "fiil")
        ) {
          const sLabel = getSuffixDisplayLabel(suff, matchedNom.item);
          return {
            item: matchedNom.item,
            originalWord: cleanedRaw,
            matchedStem: stem,
            suffixLabel: sLabel,
            morphologyNote: buildMorphologyNote(
              matchedNom.item,
              undefined,
              sLabel,
              matchedNom.extraNote
            ),
            matchStage:
              matchedNom.stage === "exact" ? "affix" : matchedNom.stage,
          };
        }
      }
    }
  }

  // Kademe 2b: Sadece Ön Ek Soyarak İsim/Tam Eşleşme
  for (const pref of PREFIX_RULES) {
    if (
      normalized.startsWith(pref.raw) &&
      normalized.length - pref.raw.length >= 2
    ) {
      const stem = normalized.slice(pref.raw.length);
      const matchedNom = matchNominalOrExactStem(stem);
      if (matchedNom) {
        return {
          item: matchedNom.item,
          originalWord: cleanedRaw,
          matchedStem: stem,
          prefixLabel: pref.label,
          morphologyNote: buildMorphologyNote(
            matchedNom.item,
            pref.label,
            undefined,
            matchedNom.extraNote
          ),
          matchStage:
            matchedNom.stage === "exact" ? "affix" : matchedNom.stage,
        };
      }
    }
  }

  // Kademe 2c: Hem Ön Ek Hem Son Ek Soyarak İsim/Tam Eşleşme
  if (!endsWithTaMarbuta) {
    for (const pref of PREFIX_RULES) {
      if (normalized.startsWith(pref.raw)) {
        const afterPref = normalized.slice(pref.raw.length);
        for (const suff of SUFFIX_RULES) {
          if (
            afterPref.endsWith(suff.raw) &&
            afterPref.length - suff.raw.length >= 2
          ) {
            const stem = afterPref.slice(0, -suff.raw.length);
            const matchedNom = matchNominalOrExactStem(stem);
            if (
              matchedNom &&
              (!suff.verbOnly || getWordCategory(matchedNom.item) === "fiil")
            ) {
              const sLabel = getSuffixDisplayLabel(suff, matchedNom.item);
              return {
                item: matchedNom.item,
                originalWord: cleanedRaw,
                matchedStem: stem,
                prefixLabel: pref.label,
                suffixLabel: sLabel,
                morphologyNote: buildMorphologyNote(
                  matchedNom.item,
                  pref.label,
                  sLabel,
                  matchedNom.extraNote
                ),
                matchStage:
                  matchedNom.stage === "exact" ? "affix" : matchedNom.stage,
              };
            }
          }
        }
      }
    }
  }

  // KURAL: Kelime "ة" (Tâ-i Merbûta) ile bitiyorsa ASLA fiil çekim çözümleyicisine girmez!
  if (endsWithTaMarbuta) {
    return null;
  }

  // Kademe 3: Fiil Çekim Kuralları (Doğrudan, Ön Ekli, Son Ekli, Ön+Son Ekli)
  const directVerb = matchStemWithRules(normalized, false);
  if (directVerb) {
    return {
      item: directVerb.item,
      originalWord: cleanedRaw,
      matchedStem: normalized,
      morphologyNote: buildMorphologyNote(
        directVerb.item,
        undefined,
        undefined,
        directVerb.extraNote
      ),
      matchStage: directVerb.stage,
    };
  }

  for (const pref of PREFIX_RULES) {
    if (
      normalized.startsWith(pref.raw) &&
      normalized.length - pref.raw.length >= 2
    ) {
      const stem = normalized.slice(pref.raw.length);
      const matched = matchStemWithRules(stem, false);
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

  for (const suff of SUFFIX_RULES) {
    if (
      normalized.endsWith(suff.raw) &&
      normalized.length - suff.raw.length >= 2
    ) {
      const stem = normalized.slice(0, -suff.raw.length);
      const matched = matchStemWithRules(stem, false);
      if (matched) {
        const sLabel = getSuffixDisplayLabel(suff, matched.item);
        return {
          item: matched.item,
          originalWord: cleanedRaw,
          matchedStem: stem,
          suffixLabel: sLabel,
          morphologyNote: buildMorphologyNote(
            matched.item,
            undefined,
            sLabel,
            matched.extraNote
          ),
          matchStage:
            matched.stage === "exact" ? "affix" : matched.stage,
        };
      }
    }
  }

  for (const pref of PREFIX_RULES) {
    if (normalized.startsWith(pref.raw)) {
      const afterPref = normalized.slice(pref.raw.length);
      for (const suff of SUFFIX_RULES) {
        if (
          afterPref.endsWith(suff.raw) &&
          afterPref.length - suff.raw.length >= 2
        ) {
          const stem = afterPref.slice(0, -suff.raw.length);
          const matched = matchStemWithRules(stem, false);
          if (matched) {
            const sLabel = getSuffixDisplayLabel(suff, matched.item);
            return {
              item: matched.item,
              originalWord: cleanedRaw,
              matchedStem: stem,
              prefixLabel: pref.label,
              suffixLabel: sLabel,
              morphologyNote: buildMorphologyNote(
                matched.item,
                pref.label,
                sLabel,
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
 * Aynı temel kelimenin (lemma) farklı zamirli çekimlerini (ör: اسمك ve اسمي) tekilleştirir.
 */
export function getDialogueVocabulary(
  dialogueId: string
): DialogueVocabularyEntry[] {
  const dialogues = diyaloglarRaw as Dialogue[];
  const dlg = dialogues.find((d) => d.id === dialogueId);
  if (!dlg) return [];

  const foundMap = new Map<string, DialogueVocabularyEntry>();
  const seenLemmaKeys = new Set<string>();

  for (const line of dlg.satirlar) {
    const tokens = line.arapca
      .replace(/[.,!?؟،;؛:"'()\[\]{}\d]/g, " ")
      .split(/\s+/)
      .filter(Boolean);

    for (const token of tokens) {
      const match = analyzeAndMatchWord(token);
      if (!match) continue;

      const lemmaKey = `${getWordCategory(match.item)}_${cleanArabicText(
        formatPrimaryWord(match.item)
      )}`;
      if (!foundMap.has(match.item.id) && !seenLemmaKeys.has(lemmaKey)) {
        seenLemmaKeys.add(lemmaKey);
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
  const seenLemmaKeys = new Set<string>();

  sentences.forEach((sentence) => {
    const cleanSentence = sentence.replace(/[.,!?؟،;؛:"'()\[\]{}\d]/g, " ");
    const words = cleanSentence.split(/\s+/).filter(Boolean);

    words.forEach((word) => {
      const match = analyzeAndMatchWord(word);
      if (match) {
        const lemmaKey = `${getWordCategory(match.item)}_${cleanArabicText(
          formatPrimaryWord(match.item)
        )}`;
        if (!foundItems.has(match.item.id) && !seenLemmaKeys.has(lemmaKey)) {
          seenLemmaKeys.add(lemmaKey);
          foundItems.set(match.item.id, match.item);
        }
      }
    });
  });

  return Array.from(foundItems.values());
}