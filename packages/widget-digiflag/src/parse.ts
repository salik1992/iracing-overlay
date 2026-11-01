export type Phase = "idle" | "live" | "replay";

export type Incoming =
  | { type: "status"; phase: Phase }
  | { type: "flags"; flags: string[] };

export function parseMessage(text: string): Incoming | null {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  if (!value || typeof value !== "object") {
    return null;
  }
  const record = value as Record<string, unknown>;
  if (record.type === "status") {
    return parseStatus(record.phase);
  }
  if (record.type === "flags") {
    return parseFlags(record.frame);
  }
  return null;
}

function parseStatus(phase: unknown): Incoming | null {
  if (phase === "idle" || phase === "live" || phase === "replay") {
    return { type: "status", phase };
  }
  return null;
}

function parseFlags(frame: unknown): Incoming | null {
  if (!frame || typeof frame !== "object") {
    return null;
  }
  const flags = (frame as Record<string, unknown>).flags;
  if (!Array.isArray(flags) || flags.some((item) => typeof item !== "string")) {
    return null;
  }
  return { type: "flags", flags };
}
