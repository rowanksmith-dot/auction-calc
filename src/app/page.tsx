"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import {
  Calculator,
  Table2,
  LayoutGrid,
  Users,
  RefreshCw,
  Info,
  Shield,
  ExternalLink,
  AlertTriangle,
  Clock,
  Bug,
} from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";
import type { LeagueSettings, PlayerWithValue } from "@/lib/types";
import { DEFAULT_SETTINGS } from "@/lib/types";
import { calculateAuctionValues } from "@/lib/auction-model/calculator";
import { getFantasyCalcData, clearDataCache } from "@/lib/fantasycalc/adapter";
import { useAppStore } from "@/lib/store/store";
import { ThemeToggle } from "@/components/ThemeToggle";
import { SettingsPanel } from "@/components/SettingsPanel";
import { PlayerTable } from "@/components/PlayerTable";
import { DraftBoard } from "@/components/DraftBoard";
import { DraftRoom } from "@/components/DraftRoom";
import { DiagnosticsPanel } from "@/components/DiagnosticsPanel";

type ViewMode = "list" | "board" | "draft";

// ── Types ──

interface RawPlayer {
  id: number;
  name: string;
  team: string;
  position: "QB" | "RB" | "WR" | "TE";
  age: number;
  sourceValue: number;
  trend30: number | null;
}

interface DataState {
  raw: RawPlayer[];
  metadata: { timestamp: string; source: "api" | "fallback" };
}

// ── Merge players + values ──

function mergePlayers(
  players: Array<{ id: number; name: string; position: string; maybeTeam: string | null; maybeAge: number }>,
  values: Array<{ playerId: number; value: number; trend30Day?: number | null }>,
): RawPlayer[] {
  const valueMap = new Map(values.map((v) => [v.playerId, v]));
  return players
    .filter((p) => ["QB", "RB", "WR", "TE"].includes(p.position))
    .map((p) => {
      const v = valueMap.get(p.id);
      return {
        id: p.id,
        name: p.name,
        team: p.maybeTeam ?? "FA",
        position: p.position as "QB" | "RB" | "WR" | "TE",
        age: p.maybeAge ?? 25,
        sourceValue: v?.value ?? 0,
        trend30: v?.trend30Day ?? null,
      };
    })
    .filter((p) => p.sourceValue > 0)
    .sort((a, b) => b.sourceValue - a.sourceValue);
}

// ── URL helper ──

function parseSettingsFromUrl(): Partial<LeagueSettings> {
  if (typeof window === "undefined") return {};
  const params = new URLSearchParams(window.location.search);
  if (params.size === 0) return {};

  const updates: Partial<LeagueSettings> = {};
  if (params.has("teams")) updates.numTeams = parseInt(params.get("teams")!);
  if (params.has("scoring")) updates.scoring = params.get("scoring") as LeagueSettings["scoring"];
  if (params.has("qb")) updates.qbFormat = params.get("qb") as LeagueSettings["qbFormat"];
  if (params.has("budget")) updates.budget = parseInt(params.get("budget")!);
  if (params.has("min")) updates.minBid = parseInt(params.get("min")!);
  if (params.has("exp")) updates.exponent = parseFloat(params.get("exp")!);
  if (params.has("format")) updates.format = params.get("format") as LeagueSettings["format"];
  if (params.has("tep")) updates.tePremium = params.get("tep") as LeagueSettings["tePremium"];
  if (params.has("roster")) {
    const slots = params.get("roster")!.split(",").map((s) => {
      const [type, count] = s.split(":");
      return { type: type as any, count: parseInt(count) };
    });
    if (slots.length > 0) updates.rosterSlots = slots;
  }
  return updates;
}

// ── Main Component ──

