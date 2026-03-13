import { cellKey, DIRECTION_VECTORS, inBounds } from "../simulation/helpers";
import { DEFAULT_CONFIG } from "../simulation/config";
import type { BombState, BotDifficulty, Direction, GameConfig, InputFrame, MatchState, PlayerIntent, PlayerState } from "../simulation/types";

type BotDirection = "up" | "down" | "left" | "right";

type SearchNode = {
  x: number;
  y: number;
  depth: number;
  firstMove: Direction;
};

const CARDINAL_DIRECTIONS: BotDirection[] = ["up", "right", "down", "left"];

type BotProfile = {
  escapeDepth: number;
  pickupDepth: number;
  pressureDepth: number;
  chaseDepth: number;
  patrolDepth: number;
  fallbackDepth: number;
  dangerFuseThreshold: number;
  placeHazardThreshold: number;
  pressureRange: number;
  softBreakCadence: number;
  maxActiveBombsBeforePlant: number;
  idleCadence: number;
};

export interface BotDebugDecision {
  readonly playerId: number;
  readonly name: string;
  readonly x: number;
  readonly y: number;
  readonly moveDirection: Direction;
  readonly placeBomb: boolean;
  readonly escaping: boolean;
  readonly nearestThreatId: number | null;
  readonly nearestThreatDistance: number | null;
  readonly hazardTick: number | null;
  readonly summary: string;
}

const BOT_PROFILES: Record<BotDifficulty, BotProfile> = {
  easy: {
    escapeDepth: 8,
    pickupDepth: 7,
    pressureDepth: 6,
    chaseDepth: 12,
    patrolDepth: 14,
    fallbackDepth: 2,
    dangerFuseThreshold: 6,
    placeHazardThreshold: 12,
    pressureRange: 2,
    softBreakCadence: 44,
    maxActiveBombsBeforePlant: 0,
    idleCadence: 11
  },
  normal: {
    escapeDepth: 10,
    pickupDepth: 10,
    pressureDepth: 8,
    chaseDepth: 16,
    patrolDepth: 18,
    fallbackDepth: 2,
    dangerFuseThreshold: 9,
    placeHazardThreshold: 18,
    pressureRange: 3,
    softBreakCadence: 28,
    maxActiveBombsBeforePlant: 0,
    idleCadence: 0
  },
  hard: {
    escapeDepth: 12,
    pickupDepth: 12,
    pressureDepth: 10,
    chaseDepth: 20,
    patrolDepth: 20,
    fallbackDepth: 3,
    dangerFuseThreshold: 12,
    placeHazardThreshold: 24,
    pressureRange: 4,
    softBreakCadence: 18,
    maxActiveBombsBeforePlant: 0,
    idleCadence: 0
  }
};

function directionOrder(state: MatchState, player: PlayerState): BotDirection[] {
  const start = (Math.floor(state.tick / 20) + player.id) % CARDINAL_DIRECTIONS.length;
  return CARDINAL_DIRECTIONS.map((_, index) => CARDINAL_DIRECTIONS[(start + index) % CARDINAL_DIRECTIONS.length]!);
}

function bombAtCell(bombs: BombState[], x: number, y: number): BombState | undefined {
  return bombs.find((bomb) => Math.round(bomb.x) === x && Math.round(bomb.y) === y);
}

function tileBlocksMovement(state: MatchState, x: number, y: number): boolean {
  const tile = state.tiles[y]?.[x] ?? "hard";
  return tile !== "empty";
}

function isWalkableCell(state: MatchState, bombs: BombState[], player: PlayerState, x: number, y: number, startX: number, startY: number): boolean {
  if (!inBounds(state.width, state.height, x, y)) {
    return false;
  }
  if (tileBlocksMovement(state, x, y)) {
    return false;
  }

  const bomb = bombAtCell(bombs, x, y);
  if (!bomb) {
    return true;
  }

  // Preserve the simulation rule that a player can stand on the bomb they just placed.
  return bomb.ownerId === player.id && x === startX && y === startY;
}

