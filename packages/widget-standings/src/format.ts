import type { StandingWire } from "./types.js";

const GARAGE = -1;
const PIT_STALL = 1;

/** Pit road, a car stopped in its stall, or the garage. */
export function inPitLane(onPitRoad: boolean, trackSurface: number): boolean {
  return onPitRoad || trackSurface === PIT_STALL || trackSurface === GARAGE;
}

export function isRace(type: string): boolean {
  const text = type.trim().toLowerCase();
  return text === "race" || text.endsWith(" race");
}

export function formatLap(sec: number): string {
  const totalMs = Math.round(sec * 1000);
  const minutes = Math.floor(totalMs / 60000);
  const seconds = Math.floor((totalMs % 60000) / 1000);
  const millis = totalMs % 1000;
  return `${minutes}:${String(seconds).padStart(2, "0")}.${String(millis).padStart(3, "0")}`;
}

export function raceGap(row: StandingWire, leader: boolean): string {
  const down = Math.floor(row.lapsDown);
  if (down >= 1) {
    return `+${down}L`;
  }
  if (leader || row.intervalSec === null) {
    return "";
  }
  return Math.abs(row.intervalSec).toFixed(3);
}

export function otherGap(row: StandingWire, best: { sec: number; carIdx: number } | null): string {
  if (row.bestLapSec === null || !best) {
    return "";
  }
  if (row.carIdx === best.carIdx) {
    return formatLap(row.bestLapSec);
  }
  const delta = Math.max(0, row.bestLapSec - best.sec);
  return `+${delta.toFixed(3)}`;
}

export function gainedPlaces(start: number, current: number): number {
  if (start <= 0 || current <= 0) {
    return 0;
  }
  return start - current;
}

