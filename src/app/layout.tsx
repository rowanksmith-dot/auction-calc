import type { Metadata } from "next";
import "./globals.css";

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
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                let theme = localStorage.getItem('auction-calc-theme');
                if (!theme) theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
                document.documentElement.classList.toggle('dark', theme === 'dark');
              } catch(e) {}
            `,
          }}
        />
      </head>
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
