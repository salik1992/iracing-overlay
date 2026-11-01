# iRacing overlay architecture

Custom overlays for iRacing, shown in OBS through Browser Source. A Node process on the race PC reads the iRacing SDK, serves one HTML page per widget, and streams updates over a websocket. This Linux machine is the development and build machine. The Windows machine that runs iRacing receives the repo through git and needs Node.js, not a C++ toolchain.

## Decisions

* npm workspaces. One package for the server, one shared package, and one package per browser widget.
* Widgets are vanilla functional TypeScript. Each widget creates its DOM once and writes into those nodes when a frame arrives.
* Each widget has its own URL and its own stream rate. The first two are `/telemetry` at 60 Hz and `/standings` at 10 Hz.
* The server reads shared memory once, at the sim's tick, into a snapshot. Widget timers sample that snapshot. Widgets do not read the SDK.
* The websocket carries small, widget-specific messages. Session data is a separate message, sent when the YAML version changes.
* The server binds to `127.0.0.1` only.
* The SDK reader is `irsdk-node`. On Linux the same package loads a mock, and a fixture source feeds the streams.
* The race PC runs `git pull`, `npm install`, and `npm start`. esbuild and the `irsdk-node` native addon both ship prebuilt binaries.
* The overlay is read-only. Camera, replay, pit, and chat commands stay out of this program.
* Values on the wire are SI units. Display formatting lives in the shared package and uses the driver's `DisplayUnits`.

## System

```text
Windows race PC                              OBS
┌──────────────────────────┐                 ┌─────────────────────────┐
│ iRacing                  │                 │ Browser Source          │
│  Local\IRSDKMemMapFileName                 │  http://127.0.0.1:8080/ │
│  60 Hz telemetry + YAML  │                 │  telemetry              │
└────────────▲─────────────┘                 │  standings              │
             │ read                          └────────────▲────────────┘
┌────────────┴─────────────┐                               │ websocket
│ @iracing-overlay/server  │                               │
│  snapshot store          │───────────────────────────────┘
│  static pages            │
└──────────────────────────┘

Linux dev machine
┌──────────────────────────┐
│ same server              │
│  fixture source          │
│  same pages and sockets  │
└──────────────────────────┘
```

OBS never talks to iRacing. The browser page is a normal local web page. Transparency comes from the page itself: `html` and `body` use `background: transparent`.

## Repository

```text
package.json                 workspaces: packages/*
tsconfig.base.json
ARCHITECTURE.md
packages/
  shared/                    @iracing-overlay/shared
  server/                    @iracing-overlay/server
  widget-telemetry/          @iracing-overlay/widget-telemetry
  widget-standings/          @iracing-overlay/widget-standings
```

Root `package.json` is private, with `"workspaces": ["packages/*"]` and `"engines": { "node": ">=22" }`. A `.nvmrc` pins the same major.

| Package | Role |
|---|---|
| `shared` | Protocol types, session and frame types, flag and session-state decode, SI formatters, widget manifest type, the browser stream client. |
| `server` | SDK or fixture source, snapshot store, HTTP routes, websocket fan-out, stream rates. |
| `widget-telemetry` | Page for pedals, gear, steering, speed, rpm, and the driver's lap times. 60 Hz. |
| `widget-standings` | Page for the race order, intervals, pit state, and session clock. 10 Hz. |

A new overlay is a new workspace package. The server keeps an explicit list of widget manifests, so a widget that fails to build fails the server build with it.

```ts
import { manifest as telemetry } from "@iracing-overlay/widget-telemetry";
import { manifest as standings } from "@iracing-overlay/widget-standings";

export const widgets = [telemetry, standings];
```

## Widget package

Each widget package looks the same:

```text
packages/widget-telemetry/
  package.json
  src/manifest.ts          id, route, hz, session flag
  src/main.ts              mount the page and subscribe
  src/view.ts              create DOM once, update nodes from frames
  index.html
  style.css
  dist/                    esbuild output, served as static files
```

`src/manifest.ts` is the contract the server imports:

```ts
import type { WidgetManifest } from "@iracing-overlay/shared";

export const manifest = {
  id: "telemetry",
  route: "/telemetry",
  hz: 60,
  session: true,
} as const satisfies WidgetManifest;
```

