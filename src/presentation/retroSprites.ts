import Phaser from "phaser";
import type { Direction, PowerUpType, TileType } from "../simulation/types";

export const RETRO_ATLAS_KEY = "retro-atlas";
const FRAME_SIZE = 24;

const TILE_FRAME_VARIANTS: Record<TileType, string[]> = {
  empty: ["tile-empty-0", "tile-empty-1", "tile-empty-2"],
  hard: ["tile-hard-0", "tile-hard-1", "tile-hard-2"],
  soft: ["tile-soft-0", "tile-soft-1", "tile-soft-2"],
  suddenDeath: ["tile-sudden-0", "tile-sudden-1"]
};

const POWER_UP_FRAMES: Record<PowerUpType, string> = {
  extraBomb: "power-extraBomb",
  flameUp: "power-flameUp",
  fullFire: "power-fullFire",
  speedUp: "power-speedUp",
  kick: "power-kick",
  glove: "power-glove",
  powerBomb: "power-powerBomb",
  skull: "power-skull"
};

type DrawFn = (graphics: Phaser.GameObjects.Graphics, offsetX: number) => void;

type PlayerPalette = {
  helmet: number;
  helmetShade: number;
  visor: number;
  visorHi: number;
  suit: number;
  suitShade: number;
  belt: number;
  glove: number;
  boot: number;
};

const PLAYER_PALETTES: PlayerPalette[] = [
  {
    helmet: 0xf4f9ff,
    helmetShade: 0xd9e8f9,
    visor: 0xffb24a,
    visorHi: 0xffdc8e,
    suit: 0x66a8f3,
    suitShade: 0x4f8fda,
    belt: 0x2b3a5f,
    glove: 0xeff6ff,
    boot: 0x1c2438
  },
  {
    helmet: 0xfff6f2,
    helmetShade: 0xf8d8cb,
    visor: 0xffb075,
    visorHi: 0xfff0d8,
    suit: 0xff6b6b,
    suitShade: 0xcf4f4f,
    belt: 0x512424,
    glove: 0xfff2f2,
    boot: 0x2b1616
  },
  {
    helmet: 0xf4fff8,
    helmetShade: 0xd3f1dd,
    visor: 0xffc07d,
    visorHi: 0xfff3df,
    suit: 0x63d88c,
    suitShade: 0x43ab6a,
    belt: 0x224632,
    glove: 0xf2fff7,
    boot: 0x16291d
  },
  {
    helmet: 0xfffdea,
    helmetShade: 0xf6edb9,
    visor: 0xffbe57,
    visorHi: 0xfff5d8,
    suit: 0xf2d764,
    suitShade: 0xc6ac45,
    belt: 0x524922,
    glove: 0xfffdea,
    boot: 0x302913
  }
];

function pixel(graphics: Phaser.GameObjects.Graphics, offsetX: number, x: number, y: number, w = 1, h = 1): void {
  graphics.fillRect(offsetX + x, y, w, h);
}

function drawTileEmpty(graphics: Phaser.GameObjects.Graphics, offsetX: number, seed: number): void {
  const base = [0x2f6f45, 0x377c4f, 0x336f4b][seed % 3] ?? 0x2f6f45;
  graphics.fillStyle(base, 1);
  pixel(graphics, offsetX, 0, 0, FRAME_SIZE, FRAME_SIZE);

  graphics.fillStyle(0x49a35e, 0.85);
  for (let y = 1; y < FRAME_SIZE; y += 5) {
    const shift = (Math.floor((y + seed) / 2) % 4 + 4) % 4;
    for (let x = shift; x < FRAME_SIZE; x += 5) {
      pixel(graphics, offsetX, x, y, 2, 2);
    }
  }

  graphics.fillStyle(0x1e4f31, 0.85);
  for (let x = (seed % 3) + 1; x < FRAME_SIZE; x += 6) {
    pixel(graphics, offsetX, x, FRAME_SIZE - 4, 2, 3);
  }

  graphics.fillStyle(0x65bf72, 0.55);
  pixel(graphics, offsetX, 2, 2, FRAME_SIZE - 4, 2);
}

