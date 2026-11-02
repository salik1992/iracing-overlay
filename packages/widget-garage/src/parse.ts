import { asRecord, parseRecord } from "@salik1992/iracing-overlay-shared/json";

export type Incoming = { type: "garage"; visible: boolean };

export function parseMessage(text: string): Incoming | null {
  const record = parseRecord(text);
  if (!record || record.type !== "garage") {
    return null;
  }
  const frame = asRecord(record.frame);
  if (!frame || typeof frame.visible !== "boolean") {
    return null;
  }
  return { type: "garage", visible: frame.visible };
}
