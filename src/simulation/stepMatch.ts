import { applyBotIntents } from "../bot/botLogic";
import { POWER_UP_TYPES } from "./types";
import { cellKey, clamp, DIRECTION_VECTORS, inBounds, isBlockingTile } from "./helpers";
import { nextRng } from "./rng";
import type {
  BombState,
  GameConfig,
  InputFrame,
  MatchState,
  PlayerIntent,
  PlayerState,
  PowerUpState,
  PowerUpType,
  SimEvent,
  SimulationStepResult
} from "./types";

const POWERUP_DROP_POOL: PowerUpType[] = [
  "extraBomb",
  "extraBomb",
  "extraBomb",
  "flameUp",
  "fullFire",
  "speedUp",
  "kick",
  "glove",
  "powerBomb",
  "skull"
];

const SKULL_CURSE_POOL: Array<PlayerState["skullCurse"]> = ["reverse", "slow", "noBomb"];
const LANE_ALIGN_FACTOR = 0.28;
const LANE_ALIGN_MIN_OFFSET = 0.16;

function cloneState(state: MatchState): MatchState {
  return {
    ...state,
    tiles: state.tiles.map((row) => [...row]),
    players: state.players.map((player) => ({ ...player })),
    bombs: state.bombs.map((bomb) => ({ ...bomb })),
    flames: state.flames.map((flame) => ({ ...flame })),
    powerUps: state.powerUps.map((powerUp) => ({ ...powerUp })),
    events: []
  };
}

function resolveDirection(intent: PlayerIntent, fallback: PlayerState["direction"]): PlayerState["direction"] {
  if (intent.moveX > 0) return "right";
  if (intent.moveX < 0) return "left";
  if (intent.moveY > 0) return "down";
  if (intent.moveY < 0) return "up";
  return fallback;
}

function directionFromIntent(intent: PlayerIntent): PlayerState["direction"] {
  if (intent.moveX > 0) return "right";
  if (intent.moveX < 0) return "left";
  if (intent.moveY > 0) return "down";
  if (intent.moveY < 0) return "up";
  return "none";
}

function bombAt(bombs: BombState[], x: number, y: number): BombState | undefined {
  return bombs.find((bomb) => Math.round(bomb.x) === x && Math.round(bomb.y) === y);
}

function flameAt(state: MatchState, x: number, y: number): boolean {
  return state.flames.some((flame) => flame.x === x && flame.y === y);
}

function isTileWalkable(state: MatchState, player: PlayerState, x: number, y: number): boolean {
  if (!inBounds(state.width, state.height, x, y)) {
    return false;
  }

  const tile = state.tiles[y]?.[x] ?? "hard";
  if (tile === "hard" || tile === "suddenDeath") {
    return false;
  }
  if (tile === "soft") {
    return false;
  }

  const bomb = bombAt(state.bombs, x, y);
  if (bomb) {
    const ownerIsSelf = bomb.ownerId === player.id;
    const sharingCell = Math.round(player.x) === x && Math.round(player.y) === y;
    if (!ownerIsSelf || !sharingCell) {
      return false;
    }
  }

  return true;
}

function approachValue(value: number, target: number, maxDelta: number): number {
  if (value < target) {
    return Math.min(target, value + maxDelta);
  }
  if (value > target) {
    return Math.max(target, value - maxDelta);
  }
  return value;
}

function alignAxisTowardCenter(
  state: MatchState,
  player: PlayerState,
  axis: "x" | "y",
  axisValue: number,
  otherAxisValue: number,
  maxDelta: number
): number {
  const primaryCenter = Math.round(axisValue);
  if (Math.abs(axisValue - primaryCenter) < LANE_ALIGN_MIN_OFFSET) {
    return axisValue;
  }
  const secondaryCenter = primaryCenter + (axisValue >= primaryCenter ? -1 : 1);

  const centerIsWalkable = (center: number): boolean => {
    const x = axis === "x" ? center : Math.round(otherAxisValue);
    const y = axis === "y" ? center : Math.round(otherAxisValue);
    return isTileWalkable(state, player, x, y);
  };

  if (centerIsWalkable(primaryCenter)) {
    return approachValue(axisValue, primaryCenter, maxDelta);
  }
  if (centerIsWalkable(secondaryCenter)) {
    return approachValue(axisValue, secondaryCenter, maxDelta);
  }

  return axisValue;
}

