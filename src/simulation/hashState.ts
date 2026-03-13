import type { MatchState } from "./types";

function fnv1a(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function stableStateHash(state: MatchState): string {
  const payload = {
    tick: state.tick,
    phase: state.phase,
    winnerId: state.winnerId,
    matchFinishedReason: state.matchFinishedReason,
    timer: state.timerTicksRemaining,
    suddenDeathIndex: state.suddenDeathIndex,
    players: state.players.map((player) => ({
      id: player.id,
      alive: player.alive,
      x: Number(player.x.toFixed(3)),
      y: Number(player.y.toFixed(3)),
      maxBombs: player.maxBombs,
      range: player.bombRange,
      speed: player.speedLevel,
      abilities: [player.canKick, player.canGlove, player.canPowerBomb],
      skull: [player.skullCurse, player.skullTicks],
      carriedBombId: player.carriedBombId
    })),
    bombs: state.bombs.map((bomb) => ({
      id: bomb.id,
      x: Number(bomb.x.toFixed(3)),
      y: Number(bomb.y.toFixed(3)),
      fuse: bomb.fuseTicks,
      range: bomb.range,
      dir: bomb.movingDirection,
      power: bomb.isPowerBomb,
      carriedBy: bomb.carriedByPlayerId
    })),
    flames: state.flames.map((flame) => ({
      x: flame.x,
      y: flame.y,
      ttl: flame.ttlTicks
    })),
    powerUps: state.powerUps.map((powerUp) => ({
      x: powerUp.x,
      y: powerUp.y,
      kind: powerUp.kind
    }))
  };

  return fnv1a(JSON.stringify(payload));
}
