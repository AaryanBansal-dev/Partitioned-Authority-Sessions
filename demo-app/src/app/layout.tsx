import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "PAN Security Demo - Partitioned Authority Sessions",
  description:
    "Interactive demo showing how PAN makes session hijacking impossible. Test XSS attacks, cookie theft, and key extraction - all blocked by design.",
  keywords: [
    "security",
    "session",
    "authentication",
    "XSS",
    "cookie",
    "WebCrypto",
    "ECDSA",
  ],
  authors: [{ name: "Aaryan Bansal" }],
  openGraph: {
    title: "PAN Security Demo",
    description:
      "See why stolen session tokens are worthless with Partitioned Authority Sessions",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.variable} font-sans antialiased`}>
        {children}
      </body>
    </html>
  );
}
