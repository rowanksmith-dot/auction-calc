/**
 * Auction Value Calculator
 *
 * Converts FantasyCalc market values into auction-dollar values using
 * a replacement-based model with proportional allocation.
 *
 * Methodology (8-step):
 * 1. Total league budget = teams × budgetPerTeam
 * 2. Drafted player count = teams × rosterSize
 * 3. Reserved minimum budget = draftedCount × minBid
 * 4. Discretionary budget = totalBudget - reservedMinimum
 * 5. Construct legal league-wide player pool (max-value slot assignment)
 * 6. Replacement level = value of the best UNDRAFTED player at each position
 * 7. Surplus = max(playerValue - replacement[pos], 0), weight = surplus^exponent
 * 8. Round using largest-remainder method
 *
 * IMPORTANT: Replacement level uses the best undrafted player (marginal roster
 * boundary), NOT the worst starter. This gives a market-correct replacement
 * baseline and avoids concentrating all money on a handful of elite players.
 */

import type { LeagueSettings, PlayerWithValue, RosterSlotType } from "../types";

interface ScoredPlayer {
  id: number;
  name: string;
  team: string;
  position: "QB" | "RB" | "WR" | "TE";
  age: number;
  sourceValue: number;
  scaledValue: number;
  trend30: number | null;
  auctionValue: number;
  positionRank: number;
  overallRank: number;
  tier: number;
  drafted: boolean;
  winningBid: number | null;
  draftedBy: string | null;
  surplus: number;
  weight: number;
  rawValue: number;
}

const FLEX_ELIGIBLE: ReadonlyArray<"RB"|"WR"|"TE"> = ["RB", "WR", "TE"];
const SUPERFLEX_ELIGIBLE: ReadonlyArray<"QB"|"RB"|"WR"|"TE"> = ["QB", "RB", "WR", "TE"];

export interface CalculatorInput {
  players: Array<{
    id: number;
    name: string;
    team: string;
    position: "QB" | "RB" | "WR" | "TE";
    age: number;
    sourceValue: number;
    trend30: number | null;
  }>;
  settings: LeagueSettings;
}

export interface CalculatorResult {
  players: PlayerWithValue[];
  totalBudget: number;
  totalSpent: number;
  draftedCount: number;
  rosterCount: number;
  timestamp: string;
  metadata: {
    totalLeagueBudget: number;
    reservedMinimumBudget: number;
    discretionaryBudget: number;
    replacementValues: Record<string, number>;
    playerPoolSize: number;
  };
}