function drawTileHard(graphics: Phaser.GameObjects.Graphics, offsetX: number, seed: number): void {
  const top = [0x9fd5ff, 0x95c8f3, 0xa8dbff][seed % 3] ?? 0x9fd5ff;
  const body = [0x4f6c95, 0x456289, 0x5a77a0][seed % 3] ?? 0x4f6c95;
  graphics.fillStyle(body, 1);
  pixel(graphics, offsetX, 0, 0, FRAME_SIZE, FRAME_SIZE);
  graphics.fillStyle(top, 1);
  pixel(graphics, offsetX, 2, 2, FRAME_SIZE - 4, 3);
  graphics.fillStyle(0x2f4464, 1);
  pixel(graphics, offsetX, 2, 19, FRAME_SIZE - 4, 3);
  graphics.fillStyle(0x2a3c59, 1);
  pixel(graphics, offsetX, 3, 3, 2, FRAME_SIZE - 6);
  pixel(graphics, offsetX, FRAME_SIZE - 5, 3, 2, FRAME_SIZE - 6);

  graphics.fillStyle(0x7699c5, 1);
  for (let x = 3 + (seed % 2); x < FRAME_SIZE; x += 6) {
    pixel(graphics, offsetX, x, 8, 2, 10);
  }

  graphics.fillStyle(0xbedfff, 0.6);
  for (let x = 4; x < FRAME_SIZE - 3; x += 8) {
    pixel(graphics, offsetX, x, 5, 2, 2);
  }
}

function drawTileSoft(graphics: Phaser.GameObjects.Graphics, offsetX: number, seed: number): void {
  const body = [0xc1773f, 0xca7f43, 0xb86f3a][seed % 3] ?? 0xc1773f;
  graphics.fillStyle(body, 1);
  pixel(graphics, offsetX, 0, 0, FRAME_SIZE, FRAME_SIZE);

  graphics.fillStyle(0xe59d5c, 1);
  pixel(graphics, offsetX, 1, 2, FRAME_SIZE - 2, 4);
  pixel(graphics, offsetX, 1, 10, FRAME_SIZE - 2, 4);
  pixel(graphics, offsetX, 1, 18, FRAME_SIZE - 2, 4);

  graphics.fillStyle(0x7d4b24, 1);
  for (let x = 4 + (seed % 3); x < FRAME_SIZE; x += 6) {
    pixel(graphics, offsetX, x, 1, 2, FRAME_SIZE - 2);
  }

  graphics.fillStyle(0x5e3418, 0.9);
  pixel(graphics, offsetX, 0, 0, FRAME_SIZE, 1);
  pixel(graphics, offsetX, 0, FRAME_SIZE - 1, FRAME_SIZE, 1);
}

function drawTileSudden(graphics: Phaser.GameObjects.Graphics, offsetX: number, seed: number): void {
  const body = seed % 2 === 0 ? 0xc93939 : 0xd94646;
  graphics.fillStyle(body, 1);
  pixel(graphics, offsetX, 0, 0, FRAME_SIZE, FRAME_SIZE);
  graphics.fillStyle(0xffbf3b, 1);
  for (let i = seed % 2; i < FRAME_SIZE; i += 5) {
    pixel(graphics, offsetX, i, 0, 2, FRAME_SIZE);
    pixel(graphics, offsetX, 0, i, FRAME_SIZE, 1);
  }
  graphics.fillStyle(0x6f1616, 0.9);
  pixel(graphics, offsetX, 0, 0, FRAME_SIZE, 2);
  pixel(graphics, offsetX, 0, FRAME_SIZE - 2, FRAME_SIZE, 2);
}

function drawPlayerBody(graphics: Phaser.GameObjects.Graphics, offsetX: number, palette: PlayerPalette): void {
  // Outline pass gives clearer silhouette when scaled.
  graphics.fillStyle(0x0f1420, 1);
  pixel(graphics, offsetX, 5, 3, 14, 19);

  // Helmet cap.
  graphics.fillStyle(palette.helmet, 1);
  pixel(graphics, offsetX, 6, 4, 12, 8);
  graphics.fillStyle(palette.helmetShade, 1);
  pixel(graphics, offsetX, 7, 5, 10, 2);

  // Visor stripe.
  graphics.fillStyle(palette.visor, 1);
  pixel(graphics, offsetX, 7, 8, 10, 2);
  graphics.fillStyle(palette.visorHi, 1);
  pixel(graphics, offsetX, 8, 8, 6, 1);

  // Suit torso.
  graphics.fillStyle(palette.suit, 1);
  pixel(graphics, offsetX, 7, 12, 10, 7);
  graphics.fillStyle(palette.suitShade, 1);
  pixel(graphics, offsetX, 8, 15, 8, 3);

  // Belt and center seam.
  graphics.fillStyle(palette.belt, 1);
  pixel(graphics, offsetX, 7, 18, 10, 1);
  pixel(graphics, offsetX, 11, 13, 2, 5);
}

