import Phaser from "phaser";
import { applyMatchResultToSet, formatSetLengthLabel, resetSetProgress, startSetRound } from "../../game/setProgress";
import type { MatchFinishReason } from "../../simulation/types";
import { createMenuBackdrop, createMenuHeader, MENU_THEME } from "../menuTheme";
import { MenuSfx } from "../menuSfx";
import { getSessionFromScene } from "../sessionAccess";
import { SCENE_KEYS } from "../sceneKeys";

export class ResultsScene extends Phaser.Scene {
  private cursorIndex = 0;

  private actionLabels: string[] = [];

  private actionRows: Phaser.GameObjects.Rectangle[] = [];

  private actionTexts: Phaser.GameObjects.Text[] = [];

  constructor() {
    super(SCENE_KEYS.results);
  }

  public create(data: { winnerId: number | null; reason?: MatchFinishReason | null }): void {
    const session = getSessionFromScene(this);
    const menuSfx = new MenuSfx(this, session);
    applyMatchResultToSet(session, session.latestMatchState);
    const winnerId = data?.winnerId ?? session.latestMatchState?.winnerId ?? null;
    const reason = data?.reason ?? session.latestMatchState?.matchFinishedReason ?? null;
    const winner = session.latestMatchState?.players.find((player) => player.id === winnerId);
    const setWinner = session.latestMatchState?.players.find((player) => player.id === session.setWinnerId) ?? winner;
    const setComplete = session.setWinnerId !== null && setWinner !== undefined;
    const showSetComplete = session.selectedSetLength > 1 && setComplete;
    const resetSetOnEnter = session.selectedSetLength <= 1 || setComplete;
    const layout = createMenuBackdrop(this, { panelWidth: 800, panelHeight: 520, panelOffsetY: 8, starCount: 86 });
    const centerX = layout.centerX;
    const centerY = layout.centerY;

    createMenuHeader(this, {
      x: centerX,
      y: layout.panelY + 62,
      title: showSetComplete ? "SET RESULT" : "MATCH RESULT",
      subtitle: showSetComplete ? "SET COMPLETE" : "ROUND COMPLETE",
      titleSize: 60,
      subtitleSize: 24
    });

    const winnerText = this.add
      .text(
        centerX,
        centerY - 24,
        showSetComplete ? `${setWinner?.name ?? "DRAW"} TAKES THE SET!` : winner ? `${winner.name} WINS!` : "DRAW",
        {
        fontSize: "64px",
        color: winner || showSetComplete ? "#f6f3e6" : "#ffb191",
        fontFamily: MENU_THEME.fontFamily,
        stroke: winner || showSetComplete ? "#13324f" : "#4a1f16",
        strokeThickness: 6
        }
      )
      .setOrigin(0.5)
      .setResolution(2)
      .setDepth(6);

    const reasonLabel = reason === "suddenDeath" ? "SUDDEN DEATH WIN" : reason === "timeout" ? "TIMEOUT WIN" : "ELIMINATION WIN";
    const drawLabel = reason === "timeout" ? "TIMEOUT DRAW" : reason === "suddenDeath" ? "SUDDEN DEATH DRAW" : "DRAW";

    this.add
      .text(centerX, centerY + 24, showSetComplete ? `${formatSetLengthLabel(session.selectedSetLength)} COMPLETE` : winner ? reasonLabel : drawLabel, {
        fontSize: "30px",
        color: showSetComplete ? "#ffe08c" : reason === "suddenDeath" ? "#ffcf98" : reason === "timeout" ? "#ffe08c" : MENU_THEME.mutedText,
        fontFamily: MENU_THEME.fontFamily
      })
      .setOrigin(0.5)
      .setResolution(2)
      .setDepth(6);

    this.tweens.add({
      targets: winnerText,
      scaleX: 1.03,
      scaleY: 1.03,
      duration: 600,
      yoyo: true,
      repeat: -1,
      ease: "Sine.InOut"
    });

    this.add
      .text(
        centerX,
        centerY + 84,
        this.buildSetScoreText(session),
        {
          fontSize: "24px",
          color: MENU_THEME.textColor,
          fontFamily: MENU_THEME.fontFamily
        }
      )
      .setOrigin(0.5)
      .setResolution(2)
      .setDepth(6)
      .setVisible(session.selectedSetLength > 1);

    this.actionLabels = [
      showSetComplete
        ? "NEW SET"
        : session.selectedSetLength <= 1
          ? winner
            ? "PLAY AGAIN"
            : "CONTINUE"
          : winner
            ? "NEXT ROUND"
            : "CONTINUE",
      "MAP SELECT",
      "LOBBY",
      "SETTINGS"
    ];

    this.actionRows = this.actionLabels.map((_, index) =>
      this.add.rectangle(centerX, centerY + 132 + index * 58, 360, 46, MENU_THEME.rowIdle, 0.9).setDepth(4)
    );
    this.actionTexts = this.actionLabels.map((label, index) =>
      this.add
        .text(centerX, centerY + 132 + index * 58, label, {
          fontSize: "26px",
          color: MENU_THEME.textColor,
          fontFamily: MENU_THEME.fontFamily
        })
        .setOrigin(0.5)
        .setResolution(2)
        .setDepth(6)
    );

    this.input.keyboard?.on("keydown-UP", () => {
      this.cursorIndex = (this.cursorIndex + this.actionRows.length - 1) % this.actionRows.length;
      menuSfx.move();
      this.renderActions();
    });
    this.input.keyboard?.on("keydown-DOWN", () => {
      this.cursorIndex = (this.cursorIndex + 1) % this.actionRows.length;
      menuSfx.move();
      this.renderActions();
    });
    this.input.keyboard?.on("keydown-LEFT", () => this.activateCurrent(session, menuSfx, resetSetOnEnter));
    this.input.keyboard?.on("keydown-RIGHT", () => this.activateCurrent(session, menuSfx, resetSetOnEnter));
    this.input.keyboard?.on("keydown-ENTER", () => this.activateCurrent(session, menuSfx, resetSetOnEnter));

    this.renderActions();
  }

