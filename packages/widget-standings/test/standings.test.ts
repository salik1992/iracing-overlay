import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { tokyo } from "../src/color.js";
import { formatLap, formatRemain, gainedPlaces, headerMeta, isRace } from "../src/format.js";
import { buildBoard, type Board, type BoardItem } from "../src/model.js";
import { shortName } from "../src/names.js";
import { parseMessage } from "../src/parse.js";
import { previewBoard } from "../src/preview.js";
import type { SessionFields, StandingWire, StandingsWire } from "../src/types.js";
import { OTHER_TOP } from "../src/constants.js";
import { windowPositions, type WindowItem } from "../src/window.js";

test("short names follow the trigram rule", () => {
  assert.equal(shortName("Vit Salomon"), "V SAL");
  assert.equal(shortName("Nyck de Vries"), "N DVR");
  assert.equal(shortName("Pete van der Kirk"), "P VDK");
  assert.equal(shortName("Charles Emmerson Winchester the third"), "C WTT");
  assert.equal(shortName("Hamilton"), "HAM");
  assert.equal(shortName("  "), "");
});

test("the window keeps the five studied shapes", () => {
  assert.equal(labels(windowPositions(60, 1, 10, true)), `${span(1, 45)},g15`);
  assert.equal(labels(windowPositions(60, 7, 10, true)), `${span(1, 45)},g15`);
  assert.equal(labels(windowPositions(60, 17, 10, true)), `${span(1, 27)},g33`);
  assert.equal(labels(windowPositions(40, 23, 10, true)), `${span(1, 5)},g7,${span(13, 33)},g7`);
  assert.equal(labels(windowPositions(18, 8, 10, true)), span(1, 18));
  assert.equal(labels(windowPositions(46, 1, 10, true)), span(1, 46));
  assert.equal(labels(windowPositions(6, 1, 0, false)), span(1, 6));
  assert.equal(labels(windowPositions(9, 1, 0, false)), `${span(1, 5)},g4`);
  assert.equal(labels(windowPositions(12, 1, 0, false, OTHER_TOP)), `${span(1, 8)},g4`);
  assert.equal(labels(windowPositions(9, 1, 0, false, OTHER_TOP)), span(1, 9));
});

test("race mode is the session type", () => {
  assert.equal(isRace("Race"), true);
  assert.equal(isRace("Heat Race"), true);
  assert.equal(isRace("Practice"), false);
  assert.equal(isRace("Lone Qualify"), false);
  assert.equal(isRace("Qualify"), false);
});

test("clocks format laps, remain, and deltas", () => {
  assert.equal(formatLap(82.481), "1:22.481");
  assert.equal(formatLap(30.8), "0:30.800");
  assert.equal(formatRemain(47 * 60 + 12), "47:12");
  assert.equal(formatRemain(3661), "1:01:01");
  assert.equal(formatRemain(1800), "30:00");
  assert.equal(formatRemain(-1), "");
  assert.equal(gainedPlaces(5, 3), 2);
  assert.equal(gainedPlaces(3, 5), -2);
  assert.equal(gainedPlaces(0, 4), 0);
});

test("the header follows the session limit", () => {
  const rows = [wire({ carIdx: 1, position: 1, lap: 23 })];
  assert.equal(headerMeta(session({ type: "Race", laps: "48", time: "unlimited" }), frame(rows, 10)), "23/48");
  assert.equal(
    headerMeta(session({ type: "Practice", laps: "unlimited", time: "1800.000 sec" }), frame(rows, 2832)),
    "47:12",
  );
  assert.equal(headerMeta(session({ type: "Practice", laps: "unlimited", time: "unlimited" }), frame(rows, 99999)), "");
});

test("other mode shows the class best and its delta", () => {
  const board = buildBoard(
    session({ type: "Practice", laps: "unlimited", time: "1800.000 sec" }),
    frame([
      wire({
        carIdx: 2,
        position: 2,
        classPosition: 2,
        carNumber: "22",
        driverName: "Vit Salomon",
        bestLapSec: 82.481,
        isPlayer: true,
        teamName: "Salomon Racing",
      }),
      wire({
        carIdx: 1,
        position: 1,
        classPosition: 1,
        carNumber: "2",
        driverName: "A. Nielsen",
        bestLapSec: 82.267,
        teamName: "Nielsen Racing",
      }),
    ], 1800),
  );
  assert.equal(board.race, false);
  assert.equal(board.meta, "30:00");
  const cars = carItems(board);
  assert.equal(cars.length, 2);
  assert.equal(cars[0]?.car.number, "2");
  assert.equal(cars[0]?.car.gap, "1:22.267");
  assert.equal(cars[0]?.car.initial, "A");
  assert.equal(cars[0]?.car.trigram, "NIE");
  assert.equal(cars[1]?.car.gap, "+0.214");
  assert.equal(cars[1]?.car.initial, "V");
  assert.equal(cars[1]?.car.trigram, "SAL");
  assert.equal(cars[1]?.car.player, true);
  assert.equal(cars[1]?.car.team, "Salomon Racing");
  assert.equal(cars[0]?.car.plate, null);
  assert.equal(board.items.some((item) => item.kind === "class"), false);
});

