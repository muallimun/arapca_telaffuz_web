export type Level = "A1" | "A2" | "B1" | "B2";
export type CEFRLevel = "A1" | "A2" | "B1" | "B2" | "C1" | "C2";

export interface PedagogicalMeta {
  cefr?: CEFRLevel;
  zorluk?: 1 | 2 | 3 | 4 | 5;
  etiketler?: string[];
  kaynak_unite?: string;
}

export interface DialogueLine {
  sira: number;
  konusmaci: string;
  konusmaci_ar: string;
  cinsiyet: "E" | "K";
  arapca: string;
  turkce: string;
  audio?: string; // Gelecekte mp3 yolu eklenebilir (opsiyonel)
}

export interface Dialogue extends PedagogicalMeta {
  id: string;
  seviye: Level;
  baslik_ar: string;
  baslik_tr: string;
  satirlar: DialogueLine[];
}

export interface DictionaryItem extends PedagogicalMeta {
  id: string;
  tur: string; // "isim", "fiil" vb.
  kok: string;
  anlam_tr: string;
  mufret?: string;
  cemi?: string;
  mazi?: string;
  muzari?: string;
  masdar?: string;
}

export interface ResimliKelime extends PedagogicalMeta {
  id: string;
  kategori: string;
  arapca: string;
  turkce: string;
  kok?: string;
  cemi?: string;
  gorsel?: string;
  ornek_ar?: string;
  ornek_tr?: string;
}

export interface AnahtarCumle extends PedagogicalMeta {
  id: string;
  kategori: string;
  arapca: string;
  turkce: string;
  baglam?: string;
  not_tr?: string;
}

export interface AtasozuDeyim extends PedagogicalMeta {
  id: string;
  arapca: string;
  turkce: string;
  gercek_anlam?: string;
  mecaz_anlam?: string;
  kullanim_baglami?: string;
}

export interface GramerKonu extends PedagogicalMeta {
  id: string;
  baslik_tr: string;
  baslik_ar?: string;
  kategori: "sarf" | "nahiv" | "belagat";
  ozet_tr: string;
  kurallar: string[];
  ornekler: { arapca: string; turkce: string; irab_notu?: string }[];
}