function stepPlayerMovement(state: MatchState, player: PlayerState, intent: PlayerIntent, config: GameConfig): PlayerState {
  if (!player.alive) {
    return player;
  }

  const slowMultiplier = player.skullCurse === "slow" ? 0.55 : 1;
  const speedCellsPerTick = ((config.basePlayerSpeed + player.speedLevel * 0.28) / config.tickRate) * slowMultiplier;
  const dx = intent.moveX * speedCellsPerTick;
  const dy = intent.moveY * speedCellsPerTick;
  const laneAlignDelta = speedCellsPerTick * LANE_ALIGN_FACTOR;

  const next: PlayerState = {
    ...player,
    spawnInvulnerabilityTicks: Math.max(0, player.spawnInvulnerabilityTicks - 1),
    direction: resolveDirection(intent, player.direction),
    skullTicks: Math.max(0, player.skullTicks - 1)
  };

  if (next.skullTicks <= 0) {
    next.skullCurse = "none";
  }

  const horizontalOnly = intent.moveX !== 0 && intent.moveY === 0;
  const verticalOnly = intent.moveY !== 0 && intent.moveX === 0;

  if (horizontalOnly) {
    next.y = alignAxisTowardCenter(state, next, "y", next.y, next.x, laneAlignDelta);
  }
  if (verticalOnly) {
    next.x = alignAxisTowardCenter(state, next, "x", next.x, next.y, laneAlignDelta);
  }

  const proposedX = next.x + dx;
  const proposedY = next.y + dy;

  const targetX = Math.round(proposedX);
  const targetY = Math.round(next.y);
  if (isTileWalkable(state, next, targetX, targetY)) {
    next.x = clamp(proposedX, 0, state.width - 1);
  }

  const targetX2 = Math.round(next.x);
  const targetY2 = Math.round(proposedY);
  if (isTileWalkable(state, next, targetX2, targetY2)) {
    next.y = clamp(proposedY, 0, state.height - 1);
  }

  return next;
}

function addEvent(state: MatchState, event: Omit<SimEvent, "tick">): void {
  state.events.push({ ...event, tick: state.tick });
}

function maybeDropPowerUp(state: MatchState, config: GameConfig, x: number, y: number): void {
  let rng = nextRng(state.randomSeed);
  state.randomSeed = rng.seed;
  if (rng.value > config.powerUpDropChance) {
    return;
  }

  rng = nextRng(state.randomSeed);
  state.randomSeed = rng.seed;
  const index = Math.floor(rng.value * POWERUP_DROP_POOL.length);
  const kind = POWERUP_DROP_POOL[Math.max(0, Math.min(POWERUP_DROP_POOL.length - 1, index))] ?? POWER_UP_TYPES[0]!;

  const powerUpId = state.nextPowerUpId;
  state.powerUps.push({
    id: powerUpId,
    x,
    y,
    kind,
    spawnShieldTicks: config.flameTicks
  });
  state.nextPowerUpId = powerUpId + 1;
}

function applySkullCurse(state: MatchState, player: PlayerState, config: GameConfig): PlayerState {
  const rng = nextRng(state.randomSeed);
  state.randomSeed = rng.seed;
  const index = Math.floor(rng.value * SKULL_CURSE_POOL.length);
  const curse = SKULL_CURSE_POOL[Math.max(0, Math.min(SKULL_CURSE_POOL.length - 1, index))] ?? "reverse";

  return {
    ...player,
    skullCurse: curse,
    skullTicks: config.tickRate * 12
  };
}

