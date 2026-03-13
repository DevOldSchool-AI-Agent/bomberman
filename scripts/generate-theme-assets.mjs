import { promises as fs } from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const OUT_DIR = path.resolve(process.cwd(), "public/assets/final");
const FRAME = 24;
const SAMPLE_RATE = 44100;

function rgb(hex) {
  return [(hex >> 16) & 0xff, (hex >> 8) & 0xff, hex & 0xff];
}

function makeCanvas(width, height, fillHex = 0x000000, fillAlpha = 255) {
  const data = new Uint8Array(width * height * 4);
  const [r, g, b] = rgb(fillHex);
  for (let i = 0; i < width * height; i += 1) {
    const offset = i * 4;
    data[offset] = r;
    data[offset + 1] = g;
    data[offset + 2] = b;
    data[offset + 3] = fillAlpha;
  }
  return { width, height, data };
}

function setPixel(canvas, x, y, hex, alpha = 255) {
  if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) {
    return;
  }
  const idx = (y * canvas.width + x) * 4;
  const [r, g, b] = rgb(hex);
  canvas.data[idx] = r;
  canvas.data[idx + 1] = g;
  canvas.data[idx + 2] = b;
  canvas.data[idx + 3] = alpha;
}

function fillRect(canvas, x, y, width, height, hex, alpha = 255) {
  const sx = Math.max(0, x);
  const sy = Math.max(0, y);
  const ex = Math.min(canvas.width, x + width);
  const ey = Math.min(canvas.height, y + height);
  for (let py = sy; py < ey; py += 1) {
    for (let px = sx; px < ex; px += 1) {
      setPixel(canvas, px, py, hex, alpha);
    }
  }
}

function strokeRect(canvas, x, y, width, height, hex) {
  fillRect(canvas, x, y, width, 1, hex);
  fillRect(canvas, x, y + height - 1, width, 1, hex);
  fillRect(canvas, x, y, 1, height, hex);
  fillRect(canvas, x + width - 1, y, 1, height, hex);
}

function drawTileEmptyFrame(canvas, ox, variant) {
  fillRect(canvas, ox, 0, FRAME, FRAME, variant === 0 ? 0x229154 : 0x2ea362);
  for (let y = 0; y < FRAME; y += 3) {
    for (let x = 0; x < FRAME; x += 3) {
      if ((x + y + variant) % 2 === 0) {
        fillRect(canvas, ox + x, y, 2, 2, variant === 0 ? 0x2fae68 : 0x3ab976);
      } else {
        fillRect(canvas, ox + x, y, 1, 1, variant === 0 ? 0x1f7d49 : 0x2a8d55);
      }
    }
  }
  fillRect(canvas, ox + 1, 1, FRAME - 2, 2, 0x78e19a, 120);
  fillRect(canvas, ox + 2, FRAME - 3, FRAME - 4, 1, 0x154f33, 130);
}

function drawTileHardFrame(canvas, ox, variant) {
  fillRect(canvas, ox, 0, FRAME, FRAME, variant === 0 ? 0x507ab2 : 0x5d88be);
  fillRect(canvas, ox + 1, 1, FRAME - 2, 3, variant === 0 ? 0xafd7ff : 0xc0e3ff);
  fillRect(canvas, ox + 2, 5, FRAME - 4, FRAME - 8, variant === 0 ? 0x698fbe : 0x769fca);
  fillRect(canvas, ox + 1, FRAME - 3, FRAME - 2, 2, 0x2a4163);
  for (let x = ox + 4 + variant; x < ox + FRAME - 2; x += 5) {
    fillRect(canvas, x, 6, 1, FRAME - 10, variant === 0 ? 0x87aed9 : 0x94bbe3);
  }
  fillRect(canvas, ox + 4, 4, 2, 2, 0xcce7ff);
  fillRect(canvas, ox + FRAME - 6, 4, 2, 2, 0xcce7ff);
  fillRect(canvas, ox + 4, FRAME - 6, 2, 2, 0x304d73);
  fillRect(canvas, ox + FRAME - 6, FRAME - 6, 2, 2, 0x304d73);
  strokeRect(canvas, ox, 0, FRAME, FRAME, 0x1b2a42);
}

