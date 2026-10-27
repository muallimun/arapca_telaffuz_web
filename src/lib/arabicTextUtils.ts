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
 * Harekeleri soyar (Harekesiz okuma modu için)
 */
export function removeArabicHarakat(text: string): string {
  if (!text) return "";
  return text.replace(/[\u064B-\u065F\u0670]/g, "");
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
