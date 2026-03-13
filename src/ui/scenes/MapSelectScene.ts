import Phaser from "phaser";
import { MAPS } from "../../content/maps";
import type { GameSession } from "../../game/session";
import { cycleSetLength, formatSetLengthLabel, startSetRound } from "../../game/setProgress";
import { createMenuBackdrop, createMenuHeader, MENU_THEME } from "../menuTheme";
import { MenuSfx } from "../menuSfx";
import { getSessionFromScene } from "../sessionAccess";
import { SCENE_KEYS } from "../sceneKeys";

const DURATIONS = [120, 180, 240];

export class MapSelectScene extends Phaser.Scene {
  private session!: GameSession;

  private cursorIndex = 0;

  private optionRows: Phaser.GameObjects.Rectangle[] = [];

  private mapText!: Phaser.GameObjects.Text;

  private durationText!: Phaser.GameObjects.Text;

  private setText!: Phaser.GameObjects.Text;

  private previewText!: Phaser.GameObjects.Text;

  private menuSfx!: MenuSfx;

  constructor() {
    super(SCENE_KEYS.mapSelect);
  }

  public create(): void {
    this.session = getSessionFromScene(this);
    this.menuSfx = new MenuSfx(this, this.session);
    const layout = createMenuBackdrop(this, { panelWidth: 820, panelHeight: 592, starCount: 88 });
    const centerX = layout.centerX;
    const centerY = layout.centerY;

    this.createAmbientSparks();

    createMenuHeader(this, {
      x: centerX,
      y: layout.panelY + 62,
      title: "MAP + RULES",
      subtitle: "PICK ARENA AND MATCH TIMER",
      titleSize: 62,
      subtitleSize: 23
    });

    this.optionRows = [
      this.add.rectangle(centerX, centerY - 62, 640, 70, MENU_THEME.rowIdle, 0.9).setDepth(2),
      this.add.rectangle(centerX, centerY + 20, 390, 60, MENU_THEME.rowIdle, 0.9).setDepth(2),
      this.add.rectangle(centerX, centerY + 96, 390, 60, MENU_THEME.rowIdle, 0.9).setDepth(2)
    ];
    this.mapText = this.add
      .text(centerX, centerY - 66, "", {
        fontSize: "40px",
        color: MENU_THEME.activeText,
        fontFamily: MENU_THEME.fontFamily
      })
      .setOrigin(0.5)
      .setResolution(2)
      .setDepth(6);

    this.durationText = this.add
      .text(centerX, centerY + 20, "", {
        fontSize: "34px",
        color: MENU_THEME.textColor,
        fontFamily: MENU_THEME.fontFamily
      })
      .setOrigin(0.5)
      .setResolution(2)
      .setDepth(6);

    this.setText = this.add
      .text(centerX, centerY + 96, "", {
        fontSize: "32px",
        color: MENU_THEME.textColor,
        fontFamily: MENU_THEME.fontFamily
      })
      .setOrigin(0.5)
      .setResolution(2)
      .setDepth(6);

    this.add.rectangle(centerX, centerY + 220, 500, 252, 0x10324f, 0.95).setDepth(2);
    this.previewText = this.add
      .text(centerX, centerY + 220, "", {
        fontSize: "15px",
        color: "#baeeff",
        align: "center",
        fontFamily: MENU_THEME.monoFontFamily,
        lineSpacing: 3
      })
      .setOrigin(0.5)
      .setResolution(2)
      .setDepth(6);

    this.input.keyboard?.on("keydown-UP", () => {
      this.menuSfx.move();
      this.cursorIndex = (this.cursorIndex + this.optionRows.length - 1) % this.optionRows.length;
      this.renderState();
    });

    this.input.keyboard?.on("keydown-DOWN", () => {
      this.menuSfx.move();
      this.cursorIndex = (this.cursorIndex + 1) % this.optionRows.length;
      this.renderState();
    });
    this.input.keyboard?.on("keydown-LEFT", () => this.adjustCurrent(-1));
    this.input.keyboard?.on("keydown-RIGHT", () => this.adjustCurrent(1));

    this.input.keyboard?.on("keydown-ENTER", () => {
      this.menuSfx.confirm();
      startSetRound(this.session, true);
      this.scene.start(SCENE_KEYS.battle);
    });
    this.input.keyboard?.on("keydown-ESC", () => {
      this.menuSfx.back();
      this.scene.start(SCENE_KEYS.lobby);
    });
    this.input.keyboard?.on("keydown-S", () => {
      this.menuSfx.confirm();
      this.scene.start(SCENE_KEYS.settings, { returnScene: SCENE_KEYS.mapSelect });
    });
    this.input.keyboard?.on("keydown-A", () => {
      this.session.selectedSetLength = cycleSetLength(this.session.selectedSetLength, -1);
      this.menuSfx.toggle();
      this.renderState();
    });
    this.input.keyboard?.on("keydown-D", () => {
      this.session.selectedSetLength = cycleSetLength(this.session.selectedSetLength, 1);
      this.menuSfx.toggle();
      this.renderState();
    });

    this.renderState();
  }

