import type { AuctionAction, ReplayInput, ReplayOutput, TeamState } from "./types";

/**
 * Pure function replay reducer.
 *
 * Takes fetched player data, league settings, team definitions, and the
 * ordered auction action log, and reconstructs the complete current draft
 * state deterministically.
 *
 * Rules:
 * - No double-draft
 * - No budget exceed
 * - No roster exceed
 * - Unresolved player IDs preserved (not deleted)
 * - Duplicate action IDs rejected
 * - maxBid = remainingBudget - minBid * max(remainingRosterSpots - 1, 0)
 */

function getRosterSize(settings: ReplayInput["settings"]): number {
  return settings.rosterSlots.reduce((sum, s) => sum + s.count, 0);
}

export function replayAuctionActions(input: ReplayInput): {
  output: ReplayOutput;
  teams: Map<number, TeamState>;
  teamStates: TeamState[];
} {
  const { players, settings, teams, actions } = input;
  const rosterSize = getRosterSize(settings);
  const playerSet = new Map(players.map((p) => [p.id, p]));

  // Track applied action IDs to reject duplicates
  const appliedIds = new Set<string>();

  // Track states
  const teamStates: TeamState[] = teams.map((t) => ({
    name: t.name,
    spent: 0,
    roster: [],
    remainingBudget: settings.budget,
    maxBid: settings.budget,
  }));

  const draftedPlayerIds = new Set<number>();
  const playerPrices = new Map<number, number>();
  const playerTeams = new Map<number, string>();

  const unresolvedActionIds: string[] = [];
  const validationWarnings: string[] = [];

  // Helper to recalculate maxBid for a team
  function recalcMaxBid(teamIdx: number) {
    const ts = teamStates[teamIdx];
    const remainingRosterSpots = rosterSize - ts.roster.length;
    const needed = Math.max(remainingRosterSpots, 0);
    ts.maxBid = ts.remainingBudget - settings.minBid * Math.max(needed - 1, 0);
  }

  // Process actions in order
  for (const action of actions) {
    // Reject duplicate action IDs
    if (appliedIds.has(action.id)) {
      validationWarnings.push(`Duplicate action ID: ${action.id}`);
      continue;
    }

    switch (action.type) {
      case "DRAFT_PLAYER": {
        const { playerId, teamIdx, price } = action;

        // Check if player was already drafted
        if (draftedPlayerIds.has(playerId)) {
          validationWarnings.push(
            `Player ${playerId} already drafted — action ${action.id} rejected`,
          );
          break;
        }

        // Check team index validity
        if (teamIdx < 0 || teamIdx >= teamStates.length) {
          validationWarnings.push(
            `Invalid team index ${teamIdx} — action ${action.id} rejected`,
          );
          unresolvedActionIds.push(action.id);
          break;
        }

        const team = teamStates[teamIdx];

        // Check budget
        if (price > team.remainingBudget) {
          validationWarnings.push(
            `${team.name} cannot afford $${price} — only $${team.remainingBudget} remaining`,
          );
          unresolvedActionIds.push(action.id);
          break;
        }

        // Check roster capacity
        if (team.roster.length >= rosterSize) {
          validationWarnings.push(
            `${team.name} has no roster spots remaining`,
          );
          unresolvedActionIds.push(action.id);
          break;
        }

        // Check price validity
        if (price < 0 || !isFinite(price)) {
          validationWarnings.push(
            `Invalid price $${price} — action ${action.id} rejected`,
          );
          unresolvedActionIds.push(action.id);
          break;
        }

        // Apply
        appliedIds.add(action.id);
        draftedPlayerIds.add(playerId);
        playerPrices.set(playerId, price);
        playerTeams.set(playerId, team.name);

        team.roster.push({ playerId, price, actionId: action.id });
        team.spent += price;
        team.remainingBudget = settings.budget - team.spent;
        recalcMaxBid(teamIdx);
        break;
      }

      case "UNDO_LAST_ACTION": {
        // Find the last DRAFT_PLAYER action that was actually applied
        // Walk backwards through actions to find the most recent applied DRAFT_PLAYER
        let lastDraftAction: AuctionAction | null = null;
        // Look from the current action backwards through the actions array
        for (let i = actions.indexOf(action) - 1; i >= 0; i--) {
          const prevAction = actions[i];
          if (
            prevAction.type === "DRAFT_PLAYER" &&
            appliedIds.has(prevAction.id) &&
            draftedPlayerIds.has(prevAction.playerId)
          ) {
            lastDraftAction = prevAction;
            break;
          }
        }

        if (!lastDraftAction) {
          validationWarnings.push(
            "No DRAFT_PLAYER action to undo — UNDO_LAST_ACTION ignored",
          );
          // Still mark this action as applied so it doesn't replay again
          appliedIds.add(action.id);
          break;
        }

        const da = lastDraftAction as Extract<AuctionAction, { type: "DRAFT_PLAYER" }>;
        const { playerId, teamIdx, price } = da;

        // Undo the draft
        appliedIds.add(action.id);
        draftedPlayerIds.delete(playerId);
        playerPrices.delete(playerId);
        playerTeams.delete(playerId);

        const team = teamStates[teamIdx];
        const rosterIdx = team.roster.findIndex((r) => r.playerId === playerId);
        if (rosterIdx >= 0) {
          team.roster.splice(rosterIdx, 1);
        }
        team.spent -= price;
        team.remainingBudget = settings.budget - team.spent;
        recalcMaxBid(teamIdx);
        break;
      }

      case "REMOVE_DRAFTED_PLAYER": {
        const { targetActionId } = action;

        // Find the target DRAFT_PLAYER action
        const targetAction = actions.find(
          (a) => a.id === targetActionId && a.type === "DRAFT_PLAYER",
        ) as Extract<AuctionAction, { type: "DRAFT_PLAYER" }> | undefined;

        if (!targetAction || !appliedIds.has(targetActionId)) {
          validationWarnings.push(
            `Target action ${targetActionId} not found or not applied`,
          );
          appliedIds.add(action.id);
          break;
        }

        const { playerId, teamIdx, price } = targetAction;

        // Remove the player
        appliedIds.add(action.id);
        draftedPlayerIds.delete(playerId);
        playerPrices.delete(playerId);
        playerTeams.delete(playerId);

        const team = teamStates[teamIdx];
        const rosterIdx = team.roster.findIndex((r) => r.playerId === playerId);
        if (rosterIdx >= 0) {
          team.roster.splice(rosterIdx, 1);
        }
        team.spent -= price;
        team.remainingBudget = settings.budget - team.spent;
        recalcMaxBid(teamIdx);
        break;
      }

      case "RESET_DRAFT": {
        appliedIds.add(action.id);
        draftedPlayerIds.clear();
        playerPrices.clear();
        playerTeams.clear();

        for (let i = 0; i < teamStates.length; i++) {
          teamStates[i] = {
            name: teams[i].name,
            spent: 0,
            roster: [],
            remainingBudget: settings.budget,
            maxBid: settings.budget,
          };
        }
        break;
      }

      default: {
        validationWarnings.push(
          `Unknown action type: ${(action as any).type}`,
        );
        break;
      }
    }
  }

  const totalSpent = teamStates.reduce((sum, t) => sum + t.spent, 0);

  const output: ReplayOutput = {
    teams: teamStates,
    draftedPlayerIds,
    playerPrices,
    playerTeams: new Map(playerTeams),
    totalSpent,
    actionCount: appliedIds.size,
    unresolvedActionIds,
    validationWarnings,
  };

  return { output, teams: new Map(teamStates.map((_, i) => [i, teamStates[i]])), teamStates };
}
