"use client";

import { useState, useMemo } from "react";
import { Search, LayoutList, LayoutGrid, Eye, EyeOff } from "lucide-react";
import { cn, formatCurrency, positionColor, positionBgColor } from "@/lib/utils";
import type { PlayerWithValue } from "@/lib/types";

interface DraftBoardProps {
  players: PlayerWithValue[];
  onToggleDrafted: (playerId: number) => void;
}

const TIER_COLORS = [
  "border-l-red-500",
  "border-l-orange-500",
  "border-l-yellow-500",
  "border-l-green-500",
  "border-l-blue-500",
  "border-l-indigo-500",
  "border-l-purple-500",
  "border-l-gray-500",
];

export function DraftBoard({ players, onToggleDrafted }: DraftBoardProps) {
  const [view, setView] = useState<"position" | "value">("position");
  const [search, setSearch] = useState("");
  const [hideDrafted, setHideDrafted] = useState(false);

  const filtered = useMemo(() => {
    let result = [...players];
    if (search) {
      const q = search.toLowerCase();
      result = result.filter((p) => p.name.toLowerCase().includes(q));
    }
    if (hideDrafted) {
      result = result.filter((p) => !p.drafted);
    }
    return result;
  }, [players, search, hideDrafted]);

  const grouped = useMemo(() => {
    if (view === "position") {
      const groups: Record<string, PlayerWithValue[]> = { QB: [], RB: [], WR: [], TE: [] };
      const flex: PlayerWithValue[] = [];
      for (const p of filtered) {
        if (p.position in groups) groups[p.position].push(p);
        else flex.push(p);
      }
      // Sort each group by auction value descending
      for (const key of Object.keys(groups)) {
        groups[key].sort((a, b) => b.auctionValue - a.auctionValue);
      }
      return { type: "position" as const, groups: { ...groups, FLEX: flex } };
    } else {
      const tiers: Record<number, PlayerWithValue[]> = {};
      const sorted = [...filtered].sort((a, b) => b.auctionValue - a.auctionValue);
      for (const p of sorted) {
        if (!tiers[p.tier]) tiers[p.tier] = [];
        tiers[p.tier].push(p);
      }
      return { type: "value" as const, tiers };
    }
  }, [filtered, view]);

  function Card({ player }: { player: PlayerWithValue }) {
    return (
      <button
        onClick={() => onToggleDrafted(player.id)}
        className={cn(
          "flex flex-col gap-1 p-3 rounded-lg border border-border text-left transition-all w-full",
          "hover:shadow-md hover:border-primary/50",
          player.drafted && "opacity-50 line-through bg-muted",
          "border-l-4",
          TIER_COLORS[Math.min(player.tier - 1, TIER_COLORS.length - 1)],
        )}
      >
        <div className="flex items-center justify-between">
          <span className="font-medium text-sm truncate">{player.name}</span>
          <span className={cn("text-xs font-mono tabular-nums font-semibold", positionColor(player.position))}>
            {formatCurrency(player.auctionValue)}
          </span>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className={cn("font-medium", positionColor(player.position))}>
            {player.position}
          </span>
          <span>#{player.positionRank}</span>
          <span>Tier {player.tier}</span>
        </div>
      </button>
    );
  }

  if (players.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <p>Run the calculator first to see the draft board.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[160px] max-w-xs">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search players..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        <div className="flex rounded-lg border border-border overflow-hidden">
          <button
            onClick={() => setView("position")}
            className={cn(
              "px-3 py-2 text-sm flex items-center gap-1.5 transition-colors",
              view === "position"
                ? "bg-primary text-primary-foreground"
                : "bg-background hover:bg-secondary",
            )}
          >
            <LayoutGrid size={14} />
            By Position
          </button>
          <button
            onClick={() => setView("value")}
            className={cn(
              "px-3 py-2 text-sm flex items-center gap-1.5 transition-colors",
              view === "value"
                ? "bg-primary text-primary-foreground"
                : "bg-background hover:bg-secondary",
            )}
          >
            <LayoutList size={14} />
            By Value
          </button>
        </div>

        <button
          onClick={() => setHideDrafted(!hideDrafted)}
          className={cn(
            "flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm transition-colors",
            hideDrafted ? "bg-primary/10 text-primary" : "bg-secondary text-secondary-foreground",
          )}
        >
          {hideDrafted ? <EyeOff size={14} /> : <Eye size={14} />}
          {hideDrafted ? "Hidden" : "All"}
        </button>
      </div>

      {/* Board */}
      {grouped.type === "position" ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Object.entries(grouped.groups).map(([pos, posPlayers]) => (
            <div key={pos}>
              <h3 className={cn("text-sm font-semibold mb-2 uppercase tracking-wider", positionColor(pos))}>
                {pos} ({posPlayers.length})
              </h3>
              <div className="space-y-2">
                {posPlayers.map((p) => (
                  <Card key={p.id} player={p} />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped.tiers)
            .sort(([a], [b]) => parseInt(a) - parseInt(b))
            .map(([tier, tierPlayers]) => (
              <div key={tier}>
                <h3 className="text-sm font-semibold mb-2 text-muted-foreground uppercase tracking-wider">
                  Tier {tier} ({tierPlayers.length})
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
                  {tierPlayers.map((p) => (
                    <Card key={p.id} player={p} />
                  ))}
                </div>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
