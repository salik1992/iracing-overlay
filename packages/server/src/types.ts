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
  teamName: string;
  spectator: boolean;
  paceCar: boolean;
  ai: boolean;
}

/** One ResultsPositions entry. Class position is 0-based, as the sim publishes it. */
export interface SessionResult {
  carIdx: number;
  position: number;
  classPosition: number;
  lapsComplete: number;
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
  /** Compound names indexed by CarIdxTireCompound, when the session publishes them. */
  tires: string[];
  session: {
    number: number;
    name: string;
    type: string;
    laps: string;
    time: string;
    /** Official classification. Empty until the sim publishes ResultsPositions. */
    results: SessionResult[];
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
  /** Live class rank while a race is racing or checkered. Official class position otherwise. */
  classPosition: number;
  classId: number;
  className: string;
  classColor: string;
  carNumber: string;
  driverName: string;
  teamName: string;
  /** One letter, or empty when the compound is unknown. */
  tire: string;
  /** Stall entries observed since the server attached to this session. */
  pitStops: number;
  /**
   * iRacing's class position on the first racing tick.
   * The arrow compares the row's class position with this.
   */
  startClassPosition: number;
  /** Gap to the class car ahead. Null for the class leader. */
  intervalSec: number | null;
  /** Whole laps behind the class leader, after the lap-distance correction. */
  lapsDown: number;
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

export interface FlagsFrame {
  flags: string[];
}

export interface GarageFrame {
  visible: boolean;
}

export type ServerMessage =
  | { type: "status"; phase: SourcePhase; simMode: string | null }
  | { type: "session"; version: number; session: SessionSnapshot }
  | { type: "telemetry"; tick: number; frame: TelemetryFrame }
  | { type: "standings"; tick: number; frame: StandingsFrame }
  | { type: "flags"; tick: number; frame: FlagsFrame }
  | { type: "garage"; tick: number; frame: GarageFrame }
  | { type: "error"; message: string };

export interface ClientHello {
  type: "hello";
  widgetId: string;
}

export interface WidgetServe {
  id: "telemetry" | "standings" | "digiflag" | "garage";
  route: string;
  hz: number;
  session: boolean;
  staticDir: string;
}
