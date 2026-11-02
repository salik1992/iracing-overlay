import assert from "node:assert/strict";
import { test } from "node:test";

import { attachSource, Hub } from "../src/hub.js";
import { createOverlayServer, listen } from "../src/http.js";
import { FixtureSource } from "../src/sources/fixture-source.js";
import type { ServerMessage } from "../src/types.js";
import { widgets } from "../src/widgets.js";

test("fixture publishes a joined standings frame", async () => {
  const source = new FixtureSource();
  const hub = new Hub(widgets);
  attachSource(hub, source);
  const app = createOverlayServer({ hub, widgets, sourceName: "fixture" });
  const port = await listen(app.http, 0, "127.0.0.1");
  await source.start();
  try {
    const health = await fetch(`http://127.0.0.1:${port}/health`);
    assert.equal(health.status, 200);
    const body = (await health.json()) as { ok: boolean; source: string; phase: string; clients: number };
    assert.deepEqual(body, { ok: true, source: "fixture", phase: "live", clients: 0 });

    const page = await fetch(`http://127.0.0.1:${port}/standings`);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /\/standings\/index\.js/);

    const messages = await hello(port, "standings", 3);
    assert.equal(messages[0]?.type, "status");
    assert.equal(messages[1]?.type, "session");
    assert.equal(messages[2]?.type, "standings");
    if (messages[2]?.type !== "standings") {
      return;
    }
    assert.deepEqual(
      messages[2].frame.rows.map((row) => row.carNumber),
      ["45", "2", "22"],
    );
    const ahead = messages[2].frame.rows.find((row) => row.carNumber === "2");
    assert.ok(ahead);
    assert.ok((ahead.gapToPlayerSec ?? 0) < 0);
    const player = messages[2].frame.rows.find((row) => row.isPlayer);
    assert.equal(player?.driverName, "Vit Salomon");
    assert.equal(player?.teamName, "Salomon Racing");
    assert.equal(player?.tire, "W");

    const flags = await hello(port, "digiflag", 2);
    assert.equal(flags[0]?.type, "status");
    assert.equal(flags[1]?.type, "flags");
    if (flags[1]?.type !== "flags") {
      return;
    }
    assert.deepEqual(flags[1].frame.flags, ["green"]);

    const garage = await hello(port, "garage", 2);
    assert.equal(garage[0]?.type, "status");
    assert.equal(garage[1]?.type, "garage");
    if (garage[1]?.type !== "garage") {
      return;
    }
    assert.equal(garage[1].frame.visible, false);
  } finally {
    await source.stop();
    await app.close();
  }
});

test("samples telemetry every tick and standings every sixth tick", async () => {
  const source = new FixtureSource();
  const hub = new Hub(widgets);
  attachSource(hub, source);
  const app = createOverlayServer({ hub, widgets, sourceName: "fixture" });
  const port = await listen(app.http, 0, "127.0.0.1");
  const telemetry = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  const standings = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  try {
    const telemetryMessages = collect(telemetry);
    const standingsMessages = collect(standings);
    await opened(telemetry);
    await opened(standings);
    telemetry.send(JSON.stringify({ type: "hello", widgetId: "telemetry" }));
    standings.send(JSON.stringify({ type: "hello", widgetId: "standings" }));
    await telemetryMessages.take(1);
    await standingsMessages.take(1);
    for (let i = 0; i < 6; i += 1) {
      source.advance(0);
    }
    const telemetryFrames = (await telemetryMessages.take(6)).filter((message) => message.type === "telemetry");
    const standingsFrames = (await standingsMessages.take(1)).filter((message) => message.type === "standings");
    assert.equal(telemetryFrames.length, 6);
    assert.equal(standingsFrames.length, 1);
  } finally {
    telemetry.close();
    standings.close();
    await app.close();
  }
});

test("serves the garage cover", async () => {
  const hub = new Hub(widgets);
  const app = createOverlayServer({ hub, widgets, sourceName: "fixture" });
  const port = await listen(app.http, 0, "127.0.0.1");
  try {
    const page = await fetch(`http://127.0.0.1:${port}/garage`);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /\/garage\/index\.js/);

    const cover = await fetch(`http://127.0.0.1:${port}/garage/cover.png`);
    assert.equal(cover.status, 200);
    assert.equal(cover.headers.get("content-type"), "image/png");
    const bytes = Buffer.from(await cover.arrayBuffer());
    assert.equal(bytes.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
  } finally {
    await app.close();
  }
});

test("serves the shared Fira Code file", async () => {
  const hub = new Hub(widgets);
  const app = createOverlayServer({ hub, widgets, sourceName: "fixture" });
  const port = await listen(app.http, 0, "127.0.0.1");
  try {
    const font = await fetch(`http://127.0.0.1:${port}/fonts/FiraCode-VF.woff2`);
    assert.equal(font.status, 200);
    assert.equal(font.headers.get("content-type"), "font/woff2");
    const bytes = Buffer.from(await font.arrayBuffer());
    assert.equal(bytes.subarray(0, 4).toString("ascii"), "wOF2");

    const license = await fetch(`http://127.0.0.1:${port}/fonts/OFL.txt`);
    assert.equal(license.status, 404);
  } finally {
    await app.close();
  }
});

test("closes an unknown widget subscription", async () => {
  const source = new FixtureSource();
  const hub = new Hub(widgets);
  const app = createOverlayServer({ hub, widgets, sourceName: "fixture" });
  const port = await listen(app.http, 0, "127.0.0.1");
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  try {
    const code = new Promise<number>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("close timed out")), 2000);
      ws.addEventListener("close", (event) => {
        clearTimeout(timer);
        resolve(event.code);
      });
    });
    await opened(ws);
    ws.send(JSON.stringify({ type: "hello", widgetId: "missing" }));
    assert.equal(await code, 1008);
  } finally {
    ws.close();
    await source.stop();
    await app.close();
  }
});

function collect(ws: WebSocket): { take(count: number): Promise<ServerMessage[]> } {
  const messages: ServerMessage[] = [];
  const waiters: Array<(message: ServerMessage) => void> = [];
  ws.addEventListener("message", (event) => {
    const message = JSON.parse(String(event.data)) as ServerMessage;
    const waiter = waiters.shift();
    if (waiter) {
      waiter(message);
    } else {
      messages.push(message);
    }
  });
  return {
    take(count: number): Promise<ServerMessage[]> {
      const wanted: ServerMessage[] = [];
      const next = (): Promise<ServerMessage> => {
        const queued = messages.shift();
        if (queued) {
          return Promise.resolve(queued);
        }
        return new Promise((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error("message timed out")), 2000);
          waiters.push((message) => {
            clearTimeout(timer);
            resolve(message);
          });
        });
      };
      return (async () => {
        for (let i = 0; i < count; i += 1) {
          wanted.push(await next());
        }
        return wanted;
      })();
    },
  };
}

async function hello(port: number, widgetId: string, count: number): Promise<ServerMessage[]> {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  const messages = collect(ws);
  try {
    await opened(ws);
    ws.send(JSON.stringify({ type: "hello", widgetId }));
    return await messages.take(count);
  } finally {
    ws.close();
  }
}

function opened(ws: WebSocket): Promise<void> {
  if (ws.readyState === WebSocket.OPEN) {
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("websocket open timed out")), 2000);
    ws.addEventListener("open", () => {
      clearTimeout(timer);
      resolve();
    });
    ws.addEventListener("error", () => {
      clearTimeout(timer);
      reject(new Error("websocket failed"));
    });
  });
}
