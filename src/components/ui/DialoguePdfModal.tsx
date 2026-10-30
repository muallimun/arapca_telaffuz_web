"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import {
  X,
  Printer,
  FileText,
  Columns2,
  Rows2,
  AlignJustify,
  Sparkles,
  BookOpen,
  Image as ImageIcon,
  Languages,
  QrCode,
  PenTool,
  Eye,
} from "lucide-react";
import { Dialogue } from "@/types/data";
import { DialogueVocabularyEntry, getWordCategory } from "@/lib/dict";
import { extractDialogueIdioms } from "@/lib/arabicIdioms";
import { playClick, playSuccess } from "@/lib/sfxManager";
import {
  formatArabicText,
  removeArabicHarakat,
  getArabicFontConfig,
} from "@/lib/arabicTextUtils";
import { useSettings } from "@/store/settings";

interface DialoguePdfModalProps {
  dialogue: Dialogue;
  vocabEntries: DialogueVocabularyEntry[];
  imagePath: string;
  rawNum: number;
  onClose: () => void;
}

type ImagePrintMode = "hide" | "compact" | "banner";
type TranslationPrintMode = "show" | "hide" | "dotted" | "ar-dotted";
type TranslationLayout = "side-by-side" | "stacked" | "grouped-end";
type SideBySideOrder = "ar-right" | "ar-left";
type VocabPlacement = "same-page" | "new-page";
type VocabLanguageMode = "both" | "ar-only" | "tr-only";
type FitMode = "auto" | "normal" | "compact" | "ultra";
type DensityLevel = "normal" | "compact" | "tight" | "ultra";

export function stripHarakat(text: string): string {
  return removeArabicHarakat(text);
}

/**
 * Arapça kelimeyi noktalama ve harekelerden arındırarak normalize eder
 * (Boşluk doldurma eşleştirmesi için)
 */