function blastCellsForBomb(state: MatchState, bomb: BombState): Set<string> {
  const cells = new Set<string>();
  const originX = Math.round(bomb.x);
  const originY = Math.round(bomb.y);
  cells.add(cellKey(originX, originY));

  for (const direction of CARDINAL_DIRECTIONS) {
    const vector = DIRECTION_VECTORS[direction];
    for (let distance = 1; distance <= bomb.range; distance += 1) {
      const x = originX + vector.x * distance;
      const y = originY + vector.y * distance;
      if (!inBounds(state.width, state.height, x, y)) {
        break;
      }

      const tile = state.tiles[y]?.[x] ?? "hard";
      if (tile === "hard" || tile === "suddenDeath") {
        break;
      }

      cells.add(cellKey(x, y));
      if (tile === "soft" && !bomb.isPowerBomb) {
        break;
      }
    }
  }

  return cells;
}

function buildDetonationTicks(state: MatchState, bombs: BombState[]): Map<number, number> {
  const detonationTicks = new Map<number, number>();
  const blastByBomb = new Map<number, Set<string>>();
  const bombCell = new Map<number, string>();

  for (const bomb of bombs) {
    detonationTicks.set(bomb.id, Math.max(1, bomb.fuseTicks));
    blastByBomb.set(bomb.id, blastCellsForBomb(state, bomb));
    bombCell.set(bomb.id, cellKey(Math.round(bomb.x), Math.round(bomb.y)));
  }

  for (let i = 0; i < bombs.length; i += 1) {
    let changed = false;

    for (const bomb of bombs) {
      const currentTick = detonationTicks.get(bomb.id) ?? Math.max(1, bomb.fuseTicks);
      const originCell = bombCell.get(bomb.id);
      if (!originCell) {
        continue;
      }

      let earliestTrigger = currentTick;
      for (const candidate of bombs) {
        if (candidate.id === bomb.id) {
          continue;
        }
        const candidateBlast = blastByBomb.get(candidate.id);
        if (!candidateBlast?.has(originCell)) {
          continue;
        }
        const candidateTick = detonationTicks.get(candidate.id) ?? Math.max(1, candidate.fuseTicks);
        if (candidateTick < earliestTrigger) {
          earliestTrigger = candidateTick;
        }
      }

      if (earliestTrigger < currentTick) {
        detonationTicks.set(bomb.id, earliestTrigger);
        changed = true;
      }
    }

    if (!changed) {
      break;
    }
  }

  return detonationTicks;
}

function buildHazardTicks(state: MatchState, bombs = state.bombs): Map<string, number> {
  const hazardTicks = new Map<string, number>();
  const detonationTicks = buildDetonationTicks(state, bombs);

  for (const flame of state.flames) {
    hazardTicks.set(cellKey(flame.x, flame.y), 0);
  }

  for (const bomb of bombs) {
    const detonationTick = detonationTicks.get(bomb.id) ?? Math.max(1, bomb.fuseTicks);
    const blastCells = blastCellsForBomb(state, bomb);
    for (const cell of blastCells) {
      const existing = hazardTicks.get(cell);
      if (existing === undefined || detonationTick < existing) {
        hazardTicks.set(cell, detonationTick);
      }
    }
  }

  return hazardTicks;
}

function isSafeAtArrival(state: MatchState, hazardTicks: Map<string, number>, x: number, y: number, arrivalTick: number): boolean {
  if (!inBounds(state.width, state.height, x, y)) {
    return false;
  }
  if (state.tiles[y]?.[x] === "suddenDeath") {
    return false;
  }

  const hazardTick = hazardTicks.get(cellKey(x, y));
  if (hazardTick === undefined) {
    return true;
  }

  return arrivalTick + 1 < hazardTick;
}

function findPathDirection(
  state: MatchState,
  bombs: BombState[],
  player: PlayerState,
  hazardTicks: Map<string, number>,
  maxDepth: number,
  target: (x: number, y: number, depth: number) => boolean
): Direction {
  const startX = Math.round(player.x);
  const startY = Math.round(player.y);
  const queue: SearchNode[] = [{ x: startX, y: startY, depth: 0, firstMove: "none" }];
  const visited = new Set<string>([cellKey(startX, startY)]);
  const orderedDirections = directionOrder(state, player);

  while (queue.length > 0) {
    const node = queue.shift();
    if (!node) {
      continue;
    }

    for (const direction of orderedDirections) {
      const vector = DIRECTION_VECTORS[direction];
      const nextX = node.x + vector.x;
      const nextY = node.y + vector.y;
      const nextDepth = node.depth + 1;
      if (nextDepth > maxDepth) {
        continue;
      }

      if (!isWalkableCell(state, bombs, player, nextX, nextY, startX, startY)) {
        continue;
      }
      if (!isSafeAtArrival(state, hazardTicks, nextX, nextY, nextDepth)) {
        continue;
      }

      const key = cellKey(nextX, nextY);
      if (visited.has(key)) {
        continue;
      }
      visited.add(key);

      const firstMove = node.firstMove === "none" ? direction : node.firstMove;
      if (target(nextX, nextY, nextDepth)) {
        return firstMove;
      }

      queue.push({ x: nextX, y: nextY, depth: nextDepth, firstMove });
    }
  }

  return "none";
}