function drawPlayer(
  graphics: Phaser.GameObjects.Graphics,
  offsetX: number,
  direction: Direction,
  walk: boolean,
  palette: PlayerPalette
): void {
  drawPlayerBody(graphics, offsetX, palette);

  // Gloves.
  graphics.fillStyle(palette.glove, 1);
  if (direction === "left") {
    pixel(graphics, offsetX, 5, 12, 2, 4);
    pixel(graphics, offsetX, 15, walk ? 13 : 12, 2, 4);
  } else if (direction === "right") {
    pixel(graphics, offsetX, 6, walk ? 13 : 12, 2, 4);
    pixel(graphics, offsetX, 17, 12, 2, 4);
  } else if (direction === "up") {
    pixel(graphics, offsetX, 5, walk ? 13 : 12, 2, 4);
    pixel(graphics, offsetX, 17, walk ? 12 : 13, 2, 4);
  } else {
    pixel(graphics, offsetX, 5, walk ? 13 : 12, 2, 4);
    pixel(graphics, offsetX, 17, walk ? 12 : 13, 2, 4);
  }

  // Face / visor cue by direction.
  if (direction === "up") {
    graphics.fillStyle(0xd4e5f7, 1);
    pixel(graphics, offsetX, 8, 10, 8, 2);
  } else if (direction === "left") {
    graphics.fillStyle(0xfff6de, 1);
    pixel(graphics, offsetX, 8, 10, 3, 2);
    graphics.fillStyle(0x2a3449, 1);
    pixel(graphics, offsetX, 8, 10, 1, 1);
  } else if (direction === "right") {
    graphics.fillStyle(0xfff6de, 1);
    pixel(graphics, offsetX, 13, 10, 3, 2);
    graphics.fillStyle(0x2a3449, 1);
    pixel(graphics, offsetX, 15, 10, 1, 1);
  } else {
    graphics.fillStyle(0xfff6de, 1);
    pixel(graphics, offsetX, 9, 10, 6, 2);
    graphics.fillStyle(0x2a3449, 1);
    pixel(graphics, offsetX, 10, 10, 1, 1);
    pixel(graphics, offsetX, 13, 10, 1, 1);
  }

  // Boots.
  graphics.fillStyle(palette.boot, 1);
  if (walk) {
    pixel(graphics, offsetX, 7, 19, 3, 3);
    pixel(graphics, offsetX, 14, 19, 3, 3);
  } else {
    pixel(graphics, offsetX, 8, 19, 3, 3);
    pixel(graphics, offsetX, 13, 19, 3, 3);
  }
}

function drawBomb(graphics: Phaser.GameObjects.Graphics, offsetX: number, lit: boolean): void {
  graphics.fillStyle(0x1a1f29, 1);
  pixel(graphics, offsetX, 6, 6, 12, 12);
  graphics.fillStyle(0x4f5a6f, 1);
  pixel(graphics, offsetX, 7, 7, 10, 10);
  graphics.fillStyle(0xeef5ff, 0.95);
  pixel(graphics, offsetX, 9, 8, 3, 3);
  graphics.fillStyle(lit ? 0xffcf5a : 0x8d98aa, 1);
  pixel(graphics, offsetX, 11, 3, 2, 4);
  graphics.fillStyle(lit ? 0xff5b3f : 0x8d98aa, 1);
  pixel(graphics, offsetX, 11, 1, 2, 2);
}

function drawFlame(graphics: Phaser.GameObjects.Graphics, offsetX: number, alt: boolean): void {
  graphics.fillStyle(0xffe17d, 1);
  pixel(graphics, offsetX, 9, 2, 6, 19);
  pixel(graphics, offsetX, 5, 8, 14, 10);
  graphics.fillStyle(alt ? 0xffa03f : 0xff7a2f, 1);
  pixel(graphics, offsetX, 10, 6, 4, 12);
  pixel(graphics, offsetX, 8, 10, 8, 6);
  graphics.fillStyle(0xfff6cb, 1);
  pixel(graphics, offsetX, 11, 8, 2, 6);
}

function drawBadge(graphics: Phaser.GameObjects.Graphics, offsetX: number, color: number): void {
  graphics.fillStyle(0x224660, 1);
  pixel(graphics, offsetX, 3, 3, 18, 18);
  graphics.fillStyle(0x5d8fb0, 1);
  pixel(graphics, offsetX, 4, 4, 16, 16);
  graphics.fillStyle(color, 1);
  pixel(graphics, offsetX, 5, 5, 14, 14);
}

function drawPowerExtraBomb(graphics: Phaser.GameObjects.Graphics, offsetX: number): void {
  drawBadge(graphics, offsetX, 0xf5f5f5);
  graphics.fillStyle(0x1a1a1a, 1);
  pixel(graphics, offsetX, 9, 9, 6, 6);
  pixel(graphics, offsetX, 11, 7, 2, 2);
}

