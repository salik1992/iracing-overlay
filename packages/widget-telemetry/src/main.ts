import { connectWidget } from "@salik1992/iracing-overlay-shared/connect";

import { manifest } from "./manifest.js";
import { parseMessage } from "./parse.js";
import { createView } from "./view.js";

const view = createView(document.body);

connectWidget(manifest.id, parseMessage, (message) => {
  if (message.type === "status") {
    view.setIdle(message.phase === "idle");
    return;
  }
  if (message.type === "session") {
    view.setUnits(message.displayUnits);
    return;
  }
  view.show(message.frame);
});
