import Phaser from "phaser";
import type { InputFrame, PlayerIntent, PlayerState } from "../simulation";

interface BindingConfig {
  readonly up: string;
  readonly down: string;
  readonly left: string;
  readonly right: string;
  readonly bomb: string;
}

const DEFAULT_BINDINGS: BindingConfig[] = [
  { up: "W", down: "S", left: "A", right: "D", bomb: "SPACE" },
  { up: "UP", down: "DOWN", left: "LEFT", right: "RIGHT", bomb: "ENTER" },
  { up: "I", down: "K", left: "J", right: "L", bomb: "U" },
  { up: "NUMPAD_EIGHT", down: "NUMPAD_FIVE", left: "NUMPAD_FOUR", right: "NUMPAD_SIX", bomb: "NUMPAD_ZERO" }
];

interface KeyBindings {
  readonly up: Phaser.Input.Keyboard.Key;
  readonly down: Phaser.Input.Keyboard.Key;
  readonly left: Phaser.Input.Keyboard.Key;
  readonly right: Phaser.Input.Keyboard.Key;
  readonly bomb: Phaser.Input.Keyboard.Key;
}

function normalizeAxis(value: number): -1 | 0 | 1 {
  if (value > 0.4) return 1;
  if (value < -0.4) return -1;
  return 0;
}

export class InputManager {
  private readonly scene: Phaser.Scene;

  private readonly keyboardBySlot = new Map<number, KeyBindings>();

  private readonly previousBombStateByPlayer = new Map<number, boolean>();

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    DEFAULT_BINDINGS.forEach((binding, index) => {
      this.keyboardBySlot.set(index, {
        up: scene.input.keyboard!.addKey(binding.up),
        down: scene.input.keyboard!.addKey(binding.down),
        left: scene.input.keyboard!.addKey(binding.left),
        right: scene.input.keyboard!.addKey(binding.right),
        bomb: scene.input.keyboard!.addKey(binding.bomb)
      });
    });
  }

  public collectFrame(players: PlayerState[]): InputFrame {
    const intents: Record<number, PlayerIntent> = {};

    for (const player of players) {
      if (!player.alive || player.controller !== "human") {
        intents[player.id] = { moveX: 0, moveY: 0, placeBomb: false };
        continue;
      }

      const keyboardBindings = this.keyboardBySlot.get(player.slotIndex);
      const gamepad = this.scene.input.gamepad?.gamepads[player.slotIndex] ?? null;

      const keyboardMoveX = keyboardBindings
        ? (Number(keyboardBindings.right.isDown) - Number(keyboardBindings.left.isDown))
        : 0;
      const keyboardMoveY = keyboardBindings
        ? (Number(keyboardBindings.down.isDown) - Number(keyboardBindings.up.isDown))
        : 0;

      const gamepadMoveX = gamepad ? normalizeAxis(gamepad.axes[0]?.getValue() ?? 0) : 0;
      const gamepadMoveY = gamepad ? normalizeAxis(gamepad.axes[1]?.getValue() ?? 0) : 0;

      const moveX = (gamepadMoveX !== 0 ? gamepadMoveX : keyboardMoveX) as -1 | 0 | 1;
      const moveY = (gamepadMoveY !== 0 ? gamepadMoveY : keyboardMoveY) as -1 | 0 | 1;

      const bombKeyDown = Boolean(keyboardBindings?.bomb.isDown);
      const bombButtonDown = Boolean(gamepad?.buttons[0]?.pressed);
      const bombNow = bombKeyDown || bombButtonDown;
      const bombPrev = this.previousBombStateByPlayer.get(player.id) ?? false;
      const placeBomb = bombNow && !bombPrev;

      this.previousBombStateByPlayer.set(player.id, bombNow);

      intents[player.id] = {
        moveX,
        moveY,
        placeBomb
      };
    }

    return { intents };
  }
}
