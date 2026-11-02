export interface SessionFields {
  type: string;
  laps: string;
  time: string;
  teamRacing: boolean;
}

export interface StandingWire {
  carIdx: number;
  position: number;
  classPosition: number;
  classId: number;
  className: string;
  classColor: string;
  carNumber: string;
  driverName: string;
  lap: number;
  bestLapSec: number | null;
  teamName: string;
  tire: string;
  pitStops: number;
  startClassPosition: number;
  intervalSec: number | null;
  lapsDown: number;
  onPitRoad: boolean;
  trackSurface: number;
  isPlayer: boolean;
}

export interface StandingsWire {
  sessionTimeRemainSec: number;
  rows: StandingWire[];
}
