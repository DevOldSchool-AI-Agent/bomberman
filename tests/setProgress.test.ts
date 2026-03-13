import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../src/simulation";
import { createMatch } from "../src/simulation/createMatch";
import type { PlayerSlot } from "../src/simulation/types";
import { applyMatchResultToSet, createEmptySetWins, cycleSetLength, formatSetLengthLabel, resetSetProgress, startSetRound } from "../src/game/setProgress";
import { createInitialSession } from "../src/game/session";

const map = {
  id: "set-test",
  name: "Set Test",
  width: 13,
  height: 11,
  softRows: Array.from({ length: 11 }, () => ".............")
};

const slots: PlayerSlot[] = [
  { id: 1, name: "P1", color: 0xffffff, controller: "human", spawnX: 1, spawnY: 1 },
  { id: 2, name: "P2", color: 0xff0000, controller: "human", spawnX: 11, spawnY: 9 }
];

describe("set progress", () => {
  it("formats and cycles supported set lengths", () => {
    expect(formatSetLengthLabel(1)).toBe("SINGLE");
    expect(formatSetLengthLabel(3)).toBe("BO3");
    expect(cycleSetLength(1, 1)).toBe(3);
    expect(cycleSetLength(5, 1)).toBe(1);
  });

  it("resets and starts rounds cleanly", () => {
    const session = createInitialSession();
    session.setWinsByPlayerId = createEmptySetWins([1, 2, 3, 4]);
    session.setWinsByPlayerId[1] = 2;
    session.roundsPlayedInSet = 3;
    session.activeRoundSerial = 5;
    session.lastScoredRoundSerial = 5;
    session.setWinnerId = 1;

    startSetRound(session, true);
    expect(session.activeRoundSerial).toBe(1);
    expect(session.roundsPlayedInSet).toBe(0);
    expect(session.lastScoredRoundSerial).toBe(0);
    expect(session.setWinnerId).toBeNull();
    expect(session.setWinsByPlayerId[1]).toBe(0);
  });

  it("applies a finished round once and marks the set winner", () => {
    const session = createInitialSession();
    session.selectedSetLength = 3;
    resetSetProgress(session);
    startSetRound(session, false);

    let state = createMatch({ map, slots, seed: 55, config: DEFAULT_CONFIG });
    state = {
      ...state,
      phase: "finished",
      winnerId: 1
    };

    applyMatchResultToSet(session, state);
    applyMatchResultToSet(session, state);
    expect(session.roundsPlayedInSet).toBe(1);
    expect(session.setWinsByPlayerId[1]).toBe(1);
    expect(session.setWinnerId).toBeNull();

    startSetRound(session, false);
    applyMatchResultToSet(
      session,
      {
        ...state,
        tick: 99
      }
    );
    expect(session.setWinsByPlayerId[1]).toBe(2);
    expect(session.setWinnerId).toBe(1);
  });
});
