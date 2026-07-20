/**
 * FantasyCalc Data Adapter
 *
 * This module isolates all FantasyCalc-specific data fetching logic.
 * Swap this adapter to change data sources without rewriting the application.
 *
 * Current: Uses a local fallback dataset derived from FantasyCalc's public data.
 * Target: Connect to FantasyCalc's API if/when a public JSON endpoint is available.
 *
 * Data sourced from FantasyCalc (https://fantasycalc.com) — computer-generated
 * fantasy football trade values.
 */

import type { PlayerWithValue } from "../types";

const FANTASYCALC_BASE_URL = "https://api.fantasycalc.com";
const PLAYERS_ENDPOINT = `${FANTASYCALC_BASE_URL}/players`;

// Cache
let playersCache: FantasyCalcApiPlayer[] | null = null;
let valuesCache: FantasyCalcValueRecord[] | null = null;
let lastFetchTime = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export interface FantasyCalcApiPlayer {
  id: number;
  name: string;
  position: "QB" | "RB" | "WR" | "TE";
  maybeTeam: string | null;
  maybeAge: number;
}

export interface FantasyCalcValueRecord {
  playerId: number;
  name: string;
  position: "QB" | "RB" | "WR" | "TE";
  team: string;
  value: number;      // 1QB redraft value
  sfValue: number;    // superflex redraft value
  dynastyValue: number;
  dynastySfValue: number;
  ppr: number;        // PPR adjustment factor
  trend30: number | null;
}

interface FetchResult {
  players: FantasyCalcApiPlayer[];
  values: FantasyCalcValueRecord[];
  timestamp: string;
  fromCache: boolean;
}

/**
 * Fetches player metadata from FantasyCalc API.
 * Falls back to local dataset on failure.
 */
async function fetchPlayers(): Promise<FantasyCalcApiPlayer[]> {
  const response = await fetch(PLAYERS_ENDPOINT, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(5000),
  });

  if (!response.ok) {
    throw new Error(`FantasyCalc players endpoint returned ${response.status}`);
  }

  const data: any[] = await response.json();
  return data
    .filter((p) => ["QB", "RB", "WR", "TE"].includes(p.position))
    .map((p) => ({
      id: p.id,
      name: p.name,
      position: p.position as "QB" | "RB" | "WR" | "TE",
      maybeTeam: p.maybeTeam || null,
      maybeAge: p.maybeAge,
    }));
}

/**
 * Loads the local fallback values dataset.
 * In production, this would call FantasyCalc's values API.
 */
async function fetchValues(): Promise<FantasyCalcValueRecord[]> {
  // Try to fetch from API first (endpoint TBD)
  // const response = await fetch(`${FANTASYCALC_BASE_URL}/values`, { ... });
  // For now, use local fallback dataset

  const { default: fallbackValues } = await import(
    "@/data/fallback-values.json"
  );
  return fallbackValues as FantasyCalcValueRecord[];
}

/**
 * Main fetch function — gets both players and values with caching.
 */
export async function getFantasyCalcData(): Promise<FetchResult> {
  const now = Date.now();
  const cacheValid = now - lastFetchTime < CACHE_TTL_MS;

  if (cacheValid && playersCache && valuesCache) {
    return {
      players: playersCache,
      values: valuesCache,
      timestamp: new Date(lastFetchTime).toISOString(),
      fromCache: true,
    };
  }

  // Fetch in parallel
  const [players, values] = await Promise.all([
    fetchPlayers().catch(() => {
      // Fallback: try local players
      console.warn("Failed to fetch players from FantasyCalc API");
      return playersCache ?? [];
    }),
    fetchValues().catch(() => {
      console.warn("Failed to load values dataset");
      return valuesCache ?? [];
    }),
  ]);

  playersCache = players;
  valuesCache = values;
  lastFetchTime = now;

  return {
    players,
    values,
    timestamp: new Date().toISOString(),
    fromCache: false,
  };
}

/**
 * Merges player data with values and returns typed PlayerWithValue array.
 */
export function mergePlayersWithValues(
  players: FantasyCalcApiPlayer[],
  values: FantasyCalcValueRecord[],
): Omit<PlayerWithValue, "auctionValue" | "positionRank" | "overallRank" | "tier" | "drafted" | "winningBid" | "draftedBy">[] {
  const valueMap = new Map(values.map((v) => [v.playerId, v]));

  return players
    .map((p) => {
      const v = valueMap.get(p.id);
      return {
        id: p.id,
        name: p.name,
        team: p.maybeTeam ?? "FA",
        position: p.position,
        age: p.maybeAge,
        sourceValue: v?.value ?? 0,
        trend30: v?.trend30 ?? null,
      };
    })
    .filter((p) => p.sourceValue > 0); // only players with values
}

// Re-export for external use
export function clearDataCache(): void {
  playersCache = null;
  valuesCache = null;
  lastFetchTime = 0;
}
