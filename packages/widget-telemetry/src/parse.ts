import { asFinite, asRecord, parseRecord, parseStatus, type Phase } from "@salik1992/iracing-overlay-shared/json";

import type { DisplayUnits } from "./format.js";

export interface TelemetrySample {
  speedMps: number;
  gear: number;
  throttle: number;
  brake: number;
  clutch: number;
  steeringWheelAngleRad: number;
}

export type Incoming =
  | { type: "status"; phase: Phase }
  | { type: "session"; displayUnits: DisplayUnits }
  | { type: "telemetry"; frame: TelemetrySample };

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
  if (record.type === "telemetry") {
    return parseTelemetry(record.frame);
  }
  return null;
}

function parseSession(session: unknown): Incoming | null {
  const record = asRecord(session);
  const player = record ? asRecord(record.player) : null;
  if (!player) {
    return null;
  }
  const units = player.displayUnits;
  if (units !== 0 && units !== 1) {
    return null;
  }
  return { type: "session", displayUnits: units };
}

function parseTelemetry(frame: unknown): Incoming | null {
  const record = asRecord(frame);
  if (!record) {
    return null;
  }
  const speedMps = asFinite(record.speedMps);
  const gear = asFinite(record.gear);
  const throttle = asFinite(record.throttle);
  const brake = asFinite(record.brake);
  const clutch = asFinite(record.clutch);
  const steeringWheelAngleRad = asFinite(record.steeringWheelAngleRad);
  if (
    speedMps === null ||
    gear === null ||
    throttle === null ||
    brake === null ||
    clutch === null ||
    steeringWheelAngleRad === null
  ) {
    return null;
  }
  return {
    type: "telemetry",
    frame: { speedMps, gear, throttle, brake, clutch, steeringWheelAngleRad },
  };
}
