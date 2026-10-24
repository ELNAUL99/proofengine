import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ProofEngine",
  description: "Public evidence from a Finnish company's own job ads, then an email only if a sentence can be quoted.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
