import Phaser from "phaser";
import { effectiveMusicVolume, effectiveSfxVolume } from "../game/audioVolume";
import type { SimEvent } from "../simulation/types";

type WaveType = "sine" | "square" | "sawtooth" | "triangle";

interface AudioOptions {
  readonly useExternalSfx: boolean;
  readonly useBattleMusic: boolean;
  readonly sfxVolume: number;
  readonly musicVolume: number;
}

export interface RetroAudioDebugSnapshot {
  readonly useExternalSfx: boolean;
  readonly useBattleMusic: boolean;
  readonly effectiveSfxVolume: number;
  readonly effectiveMusicVolume: number;
  readonly contextState: string;
  readonly battleMusicPlaying: boolean;
  readonly battleMusicLoaded: boolean;
  readonly usingManagerDestination: boolean;
  readonly htmlProbeResult: string;
  readonly eventsProcessed: number;
  readonly lastEventType: SimEvent["type"] | "none";
}

const BASE_AUDIO_BOOST = 3;

export class RetroAudio {
  private readonly scene: Phaser.Scene;

  private readonly context: AudioContext | null;

  private readonly outputNode: AudioNode | null;

  private readonly useExternalSfx: boolean;

  private readonly useBattleMusic: boolean;

  private readonly sfxVolume: number;

  private readonly musicVolume: number;

  private battleMusic: Phaser.Sound.BaseSound | null = null;

  private eventsProcessed = 0;

  private lastEventType: SimEvent["type"] | "none" = "none";

  private htmlProbeResult = "not-run";

  private htmlProbeAudio: HTMLAudioElement | null = null;

  constructor(scene: Phaser.Scene, options: AudioOptions) {
    this.scene = scene;
    this.useExternalSfx = options.useExternalSfx;
    this.useBattleMusic = options.useBattleMusic;
    this.sfxVolume = effectiveSfxVolume(this.clampVolume(options.sfxVolume));
    this.musicVolume = effectiveMusicVolume(this.clampVolume(options.musicVolume));
    this.context = this.resolveContext();
    this.outputNode = this.resolveOutputNode();
    this.armUnlock();
  }

  public startBattleMusic(): void {
    if (!this.useBattleMusic || !this.scene.cache.audio.exists("bgm_battle")) {
      return;
    }
    if (this.battleMusic?.isPlaying) {
      return;
    }

    this.battleMusic = this.scene.sound.add("bgm_battle", {
      loop: true,
      volume: this.clampLinearVolume(this.musicVolume * 0.28 * BASE_AUDIO_BOOST)
    });
    this.battleMusic.play();
  }

  public stopBattleMusic(): void {
    if (!this.battleMusic) {
      return;
    }
    this.battleMusic.stop();
    this.battleMusic.destroy();
    this.battleMusic = null;
  }

  public playEvents(events: SimEvent[]): void {
    this.ensureContextRunning();
    if (this.sfxVolume <= 0) {
      return;
    }

    for (const event of events) {
      this.eventsProcessed += 1;
      this.lastEventType = event.type;
      if (this.playExternalSample(event)) {
        continue;
      }

      switch (event.type) {
        case "bomb_placed":
          this.tone(155, 62, "sine", 0.03);
          this.toneSweep(210, 145, 84, "triangle", 0.024, 0.01);
          break;
        case "bomb_exploded":
          this.noiseBurst(126, 0.072, 165);
          this.tone(event.payload.isPowerBomb === true ? 96 : 84, 72, "triangle", 0.038);
          this.toneSweep(event.payload.isPowerBomb === true ? 132 : 118, 58, 108, "sawtooth", 0.058, 0.01);
          break;
        case "soft_block_destroyed":
          this.toneSweep(320, 240, 34, "triangle", 0.016);
          break;
        case "pickup":
          if (event.payload.kind === "skull") {
            this.toneSweep(250, 150, 110, "sawtooth", 0.03);
            break;
          }
          this.tone(230, 70, "sine", 0.038);
          this.toneSweep(300, 220, 100, "triangle", 0.03, 0.014);
          break;
        case "player_eliminated":
          this.noiseBurst(100, 0.045, 170);
          this.toneSweep(270, 150, 95, "triangle", 0.026);
          break;
        case "sudden_death_tile":
          this.tone(320, 58, "square", 0.03);
          this.tone(250, 84, "triangle", 0.024, 0.045);
          this.noiseBurst(52, 0.018, 220, 0.015);
          break;
        case "match_finished":
          this.tone(530, 58, "square", 0.03);
          this.tone(670, 62, "square", 0.027, 0.055);
          this.tone(820, 90, "triangle", 0.022, 0.11);
          break;
        default:
          break;
      }
    }
  }

