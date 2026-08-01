"use client";

import { useState, useCallback } from "react";
import { Upload, Loader2, AlertCircle, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ScoringType, QBFormat, RosterSlotType, TE_PremiumType } from "@/lib/types";

/** League settings data from Sleeper, used to auto-configure the draft board. */
export interface SleeperLeagueSettings {
  leagueName: string;
  season: string;
  status: string;
  numTeams: number;
  scoring: ScoringType;
  rosterSettings: Record<RosterSlotType, number>;
  budget: number;
  qbFormat: QBFormat;
  tePremium: TE_PremiumType;
  tePremiumCustom: number;
}

export type SleeperImportData = {
  draftId: string;
  leagueName: string;
  season: string;
  status: string;
  budget: number;
  numTeams: number;
  totalPicks: number;
  teams: Record<number, {
    rosterId: number;
    ownerUserId: string;
    teamName: string;
    displayName: string;
    budget: number;
    spent: number;
    remaining: number;
    purchases: Array<{
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
    }>;
  }>;
  /** League settings for auto-configuring the board. null if couldn't fetch. */
  leagueSettings: SleeperLeagueSettings | null;
  /** Player IDs already rostered in the league (not auction-picked). */
  rosteredPlayerIds: string[];
  /** The URL or draft ID entered by the user, used for reload. */
  sleeperUrl: string;
};

interface Props {
  onImport: (data: SleeperImportData) => void;
  onCancel: () => void;
}

export function SleeperImport({ onImport, onCancel }: Props) {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const doImport = useCallback(async () => {
    if (!input.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/sleeper/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draftId: input.trim() }),
      });
      const json = await res.json();
      if (!json.success) { setError(json.error || "Import failed"); return; }
      onImport({ ...json.data, sleeperUrl: input.trim() });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to connect");
    } finally {
      setLoading(false);
    }
  }, [input, onImport]);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && doImport()}
          placeholder="Sleeper draft URL or ID..."
          className="flex-1 px-3 py-1.5 text-sm border border-border rounded-lg bg-background text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          disabled={loading}
        />
        <button onClick={doImport} disabled={!input.trim() || loading}
          className={cn("inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all",
            "bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed")}>
          {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
          {loading ? "..." : "Import"}
        </button>
        <button onClick={onCancel} className="text-xs text-muted-foreground hover:text-foreground">Cancel</button>
      </div>
      {error && (
        <div className="flex items-start gap-2 p-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-xs">
          <AlertCircle className="w-3 h-3 text-red-500 mt-0.5 shrink-0" />
          <span className="text-red-700 dark:text-red-300">{error}</span>
          <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-600"><X className="w-3 h-3" /></button>
        </div>
      )}
    </div>
  );
}
