import { connectWidget } from "@salik1992/iracing-overlay-shared/connect";

import { manifest } from "./manifest.js";
import { parseMessage } from "./parse.js";
import { createView } from "./view.js";

const pinned = location.hash === "#preview";
const view = createView(document.body);

connectWidget(manifest.id, parseMessage, (message) => {
  if (pinned) {
    return;
  }
  view.show(message.visible);
});

if (pinned) {
  view.show(true);
}