function applyPowerUp(state: MatchState, player: PlayerState, powerUp: PowerUpState, config: GameConfig): PlayerState {
  switch (powerUp.kind) {
    case "extraBomb":
      return { ...player, maxBombs: Math.min(config.maxBombCapacity, player.maxBombs + 1) };
    case "flameUp":
      return { ...player, bombRange: Math.min(config.maxBombRange, player.bombRange + 1) };
    case "fullFire":
      return { ...player, bombRange: config.maxBombRange };
    case "speedUp":
      return { ...player, speedLevel: Math.min(config.maxSpeedLevel, player.speedLevel + 1) };
    case "kick":
      return { ...player, canKick: true };
    case "glove":
      return { ...player, canGlove: true };
    case "powerBomb":
      return { ...player, canPowerBomb: true };
    case "skull":
      return applySkullCurse(state, player, config);
    default:
      return player;
  }
}

function collectEliminationDrops(player: PlayerState, config: GameConfig): PowerUpType[] {
  const drops: PowerUpType[] = [];

  const extraBombCount = Math.max(0, player.maxBombs - config.baseBombCapacity);
  for (let i = 0; i < extraBombCount; i += 1) {
    drops.push("extraBomb");
  }

  const rangeIncrease = Math.max(0, player.bombRange - config.baseBombRange);
  if (rangeIncrease > 0) {
    if (player.bombRange >= config.maxBombRange) {
      drops.push("fullFire");
    } else {
      for (let i = 0; i < rangeIncrease; i += 1) {
        drops.push("flameUp");
      }
    }
  }

  for (let i = 0; i < player.speedLevel; i += 1) {
    drops.push("speedUp");
  }
  if (player.canKick) drops.push("kick");
  if (player.canGlove) drops.push("glove");
  if (player.canPowerBomb) drops.push("powerBomb");

  return drops;
}

function buildDropCells(state: MatchState, excludeCell: { x: number; y: number }): Array<{ x: number; y: number }> {
  const cells: Array<{ x: number; y: number }> = [];
  for (let y = 0; y < state.height; y += 1) {
    for (let x = 0; x < state.width; x += 1) {
      if (x === excludeCell.x && y === excludeCell.y) {
        continue;
      }
      if (state.tiles[y]?.[x] !== "empty") {
        continue;
      }
      if (bombAt(state.bombs, x, y)) {
        continue;
      }
      if (state.powerUps.some((powerUp) => powerUp.x === x && powerUp.y === y)) {
        continue;
      }
      if (state.players.some((player) => player.alive && Math.round(player.x) === x && Math.round(player.y) === y)) {
        continue;
      }
      cells.push({ x, y });
    }
  }
  return cells;
}

function scatterEliminationDrops(
  state: MatchState,
  drops: PowerUpType[],
  deathCell: { x: number; y: number },
  config: GameConfig
): void {
  if (drops.length === 0) {
    return;
  }
  const availableCells = buildDropCells(state, deathCell);
  if (availableCells.length === 0) {
    return;
  }

  for (const kind of drops) {
    if (availableCells.length === 0) {
      break;
    }

    const rng = nextRng(state.randomSeed);
    state.randomSeed = rng.seed;
    const index = Math.floor(rng.value * availableCells.length);
    const cell = availableCells.splice(index, 1)[0];
    if (!cell) {
      continue;
    }

    const powerUpId = state.nextPowerUpId;
    state.powerUps.push({
      id: powerUpId,
      x: cell.x,
      y: cell.y,
      kind,
      spawnShieldTicks: config.flameTicks
    });
    state.nextPowerUpId = powerUpId + 1;
  }
}

