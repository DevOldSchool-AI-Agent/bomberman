import { MAPS } from "../content/maps";
import { loadPersistedSettings } from "./persistentSettings";
import { DEFAULT_CONFIG } from "../simulation";
import type { BotDifficulty, GameConfig, InputFrame, MapDefinition, MatchState, PlayerSlot } from "../simulation";

export interface LobbySlotConfig {
  readonly id: number;
  name: string;
  controller: "human" | "bot";
  color: number;
}

export interface MatchSetup {
  readonly map: MapDefinition;
  readonly config: GameConfig;
  readonly slots: PlayerSlot[];
}

export interface RuntimeBridge {
  getTextState: () => string;
  advanceTime: (ms: number) => void;
  exportReplay: () => string;
  importReplay: (payload: string) => boolean;
}

export interface ReplayPayload {
  version: 1;
  seed: number;
  mapIndex: number;
  durationSeconds: number;
  botDifficulty: BotDifficulty;
  lobbySlots: LobbySlotConfig[];
  frames: InputFrame[];
}

export interface GameSession {
  lobbySlots: LobbySlotConfig[];
  selectedMapIndex: number;
  selectedDurationSeconds: number;
  selectedSetLength: number;
  botDifficulty: BotDifficulty;
  sfxVolume: number;
  musicVolume: number;
  musicEnabled: boolean;
  setWinsByPlayerId: Record<number, number>;
  roundsPlayedInSet: number;
  activeRoundSerial: number;
  lastScoredRoundSerial: number;
  setWinnerId: number | null;
  latestMatchState: MatchState | null;
  runtimeBridge: RuntimeBridge | null;
  pendingReplay: ReplayPayload | null;
}

export const PLAYER_COLORS = [0x54c8ff, 0xff6666, 0x6de287, 0xf5e36c];

export function createInitialSession(): GameSession {
  const persisted = loadPersistedSettings();
  const startingSfxVolume = typeof persisted.sfxVolume === "number" ? persisted.sfxVolume : 1;
  const startingMusicVolume = typeof persisted.musicVolume === "number" ? persisted.musicVolume : startingSfxVolume;
  const [c1, c2, c3, c4] = PLAYER_COLORS;
  return {
    lobbySlots: [
      { id: 1, name: "P1", controller: "human", color: c1 ?? 0x54c8ff },
      { id: 2, name: "P2", controller: "human", color: c2 ?? 0xff6666 },
      { id: 3, name: "P3", controller: "bot", color: c3 ?? 0x6de287 },
      { id: 4, name: "P4", controller: "bot", color: c4 ?? 0xf5e36c }
    ],
    selectedMapIndex: 0,
    selectedDurationSeconds: DEFAULT_CONFIG.matchDurationSeconds,
    selectedSetLength: 1,
    botDifficulty: "normal",
    sfxVolume: startingSfxVolume,
    musicVolume: startingMusicVolume,
    musicEnabled: persisted.musicEnabled ?? false,
    setWinsByPlayerId: { 1: 0, 2: 0, 3: 0, 4: 0 },
    roundsPlayedInSet: 0,
    activeRoundSerial: 0,
    lastScoredRoundSerial: 0,
    setWinnerId: null,
    latestMatchState: null,
    runtimeBridge: null,
    pendingReplay: null
  };
}

export function selectedMap(session: GameSession): MapDefinition {
  return MAPS[session.selectedMapIndex] ?? MAPS[0]!;
}
