import Phaser from "phaser";
import { BOT_DIFFICULTIES, type BotDifficulty } from "../../simulation/types";
import type { GameSession } from "../../game/session";
import { resetSetProgress } from "../../game/setProgress";
import { createMenuBackdrop, createMenuHeader, MENU_THEME } from "../menuTheme";
import { MenuSfx } from "../menuSfx";
import { getSessionFromScene } from "../sessionAccess";
import { SCENE_KEYS } from "../sceneKeys";

export class LobbyScene extends Phaser.Scene {
  private session!: GameSession;

  private cursorIndex = 0;

  private lines: Phaser.GameObjects.Text[] = [];

  private rowBackdrops: Phaser.GameObjects.Rectangle[] = [];

  private gamepadStatus!: Phaser.GameObjects.Text;

  private difficultyText!: Phaser.GameObjects.Text;

  private menuSfx!: MenuSfx;

  constructor() {
    super(SCENE_KEYS.lobby);
  }

  public create(): void {
    this.session = getSessionFromScene(this);
    this.menuSfx = new MenuSfx(this, this.session);
    const layout = createMenuBackdrop(this, { panelWidth: 800, panelHeight: 560, starCount: 90 });
    const centerX = layout.centerX;

    createMenuHeader(this, {
      x: centerX,
      y: layout.panelY + 60,
      title: "PLAYER LOBBY",
      subtitle: "SET EACH SLOT TO HUMAN OR CPU",
      titleSize: 62,
      subtitleSize: 24
    });

    this.rowBackdrops = this.session.lobbySlots.map((_, index) =>
      this.add
        .rectangle(centerX, layout.panelY + 170 + index * 86, 660, 68, MENU_THEME.rowIdle, 0.9)
        .setDepth(2)
    );

    this.lines = this.session.lobbySlots.map((_, index) =>
      this.add
        .text(centerX - 300, layout.panelY + 170 + index * 86, "", {
          fontSize: "33px",
          color: MENU_THEME.textColor,
          fontFamily: MENU_THEME.fontFamily
        })
        .setOrigin(0, 0.5)
        .setResolution(2)
        .setDepth(6)
    );

    this.gamepadStatus = this.add
      .text(centerX, layout.panelY + 502, "", {
        fontSize: "22px",
        color: MENU_THEME.mutedText,
        fontFamily: MENU_THEME.fontFamily
      })
      .setOrigin(0.5)
      .setResolution(2)
      .setDepth(6);

    this.difficultyText = this.add
      .text(centerX, layout.panelY + 530, "", {
        fontSize: "22px",
        color: MENU_THEME.textColor,
        fontFamily: MENU_THEME.fontFamily
      })
      .setOrigin(0.5)
      .setResolution(2)
      .setDepth(6);

    this.input.keyboard?.on("keydown-UP", () => {
      this.cursorIndex = (this.cursorIndex + this.session.lobbySlots.length) % (this.session.lobbySlots.length + 1);
      this.menuSfx.move();
      this.renderLobby();
    });
    this.input.keyboard?.on("keydown-DOWN", () => {
      this.cursorIndex = (this.cursorIndex + 1) % (this.session.lobbySlots.length + 1);
      this.menuSfx.move();
      this.renderLobby();
    });
    this.input.keyboard?.on("keydown-LEFT", () => this.adjustCurrent(-1));
    this.input.keyboard?.on("keydown-RIGHT", () => this.adjustCurrent(1));
    this.input.keyboard?.on("keydown-ENTER", () => {
      this.menuSfx.confirm();
      resetSetProgress(this.session);
      this.scene.start(SCENE_KEYS.mapSelect);
    });
    this.input.keyboard?.on("keydown-ESC", () => {
      this.menuSfx.back();
      this.scene.start(SCENE_KEYS.title);
    });
    this.input.keyboard?.on("keydown-S", () => {
      this.menuSfx.confirm();
      this.scene.start(SCENE_KEYS.settings, { returnScene: SCENE_KEYS.lobby });
    });

    this.renderLobby();
  }

  private adjustCurrent(direction: -1 | 1): void {
    if (this.cursorIndex < this.session.lobbySlots.length) {
      this.toggleCurrentSlot();
      return;
    }
    this.cycleDifficulty(direction);
  }

  private toggleCurrentSlot(): void {
    const current = this.session.lobbySlots[this.cursorIndex];
    if (!current) {
      return;
    }
    current.controller = current.controller === "human" ? "bot" : "human";
    this.menuSfx.toggle();
    this.renderLobby();
  }

  private cycleDifficulty(direction: -1 | 1): void {
    const currentIndex = BOT_DIFFICULTIES.indexOf(this.session.botDifficulty);
    const safeIndex = currentIndex >= 0 ? currentIndex : 1;
    const nextIndex = (safeIndex + direction + BOT_DIFFICULTIES.length) % BOT_DIFFICULTIES.length;
    this.session.botDifficulty = (BOT_DIFFICULTIES[nextIndex] ?? "normal") as BotDifficulty;
    this.menuSfx.toggle();
    this.renderLobby();
  }

  private renderLobby(): void {
    const gamepads = this.input.gamepad?.gamepads.filter((pad) => pad?.connected).length ?? 0;
    this.session.lobbySlots.forEach((slot, index) => {
      const active = index === this.cursorIndex;
      const line = this.lines[index];
      const backdrop = this.rowBackdrops[index];
      if (!line) {
        return;
      }
      if (backdrop) {
        backdrop.setFillStyle(active ? MENU_THEME.rowActive : MENU_THEME.rowIdle, active ? 0.98 : 0.88);
        backdrop.setScale(active ? 1.02 : 1, active ? 1.04 : 1);
      }
      const status = slot.controller === "human" ? "HUMAN" : "BOT";
      const marker = active ? "▶" : " ";
      line.setText(`${marker} ${slot.name}   ${status}`);
      line.setColor(active ? MENU_THEME.activeText : MENU_THEME.textColor);
    });

    this.gamepadStatus.setText(`CONNECTED GAMEPADS: ${gamepads}`);
    const difficultyActive = this.cursorIndex === this.session.lobbySlots.length;
    this.difficultyText.setText(
      `${difficultyActive ? "▶ " : "  "}CPU DIFFICULTY: ${this.session.botDifficulty.toUpperCase()}${difficultyActive ? " ◀" : ""}`
    );
    this.difficultyText.setColor(difficultyActive ? MENU_THEME.activeText : MENU_THEME.textColor);
    this.difficultyText.setFontSize(this.cursorIndex === this.session.lobbySlots.length ? "24px" : "22px");
  }
}