export default function Home() {
  // ── Zustand store subscriptions (narrow selectors) ──
  const activeView = useAppStore((s) => s.activeView);
  const settings = useAppStore((s) => s.settings);
  const favorites = useAppStore((s) => s.favorites);
  const showDiagnostics = useAppStore((s) => s.showDiagnostics);
  const showMethodology = useAppStore((s) => s.showMethodology);
  const setActiveView = useAppStore((s) => s.setActiveView);
  const setSettings = useAppStore((s) => s.setSettings);
  const toggleFavorite = useAppStore((s) => s.toggleFavorite);
  const setShowDiagnostics = useAppStore((s) => s.setShowDiagnostics);
  const setShowMethodology = useAppStore((s) => s.setShowMethodology);
  const resetAllState = useAppStore((s) => s.resetAllState);

  // ── Data state (server/cache, not persisted) ──
  const [allPlayers, setAllPlayers] = useState<PlayerWithValue[]>([]);
  const [dataState, setDataState] = useState<DataState | null>(null);
  const [loading, setLoading] = useState(true);
  const [calculating, setCalculating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<string | null>(null);
  const [dataSource, setDataSource] = useState<"api" | "fallback">("fallback");

  // ── Fetch cache ──
  const fetchCacheRef = useRef<Map<string, { data: DataState; ts: number }>>(new Map());
  const abortControllerRef = useRef<AbortController | null>(null);
  const [fetchStats, setFetchStats] = useState<{
    count: number;
    lastUrl: string;
    lastSize: number;
    cacheHit: boolean;
    timestamp: string;
    reason: string;
  }>({ count: 0, lastUrl: "", lastSize: 0, cacheHit: false, timestamp: "", reason: "" });

  // ── Data fetch (triggers when API-relevant settings change) ──
  const fetchKey = useMemo(() => {
    return `${settings.format}|${settings.scoring}|${settings.qbFormat}|${settings.numTeams}`;
  }, [settings.format, settings.scoring, settings.qbFormat, settings.numTeams]);

  const prevFetchKeyRef = useRef<string | null>(null);

  useEffect(() => {
    const key = fetchKey;
    if (key === prevFetchKeyRef.current) return;
    prevFetchKeyRef.current = key;

    // Check cache first
    const cached = fetchCacheRef.current.get(key);
    if (cached && Date.now() - cached.ts < 60000) {
      setDataState(cached.data);
      setLastRefresh(cached.data.metadata.timestamp);
      setDataSource(cached.data.metadata.source);
      setLoading(false);
      setFetchStats((prev) => ({
        ...prev,
        lastUrl: `${window.location.origin}/api/values?${key}`,
        lastSize: cached.data.raw.length,
        cacheHit: true,
        timestamp: new Date().toISOString(),
        reason: "Cache hit — fetch key unchanged",
      }));
      return;
    }

    let cancelled = false;
    const doFetch = async () => {
      setLoading(true);
      setError(null);

      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      const controller = new AbortController();
      abortControllerRef.current = controller;

      try {
        const result = await getFantasyCalcData(settings, controller.signal);
        if (cancelled || controller.signal.aborted) return;
        const raw = mergePlayers(result.players, result.values);
        const data: DataState = { raw, metadata: { timestamp: result.timestamp, source: result.source } };
        fetchCacheRef.current.set(key, { data, ts: Date.now() });
        setFetchStats((prev) => ({
          count: prev.count + 1,
          lastUrl: result.source === "fallback" ? "(fallback)" : `${window.location.origin}/api/values?${key}`,
          lastSize: raw.length,
          cacheHit: false,
          timestamp: new Date().toISOString(),
          reason: `Settings changed: ${key}`,
        }));
        setDataState(data);
        setLastRefresh(result.timestamp);
        setDataSource(result.source);
      } catch (e: unknown) {
        if (!cancelled && !(e instanceof DOMException && e.name === "AbortError")) {
          setError(e instanceof Error ? e.message : "Failed to load player data");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    doFetch();
    return () => {
      cancelled = true;
      if (abortControllerRef.current) abortControllerRef.current.abort();
    };
  }, [fetchKey, settings]);

  // ── Recalculate auction values ──
  const calcKey = useMemo(() => {
    return JSON.stringify({
      settings,
      rawHash: dataState?.raw.map((p) => `${p.id}:${p.sourceValue}`).join(","),
    });
  }, [settings, dataState?.raw]);

  useEffect(() => {
    if (!dataState || dataState.raw.length === 0) return;

    setCalculating(true);
    setError(null);

    const id = requestAnimationFrame(() => {
      try {
        const result = calculateAuctionValues({ players: dataState.raw, settings });
        setAllPlayers(result.players);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Calculation failed");
      } finally {
        setCalculating(false);
      }
    });
    return () => cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calcKey]);

  // ── Handlers ──

  function handleToggleDrafted(playerId: number) {
    setAllPlayers((prev) =>
      prev.map((p) => (p.id === playerId ? { ...p, drafted: !p.drafted } : p)),
    );
  }

  function handleSaveSettings(next: LeagueSettings) {
    setSettings(next);
  }

  function handleResetDefaults() {
    resetAllState();
  }

  function handleUpdatePlayers(updated: PlayerWithValue[]) {
    setAllPlayers(updated);
  }

  async function handleRefresh() {
    clearDataCache();
    fetchCacheRef.current.delete(fetchKey);
    prevFetchKeyRef.current = null;
    setLoading(true);
    setError(null);
    try {
      const controller = new AbortController();
      abortControllerRef.current = controller;
      const result = await getFantasyCalcData(settings, controller.signal);
      if (controller.signal.aborted) return;
      const raw = mergePlayers(result.players, result.values);
      const data: DataState = { raw, metadata: { timestamp: result.timestamp, source: result.source } };
      fetchCacheRef.current.set(fetchKey, { data, ts: Date.now() });
      setDataState(data);
      setLastRefresh(result.timestamp);
      setDataSource(result.source);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to refresh data");
    } finally {
      setLoading(false);
    }
  }

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
    const rosterStr = settings.rosterSlots.map((s) => `${s.type}:${s.count}`).join(",");
    params.set("roster", rosterStr);
    return `${window.location.origin}?${params.toString()}`;
  }

  function copyShareUrl() {
    navigator.clipboard.writeText(buildShareUrl());
  }

  // ── Derived ──
  const settingsSummary = useMemo(() => {
    const scoringLabel =
      settings.scoring === "standard" ? "Standard" :
      settings.scoring === "halfPpr" ? "Half PPR" : "Full PPR";
    const qbLabel = settings.qbFormat === "superflex" ? "Superflex" : "1QB";
    const rosterCount = settings.rosterSlots.reduce((s, r) => s + r.count, 0);
    return `${settings.numTeams} teams · ${scoringLabel} · ${qbLabel} · $${settings.budget} budget · ${rosterCount} roster spots`;
  }, [settings]);

  const actualSpent = allPlayers.filter((p) => p.drafted).reduce((sum, p) => sum + p.auctionValue, 0);
  const totalBudget = settings.numTeams * settings.budget;

  // ── Render ──

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

          {/* Diagnostics toggle */}
          <button
            onClick={() => setShowDiagnostics(!showDiagnostics)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            title="Toggle diagnostics panel"
          >
            <Bug size={14} />
          </button>

          <Link
            href="/how-it-works"
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <Info size={14} />
            <span className="hidden sm:inline">How It Works</span>
          </Link>

          <Link
            href="/privacy"
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <Shield size={14} />
            <span className="hidden sm:inline">Privacy</span>
          </Link>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {/* Diagnostics Panel */}
        {showDiagnostics && (
          <DiagnosticsPanel
            settings={settings}
            dataSource={dataSource}
            lastRefresh={lastRefresh}
            rawDataCount={dataState?.raw.length ?? 0}
            playerCount={allPlayers.length}
            totalValue={actualSpent}
            totalBudget={totalBudget}
            draftedCount={allPlayers.filter((p) => p.auctionValue > 0).length}
            loading={loading}
            calculating={calculating}
            error={error}
            replacementValues={
              allPlayers.length > 0
                ? {
                    QB: allPlayers.filter((p) => p.position === "QB" && p.auctionValue === 0)[0]?.sourceValue ?? 0,
                    RB: allPlayers.filter((p) => p.position === "RB" && p.auctionValue === 0)[0]?.sourceValue ?? 0,
                    WR: allPlayers.filter((p) => p.position === "WR" && p.auctionValue === 0)[0]?.sourceValue ?? 0,
                    TE: allPlayers.filter((p) => p.position === "TE" && p.auctionValue === 0)[0]?.sourceValue ?? 0,
                  }
                : undefined
            }
            onClose={() => setShowDiagnostics(false)}
          />
        )}

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
            <p className="mt-1 flex items-center gap-1 flex-wrap">
              <span className="flex items-center gap-1">
                <Clock size={12} />
                Data refreshed: {new Date(lastRefresh).toLocaleTimeString()}
              </span>
              {dataSource === "fallback" && (
                <span className="inline-flex items-center gap-1 ml-2 text-amber-600 dark:text-amber-400">
                  · Using local fallback data (API unavailable)
                </span>
              )}
            </p>
          )}
        </div>

        {/* Error banner */}
        {error && (
          <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg px-4 py-3 text-sm text-red-700 dark:text-red-300 flex items-center gap-2">
            <AlertTriangle size={16} />
            <span>{error}</span>
            <button
              onClick={handleRefresh}
              className="ml-auto underline hover:no-underline whitespace-nowrap"
            >
              Retry
            </button>
          </div>
        )}

        {/* Settings panel */}
        <SettingsPanel settings={settings} onChange={handleSaveSettings} />

        {/* Action bar */}
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={handleRefresh}
            disabled={loading}
            className={cn(
              "flex items-center gap-2 px-5 py-2.5 rounded-xl font-medium transition-all",
              "bg-primary text-primary-foreground hover:bg-primary/90",
              "disabled:opacity-50 disabled:cursor-not-allowed",
            )}
          >
            {loading ? (
              <RefreshCw size={18} className="animate-spin" />
            ) : (
              <Calculator size={18} />
            )}
            {loading ? "Loading..." : "Refresh & Recalculate"}
          </button>

          {/* View switcher — uses Zustand store for persistence */}
          <div className="flex rounded-xl border border-border">
            <button
              onClick={() => setActiveView("list")}
              className={cn(
                "px-3 py-2 text-sm flex items-center gap-1.5 transition-all duration-150",
                activeView === "list"
                  ? "bg-primary text-primary-foreground ring-2 ring-primary scale-[1.02] z-10 shadow-sm rounded-[6px]"
                  : "bg-background text-secondary-foreground hover:bg-secondary/80",
              )}
            >
              <Table2 size={16} />
              List
            </button>
            <button
              onClick={() => setActiveView("board")}
              className={cn(
                "px-3 py-2 text-sm flex items-center gap-1.5 transition-all duration-150",
                activeView === "board"
                  ? "bg-primary text-primary-foreground ring-2 ring-primary scale-[1.02] z-10 shadow-sm rounded-[6px]"
                  : "bg-background text-secondary-foreground hover:bg-secondary/80",
              )}
            >
              <LayoutGrid size={16} />
              Board
            </button>
            <button
              onClick={() => setActiveView("draft")}
              className={cn(
                "px-3 py-2 text-sm flex items-center gap-1.5 transition-all duration-150",
                activeView === "draft"
                  ? "bg-primary text-primary-foreground ring-2 ring-primary scale-[1.02] z-10 shadow-sm rounded-[6px]"
                  : "bg-background text-secondary-foreground hover:bg-secondary/80",
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
            Copy Share URL
          </button>

          <button
            onClick={handleResetDefaults}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors"
          >
            Reset Defaults
          </button>

          <div className="flex-1" />

          {!loading && allPlayers.length > 0 && (
            <div className="text-xs text-muted-foreground tabular-nums">
              {allPlayers.length} players · Budget spent:{" "}
              {formatCurrency(actualSpent)} of {formatCurrency(totalBudget)}·
              {allPlayers.filter((p) => p.drafted).length} drafted
            </div>
          )}
        </div>

        {/* Settings summary */}
        {!loading && settingsSummary && (
          <div className="text-xs text-muted-foreground text-center sm:text-left">
            {settingsSummary}
          </div>
        )}

        {/* Loading state */}
        {loading && (
          <div className="flex items-center justify-center py-20">
            <div className="text-center">
              <RefreshCw
                size={32}
                className="animate-spin mx-auto mb-3 text-primary"
              />
              <p className="text-muted-foreground">
                Loading player data...
              </p>
            </div>
          </div>
        )}

        {/* Calculating overlay */}
        {calculating && !loading && (
          <div className="flex items-center justify-center py-8">
            <div className="text-center">
              <RefreshCw
                size={20}
                className="animate-spin mx-auto mb-2 text-primary"
              />
              <p className="text-xs text-muted-foreground">
                Recalculating values...
              </p>
            </div>
          </div>
        )}

        {/* Results — uses activeView from Zustand store */}
        {!loading && !error && activeView === "list" && allPlayers.length > 0 && (
          <div className="bg-card border border-border rounded-xl p-4">
            <PlayerTable
              players={allPlayers}
              onToggleDrafted={handleToggleDrafted}
              onToggleFavorite={toggleFavorite}
              favorites={favorites}
            />
          </div>
        )}

        {!loading && !error && activeView === "board" && allPlayers.length > 0 && (
          <div className="bg-card border border-border rounded-xl p-4">
            <DraftBoard
              players={allPlayers}
              onToggleDrafted={handleToggleDrafted}
            />
          </div>
        )}

        {!loading && !error && activeView === "draft" && allPlayers.length > 0 && (
          <DraftRoom
            players={allPlayers}
            settings={settings}
            onUpdatePlayers={handleUpdatePlayers}
          />
        )}

        {/* Empty state */}
        {!loading && !calculating && !error && allPlayers.length === 0 && (
          <div className="flex items-center justify-center py-20">
            <div className="text-center text-muted-foreground">
              <Calculator size={48} className="mx-auto mb-3 opacity-50" />
              <p>No player data loaded.</p>
              <p className="text-sm mt-1">Adjust your settings and try refreshing.</p>
            </div>
          </div>
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
                  budget per team. Default: 12 × $1,000 = $12,000.
                </p>
                <p>
                  <strong>2. Reserve Minimum Bids</strong> — Every drafted
                  player gets at least the minimum bid.
                </p>
                <p>
                  <strong>3. Build Player Pool</strong> — Based on roster
                  settings, the system selects which players will be drafted
                  using a maximum-value slot assignment.
                </p>
                <p>
                  <strong>4. Replacement Level</strong> — For each position,
                  the best undrafted player defines the marginal replacement
                  value. This accounts for the full drafted pool (starters,
                  FLEX, and bench).
                </p>
                <p>
                  <strong>5. Surplus Value</strong> — Each player's FantasyCalc
                  value minus the replacement value at their position.
                </p>
                <p>
                  <strong>6. Weighted Allocation</strong> — Surplus is raised
                  to an exponent (default 1.0 = Balanced) to create weights.
                </p>
                <p>
                  <strong>7. Rounding</strong> — Largest-remainder method
                  ensures the total equals the exact league-wide budget.
                </p>
                <div className="bg-muted rounded-lg p-3 mt-2">
                  <p className="font-medium text-foreground mb-1">
                    ⚠️ Important
                  </p>
                  <p>
                    These are <strong>modeled fair values </strong>based on FantasyCalc trade market data. Actual auction prices vary.
                    This is an entertainment and informational tool.
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
              <Link
                href="/privacy"
                className="hover:text-foreground transition-colors"
              >
                Privacy
              </Link>
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
