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

/** One checker square, and the width of one debris stripe. */
export const CELL_PX = 4;
export const FLAG_W = 48;
export const FLAG_H = 16;
/** Space between each flag and the counter. */
export const FLAG_GAP = 32;
/** Orange ball on the repair flag. Fits the 16px bar with a black margin. */
export const MEATBALL_PX = 10;

export type Motion = "static" | "blink" | "swap";

export interface FlagPaint {
  image: string;
  size: string;
  position: string;
  repeat: string;
  color: string;
  swapImage: string;
  swapSize: string;
  /** Hairline on a solid black field, so the lamp stays visible on the panel. */
  dark: boolean;
  slash: boolean;
  slashColor: LedColor;
  motion: Motion;
}

/**
 * One pair of lamps, so the first match wins. Driver warnings come before the
 * race-state lamps. serviceable, dqScoringInvalid, startHidden, startReady,
 * startSet, fiveToGo, tenToGo, and oneLapToGreen stay off.
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

export function flagPaint(flag: FlagName): FlagPaint {
  const motion = motionOf(flag);
  if (flag === "checkered") {
    return paint({
      image: checkerboard(LED.white, LED.black),
      size: tileSize(),
      repeat: "repeat",
      color: LED.black,
      swapImage: checkerboard(LED.black, LED.white),
      swapSize: tileSize(),
      motion,
    });
  }
  if (flag === "debris") {
    return paint({
      image: stripes(LED.yellow, LED.red),
      repeat: "repeat",
      color: LED.yellow,
      swapImage: stripes(LED.red, LED.yellow),
      motion,
    });
  }
  if (flag === "repair") {
    return paint({
      image: `radial-gradient(circle ${MEATBALL_PX / 2}px at center, ${LED.orange} 100%, transparent 0)`,
      position: "center",
      color: LED.black,
      dark: true,
      motion,
    });
  }
  if (flag === "crossed") {
    return paint({
      color: LED.white,
      slash: true,
      motion,
    });
  }
  const color = lamp(flag);
  return paint({ color, dark: color === LED.black, motion });
}

/** Even 4px cells, including the top-left, use `even`. */
function checkerboard(even: string, odd: string): string {
  return `repeating-conic-gradient(${odd} 0% 25%, ${even} 0% 50%)`;
}

/** Even 4px columns use `evenCol`. */
function stripes(evenCol: string, oddCol: string): string {
  return `repeating-linear-gradient(90deg, ${evenCol} 0 ${CELL_PX}px, ${oddCol} 0 ${CELL_PX * 2}px)`;
}

function tileSize(): string {
  return `${CELL_PX * 2}px ${CELL_PX * 2}px`;
}

function paint(patch: Partial<FlagPaint> & Pick<FlagPaint, "color" | "motion">): FlagPaint {
  return {
    image: patch.image ?? "none",
    size: patch.size ?? "auto",
    position: patch.position ?? "0 0",
    repeat: patch.repeat ?? "no-repeat",
    color: patch.color,
    swapImage: patch.swapImage ?? "none",
    swapSize: patch.swapSize ?? "auto",
    dark: patch.dark ?? false,
    slash: patch.slash ?? false,
    slashColor: LED.black,
    motion: patch.motion,
  };
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
