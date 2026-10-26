// src/lib/arabicNlpEngine.ts

// ==============================================================================
// 1. TİP TANIMLAMALARI (INTERFACES & TYPES)
// ==============================================================================

export type AlignmentOperation = 'MATCH' | 'SUBSTITUTE' | 'DELETE' | 'INSERT';

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

export interface ProactiveGuide {
  categories: string[];
  shaddaCount: number;
  medCount: number;
  tanvinCount: number;
}

export interface WordEvaluationResult {
  targetWord: string;
  spokenWord: string;
  score: number;
  status: 'correct' | 'warning' | 'wrong';
  makhrajTip?: MakhrajTip;
  medVezinTip?: string;
}

export interface SentenceEvaluationResult {
  words: WordEvaluationResult[];
  overallScore: number;
  isRootGuardTriggered: boolean;
  rootGuardMessage?: string;
}

// ==============================================================================
// 2. SABİTLER VE 38 ÇİFTLİK MAHREÇ MATRİSİ
// ==============================================================================

const THROAT_LETTERS = ['ء', 'أ', 'إ', 'ه', 'ع', 'ح', 'غ', 'خ'];
const PELTEK_LETTERS = ['ث', 'ذ', 'ظ'];
const KALIN_LETTERS = ['خ', 'ص', 'ض', 'غ', 'ط', 'ق', 'ظ'];

