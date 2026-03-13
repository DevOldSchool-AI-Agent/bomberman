import { describe, expect, it } from "vitest";
import { deriveBotDebugDecisions } from "../src/bot/botLogic";
import { MAPS } from "../src/content/maps";
import { createMatch } from "../src/simulation/createMatch";
import { DEFAULT_CONFIG } from "../src/simulation/config";
import { stepMatch } from "../src/simulation/stepMatch";
import type { InputFrame, MatchState, PlayerSlot } from "../src/simulation/types";

const slots: PlayerSlot[] = [
  { id: 1, name: "CPU", color: 0xffffff, controller: "bot", spawnX: 1, spawnY: 1 },
  { id: 2, name: "P2", color: 0xff0000, controller: "human", spawnX: 11, spawnY: 9 }
];

const EMPTY_FRAME: InputFrame = { intents: {} };

type Observation = {
  mapId: string;
  mapName: string;
  plantedBombTicks: number;
  engagedFrames: number;
  engagedNoProgressStreak: number;
  lowVarWindows: number;
  pressureRouteFrames: number;
  escapeFrames: number;
  plantFrames: number;
  finalSummary: string;
};

function findEngagementPair(state: MatchState): { botX: number; botY: number; humanX: number; humanY: number } {
  const empties: Array<{ x: number; y: number }> = [];
  for (let y = 1; y < state.height - 1; y += 1) {
    for (let x = 1; x < state.width - 1; x += 1) {
      if (state.tiles[y]?.[x] === "empty") {
        empties.push({ x, y });
      }
    }
  }

  const neighborCount = (x: number, y: number): number => {
    let count = 0;
    const dirs: Array<[number, number]> = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1]
    ];
    for (const [dx, dy] of dirs) {
      if (state.tiles[y + dy]?.[x + dx] === "empty") {
        count += 1;
      }
    }
    return count;
  };

  for (const bot of empties) {
    if (neighborCount(bot.x, bot.y) < 2) {
      continue;
    }
    for (const human of empties) {
      if (bot.x === human.x && bot.y === human.y) {
        continue;
      }
      const distance = Math.abs(bot.x - human.x) + Math.abs(bot.y - human.y);
      if (distance < 2 || distance > 4) {
        continue;
      }
      return { botX: bot.x, botY: bot.y, humanX: human.x, humanY: human.y };
    }
  }

  return { botX: 1, botY: 1, humanX: 3, humanY: 1 };
}

