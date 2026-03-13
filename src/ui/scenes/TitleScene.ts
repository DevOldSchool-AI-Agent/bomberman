import Phaser from "phaser";
import { getSessionFromScene } from "../sessionAccess";
import { createMenuBackdrop, createMenuHeader, MENU_THEME } from "../menuTheme";
import { MenuSfx } from "../menuSfx";
import { SCENE_KEYS } from "../sceneKeys";

export class TitleScene extends Phaser.Scene {
  private cursorIndex = 0;

  private menuOptions: Phaser.GameObjects.Text[] = [];

  private menuRows: Phaser.GameObjects.Rectangle[] = [];

  private menuSfx!: MenuSfx;

  constructor() {
    super(SCENE_KEYS.title);
  }

  public create(): void {
    const session = getSessionFromScene(this);
    const layout = createMenuBackdrop(this, { panelWidth: 760, panelHeight: 470, panelOffsetY: 6, starCount: 85 });
    const centerX = layout.centerX;
    const centerY = layout.centerY;

    createMenuHeader(this, {
      x: centerX,
      y: layout.panelY + 66,
      title: "NEO BOMBER ARENA",
      subtitle: "SNES-STYLE BATTLE MODE",
      titleSize: 66,
      subtitleSize: 30
    });

    this.add
      .text(centerX, layout.panelY + 170, "LOCAL 1-4 PLAYERS", {
        color: MENU_THEME.textColor,
        fontSize: "30px",
        fontFamily: MENU_THEME.fontFamily
      })
      .setOrigin(0.5)
      .setResolution(2)
      .setDepth(6);

    this.add
      .text(centerX, centerY - 4, "KEYBOARD + GAMEPAD READY", {
        color: MENU_THEME.mutedText,
        fontSize: "21px",
        fontFamily: MENU_THEME.fontFamily
      })
      .setOrigin(0.5)
      .setResolution(2)
      .setDepth(6);

    const optionLabels = ["START BATTLE", "SETTINGS"];
    this.menuRows = optionLabels.map((_, index) =>
      this.add.rectangle(centerX, centerY + 68 + index * 72, 370, 60, MENU_THEME.rowIdle, 0.88).setDepth(4)
    );

    this.menuOptions = optionLabels.map((label, index) =>
      this.add
        .text(centerX, centerY + 68 + index * 72, label, {
          color: MENU_THEME.textColor,
          fontSize: index === 0 ? "35px" : "31px",
          fontFamily: MENU_THEME.fontFamily
        })
        .setOrigin(0.5)
        .setResolution(2)
        .setDepth(6)
    );

    this.menuSfx = new MenuSfx(this, session);

    this.input.keyboard?.on("keydown-UP", () => {
      this.cursorIndex = (this.cursorIndex + this.menuOptions.length - 1) % this.menuOptions.length;
      this.menuSfx.move();
      this.renderMenu();
    });
    this.input.keyboard?.on("keydown-DOWN", () => {
      this.cursorIndex = (this.cursorIndex + 1) % this.menuOptions.length;
      this.menuSfx.move();
      this.renderMenu();
    });
    this.input.keyboard?.on("keydown-LEFT", () => this.activateCurrent());
    this.input.keyboard?.on("keydown-RIGHT", () => this.activateCurrent());
    this.input.keyboard?.on("keydown-ENTER", () => this.activateCurrent());
    this.input.keyboard?.on("keydown-SPACE", () => this.activateCurrent());
    this.input.keyboard?.on("keydown-S", () => {
      this.menuSfx.confirm();
      this.scene.start(SCENE_KEYS.settings, { returnScene: SCENE_KEYS.title });
    });

    this.renderMenu();
  }

  private activateCurrent(): void {
    this.menuSfx.confirm();
    if (this.cursorIndex === 0) {
      this.scene.start(SCENE_KEYS.lobby);
      return;
    }
    this.scene.start(SCENE_KEYS.settings, { returnScene: SCENE_KEYS.title });
  }

  private renderMenu(): void {
    this.menuOptions.forEach((option, index): void => {
      const active = index === this.cursorIndex;
      const row = this.menuRows[index];
      if (row) {
        row.setFillStyle(active ? MENU_THEME.rowActive : MENU_THEME.rowIdle, active ? 0.98 : 0.88);
        row.setScale(active ? 1.03 : 1, active ? 1.06 : 1);
      }
      option.setText(`${active ? "▶ " : "  "}${index === 0 ? "START BATTLE" : "SETTINGS"}${active ? " ◀" : ""}`);
      option.setColor(active ? MENU_THEME.activeText : MENU_THEME.textColor);
      option.setFontSize(index === 0 && active ? "38px" : index === 0 ? "35px" : active ? "33px" : "31px");
      option.setAlpha(active ? 1 : 0.9);
    });
  }
}
