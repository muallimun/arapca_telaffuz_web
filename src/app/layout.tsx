import type { Metadata, Viewport } from "next";
import Header from "@/components/layout/Header";
import MobileNav from "@/components/layout/MobileNav";
import ServiceWorkerRegister from "@/components/pwa/ServiceWorkerRegister";
import AudioStopper from "@/components/AudioStopper";
import OnboardingTourModal from "@/components/ui/OnboardingTourModal";
import GuideAndInfoModal from "@/components/ui/GuideAndInfoModal";
import ScrollToTopButton from "@/components/ui/ScrollToTopButton";
import AppIntroSplash from "@/components/ui/AppIntroSplash";
import ShareAppModal, {
  FooterShareButton,
} from "@/components/ui/ShareAppModal";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://app.muallimun.net"),
  title: {
    default: "Arapça Telaffuz ve Diyalog Asistanı — Muallimun",
    template: "%s | Arapça Telaffuz ve Diyalog Asistanı",
  },
  description:
    "60 CEFR Arapça diyalog, 16kHz DSP & Whisper AI destekli 38 çiftlik Mahreç Koçu, morfolojik kök sözlüğü, kalıp ifadeler, Dinle ve Sırala dahil 5 modlu alıştırma merkezi, Akıllı Hata Defteri ve A4 PDF çalışma kağıdı üreticisi.",
  applicationName: "Arapça Telaffuz ve Diyalog Asistanı",
  keywords: [
    "Arapça diyaloglar",
    "Arapça telaffuz koçu",
    "Arapça mahreç eğitimi",
    "Arapça konuşma pratiği",
    "Arapça kalıp ifadeler",
    "morfolojik Arapça sözlük",
    "Arapça cümle kurma",
    "Arapça çalışma kağıdı PDF",
    "Muallimun Arapça",
    "CEFR Arapça A1 A2 B1 B2",
  ],
  authors: [{ name: "Muallimun", url: "https://muallimun.net" }],
  creator: "Muallimun",
  publisher: "Muallimun",
  manifest: "/manifest.webmanifest",
  alternates: {
    canonical: "https://app.muallimun.net",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Arapça Asistanı",
  },
  openGraph: {
    title: "Arapça Telaffuz ve Diyalog Asistanı — Muallimun",
    description:
      "60 CEFR diyalog, 38 çiftlik yapay zeka mahreç koçu, morfolojik sözlük, kalıp ifadeler, 5 modlu interaktif alıştırma merkezi ve akıllı A4 PDF çalışma kağıdı üreticisi.",
    url: "https://app.muallimun.net",
    siteName: "Arapça Telaffuz ve Diyalog Asistanı",
    locale: "tr_TR",
    type: "website",
    images: [
      {
        url: "/opengraph-image",
        width: 1200,
        height: 630,
        alt: "Arapça Telaffuz ve Diyalog Asistanı — Muallimun",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Arapça Telaffuz ve Diyalog Asistanı — Muallimun",
    description:
      "60 CEFR diyalog, 38 çiftlik yapay zeka mahreç koçu, morfolojik sözlük, kalıp ifadeler, 5 modlu alıştırma merkezi ve akıllı A4 PDF üreticisi.",
    images: ["/opengraph-image"],
  },
  icons: {
    icon: [
      { url: "/icons/favicon.ico" },
      { url: "/icons/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/icons/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      {
        url: "/icons/android-chrome-192x192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        url: "/icons/android-chrome-512x512.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
    shortcut: ["/icons/favicon.ico"],
    apple: [
      {
        url: "/icons/apple-touch-icon.png",
        sizes: "180x180",
        type: "image/png",
      },
    ],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#FAF6EE" },
    { media: "(prefers-color-scheme: dark)", color: "#0f172a" },
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="tr" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Amiri:wght@400;700&family=Lateef:wght@400;600;700&family=Noto+Naskh+Arabic:wght@400;600;700&family=Scheherazade+New:wght@400;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="antialiased flex flex-col min-h-screen bg-[var(--background)] text-[var(--foreground)] overflow-x-clip selection:bg-[#0CA678]/20">
        <AppIntroSplash />
        <ServiceWorkerRegister />
        <AudioStopper />
        <OnboardingTourModal />
        <GuideAndInfoModal />
        <ShareAppModal />
        <Header />
        <main className="flex-1 w-full max-w-6xl mx-auto px-3 sm:px-6 py-4 md:py-6">
          {children}
        </main>
        <ScrollToTopButton />
        <MobileNav />

        <footer className="flex flex-col sm:flex-row print:hidden border-t-2 border-[#E6D7BE] dark:border-[var(--border)] bg-[#F7EFE1] dark:bg-[var(--surface)] py-3 px-3 sm:py-4 sm:px-6 mt-6 sm:mt-10 mb-14 lg:mb-0 text-center text-xs text-[var(--muted)] items-center justify-between gap-2 max-w-6xl w-full mx-auto rounded-t-2xl">
          <div className="flex items-center justify-center sm:justify-start gap-2 max-w-full">
            <div className="w-7 h-7 rounded-lg bg-white dark:bg-[var(--background)] border border-[#E6D7BE] dark:border-[var(--border)] flex items-center justify-center p-0.5 shrink-0">
              <img
                src="/icons/android-chrome-192x192.png"
                alt="Logo"
                className="w-6 h-6 object-contain rounded-md"
              />
            </div>
            <span className="font-medium text-xs sm:text-sm whitespace-nowrap">
              © 2026 Arapça Telaffuz ve Diyalog Asistanı
            </span>
          </div>

          <div className="flex flex-wrap items-center justify-center sm:justify-end gap-1.5 sm:gap-2.5">
            <a
              href="https://t.me/muallimun"
              target="_blank"
              rel="noopener noreferrer"
              title="Telegram Kanalımıza Katılın"
              className="inline-flex items-center gap-1.5 px-2.5 py-1 sm:px-3 sm:py-1.5 text-[11px] sm:text-xs rounded-full bg-white dark:bg-slate-800 border border-stone-200/80 dark:border-slate-700 font-semibold text-sky-600 dark:text-sky-400 hover:bg-sky-50 dark:hover:bg-sky-950/40 hover:border-sky-300 transition-all shadow-xs"
            >
              <svg
                className="w-3.5 h-3.5 fill-current shrink-0"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
              </svg>
              <span>Telegram</span>
            </a>

            <a
              href="https://whatsapp.com/channel/0029VaAif947oQhgdaDMjK1Q"
              target="_blank"
              rel="noopener noreferrer"
              title="WhatsApp Kanalımızı Takip Edin"
              className="inline-flex items-center gap-1.5 px-2.5 py-1 sm:px-3 sm:py-1.5 text-[11px] sm:text-xs rounded-full bg-white dark:bg-slate-800 border border-stone-200/80 dark:border-slate-700 font-semibold text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 hover:border-emerald-300 transition-all shadow-xs"
            >
              <svg
                className="w-3.5 h-3.5 fill-current shrink-0"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path d="M12.031 6.172c-3.181 0-5.767 2.586-5.768 5.766-.001 1.298.38 2.27 1.019 3.287l-.582 2.128 2.182-.573c.978.58 1.911.928 3.145.929 3.178 0 5.767-2.587 5.768-5.766.001-3.187-2.575-5.77-5.764-5.771zm3.392 8.244c-.144.405-.837.774-1.17.824-.299.045-.677.063-1.092-.069-.252-.08-.575-.187-.988-.365-1.739-.751-2.874-2.502-2.961-2.617-.087-.116-.708-.94-.708-1.793s.448-1.273.607-1.446c.159-.173.346-.217.462-.217l.332.006c.106.005.249-.04.39.298.144.347.491 1.2.534 1.287.043.087.072.188.014.304-.058.116-.087.188-.173.289l-.26.304c-.087.086-.177.18-.076.354.101.174.449.741.964 1.201.662.591 1.221.774 1.394.86s.274.072.376-.043c.101-.116.433-.506.549-.68.116-.173.231-.145.39-.087s1.011.477 1.184.564.289.13.332.202c.045.072.045.419-.1.824zm-3.423-14.416c-6.627 0-12 5.373-12 12 0 2.127.558 4.198 1.613 6.008L0 24l6.135-1.608A11.943 11.943 0 0 0 12.031 24c6.627 0 12-5.373 12-12s-5.373-12-12-12z" />
              </svg>
              <span>WhatsApp</span>
            </a>

            <a
              href="https://www.youtube.com/@MuallimunNet"
              target="_blank"
              rel="noopener noreferrer"
              title="YouTube Kanalımıza Abone Olun"
              className="inline-flex items-center gap-1.5 px-2.5 py-1 sm:px-3 sm:py-1.5 text-[11px] sm:text-xs rounded-full bg-white dark:bg-slate-800 border border-stone-200/80 dark:border-slate-700 font-semibold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 hover:border-red-300 transition-all shadow-xs"
            >
              <svg
                className="w-3.5 h-3.5 fill-current shrink-0"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
              </svg>
              <span>YouTube</span>
            </a>

            <a
              href="https://muallimun.net"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-2.5 py-1 sm:px-3 sm:py-1.5 text-[11px] sm:text-xs font-semibold text-[#087F5B] dark:text-[#20c997] hover:text-[#0CA678] transition-colors bg-white dark:bg-[var(--background)] rounded-full border border-[#E6D7BE] dark:border-[var(--border)] shadow-xs"
            >
              <span>muallimun.net</span>
            </a>

            <FooterShareButton />
          </div>
        </footer>
      </body>
    </html>
  );
}