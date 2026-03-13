import type { MapDefinition } from "../simulation/types";

const SOFT_MAPS = {
  classicCross: [
    ".............",
    "..s.s.s.s.s..",
    ".s.s.s.s.s.s.",
    "..s.s.s.s.s..",
    ".s.s.s.s.s.s.",
    "..s.s...s.s..",
    ".s.s.s.s.s.s.",
    "..s.s.s.s.s..",
    ".s.s.s.s.s.s.",
    "..s.s.s.s.s..",
    "............."
  ],
  pinwheel: [
    "..s..s..s..s.",
    ".s..s..s..s..",
    "s..s..s..s..s",
    "..s..s..s..s.",
    ".s..s..s..s..",
    "s..s.....s..s",
    "..s..s..s..s.",
    ".s..s..s..s..",
    "s..s..s..s..s",
    "..s..s..s..s.",
    ".s..s..s..s.."
  ],
  lanes: [
    ".s.s.s...s.s.",
    ".s.s.s...s.s.",
    ".s.s.s...s.s.",
    "...s.s.s.s...",
    "...s.s.s.s...",
    ".....s.s.....",
    "...s.s.s.s...",
    "...s.s.s.s...",
    ".s.s.s...s.s.",
    ".s.s.s...s.s.",
    ".s.s.s...s.s."
  ],
  fortress: [
    "ssss.....ssss",
    "s..s.....s..s",
    "s..s.s.s.s..s",
    "...s.s.s.s...",
    "...s.....s...",
    ".....s.s.....",
    "...s.....s...",
    "...s.s.s.s...",
    "s..s.s.s.s..s",
    "s..s.....s..s",
    "ssss.....ssss"
  ],
  tunnel: [
    "s.s.s.s.s.s.s",
    ".............",
    ".s.s.s.s.s.s.",
    ".............",
    "s.s.s.s.s.s.s",
    ".............",
    ".s.s.s.s.s.s.",
    ".............",
    "s.s.s.s.s.s.s",
    ".............",
    ".s.s.s.s.s.s."
  ],
  mazeRing: [
    "sssssssssssss",
    "s...........s",
    "s.sssssssss.s",
    "s.s.......s.s",
    "s.s.sssss.s.s",
    "s.s.s...s.s.s",
    "s.s.sssss.s.s",
    "s.s.......s.s",
    "s.sssssssss.s",
    "s...........s",
    "sssssssssssss"
  ]
} as const;

function openSpawnAreas(rows: readonly string[]): string[] {
  const mutable = rows.map((row) => row.split(""));
  const safeZones: Array<[number, number]> = [
    [1, 1],
    [1, 2],
    [2, 1],
    [11, 1],
    [10, 1],
    [11, 2],
    [1, 9],
    [1, 8],
    [2, 9],
    [11, 9],
    [10, 9],
    [11, 8]
  ];

  for (const [x, y] of safeZones) {
    if (mutable[y]?.[x]) {
      mutable[y][x] = ".";
    }
  }

  return mutable.map((row) => row.join(""));
}

export const MAPS: MapDefinition[] = [
  { id: "classic-cross", name: "Classic Cross", width: 13, height: 11, softRows: openSpawnAreas(SOFT_MAPS.classicCross) },
  { id: "pinwheel", name: "Pinwheel", width: 13, height: 11, softRows: openSpawnAreas(SOFT_MAPS.pinwheel) },
  { id: "lanes", name: "Lanes", width: 13, height: 11, softRows: openSpawnAreas(SOFT_MAPS.lanes) },
  { id: "fortress", name: "Fortress", width: 13, height: 11, softRows: openSpawnAreas(SOFT_MAPS.fortress) },
  { id: "tunnel", name: "Tunnel", width: 13, height: 11, softRows: openSpawnAreas(SOFT_MAPS.tunnel) },
  { id: "maze-ring", name: "Maze Ring", width: 13, height: 11, softRows: openSpawnAreas(SOFT_MAPS.mazeRing) }
];