`widget-standings` uses `id: "standings"`, `route: "/standings"`, and `hz: 10`.

esbuild bundles `src/main.ts` and everything it imports from `shared` into one `dist/index.js`. The HTML file references that script. OBS Browser Source then needs a single script request and no import map.

The page creates its DOM in `view.ts` and holds onto the nodes. Frame handlers write `textContent`, widths, and transforms. They do not rebuild the tree and they do not assign `innerHTML` on the hot path. 60 Hz makes that rule matter.

`style.css` starts from a shared overlay base: transparent background, `box-sizing: border-box`, and a single font. Each widget owns the rest of its layout. The OBS source's width and height are the widget's viewport.

## Server

One process. Default port `8080`, overridable with `PORT`. Listen address `127.0.0.1`.

HTTP:

| Route | Response |
|---|---|
| `GET /telemetry` | `widget-telemetry` `index.html` |
| `GET /telemetry/index.js`, `style.css` | That widget's built files |
| `GET /standings` | Same pattern for the standings widget |
| `GET /health` | `{ ok, source, clients }` for a quick check on the race PC |

Websocket endpoint: `GET /ws`.

The page sends one hello and then only receives:

```ts
type ClientMessage = {
  type: "hello";
  widgetId: "telemetry" | "standings";
};
```

The server looks up the manifest, remembers the socket's rate and whether it wants session messages, and replies immediately with status, the current session snapshot when the widget sets `session: true`, and the latest frame. OBS tears the page down when the source is hidden, so the page reconnects with backoff and must paint from that first burst.

### Sources

```ts
interface TelemetrySource {
  start(): Promise<void>;
  stop(): Promise<void>;
  onTick(listener: (tick: Tick) => void): void;
  onSession(listener: (session: SessionSnapshot, version: number) => void): void;
  onStatus(listener: (status: SourceStatus) => void): void;
}
```

`IRacingSource` wraps `irsdk-node`. `FixtureSource` replays a recorded session from `packages/server/fixtures/` on a 60 Hz clock. Both produce the same `Tick` and `SessionSnapshot`.

Source selection:

| `IRACING_SOURCE` | Behavior |
|---|---|
| unset on Windows | `IRacingSource`. While the sim is in menus, status stays `idle` and the pages show a waiting state. |
| unset on Linux | `FixtureSource`. |
| `iracing` | `IRacingSource`. |
| `fixture` | `FixtureSource`. |

`npm run dev` sets `IRACING_SOURCE=fixture`. `npm start` leaves the variable unset.

### Snapshot and rates

`irsdk-node` waits on the sim event, about every 16 ms while a session is active. Each successful wait replaces the snapshot:

* The telemetry fields the widgets need, copied out of the latest buffer.
* The session snapshot, replaced only when `sessionInfoUpdate` changes. YAML is parsed on that change, then reduced to `SessionSnapshot`. The raw YAML string is not kept for the browsers.

Delivery follows the sim clock.

* A telemetry subscriber receives every tick, which is 60 Hz while iRacing is producing ticks.
* A standings subscriber receives every sixth tick, which is 10 Hz.
* A session subscriber receives a session message when the version changes, including once on hello.

Paused or disconnected sim means ticks stop. The server then sends `{ type: "status", phase: "idle" }` and the widgets keep the last frame on screen, dimmed, until ticks resume. Sockets with no subscriber do no work for that channel. One shared-memory read serves every OBS source.

### Race-PC run

`irsdk-node` depends on `@irsdk-node/native`, which publishes a Windows binary and a non-Windows mock. esbuild publishes its own binary. `npm install` on the race PC is the step that fetches those binaries. A Visual Studio install is required only when a prebuild for that Node ABI is missing, so Node is pinned and the install is checked once.

Widget TypeScript is bundled by esbuild during `npm install` (`prepare`) and by `npm run build`. The race PC does not run `tsc`.

## Protocol

Messages are JSON text frames. Payloads stay small, so a binary encoding is a later change.

```ts
type ServerMessage =
  | { type: "status"; phase: "idle" | "live" | "replay"; simMode: string | null }
  | { type: "session"; version: number; session: SessionSnapshot }
  | { type: "telemetry"; tick: number; frame: TelemetryFrame }
  | { type: "standings"; tick: number; frame: StandingsFrame };
```

