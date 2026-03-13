export const DIRECTIONS = ["up", "down", "left", "right", "none"] as const;
export type Direction = (typeof DIRECTIONS)[number];

export const POWER_UP_TYPES = [
  "extraBomb",
  "flameUp",
  "fullFire",
  "speedUp",
  "kick",
  "glove",
  "powerBomb",
  "skull"
] as const;
export type PowerUpType = (typeof POWER_UP_TYPES)[number];

export type MatchPhase = "active" | "finished";
export type ControllerType = "human" | "bot";
export const BOT_DIFFICULTIES = ["easy", "normal", "hard"] as const;
export type BotDifficulty = (typeof BOT_DIFFICULTIES)[number];
export type MatchFinishReason = "elimination" | "suddenDeath" | "timeout";

export interface GameConfig {
  readonly tickRate: number;
  readonly width: number;
  readonly height: number;
  readonly matchDurationSeconds: number;
  readonly suddenDeathStartSeconds: number;
  readonly suddenDeathIntervalTicks: number;
  readonly basePlayerSpeed: number;
  readonly maxSpeedLevel: number;
  readonly bombFuseTicks: number;
  readonly flameTicks: number;
  readonly invulnerabilityTicks: number;
  readonly baseBombRange: number;
  readonly baseBombCapacity: number;
  readonly bombKickSpeedCellsPerTick: number;
  readonly maxBombRange: number;
  readonly maxBombCapacity: number;
  readonly powerUpDropChance: number;
  readonly botDifficulty: BotDifficulty;
}

export interface PlayerSlot {
  readonly id: number;
  readonly name: string;
  readonly color: number;
  readonly controller: ControllerType;
  readonly spawnX: number;
  readonly spawnY: number;
}

export interface PlayerIntent {
  readonly moveX: -1 | 0 | 1;
  readonly moveY: -1 | 0 | 1;
  readonly placeBomb: boolean;
}

export interface InputFrame {
  readonly intents: Record<number, PlayerIntent>;
}

export interface PlayerState {
  id: number;
  slotIndex: number;
  name: string;
  color: number;
  controller: ControllerType;
  alive: boolean;
  x: number;
  y: number;
  direction: Direction;
  speedLevel: number;
  maxBombs: number;
  bombRange: number;
  activeBombs: number;
  spawnInvulnerabilityTicks: number;
  canKick: boolean;
  canGlove: boolean;
  canPowerBomb: boolean;
  carriedBombId: number | null;
  skullCurse: "none" | "reverse" | "slow" | "noBomb";
  skullTicks: number;
  score: number;
}

export interface BombState {
  id: number;
  ownerId: number;
  x: number;
  y: number;
  range: number;
  fuseTicks: number;
  movingDirection: Direction;
  isPowerBomb: boolean;
  carriedByPlayerId: number | null;
}

export interface FlameState {
  id: number;
  ownerId: number;
  x: number;
  y: number;
  ttlTicks: number;
}

export interface PowerUpState {
  id: number;
  x: number;
  y: number;
  kind: PowerUpType;
  spawnShieldTicks?: number;
}

export type TileType = "empty" | "hard" | "soft" | "suddenDeath";

export interface SimEvent {
  tick: number;
  type:
    | "bomb_placed"
    | "bomb_exploded"
    | "soft_block_destroyed"
    | "player_hit"
    | "player_eliminated"
    | "pickup"
    | "sudden_death_tile"
    | "match_finished";
  payload: Record<string, number | string | boolean | null>;
}

export interface MatchState {
  tick: number;
  phase: MatchPhase;
  winnerId: number | null;
  matchFinishedReason: MatchFinishReason | null;
  width: number;
  height: number;
  timerTicksRemaining: number;
  suddenDeathTicksRemaining: number;
  suddenDeathIndex: number;
  randomSeed: number;
  tiles: TileType[][];
  players: PlayerState[];
  bombs: BombState[];
  flames: FlameState[];
  powerUps: PowerUpState[];
  events: SimEvent[];
  nextBombId: number;
  nextFlameId: number;
  nextPowerUpId: number;
}

export interface SimulationStepResult {
  readonly state: MatchState;
  readonly events: SimEvent[];
}

export interface MapDefinition {
  readonly id: string;
  readonly name: string;
  readonly width: number;
  readonly height: number;
  readonly softRows: string[];
}