function drawTileSoftFrame(canvas, ox, variant) {
  fillRect(canvas, ox, 0, FRAME, FRAME, variant === 0 ? 0xc77a36 : 0xd0843d);
  fillRect(canvas, ox + 1, 1, FRAME - 2, 2, 0xf0b66f);
  for (let y = 4; y < FRAME - 2; y += 6) {
    fillRect(canvas, ox + 2, y, FRAME - 4, 3, variant === 0 ? 0xdb984e : 0xe2a358);
  }
  for (let x = ox + 3 + variant; x < ox + FRAME - 1; x += 4) {
    fillRect(canvas, x, 2, 1, FRAME - 4, variant === 0 ? 0x8c5327 : 0x965b2b);
  }
  fillRect(canvas, ox + 4, 8, 2, 2, 0xf7d2a2);
  fillRect(canvas, ox + FRAME - 6, 14, 2, 2, 0x6f3f1a);
  fillRect(canvas, ox + 8, FRAME - 6, 2, 2, 0x6f3f1a);
  strokeRect(canvas, ox, 0, FRAME, FRAME, 0x513015);
}

function drawTileSuddenFrame(canvas, ox, variant) {
  fillRect(canvas, ox, 0, FRAME, FRAME, variant === 0 ? 0xbf2f2f : 0xd03934);
  fillRect(canvas, ox + 1, 1, FRAME - 2, 2, 0xff9f64);
  for (let i = -FRAME; i < FRAME * 2; i += 5) {
    for (let y = 0; y < FRAME; y += 1) {
      const x = i + y + variant;
      if (x >= 0 && x < FRAME) {
        fillRect(canvas, ox + x, y, 2, 1, 0xffd251);
      }
    }
  }
  fillRect(canvas, ox + 2, FRAME - 4, FRAME - 4, 2, 0x701818);
  strokeRect(canvas, ox, 0, FRAME, FRAME, 0x651111);
}

function drawTileset() {
  // Frame order kept backward compatible:
  // 0 empty, 1 hard, 2 soft, 3 sudden, 4 empty-alt, 5 hard-alt, 6 soft-alt, 7 sudden-alt
  const c = makeCanvas(FRAME * 8, FRAME, 0x000000, 255);
  drawTileEmptyFrame(c, FRAME * 0, 0);
  drawTileHardFrame(c, FRAME * 1, 0);
  drawTileSoftFrame(c, FRAME * 2, 0);
  drawTileSuddenFrame(c, FRAME * 3, 0);
  drawTileEmptyFrame(c, FRAME * 4, 1);
  drawTileHardFrame(c, FRAME * 5, 1);
  drawTileSoftFrame(c, FRAME * 6, 1);
  drawTileSuddenFrame(c, FRAME * 7, 1);
  return c;
}

const PLAYER_PALETTES = [
  {
    helmet: 0xf5f9ff,
    helmetShade: 0xd6e7fa,
    visor: 0xffba57,
    visorHi: 0xffffff,
    suit: 0x63afff,
    suitHi: 0x95ceff,
    suitShade: 0x3f81c9,
    belt: 0x20364f,
    glove: 0xf2f7ff,
    boot: 0x162030
  },
  {
    helmet: 0xfff6f2,
    helmetShade: 0xf8d8cb,
    visor: 0xffb075,
    visorHi: 0xfff3df,
    suit: 0xff6b6b,
    suitHi: 0xff9a9a,
    suitShade: 0xcf4f4f,
    belt: 0x4e2222,
    glove: 0xfff2f2,
    boot: 0x2a1414
  },
  {
    helmet: 0xf4fff8,
    helmetShade: 0xd3f1dd,
    visor: 0xffc07d,
    visorHi: 0xfff3df,
    suit: 0x63d88c,
    suitHi: 0x8cecb0,
    suitShade: 0x43ab6a,
    belt: 0x1f4430,
    glove: 0xf2fff7,
    boot: 0x14291d
  },
  {
    helmet: 0xfffdea,
    helmetShade: 0xf6edb9,
    visor: 0xffbe57,
    visorHi: 0xfff5d8,
    suit: 0xf2d764,
    suitHi: 0xffeb98,
    suitShade: 0xc6ac45,
    belt: 0x4f4420,
    glove: 0xfffdea,
    boot: 0x2f2913
  }
];

