import type { SessionFields, StandingWire, StandingsWire } from "./types.js";

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

export function formatRemain(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) {
    return "";
  }
  const total = Math.floor(sec);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function formatLap(sec: number): string {
  const totalMs = Math.round(sec * 1000);
  const minutes = Math.floor(totalMs / 60000);
  const seconds = Math.floor((totalMs % 60000) / 1000);
  const millis = totalMs % 1000;
  return `${minutes}:${String(seconds).padStart(2, "0")}.${String(millis).padStart(3, "0")}`;
}

export function headerMeta(session: SessionFields, frame: StandingsWire): string {
  const laps = lapLimit(session.laps);
  if (laps !== null) {
    const leader = frame.rows.find((row) => row.position === 1);
    // CarIdxLap is -1 while the field is still gridding.
    const current = Math.max(0, leader?.lap ?? 0);
    return `${current}/${laps}`;
  }
  if (!timedSession(session.time)) {
    return "";
  }
  return formatRemain(frame.sessionTimeRemainSec);
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

function lapLimit(laps: string): number | null {
  const text = laps.trim();
  if (!/^\d+$/.test(text)) {
    return null;
  }
  const value = Number(text);
  return value > 0 ? value : null;
}

function timedSession(time: string): boolean {
  const match = /^\s*(\d+(?:\.\d+)?)\s*sec\s*$/i.exec(time);
  if (!match?.[1]) {
    return false;
  }
  const value = Number(match[1]);
  return Number.isFinite(value) && value > 0;
}
