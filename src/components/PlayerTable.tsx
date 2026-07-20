"use client";

import { useState, useMemo } from "react";
import {
  Search,
  ChevronUp,
  ChevronDown,
  ArrowUpDown,
  Download,
  Eye,
  EyeOff,
  Star,
  Printer,
  FilterX,
  TrendingUp,
  TrendingDown,
  Minus,
} from "lucide-react";
import { cn, formatCurrency, positionColor, teamAbbreviation } from "@/lib/utils";
import type { PlayerWithValue } from "@/lib/types";

interface PlayerTableProps {
  players: PlayerWithValue[];
  onToggleDrafted?: (playerId: number) => void;
  onToggleFavorite?: (playerId: number) => void;
  favorites?: Set<number>;
  hideDrafted?: boolean;
  compact?: boolean;
}

type SortKey =
  | "overallRank"
  | "name"
  | "position"
  | "positionRank"
  | "auctionValue"
  | "sourceValue"
  | "tier"
  | "team"
  | "trend30";

interface SortState {
  key: SortKey;
  dir: "asc" | "desc";
}

export function PlayerTable({
  players,
  onToggleDrafted,
  onToggleFavorite,
  favorites = new Set(),
  hideDrafted = false,
  compact = false,
}: PlayerTableProps) {
  const [search, setSearch] = useState("");
  const [posFilter, setPosFilter] = useState<string>("all");
  const [tierFilter, setTierFilter] = useState<number | null>(null);
  const [sort, setSort] = useState<SortState>({
    key: "auctionValue",
    dir: "desc",
  });
  const [showDrafted, setShowDrafted] = useState(!hideDrafted);

  const filtered = useMemo(() => {
    let result = [...players];

    // Search
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.team.toLowerCase().includes(q),
      );
    }

    // Position filter
    if (posFilter !== "all") {
      result = result.filter((p) => p.position === posFilter);
    }

    // Tier filter
    if (tierFilter !== null) {
      result = result.filter((p) => p.tier === tierFilter);
    }

    // Drafted visibility
    if (!showDrafted) {
      result = result.filter((p) => !p.drafted);
    }

    // Sort
    result.sort((a, b) => {
      let cmp = 0;
      switch (sort.key) {
        case "overallRank":
          cmp = a.overallRank - b.overallRank;
          break;
        case "name":
          cmp = a.name.localeCompare(b.name);
          break;
        case "position":
          cmp = a.position.localeCompare(b.position);
          break;
        case "positionRank":
          cmp = a.positionRank - b.positionRank;
          break;
        case "auctionValue":
          cmp = a.auctionValue - b.auctionValue;
          break;
        case "sourceValue":
          cmp = a.sourceValue - b.sourceValue;
          break;
        case "tier":
          cmp = a.tier - b.tier;
          break;
        case "team":
          cmp = a.team.localeCompare(b.team);
          break;
        case "trend30":
          cmp = (a.trend30 ?? -999) - (b.trend30 ?? -999);
          break;
      }
      return sort.dir === "desc" ? -cmp : cmp;
    });

    return result;
  }, [players, search, posFilter, tierFilter, sort, showDrafted]);

  function toggleSort(key: SortKey) {
    setSort((prev) => ({
      key,
      dir: prev.key === key && prev.dir === "desc" ? "asc" : "desc",
    }));
  }

  function TrendBadge({ value }: { value: number | null }) {
  if (value === null || value === undefined) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }
  const abs = Math.abs(value);
  if (value > 0) {
    return (
      <span className="inline-flex items-center gap-0.5 text-xs font-medium text-green-600 dark:text-green-400">
        <TrendingUp size={12} />
        +{abs.toFixed(1)}
      </span>
    );
  }
  if (value < 0) {
    return (
      <span className="inline-flex items-center gap-0.5 text-xs font-medium text-red-600 dark:text-red-400">
        <TrendingDown size={12} />
        -{abs.toFixed(1)}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-0.5 text-xs text-muted-foreground">
      <Minus size={12} />
      0.0
    </span>
  );
}

