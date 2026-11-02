# iRacing overlay architecture

Custom overlays for iRacing, shown in OBS through Browser Source. A Node process on the race PC reads the iRacing SDK, serves one HTML page per widget, and streams updates over a websocket. This Linux machine is the development and build machine. The Windows machine that runs iRacing receives the repo through git and needs Node.js, not a C++ toolchain.

## Decisions

* npm workspaces. One package for the server, one shared package, and one package per browser widget.
* Widgets are vanilla functional TypeScript. Each widget creates its DOM once and writes into those nodes when a frame arrives.
* Each widget has its own URL and its own stream rate. `/telemetry` is 60 Hz. `/digiflag` and `/standings` are 10 Hz.
* The server reads shared memory once, at the sim's tick, into a snapshot. Widget timers sample that snapshot. Widgets do not read the SDK.
* The websocket carries small, widget-specific messages. Session data is a separate message, sent when the YAML version changes.
* The server binds to `127.0.0.1` only.
* The SDK reader is `irsdk-node`. On Linux the same package loads a mock, and a fixture source feeds the streams.
* The race PC runs `git pull`, `npm install`, and `npm start`. esbuild and the `irsdk-node` native addon both ship prebuilt binaries.
* The overlay is read-only. Camera, replay, pit, and chat commands stay out of this program.
* Values on the wire are SI units. Display formatting lives in the shared package and uses the driver's `DisplayUnits`.
* Shared visuals are a terminal panel: Fira Code, the Tokyo Night Night palette, and a flat translucent fill on a transparent page. Widget READMEs own layout. Digiflag is the exception: a lamp matrix with no panel, in signal colors.

## System

```text
Windows race PC                              OBS
┌──────────────────────────┐                 ┌─────────────────────────┐
│ iRacing                  │                 │ Browser Source          │
│  Local\IRSDKMemMapFileName                 │  http://127.0.0.1:8080/ │
│  60 Hz telemetry + YAML  │                 │  telemetry              │
└────────────▲─────────────┘                 │  digiflag               │
             │ read                          │  standings              │
             │                               └────────────▲────────────┘
┌────────────┴───────────────────────┐                     │ websocket
│ @salik1992/iracing-overlay-server  │─────────────────────┘
│  snapshot store                    │
│  static pages                      │
└────────────────────────────────────┘

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
package.json                 @salik1992/iracing-overlay-monorepo
tsconfig.base.json
ARCHITECTURE.md
packages/
  shared/                    @salik1992/iracing-overlay-shared
  server/                    @salik1992/iracing-overlay-server
  widget-telemetry/          @salik1992/iracing-overlay-widget-telemetry
  widget-digiflag/           @salik1992/iracing-overlay-widget-digiflag
  widget-standings/          @salik1992/iracing-overlay-widget-standings
```

Every package is private. Root `package.json` is `@salik1992/iracing-overlay-monorepo`, with `"workspaces": ["packages/*"]` and `"engines": { "node": ">=22" }`. A `.nvmrc` pins the same major.

| Package | Role |
|---|---|
| `shared` | Theme tokens, the base stylesheet, the widget manifest, the websocket client, and the JSON readers. |
| `server` | SDK or fixture source, snapshot store, HTTP routes, websocket fan-out, stream rates. |
| `widget-telemetry` | Numeral page for pedals, steering angle, speed, and gear. 60 Hz. |
| `widget-digiflag` | Cove 16 lamp matrix for session flags, with no panel. 10 Hz. |
| `widget-standings` | Page for the race order, intervals, pit state, and session clock. 10 Hz. |

A new overlay is a new workspace package. The server keeps an explicit list of widget manifests, so a widget that fails to build fails the server build with it.

```ts
import { manifest as digiflag } from "@salik1992/iracing-overlay-widget-digiflag";
import { manifest as standings } from "@salik1992/iracing-overlay-widget-standings";
import { manifest as telemetry } from "@salik1992/iracing-overlay-widget-telemetry";

export const widgets = [
  { ...telemetry, staticDir: "packages/widget-telemetry/dist" },
  { ...digiflag, staticDir: "packages/widget-digiflag/dist" },
  { ...standings, staticDir: "packages/widget-standings/dist" },
];
```

`staticDir` is added by the server. The widget manifest does not know where the files are written.

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
import type { WidgetManifest } from "@salik1992/iracing-overlay-shared";