  public playSuddenDeathWarningCue(): void {
    this.ensureContextRunning();
    if (this.sfxVolume <= 0) {
      return;
    }
    this.tone(430, 52, "square", 0.022);
    this.tone(560, 48, "triangle", 0.018, 0.045);
  }

  public runDebugSelfTest(): { samplePlayed: boolean; tonePlayed: boolean; contextState: string } {
    this.ensureContextRunning();
    const samplePlayed = this.playSample("sfx_place", 0.95);
    this.playHtmlAudioProbe();

    let tonePlayed = false;
    if (this.context && this.context.state === "running") {
      this.tone(330, 650, "sawtooth", 0.24);
      this.tone(660, 700, "square", 0.18, 0.08);
      this.noiseBurst(380, 0.12, 900, 0.03);
      tonePlayed = true;
    }

    return {
      samplePlayed,
      tonePlayed,
      contextState: this.context?.state ?? "none"
    };
  }

  public getDebugSnapshot(): RetroAudioDebugSnapshot {
    return {
      useExternalSfx: this.useExternalSfx,
      useBattleMusic: this.useBattleMusic,
      effectiveSfxVolume: this.sfxVolume,
      effectiveMusicVolume: this.musicVolume,
      contextState: this.context?.state ?? "none",
      battleMusicPlaying: Boolean(this.battleMusic?.isPlaying),
      battleMusicLoaded: this.scene.cache.audio.exists("bgm_battle"),
      usingManagerDestination: "destination" in this.scene.sound && Boolean(this.scene.sound.destination),
      htmlProbeResult: this.htmlProbeResult,
      eventsProcessed: this.eventsProcessed,
      lastEventType: this.lastEventType
    };
  }

  private playHtmlAudioProbe(): void {
    if (typeof window === "undefined" || typeof window.Audio !== "function") {
      this.htmlProbeResult = "html-audio-unavailable";
      return;
    }

    try {
      this.htmlProbeAudio = new Audio("/assets/final/sfx-place.wav");
      this.htmlProbeAudio.volume = 1;
      this.htmlProbeResult = "pending";

      const playResult = this.htmlProbeAudio.play();
      if (playResult && typeof playResult.then === "function") {
        void playResult
          .then(() => {
            this.htmlProbeResult = "playing";
          })
          .catch((error: unknown) => {
            const message = error instanceof Error ? error.message : "play-failed";
            this.htmlProbeResult = `error:${message}`;
          });
        return;
      }

      this.htmlProbeResult = "playing";
    } catch (error) {
      const message = error instanceof Error ? error.message : "probe-failed";
      this.htmlProbeResult = `error:${message}`;
    }
  }

  private playExternalSample(event: SimEvent): boolean {
    if (!this.useExternalSfx) {
      return false;
    }

    switch (event.type) {
      case "bomb_placed":
        return this.playBombPlacedSample();
      case "bomb_exploded":
        return this.playSample("sfx_blast", 0.75);
      case "pickup":
        return this.playPickupSample(event.payload.kind === "skull");
      default:
        return false;
    }
  }

  private playBombPlacedSample(): boolean {
    const primary = this.playSampleAtRate("sfx_place", 0.42, 0.68, 0.78);
    if (!primary) {
      return false;
    }
    this.scene.time.delayedCall(24, () => {
      this.playSampleAtRate("sfx_place", 0.14, 0.92, 1.02);
    });
    return true;
  }

  private playPickupSample(isSkull: boolean): boolean {
    if (isSkull) {
      return this.playSampleAtRate("sfx_place", 0.42, 0.6, 0.7);
    }

    const primary = this.playSampleAtRate("sfx_place", 0.48, 0.72, 0.84);
    if (!primary) {
      return false;
    }
    this.scene.time.delayedCall(38, () => {
      this.playSampleAtRate("sfx_place", 0.24, 0.92, 1.04);
    });
    return true;
  }

  private playSample(key: string, volume: number): boolean {
    return this.playSampleAtRate(key, volume, 0.96, 1.04);
  }

  private playSampleAtRate(key: string, volume: number, minRate: number, maxRate: number): boolean {
    if (!this.scene.cache.audio.exists(key)) {
      return false;
    }

    const boostedVolume = this.clampLinearVolume(volume * BASE_AUDIO_BOOST * this.sfxVolume);
    if (boostedVolume <= 0) {
      return false;
    }

    this.scene.sound.play(key, {
      volume: boostedVolume,
      rate: this.rand(minRate, maxRate)
    });
    return true;
  }

