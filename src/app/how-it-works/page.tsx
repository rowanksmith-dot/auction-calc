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
            for your league&rsquo;s specific settings. Here is the full
            methodology:
          </p>

          <h2 className="text-lg font-semibold text-foreground mt-6">
            Overview
          </h2>
          <p>
            By default, AuctionCalc assumes a 12-team league with a $1,000
            budget per team. This creates a total league-wide auction pool of
            <strong> $12,000</strong>. The model distributes that $12,000
            across the expected drafted-player pool based on FantasyCalc market
            values, positional scarcity, replacement level, and the selected
            auction-value curve.
          </p>
          <p>
            Fantasy leagues use different auction budgets. AuctionCalc supports
            custom budgets and scales its values to the selected amount.
          </p>

          <h2 className="text-lg font-semibold text-foreground mt-6">
            Step 1: Total League Budget
          </h2>
          <div className="bg-muted rounded-lg p-3 font-mono text-sm">
            totalLeagueBudget = numberOfTeams × budgetPerTeam
          </div>
          <p>
            Default: 12 × $1,000 = <strong>$12,000</strong>.
          </p>

          <h2 className="text-lg font-semibold text-foreground mt-6">
            Step 2: Reserve Minimum Bids
          </h2>
          <p>
            Every drafted player receives at least the minimum bid ($1 by
            default):
          </p>
          <div className="bg-muted rounded-lg p-3 font-mono text-sm">
            reservedMinimum = draftedPlayerCount × minimumBid
          </div>
          <p>
            For the default league: 192 drafted players × $1 = $192 reserved.
            The remaining <strong>$11,808</strong> is the discretionary budget.
          </p>

          <h2 className="text-lg font-semibold text-foreground mt-6">
            Step 3: Build the Drafted Player Pool
          </h2>
          <p>
            Based on your roster settings and the FantasyCalc player values,
            we determine which players will be drafted using a deterministic
            maximum-value slot assignment:
          </p>
          <ol className="list-decimal pl-5 space-y-1">
            <li>Fill mandatory QB slots with the highest-valued QBs</li>
            <li>Fill mandatory RB slots with the highest-valued RBs</li>
            <li>Fill mandatory WR slots with the highest-valued WRs</li>
            <li>Fill mandatory TE slots with the highest-valued TEs</li>
            <li>Fill Superflex slots with the best available QB, RB, WR, or TE</li>
            <li>Fill FLEX slots with the best available RB, WR, or TE</li>
            <li>Fill bench slots with the highest remaining values</li>
          </ol>
          <p>
            Each player is assigned to exactly one slot. Players outside the
            drafted pool display as Waiver ($0) and receive no discretionary
            budget.
          </p>

          <h2 className="text-lg font-semibold text-foreground mt-6">
            Step 4: Replacement Level
          </h2>
          <p>
            For each position, we calculate replacement level as the{" "}
            <strong>best undrafted player</strong> at that position. This is
            the marginal roster boundary — the value a team can get for free
            (or the minimum bid) on the waiver wire.
          </p>
          <div className="bg-muted rounded-lg p-3 font-mono text-sm">
            replacementValue[position] = value of the best undrafted player
            at that position
          </div>
          <p>
            This accounts for the full drafted pool — starters, FLEX,
            Superflex, and bench. It is more accurate than using the worst
            starter as replacement because it properly measures the marginal
            value of a roster addition.
          </p>

          <h2 className="text-lg font-semibold text-foreground mt-6">
            Step 5: Surplus Value
          </h2>
          <p>
            Each drafted player&rsquo;s surplus is their FantasyCalc value
            minus the replacement value at their position:
          </p>
          <div className="bg-muted rounded-lg p-3 font-mono text-sm">
            surplus = max(FantasyCalcValue - replacementValue[position], 0)
          </div>
          <p>
            Players below replacement level get the minimum bid. Players at or
            above replacement get a proportional share of the discretionary
            budget.
          </p>

          <h2 className="text-lg font-semibold text-foreground mt-6">
            Step 6: Weighted Allocation
          </h2>
          <p>
            Surplus values are converted into weights using the selected
            exponent:
          </p>
          <div className="bg-muted rounded-lg p-3 font-mono text-sm">
            weight = surplus ^ exponent
          </div>
          <p>
            The default exponent (<strong>1.0 — Balanced</strong>) gives a proportional
            proportional allocation. Available presets:
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>
              <strong>0.85 — Flatter</strong>: reduces the gap between elite
              and replacement-level players
            </li>
            <li>
              <strong>1.0 — Balanced</strong>: proportional surplus-based
              allocation
            </li>
            <li>
              <strong>1.15 — Stars & Scrubs</strong>: concentrates more money
              on top players
            </li>
          </ul>

          <h2 className="text-lg font-semibold text-foreground mt-6">
            Step 7: Dollar Allocation
          </h2>
          <div className="bg-muted rounded-lg p-3 font-mono text-sm space-y-1">
            <p>playerValue = minBid + discretionaryBudget × (weight / totalWeight)</p>
          </div>
          <p>
            Values are rounded to whole dollars using the{" "}
            <strong>largest-remainder method</strong>, which guarantees:
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>No drafted player is below the minimum bid</li>
            <li>Undrafted players receive $0</li>
            <li>The total equals the exact league-wide budget</li>
            <li>No dollars are lost to rounding error</li>
            <li>Identical inputs always produce identical outputs</li>
          </ul>

          <h2 className="text-lg font-semibold text-foreground mt-6">
            Budget Scaling
          </h2>
          <p>
            The model works for any positive user-selected budget. Changing
            only the budget scales values proportionally while preserving
            player rankings (except for rounding ties) and keeping the
            drafted-player pool identical.
          </p>
          <p>
            For example, a $250 value in a $1,000-budget league represents 25%
            of a team&rsquo;s budget — equivalent in relative cost to a $50
            value in a $200-budget league.
          </p>

          <h2 className="text-lg font-semibold text-foreground mt-6">
            TE Premium Adjustment
          </h2>
          <p>
            FantasyCalc does not directly support TE premium scoring.
            AuctionCalc applies a local adjustment: TE surplus values are
            multiplied by a premium factor (1.5× for half-Premium, 2.0× for
            full Premium, or a custom value). This shifts additional budget
            toward tight ends.
          </p>
          <p>
            TE-premium values are clearly marked as an AuctionCalc adjustment
            and do not represent unmodified FantasyCalc values.
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
            football trades. Values update regularly. If FantasyCalc is
            temporarily unavailable, AuctionCalc uses a local fallback
            dataset.
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