test("a car with no lap time stays up, with an empty column, after the timed cars", () => {
  const absent = wire({
    carIdx: 9,
    position: 0,
    classPosition: 0,
    carNumber: "9",
    driverName: "No Time",
    bestLapSec: null,
    intervalSec: 4,
    lapsDown: 2,
  });
  const practice = buildBoard(
    session({ type: "Practice", laps: "unlimited", time: "unlimited" }),
    frame([
      absent,
      wire({ carIdx: 2, position: 2, classPosition: 2, carNumber: "22", bestLapSec: 81.2, driverName: "Vit Salomon" }),
      wire({ carIdx: 1, position: 1, classPosition: 1, carNumber: "2", bestLapSec: 80, driverName: "A. Nielsen" }),
    ]),
  );
  const practiceCars = carItems(practice);
  assert.deepEqual(
    practiceCars.map((item) => item.car.number),
    ["2", "22", "9"],
  );
  assert.equal(practiceCars[0]?.car.gap, "1:20.000");
  assert.equal(practiceCars[1]?.car.gap, "+1.200");
  assert.equal(practiceCars[2]?.car.gap, "");
  assert.equal(practiceCars[2]?.car.position, 0);

  const race = buildBoard(session({ type: "Race", laps: "20" }), frame([
    absent,
    wire({ carIdx: 1, position: 1, classPosition: 1, carNumber: "2", bestLapSec: 80, intervalSec: null }),
    wire({ carIdx: 2, position: 2, classPosition: 2, carNumber: "22", bestLapSec: 81, intervalSec: 0.5 }),
  ]));
  const raceCars = carItems(race);
  assert.deepEqual(
    raceCars.map((item) => item.car.number),
    ["2", "22", "9"],
  );
  assert.equal(raceCars[0]?.car.gap, "");
  assert.equal(raceCars[1]?.car.gap, "0.500");
  assert.equal(raceCars[2]?.car.gap, "");
});

test("race mode uses the class interval and laps down", () => {
  const board = buildBoard(
    session({ type: "Race", laps: "48" }),
    frame([
      wire({ carIdx: 1, position: 1, classPosition: 1, intervalSec: null, lapsDown: 0, lap: 23, bestLapSec: 80, startClassPosition: 1 }),
      wire({
        carIdx: 2,
        position: 2,
        classPosition: 2,
        intervalSec: 1.18,
        lapsDown: 0,
        bestLapSec: 80.5,
        startClassPosition: 4,
        driverName: "Nyck de Vries",
      }),
      wire({
        carIdx: 3,
        position: 3,
        classPosition: 3,
        intervalSec: 2,
        lapsDown: 2,
        bestLapSec: 81,
        startClassPosition: 3,
        driverName: "Pete van der Kirk",
      }),
    ]),
  );
  const cars = carItems(board);
  assert.equal(board.race, true);
  assert.equal(board.meta, "23/48");
  assert.equal(cars[0]?.car.gap, "");
  assert.equal(cars[0]?.car.gained, 0);
  assert.equal(cars[1]?.car.gap, "1.180");
  assert.equal(cars[1]?.car.gained, 2);
  assert.equal(cars[1]?.car.trigram, "DVR");
  assert.equal(cars[2]?.car.gap, "+2L");
  assert.equal(cars[2]?.car.gained, 0);
});

