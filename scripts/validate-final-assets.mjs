import { promises as fs } from "node:fs";
import path from "node:path";

const FINAL_DIR = path.resolve(process.cwd(), "public/assets/final");
const FRAME_SIZE = 24;

const SPRITESHEETS = [
  { key: "theme-tiles", file: "tileset.png", frameWidth: FRAME_SIZE, frameHeight: FRAME_SIZE, expectedFrames: 8 },
  { key: "theme-player", file: "players.png", frameWidth: FRAME_SIZE, frameHeight: FRAME_SIZE, expectedFrames: 32 },
  { key: "theme-bomb", file: "bombs.png", frameWidth: FRAME_SIZE, frameHeight: FRAME_SIZE, expectedFrames: 2 },
  { key: "theme-flame", file: "flames.png", frameWidth: FRAME_SIZE, frameHeight: FRAME_SIZE, expectedFrames: 2 },
  { key: "theme-powerups", file: "powerups.png", frameWidth: FRAME_SIZE, frameHeight: FRAME_SIZE, expectedFrames: 8 }
];

const AUDIO_GROUPS = [
  {
    key: "bgm_battle",
    candidates: ["bgm-battle.ogg", "bgm-battle.mp3", "bgm-battle.m4a", "bgm-battle.wav"]
  },
  {
    key: "sfx_place",
    candidates: ["sfx-place.ogg", "sfx-place.mp3", "sfx-place.m4a", "sfx-place.wav"]
  },
  {
    key: "sfx_blast",
    candidates: ["sfx-blast.ogg", "sfx-blast.mp3", "sfx-blast.m4a", "sfx-blast.wav"]
  },
  {
    key: "sfx_pickup",
    candidates: ["sfx-pickup.ogg", "sfx-pickup.mp3", "sfx-pickup.m4a", "sfx-pickup.wav"]
  }
];

function hasPngSignature(bytes) {
  return (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  );
}

function parsePngDimensions(bytes) {
  if (bytes.length < 24) {
    return null;
  }
  const isIhdr = bytes[12] === 0x49 && bytes[13] === 0x48 && bytes[14] === 0x44 && bytes[15] === 0x52;
  if (!isIhdr) {
    return null;
  }

  const width = (bytes[16] << 24) | (bytes[17] << 16) | (bytes[18] << 8) | bytes[19];
  const height = (bytes[20] << 24) | (bytes[21] << 16) | (bytes[22] << 8) | bytes[23];
  if (width <= 0 || height <= 0) {
    return null;
  }

  return { width, height };
}

function hasOggSignature(bytes) {
  return bytes.length >= 4 && bytes[0] === 0x4f && bytes[1] === 0x67 && bytes[2] === 0x67 && bytes[3] === 0x53;
}

function hasMp3Signature(bytes) {
  if (bytes.length < 3) {
    return false;
  }

  if (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) {
    return true;
  }

  return bytes.length >= 2 && bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0;
}

function hasM4aSignature(bytes) {
  return bytes.length >= 12 && bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70;
}

function hasWavSignature(bytes) {
  return (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x41 &&
    bytes[10] === 0x56 &&
    bytes[11] === 0x45
  );
}

function extensionOf(fileName) {
  if (fileName.endsWith(".ogg")) {
    return "ogg";
  }
  if (fileName.endsWith(".mp3")) {
    return "mp3";
  }
  if (fileName.endsWith(".m4a")) {
    return "m4a";
  }
  if (fileName.endsWith(".wav")) {
    return "wav";
  }
  return null;
}

function isAudioValid(ext, bytes) {
  if (ext === "ogg") {
    return hasOggSignature(bytes);
  }
  if (ext === "mp3") {
    return hasMp3Signature(bytes);
  }
  if (ext === "m4a") {
    return hasM4aSignature(bytes);
  }
  if (ext === "wav") {
    return hasWavSignature(bytes);
  }
  return false;
}

async function readBytes(filePath) {
  try {
    const bytes = await fs.readFile(filePath);
    if (bytes.length === 0) {
      return null;
    }
    return bytes;
  } catch {
    return null;
  }
}

async function validateSpritesheets(errors) {
  for (const sheet of SPRITESHEETS) {
    const fullPath = path.join(FINAL_DIR, sheet.file);
    const bytes = await readBytes(fullPath);
    if (!bytes) {
      errors.push(`[${sheet.key}] missing or empty file: ${sheet.file}`);
      continue;
    }

    if (!hasPngSignature(bytes)) {
      errors.push(`[${sheet.key}] invalid PNG signature: ${sheet.file}`);
      continue;
    }

    const dimensions = parsePngDimensions(bytes);
    if (!dimensions) {
      errors.push(`[${sheet.key}] unable to read PNG dimensions: ${sheet.file}`);
      continue;
    }

    if (dimensions.width % sheet.frameWidth !== 0 || dimensions.height % sheet.frameHeight !== 0) {
      errors.push(
        `[${sheet.key}] ${dimensions.width}x${dimensions.height} does not align with frame ${sheet.frameWidth}x${sheet.frameHeight}`
      );
      continue;
    }

    const frameCount = (dimensions.width / sheet.frameWidth) * (dimensions.height / sheet.frameHeight);
    if (frameCount < sheet.expectedFrames) {
      errors.push(`[${sheet.key}] expected >= ${sheet.expectedFrames} frames, found ${frameCount}`);
    }
  }
}

async function validateAudio(errors) {
  for (const group of AUDIO_GROUPS) {
    let valid = false;

    for (const candidate of group.candidates) {
      const fullPath = path.join(FINAL_DIR, candidate);
      const bytes = await readBytes(fullPath);
      if (!bytes) {
        continue;
      }

      const ext = extensionOf(candidate);
      if (!ext) {
        continue;
      }

      if (isAudioValid(ext, bytes)) {
        valid = true;
        break;
      }
    }

    if (!valid) {
      errors.push(`[${group.key}] no valid audio file found in: ${group.candidates.join(", ")}`);
    }
  }
}

async function main() {
  const errors = [];

  await validateSpritesheets(errors);
  await validateAudio(errors);

  if (errors.length > 0) {
    console.error("Asset validation failed:\n");
    for (const error of errors) {
      console.error(`- ${error}`);
    }
    process.exit(1);
  }

  console.log("Asset validation passed.");
}

await main();
