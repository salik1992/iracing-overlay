import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { buildFlags, buildStandings, buildTelemetry } from "../src/frames.js";
import { decodeFlags, lampFlags, sessionStateName } from "../src/flags.js";
import { fixturePath } from "../src/paths.js";
import { normalizeSession } from "../src/session.js";
import { advanceSession, clutchPedal, type HeldSession } from "../src/sources/iracing-source.js";
import type { Tick } from "../src/tick.js";
import { parseTrackLengthMeters } from "../src/track-length.js";

test("a session number change selects the new session without a yaml version change", () => {
  const weekend = {
    WeekendInfo: { TrackLength: "1 km" },
    DriverInfo: { DriverCarIdx: 1, Drivers: [] },
    SessionInfo: {
      Sessions: [
        {
          SessionNum: 0,
          SessionName: "PRACTICE",
          SessionType: "Practice",
          SessionLaps: "unlimited",
          SessionTime: "1800.000 sec",
        },
        {
          SessionNum: 1,
          SessionName: "QUALIFY",
          SessionType: "Lone Qualify",
          SessionLaps: "unlimited",
          SessionTime: "480.000 sec",
        },
        { SessionNum: 2, SessionName: "RACE", SessionType: "Race", SessionLaps: "30", SessionTime: "unlimited" },
      ],
    },
  };
  const empty: HeldSession = { version: null, sessionNum: null, session: null };
  let reads = 0;
  const read = (): unknown => {
    reads += 1;
    return weekend;
  };

  const practice = advanceSession(empty, { version: 4, sessionNum: 0, displayUnits: 1 }, read);
  assert.ok(practice.publish);
  assert.equal(practice.publish.session.session.name, "PRACTICE");
  assert.equal(practice.publish.session.session.type, "Practice");
  assert.equal(practice.publish.version, 4);
  assert.equal(practice.held.sessionNum, 0);

  const qualify = advanceSession(practice.held, { version: 4, sessionNum: 1, displayUnits: 1 }, read);
  assert.ok(qualify.publish);
  assert.equal(qualify.publish.session.session.name, "QUALIFY");
  assert.equal(qualify.publish.session.session.type, "Lone Qualify");
  assert.equal(qualify.publish.session.session.time, "480.000 sec");

  const race = advanceSession(qualify.held, { version: 4, sessionNum: 2, displayUnits: 1 }, read);
  assert.ok(race.publish);
  assert.equal(race.publish.session.session.name, "RACE");
  assert.equal(race.publish.session.session.type, "Race");
  assert.equal(race.publish.session.session.laps, "30");
  assert.equal(race.held.sessionNum, 2);
  assert.equal(race.held.version, 4);

  reads = 0;
  const quiet = advanceSession(race.held, { version: 4, sessionNum: 2, displayUnits: 1 }, read);
  assert.equal(quiet.publish, null);
  assert.equal(reads, 0);

  const imperial = advanceSession(race.held, { version: 4, sessionNum: 2, displayUnits: 0 }, read);
  assert.ok(imperial.publish);
  assert.equal(imperial.publish.session.player.displayUnits, 0);
  assert.equal(imperial.publish.session.session.type, "Race");
  assert.equal(imperial.publish.version, 4);
  assert.equal(reads, 0);

  const failed = advanceSession(empty, { version: 1, sessionNum: 0, displayUnits: 1 }, () => null);
  assert.equal(failed.publish, null);
  assert.equal(failed.held.version, null);
  assert.equal(failed.held.sessionNum, null);

  const practiceOnly = {
    ...weekend,
    SessionInfo: { Sessions: [weekend.SessionInfo.Sessions[0]] },
  };
  const fallback = advanceSession(empty, { version: 1, sessionNum: 2, displayUnits: 1 }, () => practiceOnly);
  assert.ok(fallback.publish);
  assert.equal(fallback.publish.session.session.type, "Practice");
  assert.equal(fallback.held.sessionNum, 2);
  const held = advanceSession(fallback.held, { version: 1, sessionNum: 2, displayUnits: 1 }, read);
  assert.equal(held.publish, null);
});

test("clutch pedal is the complement of iRacing engagement", () => {
  assert.equal(clutchPedal(1), 0);
  assert.equal(clutchPedal(0), 1);
  assert.equal(clutchPedal(0.25), 0.75);
  assert.equal(clutchPedal(null), 0);
});

test("decodes combined session flags, including the high start-light bit", () => {
  assert.deepEqual(decodeFlags(0x4 | 0x20), ["green", "blue"]);
  assert.deepEqual(decodeFlags(0x80000000), ["startGo"]);
  assert.deepEqual(decodeFlags(0), []);
});

