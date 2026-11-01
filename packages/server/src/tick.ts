import type { DisplayUnits } from "./types.js";

export interface CarSample {
  carIdx: number;
  position: number;
  classPosition: number;
  lap: number;
  lapDistPct: number;
  estTimeSec: number;
  lastLapSec: number;
  bestLapSec: number;
  onPitRoad: boolean;
  trackSurface: number;
}

/** One consistent telemetry sample. Widget frames are derived from this. */
export interface Tick {
  sessionTick: number;
  sessionNum: number;
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
  cars: CarSample[];
}
