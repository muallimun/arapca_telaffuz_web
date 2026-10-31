// src/lib/arabicNlpEngine.ts
// Arapça Fonetik, 38 Çiftlik Mahreç Koçluğu, 2D Levenshtein Hizalama, Kök Harf Kalkanı ve Adaptif Rehberlik Motoru

import {
  normalizeArabicForPronunciation,
  canonicalizeArabicDiacritics,
  stripParentheticalNotesForScoring,
  normalizeArabicNumbersInText,
  COMMON_PUNCTUATION_AND_QUOTES_REGEX,
  KNOWN_TANWIN_ALIF_WORDS,
  isWordFinalTanwinAlifMatch,
  countTrueArabicMaddLetters,
} from "./arabicTextUtils";

// ==============================================================================
// 1. TİP TANIMLAMALARI (INTERFACES & TYPES)
// ==============================================================================

export type AlignmentOperation = "MATCH" | "SUBSTITUTE" | "DELETE" | "INSERT";

export interface AlignmentResult {
  expectedChar: string | null;
  spokenChar: string | null;
  operation: AlignmentOperation;
}

export interface MakhrajTip {
  title: string;
  tip: string;
  pair?: string;
}

export interface ProactiveCategoryDetail {
  id: "throat" | "peltek" | "kalin";
  badge: string;
  lettersFound: string[];
  advice: string;
}

export interface ProactiveGuide {
  categories: string[];
  details: ProactiveCategoryDetail[];
  shaddaCount: number;
  medCount: number;
  tanvinCount: number;
}

export interface WordEvaluationResult {
  targetWord: string;
  spokenWord: string;
  score: number;
  status: "correct" | "warning" | "close" | "wrong";
  makhrajTip?: MakhrajTip;
  makhrajWarning?: string;
  medVezinTip?: string;
  diacriticWarning?: string;
  diacriticsVerified?: boolean;
  diacriticNote?: string;
  isRootGuardTriggered?: boolean;
  rootGuardMessage?: string;
}

export interface SentenceEvaluationResult {
  words: WordEvaluationResult[];
  overallScore: number;
  score?: number | null;
  isTextRecognized?: boolean;
  isEvaluated?: boolean;
  isAcousticFallback?: boolean;
  confidence?: "high" | "medium" | "unverified";
  rhythmScore?: number;
  tempoScore?: number;
  fluencyScore?: number;
  syllablePeaks?: number;
  expectedSyllables?: number;
  extraWordsCount?: number;
  insertedWords?: string[];
  omittedCount?: number;
  substitutedCount?: number;
  diacriticsVerified?: boolean;
  diacriticNote?: string;
  message?: string;
  isRootGuardTriggered: boolean;
  rootGuardMessage?: string;
}

export interface AdaptiveCoachingResult {
  action: "slow_down" | "level_up" | "keep_going";
  suggestedSpeed?: 0.5 | 0.75 | 1 | 1.25;
  suggestedLevel?: string;
  focusMakhrajPair?: string;
  message: string;
}

// ==============================================================================
// 2. SABİTLER VE TAM 38 KANONİK ÇİFTLİK MAHREÇ KARIŞIKLIK MATRİSİ
// ==============================================================================

const THROAT_LETTERS = ["ء", "أ", "إ", "ه", "ع", "ح", "غ", "خ"];
const PELTEK_LETTERS = ["ث", "ذ", "ظ"];
const KALIN_LETTERS = ["خ", "ص", "ض", "غ", "ط", "ق", "ظ"];

export const MAKHRAJ_CONFUSION_PAIRS: Array<{
  canonicalPairId: number;
  pair1: string;
  pair2: string;
  title: string;
  tip: string;
}> = [
  // Kanonik Çift 1: Ayn (ع) ile Hemze/Elif (ء/أ/إ/ا)
  {
    canonicalPairId: 1,
    pair1: "ع",
    pair2: "ء",
    title: "Boğaz Ortası (Ayn) / Hemze Karışıklığı",
    tip: "ع harfini boğaz ortası kaslarını hafifçe daraltarak derin ve çatallı çıkarın; düz Elif/Hemze gibi okumayın.",
  },
  {
    canonicalPairId: 1,
    pair1: "ع",
    pair2: "أ",
    title: "Boğaz Ortası (Ayn) / Hemze Karışıklığı",
    tip: "ع harfini boğaz ortası kaslarını hafifçe daraltarak derin ve çatallı çıkarın; düz Elif/Hemze gibi okumayın.",
  },
  {
    canonicalPairId: 1,
    pair1: "ع",
    pair2: "إ",
    title: "Boğaz Ortası (Ayn) / Hemze Karışıklığı",
    tip: "ع harfini boğaz ortası kaslarını hafifçe daraltarak derin ve çatallı çıkarın; düz Elif/Hemze gibi okumayın.",
  },
  {
    canonicalPairId: 1,
    pair1: "ع",
    pair2: "ا",
    title: "Boğaz Ortası (Ayn) / Hemze Karışıklığı",
    tip: "ع harfini boğaz ortası kaslarını hafifçe daraltarak derin ve çatallı çıkarın; düz Elif/Hemze gibi okumayın.",
  },
  // Kanonik Çift 2-6: Boğaz Harfleri Kendi Arasında
  {
    canonicalPairId: 2,
    pair1: "ح",
    pair2: "ه",
    title: "Boğaz Ortası (Hâ) / Boğaz Dibi (He) Karışıklığı",
    tip: "ح harfini boğaz ortasını daraltarak sıcak ve güçlü bir buğu sesiyle çıkarın; göğüsten gelen cılız ه yapmayın.",
  },
  {
    canonicalPairId: 3,
    pair1: "ح",
    pair2: "خ",
    title: "Temiz Hâ / Hırıltılı Hı Karışıklığı",
    tip: "ح harfinde küçük dili titretmeyin (hırıltı katmayın); خ harfinde ise boğaz üstünden hırıltılı çıkarın.",
  },
  {
    canonicalPairId: 4,
    pair1: "خ",
    pair2: "غ",
    title: "Boğaz Üstü (Hı / Ğayn) Karışıklığı",
    tip: "خ nefessiz ve hırıltılıdır; غ ise ses tellerinin titrediği yumuşak Ğayn sesidir.",
  },
  {
    canonicalPairId: 5,
    pair1: "غ",
    pair2: "ق",
    title: "Ğayn / Kaf Karışıklığı",
    tip: "ق harfinde dil kökünü yumuşak damağa tam vurup patlatın; غ gibi sızıcı bırakmayın.",
  },
  {
    canonicalPairId: 6,
    pair1: "ع",
    pair2: "غ",
    title: "Boğaz Ortası (Ayn) / Boğaz Üstü (Ğayn) Karışıklığı",
    tip: "ع boğazın tam ortasından temiz çıkar, hırıltılı غ sesine kaydırmayın.",
  },
  // Kanonik Çift 7: He (ه) ile Hemze/Elif (ء/أ/إ/ا)
  {
    canonicalPairId: 7,
    pair1: "ه",
    pair2: "ء",
    title: "He / Hemze Karışıklığı",
    tip: "ه harfinde nefesi kesmeyin, boğaz dibinden akıcı nefes verin.",
  },
  {
    canonicalPairId: 7,
    pair1: "ه",
    pair2: "أ",
    title: "He / Hemze Karışıklığı",
    tip: "ه harfinde nefesi kesmeyin, boğaz dibinden akıcı nefes verin.",
  },
  {
    canonicalPairId: 7,
    pair1: "ه",
    pair2: "إ",
    title: "He / Hemze Karışıklığı",
    tip: "ه harfinde nefesi kesmeyin, boğaz dibinden akıcı nefes verin.",
  },
  {
    canonicalPairId: 7,
    pair1: "ه",
    pair2: "ا",
    title: "He / Hemze Karışıklığı",
    tip: "ه harfinde nefesi kesmeyin, boğaz dibinden akıcı nefes verin.",
  },
  // Kanonik Çift 8-11: Kalın - İnce Karışıklıkları (ق/ك, ص/س, ط/ت, ض/د)
  {
    canonicalPairId: 8,
    pair1: "ق",
    pair2: "ك",
    title: "Dil Kökü Kalın (Kaf) / İnce (Kef) Karışıklığı",
    tip: "ق harfini dilin en arka kökünü üst yumuşak damağa vurarak tok ve kalın çıkarın; ön damaktan ince ك okumayın.",
  },
  {
    canonicalPairId: 9,
    pair1: "ص",
    pair2: "س",
    title: "Kalın (Sad) / İnce (Sin) Karışıklığı",
    tip: "ص okurken dilin arka kısmını üst damağa kaldırarak (İsti'lâ) ıslık sesini tok ve kalın çıkarın.",
  },
  {
    canonicalPairId: 10,
    pair1: "ط",
    pair2: "ت",
    title: "Kalın (Tı) / İnce (Te) Karışıklığı",
    tip: "ط harfinde dil sırtını üst damağa kapatarak (İtbak) nefesi hapsedip tok ve patlamalı çıkarın; ince ت yapmayın.",
  },
  {
    canonicalPairId: 11,
    pair1: "ض",
    pair2: "د",
    title: "Kalın (Dad) / İnce (Dal) Karışıklığı",
    tip: "ض harfini dilin yan kenarını üst azı dişlerine temas ettirerek kalın ve dolgunca çıkarın; dil ucuyla ince د yapmayın.",
  },
  // Kanonik Çift 12-17: Dad (ض) ve Zı (ظ) Karışıklıkları
  {
    canonicalPairId: 12,
    pair1: "ض",
    pair2: "ظ",
    title: "Azı Diş (Dad) / Peltek (Zı) Karışıklığı",
    tip: "ض harfinde dil ucu dişlerin arasına çıkmaz! Dilin yan kenarını üst azı dişlerine yaslayarak çıkarın.",
  },
  {
    canonicalPairId: 13,
    pair1: "ض",
    pair2: "ذ",
    title: "Kalın (Dad) / İnce Peltek (Zel) Karışıklığı",
    tip: "ض peltek değildir; dil yanını üst azı dişlerine değdirerek tok ve kalın okuyun.",
  },
  {
    canonicalPairId: 14,
    pair1: "ض",
    pair2: "ز",
    title: "Kalın (Dad) / Keskin (Ze) Karışıklığı",
    tip: "ض harfinde diş arasından ıslık/vızıltı çıkarmayın, dil yanından tok ses verin.",
  },
  {
    canonicalPairId: 15,
    pair1: "ظ",
    pair2: "ز",
    title: "Kalın Peltek (Zı) / Keskin (Ze) Karışıklığı",
    tip: "ظ peltek ve kalındır; dil ucunu üst ön dişlerin ucuna değdirin ve dil kökünü kaldırın, keskin ز yapmayın.",
  },
  {
    canonicalPairId: 16,
    pair1: "ظ",
    pair2: "ذ",
    title: "Kalın Peltek (Zı) / İnce Peltek (Zel) Karışıklığı",
    tip: "İkisi de peltektir ancak ظ harfinde dil arkasını üst damağa kaldırarak sesi kalınlaştırın.",
  },
  {
    canonicalPairId: 17,
    pair1: "ظ",
    pair2: "ط",
    title: "Akıcı Peltek (Zı) / Patlamalı (Tı) Karışıklığı",
    tip: "ظ harfinde sesi hapsetmeyin, dil ucu ile üst diş arasından sesi akıtın.",
  },
  // Kanonik Çift 18-23: Peltek Se (ث) ve Zel (ذ) Karışıklıkları
  {
    canonicalPairId: 18,
    pair1: "ث",
    pair2: "س",
    title: "Peltek (Se) / Islıklı (Sin) Karışıklığı",
    tip: "ث harfinde dil ucunu üst kesici dişlerin ucuna hafifçe değdirin; dişleri kapatıp س gibi ıslık çıkarmayın.",
  },
  {
    canonicalPairId: 19,
    pair1: "ث",
    pair2: "ت",
    title: "Akıcı Peltek (Se) / Patlamalı (Te) Karışıklığı",
    tip: "ث harfinde dil ucunu diş etine kapatıp sesi patlatmayın, diş ucundan nefes akıtın.",
  },
  {
    canonicalPairId: 20,
    pair1: "ث",
    pair2: "ف",
    title: "Dil Ucu Peltek (Se) / Dudak (Fe) Karışıklığı",
    tip: "ث harfini alt dudağı dişlere değdirerek değil, dil ucunu üst dişlere değdirerek çıkarın.",
  },
  {
    canonicalPairId: 21,
    pair1: "ث",
    pair2: "ذ",
    title: "Nefesli Peltek (Se) / Titreşimli Peltek (Zel) Karışıklığı",
    tip: "ث harfinde ses tellerini titretmeden sadece nefes akıtın; ذ harfinde ise ses tellerini titretin.",
  },
  {
    canonicalPairId: 22,
    pair1: "ذ",
    pair2: "ز",
    title: "Peltek (Zel) / Keskin (Ze) Karışıklığı",
    tip: "ذ peltektir; dil ucunu üst dişlerin ucuna değdirerek vızıltısız okuyun, keskin ز yapmayın.",
  },
  {
    canonicalPairId: 23,
    pair1: "ذ",
    pair2: "د",
    title: "Akıcı Peltek (Zel) / Patlamalı (Dal) Karışıklığı",
    tip: "ذ harfinde dil ucunu diş arkasına vurup sesi kesmeyin, diş ucundan akıcı çıkarın.",
  },
  // Kanonik Çift 24-31: Islık, Dil Ortası ve Dil Ucu Karışıklıkları
  {
    canonicalPairId: 24,
    pair1: "س",
    pair2: "ش",
    title: "Islıklı (Sin) / Yayvan (Şın) Karışıklığı",
    tip: "س dil ucundan dar ıslıkla, ش ise dil ortasından yayvan nefesle çıkar.",
  },
  {
    canonicalPairId: 25,
    pair1: "س",
    pair2: "ز",
    title: "Nefesli (Sin) / Titreşimli (Ze) Karışıklığı",
    tip: "س harfinde ses tellerini titretmeyin; ز harfinde ses tellerini titretin.",
  },
  {
    canonicalPairId: 26,
    pair1: "ص",
    pair2: "ز",
    title: "Kalın (Sad) / İnce Titreşimli (Ze) Karışıklığı",
    tip: "ص kalın ve nefessizdir, ses teli titreşimi (vızıltı) katmayın.",
  },
  {
    canonicalPairId: 27,
    pair1: "ص",
    pair2: "ث",
    title: "Kalın Islıklı (Sad) / İnce Peltek (Se) Karışıklığı",
    tip: "ص harfinde dil ucunu dişlerin arasına çıkarmayın, alt diş arkasından kalın ıslık verin.",
  },
  {
    canonicalPairId: 28,
    pair1: "ط",
    pair2: "د",
    title: "Kalın (Tı) / İnce (Dal) Karışıklığı",
    tip: "ط harfini dil sırtını damağa kapatarak çok daha kalın ve tok çıkarın.",
  },
  {
    canonicalPairId: 29,
    pair1: "ج",
    pair2: "ش",
    title: "Patlamalı (Cim) / Sızıcı (Şın) Karışıklığı",
    tip: "ج harfinde dil ortasını üst damağa tam değdirip sesi hapsedin, ش gibi gevşek bırakıp sızdırmayın.",
  },
  {
    canonicalPairId: 30,
    pair1: "ج",
    pair2: "ز",
    title: "Dil Ortası (Cim) / Diş Arası (Ze) Karışıklığı",
    tip: "ج harfini dil ortasını üst damağa vurarak çıkarın, diş arasından vızıltılı ز yapmayın.",
  },
  {
    canonicalPairId: 31,
    pair1: "ج",
    pair2: "د",
    title: "Dil Ortası (Cim) / Dil Ucu (Dal) Karışıklığı",
    tip: "Dil ucunu değil, dilin ortasını üst damağa değdirerek ج çıkarın.",
  },
  // Kanonik Çift 32-38: Akıcı, Geniz, Dudak ve Vakıf Harfleri
  {
    canonicalPairId: 32,
    pair1: "ر",
    pair2: "ل",
    title: "Titrek (Ra) / Akıcı (Lam) Karışıklığı",
    tip: "ر harfinde dil ucunu damağa sabit yapıştırmayın, hafifçe titretip çekin.",
  },
  {
    canonicalPairId: 33,
    pair1: "ن",
    pair2: "ر",
    title: "Genizli (Nun) / Titrek (Ra) Karışıklığı",
    tip: "ن harfinde sesi genizden (ğunne ile) çıkarın; ر harfinde ise dil ucunu titretin.",
  },
  {
    canonicalPairId: 34,
    pair1: "ن",
    pair2: "ل",
    title: "Genizli (Nun) / Dil Yanı (Lam) Karışıklığı",
    tip: "ن harfindeki geniz tınısını koruyun, sesi dil yanından ل gibi akıtmayın.",
  },
  {
    canonicalPairId: 35,
    pair1: "ن",
    pair2: "م",
    title: "Diş Eti (Nun) / Dudak (Mim) Karışıklığı",
    tip: "ن harfinde dudakları kapatmayın, dil ucunu üst diş etine değdirin.",
  },
  {
    canonicalPairId: 36,
    pair1: "ب",
    pair2: "ف",
    title: "Çift Dudak (Be) / Diş-Dudak (Fe) Karışıklığı",
    tip: "ب harfinde iki dudağı birbirine tam kapatıp patlatın; ف harfinde üst dişleri alt dudağa değdirip nefes verin.",
  },
  {
    canonicalPairId: 37,
    pair1: "ب",
    pair2: "م",
    title: "Patlamalı (Be) / Genizli (Mim) Karışıklığı",
    tip: "ب harfinde sesi genze kaçırmadan dudakları net açın.",
  },
  {
    canonicalPairId: 36,
    pair1: "و",
    pair2: "ف",
    title: "Yuvarlak Dudak (Vav) / Diş-Dudak (Fe) Karışıklığı",
    tip: "و harfinde dişleri dudağa değdirmeden dudakları öne doğru yuvarlakça büzün.",
  },
  {
    canonicalPairId: 38,
    pair1: "ت",
    pair2: "ة",
    title: "Açık Tâ (ت) / Yuvarlak Tâ-i Merbûta (ة) Vakıf Farkı",
    tip: "Kelime sonunda dururken ة harfi hafif bir ه nefesiyle biter; geçiş halinde veya açık ت harfinde ise dil ucuyla net ت sesi çıkarılır.",
  },
  {
    canonicalPairId: 38,
    pair1: "ت",
    pair2: "ه",
    title: "Dil Ucu (Te) / Boğaz Dibi (He) Karışıklığı",
    tip: "ت harfinde dil ucunu üst diş etine vurarak net bir patlama sesi çıkarın; boğazdan ه nefesiyle geçiştirmeyin.",
  },
];

