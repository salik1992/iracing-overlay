import type { WidgetManifest } from "@salik1992/iracing-overlay-shared";

export const manifest = {
  id: "header",
  route: "/header",
  hz: 10,
  session: true,
} as const satisfies WidgetManifest;
