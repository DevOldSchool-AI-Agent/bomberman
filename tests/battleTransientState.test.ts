import { describe, expect, it } from "vitest";
import { createBattleTransientState } from "../src/ui/scenes/battleTransientState";

describe("battle transient state", () => {
  it("resets per-round runtime values for rematch flow", () => {
    const nextRound = createBattleTransientState();
    expect(nextRound.accumulatorMs).toBe(0);
    expect(nextRound.resultDelayTicks).toBe(-1);
    expect(nextRound.paused).toBe(false);
    expect(nextRound.replayPlaybackCursor).toBe(0);
    expect(nextRound.recordedReplayFrames).toEqual([]);
  });

  it("creates isolated replay buffers between rounds", () => {
    const first = createBattleTransientState();
    first.recordedReplayFrames.push({ intents: { 1: { moveX: 1, moveY: 0, placeBomb: false } } });

    const second = createBattleTransientState();
    expect(second.recordedReplayFrames).toEqual([]);
  });
});
