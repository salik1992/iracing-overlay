import assert from "node:assert/strict";
import { test } from "node:test";

import {
  gearLabel,
  shiftBlinkOn,
  shiftLights,
  speedReadout,
  steerReadout,
  steerUnitText,
  type ShiftLightPoints,
} from "../src/format.js";
import { HISTORY_GAP_MS, HISTORY_MS, pedalPaths, remember, type PedalSample } from "../src/history.js";
import { parseMessage } from "../src/parse.js";

test("gear labels use a digit, N, or R", () => {
  assert.equal(gearLabel(3), "3");
  assert.equal(gearLabel(8), "8");
  assert.equal(gearLabel(0), "N");
  assert.equal(gearLabel(-1), "R");
  assert.equal(gearLabel(Number.NaN), "N");
  assert.equal(gearLabel(1.9), "1");
});

test("steering shows absolute degrees and an L or R unit", () => {
  assert.deepEqual(steerReadout(0), { degrees: "0°", side: "", wheelDeg: 0 });
  const straight = steerReadout((0.4 * Math.PI) / 180);
  assert.equal(straight.degrees, "0°");
  assert.equal(straight.side, "");

  const left = steerReadout(0.35);
  assert.equal(left.side, "L");
  assert.equal(left.degrees, `${Math.round(Math.abs(0.35) * 180 / Math.PI)}°`);
  assert.ok(left.wheelDeg < 0);

  const right = steerReadout(-0.2);
  assert.equal(right.side, "R");
  assert.ok(right.wheelDeg > 0);
  assert.equal(steerReadout(Math.PI / 2).wheelDeg, -90);
  assert.equal(steerUnitText(""), "\u00A0 ");
  assert.equal(steerUnitText("L"), "L ");
  assert.equal(steerUnitText("R"), "R ");
  assert.equal([...steerUnitText("")].length, [...steerUnitText("L")].length);
});

test("speed follows display units and stays positive", () => {
  assert.deepEqual(speedReadout(10, 1), { value: "36", unit: " km/h" });
  assert.deepEqual(speedReadout(10, 0), { value: "22", unit: " mph" });
  assert.equal(speedReadout(-12, 1).value, speedReadout(12, 1).value);
  assert.deepEqual(speedReadout(Number.NaN, 1), { value: "0", unit: " km/h" });
});

test("pedal history keeps five seconds and puts the newest sample on the right", () => {
  const samples: PedalSample[] = [];
  remember(samples, sample(0, 0), 0);
  remember(samples, sample(HISTORY_MS, 1), HISTORY_MS);
  remember(samples, sample(HISTORY_MS + 1, 0.5), HISTORY_MS + 1);
  assert.deepEqual(samples.map((item) => item.at), [HISTORY_MS, HISTORY_MS + 1]);

  const samplesAcross: PedalSample[] = [];
  for (let at = 0; at <= HISTORY_MS; at += 50) {
    samplesAcross.push(sample(at, at / HISTORY_MS));
  }
  const paths = pedalPaths(samplesAcross, HISTORY_MS, "throttle");
  assert.equal(paths.line.startsWith("M0.00,100.00 "), true);
  assert.equal(paths.line.endsWith(" L100.00,0.00"), true);
  assert.equal(paths.line.match(/M/g)?.length, 1);
  assert.deepEqual(pedalPaths([], HISTORY_MS, "brake"), { line: "", area: "" });
});

test("a gap in the pedal history starts a new trace segment", () => {
  const now = HISTORY_MS;
  const paths = pedalPaths(
    [sample(0, 1), sample(HISTORY_GAP_MS, 1), sample(HISTORY_GAP_MS * 3, 0)],
    now,
    "brake",
  );
  assert.equal(paths.line.match(/M/g)?.length, 2);
  assert.equal(paths.area.match(/Z/g)?.length, 2);
});

const demoShift: ShiftLightPoints = {
  firstRpm: 6000,
  shiftRpm: 7000,
  lastRpm: 7500,
  blinkRpm: 7800,
};

test("shift lights fill green, then yellow, then red, and blink at the blink point", () => {
  const lit = (rpm: number, blinkOn = true): number =>
    shiftLights(rpm, demoShift, blinkOn).filter(Boolean).length;

  assert.equal(lit(5999), 0);
  assert.equal(lit(6000), 1);
  assert.equal(lit(6499), 5);
  assert.equal(lit(6500), 6);
  assert.equal(lit(6900), 10);
  assert.equal(lit(7000), 11);
  assert.equal(lit(7400), 15);
  assert.equal(lit(7799), 15);
  assert.equal(lit(7800, true), 15);
  assert.equal(lit(7800, false), 0);
  assert.equal(shiftBlinkOn(0), true);
  assert.equal(shiftBlinkOn(100), false);
  assert.equal(shiftBlinkOn(200), true);

  const early = shiftLights(6500, demoShift, true);
  assert.deepEqual(early.slice(0, 6), [true, true, true, true, true, true]);
  assert.equal(early.slice(6).some(Boolean), false);

  const fallback = shiftLights(6000, { firstRpm: 6000, shiftRpm: 5000, lastRpm: 7500, blinkRpm: 0 }, true);
  assert.equal(fallback.filter(Boolean).length, 1);
  assert.equal(shiftLights(Number.NaN, demoShift, true).some(Boolean), false);
});

test("parse keeps the fields this widget draws", () => {
  assert.deepEqual(parseMessage('{"type":"status","phase":"idle","simMode":null}'), {
    type: "status",
    phase: "idle",
  });
  assert.deepEqual(parseMessage('{"type":"session","version":3,"session":{"player":{"displayUnits":0}}}'), {
    type: "session",
    displayUnits: 0,
    shift: { firstRpm: 0, shiftRpm: 0, lastRpm: 0, blinkRpm: 0 },
  });
  assert.deepEqual(
    parseMessage(
      '{"type":"session","version":3,"session":{"player":{"displayUnits":1,"shiftLight":{"firstRpm":6000,"shiftRpm":7000,"lastRpm":7500,"blinkRpm":7800}}}}',
    ),
    {
      type: "session",
      displayUnits: 1,
      shift: demoShift,
    },
  );
  const telemetry = parseMessage(JSON.stringify({
    type: "telemetry",
    tick: 4,
    frame: {
      speedMps: 41.1,
      rpm: 7000,
      gear: 4,
      throttle: 0.8,
      brake: 0,
      clutch: 0.2,
      steeringWheelAngleRad: 0.1,
      steeringWheelAngleMaxRad: 1,
      lap: 2,
      onTrack: true,
    },
  }));
  assert.deepEqual(telemetry, {
    type: "telemetry",
    frame: {
      speedMps: 41.1,
      rpm: 7000,
      gear: 4,
      throttle: 0.8,
      brake: 0,
      clutch: 0.2,
      steeringWheelAngleRad: 0.1,
    },
  });
  assert.equal(parseMessage("nope"), null);
  assert.equal(parseMessage('{"type":"telemetry","frame":{"speedMps":1}}'), null);
  assert.equal(parseMessage('{"type":"standings","tick":1}'), null);
});

function sample(at: number, value: number): PedalSample {
  return { at, clutch: value, brake: value, throttle: value };
}
