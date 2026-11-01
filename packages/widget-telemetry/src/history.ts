export const HISTORY_MS = 5000;
export const HISTORY_GAP_MS = 100;

const VIEW = 100;

export interface PedalSample {
  at: number;
  clutch: number;
  brake: number;
  throttle: number;
}

export type Pedal = "clutch" | "brake" | "throttle";

export function clamp01(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return 0;
  }
  if (value >= 1) {
    return 1;
  }
  return value;
}

export function remember(samples: PedalSample[], sample: PedalSample, now: number, windowMs = HISTORY_MS): void {
  samples.push(sample);
  const cutoff = now - windowMs;
  let drop = 0;
  while (drop < samples.length && samples[drop]!.at < cutoff) {
    drop += 1;
  }
  if (drop > 0) {
    samples.splice(0, drop);
  }
}

export function pedalPaths(
  samples: readonly PedalSample[],
  now: number,
  key: Pedal,
  windowMs = HISTORY_MS,
): { line: string; area: string } {
  if (samples.length === 0 || !(windowMs > 0)) {
    return { line: "", area: "" };
  }
  const origin = now - windowMs;
  const lineParts: string[] = [];
  const areaParts: string[] = [];
  let segment: { x: number; y: number }[] = [];
  let previousAt: number | null = null;

  const flush = (): void => {
    const first = segment[0];
    const last = segment[segment.length - 1];
    if (!first || !last) {
      return;
    }
    lineParts.push(segment.map((point, index) => `${index === 0 ? "M" : "L"}${round(point.x)},${round(point.y)}`).join(" "));
    areaParts.push(
      `M${round(first.x)},${VIEW} ${segment.map((point) => `L${round(point.x)},${round(point.y)}`).join(" ")} L${round(last.x)},${VIEW} Z`,
    );
    segment = [];
  };

  for (const sample of samples) {
    if (sample.at < origin) {
      continue;
    }
    if (previousAt !== null && sample.at - previousAt > HISTORY_GAP_MS) {
      flush();
    }
    segment.push({
      x: ((sample.at - origin) / windowMs) * VIEW,
      y: (1 - clamp01(sample[key])) * VIEW,
    });
    previousAt = sample.at;
  }
  flush();
  return { line: lineParts.join(" "), area: areaParts.join(" ") };
}

function round(value: number): string {
  return value.toFixed(2);
}