function nearestOpponent(player: PlayerState, state: MatchState): PlayerState | null {
  let best: PlayerState | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const other of state.players) {
    if (!other.alive || other.id === player.id) {
      continue;
    }
    const distance = Math.abs(Math.round(other.x) - Math.round(player.x)) + Math.abs(Math.round(other.y) - Math.round(player.y));
    if (distance < bestDistance) {
      best = other;
      bestDistance = distance;
    }
  }
  return best;
}

function ownBlastCells(state: MatchState, player: PlayerState): Set<string> {
  const cells = new Set<string>();
  for (const bomb of state.bombs) {
    if (bomb.ownerId !== player.id) {
      continue;
    }
    const blast = blastCellsForBomb(state, bomb);
    for (const cell of blast) {
      cells.add(cell);
    }
  }
  return cells;
}

function patrolTargets(state: MatchState): Array<{ x: number; y: number }> {
  return [
    { x: 1, y: 1 },
    { x: state.width - 2, y: 1 },
    { x: 1, y: state.height - 2 },
    { x: state.width - 2, y: state.height - 2 },
    { x: Math.floor(state.width / 2), y: Math.floor(state.height / 2) }
  ];
}

function suddenDeathActive(state: MatchState): boolean {
  if (state.suddenDeathIndex > 0) {
    return true;
  }
  return state.tiles.some((row) => row.includes("suddenDeath"));
}

function cellRingLayer(state: MatchState, x: number, y: number): number {
  const left = x - 1;
  const right = state.width - 2 - x;
  const top = y - 1;
  const bottom = state.height - 2 - y;
  return Math.max(0, Math.min(left, right, top, bottom));
}

function maxRingLayer(state: MatchState): number {
  const playableWidth = Math.max(1, state.width - 2);
  const playableHeight = Math.max(1, state.height - 2);
  return Math.max(0, Math.floor((Math.min(playableWidth, playableHeight) - 1) / 2));
}

function targetRingLayerForSuddenDeath(state: MatchState): number {
  const maxLayer = maxRingLayer(state);
  if (maxLayer <= 1) {
    return maxLayer;
  }

  const totalInnerCells = Math.max(1, (state.width - 2) * (state.height - 2));
  const progress = Math.min(1, state.suddenDeathIndex / totalInnerCells);
  return Math.min(maxLayer, Math.max(1, Math.floor(progress * maxLayer) + 1));
}

function pressureTargets(state: MatchState, player: PlayerState): Set<string> {
  const targets = new Set<string>();
  for (const other of state.players) {
    if (!other.alive || other.id === player.id) {
      continue;
    }
    const ox = Math.round(other.x);
    const oy = Math.round(other.y);
    for (const direction of CARDINAL_DIRECTIONS) {
      const vector = DIRECTION_VECTORS[direction];
      const tx = ox + vector.x;
      const ty = oy + vector.y;
      if (!inBounds(state.width, state.height, tx, ty)) {
        continue;
      }
      if (state.tiles[ty]?.[tx] === "empty") {
        targets.add(cellKey(tx, ty));
      }
    }
  }
  return targets;
}

function directionToIntent(direction: Direction): PlayerIntent {
  const vector = DIRECTION_VECTORS[direction];
  return {
    moveX: vector.x as -1 | 0 | 1,
    moveY: vector.y as -1 | 0 | 1,
    placeBomb: false
  };
}

