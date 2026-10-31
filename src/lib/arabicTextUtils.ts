// src/lib/arabicTextUtils.ts
// Arapça Tipografi, Lafzatullah (اللّٰهَ) Çift Şedde Onarımı ve Font Yardımcıları

export type ArabicFontId =
  | "arakom"
  | "amiri"
  | "scheherazade"
  | "noto-naskh"
  | "lateef";

export type ArabicFontSizePreset = "sm" | "md" | "lg" | "xl";

export interface ArabicFontConfig {
  id: ArabicFontId;
  name: string;
  subtitle: string;
  cssFamily: string;
  scale: number;
  lineHeight: number;
}

export const ARABIC_FONT_OPTIONS: ArabicFontConfig[] = [
  {
    id: "arakom",
    name: "Arakom (Varsayılan Eğitim Fontu)",
    subtitle: "Net hareke konumlandırmalı özel eğitim yazı tipi",
    cssFamily: '"ArakomFont", "Amiri", "Noto Naskh Arabic", serif',
    scale: 1.0,
    lineHeight: 2.05,
  },
  {
    id: "amiri",
    name: "Amiri (Klasik Matbaa & Mushaf Neskih)",
    subtitle: "Klasik İslam matbaası ve Mushaf-ı Şerif estetiği",
    cssFamily: '"Amiri", "ArakomFont", serif',
    scale: 1.04,
    lineHeight: 2.15,
  },
  {
    id: "scheherazade",
    name: "Scheherazade New (Akademik & Geniş Harekeli Neskih)",
    subtitle: "SIL tarafından geliştirilen geniş aralıklı akademik Neskih",
    cssFamily: '"Scheherazade New", "ArakomFont", serif',
    scale: 1.12,
    lineHeight: 2.2,
  },
  {
    id: "noto-naskh",
    name: "Noto Naskh Arabic (Modern Ekran & Okunaklılık Standardı)",
    subtitle: "Dijital ekranlarda yüksek kontrast ve modern okunaklılık",
    cssFamily: '"Noto Naskh Arabic", "ArakomFont", serif',
    scale: 1.0,
    lineHeight: 2.05,
  },
  {
    id: "lateef",
    name: "Lateef (Zarif ve Ferah Kaligrafik Neskih)",
    subtitle: "Yumuşak kaligrafik hatlar ve ferah satır yüksekliği",
    cssFamily: '"Lateef", "ArakomFont", serif',
    scale: 1.14,
    lineHeight: 2.18,
  },
];

export const ARABIC_FONT_SIZE_PRESETS: {
  id: ArabicFontSizePreset;
  label: string;
  px: number;
}[] = [
  { id: "sm", label: "Küçük (SM)", px: 28 },
  { id: "md", label: "Orta (MD)", px: 34 },
  { id: "lg", label: "Büyük (LG)", px: 42 },
  { id: "xl", label: "Çok Büyük (XL)", px: 50 },
];

export function getArabicFontConfig(fontId?: string): ArabicFontConfig {
  return (
    ARABIC_FONT_OPTIONS.find((f) => f.id === fontId) || ARABIC_FONT_OPTIONS[0]
  );
}

/**
 * Lafzatullah (اللّٰهَ / اللَّهَ / بالله / والله / لله / تالله / فالله) lafızlarında
 * OpenType font ligatürüyle çakışarak çift şedde görüntüsü oluşturan ikinci Lam (ل)
 * üzerindeki fazladan \u0651 (Şedde), \u0670 (Asâ/Çeker) ve \u064E (Fetha) işaretlerini
 * temizler; kelimenin sonundaki He (ه) harfinin irab harekesini (هَ / هُ / هِ) korur.
 */
