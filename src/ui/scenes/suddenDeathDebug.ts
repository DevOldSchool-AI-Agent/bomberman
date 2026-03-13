import type { GameConfig } from "../../simulation/types";

export interface SuddenDeathCountdownSkip {
  skipped: boolean;
  targetTick: number;
  deltaTicks: number;
  timerTicksRemaining: number;
}

export function computeSuddenDeathCountdownSkip(
  currentTick: number,
  timerTicksRemaining: number,
  config: Pick<GameConfig, "tickRate" | "suddenDeathStartSeconds">,
  countdownSeconds = 10
): SuddenDeathCountdownSkip {
  const safeTickRate = Math.max(1, Math.floor(config.tickRate));
  const suddenDeathStartTick = Math.max(0, Math.floor(config.suddenDeathStartSeconds * safeTickRate));
  const warningTicks = Math.max(0, Math.floor(countdownSeconds * safeTickRate));
  const targetTick = Math.max(0, suddenDeathStartTick - warningTicks);

  if (currentTick >= targetTick) {
    return {
      skipped: false,
      targetTick: currentTick,
      deltaTicks: 0,
      timerTicksRemaining: Math.max(0, Math.floor(timerTicksRemaining))
    };
  }

  const deltaTicks = targetTick - currentTick;
  return {
    skipped: true,
    targetTick,
    deltaTicks,
    timerTicksRemaining: Math.max(0, Math.floor(timerTicksRemaining) - deltaTicks)
  };
}
