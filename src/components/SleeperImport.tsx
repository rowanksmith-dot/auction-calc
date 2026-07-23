"use client";

import { useState, useCallback } from "react";
import {
  Upload,
  Loader2,
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  X,
  ChevronDown,
  ChevronUp,
  TrendingUp,
  TrendingDown,
  Minus,
} from "lucide-react";
import { cn, formatCurrency, positionColor } from "@/lib/utils";

// ---- Types (mirroring Sleeper adapter types) ----

interface SleeperPurchase {
  sleeperPlayerId: string;
  fullName: string;
  position: string;
  team: string;
  auctionPrice: number;
  rosterId: number;
  pickedBy: string;
  pickNo: number;
  round: number;
  matchedFcPlayerId?: number;
  matchedFcValue?: number;
  priceDelta?: number;
  priceDeltaPercent?: number;
}

interface SleeperTeam {
  rosterId: number;
  ownerUserId: string;
  teamName: string;
  displayName: string;
  budget: number;
  spent: number;
  remaining: number;
  purchases: SleeperPurchase[];
}

interface SleeperImportResult {
  draftId: string;
  leagueName: string;
  season: string;
  status: string;
  budget: number;
  numTeams: number;
  totalPicks: number;
  players: SleeperPurchase[];
  teams: Record<number, SleeperTeam>;
  playersByRoster: Record<number, SleeperPurchase[]>;
  unmatchedByAuctionCalc: SleeperPurchase[];
}

type ImportState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; result: SleeperImportResult }
  | { status: "error"; error: string };

// ---- Helpers ----

