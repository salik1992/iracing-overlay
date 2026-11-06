import type { StandingRow, TelemetryNeighbor } from "./types.js";

/**
 * Cars immediately ahead of and behind the player in standings class order.
 * The gap strings match the standings column: a race shows the interval to the
 * player, and any other session shows that car's own best-lap gap.
 */
export function classRelatives(
  rows: readonly StandingRow[],
  race: boolean,
): { ahead: TelemetryNeighbor | null; behind: TelemetryNeighbor | null } {
  const player = rows.find((row) => row.isPlayer);
  if (!player) {
    return { ahead: null, behind: null };
  }
  const classmates = rows
    .filter((row) => row.classId === player.classId)
    .sort((a, b) => compareClass(a, b, race));
  const index = classmates.findIndex((row) => row.isPlayer);
  const ahead = index > 0 ? classmates[index - 1] : undefined;
  const behind = index >= 0 && index < classmates.length - 1 ? classmates[index + 1] : undefined;
  const multi = new Set(rows.map((row) => row.classId)).size > 1;
  const best = bestLap(classmates);
  return {
    ahead: ahead ? toNeighbor(ahead, player, "ahead", race, multi, best) : null,
    behind: behind ? toNeighbor(behind, player, "behind", race, multi, best) : null,
  };
}

function toNeighbor(
  row: StandingRow,
  player: StandingRow,
  side: "ahead" | "behind",
  race: boolean,
  multi: boolean,
  best: { sec: number; carIdx: number } | null,
): TelemetryNeighbor {
  return {
    position: shownPosition(row),
    carNumber: row.carNumber,
    driverName: row.driverName,
    classColor: multi ? row.classColor : null,
    gap: race ? raceGap(side === "ahead" ? player : row) : otherGap(row, best),
  };
}

/** Interval to the class car ahead. A full lap or more is `+NL`. */
function raceGap(row: StandingRow): string {
  const down = Math.floor(row.lapsDown);
  if (down >= 1) {
    return `+${down}L`;
  }
  if (row.intervalSec === null) {
    return "";
  }
  return Math.abs(row.intervalSec).toFixed(3);
}

function otherGap(row: StandingRow, best: { sec: number; carIdx: number } | null): string {
  if (row.bestLapSec === null || !best) {
    return "";
  }
  if (row.carIdx === best.carIdx) {
    return formatLap(row.bestLapSec);
  }
  const delta = Math.max(0, row.bestLapSec - best.sec);
  return `+${delta.toFixed(3)}`;
}

function formatLap(sec: number): string {
  const totalMs = Math.round(sec * 1000);
  const minutes = Math.floor(totalMs / 60000);
  const seconds = Math.floor((totalMs % 60000) / 1000);
  const millis = totalMs % 1000;
  return `${minutes}:${String(seconds).padStart(2, "0")}.${String(millis).padStart(3, "0")}`;
}

function compareClass(a: StandingRow, b: StandingRow, race: boolean): number {
  if (race) {
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

function shownPosition(row: StandingRow): number {
  return row.classPosition > 0 ? row.classPosition : row.position;
}

function placeKey(position: number): number {
  return position > 0 ? position : Number.MAX_SAFE_INTEGER;
}

function postedRank(row: StandingRow): number {
  return row.bestLapSec === null ? 1 : 0;
}

function bestLap(rows: readonly StandingRow[]): { sec: number; carIdx: number } | null {
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
