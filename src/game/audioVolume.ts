const SFX_OUTPUT_MULTIPLIER = 3.5;
const MUSIC_OUTPUT_MULTIPLIER = 1.2;

function clampUnit(value: number, fallback: number): number {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(1, Math.max(0, value));
}

export function effectiveSfxVolume(sfxVolume: number): number {
  const clamped = clampUnit(sfxVolume, 0.6);
  if (clamped <= 0) {
    return 0;
  }
  return Math.min(1, clamped * SFX_OUTPUT_MULTIPLIER);
}

export function effectiveMusicVolume(musicVolume: number): number {
  const clamped = clampUnit(musicVolume, 0.5);
  if (clamped <= 0) {
    return 0;
  }
  return Math.min(1, clamped * MUSIC_OUTPUT_MULTIPLIER);
}
