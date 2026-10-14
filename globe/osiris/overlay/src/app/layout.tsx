import type { Metadata, Viewport } from "next";
import ErrorBoundary from '@/components/ErrorBoundary';
import "./globals.css";

// 365 SMG client edition: a private map framed by the client portal, not a public site.

export const viewport: Viewport = {
  themeColor: "#12122B",
  width: "device-width",
  initialScale: 1,
  colorScheme: "dark",
};

export const metadata: Metadata = {
  title: "Intel map | 365 SMG Client Portal",
  description: "Map of client sites with weather, fires, earthquakes, flights and traffic cameras.",
  robots: { index: false, follow: false },
  icons: { icon: "/favicon.ico" },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" dir="ltr">
      <body className="antialiased">
        <ErrorBoundary name="Intel map">
          {children}
        </ErrorBoundary>
      </body>
    </html>
  );
}