function triggerExplosion(state: MatchState, bomb: BombState, config: GameConfig): void {
  const originX = Math.round(bomb.x);
  const originY = Math.round(bomb.y);

  addEvent(state, {
    type: "bomb_exploded",
    payload: { bombId: bomb.id, ownerId: bomb.ownerId, x: originX, y: originY, isPowerBomb: bomb.isPowerBomb }
  });

  const createFlame = (x: number, y: number): void => {
    if (!inBounds(state.width, state.height, x, y)) return;
    state.flames.push({
      id: state.nextFlameId,
      ownerId: bomb.ownerId,
      x,
      y,
      ttlTicks: config.flameTicks
    });
    state.nextFlameId += 1;
  };

  createFlame(originX, originY);

  for (const direction of ["up", "down", "left", "right"] as const) {
    const vector = DIRECTION_VECTORS[direction];
    for (let dist = 1; dist <= bomb.range; dist += 1) {
      const x = originX + vector.x * dist;
      const y = originY + vector.y * dist;
      if (!inBounds(state.width, state.height, x, y)) {
        break;
      }

      const tile = state.tiles[y]?.[x] ?? "hard";
      if (tile === "hard" || tile === "suddenDeath") {
        break;
      }

      createFlame(x, y);

      if (tile === "soft") {
        const row = state.tiles[y];
        if (row) {
          row[x] = "empty";
        }
        addEvent(state, { type: "soft_block_destroyed", payload: { x, y } });
        maybeDropPowerUp(state, config, x, y);

        if (!bomb.isPowerBomb) {
          break;
        }
      }
    }
  }

  for (const candidate of state.bombs) {
    if (candidate.id === bomb.id) {
      continue;
    }
    if (state.flames.some((flame) => flame.x === Math.round(candidate.x) && flame.y === Math.round(candidate.y))) {
      candidate.fuseTicks = 0;
    }
  }

  const owner = state.players.find((player) => player.id === bomb.ownerId);
  if (owner) {
    owner.activeBombs = Math.max(0, owner.activeBombs - 1);
  }

  if (bomb.carriedByPlayerId !== null) {
    const carrier = state.players.find((player) => player.id === bomb.carriedByPlayerId);
    if (carrier) {
      carrier.carriedBombId = null;
    }
  }
}

function applySuddenDeath(state: MatchState, config: GameConfig): void {
  if (state.tick < config.suddenDeathStartSeconds * config.tickRate) {
    return;
  }
  if (state.suddenDeathTicksRemaining > 0) {
    state.suddenDeathTicksRemaining -= 1;
    return;
  }

  const ringCells = buildSuddenDeathRing(state.width, state.height);
  if (state.suddenDeathIndex >= ringCells.length) {
    return;
  }

  const cell = ringCells[state.suddenDeathIndex];
  state.suddenDeathTicksRemaining = config.suddenDeathIntervalTicks;
  state.suddenDeathIndex += 1;

  if (!cell) {
    return;
  }

  const row = state.tiles[cell.y];
  if (row) {
    row[cell.x] = "suddenDeath";
  }
  state.powerUps = state.powerUps.filter((powerUp) => !(powerUp.x === cell.x && powerUp.y === cell.y));

  const removedBombs = state.bombs.filter((bomb) => Math.round(bomb.x) === cell.x && Math.round(bomb.y) === cell.y);
  state.bombs = state.bombs.filter((bomb) => !(Math.round(bomb.x) === cell.x && Math.round(bomb.y) === cell.y));

  for (const bomb of removedBombs) {
    const owner = state.players.find((player) => player.id === bomb.ownerId);
    if (owner) {
      owner.activeBombs = Math.max(0, owner.activeBombs - 1);
    }

    if (bomb.carriedByPlayerId !== null) {
      const carrier = state.players.find((player) => player.id === bomb.carriedByPlayerId);
      if (carrier) {
        carrier.carriedBombId = null;
      }
    }
  }

  addEvent(state, { type: "sudden_death_tile", payload: { x: cell.x, y: cell.y } });
}

