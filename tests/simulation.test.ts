import { describe, expect, it } from "vitest";
import { createMatch } from "../src/simulation/createMatch";
import { DEFAULT_CONFIG } from "../src/simulation/config";
import { stableStateHash } from "../src/simulation/hashState";
import { stepMatch } from "../src/simulation/stepMatch";
import type { InputFrame, MapDefinition, MatchState, PlayerSlot, PlayerState } from "../src/simulation/types";

const emptyFrame: InputFrame = { intents: {} };

const baseMap: MapDefinition = {
  id: "test",
  name: "Test",
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
  { id: 1, name: "P1", color: 0xffffff, controller: "human", spawnX: 1, spawnY: 1 },
  { id: 2, name: "P2", color: 0xff0000, controller: "human", spawnX: 11, spawnY: 9 }
];

function advance(state: MatchState, ticks: number, frame: InputFrame = emptyFrame, config = DEFAULT_CONFIG): MatchState {
  let current = state;
  for (let i = 0; i < ticks; i += 1) {
    current = stepMatch(frame, current, config).state;
  }
  return current;
}

function mustPlayer(state: MatchState, index: number): PlayerState {
  const player = state.players[index];
  if (!player) {
    throw new Error(`Missing player at index ${index}`);
  }
  return player;
}

describe("simulation core", () => {
  it("destroys soft block and blocks flame behind it", () => {
    const map: MapDefinition = {
      ...baseMap,
      softRows: baseMap.softRows.map((row, y) => {
        if (y !== 1) return row;
        const chars = row.split("");
        chars[3] = "s";
        return chars.join("");
      })
    };
    let state = createMatch({ map, slots, seed: 5 });

    state = stepMatch({ intents: { 1: { moveX: 0, moveY: 0, placeBomb: true } } }, state, DEFAULT_CONFIG).state;
    state = advance(state, DEFAULT_CONFIG.bombFuseTicks + 1);

    expect(state.tiles[1]?.[3]).toBe("empty");
    expect(state.flames.some((flame) => flame.x === 4 && flame.y === 1)).toBe(false);
  });

  it("triggers chain reaction", () => {
    const config = { ...DEFAULT_CONFIG, bombFuseTicks: 40 };
    let state = createMatch({ map: baseMap, slots, seed: 9, config });

    state = stepMatch({ intents: { 1: { moveX: 0, moveY: 0, placeBomb: true } } }, state, config).state;
    state = {
      ...state,
      players: [{ ...mustPlayer(state, 0), maxBombs: 2 }, mustPlayer(state, 1)]
    };
    const movedPlayer = { ...mustPlayer(state, 0), x: 2, y: 1 };
    state = { ...state, players: [movedPlayer, mustPlayer(state, 1)] };
    state = stepMatch({ intents: { 1: { moveX: 0, moveY: 0, placeBomb: true } } }, state, config).state;

    state = advance(state, config.bombFuseTicks + 2, emptyFrame, config);
    expect(state.bombs.length).toBe(0);
    expect(state.flames.length).toBeGreaterThan(0);
  });

  it("detonates chained bombs in the same tick", () => {
    const config = { ...DEFAULT_CONFIG, bombFuseTicks: 120 };
    let state = createMatch({ map: baseMap, slots, seed: 13, config });

    state = {
      ...state,
      players: [{ ...mustPlayer(state, 0), activeBombs: 2 }, mustPlayer(state, 1)],
      bombs: [
        {
          id: 1,
          ownerId: 1,
          x: 1,
          y: 1,
          range: 2,
          fuseTicks: 0,
          movingDirection: "none",
          isPowerBomb: false,
          carriedByPlayerId: null
        },
        {
          id: 2,
          ownerId: 1,
          x: 2,
          y: 1,
          range: 2,
          fuseTicks: 999,
          movingDirection: "none",
          isPowerBomb: false,
          carriedByPlayerId: null
        }
      ],
      nextBombId: 3
    };

    const result = stepMatch(emptyFrame, state, config);
    const explosionEvents = result.events.filter((event) => event.type === "bomb_exploded");

    expect(explosionEvents.length).toBe(2);
    expect(result.state.bombs.length).toBe(0);
    expect(mustPlayer(result.state, 0).activeBombs).toBe(0);
  });

  it("applies pickup effects", () => {
    let state = createMatch({ map: baseMap, slots, seed: 17 });
    state = {
      ...state,
      powerUps: [
        ...state.powerUps,
        {
          id: 999,
          x: 1,
          y: 1,
          kind: "kick"
        }
      ]
    };

    state = stepMatch(emptyFrame, state, DEFAULT_CONFIG).state;
    expect(mustPlayer(state, 0).canKick).toBe(true);
    expect(state.powerUps.length).toBe(0);
  });

  it("removes existing powerups when flames pass over them", () => {
    let state = createMatch({ map: baseMap, slots, seed: 84 });
    state = {
      ...state,
      players: [{ ...mustPlayer(state, 0), x: 1, y: 1 }, { ...mustPlayer(state, 1), x: 11, y: 9 }],
      bombs: [
        {
          id: 20,
          ownerId: 1,
          x: 1,
          y: 1,
          range: 3,
          fuseTicks: 0,
          movingDirection: "none",
          isPowerBomb: false,
          carriedByPlayerId: null
        }
      ],
      powerUps: [{ id: 9000, x: 2, y: 1, kind: "extraBomb" }],
      nextBombId: 21
    };

    state = stepMatch(emptyFrame, state, DEFAULT_CONFIG).state;
    expect(state.powerUps.find((powerUp) => powerUp.id === 9000)).toBeUndefined();
  });

  it("keeps newly spawned powerups while the originating flame is still active", () => {
    const config = { ...DEFAULT_CONFIG, powerUpDropChance: 1 };
    const map: MapDefinition = {
      ...baseMap,
      softRows: baseMap.softRows.map((row, y) => {
        if (y !== 1) return row;
        const chars = row.split("");
        chars[2] = "s";
        return chars.join("");
      })
    };
    let state = createMatch({ map, slots, seed: 1331, config });
    state = {
      ...state,
      players: [{ ...mustPlayer(state, 0), x: 1, y: 1 }, { ...mustPlayer(state, 1), x: 11, y: 9 }],
      bombs: [
        {
          id: 21,
          ownerId: 1,
          x: 1,
          y: 1,
          range: 2,
          fuseTicks: 0,
          movingDirection: "none",
          isPowerBomb: false,
          carriedByPlayerId: null
        }
      ],
      nextBombId: 22
    };

    state = stepMatch(emptyFrame, state, config).state;
    const spawnedOnFlame = state.powerUps.find((powerUp) => powerUp.x === 2 && powerUp.y === 1);
    expect(spawnedOnFlame).toBeDefined();

    state = stepMatch(emptyFrame, state, config).state;
    const nextTick = state.powerUps.find((powerUp) => powerUp.x === 2 && powerUp.y === 1);
    expect(nextTick).toBeDefined();
  });

  it("progresses sudden death tiles", () => {
    const config = {
      ...DEFAULT_CONFIG,
      matchDurationSeconds: 20,
      suddenDeathStartSeconds: 0,
      suddenDeathIntervalTicks: 1
    };
    let state = createMatch({ map: baseMap, slots, seed: 23, config });

    state = advance(state, 4, emptyFrame, config);
    const suddenDeathCount = state.tiles.flat().filter((tile) => tile === "suddenDeath").length;
    expect(suddenDeathCount).toBeGreaterThan(0);
  });

  it("starts sudden death on the configured tick and respects placement interval countdown", () => {
    const config = {
      ...DEFAULT_CONFIG,
      matchDurationSeconds: 45,
      suddenDeathStartSeconds: 2,
      suddenDeathIntervalTicks: 3
    };
    let state = createMatch({ map: baseMap, slots, seed: 24, config });
    state = {
      ...state,
      players: [
        { ...mustPlayer(state, 0), x: 5, y: 5, spawnInvulnerabilityTicks: 9999 },
        { ...mustPlayer(state, 1), x: 7, y: 5, spawnInvulnerabilityTicks: 9999 }
      ]
    };
    const suddenDeathEventTicks: number[] = [];
    const firstExpectedTick = config.suddenDeathStartSeconds * config.tickRate;

    for (let i = 0; i < firstExpectedTick + 8; i += 1) {
      const result = stepMatch(emptyFrame, state, config);
      state = result.state;
      for (const event of result.events) {
        if (event.type === "sudden_death_tile") {
          suddenDeathEventTicks.push(event.tick);
        }
      }
      if (suddenDeathEventTicks.length >= 2) {
        break;
      }
    }

    expect(suddenDeathEventTicks[0]).toBe(firstExpectedTick);
    expect((suddenDeathEventTicks[1] ?? 0) - suddenDeathEventTicks[0]!).toBe(config.suddenDeathIntervalTicks + 1);
  });

  it("finishes when one player remains", () => {
    const config = { ...DEFAULT_CONFIG, bombFuseTicks: 2, invulnerabilityTicks: 0 };
    let state = createMatch({ map: baseMap, slots, seed: 31, config });

    // Move player 2 near player 1 and detonate quickly.
    state = {
      ...state,
      players: [
        { ...mustPlayer(state, 0), x: 1, y: 1, spawnInvulnerabilityTicks: 8 },
        { ...mustPlayer(state, 1), x: 2, y: 1, spawnInvulnerabilityTicks: 0 }
      ]
    };
    state = stepMatch({ intents: { 1: { moveX: 0, moveY: 0, placeBomb: true } } }, state, config).state;
    state = advance(state, 4, emptyFrame, config);

    expect(state.phase).toBe("finished");
    expect(state.winnerId).toBe(1);
    expect(state.matchFinishedReason).toBe("elimination");
  });

  it("marks finish reason as sudden death when a player is eliminated by closing tiles", () => {
    const config = {
      ...DEFAULT_CONFIG,
      suddenDeathStartSeconds: 0,
      suddenDeathIntervalTicks: 0,
      invulnerabilityTicks: 0
    };
    let state = createMatch({ map: baseMap, slots, seed: 32, config });
    state = {
      ...state,
      players: [{ ...mustPlayer(state, 0), x: 6, y: 5 }, { ...mustPlayer(state, 1), x: 1, y: 1 }]
    };

    state = stepMatch(emptyFrame, state, config).state;
    expect(state.phase).toBe("finished");
    expect(state.winnerId).toBe(1);
    expect(state.matchFinishedReason).toBe("suddenDeath");
  });

  it("marks finish reason as timeout when timer expires", () => {
    const config = {
      ...DEFAULT_CONFIG,
      matchDurationSeconds: 1,
      suddenDeathStartSeconds: 99,
      invulnerabilityTicks: 0
    };
    let state = createMatch({ map: baseMap, slots, seed: 33, config });
    state = advance(state, config.tickRate + 1, emptyFrame, config);

    expect(state.phase).toBe("finished");
    expect(state.matchFinishedReason).toBe("timeout");
  });

  it("produces stable replay hash for the same input sequence", () => {
    const frames: InputFrame[] = [
      { intents: { 1: { moveX: 1, moveY: 0, placeBomb: false } } },
      { intents: { 1: { moveX: 0, moveY: 0, placeBomb: true } } },
      { intents: { 1: { moveX: -1, moveY: 0, placeBomb: false } } },
      emptyFrame,
      emptyFrame,
      emptyFrame
    ];

    const runOnce = (): string => {
      let state = createMatch({ map: baseMap, slots, seed: 77 });
      for (let i = 0; i < 120; i += 1) {
        const frame = frames[i % frames.length] ?? emptyFrame;
        state = stepMatch(frame, state, DEFAULT_CONFIG).state;
      }
      return stableStateHash(state);
    };

    expect(runOnce()).toBe(runOnce());
  });

  it("places bombs while moving by choosing the nearest forward tile", () => {
    let state = createMatch({ map: baseMap, slots, seed: 88 });
    state = {
      ...state,
      players: [{ ...mustPlayer(state, 0), x: 1.62, y: 1, spawnInvulnerabilityTicks: 0 }, mustPlayer(state, 1)]
    };

    state = stepMatch({ intents: { 1: { moveX: 1, moveY: 0, placeBomb: true } } }, state, DEFAULT_CONFIG).state;
    const bomb = state.bombs[0];

    expect(bomb).toBeDefined();
    expect(bomb?.x).toBe(2);
    expect(bomb?.y).toBe(1);
  });

  it("avoids selecting behind tiles for running bomb placement when blocked ahead", () => {
    let state = createMatch({ map: baseMap, slots, seed: 89 });
    state = {
      ...state,
      players: [
        { ...mustPlayer(state, 0), x: 1.62, y: 1, spawnInvulnerabilityTicks: 0 },
        { ...mustPlayer(state, 1), x: 2, y: 1, spawnInvulnerabilityTicks: 0 }
      ]
    };

    state = stepMatch({ intents: { 1: { moveX: 1, moveY: 0, placeBomb: true } } }, state, DEFAULT_CONFIG).state;
    const bomb = state.bombs[0];

    expect(bomb).toBeDefined();
    expect(bomb?.x).toBe(3);
    expect(bomb?.y).toBe(1);
  });

  it("keeps blast propagation correct for kicked bombs with fractional positions", () => {
    const map: MapDefinition = {
      ...baseMap,
      softRows: baseMap.softRows.map((row, y) => {
        if (y !== 1) return row;
        const chars = row.split("");
        chars[5] = "s";
        return chars.join("");
      })
    };
    let state = createMatch({ map, slots, seed: 101 });
    state = {
      ...state,
      players: [{ ...mustPlayer(state, 0), activeBombs: 1 }, mustPlayer(state, 1)],
      bombs: [
        {
          id: 1,
          ownerId: 1,
          x: 3.6,
          y: 1,
          range: 3,
          fuseTicks: 0,
          movingDirection: "right",
          isPowerBomb: false,
          carriedByPlayerId: null
        }
      ],
      nextBombId: 2
    };

    state = stepMatch(emptyFrame, state, DEFAULT_CONFIG).state;
    expect(state.tiles[1]?.[5]).toBe("empty");
  });

  it("kicks adjacent bombs in movement direction and does not auto-kick newly placed bombs", () => {
    let state = createMatch({ map: baseMap, slots, seed: 141 });
    state = {
      ...state,
      players: [{ ...mustPlayer(state, 0), canKick: true }, mustPlayer(state, 1)],
      bombs: [
        {
          id: 77,
          ownerId: 2,
          x: 2,
          y: 1,
          range: 2,
          fuseTicks: 60,
          movingDirection: "none",
          isPowerBomb: false,
          carriedByPlayerId: null
        }
      ],
      nextBombId: 78
    };

    state = stepMatch({ intents: { 1: { moveX: 1, moveY: 0, placeBomb: false } } }, state, DEFAULT_CONFIG).state;
    const kickedBomb = state.bombs.find((bomb) => bomb.id === 77);
    expect(kickedBomb?.movingDirection).toBe("right");
    expect((kickedBomb?.x ?? 0) > 2).toBe(true);

    let placedState = createMatch({ map: baseMap, slots, seed: 211 });
    placedState = {
      ...placedState,
      players: [{ ...mustPlayer(placedState, 0), canKick: true }, mustPlayer(placedState, 1)]
    };

    placedState = stepMatch(
      { intents: { 1: { moveX: 1, moveY: 0, placeBomb: true } } },
      placedState,
      DEFAULT_CONFIG
    ).state;
    const newlyPlaced = placedState.bombs[0];
    expect(newlyPlaced?.movingDirection).toBe("none");
  });

  it("stops kicked bombs when they collide with a player", () => {
    let state = createMatch({ map: baseMap, slots, seed: 177 });
    state = {
      ...state,
      players: [{ ...mustPlayer(state, 0), x: 1, y: 1 }, { ...mustPlayer(state, 1), x: 3, y: 1 }],
      bombs: [
        {
          id: 99,
          ownerId: 1,
          x: 2.45,
          y: 1,
          range: 2,
          fuseTicks: 60,
          movingDirection: "right",
          isPowerBomb: false,
          carriedByPlayerId: null
        }
      ],
      nextBombId: 100
    };

    state = stepMatch(emptyFrame, state, DEFAULT_CONFIG).state;
    const bomb = state.bombs.find((entry) => entry.id === 99);
    expect(bomb?.movingDirection).toBe("none");
    expect(Math.round(bomb?.x ?? 0)).toBe(2);
    expect(Math.round(bomb?.y ?? 0)).toBe(1);
  });

  it("never settles a blocked moving bomb onto an occupied bomb tile", () => {
    let state = createMatch({ map: baseMap, slots, seed: 188 });
    state = {
      ...state,
      players: [{ ...mustPlayer(state, 0), x: 1, y: 1 }, { ...mustPlayer(state, 1), x: 11, y: 9 }],
      bombs: [
        {
          id: 101,
          ownerId: 1,
          x: 2.62,
          y: 1,
          range: 2,
          fuseTicks: 60,
          movingDirection: "right",
          isPowerBomb: false,
          carriedByPlayerId: null
        },
        {
          id: 102,
          ownerId: 2,
          x: 3,
          y: 1,
          range: 2,
          fuseTicks: 60,
          movingDirection: "none",
          isPowerBomb: false,
          carriedByPlayerId: null
        }
      ],
      nextBombId: 103
    };

    state = stepMatch(emptyFrame, state, DEFAULT_CONFIG).state;
    const bomb = state.bombs.find((entry) => entry.id === 101);
    expect(bomb?.movingDirection).toBe("none");
    expect(Math.round(bomb?.x ?? 0)).toBe(2);
    expect(Math.round(bomb?.y ?? 0)).toBe(1);
  });

  it("releases bomb capacity when sudden death removes a bomb", () => {
    const config = {
      ...DEFAULT_CONFIG,
      suddenDeathStartSeconds: 0,
      suddenDeathIntervalTicks: 1
    };
    let state = createMatch({ map: baseMap, slots, seed: 313, config });
    state = {
      ...state,
      players: [{ ...mustPlayer(state, 0), activeBombs: 1 }, mustPlayer(state, 1)],
      bombs: [
        {
          id: 88,
          ownerId: 1,
          x: 1,
          y: 1,
          range: 2,
          fuseTicks: 999,
          movingDirection: "none",
          isPowerBomb: false,
          carriedByPlayerId: null
        }
      ],
      nextBombId: 89
    };

    state = stepMatch(emptyFrame, state, config).state;
    expect(mustPlayer(state, 0).activeBombs).toBe(0);
    expect(state.bombs.find((bomb) => bomb.id === 88)).toBeUndefined();
  });

  it("stacks extra-bomb pickups and allows placing additional bombs", () => {
    let state = createMatch({ map: baseMap, slots, seed: 404 });
    const startingMaxBombs = mustPlayer(state, 0).maxBombs;

    state = {
      ...state,
      powerUps: [{ id: 9001, x: 1, y: 1, kind: "extraBomb" }]
    };
    state = stepMatch(emptyFrame, state, DEFAULT_CONFIG).state;
    expect(mustPlayer(state, 0).maxBombs).toBe(startingMaxBombs + 1);

    state = {
      ...state,
      powerUps: [{ id: 9002, x: 1, y: 1, kind: "extraBomb" }]
    };
    state = stepMatch(emptyFrame, state, DEFAULT_CONFIG).state;
    expect(mustPlayer(state, 0).maxBombs).toBe(startingMaxBombs + 2);

    state = stepMatch({ intents: { 1: { moveX: 0, moveY: 0, placeBomb: true } } }, state, DEFAULT_CONFIG).state;
    state = { ...state, players: [{ ...mustPlayer(state, 0), x: 2, y: 1 }, mustPlayer(state, 1)] };
    state = stepMatch({ intents: { 1: { moveX: 0, moveY: 0, placeBomb: true } } }, state, DEFAULT_CONFIG).state;
    state = { ...state, players: [{ ...mustPlayer(state, 0), x: 3, y: 1 }, mustPlayer(state, 1)] };
    state = stepMatch({ intents: { 1: { moveX: 0, moveY: 0, placeBomb: true } } }, state, DEFAULT_CONFIG).state;

    expect(mustPlayer(state, 0).activeBombs).toBe(3);
    expect(state.bombs.length).toBe(3);
  });

  it("does not place a bomb on a tile occupied by another player", () => {
    let state = createMatch({ map: baseMap, slots, seed: 808 });
    state = {
      ...state,
      players: [{ ...mustPlayer(state, 0), x: 1, y: 1 }, { ...mustPlayer(state, 1), x: 1, y: 1 }]
    };

    state = stepMatch({ intents: { 1: { moveX: 0, moveY: 0, placeBomb: true } } }, state, DEFAULT_CONFIG).state;
    expect(state.bombs.length).toBe(0);
    expect(mustPlayer(state, 0).activeBombs).toBe(0);
  });

  it("places a bomb on the nearest legal tile while between tile centers", () => {
    let state = createMatch({ map: baseMap, slots, seed: 809 });
    state = {
      ...state,
      players: [{ ...mustPlayer(state, 0), x: 1.34, y: 1 }, mustPlayer(state, 1)]
    };

    state = stepMatch({ intents: { 1: { moveX: 0, moveY: 0, placeBomb: true } } }, state, DEFAULT_CONFIG).state;
    expect(state.bombs.length).toBe(1);
    expect(mustPlayer(state, 0).activeBombs).toBe(1);
    expect(state.bombs[0]?.x).toBe(1);
    expect(state.bombs[0]?.y).toBe(1);
  });

  it("nudges players toward tile centers while moving along a lane", () => {
    let state = createMatch({ map: baseMap, slots, seed: 810 });
    state = {
      ...state,
      players: [{ ...mustPlayer(state, 0), x: 1.34, y: 1 }, mustPlayer(state, 1)]
    };

    state = stepMatch({ intents: { 1: { moveX: 0, moveY: 1, placeBomb: false } } }, state, DEFAULT_CONFIG).state;
    const player = mustPlayer(state, 0);
    expect(player.x).toBeLessThan(1.34);
    expect(player.y).toBeGreaterThan(1);
  });

  it("applies full-fire and power-bomb behaviors", () => {
    const map: MapDefinition = {
      ...baseMap,
      softRows: baseMap.softRows.map((row, y) => {
        if (y !== 1) return row;
        const chars = row.split("");
        chars[2] = "s";
        chars[3] = "s";
        chars[4] = "s";
        return chars.join("");
      })
    };

    const config = { ...DEFAULT_CONFIG, bombFuseTicks: 1, maxBombRange: 6 };
    let state = createMatch({ map, slots, seed: 505, config });
    state = {
      ...state,
      players: [{ ...mustPlayer(state, 0), canPowerBomb: true, bombRange: 6, spawnInvulnerabilityTicks: 99 }, mustPlayer(state, 1)]
    };

    state = stepMatch({ intents: { 1: { moveX: 0, moveY: 0, placeBomb: true } } }, state, config).state;
    state = advance(state, 3, emptyFrame, config);
    expect(state.tiles[1]?.[2]).toBe("empty");
    expect(state.tiles[1]?.[3]).toBe("empty");
    expect(state.tiles[1]?.[4]).toBe("empty");
  });

  it("supports glove pickup and throw actions", () => {
    const config = { ...DEFAULT_CONFIG, bombFuseTicks: 120 };
    let state = createMatch({ map: baseMap, slots, seed: 606, config });
    state = {
      ...state,
      players: [{ ...mustPlayer(state, 0), canGlove: true, activeBombs: 1 }, mustPlayer(state, 1)],
      bombs: [
        {
          id: 501,
          ownerId: 1,
          x: 1,
          y: 1,
          range: 2,
          fuseTicks: 80,
          movingDirection: "none",
          isPowerBomb: false,
          carriedByPlayerId: null
        }
      ],
      nextBombId: 502
    };

    state = stepMatch({ intents: { 1: { moveX: 0, moveY: 0, placeBomb: true } } }, state, config).state;
    expect(mustPlayer(state, 0).carriedBombId).toBe(501);

    state = stepMatch({ intents: { 1: { moveX: 1, moveY: 0, placeBomb: true } } }, state, config).state;
    const thrown = state.bombs.find((bomb) => bomb.id === 501);
    expect(mustPlayer(state, 0).carriedBombId).toBeNull();
    expect(thrown?.carriedByPlayerId).toBeNull();
    expect(thrown?.movingDirection).toBe("right");
  });

  it("applies skull curse with active duration", () => {
    let state = createMatch({ map: baseMap, slots, seed: 707 });
    state = {
      ...state,
      powerUps: [{ id: 7001, x: 1, y: 1, kind: "skull" }]
    };

    state = stepMatch(emptyFrame, state, DEFAULT_CONFIG).state;
    expect(mustPlayer(state, 0).skullCurse).not.toBe("none");
    expect(mustPlayer(state, 0).skullTicks).toBeGreaterThan(0);
  });

  it("scatters defeated player upgrades as pickups across the map", () => {
    const config = { ...DEFAULT_CONFIG, invulnerabilityTicks: 0 };
    let state = createMatch({ map: baseMap, slots, seed: 1111, config });
    state = {
      ...state,
      players: [
        {
          ...mustPlayer(state, 0),
          x: 1,
          y: 1,
          spawnInvulnerabilityTicks: 0,
          maxBombs: 3,
          bombRange: 4,
          speedLevel: 2,
          canKick: true
        },
        { ...mustPlayer(state, 1), x: 11, y: 9, spawnInvulnerabilityTicks: 0 }
      ],
      flames: [
        {
          id: 5001,
          ownerId: 2,
          x: 1,
          y: 1,
          ttlTicks: 2
        }
      ]
    };

    state = stepMatch(emptyFrame, state, config).state;
    expect(mustPlayer(state, 0).alive).toBe(false);
    expect(state.powerUps.length).toBeGreaterThan(0);
    expect(state.powerUps.some((powerUp) => powerUp.kind === "extraBomb")).toBe(true);
    expect(state.powerUps.some((powerUp) => powerUp.kind === "speedUp")).toBe(true);
    expect(state.powerUps.some((powerUp) => powerUp.kind === "kick")).toBe(true);
    expect(state.powerUps.some((powerUp) => powerUp.x !== 1 || powerUp.y !== 1)).toBe(true);

    const uniqueCells = new Set(state.powerUps.map((powerUp) => `${powerUp.x},${powerUp.y}`));
    expect(uniqueCells.size).toBe(state.powerUps.length);
  });
});