export const manifest = {
  id: "telemetry",
  route: "/telemetry",
  hz: 60,
  session: true,
} as const satisfies WidgetManifest;
```

`widget-standings` uses `id: "standings"`, `route: "/standings"`, and `hz: 10`.

esbuild bundles `src/main.ts` and everything it imports from `shared` into one `dist/index.js`. Each widget runs `packages/shared/scripts/build-widget.mjs`. The HTML file references that script. OBS Browser Source then needs a single script request and no import map.

The page creates its DOM in `view.ts` and holds onto the nodes. Frame handlers write `textContent`, widths, and transforms. They do not rebuild the tree and they do not assign `innerHTML` on the hot path. 60 Hz makes that rule matter.

`style.css` imports the shared base stylesheet and then only describes that widget's layout. The OBS source's width and height are the widget's viewport. Type, color, and the panel are specified under Shared visuals.

## Shared visuals

The page background stays transparent. The visible chrome is one terminal panel: Fira Code, Tokyo Night Night, and a flat translucent fill. A widget README owns that widget's layout, including which fields exist, column order, meters, and shift lights. It does not choose a font, a palette, or a second background treatment.

### Font

Fira Code 6.2 is vendored. The race PC does not have the font installed, and the pages do not load a CDN.

```text
packages/shared/fonts/
  FiraCode-VF.woff2          variable roman, weight axis 300–700, 113 KB
  OFL.txt                    SIL Open Font License 1.1
```

The variable file is the one the browser needs. Static OTF, TTF, and WOFF copies stay out of the repo. The OFL requires the license to travel with the font, so `OFL.txt` is the upstream `LICENSE` from the 6.2 tag.

The server serves `GET /fonts/FiraCode-VF.woff2` from that directory. Every widget points at that one URL. `font-display: block` keeps OBS from flashing a fallback face when a scene activates.

```css
@font-face {
  font-family: "Fira Code";
  src: url("/fonts/FiraCode-VF.woff2") format("woff2");
  font-weight: 300 700;
  font-style: normal;
  font-display: block;
}
```

Shared text is weight 400. A widget's primary figure, the one number that should read first, is weight 600. There is no italic. The default is 14px with line-height 1.25. A widget may set `--font-size` on its own root when the OBS source is an unusual size. It does not introduce another family or another size scale.

Ligatures are off (`font-variant-ligatures: none`). A HUD is not source code. The slashed zero is on (`font-feature-settings: "zero"`), so a car number or a lap time does not mix `0` with `O`.

The file includes Fira Code's box-drawing and its progress-bar glyphs (U+EE00–U+EE0B). A widget may use the progress glyphs for a meter. The shared sheet does not style them.

### Palette

Tokyo Night, the Night variant (`#1a1b26` background). Storm, Moon, and Day are not used. Widgets use role tokens. A Tokyo Night hex is written only in the shared token file.

| Token | Hex | Role |
|---|---|---|
| `--bg` | `#1a1b26` | Panel fill, before alpha |
| `--fg` | `#c0caf5` | Values and body text |
| `--muted` | `#565f89` | Labels |
| `--dim` | `#737aa2` | Units and secondary text |
| `--border` | `#414868` | Outer frame. Terminal black, so the frame stays visible on the translucent fill |
| `--rule` | `#3b4261` | Rules inside the frame |
| `--accent` | `#7aa2f7` | Player row, selection |
| `--good` | `#9ece6a` | Faster, gain, personal best |
| `--bad` | `#f7768e` | Slower, loss, warning |
| `--caution` | `#e0af68` | Caution, pits, yellow flag |
| `--info` | `#7dcfff` | Neutral status, session clock |
| `--number` | `#ff9e64` | The primary figure. Tokyo Night's number color |

Colors the theme defines and this table does not (purple, magenta, teal, the blue ramp) are not tokens. A widget that needs a new role adds it here, rather than pasting a hex into its stylesheet.

Class color is the session's own hex. Shared styles do not remap it onto this palette.

### Opacity

`html` and `body` use `background: transparent`. The track shows through everywhere the panel does not cover.

The panel fill is `--bg` at `--panel-alpha: 0.82`, exposed as `--panel`. Text, borders, and role colors stay fully opaque, so the glyphs do not blend into the track. There is no backdrop blur and no gradient. A washed-out scene is handled by raising `--panel-alpha`, not by changing the text color.