export function calculateAuctionValues(input: CalculatorInput): CalculatorResult {
  const { players, settings } = input;
  const { numTeams, budget, minBid } = settings;

  // ── Step 1: League totals ──
  const totalLeagueBudget = numTeams * budget;

  const rosterSize = settings.rosterSlots.reduce(
    (sum, slot) => sum + slot.count,
    0,
  );
  const draftedPlayerCount = numTeams * rosterSize;
  const reservedMinimumBudget = draftedPlayerCount * minBid;
  const discretionaryBudget = totalLeagueBudget - reservedMinimumBudget;

  // ── Step 2: Sort players by source value ──
  const sorted = [...players].sort((a, b) => b.sourceValue - a.sourceValue);

  // ── Step 3: Build the drafted player pool ──
  const poolResult = constructPlayerPool(sorted, settings);
  const { drafted, undrafted } = poolResult;

  // ── Step 4: Replacement level (best undrafted player at each position) ──
  const replacementValues = getReplacementValues(drafted, poolResult.undraftedByPosition);

  // ── Step 5: TE premium — scale source values, not post-hoc weight ──
  // Maps TEP setting to a multiplier on source value:
  //   0.0 TEP (none)  → 1.0×   (no change)
  //   0.5 TEP (half)  → 1.15×
  //   1.0 TEP (full)  → 1.30×
  //   custom          → 1.0 + (value × 0.3)
  let tepScalar = 1;
  if (settings.tePremium === "half") tepScalar = 1.15;
  else if (settings.tePremium === "full") tepScalar = 1.30;
  else if (settings.tePremium === "custom")
    tepScalar = 1 + settings.tePremiumCustom * 0.3;

  // ── Step 6: Surplus and weights ──
  const scored: ScoredPlayer[] = drafted.map((p) => {
    const scaledValue = p.position === "TE" ? p.sourceValue * tepScalar : p.sourceValue;
    const repl = replacementValues[p.position] ?? 0;
    const surplus = Math.max(scaledValue - repl, 0);
    const weight = Math.pow(surplus, settings.exponent);
    return {
      ...p,
      scaledValue: Math.round(scaledValue * 100) / 100,
      auctionValue: 0,
      positionRank: 0,
      overallRank: 0,
      tier: 0,
      drafted: true,
      winningBid: null,
      draftedBy: null,
      surplus,
      weight,
      rawValue: 0,
    };
  });

  const totalWeight = scored.reduce((sum, p) => sum + p.weight, 0);

  // ── Step 7: Fallback if all surpluses zero ──
  if (totalWeight === 0) {
    const totalSource = sorted.reduce((s, p) => {
      const sv = p.position === "TE" ? p.sourceValue * tepScalar : p.sourceValue;
      return s + Math.max(sv, 0.01);
    }, 0);
    const distributed: ScoredPlayer[] = scored.map((p) => {
      const sv = p.position === "TE" ? p.sourceValue * tepScalar : p.sourceValue;
      return {
        ...p,
        rawValue: minBid + discretionaryBudget * (Math.max(sv, 0.01) / totalSource),
      };
    });
    return finalizeResults(distributed, {
      totalLeagueBudget, reservedMinimumBudget, discretionaryBudget,
      replacementValues, playerPoolSize: drafted.length,
    }, totalLeagueBudget);
  }

  // ── Step 8: Distribute discretionary budget ──
  const distributed: ScoredPlayer[] = scored.map((p) => ({
    ...p,
    rawValue: minBid + discretionaryBudget * (p.weight / totalWeight),
  }));

  const result = finalizeResults(distributed, {
    totalLeagueBudget, reservedMinimumBudget, discretionaryBudget,
    replacementValues, playerPoolSize: drafted.length,
  }, totalLeagueBudget);

  // Compute position ranks for undrafted players (by source value)
  const undraftedPosRanks: Record<number, number> = {};
  const posGroups: Record<string, Array<{id: number; sourceValue: number}>> = {};
  for (const p of undrafted) {
    if (!posGroups[p.position]) posGroups[p.position] = [];
    posGroups[p.position].push(p);
  }
  for (const [, group] of Object.entries(posGroups)) {
    group.sort((a, b) => b.sourceValue - a.sourceValue);
    group.forEach((p, i) => { undraftedPosRanks[p.id] = i + 1; });
  }
  // Adjust drafted position ranks to account for undrafted ahead of them
  for (const dp of result.players) {
    const undraftedAhead = (posGroups[dp.position] ?? [])
      .filter(u => u.sourceValue > dp.sourceValue).length;
    dp.positionRank = dp.positionRank + undraftedAhead;
  }

  // Add undrafted players — display $1 but $0 toward budget
  const undraftedAsValues: PlayerWithValue[] = undrafted
    .filter((p) => !result.players.find((rp) => rp.id === p.id))
    .map((p, i) => ({
      ...p,
      scaledValue: p.sourceValue,
      auctionValue: 1,
      positionRank: undraftedPosRanks[p.id] ?? 0,
      overallRank: result.players.length + i + 1,
      tier: 12,
      drafted: false,
      winningBid: null,
      draftedBy: null,
    }));

  const allPlayers = [...result.players, ...undraftedAsValues];
  return {
    ...result,
    // All players start as undrafted — users mark them drafted in the Draft Room
    players: allPlayers.map(p => ({ ...p, drafted: false })),
    totalSpent: result.players.reduce((s, p) => s + p.auctionValue, 0),
  };
}

// ── Pool Construction ──

interface PoolResult {
  drafted: ScoredPlayer[];
  undrafted: Array<{ id: number; name: string; team: string; position: "QB"|"RB"|"WR"|"TE"; age: number; sourceValue: number; trend30: number | null }>;
  undraftedByPosition: Record<string, number>;
}

