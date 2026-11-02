import type { IRacingSDK, TelemetryVarList } from "irsdk-node";

import { normalizeSession } from "../session.js";
import type { CarSample, Tick } from "../tick.js";
import type { DisplayUnits, SessionSnapshot, SourcePhase, SourceStatus } from "../types.js";
import { ListenerList } from "./listener.js";
import type { TelemetrySource } from "./telemetry-source.js";

const CAR_LIMIT = 64;
const NOT_IN_WORLD = -1;
const LIVE_WAIT_MS = 32;
const IDLE_WAIT_MS = 250;

type SdkName = keyof TelemetryVarList;

/**
 * Reads iRacing's shared memory. waitForData blocks the event loop, so the
 * pump yields with setImmediate after a real wait and sleeps when the call
 * returns immediately (the Linux mock does).
 */
export class IRacingSource implements TelemetrySource {
  private readonly ticks = new ListenerList<Tick>();
  private readonly sessions = new ListenerList<{ session: SessionSnapshot; version: number }>();
  private readonly statuses = new ListenerList<SourceStatus>();
  private sdk: IRacingSDK | null = null;
  private running = false;
  private connected = false;
  private phase: SourcePhase = "idle";
  private simMode: string | null = null;
  private session: SessionSnapshot | null = null;
  private sessionVersion: number | null = null;
  /** SessionNum last asked of the YAML. A missing record must not be asked again every tick. */
  private normalizedSessionNum: number | null = null;
  private sessionUniqueId: number | null = null;
  private readErrorLogged = false;

  onTick(listener: (tick: Tick) => void): void {
    this.ticks.add(listener);
  }

  onSession(listener: (session: SessionSnapshot, version: number) => void): void {
    this.sessions.add((event) => {
      listener(event.session, event.version);
    });
  }

  onStatus(listener: (status: SourceStatus) => void): void {
    this.statuses.add(listener);
  }

  async start(): Promise<void> {
    if (this.running) {
      return;
    }
    let imported: typeof import("irsdk-node");
    try {
      imported = await import("irsdk-node");
    } catch (error) {
      throw new Error("irsdk-node is not installed. It is required when IRACING_SOURCE=iracing.", {
        cause: error,
      });
    }
    this.sdk = new imported.IRacingSDK({
      useTelemVariableCache: true,
      autoEnableTelemetry: false,
    });
    this.running = true;
    this.pump();
  }

  stop(): Promise<void> {
    this.running = false;
    this.connected = false;
    this.sdk?.stopSDK();
    this.sdk = null;
    return Promise.resolve();
  }

  private pump = (): void => {
    const sdk = this.sdk;
    if (!this.running || !sdk) {
      return;
    }
    if (!sdk.sessionStatusOK) {
      sdk.startSDK();
    }
    const timeout = this.connected ? LIVE_WAIT_MS : IDLE_WAIT_MS;
    const started = performance.now();
    let ok = false;
    try {
      ok = sdk.waitForData(timeout);
    } catch (error) {
      this.failRead(error);
      if (this.running) {
        setTimeout(this.pump, IDLE_WAIT_MS);
      }
      return;
    }
    if (!this.running) {
      return;
    }
    const blocked = performance.now() - started >= 8;
    if (!ok) {
      this.markIdle();
      if (blocked) {
        setImmediate(this.pump);
      } else {
        setTimeout(this.pump, IDLE_WAIT_MS);
      }
      return;
    }
    this.consume(sdk);
    if (!this.running) {
      return;
    }
    if (blocked) {
      setImmediate(this.pump);
    } else {
      setTimeout(this.pump, 16);
    }
  };