```css
:root {
  --bg: #1a1b26;
  --panel-alpha: 0.82;
  --panel: rgb(26 27 38 / var(--panel-alpha));
  --idle-opacity: 0.55;
  --font-family: "Fira Code", monospace;
  --font-size: 14px;
  --line-height: 1.25;
  --font-weight: 400;
  --font-weight-strong: 600;
}
```

When status `phase` is `"idle"`, the page adds `is-idle` to the panel. That class sets `opacity: var(--idle-opacity)` on the whole panel, text included, and leaves the last frame in place. The fill alpha compounds with it (0.82 × 0.55). Widgets do not invent a second dim.

### Frame

Chrome is one shared panel, drawn with CSS borders rather than box-drawing characters. A border stays put when a value changes width. That matters at 60 Hz.

```css
.panel {
  box-sizing: border-box;
  background: var(--panel);
  color: var(--fg);
  border: 1px solid var(--border);
  padding: 0.5ch 1ch;
  font-family: "Fira Code", monospace;
  font-size: var(--font-size);
  line-height: var(--line-height);
  font-weight: 400;
  font-variant-ligatures: none;
  font-feature-settings: "zero";
  user-select: none;
}

.panel.is-idle {
  opacity: var(--idle-opacity);
}
```

Corners are square. There is no shadow and no radius. `.panel-title` is a muted label with a 1px rule in `--rule`. `.label` uses `--muted`, `.unit` uses `--dim`, and `.figure` is the primary figure (`--number` at weight 600). Horizontal padding is in `ch`, so columns share the character grid. `user-select: none` keeps a click in OBS from highlighting a lap time.

### Where the files live

```text
packages/shared/
  fonts/FiraCode-VF.woff2
  fonts/OFL.txt
  src/theme/tokens.css       custom properties, the only hex values
  src/theme/base.css         font-face, page reset, .panel, .is-idle
  src/theme/tokens.ts        the same roles, for SVG or canvas drawing
```

`base.css` imports `tokens.css`. A widget `style.css` imports `base.css` and then only adds layout. esbuild emits one `style.css` per widget, so OBS still requests a single stylesheet plus the font.

`tokens.ts` repeats the same roles for a widget that draws into SVG or canvas. The two files carry the same values. A widget does not declare its own color.

### Left to each widget

`packages/widget-<name>/README.md` owns the layout: fields, column order, meters, shift lights, and which role a number uses. The shared sheet gives it the font, the tokens, the panel, and the idle dim.

## Server

One process. Default port `8080`, overridable with `PORT`. Listen address `127.0.0.1`.

HTTP:

| Route | Response |
|---|---|
| `GET /telemetry` | `widget-telemetry` `index.html` |
| `GET /telemetry/index.js`, `style.css` | That widget's built files |
| `GET /standings` | Same pattern for the standings widget |
| `GET /health` | `{ ok, source, clients }` for a quick check on the race PC |
| `GET /fonts/FiraCode-VF.woff2` | The shared Fira Code file, from `packages/shared/fonts/` |

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
* The session snapshot. YAML is parsed when `sessionInfoUpdate` changes and when telemetry `SessionNum` changes, then reduced to `SessionSnapshot`. The weekend YAML already lists practice, qualifying, and the race, so moving between them selects the matching record while the version stays the same. The raw YAML string is not kept for the browsers.

Delivery follows the sim clock.

* A telemetry subscriber receives every tick, which is 60 Hz while iRacing is producing ticks.
* A standings subscriber receives every sixth tick, which is 10 Hz.
* A digiflag subscriber receives that same sixth tick. The frame is the decoded flag names. On the pace lap, `green` and `greenHeld` are left out until `startGo`, so the matrix stays dark until the flying start.
* A session subscriber receives a session message when the snapshot changes, including once on hello. The snapshot changes on a new YAML version and on a new telemetry session number.

Paused or disconnected sim means ticks stop. The server then sends `{ type: "status", phase: "idle" }` and the widgets keep the last frame on screen, dimmed with the shared `is-idle` class, until ticks resume. Sockets with no subscriber do no work for that channel. One shared-memory read serves every OBS source.

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
  | { type: "standings"; tick: number; frame: StandingsFrame }
  | { type: "flags"; tick: number; frame: FlagsFrame };
