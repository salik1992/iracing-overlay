import assert from "node:assert/strict";
import { test } from "node:test";

import { buildStandings } from "../src/frames.js";
import { LiveOrder } from "../src/live-order.js";
import { RaceMemory } from "../src/race-memory.js";
import { normalizeSession } from "../src/session.js";
import type { CarSample, Tick } from "../src/tick.js";
import type { SessionSnapshot, StandingsFrame } from "../src/types.js";

test("a pass puts the car ahead on the row and on the interval", () => {
  const session = fieldSession();
  const tick = makeTick([car(1, 1, 5, 0.6, 0), car(2, 2, 5, 0.4, 15.5), car(3, 3, 5, 0.45, 15)]);
  const memory = new RaceMemory();
  const note = memory.note(tick);
  const frame = publish(new LiveOrder(), session, tick, note);

  assert.equal(tick.cars.find((item) => item.carIdx === 2)?.classPosition, 2);
  assert.equal(note.startClassPosition.get(2), 2);
  assert.equal(note.startClassPosition.get(1), 1);
  assert.equal(classOf(frame, 1), 1);
  assert.equal(classOf(frame, 3), 2);
  assert.equal(classOf(frame, 2), 3);
  assert.equal(intervalOf(frame, 1), null);
  assert.equal(intervalOf(frame, 3), 15);
  assert.equal(intervalOf(frame, 2), 0.5);
  assert.equal(gapOf(frame, 1), -15.5);
  assert.equal(gapOf(frame, 3), -0.5);
  assert.equal(gapOf(frame, 2), 0);
});

test("parade laps keep the official class order and intervals", () => {
  const session = fieldSession();
  const tick = makeTick([car(1, 1, 5, 0.6, 0), car(2, 2, 5, 0.4, 15.5), car(3, 3, 5, 0.45, 15)], {
    sessionState: 3,
  });
  const live = new LiveOrder();
  const ranks = live.note(tick, session);
  const frame = buildStandings(tick, session, undefined, ranks);

  assert.equal(ranks, null);
  assert.equal(classOf(frame, 1), 1);
  assert.equal(classOf(frame, 2), 2);
  assert.equal(classOf(frame, 3), 3);
  assert.equal(intervalOf(frame, 1), null);
  assert.equal(intervalOf(frame, 2), 15.5);
  assert.equal(intervalOf(frame, 3), -0.5);
});

test("practice and lone qualify stay official, and a heat race is live", () => {
  const cars = [car(1, 1, 5, 0.6, 0), car(2, 2, 5, 0.4, 15.5), car(3, 3, 5, 0.45, 15)];
  for (const type of ["Practice", "Lone Qualify"]) {
    const frame = publish(new LiveOrder(), fieldSession(type), makeTick(cars));
    assert.equal(classOf(frame, 2), 2, type);
    assert.equal(intervalOf(frame, 2), 15.5, type);
  }
  const heat = publish(new LiveOrder(), fieldSession("Heat Race"), makeTick(cars));
  assert.equal(classOf(heat, 2), 3);
  assert.equal(intervalOf(heat, 2), 0.5);
});

test("a tow into the pit stall keeps the progress from the track", () => {
  const live = new LiveOrder();
  const session = fieldSession();
  const onTrack = publish(live, session, makeTick([car(1, 2, 4, 0.5, 0), car(2, 1, 4, 0.4, 1)]));
  assert.equal(classOf(onTrack, 1), 1);

  const towed = publish(live, session, makeTick([car(1, 2, 4, 0.5, 0), car(2, 1, 4, 0.95, 1, 1)]));
  assert.equal(classOf(towed, 1), 1);
  assert.equal(classOf(towed, 2), 2);
  assert.equal(towed.rows.find((row) => row.carIdx === 2)?.position, 1);
});

test("a stop through the pit lane follows the car back down the order", () => {
  const live = new LiveOrder();
  const session = fieldSession();
  const onTrack = publish(live, session, makeTick([car(1, 2, 4, 0.5, 0), car(2, 1, 4, 0.8, 1)]));
  assert.equal(classOf(onTrack, 2), 1);

  const approaching = publish(live, session, makeTick([car(1, 2, 4, 0.5, 0), car(2, 1, 4, 0.85, 1, 2)]));
  assert.equal(classOf(approaching, 2), 1);

  const stalled = publish(live, session, makeTick([car(1, 2, 4, 0.5, 0), car(2, 1, 4, 0.1, 1.2, 1)]));
  assert.equal(classOf(stalled, 2), 2);
  assert.equal(classOf(stalled, 1), 1);
});

