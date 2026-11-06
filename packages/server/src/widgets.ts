import { join } from "node:path";

import { manifest as digiflag } from "@salik1992/iracing-overlay-widget-digiflag";
import { manifest as garage } from "@salik1992/iracing-overlay-widget-garage";
import { manifest as header } from "@salik1992/iracing-overlay-widget-header";
import { manifest as standings } from "@salik1992/iracing-overlay-widget-standings";
import { manifest as telemetry } from "@salik1992/iracing-overlay-widget-telemetry";

import { packagesRoot } from "./paths.js";
import type { WidgetServe } from "./types.js";

/** staticDir is server-only; the widget manifest does not know where files are written. */
export const widgets: readonly WidgetServe[] = [
  {
    ...telemetry,
    staticDir: join(packagesRoot, "widget-telemetry", "dist"),
  },
  {
    ...digiflag,
    staticDir: join(packagesRoot, "widget-digiflag", "dist"),
  },
  {
    ...header,
    staticDir: join(packagesRoot, "widget-header", "dist"),
  },
  {
    ...standings,
    staticDir: join(packagesRoot, "widget-standings", "dist"),
  },
  {
    ...garage,
    staticDir: join(packagesRoot, "widget-garage", "dist"),
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
