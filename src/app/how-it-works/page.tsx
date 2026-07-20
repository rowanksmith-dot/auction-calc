import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "How It Works — AuctionCalc",
  description:
    "How AuctionCalc converts FantasyCalc player values into customized auction-draft dollar values.",
};

export default function HowItWorksPage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center gap-3">
          <Link
            href="/"
            className="text-lg font-bold hover:text-primary transition-colors"
          >
            AuctionCalc
          </Link>
          <span className="text-sm text-muted-foreground">
            / How It Works
          </span>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold mb-6">
          How AuctionCalc Works
        </h1>

        <div className="prose prose-sm dark:prose-invert max-w-none space-y-4 text-muted-foreground">
          <p>
            AuctionCalc converts{" "}
            <a
              href="https://fantasycalc.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline hover:no-underline"
            >
              FantasyCalc
            </a>
            &lsquo;s market values into customized auction-draft dollar values
            for your league&lsquo;s specific settings. Here is the full
            methodology:
          </p>

          <h2 className="text-lg font-semibold text-foreground mt-6">
            Step 1: Total League Budget
          </h2>
          <p>
            We calculate the total amount of money in your auction:
          </p>
          <div className="bg-muted rounded-lg p-3 font-mono text-sm">
            totalLeagueBudget = numberOfTeams × budgetPerTeam
          </div>
          <p>
            For a default 12-team league with $1,000 budgets, that is $12,000.
          </p>

          <h2 className="text-lg font-semibold text-foreground mt-6">
            Step 2: Reserve Minimum Bids
          </h2>
          <p>
            Every player selected in the draft must be worth at least the
            minimum bid ($1 by default). We reserve this amount:
          </p>
          <div className="bg-muted rounded-lg p-3 font-mono text-sm">
            reservedMinimum = draftedPlayerCount × minimumBid
          </div>

          <h2 className="text-lg font-semibold text-foreground mt-6">
            Step 3: Build the Drafted Player Pool
          </h2>
          <p>
            Based on your roster settings, we determine which players will be
            drafted. We use a maximum-value slot assignment method:
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>
              Fill mandatory QB, RB, WR, and TE slots with the highest-valued
              players at each position
            </li>
            <li>Fill FLEX slots with the best available RB, WR, or TE</li>
            <li>
              Fill Superflex slots with the best available QB, RB, WR, or TE
            </li>
            <li>Fill bench with the highest remaining value</li>
          </ul>
          <p>
            Players outside this pool (e.g., the waiver wire) receive a $0 or
            $1 endgame value.
          </p>

          <h2 className="text-lg font-semibold text-foreground mt-6">
            Step 4: Calculate Replacement Level
          </h2>
          <p>
            For each position, we find the &ldquo;replacement-level&rdquo;
            value — the FantasyCalc value of the worst starting player at that
            position based on your league&rsquo;s starting requirements.
          </p>

          <h2 className="text-lg font-semibold text-foreground mt-6">
            Step 5: Surplus Value
          </h2>
          <p>
            Each player&lsquo;s surplus is their FantasyCalc value minus the
            replacement value at their position:
          </p>
          <div className="bg-muted rounded-lg p-3 font-mono text-sm">
            surplus = max(playerValue - replacementValue, 0)
          </div>
          <p>
            If a player is below replacement level, they get the minimum bid.
          </p>

          <h2 className="text-lg font-semibold text-foreground mt-6">
            Step 6: Proportionally Distribute the Discretionary Budget
          </h2>
          <p>
            The remaining money (after reserving minimum bids) is distributed
            based on surplus weights:
          </p>
          <div className="bg-muted rounded-lg p-3 font-mono text-sm space-y-1">
            <p>weight = surplus ^ exponent</p>
            <p>playerValue = minBid + discretionaryBudget × (weight / totalWeight)</p>
          </div>
          <p>
            The <strong>exponent</strong> controls value concentration
            (default: 1.10). A higher exponent gives more money to top players;
            a lower exponent spreads it more evenly.
          </p>

          <h2 className="text-lg font-semibold text-foreground mt-6">
            Step 7: Rounding
          </h2>
          <p>
            Values are rounded to whole dollars using the{" "}
            <strong>largest-remainder method</strong>, which guarantees:
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Every drafted player is worth at least the minimum bid</li>
            <li>
              The sum of all displayed values equals exactly the total league
              budget
            </li>
            <li>No dollars are lost or created through rounding</li>
          </ul>

          <h2 className="text-lg font-semibold text-foreground mt-6">
            TE Premium Adjustment
          </h2>
          <p>
            If tight-end premium is enabled, we apply an adjustment to TE
            FantasyCalc values before calculating auction dollars. This is
            labeled on the results as an AuctionCalc adjustment.
          </p>

          <h2 className="text-lg font-semibold text-foreground mt-6">
            Data Source
          </h2>
          <p>
            All underlying player values are sourced from{" "}
            <a
              href="https://fantasycalc.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline hover:no-underline"
            >
              FantasyCalc
            </a>
            , which generates computer-driven values based on real fantasy
            football trades. If FantasyCalc is temporarily unavailable,
            AuctionCalc uses cached data from the last successful fetch.
          </p>

          <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-4 mt-6">
            <p className="font-medium text-amber-800 dark:text-amber-200">
              ⚠️ Important Disclaimer
            </p>
            <p className="text-amber-700 dark:text-amber-300 mt-1">
              These are <strong>modeled fair values</strong> based on trade
              market data, not guaranteed auction prices. Actual auction values
              vary based on your league&rsquo;s specific dynamics, draft
              strategy, and nominating order. This is an entertainment and
              informational tool — always trust your own draft preparation.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
