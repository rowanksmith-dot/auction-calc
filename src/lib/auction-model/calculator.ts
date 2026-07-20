/**
 * Auction Value Calculator
 *
 * Converts FantasyCalc market values into auction-dollar values using
 * a replacement-based model with proportional allocation.
 *
 * Methodology:
 * 1. Calculate total league budget
 * 2. Reserve minimum bids for all drafted players
 * 3. Assign players to roster slots using maximum-value allocation
 * 4. Calculate replacement value per position
 * 5. Distribute discretionary budget proportional to surplus^exponent
 * 6. Round using largest-remainder method for exact budget match
 */

import type { LeagueSettings, PlayerWithValue, RosterSlotType } from "../types";

interface ScoredPlayer {
  id: number;
  name: string;
  team: string;
  position: "QB" | "RB" | "WR" | "TE";
  age: number;
  sourceValue: number;
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

const FLEX_POSITIONS_LIST = ["RB", "WR", "TE"] as const;
const VALID_SUPERFLEX_POSITIONS: Array<"QB" | "RB" | "WR" | "TE"> = [
  "QB",
  "RB",
  "WR",
  "TE",
];

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

/**
 * Main calculation function.
 */
export function calculateAuctionValues(input: CalculatorInput): CalculatorResult {
  const { players, settings } = input;
  const { numTeams, budget, minBid } = settings;

  // 1. Total league budget
  const totalLeagueBudget = numTeams * budget;

  // 2. Total roster slots
  const rosterSize = settings.rosterSlots.reduce(
    (sum, slot) => sum + slot.count,
    0,
  );
  const draftedPlayerCount = numTeams * rosterSize;

  // 3. Reserved minimum budget
  const reservedMinimumBudget = draftedPlayerCount * minBid;

  // 4. Discretionary budget
  const discretionaryBudget = totalLeagueBudget - reservedMinimumBudget;

  // 5. Determine TE premium bonus factor (applied to surplus weight)
  // This is a transparent local adjustment, not a FantasyCalc value
  let tePremiumMultiplier = 1;
  if (settings.tePremium === "half") tePremiumMultiplier = 1.5;
  else if (settings.tePremium === "full") tePremiumMultiplier = 2.0;
  else if (settings.tePremium === "custom")
    tePremiumMultiplier = 1 + settings.tePremiumCustom;

  // 6. Sort players by source value (descending)
  const sorted = [...players].sort((a, b) => b.sourceValue - a.sourceValue);

  // 7. Assign players to roster slots (max-value method)
  const drafted = assignPlayersToRosterSlots(sorted, settings);

  // 8. Calculate replacement value per position
  const replacementValues = calculateReplacementValues(drafted, settings);

  // 9. Calculate surplus and weights (with TE premium multiplier on weight)
  const scored: ScoredPlayer[] = drafted.map((p) => {
    const repl = replacementValues[p.position] ?? 0;
    const surplus = Math.max(p.sourceValue - repl, 0);
    const baseWeight = Math.pow(surplus, settings.exponent);
    const weight =
      p.position === "TE"
        ? baseWeight * tePremiumMultiplier
        : baseWeight;
    return {
      ...p,
      auctionValue: 0,
      positionRank: 0,
      overallRank: 0,
      tier: 0,
      drafted: false,
      winningBid: null,
      draftedBy: null,
      surplus,
      weight,
      rawValue: 0,
    };
  });

  const totalWeight = scored.reduce((sum, p) => sum + p.weight, 0);

  // 10. Handle edge case: all surpluses zero
  if (totalWeight === 0) {
    // Fallback: distribute equally (proportional to source value)
    const totalSourceValue = sorted.reduce(
      (sum, p) => sum + Math.max(p.sourceValue, 0.01),
      0,
    );
    const distributed: ScoredPlayer[] = sorted.map((p) => {
      const base = Math.max(p.sourceValue, 0.01);
      const rawValue =
        minBid +
        discretionaryBudget * (base / totalSourceValue);
      return {
        ...p,
        auctionValue: 0,
        positionRank: 0,
        overallRank: 0,
        tier: 0,
        drafted: false,
        winningBid: null,
        draftedBy: null,
        surplus: 0,
        weight: base,
        rawValue,
      };
    });
    return finalizeResults(distributed, {
      totalLeagueBudget,
      reservedMinimumBudget,
      discretionaryBudget,
      replacementValues,
      playerPoolSize: drafted.length,
    });
  }

  // 11. Distribute budget
  const distributed: ScoredPlayer[] = scored.map((p) => ({
    ...p,
    rawValue: minBid + discretionaryBudget * (p.weight / totalWeight),
  }));

  return finalizeResults(distributed, {
    totalLeagueBudget,
    reservedMinimumBudget,
    discretionaryBudget,
    replacementValues,
    playerPoolSize: drafted.length,
  });
}

// ---- Internal helpers ----

function finalizeResults(
  scored: ScoredPlayer[],
  metadata: CalculatorResult["metadata"],
): CalculatorResult {
  // Round using largest-remainder method
  // Compute actual raw total (may differ from budget due to incomplete pool)
  const rawTotal = scored.reduce((sum, p) => sum + p.rawValue, 0);
  const rounded = roundWithLargestRemainder(scored, Math.round(rawTotal));

  // Sort by auction value descending
  const sorted = rounded.sort((a, b) => b.auctionValue - a.auctionValue);

  // Assign ranks and tiers
  const ranked = assignRanksAndTiers(sorted);

  const totalSpent = ranked.reduce((sum, p) => sum + p.auctionValue, 0);
  const totalDrafted = ranked.length;

  return {
    players: ranked,
    totalBudget: metadata.totalLeagueBudget,
    totalSpent,
    draftedCount: totalDrafted,
    rosterCount: metadata.playerPoolSize,
    timestamp: new Date().toISOString(),
    metadata,
  };
}

function roundWithLargestRemainder(
  players: ScoredPlayer[],
  budgetTarget?: number,
): ScoredPlayer[] {
  // First pass: floor everyone
  let floorSum = 0;
  const floored = players.map((p) => {
    const floor = Math.floor(p.rawValue);
    floorSum += floor;
    return { ...p, auctionValue: floor, remainder: p.rawValue - floor };
  });

  // Use the exact budget target (totalLeagueBudget) to avoid float rounding errors
  const targetTotal = budgetTarget ?? players.reduce(
    (sum, p) => sum + Math.round(p.rawValue),
    0,
  );
  // Cap target at sum of floors + count (can't distribute more than 1 per player)
  const adjustedTarget = Math.min(targetTotal, floorSum + players.length);
  let remaining = adjustedTarget - floorSum;

  // Sort by remainder descending
  const sortedByRemainder = [...floored].sort(
    (a, b) => b.remainder - a.remainder,
  );

  // Distribute remaining dollars
  for (let i = 0; i < remaining && i < sortedByRemainder.length; i++) {
    sortedByRemainder[i].auctionValue += 1;
  }

  // Rebuild by original order
  const resultMap = new Map(sortedByRemainder.map((p) => [p.id, p]));
  return players.map((p) => resultMap.get(p.id)!).map(({ remainder: _, ...rest }) => rest);
}

function assignRanksAndTiers(
  players: ScoredPlayer[],
): PlayerWithValue[] {
  // Position ranks
  const posGroups: Record<string, ScoredPlayer[]> = {};
  for (const p of players) {
    if (!posGroups[p.position]) posGroups[p.position] = [];
    posGroups[p.position].push(p);
  }

  for (const [, group] of Object.entries(posGroups)) {
    group.sort((a, b) => b.auctionValue - a.auctionValue);
    group.forEach((p, i) => {
      p.positionRank = i + 1;
    });
  }

  // Overall ranks
  players.forEach((p, i) => {
    p.overallRank = i + 1;
  });

  // Tiers: group by natural breaks in auction value
  const tiered = assignTiers(players);

  return tiered;
}

function assignTiers(players: ScoredPlayer[]): PlayerWithValue[] {
  if (players.length === 0) return [];

  const maxVal = players[0].auctionValue;
  const minVal = players[players.length - 1].auctionValue;
  const range = maxVal - minVal || 1;

  // 8 tiers based on value thresholds
  players.forEach((p, i) => {
    const pct = (maxVal - p.auctionValue) / range;
    if (pct < 0.1) p.tier = 1;
    else if (pct < 0.25) p.tier = 2;
    else if (pct < 0.4) p.tier = 3;
    else if (pct < 0.55) p.tier = 4;
    else if (pct < 0.7) p.tier = 5;
    else if (pct < 0.82) p.tier = 6;
    else if (pct < 0.92) p.tier = 7;
    else p.tier = 8;
  });

  return players;
}

// ---- Slot Assignment ----

interface SlotAssignment {
  type: RosterSlotType;
  count: number;
}

/**
 * Assigns players to roster slots using a maximum-value method.
 * Ensures no player is assigned to multiple slots.
 */
function assignPlayersToRosterSlots(
  sortedPlayers: Array<{
    id: number;
    name: string;
    team: string;
    position: "QB" | "RB" | "WR" | "TE";
    age: number;
    sourceValue: number;
    trend30: number | null;
  }>,
  settings: LeagueSettings,
): Array<{
  id: number;
  name: string;
  team: string;
  position: "QB" | "RB" | "WR" | "TE";
  age: number;
  sourceValue: number;
  trend30: number | null;
}> {
  const { numTeams } = settings;
  const rosterSize = settings.rosterSlots.reduce(
    (sum, s) => sum + s.count,
    0,
  );
  const totalSlots = numTeams * rosterSize;

  // Count how many of each position we need across the whole league
  const positionSlots: Record<string, number> = {};
  for (const slot of settings.rosterSlots) {
    if (slot.type === "QB") positionSlots.QB = (positionSlots.QB ?? 0) + slot.count * numTeams;
    else if (slot.type === "RB") positionSlots.RB = (positionSlots.RB ?? 0) + slot.count * numTeams;
    else if (slot.type === "WR") positionSlots.WR = (positionSlots.WR ?? 0) + slot.count * numTeams;
    else if (slot.type === "TE") positionSlots.TE = (positionSlots.TE ?? 0) + slot.count * numTeams;
    else if (slot.type === "FLEX") {
      // FLEX can be RB/WR/TE - assign to highest value group
      // We'll handle this dynamically
    }
    else if (slot.type === "SUPERFLEX") {
      // Superflex can be QB/RB/WR/TE
    }
  }

  const flexCount = settings.rosterSlots
    .filter((s) => s.type === "FLEX")
    .reduce((s, r) => s + r.count, 0) * numTeams;

  const superflexCount = settings.rosterSlots
    .filter((s) => s.type === "SUPERFLEX")
    .reduce((s, r) => s + r.count, 0) * numTeams;

  // Assign mandatory starters first, then flex/superflex, then bench
  const result: Array<{
    id: number;
    name: string;
    team: string;
    position: "QB" | "RB" | "WR" | "TE";
    age: number;
    sourceValue: number;
    trend30: number | null;
  }> = [];

  const used = new Set<number>();

  // Helper to take top N from a filtered list
  function takeTopN(
    list: typeof sortedPlayers,
    n: number,
    filter: (p: typeof sortedPlayers[0]) => boolean,
  ): typeof sortedPlayers {
    const taken: typeof sortedPlayers = [];
    let found = 0;
    for (const p of list) {
      if (found >= n) break;
      if (!used.has(p.id) && filter(p)) {
        used.add(p.id);
        taken.push(p);
        result.push(p);
        found++;
      }
    }
    return taken;
  }

  // Step 1: Fill mandatory position slots
  const qbNeeded = positionSlots.QB ?? 0;
  const rbNeeded = positionSlots.RB ?? 0;
  const wrNeeded = positionSlots.WR ?? 0;
  const teNeeded = positionSlots.TE ?? 0;

  takeTopN(sortedPlayers, qbNeeded, (p) => p.position === "QB");
  takeTopN(sortedPlayers, rbNeeded, (p) => p.position === "RB");
  takeTopN(sortedPlayers, wrNeeded, (p) => p.position === "WR");
  takeTopN(sortedPlayers, teNeeded, (p) => p.position === "TE");

  // Step 2: Fill SUPERFLEX slots (QB/RB/WR/TE - highest value)
  if (settings.qbFormat === "superflex") {
    takeTopN(sortedPlayers, superflexCount, (p) =>
      VALID_SUPERFLEX_POSITIONS.includes(p.position),
    );
  }

  // Step 3: Fill FLEX slots (RB/WR/TE - highest value)
  takeTopN(sortedPlayers, flexCount, (p) =>
    (FLEX_POSITIONS_LIST as readonly string[]).includes(p.position),
  );

  // Step 4: Fill bench (highest remaining value)
  const benchCount = totalSlots - result.length;
  if (benchCount > 0) {
    takeTopN(sortedPlayers, benchCount, () => true);
  }

  return result;
}

/**
 * Calculate replacement-level value per position.
 */
function calculateReplacementValues(
  drafted: Array<{ position: string; sourceValue: number }>,
  settings: LeagueSettings,
): Record<string, number> {
  const teams = settings.numTeams;

  // Count starters per team to determine replacement depth
  const startersPerTeam: Record<string, number> = {};
  for (const slot of settings.rosterSlots) {
    if (slot.type === "QB") startersPerTeam.QB = (startersPerTeam.QB ?? 0) + slot.count;
    else if (slot.type === "RB") startersPerTeam.RB = (startersPerTeam.RB ?? 0) + slot.count;
    else if (slot.type === "WR") startersPerTeam.WR = (startersPerTeam.WR ?? 0) + slot.count;
    else if (slot.type === "TE") startersPerTeam.TE = (startersPerTeam.TE ?? 0) + slot.count;
  }

  // Replacement = value of the last starter at each position
  const repl: Record<string, number> = {};

  for (const pos of ["QB", "RB", "WR", "TE"] as const) {
    const posPlayers = drafted
      .filter((p) => p.position === pos)
      .sort((a, b) => b.sourceValue - a.sourceValue);

    const startersCount = (startersPerTeam[pos] ?? 1) * teams;
    const replIndex = Math.min(startersCount - 1, posPlayers.length - 1);

    repl[pos] = replIndex >= 0 ? posPlayers[replIndex].sourceValue : 0;
  }

  return repl;
}
