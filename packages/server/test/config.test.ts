import assert from "node:assert/strict";
import { test } from "node:test";

import { resolvePort, resolveSourceKind } from "../src/config.js";

test("source follows the platform when IRACING_SOURCE is unset", () => {
  assert.equal(resolveSourceKind(undefined, "linux"), "fixture");
  assert.equal(resolveSourceKind("", "linux"), "fixture");
  assert.equal(resolveSourceKind(undefined, "win32"), "iracing");
  assert.equal(resolveSourceKind("iracing", "linux"), "iracing");
  assert.equal(resolveSourceKind("fixture", "win32"), "fixture");
});

test("source rejects unknown values", () => {
  assert.throws(() => resolveSourceKind("yes", "linux"), /IRACING_SOURCE/);
});

test("port defaults to 8080 and stays in range", () => {
  assert.equal(resolvePort(undefined), 8080);
  assert.equal(resolvePort(""), 8080);
  assert.equal(resolvePort("0"), 0);
  assert.equal(resolvePort("8081"), 8081);
  assert.throws(() => resolvePort("8080abc"), /PORT/);
  assert.throws(() => resolvePort("70000"), /PORT/);
  assert.throws(() => resolvePort("-1"), /PORT/);
});