export function fixArabicTypography(
  text: string,
  _fontFamily?: string
): string {
  if (!text) return "";

  return (
    text
      // 1. Ardışık mükerrer şedde veya birebir aynı harekeleri tekilleştir
      .replace(/\u0651{2,}/g, "\u0651")
      .replace(/([\u064B-\u0650\u0652\u0670])\1+/g, "$1")
      // 2. Lafzatullah (الله، بالله، والله، تالله، فالله، لله) ikinci Lam üzerindeki
      // şedde + çeker/fetha kombinasyonunu normalize et, son He (ه) harekesini koru:
      // İlk Lam üzerinde esre/üstün/cezim bulunabilir (ör: لِلّٰهِ, بِاللّٰهِ, اللّٰهَ)
      .replace(
        /(^|[^\u0621-\u063A\u0641-\u064A])([وفبتك]?ا?ل[\u064B-\u0652]*)ل[\u0651\u064E\u0670]+(ه[\u064B-\u065F]*)/g,
        "$1$2ل$3"
      )
      .replace(/(ا?ل)ل[\u0651\u064E\u0670]+(ه[\u064B-\u065F]*)/g, "$1ل$2")
  );
}

/**
 * Harekeleri soyar (Harekesiz okuma modu ve arama/eşleştirme için \u0670 Asâ/Superscript Alef dahil)
 */
export function removeArabicHarakat(text: string): string {
  if (!text) return "";
  return text.replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g, "");
}

export function removeDiacritics(text: string): string {
  return removeArabicHarakat(text);
}

/**
 * Hem hareke tercihini hem de Lafzatullah tipografi düzeltmesini uygular
 */
export function formatArabicText(
  text: string,
  showHareke = true,
  fontFamily?: string
): string {
  if (!text) return "";
  if (!showHareke) {
    return removeArabicHarakat(text);
  }
  return fixArabicTypography(text, fontFamily);
}

/**
 * Türkçe (LTR) metin içindeki Arapça (RTL) kelime/cümle gruplarını ayırır.
 * Böylece parantez içi Arapça ifadeler `<bdi dir="rtl">` ile izole edilerek
 * parantez ve iki nokta üst üste `(:)` işaretlerinin ters dönmesi engellenir.
 */
export function splitMixedBidiText(
  text: string
): Array<{ text: string; isArabic: boolean }> {
  if (!text) return [];
  const arabicRunRegex =
    /([\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\u064B-\u065F\u0670]+(?:[\s،؛؟]+[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\u064B-\u065F\u0670]+)*)/g;
  const parts = text.split(arabicRunRegex);
  const result: Array<{ text: string; isArabic: boolean }> = [];
  for (const part of parts) {
    if (!part) continue;
    const isArabic = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/.test(part);
    result.push({ text: part, isArabic });
  }
  return result;
}

/**
 * Med-i Mukadder (yazılmayan ama okunan elif) kelimelerinin eşdeğerlik tablosu.
 * Öğrenci veya ses tanıma motoru "هاذا" veya "هذا" döndürdüğünde %100 tam eşleşme sağlar.
 */
const MED_MUKADDER_EQUIVALENTS: Record<string, string> = {
  هاذا: "هذا",
  هاذه: "هذه",
  هاذهي: "هذه",
  هاذان: "هذان",
  هاؤلا: "هؤلا",
  هاؤلاء: "هؤلاء",
  ذالك: "ذلك",
  كذالك: "كذلك",
  فذالك: "فذلك",
  هاكذا: "هكذا",
  لاكن: "لكن",
  ولاكن: "ولكن",
  لاكنني: "لكنني",
  لاكنه: "لكنه",
  لاكنها: "لكنها",
  رحمان: "رحمن",
  الرحمان: "الرحمن",
  اولائك: "اولئك",
  الاه: "اله",
  الاهي: "الهي",
  طاه: "طه",
  لهاذا: "لهذا",
  بهاذا: "بهذا",
  لهاذه: "لهذه",
  بهاذه: "بهذه",
  مائه: "مئه",
  مائة: "مئه",
  المائه: "المئه",
  المائة: "المئه",
  بالمائه: "بالمئه",
  بالمائة: "بالمئه",
};

/**
 * Şedde (\u0651) ve hareke (\u064B-\u0650, \u0652, \u0670) sıralamasını kanonik Unicode sırasına
 * (önce şedde, sonra hareke: \u0651 + hareke) normalize eder ve ardışık mükerrer şeddeleri tekilleştirir.
 */
