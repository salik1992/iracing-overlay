import { connectWidget } from "@salik1992/iracing-overlay-shared/connect";

import { TEAM_MS } from "./constants.js";
import { manifest } from "./manifest.js";
import { buildBoard } from "./model.js";
import { parseMessage } from "./parse.js";
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

connectWidget(manifest.id, parseMessage, (message) => {
  if (message.type === "status") {
    view.setIdle(message.phase === "idle");
    return;
  }
  if (pinned) {
    return;
  }
  if (message.type === "session") {
    session = message.session;
    syncTeam(message.session.teamRacing);
    paint();
    return;
  }
  frame = message.frame;
  paint();
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
