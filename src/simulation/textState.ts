import type { MatchState } from "./types";

export function renderGameToText(state: MatchState): string {
  const payload = {
    mode: state.phase,
    tick: state.tick,
    timerTicksRemaining: state.timerTicksRemaining,
    winnerId: state.winnerId,
    matchFinishedReason: state.matchFinishedReason,
    coordSystem: "origin top-left, +x right, +y down",
    players: state.players.map((player) => ({
      id: player.id,
      name: player.name,
      alive: player.alive,
      controller: player.controller,
      x: Number(player.x.toFixed(3)),
      y: Number(player.y.toFixed(3)),
      activeBombs: player.activeBombs,
      bombRange: player.bombRange,
      speedLevel: player.speedLevel,
      abilities: {
        kick: player.canKick,
        glove: player.canGlove,
        powerBomb: player.canPowerBomb
      },
      carriedBombId: player.carriedBombId,
      skullCurse: player.skullCurse,
      skullTicks: player.skullTicks
    })),
    bombs: state.bombs.map((bomb) => ({
      id: bomb.id,
      ownerId: bomb.ownerId,
      x: Number(bomb.x.toFixed(3)),
      y: Number(bomb.y.toFixed(3)),
      range: bomb.range,
      fuseTicks: bomb.fuseTicks,
      movingDirection: bomb.movingDirection,
      isPowerBomb: bomb.isPowerBomb,
      carriedByPlayerId: bomb.carriedByPlayerId
    })),
    flames: state.flames.map((flame) => ({ x: flame.x, y: flame.y, ttlTicks: flame.ttlTicks })),
    powerUps: state.powerUps.map((powerUp) => ({ x: powerUp.x, y: powerUp.y, kind: powerUp.kind })),
    events: state.events
  };

  return JSON.stringify(payload);
}
