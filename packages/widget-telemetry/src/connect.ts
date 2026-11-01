import type { DisplayUnits } from "./format.js";
import { parseMessage, type Incoming, type Phase, type TelemetrySample } from "./parse.js";

const RETRY_MIN_MS = 250;
const RETRY_MAX_MS = 4000;

export interface WidgetHandlers {
  onStatus(phase: Phase): void;
  onUnits(units: DisplayUnits): void;
  onFrame(frame: TelemetrySample): void;
}

export function connectWidget(widgetId: string, handlers: WidgetHandlers): void {
  let delay = RETRY_MIN_MS;
  let active: WebSocket | null = null;

  const open = (): void => {
    const protocol = location.protocol === "https:" ? "wss:" : "ws:";
    const socket = new WebSocket(`${protocol}//${location.host}/ws`);
    active = socket;
    socket.addEventListener("open", () => {
      delay = RETRY_MIN_MS;
      socket.send(JSON.stringify({ type: "hello", widgetId }));
    });
    socket.addEventListener("message", (event) => {
      if (typeof event.data !== "string") {
        return;
      }
      dispatch(parseMessage(event.data), handlers);
    });
    socket.addEventListener("close", () => {
      if (active !== socket) {
        return;
      }
      window.setTimeout(open, delay);
      delay = Math.min(RETRY_MAX_MS, delay * 2);
    });
  };

  open();
}

function dispatch(message: Incoming | null, handlers: WidgetHandlers): void {
  if (!message) {
    return;
  }
  if (message.type === "status") {
    handlers.onStatus(message.phase);
    return;
  }
  if (message.type === "session") {
    handlers.onUnits(message.displayUnits);
    return;
  }
  handlers.onFrame(message.frame);
}