  private resolveContext(): AudioContext | null {
    if ("context" in this.scene.sound && this.scene.sound.context) {
      return this.scene.sound.context;
    }

    if (typeof window === "undefined") {
      return null;
    }

    const AudioContextCtor = window.AudioContext;
    if (!AudioContextCtor) {
      return null;
    }

    try {
      return new AudioContextCtor();
    } catch {
      return null;
    }
  }

  private resolveOutputNode(): AudioNode | null {
    if ("destination" in this.scene.sound && this.scene.sound.destination) {
      return this.scene.sound.destination;
    }
    return this.context?.destination ?? null;
  }

  private armUnlock(): void {
    const unlock = async (): Promise<void> => {
      if ("unlock" in this.scene.sound && typeof this.scene.sound.unlock === "function") {
        this.scene.sound.unlock();
      }
      if (!this.context || this.context.state === "running") {
        return;
      }
      try {
        await this.context.resume();
      } catch {
        // Ignore autoplay-policy resume failures.
      }
    };

    this.scene.input.keyboard?.once("keydown", () => {
      void unlock();
    });
    this.scene.input.once("pointerdown", () => {
      void unlock();
    });
  }

  private ensureContextRunning(): void {
    if ("unlock" in this.scene.sound && typeof this.scene.sound.unlock === "function") {
      this.scene.sound.unlock();
    }
    if (!this.context || this.context.state === "running") {
      return;
    }
    void this.context.resume().catch(() => {
      // Ignore autoplay-policy resume failures.
    });
  }

  private tone(
    frequency: number,
    durationMs: number,
    wave: WaveType,
    gainValue: number,
    offsetSeconds = 0
  ): void {
    if (!this.context || !this.outputNode || this.context.state !== "running") {
      return;
    }

    const start = this.context.currentTime + offsetSeconds;
    const end = start + durationMs / 1000;

    const oscillator = this.context.createOscillator();
    oscillator.type = wave;
    oscillator.frequency.setValueAtTime(Math.max(40, frequency + this.rand(-4, 4)), start);

    const gain = this.context.createGain();
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(this.scaledGain(gainValue), start + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, end);

    oscillator.connect(gain);
    gain.connect(this.outputNode);
    oscillator.start(start);
    oscillator.stop(end + 0.01);
  }

  private toneSweep(
    frequencyStart: number,
    frequencyEnd: number,
    durationMs: number,
    wave: WaveType,
    gainValue: number,
    offsetSeconds = 0
  ): void {
    if (!this.context || !this.outputNode || this.context.state !== "running") {
      return;
    }

    const start = this.context.currentTime + offsetSeconds;
    const end = start + durationMs / 1000;

    const oscillator = this.context.createOscillator();
    oscillator.type = wave;
    oscillator.frequency.setValueAtTime(Math.max(40, frequencyStart + this.rand(-6, 6)), start);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(40, frequencyEnd), end);

    const gain = this.context.createGain();
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(this.scaledGain(gainValue), start + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, end);

    oscillator.connect(gain);
    gain.connect(this.outputNode);
    oscillator.start(start);
    oscillator.stop(end + 0.01);
  }

  private noiseBurst(
    durationMs: number,
    gainValue: number,
    lowpassHz: number,
    offsetSeconds = 0
  ): void {
    if (!this.context || !this.outputNode || this.context.state !== "running") {
      return;
    }

    const start = this.context.currentTime + offsetSeconds;
    const durationSeconds = durationMs / 1000;
    const frameCount = Math.max(1, Math.floor(this.context.sampleRate * durationSeconds));
    const buffer = this.context.createBuffer(1, frameCount, this.context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < frameCount; i += 1) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / frameCount);
    }

    const source = this.context.createBufferSource();
    source.buffer = buffer;

    const filter = this.context.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(lowpassHz, start);

    const gain = this.context.createGain();
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(this.scaledGain(gainValue), start + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + durationSeconds);

    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.outputNode);
    source.start(start);
    source.stop(start + durationSeconds + 0.01);
  }

  private rand(min: number, max: number): number {
    return min + Math.random() * (max - min);
  }

  private scaledGain(baseGain: number): number {
    return Math.min(1, Math.max(0.0001, baseGain * this.sfxVolume * BASE_AUDIO_BOOST));
  }

  private clampVolume(volume: number): number {
    if (!Number.isFinite(volume)) {
      return 0.6;
    }
    return Math.min(1, Math.max(0, volume));
  }

  private clampLinearVolume(volume: number): number {
    if (!Number.isFinite(volume)) {
      return 0;
    }
    return Math.min(1, Math.max(0, volume));
  }
}
