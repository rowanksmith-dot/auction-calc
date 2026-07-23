"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Users,
  Undo2,
  RotateCcw,
  Download,
  Upload,
  Edit3,
  Database,
} from "lucide-react";
import { cn, formatCurrency, valueIndicator } from "@/lib/utils";
import type { PlayerWithValue, LeagueSettings, RosterSlotType } from "@/lib/types";
import { validateTeamName } from "@/lib/validation/settings";
import { useAppStore } from "@/lib/store/store";
import { replayAuctionActions } from "@/lib/store/replay-reducer";
import type { TeamState } from "@/lib/store/types";
import { SleeperImport } from "@/components/SleeperImport";
import type { SleeperImportData } from "@/components/SleeperImport";

interface Team {
  name: string;
  budget: number;
  spent: number;
  players: PlayerWithValue[];
}

interface DraftRoomProps {
  players: PlayerWithValue[];
  settings: LeagueSettings;
  onUpdatePlayers: (players: PlayerWithValue[]) => void;
  onRecalculate?: (frozenDraftedIds: Set<number>) => void;
}

const DEFAULT_THRESHOLDS = { bargain: 0.85, overpay: 1.15 };

const POS_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  QB: { bg: "bg-blue-500/15 dark:bg-blue-500/20", text: "text-blue-600 dark:text-blue-300", border: "border-blue-500/25 dark:border-blue-500/30" },
  RB: { bg: "bg-green-500/15 dark:bg-green-500/20", text: "text-green-600 dark:text-green-300", border: "border-green-500/25 dark:border-green-500/30" },
  WR: { bg: "bg-yellow-500/15 dark:bg-yellow-500/20", text: "text-yellow-600 dark:text-yellow-300", border: "border-yellow-500/25 dark:border-yellow-500/30" },
  TE: { bg: "bg-orange-500/15 dark:bg-orange-500/20", text: "text-orange-600 dark:text-orange-300", border: "border-orange-500/25 dark:border-orange-500/30" },
};

