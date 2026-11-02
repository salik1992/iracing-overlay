import { createServer as createHttpServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { Socket } from "node:net";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { WebSocketServer } from "ws";

import type { Hub } from "./hub.js";
import { fontPath, fontRoute } from "./paths.js";
import type { WidgetServe } from "./types.js";
import { assertWidgets } from "./widgets.js";

const FILES: Record<string, string> = {
  "": "index.html",
  "/": "index.html",
  "/index.html": "index.html",
  "/index.js": "index.js",
  "/style.css": "style.css",
  "/cover.png": "cover.png",
};

const CONTENT_TYPES: Record<string, string> = {
  "index.html": "text/html; charset=utf-8",
  "index.js": "text/javascript; charset=utf-8",
  "style.css": "text/css; charset=utf-8",
  "cover.png": "image/png",
};

export interface OverlayServer {
  http: Server;
  close(): Promise<void>;
}

export function createOverlayServer(options: {
  hub: Hub;
  widgets: readonly WidgetServe[];
  sourceName: string;
}): OverlayServer {
  assertWidgets(options.widgets);
  const http = createHttpServer((request, response) => {
    void handle(request, response, options).catch((error: unknown) => {
      console.error(error);
      if (!response.headersSent) {
        sendJson(response, 500, { error: "internal error" });
      } else {
        response.end();
      }
    });
  });
  const sockets = new WebSocketServer({ server: http, path: "/ws", maxPayload: 4096 });
  sockets.on("connection", (socket) => {
    options.hub.connect(socket);
  });
  const connections = new Set<Socket>();
  http.on("connection", (socket) => {
    connections.add(socket);
    socket.on("close", () => {
      connections.delete(socket);
    });
  });
  return {
    http,
    close() {
      options.hub.closeClients();
      sockets.close();
      for (const socket of connections) {
        socket.destroy();
      }
      return new Promise((resolve, reject) => {
        http.close((error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        });
      });
    },
  };
}

export function listen(server: Server, port: number, host: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const onError = (error: Error): void => {
      reject(error);
    };
    server.once("error", onError);
    server.listen(port, host, () => {
      server.off("error", onError);
      const address = server.address();
      if (address && typeof address === "object") {
        resolve(address.port);
      } else {
        reject(new Error("Server did not bind to a TCP port"));
      }
    });
  });
}

async function handle(
  request: IncomingMessage,
  response: ServerResponse,
  options: { hub: Hub; widgets: readonly WidgetServe[]; sourceName: string },
): Promise<void> {
  if (request.method !== "GET") {
    sendJson(response, 405, { error: "method not allowed" });
    return;
  }
  const path = requestPath(request);
  if (path === null) {
    sendJson(response, 400, { error: "bad request" });
    return;
  }
  if (path === "/health") {
    sendJson(response, 200, {
      ok: true,
      source: options.sourceName,
      clients: options.hub.clientCount,
      phase: options.hub.phase,
    });
    return;
  }
  if (path === fontRoute) {
    await sendFont(response);
    return;
  }
  const widget = options.widgets.find(
    (item) => path === item.route || path.startsWith(`${item.route}/`),
  );
  if (!widget) {
    sendJson(response, 404, { error: "not found" });
    return;
  }
  const relative = path.slice(widget.route.length);
  const fileName = FILES[relative];
  if (!fileName) {
    sendJson(response, 404, { error: "not found" });
    return;
  }
  const filePath = join(widget.staticDir, fileName);
  try {
    const body = await readFile(filePath);
    const contentType = CONTENT_TYPES[fileName] ?? "application/octet-stream";
    response.writeHead(200, {
      "content-type": contentType,
      "cache-control": "no-store",
    });
    response.end(body);
  } catch (error) {
    if (isNotFound(error)) {
      sendJson(response, 404, { error: "widget files are not built", widgetId: widget.id });
      return;
    }
    throw error;
  }
}

function requestPath(request: IncomingMessage): string | null {
  try {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    return decodeURIComponent(url.pathname);
  } catch {
    return null;
  }
}

async function sendFont(response: ServerResponse): Promise<void> {
  try {
    const body = await readFile(fontPath);
    response.writeHead(200, {
      "content-type": "font/woff2",
      "cache-control": "no-store",
    });
    response.end(body);
  } catch (error) {
    if (isNotFound(error)) {
      sendJson(response, 404, { error: "not found" });
      return;
    }
    throw error;
  }
}

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end(JSON.stringify(body));
}

function isNotFound(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