function drawPlayerFrame(canvas, ox, direction, walk, palette) {
  const legLift = walk ? 1 : 0;
  const armLift = walk ? 1 : 0;

  fillRect(canvas, ox + 4, 2, 16, 20, 0x0b1118);

  // Helmet and visor.
  fillRect(canvas, ox + 5, 3, 14, 8, palette.helmet);
  fillRect(canvas, ox + 6, 4, 12, 2, palette.helmetShade);
  fillRect(canvas, ox + 6, 8, 12, 2, palette.visor);
  fillRect(canvas, ox + 7, 6, 10, 1, palette.visorHi, 140);

  // Face panel by direction.
  if (direction === "up") {
    fillRect(canvas, ox + 8, 10, 8, 2, 0xd4e0ef);
  } else if (direction === "left") {
    fillRect(canvas, ox + 8, 10, 4, 2, 0xfaf2dd);
    fillRect(canvas, ox + 8, 10, 1, 1, 0x1f2735);
  } else if (direction === "right") {
    fillRect(canvas, ox + 12, 10, 4, 2, 0xfaf2dd);
    fillRect(canvas, ox + 15, 10, 1, 1, 0x1f2735);
  } else {
    fillRect(canvas, ox + 8, 10, 8, 2, 0xfaf2dd);
    fillRect(canvas, ox + 10, 10, 1, 1, 0x1f2735);
    fillRect(canvas, ox + 13, 10, 1, 1, 0x1f2735);
  }

  // Torso and belt.
  fillRect(canvas, ox + 7, 12, 10, 7, palette.suit);
  fillRect(canvas, ox + 8, 13, 8, 3, palette.suitHi);
  fillRect(canvas, ox + 7, 16, 10, 2, palette.suitShade);
  fillRect(canvas, ox + 8, 18, 8, 1, palette.belt);

  // Arms and gloves.
  if (direction === "left") {
    fillRect(canvas, ox + 5, 13, 2, 4, palette.glove);
    fillRect(canvas, ox + 17, 13 + armLift, 2, 4, palette.glove);
  } else if (direction === "right") {
    fillRect(canvas, ox + 5, 13 + armLift, 2, 4, palette.glove);
    fillRect(canvas, ox + 17, 13, 2, 4, palette.glove);
  } else {
    fillRect(canvas, ox + 5, 13 + armLift, 2, 4, palette.glove);
    fillRect(canvas, ox + 17, 14 - armLift, 2, 4, palette.glove);
  }

  // Boots.
  fillRect(canvas, ox + 8, 19 + legLift, 3, 3, palette.boot);
  fillRect(canvas, ox + 13, 20 - legLift, 3, 3, palette.boot);

  strokeRect(canvas, ox + 4, 2, 16, 20, 0x05080d);
}

function drawPlayers() {
  // Frame order by palette block:
  // p0 down0..right1, p1 down0..right1, p2 down0..right1, p3 down0..right1
  const framesPerPalette = 8;
  const c = makeCanvas(FRAME * framesPerPalette * PLAYER_PALETTES.length, FRAME, 0x000000, 0);
  PLAYER_PALETTES.forEach((palette, paletteIndex) => {
    const base = paletteIndex * framesPerPalette;
    drawPlayerFrame(c, FRAME * (base + 0), "down", false, palette);
    drawPlayerFrame(c, FRAME * (base + 1), "down", true, palette);
    drawPlayerFrame(c, FRAME * (base + 2), "up", false, palette);
    drawPlayerFrame(c, FRAME * (base + 3), "up", true, palette);
    drawPlayerFrame(c, FRAME * (base + 4), "left", false, palette);
    drawPlayerFrame(c, FRAME * (base + 5), "left", true, palette);
    drawPlayerFrame(c, FRAME * (base + 6), "right", false, palette);
    drawPlayerFrame(c, FRAME * (base + 7), "right", true, palette);
  });
  return c;
}

