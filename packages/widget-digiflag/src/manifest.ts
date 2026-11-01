import type { WidgetManifest } from "@salik1992/iracing-overlay-shared";

export const manifest = {
  id: "digiflag",
  route: "/digiflag",
  hz: 10,
  session: false,
} as const satisfies WidgetManifest;