/**
 * Ortografik varyantlar (أ/إ/آ/ء/ا ve ة/ه) tek kanonik fonetik çift altında gruplandığında
 * toplam kanonik mahreç çifti sayısını (38) döndürür.
 */
export function getCanonicalMakhrajPairsCount(): number {
  return new Set(MAKHRAJ_CONFUSION_PAIRS.map((p) => p.canonicalPairId)).size;
}

// ==============================================================================
// 3. İKİ AŞAMALI METİN NORMALİZASYONU VE YARDIMCI FONKSİYONLAR
// ==============================================================================

/**
 * 1. Aşama: Görsel Temizleme — Harekeleri KESİNLİKLE KORUR.
 * Parantez içi açıklamaları, % sembollerini, tatweel (ـ), tırnak ve noktalama işaretlerini temizler;
 * şedde + hareke sırasını kanonik Unicode sırasına normalize eder.
 */
export function cleanDisplayText(text: string): string {
  const withoutParens = stripParentheticalNotesForScoring(text);
  return canonicalizeArabicDiacritics(withoutParens)
    .replace(/[\u0640\u200B-\u200F\u202A-\u202E\u2066-\u2069]/g, "")
    .replace(/[\d\u0660-\u0669\u06F0-\u06F9]/g, " ")
    .replace(COMMON_PUNCTUATION_AND_QUOTES_REGEX, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Ara Katman: Sadece harekeleri temizler ama أ/إ/آ/ء/ه/ة/ع/ت harflerini olduğu gibi korur
 * (Hemze/Elif normalizasyonundan ÖNCE ع ↔ ء/أ/إ/ا ve ت ↔ ة/ه farkını yakalamak için).
 */
export function stripDiacriticsOnly(text: string): string {
  return cleanDisplayText(text)
    .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * 2. Aşama: Karşılaştırma Normalizasyonu — Harekeleri, şeddeyi, tatweel ve noktalamaları soyar;
 * Elif/Hemze, Elif-i Maksûre, Tâ-i Merbûta (vakıf ه) ve med-i mukadder (هذا/هاذا vb.) varyantlarını eşitler.
 */
export function normalizeForComparison(
  text: string,
  referenceText?: string
): string {
  return normalizeArabicForPronunciation(text, referenceText);
}

export function shapeArabic(
  text: string,
  maxCharsPerLine: number = 60
): string {
  if (!text) return "";
  const words = text.split(" ");
  const lines: string[] = [];
  let currentLine = "";
  for (const word of words) {
    if ((currentLine + " " + word).length > maxCharsPerLine) {
      lines.push(currentLine.trim());
      currentLine = word;
    } else {
      currentLine += " " + word;
    }
  }
  if (currentLine.trim()) lines.push(currentLine.trim());
  return lines.join("\n");
}

/**
 * Misal fiil (ilk harfi و olan kökler) ism-i zaman/mekân ve mimli mastar (مَفْعِل / مَفْعَل)
 * ile çoğul (مَوَاعِيد / مَوَاقِف) kalıplarını koruyarak Arapça kelimenin 3 harfli kökünü çıkarır.
 * Örn: مَوْعِد (موعد) -> و ع د, مَوْقِف (موقف) -> و ق ف, مَوْضِع (موضع) -> و ض ع,
 * مَوْسِم (موسم) -> و س م, مَوْطِن (موطن) -> و ط ن, مَوْرِد (مورد) -> و ر د, مَوَاعِيد -> و ع د.
 */
export function extractArabicRoot(word: string): string {
  let core = normalizeForComparison(word).replace(/[^\u0600-\u06FF]/g, "");
  if (core.length <= 2) return core;

  // Yaygın önekleri (ال، وال، بال، كال، لل، ول، فل، و، ف، ب، ل) soy — Gelecek zaman "س" isimlerden asla soyulmaz!
  const prefixes = ["وبال", "وال", "فال", "بال", "كال", "ولل", "لل", "ال", "ول", "فل", "و", "ف", "ب", "ل"];
  for (const pref of prefixes) {
    if (core.startsWith(pref) && core.length - pref.length >= 3) {
      core = core.slice(pref.length);
      break;
    }
  }

  // Yaygın sonekleri (zamirler, çoğul ekleri, tâ-i merbûta/ه, tenvin elifi) soy
  const suffixes = ["كما", "هما", "كم", "هم", "نا", "ها", "وا", "ات", "ون", "ين", "ان", "ه", "ك", "ي", "ا"];
  for (const suff of suffixes) {
    if (core.endsWith(suff) && core.length - suff.length >= 3) {
      core = core.slice(0, -suff.length);
      // Yuvarlak Tâ (ة -> ت) + iyelik zamiri durumunda sondaki açık ت harfini de soy (örn: تذكرتك -> تذكرت -> تذكر -> ذكر)
      if (core.endsWith("ت") && core.length >= 4 && ["كما", "هما", "كم", "هم", "نا", "ها", "ه", "ك", "ي"].includes(suff)) {
        core = core.slice(0, -1);
      }
      break;
    }
  }

  // 0. İstif'âl (استفعال / استفالة / استـ / نستـ / يستـ / تستـ) Bâbı Kök Çözümlemesi:
  // "استمارة", "استراحة", "استشارة", "استقامة", "لنستعجل" gibi kelimelerde baştaki "است / نست / يست / تست" zâid önek olup
  // "س" ve "ت" kök harfi değildir!
  if (core === "استمار" || core === "استماره") {
    return "أمر";
  }
  const istifalHollowRoots: Record<string, string> = {
    "استراح": "روح",
    "استشار": "شور",
    "استقام": "قوم",
    "استقال": "قول",
    "استعان": "عون",
    "استجاب": "جوب",
    "استطاع": "طوع",
    "استدار": "دور",
    "استنار": "نور",
    "استفاد": "فيد",
    "استمال": "ميل",
    "استضاق": "ضيق",
    "استعاذ": "عوذ",
    "استزاد": "زيد",
    "استعار": "عور",
    "استثار": "ثور",
    "استطاب": "طيب",
  };
  if (istifalHollowRoots[core]) {
    return istifalHollowRoots[core];
  }
  const istifalHollowMatch = core.match(/^(است|[انتي]ست)([^\u0627\u0648\u064A])ا([^\u0627\u0648\u064A])$/);
  if (istifalHollowMatch) {
    return `${istifalHollowMatch[2]}و${istifalHollowMatch[3]}`;
  }
  if ((core.startsWith("است") || /^[انتي]ست/.test(core)) && core.length >= 6) {
    const afterIst = core.slice(3).replace(/[اوي]/g, "");
    if (afterIst.length === 3) {
      return afterIst;
    }
  }
  if ((core === "استعد" || core === "يستعد" || core === "تستعد" || core === "نستعد") ) {
    return "عدد";
  }
  if (/^(انضم|ينضم|تنضم|ننضم|انضمام)$/.test(core)) {
    return "ضمم";
  }
  if (/^(التقي|يلتقي|نلتقي|تلتقي|نلتق|تلتق|يلتق|تلتقيان|يلتقيان|التقاء)$/.test(core)) {
    return "لقي";
  }
  if (/^(ارتدي|يرتدي|ترتدي|يرتدون|ترتدون|ارتداء)$/.test(core)) {
    return "ردي";
  }
  if (/^(اعاد|يعيد|تعيد|نعيد|اعاده)$/.test(core)) {
    return "عود";
  }
  if (/^(اخذ|ياخذ|تاخذ|ناخذ|خذ)$/.test(core)) {
    return "أخذ";
  }
  if (/^(اكل|ياكل|تاكل|ناكل)$/.test(core)) {
    return "أكل";
  }
  const mithalMudariMatch = core.match(/^(س)?[انتي]?(زن|ضع|جد|صل|قع|ثق|جب|صف|قف|عد|دع)$/);
  if (mithalMudariMatch) {
    return `و${mithalMudariMatch[2]}`;
  }

  // 1. Çoğul مَوَاعِيد / مَفَاعِيل kalıbı: م + و + ا + C2 + ي + C3 (6 harf) -> و + C2 + C3
  const mawaa3iidMatch = core.match(/^موا([^\u0627\u0648\u064A])ي([^\u0627\u0648\u064A])$/);
  if (mawaa3iidMatch) {
    return `و${mawaa3iidMatch[1]}${mawaa3iidMatch[2]}`;
  }

  // 2. Çoğul مَوَاقِف / مَفَاعِل kalıbı: م + و + ا + C2 + C3 (5 harf) -> و + C2 + C3
  const mawaa3ilMatch = core.match(/^موا([^\u0627\u0648\u064A])([^\u0627\u0648\u064A])$/);
  if (mawaa3ilMatch) {
    return `و${mawaa3ilMatch[1]}${mawaa3ilMatch[2]}`;
  }

  // 3. Tekil مَفْعِل / مَفْعَل (Misal fiil ism-i zaman/mekân): م + و + C2 + C3 (4 harf)
  // Örn: موعد، موقف، موضع، موسم، موطن، مورد، مولد، موقع، موجز، موهبه، موعظه
  const maw3ilMatch = core.match(/^مو([^\u0627\u0648\u064A])([^\u0627\u0648\u064A])$/);
  if (maw3ilMatch) {
    return `و${maw3ilMatch[1]}${maw3ilMatch[2]}`;
  }

  // 4. مَفْعُول (ism-i mef'ûl) kalıbı: م + C1 + C2 + و + C3 (5 harf) -> C1 + C2 + C3
  const maf3uulMatch = core.match(/^م([^\u0627\u0648\u064A])([^\u0627\u0648\u064A])و([^\u0627\u0648\u064A])$/);
  if (maf3uulMatch) {
    return `${maf3uulMatch[1]}${maf3uulMatch[2]}${maf3uulMatch[3]}`;
  }

  // 5. مَفْعَل / مَفْعِل / مُفْعِل (4 harfli mimli türevler): م + C1 + C2 + C3 -> C1 + C2 + C3
  if (core.startsWith("م") && core.length === 4) {
    const withoutMim = core.slice(1);
    if (!/[اوي]/.test(withoutMim)) {
      return withoutMim;
    }
  }

  // Genel ünsüz iskeleti
  const skeleton = core.replace(/[اوىي]/g, "");
  return skeleton.length >= 2 ? skeleton : core;
}

/**
 * Kelimenin kök ünsüz iskeletini (Consonant Skeleton) çıkarır.
 * Misal fiil ism-i zaman/mekân (مَوْعِد -> وعد) ve İstif'âl (استمارة -> أمر) kalıplarını korur.
 */
export function extractConsonantSkeleton(word: string): string {
  return getConsonantSkeleton(word);
}

export function getConsonantSkeleton(word: string): string {
  const rawNormalized = normalizeForComparison(word).replace(
    /[^\u0600-\u06FF]/g,
    ""
  );
  // Tenvin elifi taşıyan kelimelerde (örn. أخاً -> اخا -> اخ) sondaki tenvin elifini kök ünsüzü sayma
  const normalized =
    KNOWN_TANWIN_ALIF_WORDS.has(rawNormalized) && rawNormalized.endsWith("ا")
      ? rawNormalized.slice(0, -1)
      : rawNormalized;

  if (normalized.length <= 2) return normalized;

  // مَوْعِد / مَوْقِف / مَوَاعِيد ve استمارة / استراحة gibi kalıplarda özel kök çıkarımını kullan:
  if (
    /^(ال|وال|بال|لل|و|ف|ب|ل)?موا?[^\u0627\u0648\u064A]ي?[^\u0627\u0648\u064A]/.test(normalized) ||
    /^(ال|وال|بال|لل|و|ف|ب|ل)?است/.test(normalized)
  ) {
    return extractArabicRoot(normalized);
  }

  // Kelime başındaki kat' hemzesini (ا) koru, kelime içi/sonu uzatma harflerini ([اوىي]) çıkar
  const skeleton =
    normalized[0] === "ا"
      ? "ا" + normalized.slice(1).replace(/[اوىي]/g, "")
      : normalized.replace(/[اوىي]/g, "");
  return skeleton.length >= 2 ? skeleton : normalized;
}

// ==============================================================================
// 4. PROAKTİF MAHREÇ VE HAREKE REHBERİ (KONUŞMA ÖNCESİ)
// ==============================================================================

export function buildProactiveMakhrajGuide(text: string): ProactiveGuide {
  const guide: ProactiveGuide = {
    categories: [],
    details: [],
    shaddaCount: 0,
    medCount: 0,
    tanvinCount: 0,
  };

  const foundThroat = Array.from(
    new Set(THROAT_LETTERS.filter((l) => text.includes(l)))
  );
  if (foundThroat.length > 0) {
    guide.categories.push("🗣️ Boğaz (Halk) Harfleri");
    guide.details.push({
      id: "throat",
      badge: "🗣️ Boğaz (Halk) Harfleri",
      lettersFound: foundThroat,
      advice:
        "Boğazınızı sıkmadan, sesin boğaz derinliğinden doğal akışıyla çıkarın.",
    });
  }

  const foundPeltek = Array.from(
    new Set(PELTEK_LETTERS.filter((l) => text.includes(l)))
  );
  if (foundPeltek.length > 0) {
    guide.categories.push("👅 Peltek Harfler");
    guide.details.push({
      id: "peltek",
      badge: "👅 Peltek Harfler",
      lettersFound: foundPeltek,
      advice:
        "Dil ucunu üst ön kesici dişlerin ucuna hafifçe değdirerek okuyun; keskin س veya ز sesine kaydırmayın.",
    });
  }

  const foundKalin = Array.from(
    new Set(KALIN_LETTERS.filter((l) => text.includes(l)))
  );
  if (foundKalin.length > 0) {
    guide.categories.push("🔊 Kalın (İsti'lâ) Harfler");
    guide.details.push({
      id: "kalin",
      badge: "🔊 Kalın (İsti'lâ) Harfler",
      lettersFound: foundKalin,
      advice:
        "Dil kökünü üst damağa doğru yükselterek (İsti'lâ) sesi ağız içinde tok ve dolgun yankılandırın.",
    });
  }

  const shaddaMatches = text.match(/\u0651/g);
  if (shaddaMatches) guide.shaddaCount = shaddaMatches.length;

  const tanvinMatches = text.match(/[\u064B-\u064D]/g);
  if (tanvinMatches) guide.tanvinCount = tanvinMatches.length;

  guide.medCount = countTrueArabicMaddLetters(text);

  return guide;
}

// ==============================================================================
// 5. 2D LEVENSHTEIN KARAKTER HİZALAMA (BACKTRACKING)
// ==============================================================================

export function alignCharacters(
  expected: string,
  spoken: string
): AlignmentResult[] {
  const e = expected.replace(/[.,!?؟،]/g, "").trim();
  const s = spoken.replace(/[.,!?؟،]/g, "").trim();
  const m = e.length;
  const n = s.length;
  const dp: number[][] = Array(m + 1)
    .fill(0)
    .map(() => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (e[i - 1] === s[j - 1]) dp[i][j] = dp[i - 1][j - 1];
      else
        dp[i][j] = Math.min(
          dp[i - 1][j - 1] + 1,
          dp[i][j - 1] + 1,
          dp[i - 1][j] + 1
        );
    }
  }

  const result: AlignmentResult[] = [];
  let i = m,
    j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && e[i - 1] === s[j - 1]) {
      result.push({
        expectedChar: e[i - 1],
        spokenChar: s[j - 1],
        operation: "MATCH",
      });
      i--;
      j--;
    } else if (i > 0 && j > 0 && dp[i][j] === dp[i - 1][j - 1] + 1) {
      result.push({
        expectedChar: e[i - 1],
        spokenChar: s[j - 1],
        operation: "SUBSTITUTE",
      });
      i--;
      j--;
    } else if (j > 0 && dp[i][j] === dp[i][j - 1] + 1) {
      result.push({
        expectedChar: null,
        spokenChar: s[j - 1],
        operation: "INSERT",
      });
      j--;
    } else if (i > 0 && dp[i][j] === dp[i - 1][j] + 1) {
      result.push({
        expectedChar: e[i - 1],
        spokenChar: null,
        operation: "DELETE",
      });
      i--;
    }
  }
  return result.reverse();
}

