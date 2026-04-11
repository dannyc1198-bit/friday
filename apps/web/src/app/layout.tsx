import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "F.R.I.D.A.Y. — Command Terminal",
  description: "Female Replacement Intelligent Digital Assistant Youth",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="font-body antialiased">{children}</body>
    </html>
  );
}
