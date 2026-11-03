import type { CarSample, Tick } from "./tick.js";

const NOT_IN_WORLD = -1;

export interface PostedLap {
  bestLapSec: number;
  /** Overall position while the car was still in the world. 0 when iRacing had none. */
  position: number;
}

/**
 * Best laps are not kept by the SDK once the driver gets out.
 * Remember the last positive lap from while the car was still in the world.
 * A lap cleared on track is forgotten, so an invalidated lap does not return on exit.
 */
export class PostedLaps {
  private sessionNum = -1;
  private laps = new Map<number, PostedLap>();

  note(tick: Tick): ReadonlyMap<number, PostedLap> {
    if (tick.sessionNum !== this.sessionNum) {
      this.sessionNum = tick.sessionNum;
      this.laps = new Map();
    }
    for (const car of tick.cars) {
      if (hasLeftCar(car)) {
        continue;
      }
      if (car.bestLapSec > 0 && Number.isFinite(car.bestLapSec)) {
        const previous = this.laps.get(car.carIdx);
        const position = car.position > 0 ? car.position : (previous?.position ?? 0);
        this.laps.set(car.carIdx, { bestLapSec: car.bestLapSec, position });
      } else {
        this.laps.delete(car.carIdx);
      }
    }
    return this.laps;
  }
}

/** NotInWorld, or a lap-distance of -1, which iRacing sends for a driver out of the car. */
export function hasLeftCar(car: Pick<CarSample, "trackSurface" | "lapDistPct">): boolean {
  return car.trackSurface === NOT_IN_WORLD || car.lapDistPct < 0;
}