function normalizeArabicToken(word: string): string {
  return removeArabicHarakat(word)
    .replace(/[.,!?؟،؛:"'«»()[\]\-—]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .trim();
}

/**
 * Diyalog ID'sini kontrol ederek her zaman standart iki haneli
 * https://app.muallimun.net/diyalog/dlg_XX ve app.muallimun.net/diyalog/dlg_XX
 * adreslerini üretir.
 */
export function buildDialogueQrUrl(
  id: string | number,
  fallbackRawNum?: number
): {
  dialogueUrl: string;
  shortDisplayUrl: string;
  normalizedSlug: string;
} {
  const rawStr = String(id ?? "").trim();
  let normalizedSlug = "";

  // Eğer zaten "dlg_02" veya "dlg_59" gibi en az 2 haneli dlg_XX formatındaysa doğrudan kullan
  if (/^dlg_\d{2,}$/i.test(rawStr)) {
    normalizedSlug = rawStr.toLowerCase();
  } else {
    // "dlg_2", "2", 2, 59 vb. durumlarda sayı kısmını ayıklayıp padStart(2, '0') ile tamamla
    const digitsMatch = rawStr.match(/\d+/);
    const num = digitsMatch
      ? parseInt(digitsMatch[0], 10)
      : fallbackRawNum || 1;
    const padded = String(Math.max(1, num)).padStart(2, "0");
    normalizedSlug = `dlg_${padded}`;
  }

  return {
    dialogueUrl: `https://app.muallimun.net/diyalog/${normalizedSlug}`,
    shortDisplayUrl: `app.muallimun.net/diyalog/${normalizedSlug}`,
    normalizedSlug,
  };
}

/**
 * ISO/IEC 18004 Standartlarına %100 Uyumlu Gerçek Taranabilir QR Kod (Version 3-L, 29x29, Reed-Solomon GF(256))
 * Telefon kamerasıyla okutulduğunda doğrudan https://app.muallimun.net/diyalog/dlg_XX adresini açar.
 */
function computeReedSolomonEC(data: number[], ecCount: number): number[] {
  const gfExp = new Array<number>(512);
  const gfLog = new Array<number>(256);
  let x = 1;
  for (let i = 0; i < 255; i++) {
    gfExp[i] = x;
    gfLog[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) {
    gfExp[i] = gfExp[i - 255];
  }

  const gfMul = (a: number, b: number) =>
    a === 0 || b === 0 ? 0 : gfExp[gfLog[a] + gfLog[b]];

  // Generator polynomial g(x) = prod_{i=0..ecCount-1} (x - alpha^i)
  let gen = [1];
  for (let i = 0; i < ecCount; i++) {
    const next = new Array<number>(gen.length + 1).fill(0);
    for (let j = 0; j < gen.length; j++) {
      next[j] ^= gen[j];
      next[j + 1] ^= gfMul(gen[j], gfExp[i]);
    }
    gen = next;
  }

  const msg = [...data, ...new Array<number>(ecCount).fill(0)];
  for (let i = 0; i < data.length; i++) {
    const coef = msg[i];
    if (coef !== 0) {
      for (let j = 0; j < gen.length; j++) {
        msg[i + j] ^= gfMul(gen[j], coef);
      }
    }
  }

  return msg.slice(data.length);
}

function generateQrSvgMarkup(urlText: string, size = 64): string {
  // Version 3-L: 29x29 matrix, 55 data codewords (up to 53 bytes in Byte mode), 15 EC codewords
  const N = 29;
  const DATA_CODEWORDS = 55;
  const EC_CODEWORDS = 15;

  const utf8Bytes = Array.from(new TextEncoder().encode(urlText)).slice(
    0,
    DATA_CODEWORDS - 2
  );

  // Bit buffer: Mode 0100 (4 bits) + Byte count (8 bits) + Payload + Terminator 0000
  const bits: number[] = [];
  const pushBits = (val: number, len: number) => {
    for (let i = len - 1; i >= 0; i--) {
      bits.push((val >> i) & 1);
    }
  };

  pushBits(0b0100, 4);
  pushBits(utf8Bytes.length, 8);
  for (const b of utf8Bytes) pushBits(b, 8);
  pushBits(0, Math.min(4, DATA_CODEWORDS * 8 - bits.length));
  while (bits.length % 8 !== 0) bits.push(0);

  const dataBytes: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    let b = 0;
    for (let j = 0; j < 8; j++) b = (b << 1) | bits[i + j];
    dataBytes.push(b);
  }

  let padToggle = true;
  while (dataBytes.length < DATA_CODEWORDS) {
    dataBytes.push(padToggle ? 0xec : 0x11);
    padToggle = !padToggle;
  }

  const ecBytes = computeReedSolomonEC(dataBytes, EC_CODEWORDS);
  const allCodewords = [...dataBytes, ...ecBytes];
  const fullBits: number[] = [];
  for (const cw of allCodewords) pushBits.call(null, cw, 8);
  // Pushall into fullBits
  fullBits.length = 0;
  for (const cw of allCodewords) {
    for (let i = 7; i >= 0; i--) fullBits.push((cw >> i) & 1);
  }
  // Remainder bits for Version 3 (7 zero bits)
  for (let i = 0; i < 7; i++) fullBits.push(0);

  const grid: boolean[][] = Array.from({ length: N }, () =>
    Array(N).fill(false)
  );
  const reserved: boolean[][] = Array.from({ length: N }, () =>
    Array(N).fill(false)
  );

  const placeFinder = (r0: number, c0: number) => {
    for (let r = -1; r <= 7; r++) {
      for (let c = -1; c <= 7; c++) {
        const rr = r0 + r;
        const cc = c0 + c;
        if (rr >= 0 && rr < N && cc >= 0 && cc < N) {
          reserved[rr][cc] = true;
          if (r >= 0 && r <= 6 && c >= 0 && c <= 6) {
            const isBorder = r === 0 || r === 6 || c === 0 || c === 6;
            const isInner = r >= 2 && r <= 4 && c >= 2 && c <= 4;
            grid[rr][cc] = isBorder || isInner;
          }
        }
      }
    }
  };

  placeFinder(0, 0);
  placeFinder(0, N - 7);
  placeFinder(N - 7, 0);

  // Version 3 Alignment Pattern centered at (22, 22) -> top-left (20, 20)
  for (let r = 20; r <= 24; r++) {
    for (let c = 20; c <= 24; c++) {
      reserved[r][c] = true;
      const isBorder = r === 20 || r === 24 || c === 20 || c === 24;
      const isCenter = r === 22 && c === 22;
      grid[r][c] = isBorder || isCenter;
    }
  }

  // Timing patterns
  for (let i = 8; i < N - 8; i++) {
    if (!reserved[6][i]) {
      reserved[6][i] = true;
      grid[6][i] = i % 2 === 0;
    }
    if (!reserved[i][6]) {
      reserved[i][6] = true;
      grid[i][6] = i % 2 === 0;
    }
  }

  // Reserve Format Info & Dark Module
  for (let i = 0; i < 9; i++) {
    reserved[8][i] = true;
    reserved[i][8] = true;
  }
  for (let i = 0; i < 8; i++) {
    reserved[8][N - 1 - i] = true;
    reserved[N - 1 - i][8] = true;
  }
  grid[N - 8][8] = true; // Dark module at (21, 8)

  // Place data & EC bits in 2-column upward/downward zig-zag
  let bitIdx = 0;
  let upward = true;
  for (let col = N - 1; col > 0; col -= 2) {
    if (col === 6) col--;
    for (let step = 0; step < N; step++) {
      const r = upward ? N - 1 - step : step;
      for (let dc = 0; dc < 2; dc++) {
        const c = col - dc;
        if (!reserved[r][c]) {
          const dataBit =
            bitIdx < fullBits.length ? fullBits[bitIdx] === 1 : false;
          bitIdx++;
          const mask0 = (r + c) % 2 === 0;
          grid[r][c] = dataBit !== mask0;
        }
      }
    }
    upward = !upward;
  }

  // Write Format Information for Level L (01) + Mask 0 (000) -> BCH = 0x77C4
  const formatBits = 0x77c4;
  const fBit = (i: number) => ((formatBits >> i) & 1) === 1;

  // Around top-left finder
  for (let i = 0; i <= 5; i++) grid[8][i] = fBit(i);
  grid[8][7] = fBit(6);
  grid[8][8] = fBit(7);
  grid[7][8] = fBit(8);
  for (let i = 9; i <= 14; i++) grid[14 - i][8] = fBit(i);

  // Top-right and bottom-left finders
  for (let i = 0; i <= 7; i++) grid[8][N - 1 - i] = fBit(i);
  for (let i = 8; i <= 14; i++) grid[N - 15 + i][8] = fBit(i);

  const quietZone = 2;
  const totalView = N + quietZone * 2;
  const rects: string[] = [];
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      if (grid[r][c]) {
        rects.push(
          `<rect x="${c + quietZone}" y="${
            r + quietZone
          }" width="1" height="1" fill="#0f172a" />`
        );
      }
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalView} ${totalView}" width="${size}" height="${size}" shape-rendering="crispEdges" style="display:block;background:#ffffff;border:1.5px solid #cbd5e1;border-radius:8px;">${rects.join(
    ""
  )}</svg>`;
}

export default function DialoguePdfModal({
  dialogue,
  vocabEntries,
  imagePath,
  rawNum,
  onClose,
}: DialoguePdfModalProps) {
  const { arabicFont } = useSettings();
  const fontConfig = getArabicFontConfig(arabicFont);

  // BÖLÜM 2: Seçim Çipleri / Segmented Controls State'leri
  // PDF-1: Görsel Modu ("Gizle" | "Kompakt Kart (Varsayılan)" | "Geniş Banner")
  const [imageMode, setImageMode] = useState<ImagePrintMode>("compact");
  const [imgError, setImgError] = useState<boolean>(false);

  // PDF-2: Çeviri Görünüm Modu ("Göster (Varsayılan)" | "Gizle" | "Yazı Alanı (Noktalı)")
  const [translationMode, setTranslationMode] =
    useState<TranslationPrintMode>("show");

  // PDF-3: Boşluk Doldurma (Etkinlik) Modu (Varsayılan: Kapalı)
  const [clozeMode, setClozeMode] = useState<boolean>(false);

  // PDF-4: Harekeler (Varsayılan: Açık)
  const [includeHarakat, setIncludeHarakat] = useState<boolean>(true);

  // PDF-5: Dinleme QR Kodu (Varsayılan: Açık)
  const [includeQrCode, setIncludeQrCode] = useState<boolean>(true);

  // Ek Sözlük, Kalıp İfadeler & Mizanpaj Ayarları
  const idioms = useMemo(
    () => extractDialogueIdioms(dialogue.satirlar),
    [dialogue.satirlar]
  );
  const dialogueIdioms = idioms;
  const [includeVocabulary, setIncludeVocabulary] = useState<boolean>(true);
  const [includeIdioms, setIncludeIdioms] = useState<boolean>(true);
  const [idiomsBlankMode, setIdiomsBlankMode] = useState<boolean>(false);
  const [includeWorksheet, setIncludeWorksheet] = useState<boolean>(false);
  const [includeStudentHeader, setIncludeStudentHeader] =
    useState<boolean>(false);
  const [includeAnswerKey, setIncludeAnswerKey] = useState<boolean>(true);
  const [mobileTab, setMobileTab] = useState<"settings" | "preview">("settings");
  const [vocabPlacement, setVocabPlacement] =
    useState<VocabPlacement>("same-page");
  const [vocabLanguageMode, setVocabLanguageMode] =
    useState<VocabLanguageMode>("both");
  const [translationLayout, setTranslationLayout] =
    useState<TranslationLayout>("side-by-side");
  const [translationPageBreak, setTranslationPageBreak] = useState<
    "same" | "new"
  >("same");
  const [sideBySideOrder, setSideBySideOrder] =
    useState<SideBySideOrder>("ar-right");
  const [showAdvancedLayout, setShowAdvancedLayout] = useState<boolean>(false);

  // Aşama 2.3: Üst Mod Seçici ("handout": 📄 Ders Föyü | "quiz-sheet": 📝 Çalışma & Quiz Yaprağı)
  const [pdfDocMode, setPdfDocMode] = useState<"handout" | "quiz-sheet">(
    "handout"
  );

  // Otomatik Sığdırma (Auto-Fit) Motoru State'leri
  const [fitMode, setFitMode] = useState<FitMode>("auto");
  const [activeDensity, setActiveDensity] = useState<DensityLevel>("normal");
  const a4PageRef = useRef<HTMLDivElement | null>(null);
  const targetMaxHeightRef = useRef<number>(950);

  const hasAnyBlankActivity =
    clozeMode ||
    translationMode === "dotted" ||
    translationMode === "ar-dotted" ||
    (includeVocabulary &&
      vocabEntries.length > 0 &&
      vocabLanguageMode !== "both") ||
    (includeIdioms && idioms.length > 0 && idiomsBlankMode) ||
    (includeVocabulary && includeWorksheet);

  // Herhangi bir çalışma kağıdı / boşluk modu seçildiğinde Öğrenci Bilgi Şeridi ve Cevap Anahtarını otomatik aktif et
  useEffect(() => {
    if (hasAnyBlankActivity) {
      const raf = requestAnimationFrame(() => {
        setIncludeStudentHeader(true);
        setIncludeAnswerKey(true);
      });
      return () => cancelAnimationFrame(raf);
    }
  }, [hasAnyBlankActivity]);

  // İçerik veya mizanpaj ayarları değiştiğinde fitMode'a göre başlangıç yoğunluğunu belirle
  useEffect(() => {
    const nextDensity: DensityLevel =
      fitMode === "compact"
        ? "tight"
        : fitMode === "ultra"
        ? "ultra"
        : "normal";
    const raf = requestAnimationFrame(() => {
      setActiveDensity(nextDensity);
    });
    return () => cancelAnimationFrame(raf);
  }, [
    fitMode,
    dialogue.id,
    imageMode,
    translationMode,
    clozeMode,
    includeHarakat,
    includeQrCode,
    includeVocabulary,
    includeIdioms,
    idiomsBlankMode,
    includeWorksheet,
    includeStudentHeader,
    includeAnswerKey,
    vocabPlacement,
    vocabLanguageMode,
    translationLayout,
    translationPageBreak,
    sideBySideOrder,
    arabicFont,
  ]);

  // Gerçek A4 Baskı Yüksekliği (950px / sayfa) Ölçümü ve Çok Adımlı Auto-Fit Algoritması
  useEffect(() => {
    if (fitMode !== "auto") return;
    const el = a4PageRef.current;
    if (!el) return;

    const PAGE_HEIGHT = 950;
    const evaluateOverflow = () => {
      const target = a4PageRef.current;
      if (!target) return;
      const rawScrollH = target.scrollHeight;
      const zoomFactor =
        activeDensity === "ultra"
          ? 0.92
          : activeDensity === "tight"
          ? 0.96
          : 1;
      const effectiveH = Math.round(rawScrollH * zoomFactor);

      if (activeDensity === "normal") {
        if (rawScrollH <= PAGE_HEIGHT) return;
        const remainder = rawScrollH % PAGE_HEIGHT;
        // 1 sayfa (950px) veya 2 sayfa (1900px) sınırını 1px ile 285px (1–8 satır) arasında aşıyorsa:
        if (remainder >= 1 && remainder <= 285) {
          targetMaxHeightRef.current =
            Math.floor(rawScrollH / PAGE_HEIGHT) * PAGE_HEIGHT;
          if (remainder <= 95) {
            setActiveDensity("compact");
          } else if (remainder <= 185) {
            setActiveDensity("tight");
          } else {
            setActiveDensity("ultra");
          }
        }
      } else if (activeDensity === "compact") {
        // Kademe uygulandıktan sonra hâlâ hedef sayfa sınırını aşıyorsa bir üst kademeye ("tight") yükselt
        const limit = targetMaxHeightRef.current || PAGE_HEIGHT;
        const remainder = effectiveH % PAGE_HEIGHT;
        if (
          effectiveH > limit &&
          remainder >= 1 &&
          remainder <= 285
        ) {
          setActiveDensity("tight");
        }
      } else if (activeDensity === "tight") {
        // "tight" seçildiği halde hâlâ 950px (veya 1900px) sınırını birkaç piksel aşıyorsa "ultra" kademesine yükselt
        const limit = targetMaxHeightRef.current || PAGE_HEIGHT;
        const remainder = effectiveH % PAGE_HEIGHT;
        if (
          effectiveH > limit &&
          remainder >= 1 &&
          remainder <= 285
        ) {
          setActiveDensity("ultra");
        }
      }
    };

    const rafId = requestAnimationFrame(evaluateOverflow);
    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(() => {
        evaluateOverflow();
      });
      observer.observe(el);
    }

    return () => {
      cancelAnimationFrame(rafId);
      if (observer) observer.disconnect();
    };
  }, [fitMode, activeDensity, mobileTab]);

  const printIframeRef = useRef<HTMLIFrameElement | null>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const formatAr = (text: string) =>
    formatArabicText(text, includeHarakat, arabicFont);

  // PDF-3: Diyalog cümleleri içinde vocabulary kelimelerini tespit edip boşluğa ("....................") dönüştüren motor
  const clozeData = useMemo(() => {
    if (!clozeMode) {
      return {
        processedLines: dialogue.satirlar.map((l) => l.arapca),
        helperWords: [] as string[],
      };
    }

    // Sözlükteki hedef kelimeleri normalize edilmiş halleriyle hazırla
    const targetCandidates: { norm: string; display: string }[] = [];
    for (const entry of vocabEntries) {
      const w = entry.item;
      const forms = [w.mufret, w.mazi, w.muzari, w.cemi].filter(
        (f): f is string => Boolean(f && f !== "-" && f.trim().length > 1)
      );
      for (const f of forms) {
        // Çok kelimeli ifadelerde ilk anlamlı kelimeyi veya tamamını kontrol et
        const cleanForm = f.split(/[،,/]/)[0].trim();
        const norm = normalizeArabicToken(cleanForm);
        if (norm.length >= 2) {
          targetCandidates.push({ norm, display: cleanForm });
        }
      }
    }

    const usedWords: string[] = [];
    const usedNormSet = new Set<string>();

    const processedLines = dialogue.satirlar.map((line) => {
      const tokens = line.arapca.split(/(\s+)/);
      let replacedInThisLine = false;

      const updatedTokens = tokens.map((tok) => {
        if (replacedInThisLine || /^\s+$/.test(tok)) return tok;
        const tokNorm = normalizeArabicToken(tok);
        if (tokNorm.length < 2) return tok;

        // Sözlük adaylarıyla eşleşme kontrolü (tam eşleşme veya ال takılı/zamirli gövde eşleşmesi)
        const matched = targetCandidates.find(
          (cand) =>
            cand.norm === tokNorm ||
            tokNorm === `ال${cand.norm}` ||
            (cand.norm.length >= 3 &&
              tokNorm.length >= 3 &&
              (tokNorm.startsWith(cand.norm) || tokNorm.endsWith(cand.norm)))
        );

        if (matched && !usedNormSet.has(tokNorm)) {
          replacedInThisLine = true;
          usedNormSet.add(tokNorm);
          // Cümledeki orijinal kelimeyi (noktalamasız) kelime kutusuna ekle
          const cleanOriginalWord = tok
            .replace(/[.,!?؟،؛:"'«»()]/g, "")
            .trim();
          const trailingPunct = tok.slice(cleanOriginalWord.length);
          usedWords.push(cleanOriginalWord);
          return `....................${trailingPunct}`;
        }
        return tok;
      });

      // Eğer sözlükten eşleşen kelime çıkmadıysa ve cümlede anlamlı uzun bir kelime varsa yedek olarak seç
      if (!replacedInThisLine) {
        const wordIndices = tokens
          .map((t, idx) => ({ t, idx, norm: normalizeArabicToken(t) }))
          .filter((x) => !/^\s+$/.test(x.t) && x.norm.length > 3);

        if (wordIndices.length > 0 && usedWords.length < dialogue.satirlar.length) {
          const pick =
            wordIndices[Math.min(1, wordIndices.length - 1)];
          if (!usedNormSet.has(pick.norm)) {
            usedNormSet.add(pick.norm);
            const cleanOriginalWord = pick.t
              .replace(/[.,!?؟،؛:"'«»()]/g, "")
              .trim();
            const trailingPunct = pick.t.slice(cleanOriginalWord.length);
            usedWords.push(cleanOriginalWord);
            updatedTokens[pick.idx] = `....................${trailingPunct}`;
          }
        }
      }

      return updatedTokens.join("");
    });

    // Kelime kutusu için deterministik karıştırma (shuffle)
    const shuffled = [...usedWords];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = (i * 7 + 3) % (i + 1);
      const temp = shuffled[i];
      shuffled[i] = shuffled[j];
      shuffled[j] = temp;
    }

    return {
      processedLines,
      helperWords: shuffled,
    };
  }, [clozeMode, dialogue.satirlar, vocabEntries]);

  // 5 soruluk mini çalışma kağıdı (includeWorksheet === true ise sayfa sonuna eklenir)
  const miniWorksheetQuestions = useMemo(() => {
    const stripPunct = (w: string) =>
      w.replace(/[.,!?؟،؛:"'«»()]/g, "").trim();

    const items: {
      sira: number;
      blankSentence: string;
      answer: string;
      turkce: string;
    }[] = [];

    for (const line of dialogue.satirlar) {
      if (items.length >= 5) break;
      const words = line.arapca.split(/\s+/);
      const candidate =
        words.find((w) => stripPunct(w).length > 3) ||
        words.find((w) => stripPunct(w).length > 2);
      if (candidate) {
        const cleanAns = stripPunct(candidate);
        const blankSentence = line.arapca.replace(
          candidate,
          " ...................... "
        );
        items.push({
          sira: items.length + 1,
          blankSentence,
          answer: cleanAns,
          turkce: line.turkce,
        });
      }
    }
    return items;
  }, [dialogue]);

  // Aşama 2.3: Öğretmen İçin "📝 Çalışma & Quiz Yaprağı (100 Puanlık Sınıf İçi Etkinlik / Sınav)" Otomatik Üreticisi
  const a4QuizSheetData = useMemo(() => {
    const letters = ["A", "B", "C", "D", "E", "F", "G", "H"];

    // Bölüm A — Kelime Eşleştirme (30 Puan): 6-8 önemli kelime
    const rawVocab = vocabEntries.slice(0, 7);
    const matchingSource =
      rawVocab.length >= 6
        ? rawVocab.map((v) => ({
            ar: (v.item.mufret || v.item.mazi || v.contextWord || "")
              .split("/")[0]
              .trim(),
            tr: v.item.anlam_tr,
          }))
        : [
            ...rawVocab.map((v) => ({
              ar: (v.item.mufret || v.item.mazi || v.contextWord || "")
                .split("/")[0]
                .trim(),
              tr: v.item.anlam_tr,
            })),
            ...dialogue.satirlar.slice(0, 6).map((l) => ({
              ar: l.arapca.split(/\s+/)[0] || l.arapca,
              tr: l.turkce.split(/\s+/).slice(0, 2).join(" "),
            })),
          ].slice(0, 6);

    // Sağ sütundaki Türkçe anlamları deterministik olarak karıştır
    const shuffledIndices = matchingSource.map((_, i) => i);
    for (let i = shuffledIndices.length - 1; i > 0; i--) {
      const j = (i * 5 + 2) % (i + 1);
      const tmp = shuffledIndices[i];
      shuffledIndices[i] = shuffledIndices[j];
      shuffledIndices[j] = tmp;
    }

    const sectionAMatching = matchingSource.map((item, idx) => {
      const rightMeaningIdx = shuffledIndices[idx];
      const correctLetterPos = shuffledIndices.indexOf(idx);
      const correctLetter = letters[correctLetterPos] || "A";
      return {
        num: idx + 1,
        arabic: item.ar,
        letter: letters[idx] || String(idx + 1),
        shuffledTr: matchingSource[rightMeaningIdx]?.tr || item.tr,
        correctLetter,
        correctTr: item.tr,
      };
    });

    // Bölüm B — Boşluk Doldurma (40 Puan): 5 cümle + üstte karışık Kelime Havuzu
    const sectionBFillBlanks = miniWorksheetQuestions.slice(0, 5);
    const wordBank = [...sectionBFillBlanks.map((q) => q.answer)];
    for (let i = wordBank.length - 1; i > 0; i--) {
      const j = (i * 3 + 1) % (i + 1);
      const tmp = wordBank[i];
      wordBank[i] = wordBank[j];
      wordBank[j] = tmp;
    }

    // Bölüm C — Kalıp İfadeler ve Anlama (30 Puan): 3-4 çoktan seçmeli/çeviri sorusu
    const sectionCMultipleChoice: {
      num: number;
      typeLabel: string;
      arabicPrompt: string;
      questionTr: string;
      options: { letter: string; text: string }[];
      correctLetter: string;
      correctText: string;
    }[] = [];

    const allLineTrs = dialogue.satirlar.map((l) => l.turkce);
    const idiomPool = dialogueIdioms.slice(0, 2);

    idiomPool.forEach((idm, idx) => {
      const distractors = [
        ...dialogueIdioms
          .filter((o) => o.id !== idm.id)
          .map((o) => o.meaningTr),
        ...allLineTrs.filter((t) => t !== idm.meaningTr),
        "Nasılsınız, iyi misiniz?",
        "Yarın görüşmek üzere.",
      ].slice(idx * 2, idx * 2 + 2);
      const rawOpts = [idm.meaningTr, ...distractors].slice(0, 3);
      // Deterministik şık sıralaması
      const rot = (idx + 1) % rawOpts.length;
      const ordered = [
        ...rawOpts.slice(rot),
        ...rawOpts.slice(0, rot),
      ];
      const cIdx = ordered.indexOf(idm.meaningTr);
      const optLetters = ["A", "B", "C"];
      sectionCMultipleChoice.push({
        num: sectionCMultipleChoice.length + 1,
        typeLabel: "Kalıp İfade",
        arabicPrompt: idm.matchedPhrase || idm.arabic,
        questionTr: "Yukarıdaki kalıp ifadenin Türkçe anlamı hangisidir?",
        options: ordered.map((t, oIdx) => ({
          letter: optLetters[oIdx] || "A",
          text: t,
        })),
        correctLetter: optLetters[cIdx >= 0 ? cIdx : 0],
        correctText: idm.meaningTr,
      });
    });

    // Kalan soruları diyalog cümlelerinden tamamla (toplam 4 soru)
    for (
      let i = 0;
      i < dialogue.satirlar.length && sectionCMultipleChoice.length < 4;
      i++
    ) {
      const ln = dialogue.satirlar[i];
      const otherLines = dialogue.satirlar
        .filter((o) => o.sira !== ln.sira)
        .map((o) => o.turkce);
      const distractors = [
        otherLines[i % Math.max(1, otherLines.length)] ||
          "Memnun oldum, teşekkür ederim.",
        otherLines[(i + 2) % Math.max(1, otherLines.length)] ||
          "Evet, bugün hava çok güzel.",
      ];
      const rawOpts = Array.from(
        new Set([
          ln.turkce,
          ...distractors,
          "Affedersiniz, yardımcı olabilir misiniz?",
        ])
      ).slice(0, 3);
      const rot = (i + 2) % rawOpts.length;
      const ordered = [
        ...rawOpts.slice(rot),
        ...rawOpts.slice(0, rot),
      ];
      const cIdx = ordered.indexOf(ln.turkce);
      const optLetters = ["A", "B", "C"];
      sectionCMultipleChoice.push({
        num: sectionCMultipleChoice.length + 1,
        typeLabel: `Diyalog Anlama (Cümle #${ln.sira})`,
        arabicPrompt: ln.arapca,
        questionTr: "Diyalogda geçen bu cümlenin doğru Türkçe çevirisi hangisidir?",
        options: ordered.map((t, oIdx) => ({
          letter: optLetters[oIdx] || "A",
          text: t,
        })),
        correctLetter: optLetters[cIdx >= 0 ? cIdx : 0],
        correctText: ln.turkce,
      });
    }

    return {
      sectionAMatching,
      sectionBFillBlanks,
      wordBank,
      sectionCMultipleChoice,
    };
  }, [vocabEntries, dialogue, miniWorksheetQuestions, dialogueIdioms]);

  const { dialogueUrl, shortDisplayUrl } = useMemo(
    () => buildDialogueQrUrl(dialogue.id, rawNum),
    [dialogue.id, rawNum]
  );

  const qrBoxPixelSize =
    activeDensity === "ultra"
      ? 56
      : activeDensity === "tight"
      ? 64
      : activeDensity === "compact"
      ? 80
      : 96;

  const qrSvgMarkup = useMemo(
    () => generateQrSvgMarkup(dialogueUrl, qrBoxPixelSize),
    [dialogueUrl, qrBoxPixelSize]
  );

  const effectiveImageMode: ImagePrintMode = imgError ? "hide" : imageMode;

  const handleGenerateAndPrintPdf = () => {
    playClick();
    playSuccess();

    const formattedDate = new Date().toLocaleDateString("tr-TR", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });

    const absoluteImgUrl =
      typeof window !== "undefined"
        ? `${window.location.origin}${imagePath}`
        : imagePath;

    const speakers = Array.from(
      new Set(dialogue.satirlar.map((l) => l.konusmaci))
    );

    // Kelime Kutusu (الكلمات المساعدة) — Boşluk Doldurma Modu Aktifse
    const helperWordsBoxHtml =
      clozeMode && clozeData.helperWords.length > 0
        ? `
        <div class="helper-words-box">
          <div class="helper-words-header">
            <span>✏️ Kelime Kutusu (boşlukları aşağıdaki kelimelerle doldurunuz)</span>
            <span class="helper-words-ar-title" dir="rtl">الكلمات المساعدة</span>
          </div>
          <div class="helper-words-items" dir="rtl">
            ${clozeData.helperWords
              .map(
                (w) =>
                  `<span class="helper-word-chip">${formatAr(w)}</span>`
              )
              .join("")}
          </div>
        </div>
      `
        : "";

    // Türkçe hücresi veya noktalı yazı alanı üretici
    const renderTrContentHtml = (line: Dialogue["satirlar"][0], badgeCls: string) => {
      if (translationMode === "dotted") {
        return `
          <div class="tr-dotted-wrap">
            <span class="speaker-tr ${badgeCls}">${line.konusmaci}:</span>
            <div class="tr-dotted-line">........................................................................</div>
          </div>
        `;
      }
      return `
        <span class="speaker-tr ${badgeCls}">${line.konusmaci}</span>
        <span class="tr-text">${line.turkce}</span>
      `;
    };

    // Arapça hücresi veya geniş/yüksek noktalı yazım kutusu üretici
    const renderArContentHtml = (
      line: Dialogue["satirlar"][0],
      badgeCls: string,
      arLineText: string,
      numbered?: boolean
    ) => {
      const speakerLabel = numbered
        ? `${line.sira}. ${formatAr(line.konusmaci_ar)}`
        : formatAr(line.konusmaci_ar);
      if (translationMode === "ar-dotted") {
        return `
          <div class="ar-dotted-wrap" dir="rtl">
            <span class="speaker-ar ${badgeCls}">${speakerLabel}</span>
            <div class="ar-dotted-box">................................................................................</div>
          </div>
        `;
      }
      return `
        <span class="speaker-ar ${badgeCls}">${speakerLabel}</span>
        <span class="ar-text">${formatAr(arLineText)}</span>
      `;
    };

    // Cümle satırları HTML üretimi
    let dialogueBodyHtml = "";

    if (translationMode === "hide") {
      // Sadece Arapça (hiçbir çeviri boşluk modu aktif değilse)
      dialogueBodyHtml = `
        <div class="lines-container">
          ${dialogue.satirlar
            .map((line, idx) => {
              const spIdx = speakers.indexOf(line.konusmaci);
              const badgeCls =
                spIdx % 2 === 0 ? "sp-badge-emerald" : "sp-badge-indigo";
              const rowBg = idx % 2 === 0 ? "#f8fafc" : "#ffffff";
              const arLineText = clozeData.processedLines[idx] || line.arapca;
              return `
                <div class="line-row single-ar" style="background: ${rowBg};">
                  <div class="ar-col" dir="rtl">
                    ${renderArContentHtml(line, badgeCls, arLineText)}
                  </div>
                </div>
              `;
            })
            .join("")}
        </div>
      `;
    } else if (translationLayout === "side-by-side") {
      const isArRight = sideBySideOrder === "ar-right";
      const trHeaderTitle =
        translationMode === "dotted"
          ? "Türkçe Tercüme (Yazı Alanı)"
          : "Türkçe Tercüme";
      const arHeaderTitle =
        translationMode === "ar-dotted"
          ? "النَّصُّ الْعَرَبِيُّ (Arapça Yazım Alanı)"
          : "النَّصُّ الْعَرَبِيُّ (Arapça Metin)";

      dialogueBodyHtml = `
        <table class="two-col-table" dir="ltr">
          <thead>
            <tr>
              ${
                isArRight
                  ? `
                <th style="width: 50%; text-align: left;" dir="ltr">${trHeaderTitle}</th>
                <th style="width: 50%; text-align: right;" dir="rtl">${arHeaderTitle}</th>
              `
                  : `
                <th style="width: 50%; text-align: right;" dir="rtl">${arHeaderTitle}</th>
                <th style="width: 50%; text-align: left;" dir="ltr">${trHeaderTitle}</th>
              `
              }
            </tr>
          </thead>
          <tbody>
            ${dialogue.satirlar
              .map((line, idx) => {
                const spIdx = speakers.indexOf(line.konusmaci);
                const badgeCls =
                  spIdx % 2 === 0 ? "sp-badge-emerald" : "sp-badge-indigo";
                const rowBg = idx % 2 === 0 ? "#f8fafc" : "#ffffff";
                const arLineText = clozeData.processedLines[idx] || line.arapca;

                const arCellHtml = `
                  <td class="ar-cell" dir="rtl">
                    ${renderArContentHtml(line, badgeCls, arLineText)}
                  </td>
                `;
                const trCellHtml = `
                  <td class="tr-cell" dir="ltr">
                    ${renderTrContentHtml(line, badgeCls)}
                  </td>
                `;

                return `
                  <tr style="background: ${rowBg};">
                    ${
                      isArRight
                        ? `${trCellHtml}${arCellHtml}`
                        : `${arCellHtml}${trCellHtml}`
                    }
                  </tr>
                `;
              })
              .join("")}
          </tbody>
        </table>
      `;
    } else if (translationLayout === "stacked") {
      dialogueBodyHtml = `
        <div class="lines-container">
          ${dialogue.satirlar
            .map((line, idx) => {
              const spIdx = speakers.indexOf(line.konusmaci);
              const badgeCls =
                spIdx % 2 === 0 ? "sp-badge-emerald" : "sp-badge-indigo";
              const rowBg = idx % 2 === 0 ? "#f8fafc" : "#ffffff";
              const arLineText = clozeData.processedLines[idx] || line.arapca;
              return `
                <div class="stacked-card" style="background: ${rowBg};">
                  <div class="ar-col" dir="rtl">
                    ${renderArContentHtml(line, badgeCls, arLineText)}
                  </div>
                  <div class="tr-col" dir="ltr">
                    ${renderTrContentHtml(line, badgeCls)}
                  </div>
                </div>
              `;
            })
            .join("")}
        </div>
      `;
    } else {
      // Sonda Toplu (grouped-end)
      const trPageBreakStyle =
        translationPageBreak === "new"
          ? "page-break-before: always; break-before: page; margin-top: 0; padding-top: 6px;"
          : "margin-top: 18px; page-break-inside: avoid;";

      dialogueBodyHtml = `
        <div class="section-block">
          <div class="section-title">1. Arapça Diyalog Metni (النَّصُّ الْعَرَبِيُّ)</div>
          <div class="lines-container">
            ${dialogue.satirlar
              .map((line, idx) => {
                const spIdx = speakers.indexOf(line.konusmaci);
                const badgeCls =
                  spIdx % 2 === 0 ? "sp-badge-emerald" : "sp-badge-indigo";
                const rowBg = idx % 2 === 0 ? "#f8fafc" : "#ffffff";
                const arLineText = clozeData.processedLines[idx] || line.arapca;
                return `
                  <div class="line-row single-ar" style="background: ${rowBg};">
                    <div class="ar-col" dir="rtl">
                      ${renderArContentHtml(line, badgeCls, arLineText, true)}
                    </div>
                  </div>
                `;
              })
              .join("")}
          </div>
        </div>
        <div class="section-block" style="${trPageBreakStyle}">
          <div class="section-title">Diyalog Tercümeleri (الترجمة التركية)</div>
          <div class="end-tr-list">
            ${dialogue.satirlar
              .map((line) =>
                translationMode === "dotted"
                  ? `
              <div class="end-tr-item">
                <strong>${line.sira}. ${line.konusmaci}:</strong>
                <div class="tr-dotted-line" style="display:inline-block;width:75%;vertical-align:bottom;">......................................................</div>
              </div>
            `
                  : `
              <div class="end-tr-item">
                <strong>${line.sira}. ${line.konusmaci}:</strong> ${line.turkce}
              </div>
            `
              )
              .join("")}
          </div>
        </div>
      `;
    }

    // Opsiyonel: 📚 Diyalog Kelime Hazinesi (المفردات) — 2 Sütunlu Şık Tablo
    let vocabSectionHtml = "";
    if (includeVocabulary && vocabEntries.length > 0) {
      const vocabCells = vocabEntries.map((entry) => {
        const w = entry.item;
        const mainAr = w.mufret || w.mazi || "";
        const category = getWordCategory(w);
        const badgeHtml =
          category === "fiil"
            ? `<span class="pos-badge pos-fiil">Fiil</span>`
            : category === "edat"
            ? `<span class="pos-badge pos-edat">Edat</span>`
            : `<span class="pos-badge pos-isim">İsim</span>`;
        const rootText =
          w.kok && w.kok !== "-" ? `Kök: ${formatAr(w.kok)}` : "";

        const trDisplayHtml =
          vocabLanguageMode === "ar-only"
            ? `<div class="vocab-dotted-blank" title="Türkçe anlamı yazınız">............................................</div>`
            : `<div class="vocab-meaning">${w.anlam_tr}</div>`;

        const arDisplayHtml =
          vocabLanguageMode === "tr-only"
            ? `<div class="vocab-dotted-blank-ar" dir="rtl" title="Arapça karşılığını yazınız">....................................</div>`
            : `<span class="vocab-ar">${formatAr(mainAr)}</span>`;

        return `
          <div class="vocab-grid-card">
            <div class="vocab-left">
              <div class="vocab-meta-row">
                ${badgeHtml}
                ${
                  rootText && vocabLanguageMode !== "tr-only"
                    ? `<span class="vocab-root" dir="rtl">${rootText}</span>`
                    : ""
                }
              </div>
              ${trDisplayHtml}
            </div>
            <div class="vocab-right" dir="rtl">
              ${arDisplayHtml}
            </div>
          </div>
        `;
      });

      const pageBreakStyle =
        vocabPlacement === "new-page"
          ? "page-break-before: always; margin-top: 0; padding-top: 4px;"
          : "margin-top: 18px; page-break-inside: avoid;";

      const modeSubtitle =
        vocabLanguageMode === "ar-only"
          ? " • Kelime Anlam Testi (Türkçesini Yazınız)"
          : vocabLanguageMode === "tr-only"
          ? " • Arapça İmla Testi (Arapçasını Yazınız)"
          : "";

      vocabSectionHtml = `
        <div class="section-block" style="${pageBreakStyle}">
          <div class="section-title">📚 Diyalog Kelime Hazinesi (المفردات) — ${
            vocabEntries.length
          } Kelime${modeSubtitle}</div>
          <div class="vocab-two-col-grid">
            ${vocabCells.join("")}
          </div>
        </div>
      `;
    }

    // Opsiyonel: ✨ Bu Diyalogdaki Kalıp İfadeler (التعبيرات الاصطلاحية) Tablosu
    let idiomsSectionHtml = "";
    if (includeIdioms && idioms.length > 0) {
      const idiomRowsHtml = idioms
        .map((idm, idx) => {
          const rowBg = idx % 2 === 0 ? "#f8fafc" : "#ffffff";
          const meaningCellHtml = idiomsBlankMode
            ? `<div class="idiom-dotted-line">......................................................</div>`
            : `<strong>${idm.meaningTr}</strong>`;
          return `
            <tr style="background: ${rowBg};">
              <td class="idiom-ar-cell" dir="rtl">${formatAr(idm.arabic)}</td>
              <td class="idiom-tr-cell" dir="ltr">${meaningCellHtml}</td>
              <td class="idiom-note-cell" dir="ltr">
                <div><strong>Harfiyen:</strong> ${idm.literalTr}</div>
                <div style="color:#475569;margin-top:2px;">💡 ${idm.usageNote}</div>
              </td>
            </tr>
          `;
        })
        .join("");

      idiomsSectionHtml = `
        <div class="section-block" style="margin-top: 18px; page-break-inside: avoid;">
          <div class="section-title" style="border-left-color: #6741d9; color: #4c28b5;">
            ✨ Bu Diyalogdaki Kalıp İfadeler (التعبيرات الاصطلاحية) — ${
              idioms.length
            } İfade${
        idiomsBlankMode ? " • Çalışma Kağıdı (Deyimsel Anlamı Yazınız)" : ""
      }
          </div>
          <table class="idioms-table" dir="ltr">
            <thead>
              <tr>
                <th style="width: 30%; text-align: right;" dir="rtl">1. Kalıp İfade (Arapça)</th>
                <th style="width: 30%; text-align: left;">2. Deyimsel Anlamı (Türkçe)</th>
                <th style="width: 40%; text-align: left;">3. Harfiyen Anlamı & Kullanım İpucu</th>
              </tr>
            </thead>
            <tbody>
              ${idiomRowsHtml}
            </tbody>
          </table>
        </div>
      `;
    }

    // Opsiyonel: Ek 5 Soruluk Çalışma Soruları
    let worksheetSectionHtml = "";
    if (includeWorksheet && miniWorksheetQuestions.length > 0) {
      const worksheetRows = miniWorksheetQuestions
        .map(
          (q) => `
          <div class="quiz-row">
            <div class="quiz-ar" dir="rtl">
              <strong>${q.sira}.</strong> ${formatAr(q.blankSentence)}
            </div>
            ${
              translationMode === "show"
                ? `<div class="quiz-tr">İpucu: “${q.turkce}”</div>`
                : ""
            }
          </div>
        `
        )
        .join("");

      const wordBank = miniWorksheetQuestions
        .map((q) => formatAr(q.answer))
        .join("  •  ");

      worksheetSectionHtml = `
        <div class="section-block" style="margin-top: 18px; page-break-inside: avoid;">
          <div class="section-title">✏️ Ek Çalışma Soruları (${miniWorksheetQuestions.length} Soru)</div>
          <div class="word-bank" dir="rtl">
            <strong>Kelime Havuzu:</strong> ${wordBank}
          </div>
          <div class="quiz-list">
            ${worksheetRows}
          </div>
        </div>
      `;
    }

    // Öğrenci Bilgi Şeridi (Ad-Soyad / Sınıf / Tarih / Puan)
    const studentHeaderHtml = includeStudentHeader
      ? `
        <div class="student-info-strip">
          <span><strong>Adı Soyadı:</strong> ....................................</span>
          <span><strong>Sınıf / No:</strong> ....................</span>
          <span><strong>Tarih:</strong> .... / .... / 2026</span>
          <span><strong>Puan:</strong> .........</span>
        </div>
      `
      : "";

    // 🗝️ Cevap Anahtarı (Sadece herhangi bir boşluklu etkinlik aktifse ve includeAnswerKey açıksa basılır)
    let answerKeySectionHtml = "";
    if (hasAnyBlankActivity && includeAnswerKey) {
      const parts: string[] = [];

      if (clozeMode && clozeData.helperWords.length > 0) {
        const orderedMissing = dialogue.satirlar
          .map((l, i) => {
            const p = clozeData.processedLines[i] || "";
            if (!p.includes("....................")) return null;
            return `${l.sira}) ${formatAr(l.arapca)}`;
          })
          .filter(Boolean)
          .join(" &nbsp;|&nbsp; ");
        parts.push(
          `<div class="ak-item"><strong>Diyalog Boşluk Doldurma:</strong> <span dir="rtl" class="ak-ar">${orderedMissing}</span></div>`
        );
      }

      if (includeIdioms && idioms.length > 0 && idiomsBlankMode) {
        const idiomAnswers = idioms
          .map((idm, idx) => `${idx + 1}) ${idm.meaningTr}`)
          .join(" &nbsp;•&nbsp; ");
        parts.push(
          `<div class="ak-item"><strong>Kalıp İfadeler:</strong> ${idiomAnswers}</div>`
        );
      }

      if (
        includeVocabulary &&
        vocabEntries.length > 0 &&
        vocabLanguageMode !== "both"
      ) {
        const vocabAnswers = vocabEntries
          .map((e, idx) => {
            const w = e.item;
            const mainAr = w.mufret || w.mazi || "";
            return vocabLanguageMode === "ar-only"
              ? `${idx + 1}) ${w.anlam_tr}`
              : `${idx + 1}) <span dir="rtl" class="ak-ar">${formatAr(mainAr)}</span>`;
          })
          .join(" &nbsp;•&nbsp; ");
        parts.push(
          `<div class="ak-item"><strong>Kelime Tablosu:</strong> ${vocabAnswers}</div>`
        );
      }

      if (includeWorksheet && miniWorksheetQuestions.length > 0) {
        const wsAnswers = miniWorksheetQuestions
          .map(
            (q) =>
              `${q.sira}) <span dir="rtl" class="ak-ar">${formatAr(q.answer)}</span>`
          )
          .join(" &nbsp;•&nbsp; ");
        parts.push(
          `<div class="ak-item"><strong>Ek Çalışma Soruları:</strong> ${wsAnswers}</div>`
        );
      }

      if (translationMode === "dotted") {
        const trAnswers = dialogue.satirlar
          .map((l) => `${l.sira}) ${l.turkce}`)
          .join(" &nbsp;|&nbsp; ");
        parts.push(
          `<div class="ak-item"><strong>Diyalog Türkçe Tercümeleri:</strong> ${trAnswers}</div>`
        );
      } else if (translationMode === "ar-dotted") {
        const arAnswers = dialogue.satirlar
          .map(
            (l) =>
              `${l.sira}) <span dir="rtl" class="ak-ar">${formatAr(l.arapca)}</span>`
          )
          .join(" &nbsp;|&nbsp; ");
        parts.push(
          `<div class="ak-item"><strong>Diyalog Arapça Metinleri:</strong> ${arAnswers}</div>`
        );
      }

      if (parts.length > 0) {
        answerKeySectionHtml = `
          <div class="answer-key-block">
            <div class="answer-key-title">🗝️ Cevap Anahtarı (مِفْتَاحُ الْإِجَابَات)</div>
            <div class="answer-key-body">
              ${parts.join("")}
            </div>
          </div>
        `;
      }
    }

    // Görsel & QR Kod HTML blokları
    const compactImageHtml =
      effectiveImageMode === "compact"
        ? `<img src="${absoluteImgUrl}" alt="${dialogue.baslik_tr}" loading="eager" class="cover-img-compact" onerror="this.style.display='none'" />`
        : "";

    const bannerImageHtml =
      effectiveImageMode === "banner"
        ? `<div class="banner-img-wrap"><img src="${absoluteImgUrl}" alt="${dialogue.baslik_tr}" loading="eager" class="cover-img-banner" onerror="this.parentElement.style.display='none'" /></div>`
        : "";

    const qrBlockHtml = includeQrCode
      ? `
        <a href="${dialogueUrl}" target="_blank" rel="noopener noreferrer" class="qr-code-container" title="${dialogueUrl}">
          ${qrSvgMarkup}
          <span class="qr-caption">Dinlemek için okutun</span>
          <span class="qr-short-url">${shortDisplayUrl}</span>
        </a>
      `
      : "";

    const hasHeaderRight =
      effectiveImageMode === "compact" || includeQrCode;

    const htmlDocument = `
      <!DOCTYPE html>
      <html lang="tr">
      <head>
        <meta charset="UTF-8" />
        <title>Diyalog #${String(rawNum).padStart(2, "0")} - ${
      dialogue.baslik_tr
    } | www.muallimun.net</title>
        <link rel="preconnect" href="https://fonts.googleapis.com">
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
        <link href="https://fonts.googleapis.com/css2?family=Amiri:wght@400;700&family=Lateef:wght@400;700&family=Noto+Naskh+Arabic:wght@400;700&family=Plus+Jakarta+Sans:wght@400;600;700;800&family=Scheherazade+New:wght@400;700&display=swap" rel="stylesheet">
        <style>
          @font-face {
            font-family: "ArakomFont";
            src: url("${
              typeof window !== "undefined" ? window.location.origin : ""
            }/fonts/Arakom-Regular.ttf") format("truetype");
            font-weight: 400;
            font-style: normal;
          }
          @font-face {
            font-family: "ArakomFont";
            src: url("${
              typeof window !== "undefined" ? window.location.origin : ""
            }/fonts/Arakom-Bold.ttf") format("truetype");
            font-weight: 700;
            font-style: normal;
          }
          @page {
            size: A4 portrait;
            margin: ${
              activeDensity === "ultra"
                ? "8mm"
                : activeDensity === "tight"
                ? "9.5mm 11mm 10mm 11mm"
                : "11mm 13mm 14mm 13mm"
            };
          }
          * {
            box-sizing: border-box;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          body {
            font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif;
            color: #1f1a14;
            background: #ffffff;
            margin: 0;
            padding: 0;
            font-size: 12px;
            line-height: 1.5;
          }
          .header-card {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 14px;
            border: 2px solid #0ca678;
            border-bottom-width: 4px;
            border-radius: 14px;
            padding: 12px 16px;
            background: #fdfbf7;
            margin-bottom: 12px;
          }
          .header-left {
            flex: 1;
            min-width: 0;
          }
          .header-right {
            display: flex;
            align-items: center;
            gap: 12px;
            border-left: 1px dashed #cbd5e1;
            padding-left: 12px;
            flex-shrink: 0;
          }
          .cover-img-compact {
            width: 140px;
            height: 95px;
            object-fit: cover;
            border-radius: 10px;
            border: 1.5px solid #cbd5e1;
            display: block;
          }
          .banner-img-wrap {
            width: 100%;
            margin-bottom: 12px;
            border-radius: 12px;
            overflow: hidden;
            border: 1.5px solid #cbd5e1;
          }
          .cover-img-banner {
            width: 100%;
            max-height: 135px;
            object-fit: cover;
            display: block;
          }
          .qr-code-container {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 2px;
            text-decoration: none;
            color: inherit;
          }
          .qr-caption {
            font-size: 8.5px;
            font-weight: 800;
            color: #087f5b;
            white-space: nowrap;
          }
          .qr-short-url {
            font-size: 8px;
            color: #64748b;
            font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
            white-space: nowrap;
          }
          .badge-row {
            display: flex;
            align-items: center;
            gap: 6px;
            margin-bottom: 5px;
            flex-wrap: wrap;
          }
          .badge {
            background: #0ca678;
            color: #ffffff;
            font-weight: 800;
            font-size: 10px;
            padding: 2px 8px;
            border-radius: 6px;
          }
          .badge-cefr {
            background: #6741d9;
            color: #ffffff;
            font-weight: 800;
            font-size: 10px;
            padding: 2px 8px;
            border-radius: 6px;
          }
          .badge-outline {
            border: 1px solid #cbb692;
            color: #5c5042;
            font-weight: 700;
            font-size: 9.5px;
            padding: 2px 7px;
            border-radius: 6px;
          }
          .title-row {
            display: flex;
            align-items: baseline;
            justify-content: space-between;
            gap: 12px;
            flex-wrap: wrap;
          }
          .title-tr {
            font-size: 18px;
            font-weight: 800;
            color: #1f1a14;
            margin: 0;
          }
          .title-ar {
            font-family: ${fontConfig.cssFamily};
            font-size: 26px;
            font-weight: 700;
            color: #087f5b;
            line-height: 1.25;
          }
          .header-submeta {
            margin-top: 4px;
            font-size: 10px;
            color: #64748b;
            font-weight: 600;
          }
          .helper-words-box {
            background: #f3f0ff;
            border: 1.5px dashed #6741d9;
            border-radius: 12px;
            padding: 9px 14px;
            margin-bottom: 12px;
            page-break-inside: avoid;
          }
          .helper-words-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 6px;
            font-size: 11px;
            font-weight: 800;
            color: #4c28b5;
          }
          .helper-words-ar-title {
            font-family: ${fontConfig.cssFamily};
            font-size: 18px;
            font-weight: 700;
          }
          .helper-words-items {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
            justify-content: center;
          }
          .helper-word-chip {
            background: #ffffff;
            border: 1px solid #d0bfff;
            border-radius: 8px;
            padding: 2px 10px;
            font-family: ${fontConfig.cssFamily};
            font-size: ${Math.round(20 * fontConfig.scale)}px;
            font-weight: 700;
            color: #3b1fa8;
          }
          .two-col-table {
            width: 100%;
            border-collapse: collapse;
            border: 1.5px solid #cbd5e1;
            border-radius: 10px;
            overflow: hidden;
          }
          .two-col-table th {
            background: #f1f5f9;
            color: #1e293b;
            font-size: 11px;
            font-weight: 800;
            padding: 8px 12px;
            border-bottom: 1.5px solid #cbd5e1;
          }
          .two-col-table td {
            padding: 8px 12px;
            border-bottom: 1px solid #e2e8f0;
            vertical-align: middle;
          }
          .two-col-table tr,
          .idioms-table tr,
          .stacked-card,
          .line-row,
          .vocab-grid-card,
          .quiz-row {
            page-break-inside: avoid;
            break-inside: avoid;
          }
          .section-title {
            page-break-after: avoid;
            break-after: avoid;
          }
          .ar-cell {
            text-align: right;
            border-left: 1px dashed #cbd5e1;
            border-right: 1px dashed #cbd5e1;
          }
          .tr-cell {
            text-align: left;
            color: #334155;
            font-size: 12px;
          }
          .tr-dotted-wrap {
            display: flex;
            align-items: flex-end;
            gap: 6px;
            width: 100%;
          }
          .tr-dotted-line {
            flex: 1;
            height: 22px;
            border-bottom: 1.5px dotted #94a3b8;
          }
          .ar-dotted-box {
            display: inline-block;
            width: 82%;
            min-width: 180px;
            height: 28px;
            border-bottom: 1.5px dotted #64748b;
            vertical-align: bottom;
          }
          .student-info-strip {
            display: flex;
            flex-wrap: wrap;
            align-items: center;
            justify-content: space-between;
            gap: 10px 16px;
            border: 1.5px solid #cbd5e1;
            border-radius: 10px;
            padding: 7px 14px;
            background: #f8fafc;
            margin-bottom: 12px;
            font-size: 11px;
            color: #1e293b;
            page-break-inside: avoid;
            break-inside: avoid;
          }
          .student-dots {
            color: #64748b;
            letter-spacing: 0.5px;
          }
          .idioms-table {
            width: 100%;
            border-collapse: collapse;
            border: 1.5px solid #cbd5e1;
            border-radius: 10px;
            overflow: hidden;
          }
          .idioms-table th {
            background: #f3f0ff;
            color: #4c28b5;
            font-size: 11px;
            font-weight: 800;
            padding: 8px 10px;
            border-bottom: 1.5px solid #cbd5e1;
            text-align: left;
          }
          .idioms-table td {
            padding: 8px 10px;
            border-bottom: 1px solid #e2e8f0;
            vertical-align: middle;
          }
          .idiom-ar-cell {
            text-align: right;
            font-family: ${fontConfig.cssFamily};
            font-size: ${Math.round(21 * fontConfig.scale)}px;
            font-weight: 700;
            color: #087f5b;
            line-height: 1.85;
            width: 30%;
            border-left: 1px dashed #cbd5e1;
          }
          .idiom-tr-cell {
            font-size: 12px;
            font-weight: 700;
            color: #1e293b;
            width: 32%;
            border-left: 1px dashed #cbd5e1;
          }
          .idiom-note-cell {
            font-size: 10.5px;
            color: #475569;
            line-height: 1.45;
            width: 38%;
          }
          .idiom-literal {
            color: #5f3dc4;
            font-weight: 600;
            margin-bottom: 2px;
          }
          .idiom-usage {
            color: #475569;
          }
          .answer-key-block {
            background: #f8fafc;
            border: 1.5px dashed #0ca678;
            border-radius: 10px;
            padding: 8px 12px;
            page-break-inside: avoid;
            break-inside: avoid;
          }
          .answer-key-grid {
            display: flex;
            flex-direction: column;
            gap: 5px;
            font-size: 11px;
            color: #1e293b;
          }
          .answer-key-item {
            line-height: 1.55;
          }
          .sp-badge-emerald {
            background: #e6fcf5;
            color: #087f5b;
            border: 1px solid #96f2d7;
          }
          .sp-badge-indigo {
            background: #f3f0ff;
            color: #5f3dc4;
            border: 1px solid #d0bfff;
          }
          .speaker-ar {
            font-family: ${fontConfig.cssFamily};
            font-size: 16px;
            font-weight: 700;
            padding: 1px 8px;
            border-radius: 6px;
            margin-left: 8px;
            display: inline-block;
          }
          .ar-text {
            font-family: ${fontConfig.cssFamily};
            font-size: ${Math.round(22 * fontConfig.scale)}px;
            font-weight: 700;
            color: #0f172a;
            line-height: 1.85;
          }
          .speaker-tr {
            font-weight: 800;
            font-size: 10.5px;
            padding: 2px 7px;
            border-radius: 6px;
            margin-right: 6px;
            display: inline-block;
            flex-shrink: 0;
          }
          .tr-text {
            font-weight: 600;
          }
          .stacked-card {
            border: 1px solid #e2e8f0;
            border-radius: 10px;
            padding: 8px 12px;
            margin-bottom: 7px;
            page-break-inside: avoid;
          }
          .stacked-card .tr-col {
            margin-top: 4px;
            padding-top: 4px;
            border-top: 1px dashed #cbd5e1;
            font-size: 12px;
            color: #334155;
          }
          .line-row.single-ar {
            border-bottom: 1px solid #e2e8f0;
            padding: 8px 10px;
            page-break-inside: avoid;
          }
          .section-title {
            font-size: 12.5px;
            font-weight: 800;
            color: #087f5b;
            background: #f8fafc;
            border: 1.5px solid #cbd5e1;
            border-left: 4px solid #0ca678;
            padding: 6px 12px;
            border-radius: 8px;
            margin-bottom: 10px;
          }
          .end-tr-list {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 6px 16px;
            border: 1px solid #cbd5e1;
            border-radius: 10px;
            padding: 10px 14px;
          }
          .end-tr-item {
            font-size: 11.5px;
            color: #334155;
          }
          .vocab-two-col-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 7px 12px;
          }
          .vocab-grid-card {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 10px;
            border: 1px solid #cbd5e1;
            border-radius: 8px;
            padding: 8px 10px;
            background: #f8fafc;
            page-break-inside: avoid;
            min-height: 46px;
          }
          .vocab-left {
            flex: 1;
            min-width: 0;
          }
          .vocab-meta-row {
            display: flex;
            align-items: center;
            gap: 6px;
            margin-bottom: 2px;
          }
          .pos-badge {
            font-size: 9px;
            font-weight: 800;
            padding: 1px 6px;
            border-radius: 4px;
            text-transform: uppercase;
          }
          .pos-fiil {
            background: #fef3c7;
            color: #92400e;
            border: 1px solid #fcd34d;
          }
          .pos-isim {
            background: #e0f2fe;
            color: #075985;
            border: 1px solid #7dd3fc;
          }
          .pos-edat {
            background: #f3e8ff;
            color: #6b21a8;
            border: 1px solid #d8b4fe;
          }
          .vocab-root {
            font-family: ${fontConfig.cssFamily};
            font-size: 13px;
            font-weight: 700;
            color: #64748b;
          }
          .vocab-meaning {
            font-size: 11.5px;
            font-weight: 700;
            color: #1e293b;
          }
          .vocab-dotted-blank {
            width: 92%;
            height: 18px;
            border-bottom: 1.5px dotted #64748b;
            margin-top: 2px;
          }
          .vocab-dotted-blank-ar {
            width: 110px;
            height: 22px;
            border-bottom: 1.5px dotted #64748b;
          }
          .vocab-right {
            text-align: right;
            flex-shrink: 0;
          }
          .vocab-ar {
            font-family: ${fontConfig.cssFamily};
            font-size: ${Math.round(21 * fontConfig.scale)}px;
            font-weight: 700;
            color: #087f5b;
            line-height: 1.85;
          }
          .word-bank {
            background: #f3f0ff;
            border: 1px dashed #6741d9;
            border-radius: 8px;
            padding: 7px 12px;
            font-family: ${fontConfig.cssFamily};
            font-size: 20px;
            font-weight: 700;
            color: #4c28b5;
            margin-bottom: 10px;
            text-align: center;
          }
          .quiz-row {
            border-bottom: 1px dashed #cbd5e1;
            padding: 8px 4px;
          }
          .quiz-ar {
            font-family: ${fontConfig.cssFamily};
            font-size: 20px;
            font-weight: 700;
            line-height: 1.85;
          }
          .quiz-tr {
            font-size: 11px;
            color: #64748b;
            font-style: italic;
          }
          .corporate-footer {
            margin-top: 18px;
            padding-top: 8px;
            border-top: 2px solid #0ca678;
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
            font-size: 10.5px;
            color: #475569;
            page-break-inside: avoid;
          }
          .corporate-brand {
            font-size: 12px;
            font-weight: 800;
            color: #087f5b;
            letter-spacing: 0.03em;
          }
          /* 4 Kademeli Otomatik Sığdırma (Auto-Fit) Sınıfları (normal | compact | tight | ultra) */
          body.density-compact .header-card {
            padding: 10px 12px;
            margin-bottom: 10px;
          }
          body.density-compact .cover-img-compact {
            width: 80px;
            height: 80px;
          }
          body.density-compact .title-tr {
            font-size: 16.5px;
          }
          body.density-compact .title-ar {
            font-size: 23px;
          }
          body.density-compact .two-col-table td,
          body.density-compact .stacked-card,
          body.density-compact .line-row {
            padding: 6px 10px;
          }
          body.density-compact .ar-sentence {
            font-size: ${Math.round(17.5 * fontConfig.scale)}px;
            line-height: 1.5;
          }
          body.density-compact .tr-cell,
          body.density-compact .tr-subrow,
          body.density-compact .end-tr-item {
            font-size: 12px;
            line-height: 1.38;
          }
          body.density-compact .section-block,
          body.density-compact .vocab-section,
          body.density-compact .idioms-section {
            margin-top: 11px;
          }
          body.density-compact .vocab-grid-card,
          body.density-compact .idioms-table td,
          body.density-compact .idioms-table th {
            padding: 4px 8px;
            font-size: 11.5px;
          }

          /* TIGHT KADEMESİ (CSS zoom: 0.96 + Sıkı Padding/Font) */
          body.density-tight {
            zoom: 0.96;
          }
          body.density-tight .header-card {
            padding: 8px 10px;
            margin-bottom: 8px;
          }
          body.density-tight .cover-img-compact {
            width: 64px;
            height: 64px;
          }
          body.density-tight .title-tr {
            font-size: 15.5px;
          }
          body.density-tight .title-ar {
            font-size: 21px;
          }
          body.density-tight .two-col-table td,
          body.density-tight .stacked-card,
          body.density-tight .line-row {
            padding: 4px 8px;
          }
          body.density-tight .ar-sentence {
            font-size: ${Math.round(16.5 * fontConfig.scale)}px;
            line-height: 1.42;
          }
          body.density-tight .tr-cell,
          body.density-tight .tr-subrow,
          body.density-tight .end-tr-item {
            font-size: 11.5px;
            line-height: 1.28;
          }
          body.density-tight .section-block,
          body.density-tight .vocab-section,
          body.density-tight .idioms-section {
            margin-top: 8px;
          }
          body.density-tight .vocab-grid-card,
          body.density-tight .idioms-table td,
          body.density-tight .idioms-table th {
            padding: 2.5px 7px;
            font-size: 11px;
          }
          body.density-tight .corporate-footer {
            margin-top: 8px;
            padding-top: 5px;
          }

          /* ULTRA KADEMESİ (CSS zoom: 0.92 + @page 8mm + Maksimum Sıkı Padding/Font) */
          body.density-ultra {
            zoom: 0.92;
          }
          body.density-ultra .header-card {
            padding: 6px 8px;
            margin-bottom: 6px;
          }
          body.density-ultra .cover-img-compact {
            width: 56px;
            height: 56px;
          }
          body.density-ultra .title-tr {
            font-size: 15px;
          }
          body.density-ultra .title-ar {
            font-size: 19.5px;
          }
          body.density-ultra .header-submeta,
          body.density-ultra .qr-caption,
          body.density-ultra .qr-short-url {
            font-size: 9px;
          }
          body.density-ultra .student-info-bar {
            padding: 4px 8px;
            margin-bottom: 6px;
            font-size: 10.5px;
          }
          body.density-ultra .two-col-table td,
          body.density-ultra .stacked-card,
          body.density-ultra .line-row {
            padding: 2px 7px;
          }
          body.density-ultra .ar-sentence {
            font-size: ${Math.round(15.5 * fontConfig.scale)}px;
            line-height: 1.32;
          }
          body.density-ultra .tr-cell,
          body.density-ultra .tr-subrow,
          body.density-ultra .end-tr-item {
            font-size: 11px;
            line-height: 1.22;
          }
          body.density-ultra .section-block,
          body.density-ultra .vocab-section,
          body.density-ultra .idioms-section {
            margin-top: 6px;
          }
          body.density-ultra .section-title {
            padding: 3px 8px;
            margin-bottom: 4px;
            font-size: 11px;
          }
          body.density-ultra .vocab-grid-card,
          body.density-ultra .idioms-table td,
          body.density-ultra .idioms-table th {
            padding: 2px 6px;
            font-size: 10.5px;
          }
          body.density-ultra .vocab-ar {
            font-size: ${Math.round(17 * fontConfig.scale)}px;
            line-height: 1.35;
          }
          body.density-ultra .corporate-footer {
            margin-top: 6px;
            padding-top: 4px;
          }
        </style>
      </head>
      <body class="density-${activeDensity}">
        <div class="header-card">
          <div class="header-left">
            <div class="badge-row">
              <span class="badge">DİYALOG #${String(rawNum).padStart(
                2,
                "0"
              )}</span>
              <span class="badge-cefr">CEFR ${dialogue.seviye}</span>
              <span class="badge-outline">${
                pdfDocMode === "quiz-sheet"
                  ? "SINIF İÇİ ETKİNLİK & QUİZ YAPRAĞI (100 PUAN)"
                  : `${dialogue.satirlar.length} Cümle • ${vocabEntries.length} Kelime`
              }</span>
              <span class="badge-outline">${
                includeHarakat ? "Harekeli" : "Harekesiz"
              }</span>
            </div>
            <div class="title-row">
              <h1 class="title-tr">${dialogue.baslik_tr}</h1>
              <span class="title-ar" dir="rtl">${formatAr(
                dialogue.baslik_ar
              )}</span>
            </div>
            <div class="header-submeta">
              Tarih: ${formattedDate} • Font: ${
      fontConfig.name.split(" (")[0]
    } • www.muallimun.net
            </div>
          </div>
          ${
            hasHeaderRight
              ? `
            <div class="header-right">
              ${compactImageHtml}
              ${qrBlockHtml}
            </div>
          `
              : ""
          }
        </div>

        ${
          pdfDocMode === "quiz-sheet"
            ? `
          <div class="student-header-strip">
            <span><strong>Adı Soyadı:</strong> .......................................</span>
            <span><strong>Sınıfı / No:</strong> ..................</span>
            <span><strong>Tarih:</strong> .... / .... / 2026</span>
            <span><strong>Puan:</strong> ........ / 100</span>
          </div>

          <!-- BÖLÜM A: KELİME EŞLEŞTİRME (30 PUAN) -->
          <div class="section-block" style="margin-bottom:10px;">
            <div class="section-title">
              <span>BÖLÜM A — Kelime Eşleştirme (Her soru 5 puan • Toplam 30 Puan)</span>
              <span class="section-title-ar" dir="rtl">أ. تَوْصِيلُ الْمُفْرَدَاتِ</span>
            </div>
            <table class="vocab-table" style="width:100%;border-collapse:collapse;">
              <thead>
                <tr>
                  <th style="width:45%;text-align:right;" dir="rtl">الْكَلِمَةُ الْعَرَبِيَّةُ (Arapça Kelime)</th>
                  <th style="width:12%;text-align:center;">Eşleştirme</th>
                  <th style="width:43%;text-align:left;">Türkçe Anlamı (Seçenekler)</th>
                </tr>
              </thead>
              <tbody>
                ${a4QuizSheetData.sectionAMatching
                  .map(
                    (row) => `
                  <tr>
                    <td dir="rtl" style="text-align:right;font-family:'${fontConfig.cssFamily}',serif;font-size:${Math.round(
                      18 * fontConfig.scale
                    )}px;font-weight:700;color:#087f5b;padding:4px 8px;">
                      ${row.num}. ${formatAr(row.arabic)}
                    </td>
                    <td style="text-align:center;font-weight:800;font-size:11px;color:#334155;padding:4px;">
                      ( &nbsp;&nbsp;&nbsp; )
                    </td>
                    <td style="text-align:left;font-size:11px;font-weight:700;color:#1e293b;padding:4px 8px;">
                      <strong>${row.letter})</strong> ${row.shuffledTr}
                    </td>
                  </tr>
                `
                  )
                  .join("")}
              </tbody>
            </table>
          </div>

          <!-- BÖLÜM B: BOŞLUK DOLDURMA (40 PUAN) -->
          <div class="section-block" style="margin-bottom:10px;">
            <div class="section-title">
              <span>BÖLÜM B — Boşluk Doldurma (Her cümle 8 puan • Toplam 40 Puan)</span>
              <span class="section-title-ar" dir="rtl">ب. امْلَأِ الْفَرَاغَاتِ</span>
            </div>
            <div class="helper-words-box" style="margin-bottom:6px;padding:6px 10px;">
              <div class="helper-words-header">
                <span>📦 Kelime Havuzu (Uygun kelimeyi seçip boşluğa yazınız)</span>
                <span class="helper-words-ar-title" dir="rtl">صُنْدُوقُ الْكَلِمَاتِ</span>
              </div>
              <div class="helper-words-items" dir="rtl">
                ${a4QuizSheetData.wordBank
                  .map(
                    (w) =>
                      `<span class="helper-word-chip">${formatAr(w)}</span>`
                  )
                  .join("")}
              </div>
            </div>
            <div style="border:1px solid #cbd5e1;border-radius:10px;overflow:hidden;">
              ${a4QuizSheetData.sectionBFillBlanks
                .map(
                  (q, idx) => `
                <div style="padding:5px 10px;border-bottom:${
                  idx < a4QuizSheetData.sectionBFillBlanks.length - 1
                    ? "1px solid #e2e8f0"
                    : "none"
                };background:${idx % 2 === 0 ? "#f8fafc" : "#ffffff"};">
                  <div dir="rtl" style="font-family:'${fontConfig.cssFamily}',serif;font-size:${Math.round(
                    18 * fontConfig.scale
                  )}px;font-weight:700;color:#0f172a;text-align:right;">
                    ${idx + 1}. ${formatAr(q.blankSentence)}
                  </div>
                  <div style="font-size:10px;color:#475569;margin-top:1px;">
                    <em>İpucu (${q.turkce})</em>
                  </div>
                </div>
              `
                )
                .join("")}
            </div>
          </div>

          <!-- BÖLÜM C: KALIP İFADELER VE ANLAMA (30 PUAN) -->
          <div class="section-block" style="margin-bottom:10px;">
            <div class="section-title">
              <span>BÖLÜM C — Kalıp İfadeler ve Diyalog Anlama (Toplam 30 Puan)</span>
              <span class="section-title-ar" dir="rtl">ج. التَّعْبِيرَاتُ وَالْفَهْمُ</span>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
              ${a4QuizSheetData.sectionCMultipleChoice
                .map(
                  (mc) => `
                <div style="border:1px solid #cbd5e1;border-radius:10px;padding:6px 9px;background:#ffffff;break-inside:avoid;">
                  <div style="display:flex;justify-content:space-between;align-items:baseline;gap:6px;margin-bottom:3px;">
                    <span style="font-size:10px;font-weight:800;color:#6741d9;">Soru ${mc.num} (${mc.typeLabel})</span>
                    <span dir="rtl" style="font-family:'${fontConfig.cssFamily}',serif;font-size:${Math.round(
                    17 * fontConfig.scale
                  )}px;font-weight:700;color:#087f5b;">${formatAr(
                    mc.arabicPrompt
                  )}</span>
                  </div>
                  <div style="font-size:10px;font-weight:700;color:#334155;margin-bottom:4px;">${
                    mc.questionTr
                  }</div>
                  <div style="font-size:10.5px;color:#1e293b;display:flex;flex-direction:column;gap:2px;">
                    ${mc.options
                      .map(
                        (o) =>
                          `<div><strong>${o.letter})</strong> ${o.text}</div>`
                      )
                      .join("")}
                  </div>
                </div>
              `
                )
                .join("")}
            </div>
          </div>

          ${
            includeAnswerKey
              ? `
            <div class="answer-key-block" style="margin-top:8px;">
              <div class="answer-key-title">🔑 Öğretmen Cevap Anahtarı (مفتاح الإجابات)</div>
              <div class="answer-key-body">
                <div><strong>Bölüm A (Kelime Eşleştirme):</strong> ${a4QuizSheetData.sectionAMatching
                  .map((m) => `${m.num}-${m.correctLetter} (${m.correctTr})`)
                  .join(" • ")}</div>
                <div style="margin-top:3px;"><strong>Bölüm B (Boşluk Doldurma):</strong> <span dir="rtl" style="font-family:'${
                  fontConfig.cssFamily
                }',serif;font-size:15px;font-weight:700;color:#087f5b;">${a4QuizSheetData.sectionBFillBlanks
                  .map((b, idx) => `(${idx + 1}) ${formatAr(b.answer)}`)
                  .join(" • ")}</span></div>
                <div style="margin-top:3px;"><strong>Bölüm C (Kalıp İfadeler & Anlama):</strong> ${a4QuizSheetData.sectionCMultipleChoice
                  .map((c) => `${c.num}-${c.correctLetter}`)
                  .join(" • ")}</div>
              </div>
            </div>
          `
              : ""
          }
        `
            : `
          ${studentHeaderHtml}
          ${bannerImageHtml}
          ${helperWordsBoxHtml}
          ${dialogueBodyHtml}
          ${vocabSectionHtml}
          ${idiomsSectionHtml}
          ${worksheetSectionHtml}
          ${answerKeySectionHtml}
        `
        }

        <footer class="corporate-footer">
          <span>Diyalog #${String(rawNum).padStart(2, "0")}: ${
      dialogue.baslik_tr
    } (${dialogue.seviye}) — ${
      pdfDocMode === "quiz-sheet"
        ? "A4 Sınıf İçi Çalışma & Quiz Yaprağı"
        : "Arapça Çalışma Kağıdı"
    }</span>
          <a href="https://www.muallimun.net" target="_blank" rel="noopener noreferrer" class="corporate-brand" style="text-decoration:none;">www.muallimun.net</a>
        </footer>
      </body>
      </html>
    `;

    setMobileTab("preview");
    const iframe = printIframeRef.current;
    if (iframe) {
      const doc = iframe.contentDocument || iframe.contentWindow?.document;
      if (doc) {
        doc.open();
        doc.write(htmlDocument);
        doc.close();

        // Görsel varsa yüklenmesini bekle, ardından print() tetikle
        const triggerPrint = () => {
          iframe.contentWindow?.focus();
          iframe.contentWindow?.print();
        };

        const imgs = Array.from(doc.images || []);
        const pendingImgs = imgs.filter((img) => !img.complete);
        if (pendingImgs.length === 0) {
          setTimeout(triggerPrint, 250);
        } else {
          let settled = false;
          const done = () => {
            if (settled) return;
            settled = true;
            setTimeout(triggerPrint, 150);
          };
          let loadedCount = 0;
          pendingImgs.forEach((img) => {
            const onFinish = () => {
              loadedCount++;
              if (loadedCount >= pendingImgs.length) done();
            };
            img.addEventListener("load", onFinish, { once: true });
            img.addEventListener("error", onFinish, { once: true });
          });
          setTimeout(done, 1200);
        }
      }
    }
  };

  const speakers = useMemo(
    () => Array.from(new Set(dialogue.satirlar.map((l) => l.konusmaci))),
    [dialogue.satirlar]
  );

  return (
    <div
      className="fixed inset-0 z-[60] bg-black/65 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4"
      onClick={onClose}
    >
      {/* Gizli Vektörel A4 Yazdırma Iframe'i */}
      <iframe
        ref={printIframeRef}
        title="A4 Ders Notu Yazdırma Katmanı"
        className="fixed w-0 h-0 border-0 opacity-0 pointer-events-none"
      />

      <div
        className="w-full max-w-4xl max-h-[94vh] bg-[#FDFBF7] dark:bg-[var(--surface)] rounded-3xl border-2 border-[#E6D7BE] dark:border-[var(--border)] border-b-4 shadow-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* MODAL ÜST BAŞLIK (print:hidden) */}
        <div className="print:hidden bg-[#F7EFE1] dark:bg-[var(--background)] px-4 sm:px-5 py-2.5 border-b-2 border-[#E6D7BE] dark:border-[var(--border)] flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-[#0CA678] border-b-3 border-[#087F5B] text-white flex items-center justify-center shrink-0">
              <FileText size={17} />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm sm:text-base font-extrabold text-[var(--foreground)] truncate">
                Akıllı PDF & Çalışma Kağıdı Üreticisi
              </h2>
              <p className="text-[11px] font-semibold text-[var(--muted)] truncate">
                #{String(rawNum).padStart(2, "0")} {dialogue.baslik_tr} •{" "}
                <span className="text-[#087F5B] font-bold">
                  www.muallimun.net
                </span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleGenerateAndPrintPdf}
              className="hidden sm:flex px-3.5 py-1.5 rounded-xl bg-[#0CA678] hover:bg-[#099268] text-white font-extrabold text-xs border-b-3 border-[#087F5B] active:translate-y-0.5 transition-all items-center gap-1.5 cursor-pointer shadow-sm"
            >
              <Printer size={15} />
              <span>Yazdır / PDF İndir</span>
            </button>
            <button
              type="button"
              onClick={() => {
                playClick();
                onClose();
              }}
              className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-white dark:bg-[var(--surface)] border-2 border-[#E6D7BE] dark:border-[var(--border)] flex items-center justify-center text-[var(--muted)] hover:text-[var(--foreground)] cursor-pointer"
              aria-label="Kapat"
            >
              <X size={17} />
            </button>
          </div>
        </div>

        {/* MOBİL ERGONOMİ SEKMELERİ (< 768px): [⚙️ Kağıt Ayarları] ve [📄 A4 Önizleme] */}
        <div className="print:hidden md:hidden bg-[#F7EFE1]/80 dark:bg-[var(--background)] px-3 py-2 border-b border-[#E6D7BE] dark:border-[var(--border)] grid grid-cols-2 gap-2 shrink-0">
          <button
            type="button"
            onClick={() => {
              playClick();
              setMobileTab("settings");
            }}
            className={`py-2 px-3 rounded-xl text-xs font-extrabold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
              mobileTab === "settings"
                ? "bg-[#6741D9] text-white shadow-xs"
                : "bg-white dark:bg-[var(--surface)] text-[var(--muted)] border border-[#E6D7BE]"
            }`}
          >
            <span>⚙️ Kağıt Ayarları</span>
          </button>
          <button
            type="button"
            onClick={() => {
              playClick();
              setMobileTab("preview");
            }}
            className={`py-2 px-3 rounded-xl text-xs font-extrabold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
              mobileTab === "preview"
                ? "bg-[#0CA678] text-white shadow-xs"
                : "bg-white dark:bg-[var(--surface)] text-[var(--muted)] border border-[#E6D7BE]"
            }`}
          >
            <span>📄 A4 Önizleme</span>
          </button>
        </div>

        {/* KOMPAKT SEÇİM ÇİPLERİ / SEGMENTED CONTROLS BARI (print:hidden) */}
        <div
          className={`print:hidden bg-[#FDFBF7] dark:bg-[var(--surface)] px-3 sm:px-4 py-2 border-b-2 border-[#E6D7BE] dark:border-[var(--border)] space-y-1.5 overflow-y-auto md:overflow-visible ${
            mobileTab === "settings"
              ? "flex-1 md:flex-none block"
              : "hidden md:block shrink-0"
          }`}
        >
          {/* 0. Satır: Aşama 2.3 Üst Mod Seçici (📄 Ders Föyü vs 📝 Çalışma & Quiz Yaprağı) + 🔑 Cevap Anahtarını Ekle */}
          <div className="flex flex-wrap items-center justify-between gap-2 pb-1.5 border-b border-dashed border-[#E2D3B8] dark:border-[var(--border-dashed)]">
            <div className="flex flex-wrap items-center gap-1.5 bg-[#F7EFE1] dark:bg-[var(--background)] p-1 rounded-xl border border-[#E6D7BE] dark:border-[var(--border)]">
              <button
                type="button"
                onClick={() => {
                  playClick();
                  setPdfDocMode("handout");
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-extrabold transition-all cursor-pointer ${
                  pdfDocMode === "handout"
                    ? "bg-[#0CA678] text-white shadow-xs"
                    : "text-[var(--muted)] hover:text-[var(--foreground)]"
                }`}
              >
                📄 Ders Föyü (Diyalog &amp; Sözlük Özeti)
              </button>
              <button
                type="button"
                onClick={() => {
                  playClick();
                  setPdfDocMode("quiz-sheet");
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-extrabold transition-all cursor-pointer ${
                  pdfDocMode === "quiz-sheet"
                    ? "bg-[#6741D9] text-white shadow-xs"
                    : "text-[var(--muted)] hover:text-[var(--foreground)]"
                }`}
              >
                📝 Çalışma &amp; Quiz Yaprağı (Sınıf İçi Etkinlik / Sınav)
              </button>
            </div>

            {pdfDocMode === "quiz-sheet" && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    playClick();
                    setIncludeAnswerKey((v) => !v);
                  }}
                  className={`px-3 py-1.5 rounded-xl border text-xs font-extrabold flex items-center gap-1.5 transition-all cursor-pointer ${
                    includeAnswerKey
                      ? "bg-emerald-600 border-emerald-800 text-white shadow-xs"
                      : "bg-white dark:bg-[var(--background)] border-[#E6D7BE] text-[var(--foreground)]"
                  }`}
                >
                  <span>🔑 Cevap Anahtarını Ekle: {includeAnswerKey ? "Açık ✓" : "Kapalı"}</span>
                </button>
              </div>
            )}
          </div>

          {/* 1. Satır: Görsel Modu + Çeviri Modu */}
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
            {/* PDF-1: Görsel Seçici */}
            <div className="flex flex-wrap items-center gap-1 bg-[#F7EFE1] dark:bg-[var(--background)] px-2 py-1 rounded-xl border border-[#E6D7BE] dark:border-[var(--border)]">
              <ImageIcon size={13} className="text-[#087F5B] shrink-0" />
              <span className="text-[11px] font-extrabold text-[var(--foreground)]">
                Görsel:
              </span>
              <div className="flex flex-wrap items-center gap-1">
                {(
                  [
                    { id: "hide", label: "Gizle" },
                    { id: "compact", label: "Kompakt Kart" },
                    { id: "banner", label: "Geniş Banner" },
                  ] as { id: ImagePrintMode; label: string }[]
                ).map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => {
                      playClick();
                      setImageMode(opt.id);
                    }}
                    className={`px-2 py-0.5 rounded-lg text-[11px] font-extrabold transition-all cursor-pointer ${
                      imageMode === opt.id
                        ? "bg-[#0CA678] text-white shadow-xs"
                        : "text-[var(--muted)] hover:text-[var(--foreground)]"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* PDF-2: Çeviri & Boşluklu Çalışma Kağıdı Görünüm Seçici */}
            <div className="flex flex-wrap items-center gap-1 bg-[#F7EFE1] dark:bg-[var(--background)] px-2 py-1 rounded-xl border border-[#E6D7BE] dark:border-[var(--border)]">
              <Languages size={13} className="text-[#6741D9] shrink-0" />
              <span className="text-[11px] font-extrabold text-[var(--foreground)]">
                Dil & Çeviri:
              </span>
              <div className="flex flex-wrap items-center gap-1">
                {(
                  [
                    { id: "show", label: "Arapça + Türkçe" },
                    { id: "hide", label: "Sadece Arapça" },
                    { id: "dotted", label: "Çeviriyi Boş Bırak (TR Boş)" },
                    { id: "ar-dotted", label: "Arapçayı Boş Bırak (AR Boş)" },
                  ] as { id: TranslationPrintMode; label: string }[]
                ).map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => {
                      playClick();
                      setTranslationMode(opt.id);
                    }}
                    className={`px-2 py-0.5 rounded-lg text-[11px] font-extrabold transition-all cursor-pointer ${
                      translationMode === opt.id
                        ? "bg-[#6741D9] text-white shadow-xs"
                        : "text-[var(--muted)] hover:text-[var(--foreground)]"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* PDF-AUTO-FIT: 4 Kademeli Sayfaya Sığdır Seçici */}
            <div className="flex flex-wrap items-center gap-1 bg-[#F7EFE1] dark:bg-[var(--background)] px-2 py-1 rounded-xl border border-[#E6D7BE] dark:border-[var(--border)]">
              <span className="text-[11px] font-extrabold text-[var(--foreground)]">
                📐 Sayfaya Sığdır:
              </span>
              <div className="flex flex-wrap items-center gap-1">
                {(
                  [
                    { id: "auto", label: "⚡ Otomatik" },
                    { id: "normal", label: "Normal" },
                    { id: "compact", label: "Sıkı" },
                    { id: "ultra", label: "Maksimum Sıkı" },
                  ] as { id: FitMode; label: string }[]
                ).map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => {
                      playClick();
                      setFitMode(opt.id);
                    }}
                    className={`px-2 py-0.5 rounded-lg text-[11px] font-extrabold transition-all cursor-pointer ${
                      fitMode === opt.id
                        ? "bg-[#0CA678] text-white shadow-xs"
                        : "text-[var(--muted)] hover:text-[var(--foreground)]"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* 2. Satır: Boşluk Doldurma + Harekeler + QR Kod + Kelime Tablosu + Kalıp İfadeler + Öğrenci Şeridi + Cevap Anahtarı */}
          <div className="flex flex-wrap items-center justify-between gap-1.5">
            <div className="flex flex-wrap items-center gap-1.5">
              {/* PDF-3: Boşluk Doldurma (Etkinlik) Toggle */}
              <button
                type="button"
                onClick={() => {
                  playClick();
                  setClozeMode((v) => !v);
                }}
                className={`px-2.5 py-1 rounded-xl border text-[11px] font-extrabold flex items-center gap-1.5 transition-all cursor-pointer ${
                  clozeMode
                    ? "bg-[#6741D9] text-white border-[#5230B5] shadow-xs"
                    : "bg-white dark:bg-[var(--background)] text-[var(--foreground)] border-[#E6D7BE] dark:border-[var(--border)]"
                }`}
              >
                <PenTool size={12} />
                <span>Boşluk Doldurma: {clozeMode ? "Açık" : "Kapalı"}</span>
              </button>

              {/* PDF-4: Harekeler Toggle */}
              <button
                type="button"
                onClick={() => {
                  playClick();
                  setIncludeHarakat((v) => !v);
                }}
                className={`px-2.5 py-1 rounded-xl border text-[11px] font-extrabold flex items-center gap-1.5 transition-all cursor-pointer ${
                  includeHarakat
                    ? "bg-[#0CA678] text-white border-[#087F5B] shadow-xs"
                    : "bg-white dark:bg-[var(--background)] text-[var(--foreground)] border-[#E6D7BE] dark:border-[var(--border)]"
                }`}
              >
                <Sparkles size={12} />
                <span>Harekeler: {includeHarakat ? "Açık" : "Kapalı"}</span>
              </button>

              {/* PDF-5: QR Kod Toggle */}
              <button
                type="button"
                onClick={() => {
                  playClick();
                  setIncludeQrCode((v) => !v);
                }}
                className={`px-2.5 py-1 rounded-xl border text-[11px] font-extrabold flex items-center gap-1.5 transition-all cursor-pointer ${
                  includeQrCode
                    ? "bg-[#0CA678] text-white border-[#087F5B] shadow-xs"
                    : "bg-white dark:bg-[var(--background)] text-[var(--foreground)] border-[#E6D7BE] dark:border-[var(--border)]"
                }`}
              >
                <QrCode size={12} />
                <span>QR Kod: {includeQrCode ? "Açık" : "Kapalı"}</span>
              </button>

              {/* Sözlük Kelime Tablosu Toggle */}
              <button
                type="button"
                onClick={() => {
                  playClick();
                  setIncludeVocabulary((v) => !v);
                }}
                className={`px-2.5 py-1 rounded-xl border text-[11px] font-extrabold flex items-center gap-1.5 transition-all cursor-pointer ${
                  includeVocabulary
                    ? "bg-[#0CA678] text-white border-[#087F5B] shadow-xs"
                    : "bg-white dark:bg-[var(--background)] text-[var(--foreground)] border-[#E6D7BE] dark:border-[var(--border)]"
                }`}
              >
                <BookOpen size={12} />
                <span>Kelime Tablosu ({vocabEntries.length})</span>
              </button>

              {/* Kalıp İfadeler Tablosu Toggle (Yalnızca diyalogda kalıp ifade varsa gösterilir — Çift ikon temizlendi) */}
              {dialogueIdioms.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    playClick();
                    setIncludeIdioms((v) => !v);
                  }}
                  className={`px-2.5 py-1 rounded-xl border text-[11px] font-extrabold flex items-center gap-1.5 transition-all cursor-pointer ${
                    includeIdioms
                      ? "bg-[#6741D9] text-white border-[#5230B5] shadow-xs"
                      : "bg-white dark:bg-[var(--background)] text-[var(--foreground)] border-[#E6D7BE] dark:border-[var(--border)]"
                  }`}
                >
                  <Sparkles size={12} />
                  <span>Kalıp İfadeler Tablosu ({dialogueIdioms.length})</span>
                </button>
              )}

              {/* Kalıp İfade Anlamlarını Boş Bırak Alt Seçeneği (Tablo kapalıyken pasif) */}
              {dialogueIdioms.length > 0 && (
                <button
                  type="button"
                  disabled={!includeIdioms}
                  title={
                    !includeIdioms
                      ? "Önce Kalıp İfadeler Tablosunu etkinleştirin"
                      : "Kalıp ifade anlamlarını çalışma kağıdında boş bırakır"
                  }
                  onClick={() => {
                    if (!includeIdioms) return;
                    playClick();
                    setIdiomsBlankMode((v) => !v);
                  }}
                  className={`px-2.5 py-1 rounded-xl border text-[11px] font-extrabold flex items-center gap-1.5 transition-all ${
                    !includeIdioms
                      ? "opacity-45 pointer-events-none select-none bg-stone-100/60 dark:bg-slate-800/40 text-[var(--muted)] border-[#E6D7BE]"
                      : idiomsBlankMode
                      ? "bg-amber-600 text-white border-amber-700 shadow-xs cursor-pointer"
                      : "bg-white dark:bg-[var(--background)] text-[var(--foreground)] border-[#E6D7BE] dark:border-[var(--border)] cursor-pointer"
                  }`}
                >
                  <PenTool size={12} />
                  <span>
                    Kalıp İfade Anlamlarını Boş Bırak:{" "}
                    {includeIdioms && idiomsBlankMode ? "Açık" : "Kapalı"}
                  </span>
                </button>
              )}

              {/* Öğrenci Bilgi Şeridi Toggle */}
              <button
                type="button"
                onClick={() => {
                  playClick();
                  setIncludeStudentHeader((v) => !v);
                }}
                className={`px-2.5 py-1 rounded-xl border text-[11px] font-extrabold flex items-center gap-1.5 transition-all cursor-pointer ${
                  includeStudentHeader
                    ? "bg-[#0CA678] text-white border-[#087F5B] shadow-xs"
                    : "bg-white dark:bg-[var(--background)] text-[var(--foreground)] border-[#E6D7BE] dark:border-[var(--border)]"
                }`}
              >
                <span>
                  👤 Öğrenci Bilgi Şeridi:{" "}
                  {includeStudentHeader ? "Açık" : "Kapalı"}
                </span>
              </button>

              {/* 🗝️ Sayfa Sonuna Cevap Anahtarı Ekle (Boşluklu çalışma kağıdı modlarından herhangi biri aktifse görünür) */}
              {hasAnyBlankActivity && (
                <button
                  type="button"
                  onClick={() => {
                    playClick();
                    setIncludeAnswerKey((v) => !v);
                  }}
                  className={`px-2.5 py-1 rounded-xl border text-[11px] font-extrabold flex items-center gap-1.5 transition-all cursor-pointer ${
                    includeAnswerKey
                      ? "bg-emerald-700 text-white border-emerald-900 shadow-xs"
                      : "bg-white dark:bg-[var(--background)] text-[var(--foreground)] border-[#E6D7BE] dark:border-[var(--border)]"
                  }`}
                >
                  <span>
                    🗝️ Cevap Anahtarı: {includeAnswerKey ? "Açık" : "Kapalı"}
                  </span>
                </button>
              )}
            </div>

            {/* Mizanpaj & Sözlük Alt Ayarları Aç/Kapa */}
            <button
              type="button"
              onClick={() => {
                playClick();
                setShowAdvancedLayout((v) => !v);
              }}
              className="px-2.5 py-1 rounded-xl bg-[#F7EFE1] dark:bg-[var(--background)] border border-[#E6D7BE] dark:border-[var(--border)] text-[11px] font-extrabold text-[#6741D9] dark:text-[#d0bfff] flex items-center gap-1 cursor-pointer"
            >
              <Columns2 size={12} />
              <span>
                {showAdvancedLayout
                  ? "Mizanpajı Gizle"
                  : "Tablo & Mizanpaj Ayarları"}
              </span>
            </button>
          </div>

          {/* Genişletilebilir Tablo & Sütun Mizanpaj Seçenekleri */}
          {showAdvancedLayout && (
            <div className="pt-1.5 border-t border-[#E6D7BE] dark:border-[var(--border)] grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              {/* Sütun & Tercüme Yerleşimi ("Sadece Arapça" seçiliyse pasif) */}
              <div
                aria-disabled={translationMode === "hide"}
                className={`p-2 rounded-xl border border-[#E6D7BE] space-y-1 transition-all ${
                  translationMode === "hide"
                    ? "opacity-45 pointer-events-none select-none bg-stone-100/60 dark:bg-slate-800/40"
                    : "bg-[#F7EFE1]/70 dark:bg-[var(--background)]"
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-1">
                  <span className="text-[11px] font-extrabold text-[#6741D9]">
                    Tercüme Yerleşimi & Sütun Yönü:
                  </span>
                  {translationMode === "hide" && (
                    <span className="text-[10px] font-bold text-[var(--muted)]">
                      (Sadece Arapça modunda çeviri sütunu bulunmaz)
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap gap-1">
                  {[
                    {
                      id: "side-by-side" as TranslationLayout,
                      label: "Yan Yana",
                      icon: Columns2,
                    },
                    {
                      id: "stacked" as TranslationLayout,
                      label: "Alt Alta",
                      icon: Rows2,
                    },
                    {
                      id: "grouped-end" as TranslationLayout,
                      label: "Sonda Toplu",
                      icon: AlignJustify,
                    },
                  ].map((l) => {
                    const Icon = l.icon;
                    return (
                      <button
                        key={l.id}
                        type="button"
                        onClick={() => {
                          playClick();
                          setTranslationLayout(l.id);
                        }}
                        className={`px-2 py-0.5 rounded-lg text-[11px] font-bold flex items-center gap-1 cursor-pointer ${
                          translationLayout === l.id
                            ? "bg-[#6741D9] text-white"
                            : "bg-white dark:bg-[var(--surface)] text-[var(--muted)]"
                        }`}
                      >
                        <Icon size={12} />
                        <span>{l.label}</span>
                      </button>
                    );
                  })}
                </div>

                {/* Sütun Yönü Butonları ("Alt Alta" veya "Sonda Toplu" seçildiğinde pasif) */}
                <div className="flex flex-wrap items-center gap-1 pt-0.5">
                  <div
                    title={
                      translationLayout !== "side-by-side"
                        ? "Sütun yönü sadece Yan Yana görünümde geçerlidir"
                        : undefined
                    }
                    className={`flex flex-wrap gap-1 ${
                      translationLayout !== "side-by-side"
                        ? "opacity-40 pointer-events-none select-none"
                        : ""
                    }`}
                  >
                    <button
                      type="button"
                      disabled={translationLayout !== "side-by-side"}
                      title="Sütun yönü sadece Yan Yana görünümde geçerlidir"
                      onClick={() => {
                        playClick();
                        setSideBySideOrder("ar-right");
                      }}
                      className={`px-2 py-0.5 rounded-md text-[10px] font-bold cursor-pointer ${
                        sideBySideOrder === "ar-right"
                          ? "bg-emerald-700 text-white"
                          : "bg-white text-[var(--muted)]"
                      }`}
                    >
                      Sağda Arapça / Solda Türkçe
                    </button>
                    <button
                      type="button"
                      disabled={translationLayout !== "side-by-side"}
                      title="Sütun yönü sadece Yan Yana görünümde geçerlidir"
                      onClick={() => {
                        playClick();
                        setSideBySideOrder("ar-left");
                      }}
                      className={`px-2 py-0.5 rounded-md text-[10px] font-bold cursor-pointer ${
                        sideBySideOrder === "ar-left"
                          ? "bg-emerald-700 text-white"
                          : "bg-white text-[var(--muted)]"
                      }`}
                    >
                      Solda Arapça / Sağda Türkçe
                    </button>
                  </div>

                  {translationLayout === "grouped-end" && (
                    <div className="flex flex-wrap gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          playClick();
                          setTranslationPageBreak("same");
                        }}
                        className={`px-2 py-0.5 rounded-md text-[10px] font-bold cursor-pointer ${
                          translationPageBreak === "same"
                            ? "bg-emerald-700 text-white"
                            : "bg-white text-[var(--muted)]"
                        }`}
                      >
                        Konum: Aynı Sayfada
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          playClick();
                          setTranslationPageBreak("new");
                        }}
                        className={`px-2 py-0.5 rounded-md text-[10px] font-bold cursor-pointer ${
                          translationPageBreak === "new"
                            ? "bg-emerald-700 text-white"
                            : "bg-white text-[var(--muted)]"
                        }`}
                      >
                        Konum: Arka Sayfada
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Kelime Tablosu Test Modu & Konumu ("Kelime Tablosu" kapalıysa pasif) */}
              <div
                aria-disabled={!includeVocabulary}
                className={`p-2 rounded-xl border border-[#E6D7BE] space-y-1 transition-all ${
                  !includeVocabulary
                    ? "opacity-45 pointer-events-none select-none bg-stone-100/60 dark:bg-slate-800/40"
                    : "bg-[#F7EFE1]/70 dark:bg-[var(--background)]"
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-1">
                  <span className="text-[11px] font-extrabold text-[#087F5B]">
                    Kelime Tablosu Modu & Konumu{" "}
                    {!includeVocabulary ? "(Kapalı)" : ""}:
                  </span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {[
                    { id: "both" as VocabLanguageMode, label: "Arapça + Türkçe" },
                    {
                      id: "ar-only" as VocabLanguageMode,
                      label: "Anlam Testi (TR Boş)",
                    },
                    {
                      id: "tr-only" as VocabLanguageMode,
                      label: "İmla Testi (AR Boş)",
                    },
                  ].map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => {
                        playClick();
                        setVocabLanguageMode(m.id);
                      }}
                      className={`px-2 py-0.5 rounded-lg text-[10px] font-bold cursor-pointer ${
                        vocabLanguageMode === m.id
                          ? "bg-[#0CA678] text-white"
                          : "bg-white dark:bg-[var(--surface)] text-[var(--muted)]"
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
                <div className="flex flex-wrap items-center gap-1 pt-0.5">
                  <button
                    type="button"
                    onClick={() => {
                      playClick();
                      setVocabPlacement((p) =>
                        p === "same-page" ? "new-page" : "same-page"
                      );
                    }}
                    className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-white border border-[#E6D7BE] text-[var(--foreground)] cursor-pointer"
                  >
                    Konum:{" "}
                    {vocabPlacement === "same-page"
                      ? "Aynı Sayfada"
                      : "Yeni Sayfada"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      playClick();
                      setIncludeWorksheet((v) => !v);
                    }}
                    className={`px-2 py-0.5 rounded-md text-[10px] font-bold cursor-pointer ${
                      includeWorksheet
                        ? "bg-[#6741D9] text-white"
                        : "bg-white border border-[#E6D7BE] text-[var(--muted)]"
                    }`}
                  >
                    +5 Ek Soru: {includeWorksheet ? "Açık" : "Kapalı"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* CANLI A4 ÇALIŞMA KAĞIDI ÖNİZLEME ALANI */}
        <div
          className={`flex-1 overflow-y-auto p-2.5 sm:p-6 bg-[#EFE6D5]/70 dark:bg-black/40 print:block! ${
            mobileTab === "preview" ? "block" : "hidden md:block"
          }`}
        >
          <div
            ref={a4PageRef}
            style={
              activeDensity === "ultra"
                ? { zoom: 0.92 }
                : activeDensity === "tight"
                ? { zoom: 0.96 }
                : undefined
            }
            className={`max-w-[780px] w-full mx-auto bg-white text-slate-900 light rounded-2xl border-2 border-[#CBD5E1] shadow-lg overflow-x-hidden transition-all ${
              activeDensity === "ultra"
                ? "p-3 space-y-1.5"
                : activeDensity === "tight"
                ? "p-4 space-y-2"
                : activeDensity === "compact"
                ? "p-5 space-y-2.5"
                : "p-7 sm:p-8 space-y-4"
            }`}
          >
            {/* Önizleme Rozeti (print:hidden) */}
            <div className="print:hidden flex flex-wrap items-center justify-between gap-2 text-[11px] font-bold text-slate-500 border-b border-slate-200 pb-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="flex items-center gap-1.5 text-[#087F5B]">
                  <Eye size={14} />
                  <span>Canlı A4 Çalışma Kağıdı Önizlemesi</span>
                </span>
                {activeDensity !== "normal" && (
                  <span className="px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 border border-emerald-300 text-[10px] font-extrabold">
                    ✨ Sarkan satırlar otomatik daraltılarak sayfaya sığdırıldı
                  </span>
                )}
              </div>
              <span>Vektörel A4 Çıktı • {fontConfig.name.split(" (")[0]}</span>
            </div>

            {/* A4 ÜST BAŞLIK KARTI */}
            <div
              className={`border-2 border-[#0CA678] border-b-4 rounded-2xl bg-[#FDFBF7] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 ${
                activeDensity === "ultra"
                  ? "p-2 mb-2"
                  : activeDensity === "tight"
                  ? "p-2.5 mb-2.5"
                  : activeDensity === "compact"
                  ? "p-3 mb-3"
                  : "p-4 mb-5"
              }`}
            >
              <div className="flex-1 min-w-0 space-y-1 w-full">
                <div
                  className={`flex items-center gap-1.5 flex-wrap ${
                    activeDensity === "ultra" ? "text-[10px]" : ""
                  }`}
                >
                  <span className="px-2 py-0.5 rounded-md bg-[#0CA678] text-white text-[10px] font-extrabold">
                    DİYALOG #{String(rawNum).padStart(2, "0")}
                  </span>
                  <span className="px-2 py-0.5 rounded-md bg-[#6741D9] text-white text-[10px] font-extrabold">
                    CEFR {dialogue.seviye}
                  </span>
                  <span className="px-2 py-0.5 rounded-md border border-[#CBB692] text-[#5C5042] text-[10px] font-bold">
                    {dialogue.satirlar.length} Cümle • {vocabEntries.length}{" "}
                    Kelime
                  </span>
                  <span className="px-2 py-0.5 rounded-md border border-[#CBB692] text-[#5C5042] text-[10px] font-bold">
                    {includeHarakat ? "Harekeli" : "Harekesiz"}
                  </span>
                </div>

                <div className="flex items-baseline justify-between gap-3 flex-wrap">
                  <h1
                    className={`font-extrabold text-[#1f1a14] ${
                      activeDensity === "ultra" || activeDensity === "tight"
                        ? "text-base"
                        : activeDensity === "compact"
                        ? "text-lg"
                        : "text-xl"
                    }`}
                  >
                    {dialogue.baslik_tr}
                  </h1>
                  <span
                    dir="rtl"
                    className={`arabic font-bold text-[#087F5B] ${
                      activeDensity === "ultra"
                        ? "text-xl"
                        : activeDensity === "tight"
                        ? "text-2xl"
                        : activeDensity === "compact"
                        ? "text-2xl sm:text-3xl"
                        : "text-2xl sm:text-3xl"
                    }`}
                  >
                    {formatAr(dialogue.baslik_ar)}
                  </span>
                </div>
              </div>

              {/* Sağ Köşe: Kompakt Görsel ve/veya QR Kod (Kademeye göre: w-24 h-24 | w-20 h-20 | w-16 h-16 | w-14 h-14) */}
              {(effectiveImageMode === "compact" || includeQrCode) && (
                <div className="flex items-center gap-2.5 sm:border-l sm:border-dashed sm:border-slate-300 sm:pl-3 shrink-0">
                  {effectiveImageMode === "compact" && (
                    <img
                      src={imagePath}
                      alt={dialogue.baslik_tr}
                      loading="eager"
                      referrerPolicy="no-referrer"
                      onError={() => setImgError(true)}
                      className={`object-cover rounded-xl border border-slate-300 shrink-0 ${
                        activeDensity === "ultra"
                          ? "w-14 h-14"
                          : activeDensity === "tight"
                          ? "w-16 h-16"
                          : activeDensity === "compact"
                          ? "w-20 h-20"
                          : "w-24 h-24"
                      }`}
                    />
                  )}
                  {includeQrCode && (
                    <a
                      href={dialogueUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={`${dialogueUrl} adresini aç`}
                      className="flex flex-col items-center gap-0.5 shrink-0 group hover:opacity-90 transition-opacity"
                    >
                      <div
                        className={`flex items-center justify-center ${
                          activeDensity === "ultra"
                            ? "w-14 h-14"
                            : activeDensity === "tight"
                            ? "w-16 h-16"
                            : activeDensity === "compact"
                            ? "w-20 h-20"
                            : "w-24 h-24"
                        }`}
                        dangerouslySetInnerHTML={{ __html: qrSvgMarkup }}
                      />
                      <span
                        className={`${
                          activeDensity === "ultra" ? "text-[8px]" : "text-[9px]"
                        } font-extrabold text-[#087F5B] whitespace-nowrap group-hover:underline`}
                      >
                        Dinlemek için okutun
                      </span>
                      {activeDensity !== "ultra" && (
                        <span className="text-[9px] text-slate-500 font-mono whitespace-nowrap">
                          {shortDisplayUrl}
                        </span>
                      )}
                    </a>
                  )}
                </div>
              )}
            </div>

            {/* 👤 ÖĞRENCİ BİLGİ ŞERİDİ (Ad-Soyad / Sınıf / Tarih / Puan) */}
            {(includeStudentHeader || pdfDocMode === "quiz-sheet") && (
              <div
                className={`border border-slate-300 rounded-xl bg-slate-50 flex flex-wrap items-center justify-between gap-2 text-slate-800 ${
                  activeDensity === "ultra"
                    ? "px-2.5 py-1 text-[10.5px]"
                    : activeDensity === "tight"
                    ? "px-3 py-1.5 text-[11px]"
                    : activeDensity === "compact"
                    ? "px-3 py-1.5 text-[11.5px]"
                    : "px-3.5 py-2 text-xs"
                }`}
              >
                <span>
                  <strong>Adı Soyadı:</strong>{" "}
                  <span className="text-slate-600">
                    ..................................
                  </span>
                </span>
                <span>
                  <strong>Sınıfı / No:</strong>{" "}
                  <span className="text-slate-600">.................</span>
                </span>
                <span>
                  <strong>Tarih:</strong>{" "}
                  <span className="text-slate-600">.... / .... / 2026</span>
                </span>
                <span>
                  <strong>Puan:</strong>{" "}
                  <span className="text-slate-600">....... / 100</span>
                </span>
              </div>
            )}

            {pdfDocMode === "quiz-sheet" ? (
              <div className="space-y-4">
                {/* BÖLÜM A — KELİME EŞLEŞTİRME (30 PUAN) */}
                <div className="space-y-1.5 break-inside-avoid">
                  <div className="flex items-center justify-between bg-[#F7EFE1] border border-[#E6D7BE] border-l-4 border-l-[#0CA678] px-3 py-1.5 rounded-lg">
                    <span className="text-xs font-extrabold text-slate-900">
                      BÖLÜM A — Kelime Eşleştirme (30 Puan)
                    </span>
                    <span
                      dir="rtl"
                      className="arabic text-base font-bold text-[#087F5B]"
                    >
                      أ. تَوْصِيلُ الْمُفْرَدَاتِ
                    </span>
                  </div>
                  <div className="border border-slate-300 rounded-xl overflow-hidden">
                    <table className="w-full border-collapse text-xs">
                      <thead>
                        <tr className="bg-slate-100 border-b border-slate-300 text-slate-800 font-extrabold">
                          <th
                            dir="rtl"
                            className="py-1.5 px-3 text-right w-[44%]"
                          >
                            الْكَلِمَةُ الْعَرَبِيَّةُ (Arapça Kelime)
                          </th>
                          <th className="py-1.5 px-2 text-center w-[14%] border-x border-slate-200">
                            Eşleştirme
                          </th>
                          <th className="py-1.5 px-3 text-left w-[42%]">
                            Türkçe Anlamı (Seçenekler)
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {a4QuizSheetData.sectionAMatching.map((row) => (
                          <tr
                            key={row.num}
                            className="bg-white odd:bg-slate-50/70"
                          >
                            <td
                              dir="rtl"
                              className="py-1 px-3 text-right arabic text-xl font-bold text-[#087F5B]"
                            >
                              {row.num}. {formatAr(row.arabic)}
                            </td>
                            <td className="py-1 px-2 text-center font-extrabold text-slate-700 border-x border-dashed border-slate-200">
                              ( &nbsp;&nbsp;&nbsp; )
                            </td>
                            <td className="py-1 px-3 text-left font-bold text-slate-800">
                              <span className="text-[#6741D9] font-extrabold mr-1">
                                {row.letter})
                              </span>
                              {row.shuffledTr}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* BÖLÜM B — BOŞLUK DOLDURMA (40 PUAN) */}
                <div className="space-y-2 break-inside-avoid">
                  <div className="flex items-center justify-between bg-[#F7EFE1] border border-[#E6D7BE] border-l-4 border-l-[#6741D9] px-3 py-1.5 rounded-lg">
                    <span className="text-xs font-extrabold text-slate-900">
                      BÖLÜM B — Boşluk Doldurma (40 Puan)
                    </span>
                    <span
                      dir="rtl"
                      className="arabic text-base font-bold text-[#6741D9]"
                    >
                      ب. امْلَأِ الْفَرَاغَاتِ بِالْكَلِمَةِ الْمُنَاسِبَةِ
                    </span>
                  </div>

                  {/* Üstte Karışık Kelime Havuzu Kutusu */}
                  <div className="bg-[#F3F0FF] border-2 border-dashed border-[#6741D9] rounded-xl p-2.5 space-y-1.5">
                    <div className="flex items-center justify-between text-[11px] font-extrabold text-[#4C28B5]">
                      <span>
                        📦 Kelime Havuzu (Boşlukları uygun kelimelerle doldurunuz)
                      </span>
                      <span dir="rtl" className="arabic text-base font-bold">
                        صُنْدُوقُ الْكَلِمَاتِ
                      </span>
                    </div>
                    <div
                      dir="rtl"
                      className="flex flex-wrap items-center justify-center gap-2"
                    >
                      {a4QuizSheetData.wordBank.map((w, idx) => (
                        <span
                          key={`${w}-${idx}`}
                          className="arabic text-lg font-bold px-3 py-0.5 rounded-lg bg-white border border-[#D0BFFF] text-[#3B1FA8]"
                        >
                          {formatAr(w)}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="border border-slate-300 rounded-xl overflow-hidden divide-y divide-slate-200">
                    {a4QuizSheetData.sectionBFillBlanks.map((q, idx) => (
                      <div
                        key={q.sira}
                        className="py-1.5 px-3 bg-white odd:bg-slate-50/70 space-y-0.5"
                      >
                        <div
                          dir="rtl"
                          className="arabic text-xl font-bold text-slate-900 text-right"
                        >
                          {idx + 1}. {formatAr(q.blankSentence)}
                        </div>
                        <div className="text-[11px] font-medium text-slate-600">
                          İpucu: {q.turkce}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* BÖLÜM C — KALIP İFADELER VE ANLAMA (30 PUAN) */}
                <div className="space-y-1.5 break-inside-avoid">
                  <div className="flex items-center justify-between bg-[#F7EFE1] border border-[#E6D7BE] border-l-4 border-l-[#0CA678] px-3 py-1.5 rounded-lg">
                    <span className="text-xs font-extrabold text-slate-900">
                      BÖLÜM C — Kalıp İfadeler ve Anlama (30 Puan)
                    </span>
                    <span
                      dir="rtl"
                      className="arabic text-base font-bold text-[#087F5B]"
                    >
                      ج. التَّعْبِيرَاتُ وَفَهْمُ الْحِوَارِ
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {a4QuizSheetData.sectionCMultipleChoice.map((mc) => (
                      <div
                        key={mc.num}
                        className="rounded-xl border border-slate-300 bg-white p-2.5 space-y-1.5"
                      >
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="text-[10px] font-extrabold text-[#6741D9] bg-[#F3F0FF] px-2 py-0.5 rounded-md">
                            Soru {mc.num} • {mc.typeLabel}
                          </span>
                          <span
                            dir="rtl"
                            className="arabic text-lg font-bold text-[#087F5B] text-right"
                          >
                            {formatAr(mc.arabicPrompt)}
                          </span>
                        </div>
                        <p className="text-[11px] font-bold text-slate-700">
                          {mc.questionTr}
                        </p>
                        <div className="space-y-1 text-[11px] text-slate-800">
                          {mc.options.map((o) => (
                            <div key={o.letter} className="leading-snug">
                              <strong className="text-[#087F5B]">
                                {o.letter})
                              </strong>{" "}
                              {o.text}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 🔑 ÖĞRETMEN CEVAP ANAHTARI SEÇENEĞİ */}
                {includeAnswerKey && (
                  <div className="space-y-1.5 pt-2 break-inside-avoid">
                    <div className="text-xs font-extrabold text-[#087F5B] bg-emerald-50 border border-emerald-300 border-l-4 border-l-[#0CA678] px-3 py-1.5 rounded-lg">
                      🔑 Öğretmen Cevap Anahtarı (مفتاح الإجابات)
                    </div>
                    <div className="rounded-xl border border-dashed border-[#0CA678] bg-slate-50 p-3 text-[11px] text-slate-800 space-y-1.5">
                      <div>
                        <strong>Bölüm A (Kelime Eşleştirme - 30p):</strong>{" "}
                        {a4QuizSheetData.sectionAMatching
                          .map(
                            (m) =>
                              `${m.num}-${m.correctLetter} (${m.correctTr})`
                          )
                          .join(" • ")}
                      </div>
                      <div>
                        <strong>Bölüm B (Boşluk Doldurma - 40p):</strong>{" "}
                        <span
                          dir="rtl"
                          className="arabic text-base font-bold text-[#087F5B]"
                        >
                          {a4QuizSheetData.sectionBFillBlanks
                            .map((b, idx) => `(${idx + 1}) ${formatAr(b.answer)}`)
                            .join(" • ")}
                        </span>
                      </div>
                      <div>
                        <strong>
                          Bölüm C (Kalıp İfadeler ve Anlama - 30p):
                        </strong>{" "}
                        {a4QuizSheetData.sectionCMultipleChoice
                          .map(
                            (c) =>
                              `${c.num}-${c.correctLetter} (${c.correctText})`
                          )
                          .join(" | ")}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <>
            {/* PDF-1: Geniş Banner Görsel Modu (width: 100%, max-height: 135px, object-fit: cover) */}
            {effectiveImageMode === "banner" && (
              <div className="w-full rounded-xl overflow-hidden border border-slate-300">
                <img
                  src={imagePath}
                  alt={dialogue.baslik_tr}
                  loading="eager"
                  referrerPolicy="no-referrer"
                  onError={() => setImgError(true)}
                  className="w-full max-h-[135px] object-cover block"
                />
              </div>
            )}

            {/* PDF-3: Kelime Kutusu (الكلمات المساعدة) — Boşluk Doldurma Modu Aktifse */}
            {clozeMode && clozeData.helperWords.length > 0 && (
              <div
                className={`bg-[#F3F0FF] border-2 border-dashed border-[#6741D9] rounded-xl ${
                  activeDensity === "ultra"
                    ? "p-1.5 space-y-1"
                    : activeDensity === "tight"
                    ? "p-2 space-y-1.5"
                    : "p-3 space-y-2"
                }`}
              >
                <div className="flex items-center justify-between text-xs font-extrabold text-[#4C28B5]">
                  <span>✏️ Kelime Kutusu (Boşlukları doldurunuz)</span>
                  <span dir="rtl" className="arabic text-lg font-bold">
                    الكلمات المساعدة
                  </span>
                </div>
                <div
                  dir="rtl"
                  className="flex flex-wrap items-center justify-center gap-2"
                >
                  {clozeData.helperWords.map((word, idx) => (
                    <span
                      key={`${word}-${idx}`}
                      className="arabic text-lg sm:text-xl font-bold px-3 py-0.5 rounded-lg bg-white border border-[#D0BFFF] text-[#3B1FA8]"
                    >
                      {formatAr(word)}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* DİYALOG SATIRLARI ÖNİZLEMESİ */}
            {translationMode === "hide" ? (
              <div className="border border-slate-300 rounded-xl overflow-hidden divide-y divide-slate-200">
                {dialogue.satirlar.map((line, idx) => {
                  const spIdx = speakers.indexOf(line.konusmaci);
                  const isEmerald = spIdx % 2 === 0;
                  const arText = clozeData.processedLines[idx] || line.arapca;
                  return (
                    <div
                      key={line.sira}
                      dir="rtl"
                      className={`${
                        activeDensity === "ultra"
                          ? "py-0.5 px-2"
                          : activeDensity === "tight"
                          ? "py-1 px-2"
                          : activeDensity === "compact"
                          ? "py-1.5 px-2.5"
                          : "py-2.5 px-3"
                      } flex items-baseline gap-2 break-inside-avoid ${
                        idx % 2 === 0 ? "bg-slate-50" : "bg-white"
                      }`}
                    >
                      <span
                        className={`arabic text-base font-bold px-2 py-0.5 rounded-md border shrink-0 ${
                          isEmerald
                            ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                            : "bg-violet-50 text-violet-800 border-violet-200"
                        }`}
                      >
                        {formatAr(line.konusmaci_ar)}
                      </span>
                      <span
                        className={`arabic font-bold text-slate-900 ${
                          activeDensity === "ultra"
                            ? "text-[15.5px] leading-tight"
                            : activeDensity === "tight"
                            ? "text-[16.5px] leading-snug"
                            : activeDensity === "compact"
                            ? "text-[17.5px] leading-snug"
                            : "text-[19px] leading-relaxed"
                        }`}
                      >
                        {formatAr(arText)}
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : translationLayout === "stacked" ? (
              /* ALT ALTA MODU: Üstte Arapça (dir="rtl"), hemen altında kesikli çizgi ile ayrılmış Türkçe tercüme (dir="ltr") */
              <div className="border border-slate-300 rounded-xl overflow-hidden divide-y divide-slate-200">
                {dialogue.satirlar.map((line, idx) => {
                  const spIdx = speakers.indexOf(line.konusmaci);
                  const isEmerald = spIdx % 2 === 0;
                  const arText = clozeData.processedLines[idx] || line.arapca;

                  return (
                    <div
                      key={line.sira}
                      className={`${
                        activeDensity === "ultra"
                          ? "py-0.5 px-2"
                          : activeDensity === "tight"
                          ? "py-1 px-2"
                          : activeDensity === "compact"
                          ? "py-1.5 px-2.5"
                          : "py-2.5 px-3"
                      } break-inside-avoid ${
                        idx % 2 === 0 ? "bg-slate-50" : "bg-white"
                      }`}
                    >
                      <div
                        dir="rtl"
                        className="text-right flex items-baseline gap-2"
                      >
                        <span
                          className={`arabic text-base font-bold px-2 py-0.5 rounded-md border shrink-0 ${
                            isEmerald
                              ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                              : "bg-violet-50 text-violet-800 border-violet-200"
                          }`}
                        >
                          {formatAr(line.konusmaci_ar)}
                        </span>
                        {translationMode === "ar-dotted" ? (
                          <div className="flex-1 border-b border-dotted border-slate-400 h-7" />
                        ) : (
                          <span
                            className={`arabic font-bold text-slate-900 ${
                              activeDensity === "ultra"
                                ? "text-[15.5px] leading-tight"
                                : activeDensity === "tight"
                                ? "text-[16.5px] leading-snug"
                                : activeDensity === "compact"
                                ? "text-[17.5px] leading-snug"
                                : "text-[19px] leading-relaxed"
                            }`}
                          >
                            {formatAr(arText)}
                          </span>
                        )}
                      </div>

                      <div
                        dir="ltr"
                        className="mt-1 pt-1 border-t border-slate-200/70 text-left"
                      >
                        {translationMode === "dotted" ? (
                          <div className="flex items-end gap-2">
                            <span className="text-xs font-bold text-slate-600 shrink-0">
                              {line.konusmaci}:
                            </span>
                            <div className="w-full border-b border-dotted border-slate-400 h-5" />
                          </div>
                        ) : (
                          <div
                            className={`text-slate-600 ${
                              activeDensity === "ultra"
                                ? "text-[11px] leading-tight"
                                : activeDensity === "tight"
                                ? "text-[11.5px] leading-tight"
                                : activeDensity === "compact"
                                ? "text-[12px] leading-snug"
                                : "text-[13px] leading-normal"
                            }`}
                          >
                            <span className="font-bold text-slate-600 mr-1.5">
                              {line.konusmaci}:
                            </span>
                            <span>{line.turkce}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : translationLayout === "grouped-end" ? (
              /* SONDA TOPLU MODU: Diyalog satırlarında yalnızca numaralı Arapça cümleler, altında (veya yeni sayfada) toplu tercüme bloğu */
              <div
                className={
                  activeDensity === "ultra"
                    ? "space-y-1.5"
                    : activeDensity !== "normal"
                    ? "space-y-2"
                    : "space-y-4"
                }
              >
                <div className="border border-slate-300 rounded-xl overflow-hidden divide-y divide-slate-200">
                  {dialogue.satirlar.map((line, idx) => {
                    const spIdx = speakers.indexOf(line.konusmaci);
                    const isEmerald = spIdx % 2 === 0;
                    const arText = clozeData.processedLines[idx] || line.arapca;
                    return (
                      <div
                        key={line.sira}
                        dir="rtl"
                        className={`${
                          activeDensity === "ultra"
                            ? "py-0.5 px-2"
                            : activeDensity === "tight"
                            ? "py-1 px-2"
                            : activeDensity === "compact"
                            ? "py-1.5 px-2.5"
                            : "py-2.5 px-3"
                        } flex items-baseline gap-2 break-inside-avoid ${
                          idx % 2 === 0 ? "bg-slate-50" : "bg-white"
                        }`}
                      >
                        <span
                          className={`arabic text-base font-bold px-2 py-0.5 rounded-md border shrink-0 ${
                            isEmerald
                              ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                              : "bg-violet-50 text-violet-800 border-violet-200"
                          }`}
                        >
                          {line.sira}. {formatAr(line.konusmaci_ar)}
                        </span>
                        {translationMode === "ar-dotted" ? (
                          <div className="flex-1 border-b border-dotted border-slate-400 h-7" />
                        ) : (
                          <span
                            className={`arabic font-bold text-slate-900 ${
                              activeDensity === "ultra"
                                ? "text-[15.5px] leading-tight"
                                : activeDensity === "tight"
                                ? "text-[16.5px] leading-snug"
                                : activeDensity === "compact"
                                ? "text-[17.5px] leading-snug"
                                : "text-[19px] leading-relaxed"
                            }`}
                          >
                            {formatAr(arText)}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>

                <div
                  className={
                    translationPageBreak === "new"
                      ? "break-before-page print:break-before-page mt-5 pt-4 border-t-2 border-dashed border-emerald-400 space-y-2"
                      : activeDensity === "ultra"
                      ? "mt-1.5 space-y-1"
                      : activeDensity === "tight"
                      ? "mt-2 space-y-1.5"
                      : activeDensity === "compact"
                      ? "mt-3 space-y-1.5"
                      : "mt-5 space-y-2"
                  }
                >
                  <div className="flex items-center justify-between gap-2 text-xs font-extrabold text-[#087F5B] bg-slate-50 border border-slate-300 border-l-4 border-l-[#0CA678] px-3 py-1.5 rounded-lg">
                    <span>Diyalog Tercümeleri (الترجمة التركية)</span>
                    {translationPageBreak === "new" && (
                      <span className="text-[10px] font-bold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-md">
                        Konum: Arka Sayfada
                      </span>
                    )}
                  </div>
                  <div className="border border-slate-300 rounded-xl overflow-hidden divide-y divide-slate-200 bg-white">
                    {dialogue.satirlar.map((line, idx) => (
                      <div
                        key={line.sira}
                        dir="ltr"
                        className={`${
                          activeDensity === "ultra"
                            ? "py-0.5 px-1.5 text-[11px] leading-tight"
                            : activeDensity === "tight"
                            ? "py-0.5 px-2 text-[11.5px] leading-tight"
                            : activeDensity === "compact"
                            ? "py-1 px-2 text-[12px] leading-snug"
                            : "py-1.5 px-2.5 text-[13px] leading-normal"
                        } text-slate-700 ${
                          idx % 2 === 0 ? "bg-slate-50/70" : "bg-white"
                        }`}
                      >
                        {translationMode === "dotted" ? (
                          <div className="flex items-end gap-2">
                            <span className="font-bold text-slate-700 shrink-0">
                              {line.sira}. {line.konusmaci}:
                            </span>
                            <div className="w-full border-b border-dotted border-slate-400 h-5" />
                          </div>
                        ) : (
                          <div>
                            <strong className="font-bold text-slate-800 mr-1.5">
                              {line.sira}. {line.konusmaci}:
                            </strong>
                            <span>{line.turkce}</span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              /* YAN YANA MODU (Varsayılan) */
              <div className="border border-slate-300 rounded-xl overflow-hidden divide-y divide-slate-200">
                {dialogue.satirlar.map((line, idx) => {
                  const spIdx = speakers.indexOf(line.konusmaci);
                  const isEmerald = spIdx % 2 === 0;
                  const arText = clozeData.processedLines[idx] || line.arapca;

                  return (
                    <div
                      key={line.sira}
                      className={`${
                        activeDensity === "ultra"
                          ? "py-0.5 px-2 gap-1.5"
                          : activeDensity === "tight"
                          ? "py-1 px-2 gap-2"
                          : activeDensity === "compact"
                          ? "py-1.5 px-2.5 gap-2.5"
                          : "py-2.5 px-3 gap-3"
                      } grid grid-cols-1 sm:grid-cols-2 items-center break-inside-avoid ${
                        idx % 2 === 0 ? "bg-slate-50" : "bg-white"
                      }`}
                    >
                      {/* Sol Sütun: Türkçe Çeviri veya Noktalı Yazı Alanı */}
                      <div
                        className={
                          sideBySideOrder === "ar-left"
                            ? "sm:order-2"
                            : "sm:order-1"
                        }
                      >
                        {translationMode === "dotted" ? (
                          <div className="flex items-end gap-2">
                            <span
                              className={`text-[11px] font-extrabold px-2 py-0.5 rounded-md border shrink-0 ${
                                isEmerald
                                  ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                                  : "bg-violet-50 text-violet-800 border-violet-200"
                              }`}
                            >
                              {line.konusmaci}:
                            </span>
                            <div className="flex-1 border-b border-dotted border-slate-400 h-6" />
                          </div>
                        ) : (
                          <div
                            className={`text-slate-700 font-semibold ${
                              activeDensity === "ultra"
                                ? "text-[11px] leading-tight"
                                : activeDensity === "tight"
                                ? "text-[11.5px] leading-tight"
                                : activeDensity === "compact"
                                ? "text-[12px] leading-snug"
                                : "text-[13px] leading-normal"
                            }`}
                          >
                            <span
                              className={`text-[10.5px] font-extrabold px-1.5 py-0.5 rounded-md border mr-1.5 inline-block ${
                                isEmerald
                                  ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                                  : "bg-violet-50 text-violet-800 border-violet-200"
                              }`}
                            >
                              {line.konusmaci}
                            </span>
                            <span>{line.turkce}</span>
                          </div>
                        )}
                      </div>

                      {/* Sağ Sütun: Arapça Metin veya Noktalı Yazı Alanı */}
                      <div
                        dir="rtl"
                        className={`text-right ${
                          sideBySideOrder === "ar-left"
                            ? "sm:order-1"
                            : "sm:order-2"
                        }`}
                      >
                        <span
                          className={`arabic text-base font-bold px-2 py-0.5 rounded-md border ml-2 inline-block ${
                            isEmerald
                              ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                              : "bg-violet-50 text-violet-800 border-violet-200"
                          }`}
                        >
                          {formatAr(line.konusmaci_ar)}
                        </span>
                        {translationMode === "ar-dotted" ? (
                          <span className="inline-block w-4/5 border-b border-dotted border-slate-400 h-7 align-bottom" />
                        ) : (
                          <span
                            className={`arabic font-bold text-slate-900 ${
                              activeDensity === "ultra"
                                ? "text-[15.5px] leading-tight"
                                : activeDensity === "tight"
                                ? "text-[16.5px] leading-snug"
                                : activeDensity === "compact"
                                ? "text-[17.5px] leading-snug"
                                : "text-[19px] leading-relaxed"
                            }`}
                          >
                            {formatAr(arText)}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* KELİME TABLOSU ÖNİZLEMESİ */}
            {includeVocabulary && vocabEntries.length > 0 && (
              <div
                className={`space-y-1.5 ${
                  activeDensity === "ultra"
                    ? "mt-1.5"
                    : activeDensity === "tight"
                    ? "mt-2"
                    : activeDensity === "compact"
                    ? "mt-3"
                    : "mt-5"
                }`}
              >
                <div
                  className={`text-xs font-extrabold text-[#087F5B] bg-slate-50 border border-slate-300 border-l-4 border-l-[#0CA678] px-3 rounded-lg ${
                    activeDensity === "ultra"
                      ? "py-0.5"
                      : activeDensity === "tight"
                      ? "py-1"
                      : activeDensity === "compact"
                      ? "py-1.5"
                      : "py-2"
                  }`}
                >
                  📚 Diyalog Kelime Hazinesi (المفردات) — {vocabEntries.length}{" "}
                  Kelime
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                  {vocabEntries.map((entry, idx) => {
                    const w = entry.item;
                    const mainAr = w.mufret || w.mazi || "";
                    return (
                      <div
                        key={`${mainAr}-${idx}`}
                        className={`flex items-center justify-between gap-2 ${
                          activeDensity === "ultra"
                            ? "py-0.5 px-1.5 text-[10.5px]"
                            : activeDensity === "tight"
                            ? "py-0.5 px-2 text-[11px]"
                            : activeDensity === "compact"
                            ? "py-1 px-2 text-[11.5px]"
                            : "py-1.5 px-2.5 text-xs"
                        } rounded-lg border border-slate-300 bg-slate-50 break-inside-avoid`}
                      >
                        <div className="min-w-0 flex-1">
                          {vocabLanguageMode === "ar-only" ? (
                            <div className="border-b border-dotted border-slate-400 h-5 w-11/12" />
                          ) : (
                            <span className="font-bold text-slate-800 block truncate">
                              {w.anlam_tr}
                            </span>
                          )}
                        </div>
                        <div dir="rtl" className="shrink-0">
                          {vocabLanguageMode === "tr-only" ? (
                            <div className="border-b border-dotted border-slate-400 h-5 w-24" />
                          ) : (
                            <span
                              className={`arabic font-bold text-[#087F5B] ${
                                activeDensity === "ultra"
                                  ? "text-[16px] leading-tight"
                                  : activeDensity === "tight"
                                  ? "text-[17px] leading-snug"
                                  : activeDensity === "compact"
                                  ? "text-[18px] leading-snug"
                                  : "text-[19px] leading-relaxed"
                              }`}
                            >
                              {formatAr(mainAr)}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ✨ BU DİYALOGDAKİ KALIP İFADELER (التعبيرات الاصطلاحية) TABLOSU ÖNİZLEMESİ */}
            {includeIdioms && dialogueIdioms.length > 0 && (
              <div
                className={`space-y-1.5 ${
                  activeDensity === "ultra"
                    ? "mt-1.5"
                    : activeDensity === "tight"
                    ? "mt-2"
                    : activeDensity === "compact"
                    ? "mt-3"
                    : "mt-5"
                }`}
              >
                <div
                  className={`text-xs font-extrabold text-[#4C28B5] bg-[#F3F0FF] border border-[#D0BFFF] border-l-4 border-l-[#6741D9] px-3 rounded-lg ${
                    activeDensity === "ultra"
                      ? "py-0.5"
                      : activeDensity === "tight"
                      ? "py-1"
                      : activeDensity === "compact"
                      ? "py-1.5"
                      : "py-2"
                  }`}
                >
                  ✨ Bu Diyalogdaki Kalıp İfadeler (التعبيرات الاصطلاحية) —{" "}
                  {dialogueIdioms.length} İfade
                </div>
                <div className="border border-slate-300 rounded-xl overflow-hidden">
                  <table className="w-full border-collapse text-left">
                    <thead>
                      <tr className="bg-[#F3F0FF] text-[#4C28B5] text-[11px] font-extrabold border-b border-slate-300">
                        <th
                          className={`${
                            activeDensity === "ultra"
                              ? "py-0.5 px-1.5"
                              : activeDensity === "tight"
                              ? "py-1 px-2"
                              : activeDensity === "compact"
                              ? "py-1.5 px-2"
                              : "py-2 px-2.5"
                          } text-right w-[30%]`}
                        >
                          Kalıp İfade (Arapça)
                        </th>
                        <th
                          className={`${
                            activeDensity === "ultra"
                              ? "py-0.5 px-1.5"
                              : activeDensity === "tight"
                              ? "py-1 px-2"
                              : activeDensity === "compact"
                              ? "py-1.5 px-2"
                              : "py-2 px-2.5"
                          } w-[32%]`}
                        >
                          Deyimsel Anlamı (Türkçe)
                        </th>
                        <th
                          className={`${
                            activeDensity === "ultra"
                              ? "py-0.5 px-1.5"
                              : activeDensity === "tight"
                              ? "py-1 px-2"
                              : activeDensity === "compact"
                              ? "py-1.5 px-2"
                              : "py-2 px-2.5"
                          } w-[38%]`}
                        >
                          Harfiyen Anlamı & Kullanım İpucu
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {dialogueIdioms.map((idm) => (
                        <tr
                          key={idm.id}
                          className="break-inside-avoid bg-white odd:bg-slate-50/70"
                        >
                          <td
                            dir="rtl"
                            className={`${
                              activeDensity === "ultra"
                                ? "py-0.5 px-1.5 text-[15.5px] leading-tight"
                                : activeDensity === "tight"
                                ? "py-0.5 px-2 text-[16.5px] leading-snug"
                                : activeDensity === "compact"
                                ? "py-1 px-2 text-[17.5px] leading-snug"
                                : "py-1.5 px-2.5 text-[19px] leading-relaxed"
                            } text-right font-arabic arabic font-bold text-[#087F5B] border-l border-dashed border-slate-200`}
                          >
                            {formatAr(idm.arabic)}
                          </td>
                          <td
                            className={`${
                              activeDensity === "ultra"
                                ? "py-0.5 px-1.5 text-[10.5px]"
                                : activeDensity === "tight"
                                ? "py-0.5 px-2 text-[11px]"
                                : activeDensity === "compact"
                                ? "py-1 px-2 text-[11.5px]"
                                : "py-1.5 px-2.5 text-xs"
                            } font-bold text-slate-800 border-l border-dashed border-slate-200`}
                          >
                            {idiomsBlankMode ? (
                              <div className="border-b border-dotted border-slate-400 h-5 w-11/12" />
                            ) : (
                              idm.meaningTr
                            )}
                          </td>
                          <td
                            className={`${
                              activeDensity === "ultra"
                                ? "py-0.5 px-1.5 text-[10.5px]"
                                : activeDensity === "tight"
                                ? "py-0.5 px-2 text-[11px]"
                                : activeDensity === "compact"
                                ? "py-1 px-2 text-[11.5px]"
                                : "py-1.5 px-2.5 text-xs"
                            } text-slate-600 space-y-0.5`}
                          >
                            {idm.literalTr && (
                              <div className="text-[#5F3DC4] font-semibold">
                                <strong>Harfiyen:</strong> {idm.literalTr}
                              </div>
                            )}
                            {idm.usageNote && (
                              <div>
                                <strong>İpucu:</strong> {idm.usageNote}
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* 🗝️ CEVAP ANAHTARI ÖNİZLEMESİ (Yalnızca boşluklu çalışma kağıdı aktifse) */}
            {includeAnswerKey && hasAnyBlankActivity && (
              <div className="space-y-1.5 pt-2 break-inside-avoid">
                <div className="text-xs font-extrabold text-[#087F5B] bg-emerald-50 border border-emerald-300 border-l-4 border-l-[#0CA678] px-3 py-1.5 rounded-lg">
                  🗝️ Cevap Anahtarı (مفتاح الإجابات)
                </div>
                <div className="rounded-xl border border-dashed border-[#0CA678] bg-slate-50 p-3 text-[11px] text-slate-700 space-y-1">
                  {clozeMode && clozeData.helperWords.length > 0 && (
                    <div>
                      <strong>Diyalog Boşlukları:</strong>{" "}
                      <span dir="rtl" className="arabic text-base font-bold text-[#087F5B]">
                        {dialogue.satirlar
                          .map((l, i) =>
                            clozeData.processedLines[i] !== l.arapca
                              ? `(${i + 1}) ${formatAr(l.arapca)}`
                              : ""
                          )
                          .filter(Boolean)
                          .join(" • ")}
                      </span>
                    </div>
                  )}
                  {includeIdioms && idiomsBlankMode && dialogueIdioms.length > 0 && (
                    <div>
                      <strong>Kalıp İfadeler:</strong>{" "}
                      {dialogueIdioms
                        .map(
                          (idm, i) =>
                            `${i + 1}. ${formatAr(idm.arabic)} = ${idm.meaningTr}`
                        )
                        .join(" | ")}
                    </div>
                  )}
                  {includeVocabulary && vocabLanguageMode !== "both" && (
                    <div>
                      <strong>Kelime Testi:</strong>{" "}
                      {vocabEntries
                        .slice(0, 14)
                        .map(
                          (e, i) =>
                            `${i + 1}. ${formatAr(
                              e.item.mufret || e.item.mazi || ""
                            )}: ${e.item.anlam_tr}`
                        )
                        .join(" | ")}
                    </div>
                  )}
                  {(translationMode === "dotted" ||
                    translationMode === "ar-dotted") && (
                    <div>
                      <strong>Diyalog Satırları:</strong>{" "}
                      {dialogue.satirlar
                        .map((l) =>
                          translationMode === "dotted"
                            ? `${l.sira}. ${l.turkce}`
                            : `${l.sira}. ${formatAr(l.arapca)}`
                        )
                        .join(" • ")}
                    </div>
                  )}
                </div>
              </div>
            )}
              </>
            )}

            {/* ZORUNLU KURUMSAL ALT BİLGİ (FOOTER): www.muallimun.net */}
            <footer className="pt-3 mt-4 border-t-2 border-[#0CA678] flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-600">
              <span className="font-semibold">
                Diyalog #{String(rawNum).padStart(2, "0")}: {dialogue.baslik_tr} (
                {dialogue.seviye}) — Arapça Çalışma Kağıdı
              </span>
              <a
                href="https://www.muallimun.net"
                target="_blank"
                rel="noopener noreferrer"
                className="font-extrabold text-xs text-[#087F5B] tracking-wide hover:underline"
              >
                www.muallimun.net
              </a>
            </footer>
          </div>
        </div>

        {/* MODAL ALT AKSİYON ÇUBUĞU (print:hidden - Her iki sekmede de sabit görünür) */}
        <div className="print:hidden bg-[#F7EFE1] dark:bg-[var(--background)] px-4 sm:px-5 py-2.5 border-t-2 border-[#E6D7BE] dark:border-[var(--border)] flex items-center justify-between gap-3 shrink-0">
          <span className="text-xs font-extrabold text-[#087F5B] hidden sm:inline">
            www.muallimun.net • Kurumsal A4 Vektörel Çalışma Kağıdı
          </span>
          <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
            <button
              type="button"
              onClick={() => {
                playClick();
                onClose();
              }}
              className="px-4 py-2 rounded-xl bg-white dark:bg-[var(--surface)] border-2 border-[#E6D7BE] dark:border-[var(--border)] border-b-4 text-xs font-extrabold text-[var(--muted)] hover:text-[var(--foreground)] cursor-pointer"
            >
              Vazgeç
            </button>

            <button
              type="button"
              onClick={handleGenerateAndPrintPdf}
              className="flex-1 sm:flex-initial px-5 py-2 rounded-xl bg-[#0CA678] hover:bg-[#099268] text-white font-extrabold text-xs sm:text-sm border-b-4 border-[#087F5B] active:border-b-0 active:translate-y-1 transition-all flex items-center justify-center gap-2 cursor-pointer shadow-md"
            >
              <Printer size={17} />
              <span>Yazdır / PDF Kaydet</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
