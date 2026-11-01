import type { Tick } from "../tick.js";
import type { SessionSnapshot, SourceStatus } from "../types.js";

export interface TelemetrySource {
  start(): Promise<void>;
  stop(): Promise<void>;
  onTick(listener: (tick: Tick) => void): void;
  onSession(listener: (session: SessionSnapshot, version: number) => void): void;
  onStatus(listener: (status: SourceStatus) => void): void;
}