function drawBombs() {
  const c = makeCanvas(FRAME * 2, FRAME, 0x000000, 0);
  const drawBomb = (ox, lit) => {
    fillRect(c, ox + 5, 5, 14, 14, 0x171c26);
    fillRect(c, ox + 6, 6, 12, 12, 0x4e596d);
    fillRect(c, ox + 9, 8, 4, 4, 0xeef5ff);
    fillRect(c, ox + 11, 3, 2, 4, lit ? 0xffda64 : 0x9ba7b7);
    fillRect(c, ox + 11, 1, 2, 2, lit ? 0xff673f : 0x778395);
    strokeRect(c, ox + 5, 5, 14, 14, 0x0e1218);
    fillRect(c, ox + 10, 9, 1, 2, 0xffffff, 180);
  };
  drawBomb(0, false);
  drawBomb(FRAME, true);
  return c;
}

function drawFlames() {
  const c = makeCanvas(FRAME * 2, FRAME, 0x000000, 0);
  const drawFlame = (ox, alt) => {
    fillRect(c, ox + 8, 2, 8, 20, 0xffe78f);
    fillRect(c, ox + 5, 8, 14, 10, alt ? 0xffa644 : 0xff7e34);
    fillRect(c, ox + 10, 6, 4, 12, alt ? 0xff7f2b : 0xff9f49);
    fillRect(c, ox + 11, 8, 2, 7, 0xfff7d0);
    strokeRect(c, ox + 5, 2, 14, 20, 0x7b2a10);
    fillRect(c, ox + 12, 5, 1, 2, 0xffffff, 160);
  };
  drawFlame(0, false);
  drawFlame(FRAME, true);
  return c;
}

function drawPowerups() {
  const c = makeCanvas(FRAME * 8, FRAME, 0x000000, 0);
  const badge = (ox, bg) => {
    fillRect(c, ox + 2, 2, 20, 20, 0x1e4460);
    fillRect(c, ox + 3, 3, 18, 18, 0x4f86ab);
    fillRect(c, ox + 5, 5, 14, 14, bg);
    fillRect(c, ox + 6, 6, 12, 2, 0xffffff, 95);
    strokeRect(c, ox + 3, 3, 18, 18, 0x9fd8ff);
  };

  // extraBomb
  badge(0, 0xf5f5f5);
  fillRect(c, 9, 9, 6, 6, 0x111319);
  fillRect(c, 11, 7, 2, 2, 0x111319);

  // flameUp
  badge(FRAME, 0xff9a4d);
  fillRect(c, FRAME + 9, 7, 6, 10, 0xffe8ae);
  fillRect(c, FRAME + 7, 10, 10, 5, 0xffe8ae);

  // fullFire
  badge(FRAME * 2, 0xff7c49);
  fillRect(c, FRAME * 2 + 8, 6, 8, 12, 0xfff0c4);
  fillRect(c, FRAME * 2 + 6, 10, 12, 6, 0xfff0c4);

  // speed
  badge(FRAME * 3, 0x8eefff);
  fillRect(c, FRAME * 3 + 7, 9, 10, 2, 0x1e465f);
  fillRect(c, FRAME * 3 + 9, 12, 10, 2, 0x1e465f);

  // kick
  badge(FRAME * 4, 0xff80c1);
  fillRect(c, FRAME * 4 + 7, 11, 7, 4, 0x6f2448);
  fillRect(c, FRAME * 4 + 12, 13, 6, 3, 0x6f2448);

  // glove
  badge(FRAME * 5, 0xb8e8ff);
  fillRect(c, FRAME * 5 + 7, 9, 10, 8, 0x2a4c63);
  fillRect(c, FRAME * 5 + 7, 7, 2, 3, 0x2a4c63);
  fillRect(c, FRAME * 5 + 10, 7, 2, 3, 0x2a4c63);
  fillRect(c, FRAME * 5 + 13, 7, 2, 3, 0x2a4c63);

  // powerBomb
  badge(FRAME * 6, 0xffcfa9);
  fillRect(c, FRAME * 6 + 8, 8, 8, 8, 0x2c1f17);
  fillRect(c, FRAME * 6 + 11, 5, 2, 3, 0xff6e4d);

  // skull
  badge(FRAME * 7, 0xc6d0dd);
  fillRect(c, FRAME * 7 + 9, 8, 6, 6, 0x2b3138);
  fillRect(c, FRAME * 7 + 8, 14, 8, 3, 0x2b3138);
  fillRect(c, FRAME * 7 + 10, 10, 1, 1, 0xe6eef6);
  fillRect(c, FRAME * 7 + 13, 10, 1, 1, 0xe6eef6);

  return c;
}

