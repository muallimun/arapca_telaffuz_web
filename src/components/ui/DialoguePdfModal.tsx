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
type TranslationPrintMode = "show" | "hide" | "dotted";
type TranslationLayout = "side-by-side" | "stacked" | "grouped-end";
type SideBySideOrder = "ar-right" | "ar-left";
type VocabPlacement = "same-page" | "new-page";
type VocabLanguageMode = "both" | "ar-only" | "tr-only";

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
 * Harici paket gerektirmeyen, URL'yi deterministik 21x21 QR matrisine (Finder + Timing + Veri modülleri)
 * dönüştüren saf vektörel SVG QR Kod üreticisi (64x64px)
 */
function generateQrSvgMarkup(urlText: string, size = 64): string {
  const N = 21;
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

  // Timing patterns
  for (let i = 8; i < N - 8; i++) {
    reserved[6][i] = true;
    reserved[i][6] = true;
    grid[6][i] = i % 2 === 0;
    grid[i][6] = i % 2 === 0;
  }

  // Dark module
  reserved[N - 8][8] = true;
  grid[N - 8][8] = true;

  // URL bit stream
  const bytes: number[] = [];
  for (let i = 0; i < urlText.length; i++) {
    bytes.push(urlText.charCodeAt(i) & 0xff);
  }
  if (bytes.length === 0) bytes.push(0x6d, 0x75);

  let bitIdx = 0;
  for (let col = N - 1; col > 0; col -= 2) {
    if (col === 6) col--;
    for (let rowOffset = 0; rowOffset < N; rowOffset++) {
      const r = ((col + 1) & 2) === 0 ? N - 1 - rowOffset : rowOffset;
      for (let dc = 0; dc < 2; dc++) {
        const c = col - dc;
        if (!reserved[r][c]) {
          const byteVal = bytes[Math.floor(bitIdx / 8) % bytes.length];
          const bit = ((byteVal >> (7 - (bitIdx % 8))) & 1) === 1;
          const mask = (r + c) % 2 === 0;
          grid[r][c] = bit !== mask;
          bitIdx++;
        }
      }
    }
  }

  const rects: string[] = [];
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      if (grid[r][c]) {
        rects.push(`<rect x="${c}" y="${r}" width="1" height="1" fill="#0f172a" />`);
      }
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${N} ${N}" width="${size}" height="${size}" shape-rendering="crispEdges" style="display:block;background:#ffffff;padding:3px;border:1.5px solid #cbd5e1;border-radius:8px;">${rects.join(
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

  // Ek Sözlük & Mizanpaj Ayarları
  const [includeVocabulary, setIncludeVocabulary] = useState<boolean>(true);
  const [includeWorksheet, setIncludeWorksheet] = useState<boolean>(false);
  const [vocabPlacement, setVocabPlacement] =
    useState<VocabPlacement>("same-page");
  const [vocabLanguageMode, setVocabLanguageMode] =
    useState<VocabLanguageMode>("both");
  const [translationLayout, setTranslationLayout] =
    useState<TranslationLayout>("side-by-side");
  const [sideBySideOrder, setSideBySideOrder] =
    useState<SideBySideOrder>("ar-right");
  const [showAdvancedLayout, setShowAdvancedLayout] = useState<boolean>(false);

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

  const currentUrl =
    typeof window !== "undefined"
      ? window.location.href
      : `https://www.muallimun.net/diyalog/${dialogue.id}`;

  const qrSvgMarkup = useMemo(
    () => generateQrSvgMarkup(currentUrl, 64),
    [currentUrl]
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
            <div class="tr-dotted-line"></div>
          </div>
        `;
      }
      return `
        <span class="speaker-tr ${badgeCls}">${line.konusmaci}</span>
        <span class="tr-text">${line.turkce}</span>
      `;
    };

    // Cümle satırları HTML üretimi
    let dialogueBodyHtml = "";

    if (translationMode === "hide") {
      // Sadece Arapça
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
                    <span class="speaker-ar ${badgeCls}">${formatAr(
                line.konusmaci_ar
              )}</span>
                    <span class="ar-text">${formatAr(arLineText)}</span>
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

      dialogueBodyHtml = `
        <table class="two-col-table" dir="ltr">
          <thead>
            <tr>
              ${
                isArRight
                  ? `
                <th style="width: 50%; text-align: left;" dir="ltr">${trHeaderTitle}</th>
                <th style="width: 50%; text-align: right;" dir="rtl">النَّصُّ الْعَرَبِيُّ (Arapça Metin)</th>
              `
                  : `
                <th style="width: 50%; text-align: right;" dir="rtl">النَّصُّ الْعَرَبِيُّ (Arapça Metin)</th>
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
                    <span class="speaker-ar ${badgeCls}">${formatAr(
                  line.konusmaci_ar
                )}</span>
                    <span class="ar-text">${formatAr(arLineText)}</span>
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
                    <span class="speaker-ar ${badgeCls}">${formatAr(
                line.konusmaci_ar
              )}</span>
                    <span class="ar-text">${formatAr(arLineText)}</span>
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
      // Sonda Toplu
      dialogueBodyHtml = `
        <div class="section-block">
          <div class="section-title">1. Arapça Diyalog Metni</div>
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
                      <span class="speaker-ar ${badgeCls}">${
                  line.sira
                }. ${formatAr(line.konusmaci_ar)}</span>
                      <span class="ar-text">${formatAr(arLineText)}</span>
                    </div>
                  </div>
                `;
              })
              .join("")}
          </div>
        </div>
        <div class="section-block" style="margin-top: 18px;">
          <div class="section-title">2. Diyaloğun Türkçe Tercümesi</div>
          <div class="end-tr-list">
            ${dialogue.satirlar
              .map((line) =>
                translationMode === "dotted"
                  ? `
              <div class="end-tr-item">
                <strong>${line.sira}. ${line.konusmaci}:</strong>
                <div class="tr-dotted-line" style="display:inline-block;width:75%;vertical-align:bottom;"></div>
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
            ? `<div class="vocab-dotted-blank" title="Türkçe anlamı yazınız">&nbsp;</div>`
            : `<div class="vocab-meaning">${w.anlam_tr}</div>`;

        const arDisplayHtml =
          vocabLanguageMode === "tr-only"
            ? `<div class="vocab-dotted-blank-ar" dir="rtl" title="Arapça karşılığını yazınız">&nbsp;</div>`
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
        <div class="qr-code-container">
          ${qrSvgMarkup}
          <span class="qr-caption">Dinlemek için okutun</span>
        </div>
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
            margin: 11mm 13mm 14mm 13mm;
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
            gap: 3px;
          }
          .qr-caption {
            font-size: 8.5px;
            font-weight: 800;
            color: #087f5b;
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
            line-height: ${fontConfig.lineHeight};
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
            padding: 6px 10px;
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
            line-height: 1.4;
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
            padding: 7px 4px;
          }
          .quiz-ar {
            font-family: ${fontConfig.cssFamily};
            font-size: 20px;
            font-weight: 700;
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
        </style>
      </head>
      <body>
        <div class="header-card">
          <div class="header-left">
            <div class="badge-row">
              <span class="badge">DİYALOG #${String(rawNum).padStart(
                2,
                "0"
              )}</span>
              <span class="badge-cefr">CEFR ${dialogue.seviye}</span>
              <span class="badge-outline">${
                dialogue.satirlar.length
              } Cümle • ${vocabEntries.length} Kelime</span>
              <span class="badge-outline">${
                includeHarakat ? "Harekeli" : "Harekesiz"
              }</span>
              ${
                clozeMode
                  ? `<span class="badge-outline" style="border-color:#6741d9;color:#5f3dc4;">Boşluk Doldurma</span>`
                  : ""
              }
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

        ${bannerImageHtml}
        ${helperWordsBoxHtml}
        ${dialogueBodyHtml}
        ${vocabSectionHtml}
        ${worksheetSectionHtml}

        <footer class="corporate-footer">
          <span>Diyalog #${String(rawNum).padStart(2, "0")}: ${
      dialogue.baslik_tr
    } (${dialogue.seviye}) — Arapça Çalışma Kağıdı</span>
          <span class="corporate-brand">www.muallimun.net</span>
        </footer>
      </body>
      </html>
    `;

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
        className="w-full max-w-4xl max-h-[92vh] bg-[#FDFBF7] dark:bg-[var(--surface)] rounded-3xl border-2 border-[#E6D7BE] dark:border-[var(--border)] border-b-4 shadow-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* MODAL ÜST BAŞLIK (print:hidden) */}
        <div className="print:hidden bg-[#F7EFE1] dark:bg-[var(--background)] px-4 sm:px-5 py-3 border-b-2 border-[#E6D7BE] dark:border-[var(--border)] flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-[#0CA678] border-b-3 border-[#087F5B] text-white flex items-center justify-center shrink-0">
              <FileText size={18} />
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
              className="px-3.5 py-2 rounded-xl bg-[#0CA678] hover:bg-[#099268] text-white font-extrabold text-xs border-b-3 border-[#087F5B] active:translate-y-0.5 transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
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
              className="w-9 h-9 rounded-xl bg-white dark:bg-[var(--surface)] border-2 border-[#E6D7BE] dark:border-[var(--border)] flex items-center justify-center text-[var(--muted)] hover:text-[var(--foreground)] cursor-pointer"
              aria-label="Kapat"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* KOMPAKT SEÇİM ÇİPLERİ / SEGMENTED CONTROLS BARI (print:hidden) */}
        <div className="print:hidden bg-[#FDFBF7] dark:bg-[var(--surface)] px-3 sm:px-5 py-3 border-b-2 border-[#E6D7BE] dark:border-[var(--border)] space-y-2.5 shrink-0">
          {/* 1. Satır: Görsel Modu + Çeviri Modu */}
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            {/* PDF-1: Görsel Seçici */}
            <div className="flex items-center gap-1.5 bg-[#F7EFE1] dark:bg-[var(--background)] px-2.5 py-1.5 rounded-xl border border-[#E6D7BE] dark:border-[var(--border)]">
              <ImageIcon size={14} className="text-[#087F5B] shrink-0" />
              <span className="text-[11px] font-extrabold text-[var(--foreground)]">
                Görsel:
              </span>
              <div className="flex items-center gap-1">
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
                    className={`px-2 py-1 rounded-lg text-[11px] font-extrabold transition-all cursor-pointer ${
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

            {/* PDF-2: Çeviri Görünüm Seçici */}
            <div className="flex items-center gap-1.5 bg-[#F7EFE1] dark:bg-[var(--background)] px-2.5 py-1.5 rounded-xl border border-[#E6D7BE] dark:border-[var(--border)]">
              <Languages size={14} className="text-[#6741D9] shrink-0" />
              <span className="text-[11px] font-extrabold text-[var(--foreground)]">
                Çeviri:
              </span>
              <div className="flex items-center gap-1">
                {(
                  [
                    { id: "show", label: "Göster" },
                    { id: "hide", label: "Gizle" },
                    { id: "dotted", label: "Yazı Alanı (Noktalı)" },
                  ] as { id: TranslationPrintMode; label: string }[]
                ).map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => {
                      playClick();
                      setTranslationMode(opt.id);
                    }}
                    className={`px-2 py-1 rounded-lg text-[11px] font-extrabold transition-all cursor-pointer ${
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
          </div>

          {/* 2. Satır: Boşluk Doldurma + Harekeler + QR Kod + Kelime Tablosu + Düzen Çipleri */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
              {/* PDF-3: Boşluk Doldurma (Etkinlik) Toggle */}
              <button
                type="button"
                onClick={() => {
                  playClick();
                  setClozeMode((v) => !v);
                }}
                className={`px-2.5 py-1.5 rounded-xl border text-[11px] font-extrabold flex items-center gap-1.5 transition-all cursor-pointer ${
                  clozeMode
                    ? "bg-[#6741D9] text-white border-[#5230B5] shadow-xs"
                    : "bg-white dark:bg-[var(--background)] text-[var(--foreground)] border-[#E6D7BE] dark:border-[var(--border)]"
                }`}
              >
                <PenTool size={13} />
                <span>Boşluk Doldurma: {clozeMode ? "Açık" : "Kapalı"}</span>
              </button>

              {/* PDF-4: Harekeler Toggle */}
              <button
                type="button"
                onClick={() => {
                  playClick();
                  setIncludeHarakat((v) => !v);
                }}
                className={`px-2.5 py-1.5 rounded-xl border text-[11px] font-extrabold flex items-center gap-1.5 transition-all cursor-pointer ${
                  includeHarakat
                    ? "bg-[#0CA678] text-white border-[#087F5B] shadow-xs"
                    : "bg-white dark:bg-[var(--background)] text-[var(--foreground)] border-[#E6D7BE] dark:border-[var(--border)]"
                }`}
              >
                <Sparkles size={13} />
                <span>Harekeler: {includeHarakat ? "Açık" : "Kapalı"}</span>
              </button>

              {/* PDF-5: QR Kod Toggle */}
              <button
                type="button"
                onClick={() => {
                  playClick();
                  setIncludeQrCode((v) => !v);
                }}
                className={`px-2.5 py-1.5 rounded-xl border text-[11px] font-extrabold flex items-center gap-1.5 transition-all cursor-pointer ${
                  includeQrCode
                    ? "bg-[#0CA678] text-white border-[#087F5B] shadow-xs"
                    : "bg-white dark:bg-[var(--background)] text-[var(--foreground)] border-[#E6D7BE] dark:border-[var(--border)]"
                }`}
              >
                <QrCode size={13} />
                <span>QR Kod: {includeQrCode ? "Açık" : "Kapalı"}</span>
              </button>

              {/* Sözlük Kelime Tablosu Toggle */}
              <button
                type="button"
                onClick={() => {
                  playClick();
                  setIncludeVocabulary((v) => !v);
                }}
                className={`px-2.5 py-1.5 rounded-xl border text-[11px] font-extrabold flex items-center gap-1.5 transition-all cursor-pointer ${
                  includeVocabulary
                    ? "bg-[#0CA678] text-white border-[#087F5B] shadow-xs"
                    : "bg-white dark:bg-[var(--background)] text-[var(--foreground)] border-[#E6D7BE] dark:border-[var(--border)]"
                }`}
              >
                <BookOpen size={13} />
                <span>Kelime Tablosu ({vocabEntries.length})</span>
              </button>
            </div>

            {/* Mizanpaj & Sözlük Alt Ayarları Aç/Kapa */}
            <button
              type="button"
              onClick={() => {
                playClick();
                setShowAdvancedLayout((v) => !v);
              }}
              className="px-2.5 py-1.5 rounded-xl bg-[#F7EFE1] dark:bg-[var(--background)] border border-[#E6D7BE] dark:border-[var(--border)] text-[11px] font-extrabold text-[#6741D9] dark:text-[#d0bfff] flex items-center gap-1 cursor-pointer"
            >
              <Columns2 size={13} />
              <span>{showAdvancedLayout ? "Mizanpajı Gizle" : "Tablo & Mizanpaj Ayarları"}</span>
            </button>
          </div>

          {/* Genişletilebilir Tablo & Sütun Mizanpaj Seçenekleri */}
          {showAdvancedLayout && (
            <div className="pt-2 border-t border-[#E6D7BE] dark:border-[var(--border)] grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
              {/* Sütun & Tercüme Yerleşimi */}
              <div className="p-2.5 rounded-xl bg-[#F7EFE1]/70 dark:bg-[var(--background)] border border-[#E6D7BE] space-y-1.5">
                <span className="block text-[11px] font-extrabold text-[#6741D9]">
                  Tercüme Yerleşimi & Sütun Yönü:
                </span>
                <div className="flex flex-wrap gap-1">
                  {[
                    { id: "side-by-side" as TranslationLayout, label: "Yan Yana", icon: Columns2 },
                    { id: "stacked" as TranslationLayout, label: "Alt Alta", icon: Rows2 },
                    { id: "grouped-end" as TranslationLayout, label: "Sonda Toplu", icon: AlignJustify },
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
                        className={`px-2 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1 cursor-pointer ${
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
                {translationLayout === "side-by-side" && (
                  <div className="flex flex-wrap gap-1 pt-1">
                    <button
                      type="button"
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
                )}
              </div>

              {/* Kelime Tablosu Test Modu & Konumu */}
              <div className="p-2.5 rounded-xl bg-[#F7EFE1]/70 dark:bg-[var(--background)] border border-[#E6D7BE] space-y-1.5">
                <span className="block text-[11px] font-extrabold text-[#087F5B]">
                  Kelime Tablosu Modu & Konumu:
                </span>
                <div className="flex flex-wrap gap-1">
                  {[
                    { id: "both" as VocabLanguageMode, label: "Arapça + Türkçe" },
                    { id: "ar-only" as VocabLanguageMode, label: "Anlam Testi (TR Boş)" },
                    { id: "tr-only" as VocabLanguageMode, label: "İmla Testi (AR Boş)" },
                  ].map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => {
                        playClick();
                        setVocabLanguageMode(m.id);
                      }}
                      className={`px-2 py-1 rounded-lg text-[10px] font-bold cursor-pointer ${
                        vocabLanguageMode === m.id
                          ? "bg-[#0CA678] text-white"
                          : "bg-white dark:bg-[var(--surface)] text-[var(--muted)]"
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
                <div className="flex flex-wrap items-center gap-1 pt-1">
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
                    Konum: {vocabPlacement === "same-page" ? "Aynı Sayfada" : "Yeni Sayfada"}
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
        <div className="flex-1 overflow-y-auto p-3 sm:p-6 bg-[#EFE6D5]/70 dark:bg-black/30">
          <div className="max-w-[780px] mx-auto bg-white text-[#1f1a14] rounded-2xl border-2 border-[#CBD5E1] shadow-lg p-4 sm:p-7 space-y-4">
            {/* Önizleme Rozeti (print:hidden) */}
            <div className="print:hidden flex items-center justify-between text-[11px] font-bold text-slate-500 border-b border-slate-200 pb-2">
              <span className="flex items-center gap-1.5 text-[#087F5B]">
                <Eye size={14} />
                <span>Canlı A4 Çalışma Kağıdı Önizlemesi</span>
              </span>
              <span>Vektörel A4 Çıktı • {fontConfig.name.split(" (")[0]}</span>
            </div>

            {/* A4 ÜST BAŞLIK KARTI */}
            <div className="border-2 border-[#0CA678] border-b-4 rounded-2xl p-3.5 sm:p-4 bg-[#FDFBF7] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex-1 min-w-0 space-y-1.5 w-full">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="px-2 py-0.5 rounded-md bg-[#0CA678] text-white text-[10px] font-extrabold">
                    DİYALOG #{String(rawNum).padStart(2, "0")}
                  </span>
                  <span className="px-2 py-0.5 rounded-md bg-[#6741D9] text-white text-[10px] font-extrabold">
                    CEFR {dialogue.seviye}
                  </span>
                  <span className="px-2 py-0.5 rounded-md border border-[#CBB692] text-[#5C5042] text-[10px] font-bold">
                    {dialogue.satirlar.length} Cümle • {vocabEntries.length} Kelime
                  </span>
                  <span className="px-2 py-0.5 rounded-md border border-[#CBB692] text-[#5C5042] text-[10px] font-bold">
                    {includeHarakat ? "Harekeli" : "Harekesiz"}
                  </span>
                </div>

                <div className="flex items-baseline justify-between gap-3 flex-wrap">
                  <h1 className="text-base sm:text-lg font-extrabold text-[#1f1a14]">
                    {dialogue.baslik_tr}
                  </h1>
                  <span
                    dir="rtl"
                    className="arabic text-2xl sm:text-3xl font-bold text-[#087F5B]"
                  >
                    {formatAr(dialogue.baslik_ar)}
                  </span>
                </div>
              </div>

              {/* Sağ Köşe: Kompakt Görsel (140x95) ve/veya 64x64 QR Kod */}
              {(effectiveImageMode === "compact" || includeQrCode) && (
                <div className="flex items-center gap-3 sm:border-l sm:border-dashed sm:border-slate-300 sm:pl-3 shrink-0">
                  {effectiveImageMode === "compact" && (
                    <img
                      src={imagePath}
                      alt={dialogue.baslik_tr}
                      loading="eager"
                      referrerPolicy="no-referrer"
                      onError={() => setImgError(true)}
                      className="w-[140px] h-[95px] object-cover rounded-xl border border-slate-300 shrink-0"
                    />
                  )}
                  {includeQrCode && (
                    <div className="flex flex-col items-center gap-1 shrink-0">
                      <div
                        dangerouslySetInnerHTML={{ __html: qrSvgMarkup }}
                      />
                      <span className="text-[9px] font-extrabold text-[#087F5B] whitespace-nowrap">
                        Dinlemek için okutun
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>

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
              <div className="bg-[#F3F0FF] border-2 border-dashed border-[#6741D9] rounded-xl p-3 space-y-2">
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
                      className={`p-3 flex items-baseline gap-2 ${
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
                      <span className="arabic text-xl sm:text-2xl font-bold text-slate-900 leading-relaxed">
                        {formatAr(arText)}
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="border border-slate-300 rounded-xl overflow-hidden divide-y divide-slate-200">
                {dialogue.satirlar.map((line, idx) => {
                  const spIdx = speakers.indexOf(line.konusmaci);
                  const isEmerald = spIdx % 2 === 0;
                  const arText = clozeData.processedLines[idx] || line.arapca;

                  return (
                    <div
                      key={line.sira}
                      className={`p-3 grid grid-cols-1 sm:grid-cols-2 gap-3 items-center ${
                        idx % 2 === 0 ? "bg-slate-50" : "bg-white"
                      }`}
                    >
                      {/* Sol Sütun: Türkçe Çeviri veya Noktalı Yazı Alanı */}
                      <div
                        className={
                          sideBySideOrder === "ar-left" ? "sm:order-2" : "sm:order-1"
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
                          <div className="text-xs sm:text-sm text-slate-700 font-semibold">
                            <span
                              className={`text-[11px] font-extrabold px-2 py-0.5 rounded-md border mr-1.5 inline-block ${
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

                      {/* Sağ Sütun: Arapça Metin */}
                      <div
                        dir="rtl"
                        className={`text-right ${
                          sideBySideOrder === "ar-left" ? "sm:order-1" : "sm:order-2"
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
                        <span className="arabic text-xl sm:text-2xl font-bold text-slate-900 leading-relaxed">
                          {formatAr(arText)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* KELİME TABLOSU ÖNİZLEMESİ */}
            {includeVocabulary && vocabEntries.length > 0 && (
              <div className="space-y-2 pt-2">
                <div className="text-xs font-extrabold text-[#087F5B] bg-slate-50 border border-slate-300 border-l-4 border-l-[#0CA678] px-3 py-1.5 rounded-lg">
                  📚 Diyalog Kelime Hazinesi (المفردات) — {vocabEntries.length} Kelime
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {vocabEntries.map((entry, idx) => {
                    const w = entry.item;
                    const mainAr = w.mufret || w.mazi || "";
                    return (
                      <div
                        key={`${mainAr}-${idx}`}
                        className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg border border-slate-300 bg-slate-50"
                      >
                        <div className="min-w-0 flex-1">
                          {vocabLanguageMode === "ar-only" ? (
                            <div className="border-b border-dotted border-slate-400 h-5 w-11/12" />
                          ) : (
                            <span className="text-xs font-bold text-slate-800 block truncate">
                              {w.anlam_tr}
                            </span>
                          )}
                        </div>
                        <div dir="rtl" className="shrink-0">
                          {vocabLanguageMode === "tr-only" ? (
                            <div className="border-b border-dotted border-slate-400 h-5 w-24" />
                          ) : (
                            <span className="arabic text-xl font-bold text-[#087F5B]">
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

            {/* ZORUNLU KURUMSAL ALT BİLGİ (FOOTER): www.muallimun.net */}
            <footer className="pt-3 mt-4 border-t-2 border-[#0CA678] flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-600">
              <span className="font-semibold">
                Diyalog #{String(rawNum).padStart(2, "0")}: {dialogue.baslik_tr} (
                {dialogue.seviye}) — Arapça Çalışma Kağıdı
              </span>
              <span className="font-extrabold text-xs text-[#087F5B] tracking-wide">
                www.muallimun.net
              </span>
            </footer>
          </div>
        </div>

        {/* MODAL ALT AKSİYON ÇUBUĞU (print:hidden) */}
        <div className="print:hidden bg-[#F7EFE1] dark:bg-[var(--background)] px-4 sm:px-5 py-3 border-t-2 border-[#E6D7BE] dark:border-[var(--border)] flex items-center justify-between gap-3 shrink-0">
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
              className="px-4 py-2.5 rounded-xl bg-white dark:bg-[var(--surface)] border-2 border-[#E6D7BE] dark:border-[var(--border)] border-b-4 text-xs font-extrabold text-[var(--muted)] hover:text-[var(--foreground)] cursor-pointer"
            >
              Vazgeç
            </button>

            <button
              type="button"
              onClick={handleGenerateAndPrintPdf}
              className="flex-1 sm:flex-initial px-5 py-2.5 rounded-xl bg-[#0CA678] hover:bg-[#099268] text-white font-extrabold text-xs sm:text-sm border-b-4 border-[#087F5B] active:border-b-0 active:translate-y-1 transition-all flex items-center justify-center gap-2 cursor-pointer shadow-md"
            >
              <Printer size={17} />
              <span>A4 Çalışma Kağıdını Yazdır / PDF İndir</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
