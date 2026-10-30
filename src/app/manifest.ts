import { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Arapça Telaffuz ve Diyalog Asistanı — Muallimun",
    short_name: "Arapça Asistanı",
    description:
      "60 CEFR diyalog, 38 çiftlik yapay zeka mahreç koçu, morfolojik sözlük, kalıp ifadeler, 5 modlu interaktif alıştırma merkezi ve akıllı A4 PDF çalışma kağıdı üreticisi.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: "#FAF6EE",
    theme_color: "#059669",
    categories: ["education", "books", "productivity"],
    lang: "tr",
    dir: "ltr",
    icons: [
      {
        src: "/icons/favicon.ico",
        sizes: "48x48",
        type: "image/x-icon",
      },
      {
        src: "/icons/apple-touch-icon.png",
        sizes: "180x180",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/android-chrome-192x192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/android-chrome-192x192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icons/android-chrome-512x512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/android-chrome-512x512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      {
        name: "Diyalog Kütüphanesi",
        short_name: "Diyaloglar",
        description: "60 günlük konuşma diyaloğunu incele ve dinle",
        url: "/kutuphane",
        icons: [
          {
            src: "/icons/android-chrome-192x192.png",
            sizes: "192x192",
            type: "image/png",
          },
        ],
      },
      {
        name: "Alıştırma Merkezi",
        short_name: "Alıştırmalar",
        description: "5 modlu kelime, cümle ve kalıp ifade alıştırmaları",
        url: "/alistirmalar",
        icons: [
          {
            src: "/icons/android-chrome-192x192.png",
            sizes: "192x192",
            type: "image/png",
          },
        ],
      },
      {
        name: "İnteraktif Sözlük",
        short_name: "Sözlük",
        description: "1494 kelime, kök analizi ve kalıp ifadeler",
        url: "/sozluk",
        icons: [
          {
            src: "/icons/android-chrome-192x192.png",
            sizes: "192x192",
            type: "image/png",
          },
        ],
      },
      {
        name: "Uygulama Ayarları",
        short_name: "Ayarlar",
        description: "Yazı tipi, ses hızı ve gölgeleme ayarları",
        url: "/ayarlar",
        icons: [
          {
            src: "/icons/android-chrome-192x192.png",
            sizes: "192x192",
            type: "image/png",
          },
        ],
      },
    ],
  };
}