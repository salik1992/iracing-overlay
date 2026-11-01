import { decodeFlags, sessionStateName } from "./flags.js";
import type { Tick } from "./tick.js";
import type { SessionSnapshot, StandingRow, StandingsFrame, TelemetryFrame } from "./types.js";

const NOT_IN_WORLD = -1;

export function buildTelemetry(tick: Tick): TelemetryFrame {
  return {
    speedMps: tick.speedMps,
    rpm: tick.rpm,
    gear: tick.gear,
    throttle: tick.throttle,
    brake: tick.brake,
    clutch: tick.clutch,
    steeringWheelAngleRad: tick.steeringWheelAngleRad,
    steeringWheelAngleMaxRad: tick.steeringWheelAngleMaxRad,
    lap: tick.lap,
    lapCurrentSec: tick.lapCurrentSec,
    lapLastSec: lapTime(tick.lapLastSec),
    lapBestSec: lapTime(tick.lapBestSec),
    onTrack: tick.onTrack,
  };
}

export function buildStandings(tick: Tick, session: SessionSnapshot | null): StandingsFrame {
  const rows: StandingRow[] = [];
  for (const car of tick.cars) {
    if (car.position <= 0 || car.trackSurface === NOT_IN_WORLD) {
      continue;
    }
    const driver = session?.drivers[String(car.carIdx)];
    if (driver?.paceCar || driver?.spectator) {
      continue;
    }
    const gap = gapToPlayer(car.estTimeSec, tick.playerEstTimeSec);
    rows.push({
      carIdx: car.carIdx,
      position: car.position,
      classPosition: car.classPosition,
      classId: driver?.classId ?? 0,
      className: driver?.className ?? "",
      classColor: driver?.classColor ?? "#888888",
      carNumber: driver?.carNumber ?? "",
      driverName: driver?.name ?? "",
      lap: car.lap,
      lastLapSec: lapTime(car.lastLapSec),
      bestLapSec: lapTime(car.bestLapSec),
      gapToPlayerSec: gap,
      onPitRoad: car.onPitRoad,
      trackSurface: car.trackSurface,
      isPlayer: car.carIdx === tick.playerCarIdx,
    });
  }
  rows.sort((a, b) => a.position - b.position || a.carIdx - b.carIdx);
  return {
    sessionState: sessionStateName(tick.sessionState),
    sessionTimeRemainSec: tick.sessionTimeRemainSec,
    sessionLapsRemain: tick.sessionLapsRemain,
    flags: decodeFlags(tick.sessionFlags),
    rows,
  };
}

/**
 * CarIdxEstTime is the estimated time for that car to reach the player's
 * point on the racing line. A negative result means that car is ahead.
 */
function gapToPlayer(carEstSec: number, playerEstSec: number): number | null {
  if (!Number.isFinite(carEstSec) || !Number.isFinite(playerEstSec)) {
    return null;
  }
  return Math.round((carEstSec - playerEstSec) * 1000) / 1000;
}

function lapTime(value: number): number | null {
  if (!Number.isFinite(value) || value <= 0) {
    return null;
  }
  return value;
}