export function canonicalizeArabicDiacritics(text: string): string {
  if (!text) return "";
  return text
    .replace(/\u0651{2,}/g, "\u0651")
    .replace(/([\u064B-\u0650\u0652\u0670])\u0651/g, "\u0651$1")
    .replace(/\u0651{2,}/g, "\u0651");
}

/**
 * Hedef metindeki parantez içi sayı/açıklama bloklarını (ör. "(40)", "(167)")
 * ve yüzde (٪ / %) sembollerini telaffuz puanlamasından önce temizler.
 */
export function stripParentheticalNotesForScoring(text: string): string {
  if (!text) return "";
  return text
    .replace(/\([^)]*\)/g, " ")
    .replace(/[%٪]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const ARABIC_ONES: Record<number, string> = {
  0: "صفر",
  1: "واحد",
  2: "اثنان",
  3: "ثلاثه",
  4: "اربعه",
  5: "خمسه",
  6: "سته",
  7: "سبعه",
  8: "ثمانيه",
  9: "تسعه",
  10: "عشره",
  11: "احد عشر",
  12: "اثنا عشر",
  13: "ثلاثه عشر",
  14: "اربعه عشر",
  15: "خمسه عشر",
  16: "سته عشر",
  17: "سبعه عشر",
  18: "ثمانيه عشر",
  19: "تسعه عشر",
};

const ARABIC_TENS_NOM: Record<number, string> = {
  20: "عشرون",
  30: "ثلاثون",
  40: "اربعون",
  50: "خمسون",
  60: "ستون",
  70: "سبعون",
  80: "ثمانون",
  90: "تسعون",
};

const ARABIC_TENS_OBL: Record<number, string> = {
  20: "عشرين",
  30: "ثلاثين",
  40: "اربعين",
  50: "خمسين",
  60: "ستين",
  70: "سبعين",
  80: "ثمانين",
  90: "تسعين",
};

export function numberToArabicWords(
  num: number,
  preferOblique: boolean = false
): string {
  if (!Number.isFinite(num) || num < 0) return "";
  const n = Math.floor(num);
  if (n <= 19) {
    if (n === 2 && preferOblique) return "اثنين";
    if (n === 12 && preferOblique) return "اثني عشر";
    return ARABIC_ONES[n] || "";
  }
  const tensTable = preferOblique ? ARABIC_TENS_OBL : ARABIC_TENS_NOM;
  if (n < 100) {
    const ten = Math.floor(n / 10) * 10;
    const rem = n % 10;
    if (rem === 0) return tensTable[ten] || "";
    const oneWord =
      rem === 2 && preferOblique ? "اثنين" : ARABIC_ONES[rem] || "";
    return `${oneWord} و${tensTable[ten]}`;
  }
  if (n < 1000) {
    const hundreds = Math.floor(n / 100);
    const rem = n % 100;
    let hWord = "مئه";
    if (hundreds === 2) hWord = preferOblique ? "مئتين" : "مئتان";
    else if (hundreds >= 3) hWord = `${ARABIC_ONES[hundreds]} مئه`;
    if (rem === 0) return hWord;
    return `${hWord} و${numberToArabicWords(rem, preferOblique)}`;
  }
  if (n < 10000) {
    const thousands = Math.floor(n / 1000);
    const rem = n % 1000;
    let tWord = "الف";
    if (thousands === 2) tWord = preferOblique ? "الفين" : "الفان";
    else if (thousands >= 3) tWord = `${ARABIC_ONES[thousands]} الاف`;
    if (rem === 0) return tWord;
    return `${tWord} و${numberToArabicWords(rem, preferOblique)}`;
  }
  return String(n);
}

/**
 * STT çıktısındaki veya metindeki rakamları (0-9, ٠-٩, ۰-۹) Arapça sayı kelimelerine dönüştürür.
 * Referans metin (expectedText) verilmişse ve referansta mansub/mecrur (-ين) çekimi geçiyorsa ona uyum sağlar.
 */
export function normalizeArabicNumbersInText(
  text: string,
  referenceText?: string
): string {
  if (!text) return "";
  const refStripped = referenceText
    ? referenceText
        .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g, "")
        .replace(/[أإآٱ]/g, "ا")
    : "";
  const preferOblique =
    /(عشرين|ثلاثين|اربعين|خمسين|ستين|سبعين|ثمانين|تسعين|اثنين|مئتين|الفين)/.test(
      refStripped
    );

  // Doğu Arapça (٠-٩) ve Farsça/Urduca (۰-۹) rakamlarını standart 0-9'a çevir
  const asciiDigits = text
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 0x06f0));

  return asciiDigits.replace(/\b\d{1,4}\b/g, (match) => {
    const parsed = parseInt(match, 10);
    if (Number.isNaN(parsed)) return match;
    return numberToArabicWords(parsed, preferOblique) || match;
  });
}