// ==============================================================================
// 6. KÖK HARF KALKANI VE SARF VEZİN/MED ANALİZİ
// ==============================================================================

export function applyRootConsonantGuard(
  expected: string,
  spoken: string,
  baseScore: number,
  hasMakhrajError: boolean = false
): { finalScore: number; isTriggered: boolean; message?: string } {
  const expSkeleton = getConsonantSkeleton(expected);
  const spkSkeleton = getConsonantSkeleton(spoken);

  const isSkeletonDifferent =
    expSkeleton !== spkSkeleton &&
    expSkeleton.length > 0 &&
    spkSkeleton.length > 0;

  if (isSkeletonDifferent || hasMakhrajError) {
    return {
      finalScore: Math.min(baseScore, 58),
      isTriggered: true,
      message: `⚠️ Kök harf değişimi tespit edildi! Kelimenin anlamı değiştiği için puan sınırlandırıldı. (Beklenen iskelet: ${expSkeleton}, Duyulan iskelet: ${spkSkeleton})`,
    };
  }
  return { finalScore: baseScore, isTriggered: false };
}

export function analyzeVezinAndMed(
  expected: string,
  alignment: AlignmentResult[]
): string | null {
  const hasDelete = alignment.some((a) => a.operation === "DELETE");
  const hasInsert = alignment.some((a) => a.operation === "INSERT");
  if (!hasDelete && !hasInsert) return null;

  const medLetters = ["ا", "و", "ي"];
  const deletedMed = alignment.find(
    (a) =>
      a.operation === "DELETE" &&
      a.expectedChar &&
      medLetters.includes(a.expectedChar)
  );
  if (deletedMed) {
    return `⏳ Med (Uzatma) Eksikliği: Kelimedeki (${deletedMed.expectedChar}) uzatma harfini yuttunuz; 1 elif miktarı çekerek okuyun.`;
  }

  const insertedMed = alignment.find(
    (a) =>
      a.operation === "INSERT" &&
      a.spokenChar &&
      medLetters.includes(a.spokenChar)
  );
  if (insertedMed) {
    return "⏳ Fazladan Uzatma (Med) Hatası: Harekeyi gereğinden fazla uzatarak kelimenin vezin kalıbını değiştirdiniz.";
  }

  const expLen = expected.length;
  const spkLen = alignment.filter((a) => a.spokenChar).length;
  if (hasInsert || (expLen >= 4 && spkLen <= 3)) {
    return "📐 Sarf Kalıbı / Vezin Farklılığı: Kelimenin vezin kalıbını koruyarak okuyun.";
  }
  return null;
}