  private consume(sdk: IRacingSDK): void {
    const unique = scalarNumber(sdk, "SessionUniqueID");
    if (unique !== null && unique !== this.sessionUniqueId) {
      this.sessionUniqueId = unique;
      // A new weekend re-reads the YAML even when the version counter repeats.
      this.sessionVersion = null;
      this.normalizedSessionNum = null;
      sdk.resetTelemetryVariableCache();
    }

    const displayUnits: DisplayUnits = scalarNumber(sdk, "DisplayUnits") === 1 ? 1 : 0;
    const sessionNum = scalarNumber(sdk, "SessionNum") ?? 0;
    this.refreshSession(sdk, sessionNum, displayUnits);

    const replay = scalarBool(sdk, "IsReplayPlaying");
    const phase: SourcePhase = replay ? "replay" : "live";
    if (!this.connected || phase !== this.phase) {
      this.connected = true;
      this.phase = phase;
      this.statuses.emit({ phase, simMode: this.simMode });
    }

    const playerFromSdk = scalarNumber(sdk, "PlayerCarIdx");
    const playerCarIdx = playerFromSdk ?? this.session?.player.carIdx ?? 0;
    const positions = numberArray(sdk, "CarIdxPosition");
    const classPositions = numberArray(sdk, "CarIdxClassPosition");
    const laps = numberArray(sdk, "CarIdxLap");
    const lapsCompleted = numberArray(sdk, "CarIdxLapCompleted");
    const lapDist = numberArray(sdk, "CarIdxLapDistPct");
    const estTimes = numberArray(sdk, "CarIdxEstTime");
    const lastLaps = numberArray(sdk, "CarIdxLastLapTime");
    const bestLaps = numberArray(sdk, "CarIdxBestLapTime");
    const surfaces = numberArray(sdk, "CarIdxTrackSurface");
    const onPitRoad = boolArray(sdk, "CarIdxOnPitRoad");
    const compounds = numberArray(sdk, "CarIdxTireCompound");
    const count = Math.min(
      CAR_LIMIT,
      Math.max(positions.length, laps.length, lapsCompleted.length, lapDist.length, estTimes.length),
    );
    const cars: CarSample[] = [];
    for (let carIdx = 0; carIdx < count; carIdx += 1) {
      cars.push({
        carIdx,
        position: atOr(positions, carIdx, 0),
        classPosition: atOr(classPositions, carIdx, 0),
        lap: atOr(laps, carIdx, 0),
        lapCompleted: atOr(lapsCompleted, carIdx, -1),
        lapDistPct: atOr(lapDist, carIdx, 0),
        estTimeSec: atOr(estTimes, carIdx, Number.NaN),
        lastLapSec: atOr(lastLaps, carIdx, -1),
        bestLapSec: atOr(bestLaps, carIdx, -1),
        onPitRoad: onPitRoad[carIdx] === true,
        trackSurface: atOr(surfaces, carIdx, NOT_IN_WORLD),
        tireCompound: atOr(compounds, carIdx, -1),
      });
    }

    const tick: Tick = {
      sessionTick: scalarNumber(sdk, "SessionTick") ?? 0,
      sessionNum,
      sessionState: scalarNumber(sdk, "SessionState") ?? 0,
      sessionTimeRemainSec: scalarNumber(sdk, "SessionTimeRemain") ?? 0,
      sessionLapsRemain: scalarNumber(sdk, "SessionLapsRemainEx") ?? 0,
      sessionFlags: scalarNumber(sdk, "SessionFlags") ?? 0,
      displayUnits,
      replay,
      playerCarIdx,
      playerEstTimeSec: atOr(estTimes, playerCarIdx, 0),
      speedMps: scalarNumber(sdk, "Speed") ?? 0,
      rpm: scalarNumber(sdk, "RPM") ?? 0,
      gear: scalarNumber(sdk, "Gear") ?? 0,
      throttle: scalarNumber(sdk, "Throttle") ?? 0,
      brake: scalarNumber(sdk, "Brake") ?? 0,
      clutch: clutchPedal(scalarNumber(sdk, "Clutch")),
      steeringWheelAngleRad: scalarNumber(sdk, "SteeringWheelAngle") ?? 0,
      steeringWheelAngleMaxRad: scalarNumber(sdk, "SteeringWheelAngleMax") ?? 0,
      lap: scalarNumber(sdk, "Lap") ?? 0,
      lapCurrentSec: scalarNumber(sdk, "LapCurrentLapTime") ?? 0,
      lapLastSec: scalarNumber(sdk, "LapLastLapTime") ?? -1,
      lapBestSec: scalarNumber(sdk, "LapBestLapTime") ?? -1,
      onTrack: scalarBool(sdk, "IsOnTrack"),
      cars,
    };
    this.ticks.emit(tick);
  }

