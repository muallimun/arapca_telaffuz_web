import type { Metadata, Viewport } from "next";
import Header from "@/components/layout/Header";
import MobileNav from "@/components/layout/MobileNav";
import ServiceWorkerRegister from "@/components/pwa/ServiceWorkerRegister";
import AudioStopper from "@/components/AudioStopper";
import "./globals.css";

export const metadata: Metadata = {
  title: "Arapça Telaffuz ve Diyalog Asistanı",
  description:
    "İnteraktif Arapça diyaloglar, yapay zeka destekli telaffuz & mahreç koçluğu, kelime alıştırmaları ve sesli sözlük platformu.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Arapça",
  },
  openGraph: {
    title: "Arapça Telaffuz ve Diyalog Asistanı",
    description:
      "İnteraktif Arapça diyaloglar, yapay zeka destekli telaffuz & mahreç koçluğu, kelime alıştırmaları ve sesli sözlük platformu.",
    type: "website",
    images: [
      {
        url: "/icons/android-chrome-512x512.png",
        width: 512,
        height: 512,
        alt: "Arapça Telaffuz ve Diyalog Asistanı",
      },
    ],
  },
  icons: {
    icon: [
      { url: "/icons/favicon.ico" },
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
        url: "/icons/android-chrome-192x192.png",
        sizes: "192x192",
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
    { media: "(prefers-color-scheme: light)", color: "#FDFBF7" },
    { media: "(prefers-color-scheme: dark)", color: "#191714" },
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
      <body className="antialiased flex flex-col min-h-screen bg-[var(--background)] text-[var(--foreground)] overflow-x-hidden selection:bg-[#0CA678]/20">
        <ServiceWorkerRegister />
        <AudioStopper />
        <Header />
        <main className="flex-1 w-full max-w-6xl mx-auto px-3 sm:px-6 py-4 md:py-6 pb-24 md:pb-10">
          {children}
        </main>
        <MobileNav />

        <footer className="hidden md:flex border-t-2 border-[#E6D7BE] dark:border-[var(--border)] bg-[#F7EFE1] dark:bg-[var(--surface)] py-4 px-6 text-center text-xs text-[var(--muted)] mt-auto items-center justify-between max-w-6xl w-full mx-auto rounded-t-2xl">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-white dark:bg-[var(--background)] border border-[#E6D7BE] dark:border-[var(--border)] flex items-center justify-center p-0.5 shrink-0">
              <img
                src="/icons/android-chrome-192x192.png"
                alt="Logo"
                className="w-6 h-6 object-contain rounded-md"
              />
            </div>
            <span className="font-medium">
              © {new Date().getFullYear()} Arapça Telaffuz ve Diyalog Asistanı ·
              Eğitim Materyali Platformu
            </span>
          </div>
          <a
            href="https://muallimun.net"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 font-bold text-[#087F5B] dark:text-[#20c997] hover:text-[#0CA678] transition-colors bg-white dark:bg-[var(--background)] px-3 py-1.5 rounded-xl border border-[#E6D7BE] dark:border-[var(--border)]"
          >
            <span>muallimun.net</span>
          </a>
        </footer>
      </body>
    </html>
  );
}