import Phaser from "phaser";
import { GAME_HEIGHT, GAME_WIDTH } from "./game/constants";
import { installRuntimeHooks } from "./game/runtimeHooks";
import { createInitialSession } from "./game/session";
import { BootScene } from "./ui/scenes/BootScene";
import { BattleScene } from "./ui/scenes/BattleScene";
import { LobbyScene } from "./ui/scenes/LobbyScene";
import { MapSelectScene } from "./ui/scenes/MapSelectScene";
import { ResultsScene } from "./ui/scenes/ResultsScene";
import { SettingsScene } from "./ui/scenes/SettingsScene";
import { TitleScene } from "./ui/scenes/TitleScene";
import "./styles.css";

const session = createInitialSession();
installRuntimeHooks(session);

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: "app",
  scene: [BootScene, TitleScene, SettingsScene, LobbyScene, MapSelectScene, BattleScene, ResultsScene],
  backgroundColor: "#102136",
  scale: {
    mode: Phaser.Scale.NONE,
    width: GAME_WIDTH,
    height: GAME_HEIGHT
  },
  input: {
    keyboard: true,
    gamepad: true
  },
  render: {
    pixelArt: true,
    roundPixels: true,
    antialias: false
  }
});

game.registry.set("session", session);
session.sfxVolume = Phaser.Math.Clamp(session.sfxVolume, 0, 1);
session.musicVolume = Phaser.Math.Clamp(session.musicVolume, 0, 1);
game.sound.volume = 1;

function applyCrispLayout(): void {
  const canvas = game.canvas;
  if (!canvas) {
    return;
  }

  const fit = Math.min(window.innerWidth / GAME_WIDTH, window.innerHeight / GAME_HEIGHT);
  const scale = fit >= 1 ? Math.max(1, Math.floor(fit)) : fit;
  const displayWidth = Math.max(1, Math.floor(GAME_WIDTH * scale));
  const displayHeight = Math.max(1, Math.floor(GAME_HEIGHT * scale));

  canvas.style.width = `${displayWidth}px`;
  canvas.style.height = `${displayHeight}px`;
}

window.addEventListener("resize", applyCrispLayout);
game.scale.on(Phaser.Scale.Events.ENTER_FULLSCREEN, applyCrispLayout);
game.scale.on(Phaser.Scale.Events.LEAVE_FULLSCREEN, applyCrispLayout);
game.events.once(Phaser.Core.Events.DESTROY, () => {
  window.removeEventListener("resize", applyCrispLayout);
});
applyCrispLayout();