// ==============================================================================
// 7. ANA DEĞERLENDİRME VE ADAPTİF KOÇLUK FONKSİYONLARI
// ==============================================================================

export const CRITICAL_MAKHRAJ_LETTERS = [
  "ث",
  "ذ",
  "ظ",
  "ح",
  "ع",
  "خ",
  "غ",
  "ق",
  "ص",
  "ض",
  "ط",
  "ر",
];

const CRITICAL_LETTER_COACHING: Record<
  string,
  { title: string; tip: string; pair: string }
> = {
  ث: {
    title: "Peltek Se (ث) Mahreç Rehberi",
    tip: "Bu kelimedeki (ث) harfini dil ucunu üst ön dişlerin ucuna hafifçe değdirerek, yumuşak ve sakin bir nefes akışıyla okuyabilirsiniz.",
    pair: "ث ↔ س/ت",
  },
  ذ: {
    title: "Peltek Zel (ذ) Mahreç Rehberi",
    tip: "Bu kelimedeki (ذ) harfini dil ucunu üst ön dişlerin ucuna değdirip ses tellerini titreterek, keskin (ز) sesine kaymadan netleştirebilirsiniz.",
    pair: "ذ ↔ ز/د",
  },
  ظ: {
    title: "Kalın Peltek Zı (ظ) Mahreç Rehberi",
    tip: "Bu kelimedeki (ظ) harfini dil ucunu üst diş ucuna değdirirken dil kökünü damağa kaldırarak tok ve dolgun bir sesle çıkarabilirsiniz.",
    pair: "ظ ↔ ز/ذ",
  },
  ح: {
    title: "Boğaz Ortası Hâ (ح) Mahreç Rehberi",
    tip: "Bu kelimedeki (ح) harfini boğaz ortasını hafifçe daraltarak, hırıltısız ve sıcak bir buğu sesiyle netleştirebilirsiniz.",
    pair: "ح ↔ ه/خ",
  },
  ع: {
    title: "Boğaz Ortası Ayn (ع) Mahreç Rehberi",
    tip: "Bu kelimedeki (ع) harfini boğaz ortası kaslarını hafifçe sıkarak derin ve belirgin çıkarabilirsiniz; düz Elif/Hemze gibi geçmeyin.",
    pair: "ع ↔ أ/ا",
  },
  خ: {
    title: "Boğaz Üstü Hı (خ) Mahreç Rehberi",
    tip: "Bu kelimedeki (خ) harfini boğazın üst kısmından (yumuşak damak) hafif hırıltılı bir nefesle çıkarabilirsiniz.",
    pair: "خ ↔ ح/غ",
  },
  غ: {
    title: "Boğaz Üstü Ğayn (غ) Mahreç Rehberi",
    tip: "Bu kelimedeki (غ) harfini boğaz üstünden ses tellerini titreterek yumuşak ve akıcı şekilde okuyabilirsiniz.",
    pair: "غ ↔ خ/ق",
  },
  ق: {
    title: "Kalın Kaf (ق) Mahreç Rehberi",
    tip: "Bu kelimedeki (ق) harfini dilin en arka kökünü yumuşak damağa vurarak tok ve dolgun çıkarabilirsiniz; ince (ك) sesine yaklaştırmayın.",
    pair: "ق ↔ ك",
  },
  ص: {
    title: "Kalın Sad (ص) Mahreç Rehberi",
    tip: "Bu kelimedeki (ص) harfini dil kökünü üst damağa kaldırarak (İsti'lâ) tok ve kalın bir ıslık tınısıyla okuyabilirsiniz.",
    pair: "ص ↔ س",
  },
  ض: {
    title: "Kalın Dad (ض) Mahreç Rehberi",
    tip: "Bu kelimedeki (ض) harfini dilin yan kenarını üst azı dişlerine yaslayarak tok ve dolgun çıkarabilirsiniz; peltekleştirmeyin.",
    pair: "ض ↔ د/ظ",
  },
  ط: {
    title: "Kalın Tı (ط) Mahreç Rehberi",
    tip: "Bu kelimedeki (ط) harfini dil sırtını üst damağa kapatarak tok ve güçlü çıkarabilirsiniz; ince (ت) gibi okumayın.",
    pair: "ط ↔ ت",
  },
  ر: {
    title: "Titrek Ra (ر) Mahreç Rehberi",
    tip: "Bu kelimedeki (ر) harfini dil ucunu üst diş etine hafifçe dokundurup akıcı şekilde netleştirebilirsiniz.",
    pair: "ر ↔ ل/ن",
  },
};

export function findCriticalLetterMakhrajTip(
  targetWord: string
): MakhrajTip | undefined {
  const clean = stripDiacriticsOnly(targetWord);
  for (const letter of CRITICAL_MAKHRAJ_LETTERS) {
    if (clean.includes(letter) && CRITICAL_LETTER_COACHING[letter]) {
      return CRITICAL_LETTER_COACHING[letter];
    }
  }
  return undefined;
}

function findMakhrajPairFromAlignment(
  alignment: AlignmentResult[],
  prioritizeCriticalOnly: boolean = false
): MakhrajTip | undefined {
  // 1. Öncelikle kritik Arapça harflerdeki (ث، ذ، ظ، ح، ع، خ، غ، ق، ص، ض، ط، ر) değişimleri kontrol et
  for (const item of alignment) {
    if (
      item.operation === "SUBSTITUTE" &&
      item.expectedChar &&
      item.spokenChar
    ) {
      // Vakıf (ة <-> ه) ve Hemzeli Elif (أ/إ/آ/ٱ <-> ا) farklarını mahreç hatası sayma
      if (
        (item.expectedChar === "ة" && item.spokenChar === "ه") ||
        (item.expectedChar === "ه" && item.spokenChar === "ة") ||
        (["أ", "إ", "آ", "ٱ", "ا"].includes(item.expectedChar) &&
          ["أ", "إ", "آ", "ٱ", "ا"].includes(item.spokenChar))
      ) {
        continue;
      }

      const isCriticalTarget = CRITICAL_MAKHRAJ_LETTERS.includes(
        item.expectedChar
      );
      if (prioritizeCriticalOnly && !isCriticalTarget) {
        continue;
      }

      const pair = MAKHRAJ_CONFUSION_PAIRS.find(
        (p) =>
          (p.pair1 === item.expectedChar && p.pair2 === item.spokenChar) ||
          (p.pair2 === item.expectedChar && p.pair1 === item.spokenChar)
      );
      if (pair) {
        return {
          title: pair.title,
          tip: pair.tip,
          pair: `${item.expectedChar} ↔ ${item.spokenChar}`,
        };
      }
    }
  }
  return undefined;
}

interface LetterDiacriticUnit {
  baseLetter: string;
  hasShadda: boolean;
  vowel: string | null;
}

function parseLetterDiacritics(rawWord: string): LetterDiacriticUnit[] {
  const cleaned = cleanDisplayText(canonicalizeArabicDiacritics(rawWord));
  const units: LetterDiacriticUnit[] = [];

  for (const ch of cleaned) {
    if (/[\u0621-\u063A\u0641-\u064A\u0671]/.test(ch)) {
      const normalizedLetter = ch
        .replace(/[أإآٱ]/g, "ا")
        .replace(/ى/g, "ي")
        .replace(/ة/g, "ه");
      units.push({
        baseLetter: normalizedLetter,
        hasShadda: false,
        vowel: null,
      });
    } else if (units.length > 0) {
      const current = units[units.length - 1];
      if (ch === "\u0651") {
        current.hasShadda = true;
      } else if (/[\u064E\u064F\u0650\u064B\u064C\u064D\u0652\u0670]/.test(ch)) {
        current.vowel = ch === "\u0670" ? "\u064E" : ch;
      }
    }
  }
  return units;
}