test("pace lap keeps the green bit off the digiflag lamp until the lights go", () => {
  const paceGreen = 0x10040004;
  assert.deepEqual(lampFlags(3, paceGreen), ["serviceable", "startHidden"]);
  assert.deepEqual(decodeFlags(paceGreen), ["green", "serviceable", "startHidden"]);
  const ready = 0x20040204;
  assert.equal(lampFlags(3, ready).includes("green"), false);
  const go = 0x80040204;
  assert.deepEqual(lampFlags(3, go), ["green", "oneLapToGreen", "serviceable", "startGo"]);
  assert.equal(lampFlags(4, paceGreen).includes("green"), true);
  const tick = {
    sessionTick: 1,
    sessionNum: 1,
    sessionState: 3,
    sessionTimeRemainSec: 0,
    sessionLapsRemain: 10,
    sessionFlags: paceGreen,
    displayUnits: 0 as const,
    replay: false,
    playerCarIdx: 0,
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
    lapLastSec: 0,
    lapBestSec: 0,
    onTrack: true,
    garageVisible: false,
    cars: [],
  };
  assert.deepEqual(buildFlags(tick).flags, ["serviceable", "startHidden"]);
});

test("names session states", () => {
  assert.equal(sessionStateName(4), "racing");
  assert.equal(sessionStateName(99), "invalid");
});

test("parses track length into meters", () => {
  assert.equal(parseTrackLengthMeters("1.60 km"), 1600);
  assert.equal(parseTrackLengthMeters("400 m"), 400);
  assert.ok(Math.abs((parseTrackLengthMeters("1.50 mi") ?? 0) - 2414.016) < 1e-6);
  assert.equal(parseTrackLengthMeters("nope"), null);
});

test("normalizes the demo session", () => {
  const raw = JSON.parse(readFileSync(fixturePath, "utf8")) as unknown;
  const session = normalizeSession(raw, { sessionNum: 0, displayUnits: 1 });
  assert.ok(session);
  assert.equal(session.weekend.trackDisplayName, "Test Circuit");
  assert.equal(session.weekend.trackLengthMeters, 1600);
  assert.equal(session.player.driverName, "Vit Salomon");
  assert.equal(session.player.carNumber, "22");
  assert.equal(session.player.shiftLight.blinkRpm, 7800);
  assert.equal(session.player.displayUnits, 1);
  assert.equal(session.drivers["2"]?.classColor, "#e10600");
  assert.equal(session.drivers["2"]?.teamName, "Salomon Racing");
  assert.deepEqual(session.tires, ["Dry", "Wet"]);
  assert.equal(session.drivers["0"]?.paceCar, true);
  assert.equal(session.drivers["9"]?.spectator, true);
  assert.equal(session.session.name, "PRACTICE");
  assert.deepEqual(session.session.results, []);
  assert.deepEqual(session.grid, []);
});

test("an ai session fills a blank class name from the car screen name", () => {
  const session = normalizeSession(
    {
      WeekendInfo: { TrackLength: "1 km" },
      DriverInfo: {
        DriverCarIdx: 1,
        Drivers: [
          {
            CarIdx: 1,
            UserName: "Player",
            CarNumber: "22",
            CarClassID: 7,
            CarClassShortName: "",
            CarScreenNameShort: "Cadillac V-Series.R",
            CarScreenName: "Cadillac V-Series.R GTP",
            CarIsAI: 0,
          },
          {
            CarIdx: 2,
            UserName: "AI",
            CarNumber: "3",
            CarClassID: 7,
            CarClassShortName: " ",
            CarScreenNameShort: "Acura ARX-06",
            CarIsAI: 1,
          },
          {
            CarIdx: 3,
            UserName: "GT",
            CarNumber: "8",
            CarClassID: 9,
            CarClassShortName: "GT3",
            CarScreenNameShort: "Ferrari 296 GT3",
            CarIsAI: 1,
          },
          {
            CarIdx: 4,
            UserName: "Blank sibling",
            CarNumber: "9",
            CarClassID: 9,
            CarScreenNameShort: "Porsche 911 GT3 R",
            CarIsAI: 1,
          },
          { CarIdx: 0, UserName: "Pace", CarNumber: "0", CarClassID: 7, CarClassShortName: "Pace", CarIsPaceCar: 1 },
        ],
      },
      SessionInfo: { Sessions: [{ SessionNum: 0, SessionType: "Race" }] },
    },
    { sessionNum: 0, displayUnits: 1 },
  );
  assert.ok(session);
  assert.equal(session.drivers["1"]?.className, "Cadillac V-Series.R");
  assert.equal(session.drivers["2"]?.className, "Acura ARX-06");
  assert.equal(session.drivers["3"]?.className, "GT3");
  assert.equal(session.drivers["4"]?.className, "GT3");
  assert.equal(session.drivers["0"]?.className, "Pace");
});