export function DraftRoom({
  players,
  settings,
  onUpdatePlayers,
  onRecalculate,
}: DraftRoomProps) {
  // ── Zustand store ──
  const storeActions = useAppStore((s) => s.actions);
  const storeTeamNames = useAppStore((s) => s.teamNames);
  const storeThresholds = useAppStore((s) => s.thresholds);
  const draftPlayer = useAppStore((s) => s.draftPlayer);
  const undoLastAction = useAppStore((s) => s.undoLastAction);
  const resetDraftStore = useAppStore((s) => s.resetDraft);
  const setTeamNames = useAppStore((s) => s.setTeamNames);
  const setThresholds = useAppStore((s) => s.setThresholds);
  const removeDraftAction = useAppStore((s) => s.removeDraftAction);

  // ── Local state (UI-only, not persisted) ──
  const [selectedTeam, setSelectedTeam] = useState<number>(0);
  const [showSetup, setShowSetup] = useState(storeTeamNames.length === 0);
  const [showThresholdConfig, setShowThresholdConfig] = useState(false);
  const [showSleeperImport, setShowSleeperImport] = useState(false);
  const [sleeperData, setSleeperData] = useState<SleeperImportData | null>(null);
  const [collapsed, setCollapsed] = useState(true);
  const [teamNameInputs, setTeamNameInputs] = useState<string[]>(
    storeTeamNames.length > 0
      ? storeTeamNames
      : Array.from({ length: Math.min(settings.numTeams, 12) }, (_, i) => `Team ${i + 1}`),
  );
  const [editBidFor, setEditBidFor] = useState<{
    teamIdx: number;
    playerIdx: number;
  } | null>(null);
  const [editBidValue, setEditBidValue] = useState("");
  const [bidModal, setBidModal] = useState<{
    player: PlayerWithValue;
  } | null>(null);
  const [bidAmount, setBidAmount] = useState("");
  const [bidError, setBidError] = useState<string | null>(null);

  // ── Recalculate Prices ──
  // Freeze drafted players, re-run algorithm on undrafted
  function handleRecalculate() {
    const draftedIds = new Set(
      storeActions.filter((a) => a.type === "DRAFT_PLAYER").map((a) => a.playerId),
    );
    onRecalculate?.(draftedIds);
  }

  // ── Replay derived state from action log ──
  const teamDefs = useMemo(() => storeTeamNames.map((n) => ({ name: n })), [storeTeamNames]);
  const replayResult = useMemo(() => {
    if (teamDefs.length === 0) return null;
    try {
      return replayAuctionActions({
        players: players.map((p) => ({
          id: p.id,
          name: p.name,
          team: p.team,
          position: p.position,
          age: p.age,
          sourceValue: p.sourceValue,
          trend30: p.trend30 ?? null,
        })),
        settings,
        teams: teamDefs,
        actions: storeActions,
      });
    } catch {
      return null;
    }
  }, [players, settings, teamDefs, storeActions]);

  // ── Build Team objects from replay state ──
  const teams: Team[] = useMemo(() => {
    if (!replayResult) return [];
    const { teamStates, output } = replayResult;
    return teamStates.map((ts: TeamState, idx: number) => {
      const teamPlayers: PlayerWithValue[] = ts.roster.map((r) => {
        const p = players.find((pl) => pl.id === r.playerId);
        if (p) {
          return { ...p, drafted: true, winningBid: r.price, draftedBy: ts.name };
        }
        return {
          id: r.playerId,
          name: `Player #${r.playerId}`,
          team: "FA",
          position: "WR" as const,
          age: 25,
          sourceValue: 0,
          scaledValue: 0,
          auctionValue: 0,
          positionRank: 0,
          overallRank: 0,
          tier: 0,
          drafted: true,
          winningBid: r.price,
          draftedBy: ts.name,
          trend30: null,
        };
      });
      return {
        name: ts.name,
        budget: settings.budget,
        spent: ts.spent,
        players: teamPlayers,
      };
    });
  }, [replayResult, players, settings.budget]);

  // ── Sync drafted state back to parent via players ──
  useEffect(() => {
    const updated = players.map((p) => {
      const action = storeActions
        .filter((a) => a.type === "DRAFT_PLAYER")
        .find((a) => a.playerId === p.id);
      if (!action) {
        return { ...p, drafted: false, draftedBy: null, winningBid: null };
      }
      const teamName = storeTeamNames[action.teamIdx] ?? null;
      return { ...p, drafted: true, draftedBy: teamName, winningBid: action.price as number };
    });
    onUpdatePlayers(updated);
  }, [storeActions, storeTeamNames, players, onUpdatePlayers]);

  const startDraft = useCallback(() => {
    const validNames = teamNameInputs
      .slice(0, settings.numTeams)
      .map((n) => validateTeamName(n) || "Team")
      .slice(0, settings.numTeams);

    const seen = new Map<string, number>();
    const uniqueNames = validNames.map((name) => {
      const count = seen.get(name) ?? 0;
      seen.set(name, count + 1);
      return count > 0 ? `${name} ${count + 1}` : name;
    });

    setTeamNames(uniqueNames);
    setSelectedTeam(0);
    setShowSetup(false);
  }, [teamNameInputs, settings.numTeams, setTeamNames]);

  function openBidModal(playerId: number) {
    const player = players.find((p) => p.id === playerId);
    if (!player || player.drafted) return;
    setBidModal({ player });
    setBidAmount(String(player.auctionValue));
    setBidError(null);
  }

  function confirmBid() {
    if (!bidModal) return;
    const { player } = bidModal;
    const bid = parseInt(bidAmount);
    if (isNaN(bid) || bid <= 0) {
      setBidError("Enter a valid bid amount");
      return;
    }

    const result = draftPlayer(player.id, selectedTeam, bid);
    if (result) {
      setBidError(result);
      return;
    }

    setSelectedTeam((selectedTeam + 1) % teams.length);
    setBidModal(null);
    setBidAmount("");
    setBidError(null);
  }

  function undoLast() {
    undoLastAction();
  }

  function resetDraft() {
    if (!window.confirm("Reset the entire draft? This cannot be undone.")) return;
    resetDraftStore();
  }

  function editWinningBid(teamIdx: number, playerIdx: number) {
    const player = teams[teamIdx]?.players[playerIdx];
    if (!player) return;
    setEditBidFor({ teamIdx, playerIdx });
    setEditBidValue(String(player.winningBid ?? player.auctionValue));
  }

  function confirmEditBid() {
    if (!editBidFor) return;
    const { teamIdx, playerIdx } = editBidFor;
    const oldPlayer = teams[teamIdx]?.players[playerIdx];
    if (!oldPlayer) return;
    const newBid = parseInt(editBidValue);
    if (isNaN(newBid) || newBid <= 0) {
      setEditBidFor(null);
      return;
    }

    // Find the action for this player + team
    const matchingAction = storeActions
      .filter((a) => a.type === "DRAFT_PLAYER")
      .find((a) => a.playerId === oldPlayer.id && a.teamIdx === teamIdx);

    if (matchingAction) {
      // Remove old action, add new one with updated price
      removeDraftAction(matchingAction.id);
      draftPlayer(oldPlayer.id, teamIdx, newBid);
    }

    setEditBidFor(null);
  }

  function exportState() {
    const state = {
      version: 1,
      actions: storeActions,
      teamNames: storeTeamNames,
      thresholds: storeThresholds,
    };
    const blob = new Blob([JSON.stringify(state, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "auction-draft-state.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  function importState() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const state = JSON.parse(text);
        if (Array.isArray(state.actions) && Array.isArray(state.teamNames)) {
          // Import via store — we write actions + teamNames directly
          // Use store's batch set through individual calls
          // For clean import, reset then batch
          useAppStore.setState({
            actions: state.actions,
            teamNames: state.teamNames,
            thresholds: state.thresholds || { bargain: 0.85, overpay: 1.15 },
          });
          setTeamNames(state.teamNames);
          setThresholds(state.thresholds || { bargain: 0.85, overpay: 1.15 });
          setShowSetup(false);
        }
      } catch {
        alert("Invalid file format.");
      }
    };
    input.click();
  }

  function getRosterCount(type: string): number {
    return settings.rosterSlots.find((s) => s.type === type as RosterSlotType)?.count ?? 0;
  }

  function getTeamFilledCount(team: Team, type: string): number {
    return team.players.filter((p) => {
      if (type === "FLEX") return ["RB", "WR", "TE"].includes(p.position);
      if (type === "SUPERFLEX") return ["QB", "RB", "WR", "TE"].includes(p.position);
      return p.position === type;
    }).length;
  }

  function getMaxBid(team: Team): number {
    const needed = settings.rosterSlots.reduce((sum, slot) => {
      const filled = getTeamFilledCount(team, slot.type);
      return sum + Math.max(0, slot.count - filled);
    }, 0);
    if (needed <= 0) return team.budget - team.spent;
    return (team.budget - team.spent) - (needed - 1) * settings.minBid;
  }

  const thresholds = storeThresholds;
  const draftActionCount = storeActions.length;

  if (showSetup && !sleeperData) {
    return (
      <div className="bg-card border border-border rounded-xl p-6">
        <div className="flex items-center gap-2 mb-4">
          <Users size={20} className="text-primary" />
          <h2 className="text-lg font-semibold">Draft Room Setup</h2>
        </div>

        {/* Sleeper Import Section */}
        {showSleeperImport ? (
          <div className="mb-4 pb-4 border-b border-border">
            <h3 className="text-sm font-medium mb-2">Import from Sleeper</h3>
            <SleeperImport
              onImport={(data) => {
                setSleeperData(data);
                setShowSleeperImport(false);
              }}
              onCancel={() => setShowSleeperImport(false)}
            />
          </div>
        ) : (
          <button
            onClick={() => setShowSleeperImport(true)}
            className="w-full flex items-center gap-2 px-4 py-2.5 rounded-xl border border-dashed border-border text-sm text-muted-foreground hover:text-foreground hover:border-primary/50 transition-all mb-4"
          >
            <Database size={16} />
            <span>Sleeper Auction Import</span>
            <span className="text-xs text-muted-foreground ml-auto">
              Import real draft prices
            </span>
          </button>
        )}

        {/* OR divider */}
        <div className="relative mb-4">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t border-border" />
          </div>
          <div className="relative flex justify-center">
            <span className="bg-card px-2 text-xs text-muted-foreground">OR</span>
          </div>
        </div>

        <p className="text-sm text-muted-foreground mb-4">
          Enter team names ({settings.numTeams} teams, ${settings.budget} budget each)
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-60 overflow-y-auto mb-4">
          {teamNameInputs.slice(0, settings.numTeams).map((name, i) => (
            <input
              key={i}
              type="text"
              value={name}
              onChange={(e) => {
                const next = [...teamNameInputs];
                next[i] = e.target.value;
                setTeamNameInputs(next);
              }}
              placeholder={`Team ${i + 1}`}
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          ))}
        </div>
        <button
          onClick={startDraft}
          className="w-full py-2.5 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition-colors"
        >
          Start Draft
        </button>
      </div>
    );
  }

  // ── Sleeper view ──
  if (sleeperData) {
    const sleeperTeams = Object.values(sleeperData.teams)
      .sort((a, b) => a.rosterId - b.rosterId)
      .map((t, i) => ({
        name: t.teamName,
        budget: sleeperData.budget,
        spent: t.spent,
        players: t.purchases
          .filter((p) => !p.fullName.startsWith("No "))
          .map((p) => ({
            id: -(parseInt(p.sleeperPlayerId) || (100000 + i)),
            name: p.fullName,
            team: p.team,
            position: p.position as "QB" | "RB" | "WR" | "TE",
            age: 25,
            sourceValue: 0,
            scaledValue: p.auctionPrice,
            auctionValue: p.auctionPrice,
            positionRank: 0,
            overallRank: 0,
            tier: 0,
            drafted: true,
            winningBid: p.auctionPrice,
            draftedBy: t.teamName,
            trend30: null,
          })),
      }));

    return (
      <div className="space-y-4">
        {/* Sleeper header bar */}
        <div className="flex items-center justify-between bg-card border border-border rounded-xl px-4 py-3">
          <div>
            <div className="flex items-center gap-2">
              <Database size={16} className="text-primary" />
              <span className="font-semibold text-sm">{sleeperData.leagueName}</span>
              <span className={cn("text-[10px] px-1.5 py-0.5 rounded font-medium",
                sleeperData.status === "complete"
                  ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                  : "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400")}>
                {sleeperData.status}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              ${sleeperData.budget.toLocaleString()} budget · {sleeperData.numTeams} teams · {sleeperData.totalPicks} picks
            </p>
          </div>
          <button
            onClick={() => { setSleeperData(null); setShowSetup(true); }}
            className="text-xs text-muted-foreground hover:text-foreground underline"
          >
            Close
          </button>
        </div>

        {/* Team cards row */}
        <div className="flex gap-2 overflow-x-auto pb-2">
          {sleeperTeams.map((team, i) => {
            const isSelected = selectedTeam === i;
            const rem = team.budget - team.spent;
            return (
              <div key={i}
                className={cn(
                  "flex flex-col rounded-xl border transition-all shrink-0",
                  "w-[170px]",
                  isSelected
                    ? "border-primary bg-primary/5 ring-2 ring-primary/30 shadow-sm"
                    : "border-border bg-card",
                )}
              >
                <div className="px-3 pt-2.5 pb-2 border-b border-border/50">
                  <div className={cn("text-sm truncate", isSelected && "font-bold")}>{team.name}</div>
                  <div className={cn("text-lg tabular-nums mt-0.5", isSelected ? "font-extrabold" : "font-bold")}>
                    {formatCurrency(rem)}
                  </div>
                </div>
                <div className="p-1.5 space-y-0.5 min-h-[40px]">
                  {team.players.map((p) => {
                    const pc = POS_COLORS[p.position] ?? POS_COLORS.WR;
                    const indicator = valueIndicator(p.winningBid ?? 0, p.auctionValue, thresholds.bargain, thresholds.overpay);
                    return (
                      <div key={p.id} className={cn("flex items-center justify-between px-1.5 py-0.5 rounded-[4px] text-[11px] border", pc.bg, pc.border)}>
                        <div className="flex items-center gap-1.5 min-w-0 flex-1">
                          <span className={cn("text-[9px] font-bold uppercase shrink-0", pc.text)}>{p.position}</span>
                          <span className="truncate text-foreground text-[10px]">{p.name}</span>
                        </div>
                        <span className={cn("font-mono tabular-nums text-[10px]", indicator.color)}>{formatCurrency(p.winningBid ?? 0)}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* Summary */}
        <div className="text-xs text-muted-foreground text-center">
          {sleeperTeams.reduce((s, t) => s + t.players.length, 0)} players ·
          ${sleeperTeams.reduce((s, t) => s + t.spent, 0).toLocaleString()} total spent ·
          ${sleeperTeams.reduce((s, t) => s + (t.budget - t.spent), 0).toLocaleString()} remaining
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Actions bar */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => setShowSetup(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors"
        >
          Back to Setup
        </button>
        <button
          onClick={undoLast}
          disabled={draftActionCount === 0}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-secondary text-secondary-foreground hover:bg-secondary/80 disabled:opacity-40 transition-colors"
        >
          <Undo2 size={12} />
          Undo
        </button>
        <button
          onClick={handleRecalculate}
          disabled={draftActionCount === 0}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 hover:bg-amber-200 dark:hover:bg-amber-900/50 border border-amber-300 dark:border-amber-700 disabled:opacity-40 transition-colors"
        >
          <RotateCcw size={12} />
          Recalculate Prices
        </button>
        <button
          onClick={resetDraft}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors"
        >
          <RotateCcw size={12} />
          Reset
        </button>
        <button
          onClick={exportState}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors"
        >
          <Download size={12} />
          Export
        </button>
        <button
          onClick={importState}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors"
        >
          <Upload size={12} />
          Import
        </button>
        <button
          onClick={() => setShowThresholdConfig(!showThresholdConfig)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors"
        >
          <Edit3 size={12} />
          Thresholds
        </button>
        <div className="text-xs text-muted-foreground ml-auto">
          {draftActionCount} picks
        </div>
      </div>

      {/* Threshold config */}
      {showThresholdConfig && (
        <div className="bg-card border border-border rounded-xl p-3">
          <h3 className="text-xs font-semibold mb-2">Value Thresholds</h3>
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-xs font-medium mb-1">Bargain (below)</label>
              <input
                type="number"
                min={0.5}
                max={1}
                step={0.01}
                value={thresholds.bargain}
                onChange={(e) =>
                  setThresholds({ ...thresholds, bargain: parseFloat(e.target.value) || 0.85 })
                }
                className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm"
              />
            </div>
            <div className="flex-1">
              <label className="block text-xs font-medium mb-1">Overpay (above)</label>
              <input
                type="number"
                min={1}
                max={2}
                step={0.01}
                value={thresholds.overpay}
                onChange={(e) =>
                  setThresholds({ ...thresholds, overpay: parseFloat(e.target.value) || 1.15 })
                }
                className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm"
              />
            </div>
          </div>
        </div>
      )}

      {/* Team cards row */}
      <div className="flex gap-2 overflow-x-auto pb-2">
        {teams.map((team, i) => {
          const isSelected = selectedTeam === i;
          const rem = team.budget - team.spent;
          return (
            <button
              key={i}
              onClick={() => setSelectedTeam(i)}
              className={cn(
                "flex flex-col rounded-xl border text-left transition-all shrink-0",
                "w-[170px]",
                isSelected
                  ? "border-primary bg-primary/5 ring-2 ring-primary/30 shadow-sm"
                  : "border-border hover:border-primary/50 bg-card",
              )}
            >
              {/* Team header */}
              <div className="px-3 pt-2.5 pb-2 border-b border-border/50">
                <div className={cn("text-sm truncate", isSelected && "font-bold")}>
                  {team.name}
                </div>
                <div className={cn("text-lg tabular-nums mt-0.5", isSelected ? "font-extrabold" : "font-bold")}>
                  {formatCurrency(rem)}
                </div>
              </div>

              {/* Roster slots */}
              <div className="p-1.5 space-y-0.5 min-h-[40px]">
                {(() => {
                  const placed = new Set<number>();

                  const slotOrder = settings.rosterSlots
                    .sort((a, b) => {
                      if (a.type === "BENCH" && b.type !== "BENCH") return 1;
                      if (b.type === "BENCH" && a.type !== "BENCH") return -1;
                      if (a.type === "FLEX" && b.type === "SUPERFLEX") return -1;
                      if (b.type === "FLEX" && a.type === "SUPERFLEX") return 1;
                      return 0;
                    })
                    .filter((s) => !(s.type === "BENCH" && collapsed));

                  const slotResults: { type: RosterSlotType; slotIdx: number; player: PlayerWithValue | null }[] = [];

                  for (const slot of slotOrder) {
                    for (let s = 0; s < slot.count; s++) {
                      const pool = team.players.filter((p) => !placed.has(p.id));
                      let candidate: PlayerWithValue | null = null;

                      if (slot.type === "BENCH") {
                        candidate = pool[0] ?? null;
                      } else if (slot.type === "SUPERFLEX") {
                        candidate = pool.find((p) => ["QB", "RB", "WR", "TE"].includes(p.position)) ?? null;
                      } else if (slot.type === "FLEX") {
                        candidate = pool.find((p) => ["RB", "WR", "TE"].includes(p.position)) ?? null;
                      } else {
                        candidate = pool.find((p) => p.position === slot.type) ?? null;
                      }

                      if (candidate) placed.add(candidate.id);
                      slotResults.push({ type: slot.type, slotIdx: s, player: candidate });
                    }
                  }

                  return slotResults.map(({ type, slotIdx, player }) => {
                    if (player) {
                      const pc = POS_COLORS[player.position] ?? POS_COLORS.WR;
                      const indicator = valueIndicator(player.winningBid ?? 0, player.auctionValue, thresholds.bargain, thresholds.overpay);
                      const pIdx = team.players.indexOf(player);
                      return (
                        <div key={`${type}-${slotIdx}-filled`} className={cn("flex items-center justify-between px-1.5 py-0.5 rounded-[4px] text-[11px] border", pc.bg, pc.border)}>
                          <div className="flex items-center gap-1.5 min-w-0 flex-1">
                            <span className={cn("text-[9px] font-bold uppercase shrink-0", pc.text)}>{type === "FLEX" ? "FX" : type === "SUPERFLEX" ? "SF" : type}</span>
                            <span className="truncate text-foreground text-[10px]">{player.name}</span>
                          </div>
                          <div className="flex items-center gap-0.5 shrink-0">
                            <span className={cn("font-mono tabular-nums text-[10px]", indicator.color)}>{formatCurrency(player.winningBid ?? 0)}</span>
                            <button onClick={(e) => { e.stopPropagation(); editWinningBid(i, pIdx); }} className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground" title="Edit bid"><Edit3 size={8} /></button>
                          </div>
                        </div>
                      );
                    }
                    const pc = POS_COLORS[type as string] ?? { bg: "bg-muted/30", text: "text-muted-foreground", border: "border-border/50" };
                    return (
                      <div key={`${type}-${slotIdx}-empty`} className={cn("flex items-center px-1.5 py-0.5 rounded-[4px] text-[11px] border border-dashed", pc.border)}>
                        <span className={cn("text-[9px] font-bold uppercase shrink-0", pc.text)}>{type === "FLEX" ? "FX" : type === "SUPERFLEX" ? "SF" : type}</span>
                      </div>
                    );
                  });
                })()}
              </div>
            </button>
          );
        })}
      </div>

      {/* Bench toggle */}
      <div className="flex items-center justify-between px-1.5">
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-muted-foreground hover:bg-muted/50 transition-colors"
        >
          {collapsed ? (
            <><span>▴</span><span>Show bench</span></>
          ) : (
            <><span>▾</span><span>Hide bench</span></>
          )}
        </button>
        <span className="text-xs text-muted-foreground">
          {teams.reduce((sum, t) => sum + t.players.length, 0)} players drafted
        </span>
      </div>

      {/* Available players */}
      <div className="bg-card border border-border rounded-xl">
        <div className="px-4 py-3 flex items-center justify-between border-b border-border/50">
          <h3 className="text-sm font-semibold">
            Available Players
          </h3>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span>
              Drafting for{" "}
              <span className="text-primary font-semibold">{teams[selectedTeam]?.name}</span>
            </span>
            <span>
              Max bid: {formatCurrency(getMaxBid(teams[selectedTeam] ?? { budget: 0, spent: 0, players: [], name: "" }))}
            </span>
          </div>
        </div>
        <div className="p-2 max-h-[340px] overflow-y-auto">
          {players
            .filter((p) => !p.drafted)
            .sort((a, b) => b.auctionValue - a.auctionValue)
            .map((p) => {
              const pc = POS_COLORS[p.position] ?? POS_COLORS.WR;
              const plTeam = teams[selectedTeam] ?? { budget: 0, spent: 0, players: [], name: "" };
              return (
                <div
                  key={p.id}
                  className="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-muted transition-colors text-left"
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <span className={cn("text-[10px] font-bold uppercase px-1.5 py-0.5 rounded shrink-0 text-center min-w-[26px]", pc.bg, pc.text)}>
                      {p.position}
                    </span>
                    <span className="text-[11px] font-mono tabular-nums text-muted-foreground shrink-0 w-12 text-right">
                      {p.scaledValue.toFixed(0)}
                    </span>
                    <span className="text-xs font-mono tabular-nums text-muted-foreground w-5 text-right shrink-0">
                      {p.overallRank}
                    </span>
                    <span className="text-sm font-medium truncate">
                      {p.name}
                    </span>
                    <span className="text-[10px] text-muted-foreground font-mono">
                      {p.team}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0 pl-2">
                    <span className="text-sm font-mono tabular-nums font-semibold">
                      {formatCurrency(p.auctionValue)}
                    </span>
                    <span className="px-2.5 py-1 rounded-md bg-primary text-primary-foreground text-xs font-semibold cursor-pointer hover:bg-primary/90 transition-colors border border-primary/40" onClick={() => openBidModal(p.id)}>
                      Bid
                    </span>
                  </div>
                </div>
              );
            })}
          {players.filter((p) => !p.drafted).length === 0 && (
            <p className="text-center text-muted-foreground py-8">
              All players have been drafted!
            </p>
          )}
        </div>
      </div>

      {/* Bid modal */}
      {bidModal !== null && (
        <div className="fixed inset-0 bg-black z-50 flex items-center justify-center px-4">
          <div className="bg-card rounded-xl border border-border p-5 max-w-sm w-full">
            <h3 className="text-base font-semibold mb-1">Enter Winning Bid</h3>
            <div className="flex items-center gap-2 mb-4">
              <span className="text-sm font-medium">{bidModal.player.name}</span>
              <span className={cn("text-xs font-bold uppercase px-1.5 py-0.5 rounded", POS_COLORS[bidModal.player.position]?.bg, POS_COLORS[bidModal.player.position]?.text)}>
                {bidModal.player.position}
              </span>
              <span className="text-xs text-muted-foreground">{bidModal.player.team}</span>
            </div>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xs text-muted-foreground">Modeled value:</span>
              <span className="text-sm font-mono font-semibold">{formatCurrency(bidModal.player.auctionValue)}</span>
              <span className="text-xs text-muted-foreground mx-1">|</span>
              <span className="text-xs text-muted-foreground">Drafting for:</span>
              <span className="text-sm font-semibold text-primary">{teams[selectedTeam]?.name}</span>
            </div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs text-muted-foreground">$</span>
              <input
                type="number"
                min={1}
                value={bidAmount}
                onChange={(e) => { setBidAmount(e.target.value); setBidError(null); }}
                className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-lg font-mono focus:outline-none focus:ring-2 focus:ring-primary"
                autoFocus
                onKeyDown={(e) => { if (e.key === "Enter") confirmBid(); if (e.key === "Escape") setBidModal(null); }}
              />
              <button
                onClick={() => setBidAmount(String(bidModal.player.auctionValue))}
                className="px-2 py-1.5 rounded-md text-xs bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors shrink-0"
              >
                Suggested
              </button>
            </div>
            {bidError && (
              <p className="text-xs text-red-500 mb-2">{bidError}</p>
            )}
            <p className="text-xs text-muted-foreground mb-4">
              Max bid: {formatCurrency(getMaxBid(teams[selectedTeam] ?? { budget: 0, spent: 0, players: [], name: "" }))} · {teams[selectedTeam]?.budget - teams[selectedTeam]?.spent - (parseInt(bidAmount) || 0) < 0 ? "⚠️ " : ""}{formatCurrency((teams[selectedTeam]?.budget ?? 0) - (teams[selectedTeam]?.spent ?? 0) - (parseInt(bidAmount) || 0))} remaining
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setBidModal(null)}
                className="flex-1 py-2.5 rounded-lg bg-secondary text-secondary-foreground font-medium text-sm hover:bg-secondary/80 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmBid}
                className="flex-1 py-2.5 rounded-lg bg-primary text-primary-foreground font-medium text-sm hover:bg-primary/90 transition-colors"
              >
                Confirm Bid
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit bid modal */}
      {editBidFor !== null && (
        <div className="fixed inset-0 bg-black z-50 flex items-center justify-center px-4">
          <div className="bg-card rounded-xl border border-border p-6 max-w-sm w-full">
            <h3 className="text-lg font-semibold mb-4">Edit Winning Bid</h3>
            <p className="text-sm text-muted-foreground mb-3">
              {teams[editBidFor.teamIdx]?.players[editBidFor.playerIdx]?.name}
              {" — "}
              {teams[editBidFor.teamIdx]?.name}
            </p>
            <input
              type="number"
              min={1}
              value={editBidValue}
              onChange={(e) => setEditBidValue(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-lg font-mono mb-4 focus:outline-none focus:ring-2 focus:ring-primary"
              autoFocus
            />
            <div className="flex gap-2">
              <button
                onClick={() => setEditBidFor(null)}
                className="flex-1 py-2 rounded-lg bg-secondary text-secondary-foreground font-medium"
              >
                Cancel
              </button>
              <button
                onClick={confirmEditBid}
                className="flex-1 py-2 rounded-lg bg-primary text-primary-foreground font-medium"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