/**
 * Ham metinler arasındaki şedde (\u0651) ve kısa ünlü harekelerini (\u064E, \u0650, \u064F, tenvin, sükûn)
 * kelimenin ünsüz iskeletindeki harf indeksine göre karşılaştırır.
 * - Şedde eksikliği, fazladan şedde eklenmesi (دَرَسَ vs دَرَّسَ) veya şeddenin yanlış harfe kayması durumlarını yakalar.
 * - Şedde veya hareke uyuşmazlığı tespit edildiğinde hasMismatch: true döner; kelime puanı en fazla 74 ile sınırlandırılır.
 * - STT tamamen harekesiz metin döndürdüyse şeffaf biçimde diacriticsVerified: false işaretler.
 */
export function evaluateDiacriticsAndShadda(
  expectedRaw: string,
  recognizedRaw: string
): {
  penalty: number;
  hasMismatch: boolean;
  warning?: string;
  diacriticsVerified: boolean;
  verificationNote?: string;
} {
  const hasSpokenDiacritics = /[\u064B-\u0652\u0670]/.test(recognizedRaw);
  if (!hasSpokenDiacritics) {
    return {
      penalty: 0,
      hasMismatch: false,
      diacriticsVerified: false,
      verificationNote: "Hareke/Şedde: STT metninde yer almadığı için doğrulanmadı",
    };
  }

  const expUnits = parseLetterDiacritics(expectedRaw);
  const spkUnits = parseLetterDiacritics(recognizedRaw);

  let penalty = 0;
  const warnings: string[] = [];

  // 1. Ünsüz iskeleti harf indeksine göre Şedde (\u0651) kontrolü (eksik, fazladan veya kaymış şedde)
  const expShaddaIndices = expUnits
    .map((u, idx) => (u.hasShadda ? idx : -1))
    .filter((idx) => idx >= 0);
  const spkShaddaIndices = spkUnits
    .map((u, idx) => (u.hasShadda ? idx : -1))
    .filter((idx) => idx >= 0);

  let missingShadda = false;
  let extraShadda = false;
  let shiftedShadda = false;

  const maxLen = Math.max(expUnits.length, spkUnits.length);
  for (let i = 0; i < maxLen; i++) {
    const expHas = Boolean(expUnits[i]?.hasShadda);
    const spkHas = Boolean(spkUnits[i]?.hasShadda);
    if (expHas && !spkHas) {
      missingShadda = true;
    } else if (!expHas && spkHas) {
      extraShadda = true;
    } else if (
      expHas &&
      spkHas &&
      expUnits[i]?.baseLetter !== spkUnits[i]?.baseLetter
    ) {
      shiftedShadda = true;
    }
  }

  if (missingShadda && extraShadda && expShaddaIndices.length === spkShaddaIndices.length) {
    shiftedShadda = true;
  }

  if (shiftedShadda) {
    penalty += 26;
    warnings.push("Şedde (تَشْدِيد) yanlış harf üzerinde okundu");
  } else {
    if (missingShadda) {
      penalty += 26;
      warnings.push("Şedde (تَشْدِيد) eksik veya zayıf okundu");
    }
    if (extraShadda) {
      penalty += 26;
      warnings.push("Fazladan şedde (تَشْدِيد) eklendi");
    }
  }

  // 2. Kısa ünlü hareke (\u064E fetha, \u0650 kesra, \u064F damme, tenvin ve iç sükûn) kontrolü
  const vowelSet = new Set([
    "\u064E",
    "\u064F",
    "\u0650",
    "\u064B",
    "\u064C",
    "\u064D",
    "\u0652",
  ]);
  const minLen = Math.min(expUnits.length, spkUnits.length);
  let vowelMismatchCount = 0;

  for (let i = 0; i < minLen; i++) {
    const isLastLetter = i === minLen - 1;
    const expV = expUnits[i].vowel;
    const spkV = spkUnits[i].vowel;

    // Kelime sonu vakıf (duruş) sükûnunu hareke hatası sayma
    if (isLastLetter && spkV === "\u0652") {
      continue;
    }

    if (expV && spkV && vowelSet.has(expV) && vowelSet.has(spkV)) {
      if (expV !== spkV) {
        vowelMismatchCount += 1;
      }
    }
  }

  if (vowelMismatchCount > 0) {
    penalty += Math.max(26, vowelMismatchCount * 14);
    warnings.push("Hareke uyuşmazlığı tespit edildi");
  }

  const hasMismatch = warnings.length > 0 || penalty > 0;

  return {
    penalty,
    hasMismatch,
    warning: warnings.length > 0 ? warnings.join(" · ") : undefined,
    diacriticsVerified: !hasMismatch,
    verificationNote: hasMismatch
      ? "Algılanan metinde kısmi hareke uyumu"
      : "Harekeler ve Şedde Doğrulandı",
  };
}

/**
 * Diyaloglarda konuşmacı veya hitap olarak geçen özel isimlerin normalize edilmiş listesi.
 * Whisper dil modeli nadir özel isimleri bazen yakın sesli yaygın kelimelere (örn. بَتُول -> بطل) yuvarlayabilir.
 */
export const ARABIC_PROPER_NOUNS = new Set<string>([
  "بتول",
  "احمد",
  "سميه",
  "حسن",
  "فاطمه",
  "عمر",
  "زينب",
  "خالد",
  "مريم",
  "علي",
  "ساره",
  "كريم",
  "ليلي",
  "يوسف",
  "ابراهيم",
  "محمد",
  "سلمي",
  "طارق",
  "ياسر",
  "نور",
  "سعيد",
  "راشد",
  "هدي",
  "امنه",
  "بلال",
  "حمزه",
  "عثمان",
  "خديجه",
  "عائشه",
  "عبد",
  "ماجد",
  "نبيل",
  "فريد",
  "سليم",
  "وليد",
  "عماد",
  "زياد",
  "رامي",
  "سامي",
  "عادل",
  "جمال",
  "كمال",
  "محمود",
  "مصطفي",
  "سفيان",
  "مروان",
  "لبني",
  "ندي",
  "رنا",
  "حنان",
  "سعاد",
  "ايمان",
]);

const PROPER_NOUN_NEAR_MAKHRAJ_GROUPS: string[][] = [
  ["ت", "ط", "د"],
  ["س", "ص", "ث"],
  ["ذ", "ز", "ظ"],
  ["د", "ض", "ظ"],
  ["ه", "ح", "خ"],
  ["ك", "ق"],
  ["ا", "ع"],
];

function areNearMakhrajConsonants(c1: string, c2: string): boolean {
  if (c1 === c2) return true;
  return PROPER_NOUN_NEAR_MAKHRAJ_GROUPS.some(
    (g) => g.includes(c1) && g.includes(c2)
  );
}

/**
 * Hedef kelime bir özel isimse (örn. بَتُولُ) ve STT çıktısı (örn. بطل) yalnızca
 * tek bir yakın mahreç ünsüzü (ت/ط، س/ص، ذ/ز/ظ، د/ض، ه/ح) ve/veya düşen bir med harfi (و/ي/ا)
 * farkı içeriyorsa fonetik tolerans uygular.
 */
export function isProperNounPhoneticMatch(
  cleanExp: string,
  cleanSpk: string
): boolean {
  if (!cleanExp || !cleanSpk) return false;
  if (!ARABIC_PROPER_NOUNS.has(cleanExp)) return false;
  if (cleanExp === cleanSpk) return true;

  const stripInternalVowels = (w: string) =>
    w.length <= 1 ? w : w[0] + w.slice(1).replace(/[اوىي]/g, "");

  const expCons = stripInternalVowels(cleanExp);
  const spkCons = stripInternalVowels(cleanSpk);

  if (expCons.length < 2 || spkCons.length < 2) return false;
  if (expCons.length !== spkCons.length) return false;

  let nearMakhrajSubstitutions = 0;
  for (let i = 0; i < expCons.length; i++) {
    if (expCons[i] === spkCons[i]) continue;
    if (areNearMakhrajConsonants(expCons[i], spkCons[i])) {
      nearMakhrajSubstitutions += 1;
    } else {
      return false;
    }
  }

  return nearMakhrajSubstitutions <= 1;
}

/**
 * Hedef kelimenin son harfinin kesralı (ـِ) veya müennes muhataba zamiri (ـكِ / أَنْتِ) olup olmadığını
 * ve STT çıktısının bu kesrayı 'ي' uzatması (işbâ': لَكِ -> لكي، حَالُكِ -> حالكي، أَنْتِ -> انتي) olarak döndürüp döndürmediğini kontrol eder.
 */
function isFeminineKasraProlongationMatch(
  rawExpectedWord: string,
  cleanExp: string,
  cleanSpk: string
): boolean {
  if (!cleanExp || !cleanSpk || cleanExp.length < 2) return false;
  if (cleanExp.endsWith("ي")) return false;
  if (cleanSpk !== cleanExp + "ي") return false;

  const trimmedRaw = canonicalizeArabicDiacritics(rawExpectedWord)
    .replace(COMMON_PUNCTUATION_AND_QUOTES_REGEX, "")
    .trim();

  // Doğrudan harekeli metinde son harfte kesra (\u0650) varsa
  if (/\u0650$/.test(trimmedRaw)) {
    return true;
  }

  // Harekesiz/yarı harekeli metinde bilinen müennes kesralı zamir/kelimeler (انت، لك، بك، منك، عنك، اليك، عليك، فيك، معك، حالك، اسمك)
  if (
    cleanExp === "انت" ||
    cleanExp.endsWith("ك") ||
    cleanExp === "هذه"
  ) {
    return true;
  }

  return false;
}