export const MAKHRAJ_CONFUSION_PAIRS: Array<{ pair1: string, pair2: string, title: string, tip: string }> = [
  { pair1: 'ع', pair2: 'ء', title: 'Boğaz Ortası (Ayn) / Hemze Karışıklığı', tip: 'ع harfini boğaz ortası kaslarını hafifçe daraltarak derin ve çatallı çıkarın; düz Elif/Hemze gibi okumayın.' },
  { pair1: 'ع', pair2: 'أ', title: 'Boğaz Ortası (Ayn) / Hemze Karışıklığı', tip: 'ع harfini boğaz ortası kaslarını hafifçe daraltarak derin ve çatallı çıkarın.' },
  { pair1: 'ع', pair2: 'إ', title: 'Boğaz Ortası (Ayn) / Hemze Karışıklığı', tip: 'ع harfini boğaz ortası kaslarını hafifçe daraltarak derin ve çatallı çıkarın.' },
  { pair1: 'ع', pair2: 'ا', title: 'Boğaz Ortası (Ayn) / Hemze Karışıklığı', tip: 'ع harfini boğaz ortası kaslarını hafifçe daraltarak derin ve çatallı çıkarın.' },
  { pair1: 'ح', pair2: 'ه', title: 'Boğaz Ortası (Hâ) / Boğaz Dibi (He) Karışıklığı', tip: 'ح harfini boğaz ortasını daraltarak sıcak ve güçlü bir buğu sesiyle çıkarın; göğüsten gelen cılız ه yapmayın.' },
  { pair1: 'ح', pair2: 'خ', title: 'Temiz Hâ / Hırıltılı Hı Karışıklığı', tip: 'ح harfinde küçük dili titretmeyin (hırıltı katmayın); خ harfinde ise boğaz üstünden hırıltılı çıkarın.' },
  { pair1: 'خ', pair2: 'غ', title: 'Boğaz Üstü (Hı / Ğayn) Karışıklığı', tip: 'خ nefessiz ve hırıltılıdır; غ ise ses tellerinin titrediği yumuşak Ğayn sesidir.' },
  { pair1: 'غ', pair2: 'ق', title: 'Ğayn / Kaf Karışıklığı', tip: 'ق harfinde dil kökünü yumuşak damağa tam vurup patlatın; غ gibi sızıcı bırakmayın.' },
  { pair1: 'ع', pair2: 'غ', title: 'Boğaz Ortası (Ayn) / Boğaz Üstü (Ğayn) Karışıklığı', tip: 'ع boğazın tam ortasından temiz çıkar, hırıltılı غ sesine kaydırmayın.' },
  { pair1: 'ه', pair2: 'ء', title: 'He / Hemze Karışıklığı', tip: 'ه harfinde nefesi kesmeyin, boğaz dibinden akıcı nefes verin.' },
  { pair1: 'ه', pair2: 'أ', title: 'He / Hemze Karışıklığı', tip: 'ه harfinde nefesi kesmeyin, boğaz dibinden akıcı nefes verin.' },
  { pair1: 'ه', pair2: 'إ', title: 'He / Hemze Karışıklığı', tip: 'ه harfinde nefesi kesmeyin, boğaz dibinden akıcı nefes verin.' },
  { pair1: 'ه', pair2: 'ا', title: 'He / Hemze Karışıklığı', tip: 'ه harfinde nefesi kesmeyin, boğaz dibinden akıcı nefes verin.' },
  { pair1: 'ق', pair2: 'ك', title: 'Dil Kökü Kalın (Kaf) / İnce (Kef) Karışıklığı', tip: 'ق harfini dilin en arka kökünü üst yumuşak damağa vurarak tok ve kalın çıkarın; ön damaktan ince ك okumayın.' },
  { pair1: 'ص', pair2: 'س', title: 'Kalın (Sad) / İnce (Sin) Karışıklığı', tip: 'ص okurken dilin arka kısmını üst damağa kaldırarak (İsti\'lâ) ıslık sesini tok ve kalın çıkarın.' },
  { pair1: 'ط', pair2: 'ت', title: 'Kalın (Tı) / İnce (Te) Karışıklığı', tip: 'ط harfinde dil sırtını üst damağa kapatarak (İtbak) nefesi hapsedip tok ve patlamalı çıkarın; ince ت yapmayın.' },
  { pair1: 'ض', pair2: 'د', title: 'Kalın (Dad) / İnce (Dal) Karışıklığı', tip: 'ض harfini dilin yan kenarını üst azı dişlerine temas ettirerek kalın ve dolgunca çıkarın; dil ucuyla ince د yapmayın.' },
  { pair1: 'ض', pair2: 'ظ', title: 'Azı Diş (Dad) / Peltek (Zı) Karışıklığı', tip: 'ض harfinde dil ucu dişlerin arasına çıkmaz! Dilin yan kenarını üst azı dişlerine yaslayarak çıkarın.' },
  { pair1: 'ض', pair2: 'ذ', title: 'Kalın (Dad) / İnce Peltek (Zel) Karışıklığı', tip: 'ض peltek değildir; dil yanını üst azı dişlerine değdirerek tok ve kalın okuyun.' },
  { pair1: 'ض', pair2: 'ز', title: 'Kalın (Dad) / Keskin (Ze) Karışıklığı', tip: 'ض harfinde diş arasından ıslık/vızıltı çıkarmayın, dil yanından tok ses verin.' },
  { pair1: 'ظ', pair2: 'ز', title: 'Kalın Peltek (Zı) / Keskin (Ze) Karışıklığı', tip: 'ظ peltek ve kalındır; dil ucunu üst ön dişlerin ucuna değdirin ve dil kökünü kaldırın, keskin ز yapmayın.' },
  { pair1: 'ظ', pair2: 'ذ', title: 'Kalın Peltek (Zı) / İnce Peltek (Zel) Karışıklığı', tip: 'İkisi de peltektir ancak ظ harfinde dil arkasını üst damağa kaldırarak sesi kalınlaştırın.' },
  { pair1: 'ظ', pair2: 'ط', title: 'Akıcı Peltek (Zı) / Patlamalı (Tı) Karışıklığı', tip: 'ظ harfinde sesi hapsetmeyin, dil ucu ile üst diş arasından sesi akıtın.' },
  { pair1: 'ث', pair2: 'س', title: 'Peltek (Se) / Islıklı (Sin) Karışıklığı', tip: 'ث harfinde dil ucunu üst kesici dişlerin ucuna hafifçe değdirin; dişleri kapatıp س gibi ıslık çıkarmayın.' },
  { pair1: 'ث', pair2: 'ت', title: 'Akıcı Peltek (Se) / Patlamalı (Te) Karışıklığı', tip: 'ث harfinde dil ucunu diş etine kapatıp sesi patlatmayın, diş ucundan nefes akıtın.' },
  { pair1: 'ث', pair2: 'ف', title: 'Dil Ucu Peltek (Se) / Dudak (Fe) Karışıklığı', tip: 'ث harfini alt dudağı dişlere değdirerek değil, dil ucunu üst dişlere değdirerek çıkarın.' },
  { pair1: 'ث', pair2: 'ذ', title: 'Nefesli Peltek (Se) / Titreşimli Peltek (Zel) Karışıklığı', tip: 'ث harfinde ses tellerini titretmeden sadece nefes akıtın; ذ harfinde ise ses tellerini titretin.' },
  { pair1: 'ذ', pair2: 'ز', title: 'Peltek (Zel) / Keskin (Ze) Karışıklığı', tip: 'ذ peltektir; dil ucunu üst dişlerin ucuna değdirerek vızıltısız okuyun, keskin ز yapmayın.' },
  { pair1: 'ذ', pair2: 'د', title: 'Akıcı Peltek (Zel) / Patlamalı (Dal) Karışıklığı', tip: 'ذ harfinde dil ucunu diş arkasına vurup sesi kesmeyin, diş ucundan akıcı çıkarın.' },
  { pair1: 'س', pair2: 'ش', title: 'Islıklı (Sin) / Yayvan (Şın) Karışıklığı', tip: 'س dil ucundan dar ıslıkla, ش ise dil ortasından yayvan nefesle çıkar.' },
  { pair1: 'س', pair2: 'ز', title: 'Nefesli (Sin) / Titreşimli (Ze) Karışıklığı', tip: 'س harfinde ses tellerini titretmeyin; ز harfinde ses tellerini titretin.' },
  { pair1: 'ص', pair2: 'ز', title: 'Kalın (Sad) / İnce Titreşimli (Ze) Karışıklığı', tip: 'ص kalın ve nefessizdir, ses teli titreşimi (vızıltı) katmayın.' },
  { pair1: 'ص', pair2: 'ث', title: 'Kalın Islıklı (Sad) / İnce Peltek (Se) Karışıklığı', tip: 'ص harfinde dil ucunu dişlerin arasına çıkarmayın, alt diş arkasından kalın ıslık verin.' },
  { pair1: 'ط', pair2: 'د', title: 'Kalın (Tı) / İnce (Dal) Karışıklığı', tip: 'ط harfini dil sırtını damağa kapatarak çok daha kalın ve tok çıkarın.' },
  { pair1: 'ج', pair2: 'ش', title: 'Patlamalı (Cim) / Sızıcı (Şın) Karışıklığı', tip: 'ج harfinde dil ortasını üst damağa tam değdirip sesi hapsedin, ش gibi gevşek bırakıp sızdırmayın.' },
  { pair1: 'ج', pair2: 'ز', title: 'Dil Ortası (Cim) / Diş Arası (Ze) Karışıklığı', tip: 'ج harfini dil ortasını üst damağa vurarak çıkarın, diş arasından vızıltılı ز yapmayın.' },
  { pair1: 'ج', pair2: 'د', title: 'Dil Ortası (Cim) / Dil Ucu (Dal) Karışıklığı', tip: 'Dil ucunu değil, dilin ortasını üst damağa değdirerek ج çıkarın.' },
  { pair1: 'ر', pair2: 'ل', title: 'Titrek (Ra) / Akıcı (Lam) Karışıklığı', tip: 'ر harfinde dil ucunu damağa sabit yapıştırmayın, hafifçe titretip çekin.' },
  { pair1: 'ن', pair2: 'ر', title: 'Genizli (Nun) / Titrek (Ra) Karışıklığı', tip: 'ن harfinde sesi genizden (ğunne ile) çıkarın; ر harfinde ise dil ucunu titretin.' },
  { pair1: 'ن', pair2: 'ل', title: 'Genizli (Nun) / Dil Yanı (Lam) Karışıklığı', tip: 'ن harfindeki geniz tınısını koruyun, sesi dil yanından ل gibi akıtmayın.' },
  { pair1: 'ن', pair2: 'م', title: 'Diş Eti (Nun) / Dudak (Mim) Karışıklığı', tip: 'ن harfinde dudakları kapatmayın, dil ucunu üst diş etine değdirin.' },
  { pair1: 'ب', pair2: 'ف', title: 'Çift Dudak (Be) / Diş-Dudak (Fe) Karışıklığı', tip: 'ب harfinde iki dudağı birbirine tam kapatıp patlatın; ف harfinde üst dişleri alt dudağa değdirip nefes verin.' },
  { pair1: 'ب', pair2: 'م', title: 'Patlamalı (Be) / Genizli (Mim) Karışıklığı', tip: 'ب harfinde sesi genze kaçırmadan dudakları net açın.' },
  { pair1: 'و', pair2: 'ف', title: 'Yuvarlak Dudak (Vav) / Diş-Dudak (Fe) Karışıklığı', tip: 'و harfinde dişleri dudağa değdirmeden dudakları öne doğru yuvarlakça büzün.' }
];