test("the first sight of a car already in its stall uses that car's current distance", () => {
  const live = new LiveOrder();
  const session = fieldSession();
  const first = publish(live, session, makeTick([car(1, 1, 4, 0.5, 0), car(2, 2, 4, 0.95, 1, 1)]));
  assert.equal(classOf(first, 2), 1);

  const held = publish(live, session, makeTick([car(1, 1, 4, 0.5, 0), car(2, 2, 4, 0.1, 2, 1)]));
  assert.equal(classOf(held, 2), 1);
});

test("a new session clears a tow freeze", () => {
  const live = new LiveOrder();
  const session = fieldSession();
  publish(live, session, makeTick([car(1, 2, 4, 0.5, 0), car(2, 1, 4, 0.4, 1)]));
  const frozen = publish(live, session, makeTick([car(1, 2, 4, 0.5, 0), car(2, 1, 4, 0.95, 1, 1)]));
  assert.equal(classOf(frozen, 1), 1);

  const reset = publish(
    live,
    session,
    makeTick([car(1, 1, 4, 0.5, 0), car(2, 2, 4, 0.95, 1, 1)], { sessionNum: 2 }),
  );
  assert.equal(classOf(reset, 2), 1);
});

test("checkered stays live until the leader takes another lap, then finished cars lock", () => {
  const live = new LiveOrder();
  const session = raceSession(
    "Race",
    [
      { carIdx: 1, classId: 10 },
      { carIdx: 2, classId: 10 },
      { carIdx: 4, classId: 20 },
    ],
    [
      { CarIdx: 1, Position: 1, ClassPosition: 0, LapsComplete: 2 },
      { CarIdx: 2, Position: 2, ClassPosition: 1, LapsComplete: 2 },
      { Position: 3 },
      { CarIdx: "4", Position: "4", ClassPosition: "0", LapsComplete: "1" },
    ],
  );
  assert.deepEqual(session.session.results, [
    { carIdx: 1, position: 1, classPosition: 0, lapsComplete: 2 },
    { carIdx: 2, position: 2, classPosition: 1, lapsComplete: 2 },
    { carIdx: 4, position: 4, classPosition: 0, lapsComplete: 1 },
  ]);

  const opening = publish(
    live,
    session,
    makeTick(
      [car(1, 1, 2, 0.7, 0), car(2, 2, 2, 0.9, 1), car(4, 3, 1, 0.1, 4)],
      { sessionState: 5, playerCarIdx: 1, playerEst: 0 },
    ),
  );
  assert.equal(classOf(opening, 2), 1);
  assert.equal(classOf(opening, 1), 2);
  assert.equal(classOf(opening, 4), 1);

  const crossed = publish(
    live,
    session,
    makeTick(
      [car(1, 1, 3, 0.1, 0), car(2, 2, 2, 0.95, 1), car(4, 3, 1, 0.2, 4)],
      { sessionState: 5, playerCarIdx: 1, playerEst: 0 },
    ),
  );
  assert.equal(classOf(crossed, 1), 1);
  assert.equal(classOf(crossed, 2), 2);

  const locked = publish(
    live,
    session,
    makeTick(
      [car(1, 1, 3, 0.2, 0), car(2, 2, 3, 0.8, 1), car(4, 3, 2, 0.4, 4)],
      { sessionState: 5, playerCarIdx: 1, playerEst: 0 },
    ),
  );
  assert.equal(classOf(locked, 1), 1);
  assert.equal(classOf(locked, 2), 2);
  assert.equal(classOf(locked, 4), 1);

  const cool = live.note(
    makeTick([car(1, 1, 3, 0.2, 0), car(2, 2, 3, 0.8, 1)], { sessionState: 6, playerCarIdx: 1, playerEst: 0 }),
    session,
  );
  assert.equal(cool, null);

  const resumed = publish(
    live,
    session,
    makeTick(
      [car(1, 1, 3, 0.2, 0), car(2, 2, 3, 0.8, 1), car(4, 3, 2, 0.4, 4)],
      { sessionState: 5, playerCarIdx: 1, playerEst: 0 },
    ),
  );
  assert.equal(classOf(resumed, 2), 1);
  assert.equal(classOf(resumed, 1), 2);
});

