import type { StandingRow, TelemetryNeighbor } from "./types.js";

/**
 * Cars immediately ahead of and behind the player in standings class order.
 * A race shows the interval to the player. Practice and qualifying show the
 * best-lap gap to the player's own lap. Ahead is negative and behind is positive.
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
  return {
    ahead: ahead ? toNeighbor(ahead, player, "ahead", race, multi) : null,
    behind: behind ? toNeighbor(behind, player, "behind", race, multi) : null,
  };
}

function toNeighbor(
  row: StandingRow,
  player: StandingRow,
  side: "ahead" | "behind",
  race: boolean,
  multi: boolean,
): TelemetryNeighbor {
  return {
    position: shownPosition(row),
    carNumber: row.carNumber,
    driverName: row.driverName,
    classColor: multi ? row.classColor : null,
    gap: race ? raceGap(side === "ahead" ? player : row, side) : playerLapGap(row, player, side),
  };
}

/** Interval to the class car ahead or behind. A full lap or more is `-NL` or `+NL`. */
function raceGap(row: StandingRow, side: "ahead" | "behind"): string {
  const down = Math.floor(row.lapsDown);
  if (down >= 1) {
    return `${sign(side)}${down}L`;
  }
  if (row.intervalSec === null) {
    return "";
  }
  return `${sign(side)}${Math.abs(row.intervalSec).toFixed(3)}`;
}

/** Best-lap difference from the player's own lap. */
function playerLapGap(row: StandingRow, player: StandingRow, side: "ahead" | "behind"): string {
  if (row.bestLapSec === null || player.bestLapSec === null) {
    return "";
  }
  return `${sign(side)}${Math.abs(row.bestLapSec - player.bestLapSec).toFixed(3)}`;
}

function sign(side: "ahead" | "behind"): string {
  return side === "ahead" ? "-" : "+";
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
