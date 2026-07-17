import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import Sidebar from "@/components/Sidebar";
import { ThemeProvider } from "@/components/ThemeProvider";
import { AppCacheProvider } from "@/components/AppCacheProvider";

const nbInternational = localFont({
  src: [
    { path: "../public/fonts/NBInternationalPro-Light.woff2", weight: "300", style: "normal" },
    { path: "../public/fonts/NBInternationalPro-Regular.woff2", weight: "400", style: "normal" },
  ],
  variable: "--font-nb-international",
  display: "swap",
});

const geistMono = localFont({
  src: [{ path: "../public/fonts/GeistMono-Regular.woff2", weight: "400", style: "normal" }],
  variable: "--font-geist-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "India Stock Analysis Dashboard",
  description: "Decision-focused Indian equity, options, and futures analysis",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Market Intel",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#141414" },
    { media: "(prefers-color-scheme: light)", color: "#f7f6f5" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      data-theme="dark"
      suppressHydrationWarning
      className={`${nbInternational.variable} ${geistMono.variable}`}
    >
      <body className="page-shell">
        <ThemeProvider>
          <AppCacheProvider>
            <div className="app-layout">
              <Sidebar />
              <main className="page-content">{children}</main>
            </div>
          </AppCacheProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