function SortHeader({ label, sortKey }: { label: string; sortKey: SortKey }) {
    const active = sort.key === sortKey;
    return (
      <th
        onClick={() => toggleSort(sortKey)}
        className={cn(
          "px-3 py-3 text-left text-xs font-medium uppercase tracking-wider cursor-pointer select-none",
          "text-muted-foreground hover:text-foreground transition-colors",
          active && "text-primary",
        )}
      >
        <div className="flex items-center gap-1">
          {label}
          {active ? (
            sort.dir === "desc" ? (
              <ChevronDown size={14} />
            ) : (
              <ChevronUp size={14} />
            )
          ) : (
            <ArrowUpDown size={14} className="opacity-30" />
          )}
        </div>
      </th>
    );
  }

  function exportCSV() {
    const headers = [
      "Rank",
      "Player",
      "Team",
      "Position",
      "Pos Rank",
      "Auction Value",
      "Source Value",
      "Tier",
      "Drafted",
    ];
    const rows = players.map((p) =>
      [
        p.overallRank,
        p.name,
        p.team,
        p.position,
        p.positionRank,
        p.auctionValue,
        p.sourceValue,
        p.tier,
        p.drafted ? "Yes" : "No",
      ].join(","),
    );
    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "auction-values.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  function printCheatSheet() {
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    const rows = players
      .map(
        (p) =>
          `<tr${p.drafted ? ' style="opacity:0.4;text-decoration:line-through"' : ""}>
            <td>${p.overallRank}</td>
            <td>${p.name}</td>
            <td>${p.team}</td>
            <td>${p.position}${p.positionRank}</td>
            <td><strong>${formatCurrency(p.auctionValue)}</strong></td>
            <td>${p.tier}</td>
          </tr>`,
      )
      .join("");

    printWindow.document.write(`
      <html>
        <head>
          <title>Auction Cheat Sheet</title>
          <style>
            body { font-family: system-ui, sans-serif; padding: 20px; }
            h1 { font-size: 18px; margin-bottom: 10px; }
            table { width: 100%; border-collapse: collapse; font-size: 12px; }
            th { background: #eee; text-align: left; padding: 6px 8px; }
            td { padding: 4px 8px; border-bottom: 1px solid #ddd; }
            @media print { body { -webkit-print-color-adjust: exact; } }
          </style>
        </head>
        <body>
          <h1>AuctionCalc Cheat Sheet</h1>
          <table>
            <thead><tr>
              <th>Rank</th><th>Player</th><th>Team</th><th>Pos</th><th>Value</th><th>Tier</th>
            </tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => printWindow.print(), 300);
  }

  const positions = ["QB", "RB", "WR", "TE"];

  if (players.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <p className="text-lg">No player data loaded.</p>
        <p className="text-sm mt-1">Configure your league settings and click Calculate.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[160px] max-w-xs">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <input
            type="text"
            placeholder="Search players..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        <select
          value={posFilter}
          onChange={(e) => setPosFilter(e.target.value)}
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        >
          <option value="all">All Positions</option>
          {positions.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>

        <select
          value={tierFilter ?? ""}
          onChange={(e) =>
            setTierFilter(e.target.value ? parseInt(e.target.value) : null)
          }
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        >
          <option value="">All Tiers</option>
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((t) => (
            <option key={t} value={t}>
              Tier {t}
            </option>
          ))}
        </select>

        {tierFilter !== null && (
          <button
            onClick={() => setTierFilter(null)}
            className="p-2 rounded-lg hover:bg-secondary text-muted-foreground"
            title="Clear tier filter"
          >
            <FilterX size={16} />
          </button>
        )}

        <button
          onClick={() => setShowDrafted(!showDrafted)}
          className={cn(
            "flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm transition-colors",
            showDrafted
              ? "bg-secondary text-secondary-foreground"
              : "bg-primary/10 text-primary",
          )}
        >
          {showDrafted ? <EyeOff size={14} /> : <Eye size={14} />}
          {showDrafted ? "Showing All" : "Hide Drafted"}
        </button>

        <button
          onClick={exportCSV}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors"
        >
          <Download size={14} />
          CSV
        </button>

        <button
          onClick={printCheatSheet}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors"
        >
          <Printer size={14} />
          Print
        </button>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead className="bg-secondary/50">
            <tr>
              <SortHeader label="Rank" sortKey="overallRank" />
              <SortHeader label="Player" sortKey="name" />
              <SortHeader label="Team" sortKey="team" />
              <SortHeader label="Pos" sortKey="position" />
              <SortHeader label="Pos Rank" sortKey="positionRank" />
              <SortHeader label="Auction $" sortKey="auctionValue" />
              <SortHeader label="Source" sortKey="sourceValue" />
              <SortHeader label="Tier" sortKey="tier" />
              <SortHeader label="30-Day" sortKey="trend30" />
              {!compact && <th className="px-3 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">Status</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filtered.map((p) => (
              <tr
                key={p.id}
                className={cn(
                  "hover:bg-muted/50 transition-colors",
                  p.drafted && "opacity-60",
                )}
              >
                <td className="px-3 py-2.5 font-mono text-xs text-muted-foreground">
                  {p.overallRank}
                </td>
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    {onToggleFavorite && (
                      <button
                        onClick={() => onToggleFavorite(p.id)}
                        className={cn(
                          "shrink-0 transition-colors",
                          favorites.has(p.id)
                            ? "text-yellow-500"
                            : "text-muted-foreground/30 hover:text-muted-foreground",
                        )}
                      >
                        <Star
                          size={14}
                          fill={favorites.has(p.id) ? "currentColor" : "none"}
                        />
                      </button>
                    )}
                    <span
                      className={cn(
                        "font-medium",
                        p.drafted && "line-through",
                      )}
                    >
                      {p.name}
                    </span>
                  </div>
                </td>
                <td className="px-3 py-2.5 text-muted-foreground">
                  {teamAbbreviation(p.team)}
                </td>
                <td className={cn("px-3 py-2.5 font-medium", positionColor(p.position))}>
                  {p.position}
                </td>
                <td className="px-3 py-2.5 font-mono text-xs text-muted-foreground">
                  {p.positionRank}
                </td>
                <td className="px-3 py-2.5 font-semibold font-mono tabular-nums">
                  {formatCurrency(p.auctionValue)}
                </td>
                <td className="px-3 py-2.5 text-muted-foreground font-mono text-xs tabular-nums">
                  {p.sourceValue}
                </td>
                <td className="px-3 py-2.5">
                  <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-secondary text-xs font-medium">
                    {p.tier}
                  </span>
                </td>
                <td className="px-3 py-2.5">
                  <TrendBadge value={p.trend30} />
                </td>
                {!compact && (
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      {p.drafted && onToggleDrafted && (
                        <button
                          onClick={() => onToggleDrafted(p.id)}
                          className="text-xs text-red-500 hover:text-red-600"
                        >
                          Undo
                        </button>
                      )}
                      {!p.drafted && onToggleDrafted && (
                        <button
                          onClick={() => onToggleDrafted(p.id)}
                          className="text-xs text-primary hover:text-primary/80"
                        >
                          Draft
                        </button>
                      )}
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="text-xs text-muted-foreground text-right">
        Showing {filtered.length} of {players.length} players
      </div>
    </div>
  );
}
