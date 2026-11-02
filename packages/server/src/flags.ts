import type { SessionStateName } from "./types.js";

const FLAG_BITS: ReadonlyArray<readonly [number, string]> = [
  [0x00000001, "checkered"],
  [0x00000002, "white"],
  [0x00000004, "green"],
  [0x00000008, "yellow"],
  [0x00000010, "red"],
  [0x00000020, "blue"],
  [0x00000040, "debris"],
  [0x00000080, "crossed"],
  [0x00000100, "yellowWaving"],
  [0x00000200, "oneLapToGreen"],
  [0x00000400, "greenHeld"],
  [0x00000800, "tenToGo"],
  [0x00001000, "fiveToGo"],
  [0x00002000, "randomWaving"],
  [0x00004000, "caution"],
  [0x00008000, "cautionWaving"],
  [0x00010000, "black"],
  [0x00020000, "disqualify"],
  [0x00040000, "serviceable"],
  [0x00080000, "furled"],
  [0x00100000, "repair"],
  [0x00200000, "dqScoringInvalid"],
  [0x10000000, "startHidden"],
  [0x20000000, "startReady"],
  [0x40000000, "startSet"],
  [0x80000000, "startGo"],
];

const SESSION_STATES: readonly SessionStateName[] = [
  "invalid",
  "getInCar",
  "warmup",
  "paradeLaps",
  "racing",
  "checkered",
  "coolDown",
];

/** SessionState parade laps: the pace lap before a flying start. */
const STATE_PARADE = 3;

/** Decode an iRacing SessionFlags bitfield. Several flags can be set at once. */
export function decodeFlags(flags: number): string[] {
  const bits = flags | 0;
  const names: string[] = [];
  for (const [mask, name] of FLAG_BITS) {
    if ((bits & mask) !== 0) {
      names.push(name);
    }
  }
  return names;
}

/**
 * Flag names for the digiflag lamp. iRacing can set the green bit on the
 * pace lap, before the flag waves. Those names stay out until start go.
 */
export function lampFlags(sessionState: number, flags: number): string[] {
  const names = decodeFlags(flags);
  if (sessionState !== STATE_PARADE || names.includes("startGo")) {
    return names;
  }
  return names.filter((name) => name !== "green" && name !== "greenHeld");
}

export function sessionStateName(value: number): SessionStateName {
  return SESSION_STATES[value] ?? "invalid";
}
