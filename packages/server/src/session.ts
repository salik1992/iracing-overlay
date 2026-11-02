import { parseTrackLengthMeters } from "./track-length.js";
import type { DisplayUnits, DriverSnapshot, SessionResult, SessionSnapshot } from "./types.js";

export interface NormalizeOptions {
  sessionNum: number;
  displayUnits: DisplayUnits;
}

export function normalizeSession(input: unknown, options: NormalizeOptions): SessionSnapshot | null {
  const root = asRecord(input);
  if (!root) {
    return null;
  }

  const weekend = asRecord(root["WeekendInfo"]) ?? {};
  const driverInfo = asRecord(root["DriverInfo"]) ?? {};
  const sessionInfo = asRecord(root["SessionInfo"]) ?? {};
  const playerCarIdx = asNumber(driverInfo["DriverCarIdx"]) ?? 0;
  const drivers = readDrivers(driverInfo["Drivers"]);
  const player = drivers[String(playerCarIdx)];
  const current = selectSession(sessionInfo["Sessions"], options.sessionNum);
  const trackLength = parseTrackLengthMeters(asText(weekend["TrackLength"], "")) ?? 0;

  return {
    weekend: {
      trackDisplayName: asText(weekend["TrackDisplayName"], ""),
      trackConfigName: asText(weekend["TrackConfigName"], ""),
      trackLengthMeters: trackLength,
      seriesId: asNumber(weekend["SeriesID"]) ?? 0,
      eventType: asText(weekend["EventType"], ""),
      simMode: asText(weekend["SimMode"], ""),
      teamRacing: asBool(weekend["TeamRacing"]),
      official: asBool(weekend["Official"]),
    },
    player: {
      carIdx: playerCarIdx,
      carNumber: player?.carNumber ?? "",
      driverName: player?.name ?? "",
      shiftLight: {
        firstRpm: asNumber(driverInfo["DriverCarSLFirstRPM"]) ?? 0,
        shiftRpm: asNumber(driverInfo["DriverCarSLShiftRPM"]) ?? 0,
        lastRpm: asNumber(driverInfo["DriverCarSLLastRPM"]) ?? 0,
        blinkRpm: asNumber(driverInfo["DriverCarSLBlinkRPM"]) ?? 0,
      },
      redlineRpm: asNumber(driverInfo["DriverCarRedLine"]) ?? 0,
      idleRpm: asNumber(driverInfo["DriverCarIdleRPM"]) ?? 0,
      maxFuelLiters: asNumber(driverInfo["DriverCarFuelMaxLtr"]) ?? 0,
      displayUnits: options.displayUnits,
    },
    drivers,
    tires: readTires(driverInfo["TireCompounds"]),
    session: {
      number: asNumber(current?.["SessionNum"]) ?? options.sessionNum,
      name: asText(current?.["SessionName"], ""),
      type: asText(current?.["SessionType"], ""),
      laps: asText(current?.["SessionLaps"], ""),
      time: asText(current?.["SessionTime"], ""),
      results: readResults(current?.["ResultsPositions"]),
    },
  };
}

function readDrivers(value: unknown): Record<string, DriverSnapshot> {
  const drivers: Record<string, DriverSnapshot> = {};
  const screens = new Map<string, string>();
  if (!Array.isArray(value)) {
    return drivers;
  }
  for (const entry of value) {
    const record = asRecord(entry);
    const carIdx = record ? asNumber(record["CarIdx"]) : null;
    if (!record || carIdx === null || carIdx < 0) {
      continue;
    }
    drivers[String(carIdx)] = {
      carIdx,
      name: asText(record["UserName"], ""),
      carNumber: asText(record["CarNumber"], ""),
      carPath: asText(record["CarPath"], ""),
      classId: asNumber(record["CarClassID"]) ?? 0,
      className: trimmed(record["CarClassShortName"]),
      classColor: classColor(record["CarClassColor"]),
      iRating: asNumber(record["IRating"]) ?? 0,
      license: asText(record["LicString"], ""),
      teamName: asText(record["TeamName"], ""),
      spectator: asBool(record["IsSpectator"]),
      paceCar: asBool(record["CarIsPaceCar"]),
      ai: asBool(record["CarIsAI"]),
    };
    screens.set(String(carIdx), trimmed(record["CarScreenNameShort"]) || trimmed(record["CarScreenName"]));
  }
  fillBlankClassNames(drivers, screens);
  return drivers;
}

/**
 * AI sessions leave CarClassShortName empty. A competing car borrows the short
 * name already published for its class, and otherwise uses the car screen name.
 */
function fillBlankClassNames(drivers: Record<string, DriverSnapshot>, screens: ReadonlyMap<string, string>): void {
  const named = new Map<number, string>();
  for (const driver of Object.values(drivers)) {
    if (driver.paceCar || driver.spectator || driver.className === "" || named.has(driver.classId)) {
      continue;
    }
    named.set(driver.classId, driver.className);
  }
  for (const driver of Object.values(drivers)) {
    if (driver.className !== "") {
      continue;
    }
    const shared = named.get(driver.classId);
    if (shared && !driver.paceCar && !driver.spectator) {
      driver.className = shared;
      continue;
    }
    driver.className = screens.get(String(driver.carIdx)) ?? "";
  }
}

function readResults(value: unknown): SessionResult[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const results: SessionResult[] = [];
  for (const entry of value) {
    const record = asRecord(entry);
    const carIdx = record ? asNumber(record["CarIdx"]) : null;
    if (!record || carIdx === null || carIdx < 0) {
      continue;
    }
    results.push({
      carIdx,
      position: asNumber(record["Position"]) ?? 0,
      classPosition: asNumber(record["ClassPosition"]) ?? 0,
      lapsComplete: asNumber(record["LapsComplete"]) ?? -1,
    });
  }
  return results;
}

function readTires(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((entry) => {
    if (typeof entry === "string") {
      return entry;
    }
    const record = asRecord(entry);
    if (!record) {
      return "";
    }
    const name = asText(record["Name"], "");
    return name || asText(record["CompoundName"], "");
  });
}

function selectSession(value: unknown, sessionNum: number): Record<string, unknown> | null {
  if (!Array.isArray(value)) {
    return null;
  }
  let fallback: Record<string, unknown> | null = null;
  for (const entry of value) {
    const record = asRecord(entry);
    if (!record) {
      continue;
    }
    fallback ??= record;
    if (asNumber(record["SessionNum"]) === sessionNum) {
      return record;
    }
  }
  return fallback;
}

function classColor(value: unknown): string {
  const numeric = asNumber(value);
  if (numeric !== null) {
    const rgb = (numeric >>> 0) & 0xffffff;
    return `#${rgb.toString(16).padStart(6, "0")}`;
  }
  if (typeof value === "string") {
    const match = /^\s*(?:#|0x)([0-9a-f]{6})\s*$/i.exec(value);
    const hex = match?.[1];
    if (hex) {
      return `#${hex.toLowerCase()}`;
    }
  }
  return "#888888";
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
}

function trimmed(value: unknown): string {
  return asText(value, "").trim();
}

function asText(value: unknown, fallback: string): string {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return fallback;
}

function asBool(value: unknown): boolean {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    return value !== 0;
  }
  if (typeof value === "string") {
    const text = value.trim().toLowerCase();
    return text === "1" || text === "true" || text === "yes";
  }
  return false;
}
