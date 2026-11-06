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

/** Lap counter or remaining session clock. Lap limit wins when the session publishes one. */
export function sessionCounter(session: HeaderSession, frame: HeaderWire): string {
  const laps = lapLimit(session.laps);
  if (laps !== null) {
    // The finish line starts an extra lap, and climbing out sets the lap to -1.
    if (finishedSession(frame.sessionState)) {
      return `${laps}/${laps}`;
    }
    // CarIdxLap is -1 while the field is still gridding.
    const current = Math.min(laps, Math.max(0, frame.leaderLap));
    return `${current}/${laps}`;
  }
  if (!timedSession(session.time)) {
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

function finishedSession(state: string | undefined): boolean {
  return state === "checkered" || state === "coolDown";
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
