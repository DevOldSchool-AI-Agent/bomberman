import { buildTilesFromMap } from "../content/mapTiles";
import type { MapDefinition } from "./types";
import { DEFAULT_CONFIG } from "./config";
import type { GameConfig, MatchState, PlayerSlot } from "./types";

export interface CreateMatchOptions {
  readonly config?: Partial<GameConfig>;
  readonly map: MapDefinition;
  readonly slots: PlayerSlot[];
  readonly seed?: number;
}

export function createPlayerSlotsFromLobby(selected: Array<{ name: string; controller: "human" | "bot"; color: number }>): PlayerSlot[] {
  const spawns: Array<[number, number]> = [
    [1, 1],
    [11, 1],
    [1, 9],
    [11, 9]
  ];

  return selected.map((entry, index) => ({
    id: index + 1,
    name: entry.name,
    color: entry.color,
    controller: entry.controller,
    spawnX: spawns[index]?.[0] ?? 1,
    spawnY: spawns[index]?.[1] ?? 1
  }));
}

export function createMatch({ config, map, slots, seed = 123456789 }: CreateMatchOptions): MatchState {
  const effectiveConfig: GameConfig = {
    ...DEFAULT_CONFIG,
    ...config
  };
  const timerTicksRemaining = Math.floor(effectiveConfig.matchDurationSeconds * effectiveConfig.tickRate);
  const suddenDeathTicksRemaining = 0;

  return {
    tick: 0,
    phase: "active",
    winnerId: null,
    matchFinishedReason: null,
    width: map.width,
    height: map.height,
    timerTicksRemaining,
    suddenDeathTicksRemaining,
    suddenDeathIndex: 0,
    randomSeed: seed,
    tiles: buildTilesFromMap(map),
    players: slots.map((slot, slotIndex) => ({
      id: slot.id,
      slotIndex,
      name: slot.name,
      color: slot.color,
      controller: slot.controller,
      alive: true,
      x: slot.spawnX,
      y: slot.spawnY,
      direction: "down",
      speedLevel: 0,
      maxBombs: effectiveConfig.baseBombCapacity,
      bombRange: effectiveConfig.baseBombRange,
      activeBombs: 0,
      spawnInvulnerabilityTicks: effectiveConfig.invulnerabilityTicks,
      canKick: false,
      canGlove: false,
      canPowerBomb: false,
      carriedBombId: null,
      skullCurse: "none",
      skullTicks: 0,
      score: 0
    })),
    bombs: [],
    flames: [],
    powerUps: [],
    events: [],
    nextBombId: 1,
    nextFlameId: 1,
    nextPowerUpId: 1
  };
}