function buildSuddenDeathRing(width: number, height: number): Array<{ x: number; y: number }> {
  const cells: Array<{ x: number; y: number }> = [];
  let minX = 1;
  let minY = 1;
  let maxX = width - 2;
  let maxY = height - 2;

  while (minX <= maxX && minY <= maxY) {
    for (let x = minX; x <= maxX; x += 1) cells.push({ x, y: minY });
    for (let y = minY + 1; y <= maxY; y += 1) cells.push({ x: maxX, y });
    if (maxY > minY) {
      for (let x = maxX - 1; x >= minX; x -= 1) cells.push({ x, y: maxY });
    }
    if (maxX > minX) {
      for (let y = maxY - 1; y > minY; y -= 1) cells.push({ x: minX, y });
    }

    minX += 1;
    minY += 1;
    maxX -= 1;
    maxY -= 1;
  }

  return cells;
}

function updateBombMotion(state: MatchState, bomb: BombState, config: GameConfig): BombState {
  if (bomb.carriedByPlayerId !== null) {
    return {
      ...bomb,
      movingDirection: "none",
      fuseTicks: bomb.fuseTicks - 1
    };
  }

  if (bomb.movingDirection === "none") {
    return { ...bomb, fuseTicks: bomb.fuseTicks - 1 };
  }

  const vector = DIRECTION_VECTORS[bomb.movingDirection];
  const dx = vector.x * config.bombKickSpeedCellsPerTick;
  const dy = vector.y * config.bombKickSpeedCellsPerTick;
  const proposedX = bomb.x + dx;
  const proposedY = bomb.y + dy;
  const tx = Math.round(proposedX);
  const ty = Math.round(proposedY);
  const currentCellX = Math.round(bomb.x);
  const currentCellY = Math.round(bomb.y);
  const stopCellX = vector.x !== 0 && currentCellX === tx ? currentCellX - vector.x : currentCellX;
  const stopCellY = vector.y !== 0 && currentCellY === ty ? currentCellY - vector.y : currentCellY;
  const snappedStoppedBomb: BombState = {
    ...bomb,
    x: clamp(stopCellX, 0, state.width - 1),
    y: clamp(stopCellY, 0, state.height - 1),
    fuseTicks: bomb.fuseTicks - 1,
    movingDirection: "none"
  };

  if (!inBounds(state.width, state.height, tx, ty)) {
    return snappedStoppedBomb;
  }

  const tile = state.tiles[ty]?.[tx] ?? "hard";
  const blocked = isBlockingTile(tile) || Boolean(bombAt(state.bombs.filter((item) => item.id !== bomb.id), tx, ty));
  const blockedByPlayer = state.players.some((player) => {
    if (!player.alive) {
      return false;
    }
    const px = Math.round(player.x);
    const py = Math.round(player.y);
    const sharingCurrentCell = px === currentCellX && py === currentCellY;
    return !sharingCurrentCell && px === tx && py === ty;
  });
  if (blocked || blockedByPlayer) {
    return snappedStoppedBomb;
  }

  return {
    ...bomb,
    x: proposedX,
    y: proposedY,
    fuseTicks: bomb.fuseTicks - 1
  };
}

function applyCurseToInputFrame(state: MatchState, frame: InputFrame): InputFrame {
  const intents: Record<number, PlayerIntent> = { ...frame.intents };

  for (const player of state.players) {
    const intent = intents[player.id] ?? { moveX: 0, moveY: 0, placeBomb: false };
    if (player.skullCurse === "reverse") {
      intents[player.id] = {
        moveX: (intent.moveX * -1) as -1 | 0 | 1,
        moveY: (intent.moveY * -1) as -1 | 0 | 1,
        placeBomb: intent.placeBomb
      };
      continue;
    }

    if (player.skullCurse === "noBomb") {
      intents[player.id] = {
        ...intent,
        placeBomb: false
      };
      continue;
    }

    intents[player.id] = intent;
  }

  return { intents };
}

