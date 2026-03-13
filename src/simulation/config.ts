import type { GameConfig } from "./types";

export const DEFAULT_CONFIG: GameConfig = {
  tickRate: 60,
  width: 13,
  height: 11,
  matchDurationSeconds: 180,
  suddenDeathStartSeconds: 120,
  suddenDeathIntervalTicks: 75,
  basePlayerSpeed: 2.8,
  maxSpeedLevel: 6,
  bombFuseTicks: 150,
  flameTicks: 26,
  invulnerabilityTicks: 120,
  baseBombRange: 2,
  baseBombCapacity: 1,
  bombKickSpeedCellsPerTick: 0.12,
  maxBombRange: 8,
  maxBombCapacity: 8,
  powerUpDropChance: 0.42,
  botDifficulty: "normal"
};
