import assert from "node:assert/strict";
import { test } from "node:test";

import { asFinite, asFiniteOr, asRecord, asText, parseRecord, parseStatus } from "../src/json.js";

test("parseRecord keeps JSON objects", () => {
  assert.deepEqual(parseRecord('{"a":1}'), { a: 1 });
  assert.equal(parseRecord("nope"), null);
  assert.equal(parseRecord("[]"), null);
  assert.equal(parseRecord("null"), null);
});

test("parseStatus accepts the three overlay phases", () => {
  assert.deepEqual(parseStatus("idle"), { type: "status", phase: "idle" });
  assert.deepEqual(parseStatus("live"), { type: "status", phase: "live" });
  assert.deepEqual(parseStatus("replay"), { type: "status", phase: "replay" });
  assert.equal(parseStatus("green"), null);
});

test("readers keep finite numbers, strings, and plain objects", () => {
  assert.equal(asFinite(1.5), 1.5);
  assert.equal(asFinite(Number.NaN), null);
  assert.equal(asFinite("1"), null);
  assert.equal(asFiniteOr("1", 4), 4);
  assert.equal(asFiniteOr(2, 4), 2);
  assert.equal(asText("ab"), "ab");
  assert.equal(asText(1), "");
  assert.equal(asRecord(null), null);
  assert.equal(asRecord([]), null);
  assert.deepEqual(asRecord({ ok: true }), { ok: true });
});
