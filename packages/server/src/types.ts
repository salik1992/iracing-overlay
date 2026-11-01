/**
 * Wire types for the overlay protocol.
 * These move to @salik1992/iracing-overlay-shared when that package exists.
 */

export type SourcePhase = "idle" | "live" | "replay";

export type DisplayUnits = 0 | 1;

export interface SourceStatus {
  phase: SourcePhase;
  simMode: string | null;
}

export interface DriverSnapshot {
  carIdx: number;
  name: string;
  carNumber: string;
  carPath: string;
  classId: number;
  className: string;
  classColor: string;
  iRating: number;
  license: string;
  spectator: boolean;
  paceCar: boolean;
  ai: boolean;
}

export interface SessionSnapshot {
  weekend: {
    trackDisplayName: string;
    trackConfigName: string;
    trackLengthMeters: number;
    seriesId: number;
    eventType: string;
    simMode: string;
    teamRacing: boolean;
    official: boolean;
  };
  player: {
    carIdx: number;
    carNumber: string;
    driverName: string;
    shiftLight: {
      firstRpm: number;
      shiftRpm: number;
      lastRpm: number;
      blinkRpm: number;
    };
    redlineRpm: number;
    idleRpm: number;
    maxFuelLiters: number;
    displayUnits: DisplayUnits;
  };
  /** Keyed by car index. JSON object keys arrive as strings. */
  drivers: Record<string, DriverSnapshot>;
  session: {
    number: number;
    name: string;
    type: string;
    laps: string;
    time: string;
  };
}

export interface TelemetryFrame {
  speedMps: number;
  rpm: number;
  gear: number;
  throttle: number;
  brake: number;
  clutch: number;
  steeringWheelAngleRad: number;
  steeringWheelAngleMaxRad: number;
  lap: number;
  lapCurrentSec: number;
  lapLastSec: number | null;
  lapBestSec: number | null;
  onTrack: boolean;
}

export type SessionStateName =
  | "invalid"
  | "getInCar"
  | "warmup"
  | "paradeLaps"
  | "racing"
  | "checkered"
  | "coolDown";

export interface StandingRow {
  carIdx: number;
  position: number;
  classPosition: number;
  classId: number;
  className: string;
  classColor: string;
  carNumber: string;
  driverName: string;
  lap: number;
  lastLapSec: number | null;
  bestLapSec: number | null;
  /** Positive means the car is behind the player. Negative means ahead. */
  gapToPlayerSec: number | null;
  onPitRoad: boolean;
  trackSurface: number;
  isPlayer: boolean;
}

export interface StandingsFrame {
  sessionState: SessionStateName;
  sessionTimeRemainSec: number;
  sessionLapsRemain: number;
  flags: string[];
  rows: StandingRow[];
}

export type ServerMessage =
  | { type: "status"; phase: SourcePhase; simMode: string | null }
  | { type: "session"; version: number; session: SessionSnapshot }
  | { type: "telemetry"; tick: number; frame: TelemetryFrame }
  | { type: "standings"; tick: number; frame: StandingsFrame }
  | { type: "error"; message: string };

export interface ClientHello {
  type: "hello";
  widgetId: string;
}

export interface WidgetServe {
  id: "telemetry" | "standings";
  route: string;
  hz: number;
  session: boolean;
  staticDir: string;
}
