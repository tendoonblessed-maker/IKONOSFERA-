import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin", "cyrillic"], display: "swap", variable:"--font-inter" });

export const metadata: Metadata = {
  title: "IKONOSFERA | Мессенджер",
  description: "IKONOSFERA — больше чем просто мессенджер для Android, iPhone, macOS и Windows.",
  applicationName: "IKONOSFERA",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "IKONOSFERA", statusBarStyle: "default" },
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
  themeColor: "#ffffff",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru" data-theme="light">
      <body className={`${inter.className} ${inter.variable}`}>{children}</body>
    </html>
  );
}
