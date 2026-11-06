export type DisplayUnits = 0 | 1;

const RAD_TO_DEG = 180 / Math.PI;
const MPS_TO_MPH = 3600 / 1609.344;

export interface SteerReadout {
  degrees: string;
  side: "" | "L" | "R";
  /** Degrees for CSS rotate(). Negated so a left turn rotates the wheel counterclockwise. */
  wheelDeg: number;
}

export function gearLabel(gear: number): string {
  if (!Number.isFinite(gear)) {
    return "N";
  }
  if (gear < 0) {
    return "R";
  }
  if (gear < 1) {
    return "N";
  }
  return String(Math.trunc(gear));
}

/**
 * Positive SteeringWheelAngle is taken as a left turn.
 * The SDK documents the value as radians only, so this follows the usual iRacing sign.
 */
export function steerReadout(angleRad: number): SteerReadout {
  if (!Number.isFinite(angleRad)) {
    return { degrees: "0°", side: "", wheelDeg: 0 };
  }
  const wheelDeg = angleRad === 0 ? 0 : -(angleRad * RAD_TO_DEG);
  const shown = Math.round(Math.abs(angleRad) * RAD_TO_DEG);
  if (shown === 0) {
    return { degrees: "0°", side: "", wheelDeg };
  }
  return {
    degrees: `${shown}°`,
    side: angleRad > 0 ? "L" : "R",
    wheelDeg,
  };
}

/** Keeps the angle a letter-width from the wheel when the side letter is absent. */
export function steerUnitText(side: "" | "L" | "R"): string {
  return `${side === "" ? "\u00A0" : side} `;
}

export const SHIFT_LIGHTS = 15;
const GREEN_RED_LIGHTS = 10;
const BLUE_LIGHTS = 5;
/** Full cluster flashes at this period once RPM reaches the blink point. */
export const SHIFT_BLINK_MS = 100;

export interface ShiftLightPoints {
  firstRpm: number;
  shiftRpm: number;
  lastRpm: number;
  blinkRpm: number;
}

export const EMPTY_SHIFT: ShiftLightPoints = {
  firstRpm: 0,
  shiftRpm: 0,
  lastRpm: 0,
  blinkRpm: 0,
};

/**
 * Fifteen lights, left to right. The first ten cross firstRpm to shiftRpm,
 * five green then five red. The last five are blue and cross shiftRpm to
 * lastRpm. At blinkRpm the whole bar follows `blinkOn`.
 */
export function shiftLights(rpm: number, points: ShiftLightPoints, blinkOn: boolean): boolean[] {
  const lights = Array.from({ length: SHIFT_LIGHTS }, () => false);
  if (!Number.isFinite(rpm)) {
    return lights;
  }
  const first = positive(points.firstRpm);
  const shift = positive(points.shiftRpm);
  const last = positive(points.lastRpm);
  const blink = positive(points.blinkRpm);
  if (blink > 0 && rpm >= blink) {
    lights.fill(blinkOn);
    return lights;
  }
  const count = litShiftLights(rpm, first, shift, last);
  for (let index = 0; index < count; index += 1) {
    lights[index] = true;
  }
  return lights;
}

export function shiftBlinkOn(at: number): boolean {
  if (!Number.isFinite(at)) {
    return true;
  }
  return Math.floor(at / SHIFT_BLINK_MS) % 2 === 0;
}

function litShiftLights(rpm: number, first: number, shift: number, last: number): number {
  if (!(last > first) || rpm < first) {
    return 0;
  }
  if (rpm >= last) {
    return SHIFT_LIGHTS;
  }
  if (shift > first && last > shift) {
    if (rpm < shift) {
      return lightsInSpan(rpm, first, shift, GREEN_RED_LIGHTS);
    }
    return GREEN_RED_LIGHTS + lightsInSpan(rpm, shift, last, BLUE_LIGHTS);
  }
  return lightsInSpan(rpm, first, last, SHIFT_LIGHTS);
}

function lightsInSpan(rpm: number, start: number, end: number, count: number): number {
  if (rpm >= end) {
    return count;
  }
  const step = (end - start) / count;
  if (!(step > 0)) {
    return 0;
  }
  return Math.min(count, Math.floor((rpm - start) / step) + 1);
}

function positive(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

/**
 * Inverse of a log scale. Low rpm stays packed and the top of the range
 * gets more width. 1 keeps every 100 rpm mark separable in the rpm slot.
 */
const RPM_CURVE = 1;
const FALLBACK_RPM_MAX = 10000;

export interface RpmAxis {
  /** Right end of the scale. */
  max: number;
  /** Axis turns red after this rpm. 0 keeps the whole axis white. */
  redAt: number;
}

/** Blink point plus 10% of that value. Last light, then 10000, when blink is missing. */
export function rpmAxis(points: ShiftLightPoints): RpmAxis {
  const blink = positive(points.blinkRpm);
  const last = positive(points.lastRpm);
  if (blink > 0) {
    return { max: (blink * 11) / 10, redAt: blink };
  }
  if (last > 0) {
    return { max: (last * 11) / 10, redAt: 0 };
  }
  return { max: FALLBACK_RPM_MAX, redAt: 0 };
}

/** 0 at the left, 1 at the right. Clamped to the axis. */
export function rpmPosition(rpm: number, max: number): number {
  if (!(max > 0) || !Number.isFinite(rpm)) {
    return 0;
  }
  const t = Math.min(1, Math.max(0, rpm / max));
  return (Math.exp(RPM_CURVE * t) - 1) / (Math.exp(RPM_CURVE) - 1);
}

export type RpmMark = "minor" | "mid" | "major";

export interface RpmTick {
  rpm: number;
  mark: RpmMark;
  /** Thousands digit on a 1000 mark. Empty otherwise. */
  label: string;
  red: boolean;
}

export function rpmTicks(axis: RpmAxis): RpmTick[] {
  const ticks: RpmTick[] = [];
  if (!(axis.max > 0)) {
    return ticks;
  }
  const last = Math.floor((axis.max + 1e-6) / 100) * 100;
  for (let rpm = 100; rpm <= last; rpm += 100) {
    const major = rpm % 1000 === 0;
    const mid = !major && rpm % 500 === 0;
    ticks.push({
      rpm,
      mark: major ? "major" : mid ? "mid" : "minor",
      label: major ? String(rpm / 1000) : "",
      red: axis.redAt > 0 && rpm > axis.redAt,
    });
  }
  return ticks;
}

export function speedReadout(speedMps: number, units: DisplayUnits): { value: string; unit: string } {
  const speed = Number.isFinite(speedMps) ? Math.abs(speedMps) : 0;
  if (units === 1) {
    return { value: String(Math.round(speed * 3.6)), unit: "km/h" };
  }
  return { value: String(Math.round(speed * MPS_TO_MPH)), unit: "mph" };
}

/** Pedal travel as a whole percent from 0 to 100. */
export function pedalPercent(value: number): string {
  const clamped = !Number.isFinite(value) || value <= 0 ? 0 : value >= 1 ? 1 : value;
  return `${Math.round(clamped * 100)}%`;
}
