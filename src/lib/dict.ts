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
    ...SUPPLEMENT_DICTIONARY,
    ...(sozlukRaw as DictionaryItem[]),
  ];
  const seenKeys = new Set<string>();
  const deduplicated: DictionaryItem[] = [];

  for (const item of combined) {
    const primary = (item.mufret || item.mazi || item.muzari || "")
      .split(/[\/\-]/)[0]
      .trim();
    const category = getWordCategory(item);
    const key = `${category}_${cleanArabicText(primary)}_${item.anlam_tr.slice(0, 18)}`;
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

interface IndexedCandidate {
  item: DictionaryItem;
  rawForms: string[];
  order: number;
}

// Çoklu Sözlük Alanı İndeksi (Eş yazılımlı kelimelerin tamamını tutar) ve Kök İndeksi
const dictIndex = new Map<string, DictionaryItem>();
const dictMultiIndex = new Map<string, IndexedCandidate[]>();
const rootIndex = new Map<string, DictionaryItem[]>();
let candidateOrderCounter = 0;

function addCandidateToMultiIndex(
  normKey: string,
  cleanedItem: DictionaryItem,
  rawVariant: string
) {
  if (!normKey) return;
  if (!dictIndex.has(normKey)) {
    dictIndex.set(normKey, cleanedItem);
  }
  const list = dictMultiIndex.get(normKey) || [];
  const existing = list.find((c) => c.item.id === cleanedItem.id);
  if (existing) {
    if (!existing.rawForms.includes(rawVariant)) {
      existing.rawForms.push(rawVariant);
    }
  } else {
    list.push({
      item: cleanedItem,
      rawForms: [rawVariant],
      order: candidateOrderCounter++,
    });
    dictMultiIndex.set(normKey, list);
  }
}

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
      if (!norm) continue;

      // KURAL 1-A: Çok kelimeli ifadelerin ("ابْنُ خَلْدُونَ", "حَوْضُ سِبَاحَةٍ", "عُسْرُ الْهَضْمِ")
      // alt kelimelerini ("ابن" vb.) tekil anahtar olarak indeksleme! Sadece tam ifadeyi veya tek kelimeli varyantları indeksle.
      const wordsInVariant = norm.split(/\s+/).filter(Boolean);
      if (wordsInVariant.length === 1) {
        addCandidateToMultiIndex(norm, cleanedItem, v);
        // Eğer varyant "ال" ile başlıyorsa, "ال"siz halini de aday listesine ekle (örn: الْبَأْسُ -> باس)
        if (norm.startsWith("ال") && norm.length >= 4) {
          addCandidateToMultiIndex(norm.slice(2), cleanedItem, v);
        }
      } else {
        // Çok kelimeli ifadeyi yalnızca tam haliyle indeksle
        addCandidateToMultiIndex(norm, cleanedItem, v);
      }
    }
  }

  // Kök indeksleme ("س ك ن" -> "سكن")
  if (item.kok && item.kok !== "-") {
    const normRoot = cleanArabicText(item.kok).replace(/\s+/g, "");
    if (normRoot.length >= 2) {
      const list = rootIndex.get(normRoot) || [];
      if (!list.some((existing) => existing.id === cleanedItem.id)) {
        list.push(cleanedItem);
        rootIndex.set(normRoot, list);
      }
    }
  }
}

// Önce tamamlayıcı sözlüğü (öncelikli 60 diyalog kayıtları dahil), sonra ana sözlüğü indeksle
SUPPLEMENT_DICTIONARY.forEach(indexDictionaryItem);
(sozlukRaw as DictionaryItem[]).forEach(indexDictionaryItem);

// ==============================================================================
// SABİT ÖNCELİKLİ SÖZLÜK ÖĞELERİ VE ÖZEL İSİM / ŞEHİR / AY KORUMA KALKANI
// ==============================================================================

const CANONICAL_ISM_ITEM: DictionaryItem = dictIndex.get("اسم") || {
  id: "supp_001",
  tur: "isim",
  kok: "س م و",
  mufret: "اِسْم",
  cemi: "أَسْمَاء",
  anlam_tr: "isim, ad",
};

const CANONICAL_IBN_ITEM: DictionaryItem = {
  id: "kelime_430",
  tur: "isim",
  kok: "ب ن ي",
  mufret: "ابْن / وَلَد",
  cemi: "أَبْنَاء / أَوْلَاد",
  anlam_tr: "oğul, erkek çocuk",
};

const CANONICAL_BINT_ITEM: DictionaryItem = {
  id: "kelime_431",
  tur: "isim",
  kok: "ب ن ي",
  mufret: "بِنْت / ابْنَة",
  cemi: "بَنَات",
  anlam_tr: "kız, kız çocuk",
};

const CANONICAL_ALI_ITEM: DictionaryItem = {
  id: "prop_ali",
  tur: "ozel-isim",
  kok: "ع ل و",
  mufret: "عَلِيٌّ",
  cemi: "-",
  anlam_tr: "Ali (Özel İsim / Erkek İsmi)",
};

