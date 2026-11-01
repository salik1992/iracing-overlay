import { readFileSync } from "node:fs";

import { fixturePath } from "../paths.js";
import { normalizeSession } from "../session.js";
import type { CarSample, Tick } from "../tick.js";
import type { SessionSnapshot, SourceStatus } from "../types.js";
import { ListenerList } from "./listener.js";
import type { TelemetrySource } from "./telemetry-source.js";

const TICK_MS = 1000 / 60;
const STEERING_MAX_RAD = 4.5;
const SESSION_LAPS = 30;
const ON_TRACK = 3;
const GREEN_FLAG = 0x4;
const CHECKERED_FLAG = 0x1;
const STATE_RACING = 4;
const STATE_CHECKERED = 5;

interface MovingCar {
  carIdx: number;
  lap: number;
  lapDistPct: number;
  paceMps: number;
  lastLapSec: number;
  bestLapSec: number;
  tireCompound: number;
}

/**
 * Plays the checked-in demo session at 60 Hz.
 * Car motion is generated from the fixture's pace, so standings and pedals
 * both move without a captured .ibt file.
 */
export class FixtureSource implements TelemetrySource {
  private readonly ticks = new ListenerList<Tick>();
  private readonly sessions = new ListenerList<{ session: SessionSnapshot; version: number }>();
  private readonly statuses = new ListenerList<SourceStatus>();
  private readonly session: SessionSnapshot;
  private readonly cars: MovingCar[];
  private readonly trackLengthMeters: number;
  private readonly playerCarIdx: number;
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private elapsedSec = 0;
  private timeRemainSec = 1800;
  private sessionTick = 0;
  private lastClockMs = 0;

  constructor(path = fixturePath) {
    const raw = JSON.parse(readFileSync(path, "utf8")) as unknown;
    const root = asRecord(raw);
    const session = normalizeSession(root, { sessionNum: 0, displayUnits: 1 });
    if (!root || !session) {
      throw new Error(`Fixture ${path} is not a session document`);
    }
    this.session = session;
    this.playerCarIdx = session.player.carIdx;
    this.trackLengthMeters = session.weekend.trackLengthMeters || 1600;
    this.cars = readMotion(root["motion"]);
  }

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

  start(): Promise<void> {
    if (this.running) {
      return Promise.resolve();
    }
    this.running = true;
    this.sessions.emit({ session: this.session, version: 1 });
    this.statuses.emit({ phase: "live", simMode: this.session.weekend.simMode });
    this.advance(0);
    this.lastClockMs = performance.now();
    this.timer = setTimeout(() => this.clock(), TICK_MS);
    return Promise.resolve();
  }

  stop(): Promise<void> {
    this.running = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    return Promise.resolve();
  }

  /** Advance the session by `deltaSec` and publish one tick. */
  advance(deltaSec: number): void {
    this.elapsedSec += deltaSec;
    this.timeRemainSec = Math.max(0, this.timeRemainSec - deltaSec);
    if (deltaSec > 0) {
      this.integrate(deltaSec);
    }
    this.sessionTick += 1;
    this.ticks.emit(this.toTick());
  }

  private clock(): void {
    if (!this.running) {
      return;
    }
    const now = performance.now();
    const deltaSec = Math.min(0.1, (now - this.lastClockMs) / 1000);
    this.lastClockMs = now;
    this.advance(deltaSec);
    if (this.running) {
      this.timer = setTimeout(() => this.clock(), TICK_MS);
    }
  }

  private integrate(deltaSec: number): void {
    for (const car of this.cars) {
      const distance = car.paceMps * deltaSec;
      const next = car.lapDistPct + distance / this.trackLengthMeters;
      const gained = Math.floor(next);
      car.lap += gained;
      car.lapDistPct = next - gained;
    }
  }

