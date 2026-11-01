import { connectWidget } from "./connect.js";
import { TEAM_MS } from "./constants.js";
import { manifest } from "./manifest.js";
import { buildBoard } from "./model.js";
import { previewBoard } from "./preview.js";
import type { SessionFields, StandingsWire } from "./types.js";
import { createView } from "./view.js";

const hash = location.hash.replace(/^#/, "");
const pinned = hash === "preview" || hash === "team";
const view = createView(document.body);

let session: SessionFields | null = null;
let frame: StandingsWire | null = null;
let teamOn = false;
let teamTimer: number | null = null;

if (pinned) {
  view.show(previewBoard());
  view.setTeam(hash === "team");
}

connectWidget(manifest.id, {
  onStatus(phase) {
    view.setIdle(phase === "idle");
  },
  onSession(next) {
    if (pinned) {
      return;
    }
    session = next;
    syncTeam(next.teamRacing);
    paint();
  },
  onStandings(next) {
    if (pinned) {
      return;
    }
    frame = next;
    paint();
  },
});

function paint(): void {
  if (!session || !frame) {
    return;
  }
  view.show(buildBoard(session, frame));
}

function syncTeam(enabled: boolean): void {
  if (!enabled) {
    if (teamTimer !== null) {
      window.clearInterval(teamTimer);
      teamTimer = null;
    }
    teamOn = false;
    view.setTeam(false);
    return;
  }
  if (teamTimer !== null) {
    return;
  }
  teamOn = false;
  view.setTeam(false);
  teamTimer = window.setInterval(() => {
    teamOn = !teamOn;
    view.setTeam(teamOn);
  }, TEAM_MS);
}