test("multiclass keeps the player class and the one-car tail", () => {
  const rows = [
    ...klass(1, "GTP", "#ff2d2d", 1, 9, null),
    ...klass(2, "LMP2", "#1c6bff", 10, 10, 4),
    ...klass(3, "GTD", "#14c96a", 20, 6, null),
  ];
  const board = buildBoard(session({ type: "Race", laps: "30" }), frame(rows));
  const grouped = carsByClass(board);
  assert.deepEqual(grouped.get("GTP"), { cars: 9, gaps: [] });
  assert.deepEqual(grouped.get("LMP2"), { cars: 7, gaps: [3] });
  assert.deepEqual(grouped.get("GTD"), { cars: 6, gaps: [] });
  const player = carItems(board).filter((item) => item.car.player);
  assert.equal(player.length, 1);
  assert.equal(player[0]?.car.position, 4);
  assert.equal(player[0]?.car.plate, "#8baae4");
  assert.equal(tokyo("#1c6bff"), "#8baae4");
  assert.equal(tokyo("#ff2d2d"), "#e48b8b");
  const headings = board.items.filter((item) => item.kind === "class");
  assert.deepEqual(
    headings.map((item) => (item.kind === "class" ? item.name : "")),
    ["GTP", "LMP2", "GTD"],
  );
});

test("other classes shrink to the 45-row cap and the player class stays", () => {
  const rows = [
    ...klass(1, "A", "#ff2d2d", 1, 20, null),
    ...klass(2, "B", "#ff2d2d", 21, 20, null),
    ...klass(3, "C", "#ff2d2d", 41, 20, null),
    ...klass(4, "D", "#ff2d2d", 61, 20, null),
    ...klass(5, "F", "#ff2d2d", 81, 20, null),
    ...klass(6, "E", "#1c6bff", 101, 40, 23),
  ];
  const board = buildBoard(session({ type: "Race", laps: "40" }), frame(rows));
  const grouped = carsByClass(board);
  assert.deepEqual(grouped.get("A"), { cars: 7, gaps: [13] });
  assert.deepEqual(grouped.get("B"), { cars: 7, gaps: [13] });
  assert.deepEqual(grouped.get("C"), { cars: 7, gaps: [13] });
  assert.deepEqual(grouped.get("D"), { cars: 6, gaps: [14] });
  assert.deepEqual(grouped.get("F"), { cars: 6, gaps: [14] });
  assert.deepEqual(grouped.get("E")?.cars, 12);
  assert.equal(carItems(board).length, 45);
});

test("a full class of six gives up two rows when the cap requires a cut", () => {
  const rows = [
    ...klass(1, "A", "#ff2d2d", 1, 20, null),
    ...klass(2, "B", "#ff2d2d", 21, 20, null),
    ...klass(3, "C", "#ff2d2d", 41, 20, null),
    ...klass(4, "G", "#ff2d2d", 61, 20, null),
    ...klass(5, "D", "#14c96a", 81, 6, null),
    ...klass(6, "E", "#1c6bff", 87, 40, 23),
  ];
  const board = buildBoard(session({ type: "Race", laps: "40" }), frame(rows));
  const grouped = carsByClass(board);
  assert.deepEqual(grouped.get("D"), { cars: 4, gaps: [2] });
  assert.deepEqual(grouped.get("G"), { cars: 7, gaps: [13] });
  assert.equal(grouped.get("E")?.cars, 12);
  assert.equal(carItems(board).length, 45);
});

test("the preview is a multiclass race through the same board", () => {
  const board = previewBoard();
  assert.equal(board.race, true);
  assert.equal(board.teamRacing, false);
  assert.equal(board.meta, "23/48");
  const names = board.items.filter((item) => item.kind === "class").map((item) => (item.kind === "class" ? item.name : ""));
  assert.deepEqual(names, ["GTP", "LMP2", "GTD"]);
  assert.ok(board.items.some((item) => item.kind === "gap"));
  const player = carItems(board).find((item) => item.car.player);
  assert.equal(player?.car.initial, "V");
  assert.equal(player?.car.trigram, "SAL");
  assert.equal(player?.car.number, "8");
  assert.ok(carItems(board).some((item) => item.car.number === "888"));
  assert.equal(player?.car.plate, "#8baae4");
});

