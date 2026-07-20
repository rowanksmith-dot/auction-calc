# AuctionCalc 🏆

Convert FantasyCalc trade values into customized auction-draft dollar values for any fantasy football league configuration.

Built with [Next.js 16](https://nextjs.org/) (App Router), TypeScript, and TailwindCSS.

## Features

- **Custom League Settings** — Number of teams, budget, scoring format, roster slots, TE premium, min bid, value exponent
- **Value-Based Drafting** — Replacement-based proportional allocation with surplus^exponent weighting + largest-remainder rounding
- **Live Draft Room** — Multi-team live draft with budgets, team names, undo, and state export/import
- **Draft Board** — View players by position or value tier
- **Sortable/Filterable Tables** — Search, sort by any column, CSV export, printable cheat sheet
- **Player Data** — 160+ player dataset with realistic QB/RB/WR/TE distribution
- **Dark/Light Theme** — Persisted to localStorage
- **No backend** — All data in browser localStorage
- **Share via URL** — Encode league settings in the URL

## Methodology

AuctionCalc uses a 7-step replacement-value model:

1. **Total League Budget** — `num_teams × budget_per_team`
2. **Reserve Minimums** — Reserve `min_bid` per roster slot
3. **Discretionary Budget** — Remaining money for star players
4. **Build Player Pool** — Assign players to roster slots by max value (position-eligible)
5. **Replacement Level** — Value of the last starter at each position
6. **Surplus & Weighting** — `surplus = value - replacement`, `weight = surplus^exponent`
7. **Distribution & Rounding** — Proportional allocation + largest-remainder rounding

## Getting Started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Running Tests

```bash
npm test              # Run tests once
npm run test:watch    # Watch mode
```

## Deployment

```bash
npm run build          # Production build
npx vercel --prod      # Deploy to Vercel
```

## License

MIT
