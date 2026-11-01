import { asRecord, parseRecord, parseStatus, type Phase } from "@salik1992/iracing-overlay-shared/json";

export type Incoming =
  | { type: "status"; phase: Phase }
  | { type: "flags"; flags: string[] };

export function parseMessage(text: string): Incoming | null {
  const record = parseRecord(text);
  if (!record) {
    return null;
  }
  if (record.type === "status") {
    return parseStatus(record.phase);
  }
  if (record.type === "flags") {
    return parseFlags(record.frame);
  }
  return null;
}

function parseFlags(frame: unknown): Incoming | null {
  const record = asRecord(frame);
  const flags = record?.flags;
  if (!Array.isArray(flags) || flags.some((item) => typeof item !== "string")) {
    return null;
  }
  return { type: "flags", flags };
}
