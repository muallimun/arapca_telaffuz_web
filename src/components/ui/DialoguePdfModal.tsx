"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import {
  X,
  Printer,
  FileText,
  CheckSquare,
  Square,
  Columns2,
  Rows2,
  AlignJustify,
  Sparkles,
} from "lucide-react";
import { Dialogue } from "@/types/data";
import { DialogueVocabularyEntry } from "@/lib/dict";
import { playClick, playSuccess } from "@/lib/sfxManager";
import { formatArabicText, removeArabicHarakat } from "@/lib/arabicTextUtils";

interface DialoguePdfModalProps {
  dialogue: Dialogue;
  vocabEntries: DialogueVocabularyEntry[];
  imagePath: string;
  rawNum: number;
  onClose: () => void;
}

type TranslationLayout = "side-by-side" | "stacked" | "grouped-end";

export function stripHarakat(text: string): string {
  return removeArabicHarakat(text);
}

export default function DialoguePdfModal({
  dialogue,
  vocabEntries,
  imagePath,
  rawNum,
  onClose,
}: DialoguePdfModalProps) {
  // 1. İçerik Seçenekleri (Checkbox'lar)
  const [cleanHandoutOnly, setCleanHandoutOnly] = useState<boolean>(true);
  const [includeHarakat, setIncludeHarakat] = useState<boolean>(true);
  const [includeTurkish, setIncludeTurkish] = useState<boolean>(true);

  // 2. Tercüme Yerleşimi (Radio Butonlar)
  const [translationLayout, setTranslationLayout] =
    useState<TranslationLayout>("side-by-side");

  const printIframeRef = useRef<HTMLIFrameElement | null>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const formatAr = (text: string) => formatArabicText(text, includeHarakat);

  // 5 soruluk mini çalışma kağıdı (cleanHandoutOnly === false ise eklenir)
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

    // Cümle satırları HTML üretimi
    let dialogueBodyHtml = "";

    if (!includeTurkish) {
      // Sadece Arapça
      dialogueBodyHtml = `
        <div class="lines-container">
          ${dialogue.satirlar
            .map(
              (line) => `
            <div class="line-row single-ar">
              <div class="ar-col" dir="rtl">
                <span class="speaker-ar">${formatAr(line.konusmaci_ar)}:</span>
                <span class="ar-text">${formatAr(line.arapca)}</span>
              </div>
            </div>
          `
            )
            .join("")}
        </div>
      `;
    } else if (translationLayout === "side-by-side") {
      // Yan Yana (İki Sütun: Sol Arapça %50 RTL, Sağ Türkçe %50 LTR)
      dialogueBodyHtml = `
        <table class="two-col-table">
          <thead>
            <tr>
              <th style="width: 52%; text-align: right;" dir="rtl">النَّصُّ الْعَرَبِيُّ (Arapça Metin)</th>
              <th style="width: 48%; text-align: left;">Türkçe Tercüme</th>
            </tr>
          </thead>
          <tbody>
            ${dialogue.satirlar
              .map(
                (line) => `
              <tr>
                <td class="ar-cell" dir="rtl">
                  <span class="speaker-ar">${formatAr(line.konusmaci_ar)}:</span>
                  <span class="ar-text">${formatAr(line.arapca)}</span>
                </td>
                <td class="tr-cell" dir="ltr">
                  <span class="speaker-tr">${line.konusmaci}:</span>
                  <span class="tr-text">${line.turkce}</span>
                </td>
              </tr>
            `
              )
              .join("")}
          </tbody>
        </table>
      `;
    } else if (translationLayout === "stacked") {
      // Alt Alta (Her Arapça cümlenin hemen altında Türkçesi)
      dialogueBodyHtml = `
        <div class="lines-container">
          ${dialogue.satirlar
            .map(
              (line) => `
            <div class="stacked-card">
              <div class="ar-col" dir="rtl">
                <span class="speaker-ar">${formatAr(line.konusmaci_ar)}:</span>
                <span class="ar-text">${formatAr(line.arapca)}</span>
              </div>
              <div class="tr-col" dir="ltr">
                <span class="speaker-tr">${line.konusmaci}:</span>
                <span class="tr-text">${line.turkce}</span>
              </div>
            </div>
          `
            )
            .join("")}
        </div>
      `;
    } else {
      // Sonda Toplu (Tüm Arapça metin bittikten sonra sayfa sonunda Türkçe çevirisi)
      dialogueBodyHtml = `
        <div class="section-block">
          <div class="section-title">1. Arapça Diyalog Metni</div>
          <div class="lines-container">
            ${dialogue.satirlar
              .map(
                (line) => `
              <div class="line-row single-ar">
                <div class="ar-col" dir="rtl">
                  <span class="speaker-ar">${line.sira}. ${formatAr(
                  line.konusmaci_ar
                )}:</span>
                  <span class="ar-text">${formatAr(line.arapca)}</span>
                </div>
              </div>
            `
              )
              .join("")}
          </div>
        </div>
        <div class="section-block" style="margin-top: 18px;">
          <div class="section-title">2. Diyaloğun Türkçe Tercümesi</div>
          <div class="end-tr-list">
            ${dialogue.satirlar
              .map(
                (line) => `
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

    // Sözlük ve Mini Çalışma Kağıdı (cleanHandoutOnly === false ise)
    let extraSectionsHtml = "";
    if (!cleanHandoutOnly) {
      const vocabRows = vocabEntries
        .slice(0, 18)
        .map((entry) => {
          const w = entry.item;
          const mainAr = w.mufret || w.mazi || "";
          const subAr =
            w.tur === "isim"
              ? w.cemi && w.cemi !== "-"
                ? `Cemî: ${formatAr(w.cemi)}`
                : "-"
              : w.muzari
              ? `Muzâri: ${formatAr(w.muzari)}`
              : "-";
          return `
            <tr>
              <td dir="rtl" class="vocab-ar">${formatAr(mainAr)}</td>
              <td dir="rtl" class="vocab-sub">${subAr}</td>
              <td>${w.tur.toUpperCase()} (${w.kok})</td>
              <td><strong>${w.anlam_tr}</strong></td>
            </tr>
          `;
        })
        .join("");

      const worksheetRows = miniWorksheetQuestions
        .map(
          (q) => `
          <div class="quiz-row">
            <div class="quiz-ar" dir="rtl">
              <strong>${q.sira}.</strong> ${formatAr(q.blankSentence)}
            </div>
            ${
              includeTurkish
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

      extraSectionsHtml = `
        <div class="section-block" style="margin-top: 22px; page-break-inside: avoid;">
          <div class="section-title">Diyalog Kelime Sözlüğü (${Math.min(
            18,
            vocabEntries.length
          )} Kelime)</div>
          <table class="vocab-table">
            <thead>
              <tr>
                <th style="text-align: right;" dir="rtl">الْكَلِمَة (Kelime)</th>
                <th style="text-align: right;" dir="rtl">التَّصْرِيف (Çoğul / Çekim)</th>
                <th>Tür & Kök</th>
                <th>Türkçe Anlamı</th>
              </tr>
            </thead>
            <tbody>
              ${vocabRows}
            </tbody>
          </table>
        </div>

        <div class="section-block" style="margin-top: 20px; page-break-inside: avoid;">
          <div class="section-title">Mini Çalışma Kağıdı — Boşluk Doldurma Alıştırması (5 Soru)</div>
          <div class="word-bank" dir="rtl">
            <strong>Kelime Havuzu:</strong> ${wordBank}
          </div>
          <div class="quiz-list">
            ${worksheetRows}
          </div>
        </div>
      `;
    }

    const htmlDocument = `
      <!DOCTYPE html>
      <html lang="tr">
      <head>
        <meta charset="UTF-8" />
        <title>Diyalog #${String(rawNum).padStart(2, "0")} - ${
      dialogue.baslik_tr
    } | A4 Ders Notu</title>
        <link rel="preconnect" href="https://fonts.googleapis.com">
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
        <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800&family=Scheherazade+New:wght@400;700&display=swap" rel="stylesheet">
        <style>
          @page {
            size: A4 portrait;
            margin: 12mm 14mm;
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
            gap: 16px;
            border: 2px solid #0ca678;
            border-bottom-width: 4px;
            border-radius: 14px;
            padding: 12px 16px;
            background: #fdfbf7;
            margin-bottom: 16px;
          }
          .header-left {
            display: flex;
            align-items: center;
            gap: 14px;
          }
          .cover-img {
            width: 78px;
            height: 62px;
            object-fit: cover;
            border-radius: 10px;
            border: 1.5px solid #e6d7be;
          }
          .badge-row {
            display: flex;
            align-items: center;
            gap: 8px;
            margin-bottom: 4px;
          }
          .badge {
            background: #0ca678;
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
            font-size: 10px;
            padding: 2px 8px;
            border-radius: 6px;
          }
          .title-row {
            display: flex;
            align-items: baseline;
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
            font-family: 'Scheherazade New', serif;
            font-size: 26px;
            font-weight: 700;
            color: #087f5b;
            line-height: 1.2;
          }
          .header-meta {
            text-align: right;
            font-size: 10px;
            color: #6b5e4c;
            border-left: 1px dashed #e2d3b8;
            padding-left: 12px;
          }
          .qr-box {
            display: inline-block;
            border: 1.5px solid #0ca678;
            border-radius: 6px;
            padding: 3px 7px;
            font-weight: 800;
            color: #087f5b;
            margin-bottom: 4px;
            font-size: 9px;
          }
          .two-col-table {
            width: 100%;
            border-collapse: collapse;
            border: 1.5px solid #e6d7be;
            border-radius: 10px;
            overflow: hidden;
          }
          .two-col-table th {
            background: #f7efe1;
            color: #3d3428;
            font-size: 11px;
            font-weight: 800;
            padding: 8px 12px;
            border-bottom: 1.5px solid #e6d7be;
          }
          .two-col-table td {
            padding: 9px 12px;
            border-bottom: 1px dashed #e6d7be;
            vertical-align: middle;
          }
          .ar-cell {
            text-align: right;
            border-left: 1px dashed #e6d7be;
            background: #fffdf9;
          }
          .tr-cell {
            text-align: left;
            color: #3b3228;
            font-size: 12.5px;
          }
          .speaker-ar {
            font-family: 'Scheherazade New', serif;
            font-size: 19px;
            font-weight: 700;
            color: #087f5b;
            margin-left: 6px;
          }
          .ar-text {
            font-family: 'Scheherazade New', serif;
            font-size: 22px;
            font-weight: 700;
            color: #191510;
            line-height: 1.85;
          }
          .speaker-tr {
            font-weight: 800;
            color: #6741d9;
            margin-right: 4px;
          }
          .tr-text {
            font-weight: 600;
          }
          .stacked-card {
            border: 1px solid #e6d7be;
            border-radius: 10px;
            padding: 8px 12px;
            margin-bottom: 8px;
            background: #fffdf9;
            page-break-inside: avoid;
          }
          .stacked-card .tr-col {
            margin-top: 4px;
            padding-top: 4px;
            border-top: 1px dashed #e6d7be;
            font-size: 12px;
            color: #4a3f33;
          }
          .line-row.single-ar {
            border-bottom: 1px dashed #e6d7be;
            padding: 8px 10px;
            page-break-inside: avoid;
          }
          .section-title {
            font-size: 13px;
            font-weight: 800;
            color: #087f5b;
            background: #f7efe1;
            border: 1.5px solid #e6d7be;
            padding: 6px 12px;
            border-radius: 8px;
            margin-bottom: 10px;
          }
          .end-tr-list {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 6px 16px;
            border: 1px solid #e6d7be;
            border-radius: 10px;
            padding: 10px 14px;
          }
          .end-tr-item {
            font-size: 11.5px;
            color: #3b3228;
          }
          .vocab-table {
            width: 100%;
            border-collapse: collapse;
            font-size: 11.5px;
          }
          .vocab-table th, .vocab-table td {
            border: 1px solid #e6d7be;
            padding: 5px 9px;
          }
          .vocab-table th {
            background: #f7efe1;
            font-weight: 800;
          }
          .vocab-ar {
            font-family: 'Scheherazade New', serif;
            font-size: 19px;
            font-weight: 700;
            color: #087f5b;
          }
          .vocab-sub {
            font-family: 'Scheherazade New', serif;
            font-size: 16px;
            color: #5230b5;
          }
          .word-bank {
            background: #f3f0ff;
            border: 1px dashed #6741d9;
            border-radius: 8px;
            padding: 7px 12px;
            font-family: 'Scheherazade New', serif;
            font-size: 19px;
            font-weight: 700;
            color: #4c28b5;
            margin-bottom: 10px;
            text-align: center;
          }
          .quiz-row {
            border-bottom: 1px dashed #e6d7be;
            padding: 7px 4px;
          }
          .quiz-ar {
            font-family: 'Scheherazade New', serif;
            font-size: 20px;
            font-weight: 700;
          }
          .quiz-tr {
            font-size: 11px;
            color: #6b5e4c;
            font-style: italic;
          }
          .footer-note {
            margin-top: 16px;
            padding-top: 8px;
            border-top: 1px solid #e6d7be;
            display: flex;
            justify-content: space-between;
            font-size: 10px;
            color: #7d6f5d;
          }
        </style>
      </head>
      <body>
        <div class="header-card">
          <div class="header-left">
            <img src="${absoluteImgUrl}" alt="${
      dialogue.baslik_tr
    }" class="cover-img" onerror="this.style.display='none'" />
            <div>
              <div class="badge-row">
                <span class="badge">DİYALOG #${String(rawNum).padStart(
                  2,
                  "0"
                )} • ${dialogue.seviye}</span>
                <span class="badge-outline">${
                  dialogue.satirlar.length
                } Cümle • ${vocabEntries.length} Kelime</span>
                <span class="badge-outline">${
                  includeHarakat ? "Harekeli Metin" : "Harekesiz Metin"
                }</span>
              </div>
              <div class="title-row">
                <h1 class="title-tr">${dialogue.baslik_tr}</h1>
                <span class="title-ar" dir="rtl">${formatAr(
                  dialogue.baslik_ar
                )}</span>
              </div>
            </div>
          </div>
          <div class="header-meta">
            <div class="qr-box">ARAPÇA DİYALOG STÜDYOSU</div>
            <div>Tarih: ${formattedDate}</div>
            <div>Öğrenci Ders Notu (A4)</div>
          </div>
        </div>

        ${dialogueBodyHtml}
        ${extraSectionsHtml}

        <div class="footer-note">
          <span>Arapça Konuşma ve Telaffuz Stüdyosu — Diyalog #${String(
            rawNum
          ).padStart(2, "0")}: ${dialogue.baslik_tr}</span>
          <span>Sayfa 1 / Vektörel A4 Ders Notu</span>
        </div>
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
        setTimeout(() => {
          iframe.contentWindow?.focus();
          iframe.contentWindow?.print();
        }, 350);
      }
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4"
      onClick={onClose}
    >
      {/* Gizli Vektörel A4 Yazdırma Iframe'i */}
      <iframe
        ref={printIframeRef}
        title="A4 Ders Notu Yazdırma Katmanı"
        className="fixed w-0 h-0 border-0 opacity-0 pointer-events-none"
      />

      <div
        className="w-full max-w-xl bg-[#FDFBF7] dark:bg-[var(--surface)] rounded-3xl border-2 border-[#E6D7BE] dark:border-[var(--border)] border-b-4 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* MODAL ÜST BAŞLIK */}
        <div className="bg-[#F7EFE1] dark:bg-[var(--background)] px-5 py-4 border-b-2 border-[#E6D7BE] dark:border-[var(--border)] flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#0CA678] border-b-3 border-[#087F5B] text-white flex items-center justify-center shrink-0">
              <FileText size={20} />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-extrabold text-[var(--foreground)] leading-tight">
                Ders Notu / PDF Çıktı Ayarları
              </h2>
              <p className="text-xs font-semibold text-[var(--muted)]">
                #{String(rawNum).padStart(2, "0")} {dialogue.baslik_tr} (
                {dialogue.baslik_ar}) — Vektörel A4 Şablonu
              </p>
            </div>
          </div>

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

        {/* MODAL GÖVDE */}
        <div className="p-5 space-y-5 max-h-[80vh] overflow-y-auto">
          {/* 1. İÇERİK SEÇENEKLERİ (CHECKBOX'LAR) */}
          <div className="space-y-2.5">
            <h3 className="text-xs font-extrabold uppercase tracking-wider text-[#087F5B] dark:text-[#20c997]">
              1. İçerik Seçenekleri
            </h3>

            {/* Checkbox 1: Temiz Ders Notu */}
            <button
              type="button"
              onClick={() => {
                playClick();
                setCleanHandoutOnly((v) => !v);
              }}
              className={`w-full text-left p-3 rounded-2xl border-2 transition-all flex items-start gap-3 cursor-pointer ${
                cleanHandoutOnly
                  ? "bg-[#F7EFE1] dark:bg-[var(--background)] border-[#0CA678]"
                  : "bg-white dark:bg-[var(--background)] border-[#E6D7BE] dark:border-[var(--border)]"
              }`}
            >
              <div className="mt-0.5 text-[#0CA678] shrink-0">
                {cleanHandoutOnly ? (
                  <CheckSquare size={18} />
                ) : (
                  <Square size={18} className="text-[var(--muted)]" />
                )}
              </div>
              <div className="space-y-0.5">
                <span className="block text-xs sm:text-sm font-extrabold text-[var(--foreground)]">
                  Sınav/Kelime Bölümlerini Yoksay ve &lsquo;Temiz Ders Notu /
                  Okuma Metni (Handout)&rsquo; Olarak Üret
                </span>
                <span className="block text-[11px] font-medium text-[var(--muted)]">
                  {cleanHandoutOnly
                    ? "Sadece diyalog cümlelerini içeren sade A4 okuma kağıdı üretilir."
                    : "Sayfa sonuna Diyalog Kelime Sözlüğü tablosu ve 5 soruluk mini boşluk doldurma çalışma kağıdı eklenir."}
                </span>
              </div>
            </button>

            {/* Checkbox 2: Harekeli Göster */}
            <button
              type="button"
              onClick={() => {
                playClick();
                setIncludeHarakat((v) => !v);
              }}
              className={`w-full text-left p-3 rounded-2xl border-2 transition-all flex items-center justify-between gap-3 cursor-pointer ${
                includeHarakat
                  ? "bg-[#F7EFE1] dark:bg-[var(--background)] border-[#0CA678]"
                  : "bg-white dark:bg-[var(--background)] border-[#E6D7BE] dark:border-[var(--border)]"
              }`}
            >
              <div className="flex items-center gap-3">
                <div className="text-[#0CA678] shrink-0">
                  {includeHarakat ? (
                    <CheckSquare size={18} />
                  ) : (
                    <Square size={18} className="text-[var(--muted)]" />
                  )}
                </div>
                <div>
                  <span className="block text-xs sm:text-sm font-extrabold text-[var(--foreground)]">
                    Harekeli Göster (Varsayılan: Seçili)
                  </span>
                  <span className="block text-[11px] font-medium text-[var(--muted)]">
                    İşaret kaldırılırsa Arapça metinlerden harekeler temizlenerek
                    harekesiz basılır
                  </span>
                </div>
              </div>
              <span
                dir="rtl"
                className="arabic text-xl font-bold text-[#087F5B] px-2.5 py-0.5 rounded-lg bg-white dark:bg-[var(--surface)] border border-[#E6D7BE] shrink-0"
              >
                {includeHarakat ? "مَرْحَباً" : stripHarakat("مَرْحَباً")}
              </span>
            </button>

            {/* Checkbox 3: Türkçe Tercümeyi Dahil Et */}
            <button
              type="button"
              onClick={() => {
                playClick();
                setIncludeTurkish((v) => !v);
              }}
              className={`w-full text-left p-3 rounded-2xl border-2 transition-all flex items-center gap-3 cursor-pointer ${
                includeTurkish
                  ? "bg-[#F7EFE1] dark:bg-[var(--background)] border-[#0CA678]"
                  : "bg-white dark:bg-[var(--background)] border-[#E6D7BE] dark:border-[var(--border)]"
              }`}
            >
              <div className="text-[#0CA678] shrink-0">
                {includeTurkish ? (
                  <CheckSquare size={18} />
                ) : (
                  <Square size={18} className="text-[var(--muted)]" />
                )}
              </div>
              <div>
                <span className="block text-xs sm:text-sm font-extrabold text-[var(--foreground)]">
                  Türkçe Tercümeyi Dahil Et (Varsayılan: Seçili)
                </span>
                <span className="block text-[11px] font-medium text-[var(--muted)]">
                  Kapatılırsa yalnızca Arapça metinden oluşan çalışma kağıdı
                  hazırlanır
                </span>
              </div>
            </button>
          </div>

          {/* 2. TERCÜME YERLEŞİMİ (RADIO BUTONLAR) */}
          <div
            className={`space-y-2.5 transition-opacity ${
              includeTurkish ? "opacity-100" : "opacity-40 pointer-events-none"
            }`}
          >
            <h3 className="text-xs font-extrabold uppercase tracking-wider text-[#6741D9] dark:text-[#d0bfff]">
              2. Tercüme Yerleşimi
            </h3>

            <div className="space-y-2">
              {[
                {
                  id: "side-by-side" as TranslationLayout,
                  title:
                    "Yan Yana (İki Sütun: Sol Arapça %50 RTL, Sağ Türkçe %50 LTR)",
                  desc: "Karşılaştırmalı okuma ve ders takibi için en verimli A4 tablo düzeni",
                  icon: Columns2,
                },
                {
                  id: "stacked" as TranslationLayout,
                  title: "Alt Alta (Her Arapça cümlenin hemen altında Türkçesi)",
                  desc: "Satır satır okuma ve cümle altı not alma düzeni",
                  icon: Rows2,
                },
                {
                  id: "grouped-end" as TranslationLayout,
                  title:
                    "Sonda Toplu (Tüm Arapça metin bittikten sonra sayfa sonunda Türkçe çevirisi)",
                  desc: "Önce sadece Arapça metinden anlamaya çalışıp sonda kontrol etmek için ideal",
                  icon: AlignJustify,
                },
              ].map((opt) => {
                const selected = translationLayout === opt.id;
                const Icon = opt.icon;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => {
                      playClick();
                      setTranslationLayout(opt.id);
                    }}
                    className={`w-full text-left p-3 rounded-2xl border-2 transition-all flex items-center gap-3 cursor-pointer ${
                      selected
                        ? "bg-[#F3F0FF] dark:bg-[var(--lavender-bg)] border-[#6741D9]"
                        : "bg-white dark:bg-[var(--background)] border-[#E6D7BE] dark:border-[var(--border)]"
                    }`}
                  >
                    <div
                      className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${
                        selected
                          ? "border-[#6741D9] bg-[#6741D9]"
                          : "border-[var(--muted)]"
                      }`}
                    >
                      {selected && (
                        <span className="w-2 h-2 rounded-full bg-white" />
                      )}
                    </div>
                    <Icon
                      size={17}
                      className={
                        selected ? "text-[#6741D9]" : "text-[var(--muted)]"
                      }
                    />
                    <div>
                      <span className="block text-xs sm:text-sm font-extrabold text-[var(--foreground)]">
                        {opt.title}
                      </span>
                      <span className="block text-[11px] font-medium text-[var(--muted)]">
                        {opt.desc}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* ÖZET BİLGİ ŞERİDİ */}
          <div className="rounded-2xl bg-[#F7EFE1] dark:bg-[var(--background)] border border-dashed border-[#cbb692] px-3.5 py-2.5 flex items-center gap-2.5 text-xs font-semibold text-[var(--muted)]">
            <Sparkles size={16} className="text-[#0CA678] shrink-0" />
            <span>
              Vektörel A4 motoru Arapça harf bağlantılarını ve harekeleri
              bozmadan yüksek çözünürlüklü PDF/yazıcı çıktısı üretir.
            </span>
          </div>
        </div>

        {/* MODAL ALT AKSİYON BUTONLARI */}
        <div className="bg-[#F7EFE1] dark:bg-[var(--background)] px-5 py-3.5 border-t-2 border-[#E6D7BE] dark:border-[var(--border)] flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={() => {
              playClick();
              onClose();
            }}
            className="h-10 px-4 rounded-xl bg-white dark:bg-[var(--surface)] border-2 border-[#E6D7BE] dark:border-[var(--border)] text-xs font-extrabold text-[var(--foreground)] cursor-pointer"
          >
            Vazgeç
          </button>

          <button
            type="button"
            onClick={handleGenerateAndPrintPdf}
            className="h-10 px-5 rounded-xl bg-[#0CA678] hover:bg-[#099268] text-white text-xs sm:text-sm font-extrabold border-b-3 border-[#087F5B] active:border-b-0 active:translate-y-0.5 transition-all flex items-center gap-2 cursor-pointer shadow-xs"
          >
            <Printer size={16} />
            <span>A4 Ders Notu Üret / PDF Kaydet</span>
          </button>
        </div>
      </div>
    </div>
  );
}
