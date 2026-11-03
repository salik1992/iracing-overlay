import { decodeFlags, lampFlags, sessionStateName } from "./flags.js";
import { hasLeftCar, type PostedLap } from "./posted-laps.js";
import { EMPTY_NOTE, type RaceNote } from "./race-memory.js";
import { tireLetter } from "./tire.js";
import type { CarSample, Tick } from "./tick.js";
import type { DriverSnapshot, FlagsFrame, GarageFrame, SessionSnapshot, StandingRow, StandingsFrame, TelemetryFrame } from "./types.js";

const NOT_IN_WORLD = -1;
const STATE_GET_IN_CAR = 1;
const STATE_WARMUP = 2;
const STATE_PARADE = 3;
const STATE_RACING = 4;
const STATE_CHECKERED = 5;

interface GridPlace {
  position: number;
  classPosition: number;
}

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

export function buildGarage(tick: Tick): GarageFrame {
  return { visible: tick.garageVisible };
}

interface Draft {
  car: CarSample;
  driver: DriverSnapshot | undefined;
  gap: number | null;
  /** Live best lap, or the lap kept after the driver got out. Null when none was posted. */
  bestLapSec: number | null;
}

/** Cars the standings tower shows. Pace car, spectators, and empty slots stay out. */
export function standingCars(tick: Tick, session: SessionSnapshot | null): CarSample[] {
  const cars: CarSample[] = [];
  for (const car of tick.cars) {
    const driver = session?.drivers[String(car.carIdx)];
    if (driver?.paceCar || driver?.spectator) {
      continue;
    }
    // A joined car can sit at position 0 with no lap yet. An empty slot has neither.
    if (!driver && (car.position <= 0 || car.trackSurface === NOT_IN_WORLD)) {
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
  postedLaps: ReadonlyMap<number, PostedLap> | null = null,
): StandingsFrame {
  const grid = qualifyingGrid(tick, session);
  const byPlace = grid !== null || liveClassPosition !== null || raceUnderway(tick, session);
  const drafts: Draft[] = standingCars(tick, session).map((car) => ({
    car,
    driver: session?.drivers[String(car.carIdx)],
    gap: gapToPlayer(car.estTimeSec, tick.playerEstTimeSec),
    bestLapSec: keptBest(car, !byPlace, postedLaps),
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
    list.sort(byPlace ? byClass(liveClassPosition, grid, byPlace) : byBest);
    const leader = list[0]?.car;
    let timed = 0;
    for (let index = 0; index < list.length; index += 1) {
      const draft = list[index];
      if (!draft) {
        continue;
      }
      const ahead = index > 0 ? list[index - 1] : undefined;
      const place = grid?.get(draft.car.carIdx);
      let classPosition = place?.classPosition ?? liveClassPosition?.get(draft.car.carIdx) ?? draft.car.classPosition;
      let position = place?.position ?? draft.car.position;
      if (!byPlace && draft.bestLapSec !== null) {
        timed += 1;
        classPosition = timed;
        if (position <= 0) {
          position = postedLaps?.get(draft.car.carIdx)?.position ?? position;
        }
      }
      rows.push(toRow(tick, session, note, draft, ahead?.car ?? null, index === 0, leader, classPosition, position));
    }
  }
  if (grid) {
    rows.sort((a, b) => gridRank(grid, a.carIdx) - gridRank(grid, b.carIdx) || a.carIdx - b.carIdx);
  } else if (byPlace) {
    rows.sort((a, b) => placeRank(a.position) - placeRank(b.position) || a.carIdx - b.carIdx);
  } else {
    rows.sort((a, b) => postedRank(a.bestLapSec) - postedRank(b.bestLapSec) || a.position - b.position || a.carIdx - b.carIdx);
  }
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
  ahead: CarSample | null,
  leader: boolean,
  classLeader: CarSample | undefined,
  classPosition: number,
  position: number,
): StandingRow {
  const { car, driver, gap } = draft;
  return {
    carIdx: car.carIdx,
    position,
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
    intervalSec: leader || ahead === null ? null : interval(ahead, car),
    lapsDown: classLeader ? lapsDown(classLeader, car) : 0,
    lap: car.lap,
    lastLapSec: lapTime(car.lastLapSec),
    bestLapSec: draft.bestLapSec,
    gapToPlayerSec: gap,
    onPitRoad: car.onPitRoad,
    trackSurface: car.trackSurface,
    isPlayer: car.carIdx === tick.playerCarIdx,
  };
}

function byClass(
  live: ReadonlyMap<number, number> | null,
  grid: ReadonlyMap<number, GridPlace> | null,
  byPlace: boolean,
): (a: Draft, b: Draft) => number {
  return (a, b) => {
    if (grid) {
      return (
        gridClass(grid, a.car.carIdx) - gridClass(grid, b.car.carIdx) ||
        gridRank(grid, a.car.carIdx) - gridRank(grid, b.car.carIdx) ||
        a.car.carIdx - b.car.carIdx
      );
    }
    const place = classKey(a, live) - classKey(b, live) || a.car.position - b.car.position || a.car.carIdx - b.car.carIdx;
    if (byPlace) {
      return place;
    }
    return postedRank(a.car.bestLapSec) - postedRank(b.car.bestLapSec) || place;
  };
}

/** Racing and checkered. An invalidated lap has no best time and must not move the car. */
function raceUnderway(tick: Tick, session: SessionSnapshot | null): boolean {
  if (session === null || !isRaceSession(session.session.type)) {
    return false;
  }
  return tick.sessionState === STATE_RACING || tick.sessionState === STATE_CHECKERED;
}

/**
 * QualifyResultsInfo places, shown starting at 1.
 * Used only before the green of a race, and only when the list has cars.
 * A posted lap does not reorder this grid. Cars missing from it sort after.
 */
function qualifyingGrid(tick: Tick, session: SessionSnapshot | null): ReadonlyMap<number, GridPlace> | null {
  if (session === null || !isRaceSession(session.session.type) || session.grid.length === 0) {
    return null;
  }
  const state = tick.sessionState;
  if (state !== STATE_GET_IN_CAR && state !== STATE_WARMUP && state !== STATE_PARADE) {
    return null;
  }
  const places = new Map<number, GridPlace>();
  for (const result of session.grid) {
    places.set(result.carIdx, {
      position: result.position + 1,
      classPosition: result.classPosition + 1,
    });
  }
  return places;
}

function gridClass(grid: ReadonlyMap<number, GridPlace>, carIdx: number): number {
  return grid.get(carIdx)?.classPosition ?? Number.MAX_SAFE_INTEGER;
}

function gridRank(grid: ReadonlyMap<number, GridPlace>, carIdx: number): number {
  return grid.get(carIdx)?.position ?? Number.MAX_SAFE_INTEGER;
}

function isRaceSession(type: string): boolean {
  const text = type.trim().toLowerCase();
  return text === "race" || text.endsWith(" race");
}

/**
 * Practice and qualifying order by the posted best lap.
 * The live value wins while the car is in the world. After the driver gets out,
 * the last lap recorded in the world stands, and the place is that time's rank.
 */
function keptBest(
  car: CarSample,
  keepTime: boolean,
  postedLaps: ReadonlyMap<number, PostedLap> | null,
): number | null {
  const live = lapTime(car.bestLapSec);
  if (!keepTime || live !== null || !hasLeftCar(car)) {
    return live;
  }
  const kept = postedLaps?.get(car.carIdx)?.bestLapSec;
  return kept !== undefined && Number.isFinite(kept) && kept > 0 ? kept : null;
}

function byBest(a: Draft, b: Draft): number {
  return byPostedTime(a.bestLapSec, b.bestLapSec)
    || placeRank(a.car.classPosition) - placeRank(b.car.classPosition)
    || placeRank(a.car.position) - placeRank(b.car.position)
    || a.car.carIdx - b.car.carIdx;
}

function byPostedTime(a: number | null, b: number | null): number {
  const rank = postedRank(a) - postedRank(b);
  if (rank !== 0 || a === null || b === null) {
    return rank;
  }
  return a - b;
}

/** Practice and qualifying: cars that have not posted a lap sort after cars that have. */
function postedRank(bestLapSec: number | null): number {
  return bestLapSec !== null && Number.isFinite(bestLapSec) && bestLapSec > 0 ? 0 : 1;
}

function placeRank(position: number): number {
  return position > 0 ? position : Number.MAX_SAFE_INTEGER;
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

/**
 * CarIdxEstTime restarts near a full lap when that car crosses the
 * start/finish line. Until the next car crosses, the raw difference
 * includes that lap. Adding the crossed car's last lap, or its best lap,
 * removes the jump when the cars are on different laps.
 */
function interval(ahead: CarSample, car: CarSample): number | null {
  if (!Number.isFinite(ahead.estTimeSec) || !Number.isFinite(car.estTimeSec)) {
    return null;
  }
  let value = car.estTimeSec - ahead.estTimeSec;
  const laps = ahead.lap - car.lap;
  if (laps !== 0) {
    const crossedLap = crossingLapSec(laps > 0 ? ahead : car) ?? crossingLapSec(laps > 0 ? car : ahead);
    if (crossedLap !== null) {
      const wrapped = value + laps * crossedLap;
      if (Math.abs(wrapped) < Math.abs(value)) {
        value = wrapped;
      }
    }
  }
  if (!Number.isFinite(value)) {
    return null;
  }
  return Math.round(value * 1000) / 1000;
}

function crossingLapSec(car: CarSample): number | null {
  if (Number.isFinite(car.lastLapSec) && car.lastLapSec > 0) {
    return car.lastLapSec;
  }
  if (Number.isFinite(car.bestLapSec) && car.bestLapSec > 0) {
    return car.bestLapSec;
  }
  return null;
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
