import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
  BLINK_HALF_MS,
  FADE_MS,
  FLAG_NAMES,
  motionOf,
  paintDot,
  shownFlag,
  SWAP_HOLD_MS,
  SWAP_TRANSITION_MS,
} from "../src/flags.js";
import { coveCells, dotScale, MATRIX_N } from "../src/geometry.js";
import { LED } from "../src/leds.js";
import { parseMessage } from "../src/parse.js";

test("cove 16 keeps the corner cap", () => {
  const cells = coveCells();
  assert.equal(MATRIX_N, 16);
  assert.equal(cells.length, 53);
  assert.equal(Math.round(dotScale(0) * 100), 62);
  assert.equal(Math.round(dotScale(1) * 100), 34);
  const corner = cells.find((cell) => cell.row === 0 && cell.col === 15);
  assert.ok(corner);
  assert.ok(corner.dist < 0.1);
  assert.equal(cells.some((cell) => cell.row === 8 && cell.col === 8), false);
});

test("flag names match the server decoder", () => {
  const source = readFileSync(new URL("../../server/src/flags.ts", import.meta.url), "utf8");
  const declared = [...source.matchAll(/0x[0-9a-fA-F]+, "([A-Za-z]+)"/g)].map((match) => match[1]);
  assert.deepEqual(declared, [...FLAG_NAMES]);
});

test("one lamp wins, and non-flag bits stay dark", () => {
  assert.equal(shownFlag(["green", "serviceable", "startHidden"]), "green");
  assert.equal(shownFlag(["green", "blue"]), "blue");
  assert.equal(shownFlag(["yellow", "yellowWaving"]), "yellowWaving");
  assert.equal(shownFlag(["green", "checkered"]), "checkered");
  assert.equal(shownFlag(["debris", "caution"]), "caution");
  assert.equal(shownFlag(["serviceable"]), null);
  assert.equal(shownFlag(["dqScoringInvalid", "startHidden"]), null);
  assert.equal(shownFlag(["green", "startReady", "startSet", "fiveToGo", "tenToGo", "oneLapToGreen"]), null);
  assert.equal(shownFlag(["green", "greenHeld", "startReady"]), null);
  assert.equal(shownFlag(["green", "startSet"]), null);
  assert.equal(shownFlag(["greenHeld"]), null);
  assert.equal(shownFlag(["green", "greenHeld"]), "greenHeld");
  assert.equal(shownFlag(["startGo", "green", "oneLapToGreen"]), "startGo");
  assert.equal(shownFlag(["startGo", "greenHeld", "green"]), "greenHeld");
  assert.equal(shownFlag(["startReady", "startSet", "fiveToGo", "tenToGo", "oneLapToGreen"]), null);
  assert.equal(shownFlag([]), null);
});

test("waving and warning lamps blink, debris and checkered swap", () => {
  for (const name of ["blue", "yellowWaving", "cautionWaving", "randomWaving", "furled", "disqualify"] as const) {
    assert.equal(motionOf(name), "blink");
  }
  assert.equal(motionOf("checkered"), "swap");
  assert.equal(motionOf("debris"), "swap");
  assert.equal(motionOf("green"), "static");
  assert.equal(motionOf("yellow"), "static");
  assert.equal(motionOf("repair"), "static");
  assert.equal(motionOf("white"), "static");
});

test("checkered and debris trade colors, repair keeps a black ball", () => {
  const even = { row: 0, col: 14, dist: 0 };
  const odd = { row: 0, col: 15, dist: 0 };
  assert.deepEqual(paintDot("checkered", even), { a: LED.white, b: LED.black, dark: true });
  assert.deepEqual(paintDot("checkered", odd), { a: LED.black, b: LED.white, dark: true });
  assert.deepEqual(paintDot("debris", even), { a: LED.yellow, b: LED.red, dark: false });
  assert.deepEqual(paintDot("debris", odd), { a: LED.red, b: LED.yellow, dark: false });

  const ball = paintDot("repair", { row: 3, col: 12, dist: 0 });
  const field = paintDot("repair", { row: 0, col: 15, dist: 0 });
  assert.equal(ball.a, LED.black);
  assert.equal(field.a, LED.orange);

  const slash = paintDot("crossed", { row: 0, col: 15, dist: 0 });
  const fieldWhite = paintDot("crossed", { row: 0, col: 13, dist: 0 });
  assert.equal(slash.a, LED.black);
  assert.equal(fieldWhite.a, LED.white);
  assert.equal(paintDot("green", even).a, LED.green);
});

test("fade, hold, and blink timings are the ones on the stylesheet", () => {
  const css = readFileSync(new URL("../style.css", import.meta.url), "utf8");
  const period = (SWAP_HOLD_MS + SWAP_TRANSITION_MS) * 2;
  assert.equal(FADE_MS, 200);
  assert.equal(SWAP_HOLD_MS, 800);
  assert.equal(SWAP_TRANSITION_MS, 200);
  assert.equal(BLINK_HALF_MS, 500);
  assert.match(css, new RegExp(`transition: opacity ${FADE_MS}ms linear`));
  assert.match(css, new RegExp(`flag-swap ${period}ms linear infinite`));
  assert.match(css, new RegExp(`flag-blink ${BLINK_HALF_MS * 2}ms linear infinite`));
  assert.match(css, /0%,\s*40%/);
  assert.match(css, /50%,\s*90%/);
});

test("parses a flags frame and ignores other widget messages", () => {
  assert.deepEqual(parseMessage(JSON.stringify({ type: "flags", tick: 4, frame: { flags: ["green", "blue"] } })), {
    type: "flags",
    flags: ["green", "blue"],
  });
  assert.deepEqual(parseMessage(JSON.stringify({ type: "status", phase: "idle" })), {
    type: "status",
    phase: "idle",
  });
  assert.equal(parseMessage(JSON.stringify({ type: "telemetry", frame: { speedMps: 1 } })), null);
  assert.equal(parseMessage(JSON.stringify({ type: "flags", frame: { flags: [1] } })), null);
  assert.equal(parseMessage("nope"), null);
});
