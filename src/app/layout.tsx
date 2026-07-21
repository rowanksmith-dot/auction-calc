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
              document.documentElement.classList.add('dark');
            `,
          }}
        />
      </head>
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