function DeltaBadge({ delta, deltaPercent }: { delta?: number; deltaPercent?: number }) {
  if (delta === undefined) return <span className="text-xs text-gray-400">N/A</span>;

  const abs = Math.abs(delta);
  const label = deltaPercent !== undefined
    ? `${delta > 0 ? "+" : ""}$${abs} (${delta > 0 ? "+" : ""}${deltaPercent}%)`
    : `${delta > 0 ? "+" : ""}$${abs}`;

  if (delta > 0) {
    return (
      <span className="inline-flex items-center gap-0.5 text-xs font-medium text-red-500">
        <TrendingUp className="w-3 h-3" />
        {label}
      </span>
    );
  }
  if (delta < 0) {
    return (
      <span className="inline-flex items-center gap-0.5 text-xs font-medium text-green-500">
        <TrendingDown className="w-3 h-3" />
        {label}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-0.5 text-xs font-medium text-gray-400">
      <Minus className="w-3 h-3" />
      Exact
    </span>
  );
}

// ---- Team Summary Card ----

function TeamCard({
  team,
  isExpanded,
  onToggle,
}: {
  team: SleeperTeam;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          <span className="font-medium text-sm">{team.teamName}</span>
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {team.purchases.length} picks
          </span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-xs text-gray-600 dark:text-gray-300">
            ${team.spent.toLocaleString()} / ${team.budget.toLocaleString()}
            <span className={cn(
              "ml-1 font-medium",
              team.remaining > 0 ? "text-green-500" : team.remaining < 0 ? "text-red-500" : "text-gray-500"
            )}>
              (${team.remaining.toLocaleString()})
            </span>
          </span>
          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </div>
      </button>

      {isExpanded && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-t border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/30">
                <th className="px-3 py-2 text-left font-medium text-gray-500">Player</th>
                <th className="px-3 py-2 text-left font-medium text-gray-500">Pos</th>
                <th className="px-3 py-2 text-right font-medium text-gray-500">Auction $</th>
                <th className="px-3 py-2 text-right font-medium text-gray-500">FC Value</th>
                <th className="px-3 py-2 text-right font-medium text-gray-500">vs. Projected</th>
              </tr>
            </thead>
            <tbody>
              {team.purchases
                .sort((a, b) => b.auctionPrice - a.auctionPrice)
                .map((p) => (
                  <tr
                    key={p.sleeperPlayerId}
                    className="border-t border-gray-100 dark:border-gray-700/50"
                  >
                    <td className="px-3 py-1.5 font-medium">{p.fullName}</td>
                    <td className="px-3 py-1.5">
                      <span className={cn(
                        "inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium",
                        "bg-gray-100 dark:bg-gray-700",
                        p.position === "QB" && "text-blue-600 dark:text-blue-400",
                        p.position === "RB" && "text-emerald-600 dark:text-emerald-400",
                        p.position === "WR" && "text-purple-600 dark:text-purple-400",
                        p.position === "TE" && "text-orange-600 dark:text-orange-400",
                      )}>
                        {p.position}
                      </span>
                    </td>
                    <td className="px-3 py-1.5 text-right font-mono font-medium">
                      ${p.auctionPrice}
                    </td>
                    <td className="px-3 py-1.5 text-right font-mono text-gray-500">
                      {p.matchedFcValue !== undefined ? `$${p.matchedFcValue}` : "—"}
                    </td>
                    <td className="px-3 py-1.5 text-right">
                      <DeltaBadge delta={p.priceDelta} deltaPercent={p.priceDeltaPercent} />
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ---- Main Component ----

interface SleeperImportProps {
  /** Callback when import data should be applied to the auction model */
  onApplyImport?: (result: SleeperImportResult) => void;
}

export function SleeperImport({ onApplyImport }: SleeperImportProps) {
  const [draftInput, setDraftInput] = useState("");
  const [importState, setImportState] = useState<ImportState>({ status: "idle" });
  const [expandedTeam, setExpandedTeam] = useState<number | null>(null);

  const handleImport = useCallback(async () => {
    if (!draftInput.trim()) return;

    setImportState({ status: "loading" });

    try {
      const res = await fetch("/api/sleeper/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draftId: draftInput.trim() }),
      });

      const data = await res.json();

      if (!data.success) {
        setImportState({ status: "error", error: data.error });
        return;
      }

      setImportState({ status: "success", result: data.data });
      setExpandedTeam(null);
    } catch (err) {
      setImportState({
        status: "error",
        error: err instanceof Error ? err.message : "Failed to connect to server",
      });
    }
  }, [draftInput]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleImport();
  };

  const handleClear = () => {
    setDraftInput("");
    setImportState({ status: "idle" });
  };

  // ---- Render ----

  return (
    <div className="space-y-4">
      {/* Input */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={draftInput}
            onChange={(e) => setDraftInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Sleeper draft URL or numeric draft ID..."
            className="flex-1 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            disabled={importState.status === "loading"}
          />
          <button
            onClick={handleImport}
            disabled={!draftInput.trim() || importState.status === "loading"}
            className={cn(
              "inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all",
              "bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed",
              "focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900",
            )}
          >
            {importState.status === "loading" ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Loading...
              </>
            ) : (
              <>
                <Upload className="w-4 h-4" />
                Import
              </>
            )}
          </button>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Paste a Sleeper auction draft URL or numeric draft ID. Only auction drafts are supported.
        </p>
      </div>

      {/* Error state */}
      {importState.status === "error" && (
        <div className="flex items-start gap-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
          <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-red-800 dark:text-red-300">Import failed</p>
            <p className="text-xs text-red-600 dark:text-red-400 mt-0.5">{importState.error}</p>
          </div>
          <button
            onClick={handleClear}
            className="text-red-400 hover:text-red-600 flex-shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Success state */}
      {importState.status === "success" && (
        <div className="space-y-3">
          {/* Draft summary */}
          <div className="flex items-start gap-2 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
            <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-green-800 dark:text-green-300">
                  {importState.result.leagueName}
                </p>
                <span className={cn(
                  "text-[10px] px-1.5 py-0.5 rounded font-medium",
                  importState.result.status === "complete"
                    ? "bg-green-100 text-green-700 dark:bg-green-800/40 dark:text-green-400"
                    : "bg-yellow-100 text-yellow-700 dark:bg-yellow-800/40 dark:text-yellow-400",
                )}>
                  {importState.result.status}
                </span>
              </div>
              <p className="text-xs text-green-600 dark:text-green-400 mt-0.5">
                {importState.result.season} season · ${importState.result.budget.toLocaleString()} budget ·{" "}
                {importState.result.numTeams} teams ·{" "}
                {importState.result.totalPicks} picks
              </p>
            </div>
            <button
              onClick={handleClear}
              className="text-green-400 hover:text-green-600 flex-shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Apply button */}
          {onApplyImport && (
            <button
              onClick={() => onApplyImport(importState.result)}
              className="w-full py-2 px-4 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900"
            >
              Apply Auction Values to Model
            </button>
          )}

          {/* Team cards */}
          <div className="space-y-2">
            {Object.values(importState.result.teams)
              .sort((a, b) => b.spent - a.spent)
              .map((team) => (
                <TeamCard
                  key={team.rosterId}
                  team={team}
                  isExpanded={expandedTeam === team.rosterId}
                  onToggle={() =>
                    setExpandedTeam(
                      expandedTeam === team.rosterId ? null : team.rosterId,
                    )
                  }
                />
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
