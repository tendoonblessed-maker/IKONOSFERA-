import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin", "cyrillic"], display: "swap" });

export const metadata: Metadata = {
  title: "IKONOSFERA | Спокойное пространство для общения",
  description: "Мессенджер, который помогает вернуть контроль над перепиской. Первая техническая версия.",
  applicationName: "IKONOSFERA",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "IKONOSFERA", statusBarStyle: "black" },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#000000",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru" data-theme="dark">
      <body className={inter.className}>{children}</body>
    </html>
  );
}