test("a missing completed-lap count falls back to the result lap", () => {
  const session = raceSession(
    "Race",
    [
      { carIdx: 1, classId: 10 },
      { carIdx: 2, classId: 10 },
    ],
    [
      { CarIdx: 1, Position: 2, ClassPosition: 1, LapsComplete: 1 },
      { CarIdx: 2, Position: 1, ClassPosition: 0, LapsComplete: 3 },
    ],
  );
  const frame = publish(
    new LiveOrder(),
    session,
    makeTick([car(1, 1, -1, 0.9, 0), car(2, 2, -1, 0.1, 1)], { playerCarIdx: 1, playerEst: 0 }),
  );
  assert.equal(classOf(frame, 2), 1);
  assert.equal(classOf(frame, 1), 2);
});

test("equal progress keeps the lower car index ahead", () => {
  const session = raceSession("Race", [
    { carIdx: 2, classId: 10 },
    { carIdx: 5, classId: 10 },
  ]);
  const frame = publish(new LiveOrder(), session, makeTick([car(5, 1, 3, 0.5, 1), car(2, 2, 3, 0.5, 0)]));
  assert.equal(classOf(frame, 2), 1);
  assert.equal(classOf(frame, 5), 2);
});

test("a field whose only class id is unclassified keeps the official order", () => {
  const session = raceSession("Race", [
    { carIdx: 1, classId: -1 },
    { carIdx: 2, classId: -1 },
  ]);
  const live = new LiveOrder();
  const tick = makeTick([car(1, 1, 4, 0.2, 0), car(2, 2, 4, 0.8, 1)]);
  const ranks = live.note(tick, session);
  const frame = buildStandings(tick, session, undefined, ranks);
  assert.equal(ranks, null);
  assert.equal(classOf(frame, 1), 1);
  assert.equal(classOf(frame, 2), 2);
});

function publish(
  live: LiveOrder,
  session: SessionSnapshot,
  tick: Tick,
  note = new RaceMemory().note(tick),
): StandingsFrame {
  return buildStandings(tick, session, note, live.note(tick, session));
}

function fieldSession(type = "Race"): SessionSnapshot {
  return raceSession(type, [
    { carIdx: 1, classId: 10, name: "C" },
    { carIdx: 2, classId: 10, name: "A" },
    { carIdx: 3, classId: 10, name: "B" },
  ]);
}

function raceSession(
  type: string,
  drivers: { carIdx: number; classId: number; name?: string }[],
  results: unknown[] = [],
  sessionNum = 1,
): SessionSnapshot {
  const session = normalizeSession(
    {
      DriverInfo: {
        DriverCarIdx: drivers[0]?.carIdx ?? 0,
        Drivers: drivers.map((driver) => ({
          CarIdx: driver.carIdx,
          UserName: driver.name ?? `Car ${driver.carIdx}`,
          CarNumber: String(driver.carIdx),
          CarClassID: driver.classId,
        })),
      },
      SessionInfo: {
        Sessions: [{ SessionNum: sessionNum, SessionType: type, ResultsPositions: results }],
      },
    },
    { sessionNum, displayUnits: 1 },
  );
  if (!session) {
    throw new Error("expected a session");
  }
  return session;
}

function makeTick(
  cars: CarSample[],
  options: { sessionState?: number; sessionNum?: number; playerEst?: number; playerCarIdx?: number } = {},
): Tick {
  return {
    sessionTick: 1,
    sessionNum: options.sessionNum ?? 1,
    sessionState: options.sessionState ?? 4,
    sessionTimeRemainSec: 100,
    sessionLapsRemain: 10,
    sessionFlags: 0,
    displayUnits: 1,
    replay: false,
    playerCarIdx: options.playerCarIdx ?? 2,
    playerEstTimeSec: options.playerEst ?? 15.5,
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
    cars,
  };
}

function car(
  carIdx: number,
  classPosition: number,
  lapCompleted: number,
  lapDistPct: number,
  estTimeSec: number,
  trackSurface = 3,
): CarSample {
  return {
    carIdx,
    position: classPosition > 0 ? classPosition : carIdx,
    classPosition,
    lap: lapCompleted < 0 ? 0 : lapCompleted,
    lapCompleted,
    lapDistPct,
    estTimeSec,
    lastLapSec: -1,
    bestLapSec: 80,
    onPitRoad: false,
    trackSurface,
    tireCompound: -1,
  };
}

function classOf(frame: StandingsFrame, carIdx: number): number | undefined {
  return frame.rows.find((row) => row.carIdx === carIdx)?.classPosition;
}

function intervalOf(frame: StandingsFrame, carIdx: number): number | null | undefined {
  return frame.rows.find((row) => row.carIdx === carIdx)?.intervalSec;
}

function gapOf(frame: StandingsFrame, carIdx: number): number | null | undefined {
  return frame.rows.find((row) => row.carIdx === carIdx)?.gapToPlayerSec;
}