// ==============================================================================
// 3. METİN NORMALİZASYONU VE YARDIMCI FONKSİYONLAR
// ==============================================================================

export function cleanDisplayText(text: string): string {
  return text.replace(/\u0640/g, "").replace(/[\(\)\[\]\{\}\d]/g, "").replace(/[؟،.!؛:]/g, "").replace(/\s+/g, " ").trim();
}

export function normalizeForComparison(text: string): string {
  return text.replace(/[\u064B-\u065F\u0670]/g, "").replace(/[أإآٱ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه").replace(/\s+/g, " ").trim();
}

export function shapeArabic(text: string, maxCharsPerLine: number = 60): string {
  if (!text) return "";
  const words = text.split(" ");
  const lines = [];
  let currentLine = "";
  for (const word of words) {
    if ((currentLine + " " + word).length > maxCharsPerLine) {
      lines.push(currentLine.trim()); currentLine = word;
    } else { currentLine += " " + word; }
  }
  if (currentLine.trim()) lines.push(currentLine.trim());
  return lines.join("\n");
}

function getConsonantSkeleton(word: string): string {
  // Sadece Arapça harfleri tut, noktalama ve saçma sembolleri at
  const normalized = normalizeForComparison(word).replace(/[^\u0600-\u06FF]/g, "");
  const skeleton = normalized.replace(/[اأإآىوىي]/g, "");
  return skeleton.length >= 2 ? skeleton : normalized;
}

// ==============================================================================
// 4. PROAKTİF REHBERLİK
// ==============================================================================

export function buildProactiveMakhrajGuide(text: string): ProactiveGuide {
  const guide: ProactiveGuide = { categories: [], shaddaCount: 0, medCount: 0, tanvinCount: 0 };
  if (THROAT_LETTERS.some(l => text.includes(l))) guide.categories.push("🗣️ Boğaz (Halk) Harfleri");
  if (PELTEK_LETTERS.some(l => text.includes(l))) guide.categories.push("👅 Peltek Harfler");
  if (KALIN_LETTERS.some(l => text.includes(l))) guide.categories.push("🔊 Kalın (İsti'lâ) Harfler");
  
  const shaddaMatches = text.match(/\u0651/g); if (shaddaMatches) guide.shaddaCount = shaddaMatches.length;
  const tanvinMatches = text.match(/[\u064B-\u064D]/g); if (tanvinMatches) guide.tanvinCount = tanvinMatches.length;
  const medMatches = text.match(/[آ]|[\u064B-\u0652][اووي]/g); if (medMatches) guide.medCount = medMatches.length;
  return guide;
}

// ==============================================================================
// 5. 2D LEVENSHTEIN HİZALAMA
// ==============================================================================

export function alignCharacters(expected: string, spoken: string): AlignmentResult[] {
  const e = expected.replace(/[.,!?؟،]/g, "").trim();
  const s = spoken.replace(/[.,!?؟،]/g, "").trim();
  const m = e.length; const n = s.length;
  const dp: number[][] = Array(m + 1).fill(0).map(() => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (e[i - 1] === s[j - 1]) dp[i][j] = dp[i - 1][j - 1];
      else dp[i][j] = Math.min(dp[i - 1][j - 1] + 1, dp[i][j - 1] + 1, dp[i - 1][j] + 1);
    }
  }

  const result: AlignmentResult[] = [];
  let i = m, j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && e[i - 1] === s[j - 1]) { result.push({ expectedChar: e[i - 1], spokenChar: s[j - 1], operation: 'MATCH' }); i--; j--; }
    else if (i > 0 && j > 0 && dp[i][j] === dp[i - 1][j - 1] + 1) { result.push({ expectedChar: e[i - 1], spokenChar: s[j - 1], operation: 'SUBSTITUTE' }); i--; j--; }
    else if (j > 0 && dp[i][j] === dp[i][j - 1] + 1) { result.push({ expectedChar: null, spokenChar: s[j - 1], operation: 'INSERT' }); j--; }
    else if (i > 0 && dp[i][j] === dp[i - 1][j] + 1) { result.push({ expectedChar: e[i - 1], spokenChar: null, operation: 'DELETE' }); i--; }
  }
  return result.reverse();
}

