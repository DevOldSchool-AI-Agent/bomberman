import Phaser from "phaser";
import { deriveBotDebugDecisions, type BotDebugDecision } from "../../bot/botLogic";
import { MAPS } from "../../content/maps";
import type { ThemeAvailability } from "../../content/assetManifest";
import { BOARD_OFFSET_X, BOARD_OFFSET_Y, HUD_X, HUD_Y, TILE_SIZE } from "../../game/constants";
import { cloneReplayFrames, cloneReplayPayload, parseReplay, serializeReplay } from "../../game/replay";
import { formatSetLengthLabel, resetSetProgress } from "../../game/setProgress";
import { createPlayerSlotsFromLobby, DEFAULT_CONFIG, renderGameToText, stepMatch } from "../../simulation";
import { createMatch } from "../../simulation/createMatch";
import type { GameConfig, InputFrame, MatchState, PlayerState, PowerUpType, SimEvent, TileType } from "../../simulation/types";
import { InputManager } from "../../input/inputManager";
import { RetroAudio } from "../../presentation/retroAudio";
import {
  RETRO_ATLAS_KEY,
  ensureRetroSpriteAtlas,
  playerFrameForState,
  powerUpFrameForType,
  tileFrameForType
} from "../../presentation/retroSprites";
import { PLAYER_COLORS, type GameSession, type ReplayPayload } from "../../game/session";
import { getSessionFromScene } from "../sessionAccess";
import { SCENE_KEYS } from "../sceneKeys";
import { createBattleTransientState } from "./battleTransientState";
import { computeSuddenDeathCountdownSkip } from "./suddenDeathDebug";

type PowerUpVisual = {
  code: string;
  label: string;
};

const POWERUP_VISUALS: Record<PowerUpType, PowerUpVisual> = {
  extraBomb: { code: "B+", label: "Bomb Up (+1)" },
  flameUp: { code: "F+", label: "Fire Up" },
  fullFire: { code: "FF", label: "Full Fire" },
  speedUp: { code: "S+", label: "Speed Up" },
  kick: { code: "K", label: "Bomb Kick" },
  glove: { code: "G", label: "Power Glove" },
  powerBomb: { code: "PB", label: "Power Bomb" },
  skull: { code: "SK", label: "Skull Curse" }
};

const POWERUP_ORDER: PowerUpType[] = [
  "extraBomb",
  "flameUp",
  "fullFire",
  "speedUp",
  "kick",
  "glove",
  "powerBomb",
  "skull"
];

const EXTERNAL_TEXTURES = {
  tiles: "theme-tiles",
  player: "theme-player",
  bomb: "theme-bomb",
  flame: "theme-flame",
  powerUp: "theme-powerups"
} as const;

const EXTERNAL_TILE_FRAMES: Record<TileType, number> = {
  empty: 0,
  hard: 1,
  soft: 2,
  suddenDeath: 3
};

const EXTERNAL_POWERUP_FRAMES: Record<PowerUpType, number> = {
  extraBomb: 0,
  flameUp: 1,
  fullFire: 2,
  speedUp: 3,
  kick: 4,
  glove: 5,
  powerBomb: 6,
  skull: 7
};

const EXTERNAL_PLAYER_FRAMES_PER_PALETTE = 8;
const INTRO_READY_MS = 850;
const INTRO_GO_MS = 520;
const SUDDEN_DEATH_SKIP_SECONDS = 10;
const SUDDEN_DEATH_TILE_FLASH_MS = 260;
const SUDDEN_DEATH_BOARD_FLASH_MS = 150;

type PickupToast = {
  text: Phaser.GameObjects.Text;
  ttlMs: number;
  vx: number;
  vy: number;
};

type PixelParticle = {
  rect: Phaser.GameObjects.Rectangle;
  ttlMs: number;
  vx: number;
  vy: number;
  gravity: number;
  fadeFrom: number;
};

type SuddenDeathTileFlash = {
  x: number;
  y: number;
  ttlMs: number;
};

export class BattleScene extends Phaser.Scene {
  private readonly showOverlay = false;

  private session!: GameSession;

  private config!: GameConfig;

  private state!: MatchState;

  private inputManager!: InputManager;

  private audio!: RetroAudio;

  private useExternalVisualTheme = false;

  private externalTileFrameCount = 0;

  private externalPlayerFrameCount = 0;

  private boardGraphics!: Phaser.GameObjects.Graphics;

  private ringGraphics!: Phaser.GameObjects.Graphics;

  private fxGraphics!: Phaser.GameObjects.Graphics;

  private hudText!: Phaser.GameObjects.Text;

  private legendText!: Phaser.GameObjects.Text;

  private phaseBannerText!: Phaser.GameObjects.Text;

  private topHudBackground!: Phaser.GameObjects.Rectangle;

  private topHudMainText!: Phaser.GameObjects.Text;

  private topHudScoreText!: Phaser.GameObjects.Text;

  private topHudSubText!: Phaser.GameObjects.Text;

  private aiDebugBackground!: Phaser.GameObjects.Rectangle;

  private aiDebugText!: Phaser.GameObjects.Text;

  private aiDebugVisible = false;

  private aiDebugDecisions: BotDebugDecision[] = [];

  private tileSprites: Phaser.GameObjects.Image[][] = [];

  private playerOutlineSprites = new Map<number, Phaser.GameObjects.Image>();

  private playerSprites = new Map<number, Phaser.GameObjects.Image>();

  private playerLastPositions = new Map<number, { x: number; y: number }>();

  private bombSprites = new Map<number, Phaser.GameObjects.Image>();

  private flameSprites = new Map<number, Phaser.GameObjects.Image>();

  private powerUpSprites = new Map<number, Phaser.GameObjects.Image>();

  private powerUpOutlineSprites = new Map<number, Phaser.GameObjects.Image>();

  private accumulatorMs = 0;

  private stepMs = 1000 / DEFAULT_CONFIG.tickRate;

  private paused = false;

  private resultDelayTicks = -1;

  private pickupToasts: PickupToast[] = [];

  private particles: PixelParticle[] = [];

  private suddenDeathTileFlashes: SuddenDeathTileFlash[] = [];

  private suddenDeathBoardFlashMs = 0;

  private introMsRemaining = 0;

  private winnerBannerMsRemaining = 0;

  private lastSuddenDeathWarningSecond = Number.POSITIVE_INFINITY;

  private replaySeed = 133742;

  private replayPlaybackFrames: InputFrame[] | null = null;

  private replayPlaybackCursor = 0;

  private recordedReplayFrames: InputFrame[] = [];

  constructor() {
    super(SCENE_KEYS.battle);
  }

