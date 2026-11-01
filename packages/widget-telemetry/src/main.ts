import { connectWidget } from "./connect.js";
import { manifest } from "./manifest.js";
import { createView } from "./view.js";

const view = createView(document.body);

connectWidget(manifest.id, {
  onStatus(phase) {
    view.setIdle(phase === "idle");
  },
  onUnits(units) {
    view.setUnits(units);
  },
  onFrame(frame) {
    view.show(frame);
  },
});