// ==============================================================================
// 6. KÖK HARF KALKANI VE VEZİN/MED ANALİZİ
// ==============================================================================

export function applyRootConsonantGuard(expected: string, spoken: string, baseScore: number): { finalScore: number; isTriggered: boolean; message?: string } {
  const expSkeleton = getConsonantSkeleton(expected);
  const spkSkeleton = getConsonantSkeleton(spoken);

  if (expSkeleton !== spkSkeleton && expSkeleton.length > 0 && spkSkeleton.length > 0) {
    return {
      finalScore: Math.min(baseScore, 58),
      isTriggered: true,
      message: `⚠️ Kök harf değişimi tespit edildi! (Beklenen iskelet: ${expSkeleton}, Duyulan iskelet: ${spkSkeleton}). Kelimenin anlamı değiştiği için puan sınırlandırıldı.`
    };
  }
  return { finalScore: baseScore, isTriggered: false };
}

export function analyzeVezinAndMed(expected: string, alignment: AlignmentResult[]): string | null {
  const hasDelete = alignment.some(a => a.operation === 'DELETE');
  const hasInsert = alignment.some(a => a.operation === 'INSERT');
  if (!hasDelete && !hasInsert) return null;

  const medLetters = ['ا', 'و', 'ي'];
  const deletedMed = alignment.find(a => a.operation === 'DELETE' && a.expectedChar && medLetters.includes(a.expectedChar));
  if (deletedMed) return "⏳ Med (Uzatma) Eksikliği: Kelimedeki uzatma harfini 1 elif miktarı çekerek okuyun.";

  const expLen = expected.length;
  const spkLen = alignment.filter(a => a.spokenChar).length;
  if (hasInsert || (expLen >= 4 && spkLen <= 3)) return "📐 Sarf Kalıbı / Vezin Farklılığı: Kelimenin vezin kalıbını koruyarak okuyun.";
  return null;
}

