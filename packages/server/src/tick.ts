import type { DisplayUnits } from "./types.js";

export interface CarSample {
  carIdx: number;
  position: number;
  classPosition: number;
  /** CarIdxLap, laps started. */
  lap: number;
  /** CarIdxLapCompleted. -1 when that slot was missing. */
  lapCompleted: number;
  lapDistPct: number;
  estTimeSec: number;
  lastLapSec: number;
  bestLapSec: number;
  onPitRoad: boolean;
  trackSurface: number;
  /** CarIdxTireCompound. -1 when the sim did not publish one. */
  tireCompound: number;
}

/** One consistent telemetry sample. Widget frames are derived from this. */
export interface Tick {
  sessionTick: number;
  /** SessionTime. Sector intervals are stamped with this clock. */
  sessionTimeSec: number;
  sessionNum: number;
  /** Telemetry SessionUniqueID. 0 before the sim publishes one. */
  uniqueId: number;
  /** WeekendInfo.SessionID of the YAML currently held. 0 before that read. */
  sessionId: number;
  /** WeekendInfo.SubSessionID of the YAML currently held. 0 before that read. */
  subSessionId: number;
  sessionState: number;
  sessionTimeRemainSec: number;
  sessionLapsRemain: number;
  sessionFlags: number;
  displayUnits: DisplayUnits;
  replay: boolean;
  playerCarIdx: number;
  playerEstTimeSec: number;
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
  lapLastSec: number;
  lapBestSec: number;
  onTrack: boolean;
  /** IsGarageVisible. True while the garage screen is open. */
  garageVisible: boolean;
  cars: CarSample[];
}