  private activateCurrent(
    session: ReturnType<typeof getSessionFromScene>,
    menuSfx: MenuSfx,
    resetSetOnEnter: boolean
  ): void {
    if (this.cursorIndex === 0) {
      menuSfx.confirm();
      startSetRound(session, resetSetOnEnter);
      this.scene.start(SCENE_KEYS.battle);
      return;
    }
    if (this.cursorIndex === 1) {
      menuSfx.confirm();
      resetSetProgress(session);
      this.scene.start(SCENE_KEYS.mapSelect);
      return;
    }
    if (this.cursorIndex === 2) {
      menuSfx.back();
      resetSetProgress(session);
      this.scene.start(SCENE_KEYS.lobby);
      return;
    }
    menuSfx.confirm();
    this.scene.start(SCENE_KEYS.settings, { returnScene: SCENE_KEYS.results });
  }

  private renderActions(): void {
    this.actionRows.forEach((row, index) => {
      const active = index === this.cursorIndex;
      row.setFillStyle(active ? MENU_THEME.rowActive : MENU_THEME.rowIdle, active ? 0.98 : 0.9);
      row.setScale(active ? 1.03 : 1, active ? 1.05 : 1);
    });
    this.actionTexts.forEach((text, index) => {
      const active = index === this.cursorIndex;
      text.setColor(active ? MENU_THEME.activeText : MENU_THEME.textColor);
      text.setText(`${active ? "▶ " : "  "}${this.actionLabels[index] ?? ""}${active ? " ◀" : ""}`);
    });
  }

  private buildSetScoreText(session: ReturnType<typeof getSessionFromScene>): string {
    if (session.selectedSetLength <= 1) {
      return "";
    }
    const scores = session.lobbySlots
      .map((slot) => `${slot.name}:${session.setWinsByPlayerId[slot.id] ?? 0}`)
      .join("   ");
    return `${formatSetLengthLabel(session.selectedSetLength)}   ROUND ${session.roundsPlayedInSet}   ${scores}`;
  }
}