export function evaluateSingleWord(
  expected: string,
  spoken: string
): WordEvaluationResult {
  const expectedCleaned = stripParentheticalNotesForScoring(expected);
  const spokenWithNums = normalizeArabicNumbersInText(spoken, expectedCleaned);

  // 1. ÖNCE ham ünsüzleri hazırla
  const rawExp = stripDiacriticsOnly(expectedCleaned);
  const rawSpk = stripDiacriticsOnly(spokenWithNums);
  // 2. SONRA fonetik ve vakıf normalizasyonunu hazırla
  const cleanExp = normalizeForComparison(expectedCleaned, expectedCleaned);
  const cleanSpk = normalizeForComparison(spokenWithNums, expectedCleaned);

  const hasArabicSpoken = /[\u0600-\u06FF]/.test(cleanSpk);
  if (!hasArabicSpoken && cleanSpk.trim().length > 0) {
    return {
      targetWord: expectedCleaned || expected,
      spokenWord: "Anlaşılamadı",
      score: 0,
      status: "wrong",
      makhrajTip: findCriticalLetterMakhrajTip(expectedCleaned || expected),
      medVezinTip:
        "Mikrofondan bu kelime net algılanamadı. Doğal telaffuzunu dinleyip tekrar deneyebilirsiniz.",
      diacriticsVerified: false,
      diacriticNote: "Hareke/Şedde: STT metninde yer almadığı için doğrulanmadı",
    };
  }

  // 3. Tenvin Elifi (ـاً / ـًا: أَخاً، شُكْراً، مَرْحَباً، أَيْضاً، جِدّاً) %100 Tam Eşleşme Kontrolü
  const isTanwinAlifEquivalent = isWordFinalTanwinAlifMatch(
    expectedCleaned || expected,
    cleanExp,
    cleanSpk
  );

  // 4. Müennes Kesra Uzatma (İşbâ') Teşhisi (لَكِ -> لكي، حَالُكِ -> حالكي، أَنْتِ -> انتي)
  if (
    !isTanwinAlifEquivalent &&
    isFeminineKasraProlongationMatch(
      expectedCleaned || expected,
      cleanExp,
      cleanSpk
    )
  ) {
    const targetLabel = (expectedCleaned || expected).trim();
    const spokenLabel = spoken.trim() || cleanSpk;
    const ishbaMessage = `🔍 Kesra Uzatma (İşbâ') Kontrolü (${targetLabel} → ${spokenLabel}): Kelime sonundaki kesra 'ي' uzatması gibi algılandı. Eğer 'leki' şeklinde kısa okuduysanız doğrudur; ancak 'lekî' diye çekerek okuduysanız son harekeyi med harfine dönüştürmeden kısa kesmeye dikkat edin.`;
    return {
      targetWord: targetLabel,
      spokenWord: spoken,
      score: 79,
      status: "close",
      medVezinTip: ishbaMessage,
      diacriticsVerified: true,
      diacriticNote: ishbaMessage,
      isRootGuardTriggered: false,
    };
  }

  const alignment = alignCharacters(cleanExp, cleanSpk);
  const rawAlignment = alignCharacters(rawExp, rawSpk);
  const expectedSkeleton = extractConsonantSkeleton(cleanExp);
  const spokenSkeleton = extractConsonantSkeleton(cleanSpk);
  const skeletonAlignment: AlignmentResult[] =
    expectedSkeleton.length > 0 &&
    expectedSkeleton.length === spokenSkeleton.length
      ? Array.from({ length: expectedSkeleton.length }, (_, idx) => ({
          expectedChar: expectedSkeleton[idx],
          spokenChar: spokenSkeleton[idx],
          operation:
            expectedSkeleton[idx] === spokenSkeleton[idx]
              ? "MATCH"
              : "SUBSTITUTE",
        }))
      : [];

  const matchCount = alignment.filter((a) => a.operation === "MATCH").length;
  const maxLen = Math.max(cleanExp.length, cleanSpk.length, 1);
  const baseScore =
    cleanExp === cleanSpk || isTanwinAlifEquivalent
      ? 100
      : Math.round((matchCount / maxLen) * 100);

  // Kök ünsüz ve 38 kanonik mahreç çifti kontrolü her zaman (özel isimler dahil!) tavizsiz çalıştırılır
  const criticalAlignmentTip =
    findMakhrajPairFromAlignment(rawAlignment, true) ||
    findMakhrajPairFromAlignment(alignment, true) ||
    findMakhrajPairFromAlignment(skeletonAlignment, true);
  const generalAlignmentTip =
    findMakhrajPairFromAlignment(rawAlignment, false) ||
    findMakhrajPairFromAlignment(alignment, false) ||
    findMakhrajPairFromAlignment(skeletonAlignment, false);
  const fallbackCriticalTip = findCriticalLetterMakhrajTip(
    expectedCleaned || expected
  );

  const detectedSubstitutionTip = isTanwinAlifEquivalent
    ? undefined
    : criticalAlignmentTip || generalAlignmentTip;
  const makhrajTip = detectedSubstitutionTip || fallbackCriticalTip;

  const medVezinTip = isTanwinAlifEquivalent
    ? undefined
    : analyzeVezinAndMed(cleanExp, alignment) || undefined;

  const rootGuard = isTanwinAlifEquivalent
    ? {
        finalScore: 100,
        isTriggered: false,
      }
    : applyRootConsonantGuard(
        cleanExp,
        cleanSpk,
        baseScore,
        Boolean(detectedSubstitutionTip)
      );

  // Şedde (\u0651) ve Hareke (\u064E, \u0650, \u064F) kontrolü
  const diacriticEval = evaluateDiacriticsAndShadda(
    expectedCleaned || expected,
    spokenWithNums
  );
  const rawFinalScore = Math.max(
    0,
    rootGuard.finalScore - diacriticEval.penalty
  );
  // Şedde veya hareke uyuşmazlığı tespit edildiğinde kelimenin puanını en fazla 74 (< 80) ile sınırla
  const finalScore = diacriticEval.hasMismatch
    ? Math.min(rawFinalScore, 74)
    : rawFinalScore;

  // >=80 yeşil (correct), 60-79 sarı (warning / almost), <60 kırmızı (wrong)
  // Şedde veya hareke uyuşmazlığında durum asla yeşil "correct" olamaz!
  let status: "correct" | "warning" | "wrong" = "wrong";
  if (
    finalScore >= 80 &&
    !rootGuard.isTriggered &&
    !detectedSubstitutionTip &&
    !diacriticEval.hasMismatch
  ) {
    status = "correct";
  } else if (
    finalScore >= 60 &&
    !rootGuard.isTriggered &&
    !detectedSubstitutionTip
  ) {
    status = "warning";
  } else {
    status = "wrong";
  }

  const combinedMedVezinTip =
    [diacriticEval.warning, medVezinTip].filter(Boolean).join(" · ") ||
    undefined;

  return {
    targetWord: expectedCleaned || expected,
    spokenWord: spoken,
    score: finalScore,
    status,
    makhrajTip: status === "correct" ? undefined : makhrajTip,
    makhrajWarning:
      status === "correct"
        ? undefined
        : detectedSubstitutionTip
        ? `${detectedSubstitutionTip.title} (${detectedSubstitutionTip.pair})`
        : undefined,
    medVezinTip: status === "correct" ? undefined : combinedMedVezinTip,
    diacriticWarning: diacriticEval.warning,
    diacriticsVerified: diacriticEval.diacriticsVerified,
    diacriticNote: diacriticEval.verificationNote,
    isRootGuardTriggered:
      status === "correct" ? false : rootGuard.isTriggered,
    rootGuardMessage:
      status === "correct" ? undefined : rootGuard.message,
  };
}

/**
 * İki Arapça kelime arasındaki normalize karakter benzerliğini (0.0 - 1.0) hesaplar
 * (Kelime bazlı Needleman-Wunsch / Levenshtein cümle hizalaması için kullanılır).
 */
function computeWordSimilarity(expWord: string, spkWord: string): number {
  const cExp = normalizeForComparison(expWord);
  const cSpk = normalizeForComparison(spkWord);
  if (!cExp || !cSpk) return 0;
  if (cExp === cSpk || isWordFinalTanwinAlifMatch(expWord, cExp, cSpk)) {
    return 1;
  }
  if (isFeminineKasraProlongationMatch(expWord, cExp, cSpk)) {
    return 0.85;
  }

  const alignment = alignCharacters(cExp, cSpk);
  const matches = alignment.filter((a) => a.operation === "MATCH").length;
  const maxLen = Math.max(cExp.length, cSpk.length, 1);
  return matches / maxLen;
}

/**
 * Kelime Bazlı Dinamik Programlama Hizalaması (Word-Level Needleman-Wunsch / Levenshtein Alignment).
 * Öğrenci cümle başında/ortasında 1 kelimeyi atlasa veya fazladan 1 kelime söylese bile
 * okuduğu diğer tüm kelimeleri doğru hedef kelimelerle sıfır kayma ile eşleştirir.
 */
function alignWordSequences(
  expWords: string[],
  spkWords: string[]
): {
  aligned: Array<{ expWord: string; spkWord: string }>;
  insertedWords: string[];
} {
  const m = expWords.length;
  const n = spkWords.length;

  if (m === 0) return { aligned: [], insertedWords: spkWords.slice() };
  if (n === 0) {
    return {
      aligned: expWords.map((w) => ({ expWord: w, spkWord: "" })),
      insertedWords: [],
    };
  }

  const GAP_PENALTY = -0.32;
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    Array(n + 1).fill(0)
  );
  const ptr: Array<Array<"MATCH" | "SKIP_EXP" | "SKIP_SPK">> = Array.from(
    { length: m + 1 },
    () => Array(n + 1).fill("MATCH")
  );

  for (let i = 1; i <= m; i++) {
    dp[i][0] = i * GAP_PENALTY;
    ptr[i][0] = "SKIP_EXP";
  }
  for (let j = 1; j <= n; j++) {
    dp[0][j] = j * GAP_PENALTY;
    ptr[0][j] = "SKIP_SPK";
  }

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const sim = computeWordSimilarity(expWords[i - 1], spkWords[j - 1]);
      // Benzerlik >= 0.28 ise eşleşmeyi ödüllendir, çok düşükse boşluktan biraz daha iyi/yakın tut
      const matchReward = sim >= 0.25 ? sim * 1.4 : sim - 0.45;

      const scoreMatch = dp[i - 1][j - 1] + matchReward;
      const scoreSkipExp = dp[i - 1][j] + GAP_PENALTY;
      const scoreSkipSpk = dp[i][j - 1] + GAP_PENALTY;

      if (scoreMatch >= scoreSkipExp && scoreMatch >= scoreSkipSpk) {
        dp[i][j] = scoreMatch;
        ptr[i][j] = "MATCH";
      } else if (scoreSkipExp >= scoreSkipSpk) {
        dp[i][j] = scoreSkipExp;
        ptr[i][j] = "SKIP_EXP";
      } else {
        dp[i][j] = scoreSkipSpk;
        ptr[i][j] = "SKIP_SPK";
      }
    }
  }

  const aligned: Array<{ expWord: string; spkWord: string }> = [];
  const rawInserted: string[] = [];
  let i = m;
  let j = n;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && ptr[i][j] === "MATCH") {
      aligned.push({ expWord: expWords[i - 1], spkWord: spkWords[j - 1] });
      i--;
      j--;
    } else if (i > 0 && (j === 0 || ptr[i][j] === "SKIP_EXP")) {
      aligned.push({ expWord: expWords[i - 1], spkWord: "" });
      i--;
    } else {
      // Fazladan söylenen kelime (Insertions)
      if (j > 0) {
        rawInserted.push(spkWords[j - 1]);
      }
      j--;
    }
  }

  return {
    aligned: aligned.reverse(),
    insertedWords: rawInserted.reverse(),
  };
}

/**
 * İki ardışık hedef kelimenin (örn. 'أَنَا' ve 'بِخَيْرٍ') hızlı geçişte ulanarak/yutularak
 * tek bir kelime ('نبخر' veya 'نبخه') olarak algılanıp algılanmadığını tespit eder.
 */