// ==============================================================================
// 7. ANA DEĞERLENDİRME FONKSİYONLARI
// ==============================================================================

export function evaluateSingleWord(expected: string, spoken: string): WordEvaluationResult {
  const cleanExp = normalizeForComparison(expected);
  const cleanSpk = normalizeForComparison(spoken);

  // SAÇMALIK FİLTRESİ: Eğer duyulan kelimede Arapça harf yoksa (sadece noktalama/soru işareti ise)
  const hasArabicSpoken = /[\u0600-\u06FF]/.test(cleanSpk);
  if (!hasArabicSpoken && cleanSpk.trim().length > 0) {
    return {
      targetWord: expected,
      spokenWord: "Anlaşılamadı",
      score: 0,
      status: 'wrong',
      medVezinTip: "⚠️ Sistem Hatası: Sesiniz anlaşılamadı veya Arapça olmayan karakterler algılandı. Lütfen mikrofonu kontrol edip tekrar deneyin."
    };
  }

  if (cleanExp === cleanSpk) {
    return { targetWord: expected, spokenWord: spoken, score: 100, status: 'correct' };
  }

  const alignment = alignCharacters(cleanExp, cleanSpk);
  const matchCount = alignment.filter(a => a.operation === 'MATCH').length;
  const maxLen = Math.max(cleanExp.length, cleanSpk.length);
  let baseScore = Math.round((matchCount / maxLen) * 100);

  let makhrajTip: MakhrajTip | undefined = undefined;
  const medVezinTip = analyzeVezinAndMed(cleanExp, alignment) || undefined;

  for (const item of alignment) {
    if (item.operation === 'SUBSTITUTE' && item.expectedChar && item.spokenChar) {
      const pair = MAKHRAJ_CONFUSION_PAIRS.find(p => 
        (p.pair1 === item.expectedChar && p.pair2 === item.spokenChar) ||
        (p.pair2 === item.expectedChar && p.pair1 === item.spokenChar)
      );
      if (pair) {
        makhrajTip = { title: pair.title, tip: pair.tip, pair: `${item.expectedChar} ↔ ${item.spokenChar}` };
        break;
      }
    }
  }

  const rootGuard = applyRootConsonantGuard(cleanExp, cleanSpk, baseScore);
  const finalScore = rootGuard.finalScore;

  let status: 'correct' | 'warning' | 'wrong' = 'wrong';
  if (finalScore >= 80) status = 'correct';
  else if (finalScore >= 60) status = 'warning';

  return {
    targetWord: expected,
    spokenWord: spoken,
    score: finalScore,
    status,
    makhrajTip,
    medVezinTip,
    ...(rootGuard.isTriggered && { status: 'warning' as const, medVezinTip: rootGuard.message })
  };
}