function processGloveAndKicks(state: MatchState, input: InputFrame): Set<number> {
  const consumedBombAction = new Set<number>();

  for (const player of state.players) {
    if (!player.alive) {
      continue;
    }

    const intent = input.intents[player.id] ?? { moveX: 0, moveY: 0, placeBomb: false };
    const actionDirection = directionFromIntent(intent);

    if (player.canGlove && intent.placeBomb) {
      if (player.carriedBombId !== null) {
        const carried = state.bombs.find((bomb) => bomb.id === player.carriedBombId);
        if (carried && actionDirection !== "none") {
          carried.carriedByPlayerId = null;
          carried.movingDirection = actionDirection;
          carried.x = Math.round(player.x);
          carried.y = Math.round(player.y);
          player.carriedBombId = null;
          consumedBombAction.add(player.id);
          continue;
        }
      } else {
        let pickupBomb: BombState | undefined;
        const px = Math.round(player.x);
        const py = Math.round(player.y);

        if (actionDirection !== "none") {
          const v = DIRECTION_VECTORS[actionDirection];
          pickupBomb = bombAt(state.bombs, px + v.x, py + v.y);
        }
        if (!pickupBomb) {
          pickupBomb = bombAt(state.bombs, px, py);
        }

        if (pickupBomb && pickupBomb.carriedByPlayerId === null && pickupBomb.movingDirection === "none") {
          pickupBomb.carriedByPlayerId = player.id;
          pickupBomb.movingDirection = "none";
          pickupBomb.x = player.x;
          pickupBomb.y = player.y;
          player.carriedBombId = pickupBomb.id;
          consumedBombAction.add(player.id);
          continue;
        }
      }
    }

    if (!player.canKick || actionDirection === "none") {
      continue;
    }

    const v = DIRECTION_VECTORS[actionDirection];
    const px = Math.round(player.x);
    const py = Math.round(player.y);
    const kickBomb = bombAt(state.bombs, px + v.x, py + v.y);

    if (!kickBomb || kickBomb.movingDirection !== "none" || kickBomb.carriedByPlayerId !== null) {
      continue;
    }

    kickBomb.movingDirection = actionDirection;
  }

  return consumedBombAction;
}

function syncCarriedBombs(state: MatchState): void {
  const playerById = new Map<number, PlayerState>(state.players.map((player) => [player.id, player]));

  for (const bomb of state.bombs) {
    if (bomb.carriedByPlayerId === null) {
      continue;
    }

    const carrier = playerById.get(bomb.carriedByPlayerId);
    if (!carrier || !carrier.alive || carrier.carriedBombId !== bomb.id) {
      bomb.carriedByPlayerId = null;
      bomb.movingDirection = "none";
      continue;
    }

    bomb.x = carrier.x;
    bomb.y = carrier.y;
    bomb.movingDirection = "none";
  }

  for (const player of state.players) {
    if (player.carriedBombId === null) {
      continue;
    }

    const bomb = state.bombs.find((candidate) => candidate.id === player.carriedBombId);
    if (!bomb || bomb.carriedByPlayerId !== player.id) {
      player.carriedBombId = null;
    }
  }
}

