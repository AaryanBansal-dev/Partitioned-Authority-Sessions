import type { Metadata } from "next";
import { Manrope, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-heading",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: "PAN // PROTOCOL",
  description: "Partitioned Authority Sessions. Security by design.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${manrope.variable} ${jetbrainsMono.variable} font-sans bg-black text-white antialiased selection:bg-[#ccff00] selection:text-black overflow-x-hidden`}
      >
        {children}
      </body>
    </html>
  );
}
