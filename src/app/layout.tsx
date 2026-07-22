import type { Metadata } from "next";
import "./globals.css";
import { AppProviders } from "./providers";

export const metadata: Metadata = {
  title: "AuctionCalc — Fantasy Football Auction Values",
  description:
    "Convert FantasyCalc player values into customized auction-draft dollar values. Settings include league size, scoring, PPR, TE premium, and more.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              var saved = localStorage.getItem('auction-calc-theme');
              if (saved && saved !== 'dark') {
                document.documentElement.className = saved;
              }
            `,
          }}
        />
      </head>
      <body className="min-h-screen antialiased">
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