function processPlayersAndHazards(state: MatchState, config: GameConfig): void {
  for (const powerUp of state.powerUps) {
    if ((powerUp.spawnShieldTicks ?? 0) > 0) {
      powerUp.spawnShieldTicks = (powerUp.spawnShieldTicks ?? 0) - 1;
    }
  }

  if (state.powerUps.length > 0 && state.flames.length > 0) {
    state.powerUps = state.powerUps.filter((powerUp) => {
      if ((powerUp.spawnShieldTicks ?? 0) > 0) {
        return true;
      }
      return !flameAt(state, powerUp.x, powerUp.y);
    });
  }

  const pickupsByCell = new Map<string, PowerUpState>();
  for (const powerUp of state.powerUps) {
    pickupsByCell.set(cellKey(powerUp.x, powerUp.y), powerUp);
  }

  const consumedPowerUpIds = new Set<number>();

  for (let i = 0; i < state.players.length; i += 1) {
    const player = state.players[i];
    if (!player || !player.alive) {
      continue;
    }

    const cellX = Math.round(player.x);
    const cellY = Math.round(player.y);
    const inFlame = flameAt(state, cellX, cellY);
    const onSuddenDeath = state.tiles[cellY]?.[cellX] === "suddenDeath";

    if ((inFlame || onSuddenDeath) && player.spawnInvulnerabilityTicks <= 0) {
      addEvent(state, { type: "player_hit", payload: { playerId: player.id, x: cellX, y: cellY } });

      if (player.carriedBombId !== null) {
        const carried = state.bombs.find((bomb) => bomb.id === player.carriedBombId);
        if (carried) {
          carried.carriedByPlayerId = null;
          carried.movingDirection = "none";
          carried.x = cellX;
          carried.y = cellY;
        }
      }

      const eliminationDrops = collectEliminationDrops(player, config);
      scatterEliminationDrops(state, eliminationDrops, { x: cellX, y: cellY }, config);

      state.players[i] = {
        ...player,
        alive: false,
        x: cellX,
        y: cellY,
        activeBombs: 0,
        carriedBombId: null
      };
      addEvent(state, { type: "player_eliminated", payload: { playerId: player.id } });
      continue;
    }

    const pickup = pickupsByCell.get(cellKey(cellX, cellY));
    if (pickup && !consumedPowerUpIds.has(pickup.id)) {
      state.players[i] = applyPowerUp(state, player, pickup, config);
      consumedPowerUpIds.add(pickup.id);
      addEvent(state, { type: "pickup", payload: { playerId: player.id, kind: pickup.kind, x: pickup.x, y: pickup.y } });
    }
  }

  if (consumedPowerUpIds.size > 0) {
    state.powerUps = state.powerUps.filter((powerUp) => !consumedPowerUpIds.has(powerUp.id));
  }
}

function maybePlaceBomb(state: MatchState, player: PlayerState, intent: PlayerIntent, config: GameConfig): void {
  if (!intent.placeBomb || !player.alive || player.activeBombs >= player.maxBombs) {
    return;
  }

  const canPlaceAt = (x: number, y: number): boolean => {
    if (!inBounds(state.width, state.height, x, y)) {
      return false;
    }
    const tile = state.tiles[y]?.[x];
    if (tile !== "empty") {
      return false;
    }
    if (bombAt(state.bombs, x, y)) {
      return false;
    }
    return !state.players.some(
      (candidate) => candidate.alive && candidate.id !== player.id && Math.round(candidate.x) === x && Math.round(candidate.y) === y
    );
  };

  const candidates: Array<{ x: number; y: number }> = [];
  const seen = new Set<string>();
  const addCandidate = (x: number, y: number): void => {
    if (!inBounds(state.width, state.height, x, y)) {
      return;
    }
    const key = `${x},${y}`;
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    candidates.push({ x, y });
  };

  const roundedX = Math.round(player.x);
  const roundedY = Math.round(player.y);
  addCandidate(roundedX, roundedY);
  addCandidate(Math.floor(player.x), roundedY);
  addCandidate(Math.ceil(player.x), roundedY);
  addCandidate(roundedX, Math.floor(player.y));
  addCandidate(roundedX, Math.ceil(player.y));

  if (intent.moveX !== 0) {
    addCandidate(roundedX + intent.moveX, roundedY);
  }
  if (intent.moveY !== 0) {
    addCandidate(roundedX, roundedY + intent.moveY);
  }

  const movementMagnitude = Math.abs(intent.moveX) + Math.abs(intent.moveY);
  candidates.sort((a, b) => {
    const distA = (player.x - a.x) ** 2 + (player.y - a.y) ** 2;
    const distB = (player.x - b.x) ** 2 + (player.y - b.y) ** 2;
    if (movementMagnitude === 0) {
      return distA - distB;
    }
    const dirBiasA = ((a.x - player.x) * intent.moveX + (a.y - player.y) * intent.moveY) / movementMagnitude;
    const dirBiasB = ((b.x - player.x) * intent.moveX + (b.y - player.y) * intent.moveY) / movementMagnitude;
    const behindPenaltyA = dirBiasA < -0.05 ? 1.2 : 0;
    const behindPenaltyB = dirBiasB < -0.05 ? 1.2 : 0;
    return distA - dirBiasA * 0.45 + behindPenaltyA - (distB - dirBiasB * 0.45 + behindPenaltyB);
  });

  const placement = candidates.find((candidate) => canPlaceAt(candidate.x, candidate.y));
  if (!placement) {
    return;
  }
  const x = placement.x;
  const y = placement.y;

  state.bombs.push({
    id: state.nextBombId,
    ownerId: player.id,
    x,
    y,
    range: player.bombRange,
    fuseTicks: config.bombFuseTicks,
    movingDirection: "none",
    isPowerBomb: player.canPowerBomb,
    carriedByPlayerId: null
  });
  state.nextBombId += 1;

  const updatedPlayers = state.players.map((candidate) => {
    if (candidate.id === player.id) {
      return { ...candidate, activeBombs: candidate.activeBombs + 1 };
    }
    return candidate;
  });
  state.players = updatedPlayers;

  addEvent(state, { type: "bomb_placed", payload: { playerId: player.id, x, y } });
}

