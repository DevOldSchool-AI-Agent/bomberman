import type { InputFrame } from "../../simulation";

export interface BattleTransientState {
  accumulatorMs: number;
  resultDelayTicks: number;
  paused: boolean;
  replayPlaybackCursor: number;
  recordedReplayFrames: InputFrame[];
}

export function createBattleTransientState(): BattleTransientState {
  return {
    accumulatorMs: 0,
    resultDelayTicks: -1,
    paused: false,
    replayPlaybackCursor: 0,
    recordedReplayFrames: []
  };
}