`shared` exports these types and a `connectWidget(widgetId, handlers)` helper used by every page. The helper owns reconnect, the hello message, and the parse step. Widgets see typed callbacks.

`SessionSnapshot` is the normalized slice of the YAML document:

* Weekend: track display name, config, track length in meters, series, event type, `simMode`, team racing, official flag.
* Player: `playerCarIdx`, car number, driver name, shift-light RPM points (`DriverCarSLFirstRPM`, `DriverCarSLShiftRPM`, `DriverCarSLLastRPM`, `DriverCarSLBlinkRPM`), redline, idle RPM, max fuel in liters, `displayUnits`.
* Drivers, keyed by `carIdx`: name, car number, car path, class id, class name, class color, iRating, license string, spectator, pace car, AI.
* Current session: number, name, type, laps or time limit.

`TelemetryFrame`, 60 Hz:

| Field | Source | Notes |
|---|---|---|
| `speedMps` | `Speed` | m/s |
| `rpm` | `RPM` | |
| `gear` | `Gear` | -1 reverse, 0 neutral |
| `throttle`, `brake`, `clutch` | `Throttle`, `Brake`, `Clutch` | 0 to 1 |
| `steeringWheelAngleRad` | `SteeringWheelAngle` | |
| `steeringWheelAngleMaxRad` | `SteeringWheelAngleMax` | scale for the wheel graphic |
| `lap` | `Lap` | |
| `lapCurrentSec`, `lapLastSec`, `lapBestSec` | `LapCurrentLapTime`, `LapLastLapTime`, `LapBestLapTime` | |
| `onTrack` | `IsOnTrack` | |

Shift-light thresholds travel in the session message. The telemetry view caches them.

`StandingsFrame`, 10 Hz, already joined and sorted:

| Field | Source |
|---|---|
| `sessionState` | `SessionState` |
| `sessionTimeRemainSec` | `SessionTimeRemain` |
| `sessionLapsRemain` | `SessionLapsRemainEx` |
| `flags` | `SessionFlags`, decoded to names in `shared` |
| `rows[]` | One row per car that is in the world |

Each row contains `carIdx`, overall position, class position, class name and color, car number, driver name, lap, last and best lap seconds, gap to the player in seconds, `onPitRoad`, track surface, and `isPlayer`.

Gap math uses `CarIdxEstTime`: the estimated time for that car to reach the player's point on the racing line. Subtract the player's value. Negative means ahead. Empty slots, spectators, and the pace car are dropped before send. Class filtering happens in the widget from the class fields, so one stream feeds every filter.

`SessionState` values the standings widget cares about: get in car, warmup, parade laps, racing, checkered, cool down.

## SDK data this design uses

iRacing writes a memory-mapped file, `Local\IRSDKMemMapFileName`, and signals `Local\IRSDKDataValidEvent` on each tick. Two payloads share that file.

* Telemetry variables, about 60 times a second. The variable list is fixed for a session and changes when the car or session changes. `IRacingSource` clears its field cache on each new session.
* A YAML session string. `sessionInfoUpdate` increments when it changes. Drivers joining, results posting, and a session change are typical reasons.

The reader copies the latest of up to four telemetry buffers so a frame is internally consistent. Several readers may attach. This server is the only reader we run.

Fields above are the ones the first two widgets need. The same snapshot store can grow. Further widgets, each in its own package and at its own rate, have a large set available:

