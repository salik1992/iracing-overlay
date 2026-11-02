import type { Cell } from "./geometry.js";
import { LED, type LedColor } from "./leds.js";

/** Names produced by the server from the SessionFlags bitfield, in bit order. */
export const FLAG_NAMES = [
  "checkered",
  "white",
  "green",
  "yellow",
  "red",
  "blue",
  "debris",
  "crossed",
  "yellowWaving",
  "oneLapToGreen",
  "greenHeld",
  "tenToGo",
  "fiveToGo",
  "randomWaving",
  "caution",
  "cautionWaving",
  "black",
  "disqualify",
  "serviceable",
  "furled",
  "repair",
  "dqScoringInvalid",
  "startHidden",
  "startReady",
  "startSet",
  "startGo",
] as const;

export type FlagName = (typeof FLAG_NAMES)[number];

export const FADE_MS = 200;
export const SWAP_HOLD_MS = 800;
export const SWAP_TRANSITION_MS = 200;
export const BLINK_HALF_MS = 500;

export type Motion = "static" | "blink" | "swap";

export interface DotPaint {
  a: LedColor;
  b: LedColor;
  dark: boolean;
}

/**
 * One matrix, so the first match wins. Driver warnings come before the
 * race-state lamps. serviceable, dqScoringInvalid, startHidden, startReady,
 * startSet, fiveToGo, tenToGo, and oneLapToGreen stay off the matrix.
 * Green and green held also stay off while the start lights are at ready
 * or set. Green held alone is the starter holding the flag, not the wave.
 */
const PRIORITY: readonly FlagName[] = [
  "disqualify",
  "black",
  "repair",
  "furled",
  "red",
  "checkered",
  "cautionWaving",
  "caution",
  "yellowWaving",
  "randomWaving",
  "yellow",
  "debris",
  "white",
  "blue",
  "crossed",
  "greenHeld",
  "startGo",
  "green",
];

const BLINK: ReadonlySet<FlagName> = new Set([
  "blue",
  "yellowWaving",
  "cautionWaving",
  "randomWaving",
  "furled",
  "disqualify",
]);

const SWAP: ReadonlySet<FlagName> = new Set(["checkered", "debris"]);

export function isFlagName(value: string): value is FlagName {
  return (FLAG_NAMES as readonly string[]).includes(value);
}

export function shownFlag(names: readonly string[]): FlagName | null {
  const present = new Set(names);
  const lightsHeld = !present.has("startGo") && (present.has("startReady") || present.has("startSet"));
  for (const name of PRIORITY) {
    if (!present.has(name)) {
      continue;
    }
    if (name === "greenHeld" && !present.has("green") && !present.has("startGo")) {
      continue;
    }
    if (lightsHeld && (name === "green" || name === "greenHeld")) {
      continue;
    }
    return name;
  }
  return null;
}

export function motionOf(flag: FlagName): Motion {
  if (SWAP.has(flag)) {
    return "swap";
  }
  if (BLINK.has(flag)) {
    return "blink";
  }
  return "static";
}

export function paintDot(flag: FlagName, cell: Cell): DotPaint {
  if (flag === "checkered") {
    return (cell.row + cell.col) % 2 === 0
      ? pair(LED.white, LED.black)
      : pair(LED.black, LED.white);
  }
  if (flag === "debris") {
    return cell.col % 2 === 0 ? pair(LED.yellow, LED.red) : pair(LED.red, LED.yellow);
  }
  if (flag === "repair") {
    return inMeatball(cell) ? solid(LED.orange) : solid(LED.black);
  }
  if (flag === "crossed") {
    return onSlash(cell) ? solid(LED.black) : solid(LED.white);
  }
  return solid(lamp(flag));
}

function lamp(flag: FlagName): LedColor {
  switch (flag) {
    case "green":
    case "greenHeld":
    case "startGo":
      return LED.green;
    case "yellow":
    case "yellowWaving":
    case "caution":
    case "cautionWaving":
    case "randomWaving":
      return LED.yellow;
    case "red":
      return LED.red;
    case "blue":
      return LED.blue;
    case "white":
      return LED.white;
    case "black":
    case "disqualify":
    case "furled":
      return LED.black;
    case "checkered":
    case "debris":
    case "repair":
    case "crossed":
    case "serviceable":
    case "dqScoringInvalid":
    case "startHidden":
    case "startReady":
    case "startSet":
    case "fiveToGo":
    case "tenToGo":
    case "oneLapToGreen":
      return LED.white;
  }
}

function solid(color: LedColor): DotPaint {
  return { a: color, b: color, dark: color === LED.black };
}

function pair(a: LedColor, b: LedColor): DotPaint {
  return { a, b, dark: a === LED.black || b === LED.black };
}

/** Orange ball on the black field, in the thick part of the cove. */
function inMeatball(cell: Cell): boolean {
  const x = (cell.col + 0.5) / 16;
  const y = (cell.row + 0.5) / 16;
  return Math.hypot(x - 0.78, y - 0.22) < 0.14;
}

/** The diagonal that passes through the top-right corner. */
function onSlash(cell: Cell): boolean {
  const x = (cell.col + 0.5) / 16;
  const y = (cell.row + 0.5) / 16;
  return Math.abs(1 - x - y) <= 0.5 / 16;
}