```

These types still live in the server. `shared` exports the `WidgetManifest` type, the websocket client, and the JSON readers. The client sends hello, reconnects, and hands each text frame to the page. The telemetry page parses the status, the session units, the shift-light RPM points, and the telemetry fields it draws. The digiflag page parses the status and the flag names. The standings page parses the status, the session type, the lap and time limits, the team-racing flag, and the standings frame. `FlagsFrame` is `flags: string[]`, the same names standings carries.

`SessionSnapshot` is the normalized slice of the YAML document:

* Weekend: track display name, config, track length in meters, series, event type, `simMode`, team racing, official flag.
* Player: `playerCarIdx`, car number, driver name, shift-light RPM points (`DriverCarSLFirstRPM`, `DriverCarSLShiftRPM`, `DriverCarSLLastRPM`, `DriverCarSLBlinkRPM`), redline, idle RPM, max fuel in liters, `displayUnits`.
* Drivers, keyed by `carIdx`: name, car number, team name, car path, class id, class name, class color, iRating, license string, spectator, pace car, AI. The class name is `CarClassShortName`. An AI session leaves that blank, so a competing car uses the short name already published for its class, and otherwise `CarScreenNameShort` or `CarScreenName`.
* Tire catalog: `DriverInfo.TireCompounds` when the session publishes it, indexed by `CarIdxTireCompound`.
* Current session: number, name, type, laps or time limit, chosen by telemetry `SessionNum`.

`TelemetryFrame`, 60 Hz:

| Field | Source | Notes |
|---|---|---|
| `speedMps` | `Speed` | m/s |
| `rpm` | `RPM` | Fifteen shift lights on the telemetry page. The session message carries the four RPM points. |
| `gear` | `Gear` | -1 reverse, 0 neutral |
| `throttle`, `brake` | `Throttle`, `Brake` | 0 released to 1 pressed |
| `clutch` | `Clutch` | 0 released to 1 pressed. The SDK publishes engagement, so this is one minus `Clutch`. |
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
| `rows[]` | One row per competitor, including a car that has not posted a lap |

Each row contains `carIdx`, overall position, class position, class name and color, car number, driver name, team name, lap, last and best lap seconds, gap to the player in seconds, class interval in seconds, laps down to the class leader, tire letter, pit stops observed since the server attached, class position at the start of racing, `onPitRoad`, track surface, and `isPlayer`.

Overall position stays the position iRacing publishes. In a race, once the state is racing, each class is ordered by laps completed plus the fraction of the current lap (`CarIdxLapCompleted` + `CarIdxLapDistPct`). That order is the class position on the row, and the interval is the estimated-time gap to the car now ahead, so a pass shows up where it happens. Parade laps keep iRacing's class position. Under the checkered flag the live order continues until the results leader completes another lap. Cars that have taken the flag then lock to `ResultsPositions`, and cars still running stay in live order. The lock reads the latest session YAML, so it follows the official classification as the sim updates it. A car towed into its pit stall keeps the progress it had on track. Practice, qualifying, warmup, and any session that is not a race keep iRacing's class position. That session type is the YAML record selected by telemetry `SessionNum`.

Gap to the player uses `CarIdxEstTime`: the estimated time for that car to reach the player's point on the racing line. Subtract the player's value. Negative means ahead. The class interval is the difference of those gaps between a car and the class car ahead. The class leader's interval is null. Laps down compares lap and lap distance percent with the class leader, and drops one when the car is further through the lap than the leader. Empty slots, spectators, and the pace car are dropped before send. A joined car with no best lap stays in its class, after the cars that have posted one, and does not become the class leader.

The SDK does not publish a pit-stop count or a grid position. Pit stops count a rising edge of track surface `InPitStall` after the server has already seen that car, and the count resets when the session number changes. A stall already in progress on the first sight of the car stays uncounted. The arrow baseline is iRacing's class position on the first tick whose session state is racing, including a server that attaches after the green flag, so the delta opens at zero. Cars that appear later take their first seen official class position. The arrow compares that baseline with the class position on the row.

The tire letter is the first letter of the catalog name when `DriverInfo.TireCompounds` names that index. Without a catalog, index 0 is D and index 1 is W. Any other index is blank.

The standings page draws the Composite layout from this frame and retunes each class color toward Tokyo Night Night. Column order, the row window, and the team-name cycle live in `packages/widget-standings/README.md`.

`SessionState` values the standings widget cares about: get in car, warmup, parade laps, racing, checkered, cool down.

## SDK data this design uses

iRacing writes a memory-mapped file, `Local\IRSDKMemMapFileName`, and signals `Local\IRSDKDataValidEvent` on each tick. Two payloads share that file.

* Telemetry variables, about 60 times a second. The variable list is fixed for a session and changes when the car or session changes. `IRacingSource` clears its field cache on each new session.
* A YAML session string. `sessionInfoUpdate` increments when the string changes. Drivers joining and results posting are typical reasons. Practice, qualifying, and the race are records in that string. Telemetry `SessionNum` selects the current one, and that number changes without a new YAML version.

The reader copies the latest of up to four telemetry buffers so a frame is internally consistent. Several readers may attach. This server is the only reader we run.

Fields above are the ones the first two widgets need. The same snapshot store can grow. Further widgets, each in its own package and at its own rate, have a large set available:

* Fuel: `FuelLevel` (liters), `FuelUsePerHour`. Laps of fuel is computed in the server by sampling the level as `LapDistPct` crosses the start/finish line.
* Tires, per corner: tread temperature left/middle/right, wear, hot pressure, cold pressure, wheel speed. Some cars omit sensors. A missing variable stays `null` in the frame.
* Pit: `PitRepairLeft`, `PitOptRepairLeft`, `PlayerCarInPitStall`, queued fuel and tire pressures (`PitSvFuel`, `PitSvLFP`, `PitSvRFP`, `PitSvLRP`, `PitSvRRP`), fast repairs remaining.
* Incidents: `PlayerCarMyIncidentCount`, `PlayerCarDriverIncidentCount`, `PlayerCarTeamIncidentCount`.
* Deltas: `LapDeltaToBestLap`, `LapDeltaToOptimalLap`, `LapDeltaToSessionBestLap`, each with an `_OK` flag. The widget hides the bar when `_OK` is false.
* Weather: air temp, track temp, humidity, wind, skies, `TrackWetness`, `WeatherDeclaredWet`.
* Spotter: `CarLeftRight` (clear, car left, car right, both sides, two left, two right).
* Other cars, live arrays of up to 64: position, class position, lap, laps completed, lap distance percent, estimated time, gap to leader, last and best lap, gear, RPM, steer, tire compound, on pit road, track surface.
* Camera label while spectating: `CamCarIdx` joined to the driver list. Replay state: `IsReplayPlaying`, `ReplayPlaySpeed`, `ReplaySessionTime`.

`Speed` is m/s. The telemetry page formats it from `DisplayUnits`: metric is km/h, imperial is mph. Lap time, gaps, and temperatures stay in SI until a widget draws them.

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
| `http://127.0.0.1:8080/telemetry` | 60 Hz | 440×176 |
| `http://127.0.0.1:8080/digiflag` | 10 Hz | 288×288 |
| `http://127.0.0.1:8080/standings` | 10 Hz | 480×640 |

