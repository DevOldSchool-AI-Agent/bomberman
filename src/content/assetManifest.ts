import Phaser from "phaser";

export interface SpriteSheetAsset {
  readonly key: string;
  readonly path: string;
  readonly frameWidth: number;
  readonly frameHeight: number;
  readonly expectedFrames: number;
}

export interface AudioAsset {
  readonly key: string;
  readonly paths: string[];
}

export interface FinalThemeManifest {
  readonly spritesheets: SpriteSheetAsset[];
  readonly audio: AudioAsset[];
}

export interface ThemeAvailability {
  readonly loadedSpriteKeys: string[];
  readonly loadedAudioKeys: string[];
  readonly missingVisualKeys: string[];
  readonly missingAudioKeys: string[];
  readonly hasExternalVisualTheme: boolean;
  readonly hasExternalSfxTheme: boolean;
  readonly hasBattleMusic: boolean;
}

export interface ThemeProbeIssue {
  readonly kind: "spritesheet" | "audio";
  readonly key: string;
  readonly reason: string;
}

export interface ThemeProbeResult {
  readonly manifest: FinalThemeManifest;
  readonly issues: ThemeProbeIssue[];
}

const FRAME_SIZE = 24;
const EXTERNAL_AUDIO_ENABLED = true;
const BASE_URL = import.meta.env.BASE_URL;

function withBaseUrl(path: string): string {
  const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
  return `${BASE_URL}${normalizedPath}`;
}

export const FINAL_THEME_MANIFEST: FinalThemeManifest = {
  spritesheets: [
    {
      key: "theme-tiles",
      path: withBaseUrl("assets/final/tileset.png"),
      frameWidth: FRAME_SIZE,
      frameHeight: FRAME_SIZE,
      expectedFrames: 8
    },
    {
      key: "theme-player",
      path: withBaseUrl("assets/final/players.png"),
      frameWidth: FRAME_SIZE,
      frameHeight: FRAME_SIZE,
      expectedFrames: 32
    },
    {
      key: "theme-bomb",
      path: withBaseUrl("assets/final/bombs.png"),
      frameWidth: FRAME_SIZE,
      frameHeight: FRAME_SIZE,
      expectedFrames: 2
    },
    {
      key: "theme-flame",
      path: withBaseUrl("assets/final/flames.png"),
      frameWidth: FRAME_SIZE,
      frameHeight: FRAME_SIZE,
      expectedFrames: 2
    },
    {
      key: "theme-powerups",
      path: withBaseUrl("assets/final/powerups.png"),
      frameWidth: FRAME_SIZE,
      frameHeight: FRAME_SIZE,
      expectedFrames: 8
    }
  ],
  audio: [
    {
      key: "bgm_battle",
      paths: [
        withBaseUrl("assets/final/bgm-battle.ogg"),
        withBaseUrl("assets/final/bgm-battle.wav")
      ]
    },
    {
      key: "sfx_place",
      paths: [
        withBaseUrl("assets/final/sfx-place.ogg"),
        withBaseUrl("assets/final/sfx-place.wav")
      ]
    },
    {
      key: "sfx_blast",
      paths: [
        withBaseUrl("assets/final/sfx-blast.ogg"),
        withBaseUrl("assets/final/sfx-blast.wav")
      ]
    },
    {
      key: "sfx_pickup",
      paths: [
        withBaseUrl("assets/final/sfx-pickup.ogg"),
        withBaseUrl("assets/final/sfx-pickup.wav")
      ]
    }
  ]
};

const REQUIRED_VISUAL_KEYS = ["theme-tiles", "theme-player", "theme-bomb", "theme-flame", "theme-powerups"] as const;
const REQUIRED_SFX_KEYS: readonly string[] = EXTERNAL_AUDIO_ENABLED ? ["sfx_place", "sfx_blast", "sfx_pickup"] : [];

function activeAudioManifest(): AudioAsset[] {
  return EXTERNAL_AUDIO_ENABLED ? FINAL_THEME_MANIFEST.audio : [];
}

