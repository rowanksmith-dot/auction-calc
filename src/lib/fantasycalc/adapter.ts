/**
 * FantasyCalc Data Adapter
 *
 * Isolates all FantasyCalc-specific data fetching. Calls the Next.js API
 * proxy route so the server handles caching, retries, timeouts, ETag
 * conditional requests, and server-side merge/filter.
 *
 * Data sourced from FantasyCalc (https://fantasycalc.com) — computer-generated
 * fantasy football trade values.
 *
 * The API proxy now returns pre-merged, slimmed data (~20 KB instead of
 * ~1.4 MB).  This adapter normalises both old and new response shapes.
 */

import type { LeagueSettings } from "../types";
import fallbackValues from "@/data/fallback-values.json";

// ── Manual birthdate overrides ──
const BIRTHDAYS: Record<number, { month: number; day: number; year: number }> = {
  13555: { month: 4, day: 29, year: 2004 }, // Jam Miller (RB)
};

function computeAge(b: { month: number; day: number; year: number }): number {
  const now = new Date();
  const birth = new Date(b.year, b.month - 1, b.day);
  let age = now.getFullYear() - birth.getFullYear();
  const monthDiff = now.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birth.getDate())) {
    age--;
  }
  const thisYearBday = new Date(now.getFullYear(), birth.getMonth(), birth.getDate());
  const nextYearBday = new Date(now.getFullYear() + 1, birth.getMonth(), birth.getDate());
  const daysSince = (now.getTime() - thisYearBday.getTime()) / (1000 * 60 * 60 * 24);
  const daysInYear = (nextYearBday.getTime() - thisYearBday.getTime()) / (1000 * 60 * 60 * 24);
  const fraction = Math.max(0, Math.min(1, daysSince / daysInYear));
  return Math.round((age + fraction) * 10) / 10;
}

// ── Types ──

/** Raw FantasyCalc value record from the legacy API response. */
export interface FantasyCalcValueRecord {
  playerId: number;
  name?: string;
  position?: string;
  team?: string;
  value: number;
  overallRank?: number;
  positionRank?: number;
  trend30Day?: number | null;
  maybeTier?: number | null;
}

/** Raw player metadata from the FantasyCalc /players endpoint. */
export interface FantasyCalcApiPlayer {
  id: number;
  name: string;
  position: "QB" | "RB" | "WR" | "TE";
  maybeTeam: string | null;
  maybeAge: number;
}

/** Pre-merged slim player from the new API proxy response. */
export interface MergedPlayer {
  id: number;
  name: string;
  team: string;
  position: "QB" | "RB" | "WR" | "TE";
  age: number;
  sourceValue: number;  // aliased from 'value' in the API response
  trend30: number | null;
}

interface FetchResult {
  /** Pre-merged players (new API format). */
  mergedPlayers: MergedPlayer[];
  /** Legacy: separate players array (old API format). */
  players: FantasyCalcApiPlayer[];
  /** Legacy: separate values array (old API format). */
  values: FantasyCalcValueRecord[];
  timestamp: string;
  fromCache: boolean;
  source: "api" | "fallback";
}

// ── Cache ──

let fetchCache: {
  result: FetchResult;
  ts: number;
  key: string;
} | null = null;
const CACHE_TTL = 60_000;

// ── URL builder ──

function buildFantasyCalcParams(settings: LeagueSettings): URLSearchParams {
  const params = new URLSearchParams();
  params.set("isDynasty", settings.format === "dynasty" ? "true" : "false");
  params.set("numQbs", settings.qbFormat === "oneQb" ? "1" : "2");
  params.set("numTeams", String(settings.numTeams));
  if (settings.scoring === "standard") params.set("ppr", "0");
  else if (settings.scoring === "halfPpr") params.set("ppr", "0.5");
  else params.set("ppr", "1");
  return params;
}

// ── Main fetch ──

export async function getFantasyCalcData(
  settings: LeagueSettings,
  signal?: AbortSignal,
): Promise<FetchResult> {
  const cacheKey = JSON.stringify(buildFantasyCalcParams(settings));

  const now = Date.now();
  if (fetchCache && fetchCache.key === cacheKey && now - fetchCache.ts < CACHE_TTL) {
    return fetchCache.result;
  }

  try {
    const params = buildFantasyCalcParams(settings);
    const url = `/api/values?${params.toString()}`;
    const res = await fetch(url, { signal: signal ?? AbortSignal.timeout(10_000) });

    if (res.ok) {
      const data = await res.json();
      const result = normalizeApiResponse(data);

      if (result.mergedPlayers.length > 0) {
        const fetchResult: FetchResult = {
          mergedPlayers: result.mergedPlayers,
          players: result.legacyPlayers,
          values: result.legacyValues,
          timestamp: data._refreshedAt ?? data.metadata?.timestamp ?? new Date().toISOString(),
          fromCache: !!data._cached,
          source: "api",
        };
        fetchCache = { result: fetchResult, ts: now, key: cacheKey };
        return fetchResult;
      }
    }
  } catch (err) {
    console.warn("Failed to fetch from API proxy, using fallback:", err);
  }

  // Fallback: local dataset
  const local = loadLocalFallback();
  const fetchResult: FetchResult = {
    mergedPlayers: convertFallbackToMerged(local),
    players: local.players,
    values: local.values,
    timestamp: new Date().toISOString(),
    fromCache: false,
    source: "fallback",
  };
  fetchCache = { result: fetchResult, ts: now, key: cacheKey };
  return fetchResult;
}

