export interface PersistedSettings {
  sfxVolume: number;
  musicVolume: number;
  musicEnabled: boolean;
  masterVolume?: number;
}

const STORAGE_KEY = "neo-bomber-settings-v1";

function hasLocalStorage(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function clampVolume(volume: number): number {
  if (!Number.isFinite(volume)) {
    return 1;
  }
  return Math.min(1, Math.max(0, volume));
}

export function loadPersistedSettings(): Partial<PersistedSettings> {
  if (!hasLocalStorage()) {
    return {};
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return {};
    }

    const parsed = JSON.parse(raw) as Partial<PersistedSettings> | null;
    if (!parsed || typeof parsed !== "object") {
      return {};
    }

    const loaded: Partial<PersistedSettings> = {};
    if (typeof parsed.sfxVolume === "number") {
      loaded.sfxVolume = clampVolume(parsed.sfxVolume);
    } else if (typeof parsed.masterVolume === "number") {
      loaded.sfxVolume = clampVolume(parsed.masterVolume);
    }
    if (typeof parsed.musicVolume === "number") {
      loaded.musicVolume = clampVolume(parsed.musicVolume);
    } else if (typeof parsed.masterVolume === "number") {
      loaded.musicVolume = clampVolume(parsed.masterVolume);
    }
    if (typeof parsed.musicEnabled === "boolean") {
      loaded.musicEnabled = parsed.musicEnabled;
    }
    return loaded;
  } catch {
    return {};
  }
}

export function savePersistedSettings(settings: PersistedSettings): void {
  if (!hasLocalStorage()) {
    return;
  }

  try {
    const payload: PersistedSettings = {
      sfxVolume: clampVolume(settings.sfxVolume),
      musicVolume: clampVolume(settings.musicVolume),
      musicEnabled: Boolean(settings.musicEnabled)
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Ignore storage write failures.
  }
}
