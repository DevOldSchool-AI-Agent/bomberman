import type { MatchState } from "../simulation/types";
import type { GameSession } from "./session";

export const SET_LENGTH_OPTIONS = [1, 3, 5] as const;

export function createEmptySetWins(slotIds: number[]): Record<number, number> {
  const wins: Record<number, number> = {};
  for (const id of slotIds) {
    wins[id] = 0;
  }
  return wins;
}

export function requiredWinsForSet(setLength: number): number {
  const safeLength = Math.max(1, Math.floor(setLength));
  return Math.floor(safeLength / 2) + 1;
}

export function formatSetLengthLabel(setLength: number): string {
  if (setLength <= 1) {
    return "SINGLE";
  }
  return `BO${Math.max(1, Math.floor(setLength))}`;
}

export function cycleSetLength(current: number, direction: -1 | 1): number {
  const index = SET_LENGTH_OPTIONS.indexOf(current as (typeof SET_LENGTH_OPTIONS)[number]);
  const safeIndex = index >= 0 ? index : 0;
  const nextIndex = (safeIndex + direction + SET_LENGTH_OPTIONS.length) % SET_LENGTH_OPTIONS.length;
  return SET_LENGTH_OPTIONS[nextIndex] ?? SET_LENGTH_OPTIONS[0];
}

export function resetSetProgress(session: GameSession): void {
  session.setWinsByPlayerId = createEmptySetWins(session.lobbySlots.map((slot) => slot.id));
  session.roundsPlayedInSet = 0;
  session.activeRoundSerial = 0;
  session.lastScoredRoundSerial = 0;
  session.setWinnerId = null;
}

export function startSetRound(session: GameSession, resetSet = false): void {
  if (resetSet) {
    resetSetProgress(session);
  }
  session.activeRoundSerial += 1;
}

export function applyMatchResultToSet(session: GameSession, state: MatchState | null): void {
  if (!state || state.phase !== "finished") {
    return;
  }
  if (session.activeRoundSerial <= 0 || session.lastScoredRoundSerial === session.activeRoundSerial) {
    return;
  }

  session.lastScoredRoundSerial = session.activeRoundSerial;
  session.roundsPlayedInSet += 1;

  if (state.winnerId === null) {
    return;
  }

  session.setWinsByPlayerId[state.winnerId] = (session.setWinsByPlayerId[state.winnerId] ?? 0) + 1;
  const requiredWins = requiredWinsForSet(session.selectedSetLength);
  if ((session.setWinsByPlayerId[state.winnerId] ?? 0) >= requiredWins) {
    session.setWinnerId = state.winnerId;
  }
}
