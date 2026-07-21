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
import { cn, formatCurrency, valueIndicator } from "@/lib/utils";
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
  const [collapsed, setCollapsed] = useState(false); // default show starters only
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
  const [bidModal, setBidModal] = useState<{
    player: PlayerWithValue;
  } | null>(null);
  const [bidAmount, setBidAmount] = useState("");
  const [bidError, setBidError] = useState<string | null>(null);

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

    const team = teams[selectedTeam];
    if (!team) return;
    if (team.spent + bid > team.budget) {
      setBidError(
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
    setDraftActions([...draftActions, { playerId: player.id, teamIdx: selectedTeam, bid }]);
    setSelectedTeam((selectedTeam + 1) % teams.length);
    setBidModal(null);
    setBidAmount("");
    setBidError(null);
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
          onClick={() => setShowSetup(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors"
        >
          Back to Setup
        </button>
        <button
          onClick={undoLast}
          disabled={draftActions.length === 0}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-secondary text-secondary-foreground hover:bg-secondary/80 disabled:opacity-40 transition-colors"
        >
          <Undo2 size={12} />
          Undo
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
          {draftActions.length} picks
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
                {settings.rosterSlots
                  .sort((a, b) => {
                    // BENCH always last
                    if (a.type === "BENCH" && b.type !== "BENCH") return 1;
                    if (b.type === "BENCH" && a.type !== "BENCH") return -1;
                    // FLEX before SUPERFLEX
                    if (a.type === "FLEX" && b.type === "SUPERFLEX") return -1;
                    if (b.type === "FLEX" && a.type === "SUPERFLEX") return 1;
                    return 0;
                  })
                  .filter((s) => !(s.type === "BENCH" && collapsed))
                  .map((slot) => {
                    const posPlayers = team.players.filter((p) => {
                      if (slot.type === "FLEX") return ["RB", "WR", "TE"].includes(p.position);
                      if (slot.type === "SUPERFLEX") return ["QB", "RB", "WR", "TE"].includes(p.position);
                      return p.position === slot.type;
                    });

                    return Array.from({ length: slot.count }, (_, s) => {
                      const player = posPlayers[s];
                      if (player) {
                        const pc = POS_COLORS[player.position] ?? POS_COLORS.WR;
                        const indicator = valueIndicator(player.winningBid ?? 0, player.auctionValue, thresholds.bargain, thresholds.overpay);
                        const pIdx = team.players.indexOf(player);
                        return (
                          <div key={`${slot.type}-${s}-filled`} className={cn("flex items-center justify-between px-1.5 py-0.5 rounded-[4px] text-[11px] border", pc.bg, pc.border)}>
                            <div className="flex items-center gap-1.5 min-w-0 flex-1">
                              <span className={cn("text-[9px] font-bold uppercase shrink-0", pc.text)}>{slot.type === "FLEX" ? "FX" : slot.type === "SUPERFLEX" ? "SF" : slot.type}</span>
                              <span className="truncate text-foreground text-[10px]">{player.name}</span>
                            </div>
                            <div className="flex items-center gap-0.5 shrink-0">
                              <span className={cn("font-mono tabular-nums text-[10px]", indicator.color)}>{formatCurrency(player.winningBid ?? 0)}</span>
                              <button onClick={(e) => { e.stopPropagation(); editWinningBid(i, pIdx); }} className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground" title="Edit bid"><Edit3 size={8} /></button>
                            </div>
                          </div>
                        );
                      }
                      const pc = POS_COLORS[slot.type as string] ?? { bg: "bg-muted/30", text: "text-muted-foreground", border: "border-border/50" };
                      return (
                        <div key={`${slot.type}-${s}-empty`} className={cn("flex items-center px-1.5 py-0.5 rounded-[4px] text-[11px] border border-dashed", pc.border)}>
                          <span className={cn("text-[9px] font-bold uppercase shrink-0", pc.text)}>{slot.type === "FLEX" ? "FX" : slot.type === "SUPERFLEX" ? "SF" : slot.type}</span>
                        </div>
                      );
                    });
                  })}
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
              return (
                <button
                  key={p.id}
                  onClick={() => openBidModal(p.id)}
                  className="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-muted transition-colors text-left group"
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <span className="text-xs text-muted-foreground font-mono w-5 text-right shrink-0">
                      {p.overallRank}
                    </span>
                    <span className={cn("text-[10px] font-bold uppercase px-1.5 py-0.5 rounded shrink-0", pc.bg, pc.text)}>
                      {p.position}
                    </span>
                    <span className="text-sm font-medium truncate">
                      {p.name}
                    </span>
                    <span className="text-[10px] text-muted-foreground font-mono">
                      {p.team}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-sm font-mono tabular-nums font-semibold">
                      {formatCurrency(p.auctionValue)}
                    </span>
                    <span className="px-2.5 py-1 rounded-md bg-primary/10 text-primary text-xs font-semibold opacity-0 group-hover:opacity-100 transition-opacity">
                      Bid
                    </span>
                  </div>
                </button>
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
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center px-4">
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