function detectWordLiaisonMerge(
  expWord1: string,
  expWord2: string,
  mergedSpokenWord: string
): boolean {
  const cExp1 = normalizeForComparison(expWord1);
  const cExp2 = normalizeForComparison(expWord2);
  const cSpk = normalizeForComparison(mergedSpokenWord);

  if (!cExp1 || !cExp2 || !cSpk || cSpk.length < 3) return false;

  // 1. kelimenin sonundaki med harflerini (ا/و/ي) soyarak son ünsüzünü bul (örn. انا -> ان -> ن)
  const exp1WithoutTrailingVowels = cExp1.replace(/[اوي]+$/g, "");
  const lastConsonant1 =
    exp1WithoutTrailingVowels.length > 0
      ? exp1WithoutTrailingVowels[exp1WithoutTrailingVowels.length - 1]
      : cExp1[cExp1.length - 1];

  if (!lastConsonant1) return false;

  // Algılanan birleşik kelimenin başında 1. kelimenin son ünsüzü (örn. ن veya ان) var mı?
  let remainderSpk = "";
  if (
    exp1WithoutTrailingVowels.length >= 2 &&
    cSpk.startsWith(exp1WithoutTrailingVowels)
  ) {
    remainderSpk = cSpk.slice(exp1WithoutTrailingVowels.length);
  } else if (cSpk.startsWith(lastConsonant1)) {
    remainderSpk = cSpk.slice(lastConsonant1.length);
  } else {
    return false;
  }

  if (remainderSpk.length < 2) return false;

  // Geriye kalan kısım (örn. بخر veya بخه) 2. kelimenin (بخير -> بخر) ünsüz iskeletiyle uyuşuyor mu?
  const stripInternalVowels = (w: string) =>
    w.length <= 1 ? w : w[0] + w.slice(1).replace(/[اوي]/g, "");
  const cExp2Cons = stripInternalVowels(cExp2);
  const remSpkCons = stripInternalVowels(remainderSpk);

  if (
    cExp2Cons.length >= 2 &&
    remSpkCons.length >= 2 &&
    remSpkCons.slice(0, 2) === cExp2Cons.slice(0, 2)
  ) {
    return true;
  }

  const alignment = alignCharacters(cExp2, remainderSpk);
  const matches = alignment.filter((a) => a.operation === "MATCH").length;
  const sim = matches / Math.max(cExp2.length, remainderSpk.length, 1);
  return sim >= 0.5;
}

/**
 * Hedef Arapça kelime veya cümledeki Med (uzatma: ا / و / ي / آ / ى / ٰ) ve Şedde (\u0651)
 * varlığını ve beklenen fonolojik okuma süresini (expectedPhoneticDuration) hesaplar.
 */
export function calculateExpectedPhoneticDuration(
  targetText: string,
  referenceDurationSec?: number
): {
  expectedPhoneticDuration: number;
  expectedMinDuration: number;
  hasMadd: boolean;
  hasShadda: boolean;
  maddCount: number;
  shaddaCount: number;
} {
  const cleaned = cleanDisplayText(targetText);
  const words = cleaned
    .split(/\s+/)
    .filter((w) => w.length > 0 && /[\u0600-\u06FF]/.test(w));

  let baseLetters = 0;
  let maddCount = 0;
  let shaddaCount = 0;

  for (const w of words) {
    const letters = w.match(/[\u0621-\u063A\u0641-\u064A\u0671]/g) || [];
    baseLetters += letters.length;

    const shaddas = w.match(/\u0651/g) || [];
    shaddaCount += shaddas.length;

    // Gerçek Med harfleri (cezimli يْ ve وْ Harf-i Lîn harfleri hariç!)
    maddCount += countTrueArabicMaddLetters(w);
  }

  // Her temel harf ~0.075 sn, her Med uzatması +0.20 sn, her Şedde tutması +0.18 sn
  const computedPhoneticSec = Math.max(
    0.45,
    baseLetters * 0.075 + maddCount * 0.2 + shaddaCount * 0.18
  );

  const expectedPhoneticDuration =
    referenceDurationSec && referenceDurationSec > 0.3
      ? referenceDurationSec
      : computedPhoneticSec;

  return {
    expectedPhoneticDuration,
    expectedMinDuration: expectedPhoneticDuration,
    hasMadd: maddCount > 0,
    hasShadda: shaddaCount > 0,
    maddCount,
    shaddaCount,
  };
}

/**
 * STT harekesiz metin döndürdüğünde ve hedef metinde Med veya Şedde bulunduğunda,
 * kullanıcının aktif konuşma süresini expectedMinDuration * 0.65 eşiğiyle karşılaştırır.
 */
export function evaluateAcousticMaddAndShaddaDuration(
  targetText: string,
  userActiveDurationSec?: number,
  referenceDurationSec?: number
): {
  checked: boolean;
  isShort: boolean;
  penalty: number;
  expectedMinDuration: number;
  feedbackMessage?: string;
} {
  const phoneticInfo = calculateExpectedPhoneticDuration(
    targetText,
    referenceDurationSec
  );

  if (
    (!phoneticInfo.hasMadd && !phoneticInfo.hasShadda) ||
    userActiveDurationSec === undefined ||
    !Number.isFinite(userActiveDurationSec) ||
    userActiveDurationSec <= 0
  ) {
    return {
      checked: false,
      isShort: false,
      penalty: 0,
      expectedMinDuration: phoneticInfo.expectedMinDuration,
    };
  }

  const wordCount = cleanDisplayText(targetText)
    .split(/\s+/)
    .filter((w) => w.length > 0 && /[\u0600-\u06FF]/.test(w)).length;
  const isShortSentence =
    wordCount <= 4 ||
    (referenceDurationSec !== undefined &&
      referenceDurationSec > 0 &&
      referenceDurationSec <= 3.0);

  if (
    isShortSentence &&
    userActiveDurationSec >= 0.8 &&
    userActiveDurationSec <= 3.5
  ) {
    return {
      checked: true,
      isShort: false,
      penalty: 0,
      expectedMinDuration: phoneticInfo.expectedMinDuration,
      feedbackMessage: "Akustik Med/Şedde Süresi: Uyumlu",
    };
  }

  const minRequired = phoneticInfo.expectedMinDuration * 0.65;
  if (userActiveDurationSec < minRequired) {
    return {
      checked: true,
      isShort: true,
      penalty: 0,
      expectedMinDuration: phoneticInfo.expectedMinDuration,
      feedbackMessage:
        "Akustik Süre Uyarısı: Hedef kelimedeki Med (uzatma) veya Şedde (tutma) süresi referans sese göre kısa kaldı",
    };
  }

  return {
    checked: true,
    isShort: false,
    penalty: 0,
    expectedMinDuration: phoneticInfo.expectedMinDuration,
    feedbackMessage: "Akustik Med/Şedde Süresi: Uyumlu",
  };
}

export function evaluateSentenceWords(
  expectedSentence: string,
  spokenSentence: string,
  acousticOptions?: {
    userDurationSec?: number;
    refDurationSec?: number;
  }
): SentenceEvaluationResult {
  const strippedTargetSentence =
    stripParentheticalNotesForScoring(expectedSentence);
  const normalizedSpokenWithNums = normalizeArabicNumbersInText(
    spokenSentence || "",
    strippedTargetSentence
  );

  const expWords = cleanDisplayText(strippedTargetSentence)
    .split(/\s+/)
    .filter((w) => w.length > 0 && /[\u0600-\u06FF]/.test(w));
  let spkWords = cleanDisplayText(normalizedSpokenWithNums)
    .split(/\s+/)
    .filter((w) => /[\u0600-\u06FF]/.test(w));

  if (
    !/[\u0600-\u06FF]/.test(normalizedSpokenWithNums) ||
    spkWords.length === 0
  ) {
    return {
      words: [],
      overallScore: 0,
      score: null,
      isTextRecognized: false,
      isEvaluated: false,
      confidence: "unverified",
      isRootGuardTriggered: false,
      message: "Değerlendirilemedi: Metin Çözümlenemedi",
    };
  }

  // Halüsinasyon koruması
  if (
    spkWords.length > expWords.length * 2 &&
    spkWords.length > expWords.length + 5
  ) {
    spkWords = spkWords.slice(0, expWords.length * 2);
  }

  const { aligned: alignedPairs, insertedWords } = alignWordSequences(
    expWords,
    spkWords
  );
  const wordResults: WordEvaluationResult[] = [];
  let omittedCount = 0;
  let substitutedCount = 0;
  let liaisonDetected = false;

  for (const { expWord, spkWord } of alignedPairs) {
    if (expWord && !spkWord) {
      omittedCount += 1;
      wordResults.push({
        targetWord: expWord,
        spokenWord: "",
        score: 0,
        status: "wrong",
        makhrajTip: findCriticalLetterMakhrajTip(expWord),
        medVezinTip:
          "Bu kelime cümle okunurken atlandı veya mikrofondan net duyulamadı. Kelimeye tıklayarak doğal okunuşunu dinleyip tekrar deneyebilirsiniz.",
        diacriticsVerified: false,
      });
      continue;
    }

    const res = evaluateSingleWord(expWord, spkWord);
    if (res.status !== "correct") {
      substitutedCount += 1;
    }
    wordResults.push(res);
  }

  // Kelime Birleşmesi / Ulama Teşhisi (Örn: 'أَنَا بِخَيْرٍ' -> 'نبخر' / 'نبخه')
  for (let i = 0; i < wordResults.length - 1; i++) {
    const w1 = wordResults[i];
    const w2 = wordResults[i + 1];
    const isW1EmptyAndW2Spoken = !w1.spokenWord && Boolean(w2.spokenWord);
    const isW2EmptyAndW1Spoken = Boolean(w1.spokenWord) && !w2.spokenWord;

    if (isW1EmptyAndW2Spoken || isW2EmptyAndW1Spoken) {
      const mergedSpk = (w1.spokenWord || w2.spokenWord || "").trim();
      if (detectWordLiaisonMerge(w1.targetWord, w2.targetWord, mergedSpk)) {
        liaisonDetected = true;
        omittedCount = Math.max(0, omittedCount - 1);
        substitutedCount += 1;
        const liaisonWarning = `⚠️ Kelime Ulaması / Yutma Tespiti: '${w1.targetWord}' ve '${w2.targetWord}' kelimeleri hızlı geçiş nedeniyle birleşerek ('${mergedSpk}' gibi) tek kelime olarak duyuldu. Kelime sınırlarını yutmadan, iki kelimeyi net ayırarak okuyun.`;

        wordResults[i] = {
          ...w1,
          spokenWord: `${mergedSpk} (Eksik/Birleşik)`,
          score: 45,
          status: "wrong",
          makhrajWarning: "Eksik / Birleşik Okuma (Ulama)",
          medVezinTip: liaisonWarning,
          diacriticNote: liaisonWarning,
          isRootGuardTriggered: true,
          rootGuardMessage: liaisonWarning,
        };

        wordResults[i + 1] = {
          ...w2,
          spokenWord: mergedSpk,
          score: 68,
          status: "warning",
          makhrajWarning: "Kelime Sınırı Birleşmesi",
          medVezinTip: liaisonWarning,
          diacriticNote: liaisonWarning,
          isRootGuardTriggered: false,
          rootGuardMessage: liaisonWarning,
        };
      }
    }
  }

  const totalScore = wordResults.reduce((acc, w) => acc + w.score, 0);
  const rawAverageScore =
    wordResults.length > 0 ? Math.round(totalScore / wordResults.length) : 0;

  // Fazladan söylenen kelime cezası (Insertions): 1 kelimelik hedefte 2 ekstra kelime söylendiğinde puan <= 60 olacak şekilde orantılı ceza
  const extraWordsCount = Math.max(
    insertedWords.length,
    spkWords.length - expWords.length,
    0
  );
  const extraWordPenalty =
    extraWordsCount > 0
      ? Math.min(
          60,
          Math.max(
            extraWordsCount * 15,
            Math.round((extraWordsCount / Math.max(1, expWords.length)) * 22)
          )
        )
      : 0;

  const unclampedOverallScore = Math.max(0, rawAverageScore - extraWordPenalty);
  const overallScore = liaisonDetected
    ? Math.min(unclampedOverallScore, 78)
    : unclampedOverallScore;
  const spokenHasAnyDiacritics = /[\u064B-\u0652\u0670]/.test(spokenSentence);

  // STT harekesiz metin döndürdüğünde Akustik Med/Şedde Süre Kontrolü
  const rawAcousticCheck = !spokenHasAnyDiacritics
    ? evaluateAcousticMaddAndShaddaDuration(
        strippedTargetSentence,
        acousticOptions?.userDurationSec,
        acousticOptions?.refDurationSec
      )
    : null;

  const acousticCheck =
    rawAcousticCheck &&
    overallScore >= 80 &&
    (acousticOptions?.userDurationSec ?? 1.0) >= 0.8 &&
    rawAcousticCheck.checked
      ? {
          ...rawAcousticCheck,
          isShort: false,
          penalty: 0,
          feedbackMessage: "Akustik Med/Şedde Süresi: Uyumlu",
        }
      : rawAcousticCheck;

  if (acousticCheck?.checked && acousticCheck.feedbackMessage) {
    for (const w of wordResults) {
      const wInfo = calculateExpectedPhoneticDuration(w.targetWord);
      if ((wInfo.hasMadd || wInfo.hasShadda) && !w.diacriticNote?.includes("Kesra Uzatma") && !w.diacriticNote?.includes("Kelime Ulaması")) {
        w.diacriticNote = acousticCheck.feedbackMessage;
      }
    }
  }

  const firstRootGuardWord = wordResults.find((w) => w.isRootGuardTriggered);
  const allDiacriticsVerified =
    spokenHasAnyDiacritics &&
    wordResults.length > 0 &&
    wordResults.every((w) => w.diacriticsVerified === true && !w.diacriticWarning);
  const anyDiacriticEvaluated =
    spokenHasAnyDiacritics &&
    wordResults.some(
      (w) => w.diacriticsVerified === true || Boolean(w.diacriticWarning)
    );

  const sentenceDiacriticNote = !spokenHasAnyDiacritics
    ? acousticCheck?.checked && acousticCheck.feedbackMessage
      ? acousticCheck.feedbackMessage
      : "Hareke/Şedde: STT metninde yer almadığı için doğrulanmadı"
    : allDiacriticsVerified
    ? "Harekeler ve Şedde Doğrulandı"
    : anyDiacriticEvaluated
    ? "Algılanan metinde kısmi hareke uyumu"
    : "Hareke/Şedde: STT metninde yer almadığı için doğrulanmadı";

  return {
    words: wordResults,
    overallScore,
    score: overallScore,
    isTextRecognized: true,
    isEvaluated: true,
    extraWordsCount,
    insertedWords,
    omittedCount,
    substitutedCount,
    diacriticsVerified:
      allDiacriticsVerified ||
      Boolean(acousticCheck?.checked && !acousticCheck.isShort),
    diacriticNote: sentenceDiacriticNote,
    isRootGuardTriggered: Boolean(firstRootGuardWord),
    rootGuardMessage: firstRootGuardWord?.rootGuardMessage,
  };
}

