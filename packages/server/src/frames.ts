import { decodeFlags, lampFlags, sessionStateName } from "./flags.js";
import { EMPTY_NOTE, type RaceNote } from "./race-memory.js";
import { tireLetter } from "./tire.js";
import type { CarSample, Tick } from "./tick.js";
import type { DriverSnapshot, FlagsFrame, SessionSnapshot, StandingRow, StandingsFrame, TelemetryFrame } from "./types.js";

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

export function buildFlags(tick: Tick): FlagsFrame {
  return { flags: lampFlags(tick.sessionState, tick.sessionFlags) };
}

interface Draft {
  car: CarSample;
  driver: DriverSnapshot | undefined;
  gap: number | null;
}

/** Cars the standings tower shows. Pace car, spectators, and empty slots stay out. */
export function standingCars(tick: Tick, session: SessionSnapshot | null): CarSample[] {
  const cars: CarSample[] = [];
  for (const car of tick.cars) {
    if (car.position <= 0 || car.trackSurface === NOT_IN_WORLD) {
      continue;
    }
    const driver = session?.drivers[String(car.carIdx)];
    if (driver?.paceCar || driver?.spectator) {
      continue;
    }
    cars.push(car);
  }
  return cars;
}

export function buildStandings(
  tick: Tick,
  session: SessionSnapshot | null,
  note: RaceNote = EMPTY_NOTE,
  liveClassPosition: ReadonlyMap<number, number> | null = null,
): StandingsFrame {
  const drafts: Draft[] = standingCars(tick, session).map((car) => ({
    car,
    driver: session?.drivers[String(car.carIdx)],
    gap: gapToPlayer(car.estTimeSec, tick.playerEstTimeSec),
  }));

  const groups = new Map<number, Draft[]>();
  for (const draft of drafts) {
    const classId = draft.driver?.classId ?? 0;
    const list = groups.get(classId) ?? [];
    list.push(draft);
    groups.set(classId, list);
  }

  const rows: StandingRow[] = [];
  for (const list of groups.values()) {
    list.sort(byClass(liveClassPosition));
    const leader = list[0]?.car;
    for (let index = 0; index < list.length; index += 1) {
      const draft = list[index];
      if (!draft) {
        continue;
      }
      const ahead = index > 0 ? list[index - 1] : undefined;
      const classPosition = liveClassPosition?.get(draft.car.carIdx) ?? draft.car.classPosition;
      rows.push(toRow(tick, session, note, draft, ahead?.gap ?? null, index === 0, leader, classPosition));
    }
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

function toRow(
  tick: Tick,
  session: SessionSnapshot | null,
  note: RaceNote,
  draft: Draft,
  aheadGap: number | null,
  leader: boolean,
  classLeader: CarSample | undefined,
  classPosition: number,
): StandingRow {
  const { car, driver, gap } = draft;
  return {
    carIdx: car.carIdx,
    position: car.position,
    classPosition,
    classId: driver?.classId ?? 0,
    className: driver?.className ?? "",
    classColor: driver?.classColor ?? "#888888",
    carNumber: driver?.carNumber ?? "",
    driverName: driver?.name ?? "",
    teamName: driver?.teamName ?? "",
    tire: tireLetter(car.tireCompound, session?.tires ?? []),
    pitStops: note.pitStops.get(car.carIdx) ?? 0,
    startClassPosition: note.startClassPosition.get(car.carIdx) ?? 0,
    intervalSec: leader ? null : interval(aheadGap, gap),
    lapsDown: classLeader ? lapsDown(classLeader, car) : 0,
    lap: car.lap,
    lastLapSec: lapTime(car.lastLapSec),
    bestLapSec: lapTime(car.bestLapSec),
    gapToPlayerSec: gap,
    onPitRoad: car.onPitRoad,
    trackSurface: car.trackSurface,
    isPlayer: car.carIdx === tick.playerCarIdx,
  };
}

function byClass(live: ReadonlyMap<number, number> | null): (a: Draft, b: Draft) => number {
  return (a, b) => {
    const left = classKey(a, live);
    const right = classKey(b, live);
    return left - right || a.car.position - b.car.position || a.car.carIdx - b.car.carIdx;
  };
}

function classKey(draft: Draft, live: ReadonlyMap<number, number> | null): number {
  if (live) {
    const rank = live.get(draft.car.carIdx);
    if (rank !== undefined) {
      return rank;
    }
  }
  return draft.car.classPosition > 0 ? draft.car.classPosition : draft.car.position;
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

function interval(aheadGap: number | null, carGap: number | null): number | null {
  if (aheadGap === null || carGap === null) {
    return null;
  }
  const value = carGap - aheadGap;
  if (!Number.isFinite(value)) {
    return null;
  }
  return Math.round(value * 1000) / 1000;
}

function lapsDown(leader: CarSample, car: CarSample): number {
  let down = leader.lap - car.lap;
  if (car.lapDistPct > leader.lapDistPct) {
    down -= 1;
  }
  if (!Number.isFinite(down)) {
    return 0;
  }
  return Math.max(0, down);
}

function lapTime(value: number): number | null {
  if (!Number.isFinite(value) || value <= 0) {
    return null;
  }
  return value;
}