test("a competitor with no lap time stays after the cars that posted one", () => {
  const session = normalizeSession(
    {
      WeekendInfo: { TrackLength: "1 km" },
      DriverInfo: {
        DriverCarIdx: 1,
        Drivers: [
          { CarIdx: 1, UserName: "Timed", CarNumber: "2", CarClassID: 1, CarClassShortName: "GTP" },
          { CarIdx: 2, UserName: "Waiting", CarNumber: "9", CarClassID: 1, CarClassShortName: "GTP" },
          { CarIdx: 3, UserName: "Garage", CarNumber: "10", CarClassID: 1, CarClassShortName: "GTP" },
          { CarIdx: 0, UserName: "Pace", CarNumber: "0", CarIsPaceCar: 1 },
        ],
      },
      SessionInfo: { Sessions: [{ SessionNum: 0, SessionType: "Practice" }] },
    },
    { sessionNum: 0, displayUnits: 1 },
  );
  assert.ok(session);
  const tick: Tick = {
    sessionTick: 1,
    sessionNum: 0,
    sessionState: 4,
    sessionTimeRemainSec: 0,
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
    cars: [
      car(1, 1, 0),
      { ...car(2, 0, 1), classPosition: 0, lap: 0, lapCompleted: -1, bestLapSec: -1, lastLapSec: -1 },
      { ...car(3, 0, 2), classPosition: 0, lap: 0, lapCompleted: -1, bestLapSec: -1, trackSurface: -1 },
      { ...car(8, 0, 3), trackSurface: -1 },
    ],
  };
  const frame = buildStandings(tick, session);
  assert.deepEqual(
    frame.rows.map((row) => row.carIdx),
    [1, 2, 3],
  );
  assert.equal(frame.rows[0]?.intervalSec, null);
  assert.equal(frame.rows[1]?.bestLapSec, null);
  assert.equal(frame.rows[2]?.driverName, "Garage");
  assert.equal(frame.rows[2]?.bestLapSec, null);
});

test("standings drop pace cars, spectators, and cars not in the world", () => {
  const session = normalizeSession(
    {
      WeekendInfo: { TrackLength: "1 km", TrackDisplayName: "T", SimMode: "fixture" },
      DriverInfo: {
        DriverCarIdx: 2,
        Drivers: [
          { CarIdx: 0, UserName: "Pace Car", CarNumber: "0", CarIsPaceCar: 1 },
          {
            CarIdx: 1,
            UserName: "Ahead",
            CarNumber: "1",
            CarClassID: 10,
            CarClassShortName: "GTP",
            CarClassColor: 255,
          },
          {
            CarIdx: 2,
            UserName: "Player",
            CarNumber: "22",
            CarClassID: 10,
            CarClassShortName: "GTP",
            CarClassColor: 255,
          },
          { CarIdx: 9, UserName: "Watching", CarNumber: "9", IsSpectator: 1 },
        ],
      },
      SessionInfo: {
        Sessions: [{ SessionNum: 2, SessionName: "RACE", SessionType: "Race", SessionLaps: "30", SessionTime: "0" }],
      },
    },
    { sessionNum: 2, displayUnits: 0 },
  );
  assert.ok(session);
  const tick: Tick = {
    sessionTick: 12,
    sessionNum: 2,
    sessionState: 4,
    sessionTimeRemainSec: 100,
    sessionLapsRemain: 8,
    sessionFlags: 0x4,
    displayUnits: 0,
    replay: false,
    playerCarIdx: 2,
    playerEstTimeSec: 0,
    speedMps: 50,
    rpm: 7000,
    gear: 4,
    throttle: 1,
    brake: 0,
    clutch: 0,
    steeringWheelAngleRad: 0,
    steeringWheelAngleMaxRad: 4,
    lap: 3,
    lapCurrentSec: 10,
    lapLastSec: -1,
    lapBestSec: 31.4,
    onTrack: true,
    garageVisible: false,
    cars: [
      car(0, 4, 1),
      car(1, 1, -0.4),
      car(2, 2, 0),
      car(9, 3, 1.2),
      { ...car(4, 5, 2), trackSurface: -1 },
    ],
  };
  const frame = buildStandings(tick, session);
  assert.equal(frame.sessionState, "racing");
  assert.deepEqual(frame.flags, ["green"]);
  assert.deepEqual(
    frame.rows.map((row) => row.carIdx),
    [1, 2],
  );
  assert.equal(frame.rows[0]?.gapToPlayerSec, -0.4);
  assert.equal(frame.rows[0]?.driverName, "Ahead");
  assert.equal(frame.rows[0]?.classColor, "#0000ff");
  assert.equal(frame.rows[0]?.teamName, "");
  assert.equal(frame.rows[0]?.tire, "");
  assert.equal(frame.rows[0]?.pitStops, 0);
  assert.equal(frame.rows[0]?.startClassPosition, 0);
  assert.equal(frame.rows[0]?.intervalSec, null);
  assert.equal(frame.rows[0]?.lapsDown, 0);
  assert.equal(frame.rows[1]?.intervalSec, 0.4);
  assert.equal(frame.rows[1]?.isPlayer, true);
  assert.equal(frame.rows[1]?.lastLapSec, null);

  const telemetry = buildTelemetry(tick);
  assert.equal(telemetry.speedMps, 50);
  assert.equal(telemetry.lapLastSec, null);
  assert.equal(telemetry.lapBestSec, 31.4);
});

function car(carIdx: number, position: number, estTimeSec: number): Tick["cars"][number] {
  return {
    carIdx,
    position,
    classPosition: position,
    lap: 3,
    lapCompleted: 2,
    lapDistPct: 0.5,
    estTimeSec,
    lastLapSec: -1,
    bestLapSec: 30,
    onPitRoad: false,
    trackSurface: 3,
    tireCompound: -1,
  };
}
