import Phaser from "phaser";
import { probeFinalThemeManifest, queueFinalThemeLoads, resolveThemeAvailability } from "../../content/assetManifest";
import { SCENE_KEYS } from "../sceneKeys";

export class BootScene extends Phaser.Scene {
  private infoText?: Phaser.GameObjects.Text;

  constructor() {
    super(SCENE_KEYS.boot);
  }

  public create(): void {
    this.infoText = this.add
      .text(this.scale.width / 2, this.scale.height / 2, "Loading assets...", {
        color: "#f4e8c0",
        fontSize: "26px",
        fontFamily: "Verdana"
      })
      .setOrigin(0.5);

    void this.loadExternalThemeAssets();
  }

  private async loadExternalThemeAssets(): Promise<void> {
    const probe = await probeFinalThemeManifest();
    const { manifest, issues } = probe;
    const filesQueued = manifest.spritesheets.length + manifest.audio.length;

    if (issues.length > 0) {
      console.warn("Skipped invalid external assets during startup validation", { issues });
    }

    if (filesQueued > 0) {
      queueFinalThemeLoads(this, manifest);
      this.load.once(Phaser.Loader.Events.COMPLETE, () => this.finishBoot());
      this.load.start();
      return;
    }

    this.finishBoot();
  }

  private finishBoot(): void {
    const themeAvailability = resolveThemeAvailability(this);
    this.registry.set("themeAvailability", themeAvailability);

    if (!themeAvailability.hasExternalVisualTheme) {
      console.warn("External visual theme incomplete, using generated retro sprites", {
        missingVisualKeys: themeAvailability.missingVisualKeys
      });
    }

    if (!themeAvailability.hasExternalSfxTheme) {
      console.warn("External SFX theme incomplete, using synth fallback", {
        missingAudioKeys: themeAvailability.missingAudioKeys
      });
    }

    this.infoText?.destroy();
    this.scene.start(SCENE_KEYS.title);
  }
}
