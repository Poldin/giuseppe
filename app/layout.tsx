import { Footer } from "@/app/components/layout/Footer";
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
// 1. Importa il componente di Vercel
import { Analytics } from "@vercel/analytics/next";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Giuseppe",
  description: "tu parli, io metto in ordine.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="it"
      className={`${geistSans.variable} ${geistMono.variable} h-full w-full overflow-x-clip antialiased`}
    >
      <body className="flex min-h-full w-full min-w-0 flex-col overflow-x-clip">
        <div className="flex min-h-full flex-1 flex-col">{children}</div>
        <Footer />
        {/* 2. Inserisci il componente qui */}
        <Analytics />
      </body>
    </html>
  );
}