function closestOpponentInBlastLine(state: MatchState, player: PlayerState, x: number, y: number): number | null {
  let bestDistance: number | null = null;
  for (const direction of CARDINAL_DIRECTIONS) {
    const vector = DIRECTION_VECTORS[direction];
    for (let distance = 1; distance <= player.bombRange; distance += 1) {
      const nx = x + vector.x * distance;
      const ny = y + vector.y * distance;
      if (!inBounds(state.width, state.height, nx, ny)) {
        break;
      }
      const tile = state.tiles[ny]?.[nx] ?? "hard";
      if (tile === "hard" || tile === "suddenDeath") {
        break;
      }

      if (state.players.some((other) => other.alive && other.id !== player.id && Math.round(other.x) === nx && Math.round(other.y) === ny)) {
        if (bestDistance === null || distance < bestDistance) {
          bestDistance = distance;
        }
        break;
      }

      if (tile === "soft") {
        break;
      }
    }
  }
  return bestDistance;
}

function hasAdjacentSoftBlock(state: MatchState, x: number, y: number): boolean {
  for (const direction of CARDINAL_DIRECTIONS) {
    const vector = DIRECTION_VECTORS[direction];
    const nx = x + vector.x;
    const ny = y + vector.y;
    if (!inBounds(state.width, state.height, nx, ny)) {
      continue;
    }
    if (state.tiles[ny]?.[nx] === "soft") {
      return true;
    }
  }
  return false;
}

function canPlantAtCell(state: MatchState, player: PlayerState, x: number, y: number): boolean {
  if (!inBounds(state.width, state.height, x, y)) {
    return false;
  }
  if (state.tiles[y]?.[x] !== "empty") {
    return false;
  }
  if (bombAtCell(state.bombs, x, y)) {
    return false;
  }
  return !state.players.some(
    (other) => other.alive && other.id !== player.id && Math.round(other.x) === x && Math.round(other.y) === y
  );
}

function collectPlantCandidates(player: PlayerState, moveDirection: Direction): Array<{ x: number; y: number }> {
  const candidates: Array<{ x: number; y: number }> = [];
  const seen = new Set<string>();
  const roundedX = Math.round(player.x);
  const roundedY = Math.round(player.y);

  const addCandidate = (x: number, y: number): void => {
    const key = cellKey(x, y);
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    candidates.push({ x, y });
  };

  addCandidate(roundedX, roundedY);
  addCandidate(Math.floor(player.x), roundedY);
  addCandidate(Math.ceil(player.x), roundedY);
  addCandidate(roundedX, Math.floor(player.y));
  addCandidate(roundedX, Math.ceil(player.y));

  if (moveDirection !== "none") {
    const vector = DIRECTION_VECTORS[moveDirection];
    addCandidate(roundedX + vector.x, roundedY + vector.y);
  }

  const movementMagnitude = moveDirection === "none" ? 0 : 1;
  candidates.sort((a, b) => {
    const distA = (player.x - a.x) ** 2 + (player.y - a.y) ** 2;
    const distB = (player.x - b.x) ** 2 + (player.y - b.y) ** 2;
    if (movementMagnitude === 0 || moveDirection === "none") {
      return distA - distB;
    }
    const vector = DIRECTION_VECTORS[moveDirection];
    const dirBiasA = (a.x - player.x) * vector.x + (a.y - player.y) * vector.y;
    const dirBiasB = (b.x - player.x) * vector.x + (b.y - player.y) * vector.y;
    const behindPenaltyA = dirBiasA < -0.05 ? 1.2 : 0;
    const behindPenaltyB = dirBiasB < -0.05 ? 1.2 : 0;
    return distA - dirBiasA * 0.45 + behindPenaltyA - (distB - dirBiasB * 0.45 + behindPenaltyB);
  });

  return candidates;
}

function findPlantCell(state: MatchState, player: PlayerState, moveDirection: Direction): { x: number; y: number } | null {
  const candidates = collectPlantCandidates(player, moveDirection);
  for (const candidate of candidates) {
    if (canPlantAtCell(state, player, candidate.x, candidate.y)) {
      return candidate;
    }
  }
  return null;
}

