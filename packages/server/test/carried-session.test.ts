import assert from "node:assert/strict";
import { test } from "node:test";

import { adoptSession, discardCarried, type CarriedCar } from "../src/carried.js";
import { buildStandings } from "../src/frames.js";
import { PostedLaps } from "../src/posted-laps.js";
import { normalizeSession } from "../src/session.js";
import { advanceSession, type HeldSession } from "../src/sources/iracing-source.js";
import type { CarSample, Tick } from "../src/tick.js";
import type { SessionSnapshot } from "../src/types.js";

test("a repeated version still selects the race-weekend practice", () => {
  const open = weekendYaml(10, 100, 80.1);
  const raceWeekend = weekendYaml(10, 200, 80.1);
  const empty: HeldSession = { version: null, sessionNum: null, session: null };
  const first = advanceSession(empty, { version: 1, sessionNum: 0, displayUnits: 1 }, () => open);
  assert.equal(first.publish?.session.weekend.subSessionId, 100);
  assert.equal(first.publish?.session.session.results[0]?.fastestTimeSec, 80.1);

  let reads = 0;
  const quiet = advanceSession(first.held, { version: 1, sessionNum: 0, displayUnits: 1 }, () => {
    reads += 1;
    return raceWeekend;
  });
  assert.equal(quiet.publish, null);
  assert.equal(reads, 0);

  const loaded = advanceSession(
    first.held,
    { version: 1, sessionNum: 0, displayUnits: 1, force: true },
    () => raceWeekend,
  );
  assert.equal(loaded.publish?.session.weekend.sessionId, 10);
  assert.equal(loaded.publish?.session.weekend.subSessionId, 200);
  assert.equal(loaded.held.sessionNum, 0);
  assert.equal(loaded.held.version, 1);
});

test("the race-weekend practice drops laps and places copied from the open practice", () => {
  const open = mustSession(weekendYaml(10, 100, 80.1));
  const copied = mustSession(weekendYaml(10, 200, 80.1));
  const empty = new Map();
  const adopted = adoptSession(open, copied, empty);
  assert.equal(adopted.carry, true);
  assert.equal(adopted.session.session.results.length, 0);

  const carried: CarriedCar = { position: 3, classPosition: 2, lap: 14, bestLapSec: 80.1, lastLapSec: 81 };
  const stale = discardCarried(sample(1, 3, 2, 14, 80.1, 81), carried);
  assert.equal(stale.position, 0);
  assert.equal(stale.classPosition, 0);
  assert.equal(stale.lap, 0);
  assert.equal(stale.bestLapSec, -1);
  assert.equal(stale.lastLapSec, -1);

  const frame = buildStandings(tick([stale], 200), adopted.session);
  assert.equal(frame.rows.find((row) => row.carIdx === 1)?.bestLapSec, null);
  assert.equal(frame.rows.find((row) => row.carIdx === 1)?.classPosition, 0);
  assert.equal(frame.rows.find((row) => row.carIdx === 1)?.position, 0);

  const moved = discardCarried(sample(1, 1, 1, 1, 79.4, 79.4), carried);
  assert.equal(moved.position, 1);
  assert.equal(moved.bestLapSec, 79.4);

  const posted = mustSession(weekendYaml(10, 200, 79.4));
  const fresh = adoptSession(copied, posted, adopted.blocked);
  assert.equal(fresh.carry, false);
  assert.equal(fresh.session.session.results[0]?.fastestTimeSec, 79.4);
  const shown = buildStandings(tick([sample(1, 1, 1, 1, 79.4, 79.4)], 200), fresh.session);
  assert.equal(shown.rows.find((row) => row.carIdx === 1)?.bestLapSec, 79.4);
  assert.equal(shown.rows.find((row) => row.carIdx === 1)?.classPosition, 1);
});

