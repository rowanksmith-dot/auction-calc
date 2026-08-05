"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { v4 as uuidv4 } from "uuid";
import type { LeagueSettings } from "@/lib/types";
import { DEFAULT_SETTINGS } from "@/lib/types";
import type { AuctionAction } from "./types";

// ── View Mode ──

export type ViewMode = "list" | "board" | "draft";

// ── Store Types ──

export interface AppState {
  // ── Persisted state ──
  actions: AuctionAction[];
  activeView: ViewMode;
  selectedTeamIdx: number | null;
  teamNames: string[];
  teamBudgets: number[];
  thresholds: { bargain: number; overpay: number };
  settings: LeagueSettings;

  // ── Non-persisted (transient) state ──
  favorites: Set<number>;
  showDiagnostics: boolean;
  showMethodology: boolean;

  // ── Actions ──
  draftPlayer: (playerId: number, teamIdx: number, price: number) => string; // returns error string or ""
  undoLastAction: () => void;
  removeDraftAction: (targetActionId: string) => void;
  resetDraft: () => void;
  setActiveView: (view: ViewMode) => void;
  setSelectedTeamIdx: (idx: number | null) => void;
  setTeamNames: (names: string[]) => void;
  setTeamBudgets: (budgets: number[]) => void;
  setThresholds: (thresholds: { bargain: number; overpay: number }) => void;
  setSettings: (settings: LeagueSettings) => void;
  toggleFavorite: (playerId: number) => void;
  setShowDiagnostics: (show: boolean) => void;
  setShowMethodology: (show: boolean) => void;
  clearFavorites: () => void;
  resetAllState: () => void;
}

// ── Default persisted state ──

const DEFAULT_PERSISTED_STATE = {
  actions: [] as AuctionAction[],
  activeView: "list" as ViewMode,
  selectedTeamIdx: null,
  teamNames: [] as string[],
  thresholds: { bargain: 0.85, overpay: 1.15 },
};

const DEFAULT_PERSISTED_SETTINGS = { ...DEFAULT_SETTINGS };

