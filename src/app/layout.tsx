import type { Metadata } from "next";
import { Inter, Bebas_Neue } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const bebasNeue = Bebas_Neue({
  variable: "--font-bebas",
  weight: "400",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "365 Security Management Group | Florida's Premier Security Agency",
  description:
    "Competent, trustworthy, and reliable security solutions for Florida communities, businesses, and institutions. Armed & Unarmed Guards, AI Surveillance, Event Security, and more. Lic. B1400302 / DS1900071.",
  keywords: [
    "security company florida",
    "security management group",
    "orlando security guards",
    "armed security florida",
    "event security",
    "residential security",
    "AI surveillance",
    "365 security",
  ],
  openGraph: {
    title: "365 Security Management Group",
    description: "Florida's Premier Security Agency",
    type: "website",
    locale: "en_US",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} ${bebasNeue.variable}`}>
      <body className="antialiased">{children}</body>
    </html>
  );
}
