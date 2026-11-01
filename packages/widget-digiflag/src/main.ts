import { connectWidget } from "@salik1992/iracing-overlay-shared/connect";

import { isFlagName } from "./flags.js";
import { manifest } from "./manifest.js";
import { parseMessage } from "./parse.js";
import { createView } from "./view.js";

const pinned = previewFlag(location.hash);
const view = createView(document.body);

connectWidget(manifest.id, parseMessage, (message) => {
  if (message.type === "status") {
    view.setIdle(message.phase === "idle");
    return;
  }
  if (pinned) {
    return;
  }
  view.show(message.flags);
});

if (pinned) {
  view.show([pinned]);
}

function previewFlag(hash: string): string | null {
  const name = hash.replace("#", "");
  return isFlagName(name) ? name : null;
}