  public create(): void {
    this.session = getSessionFromScene(this);
    this.applyPendingReplay();
    this.session.sfxVolume = Phaser.Math.Clamp(this.session.sfxVolume, 0, 1);
    this.session.musicVolume = Phaser.Math.Clamp(this.session.musicVolume, 0, 1);

    const selectedMap = MAPS[this.session.selectedMapIndex] ?? MAPS[0]!;
    this.config = {
      ...DEFAULT_CONFIG,
      matchDurationSeconds: this.session.selectedDurationSeconds,
      suddenDeathStartSeconds: Math.floor(this.session.selectedDurationSeconds * 0.66),
      botDifficulty: this.session.botDifficulty
    };

    const slots = createPlayerSlotsFromLobby(
      this.session.lobbySlots.map((slot) => ({
        name: slot.name,
        controller: slot.controller,
        color: slot.color
      }))
    );

    this.state = createMatch({
      config: this.config,
      map: selectedMap,
      slots,
      seed: this.replaySeed
    });
    this.session.latestMatchState = this.state;
    const transientState = createBattleTransientState();
    this.recordedReplayFrames = transientState.recordedReplayFrames;
    this.replayPlaybackCursor = transientState.replayPlaybackCursor;
    this.accumulatorMs = transientState.accumulatorMs;
    this.resultDelayTicks = transientState.resultDelayTicks;
    this.paused = transientState.paused;
    this.lastSuddenDeathWarningSecond = Number.POSITIVE_INFINITY;

    const themeAvailability = this.registry.get("themeAvailability") as ThemeAvailability | undefined;
    this.useExternalVisualTheme = Boolean(themeAvailability?.hasExternalVisualTheme);
    this.externalTileFrameCount = this.countExternalFrames(EXTERNAL_TEXTURES.tiles);
    this.externalPlayerFrameCount = this.countExternalFrames(EXTERNAL_TEXTURES.player);

    if (!this.useExternalVisualTheme) {
      ensureRetroSpriteAtlas(this);
    }

    this.boardGraphics = this.add.graphics().setDepth(0);
    this.ringGraphics = this.add.graphics().setDepth(65);
    this.fxGraphics = this.add.graphics().setDepth(45);

    this.hudText = this.add
      .text(HUD_X, HUD_Y, "", {
        fontSize: "17px",
        color: "#f2e6cd",
        fontFamily: "Verdana",
        lineSpacing: 5
      })
      .setDepth(110)
      .setVisible(this.showOverlay);

    this.legendText = this.add
      .text(846, 28, "", {
        fontSize: "14px",
        color: "#f5e2c4",
        fontFamily: "Verdana",
        lineSpacing: 5,
        wordWrap: { width: 180 }
      })
      .setDepth(110)
      .setVisible(this.showOverlay);

    this.phaseBannerText = this.add
      .text(this.scale.width / 2, 96, "", {
        fontSize: "56px",
        color: "#ffe08b",
        fontFamily: "Trebuchet MS",
        stroke: "#13314c",
        strokeThickness: 7
      })
      .setOrigin(0.5)
      .setResolution(2)
      .setDepth(150)
      .setVisible(false);

    const boardWidth = this.state.width * TILE_SIZE;
    const topHudCenterX = BOARD_OFFSET_X + boardWidth / 2;
    this.topHudBackground = this.add
      .rectangle(topHudCenterX, 16, boardWidth + 24, 28, 0xf5b24e, 0.95)
      .setStrokeStyle(3, 0x6e2f0f, 0.95)
      .setDepth(140);
    this.topHudMainText = this.add
      .text(topHudCenterX, 16, "", {
        fontSize: "24px",
        color: "#1f1208",
        fontFamily: "Trebuchet MS",
        fontStyle: "bold"
      })
      .setOrigin(0.5)
      .setResolution(2)
      .setDepth(141);
    this.topHudScoreText = this.add
      .text(BOARD_OFFSET_X + 8, 16, "", {
        fontSize: "14px",
        color: "#2a1a0f",
        fontFamily: "Trebuchet MS",
        fontStyle: "bold"
      })
      .setOrigin(0, 0.5)
      .setResolution(2)
      .setDepth(141);
    this.topHudSubText = this.add
      .text(topHudCenterX + boardWidth / 2 - 8, 16, "", {
        fontSize: "16px",
        color: "#2a1a0f",
        fontFamily: "Trebuchet MS",
        fontStyle: "bold"
      })
      .setOrigin(1, 0.5)
      .setResolution(2)
      .setDepth(141);

    this.aiDebugBackground = this.add.rectangle(10, 52, 760, 206, 0x02070f, 0.93).setOrigin(0).setDepth(200);
    this.aiDebugBackground.setStrokeStyle(2, 0x3da1da, 0.9);
    this.aiDebugText = this.add
      .text(20, 62, "", {
        fontSize: "22px",
        color: "#ffffff",
        fontFamily: "Courier New",
        stroke: "#000000",
        strokeThickness: 5,
        lineSpacing: 8,
        wordWrap: { width: 740 }
      })
      .setDepth(201)
      .setResolution(2);
    this.aiDebugBackground.setVisible(this.aiDebugVisible);
    this.aiDebugText.setVisible(this.aiDebugVisible);

    this.introMsRemaining = INTRO_READY_MS + INTRO_GO_MS;
    this.winnerBannerMsRemaining = 0;

    this.tileSprites = [];
    this.playerOutlineSprites.clear();
    this.playerSprites.clear();
    this.playerLastPositions.clear();
    this.bombSprites.clear();
    this.flameSprites.clear();
    this.powerUpSprites.clear();
    this.powerUpOutlineSprites.clear();
    this.suddenDeathTileFlashes = [];
    this.suddenDeathBoardFlashMs = 0;

    this.createTileSprites();
    this.createPlayerSprites();

    this.inputManager = new InputManager(this);
    this.aiDebugDecisions = deriveBotDebugDecisions(this.state, { intents: {} }, this.config.botDifficulty, this.config);
    this.audio = new RetroAudio(this, {
      useExternalSfx: Boolean(themeAvailability?.hasExternalSfxTheme),
      useBattleMusic: this.session.musicEnabled && Boolean(themeAvailability?.hasBattleMusic),
      sfxVolume: this.session.sfxVolume,
      musicVolume: this.session.musicVolume
    });
    this.audio.startBattleMusic();

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.audio.stopBattleMusic();
      this.clearPickupToasts();
      this.clearParticles();
    });

    this.input.keyboard?.on("keydown-P", () => {
      this.paused = !this.paused;
    });
    this.input.keyboard?.on("keydown-ESC", () => {
      resetSetProgress(this.session);
      this.scene.start(SCENE_KEYS.mapSelect);
    });
    this.input.keyboard?.on("keydown-F", () => {
      if (this.scale.isFullscreen) {
        this.scale.stopFullscreen();
      } else {
        this.scale.startFullscreen();
      }
    });
    this.input.keyboard?.on("keydown-U", () => {
      this.aiDebugVisible = !this.aiDebugVisible;
      this.aiDebugBackground.setVisible(this.aiDebugVisible);
      this.aiDebugText.setVisible(this.aiDebugVisible);
    });
    this.input.keyboard?.on("keydown-T", () => this.skipToSuddenDeathCountdown());

    this.session.runtimeBridge = {
      getTextState: () => renderGameToText(this.state),
      advanceTime: (ms) => this.advanceTime(ms),
      exportReplay: () => this.exportReplay(),
      importReplay: (payload) => this.importReplay(payload)
    };

    this.renderWorld();
  }

  public update(_time: number, delta: number): void {
    if (this.paused) {
      this.updatePhaseBanner(delta);
      return;
    }

    if (this.introMsRemaining > 0) {
      this.introMsRemaining = Math.max(0, this.introMsRemaining - delta);
    } else if (this.state.phase !== "finished") {
      this.accumulatorMs += delta;
      while (this.accumulatorMs >= this.stepMs) {
        this.runTick();
        this.accumulatorMs -= this.stepMs;
      }
    }

    this.updatePhaseBanner(delta);
    this.renderWorld();
    this.updatePickupToasts(delta);
    this.updateParticles(delta);
    this.updateSuddenDeathFlashes(delta);

    if (this.resultDelayTicks >= 0) {
      this.resultDelayTicks -= 1;
      if (this.resultDelayTicks <= 0) {
        this.scene.start(SCENE_KEYS.results, {
          winnerId: this.state.winnerId,
          reason: this.state.matchFinishedReason
        });
      }
    }
  }

  private tileTextureKey(): string {
    return this.useExternalVisualTheme ? EXTERNAL_TEXTURES.tiles : RETRO_ATLAS_KEY;
  }

  private tileFrame(type: TileType, x = 0, y = 0): number | string {
    if (!this.useExternalVisualTheme) {
      return tileFrameForType(type, x, y);
    }

    const baseFrame = EXTERNAL_TILE_FRAMES[type];
    if (this.externalTileFrameCount < 8) {
      return baseFrame;
    }

    const variantOffset = (x + y) % 2 === 0 ? 0 : 4;
    return baseFrame + variantOffset;
  }

  private playerTextureKey(): string {
    return this.useExternalVisualTheme ? EXTERNAL_TEXTURES.player : RETRO_ATLAS_KEY;
  }

  private playerPaletteIndex(player: PlayerState): number {
    if (Number.isInteger(player.slotIndex) && player.slotIndex >= 0) {
      return player.slotIndex % PLAYER_COLORS.length;
    }
    const colorMatch = PLAYER_COLORS.findIndex((color) => color === player.color);
    if (colorMatch >= 0) {
      return colorMatch;
    }
    return (player.id - 1 + PLAYER_COLORS.length) % PLAYER_COLORS.length;
  }

  private externalPlayerFrame(
    direction: PlayerState["direction"],
    moving: boolean,
    tick: number,
    paletteIndex: number
  ): number {
    if (this.externalPlayerFrameCount < EXTERNAL_PLAYER_FRAMES_PER_PALETTE) {
      return 0;
    }

    const paletteCount = Math.max(1, Math.floor(this.externalPlayerFrameCount / EXTERNAL_PLAYER_FRAMES_PER_PALETTE));
    const paletteBase = (Math.max(0, paletteIndex) % paletteCount) * EXTERNAL_PLAYER_FRAMES_PER_PALETTE;
    const phase = moving && tick % 12 < 6 ? 1 : 0;
    switch (direction) {
      case "up":
        return paletteBase + 2 + phase;
      case "left":
        return paletteBase + 4 + phase;
      case "right":
        return paletteBase + 6 + phase;
      case "down":
      case "none":
      default:
        return paletteBase + phase;
    }
  }

  private bombTextureKey(): string {
    return this.useExternalVisualTheme ? EXTERNAL_TEXTURES.bomb : RETRO_ATLAS_KEY;
  }

  private flameTextureKey(): string {
    return this.useExternalVisualTheme ? EXTERNAL_TEXTURES.flame : RETRO_ATLAS_KEY;
  }

  private powerUpTextureKey(): string {
    return this.useExternalVisualTheme ? EXTERNAL_TEXTURES.powerUp : RETRO_ATLAS_KEY;
  }

  private powerUpFrame(kind: PowerUpType): number | string {
    return this.useExternalVisualTheme ? EXTERNAL_POWERUP_FRAMES[kind] : powerUpFrameForType(kind);
  }

  private countExternalFrames(textureKey: string): number {
    if (!this.useExternalVisualTheme || !this.textures.exists(textureKey)) {
      return 0;
    }

    const texture = this.textures.get(textureKey);
    const names = texture.getFrameNames();
    const numericFrames = names.filter((name) => /^\d+$/.test(name)).length;
    return numericFrames;
  }

  private createTileSprites(): void {
    const textureKey = this.tileTextureKey();
    for (let y = 0; y < this.state.height; y += 1) {
      const row: Phaser.GameObjects.Image[] = [];
      for (let x = 0; x < this.state.width; x += 1) {
        const tile = (this.state.tiles[y]?.[x] ?? "hard") as TileType;
        const sprite = this.add
          .image(
            this.cellToPxX(x),
            this.cellToPxY(y),
            textureKey,
            this.tileFrame(tile, x, y)
          )
          .setDisplaySize(TILE_SIZE - 1, TILE_SIZE - 1)
          .setDepth(10);
        row.push(sprite);
      }
      this.tileSprites.push(row);
    }
  }

  private createPlayerSprites(): void {
    const textureKey = this.playerTextureKey();

    for (const player of this.state.players) {
      const paletteIndex = this.playerPaletteIndex(player);
      const frame = this.useExternalVisualTheme
        ? this.externalPlayerFrame(player.direction, false, this.state.tick, paletteIndex)
        : playerFrameForState(player.direction, false, this.state.tick, paletteIndex);
      const outlineSprite = this.add
        .image(this.cellToPxX(player.x) + 1, this.cellToPxY(player.y) + 1, textureKey, frame)
        .setDisplaySize(TILE_SIZE * 1.08, TILE_SIZE * 1.08)
        .setDepth(59)
        .setTint(0x122031)
        .setAlpha(0.42);
      const sprite = this.add
        .image(this.cellToPxX(player.x), this.cellToPxY(player.y), textureKey, frame)
        .setDisplaySize(TILE_SIZE * 1.02, TILE_SIZE * 1.02)
        .setDepth(60);
      this.playerOutlineSprites.set(player.id, outlineSprite);
      this.playerSprites.set(player.id, sprite);
    }
  }

  private runTick(): void {
    const liveFrame = this.inputManager.collectFrame(this.state.players);
    const frame = this.resolveFrameForTick(liveFrame);
    this.aiDebugDecisions = deriveBotDebugDecisions(this.state, frame, this.config.botDifficulty, this.config);
    this.recordedReplayFrames.push(this.cloneInputFrame(frame));
    const result = stepMatch(frame, this.state, this.config);
    this.state = result.state;
    this.session.latestMatchState = this.state;
    this.audio.playEvents(result.events);
    this.handlePresentationEvents(result.events);

    if (this.state.phase === "finished" && this.resultDelayTicks < 0) {
      this.resultDelayTicks = 70;
      this.winnerBannerMsRemaining = Math.max(900, Math.round((this.resultDelayTicks / this.config.tickRate) * 1000));
      const winner = this.state.players.find((player) => player.id === this.state.winnerId);
      this.phaseBannerText.setText(winner ? `${winner.name} WINS!` : "DRAW");
    }
  }

  private advanceTime(ms: number): void {
    if (this.introMsRemaining > 0) {
      this.introMsRemaining = 0;
    }
    const ticks = Math.max(1, Math.round(ms / this.stepMs));
    for (let i = 0; i < ticks; i += 1) {
      if (this.state.phase === "finished") {
        break;
      }
      this.runTick();
    }
    this.renderWorld();
  }

  private skipToSuddenDeathCountdown(): void {
    const skip = computeSuddenDeathCountdownSkip(
      this.state.tick,
      this.state.timerTicksRemaining,
      this.config,
      SUDDEN_DEATH_SKIP_SECONDS
    );
    if (!skip.skipped) {
      return;
    }

    this.state.tick = skip.targetTick;
    this.state.timerTicksRemaining = skip.timerTicksRemaining;
    this.introMsRemaining = 0;
    this.accumulatorMs = 0;
    this.lastSuddenDeathWarningSecond = Number.POSITIVE_INFINITY;
    this.session.latestMatchState = this.state;
    this.aiDebugDecisions = deriveBotDebugDecisions(this.state, { intents: {} }, this.config.botDifficulty, this.config);
    this.renderWorld();
  }

  private updatePhaseBanner(delta: number): void {
    if (this.introMsRemaining > 0) {
      const goPhase = this.introMsRemaining <= INTRO_GO_MS;
      this.phaseBannerText.setVisible(true);
      this.phaseBannerText.setText(goPhase ? "GO!" : "READY");
      this.phaseBannerText.setColor(goPhase ? "#9cfec6" : "#ffe08b");
      this.phaseBannerText.setScale(goPhase ? 1.05 : 1);
      this.phaseBannerText.setAlpha(0.84 + Math.sin(this.time.now * 0.01) * 0.16);
      return;
    }

    if (this.winnerBannerMsRemaining > 0) {
      this.winnerBannerMsRemaining = Math.max(0, this.winnerBannerMsRemaining - delta);
      this.phaseBannerText.setVisible(true);
      this.phaseBannerText.setScale(1 + Math.sin(this.time.now * 0.02) * 0.03);
      this.phaseBannerText.setAlpha(0.95);
      return;
    }

    this.phaseBannerText.setVisible(false);
  }

  private cloneInputFrame(frame: InputFrame): InputFrame {
    const intents: InputFrame["intents"] = {};
    for (const [playerId, intent] of Object.entries(frame.intents)) {
      const id = Number(playerId);
      intents[id] = {
        moveX: intent.moveX,
        moveY: intent.moveY,
        placeBomb: intent.placeBomb
      };
    }
    return { intents };
  }

  private resolveFrameForTick(liveFrame: InputFrame): InputFrame {
    if (!this.replayPlaybackFrames) {
      return this.cloneInputFrame(liveFrame);
    }

    const frame =
      this.replayPlaybackFrames[this.replayPlaybackCursor] ??
      ({
        intents: {}
      } as InputFrame);
    this.replayPlaybackCursor += 1;
    return this.cloneInputFrame(frame);
  }

  private applyPendingReplay(): void {
    if (!this.session.pendingReplay) {
      this.replaySeed = 133742;
      this.replayPlaybackFrames = null;
      this.replayPlaybackCursor = 0;
      return;
    }

    const replay = cloneReplayPayload(this.session.pendingReplay);
    this.session.pendingReplay = null;

    const mapCount = Math.max(1, MAPS.length);
    this.session.selectedMapIndex = ((Math.floor(replay.mapIndex) % mapCount) + mapCount) % mapCount;
    this.session.selectedDurationSeconds = Math.max(60, Math.floor(replay.durationSeconds));
    this.session.botDifficulty = replay.botDifficulty;
    for (let i = 0; i < this.session.lobbySlots.length; i += 1) {
      const slot = this.session.lobbySlots[i];
      const replaySlot = replay.lobbySlots[i];
      if (!slot || !replaySlot) {
        continue;
      }
      slot.name = replaySlot.name;
      slot.controller = replaySlot.controller;
      slot.color = replaySlot.color;
    }

    this.replaySeed = replay.seed;
    this.replayPlaybackFrames = cloneReplayFrames(replay.frames);
    this.replayPlaybackCursor = 0;
  }

  private exportReplay(): string {
    const payload: ReplayPayload = {
      version: 1,
      seed: this.replaySeed,
      mapIndex: this.session.selectedMapIndex,
      durationSeconds: this.session.selectedDurationSeconds,
      botDifficulty: this.session.botDifficulty,
      lobbySlots: this.session.lobbySlots.map((slot) => ({ ...slot })),
      frames: this.recordedReplayFrames.map((frame) => this.cloneInputFrame(frame))
    };
    return serializeReplay(payload);
  }

  private importReplay(payload: string): boolean {
    const replay = parseReplay(payload);
    if (!replay) {
      return false;
    }
    this.session.pendingReplay = replay;
    this.scene.start(SCENE_KEYS.battle);
    return true;
  }

  private cellToPxX(cellX: number): number {
    return BOARD_OFFSET_X + cellX * TILE_SIZE + TILE_SIZE / 2;
  }

  private cellToPxY(cellY: number): number {
    return BOARD_OFFSET_Y + cellY * TILE_SIZE + TILE_SIZE / 2;
  }

  private syncTiles(): void {
    for (let y = 0; y < this.state.height; y += 1) {
      for (let x = 0; x < this.state.width; x += 1) {
        const sprite = this.tileSprites[y]?.[x];
        if (!sprite) {
          continue;
        }
        const tile = (this.state.tiles[y]?.[x] ?? "hard") as TileType;
        sprite.setFrame(this.tileFrame(tile, x, y));
      }
    }
  }

  private syncPowerUps(): void {
    const active = new Set<number>();
    const textureKey = this.powerUpTextureKey();

    for (const powerUp of this.state.powerUps) {
      active.add(powerUp.id);
      let sprite = this.powerUpSprites.get(powerUp.id);
      let outlineSprite = this.powerUpOutlineSprites.get(powerUp.id);
      if (!sprite) {
        outlineSprite = this.add
          .image(this.cellToPxX(powerUp.x) + 1, this.cellToPxY(powerUp.y) + 1, textureKey, this.powerUpFrame(powerUp.kind))
          .setDepth(39)
          .setDisplaySize(TILE_SIZE * 0.8, TILE_SIZE * 0.8)
          .setTint(0x102033)
          .setAlpha(0.38);
        sprite = this.add
          .image(this.cellToPxX(powerUp.x), this.cellToPxY(powerUp.y), textureKey, this.powerUpFrame(powerUp.kind))
          .setDepth(40)
          .setDisplaySize(TILE_SIZE * 0.72, TILE_SIZE * 0.72);
        if (outlineSprite) {
          this.powerUpOutlineSprites.set(powerUp.id, outlineSprite);
        }
        this.powerUpSprites.set(powerUp.id, sprite);
      }

      const bob = Math.sin((this.state.tick + powerUp.id * 11) * 0.14) * 2.8;
      const pulse = 1 + Math.sin((this.state.tick + powerUp.id * 7) * 0.15) * 0.05;
      sprite.setFrame(this.powerUpFrame(powerUp.kind));
      sprite.setPosition(this.cellToPxX(powerUp.x), this.cellToPxY(powerUp.y) + bob);
      const displaySize = TILE_SIZE * 0.8 * pulse;
      sprite.setDisplaySize(displaySize, displaySize);
      sprite.setAlpha(0.98);
      outlineSprite?.setFrame(this.powerUpFrame(powerUp.kind));
      outlineSprite?.setPosition(this.cellToPxX(powerUp.x) + 1, this.cellToPxY(powerUp.y) + 1 + bob);
      outlineSprite?.setDisplaySize(displaySize + 3, displaySize + 3);
      outlineSprite?.setAlpha(0.36 + pulse * 0.04);
      if (powerUp.kind === "skull") {
        sprite.setTint(0xe6edf7);
      } else {
        sprite.clearTint();
      }
    }

    for (const [id, sprite] of this.powerUpSprites) {
      if (!active.has(id)) {
        sprite.destroy();
        this.powerUpSprites.delete(id);
        const outlineSprite = this.powerUpOutlineSprites.get(id);
        outlineSprite?.destroy();
        this.powerUpOutlineSprites.delete(id);
      }
    }
  }

  private syncBombs(): void {
    const active = new Set<number>();
    const textureKey = this.bombTextureKey();
    const bombFrame: number | string = this.useExternalVisualTheme ? (this.state.tick % 12 < 6 ? 0 : 1) : this.state.tick % 12 < 6 ? "bomb-0" : "bomb-1";

    for (const bomb of this.state.bombs) {
      active.add(bomb.id);
      let sprite = this.bombSprites.get(bomb.id);
      if (!sprite) {
        sprite = this.add
          .image(this.cellToPxX(bomb.x), this.cellToPxY(bomb.y), textureKey, bombFrame)
          .setDepth(50)
          .setDisplaySize(TILE_SIZE * 0.62, TILE_SIZE * 0.62);
        this.bombSprites.set(bomb.id, sprite);
      }

      sprite.setFrame(bombFrame);
      sprite.setPosition(this.cellToPxX(bomb.x), this.cellToPxY(bomb.y));
      const bombSize = TILE_SIZE * 0.7 * (bomb.isPowerBomb ? 1.16 : 1);
      sprite.setDisplaySize(bombSize, bombSize);
      if (bomb.isPowerBomb) {
        sprite.setTint(0xff9f67);
      } else {
        sprite.clearTint();
      }
    }

    for (const [id, sprite] of this.bombSprites) {
      if (!active.has(id)) {
        sprite.destroy();
        this.bombSprites.delete(id);
      }
    }
  }

  private syncFlames(): void {
    const active = new Set<number>();
    const textureKey = this.flameTextureKey();
    const flameFrame: number | string = this.useExternalVisualTheme ? (this.state.tick % 8 < 4 ? 0 : 1) : this.state.tick % 8 < 4 ? "flame-0" : "flame-1";

    for (const flame of this.state.flames) {
      active.add(flame.id);
      let sprite = this.flameSprites.get(flame.id);
      if (!sprite) {
        sprite = this.add
          .image(this.cellToPxX(flame.x), this.cellToPxY(flame.y), textureKey, flameFrame)
          .setDepth(55)
          .setDisplaySize(TILE_SIZE * 0.86, TILE_SIZE * 0.86);
        this.flameSprites.set(flame.id, sprite);
      }

      sprite.setFrame(flameFrame);
      sprite.setPosition(this.cellToPxX(flame.x), this.cellToPxY(flame.y));
      sprite.setAlpha(0.9 + Math.sin((this.state.tick + flame.id) * 0.22) * 0.08);
    }

    for (const [id, sprite] of this.flameSprites) {
      if (!active.has(id)) {
        sprite.destroy();
        this.flameSprites.delete(id);
      }
    }
  }

  private syncPlayers(): void {
    this.ringGraphics.clear();
    const alivePlayerIds = new Set<number>();

    for (const flame of this.state.flames) {
      const px = this.cellToPxX(flame.x);
      const py = this.cellToPxY(flame.y);
      this.ringGraphics.fillStyle(0xffbc63, 0.1);
      this.ringGraphics.fillCircle(px, py, TILE_SIZE * 0.52);
      this.ringGraphics.fillStyle(0xff784d, 0.06);
      this.ringGraphics.fillCircle(px, py, TILE_SIZE * 0.68);
    }

    for (const player of this.state.players) {
      alivePlayerIds.add(player.id);
      const outlineSprite = this.playerOutlineSprites.get(player.id);
      const sprite = this.playerSprites.get(player.id);
      if (!sprite) {
        continue;
      }

      const paletteIndex = this.playerPaletteIndex(player);
      outlineSprite?.setVisible(player.alive);
      sprite.setVisible(player.alive);
      outlineSprite?.setPosition(this.cellToPxX(player.x) + 1, this.cellToPxY(player.y) + 1);
      sprite.setPosition(this.cellToPxX(player.x), this.cellToPxY(player.y));
      const previousPosition = this.playerLastPositions.get(player.id);
      const moving =
        player.alive &&
        previousPosition !== undefined &&
        (Math.abs(player.x - previousPosition.x) > 0.0001 || Math.abs(player.y - previousPosition.y) > 0.0001);
      this.playerLastPositions.set(player.id, { x: player.x, y: player.y });
      if (this.useExternalVisualTheme) {
        const frame = this.externalPlayerFrame(player.direction, moving, this.state.tick, paletteIndex);
        outlineSprite?.setFrame(frame);
        sprite.setFrame(frame);
      } else {
        const frame = playerFrameForState(player.direction, moving, this.state.tick, paletteIndex);
        outlineSprite?.setFrame(frame);
        sprite.setFrame(frame);
      }

    }

    for (const playerId of this.playerLastPositions.keys()) {
      if (!alivePlayerIds.has(playerId)) {
        this.playerLastPositions.delete(playerId);
      }
    }
  }

  private getAbilityTag(player: PlayerState): string {
    const tags: string[] = [];
    if (player.canKick) tags.push("K");
    if (player.canGlove) tags.push("G");
    if (player.canPowerBomb) tags.push("PB");
    if (player.skullCurse !== "none") tags.push(`SK-${player.skullCurse[0]?.toUpperCase() ?? "?"}`);
    return tags.length > 0 ? tags.join("/") : "-";
  }

  private renderLegend(): void {
    const counts = new Map<PowerUpType, number>();
    for (const kind of POWERUP_ORDER) {
      counts.set(kind, 0);
    }

    for (const powerUp of this.state.powerUps) {
      counts.set(powerUp.kind, (counts.get(powerUp.kind) ?? 0) + 1);
    }

    const lines = ["POWERUPS", ""];
    for (const kind of POWERUP_ORDER) {
      const visual = POWERUP_VISUALS[kind];
      lines.push(`${visual.code}  ${visual.label} (${counts.get(kind) ?? 0})`);
    }
    lines.push("");
    lines.push(`Theme: ${this.useExternalVisualTheme ? "External" : "Fallback"}`);
    lines.push("Abilities:");
    lines.push("K Kick | G Glove");
    lines.push("PB Power Bomb");

    this.legendText.setText(lines.join("\n"));
  }

  private renderHud(): void {
    const alive = this.state.players.filter((player) => player.alive).length;
    const timerSec = Math.ceil(this.state.timerTicksRemaining / this.config.tickRate);
    const mode = this.paused ? "PAUSED" : this.state.phase === "active" ? "BATTLE" : "RESULT";

    const playerStatusLines = this.state.players.map((player) => {
      const life = player.alive ? "" : " KO";
      return `P${player.id}${life} B:${player.activeBombs}/${player.maxBombs} R:${player.bombRange} S:${player.speedLevel} A:${this.getAbilityTag(player)}`;
    });

    this.hudText.setText(
      [
        `Mode: ${mode}`,
        `Time: ${timerSec}s`,
        `Alive: ${alive}`,
        `Map: ${MAPS[this.session.selectedMapIndex]?.name ?? "Unknown"}`,
        ...playerStatusLines,
        "Controls: P pause | F fullscreen | ESC map select"
      ].join("\n")
    );
  }

  private formatClock(totalSeconds: number): string {
    const safeSeconds = Math.max(0, Math.floor(totalSeconds));
    const minutes = Math.floor(safeSeconds / 60);
    const seconds = safeSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  }

  private renderTopHud(): void {
    const timeRemainingSec = Math.ceil(this.state.timerTicksRemaining / this.config.tickRate);
    if (this.session.selectedSetLength > 1) {
      const scoreSegments = this.state.players.map((player) => `P${player.id}:${this.session.setWinsByPlayerId[player.id] ?? 0}`);
      const roundLabel = this.session.roundsPlayedInSet + 1;
      this.topHudScoreText.setText(`${formatSetLengthLabel(this.session.selectedSetLength)} R${roundLabel}  ${scoreSegments.join("  ")}`);
      this.topHudScoreText.setVisible(true);
    } else {
      this.topHudScoreText.setText("");
      this.topHudScoreText.setVisible(false);
    }
    this.topHudMainText.setText(`TIME ${this.formatClock(timeRemainingSec)}`);
    this.topHudMainText.setColor("#1f1208");
    this.topHudSubText.setAlpha(1);

    const suddenDeathStartTick = this.config.suddenDeathStartSeconds * this.config.tickRate;
    if (this.state.tick >= suddenDeathStartTick) {
      this.topHudSubText.setText("SUDDEN DEATH ACTIVE");
      this.topHudBackground.setFillStyle(0xd96a42, 0.95);
      this.topHudBackground.setStrokeStyle(3, 0x5a1d0f, 0.95);
      this.topHudSubText.setColor("#fff0d8");
      this.lastSuddenDeathWarningSecond = Number.POSITIVE_INFINITY;
      return;
    }

    const ticksUntilSudden = Math.max(0, suddenDeathStartTick - this.state.tick);
    const secondsUntilSudden = Math.ceil(ticksUntilSudden / this.config.tickRate);
    if (secondsUntilSudden <= 10 && this.state.phase === "active" && this.introMsRemaining <= 0) {
      if (secondsUntilSudden !== this.lastSuddenDeathWarningSecond) {
        this.audio.playSuddenDeathWarningCue();
        this.lastSuddenDeathWarningSecond = secondsUntilSudden;
      }
      const flashOn = Math.floor(this.time.now / 170) % 2 === 0;
      this.topHudSubText.setText(`SD IN ${this.formatClock(secondsUntilSudden)}`);
      this.topHudSubText.setColor(flashOn ? "#fff4e1" : "#3b0f09");
      this.topHudSubText.setAlpha(flashOn ? 1 : 0.45);
      this.topHudMainText.setColor(flashOn ? "#3f1208" : "#fff0dd");
      this.topHudBackground.setFillStyle(flashOn ? 0xdf5f3a : 0xf3be58, 0.98);
      this.topHudBackground.setStrokeStyle(3, flashOn ? 0x58190f : 0x6e2f0f, 0.98);
      return;
    }

    this.topHudSubText.setText(`SD ${this.formatClock(secondsUntilSudden)}`);
    this.topHudSubText.setColor("#2a1a0f");
    this.topHudBackground.setFillStyle(0xf5b24e, 0.95);
    this.topHudBackground.setStrokeStyle(3, 0x6e2f0f, 0.95);
    this.lastSuddenDeathWarningSecond = Number.POSITIVE_INFINITY;
  }

  private renderBackground(): void {
    const pulse = Math.sin(this.state.tick * 0.02) * 0.06;

    this.boardGraphics.clear();
    this.boardGraphics.fillStyle(0x0b2440, 1);
    this.boardGraphics.fillRect(0, 0, this.scale.width, this.scale.height);
    this.boardGraphics.fillStyle(0x2d72b7, 0.32 + pulse);
    this.boardGraphics.fillCircle(130, 110, 190);
    this.boardGraphics.fillCircle(900, 560, 210);
    this.boardGraphics.fillStyle(0x20b985, 0.18 + pulse * 0.5);
    this.boardGraphics.fillCircle(420, 540, 230);

    const boardWidth = this.state.width * TILE_SIZE;
    const boardHeight = this.state.height * TILE_SIZE;
    this.boardGraphics.fillStyle(0x133c5a, 0.72);
    this.boardGraphics.fillRoundedRect(BOARD_OFFSET_X - 16, BOARD_OFFSET_Y - 16, boardWidth + 32, boardHeight + 32, 20);

    this.boardGraphics.lineStyle(4, 0x7ad7ff, 0.74 + pulse);
    this.boardGraphics.strokeRect(
      BOARD_OFFSET_X - 6,
      BOARD_OFFSET_Y - 6,
      boardWidth + 10,
      boardHeight + 10
    );
    this.boardGraphics.lineStyle(2, 0x2a8ec0, 0.56 + pulse * 0.8);
    this.boardGraphics.strokeRect(
      BOARD_OFFSET_X - 12,
      BOARD_OFFSET_Y - 12,
      boardWidth + 22,
      boardHeight + 22
    );
  }

  private clearPickupToasts(): void {
    for (const toast of this.pickupToasts) {
      toast.text.destroy();
    }
    this.pickupToasts = [];
  }

  private clearParticles(): void {
    for (const particle of this.particles) {
      particle.rect.destroy();
    }
    this.particles = [];
  }

  private pickupColorValue(kind: PowerUpType): number {
    switch (kind) {
      case "extraBomb":
        return 0xfff2d7;
      case "flameUp":
        return 0xffd09a;
      case "fullFire":
        return 0xffb58f;
      case "speedUp":
        return 0x86efff;
      case "kick":
        return 0xff89c7;
      case "glove":
        return 0x9ed9ff;
      case "powerBomb":
        return 0xffb889;
      case "skull":
        return 0xcfd5e4;
      default:
        return 0xf5e8cc;
    }
  }

  private spawnPixelBurst(worldX: number, worldY: number, color: number, count: number, force = 95): void {
    for (let i = 0; i < count; i += 1) {
      const angle = this.mathDegToRad((360 / count) * i + Phaser.Math.Between(-16, 16));
      const speed = force * Phaser.Math.FloatBetween(0.4, 1);
      const size = Phaser.Math.Between(2, 4);

      const rect = this.add.rectangle(worldX, worldY, size, size, color, 1).setDepth(120);
      this.particles.push({
        rect,
        ttlMs: Phaser.Math.Between(240, 520),
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - Phaser.Math.FloatBetween(8, 22),
        gravity: Phaser.Math.FloatBetween(110, 180),
        fadeFrom: Phaser.Math.FloatBetween(0.75, 1)
      });
    }
  }

  private mathDegToRad(degrees: number): number {
    return (degrees * Math.PI) / 180;
  }

  private pickupLabel(kind: PowerUpType): string {
    switch (kind) {
      case "extraBomb":
        return "BOMB +1";
      case "flameUp":
        return "FIRE +1";
      case "fullFire":
        return "FULL FIRE";
      case "speedUp":
        return "SPEED +1";
      case "kick":
        return "BOMB KICK";
      case "glove":
        return "POWER GLOVE";
      case "powerBomb":
        return "POWER BOMB";
      case "skull":
        return "SKULL CURSE";
      default:
        return "POWER UP";
    }
  }

  private pickupColor(kind: PowerUpType): string {
    switch (kind) {
      case "extraBomb":
        return "#fff2d7";
      case "flameUp":
        return "#ffd09a";
      case "fullFire":
        return "#ffb58f";
      case "speedUp":
        return "#86efff";
      case "kick":
        return "#ff89c7";
      case "glove":
        return "#9ed9ff";
      case "powerBomb":
        return "#ffb889";
      case "skull":
        return "#cfd5e4";
      default:
        return "#f5e8cc";
    }
  }

  private createPickupToast(player: PlayerState, kind: PowerUpType): void {
    const text = this.add
      .text(this.cellToPxX(player.x), this.cellToPxY(player.y) - TILE_SIZE * 0.6, this.pickupLabel(kind), {
        fontSize: "14px",
        fontFamily: "Verdana",
        color: this.pickupColor(kind),
        stroke: "#23150f",
        strokeThickness: 4
      })
      .setOrigin(0.5)
      .setDepth(130);

    this.pickupToasts.push({
      text,
      ttlMs: 900,
      vx: 0,
      vy: -30
    });
  }

  private handlePresentationEvents(events: SimEvent[]): void {
    for (const event of events) {
      if (event.type === "pickup") {
        const playerId = typeof event.payload.playerId === "number" ? event.payload.playerId : null;
        const kind = typeof event.payload.kind === "string" ? (event.payload.kind as PowerUpType) : null;
        if (playerId === null || kind === null) {
          continue;
        }
        const player = this.state.players.find((candidate) => candidate.id === playerId);
        if (!player) {
          continue;
        }
        this.createPickupToast(player, kind);
        this.spawnPixelBurst(this.cellToPxX(player.x), this.cellToPxY(player.y), this.pickupColorValue(kind), 11, 115);
        continue;
      }

      if (event.type === "bomb_exploded") {
        const x = typeof event.payload.x === "number" ? event.payload.x : null;
        const y = typeof event.payload.y === "number" ? event.payload.y : null;
        if (x !== null && y !== null) {
          this.spawnPixelBurst(this.cellToPxX(x), this.cellToPxY(y), 0xffba63, 14, 155);
        }
        continue;
      }

      if (event.type === "player_eliminated") {
        const playerId = typeof event.payload.playerId === "number" ? event.payload.playerId : null;
        const player = playerId === null ? undefined : this.state.players.find((candidate) => candidate.id === playerId);
        if (player) {
          this.spawnPixelBurst(this.cellToPxX(player.x), this.cellToPxY(player.y), 0xf7f0d0, 18, 140);
        }
        continue;
      }

      if (event.type === "soft_block_destroyed") {
        const x = typeof event.payload.x === "number" ? event.payload.x : null;
        const y = typeof event.payload.y === "number" ? event.payload.y : null;
        if (x !== null && y !== null) {
          this.spawnPixelBurst(this.cellToPxX(x), this.cellToPxY(y), 0xc79156, 7, 95);
        }
        continue;
      }

      if (event.type === "sudden_death_tile") {
        const x = typeof event.payload.x === "number" ? event.payload.x : null;
        const y = typeof event.payload.y === "number" ? event.payload.y : null;
        if (x !== null && y !== null) {
          this.suddenDeathTileFlashes.push({ x, y, ttlMs: SUDDEN_DEATH_TILE_FLASH_MS });
          this.suddenDeathBoardFlashMs = Math.max(this.suddenDeathBoardFlashMs, SUDDEN_DEATH_BOARD_FLASH_MS);
          this.spawnPixelBurst(this.cellToPxX(x), this.cellToPxY(y), 0xffc57a, 8, 120);
          this.cameras.main.shake(95, 0.0018);
        }
      }
    }
  }

  private updatePickupToasts(delta: number): void {
    const remaining: PickupToast[] = [];
    for (const toast of this.pickupToasts) {
      toast.ttlMs -= delta;
      if (toast.ttlMs <= 0) {
        toast.text.destroy();
        continue;
      }
      const dt = delta / 1000;
      toast.text.x += toast.vx * dt;
      toast.text.y += toast.vy * dt;
      toast.text.setAlpha(Math.max(0.15, toast.ttlMs / 900));
      remaining.push(toast);
    }
    this.pickupToasts = remaining;
  }

  private updateParticles(delta: number): void {
    const remaining: PixelParticle[] = [];
    for (const particle of this.particles) {
      particle.ttlMs -= delta;
      if (particle.ttlMs <= 0) {
        particle.rect.destroy();
        continue;
      }

      const dt = delta / 1000;
      particle.vy += particle.gravity * dt;
      particle.rect.x += particle.vx * dt;
      particle.rect.y += particle.vy * dt;

      const alpha = Math.max(0, (particle.ttlMs / 520) * particle.fadeFrom);
      particle.rect.setAlpha(alpha);
      remaining.push(particle);
    }
    this.particles = remaining;
  }

  private updateSuddenDeathFlashes(delta: number): void {
    this.suddenDeathBoardFlashMs = Math.max(0, this.suddenDeathBoardFlashMs - delta);
    if (this.suddenDeathTileFlashes.length === 0) {
      return;
    }

    const remaining: SuddenDeathTileFlash[] = [];
    for (const flash of this.suddenDeathTileFlashes) {
      const ttlMs = flash.ttlMs - delta;
      if (ttlMs <= 0) {
        continue;
      }
      remaining.push({ ...flash, ttlMs });
    }
    this.suddenDeathTileFlashes = remaining;
  }

  private renderDynamicEffects(): void {
    this.fxGraphics.clear();

    for (const powerUp of this.state.powerUps) {
      const pulse = 0.55 + Math.sin((this.state.tick + powerUp.id * 9) * 0.2) * 0.25;
      this.fxGraphics.fillStyle(this.powerUpGlowColor(powerUp.kind), 0.18 + pulse * 0.12);
      this.fxGraphics.fillCircle(this.cellToPxX(powerUp.x), this.cellToPxY(powerUp.y), TILE_SIZE * (0.22 + pulse * 0.08));
    }

    this.fxGraphics.fillStyle(0x06080c, 0.28);
    for (const powerUp of this.state.powerUps) {
      this.fxGraphics.fillEllipse(this.cellToPxX(powerUp.x), this.cellToPxY(powerUp.y) + TILE_SIZE * 0.3, TILE_SIZE * 0.38, TILE_SIZE * 0.14);
    }

    this.fxGraphics.fillStyle(0x050507, 0.34);
    for (const bomb of this.state.bombs) {
      this.fxGraphics.fillEllipse(
        this.cellToPxX(bomb.x),
        this.cellToPxY(bomb.y) + TILE_SIZE * 0.28,
        TILE_SIZE * 0.42,
        TILE_SIZE * 0.16
      );
    }

    this.fxGraphics.fillStyle(0x06090f, 0.37);
    for (const player of this.state.players) {
      if (!player.alive) {
        continue;
      }
      this.fxGraphics.fillEllipse(this.cellToPxX(player.x), this.cellToPxY(player.y) + TILE_SIZE * 0.3, TILE_SIZE * 0.54, TILE_SIZE * 0.2);
    }

    this.fxGraphics.lineStyle(1, 0x20314a, 0.16);
    for (let y = BOARD_OFFSET_Y; y < BOARD_OFFSET_Y + this.state.height * TILE_SIZE; y += 3) {
      this.fxGraphics.lineBetween(BOARD_OFFSET_X, y, BOARD_OFFSET_X + this.state.width * TILE_SIZE, y);
    }

    if (this.suddenDeathBoardFlashMs > 0) {
      const boardFlashAlpha = (this.suddenDeathBoardFlashMs / SUDDEN_DEATH_BOARD_FLASH_MS) * 0.24;
      this.fxGraphics.fillStyle(0xffc980, Math.max(0, Math.min(0.24, boardFlashAlpha)));
      this.fxGraphics.fillRect(
        BOARD_OFFSET_X,
        BOARD_OFFSET_Y,
        this.state.width * TILE_SIZE,
        this.state.height * TILE_SIZE
      );
    }

    for (const flash of this.suddenDeathTileFlashes) {
      const ratio = Math.max(0, Math.min(1, flash.ttlMs / SUDDEN_DEATH_TILE_FLASH_MS));
      const alpha = 0.14 + ratio * 0.46;
      const x = BOARD_OFFSET_X + flash.x * TILE_SIZE;
      const y = BOARD_OFFSET_Y + flash.y * TILE_SIZE;
      this.fxGraphics.fillStyle(0xffde95, alpha);
      this.fxGraphics.fillRect(x, y, TILE_SIZE, TILE_SIZE);
      this.fxGraphics.lineStyle(2, 0xfff2d0, Math.min(0.9, alpha + 0.2));
      this.fxGraphics.strokeRect(x + 1, y + 1, TILE_SIZE - 2, TILE_SIZE - 2);
    }
  }

  private renderWorld(): void {
    this.renderBackground();
    this.syncTiles();
    this.renderDynamicEffects();
    this.syncPowerUps();
    this.syncBombs();
    this.syncFlames();
    this.syncPlayers();
    this.renderTopHud();
    if (this.showOverlay) {
      this.renderHud();
      this.renderLegend();
    }
    this.renderAiDebug();
  }

  private renderAiDebug(): void {
    if (!this.aiDebugVisible) {
      return;
    }

    if (this.aiDebugDecisions.length === 0) {
      this.aiDebugText.setText("AI DEBUG  (U hide/show)\nNo CPU players in this match.");
      return;
    }

    const lines = ["AI DEBUG  (U hide/show)"];
    for (const decision of this.aiDebugDecisions) {
      const move =
        decision.moveDirection === "none"
          ? "HOLD"
          : decision.moveDirection === "up"
            ? "UP"
            : decision.moveDirection === "down"
              ? "DOWN"
              : decision.moveDirection === "left"
                ? "LEFT"
                : "RIGHT";
      const hazard = decision.hazardTick === null ? "safe" : decision.hazardTick.toString();
      const threat =
        decision.nearestThreatId === null || decision.nearestThreatDistance === null
          ? "none"
          : `P${decision.nearestThreatId}@${decision.nearestThreatDistance}`;
      const bomb = decision.placeBomb ? "YES" : "NO";
      const escape = decision.escaping ? "YES" : "NO";
      lines.push(
        `P${decision.playerId} ${decision.name} (${decision.x},${decision.y}) move:${move} bomb:${bomb} esc:${escape} hz:${hazard} threat:${threat} mode:${decision.summary}`
      );
    }

    this.aiDebugText.setText(lines.join("\n"));
  }

  private powerUpGlowColor(kind: PowerUpType): number {
    switch (kind) {
      case "extraBomb":
        return 0xfff2d7;
      case "flameUp":
        return 0xffa55f;
      case "fullFire":
        return 0xff8a54;
      case "speedUp":
        return 0x7be8ff;
      case "kick":
        return 0xff85bd;
      case "glove":
        return 0x9cd9ff;
      case "powerBomb":
        return 0xffb06f;
      case "skull":
        return 0xd2dae8;
      default:
        return 0xf5e8cc;
    }
  }
}