/**
 * Adaptif Hız ve Seviye Koçluğu (evaluateAdaptiveCoaching)
 * - Son 3 denemede üst üste <%60 (veya ortalama <%60) alınırsa: hızı 0.75x'e düşürmeyi ve mahreç çiftine odaklanmayı önerir.
 * - Son 6 denemede üst üste >=%85 (veya ortalama >=%85) alınırsa: bir üst CEFR seviyesine (A1 -> A2 -> B1 -> B2 -> C1) geçmeyi önerir.
 */
export function evaluateAdaptiveCoaching(
  recentScores: number[],
  currentLevel: string = "A1",
  lastMakhrajPair?: string,
  currentFluencyScore?: number
): AdaptiveCoachingResult {
  const levelOrder = ["A1", "A2", "B1", "B2"];
  const normalizedLevel =
    levelOrder.find((l) => currentLevel.toUpperCase().includes(l)) || "A1";
  const currentIdx = levelOrder.indexOf(normalizedLevel);
  const isAtMaxLevel = currentIdx >= levelOrder.length - 1;
  const nextLevel =
    currentIdx >= 0 && !isAtMaxLevel ? levelOrder[currentIdx + 1] : "B2";

  // %0 (sessiz/iptal edilmiş) denemeleri geçmiş ortalamasına dahil etme
  const validScores = recentScores.filter((s) => s > 0);
  const latest =
    validScores.length > 0
      ? validScores[validScores.length - 1]
      : recentScores[recentScores.length - 1] ?? 0;
  const effectiveFluency = currentFluencyScore ?? latest;
  const isCurrentHigh = effectiveFluency >= 75 || latest >= 85;

  if (validScores.length >= 6) {
    const last6 = validScores.slice(-6);
    const avg6 = last6.reduce((a, b) => a + b, 0) / 6;
    const allAbove85 = last6.every((s) => s >= 85);
    if (allAbove85 || avg6 >= 85) {
      if (isAtMaxLevel || nextLevel === "B2") {
        return {
          action: "level_up",
          suggestedLevel: "B2",
          message: `Harika! Son 6 telaffuz denemenizin ortalaması %${Math.round(
            avg6
          )}. B2 ileri seviye diyaloglara, Kör Dinleme veya Rol Yapma moduna geçebilirsiniz!`,
        };
      }
      return {
        action: "level_up",
        suggestedLevel: nextLevel,
        message: `Harika! Son 6 telaffuz denemenizin ortalaması %${Math.round(
          avg6
        )}. Bir üst kur olan ${nextLevel} seviyesindeki diyaloglara geçmeye hazırsınız!`,
      };
    }
  }

  // Son deneme yüksekse (Genel Akıcılık >= %75 veya Telaffuz Doğruluğu >= %85) asla "Hızı 0.75x yap" uyarısı gösterme
  if (isCurrentHigh) {
    return {
      action: "keep_going",
      message:
        "Harika gelişim! Bu denemede kelime mahreçlerini ve cümle akıcılığını çok başarılı telaffuz ettiniz.",
    };
  }

  // "Okuma hızını 0.75x moduna düşürmeniz önerilir" tavsiyesini yalnızca kullanıcının son denemesi de %70'in altındaysa göster
  if (latest < 70 && validScores.length >= 3) {
    const last3 = validScores.slice(-3);
    const avg3 = last3.reduce((a, b) => a + b, 0) / 3;
    const allUnder60 = last3.every((s) => s < 60);
    if (allUnder60 || avg3 < 60) {
      return {
        action: "slow_down",
        suggestedSpeed: 0.75,
        focusMakhrajPair: lastMakhrajPair,
        message: `Son 3 deneme ortalamanız %${Math.round(
          avg3
        )}. Okuma hızını 0.75x (Yavaş) moduna düşürüp ${
          lastMakhrajPair
            ? `özellikle (${lastMakhrajPair}) mahreç ayrımına`
            : "kelime mahreçlerine"
        } odaklanmanız önerilir.`,
      };
    }
  }

  if (latest < 70) {
    return {
      action: "slow_down",
      suggestedSpeed: 0.75,
      focusMakhrajPair: lastMakhrajPair,
      message: `Bu denemede telaffuz puanınız %${Math.round(
        latest
      )}. Okuma hızını 0.75x moduna düşürmeniz ve ${
        lastMakhrajPair
          ? `(${lastMakhrajPair}) mahreç ayrımına`
          : "kelime mahreçlerine"
      } odaklanarak tekrar denemeniz önerilir.`,
    };
  }

  return {
    action: "keep_going",
    message:
      latest >= 80
        ? "Harika gelişim! Bu denemede kelime mahreçlerini ve cümle akıcılığını çok başarılı telaffuz ettiniz."
        : "Zorlandığınız sarı veya kırmızı kelimenin üzerine tıklayarak doğal telaffuzunu dinleyin ve mahreç ipucunu inceleyip tekrar deneyin.",
  };
}

/**
 * Elif veya fiil önekiyle başlayan Arapça bir kelimenin Emir Fiil (فعل أمر) mi
 * yoksa 1. Tekil Şahıs Muzari (أَ - ben) mi olduğunu hareke ve hemze tipine göre sınıflandırır.
 */
export function classifyArabicVerbMood(
  rawWord: string
): "imperative" | "mudari_1s" | "other" {
  const cleaned = rawWord
    .replace(/^[.,!?؟،;؛:"'()\[\]{}\d]+|[.,!?؟،;؛:"'()\[\]{}\d]+$/g, "")
    .replace(/^(وَ|فَ)/, "");
  if (!cleaned) return "other";

  const startsWithKatHamzaFathaOrDamma = /^(سَ)?(أَ|أُ|آ)/.test(cleaned);
  const endsWithSukun = /\u0652$/.test(cleaned);

  if (startsWithKatHamzaFathaOrDamma && !endsWithSukun) {
    return "mudari_1s";
  }
  if (/^[اٱإ]/.test(cleaned) || endsWithSukun) {
    return "imperative";
  }
  return "other";
}

/**
 * Birleşik mazi/muzari fiil son eklerini (ـَتَانِي، ـَتْنِي، ـْنَ Nûnu'n-Nisve vb.)
 * morfolojik olarak çözümler ve Türkçe dilbilgisel açıklamasını döndürür.
 */
export function explainVerbAffixMorphology(rawWord: string): string | null {
  const bare = normalizeArabicForPronunciation(rawWord);
  if (!bare || bare.length < 4) return null;

  if (bare.endsWith("تموني")) {
    return "تُمْ (siz - mazi) + نِي (beni/bana - 1. tekil nesne zamiri)";
  }
  if (bare.endsWith("تموها") || bare.endsWith("تموه")) {
    return "تُمْ (siz - mazi) + هُ/هَا (onu - 3. tekil nesne zamiri)";
  }
  if (bare.endsWith("تكم")) {
    return "تُ (ben - mazi) + كُمْ (sizi/size - 2. çoğul nesne zamiri)";
  }
  if (bare.endsWith("تكما")) {
    return "تُ (ben - mazi) + كُمَا (ikinizi/ikinize - 2. ikil nesne zamiri)";
  }
  if (bare.endsWith("ينني")) {
    return "ينَ (sen [مؤنث] - muzari) + نِي (beni/bana - 1. tekil nesne zamiri)";
  }
  if (bare.endsWith("ونني")) {
    return "ونَ (siz/onlar - muzari) + نِي (beni/bana - 1. tekil nesne zamiri)";
  }
  if (bare.endsWith("وننا")) {
    return "ونَ (siz/onlar - muzari) + نَا (bizi/bize - 1. çoğul nesne zamiri)";
  }
  if (bare.endsWith("تاني")) {
    return "تَا (müennes ikil eki) + نِي (beni - 1. tekil nesne zamiri)";
  }
  if (bare.endsWith("تني")) {
    return "تْ (müennes mazi eki) + نِي (beni - 1. tekil nesne zamiri)";
  }
  if (/^[وف]?[يت]/.test(bare) && bare.endsWith("ن")) {
    return "نَ (cemî müennes / kadın çoğul şahıs eki: onlar)";
  }
  return null;
}