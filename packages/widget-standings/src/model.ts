import { tokyo } from "./color.js";
import { MULTI_RADIUS, PLAYER_RADIUS } from "./constants.js";
import { gainedPlaces, headerMeta, isRace, otherGap, raceGap } from "./format.js";
import { splitShort } from "./names.js";
import type { SessionFields, StandingWire, StandingsWire } from "./types.js";
import { trimOthers, windowPositions, type WindowItem } from "./window.js";

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
  plate: string | null;
}

export type BoardItem =
  | { kind: "class"; key: string; name: string; color: string }
  | { kind: "gap"; key: string; count: number }
  | { kind: "car"; key: string; car: CarView };

export interface Board {
  race: boolean;
  teamRacing: boolean;
  sessionLabel: string;
  meta: string;
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
  const groups = groupRows(frame.rows);
  const multi = groups.length > 1;
  const items: BoardItem[] = [];
  if (!multi) {
    const group = groups[0];
    if (group) {
      items.push(...materialize(group, windowFor(group, true), race, false));
    }
  } else {
    const built = groups.map((group) => ({
      player: group.player,
      count: group.rows.length,
      items: windowFor(group, false),
      group,
    }));
    trimOthers(built);
    for (const entry of built) {
      const cars = entry.items.filter((item) => item.kind === "car");
      if (cars.length === 0) {
        continue;
      }
      items.push({
        kind: "class",
        key: `class:${entry.group.classId}`,
        name: entry.group.name,
        color: tokyo(entry.group.color),
      });
      items.push(...materialize(entry.group, entry.items, race, true));
    }
  }
  return {
    race,
    teamRacing: session.teamRacing,
    sessionLabel: session.type,
    meta: headerMeta(session, frame),
    items,
  };
}

function windowFor(group: ClassGroup, single: boolean): WindowItem[] {
  const playerIndex = group.rows.findIndex((row) => row.isPlayer);
  if (playerIndex < 0) {
    return windowPositions(group.rows.length, 1, 0, false);
  }
  if (!single) {
    return windowPositions(group.rows.length, playerIndex + 1, MULTI_RADIUS, false);
  }
  return windowPositions(group.rows.length, playerIndex + 1, PLAYER_RADIUS, true);
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

function groupRows(rows: readonly StandingWire[]): ClassGroup[] {
  const buckets = new Map<number, StandingWire[]>();
  for (const row of rows) {
    const list = buckets.get(row.classId) ?? [];
    list.push(row);
    buckets.set(row.classId, list);
  }
  const groups: ClassGroup[] = [];
  for (const [classId, list] of buckets) {
    const ordered = [...list].sort(
      (a, b) => shownPosition(a) - shownPosition(b) || a.position - b.position || a.carIdx - b.carIdx,
    );
    const first = ordered[0];
    groups.push({
      classId,
      name: first?.className ?? "",
      color: first?.classColor ?? "",
      player: ordered.some((row) => row.isPlayer),
      rows: ordered,
      minOverall: ordered.reduce((min, row) => Math.min(min, row.position), Number.POSITIVE_INFINITY),
    });
  }
  groups.sort((a, b) => a.minOverall - b.minOverall || a.classId - b.classId);
  return groups;
}

function shownPosition(row: StandingWire): number {
  return row.classPosition > 0 ? row.classPosition : row.position;
}
