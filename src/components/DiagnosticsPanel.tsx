"use client";

import { cn } from "@/lib/utils";
import type { LeagueSettings } from "@/lib/types";

interface DiagnosticsPanelProps {
  settings: LeagueSettings;
  dataSource: "api" | "fallback" | "cached";
  lastRefresh: string | null;
  rawDataCount: number;
  playerCount: number;
  totalValue: number;
  totalBudget: number;
  draftedCount: number;
  loading: boolean;
  calculating: boolean;
  error: string | null;
  onClose: () => void;
  replacementValues?: Record<string, number>;
}

export function DiagnosticsPanel({
  settings,
  dataSource,
  lastRefresh,
  rawDataCount,
  playerCount,
  totalValue,
  totalBudget,
  draftedCount,
  loading,
  calculating,
  error,
  onClose,
  replacementValues,
}: DiagnosticsPanelProps) {
  const rosterSize = settings.rosterSlots.reduce((s, r) => s + r.count, 0);
  const draftedPlayerCount = settings.numTeams * rosterSize;
  const reservedMinBudget = draftedPlayerCount * settings.minBid;
  const discretionaryBudget = totalBudget - reservedMinBudget;
  const budgetMatch = totalValue === totalBudget;
  const budgetDiff = Math.abs(totalValue - totalBudget);
  const topValuePct = ""; // calculated per team budget below

  // Position counts
  const posCounts: Record<string, number> = {};
  for (const slot of settings.rosterSlots) {
    posCounts[slot.type] = (posCounts[slot.type] ?? 0) + slot.count;
  }

  return (
    <div className="bg-yellow-50 dark:bg-yellow-950/30 border border-yellow-200 dark:border-yellow-800 rounded-xl p-4 text-xs space-y-2">
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-semibold text-yellow-800 dark:text-yellow-300 flex items-center gap-1">
          <span className="text-base">🔧</span> Developer Diagnostics
        </h3>
        <button
          onClick={onClose}
          className="text-yellow-600 dark:text-yellow-400 hover:text-yellow-800"
        >
          ✕
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-1.5">
        <span className="font-medium text-yellow-700 dark:text-yellow-400">Setting</span>
        <span className="font-medium text-yellow-700 dark:text-yellow-400">Value</span>
        <span className="font-medium text-yellow-700 dark:text-yellow-400 hidden sm:block">Setting</span>
        <span className="font-medium text-yellow-700 dark:text-yellow-400 hidden sm:block">Value</span>

        <Row label="Format" value={settings.format} />
        <Row label="Scoring" value={settings.scoring === "halfPpr" ? "Half PPR" : settings.scoring === "fullPpr" ? "Full PPR" : "Standard"} />
        <Row label="QB Format" value={settings.qbFormat === "superflex" ? "Superflex" : "1QB"} />
        <Row label="TE Premium" value={settings.tePremium === "custom" ? `${settings.tePremiumCustom}x` : settings.tePremium} />

        <Row label="Teams" value={String(settings.numTeams)} />
        <Row label="Budget/Team" value={`$${settings.budget}`} />
        <Row label="Min Bid" value={`$${settings.minBid}`} />
        <Row label="Exponent" value={String(settings.exponent)} />

        <Row label="Total League Budget" value={`$${totalBudget}`} highlight={true} />
        <Row label="Reserved Min" value={`$${reservedMinBudget}`} />
        <Row label="Discretionary" value={`$${discretionaryBudget}`} />
        <Row label="Sum of Values" value={`$${totalValue}`} highlight={true} />

        <Row label="Budget Match" value={budgetMatch ? "✓ YES" : `✗ Off by $${budgetDiff}`} highlight={!budgetMatch} />
        <Row label="Roster Size" value={String(rosterSize)} />
        <Row label="Drafted Players" value={String(draftedPlayerCount)} />
        <Row label="Actual Drafted" value={String(draftedCount)} />

        <Row label="Raw Players" value={String(rawDataCount)} />
        <Row label="Displayed" value={String(playerCount)} />
        <Row label="Data Source" value={dataSource} />
        <Row label="Data on Server" value={lastRefresh ? new Date(lastRefresh).toLocaleTimeString() : "—"} />
      </div>

      {/* Position breakdown */}
      <div className="pt-2 border-t border-yellow-200 dark:border-yellow-700">
        <span className="text-yellow-700 dark:text-yellow-400 font-medium">Roster Slots</span>
        <div className="flex flex-wrap gap-2 mt-1">
          {settings.rosterSlots.map((slot) => (
            <span key={slot.type} className="px-2 py-0.5 bg-yellow-100 dark:bg-yellow-900/30 rounded text-yellow-800 dark:text-yellow-300">
              {slot.type}: {slot.count}
            </span>
          ))}
        </div>
      </div>

      {/* Replacement values */}
      {replacementValues && (
        <div className="pt-2 border-t border-yellow-200 dark:border-yellow-700">
          <span className="text-yellow-700 dark:text-yellow-400 font-medium">Replacement Values</span>
          <div className="flex flex-wrap gap-2 mt-1">
            {Object.entries(replacementValues).map(([pos, val]) => (
              <span key={pos} className="px-2 py-0.5 bg-yellow-100 dark:bg-yellow-900/30 rounded text-yellow-800 dark:text-yellow-300">
                {pos}: {val > 0 ? val : "N/A"}
              </span>
            ))}
          </div>
        </div>
      )}

      {error && (
        <div className="mt-2 p-2 bg-red-100 dark:bg-red-950/30 rounded text-red-700 dark:text-red-300">
          Error: {error}
        </div>
      )}

      {loading && <div className="mt-1 text-yellow-600 dark:text-yellow-400">⏳ Loading data...</div>}
      {calculating && <div className="mt-1 text-yellow-600 dark:text-yellow-400">⚙️ Calculating...</div>}

      <div className="mt-2 text-yellow-600 dark:text-yellow-400 pt-1 border-t border-yellow-200 dark:border-yellow-700">
        <p>Validation: Budget per team: ${settings.budget} · Teams: {settings.numTeams} · League total: ${totalBudget}</p>
        <p className={budgetMatch ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}>
          Sum of values = ${totalValue} · {budgetMatch ? "✓ Matches total budget" : `✗ Mismatch (off by $${budgetDiff})`}
        </p>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <>
      <span className="text-yellow-800 dark:text-yellow-300">{label}</span>
      <span
        className={cn(
          "font-mono",
          highlight
            ? "text-green-700 dark:text-green-400 font-bold"
            : "text-yellow-900 dark:text-yellow-200",
        )}
      >
        {value}
      </span>
    </>
  );
}
