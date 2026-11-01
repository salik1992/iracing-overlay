import type { DisplayUnits } from "./format.js";

export type Phase = "idle" | "live" | "replay";

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
  if (record.type === "telemetry") {
    return parseTelemetry(record.frame);
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
  const player = (session as Record<string, unknown>).player;
  if (!player || typeof player !== "object") {
    return null;
  }
  const units = (player as Record<string, unknown>).displayUnits;
  if (units !== 0 && units !== 1) {
    return null;
  }
  return { type: "session", displayUnits: units };
}

function parseTelemetry(frame: unknown): Incoming | null {
  if (!frame || typeof frame !== "object") {
    return null;
  }
  const record = frame as Record<string, unknown>;
  const speedMps = finite(record.speedMps);
  const gear = finite(record.gear);
  const throttle = finite(record.throttle);
  const brake = finite(record.brake);
  const clutch = finite(record.clutch);
  const steeringWheelAngleRad = finite(record.steeringWheelAngleRad);
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

function finite(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