function observeBotForMap(mapIndex: number): Observation {
  const map = MAPS[mapIndex]!;
  let state = createMatch({
    map,
    slots,
    seed: 991 + mapIndex,
    config: { ...DEFAULT_CONFIG, botDifficulty: "normal" }
  });

  const pair = findEngagementPair(state);

  // Start close enough to trigger pressure logic and potential loops.
  state = {
    ...state,
    players: [
      {
        ...state.players[0]!,
        x: pair.botX,
        y: pair.botY,
        controller: "bot",
        activeBombs: 0,
        maxBombs: 1,
        bombRange: 2,
        spawnInvulnerabilityTicks: 9999
      },
      {
        ...state.players[1]!,
        x: pair.humanX,
        y: pair.humanY,
        controller: "human",
        spawnInvulnerabilityTicks: 9999
      }
    ]
  };

  const recentCells: string[] = [];
  let plantedBombTicks = 0;
  let engagedFrames = 0;
  let noProgressStreak = 0;
  let engagedNoProgressStreak = 0;
  let lowVarWindows = 0;
  let pressureRouteFrames = 0;
  let escapeFrames = 0;
  let plantFrames = 0;
  let lastSummary = "none";

  for (let i = 0; i < 300; i += 1) {
    const botBefore = state.players[0]!;
    const humanBefore = state.players[1]!;
    const decisions = deriveBotDebugDecisions(state, EMPTY_FRAME, "normal");
    const botDecision = decisions.find((decision) => decision.playerId === 1);
    if (!botDecision) {
      continue;
    }

    lastSummary = botDecision.summary;
    if (botDecision.placeBomb) {
      plantedBombTicks += 1;
    }

    const beforeCell = `${Math.round(botBefore.x)},${Math.round(botBefore.y)}`;
    state = stepMatch(EMPTY_FRAME, state, { ...DEFAULT_CONFIG, botDifficulty: "normal" }).state;
    const botAfter = state.players[0]!;
    const humanAfter = state.players[1]!;
    const afterCell = `${Math.round(botAfter.x)},${Math.round(botAfter.y)}`;
    const moved = beforeCell !== afterCell;
    const bothAlive = botAfter.alive && humanAfter.alive;
    const threatDistance =
      botDecision.nearestThreatDistance ??
      (Math.abs(Math.round(botBefore.x) - Math.round(humanBefore.x)) + Math.abs(Math.round(botBefore.y) - Math.round(humanBefore.y)));
    const engaged = bothAlive && threatDistance <= 4;

    if (engaged) {
      engagedFrames += 1;
      if (botDecision.summary === "pressure-route") {
        pressureRouteFrames += 1;
      }
      if (botDecision.summary === "escape" || botDecision.summary === "escape-stuck") {
        escapeFrames += 1;
      }
      if (botDecision.summary === "plant") {
        plantFrames += 1;
      }
      if (!moved && !botDecision.placeBomb) {
        noProgressStreak += 1;
        engagedNoProgressStreak = Math.max(engagedNoProgressStreak, noProgressStreak);
      } else {
        noProgressStreak = 0;
      }
    } else {
      noProgressStreak = 0;
    }

    recentCells.push(afterCell);
    if (recentCells.length > 90) {
      recentCells.shift();
    }
    if (recentCells.length === 90) {
      const unique = new Set(recentCells);
      if (unique.size <= 2) {
        lowVarWindows += 1;
      }
    }
  }

  return {
    mapId: map.id,
    mapName: map.name,
    plantedBombTicks,
    engagedFrames,
    engagedNoProgressStreak,
    lowVarWindows,
    pressureRouteFrames,
    escapeFrames,
    plantFrames,
    finalSummary: lastSummary
  };
}

function observeOverlapCase(): {
  engagedFrames: number;
  noBombFrames: number;
  pressureRouteFrames: number;
  uniqueCells: number;
} {
  let state = createMatch({
    map: MAPS[4]!,
    slots,
    seed: 1337,
    config: { ...DEFAULT_CONFIG, botDifficulty: "normal" }
  });

  state = {
    ...state,
    players: [
      {
        ...state.players[0]!,
        x: 5,
        y: 1,
        controller: "bot",
        activeBombs: 0,
        maxBombs: 1,
        bombRange: 2,
        spawnInvulnerabilityTicks: 9999
      },
      { ...state.players[1]!, x: 5, y: 1, controller: "human", spawnInvulnerabilityTicks: 9999 }
    ]
  };

  let engagedFrames = 0;
  let noBombFrames = 0;
  let pressureRouteFrames = 0;
  const visited = new Set<string>();

  for (let i = 0; i < 180; i += 1) {
    const decisions = deriveBotDebugDecisions(state, EMPTY_FRAME, "normal");
    const botDecision = decisions.find((decision) => decision.playerId === 1);
    if (!botDecision) {
      continue;
    }
    engagedFrames += 1;
    if (!botDecision.placeBomb) {
      noBombFrames += 1;
    }
    if (botDecision.summary === "pressure-route") {
      pressureRouteFrames += 1;
    }

    state = stepMatch(EMPTY_FRAME, state, { ...DEFAULT_CONFIG, botDifficulty: "normal" }).state;
    visited.add(`${Math.round(state.players[0]!.x)},${Math.round(state.players[0]!.y)}`);
  }

  return {
    engagedFrames,
    noBombFrames,
    pressureRouteFrames,
    uniqueCells: visited.size
  };
}

describe("bot stuck observation", () => {
  it("observes bot behavior across maps and reports low-variance loops", () => {
    const observations = MAPS.map((_, index) => observeBotForMap(index));
    const overlap = observeOverlapCase();
    console.table(observations);
    console.table([overlap]);

    // Observation sanity: ensure the harness exercised all maps.
    expect(observations.length).toBe(MAPS.length);
    expect(observations.some((row) => row.plantedBombTicks >= 1)).toBe(true);
    expect(overlap.noBombFrames).toBeLessThan(overlap.engagedFrames);
  });
});