/**
 * Builds the highest-value legal league-wide drafted player pool.
 *
 * Uses a two-pass approach:
 * 1. Fill mandatory starter slots position-by-position
 * 2. Fill FLEX, Superflex, and bench with highest-value eligible remaining
 *
 * This is a greedy maximum-value assignment that avoids ordering artifacts.
 */
function constructPlayerPool(
  sorted: Array<{ id: number; name: string; team: string; position: "QB"|"RB"|"WR"|"TE"; age: number; sourceValue: number; trend30: number | null }>,
  settings: LeagueSettings,
): PoolResult {
  const { numTeams } = settings;
  const totalSlots = settings.rosterSlots.reduce((s, r) => s + r.count, 0) * numTeams;

  // Count position-specific slot needs
  let qbSlots = 0, rbSlots = 0, wrSlots = 0, teSlots = 0;
  let flexSlots = 0, superflexSlots = 0;
  for (const slot of settings.rosterSlots) {
    const c = slot.count * numTeams;
    switch (slot.type) {
      case "QB": qbSlots += c; break;
      case "RB": rbSlots += c; break;
      case "WR": wrSlots += c; break;
      case "TE": teSlots += c; break;
      case "FLEX": flexSlots += c; break;
      case "SUPERFLEX": superflexSlots += c; break;
      case "BENCH": /* handled by totalSlots */ break;
    }
  }

  const used = new Set<number>();
  const drafted: typeof sorted = [];

  // Helper: pick top N unassigned players matching a filter, add to drafted
  function pick(n: number, filter: (p: typeof sorted[0]) => boolean): void {
    let count = 0;
    for (const p of sorted) {
      if (count >= n) break;
      if (!used.has(p.id) && filter(p)) {
        used.add(p.id);
        drafted.push(p);
        count++;
      }
    }
  }

  // Pass 1: Mandatory position slots
  pick(qbSlots, (p) => p.position === "QB");
  pick(rbSlots, (p) => p.position === "RB");
  pick(wrSlots, (p) => p.position === "WR");
  pick(teSlots, (p) => p.position === "TE");

  // Pass 2: Superflex slots (QB/RB/WR/TE by highest value)
  pick(superflexSlots, (p) =>
    (SUPERFLEX_ELIGIBLE as readonly string[]).includes(p.position)
  );

  // Pass 3: FLEX slots (RB/WR/TE by highest value)
  pick(flexSlots, (p) =>
    (FLEX_ELIGIBLE as readonly string[]).includes(p.position)
  );

  // Pass 4: Bench (highest remaining value)
  const benchNeeded = totalSlots - drafted.length;
  if (benchNeeded > 0) {
    pick(benchNeeded, () => true);
  }

  // Undrafted players
  const undrafted = sorted.filter((p) => !used.has(p.id));

  // Undrafted by position (for replacement level)
  const undraftedByPosition: Record<string, number> = {};
  const bestUndrafted: Record<string, typeof sorted[0] | null> = { QB: null, RB: null, WR: null, TE: null };
  for (const p of undrafted) {
    if (!bestUndrafted[p.position] || p.sourceValue > bestUndrafted[p.position]!.sourceValue) {
      bestUndrafted[p.position] = p;
    }
  }
  for (const pos of ["QB", "RB", "WR", "TE"]) {
    undraftedByPosition[pos] = bestUndrafted[pos]?.sourceValue ?? 0;
  }

  // Sort drafted by sourceValue descending
  drafted.sort((a, b) => b.sourceValue - a.sourceValue);

  // Map to ScoredPlayer
  const scored: ScoredPlayer[] = drafted.map((p) => ({
    ...p,
    scaledValue: p.sourceValue,
    auctionValue: 0,
    positionRank: 0,
    overallRank: 0,
    tier: 0,
    drafted: true,
    winningBid: null,
    draftedBy: null,
    surplus: 0,
    weight: 0,
    rawValue: 0,
  }));

  return { drafted: scored, undrafted, undraftedByPosition };
}

/**
 * Replacement level: the best undrafted player at each position.
 * This is the marginal roster boundary — the value that a team could get
 * for free (or minimum bid) on the waiver wire.
 */
