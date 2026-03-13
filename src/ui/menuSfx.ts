import Phaser from "phaser";
import { effectiveSfxVolume } from "../game/audioVolume";
import type { GameSession } from "../game/session";

export class MenuSfx {
  private readonly scene: Phaser.Scene;

  private readonly session: GameSession;

  private readonly context: AudioContext | null;

  private readonly outputNode: AudioNode | null;

  constructor(scene: Phaser.Scene, session: GameSession) {
    this.scene = scene;
    this.session = session;
    this.context = this.resolveContext();
    this.outputNode = this.resolveOutputNode();
  }

  public move(): void {
    // Intentionally quiet: movement sounds were fatiguing in menus.
  }

  public confirm(): void {
    this.ensureUnlocked();
    if (this.playDeepThump(88, 130, 0.15)) {
      return;
    }
    this.playSample("sfx_place", 0.18, Phaser.Math.FloatBetween(0.74, 0.86));
  }

  public back(): void {
    this.ensureUnlocked();
    if (this.playDeepThump(70, 120, 0.12)) {
      return;
    }
    this.playSample("sfx_place", 0.15, Phaser.Math.FloatBetween(0.68, 0.8));
  }

  public toggle(): void {
    // Intentionally quiet while changing values rapidly.
  }

  private playSample(key: string, volume: number, rate: number): void {
    if (!this.scene.cache.audio.exists(key)) {
      return;
    }
    const scaledVolume = Phaser.Math.Clamp(volume * effectiveSfxVolume(this.session.sfxVolume), 0, 1);
    if (scaledVolume <= 0) {
      return;
    }
    this.scene.sound.play(key, {
      volume: scaledVolume,
      rate: Phaser.Math.Clamp(rate, 0.5, 2)
    });
  }

  private playDeepThump(baseHz: number, durationMs: number, peakGain: number): boolean {
    if (!this.context || !this.outputNode || this.context.state !== "running") {
      return false;
    }

    const start = this.context.currentTime;
    const end = start + durationMs / 1000;

    const body = this.context.createOscillator();
    body.type = "sine";
    body.frequency.setValueAtTime(baseHz, start);
    body.frequency.exponentialRampToValueAtTime(Math.max(36, baseHz * 0.6), end);

    const transient = this.context.createOscillator();
    transient.type = "triangle";
    transient.frequency.setValueAtTime(baseHz * 2.2, start);
    transient.frequency.exponentialRampToValueAtTime(Math.max(64, baseHz * 1.1), end);

    const filter = this.context.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(420, start);
    filter.frequency.exponentialRampToValueAtTime(190, end);

    const gain = this.context.createGain();
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(
      Math.max(0.0001, peakGain * effectiveSfxVolume(this.session.sfxVolume)),
      start + 0.01
    );
    gain.gain.exponentialRampToValueAtTime(0.0001, end);

    body.connect(filter);
    transient.connect(filter);
    filter.connect(gain);
    gain.connect(this.outputNode);

    body.start(start);
    transient.start(start);
    body.stop(end + 0.02);
    transient.stop(end + 0.02);
    return true;
  }

  private ensureUnlocked(): void {
    if ("unlock" in this.scene.sound && typeof this.scene.sound.unlock === "function") {
      this.scene.sound.unlock();
    }
  }

  private resolveContext(): AudioContext | null {
    if ("context" in this.scene.sound && this.scene.sound.context) {
      return this.scene.sound.context;
    }
    return null;
  }

  private resolveOutputNode(): AudioNode | null {
    if ("destination" in this.scene.sound && this.scene.sound.destination) {
      return this.scene.sound.destination;
    }
    return this.context?.destination ?? null;
  }
}