function drawPowerFlameUp(graphics: Phaser.GameObjects.Graphics, offsetX: number): void {
  drawBadge(graphics, offsetX, 0xff954a);
  graphics.fillStyle(0xffe5a3, 1);
  pixel(graphics, offsetX, 10, 7, 4, 10);
  pixel(graphics, offsetX, 8, 10, 8, 5);
}

function drawPowerFullFire(graphics: Phaser.GameObjects.Graphics, offsetX: number): void {
  drawBadge(graphics, offsetX, 0xff7a45);
  graphics.fillStyle(0xffe7ad, 1);
  pixel(graphics, offsetX, 10, 6, 4, 12);
  pixel(graphics, offsetX, 7, 10, 10, 5);
  pixel(graphics, offsetX, 11, 4, 2, 2);
}

function drawPowerSpeedUp(graphics: Phaser.GameObjects.Graphics, offsetX: number): void {
  drawBadge(graphics, offsetX, 0x89f0ff);
  graphics.fillStyle(0x19455d, 1);
  pixel(graphics, offsetX, 8, 9, 8, 2);
  pixel(graphics, offsetX, 10, 11, 8, 2);
  pixel(graphics, offsetX, 8, 13, 8, 2);
}

function drawPowerKick(graphics: Phaser.GameObjects.Graphics, offsetX: number): void {
  drawBadge(graphics, offsetX, 0xff77bb);
  graphics.fillStyle(0x722548, 1);
  pixel(graphics, offsetX, 7, 11, 6, 4);
  pixel(graphics, offsetX, 12, 13, 6, 3);
}

function drawPowerGlove(graphics: Phaser.GameObjects.Graphics, offsetX: number): void {
  drawBadge(graphics, offsetX, 0xbce7ff);
  graphics.fillStyle(0x2d4a5f, 1);
  pixel(graphics, offsetX, 7, 9, 10, 8);
  pixel(graphics, offsetX, 7, 7, 2, 3);
  pixel(graphics, offsetX, 10, 7, 2, 3);
  pixel(graphics, offsetX, 13, 7, 2, 3);
}

function drawPowerPowerBomb(graphics: Phaser.GameObjects.Graphics, offsetX: number): void {
  drawBadge(graphics, offsetX, 0xffd0a8);
  graphics.fillStyle(0x2a1d14, 1);
  pixel(graphics, offsetX, 8, 8, 8, 8);
  graphics.fillStyle(0xff6f4f, 1);
  pixel(graphics, offsetX, 11, 5, 2, 3);
  pixel(graphics, offsetX, 10, 11, 4, 2);
}

function drawPowerSkull(graphics: Phaser.GameObjects.Graphics, offsetX: number): void {
  drawBadge(graphics, offsetX, 0xc7d2e0);
  graphics.fillStyle(0x2a3038, 1);
  pixel(graphics, offsetX, 9, 8, 6, 6);
  pixel(graphics, offsetX, 8, 14, 8, 3);
  pixel(graphics, offsetX, 10, 10, 1, 1);
  pixel(graphics, offsetX, 13, 10, 1, 1);
}

