import { asFinite, asFiniteOr, asRecord, asText, parseRecord, parseStatus, type Phase } from "@salik1992/iracing-overlay-shared/json";

import type { HeaderSession, HeaderWire } from "./types.js";

export type Incoming =
  | { type: "status"; phase: Phase }
  | { type: "session"; session: HeaderSession }
  | { type: "header"; frame: HeaderWire };

export function parseMessage(text: string): Incoming | null {
  const record = parseRecord(text);
  if (!record) {
    return null;
  }
  if (record.type === "status") {
    return parseStatus(record.phase);
  }
  if (record.type === "session") {
    return parseSession(record.session);
  }
  if (record.type === "header") {
    return parseHeader(record.frame);
  }
  return null;
}

function parseSession(session: unknown): Incoming | null {
  const record = asRecord(session);
  const current = record ? asRecord(record.session) : null;
  if (!current) {
    return null;
  }
  return {
    type: "session",
    session: {
      type: asText(current.type),
      laps: asText(current.laps),
      time: asText(current.time),
    },
  };
}

function parseHeader(frame: unknown): Incoming | null {
  const record = asRecord(frame);
  if (!record) {
    return null;
  }
  const flags = asFlagList(record.flags);
  if (!flags) {
    return null;
  }
  return {
    type: "header",
    frame: {
      sessionState: asText(record.sessionState),
      sessionTimeRemainSec: asFiniteOr(record.sessionTimeRemainSec, 0),
      leaderLap: asFiniteOr(record.leaderLap, 0),
      airTempC: asFinite(record.airTempC),
      trackTempC: asFinite(record.trackTempC),
      windVelMps: asFinite(record.windVelMps),
      windDirRad: asFinite(record.windDirRad),
      flags,
    },
  };
}

function asFlagList(value: unknown): string[] | null {
  if (value === undefined || value === null) {
    return [];
  }
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    return null;
  }
  return value;
}
