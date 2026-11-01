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

export function speedReadout(speedMps: number, units: DisplayUnits): { value: string; unit: string } {
  const speed = Number.isFinite(speedMps) ? Math.abs(speedMps) : 0;
  if (units === 1) {
    return { value: String(Math.round(speed * 3.6)), unit: " km/h" };
  }
  return { value: String(Math.round(speed * MPS_TO_MPH)), unit: " mph" };
}
