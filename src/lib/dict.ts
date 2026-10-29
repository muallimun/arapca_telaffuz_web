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
  "معا",
  "هل",
  "ما",
  "ماذا",
  "لماذا",
  "بماذا",
  "كيف",
  "اين",
  "متي",
  "كم",
  "بكم",
  "اي",
  "ايه",
  "ايهما",
  "ايتهما",
  "نعم",
  "لا",
  "كلا",
  "بلي",
  "هنا",
  "هناك",
  "هكذا",
  "كذلك",
  "هذا",
  "هذه",
  "ذلك",
  "تلك",
  "هؤلاء",
  "هولاء",
  "الذي",
  "التي",
  "الذين",
  "ايضا",
  "جدا",
  "فقط",
  "قبل",
  "بعد",
  "عند",
  "لدي",
  "لديك",
  "لديكم",
  "لدينا",
  "لديه",
  "لديها",
  "بين",
  "امام",
  "خلف",
  "وراء",
  "فوق",
  "تحت",
  "داخل",
  "خارج",
  "بجانب",
  "حول",
  "منذ",
  "حتي",
  "خلال",
  "عبر",
  "حسب",
  "وفق",
  "دون",
  "بدون",
  "طوال",
  "ضد",
  "مقابل",
  "او",
  "ام",
  "الا",
  "ثم",
  "بل",
  "لكن",
  "اما",
  "كي",
  "لكي",
  "ان",
  "لان",
  "عندما",
  "لو",
  "اذا",
  "اذن",
  "ربما",
  "يعني",
  "طيب",
  "حسنا",
  "طبعا",
  "حتما",
  "فعلا",
  "حقا",
  "تقريبا",
  "فورا",
  "حالا",
  "مجددا",
  "غالبا",
  "اخيرا",
  "مثلا",
  "خاصه",
  "وخاصه",
  "الآن",
  "الان",
  "غدا",
  "امس",
  "اليوم",
  "دائما",
  "ابدا",
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

  // Açıkça "isim" olarak tanımlanmış kelimeleri (kok === "-" olsa bile, örn: مِشْمِشٌ، كِيلُو، غِرَامٌ، لِيرَةٌ)
  // ASLA "edat" kategorisine düşürme!
  if (rawTur === "isim") {
    return "isim";
  }

  if (
    item.kok === "-" &&
    (!item.cemi || item.cemi === "-") &&
    primaryArClean.split(/\s+/).length >= 2
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

// Sözlük + Tamamlayıcı Sözlük Yamasını birleştir ve mükerrerleri (aynı kelime + aynı tür) kesin olarak tekilleştir
function buildUnifiedDictionary(): DictionaryItem[] {
  const combined = [
    ...SUPPLEMENT_DICTIONARY,
    ...(sozlukRaw as DictionaryItem[]),
  ];
  const seenByKey = new Map<string, DictionaryItem>();
  const deduplicated: DictionaryItem[] = [];

  for (const item of combined) {
    const primary = (item.mufret || item.mazi || item.muzari || "")
      .split(/[\/\-]/)[0]
      .trim();
    if (!primary) continue;

    const category = getWordCategory(item);
    let normPrimary = cleanArabicText(primary);
    // İsimlerde başındaki "ال" takısı nedeniyle aynı kelimenin iki kez listelenmesini önle
    if (
      category === "isim" &&
      normPrimary.startsWith("ال") &&
      normPrimary.length >= 5
    ) {
      normPrimary = normPrimary.slice(2);
    }

    const key = `${category}_${normPrimary}`;
    const existing = seenByKey.get(key);

    if (!existing) {
      const canonicalItem: DictionaryItem = {
        ...item,
        tur: category,
        mufret: item.mufret ? item.mufret.split("/")[0].trim() : item.mufret,
        mazi: item.mazi ? item.mazi.split("/")[0].trim() : item.mazi,
        anlam_tr: item.anlam_tr.trim(),
      };
      seenByKey.set(key, canonicalItem);
      deduplicated.push(canonicalItem);
    } else {
      // İlk kaydı koru; ikinci kayıtta eksik alan (çoğul, muzari, mastar, kök) varsa tamamla
      if ((!existing.cemi || existing.cemi === "-") && item.cemi && item.cemi !== "-") {
        existing.cemi = item.cemi;
      }
      if ((!existing.muzari || existing.muzari === "-") && item.muzari && item.muzari !== "-") {
        existing.muzari = item.muzari.split("/")[0].trim();
      }
      if ((!existing.masdar || existing.masdar === "-") && item.masdar && item.masdar !== "-") {
        existing.masdar = item.masdar;
      }
      if ((!existing.kok || existing.kok === "-") && item.kok && item.kok !== "-") {
        existing.kok = item.kok;
      }
    }
  }

  return deduplicated;
}

export const unifiedDictionary: DictionaryItem[] = buildUnifiedDictionary();

interface IndexedCandidate {
  item: DictionaryItem;
  rawForms: string[];
  order: number;
  isMasdarForm?: boolean;
}

// Çoklu Sözlük Alanı İndeksi (Eş yazılımlı kelimelerin tamamını tutar) ve Kök İndeksi
const dictIndex = new Map<string, DictionaryItem>();
const dictMultiIndex = new Map<string, IndexedCandidate[]>();
const rootIndex = new Map<string, DictionaryItem[]>();
const muzariBareIndex = new Map<string, DictionaryItem>();
let candidateOrderCounter = 0;

function addCandidateToMultiIndex(
  normKey: string,
  cleanedItem: DictionaryItem,
  rawVariant: string,
  isMasdarForm = false
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
    if (isMasdarForm) {
      existing.isMasdarForm = true;
    }
  } else {
    list.push({
      item: cleanedItem,
      rawForms: [rawVariant],
      order: candidateOrderCounter++,
      isMasdarForm,
    });
    dictMultiIndex.set(normKey, list);
  }
}

/**
 * Bir sözlük kaydının masdar alanının verilen normalize anahtarla eşleşip eşleşmediğini kontrol eder.
 * (Örn: التَّطْوِيلِ -> تطويل, الِاقْتِرَابُ -> اقتراب, رُؤْيَتَهَا -> رؤيه)
 */
function isItemMasdarForKey(item: DictionaryItem, normKey: string): boolean {
  if (!item.masdar || item.masdar === "-" || !normKey) return false;
  const variants = item.masdar
    .replace(/\(.*?\)/g, " ")
    .split(/[\/\-،,]/)
    .map((v) => cleanArabicText(v))
    .filter(Boolean);
  for (const v of variants) {
    if (v === normKey) return true;
    if (v.startsWith("ال") && v.slice(2) === normKey) return true;
  }
  return false;
}