/**
 * Ortak noktalama, tırnak (", «, », ', “, ”, ‘, ’, „, ‚, ‹, ›), yüzde (% / ٪) ve tatweel (ـ) temizleyici
 */
export const COMMON_PUNCTUATION_AND_QUOTES_REGEX =
  /[.,،؛؟?!:"'«»“”‘’„‚‹›()\[\]{}…\-–—/\\*%٪]/g;

/**
 * Telaffuz ve Mahreç Karşılaştırması İçin Arapça Fonetik ve Vakıf (Durak) Normalizasyonu:
 * 1. Parantez içi açıklamaları ve % sembollerini temizler, rakamları Arapça sayı kelimelerine dönüştürür.
 * 2. Tüm harekeleri, şeddeyi, tatweel (ـ) karakterini ve noktalama/tırnak işaretlerini temizler.
 * 3. Hemzeli elifleri (أ, إ, آ, ٱ) standart ا harfine dönüştürür.
 * 4. Elif-i maksûreyi (ى) ي harfine dönüştürür.
 * 5. Kelime sonundaki Tâ-i Merbûta (ة) ile ه harfini eşdeğer kabul eder (vakıf kuralı).
 * 6. هذا/هاذا, هذه/هاذه, ذلك/ذالك, لكن/لاكن, رحمن/رحمان, مائة/مئة gibi med-i mukadder kelimelerini eşitler.
 */
export function normalizeArabicForPronunciation(
  text: string,
  referenceText?: string
): string {
  if (!text) return "";

  const withoutParens = stripParentheticalNotesForScoring(text);
  const withNumberWords = normalizeArabicNumbersInText(
    withoutParens,
    referenceText
  );

  const cleaned = canonicalizeArabicDiacritics(withNumberWords)
    // 1. Harekeler, şedde, çeker ve Kur'an durak/tecvid işaretlerini temizle
    .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g, "")
    // Tatweel (keşide) ve sıfır genişlikli karakterleri temizle
    .replace(/[\u0640\u200B-\u200F\u202A-\u202E\u2066-\u2069]/g, "")
    // Noktalama ve tırnak işaretlerini temizle
    .replace(COMMON_PUNCTUATION_AND_QUOTES_REGEX, " ")
    // 2. Hemzeli elifleri standart elif (ا) harfine dönüştür
    .replace(/[أإآٱ]/g, "ا")
    // 3. Elif-i maksûreyi (ى) ي harfine dönüştür
    .replace(/ى/g, "ي")
    // 4. Tâ-i Merbûta (ة) ile ه harfini eşdeğer kabul et (özellikle kelime sonunda vakıf kuralı)
    .replace(/ة/g, "ه")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) return "";

  // 5. Med-i mukadder kelimelerini kelime bazında normalize et
  return cleaned
    .split(" ")
    .map((word) => MED_MUKADDER_EQUIVALENTS[word] || word)
    .join(" ");
}

/**
 * Kelime sonunda tenvin elifi (ـاً / ـًا) taşıyan yaygın Arapça kelimeler (normalize edilmiş halleri).
 * STT motorları bu kelimeleri vakıf/vasıl durumuna göre elifli (اخا / شكرا), elifsiz (اخ / شكر)
 * veya fonetik nun ile (اخن / شكرن) döndürebilir.
 */