* Fuel: `FuelLevel` (liters), `FuelUsePerHour`. Laps of fuel is computed in the server by sampling the level as `LapDistPct` crosses the start/finish line.
* Tires, per corner: tread temperature left/middle/right, wear, hot pressure, cold pressure, wheel speed. Some cars omit sensors. A missing variable stays `null` in the frame.
* Pit: `PitRepairLeft`, `PitOptRepairLeft`, `PlayerCarInPitStall`, queued fuel and tire pressures (`PitSvFuel`, `PitSvLFP`, `PitSvRFP`, `PitSvLRP`, `PitSvRRP`), fast repairs remaining.
* Incidents: `PlayerCarMyIncidentCount`, `PlayerCarDriverIncidentCount`, `PlayerCarTeamIncidentCount`.
* Deltas: `LapDeltaToBestLap`, `LapDeltaToOptimalLap`, `LapDeltaToSessionBestLap`, each with an `_OK` flag. The widget hides the bar when `_OK` is false.
* Weather: air temp, track temp, humidity, wind, skies, `TrackWetness`, `WeatherDeclaredWet`.
* Spotter: `CarLeftRight` (clear, car left, car right, both sides, two left, two right).
* Other cars, live arrays of up to 64: position, class position, lap, lap distance percent, estimated time, gap to leader, last and best lap, gear, RPM, steer, tire compound, on pit road, track surface.
* Camera label while spectating: `CamCarIdx` joined to the driver list. Replay state: `IsReplayPlaying`, `ReplayPlaySpeed`, `ReplaySessionTime`.

`Speed` is m/s. `shared` formats speed, lap time, gaps, and temperatures. `DisplayUnits` from the session selects metric or imperial.

## Limits of the SDK

These bounds are properties of the data iRacing publishes. Widgets should be designed inside them.

* Other cars expose place, lap distance, lap times, gear, RPM, steer, pit state, and tire compound. Their tire temperatures, fuel, brake, throttle, and damage are not in the feed.
* `CarIdxLapDistPct` is distance along the lap. It is not a lateral position. A traffic widget can place cars around a recorded centerline. `CarLeftRight` is the alongside signal. The SDK includes no track map. A map widget needs a polyline recorded from the player car (`Lat`, `Lon`, or velocity integrated with yaw) or drawn by hand. `WeekendInfo.TrackLength` arrives as a string and is parsed into meters in the session snapshot.
* Chat text is not in the feed. `RadioTransmitCarIdx` identifies who is transmitting.
* Season history and results after the session live on iRacing's separate `/data` HTTP API. This program does not call it.
* Replay and spectating publish a thinner set than a live session. Many `CarIdx*` fields and `SessionFlags` are live-only. `simMode` on the status message tells the page which context it is in. Test Drive replaces real names and customer ids with placeholders. In a team race the driver entry for a `carIdx` changes on a driver swap. Heat racing is several sessions in one weekend, selected by session number.
* In-car dials such as brake bias, ABS, and traction control can be read. This program does not write them. The SDK's broadcast commands (cameras, replay, pit service, chat macros) are unused.

Reference for variable behavior across session types: [iRacing SDK Documentation](https://sajax.github.io/irsdkdocs/).

## OBS

One Browser Source per widget.

| Source URL | Rate | Suggested starting size |
|---|---|---|
| `http://127.0.0.1:8080/telemetry` | 60 Hz | 640×200 |
| `http://127.0.0.1:8080/standings` | 10 Hz | 480×640 |

In the source properties: set the width and height to the widget, enable "Shutdown source when not visible", and enable "Refresh browser when scene becomes active". Leave the page background transparent. Custom CSS in the source is unnecessary because each widget ships its own stylesheet.

Several sources share one server process and one shared-memory reader.

## Development

On Linux, `npm run dev` starts the fixture source and the pages. Open the two URLs in a browser. The fixture is a captured live tick stream plus one session snapshot, checked into `packages/server/fixtures/`, so standings and telemetry both move. An `.ibt` file can later drive the player's own car, because the file uses the same row layout. It is a weak standings fixture: most `CarIdx*` arrays are omitted from disk telemetry.

On the race PC, `npm start` attaches to iRacing. The first real session is also how a fixture gets recorded: a server flag writes the reduced ticks and the session snapshot, and that file comes back through git.

Unit tests for gap math, flag decode, lap-time format, and the fixture clock run on Linux with the fixture source. Widget layout is checked by opening the pages against that server.

## Adding a widget

1. Create `packages/widget-<name>` with a manifest (`id`, `route`, `hz`, `session`).
2. Add the frame type to `shared` and the field copy to the snapshot in `server`.
3. Register the manifest in the server's widget list.
4. Build a view that creates its DOM once.
5. Add an OBS Browser Source pointed at the route.

## Out of scope

* Sending commands into the sim.
* The iRacing `/data` REST API.
* A track map, until a widget needs a stored centerline.
* Accounts, remote access, or binding to anything other than localhost.
* A frontend framework.
