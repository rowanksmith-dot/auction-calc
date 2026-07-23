/**
 * Sleeper-AuctionCalc Player Matching
 *
 * Links Sleeper purchase data to AuctionCalc/FantasyCalc player values.
 *
 * Sleeper uses numeric player IDs (as strings) while FantasyCalc uses
 * a different numeric ID system. We match by name and position rather
 * than by ID.
 */

import type { SleeperPurchase } from "./normalize";
import type { FantasyCalcApiPlayer, FantasyCalcValueRecord } from "@/lib/fantasycalc/adapter";

// ---- Matching Helpers ----

/**
 * Normalize a player name for fuzzy matching.
 * Removes Jr., Sr., III, IV, dots, hyphens, and extra whitespace.
 */
function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[.'\-]/g, "")
    .replace(/\s+(jr|sr|iii|iv|ii)$/, "")
    .replace(/\s+/, " ")
    .trim();
}

/**
 * Build a lookup key: normalized_name|position
 */
function lookupKey(name: string, position: string): string {
  return `${normalizeName(name)}|${position.toUpperCase()}`;
}

/**
 * Try to match a Sleeper player to a FantasyCalc player by name + position.
 *
 * Returns the FC player's ID if found, or undefined.
 */
function findFcPlayerId(
  sleeperName: string,
  sleeperPosition: string,
  fcPlayers: FantasyCalcApiPlayer[],
): number | undefined {
  const sleeperKey = lookupKey(sleeperName, sleeperPosition);

  for (const fc of fcPlayers) {
    const fcKey = lookupKey(fc.name, fc.position);
    if (fcKey === sleeperKey) {
      return fc.id;
    }
  }

  return undefined;
}

// ---- Exported Types ----

/** A Sleeper purchase with its matched AuctionCalc value (if found). */
export interface MatchedPurchase extends SleeperPurchase {
  /** The FC player ID this purchase matched to, if any */
  matchedFcPlayerId: number | undefined;
  /** The FC projected auction value, if matched */
  matchedFcValue: number | undefined;
  /** How far off the actual price was from FC's projection (actual - projected) */
  priceDelta: number | undefined;
  /** Percentage difference from FC projection */
  priceDeltaPercent: number | undefined;
}

/** Matching summary */
export interface MatchingResult {
  /** All purchases with matching info */
  purchases: MatchedPurchase[];
  /** Count of players that matched FC data */
  matchedCount: number;
  /** Count of players that didn't match FC data */
  unmatchedCount: number;
  /** Unmatched purchases for manual review */
  unmatched: SleeperPurchase[];
}

// ---- Main Matching Function ----

/**
 * Match Sleeper purchases against FantasyCalc player data.
 *
 * Uses name + position matching since the two platforms use
 * different player ID systems.
 */
export function matchPurchases(
  purchases: SleeperPurchase[],
  fcPlayers: FantasyCalcApiPlayer[],
  fcValues: FantasyCalcValueRecord[],
): MatchingResult {
  // Build FC value lookup by player ID
  const valueMap = new Map<number, number>();
  for (const v of fcValues) {
    valueMap.set(v.playerId, v.value);
  }

  const matched: MatchedPurchase[] = [];
  const unmatched: SleeperPurchase[] = [];

  for (const purchase of purchases) {
    const fcPlayerId = findFcPlayerId(
      purchase.fullName,
      purchase.position,
      fcPlayers,
    );

    if (fcPlayerId !== undefined) {
      const fcValue = valueMap.get(fcPlayerId);
      const priceDelta = fcValue !== undefined
        ? purchase.auctionPrice - fcValue
        : undefined;
      const priceDeltaPercent = fcValue !== undefined && fcValue > 0
        ? Math.round(((purchase.auctionPrice - fcValue) / fcValue) * 100)
        : undefined;

      matched.push({
        ...purchase,
        matchedFcPlayerId: fcPlayerId,
        matchedFcValue: fcValue,
        priceDelta,
        priceDeltaPercent,
      });
    } else {
      unmatched.push(purchase);
    }
  }

  return {
    purchases: matched,
    matchedCount: matched.length,
    unmatchedCount: unmatched.length,
    unmatched,
  };
}
