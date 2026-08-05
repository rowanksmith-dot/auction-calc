import type { LeagueSettings } from "@/lib/types";

// ── Auction Action Schema (v1) ──

export type AuctionActionType =
  | "DRAFT_PLAYER"
  | "UNDO_LAST_ACTION"
  | "REMOVE_DRAFTED_PLAYER"
  | "RESET_DRAFT";

export interface DraftPlayerAction {
  id: string;
  type: "DRAFT_PLAYER";
  timestamp: number;
  playerId: number;
  teamIdx: number;
  price: number;
}

export interface UndoLastAction {
  id: string;
  type: "UNDO_LAST_ACTION";
  timestamp: number;
}

export interface RemoveDraftedPlayerAction {
  id: string;
  type: "REMOVE_DRAFTED_PLAYER";
  timestamp: number;
  targetActionId: string;
}

export interface ResetDraftAction {
  id: string;
  type: "RESET_DRAFT";
  timestamp: number;
}

export type AuctionAction =
  | DraftPlayerAction
  | UndoLastAction
  | RemoveDraftedPlayerAction
  | ResetDraftAction;

// ── Persisted State ──

export const PERSISTED_STATE_VERSION = 1;

export interface PersistedAuctionState {
  version: number;
  actions: AuctionAction[];
  activeView: "list" | "board" | "draft";
  selectedTeamIdx: number | null;
}

// ── Replay Input / Output ──

export interface ReplayInput {
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
  teams: Array<{ name: string }>;
  teamBudgets?: number[];
  actions: AuctionAction[];
}

export interface TeamState {
  name: string;
  spent: number;
  roster: Array<{
    playerId: number;
    price: number;
    actionId: string;
  }>;
  remainingBudget: number;
  maxBid: number;
}

export interface ReplayOutput {
  teams: TeamState[];
  draftedPlayerIds: Set<number>;
  playerPrices: Map<number, number>;
  playerTeams: Map<number, string>;
  totalSpent: number;
  actionCount: number;
  unresolvedActionIds: string[];
  validationWarnings: string[];
}

export interface PlayerWithDraftInfo {
  id: number;
  name: string;
  team: string;
  position: "QB" | "RB" | "WR" | "TE";
  age: number;
  sourceValue: number;
  auctionValue: number;
  trend30: number | null;
  drafted: boolean;
  winningBid: number | null;
  draftedBy: string | null;
}

// ── Sleeper Import Types ──

export interface SleeperPurchase {
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
  priceDelta?: number;
  priceDeltaPercent?: number;
}

export interface SleeperTeam {
  rosterId: number;
  ownerUserId: string;
  teamName: string;
  displayName: string;
  budget: number;
  spent: number;
  remaining: number;
  purchases: SleeperPurchase[];
}

export interface SleeperImportResult {
  draftId: string;
  leagueName: string;
  season: string;
  status: string;
  budget: number;
  numTeams: number;
  totalPicks: number;
  teams: Record<number, SleeperTeam>;
}

export interface SleeperStoreEntry {
  result: SleeperImportResult;
  loaded: boolean;
}