In the source properties: set the width and height to the widget, enable "Shutdown source when not visible", and enable "Refresh browser when scene becomes active". Leave the page background transparent. Custom CSS in the source is unnecessary because each widget ships its own stylesheet.

Several sources share one server process and one shared-memory reader.

## Development

On Linux, `npm run dev` starts the fixture source and the pages. Open `/telemetry`, `/digiflag`, and `/standings` in a browser. The fixture is a short practice at Test Circuit, checked into `packages/server/fixtures/demo.json`, so the pages move without the sim. An `.ibt` file can later drive the player's own car, because the file uses the same row layout. The demo field is three cars. `/standings#preview` paints a generated multiclass race through the same layout.

On the race PC, `npm start` attaches to iRacing. The first real session is also how a fixture gets recorded: a server flag writes the reduced ticks and the session snapshot, and that file comes back through git.

Unit tests for gap math, flag decode, lap-time format, and the fixture clock run on Linux with the fixture source. Widget layout is checked by opening the pages against that server.

## Adding a widget

1. Create `packages/widget-<name>` with a manifest (`id`, `route`, `hz`, `session`).
2. Add the frame type to `shared` and the field copy to the snapshot in `server`.
3. Register the manifest in the server's widget list.
4. Build a view that creates its DOM once, on the shared panel.
5. Add an OBS Browser Source pointed at the route.

## Out of scope

* Sending commands into the sim.
* The iRacing `/data` REST API.
* A track map, until a widget needs a stored centerline.
* Accounts, remote access, or binding to anything other than localhost.
* A frontend framework.
