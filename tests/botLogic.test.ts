import { describe, expect, it } from "vitest";
import { applyBotIntents } from "../src/bot/botLogic";
import { createMatch } from "../src/simulation/createMatch";
import { DEFAULT_CONFIG } from "../src/simulation/config";
import type { MapDefinition, MatchState, PlayerSlot } from "../src/simulation/types";

const baseMap: MapDefinition = {
  id: "bot-test",
  name: "Bot Test",
  width: 13,
  height: 11,
  softRows: [
    ".............",
    ".............",
    ".............",
    ".............",
    ".............",
    ".............",
    ".............",
    ".............",
    ".............",
    ".............",
    "............."
  ]
};

const slots: PlayerSlot[] = [
  { id: 1, name: "BOT", color: 0xffffff, controller: "bot", spawnX: 1, spawnY: 1 },
  { id: 2, name: "P2", color: 0xff0000, controller: "human", spawnX: 11, spawnY: 9 }
];

function botIntent(state: MatchState) {
  const frame = applyBotIntents(state, { intents: {} });
  return frame.intents[1];
}

describe("bot logic", () => {
  it("moves out of imminent bomb blast lanes", () => {
    let state = createMatch({ map: baseMap, slots, seed: 101 });
    state = {
      ...state,
      players: [
        { ...state.players[0]!, x: 3, y: 1, controller: "bot" },
        { ...state.players[1]!, x: 11, y: 9 }
      ],
      bombs: [
        {
          id: 1,
          ownerId: 2,
          x: 1,
          y: 1,
          range: 3,
          fuseTicks: 2,
          movingDirection: "none",
          isPowerBomb: false,
          carriedByPlayerId: null
        }
      ]
    };

    const intent = botIntent(state);
    expect(intent?.moveX).toBe(0);
    expect(intent?.moveY).toBe(1);
  });

  it("plants bombs when an opponent is in blast line and escape exists", () => {
    let state = createMatch({ map: baseMap, slots, seed: 202, config: { ...DEFAULT_CONFIG, baseBombRange: 3 } });
    state = {
      ...state,
      players: [
        { ...state.players[0]!, x: 5, y: 1, controller: "bot", bombRange: 3, activeBombs: 0, maxBombs: 1 },
        { ...state.players[1]!, x: 7, y: 1 }
      ]
    };

    const intent = botIntent(state);
    expect(intent?.placeBomb).toBe(true);
    const movementMagnitude = Math.abs(intent?.moveX ?? 0) + Math.abs(intent?.moveY ?? 0);
    expect(movementMagnitude).toBeGreaterThan(0);
  });

  it("separates and can still apply bomb pressure when sharing a tile with an opponent", () => {
    let state = createMatch({ map: baseMap, slots, seed: 212, config: { ...DEFAULT_CONFIG, baseBombRange: 3 } });
    state = {
      ...state,
      players: [
        { ...state.players[0]!, x: 5, y: 1, controller: "bot", bombRange: 3, activeBombs: 0, maxBombs: 1 },
        { ...state.players[1]!, x: 5, y: 1 }
      ]
    };

    const intent = botIntent(state);
    const movementMagnitude = Math.abs(intent?.moveX ?? 0) + Math.abs(intent?.moveY ?? 0);
    expect(movementMagnitude).toBeGreaterThan(0);
    expect(intent?.placeBomb).toBe(true);
  });

  it("keeps moving when opponents are far away", () => {
    let state = createMatch({ map: baseMap, slots, seed: 707 });
    state = {
      ...state,
      tick: 120,
      players: [
        { ...state.players[0]!, x: 1, y: 1, controller: "bot" },
        { ...state.players[1]!, x: 11, y: 9 }
      ]
    };

    const intent = botIntent(state);
    const movementMagnitude = Math.abs(intent?.moveX ?? 0) + Math.abs(intent?.moveY ?? 0);
    expect(movementMagnitude).toBeGreaterThan(0);
  });

  it("does not plant bombs when trapped with no escape route", () => {
    let state = createMatch({ map: baseMap, slots, seed: 303 });
    state = {
      ...state,
      players: [
        { ...state.players[0]!, x: 1, y: 1, controller: "bot", activeBombs: 0, maxBombs: 1 },
        { ...state.players[1]!, x: 11, y: 9 }
      ]
    };

    const tiles = state.tiles.map((row) => [...row]);
    const row1 = tiles[1];
    const row2 = tiles[2];
    if (row1) row1[2] = "soft";
    if (row2) row2[1] = "soft";
    state = { ...state, tiles };

    const intent = botIntent(state);
    expect(intent?.placeBomb).toBe(false);
  });

  it("does not place another bomb while one is already active", () => {
    let state = createMatch({ map: baseMap, slots, seed: 909 });
    state = {
      ...state,
      players: [
        { ...state.players[0]!, x: 5, y: 1, controller: "bot", activeBombs: 1, maxBombs: 3, bombRange: 3 },
        { ...state.players[1]!, x: 7, y: 1 }
      ],
      bombs: [
        {
          id: 1,
          ownerId: 1,
          x: 5,
          y: 1,
          range: 3,
          fuseTicks: 80,
          movingDirection: "none",
          isPowerBomb: false,
          carriedByPlayerId: null
        }
      ]
    };

    const intent = botIntent(state);
    expect(intent?.placeBomb).toBe(false);
  });

  it("treats chained detonation lanes as immediate danger", () => {
    let state = createMatch({ map: baseMap, slots, seed: 919 });
    state = {
      ...state,
      players: [
        { ...state.players[0]!, x: 4, y: 2, controller: "bot" },
        { ...state.players[1]!, x: 11, y: 9 }
      ],
      bombs: [
        {
          id: 10,
          ownerId: 2,
          x: 1,
          y: 1,
          range: 3,
          fuseTicks: 2,
          movingDirection: "none",
          isPowerBomb: false,
          carriedByPlayerId: null
        },
        {
          id: 11,
          ownerId: 2,
          x: 4,
          y: 1,
          range: 1,
          fuseTicks: 120,
          movingDirection: "none",
          isPowerBomb: false,
          carriedByPlayerId: null
        }
      ]
    };

    const intent = botIntent(state);
    const movementMagnitude = Math.abs(intent?.moveX ?? 0) + Math.abs(intent?.moveY ?? 0);
    expect(movementMagnitude).toBeGreaterThan(0);
    expect(intent?.placeBomb).toBe(false);
  });

  it("uses difficulty profile for longer-range pressure bombing", () => {
    let state = createMatch({ map: baseMap, slots, seed: 1001, config: { ...DEFAULT_CONFIG, baseBombRange: 4 } });
    state = {
      ...state,
      players: [
        { ...state.players[0]!, x: 3, y: 1, controller: "bot", bombRange: 4, activeBombs: 0, maxBombs: 1 },
        { ...state.players[1]!, x: 7, y: 1 }
      ]
    };

    const normal = applyBotIntents(state, { intents: {} }, "normal").intents[1];
    const hard = applyBotIntents(state, { intents: {} }, "hard").intents[1];
    expect(normal?.placeBomb).toBe(false);
    expect(hard?.placeBomb).toBe(true);
  });

  it("uses configured fuse timing when deciding whether planting is survivable", () => {
    let state = createMatch({ map: baseMap, slots, seed: 1111, config: { ...DEFAULT_CONFIG, baseBombRange: 3 } });
    state = {
      ...state,
      players: [
        { ...state.players[0]!, x: 5, y: 1, controller: "bot", bombRange: 3, activeBombs: 0, maxBombs: 1 },
        { ...state.players[1]!, x: 7, y: 1 }
      ]
    };

    const defaultIntent = applyBotIntents(state, { intents: {} }, "normal", DEFAULT_CONFIG).intents[1];
    const instantFuseIntent = applyBotIntents(
      state,
      { intents: {} },
      "normal",
      {
        ...DEFAULT_CONFIG,
        bombFuseTicks: 1
      }
    ).intents[1];

    expect(defaultIntent?.placeBomb).toBe(true);
    expect(instantFuseIntent?.placeBomb).toBe(false);
  });

  it("moves toward safer inner lanes after sudden death begins", () => {
    let state = createMatch({ map: baseMap, slots, seed: 1201 });
    state = {
      ...state,
      suddenDeathIndex: 10,
      players: [
        { ...state.players[0]!, x: 1, y: 4, controller: "bot" },
        { ...state.players[1]!, x: 11, y: 9 }
      ]
    };

    const intent = botIntent(state);
    expect(intent?.moveX).toBe(0);
    expect(intent?.moveY).toBe(1);
  });

  it("avoids soft-block farming bombs during sudden death unless applying direct pressure", () => {
    let state = createMatch({ map: baseMap, slots, seed: 1301 });
    const tiles = state.tiles.map((row) => [...row]);
    if (tiles[5]) {
      tiles[5][6] = "soft";
    }
    state = {
      ...state,
      tick: 21,
      suddenDeathIndex: 12,
      tiles,
      players: [
        { ...state.players[0]!, x: 5, y: 5, controller: "bot", activeBombs: 0, maxBombs: 1, bombRange: 2 },
        { ...state.players[1]!, x: 11, y: 9 }
      ]
    };

    const intent = botIntent(state);
    expect(intent?.placeBomb).toBe(false);
  });
});
