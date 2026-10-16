import type { Metadata } from "next";
import { Chakra_Petch, IBM_Plex_Sans, IBM_Plex_Mono, Inter } from "next/font/google";
import "./globals.css";

// Flight-deck faces — exposed as CSS variables so legacy pages (which use the
// Rajdhani/Exo 2 stack from globals.css) are untouched.
const deckDisplay = Chakra_Petch({
  weight: ["500", "600", "700"],
  subsets: ["latin"],
  variable: "--font-deck-display",
});
const deckBody = IBM_Plex_Sans({
  weight: ["400", "500", "600"],
  subsets: ["latin"],
  variable: "--font-deck-body",
});
const deckMono = IBM_Plex_Mono({
  weight: ["400", "500"],
  subsets: ["latin"],
  variable: "--font-deck-mono",
});
const sans = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
});

export const metadata: Metadata = {
  title: "Friday",
  description: "Friday — personal operating system",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`dark ${sans.variable} ${deckDisplay.variable} ${deckBody.variable} ${deckMono.variable}`}
    >
      <body className="font-body antialiased">
        <script
          dangerouslySetInnerHTML={{
            __html: "try{var t=localStorage.getItem('friday-theme');if(t==='light'){document.documentElement.classList.remove('dark');document.documentElement.classList.add('light')}}catch(e){}",
          }}
        />
        {children}
      </body>
    </html>
  );
}
