// src/lib/arabicNlpEngine.ts
// Arapça Fonetik, 38 Çiftlik Mahreç Koçluğu, 2D Levenshtein Hizalama, Kök Harf Kalkanı ve Adaptif Rehberlik Motoru

import { normalizeArabicForPronunciation } from "./arabicTextUtils";

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
  status: "correct" | "warning" | "wrong";
  makhrajTip?: MakhrajTip;
  medVezinTip?: string;
  isRootGuardTriggered?: boolean;
  rootGuardMessage?: string;
}

export interface SentenceEvaluationResult {
  words: WordEvaluationResult[];
  overallScore: number;
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
// 2. SABİTLER VE TAM 38 ÇİFTLİK MAHREÇ KARIŞIKLIK MATRİSİ
// ==============================================================================

const THROAT_LETTERS = ["ء", "أ", "إ", "ه", "ع", "ح", "غ", "خ"];
const PELTEK_LETTERS = ["ث", "ذ", "ظ"];
const KALIN_LETTERS = ["خ", "ص", "ض", "غ", "ط", "ق", "ظ"];

export const MAKHRAJ_CONFUSION_PAIRS: Array<{
  pair1: string;
  pair2: string;
  title: string;
  tip: string;
}> = [
  // 1-4: Ayn (ع) ile Hemze/Elif (ء/أ/إ/ا)
  {
    pair1: "ع",
    pair2: "ء",
    title: "Boğaz Ortası (Ayn) / Hemze Karışıklığı",
    tip: "ع harfini boğaz ortası kaslarını hafifçe daraltarak derin ve çatallı çıkarın; düz Elif/Hemze gibi okumayın.",
  },
  {
    pair1: "ع",
    pair2: "أ",
    title: "Boğaz Ortası (Ayn) / Hemze Karışıklığı",
    tip: "ع harfini boğaz ortası kaslarını hafifçe daraltarak derin ve çatallı çıkarın; düz Elif/Hemze gibi okumayın.",
  },
  {
    pair1: "ع",
    pair2: "إ",
    title: "Boğaz Ortası (Ayn) / Hemze Karışıklığı",
    tip: "ع harfini boğaz ortası kaslarını hafifçe daraltarak derin ve çatallı çıkarın; düz Elif/Hemze gibi okumayın.",
  },
  {
    pair1: "ع",
    pair2: "ا",
    title: "Boğaz Ortası (Ayn) / Hemze Karışıklığı",
    tip: "ع harfini boğaz ortası kaslarını hafifçe daraltarak derin ve çatallı çıkarın; düz Elif/Hemze gibi okumayın.",
  },
  // 5-9: Boğaz Harfleri Kendi Arasında
  {
    pair1: "ح",
    pair2: "ه",
    title: "Boğaz Ortası (Hâ) / Boğaz Dibi (He) Karışıklığı",
    tip: "ح harfini boğaz ortasını daraltarak sıcak ve güçlü bir buğu sesiyle çıkarın; göğüsten gelen cılız ه yapmayın.",
  },
  {
    pair1: "ح",
    pair2: "خ",
    title: "Temiz Hâ / Hırıltılı Hı Karışıklığı",
    tip: "ح harfinde küçük dili titretmeyin (hırıltı katmayın); خ harfinde ise boğaz üstünden hırıltılı çıkarın.",
  },
  {
    pair1: "خ",
    pair2: "غ",
    title: "Boğaz Üstü (Hı / Ğayn) Karışıklığı",
    tip: "خ nefessiz ve hırıltılıdır; غ ise ses tellerinin titrediği yumuşak Ğayn sesidir.",
  },
  {
    pair1: "غ",
    pair2: "ق",
    title: "Ğayn / Kaf Karışıklığı",
    tip: "ق harfinde dil kökünü yumuşak damağa tam vurup patlatın; غ gibi sızıcı bırakmayın.",
  },
  {
    pair1: "ع",
    pair2: "غ",
    title: "Boğaz Ortası (Ayn) / Boğaz Üstü (Ğayn) Karışıklığı",
    tip: "ع boğazın tam ortasından temiz çıkar, hırıltılı غ sesine kaydırmayın.",
  },
  // 10-13: He (ه) ile Hemze/Elif (ء/أ/إ/ا)
  {
    pair1: "ه",
    pair2: "ء",
    title: "He / Hemze Karışıklığı",
    tip: "ه harfinde nefesi kesmeyin, boğaz dibinden akıcı nefes verin.",
  },
  {
    pair1: "ه",
    pair2: "أ",
    title: "He / Hemze Karışıklığı",
    tip: "ه harfinde nefesi kesmeyin, boğaz dibinden akıcı nefes verin.",
  },
  {
    pair1: "ه",
    pair2: "إ",
    title: "He / Hemze Karışıklığı",
    tip: "ه harfinde nefesi kesmeyin, boğaz dibinden akıcı nefes verin.",
  },
  {
    pair1: "ه",
    pair2: "ا",
    title: "He / Hemze Karışıklığı",
    tip: "ه harfinde nefesi kesmeyin, boğaz dibinden akıcı nefes verin.",
  },
  // 14-17: Kalın - İnce Karışıklıkları (ق/ك, ص/س, ط/ت, ض/د)
  {
    pair1: "ق",
    pair2: "ك",
    title: "Dil Kökü Kalın (Kaf) / İnce (Kef) Karışıklığı",
    tip: "ق harfini dilin en arka kökünü üst yumuşak damağa vurarak tok ve kalın çıkarın; ön damaktan ince ك okumayın.",
  },
  {
    pair1: "ص",
    pair2: "س",
    title: "Kalın (Sad) / İnce (Sin) Karışıklığı",
    tip: "ص okurken dilin arka kısmını üst damağa kaldırarak (İsti'lâ) ıslık sesini tok ve kalın çıkarın.",
  },
  {
    pair1: "ط",
    pair2: "ت",
    title: "Kalın (Tı) / İnce (Te) Karışıklığı",
    tip: "ط harfinde dil sırtını üst damağa kapatarak (İtbak) nefesi hapsedip tok ve patlamalı çıkarın; ince ت yapmayın.",
  },
  {
    pair1: "ض",
    pair2: "د",
    title: "Kalın (Dad) / İnce (Dal) Karışıklığı",
    tip: "ض harfini dilin yan kenarını üst azı dişlerine temas ettirerek kalın ve dolgunca çıkarın; dil ucuyla ince د yapmayın.",
  },
  // 18-23: Dad (ض) ve Zı (ظ) Karışıklıkları
  {
    pair1: "ض",
    pair2: "ظ",
    title: "Azı Diş (Dad) / Peltek (Zı) Karışıklığı",
    tip: "ض harfinde dil ucu dişlerin arasına çıkmaz! Dilin yan kenarını üst azı dişlerine yaslayarak çıkarın.",
  },
  {
    pair1: "ض",
    pair2: "ذ",
    title: "Kalın (Dad) / İnce Peltek (Zel) Karışıklığı",
    tip: "ض peltek değildir; dil yanını üst azı dişlerine değdirerek tok ve kalın okuyun.",
  },
  {
    pair1: "ض",
    pair2: "ز",
    title: "Kalın (Dad) / Keskin (Ze) Karışıklığı",
    tip: "ض harfinde diş arasından ıslık/vızıltı çıkarmayın, dil yanından tok ses verin.",
  },
  {
    pair1: "ظ",
    pair2: "ز",
    title: "Kalın Peltek (Zı) / Keskin (Ze) Karışıklığı",
    tip: "ظ peltek ve kalındır; dil ucunu üst ön dişlerin ucuna değdirin ve dil kökünü kaldırın, keskin ز yapmayın.",
  },
  {
    pair1: "ظ",
    pair2: "ذ",
    title: "Kalın Peltek (Zı) / İnce Peltek (Zel) Karışıklığı",
    tip: "İkisi de peltektir ancak ظ harfinde dil arkasını üst damağa kaldırarak sesi kalınlaştırın.",
  },
  {
    pair1: "ظ",
    pair2: "ط",
    title: "Akıcı Peltek (Zı) / Patlamalı (Tı) Karışıklığı",
    tip: "ظ harfinde sesi hapsetmeyin, dil ucu ile üst diş arasından sesi akıtın.",
  },
  // 24-29: Peltek Se (ث) ve Zel (ذ) Karışıklıkları
  {
    pair1: "ث",
    pair2: "س",
    title: "Peltek (Se) / Islıklı (Sin) Karışıklığı",
    tip: "ث harfinde dil ucunu üst kesici dişlerin ucuna hafifçe değdirin; dişleri kapatıp س gibi ıslık çıkarmayın.",
  },
  {
    pair1: "ث",
    pair2: "ت",
    title: "Akıcı Peltek (Se) / Patlamalı (Te) Karışıklığı",
    tip: "ث harfinde dil ucunu diş etine kapatıp sesi patlatmayın, diş ucundan nefes akıtın.",
  },
  {
    pair1: "ث",
    pair2: "ف",
    title: "Dil Ucu Peltek (Se) / Dudak (Fe) Karışıklığı",
    tip: "ث harfini alt dudağı dişlere değdirerek değil, dil ucunu üst dişlere değdirerek çıkarın.",
  },
  {
    pair1: "ث",
    pair2: "ذ",
    title: "Nefesli Peltek (Se) / Titreşimli Peltek (Zel) Karışıklığı",
    tip: "ث harfinde ses tellerini titretmeden sadece nefes akıtın; ذ harfinde ise ses tellerini titretin.",
  },
  {
    pair1: "ذ",
    pair2: "ز",
    title: "Peltek (Zel) / Keskin (Ze) Karışıklığı",
    tip: "ذ peltektir; dil ucunu üst dişlerin ucuna değdirerek vızıltısız okuyun, keskin ز yapmayın.",
  },
  {
    pair1: "ذ",
    pair2: "د",
    title: "Akıcı Peltek (Zel) / Patlamalı (Dal) Karışıklığı",
    tip: "ذ harfinde dil ucunu diş arkasına vurup sesi kesmeyin, diş ucundan akıcı çıkarın.",
  },
  // 30-37: Islık, Dil Ortası ve Dil Ucu Karışıklıkları
  {
    pair1: "س",
    pair2: "ش",
    title: "Islıklı (Sin) / Yayvan (Şın) Karışıklığı",
    tip: "س dil ucundan dar ıslıkla, ش ise dil ortasından yayvan nefesle çıkar.",
  },
  {
    pair1: "س",
    pair2: "ز",
    title: "Nefesli (Sin) / Titreşimli (Ze) Karışıklığı",
    tip: "س harfinde ses tellerini titretmeyin; ز harfinde ses tellerini titretin.",
  },
  {
    pair1: "ص",
    pair2: "ز",
    title: "Kalın (Sad) / İnce Titreşimli (Ze) Karışıklığı",
    tip: "ص kalın ve nefessizdir, ses teli titreşimi (vızıltı) katmayın.",
  },
  {
    pair1: "ص",
    pair2: "ث",
    title: "Kalın Islıklı (Sad) / İnce Peltek (Se) Karışıklığı",
    tip: "ص harfinde dil ucunu dişlerin arasına çıkarmayın, alt diş arkasından kalın ıslık verin.",
  },
  {
    pair1: "ط",
    pair2: "د",
    title: "Kalın (Tı) / İnce (Dal) Karışıklığı",
    tip: "ط harfini dil sırtını damağa kapatarak çok daha kalın ve tok çıkarın.",
  },
  {
    pair1: "ج",
    pair2: "ش",
    title: "Patlamalı (Cim) / Sızıcı (Şın) Karışıklığı",
    tip: "ج harfinde dil ortasını üst damağa tam değdirip sesi hapsedin, ش gibi gevşek bırakıp sızdırmayın.",
  },
  {
    pair1: "ج",
    pair2: "ز",
    title: "Dil Ortası (Cim) / Diş Arası (Ze) Karışıklığı",
    tip: "ج harfini dil ortasını üst damağa vurarak çıkarın, diş arasından vızıltılı ز yapmayın.",
  },
  {
    pair1: "ج",
    pair2: "د",
    title: "Dil Ortası (Cim) / Dil Ucu (Dal) Karışıklığı",
    tip: "Dil ucunu değil, dilin ortasını üst damağa değdirerek ج çıkarın.",
  },
  // 38+: Akıcı, Geniz ve Dudak Harfleri
  {
    pair1: "ر",
    pair2: "ل",
    title: "Titrek (Ra) / Akıcı (Lam) Karışıklığı",
    tip: "ر harfinde dil ucunu damağa sabit yapıştırmayın, hafifçe titretip çekin.",
  },
  {
    pair1: "ن",
    pair2: "ر",
    title: "Genizli (Nun) / Titrek (Ra) Karışıklığı",
    tip: "ن harfinde sesi genizden (ğunne ile) çıkarın; ر harfinde ise dil ucunu titretin.",
  },
  {
    pair1: "ن",
    pair2: "ل",
    title: "Genizli (Nun) / Dil Yanı (Lam) Karışıklığı",
    tip: "ن harfindeki geniz tınısını koruyun, sesi dil yanından ل gibi akıtmayın.",
  },
  {
    pair1: "ن",
    pair2: "م",
    title: "Diş Eti (Nun) / Dudak (Mim) Karışıklığı",
    tip: "ن harfinde dudakları kapatmayın, dil ucunu üst diş etine değdirin.",
  },
  {
    pair1: "ب",
    pair2: "ف",
    title: "Çift Dudak (Be) / Diş-Dudak (Fe) Karışıklığı",
    tip: "ب harfinde iki dudağı birbirine tam kapatıp patlatın; ف harfinde üst dişleri alt dudağa değdirip nefes verin.",
  },
  {
    pair1: "ب",
    pair2: "م",
    title: "Patlamalı (Be) / Genizli (Mim) Karışıklığı",
    tip: "ب harfinde sesi genze kaçırmadan dudakları net açın.",
  },
  {
    pair1: "و",
    pair2: "ف",
    title: "Yuvarlak Dudak (Vav) / Diş-Dudak (Fe) Karışıklığı",
    tip: "و harfinde dişleri dudağa değdirmeden dudakları öne doğru yuvarlakça büzün.",
  },
  {
    pair1: "ت",
    pair2: "ة",
    title: "Açık Tâ (ت) / Yuvarlak Tâ-i Merbûta (ة) Vakıf Farkı",
    tip: "Kelime sonunda dururken ة harfi hafif bir ه nefesiyle biter; geçiş halinde veya açık ت harfinde ise dil ucuyla net ت sesi çıkarılır.",
  },
  {
    pair1: "ت",
    pair2: "ه",
    title: "Dil Ucu (Te) / Boğaz Dibi (He) Karışıklığı",
    tip: "ت harfinde dil ucunu üst diş etine vurarak net bir patlama sesi çıkarın; boğazdan ه nefesiyle geçiştirmeyin.",
  },
];

// ==============================================================================
// 3. İKİ AŞAMALI METİN NORMALİZASYONU VE YARDIMCI FONKSİYONLAR
// ==============================================================================

/**
 * 1. Aşama: Görsel Temizleme — Harekeleri KESİNLİKLE KORUR.
 * Sadece tatweel (ـ), parantez, rakam ve noktalama işaretlerini temizler.
 */
export function cleanDisplayText(text: string): string {
  return text
    .replace(/\u0640/g, "")
    .replace(/[\(\)\[\]\{\}\d]/g, "")
    .replace(/[.,،؛؟?!:"'«»…\-–—/\\]/g, "")
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
export function normalizeForComparison(text: string): string {
  return normalizeArabicForPronunciation(text);
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

  // Yaygın önekleri (ال، وال، بال، كال، لل، و، ف، ب، ل) soy
  const prefixes = ["وبال", "وال", "فال", "بال", "كال", "ولل", "لل", "ال", "و", "ف", "ب", "ل"];
  for (const pref of prefixes) {
    if (core.startsWith(pref) && core.length - pref.length >= 3) {
      core = core.slice(pref.length);
      break;
    }
  }

  // Yaygın sonekleri (zamirler, çoğul ekleri, tâ-i merbûta/ه, tenvin elifi) soy
  const suffixes = ["كم", "هم", "نا", "ها", "ات", "ون", "ين", "ان", "ه", "ك", "ي", "ا"];
  for (const suff of suffixes) {
    if (core.endsWith(suff) && core.length - suff.length >= 3) {
      core = core.slice(0, -suff.length);
      break;
    }
  }

  // 0. İstif'âl (استفعال / استفالة / استـ) Bâbı Kök Çözümlemesi:
  // "استمارة", "استراحة", "استشارة", "استقامة" gibi kelimelerde baştaki "است" 3 harfli zâid önek olup
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
  const istifalHollowMatch = core.match(/^است([^\u0627\u0648\u064A])ا([^\u0627\u0648\u064A])$/);
  if (istifalHollowMatch) {
    return `${istifalHollowMatch[1]}و${istifalHollowMatch[2]}`;
  }
  if (core.startsWith("است") && core.length >= 6) {
    const afterIst = core.slice(3).replace(/[اوي]/g, "");
    if (afterIst.length === 3) {
      return afterIst;
    }
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
export function getConsonantSkeleton(word: string): string {
  const normalized = normalizeForComparison(word).replace(
    /[^\u0600-\u06FF]/g,
    ""
  );
  if (normalized.length <= 2) return normalized;

  // مَوْعِد / مَوْقِف / مَوَاعِيد ve استمارة / استراحة gibi kalıplarda özel kök çıkarımını kullan:
  if (
    /^(ال|وال|بال|لل|و|ف|ب|ل)?موا?[^\u0627\u0648\u064A]ي?[^\u0627\u0648\u064A]/.test(normalized) ||
    /^(ال|وال|بال|لل|و|ف|ب|ل)?است/.test(normalized)
  ) {
    return extractArabicRoot(normalized);
  }

  const skeleton = normalized.replace(/[اوىي]/g, "");
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

  const medMatches = text.match(/[آ]|[\u064B-\u0652][اووي]/g);
  if (medMatches) guide.medCount = medMatches.length;

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

export function evaluateSingleWord(
  expected: string,
  spoken: string
): WordEvaluationResult {
  // 1. ÖNCE ham ünsüzleri hazırla
  const rawExp = stripDiacriticsOnly(expected);
  const rawSpk = stripDiacriticsOnly(spoken);
  // 2. SONRA fonetik ve vakıf normalizasyonunu hazırla
  const cleanExp = normalizeForComparison(expected);
  const cleanSpk = normalizeForComparison(spoken);

  const hasArabicSpoken = /[\u0600-\u06FF]/.test(cleanSpk);
  if (!hasArabicSpoken && cleanSpk.trim().length > 0) {
    return {
      targetWord: expected,
      spokenWord: "Anlaşılamadı",
      score: 0,
      status: "wrong",
      makhrajTip: findCriticalLetterMakhrajTip(expected),
      medVezinTip:
        "Mikrofondan bu kelime net algılanamadı. Doğal telaffuzunu dinleyip tekrar deneyebilirsiniz.",
    };
  }

  // Fonetik ve vakıf normalizasyonu sonrasında tam eşleşme varsa (ör. المكتبة === المكتبه, هذا === هاذا) %100 doğru kabul et
  if (cleanExp === cleanSpk) {
    return {
      targetWord: expected,
      spokenWord: spoken,
      score: 100,
      status: "correct",
    };
  }

  const alignment = alignCharacters(cleanExp, cleanSpk);
  const matchCount = alignment.filter((a) => a.operation === "MATCH").length;
  const maxLen = Math.max(cleanExp.length, cleanSpk.length, 1);
  const baseScore = Math.round((matchCount / maxLen) * 100);

  // Tam doğru (%85+ benzerlik) okunan kelimeler için "Hatalı/Dikkat Edilecek Mahreç" uyarısı çıkarma
  if (baseScore >= 85) {
    return {
      targetWord: expected,
      spokenWord: spoken,
      score: baseScore,
      status: "correct",
    };
  }

  // %85 altı (eksik/farklı okunan) kelimelerde öncelikle kritik Arapça harflere (ث، ذ، ظ، ح، ع، خ، غ، ق، ص، ض، ط، ر) odaklan
  const rawAlignment = alignCharacters(rawExp, rawSpk);
  const criticalAlignmentTip =
    findMakhrajPairFromAlignment(rawAlignment, true) ||
    findMakhrajPairFromAlignment(alignment, true);
  const fallbackCriticalTip = findCriticalLetterMakhrajTip(expected);
  const generalAlignmentTip =
    findMakhrajPairFromAlignment(rawAlignment, false) ||
    findMakhrajPairFromAlignment(alignment, false);

  const makhrajTip =
    criticalAlignmentTip || fallbackCriticalTip || generalAlignmentTip;

  const medVezinTip = analyzeVezinAndMed(cleanExp, alignment) || undefined;
  const rootGuard = applyRootConsonantGuard(
    cleanExp,
    cleanSpk,
    baseScore,
    Boolean(criticalAlignmentTip)
  );
  const finalScore = rootGuard.finalScore;

  // >=80 yeşil (correct), 60-79 sarı (warning), <60 kırmızı (wrong)
  let status: "correct" | "warning" | "wrong" = "wrong";
  if (finalScore >= 80) status = "correct";
  else if (finalScore >= 60) status = "warning";
  else status = "wrong";

  return {
    targetWord: expected,
    spokenWord: spoken,
    score: finalScore,
    status,
    makhrajTip: status === "correct" ? undefined : makhrajTip,
    medVezinTip: status === "correct" ? undefined : medVezinTip,
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
  if (cExp === cSpk) return 1;

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
): Array<{ expWord: string; spkWord: string }> {
  const m = expWords.length;
  const n = spkWords.length;

  if (m === 0) return [];
  if (n === 0) {
    return expWords.map((w) => ({ expWord: w, spkWord: "" }));
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
      // Fazladan söylenen kelime (hedef kelime listesini kaydırmaması için atlanır)
      j--;
    }
  }

  return aligned.reverse();
}

export function evaluateSentenceWords(
  expectedSentence: string,
  spokenSentence: string
): SentenceEvaluationResult {
  const expWords = cleanDisplayText(expectedSentence)
    .split(/\s+/)
    .filter((w) => w.length > 0);
  let spkWords = cleanDisplayText(spokenSentence)
    .split(/\s+/)
    .filter((w) => /[\u0600-\u06FF]/.test(w));

  // Halüsinasyon koruması
  if (
    spkWords.length > expWords.length * 2 &&
    spkWords.length > expWords.length + 5
  ) {
    spkWords = spkWords.slice(0, expWords.length * 2);
  }

  const alignedPairs = alignWordSequences(expWords, spkWords);
  const wordResults: WordEvaluationResult[] = [];
  let totalScore = 0;

  for (const { expWord, spkWord } of alignedPairs) {
    if (expWord && !spkWord) {
      wordResults.push({
        targetWord: expWord,
        spokenWord: "",
        score: 0,
        status: "wrong",
        makhrajTip: findCriticalLetterMakhrajTip(expWord),
        medVezinTip:
          "Bu kelime cümle okunurken atlandı veya mikrofondan net duyulamadı. Kelimeye tıklayarak doğal okunuşunu dinleyip tekrar deneyebilirsiniz.",
      });
      continue;
    }

    const res = evaluateSingleWord(expWord, spkWord);
    wordResults.push(res);
    totalScore += res.score;
  }

  const overallScore =
    wordResults.length > 0 ? Math.round(totalScore / wordResults.length) : 0;

  const firstRootGuardWord = wordResults.find((w) => w.isRootGuardTriggered);

  return {
    words: wordResults,
    overallScore,
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
  const levelOrder = ["A1", "A2", "B1", "B2", "C1"];
  const normalizedLevel =
    levelOrder.find((l) => currentLevel.toUpperCase().includes(l)) || "A1";
  const currentIdx = levelOrder.indexOf(normalizedLevel);
  const nextLevel =
    currentIdx >= 0 && currentIdx < levelOrder.length - 1
      ? levelOrder[currentIdx + 1]
      : "C1";

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