import assert from "node:assert/strict";
import { test } from "node:test";

import { buildStandings } from "../src/frames.js";
import { RaceMemory } from "../src/race-memory.js";
import { normalizeSession } from "../src/session.js";
import { tireLetter } from "../src/tire.js";
import type { CarSample, Tick } from "../src/tick.js";

test("tire letters prefer the session catalog", () => {
  assert.equal(tireLetter(0, ["Dry", "Wet"]), "D");
  assert.equal(tireLetter(1, ["Dry", "Wet"]), "W");
  assert.equal(tireLetter(2, ["Hard", "Medium", "Soft"]), "S");
  assert.equal(tireLetter(0, []), "D");
  assert.equal(tireLetter(1, []), "W");
  assert.equal(tireLetter(2, []), "");
  assert.equal(tireLetter(-1, ["Dry"]), "");
  assert.equal(tireLetter(Number.NaN, ["Dry"]), "");
});

test("class interval and laps down stay inside the class", () => {
  const session = normalizeSession(
    {
      DriverInfo: {
        DriverCarIdx: 1,
        TireCompounds: [{ Name: "Soft" }, { CompoundName: "Wet" }],
        Drivers: [
          { CarIdx: 1, UserName: "Lead", CarNumber: "1", CarClassID: 1, CarClassShortName: "GTP", TeamName: "Alpha" },
          { CarIdx: 2, UserName: "Chase", CarNumber: "2", CarClassID: 1, CarClassShortName: "GTP", TeamName: "Beta" },
          { CarIdx: 3, UserName: "Other", CarNumber: "3", CarClassID: 2, CarClassShortName: "GTD", TeamName: "Gamma" },
        ],
      },
      SessionInfo: { Sessions: [{ SessionNum: 0, SessionType: "Race" }] },
    },
    { sessionNum: 0, displayUnits: 1 },
  );
  const memory = new RaceMemory();
  const tick = makeTick([
    sample(1, 1, 1, 10, 0.1, 0, 0),
    sample(2, 3, 2, 9, 0.2, 1.25, 1),
    sample(3, 2, 1, 8, 0.05, 4, 1),
  ]);
  const note = memory.note(tick);
  const frame = buildStandings(tick, session, note);
  const lead = frame.rows.find((row) => row.carIdx === 1);
  const chase = frame.rows.find((row) => row.carIdx === 2);
  const other = frame.rows.find((row) => row.carIdx === 3);
  assert.equal(lead?.intervalSec, null);
  assert.equal(lead?.lapsDown, 0);
  assert.equal(lead?.tire, "S");
  assert.equal(lead?.teamName, "Alpha");
  assert.equal(lead?.startClassPosition, 1);
  assert.equal(lead?.pitStops, 0);
  assert.equal(chase?.intervalSec, 1.25);
  assert.equal(chase?.lapsDown, 0);
  assert.equal(chase?.tire, "W");
  assert.equal(other?.intervalSec, null);
  assert.equal(other?.lapsDown, 0);
  assert.deepEqual(session?.tires, ["Soft", "Wet"]);
});

test("crossing the start finish does not add a lap to the interval", () => {
  const jumped = buildStandings(
    makeTick([
      sample(1, 1, 1, 3, 0.01, 88.5, -1, 90),
      sample(2, 2, 2, 2, 0.98, 1.5, -1, 90.5),
    ]),
    null,
  );
  assert.equal(jumped.rows.find((row) => row.carIdx === 1)?.intervalSec, null);
  assert.equal(jumped.rows.find((row) => row.carIdx === 2)?.lapsDown, 0);
  assert.equal(jumped.rows.find((row) => row.carIdx === 2)?.intervalSec, 3);

  const steady = buildStandings(
    makeTick([
      sample(1, 1, 1, 3, 0.01, 0, -1, 90),
      sample(2, 2, 2, 2, 0.98, 1.5, -1, 90),
    ]),
    null,
  );
  assert.equal(steady.rows.find((row) => row.carIdx === 2)?.intervalSec, 1.5);

  const fromBest = buildStandings(
    makeTick([
      sample(1, 1, 1, 3, 0.01, 78, -1, -1),
      sample(2, 2, 2, 2, 0.97, 2, -1, -1),
    ]),
    null,
  );
  assert.equal(fromBest.rows.find((row) => row.carIdx === 2)?.intervalSec, 4);
});