export function evaluateSentenceWords(expectedSentence: string, spokenSentence: string): SentenceEvaluationResult {
  const expWords = expectedSentence.split(/\s+/).filter(w => w.length > 0);
  let spkWords = spokenSentence.split(/\s+/).filter(w => /[\u0600-\u06FF]/.test(w));

  // KORUMA: Eğer duyulan kelime sayısı beklenen kelime sayısının 2 katından fazlaysa (ve en az 5 kelime fazlaysa)
  // bu bir halüsinasyondur (model tekrara girmiştir). Fazla kelimeleri kes.
  if (spkWords.length > expWords.length * 2 && spkWords.length > expWords.length + 5) {
    spkWords = spkWords.slice(0, expWords.length);
  }

  const wordResults: WordEvaluationResult[] = [];
  let totalScore = 0;
  
  // Sadece beklenen cümledeki kelime sayısı kadar dön (arayüzün patlamasını engeller)
  const maxWords = expWords.length;
  
  for (let i = 0; i < maxWords; i++) {
    const expW = expWords[i] || "";
    const spkW = spkWords[i] || "";
    
    if (expW && !spkW) { 
      wordResults.push({ targetWord: expW, spokenWord: "", score: 0, status: 'wrong' }); 
      continue; 
    }

    const res = evaluateSingleWord(expW, spkW);
    wordResults.push(res);
    totalScore += res.score;
  }

  const overallScore = wordResults.length > 0 ? Math.round(totalScore / wordResults.length) : 0;

  return {
    words: wordResults,
    overallScore,
    isRootGuardTriggered: wordResults.some(w => w.medVezinTip?.includes("Kök harf değişimi"))
  };
}