test("the team frame hides the gap and the player tick stays on the row", () => {
  const css = readFileSync(new URL("../style.css", import.meta.url), "utf8");
  assert.match(css, /\.panel\.is-team \.gap\s*\{[^}]*display:\s*none/);
  assert.match(css, /\.row\.is-player\s*\{[^}]*box-shadow:\s*inset 2px 0 0 var\(--accent\)/);
  assert.doesNotMatch(css, /is-player[^{]*\.num/);
});

test("the page parses session and standings and ignores other frames", () => {
  assert.equal(parseMessage("{"), null);
  assert.equal(parseMessage(JSON.stringify({ type: "telemetry", frame: {} })), null);
  assert.equal(parseMessage(JSON.stringify({ type: "flags", frame: { flags: ["green"] } })), null);
  const sessionMessage = parseMessage(
    JSON.stringify({
      type: "session",
      session: { weekend: { teamRacing: true }, session: { type: "Race", laps: "48", time: "unlimited" } },
    }),
  );
  assert.deepEqual(sessionMessage, {
    type: "session",
    session: { type: "Race", laps: "48", time: "unlimited", teamRacing: true },
  });
  const standings = parseMessage(
    JSON.stringify({
      type: "standings",
      frame: { sessionTimeRemainSec: 12, rows: [{ carIdx: 2, driverName: "Vit Salomon", isPlayer: true, tire: "W" }] },
    }),
  );
  assert.equal(standings?.type, "standings");
  if (standings?.type !== "standings") {
    return;
  }
  assert.equal(standings.frame.rows[0]?.driverName, "Vit Salomon");
  assert.equal(standings.frame.rows[0]?.tire, "W");
  assert.equal(standings.frame.rows[0]?.intervalSec, null);
});

function labels(items: WindowItem[]): string {
  return items.map((item) => (item.kind === "gap" ? `g${item.count}` : String(item.position))).join(",");
}

function span(from: number, to: number): string {
  const values: string[] = [];
  for (let value = from; value <= to; value += 1) {
    values.push(String(value));
  }
  return values.join(",");
}

function session(patch: Partial<SessionFields>): SessionFields {
  return {
    type: patch.type ?? "Practice",
    laps: patch.laps ?? "unlimited",
    time: patch.time ?? "unlimited",
    teamRacing: patch.teamRacing ?? false,
  };
}

function frame(rows: StandingWire[], remain = 0): StandingsWire {
  return { sessionTimeRemainSec: remain, rows };
}

function wire(patch: Partial<StandingWire>): StandingWire {
  return {
    carIdx: patch.carIdx ?? 1,
    position: patch.position ?? 1,
    classPosition: patch.classPosition ?? 1,
    classId: patch.classId ?? 1,
    className: patch.className ?? "GTP",
    classColor: patch.classColor ?? "#ff2d2d",
    carNumber: patch.carNumber ?? "1",
    driverName: patch.driverName ?? "Driver Name",
    lap: patch.lap ?? 1,
    bestLapSec: patch.bestLapSec === undefined ? null : patch.bestLapSec,
    teamName: patch.teamName ?? "",
    tire: patch.tire ?? "S",
    pitStops: patch.pitStops ?? 0,
    startClassPosition: patch.startClassPosition ?? 0,
    intervalSec: patch.intervalSec === undefined ? null : patch.intervalSec,
    lapsDown: patch.lapsDown ?? 0,
    isPlayer: patch.isPlayer ?? false,
  };
}

function klass(
  classId: number,
  className: string,
  classColor: string,
  overallStart: number,
  count: number,
  playerAt: number | null,
): StandingWire[] {
  const rows: StandingWire[] = [];
  for (let index = 0; index < count; index += 1) {
    const classPosition = index + 1;
    rows.push(
      wire({
        carIdx: classId * 1000 + classPosition,
        position: overallStart + index,
        classPosition,
        classId,
        className,
        classColor,
        carNumber: String(classPosition),
        driverName: `Driver ${classPosition}`,
        lap: 10,
        bestLapSec: 80 + index,
        teamName: `Team ${classPosition}`,
        startClassPosition: classPosition,
        intervalSec: index === 0 ? null : 0.4,
        isPlayer: playerAt === classPosition,
      }),
    );
  }
  return rows;
}

function carItems(board: Board): Extract<BoardItem, { kind: "car" }>[] {
  return board.items.filter((item): item is Extract<BoardItem, { kind: "car" }> => item.kind === "car");
}

function carsByClass(board: Board): Map<string, { cars: number; gaps: number[] }> {
  const map = new Map<string, { cars: number; gaps: number[] }>();
  let current = "";
  for (const item of board.items) {
    if (item.kind === "class") {
      current = item.name;
      map.set(current, { cars: 0, gaps: [] });
      continue;
    }
    const bucket = map.get(current) ?? { cars: 0, gaps: [] };
    if (item.kind === "car") {
      bucket.cars += 1;
    } else {
      bucket.gaps.push(item.count);
    }
    map.set(current, bucket);
  }
  return map;
}
