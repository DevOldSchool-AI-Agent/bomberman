import Phaser from "phaser";

export const MENU_THEME = {
  fontFamily: "Trebuchet MS",
  monoFontFamily: "Courier New",
  titleColor: "#ffe084",
  titleShadow: "#3b2b00",
  textColor: "#e5f5ff",
  mutedText: "#95d9ff",
  activeText: "#ffd46d",
  panelFill: 0x0f2d48,
  rowIdle: 0x154467,
  rowActive: 0x2c6993,
  footerFill: 0x102f4c
} as const;

type MenuBackdropOptions = {
  panelWidth?: number;
  panelHeight?: number;
  panelOffsetY?: number;
  starCount?: number;
};

export type MenuBackdropLayout = {
  centerX: number;
  centerY: number;
  panelX: number;
  panelY: number;
  panelWidth: number;
  panelHeight: number;
};

export function createMenuBackdrop(scene: Phaser.Scene, options: MenuBackdropOptions = {}): MenuBackdropLayout {
  const panelWidth = options.panelWidth ?? 760;
  const panelHeight = options.panelHeight ?? 500;
  const panelOffsetY = options.panelOffsetY ?? 0;
  const starCount = options.starCount ?? 70;

  const width = scene.scale.width;
  const height = scene.scale.height;
  const centerX = width / 2;
  const centerY = height / 2 + panelOffsetY;
  const panelX = centerX - panelWidth / 2;
  const panelY = centerY - panelHeight / 2;

  const bg = scene.add.graphics().setDepth(0);
  bg.fillStyle(0x061226, 1);
  bg.fillRect(0, 0, width, height);
  bg.fillStyle(0x0d2c50, 0.5);
  bg.fillRect(0, 0, width, height * 0.55);

  bg.fillStyle(0x2f73b6, 0.36);
  bg.fillCircle(width * 0.17, height * 0.18, Math.min(width, height) * 0.22);
  bg.fillCircle(width * 0.85, height * 0.8, Math.min(width, height) * 0.26);
  bg.fillStyle(0x26c59a, 0.2);
  bg.fillCircle(width * 0.53, height * 0.64, Math.min(width, height) * 0.25);
  bg.fillStyle(0x75d9ff, 0.1);
  bg.fillCircle(width * 0.34, height * 0.34, Math.min(width, height) * 0.16);

  for (let i = 0; i < starCount; i += 1) {
    const x = (i * 149 + 31) % width;
    const y = (i * 89 + 59) % height;
    const size = i % 5 === 0 ? 3 : 2;
    const alpha = i % 7 === 0 ? 0.52 : 0.34;
    scene.add.rectangle(x, y, size, size, 0xdcf5ff, alpha).setDepth(1);
  }

  bg.fillStyle(0x030b16, 0.48);
  bg.fillRoundedRect(panelX + 8, panelY + 10, panelWidth, panelHeight, 26);
  bg.fillStyle(MENU_THEME.panelFill, 0.9);
  bg.fillRoundedRect(panelX, panelY, panelWidth, panelHeight, 26);
  bg.fillStyle(0xffffff, 0.06);
  bg.fillRoundedRect(panelX, panelY, panelWidth, 72, 20);
  bg.fillStyle(0xffffff, 0.04);
  bg.fillRect(panelX + 24, panelY + 72, panelWidth - 48, 2);

  const glowA = scene.add.circle(panelX + panelWidth * 0.22, panelY + panelHeight * 0.28, 96, 0x6bcfff, 0.13).setDepth(2);
  const glowB = scene.add
    .circle(panelX + panelWidth * 0.8, panelY + panelHeight * 0.72, 112, 0x68ffd1, 0.1)
    .setDepth(2);
  scene.tweens.add({
    targets: [glowA, glowB],
    alpha: { from: 0.06, to: 0.22 },
    scaleX: { from: 0.93, to: 1.08 },
    scaleY: { from: 0.93, to: 1.08 },
    duration: 1700,
    yoyo: true,
    repeat: -1,
    ease: "Sine.InOut"
  });

  return { centerX, centerY, panelX, panelY, panelWidth, panelHeight };
}

type HeaderOptions = {
  x: number;
  y: number;
  title: string;
  subtitle?: string;
  titleSize?: number;
  subtitleSize?: number;
};

export function createMenuHeader(
  scene: Phaser.Scene,
  { x, y, title, subtitle, titleSize = 58, subtitleSize = 26 }: HeaderOptions
): { titleText: Phaser.GameObjects.Text; subtitleText?: Phaser.GameObjects.Text } {
  const titleText = scene.add
    .text(x, y, title, {
      fontSize: `${titleSize}px`,
      color: MENU_THEME.titleColor,
      fontFamily: MENU_THEME.fontFamily,
      stroke: MENU_THEME.titleShadow,
      strokeThickness: 6
    })
    .setOrigin(0.5)
    .setResolution(2)
    .setDepth(6);

  if (!subtitle) {
    return { titleText };
  }

  const subtitleText = scene.add
    .text(x, y + 58, subtitle, {
      fontSize: `${subtitleSize}px`,
      color: MENU_THEME.textColor,
      fontFamily: MENU_THEME.fontFamily,
      align: "center"
    })
    .setOrigin(0.5)
    .setResolution(2)
    .setDepth(6);

  return { titleText, subtitleText };
}

export function createMenuFooter(scene: Phaser.Scene, text: string, y: number): Phaser.GameObjects.Text {
  const centerX = scene.scale.width / 2;
  scene.add.rectangle(centerX, y, scene.scale.width - 120, 44, MENU_THEME.footerFill, 0.72).setDepth(5);
  return scene.add
    .text(centerX, y, text, {
      fontSize: "20px",
      color: MENU_THEME.activeText,
      fontFamily: MENU_THEME.fontFamily,
      align: "center"
    })
    .setOrigin(0.5)
    .setResolution(2)
    .setDepth(6);
}