  private adjustCurrent(direction: -1 | 1): void {
    if (this.cursorIndex === 0) {
      this.session.selectedMapIndex = (this.session.selectedMapIndex + direction + MAPS.length) % MAPS.length;
      this.menuSfx.toggle();
      this.renderState();
      return;
    }

    if (this.cursorIndex === 1) {
      const index = DURATIONS.indexOf(this.session.selectedDurationSeconds);
      const safeIndex = index >= 0 ? index : 1;
      this.session.selectedDurationSeconds =
        DURATIONS[(safeIndex + direction + DURATIONS.length) % DURATIONS.length] ?? DURATIONS[1]!;
      this.menuSfx.toggle();
      this.renderState();
      return;
    }

    this.session.selectedSetLength = cycleSetLength(this.session.selectedSetLength, direction);
    this.menuSfx.toggle();
    this.renderState();
  }

  private renderState(): void {
    const currentMap = MAPS[this.session.selectedMapIndex];
    this.optionRows.forEach((row, index) => {
      const active = index === this.cursorIndex;
      row.setFillStyle(active ? MENU_THEME.rowActive : MENU_THEME.rowIdle, active ? 0.98 : 0.9);
      row.setScale(active ? 1.03 : 1, active ? 1.05 : 1);
    });
    this.mapText.setText(`${this.cursorIndex === 0 ? "▶ " : "  "}Map: ${currentMap?.name ?? "Unknown"}${this.cursorIndex === 0 ? " ◀" : ""}`);
    this.durationText.setText(
      `${this.cursorIndex === 1 ? "▶ " : "  "}Timer: ${this.session.selectedDurationSeconds}s${this.cursorIndex === 1 ? " ◀" : ""}`
    );
    this.setText.setText(
      `${this.cursorIndex === 2 ? "▶ " : "  "}Set: ${formatSetLengthLabel(this.session.selectedSetLength)}${this.cursorIndex === 2 ? " ◀" : ""}`
    );
    this.mapText.setColor(this.cursorIndex === 0 ? MENU_THEME.activeText : MENU_THEME.textColor);
    this.durationText.setColor(this.cursorIndex === 1 ? MENU_THEME.activeText : MENU_THEME.textColor);
    this.setText.setColor(this.cursorIndex === 2 ? MENU_THEME.activeText : MENU_THEME.textColor);
    this.previewText.setText(this.mapPreviewText(currentMap));
  }

  private createAmbientSparks(): void {
    const sparkCount = 30;
    for (let i = 0; i < sparkCount; i += 1) {
      const x = ((i * 149 + 37) % this.scale.width) + Phaser.Math.Between(-16, 16);
      const y = ((i * 101 + 59) % this.scale.height) + Phaser.Math.Between(-10, 10);
      const size = Phaser.Math.Between(2, 4);
      const spark = this.add.rectangle(x, y, size, size, 0xdaf6ff, 0.22).setDepth(1);
      this.tweens.add({
        targets: spark,
        alpha: { from: 0.08, to: 0.4 },
        y: y - Phaser.Math.Between(6, 16),
        duration: Phaser.Math.Between(900, 1600),
        delay: i * 55,
        yoyo: true,
        repeat: -1,
        ease: "Sine.InOut"
      });
    }
  }

  private mapPreviewText(map: (typeof MAPS)[number] | undefined): string {
    if (!map) {
      return "NO MAP";
    }

    const lines: string[] = [];
    for (let y = 0; y < map.height; y += 1) {
      let row = "";
      const softRow = map.softRows[y] ?? "";
      for (let x = 0; x < map.width; x += 1) {
        const border = x === 0 || y === 0 || x === map.width - 1 || y === map.height - 1;
        const hard = x % 2 === 0 && y % 2 === 0;
        if (border || hard) {
          row += "#";
          continue;
        }
        row += softRow[x] === "s" ? "+" : ".";
      }
      lines.push(row);
    }

    return `MAP PREVIEW  # hard  + soft\n${lines.join("\n")}`;
  }
}
