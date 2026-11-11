# iRacing overlay

OBS browser overlays for iRacing. A Node server on the race PC reads the sim and serves one page per widget at `http://127.0.0.1:8080`.

- `/telemetry` shows the inputs and the wheel.
- `/header` shows the session, the clock, and the flags.
- `/standings` shows the tower.
- `/garage` covers the source while the garage is open.

Node.js 22 or newer. On the race PC, run `npm install`, then `npm start`.

Layout and data rules are in [ARCHITECTURE.md](ARCHITECTURE.md). Each widget has its own README. Licensed under MIT.
