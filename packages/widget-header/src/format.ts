import type { HeaderSession, HeaderWire } from "./types.js";

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

/** Air, track, and wind. Temperatures and speed are rounded. Direction is degrees. */
export function formatWeather(frame: HeaderWire): string {
  return `AT: ${celsius(frame.airTempC)}, TT: ${celsius(frame.trackTempC)}, WIND: ${metersPerSec(frame.windVelMps)} @ ${degrees(frame.windDirRad)}`;
}

/**
 * Lap counter, remaining clock, or both.
 * A single published limit is shown on its own. When the session sets both,
 * the race best lap estimates which one the leader reaches first.
 */
export function sessionCounter(session: HeaderSession, frame: HeaderWire): string {
  const laps = lapLimit(session.laps);
  const timed = timedSession(session.time);
  if (laps !== null && timed) {
    return bothLimits(laps, frame);
  }
  if (laps !== null) {
    return lapText(laps, frame, true);
  }
  if (!timed) {
    return "";
  }
  return formatRemain(frame.sessionTimeRemainSec);
}

function celsius(value: number | null): string {
  return finite(value) ? `${Math.round(value)}°C` : "—°C";
}

function metersPerSec(value: number | null): string {
  return finite(value) ? `${Math.round(value)}m/s` : "—m/s";
}

function degrees(radians: number | null): string {
  if (!finite(radians)) {
    return "—°";
  }
  const turned = Math.round((radians * 180) / Math.PI);
  return `${((turned % 360) + 360) % 360}°`;
}

function finite(value: number | null): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** iRacing's IRSDK_UNLIMITED_LAPS. A count at or above this is not a lap limit. */
const UNLIMITED_LAPS = 32767;

function bothLimits(laps: number, frame: HeaderWire): string {
  const clock = formatRemain(frame.sessionTimeRemainSec);
  const choice = chooseLimit(laps, frame);
  if (choice === "time") {
    return clock === "" ? "0:00" : clock;
  }
  // Climbing out sets the lap to -1 once the flag has fallen.
  const lapUnusable = finishedSession(frame.sessionState) && frame.leaderLap < 0;
  const lapsShown = lapText(laps, frame, choice === "laps" || lapUnusable);
  if (choice === "laps" || clock === "") {
    return lapsShown;
  }
  return `${lapsShown} (${clock})`;
}

/**
 * Time is binding when the remaining laps still outlast the clock by the slack,
 * even at the race's best lap. Laps are binding when the clock outlasts that
 * pace by the same slack. The slack is one best lap or 10% of the projection,
 * whichever is larger, so a lap of traffic does not flip the readout.
 */
function chooseLimit(laps: number, frame: HeaderWire): "laps" | "time" | "both" {
  if (finishedSession(frame.sessionState)) {
    return finishedChoice(laps, frame);
  }
  const current = Math.min(laps, Math.max(0, frame.leaderLap));
  const lapsLeft = laps - current;
  if (lapsLeft <= 0) {
    return "laps";
  }
  const remain = frame.sessionTimeRemainSec;
  if (!Number.isFinite(remain) || remain <= 0) {
    return "time";
  }
  const best = frame.bestLapSec;
  if (best === null || !(best > 0)) {
    return "both";
  }
  const projected = lapsLeft * best;
  const slack = Math.max(best, projected * 0.1);
  if (projected - remain >= slack) {
    return "time";
  }
  if (remain - projected >= slack) {
    return "laps";
  }
  return "both";
}

/**
 * After the flag, a leader still short of the laps with under one best lap
 * of clock left was ended by the clock. A clock with more than a best lap
 * left, and no usable lap count, was ended by the laps.
 */
function finishedChoice(laps: number, frame: HeaderWire): "laps" | "time" | "both" {
  const remain = frame.sessionTimeRemainSec;
  const clockGone = !Number.isFinite(remain) || remain <= 0;
  const known = frame.leaderLap >= 0;
  const lapsDone = frame.leaderLap >= laps;
  const insideLastLap = frame.bestLapSec !== null && frame.bestLapSec > 0 && remain <= frame.bestLapSec;
  if (known && !lapsDone) {
    return clockGone || insideLastLap ? "time" : "both";
  }
  if (clockGone) {
    return lapsDone ? "both" : "time";
  }
  if (insideLastLap) {
    return "both";
  }
  return "laps";
}

function lapText(laps: number, frame: HeaderWire, completed: boolean): string {
  // The finish line starts an extra lap, and climbing out sets the lap to -1.
  if (completed && finishedSession(frame.sessionState)) {
    return `${laps}/${laps}`;
  }
  // CarIdxLap is -1 while the field is still gridding.
  const current = Math.min(laps, Math.max(0, frame.leaderLap));
  return `${current}/${laps}`;
}

function finishedSession(state: string | undefined): boolean {
  return state === "checkered" || state === "coolDown";
}

function lapLimit(laps: string): number | null {
  const text = laps.trim();
  if (!/^\d+$/.test(text)) {
    return null;
  }
  const value = Number(text);
  if (!Number.isInteger(value) || value <= 0 || value >= UNLIMITED_LAPS) {
    return null;
  }
  return value;
}

function timedSession(time: string): boolean {
  const match = /^\s*(\d+(?:\.\d+)?)\s*sec\s*$/i.exec(time);
  if (!match?.[1]) {
    return false;
  }
  const value = Number(match[1]);
  return Number.isFinite(value) && value > 0;
}
