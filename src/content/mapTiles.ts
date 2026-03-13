import type { MapDefinition, TileType } from "../simulation/types";

export function buildTilesFromMap(map: MapDefinition): TileType[][] {
  const tiles: TileType[][] = [];
  for (let y = 0; y < map.height; y += 1) {
    const row: TileType[] = [];
    const softRow = map.softRows[y] ?? "";
    for (let x = 0; x < map.width; x += 1) {
      const isBorder = x === 0 || y === 0 || x === map.width - 1 || y === map.height - 1;
      const isPillar = x % 2 === 0 && y % 2 === 0;
      if (isBorder || isPillar) {
        row.push("hard");
        continue;
      }
      row.push(softRow[x] === "s" ? "soft" : "empty");
    }
    tiles.push(row);
  }
  return tiles;
}
