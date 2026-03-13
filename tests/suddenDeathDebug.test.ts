import { describe, expect, it } from "vitest";
import { computeSuddenDeathCountdownSkip } from "../src/ui/scenes/suddenDeathDebug";

describe("sudden death debug skip", () => {
  it("jumps to the configured countdown window before sudden death", () => {
    const result = computeSuddenDeathCountdownSkip(
      80,
      8000,
      {
        tickRate: 60,
        suddenDeathStartSeconds: 120
      },
      10
    );

    expect(result.skipped).toBe(true);
    expect(result.targetTick).toBe(6600);
    expect(result.deltaTicks).toBe(6520);
    expect(result.timerTicksRemaining).toBe(1480);
  });

  it("does not skip if already at or past the countdown window", () => {
    const result = computeSuddenDeathCountdownSkip(
      6610,
      3000,
      {
        tickRate: 60,
        suddenDeathStartSeconds: 120
      },
      10
    );

    expect(result.skipped).toBe(false);
    expect(result.targetTick).toBe(6610);
    expect(result.deltaTicks).toBe(0);
    expect(result.timerTicksRemaining).toBe(3000);
  });

  it("clamps remaining timer ticks at zero after large skips", () => {
    const result = computeSuddenDeathCountdownSkip(
      0,
      100,
      {
        tickRate: 60,
        suddenDeathStartSeconds: 20
      },
      10
    );

    expect(result.skipped).toBe(true);
    expect(result.timerTicksRemaining).toBe(0);
  });
});
