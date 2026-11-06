import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { formatRemain, formatWeather, sessionCounter } from "../src/format.js";
import { parseMessage } from "../src/parse.js";
import type { HeaderSession, HeaderWire } from "../src/types.js";

test("remain clocks drop a negative reading", () => {
  assert.equal(formatRemain(47 * 60 + 12), "47:12");
  assert.equal(formatRemain(3661), "1:01:01");
  assert.equal(formatRemain(1800), "30:00");
  assert.equal(formatRemain(-1), "");
});

test("the counter follows the session limit", () => {
  assert.equal(sessionCounter(session({ laps: "48", time: "unlimited" }), frame({ leaderLap: 23, remain: 10 })), "23/48");
  assert.equal(sessionCounter(session({ laps: "48", time: "unlimited" }), frame({ leaderLap: -1 })), "0/48");
  assert.equal(sessionCounter(session({ laps: "48", time: "unlimited" }), frame({ leaderLap: 0 })), "0/48");
  assert.equal(
    sessionCounter(session({ laps: "25", time: "unlimited" }), frame({ leaderLap: 26, state: "racing" })),
    "25/25",
  );
  assert.equal(
    sessionCounter(session({ laps: "25", time: "unlimited" }), frame({ leaderLap: -1, state: "checkered" })),
    "25/25",
  );
  assert.equal(
    sessionCounter(session({ laps: "25", time: "unlimited" }), frame({ leaderLap: 0, state: "coolDown" })),
    "25/25",
  );
  assert.equal(
    sessionCounter(session({ laps: "unlimited", time: "1800.000 sec" }), frame({ leaderLap: 23, remain: 2832 })),
    "47:12",
  );
  assert.equal(sessionCounter(session({ laps: "unlimited", time: "unlimited" }), frame({ leaderLap: 23, remain: 99999 })), "");
});

test("weather prints air, track, and wind", () => {
  const direction = (241 * Math.PI) / 180;
  assert.equal(
    formatWeather(frame({ leaderLap: 1, airTempC: 27, trackTempC: 41, windVelMps: 4, windDirRad: direction })),
    "AT: 27°C, TT: 41°C, WIND: 4m/s @ 241°",
  );
  assert.equal(
    formatWeather(frame({ leaderLap: 1, airTempC: 26.6, trackTempC: 41.4, windVelMps: 3.5, windDirRad: direction })),
    "AT: 27°C, TT: 41°C, WIND: 4m/s @ 241°",
  );
  assert.equal(
    formatWeather(frame({ leaderLap: 1, windDirRad: -0.1 })),
    "AT: —°C, TT: —°C, WIND: —m/s @ 354°",
  );
  assert.equal(
    formatWeather(frame({ leaderLap: 1 })),
    "AT: —°C, TT: —°C, WIND: —m/s @ —°",
  );
});

test("the bar is 1280 by 28 and centers the counter", () => {
  const css = readFileSync(new URL("../style.css", import.meta.url), "utf8");
  assert.match(css, /\.panel\s*\{[^}]*box-sizing:\s*border-box/);
  assert.match(css, /\.panel\s*\{[^}]*width:\s*1280px/);
  assert.match(css, /\.panel\s*\{[^}]*height:\s*28px/);
  assert.match(css, /\.panel\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s*auto\s*minmax\(0,\s*1fr\)/);
  assert.match(css, /\.type\s*\{[^}]*text-align:\s*start/);
  assert.match(css, /\.type\s*\{[^}]*text-transform:\s*uppercase/);
  assert.match(css, /\.type\s*\{[^}]*color:\s*var\(--fg\)/);
  assert.match(css, /\.counter\s*\{[^}]*text-align:\s*center/);
  assert.match(css, /\.counter\s*\{[^}]*color:\s*var\(--number\)/);
  assert.match(css, /\.weather\s*\{[^}]*text-align:\s*end/);
  assert.match(css, /\.weather\s*\{[^}]*color:\s*var\(--fg\)/);
  assert.match(css, /\.panel\s*\{[^}]*border:\s*none/);
  assert.match(css, /\.panel\s*\{[^}]*border-bottom:\s*1px solid var\(--border\)/);
  assert.doesNotMatch(css, /--panel-alpha/);
});

test("the page reads the session and the weather", () => {
  assert.equal(parseMessage("{"), null);
  assert.equal(parseMessage(JSON.stringify({ type: "standings", frame: { rows: [] } })), null);
  const sessionMessage = parseMessage(
    JSON.stringify({
      type: "session",
      session: {
        weekend: { teamRacing: false },
        session: { type: "Practice", name: "PRACTICE", laps: "unlimited", time: "1800.000 sec" },
      },
    }),
  );
  assert.deepEqual(sessionMessage, {
    type: "session",
    session: { type: "Practice", laps: "unlimited", time: "1800.000 sec" },
  });
  const direction = (241 * Math.PI) / 180;
  const header = parseMessage(
    JSON.stringify({
      type: "header",
      frame: {
        sessionState: "racing",
        sessionTimeRemainSec: 12,
        leaderLap: 23,
        airTempC: 27,
        trackTempC: 41,
        windVelMps: 4,
        windDirRad: direction,
      },
    }),
  );
  assert.deepEqual(header, {
    type: "header",
    frame: {
      sessionState: "racing",
      sessionTimeRemainSec: 12,
      leaderLap: 23,
      airTempC: 27,
      trackTempC: 41,
      windVelMps: 4,
      windDirRad: direction,
    },
  });
  const missing = parseMessage(JSON.stringify({ type: "header", frame: {} }));
  assert.equal(missing?.type, "header");
  if (missing?.type === "header") {
    assert.equal(missing.frame.leaderLap, 0);
    assert.equal(missing.frame.sessionState, "");
    assert.equal(missing.frame.airTempC, null);
    assert.equal(missing.frame.windDirRad, null);
  }
});

function session(patch: Partial<HeaderSession>): HeaderSession {
  return {
    type: patch.type ?? "Practice",
    laps: patch.laps ?? "unlimited",
    time: patch.time ?? "unlimited",
  };
}

function frame(patch: {
  leaderLap: number;
  remain?: number;
  state?: string;
  airTempC?: number | null;
  trackTempC?: number | null;
  windVelMps?: number | null;
  windDirRad?: number | null;
}): HeaderWire {
  return {
    ...(patch.state === undefined ? {} : { sessionState: patch.state }),
    sessionTimeRemainSec: patch.remain ?? 0,
    leaderLap: patch.leaderLap,
    airTempC: patch.airTempC ?? null,
    trackTempC: patch.trackTempC ?? null,
    windVelMps: patch.windVelMps ?? null,
    windDirRad: patch.windDirRad ?? null,
  };
}