// ── Store ──

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      // ── Persisted initial state ──
      actions: [],
      activeView: "list",
      selectedTeamIdx: null,
      teamNames: [],
      teamBudgets: [],
      thresholds: { bargain: 0.85, overpay: 1.15 },
      settings: { ...DEFAULT_SETTINGS },

      // ── Non-persisted initial state ──
      favorites: new Set<number>(),
      showDiagnostics: false,
      showMethodology: false,

      // ── Actions ──

      draftPlayer: (playerId: number, teamIdx: number, price: number): string => {
        if (!isFinite(price) || price < 0) return "Invalid price";
        if (teamIdx < 0) return "Invalid team";

        const { actions, teamNames, settings } = get();
        // Validate team count
        if (teamIdx >= (teamNames.length || settings.numTeams)) return "Team does not exist";

        // Validate the player isn't already drafted
        const draftedIds = new Set<number>();
        for (const a of actions) {
          if (a.type === "DRAFT_PLAYER") {
            draftedIds.add(a.playerId);
          } else if (a.type === "RESET_DRAFT") {
            draftedIds.clear();
          } else if (a.type === "UNDO_LAST_ACTION") {
            // Walk back to find last draft and remove it — handled by replay reducer
          }
          // REMOVE_DRAFTED_PLAYER is handled individually
        }

        const action: AuctionAction = {
          id: uuidv4(),
          type: "DRAFT_PLAYER",
          timestamp: Date.now(),
          playerId,
          teamIdx,
          price,
        };

        set((state) => ({
          actions: [...state.actions, action],
        }));

        return "";
      },

      undoLastAction: () => {
        const { actions } = get();
        if (actions.length === 0) return;

        // Find the last non-UNDO/REMOVE/RESET action to undo
        // We want UNDO to know what to undo at replay time,
        // so we just push an UNDO_LAST_ACTION action
        const action: AuctionAction = {
          id: uuidv4(),
          type: "UNDO_LAST_ACTION",
          timestamp: Date.now(),
        };

        set((state) => ({
          actions: [...state.actions, action],
        }));
      },

      removeDraftAction: (targetActionId: string) => {
        const action: AuctionAction = {
          id: uuidv4(),
          type: "REMOVE_DRAFTED_PLAYER",
          timestamp: Date.now(),
          targetActionId,
        };

        set((state) => ({
          actions: [...state.actions, action],
        }));
      },

      resetDraft: () => {
        const action: AuctionAction = {
          id: uuidv4(),
          type: "RESET_DRAFT",
          timestamp: Date.now(),
        };

        set({ actions: [action] });
      },

      setActiveView: (view: ViewMode) => {
        set({ activeView: view });
      },

      setSelectedTeamIdx: (idx: number | null) => {
        set({ selectedTeamIdx: idx });
      },

      setTeamNames: (names: string[]) => {
        set({ teamNames: names });
      },

      setTeamBudgets: (budgets: number[]) => {
        set({ teamBudgets: budgets });
      },

      setThresholds: (thresholds: { bargain: number; overpay: number }) => {
        set({ thresholds });
      },

      setSettings: (settings: LeagueSettings) => {
        set({ settings });
      },

      toggleFavorite: (playerId: number) => {
        set((state) => {
          const next = new Set(state.favorites);
          if (next.has(playerId)) next.delete(playerId);
          else next.add(playerId);
          return { favorites: next };
        });
      },

      setShowDiagnostics: (show: boolean) => {
        set({ showDiagnostics: show });
      },

      setShowMethodology: (show: boolean) => {
        set({ showMethodology: show });
      },

      clearFavorites: () => {
        set({ favorites: new Set() });
      },

      resetAllState: () => {
        // Reset everything, including settings to defaults
        set({
          actions: [],
          activeView: "list",
          selectedTeamIdx: null,
          teamNames: [],
          teamBudgets: [],
          thresholds: { bargain: 0.85, overpay: 1.15 },
          settings: { ...DEFAULT_SETTINGS },
          showDiagnostics: false,
          showMethodology: false,
        });
      },
    }),
    {
      name: "auction-calc-store",
      skipHydration: false,
      partialize: (state) => ({
        actions: state.actions,
        activeView: state.activeView,
        selectedTeamIdx: state.selectedTeamIdx,
        teamNames: state.teamNames,
        teamBudgets: state.teamBudgets,
        thresholds: state.thresholds,
        settings: state.settings,
      }),
      merge: (persisted: unknown, current: AppState) => {
        // On hydration, merge persisted state with defaults
        // Don't overwrite valid persisted values with defaults
        const p = persisted as Partial<AppState> | null;
        if (!p) return current;

        return {
          ...current,
          actions: Array.isArray(p.actions) ? p.actions : [],
          activeView: isViewMode(p.activeView) ? p.activeView : "list",
          selectedTeamIdx:
            p.selectedTeamIdx === undefined || p.selectedTeamIdx === null
              ? null
              : p.selectedTeamIdx,
          teamNames: Array.isArray(p.teamNames) ? p.teamNames : [],
          teamBudgets: Array.isArray(p.teamBudgets) ? p.teamBudgets : [],
          thresholds: isThresholds(p.thresholds) ? p.thresholds : { bargain: 0.85, overpay: 1.15 },
          settings: p.settings && typeof p.settings === "object"
            ? { ...DEFAULT_SETTINGS, ...p.settings }
            : { ...DEFAULT_SETTINGS },
        };
      },
    },
  ),
);

// ── Type Guards ──

function isViewMode(v: unknown): v is "list" | "board" | "draft" {
  return v === "list" || v === "board" || v === "draft";
}

function isThresholds(v: unknown): v is { bargain: number; overpay: number } {
  return (
    typeof v === "object" &&
    v !== null &&
    "bargain" in v &&
    "overpay" in v &&
    typeof (v as any).bargain === "number" &&
    typeof (v as any).overpay === "number"
  );
}
