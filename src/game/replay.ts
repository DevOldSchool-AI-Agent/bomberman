import type { InputFrame } from "../simulation";
import type { ReplayPayload } from "./session";

function cloneInputFrame(frame: InputFrame): InputFrame {
  const intents: InputFrame["intents"] = {};
  for (const [playerId, intent] of Object.entries(frame.intents)) {
    const id = Number(playerId);
    intents[id] = {
      moveX: intent.moveX,
      moveY: intent.moveY,
      placeBomb: intent.placeBomb
    };
  }
  return { intents };
}

function isInputFrame(value: unknown): value is InputFrame {
  if (!value || typeof value !== "object") {
    return false;
  }
  const maybeFrame = value as { intents?: unknown };
  if (!maybeFrame.intents || typeof maybeFrame.intents !== "object") {
    return false;
  }
  return true;
}

export function serializeReplay(payload: ReplayPayload): string {
  return JSON.stringify(payload);
}

export function parseReplay(raw: string): ReplayPayload | null {
  try {
    const parsed = JSON.parse(raw) as Partial<ReplayPayload> | null;
    if (!parsed || parsed.version !== 1) {
      return null;
    }
    if (
      typeof parsed.seed !== "number" ||
      typeof parsed.mapIndex !== "number" ||
      typeof parsed.durationSeconds !== "number" ||
      (parsed.botDifficulty !== "easy" && parsed.botDifficulty !== "normal" && parsed.botDifficulty !== "hard") ||
      !Array.isArray(parsed.lobbySlots) ||
      !Array.isArray(parsed.frames)
    ) {
      return null;
    }

    const frames = parsed.frames.filter((frame): frame is InputFrame => isInputFrame(frame)).map(cloneInputFrame);
    if (frames.length !== parsed.frames.length) {
      return null;
    }

    return {
      version: 1,
      seed: parsed.seed,
      mapIndex: parsed.mapIndex,
      durationSeconds: parsed.durationSeconds,
      botDifficulty: parsed.botDifficulty,
      lobbySlots: parsed.lobbySlots.map((slot, index) => ({
        id: typeof slot.id === "number" ? slot.id : index + 1,
        name: typeof slot.name === "string" ? slot.name : `P${index + 1}`,
        controller: slot.controller === "bot" ? "bot" : "human",
        color: typeof slot.color === "number" ? slot.color : 0xffffff
      })),
      frames
    };
  } catch {
    return null;
  }
}

export function cloneReplayPayload(payload: ReplayPayload): ReplayPayload {
  return {
    ...payload,
    lobbySlots: payload.lobbySlots.map((slot) => ({ ...slot })),
    frames: payload.frames.map(cloneInputFrame)
  };
}

export function cloneReplayFrames(frames: InputFrame[]): InputFrame[] {
  return frames.map(cloneInputFrame);
}
