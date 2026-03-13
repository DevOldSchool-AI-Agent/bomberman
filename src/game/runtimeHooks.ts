import { parseReplay } from "./replay";
import type { GameSession } from "./session";

export function installRuntimeHooks(session: GameSession): void {
  const runtimeWindow = window as Window & {
    render_game_to_text?: () => string;
    advanceTime?: (ms: number) => void;
    export_replay_json?: () => string;
    import_replay_json?: (payload: string) => boolean;
  };

  runtimeWindow.render_game_to_text = () => {
    return session.runtimeBridge?.getTextState() ?? JSON.stringify({ mode: "no-active-match" });
  };

  runtimeWindow.advanceTime = (ms: number) => {
    session.runtimeBridge?.advanceTime(ms);
  };

  runtimeWindow.export_replay_json = () => {
    return session.runtimeBridge?.exportReplay() ?? "";
  };

  runtimeWindow.import_replay_json = (payload: string) => {
    if (session.runtimeBridge) {
      return session.runtimeBridge.importReplay(payload);
    }
    const replay = parseReplay(payload);
    if (!replay) {
      return false;
    }
    session.pendingReplay = replay;
    return true;
  };
}
