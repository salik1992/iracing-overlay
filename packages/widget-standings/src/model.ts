import { tokyo } from "./color.js";
import { gainedPlaces, inPitLane, isRace, otherGap, raceGap } from "./format.js";
import { splitShort } from "./names.js";
import type { SessionFields, StandingWire, StandingsWire } from "./types.js";
import { otherClassWindow, playerClassWindow, type WindowItem } from "./window.js";

export interface CarView {
  position: number;
  number: string;
  initial: string;
  trigram: string;
  team: string;
  stops: number;
  tire: string;
  gained: number;
  gap: string;
  player: boolean;
  pits: boolean;
  plate: string | null;
}

export type BoardItem =
  | { kind: "class"; key: string; name: string; color: string }
  | { kind: "gap"; key: string; count: number }
  | { kind: "car"; key: string; car: CarView };

export interface Board {
  race: boolean;
  teamRacing: boolean;
  items: BoardItem[];
}

interface ClassGroup {
  classId: number;
  name: string;
  color: string;
  player: boolean;
  rows: StandingWire[];
  minOverall: number;
}

export function buildBoard(session: SessionFields, frame: StandingsWire): Board {
  const race = isRace(session.type);
  const groups = groupRows(frame.rows, race);
  const multi = groups.length > 1;
  const items: BoardItem[] = [];
  if (!multi) {
    const group = groups[0];
    if (group) {
      items.push(...materialize(group, windowFor(group, groups.length), race, false));
    }
  } else {
    for (const group of groups) {
      const window = windowFor(group, groups.length);
      if (!window.some((item) => item.kind === "car")) {
        continue;
      }
      items.push({
        kind: "class",
        key: `class:${group.classId}`,
        name: group.name,
        color: tokyo(group.color),
      });
      items.push(...materialize(group, window, race, true));
    }
  }
  return {
    race,
    teamRacing: session.teamRacing,
    items,
  };
}

function windowFor(group: ClassGroup, classCount: number): WindowItem[] {
  const playerIndex = group.rows.findIndex((row) => row.isPlayer);
  if (playerIndex < 0) {
    return otherClassWindow(group.rows.length);
  }
  return playerClassWindow(group.rows.length, playerIndex + 1, classCount);
}

function materialize(group: ClassGroup, items: WindowItem[], race: boolean, multi: boolean): BoardItem[] {
  const best = bestLap(group.rows);
  const plate = multi ? tokyo(group.color) : null;
  const out: BoardItem[] = [];
  let after = 0;
  for (const item of items) {
    if (item.kind === "gap") {
      out.push({ kind: "gap", key: `gap:${group.classId}:${after}`, count: item.count });
      continue;
    }
    after = item.position;
    const row = group.rows[item.position - 1];
    if (!row) {
      continue;
    }
    const position = shownPosition(row);
    const name = splitShort(row.driverName);
    const leader = item.position === 1;
    out.push({
      kind: "car",
      key: `car:${row.carIdx}`,
      car: {
        position,
        number: row.carNumber,
        initial: name.initial,
        trigram: name.trigram,
        team: row.teamName,
        stops: row.pitStops,
        tire: row.tire,
        gained: gainedPlaces(row.startClassPosition, position),
        gap: race ? raceGap(row, leader) : otherGap(row, best),
        player: row.isPlayer,
        pits: inPitLane(row.onPitRoad, row.trackSurface),
        plate,
      },
    });
  }
  return out;
}

function bestLap(rows: readonly StandingWire[]): { sec: number; carIdx: number } | null {
  let best: { sec: number; carIdx: number } | null = null;
  for (const row of rows) {
    if (row.bestLapSec === null) {
      continue;
    }
    if (!best || row.bestLapSec < best.sec) {
      best = { sec: row.bestLapSec, carIdx: row.carIdx };
    }
  }
  return best;
}

function groupRows(rows: readonly StandingWire[], gridOrder: boolean): ClassGroup[] {
  const buckets = new Map<number, StandingWire[]>();
  for (const row of rows) {
    const list = buckets.get(row.classId) ?? [];
    list.push(row);
    buckets.set(row.classId, list);
  }
  const groups: ClassGroup[] = [];
  for (const [classId, list] of buckets) {
    const ordered = [...list].sort((a, b) => compareRows(a, b, gridOrder));
    const first = ordered[0];
    groups.push({
      classId,
      name: first?.className ?? "",
      color: first?.classColor ?? "",
      player: ordered.some((row) => row.isPlayer),
      rows: ordered,
      minOverall: minOverall(ordered, gridOrder),
    });
  }
  groups.sort((a, b) => a.minOverall - b.minOverall || a.classId - b.classId);
  return groups;
}

function compareRows(a: StandingWire, b: StandingWire, byPlace: boolean): number {
  if (byPlace) {
    return (
      placeKey(shownPosition(a)) - placeKey(shownPosition(b)) ||
      placeKey(a.position) - placeKey(b.position) ||
      a.carIdx - b.carIdx
    );
  }
  return (
    postedRank(a) - postedRank(b) ||
    shownPosition(a) - shownPosition(b) ||
    a.position - b.position ||
    a.carIdx - b.carIdx
  );
}

/** A place of 0 is unset. On the grid those cars follow every car that has a place. */
function placeKey(position: number): number {
  return position > 0 ? position : Number.MAX_SAFE_INTEGER;
}

function minOverall(rows: readonly StandingWire[], gridOrder: boolean): number {
  let min = Number.POSITIVE_INFINITY;
  for (const row of rows) {
    const position = gridOrder && row.position <= 0 ? Number.POSITIVE_INFINITY : row.position;
    if (position < min) {
      min = position;
    }
  }
  return min;
}

function shownPosition(row: StandingWire): number {
  return row.classPosition > 0 ? row.classPosition : row.position;
}

function postedRank(row: StandingWire): number {
  return row.bestLapSec === null ? 1 : 0;
}