export const KNOWN_TANWIN_ALIF_WORDS = new Set<string>([
  "اخا",
  "مرحبا",
  "شكرا",
  "اهلا",
  "سهلا",
  "ايضا",
  "جدا",
  "عفوا",
  "دائما",
  "حقا",
  "طبعا",
  "فعلا",
  "مثلا",
  "كثيرا",
  "قليلا",
  "قريبا",
  "بعيدا",
  "سريعا",
  "جيدا",
  "معا",
  "غدا",
  "ابدا",
  "احيانا",
  "اخيرا",
  "اولا",
  "ثانيا",
  "ثالثا",
  "رابعا",
  "خامسا",
  "تقريبا",
  "خصوصا",
  "عموما",
  "حتما",
  "فورا",
  "حالا",
  "شمالا",
  "جنوبا",
  "شرقا",
  "غربا",
  "صباحا",
]);

/**
 * Hedef kelimenin sonunda tenvin fetha + elif (ـاً / ـًا) olup olmadığını tespit eder.
 */
export function hasWordFinalTanwinAlif(
  rawExpectedWord: string,
  normalizedExpectedWord?: string
): boolean {
  if (!rawExpectedWord) return false;
  const cleanedRaw = canonicalizeArabicDiacritics(rawExpectedWord)
    .replace(COMMON_PUNCTUATION_AND_QUOTES_REGEX, "")
    .replace(/[\u0640\u200B-\u200F\u202A-\u202E\u2066-\u2069]/g, "")
    .trim();

  // Doğrudan harekeli metinde ـاً (\u064B\u0627) veya ـًا (\u0627\u064B) ile bitiyorsa
  if (/(\u064B[اأإآٱ]|[اأإآٱ]\u064B)$/.test(cleanedRaw)) {
    return true;
  }

  const norm =
    normalizedExpectedWord ?? normalizeArabicForPronunciation(rawExpectedWord);
  if (norm && KNOWN_TANWIN_ALIF_WORDS.has(norm)) {
    return true;
  }

  return false;
}

/**
 * Hedef kelime tenvin elifi (ـاً) ile bitiyorsa (örn. أَخاً، شُكْراً، مَرْحَباً),
 * STT çıktısının son elif olmadan (أخ / شكر), son elifle (اخا / شكرا) veya
 * fonetik nun ile (اخن / شكرن) yazılmasını %100 tam eşleşme olarak doğrular.
 */
export function isWordFinalTanwinAlifMatch(
  rawExpectedWord: string,
  cleanExpected: string,
  cleanSpoken: string
): boolean {
  if (!cleanExpected || !cleanSpoken) return false;
  if (!hasWordFinalTanwinAlif(rawExpectedWord, cleanExpected)) {
    return false;
  }
  const stem = cleanExpected.endsWith("ا")
    ? cleanExpected.slice(0, -1)
    : cleanExpected;
  if (!stem) return false;

  return (
    cleanSpoken === cleanExpected ||
    cleanSpoken === stem ||
    cleanSpoken === `${stem}ن`
  );
}

/**
 * Sözlük, Kütüphane ve Alıştırma Aramaları İçin Fonetik / Harekesiz Arapça Normalizasyonu:
 * Hareke (َ ُ ِ ّ ْ ً ٌ ٍ ٰ), tatweel (ـ), hemzeli elif (أ إ آ ٱ -> ا),
 * ؤ -> و, ئ -> ي, ة -> ه ve ى -> ي farklarını ortadan kaldırır.
 */
export function normalizeArabicText(text: string): string {
  if (!text) return "";
  return canonicalizeArabicDiacritics(text)
    .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g, "")
    .replace(/[\u0640\u200B-\u200F\u202A-\u202E\u2066-\u2069]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(COMMON_PUNCTUATION_AND_QUOTES_REGEX, " ")
    .replace(/\s+/g, " ")
    .trim();
}



