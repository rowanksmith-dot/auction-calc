import { z } from "zod";

// ---- League Settings ----

export const LeagueFormat = z.enum(["redraft", "dynasty"]);
export type LeagueFormat = z.infer<typeof LeagueFormat>;

export const ScoringType = z.enum(["standard", "halfPpr", "fullPpr"]);
export type ScoringType = z.infer<typeof ScoringType>;

export const TE_PremiumType = z.enum(["off", "half", "full", "custom"]);
export type TE_PremiumType = z.infer<typeof TE_PremiumType>;

export const QBFormat = z.enum(["oneQb", "superflex"]);
export type QBFormat = z.infer<typeof QBFormat>;

export const RosterSlotType = z.enum(["QB", "RB", "WR", "TE", "FLEX", "SUPERFLEX", "BENCH"]);
export type RosterSlotType = z.infer<typeof RosterSlotType>;

export const LeagueSettingsSchema = z.object({
  format: LeagueFormat.default("dynasty"),
  numTeams: z.number().int().min(8).max(16).default(12),
  scoring: ScoringType.default("fullPpr"),
  tePremium: TE_PremiumType.default("off"),
  tePremiumCustom: z.number().min(0).max(3).default(0),
  qbFormat: QBFormat.default("superflex"),
  budget: z.number().int().positive().default(1000),
  minBid: z.number().int().positive().default(1),
  rosterSlots: z.array(z.object({
    type: RosterSlotType,
    count: z.number().int().positive().default(1),
  })).default([
    { type: "QB", count: 1 },
    { type: "RB", count: 2 },
    { type: "WR", count: 2 },
    { type: "TE", count: 1 },
    { type: "FLEX", count: 2 },
    { type: "SUPERFLEX", count: 1 },
    { type: "BENCH", count: 10 },
  ]),
  exponent: z.number().min(0.5).max(3).default(1.0),
});

export type LeagueSettings = z.infer<typeof LeagueSettingsSchema>;

export const DEFAULT_SETTINGS: LeagueSettings = {
  format: "dynasty",
  numTeams: 12,
  scoring: "fullPpr",
  tePremium: "off",
  tePremiumCustom: 0,
  qbFormat: "superflex",
  budget: 1000,
  minBid: 1,
  rosterSlots: [
    { type: "QB", count: 1 },
    { type: "RB", count: 2 },
    { type: "WR", count: 2 },
    { type: "TE", count: 1 },
    { type: "FLEX", count: 2 },
    { type: "SUPERFLEX", count: 1 },
    { type: "BENCH", count: 10 },
  ],
  exponent: 1.0,
};

// ---- Player Data ----

export interface FantasyCalcPlayer {
  id: number;
  name: string;
  position: string;
  maybeTeam: string | null;
  maybeAge: number;
}

export interface FantasyCalcValue {
  playerId: number;
  value: number;
  oneQb?: number;
  ppr?: number;
}

export interface PlayerWithValue {
  id: number;
  name: string;
  team: string;
  position: "QB" | "RB" | "WR" | "TE";
  age: number;
  sourceValue: number;
  scaledValue: number;
  auctionValue: number;
  positionRank: number;
  overallRank: number;
  tier: number;
  drafted: boolean;
  winningBid: number | null;
  draftedBy: string | null;
  trend30: number | null;
}

// ---- Auction Model ----

export interface AuctionResult {
  players: PlayerWithValue[];
  totalBudget: number;
  totalSpent: number;
  draftedCount: number;
  rosterCount: number;
  timestamp: string;
}

// ---- Draft Room ----

export interface FantasyTeam {
  name: string;
  budget: number;
  spent: number;
  roster: string[]; // player ids
  rosterSlots: { type: RosterSlotType; filled: number }[];
}

export interface DraftAction {
  playerId: number;
  teamName: string;
  winningBid: number;
  timestamp: string;
}

export interface DraftRoomState {
  teams: FantasyTeam[];
  draftActions: DraftAction[];
  settings: LeagueSettings;
  isActive: boolean;
}
