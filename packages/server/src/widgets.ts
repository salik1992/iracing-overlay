import { join } from "node:path";

import { packagesRoot } from "./paths.js";
import type { WidgetServe } from "./types.js";

/**
 * The telemetry and standings packages are not in the repo yet.
 * These entries already publish both streams and will serve each route
 * once that package's dist directory exists.
 */
export const widgets: readonly WidgetServe[] = [
  {
    id: "telemetry",
    route: "/telemetry",
    hz: 60,
    session: true,
    staticDir: join(packagesRoot, "widget-telemetry", "dist"),
  },
  {
    id: "standings",
    route: "/standings",
    hz: 10,
    session: true,
    staticDir: join(packagesRoot, "widget-standings", "dist"),
  },
];

const RESERVED_ROUTES = new Set(["/health", "/ws"]);

export function assertWidgets(list: readonly WidgetServe[]): void {
  const ids = new Set<string>();
  const routes: string[] = [];
  for (const widget of list) {
    if (ids.has(widget.id)) {
      throw new Error(`Duplicate widget id ${widget.id}`);
    }
    if (!widget.route.startsWith("/") || widget.route.length < 2) {
      throw new Error(`Widget ${widget.id} route must look like /name`);
    }
    if (RESERVED_ROUTES.has(widget.route)) {
      throw new Error(`Widget ${widget.id} route ${widget.route} is reserved`);
    }
    if (!(widget.hz > 0)) {
      throw new Error(`Widget ${widget.id} hz must be positive`);
    }
    for (const route of routes) {
      if (route === widget.route || route.startsWith(`${widget.route}/`) || widget.route.startsWith(`${route}/`)) {
        throw new Error(`Widget routes overlap: ${route} and ${widget.route}`);
      }
    }
    ids.add(widget.id);
    routes.push(widget.route);
  }
}