const CANONICAL_ALA_ITEM: DictionaryItem = {
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

// KURAL 1-B: Özel İsim, Şehir ve Ay Koruması (Asla "ان" ikil veya "ات" çoğul eki soyulmaz!)
const PROTECTED_CITIES_AND_MONTHS: Record<string, DictionaryItem> = {
  عمان: {
    id: "supp_amman_sehir",
    tur: "ozel-isim",
    kok: "ع م ن",
    mufret: "عَمَّانُ",
    cemi: "-",
    anlam_tr: "Amman (Ürdün'ün başkenti)",
  },
  بيروت: {
    id: "supp_beyrut_sehir",
    tur: "ozel-isim",
    kok: "-",
    mufret: "بَيْرُوتُ",
    cemi: "-",
    anlam_tr: "Beyrut (Lübnan'ın başkenti)",
  },
  دمشق: {
    id: "prop_dimashq",
    tur: "ozel-isim",
    kok: "-",
    mufret: "دِمَشْقُ",
    cemi: "-",
    anlam_tr: "Şam (Suriye'nin başkenti)",
  },
  حلب: {
    id: "prop_halab",
    tur: "ozel-isim",
    kok: "-",
    mufret: "حَلَبُ",
    cemi: "-",
    anlam_tr: "Halep (Şehir)",
  },
  القاهره: {
    id: "prop_qahira",
    tur: "ozel-isim",
    kok: "ق هـ ر",
    mufret: "الْقَاهِرَةُ",
    cemi: "-",
    anlam_tr: "Kahire (Mısır'ın başkenti)",
  },
  قاهره: {
    id: "prop_qahira",
    tur: "ozel-isim",
    kok: "ق هـ ر",
    mufret: "الْقَاهِرَةُ",
    cemi: "-",
    anlam_tr: "Kahire (Mısır'ın başkenti)",
  },
  القدس: {
    id: "prop_quds",
    tur: "ozel-isim",
    kok: "ق د س",
    mufret: "الْقُدْسُ",
    cemi: "-",
    anlam_tr: "Kudüs",
  },
  بغداد: {
    id: "prop_baghdad",
    tur: "ozel-isim",
    kok: "-",
    mufret: "بَغْدَادُ",
    cemi: "-",
    anlam_tr: "Bağdat (Irak'ın başkenti)",
  },
  تونس: {
    id: "prop_tunis",
    tur: "ozel-isim",
    kok: "-",
    mufret: "تُونُسُ",
    cemi: "-",
    anlam_tr: "Tunus",
  },
  الاسكندريه: {
    id: "prop_iskandariyya",
    tur: "ozel-isim",
    kok: "-",
    mufret: "الْإِسْكَنْدَرِيَّةُ",
    cemi: "-",
    anlam_tr: "İskenderiye (Mısır'da şehir)",
  },
  اسكندريه: {
    id: "prop_iskandariyya",
    tur: "ozel-isim",
    kok: "-",
    mufret: "الْإِسْكَنْدَرِيَّةُ",
    cemi: "-",
    anlam_tr: "İskenderiye (Mısır'da şehir)",
  },
  مكه: {
    id: "prop_makka",
    tur: "ozel-isim",
    kok: "-",
    mufret: "مَكَّةُ",
    cemi: "-",
    anlam_tr: "Mekke-i Mükerreme",
  },
  حزيران: {
    id: "prop_huzayran",
    tur: "isim",
    kok: "-",
    mufret: "حَزِيرَانُ",
    cemi: "-",
    anlam_tr: "Haziran (ayı)",
  },
  اغسطس: {
    id: "prop_aghustus",
    tur: "isim",
    kok: "-",
    mufret: "أُغُسْطُسُ",
    cemi: "-",
    anlam_tr: "Ağustos (ayı)",
  },
  محرم: {
    id: "prop_muharram",
    tur: "isim",
    kok: "ح ر م",
    mufret: "مُحَرَّمٌ",
    cemi: "-",
    anlam_tr: "Muharrem (Hicri yılın ilk ayı); haram kılınmış",
  },
  رمضان: {
    id: "prop_ramadan",
    tur: "isim",
    kok: "ر م ض",
    mufret: "رَمَضَانُ",
    cemi: "-",
    anlam_tr: "Ramazan (ayı)",
  },
  شعبان: {
    id: "prop_shaban",
    tur: "isim",
    kok: "ش ع ب",
    mufret: "شَعْبَانُ",
    cemi: "-",
    anlam_tr: "Şaban (ayı)",
  },
  لبنان: {
    id: "prop_lubnan",
    tur: "ozel-isim",
    kok: "-",
    mufret: "لُبْنَانُ",
    cemi: "-",
    anlam_tr: "Lübnan",
  },
};

// Sonundaki "ان" veya "ات" veya "ين" eki kelime gövdesine ait olan, asla ikil/çoğul diye bölünmemesi gereken kelimeler
const PROTECTED_NO_DUAL_PLURAL_SPLIT = new Set<string>([
  "عمان",
  "بيروت",
  "دمشق",
  "حلب",
  "القاهره",
  "القدس",
  "بغداد",
  "تونس",
  "الاسكندريه",
  "مكه",
  "المدينه",
  "حزيران",
  "اغسطس",
  "محرم",
  "رمضان",
  "شعبان",
  "لبنان",
  "سليمان",
  "عثمان",
  "عدنان",
  "سلطان",
  "عنوان",
  "ميدان",
  "فنجان",
  "دكان",
  "اسنان",
  "الوان",
  "احيان",
  "جيران",
  "بلدان",
  "اخوان",
  "قمصان",
  "بركان",
  "ثعبان",
  "فستان",
  "مهرجان",
  "امتحان",
  "اطمئنان",
  "امتنان",
  "استئذان",
  "مكان",
  "زمان",
  "انسان",
  "لسان",
  "امان",
  "ايمان",
  "اعلان",
  "احسان",
  "عرفان",
  "غفران",
  "طيران",
  "حيوان",
]);

// ==============================================================================
// KURAL 1-C & 1-D: ARAPÇA GRAMER KALKANI + HAREKE VE TÜRKÇE CÜMLE BAĞLAMI SKORLAMA
// ==============================================================================

const PREPOSITION_PREV_WORDS = new Set<string>([
  "في",
  "من",
  "الي",
  "إلى",
  "الى",
  "عن",
  "علي",
  "على",
  "مع",
  "قبل",
  "بعد",
  "عند",
  "داخل",
  "امام",
  "أمام",
  "مقابل",
  "خلف",
  "فوق",
  "تحت",
  "بين",
  "بدون",
  "دون",
  "منذ",
  "حتي",
  "حتى",
  "خلال",
  "حول",
  "نحو",
  "ضد",
]);

/**
 * Tıklanan kelimede kesin İSİM ALAMETİ (Noun Marker) olup olmadığını tespit eder:
 * 1. Başında ال (veya وَال / فَال / بِال / لِل / كَال) belirlilik takısı varsa,
 * 2. Sonunda ة (Tâ-i Merbûta), Tenvin (ً ٌ ٍ) veya Nispet eki (ـِيّ / ـِيَّة) varsa,
 * 3. Sonunda iyelik zamiri olup zamirden önceki harfte kesra (ِ) varsa (örn: ظَهْرِكَ, مَعْرِفَتِكَ, اِبْنِكُمْ),
 * 4. Kendisinden önceki kelime (prevWordAr) bir harf-i cer veya zarf ise (فِي، مِنْ، إِلَى، عَنْ، عَلَى، مَعَ، قَبْلَ، بَعْدَ، عِنْدَ...)
 *    veya kelimenin kendisi بِـ (kesralı bi) ile başlıyorsa (örn: بِمَعْرِفَتِكَ).
 */
export function hasDefiniteNounMarker(
  cleanedRaw: string,
  prevWordAr?: string
): boolean {
  const bare = stripHarakat(cleanedRaw);

  // 1. Tâ-i Merbûta (ة) veya Tenvin (ً ٌ ٍ)
  if (bare.endsWith("ة") || /[\u064B\u064C\u064D]/.test(cleanedRaw)) {
    return true;
  }

  // 2. Nispet eki (ـِيّ / ـِيَّة)
  if (/ِيّ[\u064E\u064F\u0650\u064B\u064C\u064D]*$/.test(cleanedRaw)) {
    return true;
  }

  // 3. Başında ال (Elif-i Vasl + Lam) veya وَال / فَال / بِال / كَال / لِل
  // Not: Kat' hemzeli أَلْـ / إِلْـ (أَلْوَان، إِلَى، أَلَمْ) hariç, vasl elifli ال
  const RELATIVE_OR_PARTICLE_EXCLUSIONS = new Set([
    "الي",
    "إلى",
    "الى",
    "الا",
    "إلا",
    "الذي",
    "التي",
    "الذين",
    "اللذان",
    "اللتان",
    "اللواتي",
    "اللائي",
    "الان",
    "الآن",
  ]);
  const norm = cleanArabicText(cleanedRaw);
  if (!RELATIVE_OR_PARTICLE_EXCLUSIONS.has(norm) && !RELATIVE_OR_PARTICLE_EXCLUSIONS.has(bare)) {
    if (
      /^(وَ|فَ)?(بِ|كَ)?[اٱ]ل/.test(cleanedRaw) ||
      /^(و|ف)?(ب|ك)?ال/.test(bare) ||
      /^(وَ|فَ)?لِل/.test(cleanedRaw)
    ) {
      return true;
    }
  }

  // 4. Başında harf-i cer بِـ (kesralı bi: بِمَعْرِفَتِكَ، بِسُرْعَةٍ، بِالْحَافِلَةِ)
  if (/^(وَ|فَ)?بِ/.test(cleanedRaw) && norm.length >= 4) {
    return true;
  }

  // 5. İyelik zamirinden hemen önceki harfte kesra (ِ) bulunması (Fiiller zamirden önce kesra almaz: ظَهْرِكَ، مَعْرِفَتِكَ، اِبْنِكُمْ، مَجِيئِكَ)
  if (
    /\u0650(كَ|كِ|كُمْ|كُنَّ|كُمَا|هُ|هَا|هِمْ|هُمَا|نَا)$/.test(cleanedRaw)
  ) {
    return true;
  }

  // 6. Önceki kelime (prevWordAr) bir harf-i cer veya zarf ise
  if (prevWordAr) {
    const cleanPrev = cleanArabicText(
      prevWordAr.replace(/[.,!?؟،;؛:"'()\[\]{}\d]/g, "")
    );
    const strippedPrevConj =
      cleanPrev.length > 2 && /^[وف]/.test(cleanPrev)
        ? cleanPrev.slice(1)
        : cleanPrev;
    if (
      PREPOSITION_PREV_WORDS.has(cleanPrev) ||
      PREPOSITION_PREV_WORDS.has(strippedPrevConj)
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Bir Arapça kelimenin her ünsüzünü ve üzerindeki hareke/sükun/şedde bilgisini çıkarır.
 */
function extractConsonantVowelPairs(
  arabicWord: string
): Array<{ letter: string; marks: string }> {
  // Baştaki ال veya وب / فب / بال gibi ekleri soyarak kök harflerin harekesini kıyasla
  let working = arabicWord.trim();
  working = working.replace(/^(وَ|فَ)?(بِ|كَ|لِ)?[اٱ]لْ?/, "");
  working = working.replace(/^(وَ|فَ)?(بِ|كَ|لِ)/, "");

  const result: Array<{ letter: string; marks: string }> = [];
  for (let i = 0; i < working.length; i++) {
    const ch = working[i];
    if (/[\u064B-\u065F\u0670]/.test(ch)) {
      if (result.length > 0) {
        result[result.length - 1].marks += ch;
      }
    } else if (/[\u0621-\u064A\u0671]/.test(ch)) {
      const normCh = ch
        .replace(/[أإآٱ]/g, "ا")
        .replace(/ى/g, "ي")
        .replace(/ة/g, "ه");
      result.push({ letter: normCh, marks: "" });
    }
  }
  return result;
}

function getPrimaryVowel(marks: string): string {
  if (marks.includes("\u0652")) return "sukun";
  if (marks.includes("\u064E") || marks.includes("\u064B")) return "fatha";
  if (marks.includes("\u0650") || marks.includes("\u064D")) return "kasra";
  if (marks.includes("\u064F") || marks.includes("\u064C")) return "damma";
  return "";
}

/**
 * Tıklanan kelime ile aday sözlük kaydının hareke (fetha/kesra/damme/sükun/şedde) uyumunu puanlar.
 * Örn: قَبْلَكِ (قَ + بْ) -> قَبْلَ (+160) vs قَبِلَ (-120)
 * Örn: ظَهْرِكَ (ظَ + هْ) -> ظَهْرٌ (+160) vs ظَهَرَ (-120)
 * Örn: سَلِمَتْ (سَ + لِ) -> سَلِمَ (+160) vs سُلَّم (-220)
 */
function computeDiacriticScore(
  rawWord: string,
  candidateRawForms: string[]
): number {
  if (!/[\u064E\u064F\u0650\u0651\u0652]/.test(rawWord)) return 0;
  const wordPairs = extractConsonantVowelPairs(rawWord);
  if (wordPairs.length < 2) return 0;

  let bestScore = -999;

  for (const form of candidateRawForms) {
    const formPairs = extractConsonantVowelPairs(form);
    if (formPairs.length < 2) continue;

    let score = 0;
    const compareLen = Math.min(3, wordPairs.length, formPairs.length);

    for (let i = 0; i < compareLen; i++) {
      const wp = wordPairs[i];
      const fp = formPairs[i];
      if (wp.letter !== fp.letter) break;

      const wVowel = getPrimaryVowel(wp.marks);
      const fVowel = getPrimaryVowel(fp.marks);
      const wShadda = wp.marks.includes("\u0651");
      const fShadda = fp.marks.includes("\u0651");

      // Şedde uyumu / uyumsuzluğu (örn: سَلِمَ vs سُلَّم veya عَمَّان vs عُمَان)
      if (i >= 1) {
        if (wShadda && fShadda) score += 70;
        else if (wShadda !== fShadda && (wp.marks.length > 0 && fp.marks.length > 0)) {
          score -= 90;
        }
      }

      // Son harfin irab harekesi cümleye göre değişebilir, ancak ilk 2 harfin (özellikle 2. harfin sükun/hareke durumu) belirleyicidir
      if (i < compareLen - 1 || compareLen <= 2) {
        if (wVowel && fVowel) {
          if (wVowel === fVowel) {
            score += i === 1 ? 100 : 75;
          } else {
            // 2. harfte birinde sükun diğerinde hareke varsa (ظَهْر vs ظَهَرَ, قَبْل vs قَبِلَ) ağır ceza!
            if (wVowel === "sukun" || fVowel === "sukun") {
              score -= 140;
            } else {
              score -= 90;
            }
          }
        }
      }
    }

    if (score > bestScore) {
      bestScore = score;
    }
  }

  return bestScore === -999 ? 0 : bestScore;
}

const TR_STOP_WORDS = new Set([
  "bir",
  "ile",
  "için",
  "olan",
  "olmak",
  "etmek",
  "yapmak",
  "veya",
  "گibi",
  "gibi",
  "çok",
  "daha",
  "kadar",
  "sonra",
  "önce",
]);

/**
 * Türkçe cümle çevirisi (contextSentenceTr) içinde aday kelimenin Türkçe anlamının geçip geçmediğini kontrol eder.
 * Eşleşme varsa +500 öncelik puanı verir!
 */
function computeTurkishContextScore(
  item: DictionaryItem,
  contextSentenceTr?: string
): number {
  if (!contextSentenceTr || !item.anlam_tr) return 0;

  const normSentence = contextSentenceTr
    .toLocaleLowerCase("tr-TR")
    .replace(/[.,!?؟،;؛:"'()\[\]{}\-\/]/g, " ");

  const rawMeanings = item.anlam_tr
    .toLocaleLowerCase("tr-TR")
    .replace(/[\u0600-\u06FF]+/g, " ")
    .split(/[,;/():\-]+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 2);

  for (const phrase of rawMeanings) {
    // Tam ifade eşleşmesi (örn: "eline sağlık", "geçmiş olsun", "hava yolları", "altın", "sırt", "önce")
    if (phrase.length >= 3 && normSentence.includes(phrase)) {
      return 500;
    }

    const words = phrase
      .split(/\s+/)
      .map((w) => w.replace(/^(mak|mek)$/, "").trim())
      .filter((w) => w.length >= 3 && !TR_STOP_WORDS.has(w) || w === "önce" || w === "sonra");

    for (const w of words) {
      // Mastar eki (-mak / -mek) varsa kökünü al (örn: "boyamak" -> "boya", "yakışmak" -> "yakış", "hapşırmak" -> "hapşır")
      let trStem = w.replace(/(mak|mek)$/, "");
      if (trStem.length < 2) trStem = w;

      if (trStem.length >= 3 && normSentence.includes(trStem)) {
        return 500;
      }

      // Türkçe ünlü düşmesi / ünsüz yumuşaması kökleri (örn: "oğul" -> "oğl", "burun" -> "burn", "karın" -> "karn", "git" -> "gid")
      if (trStem === "oğul" && normSentence.includes("oğl")) return 500;
      if (trStem === "burun" && normSentence.includes("burn")) return 500;
      if (trStem === "karın" && normSentence.includes("karn")) return 500;
      if (trStem === "ağız" && normSentence.includes("ağz")) return 500;
      if (trStem === "vakit" && normSentence.includes("vakt")) return 500;

      // İlk 4 harf kökü (örn: "tanışma" -> "tanış", "arkadaş" -> "arkad", "memnun" -> "memn")
      if (trStem.length >= 5) {
        const prefix4 = trStem.slice(0, 4);
        if (normSentence.includes(prefix4)) {
          return 450;
        }
      }
    }
  }

  return 0;
}

/**
 * Aynı normalize anahtara sahip birden fazla sözlük adayı arasından
 * 1) Gramer Kalkanı (isDefinitelyNoun),
 * 2) Türkçe Cümle Çevirisi Bağlamı (+500 puan),
 * 3) Hareke / Sükun Uyumu
 * kriterlerine göre en doğru adayı seçer.
 */
function pickBestCandidateForKey(
  normKey: string,
  cleanedRaw: string,
  contextSentenceTr?: string,
  isDefinitelyNoun?: boolean
): DictionaryItem | null {
  const candidates = dictMultiIndex.get(normKey);
  if (!candidates || candidates.length === 0) {
    return dictIndex.get(normKey) || null;
  }
  if (candidates.length === 1) {
    const only = candidates[0].item;
    if (isDefinitelyNoun && getWordCategory(only) === "fiil") {
      return null;
    }
    return only;
  }

  let bestCandidate: DictionaryItem | null = null;
  let bestTotalScore = -99999;

  for (const cand of candidates) {
    const cat = getWordCategory(cand.item);
    let score = -cand.order * 0.01; // İndeks sırası (tamamlayıcı sözlük önceliği)

    // 1. Gramer Kalkanı: Kesin isim alameti varsa fiilleri ele!
    if (isDefinitelyNoun) {
      if (cat === "fiil") {
        score -= 1000;
      } else {
        score += 250;
      }
    }

    // 2. Türkçe Cümle Çevirisi Bağlamı (+500 Puan)
    score += computeTurkishContextScore(cand.item, contextSentenceTr);

    // 3. Hareke (Fetha / Kesra / Damme / Sükun / Şedde) Uyumu
    score += computeDiacriticScore(cleanedRaw, cand.rawForms);

    if (score > bestTotalScore) {
      bestTotalScore = score;
      bestCandidate = cand.item;
    }
  }

  if (
    bestCandidate &&
    isDefinitelyNoun &&
    getWordCategory(bestCandidate) === "fiil"
  ) {
    const nonVerb = candidates.find(
      (c) => getWordCategory(c.item) !== "fiil"
    );
    return nonVerb ? nonVerb.item : null;
  }

  return bestCandidate;
}

// ==============================================================================
// ÖN EK (PREFIX) VE SON EK (SUFFIX/ZAMİR) TABLOLARI
// ==============================================================================

const PREFIX_RULES: Array<{
  raw: string;
  label: string;
  makesDefiniteNoun?: boolean;
}> = [
  {
    raw: "وبال",
    label: "وَ (ve) + بِـ (ile) + ال (belirlilik)",
    makesDefiniteNoun: true,
  },
  {
    raw: "فبال",
    label: "فَـ (böylece) + بِـ (ile) + ال (belirlilik)",
    makesDefiniteNoun: true,
  },
  { raw: "وال", label: "وَ (ve) + ال (belirlilik)", makesDefiniteNoun: true },
  {
    raw: "فال",
    label: "فَـ (böylece) + ال (belirlilik)",
    makesDefiniteNoun: true,
  },
  {
    raw: "بال",
    label: "بِـ (ile/-de) + ال (belirlilik)",
    makesDefiniteNoun: true,
  },
  { raw: "كال", label: "كَـ (gibi) + ال (belirlilik)", makesDefiniteNoun: true },
  {
    raw: "ولل",
    label: "وَ (ve) + لِـ (için) + ال (belirlilik)",
    makesDefiniteNoun: true,
  },
  {
    raw: "فلل",
    label: "فَـ + لِـ (için) + ال (belirlilik)",
    makesDefiniteNoun: true,
  },
  {
    raw: "لل",
    label: "لِـ (için/-e) + ال (belirlilik)",
    makesDefiniteNoun: true,
  },
  { raw: "ال", label: "ال (belirlilik takısı)", makesDefiniteNoun: true },
  { raw: "وب", label: "وَ (ve) + بِـ (ile/-de)", makesDefiniteNoun: true },
  { raw: "ول", label: "وَ (ve) + لِـ (için)" },
  { raw: "وس", label: "وَ (ve) + سَـ (gelecek zaman)" },
  { raw: "فب", label: "فَـ + بِـ (ile)", makesDefiniteNoun: true },
  { raw: "فل", label: "فَـ + لِـ (için)" },
  { raw: "فس", label: "فَـ + سَـ (gelecek zaman)" },
  { raw: "س", label: "سَـ (gelecek zaman -ecek)" },
  { raw: "ل", label: "لِـ (için / -e)" },
  { raw: "ب", label: "بِـ (ile / -de)" },
  { raw: "ك", label: "كَـ (gibi)", makesDefiniteNoun: true },
  { raw: "ف", label: "فَـ (böylece)" },
  { raw: "و", label: "وَ (ve)" },
];

const SUFFIX_RULES: Array<{
  raw: string;
  label: string;
  nounLabel?: string;
  imperativeLabel?: string;
  verbOnly?: boolean;
  isDualOrPlural?: boolean;
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
  {
    raw: "ان",
    label: "انِ (ikil / tesniye eki)",
    nounLabel: "انِ (ikil / tesniye eki)",
    isDualOrPlural: true,
  },
  {
    raw: "ين",
    label: "ينَ / يْنِ (çoğul / ikil / muhataba eki)",
    nounLabel: "يْنِ / ينَ (ikil veya çoğul eki)",
    isDualOrPlural: true,
  },
  {
    raw: "ون",
    label: "ونَ (kurallı eril çoğul eki)",
    nounLabel: "ونَ (kurallı eril çoğul eki)",
    isDualOrPlural: true,
  },
  {
    raw: "ات",
    label: "ات (kurallı dişil çoğul eki)",
    nounLabel: "ات (kurallı dişil çoğul eki)",
    isDualOrPlural: true,
  },
  { raw: "تم", label: "تُمْ (siz [mazi])", verbOnly: true },
  { raw: "تن", label: "تُنَّ (siz kadınlar [mazi])", verbOnly: true },
  {
    raw: "وا",
    label: "وا (onlar [mazi] / siz [emir çoğul])",
    imperativeLabel: "ـُوا (çoğul emir eki — siz)",
    verbOnly: true,
  },
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
    nounLabel: "ـِي (benim - 1. tekil iyelik zamiri)",
    imperativeLabel: "ـِي (müennes emir eki — sen [kadın])",
  },
  { raw: "ت", label: "تُ / تَ / تِ / تْ (mazi şahıs eki)", verbOnly: true },
  {
    raw: "ا",
    label: "اً (tenvin / mansub eki)",
    nounLabel: "اً (mansub tenvin eki)",
  },
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
  item: DictionaryItem,
  isImperativeVerb = false
): string {
  const cat = getWordCategory(item);
  if (
    (cat === "isim" || cat === "ozel-isim" || cat === "edat") &&
    suff.nounLabel
  ) {
    return suff.nounLabel;
  }
  if (isImperativeVerb && suff.imperativeLabel) {
    return suff.imperativeLabel;
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
 * KURAL 2-A: Elif ile başlayan bir fiilin EMİR FİİL (فعل أمر) mi yoksa
 * 1. Tekil Şahıs MUZARİ (أَ - ben) mi olduğunu hareke ve hemze tipinden kesin olarak ayırt eder.
 * - Muzari 1. tekil şahıs SADECE üstün veya ötreli kat' hemzesi (أَ / أُ / آ) ile başlar ve emir sükunuyla bitmez.
 * - Vasl hemzesi (اِ / اُ / bare ا) veya إِ ile başlayan ya da sonu sükun (ْ) / müennes emir (ـِي) olanlar EMİR FİİLDİR!
 */
function isImperativeAlifVerb(cleanedRawWord: string): boolean {
  // Baştaki و / ف bağlacını soy
  const strippedConj = cleanedRawWord.replace(/^(وَ|فَ)/, "");

  // Eğer kelime üstün veya ötreli kat' hemzesiyle (أَ / أُ) veya medli elifle (آ) başlıyorsa
  // ve sonunda ceزم/emir sükunu yoksa -> 1. tekil şahıs muzaridir (örn: أَفْتَحُ، أَذْهَبُ، أُرِيدُ، أَسْكُنُ، آكُلُ)
  const startsWithKatHamzaFathaOrDamma =
    /^(سَ)?(أَ|أُ|آ)/.test(strippedConj);
  const endsWithSukun = /\u0652$/.test(strippedConj);

  if (startsWithKatHamzaFathaOrDamma && !endsWithSukun) {
    return false;
  }

  // Vasl hemzesi (اِ / اُ / ا) veya إِ ile başlıyorsa (örn: اِفْتَحْ، اِكْشِفْ، اُنْظُرْ، اِجْلِسِي، اِذْهَبِي، اِمْلَأْ، اِمْشِي، اِصْبَغْ، اِجْلِبْ)
  if (/^[اٱإ]/.test(strippedConj)) {
    return true;
  }

  // Sonu sükunla bitiyorsa (örn: أَخْرِجْ، أَكْمِلْ)
  if (endsWithSukun) {
    return true;
  }

  return false;
}

/**
 * Bir fiilin genel olarak emir kipinde olup olmadığını kontrol eder (örn: تَفَضَّلْ، اِنْتَظِرْ، خُذْ، اِفْتَحْ).
 */
function isGeneralImperativeForm(cleanedRawWord: string): boolean {
  if (isImperativeAlifVerb(cleanedRawWord)) return true;
  const strippedConj = cleanedRawWord.replace(/^(وَ|فَ)/, "");
  // Sonu sükunla biten ve başında سَـ / أَ / نَـ olmayan fiil (örn: تَفَضَّلْ، تَكَلَّمْ، سَاعِدْ، جَرِّبْ)
  if (
    /\u0652$/.test(strippedConj) &&
    !/^(سَ|أَ|أُ|نَ|نُ|يَ|يُ)/.test(strippedConj)
  ) {
    return true;
  }
  return false;
}

/**
 * Sadece doğrudan sözlük eşleşmesini, Nispet (ـِيّ / ـِيَّة) ve Tâ-i Merbûta (ت -> ة) izafet onarımını kontrol eder.
 * İsimlerin (ör: اسمك, الذهبية, الخطوط الجوية) yanlışlıkla fiil önek kuralına girip bozulmasını engeller.
 */
function matchNominalOrExactStem(
  stem: string,
  cleanedRaw: string,
  contextSentenceTr?: string,
  isDefinitelyNoun?: boolean
): {
  item: DictionaryItem;
  stage: "exact" | "ta-marbuta";
  extraNote?: string;
} | null {
  if (!stem || stem.length < 2) return null;

  // 1. Doğrudan eşleşme (Çoklu aday içinden bağlam ve harekeye göre en iyisini seç)
  if (dictMultiIndex.has(stem) || dictIndex.has(stem)) {
    const best = pickBestCandidateForKey(
      stem,
      cleanedRaw,
      contextSentenceTr,
      isDefinitelyNoun
    );
    if (best) {
      return { item: best, stage: "exact" };
    }
  }

  // 2. Tâ-i Merbûta (ت -> ة) İzafet Onarımı (örn: مَعْرِفَتِكَ -> معرفت -> معرفه, غُرْفَتِكُمْ -> غرفت -> غرفه):
  if (stem.endsWith("ت") && stem.length >= 3) {
    const taMarbutaRestored = stem.slice(0, -1) + "ه";
    if (
      dictMultiIndex.has(taMarbutaRestored) ||
      dictIndex.has(taMarbutaRestored)
    ) {
      const best = pickBestCandidateForKey(
        taMarbutaRestored,
        cleanedRaw,
        contextSentenceTr,
        true // ت -> ة izafet dönüşümü %100 isimdir!
      );
      if (best && getWordCategory(best) !== "fiil") {
        return {
          item: best,
          stage: "ta-marbuta",
          extraNote: "ت -> ة (Tâ-i Merbûta izafet dönüşümü)",
        };
      }
    }
  }

  // 3. Müenneslik التاء المربوطة (ة -> ه) ve Nispet (ـِيَّة / ـِيّ) soyarak isim eşleşmesi (ör: الذَّهَبِيَّةُ -> ذهب, الْجَوِّيَّةِ -> جو)
  if (stem.endsWith("ه") && stem.length >= 4) {
    const withoutTaMarbuta = stem.slice(0, -1);
    if (
      dictMultiIndex.has(withoutTaMarbuta) ||
      dictIndex.has(withoutTaMarbuta)
    ) {
      const best = pickBestCandidateForKey(
        withoutTaMarbuta,
        cleanedRaw,
        contextSentenceTr,
        true
      );
      if (best && getWordCategory(best) !== "fiil") {
        return {
          item: best,
          stage: "ta-marbuta",
          extraNote: "ة (müenneslik eki)",
        };
      }
    }
    // Nisba müennes (ör: الذهبيه -> ذهب, الجويه -> جو, العربيه -> عرب, التاريخيه -> تاريخ)
    if (withoutTaMarbuta.endsWith("ي") && withoutTaMarbuta.length >= 3) {
      const withoutNisba = withoutTaMarbuta.slice(0, -1);
      if (dictMultiIndex.has(withoutNisba) || dictIndex.has(withoutNisba)) {
        const best = pickBestCandidateForKey(
          withoutNisba,
          cleanedRaw,
          contextSentenceTr,
          true
        );
        if (best && getWordCategory(best) !== "fiil") {
          return {
            item: best,
            stage: "ta-marbuta",
            extraNote: "ـِيَّة (nispet / aidiyet ve müenneslik eki)",
          };
        }
      }
    }
  }

  // 3b. Müzekker Nispet (ـِيّ) soyarak isim eşleşmesi (ör: ذَهَبِيّ -> ذهب)
  if (stem.endsWith("ي") && stem.length >= 4 && isDefinitelyNoun) {
    const withoutNisba = stem.slice(0, -1);
    if (dictMultiIndex.has(withoutNisba) || dictIndex.has(withoutNisba)) {
      const best = pickBestCandidateForKey(
        withoutNisba,
        cleanedRaw,
        contextSentenceTr,
        true
      );
      if (best && getWordCategory(best) !== "fiil") {
        return {
          item: best,
          stage: "ta-marbuta",
          extraNote: "ـِيّ (nispet / aidiyet eki)",
        };
      }
    }
  }

  // 4. Kurallı dişil çoğul (ات) soyarak tekil eşleşmesi (ör: صفحات -> صفحه) — Korumalı kelimeler hariç!
  if (
    stem.endsWith("ات") &&
    stem.length >= 4 &&
    !PROTECTED_NO_DUAL_PLURAL_SPLIT.has(stem)
  ) {
    const singBase = stem.slice(0, -2);
    if (dictMultiIndex.has(singBase + "ه") || dictIndex.has(singBase + "ه")) {
      const best = pickBestCandidateForKey(
        singBase + "ه",
        cleanedRaw,
        contextSentenceTr,
        true
      );
      if (best && getWordCategory(best) !== "fiil") {
        return {
          item: best,
          stage: "ta-marbuta",
          extraNote: "ات (kurallı dişil çoğul eki)",
        };
      }
    }
    if (dictMultiIndex.has(singBase) || dictIndex.has(singBase)) {
      const best = pickBestCandidateForKey(
        singBase,
        cleanedRaw,
        contextSentenceTr,
        true
      );
      if (best && getWordCategory(best) !== "fiil") {
        return {
          item: best,
          stage: "ta-marbuta",
          extraNote: "ات (kurallı dişil çoğul eki)",
        };
      }
    }
  }

  // 5. Kurallı eril çoğul / ikil (ون / ين / ان) soyarak tekil eşleşmesi — Korumalı kelimeler (عمان، رمضان vb.) hariç!
  if (
    (stem.endsWith("ون") || stem.endsWith("ين") || stem.endsWith("ان")) &&
    stem.length >= 5 &&
    !PROTECTED_NO_DUAL_PLURAL_SPLIT.has(stem)
  ) {
    const singBase = stem.slice(0, -2);
    if (dictMultiIndex.has(singBase) || dictIndex.has(singBase)) {
      const best = pickBestCandidateForKey(
        singBase,
        cleanedRaw,
        contextSentenceTr,
        true
      );
      if (best && getWordCategory(best) !== "fiil") {
        return {
          item: best,
          stage: "ta-marbuta",
          extraNote: stem.endsWith("ون")
            ? "ونَ (kurallı eril çoğul eki)"
            : stem.endsWith("ان")
            ? "انِ (ikil / tesniye eki)"
            : "ينَ / يْنِ (çoğul / ikil eki)",
        };
      }
    }
  }

  const withTaMarbuta = stem + "ه";
  if (dictMultiIndex.has(withTaMarbuta) || dictIndex.has(withTaMarbuta)) {
    const best = pickBestCandidateForKey(
      withTaMarbuta,
      cleanedRaw,
      contextSentenceTr,
      true
    );
    if (best && getWordCategory(best) !== "fiil") {
      return {
        item: best,
        stage: "ta-marbuta",
        extraNote: "ة (müenneslik eki)",
      };
    }
  }

  return null;
}

/**
 * Gövdeyi doğrudan, Tâ-i Merbûta (ت -> ة / ه) onarımıyla ve Fiil Çekim Çözücüsüyle sözlükte arar.
 * Eğer endsWithTaMarbuta === true veya isDefinitelyNoun === true ise ASLA fiil çözümleyicisine girmez.
 */
function matchStemWithRules(
  stem: string,
  cleanedRaw: string,
  endsWithTaMarbuta = false,
  contextSentenceTr?: string,
  isDefinitelyNoun = false
): {
  item: DictionaryItem;
  stage: "exact" | "ta-marbuta" | "verb";
  extraNote?: string;
  isImperative?: boolean;
} | null {
  if (!stem || stem.length < 2) return null;

  const nominal = matchNominalOrExactStem(
    stem,
    cleanedRaw,
    contextSentenceTr,
    isDefinitelyNoun
  );
  if (nominal) {
    // Eğer bulunan kelime bir fiilse ve emir formundaysa (örn: اِنْتَظِرْ، تَفَضَّلْ، اِسْتَمِعْ) emir notunu ekle
    if (
      getWordCategory(nominal.item) === "fiil" &&
      isGeneralImperativeForm(cleanedRaw)
    ) {
      return {
        ...nominal,
        stage: "verb",
        extraNote: "Emir Fiil (فعل أمر — Sen ...!)",
        isImperative: true,
      };
    }
    return nominal;
  }

  // KURAL 1-C: Kesin isim alameti (ال، ة، tenvin، harf-i cer، kesralı zamir) varsa ASLA fiil olarak çözümlenemez!
  if (endsWithTaMarbuta || isDefinitelyNoun) return null;

  // 1b. 2 harfli emir fiil eşleşmesi (ör: خذ -> اخذ, قل -> قال, قف -> وقف)
  if (stem.length === 2 && IRREGULAR_IMPERATIVE_MAP[stem]) {
    const mapped = IRREGULAR_IMPERATIVE_MAP[stem];
    const best = pickBestCandidateForKey(
      mapped,
      cleanedRaw,
      contextSentenceTr,
      false
    );
    if (best) {
      return {
        item: best,
        stage: "verb",
        extraNote: "Emir Fiil (فعل أمر — Sen ...!)",
        isImperative: true,
      };
    }
  }

  // 3. Fiil Çekim Çözücü (Muzari & Mazi & Emir) — Yalnızca bulunan öğe gerçek bir FİİL ise kabul edilir!
  if (/^[انت]/.test(stem) && stem.length >= 3) {
    const muzariPrefixChar = stem[0];
    const isImp =
      muzariPrefixChar === "ا"
        ? isImperativeAlifVerb(cleanedRaw)
        : isGeneralImperativeForm(cleanedRaw);

    const personNote =
      muzariPrefixChar === "ا"
        ? isImp
          ? "Emir Fiil (فعل أمر — Sen ...!)"
          : "أَ (ben - muzari)"
        : muzariPrefixChar === "ن"
        ? "نَـ (biz - muzari)"
        : isImp
        ? "Emir Fiil (فعل أمر — Sen ...!)"
        : "تَـ (sen/o - muzari)";

    const asYa = "ي" + stem.slice(1);
    const yaCand = pickBestCandidateForKey(
      asYa,
      cleanedRaw,
      contextSentenceTr,
      false
    );
    if (yaCand && getWordCategory(yaCand) === "fiil") {
      return {
        item: yaCand,
        stage: "verb",
        extraNote: personNote,
        isImperative: isImp,
      };
    }

    const asAlifMazi = "ا" + stem.slice(1);
    const alifCand = pickBestCandidateForKey(
      asAlifMazi,
      cleanedRaw,
      contextSentenceTr,
      false
    );
    if (alifCand && getWordCategory(alifCand) === "fiil") {
      return {
        item: alifCand,
        stage: "verb",
        extraNote: personNote,
        isImperative: isImp,
      };
    }

    const bareThree = stem.slice(1);
    if (bareThree.length >= 3) {
      const bareCand = pickBestCandidateForKey(
        bareThree,
        cleanedRaw,
        contextSentenceTr,
        false
      );
      if (bareCand && getWordCategory(bareCand) === "fiil") {
        return {
          item: bareCand,
          stage: "verb",
          extraNote: personNote,
          isImperative: isImp,
        };
      }
      // Nakıs fiil emir/muzari (ör: اِمْشِي -> مشي -> مشى)
      if (bareThree.length === 2) {
        const withYa = bareThree + "ي";
        const nakisCand = pickBestCandidateForKey(
          withYa,
          cleanedRaw,
          contextSentenceTr,
          false
        );
        if (nakisCand && getWordCategory(nakisCand) === "fiil") {
          return {
            item: nakisCand,
            stage: "verb",
            extraNote: personNote,
            isImperative: isImp,
          };
        }
      }
    }
  }

  // 3b. سَآكُلُ / آتِي -> اكل / ياكل ve Emir fiiller (اِمْلَأْ، اِجْلِبْ، أَخْرِجْ، اِمْشِي)
  if (stem.startsWith("ا") && stem.length >= 3) {
    const isImp = isImperativeAlifVerb(cleanedRaw);
    const noteForAlif = isImp
      ? "Emir Fiil (فعل أمر — Sen ...!)"
      : "أَ (ben - muzari)";

    const asYaWithAlif = "يا" + stem.slice(1);
    const yaAlifCand = pickBestCandidateForKey(
      asYaWithAlif,
      cleanedRaw,
      contextSentenceTr,
      false
    );
    if (yaAlifCand && getWordCategory(yaAlifCand) === "fiil") {
      return {
        item: yaAlifCand,
        stage: "verb",
        extraNote: noteForAlif,
        isImperative: isImp,
      };
    }

    const withoutInitialAlif = stem.slice(1);
    if (withoutInitialAlif.length >= 2) {
      const bareCand = pickBestCandidateForKey(
        withoutInitialAlif,
        cleanedRaw,
        contextSentenceTr,
        false
      );
      if (bareCand && getWordCategory(bareCand) === "fiil") {
        return {
          item: bareCand,
          stage: "verb",
          extraNote: noteForAlif,
          isImperative: isImp,
        };
      }
      const asYaImperative = "ي" + withoutInitialAlif;
      const yaImpCand = pickBestCandidateForKey(
        asYaImperative,
        cleanedRaw,
        contextSentenceTr,
        false
      );
      if (yaImpCand && getWordCategory(yaImpCand) === "fiil") {
        return {
          item: yaImpCand,
          stage: "verb",
          extraNote: noteForAlif,
          isImperative: isImp,
        };
      }
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

  // 3d. Ecvef (ortası illetli) fiil mazi/emir çekimi: جُعْتُ -> جع -> جاع, قُلْتُ -> قل -> قال, جِئْتُ -> جئ -> جاء
  if (stem.length === 2) {
    const hollowForm =
      stem === "جئ" || stem === "جا" ? "جاء" : stem[0] + "ا" + stem[1];
    const hollowCand = pickBestCandidateForKey(
      hollowForm,
      cleanedRaw,
      contextSentenceTr,
      false
    );
    if (hollowCand && getWordCategory(hollowCand) === "fiil") {
      return {
        item: hollowCand,
        stage: "verb",
        extraNote: "أجوف (ortası illetli fiil çekimi)",
      };
    }
  }

  // 3e. Nakıs fiil mazi/emir çekimi: اشْتَرَيْتِ -> اشتري -> اشترى, اِمْشِي -> امشي -> مشى
  if (stem.endsWith("ي") && stem.length >= 3) {
    const withoutYa = stem.slice(0, -1) + "ا";
    const nakisCand = pickBestCandidateForKey(
      withoutYa,
      cleanedRaw,
      contextSentenceTr,
      false
    );
    if (nakisCand && getWordCategory(nakisCand) === "fiil") {
      return {
        item: nakisCand,
        stage: "verb",
      };
    }
  }

  return null;
}

/**
 * 5 KADEMELİ BAĞLAMSAL, HAREKE VE GRAMER KORUMALI ARAPÇA MORFOLOJİK ÇÖZÜMLEYİCİ
 * @param rawWord Tıklanan veya analiz edilen Arapça kelime
 * @param contextSentenceTr Kelimenin geçtiği cümlenin Türkçe çevirisi (eş yazılımlı kelimelerde +500 bağlam puanı sağlar)
 * @param prevWordAr Cümlede bu kelimeden hemen önce gelen Arapça kelime (harf-i cer / zarf kontrolü için)
 */
export function analyzeAndMatchWord(
  rawWord: string,
  contextSentenceTr?: string,
  prevWordAr?: string
): MorphologicalMatch | null {
  const cleanedRaw = rawWord.replace(
    /^[.,!?؟،;؛:"'()\[\]{}\d]+|[.,!?؟،;؛:"'()\[\]{}\d]+$/g,
    ""
  );
  if (!cleanedRaw || !/[\u0600-\u06FF]/.test(cleanedRaw)) return null;

  const bareLetters = stripHarakat(cleanedRaw);
  const endsWithTaMarbuta = bareLetters.endsWith("ة");
  const normalized = cleanArabicText(cleanedRaw);
  if (normalized.length < 2) return null;

  const isDefinitelyNoun = hasDefiniteNounMarker(cleanedRaw, prevWordAr);

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

  // 0.05. KURAL 1-B: ÖZEL İSİM, ŞEHİR VE AY KORUMASI (عَمَّانَ، بَيْرُوتَ، دِمَشْقَ، رَمَضَانَ، حَزِيرَانَ vb.)
  // Tek harfli bağlaç/harf-i cer (و / ف / ب / ل / ك) soyulmuş haliyle de kontrol edilir; ASLA "ان" ikil eki diye bölünmez!
  const cityOrMonthDirect = PROTECTED_CITIES_AND_MONTHS[normalized];
  if (cityOrMonthDirect) {
    return {
      item: cityOrMonthDirect,
      originalWord: cleanedRaw,
      matchedStem: normalized,
      morphologyNote: buildMorphologyNote(cityOrMonthDirect),
      matchStage: "exact",
    };
  }
  const cityConjMatch = normalized.match(/^(و|ف|ب|ل|ك|وب|فب|ول|فل)(.+)$/);
  if (cityConjMatch && PROTECTED_CITIES_AND_MONTHS[cityConjMatch[2]]) {
    const prefRaw = cityConjMatch[1];
    const cityItem = PROTECTED_CITIES_AND_MONTHS[cityConjMatch[2]];
    const prefObj = PREFIX_RULES.find((p) => p.raw === prefRaw);
    return {
      item: cityItem,
      originalWord: cleanedRaw,
      matchedStem: cityConjMatch[2],
      prefixLabel: prefObj?.label,
      morphologyNote: buildMorphologyNote(cityItem, prefObj?.label),
      matchStage: "affix",
    };
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
  if (
    bareLetters === "علي" ||
    bareLetters === "عليا" ||
    bareLetters === "وعلي"
  ) {
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

  // 0.4. KESİN ÖNCELİK KURALI 4: "ابْن / اِبْن" (oğul) ve "ابْنَة / بِنْت" (kız) + İyelik Zamirleri (اِبْنِكُمْ، اِبْنِي، اِبْنُكَ، ابْنَتِي)
  // Asla "İbn Haldun" ile karışmaması için doğrudan CANONICAL_IBN_ITEM / CANONICAL_BINT_ITEM öğesine bağlanır!
  const ibnMatch = normalized.match(
    /^(و|ف|ب|ك|ل|وب|ول|فب|فل)?(ابن|ابنت|بنت)(ي|ك|ه|ها|نا|كم|كن|هم|هن|هما|كما)?$/
  );
  if (ibnMatch) {
    const prefRaw = ibnMatch[1] || "";
    const coreNoun = ibnMatch[2];
    const suffRaw = ibnMatch[3] || "";
    const targetItem =
      coreNoun === "ابن" ? CANONICAL_IBN_ITEM : CANONICAL_BINT_ITEM;
    const prefObj = PREFIX_RULES.find((p) => p.raw === prefRaw);
    const suffObj = SUFFIX_RULES.find((s) => s.raw === suffRaw);
    const prefLabel = prefObj?.label;
    const suffLabel = suffObj
      ? getSuffixDisplayLabel(suffObj, targetItem)
      : undefined;
    const extraNote =
      coreNoun === "ابنت" ? "ت -> ة (Tâ-i Merbûta izafet dönüşümü)" : undefined;

    return {
      item: targetItem,
      originalWord: cleanedRaw,
      matchedStem: coreNoun === "ابنت" ? "ابنه" : coreNoun,
      prefixLabel: prefLabel,
      suffixLabel: suffLabel,
      morphologyNote: buildMorphologyNote(
        targetItem,
        prefLabel,
        suffLabel,
        extraNote
      ),
      matchStage: prefRaw || suffRaw ? "affix" : "exact",
    };
  }

  // Kademe 1: Doğrudan Eşleşme (Önce İsim / Tam Eşleşme - Bağlam & Hareke Puanlamalı)
  const directNominal = matchNominalOrExactStem(
    normalized,
    cleanedRaw,
    contextSentenceTr,
    isDefinitelyNoun
  );
  if (directNominal) {
    const isImp =
      getWordCategory(directNominal.item) === "fiil" &&
      isGeneralImperativeForm(cleanedRaw);
    return {
      item: directNominal.item,
      originalWord: cleanedRaw,
      matchedStem: normalized,
      morphologyNote: buildMorphologyNote(
        directNominal.item,
        undefined,
        undefined,
        isImp ? "Emir Fiil (فعل أمر — Sen ...!)" : directNominal.extraNote
      ),
      matchStage: directNominal.stage,
    };
  }

  // Kademe 2: İyelik/Nesne Zamiri ve Ön Ek Soyarak İSİM Eşleşmesi (Fiil önek soyma işleminden ÖNCE çalışır!)
  if (!endsWithTaMarbuta) {
    for (const suff of SUFFIX_RULES) {
      // Korumalı kelimelerde (عمان، رمضان vb.) "ان" / "ات" / "ين" soyma!
      if (suff.isDualOrPlural && PROTECTED_NO_DUAL_PLURAL_SPLIT.has(normalized)) {
        continue;
      }
      // Kesin isim alameti varsa verbOnly son ekleri (تُ / تَ / تْ mazi eki vb.) deneme!
      if (isDefinitelyNoun && suff.verbOnly) {
        continue;
      }

      if (
        normalized.endsWith(suff.raw) &&
        normalized.length - suff.raw.length >= 2
      ) {
        const stem = normalized.slice(0, -suff.raw.length);
        const matchedNom = matchNominalOrExactStem(
          stem,
          cleanedRaw,
          contextSentenceTr,
          isDefinitelyNoun
        );
        if (
          matchedNom &&
          (!suff.verbOnly || getWordCategory(matchedNom.item) === "fiil")
        ) {
          const isImp =
            getWordCategory(matchedNom.item) === "fiil" &&
            isGeneralImperativeForm(cleanedRaw);
          const sLabel = getSuffixDisplayLabel(suff, matchedNom.item, isImp);
          return {
            item: matchedNom.item,
            originalWord: cleanedRaw,
            matchedStem: stem,
            suffixLabel: sLabel,
            morphologyNote: buildMorphologyNote(
              matchedNom.item,
              undefined,
              sLabel,
              isImp ? "Emir Fiil (فعل أمر — Sen ...!)" : matchedNom.extraNote
            ),
            matchStage:
              matchedNom.stage === "exact" ? "affix" : matchedNom.stage,
          };
        }
      }
    }
  }

  // Kademe 2b: Sadece Ön Ek Soyarak İsim/Tam Eşleşme
  // Not: "ال" (veya وال، بال، لل، كال) soyulduğunda kalan gövde %100 İSİMDİR!
  for (const pref of PREFIX_RULES) {
    if (
      normalized.startsWith(pref.raw) &&
      normalized.length - pref.raw.length >= 2
    ) {
      const stem = normalized.slice(pref.raw.length);
      const effectiveNounGuard =
        isDefinitelyNoun || Boolean(pref.makesDefiniteNoun);
      const matchedNom = matchNominalOrExactStem(
        stem,
        cleanedRaw,
        contextSentenceTr,
        effectiveNounGuard
      );
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
        const effectiveNounGuard =
          isDefinitelyNoun || Boolean(pref.makesDefiniteNoun);
        for (const suff of SUFFIX_RULES) {
          if (
            suff.isDualOrPlural &&
            PROTECTED_NO_DUAL_PLURAL_SPLIT.has(afterPref)
          ) {
            continue;
          }
          if (effectiveNounGuard && suff.verbOnly) {
            continue;
          }
          if (
            afterPref.endsWith(suff.raw) &&
            afterPref.length - suff.raw.length >= 2
          ) {
            const stem = afterPref.slice(0, -suff.raw.length);
            const matchedNom = matchNominalOrExactStem(
              stem,
              cleanedRaw,
              contextSentenceTr,
              effectiveNounGuard
            );
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

  // KURAL 1-C: Kelime "ة" (Tâ-i Merbûta) ile bitiyorsa veya kesin İSİM ALAMETİ (isDefinitelyNoun) taşıyorsa
  // ASLA fiil çekim çözümleyicisine (Kademe 3) girmez!
  if (!endsWithTaMarbuta && !isDefinitelyNoun) {
    // Kademe 3: Fiil Çekim Kuralları (Doğrudan, Ön Ekli, Son Ekli, Ön+Son Ekli)
    const directVerb = matchStemWithRules(
      normalized,
      cleanedRaw,
      false,
      contextSentenceTr,
      false
    );
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
      // "ال" gibi belirlilik takıları fiillere gelemez!
      if (pref.makesDefiniteNoun) continue;
      if (
        normalized.startsWith(pref.raw) &&
        normalized.length - pref.raw.length >= 2
      ) {
        const stem = normalized.slice(pref.raw.length);
        const matched = matchStemWithRules(
          stem,
          cleanedRaw,
          false,
          contextSentenceTr,
          false
        );
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
        const matched = matchStemWithRules(
          stem,
          cleanedRaw,
          false,
          contextSentenceTr,
          false
        );
        if (matched) {
          const isImp =
            Boolean(matched.isImperative) ||
            (getWordCategory(matched.item) === "fiil" &&
              isImperativeAlifVerb(cleanedRaw));
          const sLabel = getSuffixDisplayLabel(suff, matched.item, isImp);
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
      if (pref.makesDefiniteNoun) continue;
      if (normalized.startsWith(pref.raw)) {
        const afterPref = normalized.slice(pref.raw.length);
        for (const suff of SUFFIX_RULES) {
          if (
            afterPref.endsWith(suff.raw) &&
            afterPref.length - suff.raw.length >= 2
          ) {
            const stem = afterPref.slice(0, -suff.raw.length);
            const matched = matchStemWithRules(
              stem,
              cleanedRaw,
              false,
              contextSentenceTr,
              false
            );
            if (matched) {
              const isImp =
                Boolean(matched.isImperative) ||
                (getWordCategory(matched.item) === "fiil" &&
                  isImperativeAlifVerb(cleanedRaw));
              const sLabel = getSuffixDisplayLabel(suff, matched.item, isImp);
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
  }

  // Kademe 5: Kök (kok) Ünsüz İskeleti Eşleştirmesi (Gramer Kalkanı + Türkçe Bağlam Puanlamalı)
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
  if (
    endsWithTaMarbuta &&
    candidateCore.endsWith("ه") &&
    candidateCore.length >= 4
  ) {
    candidateCore = candidateCore.slice(0, -1);
  } else if (!PROTECTED_NO_DUAL_PLURAL_SPLIT.has(candidateCore)) {
    for (const suff of SUFFIX_RULES) {
      if (isDefinitelyNoun && suff.verbOnly) continue;
      if (
        candidateCore.endsWith(suff.raw) &&
        candidateCore.length - suff.raw.length >= 3
      ) {
        candidateCore = candidateCore.slice(0, -suff.raw.length);
        break;
      }
    }
  }

  const skeletonCandidates: string[] = [];

  // KURAL: مَفْعِل / مَفْعَل ve مَوَاعِيد vezinlerindeki Misal Fiil (فَاءُ الْفِعْل = و) İsm-i Zaman/Mekân Koruması
  const mithalMafalMatch = candidateCore.match(
    /^مو([^\u0627\u0648\u064A])([^\u0627\u0648\u064A])$/
  );
  const mithalPluralMatch = candidateCore.match(
    /^موا([^\u0627\u0648\u064A])ي?([^\u0627\u0648\u064A])$/
  );

  if (mithalMafalMatch) {
    skeletonCandidates.push(`و${mithalMafalMatch[1]}${mithalMafalMatch[2]}`);
  } else if (mithalPluralMatch) {
    skeletonCandidates.push(`و${mithalPluralMatch[1]}${mithalPluralMatch[2]}`);
  } else {
    if (candidateCore === "استمار") {
      skeletonCandidates.push("امر");
    }
    const istifalHollowStems: Record<string, string> = {
      استراح: "روح",
      استشار: "شور",
      استقام: "قوم",
      استقال: "قول",
      استعان: "عون",
      استجاب: "جوب",
      استطاع: "طوع",
      استدار: "دور",
      استنار: "نور",
      استفاد: "فيد",
      استمال: "ميل",
    };
    if (istifalHollowStems[candidateCore]) {
      skeletonCandidates.push(istifalHollowStems[candidateCore]);
    }
    if (candidateCore.startsWith("است") && candidateCore.length >= 6) {
      skeletonCandidates.push(candidateCore.slice(3));
      skeletonCandidates.push(candidateCore.slice(3).replace(/[اوي]/g, ""));
    }
    if (/^[انتي]ست/.test(candidateCore) && candidateCore.length >= 6) {
      skeletonCandidates.push(candidateCore.slice(3));
      skeletonCandidates.push(candidateCore.slice(3).replace(/[اوي]/g, ""));
    }
    if (candidateCore.startsWith("م") && candidateCore.length >= 4) {
      skeletonCandidates.push(candidateCore.slice(1));
      skeletonCandidates.push(candidateCore.slice(1).replace(/[اوي]/g, ""));
    }
    if (
      !isDefinitelyNoun &&
      /^[انتي]/.test(candidateCore) &&
      candidateCore.length === 4
    ) {
      skeletonCandidates.push(candidateCore.slice(1));
    }
    skeletonCandidates.push(candidateCore);
    if (!candidateCore.startsWith("مو")) {
      skeletonCandidates.push(candidateCore.replace(/[اوي]/g, ""));
    }
  }

  for (const skel of skeletonCandidates) {
    if (skel.length === 3 && rootIndex.has(skel)) {
      const rootItems = rootIndex.get(skel)!;
      const filteredPool = rootItems.filter(
        (it) => getWordCategory(it) !== "ozel-isim"
      );
      const pool = filteredPool.length > 0 ? filteredPool : rootItems;

      // Kök adaylarını Türkçe cümle bağlamı ve Gramer Kalkanına göre puanla
      let bestItem = pool[0];
      let bestScore = -9999;
      for (const it of pool) {
        let sc = computeTurkishContextScore(it, contextSentenceTr);
        if (isDefinitelyNoun) {
          sc += getWordCategory(it) === "fiil" ? -500 : 200;
        }
        if (sc > bestScore) {
          bestScore = sc;
          bestItem = it;
        }
      }

      return {
        item: bestItem,
        originalWord: cleanedRaw,
        matchedStem: skel,
        morphologyNote: `Kök eşleşmesi: ${formatPrimaryWord(bestItem)} (${
          bestItem.anlam_tr
        }) → (${bestItem.kok})`,
        matchStage: "root",
      };
    }
  }

  return null;
}

// Bağlamsal + Hareke ve Gramer Korumalı lookupWord
export function lookupWord(
  rawWord: string,
  contextSentenceTr?: string,
  prevWordAr?: string
): DictionaryItem | null {
  const analysis = analyzeAndMatchWord(rawWord, contextSentenceTr, prevWordAr);
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

    for (let idx = 0; idx < tokens.length; idx++) {
      const token = tokens[idx];
      const prevToken = idx > 0 ? tokens[idx - 1] : undefined;
      const match = analyzeAndMatchWord(token, line.turkce, prevToken);
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

    words.forEach((word, idx) => {
      const prevWord = idx > 0 ? words[idx - 1] : undefined;
      const match = analyzeAndMatchWord(word, undefined, prevWord);
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