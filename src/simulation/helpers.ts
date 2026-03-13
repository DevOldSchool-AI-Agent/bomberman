import type { Direction, TileType } from "./types";

export const DIRECTION_VECTORS: Record<Direction, { x: number; y: number }> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
  none: { x: 0, y: 0 }
};

export function cellKey(x: number, y: number): string {
  return `${x},${y}`;
}

export function inBounds(width: number, height: number, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < width && y < height;
}

export function isBlockingTile(tile: TileType): boolean {
  return tile === "hard" || tile === "soft" || tile === "suddenDeath";
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
