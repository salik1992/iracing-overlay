import { connectWidget } from "./connect.js";
import { isFlagName } from "./flags.js";
import { manifest } from "./manifest.js";
import { createView } from "./view.js";

const pinned = previewFlag(location.hash);
const view = createView(document.body);

connectWidget(manifest.id, {
  onStatus(phase) {
    view.setIdle(phase === "idle");
  },
  onFlags(flags) {
    if (pinned) {
      return;
    }
    view.show(flags);
  },
});

if (pinned) {
  view.show([pinned]);
}

function previewFlag(hash: string): string | null {
  const name = hash.replace("#", "");
  return isFlagName(name) ? name : null;
}