function hasSafeEscapeAfterPlanting(
  state: MatchState,
  player: PlayerState,
  x: number,
  y: number,
  config: Pick<GameConfig, "bombFuseTicks">
): boolean {
  const startX = x;
  const startY = y;
  const hypotheticalBomb: BombState = {
    id: -1,
    ownerId: player.id,
    x,
    y,
    range: player.bombRange,
    fuseTicks: Math.max(1, config.bombFuseTicks),
    movingDirection: "none",
    isPowerBomb: player.canPowerBomb,
    carriedByPlayerId: null
  };

  const bombsAfterPlant = [...state.bombs, hypotheticalBomb];
  const hazardAfterPlant = buildHazardTicks(state, bombsAfterPlant);
  const ownBlast = blastCellsForBomb(state, hypotheticalBomb);
  const queue: Array<{ x: number; y: number; depth: number }> = [{ x: startX, y: startY, depth: 0 }];
  const visited = new Set<string>([cellKey(startX, startY)]);
  const orderedDirections = directionOrder(state, player);
  const maxDepth = Math.max(6, Math.min(12, Math.floor(config.bombFuseTicks / 20)));

  while (queue.length > 0) {
    const node = queue.shift();
    if (!node) {
      continue;
    }

    const currentKey = cellKey(node.x, node.y);
    const cellHazardTick = hazardAfterPlant.get(currentKey);
    const stableSafetyWindow = cellHazardTick === undefined || cellHazardTick - node.depth >= 3;
    if (
      node.depth > 0 &&
      !ownBlast.has(currentKey) &&
      stableSafetyWindow &&
      isSafeAtArrival(state, hazardAfterPlant, node.x, node.y, node.depth)
    ) {
      return true;
    }

    if (node.depth >= maxDepth) {
      continue;
    }

    for (const direction of orderedDirections) {
      const vector = DIRECTION_VECTORS[direction];
      const nx = node.x + vector.x;
      const ny = node.y + vector.y;
      const nextDepth = node.depth + 1;
      const key = cellKey(nx, ny);
      if (visited.has(key)) {
        continue;
      }
      if (!isWalkableCell(state, bombsAfterPlant, player, nx, ny, startX, startY)) {
        continue;
      }
      if (!isSafeAtArrival(state, hazardAfterPlant, nx, ny, nextDepth)) {
        continue;
      }
      visited.add(key);
      queue.push({ x: nx, y: ny, depth: nextDepth });
    }
  }

  return false;
}

function chooseMovementDirection(
  state: MatchState,
  player: PlayerState,
  hazardTicks: Map<string, number>,
  nearestThreat: PlayerState,
  profile: BotProfile
): { direction: Direction; escaping: boolean } {
  const startX = Math.round(player.x);
  const startY = Math.round(player.y);
  const threatX = Math.round(nearestThreat.x);
  const threatY = Math.round(nearestThreat.y);
  const threatDistance = Math.abs(startX - threatX) + Math.abs(startY - threatY);
  const startCell = cellKey(startX, startY);
  const currentHazardTick = hazardTicks.get(cellKey(startX, startY));
  const ownBlast = ownBlastCells(state, player);
  const inOwnBlastLane = ownBlast.has(startCell);
  const mustEscape =
    !isSafeAtArrival(state, hazardTicks, startX, startY, 0) ||
    (currentHazardTick !== undefined && currentHazardTick <= profile.dangerFuseThreshold) ||
    inOwnBlastLane;

  if (mustEscape) {
    const escapeDirection = findPathDirection(
      state,
      state.bombs,
      player,
      hazardTicks,
      profile.escapeDepth,
      (x, y, depth) => depth >= 1 && !ownBlast.has(cellKey(x, y))
    );
    return { direction: escapeDirection, escaping: true };
  }

  if (suddenDeathActive(state)) {
    const currentLayer = cellRingLayer(state, startX, startY);
    const targetLayer = targetRingLayerForSuddenDeath(state);
    if (currentLayer < targetLayer) {
      const centerDirection = findPathDirection(
        state,
        state.bombs,
        player,
        hazardTicks,
        Math.max(profile.pickupDepth, profile.chaseDepth),
        (x, y, depth) => depth >= 1 && cellRingLayer(state, x, y) >= targetLayer
      );
      if (centerDirection !== "none") {
        return { direction: centerDirection, escaping: false };
      }
    }
  }

  if (threatDistance <= 1) {
    const separationDirection = findPathDirection(
      state,
      state.bombs,
      player,
      hazardTicks,
      profile.pressureDepth,
      (x, y) => {
        const distance = Math.abs(x - threatX) + Math.abs(y - threatY);
        return distance >= 2 && distance <= 3;
      }
    );
    if (separationDirection !== "none") {
      return { direction: separationDirection, escaping: false };
    }
  }

  if (state.powerUps.length > 0) {
    const pickupCells = new Set(state.powerUps.map((powerUp) => cellKey(powerUp.x, powerUp.y)));
    const pickupDirection = findPathDirection(
      state,
      state.bombs,
      player,
      hazardTicks,
      profile.pickupDepth,
      (x, y) => pickupCells.has(cellKey(x, y))
    );
    if (pickupDirection !== "none") {
      return { direction: pickupDirection, escaping: false };
    }
  }

  const pressureCells = pressureTargets(state, player);
  if (pressureCells.size > 0) {
    const blastDistance = closestOpponentInBlastLine(state, player, startX, startY);
    if (pressureCells.has(startCell) && blastDistance !== null && blastDistance <= profile.pressureRange) {
      return { direction: "none", escaping: false };
    }
    const pressureDirection = findPathDirection(
      state,
      state.bombs,
      player,
      hazardTicks,
      profile.pressureDepth,
      (x, y) => pressureCells.has(cellKey(x, y))
    );
    if (pressureDirection !== "none") {
      return { direction: pressureDirection, escaping: false };
    }
  }

  const chaseDirection = findPathDirection(
    state,
    state.bombs,
    player,
    hazardTicks,
    profile.chaseDepth,
    (x, y) => Math.abs(x - threatX) + Math.abs(y - threatY) <= 2
  );
  if (chaseDirection !== "none") {
    return { direction: chaseDirection, escaping: false };
  }

  const patrol = patrolTargets(state);
  const patrolIndex = (Math.floor(state.tick / 180) + player.id) % patrol.length;
  const waypoint = patrol[patrolIndex];
  const patrolDirection = waypoint
    ? findPathDirection(state, state.bombs, player, hazardTicks, profile.patrolDepth, (x, y) => x === waypoint.x && y === waypoint.y)
    : "none";
  if (patrolDirection !== "none") {
    return { direction: patrolDirection, escaping: false };
  }

  const fallbackDirection = findPathDirection(
    state,
    state.bombs,
    player,
    hazardTicks,
    profile.fallbackDepth,
    (_x, _y, depth) => depth >= 1
  );
  return { direction: fallbackDirection, escaping: false };
}

