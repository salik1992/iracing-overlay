import { connectWidget } from "@salik1992/iracing-overlay-shared/connect";

import { isFlagName } from "./flags.js";
import { formatWeather, sessionCounter } from "./format.js";
import { manifest } from "./manifest.js";
import { parseMessage } from "./parse.js";
import type { HeaderSession, HeaderWire } from "./types.js";
import { createView } from "./view.js";

const pinned = previewFlag(location.hash);
const view = createView(document.body);

let session: HeaderSession | null = null;
let frame: HeaderWire | null = null;

connectWidget(manifest.id, parseMessage, (message) => {
  if (message.type === "status") {
    view.setIdle(message.phase === "idle");
    return;
  }
  if (message.type === "session") {
    session = message.session;
    paint();
    return;
  }
  frame = message.frame;
  paint();
});

if (pinned) {
  view.showFlags([pinned]);
}

function paint(): void {
  if (!session || !frame) {
    return;
  }
  view.show({
    type: session.type,
    weather: formatWeather(frame),
    counter: sessionCounter(session, frame),
    flags: pinned ? [pinned] : frame.flags,
  });
}

function previewFlag(hash: string): string | null {
  const name = hash.replace("#", "");
  return isFlagName(name) ? name : null;
}
