import assert from "node:assert/strict";
import { test } from "node:test";

import { FixtureSource } from "../src/sources/fixture-source.js";
import type { Tick } from "../src/tick.js";

test("advance moves the player forward and leaves the car ahead with a negative gap", () => {
  const source = new FixtureSource();
  const ticks: Tick[] = [];
  source.onTick((tick) => {
    ticks.push(tick);
  });
  source.advance(0);
  source.advance(1);
  const first = ticks[0];
  const second = ticks[1];
  assert.ok(first);
  assert.ok(second);
  const before = first.cars.find((car) => car.carIdx === 2);
  const after = second.cars.find((car) => car.carIdx === 2);
  const ahead = second.cars.find((car) => car.carIdx === 1);
  assert.ok(before && after && ahead);
  assert.ok(after.lapDistPct > before.lapDistPct);
  assert.ok(ahead.position < after.position);
  assert.ok(ahead.estTimeSec < after.estTimeSec);
  assert.equal(second.sessionFlags, 0x4);
});

test("start emits the session and then stops cleanly", async () => {
  const source = new FixtureSource();
  let sessions = 0;
  let ticks = 0;
  source.onSession(() => {
    sessions += 1;
  });
  source.onTick(() => {
    ticks += 1;
  });
  await source.start();
  await new Promise((resolve) => {
    setTimeout(resolve, 80);
  });
  await source.stop();
  assert.equal(sessions, 1);
  assert.ok(ticks >= 2);
});