/**
 * Normalize the API proxy response.
 *
 * Detects the new slimmed format (players have `value` / `trend` fields,
 * no separate `values` array) vs the legacy format (separate `players` +
 * `values` arrays).
 */
function normalizeApiResponse(data: any): {
  mergedPlayers: MergedPlayer[];
  legacyPlayers: FantasyCalcApiPlayer[];
  legacyValues: FantasyCalcValueRecord[];
} {
  const mergedPlayers: MergedPlayer[] = [];
  const legacyPlayers: FantasyCalcApiPlayer[] = [];
  const legacyValues: FantasyCalcValueRecord[] = [];

  // Detect new format: players array items have `value` / `trend` fields
  if (data.players && Array.isArray(data.players) && data.players.length > 0) {
    const first = data.players[0];
    if (typeof first.value === "number" || first.trend !== undefined) {
      // New pre-merged format
      for (const p of data.players) {
        mergedPlayers.push({
          id: p.id,
          name: p.name,
          team: p.team ?? "FA",
          position: p.position as "QB" | "RB" | "WR" | "TE",
          age: BIRTHDAYS[p.id] ? computeAge(BIRTHDAYS[p.id]) : (p.age ?? 25),
          sourceValue: p.value ?? 0,
          trend30: p.trend ?? null,
        });
      }
      return { mergedPlayers, legacyPlayers, legacyValues };
    }

    // Old format: separate players + values
    for (const p of data.players) {
      legacyPlayers.push({
        id: p.id,
        name: p.name,
        position: p.position as "QB" | "RB" | "WR" | "TE",
        maybeTeam: p.maybeTeam ?? null,
        maybeAge: BIRTHDAYS[p.id] !== undefined ? computeAge(BIRTHDAYS[p.id]) : (p.maybeAge ?? 25),
      });
    }
  }

  if (data.values && Array.isArray(data.values)) {
    for (const v of data.values) {
      legacyValues.push({
        playerId: v.playerId ?? v.player?.id ?? 0,
        name: v.name ?? v.player?.name ?? "",
        position: v.position ?? v.player?.position ?? "",
        team: v.team ?? v.player?.maybeTeam ?? "",
        value: v.value ?? 0,
        overallRank: v.overallRank ?? 0,
        positionRank: v.positionRank ?? 0,
        trend30Day: v.trend30Day ?? null,
        maybeTier: v.maybeTier ?? null,
      });
    }
  }

  return { mergedPlayers, legacyPlayers, legacyValues };
}

/**
 * Convert local fallback values into the merged format.
 */
function convertFallbackToMerged(local: {
  players: FantasyCalcApiPlayer[];
  values: FantasyCalcValueRecord[];
}): MergedPlayer[] {
  const valueMap = new Map(local.values.map((v) => [v.playerId, v]));

  return local.players
    .map((p) => {
      const v = valueMap.get(p.id);
      return {
        id: p.id,
        name: p.name,
        team: p.maybeTeam ?? "FA",
        position: p.position,
        age: BIRTHDAYS[p.id] ? computeAge(BIRTHDAYS[p.id]) : (p.maybeAge ?? 25),
        sourceValue: v?.value ?? 0,
        trend30: v?.trend30Day ?? null,
      };
    })
    .filter((p) => p.sourceValue > 0)
    .sort((a, b) => b.sourceValue - a.sourceValue);
}

/**
 * Merge FantasyCalc players + values into a unified list.
 * Used by the page for legacy support and as a helper for the fallback path.
 */
export function mergePlayersWithValues(
  players: FantasyCalcApiPlayer[],
  values: FantasyCalcValueRecord[],
): MergedPlayer[] {
  const valueMap = new Map(values.map((v) => [v.playerId, v]));

  return players
    .map((p) => {
      const v = valueMap.get(p.id);
      return {
        id: p.id,
        name: p.name,
        team: p.maybeTeam ?? "FA",
        position: p.position,
        age: BIRTHDAYS[p.id] ? computeAge(BIRTHDAYS[p.id]) : (p.maybeAge ?? 25),
        sourceValue: v?.value ?? 0,
        trend30: v?.trend30Day ?? null,
      };
    })
    .filter((p) => p.sourceValue > 0)
    .sort((a, b) => b.sourceValue - a.sourceValue);
}

/**
 * Load the local fallback dataset.
 */
export function loadLocalFallback(): {
  players: FantasyCalcApiPlayer[];
  values: FantasyCalcValueRecord[];
} {
  const fallback = fallbackValues as FantasyCalcValueRecord[];

  const players: FantasyCalcApiPlayer[] = fallback.map((v) => ({
    id: v.playerId,
    name: v.name ?? `Player ${v.playerId}`,
    position: (v.position ?? "WR") as "QB" | "RB" | "WR" | "TE",
    maybeTeam: v.team ?? "FA",
    maybeAge: 25,
  }));

  return { players, values: fallback };
}

/** Clear the local cache. */
export function clearDataCache(): void {
  fetchCache = null;
}
