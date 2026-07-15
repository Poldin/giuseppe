import { Footer } from "@/app/components/layout/Footer";
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
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
  description: "confronto prezzi e prodotti per studi dentistici",
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
        <Analytics />
      </body>
    </html>
  );
}
