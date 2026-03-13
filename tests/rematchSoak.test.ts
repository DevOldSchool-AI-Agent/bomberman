import { describe, expect, it } from "vitest";
import { MAPS } from "../src/content/maps";
import { DEFAULT_CONFIG, createPlayerSlotsFromLobby, createMatch, stepMatch } from "../src/simulation";

const soakConfig = {
  ...DEFAULT_CONFIG,
  matchDurationSeconds: 24,
  suddenDeathStartSeconds: 10,
  suddenDeathIntervalTicks: 6,
  invulnerabilityTicks: 45
};

const soakSlots = createPlayerSlotsFromLobby([
  { name: "CPU-1", controller: "bot", color: 0x54c8ff },
  { name: "CPU-2", controller: "bot", color: 0xff6666 },
  { name: "CPU-3", controller: "bot", color: 0x6de287 },
  { name: "CPU-4", controller: "bot", color: 0xf5e36c }
]);

type MatchSummary = {
  winnerId: number | null;
  tick: number;
  alive: number[];
  mapId: string;
};

function runSingleMatch(seed: number): MatchSummary {
  const map = MAPS[seed % MAPS.length] ?? MAPS[0];
  if (!map) {
    throw new Error("No maps available for soak test");
  }
  let state = createMatch({
    map,
    slots: soakSlots,
    seed,
    config: soakConfig
  });

  const suddenDeathBoundTicks = soakConfig.width * soakConfig.height * soakConfig.suddenDeathIntervalTicks;
  const maxTicks = Math.floor(soakConfig.matchDurationSeconds * soakConfig.tickRate) + suddenDeathBoundTicks + soakConfig.tickRate * 5;
  for (let tick = 0; tick < maxTicks && state.phase !== "finished"; tick += 1) {
    state = stepMatch({ intents: {} }, state, soakConfig).state;
  }

  expect(state.phase).toBe("finished");
  return {
    winnerId: state.winnerId,
    tick: state.tick,
    alive: state.players.filter((player) => player.alive).map((player) => player.id),
    mapId: map.id
  };
}

function runRematchCycle(rounds: number, seedBase: number): MatchSummary[] {
  const summaries: MatchSummary[] = [];
  for (let round = 0; round < rounds; round += 1) {
    summaries.push(runSingleMatch(seedBase + round * 97));
  }
  return summaries;
}

describe("rematch soak", () => {
  it("resolves 60 deterministic rematches without flow regressions", () => {
    const rounds = 60;
    const firstPass = runRematchCycle(rounds, 2400);
    const secondPass = runRematchCycle(rounds, 2400);

    expect(firstPass).toHaveLength(rounds);
    expect(secondPass).toHaveLength(rounds);
    expect(firstPass).toEqual(secondPass);
  });
});
