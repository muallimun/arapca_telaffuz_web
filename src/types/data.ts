export type Level = "A1" | "A2" | "B1" | "B2";

export interface DialogueLine {
  sira: number;
  konusmaci: string;
  konusmaci_ar: string;
  cinsiyet: "E" | "K";
  arapca: string;
  turkce: string;
  audio?: string; // Gelecekte mp3 yolu eklenebilir (opsiyonel)
}

export interface Dialogue {
  id: string;
  seviye: Level;
  baslik_ar: string;
  baslik_tr: string;
  satirlar: DialogueLine[];
}

export interface DictionaryItem {
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