test("an invalidated lap keeps the race place when no best lap exists", () => {
  const session = normalizeSession(
    {
      DriverInfo: {
        DriverCarIdx: 2,
        Drivers: [
          { CarIdx: 1, UserName: "Lead", CarNumber: "1", CarClassID: 1, CarClassShortName: "GTP" },
          { CarIdx: 2, UserName: "Vit Salomon", CarNumber: "8", CarClassID: 1, CarClassShortName: "GTP" },
          { CarIdx: 3, UserName: "Chase", CarNumber: "3", CarClassID: 1, CarClassShortName: "GTP" },
        ],
      },
      SessionInfo: { Sessions: [{ SessionNum: 0, SessionType: "Race" }] },
    },
    { sessionNum: 0, displayUnits: 1 },
  );
  const cars = [
    sample(1, 1, 1, 4, 0.4, 0, -1),
    sample(2, 2, 2, 4, 0.3, 1.25, -1),
    sample(3, 3, 3, 4, 0.2, 2.5, -1),
  ];
  const invalid = cars[1];
  if (!invalid) {
    throw new Error("missing car");
  }
  invalid.bestLapSec = -1;
  invalid.lastLapSec = -1;
  const tick = makeTick(cars, { sessionState: 4, sessionNum: 0 });
  const frame = buildStandings(tick, session);
  assert.deepEqual(
    frame.rows.map((row) => row.carIdx),
    [1, 2, 3],
  );
  assert.equal(frame.rows.find((row) => row.carIdx === 2)?.bestLapSec, null);
  assert.equal(frame.rows.find((row) => row.carIdx === 2)?.classPosition, 2);
  assert.equal(frame.rows.find((row) => row.carIdx === 2)?.intervalSec, 1.25);
  assert.equal(frame.rows.find((row) => row.carIdx === 3)?.intervalSec, 1.25);

  const live = buildStandings(tick, session, undefined, new Map([[1, 1], [2, 2], [3, 3]]));
  assert.deepEqual(
    live.rows.map((row) => row.carIdx),
    [1, 2, 3],
  );
  assert.equal(live.rows.find((row) => row.carIdx === 2)?.intervalSec, 1.25);
});

test("a car two laps behind the class leader reports two laps down", () => {
  const tick = makeTick([
    sample(1, 1, 1, 10, 0.1, 0, -1),
    sample(2, 2, 2, 8, 0.05, 2, -1),
  ]);
  const frame = buildStandings(tick, null);
  assert.equal(frame.rows.find((row) => row.carIdx === 2)?.lapsDown, 2);
});

test("pit stops count stall entries after the car has been seen", () => {
  const memory = new RaceMemory();
  const first = memory.note(makeTick([sample(7, 4, 2, 3, 0.4, 0, -1)], { sessionState: 4, surface: 1 }));
  assert.equal(first.pitStops.get(7), undefined);
  assert.equal(first.startClassPosition.get(7), 2);

  const left = memory.note(makeTick([sample(7, 4, 2, 3, 0.4, 0, -1)], { sessionState: 4, surface: 3 }));
  assert.equal(left.pitStops.get(7), undefined);

  const back = memory.note(makeTick([sample(7, 4, 2, 3, 0.4, 0, -1)], { sessionState: 4, surface: 1 }));
  assert.equal(back.pitStops.get(7), 1);

  const again = memory.note(makeTick([sample(7, 4, 2, 3, 0.4, 0, -1)], { sessionState: 4, surface: 1 }));
  assert.equal(again.pitStops.get(7), 1);
});

test("the start position waits for racing and resets with the session", () => {
  const memory = new RaceMemory();
  const parade = memory.note(makeTick([sample(4, 3, 6, 1, 0.2, 0, -1)], { sessionState: 3, sessionNum: 1 }));
  assert.equal(parade.startClassPosition.has(4), false);

  const green = memory.note(makeTick([sample(4, 3, 6, 1, 0.2, 0, -1)], { sessionState: 4, sessionNum: 1 }));
  assert.equal(green.startClassPosition.get(4), 6);

  const later = memory.note(makeTick([sample(4, 1, 2, 2, 0.2, 0, -1)], { sessionState: 4, sessionNum: 1 }));
  assert.equal(later.startClassPosition.get(4), 6);

  const joined = memory.note(
    makeTick(
      [sample(4, 1, 2, 2, 0.2, 0, -1), sample(8, 5, 9, 2, 0.2, 0, -1)],
      { sessionState: 4, sessionNum: 1 },
    ),
  );
  assert.equal(joined.startClassPosition.get(8), 9);

  const reset = memory.note(makeTick([sample(4, 1, 1, 0, 0, 0, -1)], { sessionState: 4, sessionNum: 2, surface: 1 }));
  assert.equal(reset.pitStops.get(7), undefined);
  assert.equal(reset.startClassPosition.get(4), 1);
  assert.equal(reset.pitStops.get(4), undefined);
});

function makeTick(
  cars: CarSample[],
  options: { sessionState?: number; sessionNum?: number; surface?: number } = {},
): Tick {
  if (options.surface !== undefined) {
    for (const car of cars) {
      car.trackSurface = options.surface;
    }
  }
  return {
    sessionTick: 1,
    sessionNum: options.sessionNum ?? 1,
    sessionState: options.sessionState ?? 4,
    sessionTimeRemainSec: 100,
    sessionLapsRemain: 10,
    sessionFlags: 0,
    displayUnits: 1,
    replay: false,
    playerCarIdx: cars[0]?.carIdx ?? 0,
    playerEstTimeSec: 0,
    speedMps: 40,
    rpm: 7000,
    gear: 4,
    throttle: 1,
    brake: 0,
    clutch: 0,
    steeringWheelAngleRad: 0,
    steeringWheelAngleMaxRad: 4,
    lap: 1,
    lapCurrentSec: 1,
    lapLastSec: -1,
    lapBestSec: -1,
    onTrack: true,
    garageVisible: false,
    cars,
  };
}

function sample(
  carIdx: number,
  position: number,
  classPosition: number,
  lap: number,
  lapDistPct: number,
  estTimeSec: number,
  tireCompound: number,
  lastLapSec = -1,
): CarSample {
  return {
    carIdx,
    position,
    classPosition,
    lap,
    lapCompleted: lap,
    lapDistPct,
    estTimeSec,
    lastLapSec,
    bestLapSec: 80,
    onPitRoad: false,
    trackSurface: 3,
    tireCompound,
  };
}