function indexDictionaryItem(item: DictionaryItem) {
  const category = getWordCategory(item);
  const cleanedItem: DictionaryItem = {
    ...item,
    tur: category,
    mufret: item.mufret ? item.mufret.split("/")[0].trim() : item.mufret,
    anlam_tr: cleanMeaning(item.anlam_tr, category),
  };

  const fieldEntries: Array<{ raw?: string; isMasdar: boolean }> = [
    { raw: item.mufret, isMasdar: false },
    { raw: item.cemi, isMasdar: false },
    { raw: item.mazi, isMasdar: false },
    { raw: item.muzari, isMasdar: false },
    { raw: item.masdar, isMasdar: true },
  ];

  for (const { raw, isMasdar } of fieldEntries) {
    if (!raw || raw === "-") continue;
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
        addCandidateToMultiIndex(norm, cleanedItem, v, isMasdar);
        // Eğer varyant "ال" ile başlıyorsa, "ال"siz halini de aday listesine ekle (örn: الْبَأْسُ -> باس, الْأَحَدُ -> احد)
        if (norm.startsWith("ال") && norm.length >= 4) {
          addCandidateToMultiIndex(norm.slice(2), cleanedItem, v, isMasdar);
        }
      } else {
        // Çok kelimeli ifadeyi yalnızca tam haliyle indeksle
        addCandidateToMultiIndex(norm, cleanedItem, v, isMasdar);
      }
    }
  }

  // Muzari fiillerin baştaki muzari harfi (ي / ت / أ / ن) soyulmuş çıplak gövdesini de indeksle
  // (Örn: يَزُورُ -> زور, يَسِيلُ -> سيل, يُقْلِعُ -> قلع, يَطِيبُ -> طيب, يَقُولُ -> قول, يَكُونُ -> كون)
  if (category === "fiil" && item.muzari && item.muzari !== "-") {
    const muzVariants = item.muzari
      .replace(/\(.*?\)/g, " ")
      .split(/[\/\-،,]/)
      .map((v) => cleanArabicText(v))
      .filter(Boolean);
    for (const mv of muzVariants) {
      const strippedSin = mv.startsWith("س") && mv.length >= 4 ? mv.slice(1) : mv;
      if (/^[ينتأا]/.test(strippedSin) && strippedSin.length >= 3) {
        const bareMuz = strippedSin.slice(1);
        if (bareMuz.length >= 2 && !muzariBareIndex.has(bareMuz)) {
          muzariBareIndex.set(bareMuz, cleanedItem);
        }
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
  mufret: "ابْن",
  cemi: "أَبْنَاء",
  anlam_tr: "oğul, erkek evlat",
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
  // Onluk ve yüzlük sayılar (Asla ون / ين çoğul eki soyularak 3..9 tekil sayılarına düşürülmez!)
  "عشرون",
  "عشرين",
  "ثلاثون",
  "ثلاثين",
  "اربعون",
  "اربعين",
  "خمسون",
  "خمسين",
  "ستون",
  "ستين",
  "سبعون",
  "سبعين",
  "ثمانون",
  "ثمانين",
  "تسعون",
  "تسعين",
  "ثلاثمئه",
  "ثلاثمائه",
  "اربعمئه",
  "اربعمائه",
  "خمسمئه",
  "خمسمائه",
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
  "عبر",
]);

// KURAL 1.3-A: Kendisinden sonra gelen kelimenin %100 FİİL (Muzari Meczum / Menfi) olduğunu gösteren edatlar
const JUSSIVE_OR_VERB_PREV_WORDS = new Set<string>([
  "لم",
  "لما",
  "ولم",
  "فلم",
  "ولما",
  "فلما",
  "لن",
  "ولن",
  "فلن",
]);

/**
 * Tıklanan kelimenin cümle bağlamına (prevWordAr: لَمْ، لَمَّا، لَنْ، لَا الناهية/النافية)
 * veya gelecek zaman önekine (سَـ) göre %100 FİİL olup olmadığını tespit eder.
 */
export function hasDefiniteVerbMarker(
  cleanedRaw: string,
  prevWordAr?: string
): boolean {
  if (hasDefiniteNounMarker(cleanedRaw, prevWordAr)) {
    return false;
  }

  if (prevWordAr) {
    const cleanPrev = cleanArabicText(
      prevWordAr.replace(/[.,!?؟،;؛:"'()\[\]{}\d]/g, "")
    );
    if (JUSSIVE_OR_VERB_PREV_WORDS.has(cleanPrev)) {
      return true;
    }
    // "لَا" edatından sonra gelen kelime muzari harfiyle (أ، ن، ي، ت) başlıyorsa veya sonu cezm sükunluysa (لَا تَنْسَ، لَا تَبْقَ، لَا أَقُلْ، لَا تَقُلْ)
    if (
      (cleanPrev === "لا" || cleanPrev === "ولا" || cleanPrev === "فلا") &&
      (/^[أإآانيت]/.test(stripHarakat(cleanedRaw)) || /\u0652$/.test(cleanedRaw))
    ) {
      return true;
    }
  }

  return false;
}

/**
 * KURAL 1.3-B: "أَقُلْ / نَقُلْ / تَقُلْ / يَقُلْ / قُلْ" (قَالَ: söylemek) fiili ile
 * "أَقَلُّ / أَقَلَّ" (daha az, en az - İsm-i Tafdîl) sıfatını hareke, şedde ve bağlama göre kesin ayırır.
 */
function isQalaJussiveOrImperative(
  cleanedRaw: string,
  prevWordAr?: string
): boolean {
  if (hasDefiniteVerbMarker(cleanedRaw, prevWordAr)) {
    return true;
  }
  // ق harfinde ötre/damme varsa (أَقُلْ، نَقُلْ، تَقُلْ، يَقُلْ، قُلْ) %100 قَالَ fiilidir
  if (/ق\u064F/.test(cleanedRaw)) {
    return true;
  }
  // Kelimenin sonunda sükun (ْ) varsa ve ل harfinde şedde (ّ) yoksa %100 قَالَ fiilidir
  if (/\u0652$/.test(cleanedRaw) && !/ل\u0651/.test(cleanedRaw)) {
    return true;
  }
  return false;
}

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

  // 0. Gelecek zaman öneki (سَـ + muzari harfi: سَنَزُورُ، سَتَقْتُلِينَنِي، سَنَرْكَبُ) taşıyan kelimeler %100 FİİLDİR, asla isim olamaz!
  if (/^(وَ|فَ)?(أَ)?سَ[أإآانيت]/.test(cleanedRaw)) {
    return false;
  }

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
  // Not: 2. tekil müennes muzari (تَقْتُلِينَنِي / تُعْطِينَنِي) hariç
  if (
    /\u0650(كَ|كِ|كُمْ|كُنَّ|كُمَا|هُ|هَا|هِمْ|هُمَا|نَا)$/.test(cleanedRaw)
  ) {
    return true;
  }

  // 6. Önceki kelime (prevWordAr) bir harf-i cer ise (ancak حَتَّى / قَبْلَ / بَعْدَ sonrası muzari fiil gelebileceği için muzari fiilleri dışla)
  if (prevWordAr) {
    const cleanPrev = cleanArabicText(
      prevWordAr.replace(/[.,!?؟،;؛:"'()\[\]{}\d]/g, "")
    );
    const strippedPrevConj =
      cleanPrev.length > 2 && /^[وف]/.test(cleanPrev)
        ? cleanPrev.slice(1)
        : cleanPrev;
    const isVerbFollowableParticle =
      cleanPrev === "حتي" ||
      cleanPrev === "حتى" ||
      cleanPrev === "قبل" ||
      cleanPrev === "بعد" ||
      cleanPrev === "منذ";
    const looksLikeMuzariVerb =
      /^(يَ|يُ|تَ|تُ|نَ|نُ|أَ|أُ)/.test(cleanedRaw) &&
      muzariBareIndex.has(norm.slice(1));
    if (
      (PREPOSITION_PREV_WORDS.has(cleanPrev) ||
        PREPOSITION_PREV_WORDS.has(strippedPrevConj)) &&
      !(isVerbFollowableParticle && looksLikeMuzariVerb)
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

  const rawHasShadda = /\u0651/.test(rawWord);
  let bestScore = -999;

  for (const form of candidateRawForms) {
    const formPairs = extractConsonantVowelPairs(form);
    if (formPairs.length < 2) continue;

    let score = 0;
    const formHasShadda = /\u0651/.test(form);

    // KURAL 2.2: Şeddeli (فَعَّلَ: قَبَّلَ، مَثَّلَ، عَلَّمَ، سَلَّمَ) ile Şeddesiz (فَعَلَ / فَعِلَ / فِعْل: قَبِلَ، مِثْل، عَلِمَ، سَلِمَ) Ayrımı
    // Tıklanan kelimede hareke var ama şedde (ّ) YOKSA, şeddeli sözlük adaylarına ağır ceza ver!
    if (!rawHasShadda && formHasShadda) {
      score -= 260;
    } else if (rawHasShadda && !formHasShadda && /[\u064E\u064F\u0650\u0652]/.test(form)) {
      score -= 180;
    } else if (rawHasShadda && formHasShadda) {
      score += 95;
    } else if (!rawHasShadda && !formHasShadda && /[\u064E\u064F\u0650\u0652]/.test(form)) {
      score += 65;
    }

    // Muzari önekli kelimelerde (تَقْبَلُونَ vs قَبِلَ / يَقْبَلُ) ilk harf muzari harfi (أ/ن/ت/ي) ise gövde hizalamasını da kontrol et
    const offsetWord =
      wordPairs[0].letter !== formPairs[0].letter &&
      /^[انتي]$/.test(wordPairs[0].letter) &&
      wordPairs.length >= 3 &&
      wordPairs[1].letter === formPairs[0].letter
        ? 1
        : 0;

    const compareLen = Math.min(
      3,
      wordPairs.length - offsetWord,
      formPairs.length
    );

    for (let i = 0; i < compareLen; i++) {
      const wp = wordPairs[i + offsetWord];
      const fp = formPairs[i];
      if (wp.letter !== fp.letter) break;

      const wVowel = getPrimaryVowel(wp.marks);
      const fVowel = getPrimaryVowel(fp.marks);
      const wShadda = wp.marks.includes("\u0651");
      const fShadda = fp.marks.includes("\u0651");

      // Şedde uyumu / uyumsuzluğu (örn: سَلِمَ vs سُلَّم veya عَمَّان vs عُمَان veya قَبِلَ vs قَبَّلَ)
      if (i >= 1) {
        if (wShadda && fShadda) score += 70;
        else if (wShadda !== fShadda && (wp.marks.length > 0 || fp.marks.length > 0)) {
          score -= 140;
        }
      }

      // Son harfin irab harekesi cümleye göre değişebilir, ancak ilk 2 harfin (özellikle 2. harfin sükun/hareke durumu) belirleyicidir
      if (i < compareLen - 1 || compareLen <= 2) {
        if (wVowel && fVowel) {
          if (wVowel === fVowel) {
            score += i === 1 ? 100 : 75;
          } else {
            // 2. harfte birinde sükun diğerinde hareke varsa (ظَهْر vs ظَهَرَ, قَبْل vs قَبِلَ, مِثْل vs مَثَّلَ) ağır ceza!
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

// KURAL 5: İsm-i Tafdîl (أَفْعَلُ: daha ..., en ...) Kalıbı Koruması
// Bu kelimelerdeki baştaki أَ harfi kesinlikle 1. tekil muzari ("ben") eki değildir!
const ELATIVE_ISM_TAFDIL_SET = new Set<string>([
  "اخف",
  "ارخص",
  "اكثر",
  "اسهل",
  "اسرع",
  "اطول",
  "اجمل",
  "افضل",
  "اهم",
  "الذ",
  "اصح",
  "ادري",
  "اقل",
  "اروع",
]);

/**
 * KURAL 4: Özel İsim (ozel-isim - kişi adı) ile Cins İsim / Sıfat / Zarf Ayrımı:
 * - Kelimenin başında ال varsa (الْكَرِيمِ، الْحَسَنِ، الصَّالِحِ),
 * - Kelimenin sonunda tenvin fetha (اً / ً — حَسَناً), ة veya iyelik zamiri varsa,
 * - Veya Türkçe cümle çevirisinde (contextSentenceTr) o kişinin Türkçe özel adı geçmiyorsa
 *   kişi adı (ozel-isim) seçilemez; cins isim / sıfat / zarf seçilir!
 */
function isPersonalNameDisallowedByGrammarOrContext(
  item: DictionaryItem,
  cleanedRaw: string,
  contextSentenceTr?: string
): boolean {
  if (getWordCategory(item) !== "ozel-isim") return false;

  // Şehir ve ülke isimleri (عَمَّان، بَيْرُوت، دِمَشْق، الْقَاهِرَة، الْقُدْس vb.) bu kısıtlamadan muaftır
  if (
    /başkent|şehir|ülke|kudüs|mekke|medine|mısır|suriye|ürdün|lübnan|ırak|tunus/i.test(
      item.anlam_tr
    )
  ) {
    return false;
  }

  const bare = stripHarakat(cleanedRaw);

  // 1. Başında ال (veya وال / بال / لل / كال) varsa kişi özel ismi olamaz (örn: الْكَرِيمِ -> cömert/kerim)
  if (
    /^(وَ|فَ)?(بِ|كَ)?[اٱ]ل/.test(cleanedRaw) ||
    /^(و|ف)?(ب|ك)?ال/.test(bare) ||
    /^(وَ|فَ)?لِل/.test(cleanedRaw)
  ) {
    return true;
  }

  // 2. Sonunda tenvin fetha (حَسَناً -> tamam, peki) veya ة varsa
  if (/\u064B/.test(cleanedRaw) || bare.endsWith("ة") || bare.endsWith("ا")) {
    return true;
  }

  // 3. Türkçe cümle çevirisi verilmişse, kişi adının Türkçe cümlede geçip geçmediğini kontrol et
  if (contextSentenceTr) {
    const trPrimaryName = item.anlam_tr
      .replace(/\(.*?\)/g, "")
      .split(/[,;/\-]/)[0]
      .trim()
      .toLocaleLowerCase("tr-TR");
    const normTrSentence = contextSentenceTr.toLocaleLowerCase("tr-TR");
    if (trPrimaryName.length >= 3 && !normTrSentence.includes(trPrimaryName)) {
      return true;
    }
  }

  return false;
}

/**
 * Aynı normalize anahtara sahip birden fazla sözlük adayı arasından
 * 1) Gramer Kalkanı (isDefinitelyNoun),
 * 2) Özel İsim vs Cins İsim/Sıfat/Zarf Kalkanı (Kural 4),
 * 3) Türkçe Cümle Çevirisi Bağlamı (+500 puan),
 * 4) Hareke / Sükun Uyumu
 * kriterlerine göre en doğru adayı seçer.
 */
function pickBestCandidateForKey(
  normKey: string,
  cleanedRaw: string,
  contextSentenceTr?: string,
  isDefinitelyNoun?: boolean,
  isDefinitelyVerb?: boolean
): DictionaryItem | null {
  const candidates = dictMultiIndex.get(normKey);
  if (!candidates || candidates.length === 0) {
    const single = dictIndex.get(normKey) || null;
    if (single && isDefinitelyVerb && getWordCategory(single) !== "fiil") {
      return null;
    }
    if (
      single &&
      isDefinitelyNoun &&
      getWordCategory(single) === "fiil" &&
      !isItemMasdarForKey(single, normKey)
    ) {
      return null;
    }
    return single;
  }
  if (candidates.length === 1) {
    const only = candidates[0].item;
    const isMasdar =
      Boolean(candidates[0].isMasdarForm) || isItemMasdarForKey(only, normKey);
    if (isDefinitelyNoun && getWordCategory(only) === "fiil" && !isMasdar) {
      return null;
    }
    if (isDefinitelyVerb && getWordCategory(only) !== "fiil") {
      return null;
    }
    return only;
  }

  let bestCandidate: DictionaryItem | null = null;
  let bestTotalScore = -99999;

  for (const cand of candidates) {
    const cat = getWordCategory(cand.item);
    const isMasdar =
      Boolean(cand.isMasdarForm) || isItemMasdarForKey(cand.item, normKey);
    let score = -cand.order * 0.01; // İndeks sırası (tamamlayıcı sözlük önceliği)

    // 1. Gramer Kalkanı: Kesin isim alameti varsa fiilleri ele (ancak masdar formları isim-fiil olduğu için koru!)
    if (isDefinitelyNoun) {
      if (cat === "fiil" && !isMasdar) {
        score -= 1000;
      } else if (cat === "fiil" && isMasdar) {
        score += 180;
      } else {
        score += 250;
      }
    }

    // 1a. Kesin Fiil Alameti (لَمْ، لَمَّا، لَنْ، لَا + muzari): İsim ve sıfatları ele!
    if (isDefinitelyVerb) {
      if (cat === "fiil") {
        score += 1200;
      } else {
        score -= 1500;
      }
    }

    // 1b. KURAL 4: Özel İsim (Kişi Adı) vs Cins İsim / Sıfat / Zarf Kalkanı (الْكَرِيمِ، حَسَناً، بُشْرَى)
    if (
      isPersonalNameDisallowedByGrammarOrContext(
        cand.item,
        cleanedRaw,
        contextSentenceTr
      )
    ) {
      score -= 1500;
    }

    // 1c. KURAL 3.1: "كُمّ" (elbise kolu, yen) Koruması:
    // Tıklanan kelimede م harfi şeddeli değilse (كُمُّ / كُمِّ) veya çoğul أَكْمَام değilse,
    // ya da kelime ب / ل / عن / من ile başlıyorsa (بِكُمْ / لَكُمْ / عَنْكُمْ / مِنْكُمْ), "elbise kolu" adayını kesin olarak ele!
    if (
      cand.item.id === "kelime_485" ||
      /elbise kolu/i.test(cand.item.anlam_tr)
    ) {
      const isPluralAkmam = /اكمام/.test(cleanArabicText(cleanedRaw));
      const hasShaddaOnMim = /م\u0651/.test(cleanedRaw);
      const startsWithPrep = /^(وَ|فَ)?(بِ|لَ|لِ|عَنْ|مِنْ)/.test(cleanedRaw);
      if (startsWithPrep || (!isPluralAkmam && !hasShaddaOnMim)) {
        score -= 2500;
      }
    }

    // 1d. KURAL 1.1: "أَوَّلاً" (önce, ilk olarak — şeddeli/tenvinli) vs "أَوَلَا" (... değil mi? / bilmez miyim?) Koruması:
    if (cand.item.id === "supp_awala_ala_edat") {
      const hasShaddaOrTanwin = /[\u0651\u064B]/.test(cleanedRaw);
      const isExplicitAwala = /أَوَلَا/.test(cleanedRaw);
      if (hasShaddaOrTanwin || !isExplicitAwala) {
        score -= 2500;
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
    getWordCategory(bestCandidate) === "fiil" &&
    !isItemMasdarForKey(bestCandidate, normKey)
  ) {
    const nonVerb = candidates.find(
      (c) =>
        getWordCategory(c.item) !== "fiil" ||
        c.isMasdarForm ||
        isItemMasdarForKey(c.item, normKey)
    );
    return nonVerb ? nonVerb.item : null;
  }

  if (
    bestCandidate &&
    isDefinitelyVerb &&
    getWordCategory(bestCandidate) !== "fiil"
  ) {
    const onlyVerb = candidates.find(
      (c) => getWordCategory(c.item) === "fiil"
    );
    return onlyVerb ? onlyVerb.item : null;
  }

  return bestCandidate;
}

// ==============================================================================
// ÖN EK (PREFIX) VE SON EK (SUFFIX/ZAMİR) TABLOLARI
// ==============================================================================

// KURAL 1: İsim ve Genel Ön Ekler — KESİNLİKLE gelecek zaman "س / وس / فس" içermez!
// Böylece "وَسَمَكٌ" kelimesi sadece "وَ + سَمَكٌ" olarak ayrılır; asla "وس + مك -> مكة" olmaz!
const NOMINAL_PREFIX_RULES: Array<{
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
  { raw: "فب", label: "فَـ + بِـ (ile)", makesDefiniteNoun: true },
  { raw: "فل", label: "فَـ + لِـ (için)" },
  { raw: "ل", label: "لِـ (için / -e)" },
  { raw: "ب", label: "بِـ (ile / -de)" },
  { raw: "ك", label: "كَـ (gibi)", makesDefiniteNoun: true },
  { raw: "ف", label: "فَـ (böylece)" },
  { raw: "و", label: "وَ (ve)" },
];

// Yalnızca Fiil Çekiminde (Kademe 3) ve sıkı muzari kontrolüyle kullanılan gelecek zaman ve soru+gelecek/bağlaç önekleri
const FUTURE_VERB_PREFIX_RULES: Array<{
  raw: string;
  label: string;
}> = [
  { raw: "اس", label: "أَ (soru eki: mı/mi?) + سَـ (gelecek zaman -ecek)" },
  { raw: "اف", label: "أَ (soru eki: mı/mi?) + فَـ (böylece)" },
  { raw: "او", label: "أَ (soru eki: mı/mi?) + وَ (ve)" },
  { raw: "وس", label: "وَ (ve) + سَـ (gelecek zaman)" },
  { raw: "فس", label: "فَـ + سَـ (gelecek zaman)" },
  { raw: "س", label: "سَـ (gelecek zaman -ecek)" },
];

const PREFIX_RULES: Array<{
  raw: string;
  label: string;
  makesDefiniteNoun?: boolean;
}> = [...NOMINAL_PREFIX_RULES, ...FUTURE_VERB_PREFIX_RULES];

/**
 * KURAL 1 & 4.1: Gelecek zaman "سَـ" (veya "وَسَـ", "فَسَـ", "أَسَـ") ve soru+bağlaç ("أَفَـ", "أَوَ") önekinin soyulabilmesi için:
 * 1) Kelimede ال, ة veya tenvin (ً ٌ ٍ) gibi kesin isim alameti olmamalı (!isDefinitelyNoun),
 * 2) Önekten hemen sonra mutlaka muzari harfi (أ، ن، ي، ت veya آ) gelmeli,
 * 3) Kalan gövde en az 3 harfli olmalı!
 */
function canStripFutureSinPrefix(
  cleanedRaw: string,
  prefRaw: string,
  stem: string,
  isDefinitelyNoun: boolean
): boolean {
  if (isDefinitelyNoun) return false;
  if (!/^[انيت]/.test(stem)) return false;
  if (stem.length < 3) return false;

  const bare = stripHarakat(cleanedRaw);

  if (prefRaw === "اس") {
    // Orijinal kelimenin başında soru hemzesi + gelecek zaman (أَسَـ) olmalı (örn: أَسَتَكُونُ)
    if (!/^أَسَ/.test(cleanedRaw) && !/^[أا]س[أإآانيت]/.test(bare)) {
      return false;
    }
    const afterAsBare = bare.replace(/^[أا]س/, "");
    return /^[أإآانيت]/.test(afterAsBare);
  }

  if (prefRaw === "اف" || prefRaw === "او") {
    if (!/^أَ[فوَ]/.test(cleanedRaw)) {
      return false;
    }
    const afterInterrogConj = bare.replace(/^[أا][فو]/, "");
    return /^[أإآانيت]/.test(afterInterrogConj);
  }

  const afterSinBare = bare.replace(/^(و|ف)?س/, "");

  // Orijinal kelimede س'den sonraki ilk harf gerçekten أ، إ، آ، ا، ن، ي، ت olmalı
  if (!/^[أإآانيت]/.test(afterSinBare)) {
    return false;
  }

  return prefRaw === "س" || prefRaw === "وس" || prefRaw === "فس";
}

// KURAL 2: Yuvarlak Tâ (ة -> ت) + İyelik Zamiri Öncelik Listesi
// "تَذْكِرَتَكَ", "غُرْفَتِكُمْ", "مَعْرِفَتِكَ", "طَائِرَتُكَ", "حَقِيبَتِكَ", "مَدْرَسَتِي" gibi kelimelerin
// verbOnly olan "تك / ته / تها" kuralına girmeden ÖNCE iyelik zamiri + ت->ة olarak çözümlenmesini sağlar.
const POSSESSIVE_PRONOUN_SUFFIXES: Array<{
  raw: string;
  nounLabel: string;
}> = [
  { raw: "كما", nounLabel: "كُمَا (ikinizin - 2. ikil iyelik zamiri)" },
  { raw: "كم", nounLabel: "كُمْ (sizin - 2. çoğul iyelik zamiri)" },
  { raw: "كن", nounLabel: "كُنَّ (sizin [مؤنث] - 2. çoğul iyelik zamiri)" },
  { raw: "هما", nounLabel: "هُمَا (ikisinin - 3. ikil iyelik zamiri)" },
  { raw: "هم", nounLabel: "هُمْ (onların - 3. çoğul iyelik zamiri)" },
  { raw: "هن", nounLabel: "هُنَّ (onların [مؤنث] - 3. çoğul iyelik zamiri)" },
  { raw: "نا", nounLabel: "نَا (bizim - 1. çoğul iyelik zamiri)" },
  { raw: "ها", nounLabel: "هَا (onun [مؤنث] - 3. tekil iyelik zamiri)" },
  { raw: "ك", nounLabel: "كَ / كِ (senin - 2. tekil iyelik zamiri)" },
  { raw: "ه", nounLabel: "هُ (onun [مذكر] - 3. tekil iyelik zamiri)" },
  { raw: "ي", nounLabel: "ـِي (benim - 1. tekil iyelik zamiri)" },
];

const SUFFIX_RULES: Array<{
  raw: string;
  label: string;
  nounLabel?: string;
  imperativeLabel?: string;
  verbOnly?: boolean;
  isDualOrPlural?: boolean;
  isFeminineDual?: boolean;
  isPronoun?: boolean;
  isNiswaVerbSuffix?: boolean;
}> = [
  { raw: "تموني", label: "تُمْ (siz) + نِي (beni/bana)", verbOnly: true, isPronoun: true },
  { raw: "تموها", label: "تُمْ (siz) + هَا (onu [مؤنث])", verbOnly: true, isPronoun: true },
  { raw: "تموه", label: "تُمْ (siz) + هُ (onu [مذكر])", verbOnly: true, isPronoun: true },
  { raw: "تكما", label: "تُ / تَ + كُمَا (ikinizi / ikinize)", verbOnly: true, isPronoun: true },
  { raw: "تكم", label: "تُ + كُمْ (sizi / size)", verbOnly: true, isPronoun: true },
  { raw: "تكن", label: "تُ + كُنَّ (siz kadınları / size)", verbOnly: true, isPronoun: true },
  { raw: "تهم", label: "تُ / تَ / تْ + هُمْ (onları / onlara)", verbOnly: true, isPronoun: true },
  {
    raw: "تاني",
    label: "تَا (müennes ikil eki) + نِي (beni - 1. tekil nesne zamiri)",
    verbOnly: true,
    isPronoun: true,
  },
  {
    raw: "انها",
    label: "انِ (ikiniz/ikisi - muzari) + هَا (onu [مؤنث])",
    verbOnly: true,
    isPronoun: true,
  },
  {
    raw: "انه",
    label: "انِ (ikiniz/ikisi - muzari) + هُ (onu [مذكر])",
    verbOnly: true,
    isPronoun: true,
  },
  {
    raw: "انك",
    label: "انِ (ikisi - muzari) + كَ / كِ (seni / sana)",
    verbOnly: true,
    isPronoun: true,
  },
  {
    raw: "ونها",
    label: "ونَ (siz/onlar - muzari) + هَا (onu [مؤنث])",
    verbOnly: true,
    isPronoun: true,
  },
  {
    raw: "ونه",
    label: "ونَ (siz/onlar - muzari) + هُ (onu [مذكر])",
    verbOnly: true,
    isPronoun: true,
  },
  {
    raw: "ونك",
    label: "ونَ (onlar - muzari) + كَ / كِ (seni / sana)",
    verbOnly: true,
    isPronoun: true,
  },
  {
    raw: "ونني",
    label: "ونَ (siz/onlar - muzari) + نِي (beni / bana)",
    verbOnly: true,
    isPronoun: true,
  },
  {
    raw: "وننا",
    label: "ونَ (siz/onlar - muzari) + نَا (bizi / bize)",
    verbOnly: true,
    isPronoun: true,
  },
  {
    raw: "ينها",
    label: "ينَ (sen [مؤنث] - muzari) + هَا (onu [مؤنث])",
    verbOnly: true,
    isPronoun: true,
  },
  {
    raw: "ينه",
    label: "ينَ (sen [مؤنث] - muzari) + هُ (onu [مذكر])",
    verbOnly: true,
    isPronoun: true,
  },
  {
    raw: "ينني",
    label: "ينَ (sen [مؤنث] - muzari) + نِي (beni / bana)",
    verbOnly: true,
    isPronoun: true,
  },
  {
    raw: "يننا",
    label: "ينَ (sen [مؤنث] - muzari) + نَا (bizi / bize)",
    verbOnly: true,
    isPronoun: true,
  },
  {
    raw: "تني",
    label: "تْ (o [مؤنث]) / تَ + نِي (beni - 1. tekil nesne zamiri)",
    verbOnly: true,
    isPronoun: true,
  },
  { raw: "نني", label: "نِي (beni/bana)", verbOnly: true, isPronoun: true },
  {
    raw: "كما",
    label: "كُمَا (ikinizin / ikinize)",
    nounLabel: "كُمَا (ikinizin - 2. ikil iyelik zamiri)",
    isPronoun: true,
  },
  {
    raw: "كم",
    label: "كُمْ (sizin / size)",
    nounLabel: "كُمْ (sizin - 2. çoğul iyelik zamiri)",
    isPronoun: true,
  },
  {
    raw: "كن",
    label: "كُنَّ (siz kadınların / size)",
    nounLabel: "كُنَّ (sizin [مؤنث] - 2. çoğul iyelik zamiri)",
    isPronoun: true,
  },
  {
    raw: "هما",
    label: "هُمَا (ikisinin / ikisine)",
    nounLabel: "هُمَا (ikisinin - 3. ikil iyelik zamiri)",
    isPronoun: true,
  },
  {
    raw: "هم",
    label: "هُمْ (onların / onlara)",
    nounLabel: "هُمْ (onların - 3. çoğul iyelik zamiri)",
    isPronoun: true,
  },
  {
    raw: "هن",
    label: "هُنَّ (o kadınların / onlara)",
    nounLabel: "هُنَّ (onların [مؤنث] - 3. çoğul iyelik zamiri)",
    isPronoun: true,
  },
  {
    raw: "تان",
    label: "تَانِ (müennes ikil / tesniye eki)",
    nounLabel: "تَانِ (müennes ikil / tesniye eki)",
    isDualOrPlural: true,
    isFeminineDual: true,
  },
  {
    raw: "تين",
    label: "تَيْنِ (müennes ikil / tesniye eki)",
    nounLabel: "تَيْنِ (müennes ikil / tesniye eki)",
    isDualOrPlural: true,
    isFeminineDual: true,
  },
  { raw: "تها", label: "تُ / تَ / تْ + هَا (onu)", verbOnly: true, isPronoun: true },
  { raw: "ته", label: "تُ / تَ / تْ + هُ (onu)", verbOnly: true, isPronoun: true },
  { raw: "تك", label: "تُ + كَ / كِ (seni / sana)", verbOnly: true, isPronoun: true },
  { raw: "ناها", label: "نَا (biz) + هَا (onu)", verbOnly: true, isPronoun: true },
  { raw: "ناه", label: "نَا (biz) + هُ (onu)", verbOnly: true, isPronoun: true },
  { raw: "وها", label: "وا (onlar/çoğul) + هَا (onu)", verbOnly: true, isPronoun: true },
  { raw: "وه", label: "وا (onlar/çoğul) + هُ (onu)", verbOnly: true, isPronoun: true },
  { raw: "وك", label: "وا (onlar/çoğul) + كَ / كِ (seni/sana)", verbOnly: true, isPronoun: true },
  { raw: "وني", label: "وا (onlar/siz) + نِي (beni / bana)", verbOnly: true, isPronoun: true },
  { raw: "ونا", label: "وا (onlar/siz) + نَا (bizi / bize)", verbOnly: true, isPronoun: true },
  { raw: "وهم", label: "وا (onlar/çoğul) + هُمْ (onları)", verbOnly: true, isPronoun: true },
  { raw: "يها", label: "ي (muhataba) + هَا (onu)", verbOnly: true, isPronoun: true },
  { raw: "يه", label: "ي (muhataba) + هُ (onu)", verbOnly: true, isPronoun: true },
  { raw: "ني", label: "نِي (beni / bana)", verbOnly: true, isPronoun: true },
  {
    raw: "نا",
    label: "نَا (bizim / bizi / bize)",
    nounLabel: "نَا (bizim - 1. çoğul iyelik zamiri)",
    isPronoun: true,
  },
  {
    raw: "ها",
    label: "هَا (onun / onu [مؤنث])",
    nounLabel: "هَا (onun [مؤنث] - 3. tekil iyelik zamiri)",
    isPronoun: true,
  },
  {
    raw: "ان",
    label: "انِ (ikil / tesniye eki)",
    nounLabel: "انِ (ikil / tesniye eki)",
    isDualOrPlural: true,
  },
  {
    raw: "ين",
    label: "ينَ (sen [مؤنث] - 2. tekil dişil muzari eki)",
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
    isPronoun: true,
  },
  {
    raw: "ه",
    label: "هُ (onun / onu [مذكر])",
    nounLabel: "هُ (onun [مذكر] - 3. tekil iyelik zamiri)",
    isPronoun: true,
  },
  {
    raw: "ي",
    label: "ي (muhataba - 2. tekil dişil şahıs eki)",
    nounLabel: "ـِي (benim - 1. tekil iyelik zamiri)",
    imperativeLabel: "ـِي (müennes emir eki — sen [kadın])",
    isPronoun: true,
  },
  { raw: "ت", label: "تُ / تَ / تِ / تْ (mazi şahıs eki)", verbOnly: true },
  {
    raw: "ن",
    label: "نَ (cemî müennes / kadın çoğul şahıs eki: onlar)",
    verbOnly: true,
    isNiswaVerbSuffix: true,
  },
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
  زن: "وزن",
  دع: "ودع",
  ثق: "وثق",
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
  isDefinitelyNoun?: boolean,
  isDefinitelyVerb?: boolean,
  hasStrippedPronoun = false,
  hasStrippedFeminineDual = false
): {
  item: DictionaryItem;
  stage: "exact" | "ta-marbuta";
  extraNote?: string;
} | null {
  if (!stem || stem.length < 2) return null;

  const isElativeStem =
    ELATIVE_ISM_TAFDIL_SET.has(stem) &&
    !isDefinitelyVerb &&
    !(stem === "اقل" && isQalaJussiveOrImperative(cleanedRaw));

  // 1. Doğrudan eşleşme (Çoklu aday içinden bağlam ve harekeye göre en iyisini seç)
  if (dictMultiIndex.has(stem) || dictIndex.has(stem)) {
    const best = pickBestCandidateForKey(
      stem,
      cleanedRaw,
      contextSentenceTr,
      isDefinitelyNoun || isElativeStem,
      isDefinitelyVerb
    );
    if (best) {
      const isElative =
        isElativeStem && getWordCategory(best) === "isim";
      return {
        item: best,
        stage: "exact",
        extraNote: isElative
          ? "İsm-i Tafdîl (Üstünlük / Karşılaştırma Sıfatı: daha ..., en ...)"
          : undefined,
      };
    }
  }

  if (isDefinitelyVerb) return null;

  const isNonVerbOrMasdar = (item: DictionaryItem, key: string) =>
    getWordCategory(item) !== "fiil" || isItemMasdarForKey(item, key);

  // 2. Tâ-i Merbûta (ت -> ة) İzafet Onarımı (örn: تَذْكِرَتَكَ -> تذكرت -> تذكره, رُؤْيَتَهَا -> رؤيت -> رؤيه):
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
        true // ت -> ة izafet dönüşümü %100 isim/masdardır!
      );
      if (best && isNonVerbOrMasdar(best, taMarbutaRestored)) {
        return {
          item: best,
          stage: "ta-marbuta",
          extraNote: "ت -> ة (Tâ-i Merbûta izafet dönüşümü)",
        };
      }
    }
  }

  // 2b. KURAL 2.3-A (Hata 2 Düzeltmesi): Zamir Öncesi Elif-i Maksûre (ى -> ا) Dönüşümü (شَكْوَاكَ -> شكوا -> شَكْوَى، مَعْنَاهُ -> معنا -> مَعْنَى)
  // SADECE kelimenin sonundan gerçek bir iyelik/nesne zamiri soyulduğunda (hasStrippedPronoun === true)
  // ve kelime tenvin fetha (ـاً / ـًا: لَيْلاً، حَقّاً، أَبَداً vb.) ile bitmiyorsa uygulanır!
  const endsWithTanwinFatha = /\u064B[ا]?$|ا\u064B$/.test(cleanedRaw);
  if (
    hasStrippedPronoun &&
    !endsWithTanwinFatha &&
    stem.endsWith("ا") &&
    stem.length >= 3
  ) {
    const alifMaqsuraRestored = stem.slice(0, -1) + "ي";
    if (
      dictMultiIndex.has(alifMaqsuraRestored) ||
      dictIndex.has(alifMaqsuraRestored)
    ) {
      const best = pickBestCandidateForKey(
        alifMaqsuraRestored,
        cleanedRaw,
        contextSentenceTr,
        isDefinitelyNoun
      );
      if (best && isNonVerbOrMasdar(best, alifMaqsuraRestored)) {
        return {
          item: best,
          stage: "ta-marbuta",
          extraNote: "ى -> ا (zamir öncesi Elif-i Maksûre dönüşümü)",
        };
      }
    }
  }

  // 2c. KURAL 2.3-B: Zamir Öncesi Hemze Kürsüsü (ء -> ئ / ؤ) Dönüşümü (بِالْتِقَائِكِ -> التقاي -> اِلْتِقَاء، دَوَائِي -> دواي -> دَوَاء، أَصْدِقَائِي -> اصدقاي -> أَصْدِقَاء)
  if (
    hasStrippedPronoun &&
    (stem.endsWith("ي") || stem.endsWith("و")) &&
    stem.length >= 3
  ) {
    const hamzaRestored = stem.slice(0, -1) + "ء";
    if (dictMultiIndex.has(hamzaRestored) || dictIndex.has(hamzaRestored)) {
      const best = pickBestCandidateForKey(
        hamzaRestored,
        cleanedRaw,
        contextSentenceTr,
        isDefinitelyNoun
      );
      if (best && isNonVerbOrMasdar(best, hamzaRestored)) {
        return {
          item: best,
          stage: "ta-marbuta",
          extraNote: "ء -> ئ/ؤ (zamir öncesi hemze kürsüsü dönüşümü)",
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
      if (best && isNonVerbOrMasdar(best, withoutTaMarbuta)) {
        return {
          item: best,
          stage: "ta-marbuta",
          extraNote: "ة (müenneslik eki)",
        };
      }
    }
    // Nisba müennes (ör: الذهبيه -> ذهب, الجويه -> جو, العربيه -> عرب, التاريخيه -> تاريخ, نَارِيَّةٌ -> نار, الشِّتَوِيَّةِ -> شتاء, الْإِبْتِدَائِيَّةِ -> ابتداء, مَائِيَّةٍ -> ماء)
    if (withoutTaMarbuta.endsWith("ي") && withoutTaMarbuta.length >= 3) {
      const withoutNisba = withoutTaMarbuta.slice(0, -1);
      const nisbaBaseCandidates = [withoutNisba];
      if (withoutNisba.endsWith("و") && withoutNisba.length >= 3) {
        nisbaBaseCandidates.push(withoutNisba.slice(0, -1) + "اء");
        nisbaBaseCandidates.push(withoutNisba.slice(0, -1) + "ه");
      }
      if (withoutNisba.endsWith("ي") && withoutNisba.length >= 3) {
        nisbaBaseCandidates.push(withoutNisba.slice(0, -1) + "ء");
      }
      for (const nbCand of nisbaBaseCandidates) {
        if (dictMultiIndex.has(nbCand) || dictIndex.has(nbCand)) {
          const best = pickBestCandidateForKey(
            nbCand,
            cleanedRaw,
            contextSentenceTr,
            true
          );
          if (best && isNonVerbOrMasdar(best, nbCand)) {
            return {
              item: best,
              stage: "ta-marbuta",
              extraNote: "ـِيَّة (nispet / aidiyet ve müenneslik eki)",
            };
          }
        }
      }
    }
  }

  // 3b. Müzekker Nispet (ـِيّ) soyarak isim eşleşmesi (ör: ذَهَبِيّ -> ذهب، خَشَبِيّ -> خشب، مَطَّاطِيّ -> مطاط، اِبْتِدَائِيّ -> ابتداء، شِتَوِيّ -> شتاء، مَائِيّ -> ماء)
  if (stem.endsWith("ي") && stem.length >= 4 && isDefinitelyNoun) {
    const withoutNisba = stem.slice(0, -1);
    const nisbaMascCandidates = [withoutNisba];
    if (withoutNisba.endsWith("و") && withoutNisba.length >= 3) {
      nisbaMascCandidates.push(withoutNisba.slice(0, -1) + "اء");
      nisbaMascCandidates.push(withoutNisba.slice(0, -1) + "ه");
    }
    if (withoutNisba.endsWith("ي") && withoutNisba.length >= 3) {
      nisbaMascCandidates.push(withoutNisba.slice(0, -1) + "ء");
    }
    for (const nbCand of nisbaMascCandidates) {
      if (dictMultiIndex.has(nbCand) || dictIndex.has(nbCand)) {
        const best = pickBestCandidateForKey(
          nbCand,
          cleanedRaw,
          contextSentenceTr,
          true
        );
        if (best && isNonVerbOrMasdar(best, nbCand)) {
          return {
            item: best,
            stage: "ta-marbuta",
            extraNote: "ـِيّ (nispet / aidiyet eki)",
          };
        }
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
      if (best && isNonVerbOrMasdar(best, singBase + "ه")) {
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
      if (best && isNonVerbOrMasdar(best, singBase)) {
        return {
          item: best,
          stage: "ta-marbuta",
          extraNote: "ات (kurallı dişil çoğul eki)",
        };
      }
    }
  }

  // 4b. Müennes ikil / tesniye (ـَتَانِ / ـَتَيْنِ: لَائِقَتَانِ، جَمِيلَتَانِ، مَطْبُوعَتَانِ) soyarak tekil eşleşmesi
  if (
    (stem.endsWith("تان") || stem.endsWith("تين")) &&
    stem.length >= 5 &&
    !PROTECTED_NO_DUAL_PLURAL_SPLIT.has(stem)
  ) {
    const singBase = stem.slice(0, -3);
    const note = stem.endsWith("تان")
      ? "تَانِ (müennes ikil / tesniye eki)"
      : "تَيْنِ (müennes ikil / tesniye eki)";
    if (dictMultiIndex.has(singBase + "ه") || dictIndex.has(singBase + "ه")) {
      const best = pickBestCandidateForKey(
        singBase + "ه",
        cleanedRaw,
        contextSentenceTr,
        true
      );
      if (best && isNonVerbOrMasdar(best, singBase + "ه")) {
        return {
          item: best,
          stage: "ta-marbuta",
          extraNote: note,
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
      if (best && isNonVerbOrMasdar(best, singBase)) {
        return {
          item: best,
          stage: "ta-marbuta",
          extraNote: note,
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
      if (best && isNonVerbOrMasdar(best, singBase)) {
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

  // Sadece müennes ikil (تان / تين) soyulmuş bir gövde geldiğinde "+ ه" (ة) varyantını da kontrol et
  // (Normal kelimelerde "السن" + "ه" -> "السنه" [أَلْسِنَة: diller] hatasına yol açmaması için koşulsuz çalıştırılmaz!)
  if (hasStrippedFeminineDual) {
    const withTaMarbuta = stem + "ه";
    if (dictMultiIndex.has(withTaMarbuta) || dictIndex.has(withTaMarbuta)) {
      const best = pickBestCandidateForKey(
        withTaMarbuta,
        cleanedRaw,
        contextSentenceTr,
        true
      );
      if (best && isNonVerbOrMasdar(best, withTaMarbuta)) {
        return {
          item: best,
          stage: "ta-marbuta",
          extraNote: "ة -> ت (müennes ikil dönüşümü)",
        };
      }
    }
  }

  return null;
}

/**
 * KURAL 1.4: Eşleşen fiilin kendi mazi formu zaten "أَ" ile başlıyorsa (أَعَادَ، أَرَادَ، أَرْسَلَ، أَعْطَى، أَخَذَ، أَكَلَ، أَمَرَ، أَخْبَرَ، أَعْلَنَ، أَزْعَجَ، أَحْضَرَ)
 * ve tıklanan kelime 1. tekil muzari ötreli "أُ" (أُعِيدُ، أُرِيدُ، أُرْسِلُ) değilse,
 * baştaki "أَ" harfi fiilin kendi mazi gövdesine aittir; "+ أَ (ben - muzari)" etiketi eklenmez!
 */
function isVerbOwnMaziAlif(
  item: DictionaryItem,
  stem: string,
  cleanedRaw: string
): boolean {
  if (!stem.startsWith("ا")) return false;
  const strippedConj = cleanedRaw.replace(/^(وَ|فَ)/, "");
  // Eğer kelime أُ (damme) ile başlıyorsa (أُعِيدُ، أُرِيدُ، أُرْسِلُ، أُحِبُّ) gerçekten 1. tekil muzaridir
  if (/^(سَ)?أُ/.test(strippedConj)) return false;

  const maziVariants = (item.mazi || "")
    .split(/[\/\-،,]/)
    .map((v) => v.trim())
    .filter(Boolean);

  for (const mv of maziVariants) {
    const cleanMazi = cleanArabicText(mv);
    if (cleanMazi.startsWith("ا") && /^[أإآ]/.test(mv)) {
      if (
        cleanMazi === stem ||
        stem.startsWith(cleanMazi) ||
        cleanMazi.slice(0, 3) === stem.slice(0, 3)
      ) {
        return true;
      }
    }
  }
  return false;
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
  isDefinitelyNoun = false,
  isDefinitelyVerb = false,
  hasStrippedPronoun = false
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
    isDefinitelyNoun,
    isDefinitelyVerb,
    hasStrippedPronoun
  );
  if (nominal) {
    // Eğer bulunan kelime bir fiilse ve emir formundaysa (örn: اِنْتَظِرْ، تَفَضَّلْ، اِسْتَمِعْ) emir notunu ekle
    if (
      getWordCategory(nominal.item) === "fiil" &&
      !isDefinitelyNoun &&
      isGeneralImperativeForm(cleanedRaw) &&
      !isDefinitelyVerb
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
  // KURAL 2.1: "كل" gövdesinde şedde (ّ) varsa (فَكُلُّ / كُلُّ) ASLA "أَكَلَ" emir fiiline gitmez!
  if (
    stem.length === 2 &&
    IRREGULAR_IMPERATIVE_MAP[stem] &&
    !(stem === "كل" && /\u0651/.test(cleanedRaw))
  ) {
    const mapped = IRREGULAR_IMPERATIVE_MAP[stem];
    const best = pickBestCandidateForKey(
      mapped,
      cleanedRaw,
      contextSentenceTr,
      false,
      true
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

  // 3. Fiil Çekim Çözücü (Muzari & Mazi & Emir & Muzaaf & Ecvef & Nakıs) — Yalnızca bulunan öğe gerçek bir FİİL ise kabul edilir!
  if (/^[انتي]/.test(stem) && stem.length >= 2) {
    const muzariPrefixChar = stem[0];
    const isImp =
      !isDefinitelyVerb &&
      (muzariPrefixChar === "ا"
        ? isImperativeAlifVerb(cleanedRaw)
        : muzariPrefixChar === "ي"
        ? false
        : isGeneralImperativeForm(cleanedRaw));

    const getPersonNote = (matchedVerb: DictionaryItem): string | undefined => {
      if (muzariPrefixChar === "ا") {
        if (isVerbOwnMaziAlif(matchedVerb, stem, cleanedRaw)) {
          return undefined;
        }
        return isImp ? "Emir Fiil (فعل أمر — Sen ...!)" : "أَ (ben - muzari)";
      }
      if (muzariPrefixChar === "ن") return "نَـ (biz - muzari)";
      if (muzariPrefixChar === "ت") {
        return isImp
          ? "Emir Fiil (فعل أمر — Sen ...!)"
          : "تَـ (sen/o - muzari)";
      }
      return "يَـ (o/onlar - muzari)";
    };

    if (stem.length >= 3) {
      const asYa = "ي" + stem.slice(1);
      const yaCand = pickBestCandidateForKey(
        asYa,
        cleanedRaw,
        contextSentenceTr,
        false,
        true
      );
      if (yaCand && getWordCategory(yaCand) === "fiil") {
        return {
          item: yaCand,
          stage: "verb",
          extraNote: getPersonNote(yaCand),
          isImperative: isImp,
        };
      }

      const asAlifMazi = "ا" + stem.slice(1);
      const alifCand = pickBestCandidateForKey(
        asAlifMazi,
        cleanedRaw,
        contextSentenceTr,
        false,
        true
      );
      if (alifCand && getWordCategory(alifCand) === "fiil") {
        return {
          item: alifCand,
          stage: "verb",
          extraNote: getPersonNote(alifCand),
          isImperative: isImp,
        };
      }
    }

    const bareAfterPrefix = stem.slice(1);

    // KURAL 1 (Yeni): İndekslenmiş muzari çıplak gövdesi (زور -> زار/يزور, سيل -> سال/يسيل, قلع -> أقلع/يقلع, طيب -> طاب/يطيب)
    if (bareAfterPrefix.length >= 2 && muzariBareIndex.has(bareAfterPrefix)) {
      const muzBareCand = muzariBareIndex.get(bareAfterPrefix)!;
      if (getWordCategory(muzBareCand) === "fiil") {
        return {
          item: muzBareCand,
          stage: "verb",
          extraNote: getPersonNote(muzBareCand),
          isImperative: isImp,
        };
      }
    }

    // KURAL 1.1 & KURAL 1.4: Muzaaf (Şeddeli 2 Harfli Gövde) ve Muzaaf İf'âl (أَحَبَّ / سَتُحِبُّ / تُحِبِّينَ) Fiil Kuralı
    if (bareAfterPrefix.length === 2) {
      // 1) 2 harfli şeddeli mazi gövdesi (مر، دق، ضر، ظن) veya İf'âl muzaaf (أحب، أعد، أصر)
      const geminateCand = pickBestCandidateForKey(
        bareAfterPrefix,
        cleanedRaw,
        contextSentenceTr,
        false,
        true
      );
      if (geminateCand && getWordCategory(geminateCand) === "fiil") {
        return {
          item: geminateCand,
          stage: "verb",
          extraNote: getPersonNote(geminateCand),
          isImperative: isImp,
        };
      }
      const ifalGeminateCand = pickBestCandidateForKey(
        "ا" + bareAfterPrefix,
        cleanedRaw,
        contextSentenceTr,
        false,
        true
      );
      if (ifalGeminateCand && getWordCategory(ifalGeminateCand) === "fiil") {
        return {
          item: ifalGeminateCand,
          stage: "verb",
          extraNote: getPersonNote(ifalGeminateCand),
          isImperative: isImp,
        };
      }
      // 2) Son harfin tekrarlandığı 3 harfli muzaaf kök (مر -> مرر، دق -> دقق، ضر -> ضرر، ظن -> ظنن، حب -> حبب)
      const doubledRoot = bareAfterPrefix + bareAfterPrefix[1];
      if (rootIndex.has(doubledRoot)) {
        const verbFromRoot = rootIndex
          .get(doubledRoot)!
          .find((it) => getWordCategory(it) === "fiil");
        if (verbFromRoot) {
          return {
            item: verbFromRoot,
            stage: "verb",
            extraNote: getPersonNote(verbFromRoot),
            isImperative: isImp,
          };
        }
      }
      // 3) Ecvef (ortası illetli) fiil cezm/muzari gövdesi (أَقُلْ -> قل -> قال، يَكُنْ -> كن -> كان، يَنَلْ -> نل -> نال)
      const hollowMidAlif = bareAfterPrefix[0] + "ا" + bareAfterPrefix[1];
      const hollowVerbCand = pickBestCandidateForKey(
        hollowMidAlif,
        cleanedRaw,
        contextSentenceTr,
        false,
        true
      );
      if (hollowVerbCand && getWordCategory(hollowVerbCand) === "fiil") {
        return {
          item: hollowVerbCand,
          stage: "verb",
          extraNote: getPersonNote(hollowVerbCand),
          isImperative: isImp,
        };
      }
      // 4) Misal (ilk harfi و olup muzaride düşen) fiil gövdesi (سَأَزِنُ -> زن -> وزن، أَضَعُ -> ضع -> وضع، أَجِدُ -> جد -> وجد، نَصِلُ -> صل -> وصل، يَقَعُ -> قع -> وقع، أَثِقُ -> ثق -> وثق، يَجِبُ -> جب -> وجب، يَقِفُ -> قف -> وقف، يَصِفُ -> صف -> وصف، يَعِدُ -> عد -> وعد، يَدَعُ -> دع -> ودع)
      const mithalRestored = "و" + bareAfterPrefix;
      const mithalVerbCand = pickBestCandidateForKey(
        mithalRestored,
        cleanedRaw,
        contextSentenceTr,
        false,
        true
      );
      if (mithalVerbCand && getWordCategory(mithalVerbCand) === "fiil") {
        return {
          item: mithalVerbCand,
          stage: "verb",
          extraNote: getPersonNote(mithalVerbCand),
          isImperative: isImp,
        };
      }
    }

    // İstif'âl (استفعل) bâbı muzaaf (يَسْتَعِدَّ -> استعد) VE ecvef meczum (لَمْ نَسْتَطِعِ -> ستطع -> استطاع، لَمْ نَسْتَفِدْ -> ستفد -> استفاد، يَسْتَرِحْ -> سترح -> استراح) fiiller
    if (bareAfterPrefix.startsWith("ست") && bareAfterPrefix.length === 4) {
      const istifalMazi = "ا" + bareAfterPrefix;
      const istCand = pickBestCandidateForKey(
        istifalMazi,
        cleanedRaw,
        contextSentenceTr,
        false,
        true
      );
      if (istCand && getWordCategory(istCand) === "fiil") {
        return {
          item: istCand,
          stage: "verb",
          extraNote: getPersonNote(istCand),
          isImperative: isImp,
        };
      }
      // KURAL 4.2: İstif'âl (استفعل) bâbındaki Ecvef Fiillerin Cezm Halinde (لَمْ نَسْتَطِعِ / لَمْ أَسْتَطِعْ / لَمْ يَسْتَطِعْ) Düşen İllet Harfinin ("ا / ي") Onarımı
      const istifalHollowMazi =
        "است" + bareAfterPrefix[2] + "ا" + bareAfterPrefix[3];
      const istHollowCand = pickBestCandidateForKey(
        istifalHollowMazi,
        cleanedRaw,
        contextSentenceTr,
        false,
        true
      );
      if (istHollowCand && getWordCategory(istHollowCand) === "fiil") {
        return {
          item: istHollowCand,
          stage: "verb",
          extraNote: getPersonNote(istHollowCand),
          isImperative: isImp,
        };
      }
      const base2 = bareAfterPrefix.slice(2);
      const doubledIstRoot = base2 + base2[1];
      if (rootIndex.has(doubledIstRoot)) {
        const istVerb = rootIndex
          .get(doubledIstRoot)!
          .find((it) => getWordCategory(it) === "fiil");
        if (istVerb) {
          return {
            item: istVerb,
            stage: "verb",
            extraNote: getPersonNote(istVerb),
            isImperative: isImp,
          };
        }
      }
    }

    if (bareAfterPrefix.length >= 3) {
      // KURAL 1.4 KALKANI: Eğer kelime "أَفْعَلَ" (4 harfli mazi) veznindeyse ve kendi mazi kaydı varsa,
      // baştaki "أ" harfini soyup 3 harfli sülasi fiile düşürme!
      const bareCand = pickBestCandidateForKey(
        bareAfterPrefix,
        cleanedRaw,
        contextSentenceTr,
        false,
        true
      );
      if (bareCand && getWordCategory(bareCand) === "fiil") {
        return {
          item: bareCand,
          stage: "verb",
          extraNote: getPersonNote(bareCand),
          isImperative: isImp,
        };
      }
    }

    // KURAL 1.2: Nakıs (Sonu İlletli ي / ى / و) Fiillerin Cezm ve Çoğul Çekimi
    // (لَمْ نَلْتَقِ -> نلتق -> يلتقي/التقى، يَرْتَدُونَ -> يرتد -> يرتدي/ارتدى، لَا تَنْسَ -> تنس -> ينسى/نسي، لَا تَبْقَ -> تبق -> يبقى/بقي، يُرَبُّونَ -> يرب -> يربي/ربى، تَرَوْنَ -> تر -> يرى/رأى)
    const nakisCandidatesToTry = [
      stem + "ي",
      "ي" + bareAfterPrefix + "ي",
      "ا" + bareAfterPrefix + "ي",
      bareAfterPrefix + "ي",
      bareAfterPrefix + "ا",
    ];
    for (const nkKey of nakisCandidatesToTry) {
      if (nkKey.length < 3) continue;
      const nkCand = pickBestCandidateForKey(
        nkKey,
        cleanedRaw,
        contextSentenceTr,
        false,
        true
      );
      if (nkCand && getWordCategory(nkCand) === "fiil") {
        return {
          item: nkCand,
          stage: "verb",
          extraNote: getPersonNote(nkCand),
          isImperative: isImp,
        };
      }
    }
  }

  // 3b. سَآكُلُ / آتِي -> اكل / ياكل ve Emir fiiller (اِمْلَأْ، اِجْلِبْ، أَخْرِجْ، اِمْشِي)
  if (stem.startsWith("ا") && stem.length >= 3) {
    const isImp = !isDefinitelyVerb && isImperativeAlifVerb(cleanedRaw);

    const asYaWithAlif = "يا" + stem.slice(1);
    const yaAlifCand = pickBestCandidateForKey(
      asYaWithAlif,
      cleanedRaw,
      contextSentenceTr,
      false,
      true
    );
    if (yaAlifCand && getWordCategory(yaAlifCand) === "fiil") {
      const note = isVerbOwnMaziAlif(yaAlifCand, stem, cleanedRaw)
        ? undefined
        : isImp
        ? "Emir Fiil (فعل أمر — Sen ...!)"
        : "أَ (ben - muzari)";
      return {
        item: yaAlifCand,
        stage: "verb",
        extraNote: note,
        isImperative: isImp,
      };
    }

    const withoutInitialAlif = stem.slice(1);
    if (withoutInitialAlif.length >= 2) {
      const bareCand = pickBestCandidateForKey(
        withoutInitialAlif,
        cleanedRaw,
        contextSentenceTr,
        false,
        true
      );
      if (bareCand && getWordCategory(bareCand) === "fiil") {
        const note = isVerbOwnMaziAlif(bareCand, stem, cleanedRaw)
          ? undefined
          : isImp
          ? "Emir Fiil (فعل أمر — Sen ...!)"
          : "أَ (ben - muzari)";
        return {
          item: bareCand,
          stage: "verb",
          extraNote: note,
          isImperative: isImp,
        };
      }
      const asYaImperative = "ي" + withoutInitialAlif;
      const yaImpCand = pickBestCandidateForKey(
        asYaImperative,
        cleanedRaw,
        contextSentenceTr,
        false,
        true
      );
      if (yaImpCand && getWordCategory(yaImpCand) === "fiil") {
        const note = isVerbOwnMaziAlif(yaImpCand, stem, cleanedRaw)
          ? undefined
          : isImp
          ? "Emir Fiil (فعل أمر — Sen ...!)"
          : "أَ (ben - muzari)";
        return {
          item: yaImpCand,
          stage: "verb",
          extraNote: note,
          isImperative: isImp,
        };
      }
    }
  }

  // 3c. Mudaaf (şeddeli) fiil açılımı: سُرِرْتُ -> سرر -> سر, مَرَرْتُ -> مرر -> مر
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
      false,
      true
    );
    if (hollowCand && getWordCategory(hollowCand) === "fiil") {
      return {
        item: hollowCand,
        stage: "verb",
        extraNote: "أجوف (ortası illetli fiil çekimi)",
      };
    }
  }

  // 3e. Nakıs fiil mazi/emir/çoğul çekimi: اشْتَرَيْتِ -> اشتري -> اشترى, اِمْشِي -> امشي -> مشى, اِسْتَيْقَظُوا -> استيقظ -> استيقظ
  if (stem.endsWith("ي") && stem.length >= 3) {
    const withoutYa = stem.slice(0, -1) + "ا";
    const nakisCand = pickBestCandidateForKey(
      withoutYa,
      cleanedRaw,
      contextSentenceTr,
      false,
      true
    );
    if (nakisCand && getWordCategory(nakisCand) === "fiil") {
      return {
        item: nakisCand,
        stage: "verb",
      };
    }
  }

  // 3f. Nesne zamiri birleştiği için sondaki "ى" harfi "ا"ya dönüşen fiiller (أَرَاكَ -> ارا -> أرى/يرى، يَرَاهُ -> يرا -> يرى، أَعْطَاكَ -> اعطا -> أعطى)
  if (stem.endsWith("ا") && stem.length >= 3) {
    const alifToYa = stem.slice(0, -1) + "ي";
    const yaFormCand = pickBestCandidateForKey(
      alifToYa,
      cleanedRaw,
      contextSentenceTr,
      false,
      true
    );
    if (yaFormCand && getWordCategory(yaFormCand) === "fiil") {
      return {
        item: yaFormCand,
        stage: "verb",
        extraNote: "ى -> ا (zamir öncesi dönüşüm)",
      };
    }
    if (/^[انتي]/.test(alifToYa)) {
      const asThirdPersonYa = "ي" + alifToYa.slice(1);
      const thirdPersonCand = pickBestCandidateForKey(
        asThirdPersonYa,
        cleanedRaw,
        contextSentenceTr,
        false,
        true
      );
      if (thirdPersonCand && getWordCategory(thirdPersonCand) === "fiil") {
        return {
          item: thirdPersonCand,
          stage: "verb",
          extraNote:
            alifToYa[0] === "ا"
              ? "أَ (ben - muzari)"
              : alifToYa[0] === "ن"
              ? "نَـ (biz - muzari)"
              : alifToYa[0] === "ت"
              ? "تَـ (sen/o - muzari)"
              : "يَـ (o - muzari)",
        };
      }
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

  // 0.5. KURAL 4 KESİN KORUMA: "حَسَناً" (tamam, peki, pekâlâ) — Asla "Hasan (Özel İsim)" ile karışmaz!
  if (
    (normalized === "حسنا" || normalized === "وحسنا" || normalized === "فحسنا") &&
    dictIndex.has("حسنا")
  ) {
    const hasananItem = dictIndex.get("حسنا")!;
    const prefRaw =
      normalized.startsWith("و") || normalized.startsWith("ف")
        ? normalized[0]
        : "";
    const prefObj = NOMINAL_PREFIX_RULES.find((p) => p.raw === prefRaw);
    return {
      item: hasananItem,
      originalWord: cleanedRaw,
      matchedStem: "حسنا",
      prefixLabel: prefObj?.label,
      morphologyNote: buildMorphologyNote(hasananItem, prefObj?.label),
      matchStage: prefRaw ? "affix" : "exact",
    };
  }

  const isDefinitelyVerb = hasDefiniteVerbMarker(cleanedRaw, prevWordAr);

  // 0.6. KURAL 1.3 KESİN AYRIM: "أَقُلْ / نَقُلْ / تَقُلْ / يَقُلْ / قُلْ" (قَالَ: söylemek) vs "أَقَلُّ" (daha az)
  if (
    (normalized === "اقل" ||
      normalized === "نقل" ||
      normalized === "تقل" ||
      normalized === "يقل" ||
      normalized === "قل") &&
    (normalized !== "اقل" || isQalaJussiveOrImperative(cleanedRaw, prevWordAr))
  ) {
    const qalaItem =
      unifiedDictionary.find((d) => d.id === "supp_qala_fiil") ||
      dictIndex.get("قال");
    if (qalaItem && (!/نَقْل/.test(cleanedRaw) || isDefinitelyVerb)) {
      const pNote =
        normalized === "اقل"
          ? "أَ (ben - muzari meczum)"
          : normalized === "نقل"
          ? "نَـ (biz - muzari meczum)"
          : normalized === "تقل"
          ? "تَـ (sen/o - muzari meczum)"
          : normalized === "يقل"
          ? "يَـ (o - muzari meczum)"
          : "Emir Fiil (فعل أمر — Sen söyle!)";
      return {
        item: qalaItem,
        originalWord: cleanedRaw,
        matchedStem: "قال",
        morphologyNote: buildMorphologyNote(qalaItem, undefined, undefined, pNote),
        matchStage: "verb",
      };
    }
  }

  // 0.65. KURAL 3-B: Mehmûzü'l-Fâ Fiiller (أَخَذَ ve أَكَلَ) için "آ" (أَ + أْ) Muzari ve "خُذْ / كُلْ" Emir Kuralı
  const akhadhaMatch = normalized.match(
    /^(و|ف)?(س|ل)?(اخذ|تاخذ|ناخذ|ياخذ|خذ)(ي|ك|ه|ها|نا|كم|هم|وا|ون|ين|ان|ت|تم)?$/
  );
  if (akhadhaMatch && !isDefinitelyNoun) {
    const conjPref = akhadhaMatch[1] || "";
    const modalPref = akhadhaMatch[2] || "";
    const verbCore = akhadhaMatch[3];
    const suffRaw = akhadhaMatch[4] || "";
    const akhadhaItem =
      unifiedDictionary.find((d) => d.id === "supp_akhadha_fiil") ||
      dictIndex.get("اخذ");
    if (akhadhaItem) {
      const startsWithMadda = /^(وَ|فَ)?(سَ)?آ/.test(cleanedRaw);
      const isImpKhudh = verbCore === "خذ";
      const pLabels: string[] = [];
      if (conjPref === "و") pLabels.push("وَ (ve)");
      if (conjPref === "ف") pLabels.push("فَـ (böylece)");
      if (modalPref === "س") pLabels.push("سَـ (gelecek zaman -ecek)");
      if (modalPref === "ل") pLabels.push("لِـ (istek / emir eki: -elim, -alım)");
      const prefLabel = pLabels.length > 0 ? pLabels.join(" + ") : undefined;

      const suffObj = SUFFIX_RULES.find((s) => s.raw === suffRaw);
      const sLabel = suffObj
        ? getSuffixDisplayLabel(suffObj, akhadhaItem, isImpKhudh)
        : undefined;

      let extraNote: string | undefined;
      if (isImpKhudh) {
        extraNote = "Emir Fiil (فعل أمر — Sen al!)";
      } else if (
        startsWithMadda ||
        (verbCore === "اخذ" && (modalPref === "س" || /\u064F/.test(cleanedRaw)))
      ) {
        extraNote = "أَ (ben - muzari: أَ + أْ → آ)";
      } else if (verbCore === "ناخذ") {
        extraNote = "نَـ (biz - muzari)";
      } else if (verbCore === "تاخذ") {
        extraNote = "تَـ (sen/o - muzari)";
      } else if (verbCore === "ياخذ") {
        extraNote = "يَـ (o/onlar - muzari)";
      }

      return {
        item: akhadhaItem,
        originalWord: cleanedRaw,
        matchedStem: "اخذ",
        prefixLabel: prefLabel,
        suffixLabel: sLabel,
        morphologyNote: buildMorphologyNote(
          akhadhaItem,
          prefLabel,
          sLabel,
          extraNote
        ),
        matchStage: "verb",
      };
    }
  }

  const akalaMatch = normalized.match(
    /^(و|ف)?(س|ل)?(اكل|تاكل|ناكل|ياكل)(ي|ك|ه|ها|نا|كم|هم|وا|ون|ين|ان|ا|ت|تنا|تم)?$/
  );
  if (akalaMatch && !isDefinitelyNoun && !/كِل/.test(cleanedRaw)) {
    const conjPref = akalaMatch[1] || "";
    const modalPref = akalaMatch[2] || "";
    const verbCore = akalaMatch[3];
    const suffRaw = akalaMatch[4] || "";
    const akalaItem =
      unifiedDictionary.find((d) => d.id === "supp_akala_fiil") ||
      dictIndex.get("اكل");
    if (akalaItem) {
      const startsWithMadda = /^(وَ|فَ)?(سَ)?آ/.test(cleanedRaw);
      const pLabels: string[] = [];
      if (conjPref === "و") pLabels.push("وَ (ve)");
      if (conjPref === "ف") pLabels.push("فَـ (böylece)");
      if (modalPref === "س") pLabels.push("سَـ (gelecek zaman -ecek)");
      if (modalPref === "ل") pLabels.push("لِـ (istek / emir eki: -elim, -alım)");
      const prefLabel = pLabels.length > 0 ? pLabels.join(" + ") : undefined;

      let sLabel: string | undefined;
      if (suffRaw === "تنا") {
        sLabel = "تْ (o [مؤنث]) + نَا (bizi)";
      } else if (suffRaw === "ا" && verbCore === "تاكل") {
        sLabel = "ا (ikiniz - tesniye muzari)";
      } else if (suffRaw) {
        const suffObj = SUFFIX_RULES.find((s) => s.raw === suffRaw);
        sLabel = suffObj ? getSuffixDisplayLabel(suffObj, akalaItem) : undefined;
      }

      let extraNote: string | undefined;
      if (
        startsWithMadda ||
        (verbCore === "اكل" && (modalPref === "س" || /ك\u064F/.test(cleanedRaw)))
      ) {
        extraNote = "أَ (ben - muzari: أَ + أْ → آ)";
      } else if (verbCore === "ناكل") {
        extraNote = "نَـ (biz - muzari)";
      } else if (verbCore === "تاكل") {
        extraNote = "تَـ (sen/siz - muzari)";
      } else if (verbCore === "ياكل") {
        extraNote = "يَـ (o/onlar - muzari)";
      }

      return {
        item: akalaItem,
        originalWord: cleanedRaw,
        matchedStem: "اكل",
        prefixLabel: prefLabel,
        suffixLabel: sLabel,
        morphologyNote: buildMorphologyNote(
          akalaItem,
          prefLabel,
          sLabel,
          extraNote
        ),
        matchStage: "verb",
      };
    }
  }

  // 0.7. KURAL 2.1 KESİN AYRIM: "فَكُلُّ / كُلُّ / كُلَّ / كُلِّ / كُلُّهَا" (her, bütün, hepsi) vs "كُلْ / وَكُلِ" (ye! - أَكَلَ)
  const kullMatch = normalized.match(
    /^(و|ف|ب|ل|ك)?كل(ه|ها|هم|هن|هما|نا|كم|كن|كما)?$/
  );
  if (kullMatch) {
    const prefRaw = kullMatch[1] || "";
    const suffRaw = kullMatch[2] || "";
    const isImperativeEat =
      !suffRaw &&
      !/\u0651/.test(cleanedRaw) &&
      (/\u0652$/.test(cleanedRaw) ||
        /^(وَ|فَ)?كُلِ$/.test(cleanedRaw) ||
        (contextSentenceTr && /\b(ye|yiyin|yemek)\b/i.test(contextSentenceTr)));

    if (isImperativeEat) {
      const akalaItem =
        unifiedDictionary.find((d) => d.id === "supp_akala_fiil") ||
        dictIndex.get("اكل");
      if (akalaItem) {
        const prefObj = NOMINAL_PREFIX_RULES.find((p) => p.raw === prefRaw);
        return {
          item: akalaItem,
          originalWord: cleanedRaw,
          matchedStem: "اكل",
          prefixLabel: prefObj?.label,
          morphologyNote: buildMorphologyNote(
            akalaItem,
            prefObj?.label,
            undefined,
            "Emir Fiil (فعل أمر — Sen ye!)"
          ),
          matchStage: "verb",
        };
      }
    } else {
      const kullItem =
        unifiedDictionary.find((d) => d.id === "supp_kull_isim") ||
        dictIndex.get("كل");
      if (kullItem) {
        const prefObj = NOMINAL_PREFIX_RULES.find((p) => p.raw === prefRaw);
        const suffObj = SUFFIX_RULES.find((s) => s.raw === suffRaw);
        const sLabel = suffObj
          ? getSuffixDisplayLabel(suffObj, kullItem)
          : undefined;
        return {
          item: kullItem,
          originalWord: cleanedRaw,
          matchedStem: "كل",
          prefixLabel: prefObj?.label,
          suffixLabel: sLabel,
          morphologyNote: buildMorphologyNote(
            kullItem,
            prefObj?.label,
            sLabel
          ),
          matchStage: prefRaw || suffRaw ? "affix" : "exact",
        };
      }
    }
  }

  // 0.8. KURAL 2.2 KESİN AYRIM: "جِدّاً" (çok, oldukça) vs "جَدّ" (dede, büyükbaba)
  if (
    normalized === "جدا" ||
    normalized === "وجدا" ||
    normalized === "فجدا" ||
    (/جِ/.test(cleanedRaw) && /^(و|ف)?جد/.test(normalized))
  ) {
    const jiddanItem =
      unifiedDictionary.find((d) => d.id === "supp_jiddan_edat") ||
      dictIndex.get("جدا");
    if (jiddanItem) {
      return {
        item: jiddanItem,
        originalWord: cleanedRaw,
        matchedStem: "جدا",
        morphologyNote: buildMorphologyNote(jiddanItem),
        matchStage: "exact",
      };
    }
  }

  // 0.9. KURAL 2.3 KESİN AYRIM: "عَبْرَ" (üzerinden, aracılığıyla) vs "عَبَرَ" (karşıya geçmek)
  if (normalized === "عبر" || normalized === "وعبر" || normalized === "فعبر") {
    const hasSukunOnBa = /ب\u0652/.test(cleanedRaw);
    const hasFathaOnBa = /ب\u064E/.test(cleanedRaw);
    const trHasVia =
      contextSentenceTr &&
      /üzerinden|aracılığıyla|yoluyla|internetten|vasıtasıyla/i.test(
        contextSentenceTr
      );
    if (hasSukunOnBa || (trHasVia && !hasFathaOnBa)) {
      const abraItem =
        unifiedDictionary.find((d) => d.id === "supp_abra_edat") ||
        dictIndex.get("عبر");
      if (abraItem) {
        return {
          item: abraItem,
          originalWord: cleanedRaw,
          matchedStem: "عبر",
          morphologyNote: buildMorphologyNote(abraItem),
          matchStage: "exact",
        };
      }
    }
  }

  // 0.95. KURAL 2.4 KESİN AYRIM: "الْبَرِيدِ / بَرِيد" (posta) vs "بَرِيد إِلِكْتُرُونِيّ" (e-posta)
  const baridMatch = normalized.match(/^(و|ف|ب|ل|ك|ال|وال|بال|لل|ولل)?بريد$/);
  if (
    baridMatch &&
    !(contextSentenceTr && /e-posta|elektronik posta|email/i.test(contextSentenceTr))
  ) {
    const baridItem = unifiedDictionary.find(
      (d) => d.id === "supp_barid_posta"
    );
    if (baridItem) {
      const prefRaw = baridMatch[1] || "";
      const prefObj = NOMINAL_PREFIX_RULES.find((p) => p.raw === prefRaw);
      return {
        item: baridItem,
        originalWord: cleanedRaw,
        matchedStem: "بريد",
        prefixLabel: prefObj?.label,
        morphologyNote: buildMorphologyNote(baridItem, prefObj?.label),
        matchStage: prefRaw ? "affix" : "exact",
      };
    }
  }

  // 0.96. KURAL 2.1-A: KAPALI SINIF KORUMASI — "لَيْسَ" ve Tüm Şahıs Çekimleri (لَيْسَ، لَيْسَتْ، لَسْتُ، لَسْتَ، لَسْتِ، لَسْنَا، لَسْتُمْ، أَلَيْسَ، أَلَسْتُمْ...)
  // Asla başındaki "لَ" harf-i cer sanılıp "سِتَّة" (6) sayısına gitmez!
  const laysaMatch = normalized.match(
    /^(و|ف)?(اليس|اليست|الست|الستم|الستما|الستن|السنا|ليس|ليست|ليسوا|لسن|لست|لستم|لستما|لستن|لسنا)$/
  );
  if (laysaMatch && !/^(وَ|فَ)?لِسِ/.test(cleanedRaw)) {
    const conjPref = laysaMatch[1] || "";
    const coreForm = laysaMatch[2];
    const laysaItem =
      unifiedDictionary.find((d) => d.id === "supp_laysa") ||
      dictIndex.get("ليس");
    if (laysaItem) {
      const prefLabel =
        conjPref === "و"
          ? "وَ (ve)"
          : conjPref === "ف"
          ? "فَـ (böylece)"
          : undefined;
      const hasInterrogative = coreForm.startsWith("ا");
      const baseLaysa = hasInterrogative ? coreForm.slice(1) : coreForm;
      let personNote: string | undefined;
      if (baseLaysa === "ليست") personNote = "تْ (o [مؤنث] değil)";
      else if (baseLaysa === "لست") {
        if (/تِ$/.test(cleanedRaw)) personNote = "تِ (sen [مؤنث] değilsin)";
        else if (/تَ$/.test(cleanedRaw)) personNote = "تَ (sen [مذكر] değilsin)";
        else personNote = "تُ / تَ / تِ (ben değilim / sen değilsin)";
      } else if (baseLaysa === "لستم") personNote = "تُمْ (siz değilsiniz)";
      else if (baseLaysa === "لستما") personNote = "تُمَا (ikiniz değilsiniz)";
      else if (baseLaysa === "لستن") personNote = "تُنَّ (siz [مؤنث] değilsiniz)";
      else if (baseLaysa === "لسنا") personNote = "نَا (biz değiliz)";
      else if (baseLaysa === "ليسوا") personNote = "وا (onlar değiller)";
      else if (baseLaysa === "لسن") personNote = "نَ (onlar [مؤنث] değiller)";

      const combinedExtra = [
        hasInterrogative ? "أَ (soru hemzesi: değil mi?)" : undefined,
        personNote,
      ]
        .filter(Boolean)
        .join(" + ");

      return {
        item: laysaItem,
        originalWord: cleanedRaw,
        matchedStem: "ليس",
        prefixLabel: prefLabel,
        morphologyNote: buildMorphologyNote(
          laysaItem,
          prefLabel,
          undefined,
          combinedExtra || undefined
        ),
        matchStage: conjPref || combinedExtra ? "affix" : "exact",
      };
    }
  }

  // 0.97. KURAL 2.1-B: KAPALI SINIF KORUMASI — İsm-i Mevsuller (اَلَّذِي، اَلَّتِي، اَلَّذِينَ، اَللَّذَانِ، اَللَّتَانِ)
  // Asla sondaki "ي" iyelik zamiri diye soyulup "أَلَذُّ" (daha lezzetli) kelimesine gitmez!
  const relativeMatch = normalized.match(
    /^(و|ف|ب|ل|ك|وب|فب|ول|فل)?(الذي|التي|الذين|اللذان|اللذين|اللتان|اللتين|اللواتي|اللائي)$/
  );
  if (relativeMatch) {
    const prefRaw = relativeMatch[1] || "";
    const relCore = relativeMatch[2];
    const relItem =
      unifiedDictionary.find((d) => d.id === "supp_alladhi_edat") ||
      dictIndex.get("الذي");
    if (relItem) {
      const prefObj = NOMINAL_PREFIX_RULES.find((p) => p.raw === prefRaw);
      const genderNote =
        relCore === "التي"
          ? "مفرد مؤنث (tekil dişil ism-i mevsul)"
          : relCore === "الذين"
          ? "جمع مذكر (çoğul eril ism-i mevsul)"
          : relCore === "اللذان" || relCore === "اللذين"
          ? "مثنى مذكر (ikil eril ism-i mevsul)"
          : relCore === "اللتان" || relCore === "اللتين"
          ? "مثنى مؤنث (ikil dişil ism-i mevsul)"
          : undefined;
      return {
        item: relItem,
        originalWord: cleanedRaw,
        matchedStem: relCore,
        prefixLabel: prefObj?.label,
        morphologyNote: buildMorphologyNote(
          relItem,
          prefObj?.label,
          undefined,
          genderNote
        ),
        matchStage: prefRaw ? "affix" : "exact",
      };
    }
  }

  // 0.98. KURAL 2.2 KESİN KORUMA: "مِثْل" (gibi, benzer: مِثْلِي، مِثْلُكَ، مِثْلُكِ، مِثْلَ، مِثْلُهُ، كَمِثْلِ) vs "مَثَّلَ" (temsil etmek)
  const mithlMatch = normalized.match(
    /^(و|ف|ب|ك|ل)?مثل(ي|ك|ه|ها|نا|كم|كن|هم|هن|هما|كما)?$/
  );
  if (mithlMatch && !/ث\u0651/.test(cleanedRaw)) {
    const prefRaw = mithlMatch[1] || "";
    const suffRaw = mithlMatch[2] || "";
    const mithlItem =
      unifiedDictionary.find((d) => d.id === "supp_mithl_edat") ||
      dictIndex.get("مثل");
    if (mithlItem) {
      const prefObj = NOMINAL_PREFIX_RULES.find((p) => p.raw === prefRaw);
      const suffObj = SUFFIX_RULES.find((s) => s.raw === suffRaw);
      const sLabel = suffObj
        ? getSuffixDisplayLabel(suffObj, mithlItem)
        : undefined;
      return {
        item: mithlItem,
        originalWord: cleanedRaw,
        matchedStem: "مثل",
        prefixLabel: prefObj?.label,
        suffixLabel: sLabel,
        morphologyNote: buildMorphologyNote(
          mithlItem,
          prefObj?.label,
          sLabel
        ),
        matchStage: prefRaw || suffRaw ? "affix" : "exact",
      };
    }
  }

  // 0.99. KURAL 2.5 & 2.6: "إِذَنْ" (o hâlde, öyleyse) vs "إِذْن" (izin) VE "يَا تُرَى" (acaba) vs "رَأَى" (görmek)
  if (normalized === "اذن" || normalized === "واذن" || normalized === "فاذن") {
    const hasSukunOnDhal = /ذ\u0652/.test(cleanedRaw);
    const prevClean = prevWordAr ? cleanArabicText(prevWordAr) : "";
    const isPermissionContext =
      hasSukunOnDhal ||
      prevClean === "عن" ||
      prevClean === "بعد" ||
      (contextSentenceTr && /\b(izin|iznin|müsaade)\b/i.test(contextSentenceTr));
    const targetId = isPermissionContext ? "supp_idhn_isim" : "supp_idhan_edat";
    const idhanOrIdhnItem = unifiedDictionary.find((d) => d.id === targetId);
    if (idhanOrIdhnItem) {
      const prefRaw =
        normalized.startsWith("و") || normalized.startsWith("ف")
          ? normalized[0]
          : "";
      const prefObj = NOMINAL_PREFIX_RULES.find((p) => p.raw === prefRaw);
      return {
        item: idhanOrIdhnItem,
        originalWord: cleanedRaw,
        matchedStem: "اذن",
        prefixLabel: prefObj?.label,
        morphologyNote: buildMorphologyNote(idhanOrIdhnItem, prefObj?.label),
        matchStage: prefRaw ? "affix" : "exact",
      };
    }
  }

  if (normalized === "تري") {
    const prevClean = prevWordAr ? cleanArabicText(prevWordAr) : "";
    const hasDammaOnTa = /ت\u064F/.test(cleanedRaw);
    const trHasAcaba =
      contextSentenceTr && /\b(acaba|dersin)\b/i.test(contextSentenceTr);
    if (hasDammaOnTa || prevClean === "يا" || trHasAcaba) {
      const yaTuraItem = unifiedDictionary.find(
        (d) => d.id === "supp_ya_tura_edat" || d.id === "supp_yatura_edat"
      );
      if (yaTuraItem) {
        return {
          item: yaTuraItem,
          originalWord: cleanedRaw,
          matchedStem: "تري",
          morphologyNote: buildMorphologyNote(yaTuraItem),
          matchStage: "exact",
        };
      }
    }
  }

  // 0.992. KURAL 3.1: HARF-İ CER + BİTİŞİK ZAMİR KORUMASI (بِكُمْ، بِكَ، بِكِ، لَكُمْ، لَكَ، عَنْكَ، مِنْكُمْ، إِلَيْكَ، عَلَيْكُمْ، فِيهِ، مَعَكُمْ، مَعَنَا)
  // Asla "بِـ" soyulup "كُمّ" (elbise kolu) ile eşleşmez!
  const biPronounMatch = normalized.match(
    /^(و|ف)?(بكم|بك|بكما|بي|بنا|به|بها|بهم|بهما)$/
  );
  if (biPronounMatch) {
    const conjPref = biPronounMatch[1] || "";
    const coreBi = biPronounMatch[2];
    const isBikamQuestion =
      coreBi === "بكم" &&
      (/بِكَمْ/.test(cleanedRaw) ||
        (/ك\u064E/.test(cleanedRaw) && !/ك\u064F/.test(cleanedRaw)) ||
        (!/ك\u064F/.test(cleanedRaw) &&
          Boolean(
            contextSentenceTr &&
              /\b(kaça|kaç lira|fiyatı ne|ne kadar)\b/i.test(contextSentenceTr)
          )));
    const targetBiId = isBikamQuestion ? "supp_bikam_kam_edat" : "supp_bikum_edat";
    const biItem = unifiedDictionary.find((d) => d.id === targetBiId);
    if (biItem) {
      const prefObj = NOMINAL_PREFIX_RULES.find((p) => p.raw === conjPref);
      return {
        item: biItem,
        originalWord: cleanedRaw,
        matchedStem: coreBi,
        prefixLabel: prefObj?.label,
        morphologyNote: buildMorphologyNote(biItem, prefObj?.label),
        matchStage: conjPref ? "affix" : "exact",
      };
    }
  }

  const liPronounMatch = normalized.match(
    /^(و|ف)?(لكم|لك|لكما|لي|لنا|له|لها|لهم|لهما)$/
  );
  if (liPronounMatch) {
    const conjPref = liPronounMatch[1] || "";
    const coreLi = liPronounMatch[2];
    const liItem = unifiedDictionary.find((d) => d.id === "supp_lakum_edat");
    if (liItem) {
      const prefObj = NOMINAL_PREFIX_RULES.find((p) => p.raw === conjPref);
      return {
        item: liItem,
        originalWord: cleanedRaw,
        matchedStem: coreLi,
        prefixLabel: prefObj?.label,
        morphologyNote: buildMorphologyNote(liItem, prefObj?.label),
        matchStage: conjPref ? "affix" : "exact",
      };
    }
  }

  const otherPrepPronounMatch = normalized.match(
    /^(و|ف)?(عنك|عنكم|عنكما|عنه|عنها|عنهم|عني|عنا|منك|منكم|منكما|منه|منها|منهم|مني|منا|اليك|اليكم|اليكما|اليه|اليها|اليهم|الينا|عليك|عليكم|عليكما|عليه|عليها|عليهم|علينا|فيه|فيها|فيهم|فيك|فيكم|فينا)$/
  );
  if (otherPrepPronounMatch) {
    const conjPref = otherPrepPronounMatch[1] || "";
    const corePrep = otherPrepPronounMatch[2];
    const targetPrepId = corePrep.startsWith("عن")
      ? "supp_3ankum_edat"
      : corePrep.startsWith("من")
      ? "supp_minkum_edat"
      : corePrep.startsWith("الي")
      ? "supp_ilaykum_edat"
      : corePrep.startsWith("علي")
      ? "supp_3alaykum_edat"
      : "supp_fihim_edat";
    const prepItem = unifiedDictionary.find((d) => d.id === targetPrepId);
    if (prepItem) {
      const prefObj = NOMINAL_PREFIX_RULES.find((p) => p.raw === conjPref);
      return {
        item: prepItem,
        originalWord: cleanedRaw,
        matchedStem: corePrep,
        prefixLabel: prefObj?.label,
        morphologyNote: buildMorphologyNote(prepItem, prefObj?.label),
        matchStage: conjPref ? "affix" : "exact",
      };
    }
  }

  const maaPronounMatch = normalized.match(
    /^(و|ف)?(مع|معا|معك|معكم|معكما|معنا|معي|معه|معها|معهم)$/
  );
  if (maaPronounMatch) {
    const conjPref = maaPronounMatch[1] || "";
    const coreMaa = maaPronounMatch[2];
    const maaItem = unifiedDictionary.find((d) => d.id === "supp_maa_edat");
    if (maaItem) {
      const prefObj = NOMINAL_PREFIX_RULES.find((p) => p.raw === conjPref);
      const suffRaw = coreMaa.slice(2);
      const suffObj =
        suffRaw && suffRaw !== "ا"
          ? SUFFIX_RULES.find((s) => s.raw === suffRaw)
          : undefined;
      const sLabel = suffObj
        ? getSuffixDisplayLabel(suffObj, maaItem)
        : undefined;
      return {
        item: maaItem,
        originalWord: cleanedRaw,
        matchedStem: "مع",
        prefixLabel: prefObj?.label,
        suffixLabel: sLabel,
        morphologyNote: buildMorphologyNote(maaItem, prefObj?.label, sLabel),
        matchStage: conjPref || sLabel ? "affix" : "exact",
      };
    }
  }

  // 0.994. KURAL 3.2: "نَفْس" ("aynı / kendi, öz, zat" — ف harfi cezimli) vs "نَفَس" ("nefes, soluk" — ف harfi fethalı) AYRIMI
  const nafsMatch = normalized.match(
    /^(و|ف|ب|ل|ك|وب|فب|ول|فل|ال|وال|بال|لل)?نفس(ي|ك|ه|ها|نا|كم|كن|هم|هن|هما|كما)?$/
  );
  if (nafsMatch) {
    const prefRaw = nafsMatch[1] || "";
    const suffRaw = nafsMatch[2] || "";
    const hasExplicitFathaOnFa = /ف\u064E/.test(cleanedRaw);
    const trHasBreath =
      contextSentenceTr && /\b(nefes|soluk)\b/i.test(contextSentenceTr);
    if (!hasExplicitFathaOnFa || !trHasBreath) {
      const nafsItem = unifiedDictionary.find((d) => d.id === "supp_nafs_isim");
      if (nafsItem) {
        const prefObj = NOMINAL_PREFIX_RULES.find((p) => p.raw === prefRaw);
        const suffObj = SUFFIX_RULES.find((s) => s.raw === suffRaw);
        const sLabel = suffObj
          ? getSuffixDisplayLabel(suffObj, nafsItem)
          : undefined;
        return {
          item: nafsItem,
          originalWord: cleanedRaw,
          matchedStem: "نفس",
          prefixLabel: prefObj?.label,
          suffixLabel: sLabel,
          morphologyNote: buildMorphologyNote(
            nafsItem,
            prefObj?.label,
            sLabel
          ),
          matchStage: prefRaw || suffRaw ? "affix" : "exact",
        };
      }
    }
  }

  // 0.996. KURAL 4.1 & 4.2: "أَسَتَكُونُ / سَتَكُونُ" (كَانَ) ve "لَمْ نَسْتَطِعِ / لَمْ أَسْتَطِعْ" (اِسْتَطَاعَ) KESİN ÇÖZÜMLEMESİ
  const kanaCompoundMatch = normalized.match(
    /^(و|ف)?(اس|اف|او|س)?(تكون|يكون|اكون|نكون|تكن|يكن|اكن|نكن)(ون|ين|ان)?$/
  );
  if (kanaCompoundMatch && !isDefinitelyNoun) {
    const conjPref = kanaCompoundMatch[1] || "";
    const modalPref = kanaCompoundMatch[2] || "";
    const verbCore = kanaCompoundMatch[3];
    const suffRaw = kanaCompoundMatch[4] || "";
    const kanaItem =
      unifiedDictionary.find((d) => d.id === "supp_kana_fiil") ||
      dictIndex.get("كان");
    if (kanaItem) {
      const prefObj = PREFIX_RULES.find((p) => p.raw === (conjPref + modalPref || modalPref || conjPref));
      const suffObj = SUFFIX_RULES.find((s) => s.raw === suffRaw);
      const sLabel = suffObj ? getSuffixDisplayLabel(suffObj, kanaItem) : undefined;
      const personNote = verbCore.startsWith("ت")
        ? "تَـ (sen/o - muzari)"
        : verbCore.startsWith("ي")
        ? "يَـ (o/onlar - muzari)"
        : verbCore.startsWith("ن")
        ? "نَـ (biz - muzari)"
        : "أَ (ben - muzari)";
      return {
        item: kanaItem,
        originalWord: cleanedRaw,
        matchedStem: "كان",
        prefixLabel: prefObj?.label,
        suffixLabel: sLabel,
        morphologyNote: buildMorphologyNote(
          kanaItem,
          prefObj?.label,
          sLabel,
          personNote
        ),
        matchStage: "verb",
      };
    }
  }

  const istataaJussiveMatch = normalized.match(
    /^(و|ف)?(س)?(نستطع|استطع|تستطع|يستطع|نستطيع|استطيع|تستطيع|يستطيع)(ون|ين|ان|وا|ي)?$/
  );
  if (istataaJussiveMatch && !isDefinitelyNoun) {
    const conjPref = istataaJussiveMatch[1] || "";
    const modalPref = istataaJussiveMatch[2] || "";
    const verbCore = istataaJussiveMatch[3];
    const suffRaw = istataaJussiveMatch[4] || "";
    const istataaItem = unifiedDictionary.find(
      (d) => d.id === "supp_istataa_fiil"
    );
    if (istataaItem) {
      const prefObj = PREFIX_RULES.find(
        (p) => p.raw === (conjPref + modalPref || modalPref || conjPref)
      );
      const suffObj = SUFFIX_RULES.find((s) => s.raw === suffRaw);
      const sLabel = suffObj
        ? getSuffixDisplayLabel(suffObj, istataaItem)
        : undefined;
      const isJussiveShortened = !verbCore.includes("طيع");
      const personNote = verbCore.startsWith("ن")
        ? isJussiveShortened
          ? "نَـ (biz - muzari meczum: ي harfi cezm ile düştü)"
          : "نَـ (biz - muzari)"
        : verbCore.startsWith("ت")
        ? isJussiveShortened
          ? "تَـ (sen/o - muzari meczum)"
          : "تَـ (sen/o - muzari)"
        : verbCore.startsWith("ي")
        ? isJussiveShortened
          ? "يَـ (o - muzari meczum)"
          : "يَـ (o/onlar - muzari)"
        : isJussiveShortened
        ? "أَ (ben - muzari meczum: ي harfi cezm ile düştü)"
        : "أَ (ben - muzari)";
      return {
        item: istataaItem,
        originalWord: cleanedRaw,
        matchedStem: "استطاع",
        prefixLabel: prefObj?.label,
        suffixLabel: sLabel,
        morphologyNote: buildMorphologyNote(
          istataaItem,
          prefObj?.label,
          sLabel,
          personNote
        ),
        matchStage: "verb",
      };
    }
  }

  // 0.998. KURAL 1.1: "أَوَّلاً / أَوَّلُ / بِأَوَّلِ / الْأُولَى" (ilk, birinci; önce) vs "أَوَلَا" (... değil mi? / bilmez miyim?) KESİN AYRIMI
  const awwalMatch = normalized.match(
    /^(و|ف|ب|ل|ك|وب|فب|ول|فل|ال|وال|بال|لل)?(اول|اولا|اولي|اوائل)$/
  );
  if (awwalMatch) {
    const prefRaw = awwalMatch[1] || "";
    const coreAwwal = awwalMatch[2];
    const hasShaddaOrTanwin = /[\u0651\u064B]/.test(cleanedRaw);
    const isInterrogativeAwala =
      !prefRaw &&
      coreAwwal === "اولا" &&
      !hasShaddaOrTanwin &&
      (/أَوَلَا/.test(cleanedRaw) ||
        Boolean(
          contextSentenceTr &&
            /bilmez miyim|değil mi/i.test(contextSentenceTr)
        ));

    if (isInterrogativeAwala) {
      const awalaItem = unifiedDictionary.find(
        (d) => d.id === "supp_awala_ala_edat"
      );
      if (awalaItem) {
        return {
          item: awalaItem,
          originalWord: cleanedRaw,
          matchedStem: "اولا",
          morphologyNote: buildMorphologyNote(awalaItem),
          matchStage: "exact",
        };
      }
    } else {
      const awwalItem = unifiedDictionary.find(
        (d) => d.id === "supp_awwal_isim"
      );
      if (awwalItem) {
        const prefObj = NOMINAL_PREFIX_RULES.find((p) => p.raw === prefRaw);
        return {
          item: awwalItem,
          originalWord: cleanedRaw,
          matchedStem: coreAwwal,
          prefixLabel: prefObj?.label,
          morphologyNote: buildMorphologyNote(awwalItem, prefObj?.label),
          matchStage: prefRaw ? "affix" : "exact",
        };
      }
    }
  }

  // 0.999. KURAL 3 & KURAL 5: Onluk/Yüzlük Sayılar (20..90, 300..500) ve "كَرِيم" (Özel İsim vs الْكَرِيم Sıfat) Koruması
  const tensOrHundredsMatch = normalized.match(
    /^(و|ف|ب|ل|ك|وب|فب|ول|فل|ال|وال|بال|لل)?(عشرون|عشرين|ثلاثون|ثلاثين|اربعون|اربعين|خمسون|خمسين|ستون|ستين|سبعون|سبعين|ثمانون|ثمانين|تسعون|تسعين|ثلاثمئه|ثلاثمائه|اربعمئه|اربعمائه|خمسمئه|خمسمائه)$/
  );
  if (tensOrHundredsMatch) {
    const prefRaw = tensOrHundredsMatch[1] || "";
    const numCore = tensOrHundredsMatch[2];
    const numItem = dictIndex.get(numCore);
    if (numItem) {
      const prefObj = NOMINAL_PREFIX_RULES.find((p) => p.raw === prefRaw);
      return {
        item: numItem,
        originalWord: cleanedRaw,
        matchedStem: numCore,
        prefixLabel: prefObj?.label,
        morphologyNote: buildMorphologyNote(numItem, prefObj?.label),
        matchStage: prefRaw ? "affix" : "exact",
      };
    }
  }

  // "كَرِيمٌ" (Özel İsim: مَرْحَباً يَا كَرِيمُ) vs "الْكَرِيمُ" (Sıfat: cömert, değerli)
  const karimMatch = normalized.match(
    /^(و|ف|ب|ل|ك|ال|وال|بال|لل)?كريم$/
  );
  if (karimMatch) {
    const prefRaw = karimMatch[1] || "";
    const hasAl = prefRaw.includes("ال") || prefRaw === "لل";
    const prevClean = prevWordAr ? cleanArabicText(prevWordAr) : "";
    const trHasKerim =
      contextSentenceTr && /\bkerim\b/i.test(contextSentenceTr);
    if (!hasAl && (prevClean === "يا" || trHasKerim)) {
      const karimProper: DictionaryItem =
        unifiedDictionary.find((d) => d.id === "prop_karim") || {
          id: "prop_karim",
          tur: "ozel-isim",
          kok: "ك ر م",
          mufret: "كَرِيمٌ",
          cemi: "-",
          anlam_tr: "Kerim (Özel İsim / Erkek İsmi)",
        };
      const prefObj = NOMINAL_PREFIX_RULES.find((p) => p.raw === prefRaw);
      return {
        item: karimProper,
        originalWord: cleanedRaw,
        matchedStem: "كريم",
        prefixLabel: prefObj?.label,
        morphologyNote: buildMorphologyNote(karimProper, prefObj?.label),
        matchStage: prefRaw ? "affix" : "exact",
      };
    } else if (hasAl) {
      const karimAdj =
        unifiedDictionary.find(
          (d) =>
            getWordCategory(d) === "isim" &&
            cleanArabicText(d.mufret || "") === "كريم"
        ) || {
          id: "supp_karim_sifat",
          tur: "isim",
          kok: "ك ر م",
          mufret: "كَرِيمٌ",
          cemi: "كِرَامٌ / كُرَمَاءُ",
          anlam_tr: "cömert, kerim, değerli, asil",
        };
      const prefObj = NOMINAL_PREFIX_RULES.find((p) => p.raw === prefRaw);
      return {
        item: karimAdj,
        originalWord: cleanedRaw,
        matchedStem: "كريم",
        prefixLabel: prefObj?.label,
        morphologyNote: buildMorphologyNote(karimAdj, prefObj?.label),
        matchStage: "affix",
      };
    }
  }

  // Kademe 1: Doğrudan Eşleşme (Önce İsim / Tam Eşleşme - Bağlam & Hareke Puanlamalı)
  const directNominal = matchNominalOrExactStem(
    normalized,
    cleanedRaw,
    contextSentenceTr,
    isDefinitelyNoun,
    isDefinitelyVerb
  );
  if (directNominal) {
    const isImp =
      !isDefinitelyVerb &&
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
    // KURAL 2 ÖNCELİĞİ: Yuvarlak Tâ (ة -> ت) + İyelik Zamiri Kuralı (تَذْكِرَتَكَ -> تَذْكِرَة, غُرْفَتِكُمْ -> غُرْفَة, مَعْرِفَتِكَ -> مَعْرِفَة)
    // "verbOnly: true" olan "تك / ته / تها" eklerinden ÖNCE iyelik zamirini soyup sondaki açık "ت" harfini "ة" (ه) olarak isimlerde ara!
    for (const poss of POSSESSIVE_PRONOUN_SUFFIXES) {
      if (
        normalized.endsWith(poss.raw) &&
        normalized.length - poss.raw.length >= 3
      ) {
        const stem = normalized.slice(0, -poss.raw.length);
        if (stem.endsWith("ت")) {
          const taMarbutaRestored = stem.slice(0, -1) + "ه";
          if (
            dictMultiIndex.has(taMarbutaRestored) ||
            dictIndex.has(taMarbutaRestored)
          ) {
            const bestNoun = pickBestCandidateForKey(
              taMarbutaRestored,
              cleanedRaw,
              contextSentenceTr,
              true
            );
            if (
              bestNoun &&
              (getWordCategory(bestNoun) !== "fiil" ||
                isItemMasdarForKey(bestNoun, taMarbutaRestored))
            ) {
              return {
                item: bestNoun,
                originalWord: cleanedRaw,
                matchedStem: taMarbutaRestored,
                suffixLabel: poss.nounLabel,
                morphologyNote: buildMorphologyNote(
                  bestNoun,
                  undefined,
                  poss.nounLabel,
                  "ت -> ة (Tâ-i Merbûta izafet dönüşümü)"
                ),
                matchStage: "ta-marbuta",
              };
            }
          }
        }
      }
    }

    for (const suff of SUFFIX_RULES) {
      if (suff.isNiswaVerbSuffix) {
        continue;
      }
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
          isDefinitelyNoun,
          Boolean(suff.verbOnly),
          Boolean(suff.isPronoun),
          Boolean(suff.isFeminineDual)
        );
        if (
          matchedNom &&
          (!suff.verbOnly || getWordCategory(matchedNom.item) === "fiil")
        ) {
          const isImp =
            getWordCategory(matchedNom.item) === "fiil" &&
            !isDefinitelyNoun &&
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

  // Kademe 2b: Sadece İsim/Bağlaç/Harf-i Cer Ön Eki Soyarak İsim/Tam Eşleşme
  // KURAL 1: NOMINAL_PREFIX_RULES içinde gelecek zaman "س / وس / فس" YOKTUR!
  // Böylece "وَسَمَكٌ" -> "وَ + سَمَكٌ" (balık) olarak çözümlenir; asla "وس + مك -> مكة" olmaz!
  for (const pref of NOMINAL_PREFIX_RULES) {
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

  // Kademe 2c: Hem Ön Ek (NOMINAL_PREFIX_RULES) Hem Son Ek Soyarak İsim/Tam Eşleşme
  if (!endsWithTaMarbuta) {
    for (const pref of NOMINAL_PREFIX_RULES) {
      if (normalized.startsWith(pref.raw)) {
        const afterPref = normalized.slice(pref.raw.length);
        const effectiveNounGuard =
          isDefinitelyNoun || Boolean(pref.makesDefiniteNoun);

        // KURAL 2 ÖNCELİĞİ: Ön ek + Yuvarlak Tâ (ة -> ت) + İyelik Zamiri (örn: بِمَعْرِفَتِكَ، لِغُرْفَتِكُمْ، وَتَذْكِرَتَكَ، وَرُؤْيَتَهَا)
        for (const poss of POSSESSIVE_PRONOUN_SUFFIXES) {
          if (
            afterPref.endsWith(poss.raw) &&
            afterPref.length - poss.raw.length >= 3
          ) {
            const stem = afterPref.slice(0, -poss.raw.length);
            if (stem.endsWith("ت")) {
              const taMarbutaRestored = stem.slice(0, -1) + "ه";
              if (
                dictMultiIndex.has(taMarbutaRestored) ||
                dictIndex.has(taMarbutaRestored)
              ) {
                const bestNoun = pickBestCandidateForKey(
                  taMarbutaRestored,
                  cleanedRaw,
                  contextSentenceTr,
                  true
                );
                if (
                  bestNoun &&
                  (getWordCategory(bestNoun) !== "fiil" ||
                    isItemMasdarForKey(bestNoun, taMarbutaRestored))
                ) {
                  return {
                    item: bestNoun,
                    originalWord: cleanedRaw,
                    matchedStem: taMarbutaRestored,
                    prefixLabel: pref.label,
                    suffixLabel: poss.nounLabel,
                    morphologyNote: buildMorphologyNote(
                      bestNoun,
                      pref.label,
                      poss.nounLabel,
                      "ت -> ة (Tâ-i Merbûta izafet dönüşümü)"
                    ),
                    matchStage: "ta-marbuta",
                  };
                }
              }
            }
          }
        }

        for (const suff of SUFFIX_RULES) {
          if (suff.isNiswaVerbSuffix) {
            continue;
          }
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
              effectiveNounGuard,
              Boolean(suff.verbOnly),
              Boolean(suff.isPronoun),
              Boolean(suff.isFeminineDual)
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

  // KURAL 1-C & KURAL 5: Kelime "ة" (Tâ-i Merbûta) ile bitiyorsa, kesin İSİM ALAMETİ (isDefinitelyNoun) taşıyorsa
  // veya İsm-i Tafdîl (أَفْعَلُ: أَخَفُّ، أَرْخَصُ، أَكْثَرُ vb.) kalıbındaysa ASLA fiil çekim çözümleyicisine (Kademe 3) girmez!
  const isBlockedByElative =
    ELATIVE_ISM_TAFDIL_SET.has(normalized) &&
    !isDefinitelyVerb &&
    !(normalized === "اقل" && isQalaJussiveOrImperative(cleanedRaw, prevWordAr));

  if (
    !endsWithTaMarbuta &&
    !isDefinitelyNoun &&
    !isBlockedByElative
  ) {
    // Kademe 3: Fiil Çekim Kuralları (Doğrudan, Ön Ekli, Son Ekli, Ön+Son Ekli)
    const directVerb = matchStemWithRules(
      normalized,
      cleanedRaw,
      false,
      contextSentenceTr,
      false,
      isDefinitelyVerb
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
        const isFutureSin =
          pref.raw === "س" ||
          pref.raw === "وس" ||
          pref.raw === "فس" ||
          pref.raw === "اس" ||
          pref.raw === "اف" ||
          pref.raw === "او";
        if (
          isFutureSin &&
          !canStripFutureSinPrefix(cleanedRaw, pref.raw, stem, isDefinitelyNoun)
        ) {
          continue;
        }
        const matched = matchStemWithRules(
          stem,
          cleanedRaw,
          false,
          contextSentenceTr,
          false
        );
        if (
          matched &&
          (!isFutureSin || getWordCategory(matched.item) === "fiil")
        ) {
          // KURAL 2.4: Muzari Fiillerde İstek / Emir Lâmı (لِـ / فَلْـ / وَلْـ : لِنَسْتَعْجِلْ، لِنَقِيسَ، وَلْنَقْتَنِ، فَلْيَأْتُوا)
          const isCohortativeLam =
            getWordCategory(matched.item) === "fiil" &&
            /^[انيت]/.test(stem) &&
            (pref.raw === "ل" || pref.raw === "ول" || pref.raw === "فل");
          const verbPrefixLabel = isCohortativeLam
            ? pref.raw === "ول"
              ? "وَ (ve) + لْـ / لِـ (istek / emir eki: -elim, -sin)"
              : pref.raw === "فل"
              ? "فَـ + لْـ / لِـ (istek / emir eki: -elim, -sin)"
              : "لِـ (istek / emir eki: -elim, -alım, -sin)"
            : pref.label;
          return {
            item: matched.item,
            originalWord: cleanedRaw,
            matchedStem: stem,
            prefixLabel: verbPrefixLabel,
            morphologyNote: buildMorphologyNote(
              matched.item,
              verbPrefixLabel,
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
        // KURAL 1.3: Cemî müennes "ن" (Nûnu'n-Nisve: يَفْتَحْنَ، يَضَعْنَ) yalnızca muzari (ي/ت) veya sükun+نَ (\u0652نَ) fiillerde soyulur
        if (
          suff.isNiswaVerbSuffix &&
          !/^[يت]/.test(stem) &&
          !/\u0652ن\u064E?$/.test(cleanedRaw)
        ) {
          continue;
        }
        const matched = matchStemWithRules(
          stem,
          cleanedRaw,
          false,
          contextSentenceTr,
          false,
          false,
          Boolean(suff.isPronoun)
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
        const isFutureSin =
          pref.raw === "س" ||
          pref.raw === "وس" ||
          pref.raw === "فس" ||
          pref.raw === "اس" ||
          pref.raw === "اف" ||
          pref.raw === "او";
        for (const suff of SUFFIX_RULES) {
          if (
            afterPref.endsWith(suff.raw) &&
            afterPref.length - suff.raw.length >= 2
          ) {
            const stem = afterPref.slice(0, -suff.raw.length);
            if (
              suff.isNiswaVerbSuffix &&
              !/^[يت]/.test(stem) &&
              !/\u0652ن\u064E?$/.test(cleanedRaw)
            ) {
              continue;
            }
            if (
              isFutureSin &&
              !canStripFutureSinPrefix(
                cleanedRaw,
                pref.raw,
                stem,
                isDefinitelyNoun
              )
            ) {
              continue;
            }
            const matched = matchStemWithRules(
              stem,
              cleanedRaw,
              false,
              contextSentenceTr,
              false,
              false,
              Boolean(suff.isPronoun)
            );
            if (
              matched &&
              (!isFutureSin || getWordCategory(matched.item) === "fiil")
            ) {
              const isImp =
                Boolean(matched.isImperative) ||
                (getWordCategory(matched.item) === "fiil" &&
                  isImperativeAlifVerb(cleanedRaw));
              const sLabel = getSuffixDisplayLabel(suff, matched.item, isImp);
              const isCohortativeLam =
                getWordCategory(matched.item) === "fiil" &&
                /^[انيت]/.test(stem) &&
                (pref.raw === "ل" || pref.raw === "ول" || pref.raw === "فل");
              const verbPrefixLabel = isCohortativeLam
                ? pref.raw === "ول"
                  ? "وَ (ve) + لْـ / لِـ (istek / emir eki: -elim, -sin)"
                  : pref.raw === "فل"
                  ? "فَـ + لْـ / لِـ (istek / emir eki: -elim, -sin)"
                  : "لِـ (istek / emir eki: -elim, -alım, -sin)"
                : pref.label;
              return {
                item: matched.item,
                originalWord: cleanedRaw,
                matchedStem: stem,
                prefixLabel: verbPrefixLabel,
                suffixLabel: sLabel,
                morphologyNote: buildMorphologyNote(
                  matched.item,
                  verbPrefixLabel,
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

  // Kademe 5 (Hata 1 Düzeltmesi): Kök (kok) Ünsüz İskeleti Eşleştirmesi
  // 1) Belirlilik takıları (ال، وال، بال، لل، كال vb.) kalan gövde 2 harfli olsa bile (السِّنِّ -> سن) mutlaka soyulur;
  //    böylece "السِّنِّ" asla "لسن" (لِسَان) iskeletine dönüşmez!
  // 2) تَفْعِيل (تطويل، تقصير، تضييق، توسيع) vezni mastarlarda "و / ي" silinip "توسيع -> تسع" (تِسْعَةٌ) yapılması engellenir!
  let candidateCore = normalized;
  for (const pref of NOMINAL_PREFIX_RULES) {
    const minRemaining = pref.makesDefiniteNoun ? 2 : 3;
    if (
      candidateCore.startsWith(pref.raw) &&
      candidateCore.length - pref.raw.length >= minRemaining
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
      if (suff.isNiswaVerbSuffix) continue;
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

  // 2 harfli şeddeli (muzaaf) isim/fiil gövdesi (سن -> سنن، حق -> حقق، خط -> خطط)
  if (candidateCore.length === 2) {
    skeletonCandidates.push(candidateCore + candidateCore[1]);
  }

  // تَفْعِيل vezni mastar koruması (تطويل -> طول، تقصير -> قصر، تضييق -> ضيق، توسيع -> وسع)
  const tafilMasdarMatch = candidateCore.match(/^ت(.)(.)ي(.)$/);

  // KURAL: مَفْعِل / مَفْعَل ve مَوَاعِيد vezinlerindeki Misal Fiil (فَاءُ الْفِعْل = و) İsm-i Zaman/Mekân Koruması
  const mithalMafalMatch = candidateCore.match(
    /^مو([^\u0627\u0648\u064A])([^\u0627\u0648\u064A])$/
  );
  const mithalPluralMatch = candidateCore.match(
    /^موا([^\u0627\u0648\u064A])ي?([^\u0627\u0648\u064A])$/
  );

  if (tafilMasdarMatch) {
    skeletonCandidates.push(
      `${tafilMasdarMatch[1]}${tafilMasdarMatch[2]}${tafilMasdarMatch[3]}`
    );
  } else if (mithalMafalMatch) {
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
    if (!candidateCore.startsWith("مو") && !candidateCore.startsWith("ت")) {
      skeletonCandidates.push(candidateCore.replace(/[اوي]/g, ""));
    }
  }

  for (const skel of skeletonCandidates) {
    if (skel.length === 3 && rootIndex.has(skel)) {
      const rootItems = rootIndex.get(skel)!;
      // KURAL 2.7: Kök yedeklemesinde (Kademe 5) "م" ile başlayan veya 4+ harfli türemiş kelimeler (مُجَدَّداً vb.)
      // asla kapalı sınıf bir edata (جِدّاً vb.) veya özel isme düşmez!
      const disallowEdatInRootFallback =
        candidateCore.startsWith("م") || candidateCore.length >= 4;
      const filteredPool = rootItems.filter((it) => {
        const cat = getWordCategory(it);
        if (cat === "ozel-isim") return false;
        if (disallowEdatInRootFallback && cat === "edat") return false;
        return true;
      });
      if (disallowEdatInRootFallback && filteredPool.length === 0) {
        continue;
      }
      const pool = filteredPool.length > 0 ? filteredPool : rootItems;

      // Kök adaylarını Türkçe cümle bağlamı, Gramer Kalkanı ve "م" (İsm-i Mef'ûl / Mekan) Kalkanına göre puanla
      let bestItem = pool[0];
      let bestScore = -9999;
      for (const it of pool) {
        let sc = computeTurkishContextScore(it, contextSentenceTr);
        if (isDefinitelyNoun) {
          sc += getWordCategory(it) === "fiil" ? -500 : 200;
        }
        // KURAL 1.2: "مُـ" ile başlamayan bir kelimenin (örn: أَرْبَع، أَرْبَعُونَ) kök eşleşmesiyle
        // "مُـ" ile başlayan bir ism-i mef'ûle (مُرَبَّع: kare) düşmesini engelle!
        const primaryCandClean = cleanArabicText(formatPrimaryWord(it));
        if (
          !candidateCore.startsWith("م") &&
          primaryCandClean.startsWith("م") &&
          !skel.startsWith("م")
        ) {
          sc -= 900;
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

export type Kelime = DictionaryItem;

export interface ExampleSentenceMatch {
  dialogueId: string;
  dialogueTitle: string;
  rawNum: string;
  sira: number;
  arapca: string;
  turkce: string;
}

const rootFamilyCache = new Map<string, DictionaryItem[]>();
const exampleSentencesCache = new Map<string, ExampleSentenceMatch[]>();

export function getAllWords(): DictionaryItem[] {
  return unifiedDictionary;
}

/**
 * Verilen kök (ör. "ع ل م") değerine sahip olan tüm sözlük kayıtlarını
 * getAllWords() içinden bulup döndürür (en fazla 8 kelime).
 */
export function getWordsByRoot(
  kok: string,
  excludeId?: string
): DictionaryItem[] {
  if (!kok || kok === "-" || kok.trim().length === 0) return [];
  const targetClean = cleanArabicText(kok).replace(/\s+/g, "");
  if (!targetClean || targetClean.length < 2) return [];

  const cacheKey = `${targetClean}__${excludeId || ""}`;
  if (rootFamilyCache.has(cacheKey)) {
    return rootFamilyCache.get(cacheKey)!;
  }

  const all = getAllWords();
  const results: DictionaryItem[] = [];
  const seenPrimary = new Set<string>();

  for (const item of all) {
    if (excludeId && item.id === excludeId) continue;
    if (!item.kok || item.kok === "-" || item.kok.trim().length === 0) continue;
    const itemRootClean = cleanArabicText(item.kok).replace(/\s+/g, "");
    if (itemRootClean !== targetClean) continue;

    const primaryKey = `${getWordCategory(item)}_${cleanArabicText(
      formatPrimaryWord(item)
    )}`;
    if (seenPrimary.has(primaryKey)) continue;
    seenPrimary.add(primaryKey);

    results.push(item);
    if (results.length >= 8) break;
  }

  rootFamilyCache.set(cacheKey, results);
  return results;
}

/**
 * diyaloglar.json içindeki tüm diyalog satırlarını tarayarak kelimenin
 * mufret, cemi, mazi, muzari veya masdar formlarından herhangi birini içeren
 * en fazla maxCount adet gerçek diyalog cümlesini ({ dialogueId, dialogueTitle, rawNum, sira, arapca, turkce }) döndürür.
 * Performans için bellek içi önbellek (cache) kullanır.
 */
export function getExampleSentencesForWord(
  word: DictionaryItem,
  maxCount = 3
): ExampleSentenceMatch[] {
  if (!word) return [];
  const cacheKey = `${word.id}__${maxCount}`;
  if (exampleSentencesCache.has(cacheKey)) {
    return exampleSentencesCache.get(cacheKey)!;
  }

  const dialogues = diyaloglarRaw as Dialogue[];
  const results: ExampleSentenceMatch[] = [];
  const seenSentences = new Set<string>();

  const rawForms = [
    word.mufret,
    word.cemi,
    word.mazi,
    word.muzari,
    word.masdar,
  ]
    .filter((f): f is string => Boolean(f && f !== "-" && f.trim().length > 0))
    .flatMap((f) => f.split(/[\/،,]/))
    .map((f) => cleanArabicText(f.replace(/\(.*?\)/g, "").trim()))
    .filter((f) => f.length >= 2);

  if (rawForms.length === 0) {
    exampleSentencesCache.set(cacheKey, []);
    return [];
  }

  const targetFormsSet = new Set<string>(rawForms);
  // Belirlilik takısı (ال) soyulmuş hallerini de ekle
  for (const f of rawForms) {
    if (f.startsWith("ال") && f.length >= 4) {
      targetFormsSet.add(f.slice(2));
    }
  }

  const isMultiWordPhrase = rawForms.some((f) => f.includes(" "));

  for (const dlg of dialogues) {
    if (results.length >= maxCount) break;
    const rawNum = dlg.id.replace("dlg_", "");

    for (const line of dlg.satirlar) {
      if (results.length >= maxCount) break;
      const cleanedLine = cleanArabicText(line.arapca);

      let matched = false;
      if (isMultiWordPhrase) {
        for (const f of targetFormsSet) {
          if (f.includes(" ") && cleanedLine.includes(f)) {
            matched = true;
            break;
          }
        }
      }

      if (!matched) {
        const tokens = line.arapca
          .replace(/[.,!?؟،;؛:"'()\[\]{}\d]/g, " ")
          .split(/\s+/)
          .filter(Boolean);

        for (const tok of tokens) {
          const cleanTok = cleanArabicText(tok);
          if (!cleanTok || cleanTok.length < 2) continue;

          if (targetFormsSet.has(cleanTok)) {
            matched = true;
            break;
          }

          // Yaygın ön ekleri (ال، وال، بال، فال، لل، و، ف، ب، ل، س) soyarak kontrol et
          const strippedCandidates: string[] = [];
          for (const pref of ["وال", "بال", "فال", "كال", "لل", "ال", "و", "ف", "ب", "ل", "س"]) {
            if (cleanTok.startsWith(pref) && cleanTok.length - pref.length >= 2) {
              strippedCandidates.push(cleanTok.slice(pref.length));
            }
          }
          // Yaygın iyelik zamiri son eklerini (ه، ها، هم، ك، كم، ي، نا) soyarak kontrol et
          for (const suff of ["كما", "هما", "هم", "هن", "كم", "نا", "ها", "ه", "ك", "ي"]) {
            if (cleanTok.endsWith(suff) && cleanTok.length - suff.length >= 3) {
              strippedCandidates.push(cleanTok.slice(0, -suff.length));
            }
          }

          if (strippedCandidates.some((c) => targetFormsSet.has(c))) {
            matched = true;
            break;
          }
        }
      }

      if (matched && !seenSentences.has(cleanedLine)) {
        seenSentences.add(cleanedLine);
        results.push({
          dialogueId: dlg.id,
          dialogueTitle: dlg.baslik_tr,
          rawNum,
          sira: line.sira,
          arapca: line.arapca,
          turkce: line.turkce,
        });
      }
    }
  }

  exampleSentencesCache.set(cacheKey, results);
  return results;
}