async function fetchAssetBytes(path: string): Promise<Uint8Array | null> {
  try {
    const response = await fetch(path, { method: "GET", cache: "no-store" });
    if (!response.ok) {
      return null;
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    return bytes.length > 0 ? bytes : null;
  } catch {
    return null;
  }
}

function parsePngDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length < 24) {
    return null;
  }
  const isIhdr = bytes[12] === 0x49 && bytes[13] === 0x48 && bytes[14] === 0x44 && bytes[15] === 0x52;
  if (!isIhdr) {
    return null;
  }

  const width = (bytes[16]! << 24) | (bytes[17]! << 16) | (bytes[18]! << 8) | bytes[19]!;
  const height = (bytes[20]! << 24) | (bytes[21]! << 16) | (bytes[22]! << 8) | bytes[23]!;
  if (width <= 0 || height <= 0) {
    return null;
  }

  return { width, height };
}

function hasPngSignature(bytes: Uint8Array): boolean {
  if (bytes.length < 8) {
    return false;
  }
  return (
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

function hasOggSignature(bytes: Uint8Array): boolean {
  if (bytes.length < 4) {
    return false;
  }
  return bytes[0] === 0x4f && bytes[1] === 0x67 && bytes[2] === 0x67 && bytes[3] === 0x53;
}

function hasMp3Signature(bytes: Uint8Array): boolean {
  if (bytes.length < 3) {
    return false;
  }

  const hasId3Tag = bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33;
  if (hasId3Tag) {
    return true;
  }

  if (bytes.length < 2) {
    return false;
  }

  return bytes[0] === 0xff && (bytes[1]! & 0xe0) === 0xe0;
}

function hasM4aSignature(bytes: Uint8Array): boolean {
  if (bytes.length < 12) {
    return false;
  }
  return bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70;
}

type AudioFormat = "ogg" | "mp3" | "m4a" | "wav";

function audioFormatFromPath(path: string): AudioFormat | null {
  if (path.endsWith(".ogg")) {
    return "ogg";
  }
  if (path.endsWith(".mp3")) {
    return "mp3";
  }
  if (path.endsWith(".m4a")) {
    return "m4a";
  }
  if (path.endsWith(".wav")) {
    return "wav";
  }
  return null;
}

function browserAudioSupport(): Record<AudioFormat, boolean> {
  if (typeof document === "undefined") {
    return { ogg: false, mp3: false, m4a: false, wav: false };
  }
  const audio = document.createElement("audio");
  if (typeof audio.canPlayType !== "function") {
    return { ogg: false, mp3: false, m4a: false, wav: false };
  }

  const canPlay = (mime: string): boolean => {
    const support = audio.canPlayType(mime);
    return support === "probably" || support === "maybe";
  };

  return {
    ogg: canPlay('audio/ogg; codecs="vorbis"'),
    mp3: canPlay("audio/mpeg"),
    m4a: canPlay('audio/mp4; codecs="mp4a.40.2"'),
    wav: canPlay('audio/wav; codecs="1"') || canPlay("audio/wav")
  };
}

function isAudioSignatureValid(format: AudioFormat, bytes: Uint8Array): boolean {
  if (format === "ogg") {
    return hasOggSignature(bytes);
  }
  if (format === "mp3") {
    return hasMp3Signature(bytes);
  }
  if (format === "m4a") {
    return hasM4aSignature(bytes);
  }
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

export async function probeFinalThemeManifest(): Promise<ThemeProbeResult> {
  const support = browserAudioSupport();
  const issues: ThemeProbeIssue[] = [];

  const spritesheets: SpriteSheetAsset[] = [];
  for (const sheet of FINAL_THEME_MANIFEST.spritesheets) {
    const bytes = await fetchAssetBytes(sheet.path);
    if (!bytes) {
      issues.push({
        kind: "spritesheet",
        key: sheet.key,
        reason: `missing or empty file at ${sheet.path}`
      });
      continue;
    }
    if (!hasPngSignature(bytes)) {
      issues.push({
        kind: "spritesheet",
        key: sheet.key,
        reason: `invalid PNG signature at ${sheet.path}`
      });
      continue;
    }

    const dimensions = parsePngDimensions(bytes);
    if (!dimensions) {
      issues.push({
        kind: "spritesheet",
        key: sheet.key,
        reason: `unable to read PNG dimensions at ${sheet.path}`
      });
      continue;
    }

    if (dimensions.width % sheet.frameWidth !== 0 || dimensions.height % sheet.frameHeight !== 0) {
      issues.push({
        kind: "spritesheet",
        key: sheet.key,
        reason: `image dimensions ${dimensions.width}x${dimensions.height} do not align to ${sheet.frameWidth}x${sheet.frameHeight}`
      });
      continue;
    }

    const frameCount = (dimensions.width / sheet.frameWidth) * (dimensions.height / sheet.frameHeight);
    if (frameCount < sheet.expectedFrames) {
      issues.push({
        kind: "spritesheet",
        key: sheet.key,
        reason: `expected at least ${sheet.expectedFrames} frames, found ${frameCount}`
      });
      continue;
    }

    spritesheets.push(sheet);
  }

  const audio: AudioAsset[] = [];
  for (const audioAsset of activeAudioManifest()) {
    let selectedPath: string | null = null;
    const rejectionReasons: string[] = [];

    for (const path of audioAsset.paths) {
      const format = audioFormatFromPath(path);
      if (!format) {
        rejectionReasons.push(`${path} has unsupported extension`);
        continue;
      }

      if (!support[format]) {
        rejectionReasons.push(`${path} codec not supported by browser`);
        continue;
      }

      const bytes = await fetchAssetBytes(path);
      if (!bytes) {
        rejectionReasons.push(`${path} missing or empty`);
        continue;
      }

      if (!isAudioSignatureValid(format, bytes)) {
        rejectionReasons.push(`${path} invalid ${format.toUpperCase()} signature`);
        continue;
      }

      selectedPath = path;
      break;
    }

    if (!selectedPath) {
      issues.push({
        kind: "audio",
        key: audioAsset.key,
        reason: rejectionReasons.length > 0 ? rejectionReasons.join("; ") : "no valid audio source"
      });
      continue;
    }

    audio.push({ key: audioAsset.key, paths: [selectedPath] });
  }

  return {
    manifest: { spritesheets, audio },
    issues
  };
}

export function queueFinalThemeLoads(scene: Phaser.Scene, manifest: FinalThemeManifest = FINAL_THEME_MANIFEST): void {
  for (const sheet of manifest.spritesheets) {
    scene.load.spritesheet(sheet.key, sheet.path, {
      frameWidth: sheet.frameWidth,
      frameHeight: sheet.frameHeight
    });
  }

  for (const audio of manifest.audio) {
    scene.load.audio(audio.key, audio.paths);
  }
}

export function resolveThemeAvailability(scene: Phaser.Scene): ThemeAvailability {
  const loadedSpriteKeys = FINAL_THEME_MANIFEST.spritesheets
    .filter((sheet) => scene.textures.exists(sheet.key))
    .map((sheet) => sheet.key);

  const loadedAudioKeys = activeAudioManifest()
    .filter((audio) => scene.cache.audio.exists(audio.key))
    .map((audio) => audio.key);

  const missingVisualKeys = REQUIRED_VISUAL_KEYS.filter((key) => !loadedSpriteKeys.includes(key));
  const missingAudioKeys = REQUIRED_SFX_KEYS.filter((key) => !loadedAudioKeys.includes(key));

  return {
    loadedSpriteKeys,
    loadedAudioKeys,
    missingVisualKeys,
    missingAudioKeys,
    hasExternalVisualTheme: missingVisualKeys.length === 0,
    hasExternalSfxTheme: missingAudioKeys.length === 0,
    hasBattleMusic: EXTERNAL_AUDIO_ENABLED && loadedAudioKeys.includes("bgm_battle")
  };
}