export function ensureRetroSpriteAtlas(scene: Phaser.Scene): void {
  if (scene.textures.exists(RETRO_ATLAS_KEY)) {
    return;
  }

  const frames: Array<{ name: string; draw: DrawFn }> = [
    { name: "tile-empty-0", draw: (graphics, offsetX) => drawTileEmpty(graphics, offsetX, 0) },
    { name: "tile-empty-1", draw: (graphics, offsetX) => drawTileEmpty(graphics, offsetX, 1) },
    { name: "tile-empty-2", draw: (graphics, offsetX) => drawTileEmpty(graphics, offsetX, 2) },
    { name: "tile-hard-0", draw: (graphics, offsetX) => drawTileHard(graphics, offsetX, 0) },
    { name: "tile-hard-1", draw: (graphics, offsetX) => drawTileHard(graphics, offsetX, 1) },
    { name: "tile-hard-2", draw: (graphics, offsetX) => drawTileHard(graphics, offsetX, 2) },
    { name: "tile-soft-0", draw: (graphics, offsetX) => drawTileSoft(graphics, offsetX, 0) },
    { name: "tile-soft-1", draw: (graphics, offsetX) => drawTileSoft(graphics, offsetX, 1) },
    { name: "tile-soft-2", draw: (graphics, offsetX) => drawTileSoft(graphics, offsetX, 2) },
    { name: "tile-sudden-0", draw: (graphics, offsetX) => drawTileSudden(graphics, offsetX, 0) },
    { name: "tile-sudden-1", draw: (graphics, offsetX) => drawTileSudden(graphics, offsetX, 1) },
    { name: "bomb-0", draw: (graphics, offsetX) => drawBomb(graphics, offsetX, false) },
    { name: "bomb-1", draw: (graphics, offsetX) => drawBomb(graphics, offsetX, true) },
    { name: "flame-0", draw: (graphics, offsetX) => drawFlame(graphics, offsetX, false) },
    { name: "flame-1", draw: (graphics, offsetX) => drawFlame(graphics, offsetX, true) },
    { name: "power-extraBomb", draw: drawPowerExtraBomb },
    { name: "power-flameUp", draw: drawPowerFlameUp },
    { name: "power-fullFire", draw: drawPowerFullFire },
    { name: "power-speedUp", draw: drawPowerSpeedUp },
    { name: "power-kick", draw: drawPowerKick },
    { name: "power-glove", draw: drawPowerGlove },
    { name: "power-powerBomb", draw: drawPowerPowerBomb },
    { name: "power-skull", draw: drawPowerSkull }
  ];

  for (let paletteIndex = 0; paletteIndex < PLAYER_PALETTES.length; paletteIndex += 1) {
    const palette = PLAYER_PALETTES[paletteIndex]!;
    frames.push(
      {
        name: `player-p${paletteIndex}-down-0`,
        draw: (graphics, offsetX) => drawPlayer(graphics, offsetX, "down", false, palette)
      },
      {
        name: `player-p${paletteIndex}-down-1`,
        draw: (graphics, offsetX) => drawPlayer(graphics, offsetX, "down", true, palette)
      },
      {
        name: `player-p${paletteIndex}-up-0`,
        draw: (graphics, offsetX) => drawPlayer(graphics, offsetX, "up", false, palette)
      },
      {
        name: `player-p${paletteIndex}-up-1`,
        draw: (graphics, offsetX) => drawPlayer(graphics, offsetX, "up", true, palette)
      },
      {
        name: `player-p${paletteIndex}-left-0`,
        draw: (graphics, offsetX) => drawPlayer(graphics, offsetX, "left", false, palette)
      },
      {
        name: `player-p${paletteIndex}-left-1`,
        draw: (graphics, offsetX) => drawPlayer(graphics, offsetX, "left", true, palette)
      },
      {
        name: `player-p${paletteIndex}-right-0`,
        draw: (graphics, offsetX) => drawPlayer(graphics, offsetX, "right", false, palette)
      },
      {
        name: `player-p${paletteIndex}-right-1`,
        draw: (graphics, offsetX) => drawPlayer(graphics, offsetX, "right", true, palette)
      }
    );
  }

  const graphics = scene.add.graphics({ x: 0, y: 0 });
  graphics.setVisible(false);

  frames.forEach((frame, index) => {
    const offsetX = index * FRAME_SIZE;
    frame.draw(graphics, offsetX);
  });

  graphics.generateTexture(RETRO_ATLAS_KEY, FRAME_SIZE * frames.length, FRAME_SIZE);
  graphics.destroy();

  const texture = scene.textures.get(RETRO_ATLAS_KEY);
  frames.forEach((frame, index) => {
    texture.add(frame.name, 0, index * FRAME_SIZE, 0, FRAME_SIZE, FRAME_SIZE);
  });
}

function frameHash(type: TileType, x: number, y: number): number {
  const seed = ((x + 1) * 73856093) ^ ((y + 1) * 19349663) ^ (type.length * 83492791);
  return Math.abs(seed) % 3;
}

export function tileFrameForType(type: TileType, x = 0, y = 0): string {
  const frames = TILE_FRAME_VARIANTS[type];
  if (!frames) {
    return "tile-empty-0";
  }
  const index = type === "suddenDeath" ? (x + y) % 2 : frameHash(type, x, y) % frames.length;
  return frames[index] ?? frames[0]!;
}

export function powerUpFrameForType(type: PowerUpType): string {
  return POWER_UP_FRAMES[type];
}

export function playerFrameForState(direction: Direction, moving: boolean, tick: number, paletteIndex = 0): string {
  const dir = direction === "none" ? "down" : direction;
  const phase = moving && tick % 12 < 6 ? 1 : 0;
  const palette = ((paletteIndex % PLAYER_PALETTES.length) + PLAYER_PALETTES.length) % PLAYER_PALETTES.length;
  return `player-p${palette}-${dir}-${phase}`;
}