function shouldPlaceBomb(
  state: MatchState,
  player: PlayerState,
  escaping: boolean,
  hazardTicks: Map<string, number>,
  profile: BotProfile,
  moveDirection: Direction,
  nearestThreatDistance: number,
  config: Pick<GameConfig, "bombFuseTicks">
): boolean {
  if (
    escaping ||
    !player.alive ||
    player.activeBombs >= player.maxBombs ||
    player.skullCurse === "noBomb" ||
    player.activeBombs > profile.maxActiveBombsBeforePlant
  ) {
    return false;
  }

  const placement = findPlantCell(state, player, moveDirection);
  if (!placement) {
    return false;
  }
  const x = placement.x;
  const y = placement.y;

  const currentHazardTick = hazardTicks.get(cellKey(x, y));
  if (currentHazardTick !== undefined && currentHazardTick <= profile.placeHazardThreshold) {
    return false;
  }

  const opponentDistance = closestOpponentInBlastLine(state, player, x, y);
  const closePressureOpportunity = nearestThreatDistance <= 2;
  const pressureOpportunity = opponentDistance !== null && opponentDistance <= profile.pressureRange;
  const softBreakOpportunity = hasAdjacentSoftBlock(state, x, y);
  const aggressiveOpportunity = nearestThreatDistance <= profile.pressureRange;
  const inSuddenDeath = suddenDeathActive(state);

  if (!pressureOpportunity && !softBreakOpportunity && !closePressureOpportunity && !aggressiveOpportunity) {
    return false;
  }

  if (inSuddenDeath) {
    const plantingLayer = cellRingLayer(state, x, y);
    if (plantingLayer <= 0) {
      return false;
    }
    if (!pressureOpportunity && !closePressureOpportunity) {
      return false;
    }
  }

  if (!hasSafeEscapeAfterPlanting(state, player, x, y, config)) {
    return false;
  }

  if (pressureOpportunity || closePressureOpportunity) {
    return true;
  }

  if (aggressiveOpportunity) {
    const aggressiveCadence = Math.max(10, Math.floor(profile.softBreakCadence * 0.5));
    return (state.tick + player.id * 5) % aggressiveCadence === 0;
  }

  return (state.tick + player.id * 7) % profile.softBreakCadence === 0;
}

