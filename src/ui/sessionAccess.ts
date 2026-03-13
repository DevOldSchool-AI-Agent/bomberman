import Phaser from "phaser";
import type { GameSession } from "../game/session";

export function getSessionFromScene(scene: Phaser.Scene): GameSession {
  return scene.registry.get("session") as GameSession;
}
