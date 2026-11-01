import { asFinite, asFiniteOr, asRecord, asText, parseRecord, parseStatus, type Phase } from "@salik1992/iracing-overlay-shared/json";

import type { SessionFields, StandingWire, StandingsWire } from "./types.js";

export type Incoming =
  | { type: "status"; phase: Phase }
  | { type: "session"; session: SessionFields }
  | { type: "standings"; frame: StandingsWire };

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
  if (record.type === "standings") {
    return parseStandings(record.frame);
  }
  return null;
}

function parseSession(session: unknown): Incoming | null {
  const record = asRecord(session);
  const current = record ? asRecord(record.session) : null;
  const weekend = record ? asRecord(record.weekend) : null;
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
      carIdx: asFiniteOr(row.carIdx, 0),
      position: asFiniteOr(row.position, 0),
      classPosition: asFiniteOr(row.classPosition, 0),
      classId: asFiniteOr(row.classId, 0),
      className: asText(row.className),
      classColor: asText(row.classColor),
      carNumber: asText(row.carNumber),
      driverName: asText(row.driverName),
      lap: asFiniteOr(row.lap, 0),
      bestLapSec: asFinite(row.bestLapSec),
      teamName: asText(row.teamName),
      tire: asText(row.tire),
      pitStops: asFiniteOr(row.pitStops, 0),
      startClassPosition: asFiniteOr(row.startClassPosition, 0),
      intervalSec: asFinite(row.intervalSec),
      lapsDown: asFiniteOr(row.lapsDown, 0),
      isPlayer: row.isPlayer === true,
    });
  }
  return {
    type: "standings",
    frame: {
      sessionTimeRemainSec: asFiniteOr(record.sessionTimeRemainSec, 0),
      rows,
    },
  };
}