function getReplacementValues(
  drafted: ScoredPlayer[],
  undraftedByPosition: Record<string, number>,
): Record<string, number> {
  const repl: Record<string, number> = {};

  for (const pos of ["QB", "RB", "WR", "TE"] as const) {
    // Use the best undrafted player's value as replacement
    const bestUndrafted = undraftedByPosition[pos] ?? 0;

    // Fallback: if no undrafted exist for a position, use the worst drafted
    if (bestUndrafted === 0) {
      const posDrafted = drafted
        .filter((p) => p.position === pos)
        .sort((a, b) => b.sourceValue - a.sourceValue);
      repl[pos] = posDrafted.length > 0
        ? posDrafted[posDrafted.length - 1].sourceValue
        : 0;
    } else {
      repl[pos] = bestUndrafted;
    }
  }

  return repl;
}

// ── Finalization ──

function finalizeResults(
  scored: ScoredPlayer[],
  metadata: {
    totalLeagueBudget: number;
    reservedMinimumBudget: number;
    discretionaryBudget: number;
    replacementValues: Record<string, number>;
    playerPoolSize: number;
  },
  budgetTarget: number,
): { players: PlayerWithValue[]; totalBudget: number; totalSpent: number; draftedCount: number; rosterCount: number; timestamp: string; metadata: typeof metadata } {
  const rounded = roundWithLargestRemainder(scored, budgetTarget);
  const ranked = assignRanksAndTiers(rounded);
  const totalSpent = ranked.reduce((sum, p) => sum + p.auctionValue, 0);

  return {
    players: ranked,
    totalBudget: metadata.totalLeagueBudget,
    totalSpent,
    draftedCount: ranked.length,
    rosterCount: metadata.playerPoolSize,
    timestamp: new Date().toISOString(),
    metadata,
  };
}

function roundWithLargestRemainder(
  players: ScoredPlayer[],
  budgetTarget: number,
): ScoredPlayer[] {
  let floorSum = 0;
  const floored = players.map((p) => {
    const floor = Math.floor(p.rawValue);
    floorSum += floor;
    return { ...p, auctionValue: floor, remainder: p.rawValue - floor };
  });

  // Take the budget target (total league budget), not sum of rounded
  const maxDistributable = floorSum + players.length;
  const targetBudget = Math.min(budgetTarget, maxDistributable);
  let remaining = targetBudget - floorSum;

  if (remaining > 0) {
    const sortedByRem = [...floored].sort((a, b) => b.remainder - a.remainder);
    for (let i = 0; i < remaining && i < sortedByRem.length; i++) {
      sortedByRem[i].auctionValue += 1;
    }
  }

  const resultMap = new Map(floored.map((p) => [p.id, p]));
  return players.map((p) => {
    const r = resultMap.get(p.id)!;
    const { remainder: _, ...rest } = r;
    return rest;
  });
}

function assignRanksAndTiers(players: ScoredPlayer[]): PlayerWithValue[] {
  // Position ranks
  const posGroups: Record<string, ScoredPlayer[]> = {};
  for (const p of players) {
    if (!posGroups[p.position]) posGroups[p.position] = [];
    posGroups[p.position].push(p);
  }
  for (const [, group] of Object.entries(posGroups)) {
    group.sort((a, b) => b.auctionValue - a.auctionValue);
    group.forEach((p, i) => { p.positionRank = i + 1; });
  }

  // Overall ranks
  players.forEach((p, i) => { p.overallRank = i + 1; });

  // Tiers based on value
  return assignTiers(players);
}

function assignTiers(players: ScoredPlayer[]): PlayerWithValue[] {
  if (players.length === 0) return [];

  // Tier 1: Top 7 players by source value (the true elite tier)
  // Tier 2+ : Everyone else split into 11 equal-sized buckets
  const tier1Count = 7;
  const restTiers = 11;
  const restPlayers = players.slice(tier1Count);
  const bucketSize = Math.max(1, Math.floor(restPlayers.length / restTiers));
  const totalBuckets = Math.min(restTiers, Math.ceil(restPlayers.length / bucketSize));

  players.forEach((p, idx) => {
    if (idx < tier1Count) {
      p.tier = 1;
    } else {
      const remIdx = idx - tier1Count;
      p.tier = Math.min(Math.floor(remIdx / bucketSize) + 2, 12);
    }
  });

  return players;
}