  private toTick(): Tick {
    const finished = this.timeRemainSec <= 0;
    const ordered = [...this.cars].sort(compareCars);
    const overall = new Map<number, number>();
    ordered.forEach((car, index) => overall.set(car.carIdx, index + 1));
    const classPosition = classPositions(this.cars, this.session);
    const player = this.cars.find((car) => car.carIdx === this.playerCarIdx) ?? null;
    const playerSpeed = playerSpeedMps(player, this.elapsedSec);
    const playerEst = player ? estTimeSec(player, player, this.trackLengthMeters) : 0;
    const samples: CarSample[] = this.cars.map((car) => ({
      carIdx: car.carIdx,
      position: overall.get(car.carIdx) ?? 0,
      classPosition: classPosition.get(car.carIdx) ?? 0,
      lap: car.lap,
      lapCompleted: Math.max(0, car.lap - 1),
      lapDistPct: car.lapDistPct,
      estTimeSec: player ? estTimeSec(car, player, this.trackLengthMeters) : 0,
      lastLapSec: car.lastLapSec,
      bestLapSec: car.bestLapSec,
      onPitRoad: false,
      trackSurface: ON_TRACK,
      tireCompound: car.tireCompound,
    }));
    const leaderLap = ordered[0]?.lap ?? 0;
    return {
      sessionTick: this.sessionTick,
      sessionNum: this.session.session.number,
      sessionState: finished ? STATE_CHECKERED : STATE_RACING,
      sessionTimeRemainSec: this.timeRemainSec,
      sessionLapsRemain: Math.max(0, SESSION_LAPS - leaderLap),
      sessionFlags: finished ? CHECKERED_FLAG : GREEN_FLAG,
      displayUnits: this.session.player.displayUnits,
      replay: false,
      playerCarIdx: this.playerCarIdx,
      playerEstTimeSec: playerEst,
      speedMps: playerSpeed,
      rpm: 6200 + 900 * Math.sin(this.elapsedSec * 1.3),
      gear: gearForSpeed(playerSpeed),
      throttle: throttleFor(this.elapsedSec),
      brake: brakeFor(this.elapsedSec),
      clutch: 0,
      steeringWheelAngleRad: 0.35 * Math.sin(this.elapsedSec * 0.8),
      steeringWheelAngleMaxRad: STEERING_MAX_RAD,
      lap: player?.lap ?? 0,
      lapCurrentSec: player && playerSpeed > 0 ? (player.lapDistPct * this.trackLengthMeters) / playerSpeed : 0,
      lapLastSec: player?.lastLapSec ?? -1,
      lapBestSec: player?.bestLapSec ?? -1,
      onTrack: true,
      cars: samples,
    };
  }
}

function playerSpeedMps(player: MovingCar | null, elapsedSec: number): number {
  if (!player) {
    return 0;
  }
  return player.paceMps + 1.5 * Math.sin(elapsedSec * 0.7);
}

function estTimeSec(car: MovingCar, player: MovingCar, trackLengthMeters: number): number {
  const lapTime = trackLengthMeters / Math.max(player.paceMps, 1);
  const lapDelta = player.lap - car.lap;
  return (lapDelta + wrapShort(player.lapDistPct - car.lapDistPct)) * lapTime;
}

function wrapShort(delta: number): number {
  let value = delta % 1;
  if (value > 0.5) {
    value -= 1;
  }
  if (value < -0.5) {
    value += 1;
  }
  return value;
}

function compareCars(a: MovingCar, b: MovingCar): number {
  if (a.lap !== b.lap) {
    return b.lap - a.lap;
  }
  return b.lapDistPct - a.lapDistPct;
}

function classPositions(cars: MovingCar[], session: SessionSnapshot): Map<number, number> {
  const buckets = new Map<number, MovingCar[]>();
  for (const car of cars) {
    const classId = session.drivers[String(car.carIdx)]?.classId ?? -1;
    const bucket = buckets.get(classId) ?? [];
    bucket.push(car);
    buckets.set(classId, bucket);
  }
  const positions = new Map<number, number>();
  for (const bucket of buckets.values()) {
    const ordered = [...bucket].sort(compareCars);
    ordered.forEach((car, index) => positions.set(car.carIdx, index + 1));
  }
  return positions;
}

function gearForSpeed(speedMps: number): number {
  if (speedMps < 15) return 2;
  if (speedMps < 28) return 3;
  if (speedMps < 40) return 4;
  if (speedMps < 52) return 5;
  return 6;
}

function throttleFor(elapsedSec: number): number {
  if (brakeFor(elapsedSec) > 0) {
    return 0.05;
  }
  return 0.65 + 0.35 * (0.5 + 0.5 * Math.sin(elapsedSec));
}

function brakeFor(elapsedSec: number): number {
  const pulse = elapsedSec % 8;
  if (pulse <= 7.2) {
    return 0;
  }
  return (pulse - 7.2) / 0.8;
}

function readMotion(value: unknown): MovingCar[] {
  const motion = asRecord(value);
  const cars = motion?.["cars"];
  if (!Array.isArray(cars) || cars.length === 0) {
    throw new Error("Fixture motion.cars must be a non-empty array");
  }
  return cars.map((entry, index) => {
    const record = asRecord(entry);
    const carIdx = finite(record?.["carIdx"]);
    const lap = finite(record?.["lap"]);
    const lapDistPct = finite(record?.["lapDistPct"]);
    const paceMps = finite(record?.["paceMps"]);
    const lastLapSec = finite(record?.["lastLapSec"]);
    const bestLapSec = finite(record?.["bestLapSec"]);
    const tireCompound = finite(record?.["tireCompound"]) ?? -1;
    if (
      carIdx === null ||
      lap === null ||
      lapDistPct === null ||
      paceMps === null ||
      lastLapSec === null ||
      bestLapSec === null
    ) {
      throw new Error(`Fixture motion.cars[${index}] is missing a numeric field`);
    }
    return { carIdx, lap, lapDistPct, paceMps, lastLapSec, bestLapSec, tireCompound };
  });
}

function finite(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}