test("a lap set after the new practice opens is kept when it matches the old time", () => {
  const open = mustSession(weekendYaml(10, 100, 80.1));
  const clean = mustSession(weekendYaml(10, 200, null));
  const arrived = adoptSession(open, clean, new Map());
  assert.equal(arrived.session.session.results.length, 0);

  const sameTime = mustSession(weekendYaml(10, 200, 80.1));
  const later = adoptSession(clean, sameTime, arrived.blocked);
  assert.equal(later.session.session.results[0]?.fastestTimeSec, 80.1);
});

test("qualifying on the new server is not filtered by the practice that was copied", () => {
  const open = mustSession(weekendYaml(10, 100, 80.1));
  const practice = mustSession(weekendYaml(10, 200, 80.1));
  const arrived = adoptSession(open, practice, new Map());
  const qualify = mustSession(weekendYaml(10, 200, 80.1, 1, "Lone Qualify"));
  const session = adoptSession(practice, qualify, arrived.blocked);
  assert.equal(session.carry, false);
  assert.equal(session.blocked.size, 0);
  assert.equal(session.session.session.results[0]?.fastestTimeSec, 80.1);
});

test("a new subsession forgets a latched practice lap", () => {
  const posted = new PostedLaps();
  const car = sample(1, 1, 1, 4, 80.1, 80.1);
  posted.note(tick([car], 100));
  car.bestLapSec = -1;
  car.trackSurface = -1;
  car.lapDistPct = -1;
  const kept = posted.note(tick([car], 100));
  assert.equal(kept.get(1)?.bestLapSec, 80.1);

  const cleared = posted.note(tick([car], 200));
  assert.equal(cleared.get(1), undefined);
});

function weekendYaml(
  sessionId: number,
  subSessionId: number,
  fastest: number | null,
  sessionNum = 0,
  type = "Practice",
): unknown {
  return {
    WeekendInfo: { SessionID: sessionId, SubSessionID: subSessionId, TrackLength: "1 km" },
    DriverInfo: {
      DriverCarIdx: 1,
      Drivers: [{ CarIdx: 1, UserName: "Vit Salomon", CarNumber: "22", CarClassID: 1, CarClassShortName: "GTP" }],
    },
    SessionInfo: {
      Sessions: [{
        SessionNum: sessionNum,
        SessionType: type,
        ResultsPositions: fastest === null ? [] : [{ CarIdx: 1, Position: 1, ClassPosition: 0, FastestTime: fastest }],
      }],
    },
  };
}

function mustSession(raw: unknown, sessionNum = 0): SessionSnapshot {
  const session = normalizeSession(raw, { sessionNum, displayUnits: 1 });
  if (!session) {
    throw new Error("session");
  }
  return session;
}

function sample(
  carIdx: number,
  position: number,
  classPosition: number,
  lap: number,
  bestLapSec: number,
  lastLapSec: number,
): CarSample {
  return {
    carIdx,
    position,
    classPosition,
    lap,
    lapCompleted: Math.max(0, lap - 1),
    lapDistPct: 0.4,
    estTimeSec: 0,
    lastLapSec,
    bestLapSec,
    onPitRoad: false,
    trackSurface: 3,
    tireCompound: 0,
  };
}

function tick(cars: CarSample[], subSessionId: number): Tick {
  return {
    sessionTick: 1,
    sessionTimeSec: 0,
    sessionNum: 0,
    uniqueId: 1,
    sessionId: 10,
    subSessionId,
    sessionState: 4,
    sessionTimeRemainSec: 100,
    sessionLapsRemain: 0,
    sessionFlags: 0,
    displayUnits: 1,
    replay: false,
    playerCarIdx: 1,
    playerEstTimeSec: 0,
    speedMps: 0,
    rpm: 0,
    gear: 0,
    throttle: 0,
    brake: 0,
    clutch: 0,
    steeringWheelAngleRad: 0,
    steeringWheelAngleMaxRad: 0,
    lap: 0,
    lapCurrentSec: 0,
    lapLastSec: -1,
    lapBestSec: -1,
    onTrack: true,
    garageVisible: false,
    cars,
  };
}