type BotIntentComputation = {
  intent: PlayerIntent;
  moveDirection: Direction;
  placeBomb: boolean;
  escaping: boolean;
  nearestThreatId: number | null;
  nearestThreatDistance: number | null;
  hazardTick: number | null;
  summary: string;
};

function computeBotIntent(
  state: MatchState,
  player: PlayerState,
  hazardTicks: Map<string, number>,
  profile: BotProfile,
  config: Pick<GameConfig, "bombFuseTicks">
): BotIntentComputation {
  const nearestThreat = nearestOpponent(player, state);
  const px = Math.round(player.x);
  const py = Math.round(player.y);
  const hazardTick = hazardTicks.get(cellKey(px, py)) ?? null;

  if (!nearestThreat) {
    return {
      intent: { moveX: 0, moveY: 0, placeBomb: false },
      moveDirection: "none",
      placeBomb: false,
      escaping: false,
      nearestThreatId: null,
      nearestThreatDistance: null,
      hazardTick,
      summary: "no-target"
    };
  }

  const threatX = Math.round(nearestThreat.x);
  const threatY = Math.round(nearestThreat.y);
  const threatDistance = Math.abs(px - threatX) + Math.abs(py - threatY);

  if (profile.idleCadence > 0 && (state.tick + player.id * 11) % profile.idleCadence === 0) {
    return {
      intent: { moveX: 0, moveY: 0, placeBomb: false },
      moveDirection: "none",
      placeBomb: false,
      escaping: false,
      nearestThreatId: nearestThreat.id,
      nearestThreatDistance: threatDistance,
      hazardTick,
      summary: "idle-cadence"
    };
  }

  const movement = chooseMovementDirection(state, player, hazardTicks, nearestThreat, profile);
  const moveDirection = movement.direction;
  const placeBomb = shouldPlaceBomb(state, player, movement.escaping, hazardTicks, profile, moveDirection, threatDistance, config);
  const intent: PlayerIntent = {
    ...directionToIntent(moveDirection),
    placeBomb
  };

  let summary = "hold";
  if (movement.escaping) {
    summary = moveDirection === "none" ? "escape-stuck" : "escape";
  } else if (placeBomb) {
    summary = "plant";
  } else if (moveDirection !== "none") {
    summary = state.powerUps.length > 0 ? "pickup-route" : "pressure-route";
  }

  return {
    intent,
    moveDirection,
    placeBomb,
    escaping: movement.escaping,
    nearestThreatId: nearestThreat.id,
    nearestThreatDistance: threatDistance,
    hazardTick,
    summary
  };
}

export function applyBotIntents(
  state: MatchState,
  frame: InputFrame,
  difficulty: BotDifficulty = "normal",
  config: Pick<GameConfig, "bombFuseTicks"> = DEFAULT_CONFIG
): InputFrame {
  const intents: Record<number, PlayerIntent> = { ...frame.intents };
  const hazardTicks = buildHazardTicks(state);
  const profile = BOT_PROFILES[difficulty] ?? BOT_PROFILES.normal;

  for (const player of state.players) {
    if (!player.alive || player.controller !== "bot") {
      continue;
    }
    intents[player.id] = computeBotIntent(state, player, hazardTicks, profile, config).intent;
  }

  return { intents };
}

export function deriveBotDebugDecisions(
  state: MatchState,
  _frame: InputFrame,
  difficulty: BotDifficulty = "normal",
  config: Pick<GameConfig, "bombFuseTicks"> = DEFAULT_CONFIG
): BotDebugDecision[] {
  const hazardTicks = buildHazardTicks(state);
  const profile = BOT_PROFILES[difficulty] ?? BOT_PROFILES.normal;
  const decisions: BotDebugDecision[] = [];

  for (const player of state.players) {
    if (player.controller !== "bot") {
      continue;
    }

    const computed = computeBotIntent(state, player, hazardTicks, profile, config);
    decisions.push({
      playerId: player.id,
      name: player.name,
      x: Math.round(player.x),
      y: Math.round(player.y),
      moveDirection: computed.moveDirection,
      placeBomb: computed.placeBomb,
      escaping: computed.escaping,
      nearestThreatId: computed.nearestThreatId,
      nearestThreatDistance: computed.nearestThreatDistance,
      hazardTick: computed.hazardTick,
      summary: computed.summary
    });
  }

  decisions.sort((a, b) => a.playerId - b.playerId);
  return decisions;
}