function makeCrcTable() {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
}

const CRC_TABLE = makeCrcTable();

function crc32(buffer) {
  let c = 0xffffffff;
  for (let i = 0; i < buffer.length; i += 1) {
    c = CRC_TABLE[(c ^ buffer[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBuffer = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crcBuffer = Buffer.alloc(4);
  const crc = crc32(Buffer.concat([typeBuffer, data]));
  crcBuffer.writeUInt32BE(crc >>> 0, 0);
  return Buffer.concat([length, typeBuffer, data, crcBuffer]);
}

function encodePng(canvas) {
  const rowBytes = canvas.width * 4;
  const raw = Buffer.alloc((rowBytes + 1) * canvas.height);
  for (let y = 0; y < canvas.height; y += 1) {
    const rawOffset = y * (rowBytes + 1);
    raw[rawOffset] = 0;
    const srcOffset = y * rowBytes;
    canvas.data.slice(srcOffset, srcOffset + rowBytes).forEach((value, i) => {
      raw[rawOffset + 1 + i] = value;
    });
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(canvas.width, 0);
  ihdr.writeUInt32BE(canvas.height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", idat),
    pngChunk("IEND", Buffer.alloc(0))
  ]);
}

function makeWav(durationSeconds, sampleFn) {
  const sampleCount = Math.max(1, Math.floor(SAMPLE_RATE * durationSeconds));
  const channels = 1;
  const bitsPerSample = 16;
  const blockAlign = channels * (bitsPerSample / 8);
  const byteRate = SAMPLE_RATE * blockAlign;
  const dataSize = sampleCount * blockAlign;
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write("RIFF", 0, 4, "ascii");
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8, 4, "ascii");
  buffer.write("fmt ", 12, 4, "ascii");
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(channels, 22);
  buffer.writeUInt32LE(SAMPLE_RATE, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bitsPerSample, 34);
  buffer.write("data", 36, 4, "ascii");
  buffer.writeUInt32LE(dataSize, 40);

  for (let i = 0; i < sampleCount; i += 1) {
    const t = i / SAMPLE_RATE;
    const value = Math.max(-1, Math.min(1, sampleFn(t, i, sampleCount)));
    buffer.writeInt16LE(Math.floor(value * 32767), 44 + i * 2);
  }

  return buffer;
}

function tone(frequency, amp = 0.4) {
  return (t) => Math.sin(2 * Math.PI * frequency * t) * amp;
}

function decayed(frequency, duration, amp = 0.5) {
  return (t) => {
    const decay = Math.max(0, 1 - t / duration);
    return Math.sin(2 * Math.PI * frequency * t) * decay * amp;
  };
}

function battleLoop() {
  const notes = [220, 277.18, 329.63, 440, 329.63, 277.18];
  const step = 0.25;
  return (t) => {
    const idx = Math.floor(t / step) % notes.length;
    const f = notes[idx] ?? 220;
    const lead = Math.sin(2 * Math.PI * f * t) * 0.26;
    const bass = Math.sin(2 * Math.PI * (f / 2) * t) * 0.14;
    return lead + bass;
  };
}

async function writePng(fileName, canvas) {
  await fs.writeFile(path.join(OUT_DIR, fileName), encodePng(canvas));
}

async function writeWav(fileName, duration, fn) {
  await fs.writeFile(path.join(OUT_DIR, fileName), makeWav(duration, fn));
}

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });

  await writePng("tileset.png", drawTileset());
  await writePng("players.png", drawPlayers());
  await writePng("bombs.png", drawBombs());
  await writePng("flames.png", drawFlames());
  await writePng("powerups.png", drawPowerups());

  await writeWav("bgm-battle.wav", 6, battleLoop());
  await writeWav("sfx-place.wav", 0.16, decayed(260, 0.16, 0.45));
  await writeWav("sfx-blast.wav", 0.34, (t) => (Math.random() * 2 - 1) * Math.max(0, 1 - t / 0.34) * 0.6);
  await writeWav("sfx-pickup.wav", 0.22, (t) => tone(680, 0.3)(t) + tone(980, 0.2)(t));

  console.log("Generated external theme assets in public/assets/final");
}

await main();
