import type { Metadata, Viewport } from "next";
import Header from "@/components/layout/Header";
import "./globals.css";
import MobileNav from "@/components/layout/MobileNav";
import ServiceWorkerRegister from "@/components/pwa/ServiceWorkerRegister";

export const metadata: Metadata = {
  title: "Arapça Platformu",
  description: "Arapça konuşma ve kelime öğrenme platformu",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/icons/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/icons/favicon.ico" }
    ],
    apple: [
      { url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }
    ]
  }
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: [{ media: "(prefers-color-scheme: light)", color: "#fdfbf7" }],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr" suppressHydrationWarning>
      <body className="antialiased flex flex-col min-h-screen">
        <ServiceWorkerRegister />
        <Header />
        <main className="flex-1 pb-16 md:pb-0">
          {children}
        </main>
        <MobileNav />
        
        {/* GÜNCELLENMİŞ FOOTER */}
        <footer className="border-t border-[var(--border)] bg-[var(--surface)] py-6 text-center text-xs text-[var(--muted)] mt-auto flex flex-col md:flex-row items-center justify-center gap-2">
          <span>© {new Date().getFullYear()} Arapça Platformu. Tüm hakları saklıdır.</span>
          <span className="hidden md:inline">|</span>
          <a 
            href="https://muallimun.net" 
            target="_blank" 
            rel="noopener noreferrer" 
            className="flex items-center gap-1.5 font-bold text-brand-700 hover:text-brand-600 transition-colors bg-brand-50 px-3 py-1 rounded-full border border-brand-100"
          >
            <span>🏫</span> muallimun.net
          </a>
        </footer>
      </body>
    </html>
  );
}