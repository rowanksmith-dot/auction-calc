"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Users,
  Undo2,
  RotateCcw,
  Download,
  Upload,
  Edit3,
} from "lucide-react";
import { cn, formatCurrency, valueIndicator, positionColor } from "@/lib/utils";
import type { PlayerWithValue, LeagueSettings, RosterSlotType } from "@/lib/types";
import { validateTeamName } from "@/lib/validation/settings";

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
}

const DEFAULT_THRESHOLDS = { bargain: 0.85, overpay: 1.15 };

export function DraftRoom({
  players,
  settings,
  onUpdatePlayers,
}: DraftRoomProps) {
  const [teams, setTeams] = useState<Team[]>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("auction-calc-teams");
      if (saved) {
        try {
          return JSON.parse(saved);
        } catch {}
      }
    }
    return [];
  });
  const [selectedTeam, setSelectedTeam] = useState<number>(0);
  const [draftActions, setDraftActions] = useState<
    Array<{ playerId: number; teamIdx: number; bid: number }>
  >(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("auction-calc-actions");
      if (saved) {
        try {
          return JSON.parse(saved);
        } catch {}
      }
    }
    return [];
  });
  const [showSetup, setShowSetup] = useState(teams.length === 0);
  const [showThresholdConfig, setShowThresholdConfig] = useState(false);
  const [thresholds, setThresholds] = useState<{ bargain: number; overpay: number }>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("auction-calc-thresholds");
      if (saved) {
        try {
          return JSON.parse(saved);
        } catch {}
      }
    }
    return DEFAULT_THRESHOLDS;
  });
  const [teamNameInputs, setTeamNameInputs] = useState<string[]>(
    teams.length > 0
      ? teams.map((t) => t.name)
      : Array.from({ length: Math.min(settings.numTeams, 12) }, (_, i) => `Team ${i + 1}`),
  );
  const [editBidFor, setEditBidFor] = useState<{
    teamIdx: number;
    playerIdx: number;
  } | null>(null);
  const [editBidValue, setEditBidValue] = useState("");

  // Save state
  useEffect(() => {
    localStorage.setItem("auction-calc-teams", JSON.stringify(teams));
  }, [teams]);

  useEffect(() => {
    localStorage.setItem("auction-calc-actions", JSON.stringify(draftActions));
  }, [draftActions]);

  useEffect(() => {
    localStorage.setItem("auction-calc-thresholds", JSON.stringify(thresholds));
  }, [thresholds]);

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

    setTeams(
      uniqueNames.map((name) => ({
        name,
        budget: settings.budget,
        spent: 0,
        players: [],
      })),
    );
    setDraftActions([]);
    setSelectedTeam(0);
    setShowSetup(false);
  }, [teamNameInputs, settings, settings.budget, settings.numTeams]);

  // Sync players with draft actions
  useEffect(() => {
    const updated = players.map((p) => {
      const action = draftActions.find((a) => a.playerId === p.id);
      return {
        ...p,
        drafted: action !== undefined,
        draftedBy: action ? teams[action.teamIdx]?.name ?? null : null,
        winningBid: action?.bid ?? null,
      };
    });
    onUpdatePlayers(updated);
  }, [draftActions, teams.length]);

  function draftPlayer(playerId: number) {
    const player = players.find((p) => p.id === playerId);
    if (!player || player.drafted) return;

    const bidStr = window.prompt(
      `Winning bid for ${player.name}:`,
      String(player.auctionValue),
    );
    if (bidStr === null) return;
    const bid = parseInt(bidStr);
    if (isNaN(bid) || bid <= 0) return;

    const team = teams[selectedTeam];
    if (!team) return;
    if (team.spent + bid > team.budget) {
      alert(
        `${team.name} only has ${formatCurrency(team.budget - team.spent)} remaining.`,
      );
      return;
    }

    const updatedTeams = teams.map((t, i) => {
      if (i === selectedTeam) {
        return {
          ...t,
          spent: t.spent + bid,
          players: [...t.players, { ...player, drafted: true, winningBid: bid, draftedBy: t.name }],
        };
      }
      return t;
    });

    setTeams(updatedTeams);
    setDraftActions([...draftActions, { playerId, teamIdx: selectedTeam, bid }]);
    setSelectedTeam((selectedTeam + 1) % teams.length);
  }

  function undoLast() {
    if (draftActions.length === 0) return;
    const last = draftActions[draftActions.length - 1];
    const updatedTeams = teams.map((t, i) => {
      if (i === last.teamIdx) {
        return {
          ...t,
          spent: t.spent - last.bid,
          players: t.players.filter((p) => p.id !== last.playerId),
        };
      }
      return t;
    });
    setTeams(updatedTeams);
    setDraftActions(draftActions.slice(0, -1));
  }

  function resetDraft() {
    if (!window.confirm("Reset the entire draft? This cannot be undone."))
      return;
    setTeams(teams.map((t) => ({ ...t, spent: 0, players: [] })));
    setDraftActions([]);
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

    const oldBid = oldPlayer.winningBid ?? 0;
    const diff = newBid - oldBid;

    const updatedTeams = teams.map((t, i) => {
      if (i === teamIdx) {
        const updatedPlayers = t.players.map((p, j) =>
          j === playerIdx ? { ...p, winningBid: newBid } : p,
        );
        return { ...t, spent: t.spent + diff, players: updatedPlayers };
      }
      return t;
    });

    setTeams(updatedTeams);
    setDraftActions(
      draftActions.map((a) =>
        a.playerId === oldPlayer.id && a.teamIdx === teamIdx
          ? { ...a, bid: newBid }
          : a,
      ),
    );
    setEditBidFor(null);
  }

  function exportState() {
    const state = { teams, draftActions };
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
        if (state.teams && state.draftActions) {
          setTeams(state.teams);
          setDraftActions(state.draftActions);
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
      if (type === "FLEX")
        return ["RB", "WR", "TE"].includes(p.position);
      if (type === "SUPERFLEX")
        return ["QB", "RB", "WR", "TE"].includes(p.position);
      return p.position === type;
    }).length;
  }

  function getMaxBid(team: Team): number {
    const needed = settings.rosterSlots.reduce((sum, slot) => {
      const filled = getTeamFilledCount(team, slot.type);
      return sum + Math.max(0, slot.count - filled);
    }, 0);
    if (needed <= 0) return team.budget - team.spent;
    // Reserve minBid for each unfilled slot
    return (team.budget - team.spent) - (needed - 1) * settings.minBid;
  }

  if (showSetup) {
    return (
      <div className="bg-card border border-border rounded-xl p-6">
        <div className="flex items-center gap-2 mb-4">
          <Users size={20} className="text-primary" />
          <h2 className="text-lg font-semibold">Draft Room Setup</h2>
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

  return (
    <div className="space-y-4">
      {/* Actions bar */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={undoLast}
          disabled={draftActions.length === 0}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm bg-secondary text-secondary-foreground hover:bg-secondary/80 disabled:opacity-40 transition-colors"
        >
          <Undo2 size={14} />
          Undo Last
        </button>
        <button
          onClick={resetDraft}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors"
        >
          <RotateCcw size={14} />
          Reset
        </button>
        <button
          onClick={exportState}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors"
        >
          <Download size={14} />
          Export
        </button>
        <button
          onClick={importState}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors"
        >
          <Upload size={14} />
          Import
        </button>
        <button
          onClick={() => setShowThresholdConfig(!showThresholdConfig)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors"
        >
          <Edit3 size={14} />
          Thresholds
        </button>
        <div className="text-xs text-muted-foreground ml-auto">
          {draftActions.length} picks
        </div>
      </div>

      {/* Threshold config */}
      {showThresholdConfig && (
        <div className="bg-card border border-border rounded-xl p-4">
          <h3 className="text-sm font-semibold mb-3">Value Thresholds</h3>
          <div className="flex gap-4">
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
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Win price &lt; {Math.round(thresholds.bargain * 100)}% of modeled value
              </p>
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
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Win price &gt; {Math.round(thresholds.overpay * 100)}% of modeled value
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Team selector */}
      <div className="flex flex-wrap gap-2">
        {teams.map((team, i) => (
          <button
            key={i}
            onClick={() => setSelectedTeam(i)}
            className={cn(
              "flex flex-col px-3 py-2 rounded-lg border text-left transition-colors min-w-[130px]",
              selectedTeam === i
                ? "border-primary bg-primary/5"
                : "border-border hover:border-primary/50",
            )}
          >
            <span className="text-xs font-medium truncate">{team.name}</span>
            <span className="text-lg font-bold tabular-nums">
              {formatCurrency(team.budget - team.spent)}
            </span>
            <span className="text-xs text-muted-foreground">
              {team.players.length} players
            </span>
          </button>
        ))}
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Player list */}
        <div className="lg:col-span-2">
          <div className="bg-card border border-border rounded-xl p-4">
            <h3 className="text-sm font-semibold mb-3">
              Available Players — Drafting for{" "}
              <span className="text-primary">{teams[selectedTeam]?.name}</span>
              <span className="text-xs text-muted-foreground ml-2 font-normal">
                (Max bid: {formatCurrency(getMaxBid(teams[selectedTeam] ?? { budget: 0, spent: 0, players: [], name: "" }))})
              </span>
            </h3>
            <div className="space-y-1 max-h-[500px] overflow-y-auto">
              {players
                .filter((p) => !p.drafted)
                .sort((a, b) => b.auctionValue - a.auctionValue)
                .slice(0, 50)
                .map((p) => (
                  <button
                    key={p.id}
                    onClick={() => draftPlayer(p.id)}
                    className="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-muted transition-colors text-left group"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-xs text-muted-foreground font-mono w-6 text-right">
                        {p.overallRank}
                      </span>
                      <span className="text-sm font-medium truncate">
                        {p.name}
                      </span>
                      <span
                        className={cn(
                          "text-xs font-medium shrink-0",
                          positionColor(p.position),
                        )}
                      >
                        {p.position}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-sm font-mono tabular-nums font-semibold">
                        {formatCurrency(p.auctionValue)}
                      </span>
                      <span className="text-xs text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">
                        Bid
                      </span>
                    </div>
                  </button>
                ))}
              {players.filter((p) => !p.drafted).length === 0 && (
                <p className="text-center text-muted-foreground py-8">
                  All players have been drafted!
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Team roster */}
        <div>
          <div className="bg-card border border-border rounded-xl p-4">
            <h3 className="text-sm font-semibold mb-2">
              {teams[selectedTeam]?.name} Roster
            </h3>

            {/* Roster spots */}
            {settings.rosterSlots
              .filter((slot) => slot.type !== "BENCH")
              .map((slot) => {
                const filled = getTeamFilledCount(
                  teams[selectedTeam] ?? { players: [], budget: 0, spent: 0, name: "" },
                  slot.type,
                );
                return (
                  <div key={slot.type} className="flex items-center justify-between text-xs py-1">
                    <span className="text-muted-foreground">{slot.type}</span>
                    <span className="tabular-nums">
                      {filled}/{slot.count}
                    </span>
                  </div>
                );
              })}

            <div className="mt-3 space-y-2">
              {teams[selectedTeam]?.players.map((p, idx) => {
                const indicator = valueIndicator(
                  p.winningBid ?? 0,
                  p.auctionValue,
                  thresholds.bargain,
                  thresholds.overpay,
                );
                return (
                  <div
                    key={p.id}
                    className="flex items-center justify-between px-3 py-2 rounded-lg bg-background group"
                  >
                    <div>
                      <span className="text-sm font-medium">{p.name}</span>
                      <span
                        className={cn("text-xs ml-2", positionColor(p.position))}
                      >
                        {p.position}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="text-right">
                        <div className="text-sm font-mono tabular-nums">
                          {formatCurrency(p.winningBid ?? 0)}
                        </div>
                        {indicator.label && (
                          <div className={cn("text-xs", indicator.color)}>
                            {indicator.label}
                          </div>
                        )}
                      </div>
                      <button
                        onClick={() => editWinningBid(selectedTeam, idx)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
                        title="Edit bid"
                      >
                        <Edit3 size={12} />
                      </button>
                    </div>
                  </div>
                );
              })}
              {(teams[selectedTeam]?.players.length ?? 0) === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No players yet
                </p>
              )}
            </div>

            <div className="mt-4 pt-3 border-t border-border space-y-1">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Spent:</span>
                <span className="font-mono">
                  {formatCurrency(teams[selectedTeam]?.spent ?? 0)}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Remaining:</span>
                <span className="font-mono font-semibold">
                  {formatCurrency(
                    (teams[selectedTeam]?.budget ?? 0) -
                      (teams[selectedTeam]?.spent ?? 0),
                  )}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Max bid:</span>
                <span className="font-mono">
                  {formatCurrency(getMaxBid(teams[selectedTeam] ?? { name: "", budget: 0, spent: 0, players: [] }))}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Edit bid modal */}
      {editBidFor !== null && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center px-4">
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
