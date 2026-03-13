import Phaser from "phaser";
import { savePersistedSettings } from "../../game/persistentSettings";
import type { GameSession } from "../../game/session";
import { createMenuBackdrop, createMenuHeader, MENU_THEME } from "../menuTheme";
import { MenuSfx } from "../menuSfx";
import { getSessionFromScene } from "../sessionAccess";
import { SCENE_KEYS } from "../sceneKeys";

type SettingsData = {
  returnScene?: string;
};

const VOLUME_STEP = 0.05;

export class SettingsScene extends Phaser.Scene {
  private session!: GameSession;

  private returnScene: string = SCENE_KEYS.title;

  private cursorIndex = 0;

  private optionTexts: Phaser.GameObjects.Text[] = [];

  private optionRows: Phaser.GameObjects.Rectangle[] = [];

  private menuSfx!: MenuSfx;

  constructor() {
    super(SCENE_KEYS.settings);
  }

  public create(data?: SettingsData): void {
    this.session = getSessionFromScene(this);
    this.menuSfx = new MenuSfx(this, this.session);
    this.session.sfxVolume = Phaser.Math.Clamp(this.session.sfxVolume, 0, 1);
    this.session.musicVolume = Phaser.Math.Clamp(this.session.musicVolume, 0, 1);
    this.returnScene = data?.returnScene ?? SCENE_KEYS.title;

    const layout = createMenuBackdrop(this, { panelWidth: 760, panelHeight: 560, starCount: 80 });
    const centerX = layout.centerX;
    const centerY = layout.centerY;

    createMenuHeader(this, {
      x: centerX,
      y: layout.panelY + 62,
      title: "SETTINGS",
      subtitle: "AUDIO + GAME OPTIONS",
      titleSize: 60,
      subtitleSize: 24
    });

    this.optionRows = [0, 1, 2, 3].map((index) =>
      this.add.rectangle(centerX, centerY - 92 + index * 82, 470, 64, MENU_THEME.rowIdle, 0.9).setDepth(2)
    );

    this.optionTexts = [0, 1, 2, 3].map((index) =>
      this.add
        .text(centerX, centerY - 92 + index * 82, "", {
          fontSize: "34px",
          color: MENU_THEME.textColor,
          fontFamily: MENU_THEME.fontFamily
        })
        .setOrigin(0.5)
        .setResolution(2)
        .setDepth(6)
    );

    this.input.keyboard?.on("keydown-UP", () => {
      this.cursorIndex = (this.cursorIndex + this.optionTexts.length - 1) % this.optionTexts.length;
      this.menuSfx.move();
      this.renderState();
    });
    this.input.keyboard?.on("keydown-DOWN", () => {
      this.cursorIndex = (this.cursorIndex + 1) % this.optionTexts.length;
      this.menuSfx.move();
      this.renderState();
    });
    this.input.keyboard?.on("keydown-LEFT", () => this.adjustCurrent(-1));
    this.input.keyboard?.on("keydown-RIGHT", () => this.adjustCurrent(1));
    this.input.keyboard?.on("keydown-ENTER", () => this.activateCurrent());
    this.input.keyboard?.on("keydown-ESC", () => {
      this.menuSfx.back();
      this.back();
    });

    this.renderState();
  }

  private adjustCurrent(direction: -1 | 1): void {
    if (this.cursorIndex === 0) {
      const nextVolume = Phaser.Math.Clamp(this.session.sfxVolume + direction * VOLUME_STEP, 0, 1);
      this.session.sfxVolume = Math.round(nextVolume * 20) / 20;
      this.persistSettings();
      this.menuSfx.toggle();
      this.renderState();
      return;
    }

    if (this.cursorIndex === 1) {
      const nextVolume = Phaser.Math.Clamp(this.session.musicVolume + direction * VOLUME_STEP, 0, 1);
      this.session.musicVolume = Math.round(nextVolume * 20) / 20;
      this.persistSettings();
      this.menuSfx.toggle();
      this.renderState();
      return;
    }

    if (this.cursorIndex === 2) {
      this.session.musicEnabled = !this.session.musicEnabled;
      this.persistSettings();
      this.menuSfx.toggle();
      this.renderState();
      return;
    }

    this.menuSfx.back();
    this.back();
  }

  private activateCurrent(): void {
    if (this.cursorIndex === 0 || this.cursorIndex === 1) {
      this.adjustCurrent(1);
      return;
    }
    if (this.cursorIndex === 2) {
      this.session.musicEnabled = !this.session.musicEnabled;
      this.persistSettings();
      this.menuSfx.toggle();
      this.renderState();
      return;
    }
    this.menuSfx.confirm();
    this.back();
  }

  private back(): void {
    this.persistSettings();
    this.scene.start(this.returnScene);
  }

  private persistSettings(): void {
    savePersistedSettings({
      sfxVolume: this.session.sfxVolume,
      musicVolume: this.session.musicVolume,
      musicEnabled: this.session.musicEnabled
    });
  }

  private renderState(): void {
    const sfxPercent = Math.round(this.session.sfxVolume * 100);
    const musicPercent = Math.round(this.session.musicVolume * 100);
    const musicState = this.session.musicEnabled ? "ON" : "OFF";
    const labels = [`SFX VOLUME  ${sfxPercent}%`, `MUSIC VOL  ${musicPercent}%`, `MUSIC  ${musicState}`, "BACK"];

    this.optionTexts.forEach((optionText, index) => {
      const active = index === this.cursorIndex;
      const row = this.optionRows[index];
      if (row) {
        row.setFillStyle(active ? MENU_THEME.rowActive : MENU_THEME.rowIdle, active ? 0.98 : 0.9);
        row.setScale(active ? 1.03 : 1, active ? 1.05 : 1);
      }
      optionText.setText(`${active ? "▶ " : "  "}${labels[index] ?? ""}${active ? " ◀" : ""}`);
      optionText.setColor(active ? MENU_THEME.activeText : MENU_THEME.textColor);
      optionText.setFontSize(active ? "36px" : "34px");
    });
  }
}
