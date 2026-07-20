import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy — AuctionCalc",
  description: "Privacy policy for AuctionCalc fantasy football auction value calculator.",
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center gap-3">
          <Link href="/" className="text-lg font-bold hover:text-primary transition-colors">
            AuctionCalc
          </Link>
          <span className="text-sm text-muted-foreground">/ Privacy</span>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold mb-6">Privacy Policy</h1>
        <div className="prose prose-sm dark:prose-invert max-w-none space-y-4 text-muted-foreground">
          <p>
            <strong>Last updated:</strong> July 2026
          </p>
          <h2 className="text-lg font-semibold text-foreground mt-6">Data Collection</h2>
          <p>
            AuctionCalc does not collect, store, or transmit any personal information.
            All league settings, team names, and draft progress are stored locally in
            your browser using localStorage.
          </p>
          <h2 className="text-lg font-semibold text-foreground mt-6">What We Store</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>Your league settings (stored in your browser)</li>
            <li>Team names you enter for the Draft Room (stored in your browser)</li>
            <li>Draft progress and player selections (stored in your browser)</li>
            <li>Your dark/light mode preference (stored in your browser)</li>
          </ul>
          <h2 className="text-lg font-semibold text-foreground mt-6">Third-Party Data</h2>
          <p>
            Player market values are sourced from FantasyCalc via their public API.
            AuctionCalc caches this data server-side for performance. No user data is
            shared with FantasyCalc.
          </p>
          <h2 className="text-lg font-semibold text-foreground mt-6">Cookies</h2>
          <p>This site does not use cookies or tracking scripts.</p>
          <h2 className="text-lg font-semibold text-foreground mt-6">Contact</h2>
          <p>
            If you have questions about this policy, please open an issue on the
            project&apos;s GitHub repository.
          </p>
        </div>
      </main>
    </div>
  );
}
