"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Calculator,
  Table2,
  LayoutGrid,
  Users,
  RefreshCw,
  Info,
  Shield,
  FileText,
  ExternalLink,
  AlertTriangle,
  Clock,
} from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";
import type { LeagueSettings, PlayerWithValue } from "@/lib/types";
import { DEFAULT_SETTINGS } from "@/lib/types";
import { calculateAuctionValues } from "@/lib/auction-model/calculator";
import { getFantasyCalcData, mergePlayersWithValues } from "@/lib/fantasycalc/adapter";
import { ThemeToggle } from "@/components/ThemeToggle";
import { SettingsPanel } from "@/components/SettingsPanel";
import { PlayerTable } from "@/components/PlayerTable";
import { DraftBoard } from "@/components/DraftBoard";
import { DraftRoom } from "@/components/DraftRoom";

type ViewMode = "list" | "board" | "draft";

export default function Home() {
  const [settings, setSettings] = useState<LeagueSettings>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem("auction-calc-settings");
        if (saved) return JSON.parse(saved) as LeagueSettings;
      } catch {}
    }
    return DEFAULT_SETTINGS;
  });

  const [allPlayers, setAllPlayers] = useState<PlayerWithValue[]>([]);
  const [loading, setLoading] = useState(true);
  const [calculating, setCalculating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [favorites, setFavorites] = useState<Set<number>>(new Set());
  const [showMethodology, setShowMethodology] = useState(false);

  // Raw data store (before auction calculation)
  const [rawPlayerData, setRawPlayerData] = useState<
    Array<{
      id: number;
      name: string;
      team: string;
      position: "QB" | "RB" | "WR" | "TE";
      age: number;
      sourceValue: number;
      trend30: number | null;
    }>
  >([]);

  // Save settings
  useEffect(() => {
    localStorage.setItem("auction-calc-settings", JSON.stringify(settings));
  }, [settings]);

  // Load data on mount
  useEffect(() => {
    loadFantasyCalcData();
  }, []);

  async function loadFantasyCalcData() {
    setLoading(true);
    setError(null);
    try {
      const data = await getFantasyCalcData();
      const merged = mergePlayersWithValues(data.players, data.values);
      setRawPlayerData(merged);
      setLastRefresh(data.timestamp);
      // Auto-calculate
      const result = calculateAuctionValues({
        players: merged,
        settings,
      });
      setAllPlayers(result.players);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Failed to load player data",
      );
    } finally {
      setLoading(false);
    }
  }

  const doCalculate = useCallback(() => {
    if (rawPlayerData.length === 0) {
      loadFantasyCalcData();
      return;
    }
    setCalculating(true);
    // Small delay so the UI updates
    setTimeout(() => {
      try {
        const result = calculateAuctionValues({
          players: rawPlayerData,
          settings,
        });
        setAllPlayers(result.players);
      } catch (e) {
        setError(
          e instanceof Error ? e.message : "Calculation failed",
        );
      } finally {
        setCalculating(false);
      }
    }, 100);
  }, [rawPlayerData, settings]);

  // Auto-calculate when settings change
  useEffect(() => {
    if (rawPlayerData.length > 0) {
      doCalculate();
    }
  }, [settings.exponent]); // Only auto-calc on exponent change to avoid thrash

  function toggleFavorite(playerId: number) {
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(playerId)) next.delete(playerId);
      else next.add(playerId);
      return next;
    });
  }

  function handleToggleDrafted(playerId: number) {
    setAllPlayers((prev) =>
      prev.map((p) =>
        p.id === playerId
          ? { ...p, drafted: !p.drafted }
          : p,
      ),
    );
  }

  function handleUpdatePlayers(updated: PlayerWithValue[]) {
    setAllPlayers(updated);
  }

  // Build share URL
  function buildShareUrl(): string {
    const params = new URLSearchParams();
    params.set("teams", String(settings.numTeams));
    params.set("scoring", settings.scoring);
    params.set("qb", settings.qbFormat);
    params.set("format", settings.format);
    params.set("budget", String(settings.budget));
    params.set("min", String(settings.minBid));
    params.set("tep", settings.tePremium);
    params.set("exp", String(settings.exponent));

    const rosterStr = settings.rosterSlots
      .map((s) => `${s.type}:${s.count}`)
      .join(",");
    params.set("roster", rosterStr);

    return `${window.location.origin}?${params.toString()}`;
  }

  function copyShareUrl() {
    const url = buildShareUrl();
    navigator.clipboard.writeText(url);
    alert("Share URL copied to clipboard!");
  }

  // Load settings from URL params on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.size > 0) {
      try {
        const updates: Partial<LeagueSettings> = {};
        if (params.has("teams"))
          updates.numTeams = parseInt(params.get("teams")!);
        if (params.has("scoring"))
          updates.scoring = params.get("scoring") as LeagueSettings["scoring"];
        if (params.has("qb"))
          updates.qbFormat = params.get("qb") as LeagueSettings["qbFormat"];
        if (params.has("budget"))
          updates.budget = parseInt(params.get("budget")!);
        if (params.has("min"))
          updates.minBid = parseInt(params.get("min")!);
        if (params.has("exp"))
          updates.exponent = parseFloat(params.get("exp")!);
        if (params.has("roster")) {
          const slots = params.get("roster")!.split(",").map((s) => {
            const [type, count] = s.split(":");
            return { type: type as any, count: parseInt(count) };
          });
          if (slots.length > 0) updates.rosterSlots = slots;
        }
        setSettings((prev) => ({ ...prev, ...updates }));
      } catch {}
    }
  }, []);

  const totalValue = allPlayers.reduce(
    (sum, p) => sum + p.auctionValue,
    0,
  );

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-sm border-b border-border">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center gap-3">
          <h1 className="text-lg font-bold">AuctionCalc</h1>
          <span className="text-xs text-muted-foreground hidden sm:inline">
            Fantasy Football Auction Values
          </span>

          <div className="flex-1" />

          <ThemeToggle />

          <a
            href="/how-it-works"
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <Info size={14} />
            <span className="hidden sm:inline">How It Works</span>
          </a>

          <a
            href="/privacy"
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <Shield size={14} />
            <span className="hidden sm:inline">Privacy</span>
          </a>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {/* Attribution banner */}
        <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg px-4 py-3 text-xs text-blue-700 dark:text-blue-300">
          <p>
            <strong>Data powered by FantasyCalc</strong> — Player values
            sourced from computer-generated fantasy football trade data.{" "}
            <a
              href="https://fantasycalc.com"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:no-underline"
            >
              fantasycalc.com
            </a>
            . AuctionCalc is independently created and not affiliated with or
            endorsed by FantasyCalc.
          </p>
          {lastRefresh && (
            <p className="mt-1 flex items-center gap-1">
              <Clock size={12} />
              Data refreshed: {new Date(lastRefresh).toLocaleTimeString()}
            </p>
          )}
        </div>

        {/* Error banner */}
        {error && (
          <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg px-4 py-3 text-sm text-red-700 dark:text-red-300 flex items-center gap-2">
            <AlertTriangle size={16} />
            {error}
            <button
              onClick={loadFantasyCalcData}
              className="ml-auto underline hover:no-underline"
            >
              Retry
            </button>
          </div>
        )}

        {/* Settings */}
        <SettingsPanel settings={settings} onChange={setSettings} />

        {/* Action bar */}
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={doCalculate}
            disabled={loading || calculating}
            className={cn(
              "flex items-center gap-2 px-5 py-2.5 rounded-xl font-medium transition-all",
              "bg-primary text-primary-foreground hover:bg-primary/90",
              "disabled:opacity-50 disabled:cursor-not-allowed",
            )}
          >
            {loading || calculating ? (
              <RefreshCw size={18} className="animate-spin" />
            ) : (
              <Calculator size={18} />
            )}
            {loading
              ? "Loading..."
              : calculating
                ? "Calculating..."
                : "Calculate Values"}
          </button>

          {/* View switcher */}
          <div className="flex rounded-xl border border-border overflow-hidden">
            <button
              onClick={() => setViewMode("list")}
              className={cn(
                "px-3 py-2 text-sm flex items-center gap-1.5 transition-colors",
                viewMode === "list"
                  ? "bg-primary text-primary-foreground"
                  : "bg-background hover:bg-secondary",
              )}
            >
              <Table2 size={16} />
              List
            </button>
            <button
              onClick={() => setViewMode("board")}
              className={cn(
                "px-3 py-2 text-sm flex items-center gap-1.5 transition-colors",
                viewMode === "board"
                  ? "bg-primary text-primary-foreground"
                  : "bg-background hover:bg-secondary",
              )}
            >
              <LayoutGrid size={16} />
              Board
            </button>
            <button
              onClick={() => setViewMode("draft")}
              className={cn(
                "px-3 py-2 text-sm flex items-center gap-1.5 transition-colors",
                viewMode === "draft"
                  ? "bg-primary text-primary-foreground"
                  : "bg-background hover:bg-secondary",
              )}
            >
              <Users size={16} />
              Draft Room
            </button>
          </div>

          <button
            onClick={copyShareUrl}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors"
          >
            <ExternalLink size={14} />
            Share Settings
          </button>

          <div className="flex-1" />

          {allPlayers.length > 0 && (
            <div className="text-xs text-muted-foreground tabular-nums">
              {allPlayers.length} players · Total:{" "}
              {formatCurrency(totalValue)} ·{" "}
              {allPlayers.filter((p) => p.auctionValue > 0).length} drafted
            </div>
          )}
        </div>

        {/* Loading state */}
        {loading && (
          <div className="flex items-center justify-center py-20">
            <div className="text-center">
              <RefreshCw
                size={32}
                className="animate-spin mx-auto mb-3 text-primary"
              />
              <p className="text-muted-foreground">
                Loading player data from FantasyCalc...
              </p>
            </div>
          </div>
        )}

        {/* Results */}
        {!loading && viewMode === "list" && (
          <div className="bg-card border border-border rounded-xl p-4">
            <PlayerTable
              players={allPlayers}
              onToggleDrafted={handleToggleDrafted}
              onToggleFavorite={toggleFavorite}
              favorites={favorites}
            />
          </div>
        )}

        {!loading && viewMode === "board" && (
          <div className="bg-card border border-border rounded-xl p-4">
            <DraftBoard
              players={allPlayers}
              onToggleDrafted={handleToggleDrafted}
            />
          </div>
        )}

        {!loading && viewMode === "draft" && (
          <DraftRoom
            players={allPlayers}
            settings={settings}
            onUpdatePlayers={handleUpdatePlayers}
          />
        )}

        {/* Methodology modal */}
        {showMethodology && (
          <div
            className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center pt-20 px-4"
            onClick={() => setShowMethodology(false)}
          >
            <div
              className="bg-card rounded-xl border border-border p-6 max-w-lg w-full max-h-[70vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 className="text-lg font-semibold mb-4">
                How Values Are Calculated
              </h2>
              <div className="space-y-3 text-sm text-muted-foreground">
                <p>
                  <strong>1. Total League Budget</strong> — Number of teams ×
                  budget per team.
                </p>
                <p>
                  <strong>2. Reserve Minimum Bids</strong> — Every drafted
                  player gets at least the minimum bid. This reserved amount is
                  subtracted from the total budget.
                </p>
                <p>
                  <strong>3. Build Player Pool</strong> — Based on roster
                  settings, the system selects which players will be drafted
                  using a maximum-value slot assignment.
                </p>
                <p>
                  <strong>4. Replacement Level</strong> — For each position, the
                  value of the worst starter defines &ldquo;replacement
                  level.&rdquo;
                </p>
                <p>
                  <strong>5. Surplus Value</strong> — Each player&apos;s
                  FantasyCalc value minus the replacement value at their
                  position. Only positive surplus counts.
                </p>
                <p>
                  <strong>6. Weighted Allocation</strong> — Surplus is raised to
                  an exponent (default 1.10) to create weights. Higher exponent
                  = more money to elite players.
                </p>
                <p>
                  <strong>7. Rounding</strong> — The largest-remainder method
                  ensures every dollar is allocated exactly and the total equals
                  the league budget.
                </p>
                <div className="bg-muted rounded-lg p-3 mt-2">
                  <p className="font-medium text-foreground mb-1">
                    ⚠️ Important
                  </p>
                  <p>
                    These are <strong>modeled fair values</strong> based on
                    FantasyCalc trade market data. Actual auction prices vary
                    based on your league&apos;s specific dynamics, draft
                    strategy, and player preferences. This is an entertainment
                    and informational tool.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowMethodology(false)}
                className="mt-4 w-full py-2 rounded-lg bg-primary text-primary-foreground font-medium"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-border mt-12 py-6">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <p className="text-xs text-muted-foreground">
              AuctionCalc — Fantasy Football Auction Value Calculator
            </p>
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <button
                onClick={() => setShowMethodology(true)}
                className="hover:text-foreground transition-colors"
              >
                How Values Are Calculated
              </button>
              <a
                href="/privacy"
                className="hover:text-foreground transition-colors"
              >
                Privacy
              </a>
              <a
                href="https://fantasycalc.com"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-foreground transition-colors"
              >
                Data: FantasyCalc
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