function determineWinner(state: MatchState): void {
  if (state.phase === "finished") {
    return;
  }

  const alive = state.players.filter((player) => player.alive);
  if (alive.length <= 1) {
    const reason = state.suddenDeathIndex > 0 ? "suddenDeath" : "elimination";
    state.phase = "finished";
    state.winnerId = alive[0]?.id ?? null;
    state.matchFinishedReason = reason;
    addEvent(state, {
      type: "match_finished",
      payload: {
        winnerId: state.winnerId,
        reason
      }
    });
    return;
  }

  if (state.timerTicksRemaining <= 0) {
    const sorted = [...alive].sort((a, b) => b.score - a.score);
    state.phase = "finished";
    state.winnerId = sorted[0]?.id ?? null;
    state.matchFinishedReason = "timeout";
    addEvent(state, {
      type: "match_finished",
      payload: {
        winnerId: state.winnerId,
        reason: "timeout"
      }
    });
  }
}

export function stepMatch(input: InputFrame, prev: MatchState, config: GameConfig): SimulationStepResult {
  const state = cloneState(prev);
  if (state.phase === "finished") {
    return { state, events: [] };
  }

  state.tick += 1;
  state.timerTicksRemaining = Math.max(0, state.timerTicksRemaining - 1);

  const botResolvedFrame = applyBotIntents(state, input, config.botDifficulty, config);
  const resolvedFrame = applyCurseToInputFrame(state, botResolvedFrame);
  const consumedBombAction = processGloveAndKicks(state, resolvedFrame);

  const movedPlayers = state.players.map((player) => {
    const intent = resolvedFrame.intents[player.id] ?? { moveX: 0, moveY: 0, placeBomb: false };
    return stepPlayerMovement(state, player, intent, config);
  });
  state.players = movedPlayers;

  syncCarriedBombs(state);

  for (const player of state.players) {
    const intent = resolvedFrame.intents[player.id] ?? { moveX: 0, moveY: 0, placeBomb: false };
    if (consumedBombAction.has(player.id)) {
      continue;
    }
    maybePlaceBomb(state, player, intent, config);
  }

  state.bombs = state.bombs.map((bomb) => updateBombMotion(state, bomb, config));

  const explodedBombIds = new Set<number>();
  while (true) {
    const exploding = state.bombs.filter((bomb) => bomb.fuseTicks <= 0 && !explodedBombIds.has(bomb.id));
    if (exploding.length === 0) {
      break;
    }

    for (const bomb of exploding) {
      explodedBombIds.add(bomb.id);
      triggerExplosion(state, bomb, config);
    }

    state.bombs = state.bombs.filter((bomb) => !explodedBombIds.has(bomb.id));
  }

  state.flames = state.flames
    .map((flame) => ({ ...flame, ttlTicks: flame.ttlTicks - 1 }))
    .filter((flame) => flame.ttlTicks > 0);

  applySuddenDeath(state, config);
  processPlayersAndHazards(state, config);
  syncCarriedBombs(state);
  determineWinner(state);

  return {
    state,
    events: [...state.events]
  };
}