  private refreshSession(sdk: IRacingSDK, sessionNum: number, displayUnits: DisplayUnits): void {
    const next = advanceSession(
      {
        version: this.sessionVersion,
        sessionNum: this.normalizedSessionNum,
        session: this.session,
      },
      { version: sdk.currDataVersion, sessionNum, displayUnits },
      () => sdk.getSessionData(),
    );
    this.sessionVersion = next.held.version;
    this.normalizedSessionNum = next.held.sessionNum;
    this.session = next.held.session;
    if (!next.publish) {
      return;
    }
    this.publishSimMode(next.publish.session.weekend.simMode);
    this.sessions.emit({ session: next.publish.session, version: next.publish.version });
  }

  private publishSimMode(simMode: string): void {
    if (simMode === this.simMode) {
      return;
    }
    this.simMode = simMode;
    if (this.connected) {
      this.statuses.emit({ phase: this.phase, simMode });
    }
  }

  private markIdle(): void {
    if (!this.connected && this.phase === "idle") {
      return;
    }
    this.connected = false;
    this.phase = "idle";
    this.statuses.emit({ phase: "idle", simMode: this.simMode });
  }

  private failRead(error: unknown): void {
    this.markIdle();
    if (this.readErrorLogged) {
      return;
    }
    this.readErrorLogged = true;
    console.error("iRacing SDK read failed:", error);
  }
}

function scalarNumber(sdk: IRacingSDK, name: SdkName): number | null {
  const variable = sdk.getTelemetryVariable<number>(name);
  const value = variable?.value[0];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function scalarBool(sdk: IRacingSDK, name: SdkName): boolean {
  const variable = sdk.getTelemetryVariable<boolean>(name);
  return variable?.value[0] === true;
}

function numberArray(sdk: IRacingSDK, name: SdkName): number[] {
  const variable = sdk.getTelemetryVariable<number>(name);
  return variable?.value ?? [];
}

function boolArray(sdk: IRacingSDK, name: SdkName): boolean[] {
  const variable = sdk.getTelemetryVariable<boolean>(name);
  return variable?.value ?? [];
}

export interface HeldSession {
  version: number | null;
  sessionNum: number | null;
  session: SessionSnapshot | null;
}

export interface SessionAdvance {
  held: HeldSession;
  publish: { session: SessionSnapshot; version: number } | null;
}

/**
 * Re-read the weekend YAML when its version changes or when telemetry SessionNum
 * changes. Practice, qualifying, and the race are already in that YAML, so a
 * session change often leaves the version alone. The stored number is the one
 * requested. A missing record falls back inside normalizeSession, and storing
 * the fallback's number would select it again on every tick.
 */
export function advanceSession(
  held: HeldSession,
  update: { version: number; sessionNum: number; displayUnits: DisplayUnits },
  readRaw: () => unknown,
): SessionAdvance {
  if (update.version !== held.version || update.sessionNum !== held.sessionNum) {
    const snapshot = normalizeSession(readRaw(), {
      sessionNum: update.sessionNum,
      displayUnits: update.displayUnits,
    });
    if (snapshot) {
      return {
        held: { version: update.version, sessionNum: update.sessionNum, session: snapshot },
        publish: { session: snapshot, version: update.version },
      };
    }
  }
  if (held.session && held.version !== null && held.session.player.displayUnits !== update.displayUnits) {
    const session: SessionSnapshot = {
      ...held.session,
      player: { ...held.session.player, displayUnits: update.displayUnits },
    };
    return {
      held: { ...held, session },
      publish: { session, version: held.version },
    };
  }
  return { held, publish: null };
}

/**
 * iRacing's Clutch is 0 when the pedal is pressed and 1 when it is released.
 * The overlay matches brake and throttle: 0 released, 1 pressed.
 */
export function clutchPedal(value: number | null): number {
  if (value === null || !Number.isFinite(value)) {
    return 0;
  }
  return 1 - value;
}

function atOr(values: number[], index: number, fallback: number): number {
  const value = values[index];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}
