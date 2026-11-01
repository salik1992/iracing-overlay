import type { SessionFields, StandingWire, StandingsWire } from "./types.js";

export type Phase = "idle" | "live" | "replay";

export type Incoming =
  | { type: "status"; phase: Phase }
  | { type: "session"; session: SessionFields }
  | { type: "standings"; frame: StandingsWire };

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
  if (record.type === "session") {
    return parseSession(record.session);
  }
  if (record.type === "standings") {
    return parseStandings(record.frame);
  }
  return null;
}

function parseStatus(phase: unknown): Incoming | null {
  if (phase === "idle" || phase === "live" || phase === "replay") {
    return { type: "status", phase };
  }
  return null;
}

function parseSession(session: unknown): Incoming | null {
  if (!session || typeof session !== "object") {
    return null;
  }
  const record = session as Record<string, unknown>;
  const current = asRecord(record.session);
  const weekend = asRecord(record.weekend);
  if (!current || !weekend) {
    return null;
  }
  return {
    type: "session",
    session: {
      type: asText(current.type),
      laps: asText(current.laps),
      time: asText(current.time),
      teamRacing: weekend.teamRacing === true,
    },
  };
}

function parseStandings(frame: unknown): Incoming | null {
  const record = asRecord(frame);
  if (!record || !Array.isArray(record.rows)) {
    return null;
  }
  const rows: StandingWire[] = [];
  for (const entry of record.rows) {
    const row = asRecord(entry);
    if (!row) {
      continue;
    }
    rows.push({
      carIdx: asNum(row.carIdx, 0),
      position: asNum(row.position, 0),
      classPosition: asNum(row.classPosition, 0),
      classId: asNum(row.classId, 0),
      className: asText(row.className),
      classColor: asText(row.classColor),
      carNumber: asText(row.carNumber),
      driverName: asText(row.driverName),
      lap: asNum(row.lap, 0),
      bestLapSec: asNumOrNull(row.bestLapSec),
      teamName: asText(row.teamName),
      tire: asText(row.tire),
      pitStops: asNum(row.pitStops, 0),
      startClassPosition: asNum(row.startClassPosition, 0),
      intervalSec: asNumOrNull(row.intervalSec),
      lapsDown: asNum(row.lapsDown, 0),
      isPlayer: row.isPlayer === true,
    });
  }
  return {
    type: "standings",
    frame: {
      sessionTimeRemainSec: asNum(record.sessionTimeRemainSec, 0),
      rows,
    },
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function asText(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asNum(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function asNumOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
