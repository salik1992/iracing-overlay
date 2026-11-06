import { decodeFlags, lampFlags, sessionStateName } from "./flags.js";
import { hasLeftCar, type PostedLap } from "./posted-laps.js";
import { EMPTY_NOTE, type RaceNote } from "./race-memory.js";
import type { CountedGap } from "./sector-gaps.js";
import { tireLetter } from "./tire.js";
import type { CarSample, Tick } from "./tick.js";
import type { DriverSnapshot, FlagsFrame, GarageFrame, SessionResult, SessionSnapshot, StandingRow, StandingsFrame, TelemetryFrame } from "./types.js";

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
  /** Best lap shown on the row. Null when this car has no positive time. */
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
  sectorGaps: ReadonlyMap<number, CountedGap> | null = null,
): StandingsFrame {
  const grid = qualifyingGrid(tick, session);
  const byPlace = grid !== null || liveClassPosition !== null || raceUnderway(tick, session);
  const results = sessionResults(session);
  const drafts: Draft[] = standingCars(tick, session).map((car) => ({
    car,
    driver: session?.drivers[String(car.carIdx)],
    gap: gapToPlayer(car.estTimeSec, tick.playerEstTimeSec),
    bestLapSec: keptBest(
      car,
      !byPlace,
      session !== null && !isRaceSession(session.session.type),
      postedLaps,
      postedTime(results.get(car.carIdx)?.fastestTimeSec),
    ),
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
          const latched = postedLaps?.get(draft.car.carIdx)?.position ?? 0;
          const official = results.get(draft.car.carIdx)?.position ?? 0;
          position = latched > 0 ? latched : official > 0 ? official : position;
        }
      }
      rows.push(toRow(tick, session, note, draft, ahead?.car ?? null, index === 0, classPosition, position, sectorGaps));
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
  classPosition: number,
  position: number,
  sectorGaps: ReadonlyMap<number, CountedGap> | null,
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
    intervalSec: frozenGap(leader, ahead?.carIdx, car.carIdx, sectorGaps),
    lapsDown: frozenLaps(ahead, car, sectorGaps),
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

/**
 * Car ahead of each competitor in race class order.
 * Null when this session is not showing a race order.
 * The sector interval is counted against that car.
 */
export function raceClassAhead(
  tick: Tick,
  session: SessionSnapshot | null,
  liveClassPosition: ReadonlyMap<number, number> | null,
): ReadonlyMap<number, number | null> | null {
  if (session === null || !isRaceSession(session.session.type)) {
    return null;
  }
  const grid = qualifyingGrid(tick, session);
  const byPlace = grid !== null || liveClassPosition !== null || raceUnderway(tick, session);
  if (!byPlace) {
    return null;
  }
  const groups = new Map<number, CarSample[]>();
  for (const car of standingCars(tick, session)) {
    const classId = session.drivers[String(car.carIdx)]?.classId ?? 0;
    const list = groups.get(classId) ?? [];
    list.push(car);
    groups.set(classId, list);
  }
  const ahead = new Map<number, number | null>();
  const compare = byClass(liveClassPosition, grid, true);
  for (const list of groups.values()) {
    const drafts = list.map((car) => ({ car, driver: undefined, gap: null, bestLapSec: null }));
    drafts.sort(compare);
    for (let index = 0; index < drafts.length; index += 1) {
      const draft = drafts[index];
      if (!draft) {
        continue;
      }
      const previous = index > 0 ? drafts[index - 1] : undefined;
      ahead.set(draft.car.carIdx, previous ? previous.car.carIdx : null);
    }
  }
  return ahead;
}

function isRaceSession(type: string): boolean {
  const text = type.trim().toLowerCase();
  return text === "race" || text.endsWith(" race");
}

/**
 * Practice and qualifying show ResultsPositions.FastestTime.
 * That is the lap iRacing's standings count. CarIdxBestLapTime also
 * moves for a lap those standings reject, such as an off-track or a slowdown.
 * A race that is not yet ordered by place still merges the live best with
 * the result. A race under way, the pre-green grid, and the checkered lock
 * use the live value only.
 */
function keptBest(
  car: CarSample,
  keepTime: boolean,
  officialOnly: boolean,
  postedLaps: ReadonlyMap<number, PostedLap> | null,
  sessionBest: number | null,
): number | null {
  const live = lapTime(car.bestLapSec);
  if (!keepTime) {
    return live;
  }
  if (officialOnly) {
    return sessionBest;
  }
  if (live !== null) {
    return sessionBest !== null ? Math.min(live, sessionBest) : live;
  }
  if (!hasLeftCar(car)) {
    return sessionBest;
  }
  const kept = postedLaps?.get(car.carIdx)?.bestLapSec;
  const latched = kept !== undefined && Number.isFinite(kept) && kept > 0 ? kept : null;
  if (latched !== null && sessionBest !== null) {
    return Math.min(latched, sessionBest);
  }
  return latched ?? sessionBest;
}

function sessionResults(session: SessionSnapshot | null): ReadonlyMap<number, SessionResult> {
  const index = new Map<number, SessionResult>();
  for (const result of session?.session.results ?? []) {
    index.set(result.carIdx, result);
  }
  return index;
}

function postedTime(value: number | undefined): number | null {
  return value !== undefined && Number.isFinite(value) && value > 0 ? value : null;
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
 * Sector interval for this row.
 * A checkered start/finish gap stays put. Otherwise empty for the leader, a pass, or a line not yet seen.
 */
function frozenGap(
  leader: boolean,
  aheadCarIdx: number | undefined,
  carIdx: number,
  sectorGaps: ReadonlyMap<number, CountedGap> | null,
): number | null {
  if (sectorGaps === null) {
    return null;
  }
  const gap = sectorGaps.get(carIdx);
  if (gap?.lapsDown !== undefined) {
    return gap.sec;
  }
  if (leader || aheadCarIdx === undefined || !gap || gap.aheadCarIdx !== aheadCarIdx) {
    return null;
  }
  return gap.sec;
}

function frozenLaps(
  ahead: CarSample | null,
  car: CarSample,
  sectorGaps: ReadonlyMap<number, CountedGap> | null,
): number {
  const held = sectorGaps?.get(car.carIdx)?.lapsDown;
  if (held !== undefined) {
    return held;
  }
  return ahead ? lapsDown(ahead, car) : 0;
}

export function lapsDown(ahead: CarSample, car: CarSample): number {
  let down = ahead.lap - car.lap;
  if (car.lapDistPct > ahead.lapDistPct) {
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
