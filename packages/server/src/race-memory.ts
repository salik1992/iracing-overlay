import { beginSession, emptyStamp, type SessionStamp } from "./session-stamp.js";
import type { Tick } from "./tick.js";

const IN_PIT_STALL = 1;
const STATE_RACING = 4;

export interface RaceNote {
  pitStops: ReadonlyMap<number, number>;
  startClassPosition: ReadonlyMap<number, number>;
}

export const EMPTY_NOTE: RaceNote = {
  pitStops: new Map(),
  startClassPosition: new Map(),
};

/**
 * Pit stops and the start-line position are not in the SDK.
 * A stall already in progress the first time a car is seen is not a stop.
 * The baseline is that car's class position on the first racing tick.
 */
export class RaceMemory {
  private stamp: SessionStamp = emptyStamp();
  private inStall = new Map<number, boolean>();
  private pitStops = new Map<number, number>();
  private startClassPosition = new Map<number, number>();
  private racing = false;

  note(tick: Tick): RaceNote {
    if (beginSession(this.stamp, tick)) {
      this.inStall = new Map();
      this.pitStops = new Map();
      this.startClassPosition = new Map();
      this.racing = false;
    }
    if (tick.sessionState === STATE_RACING) {
      this.racing = true;
    }
    for (const car of tick.cars) {
      const stall = car.trackSurface === IN_PIT_STALL;
      const seen = this.inStall.get(car.carIdx);
      if (seen === undefined) {
        this.inStall.set(car.carIdx, stall);
      } else {
        if (stall && !seen) {
          this.pitStops.set(car.carIdx, (this.pitStops.get(car.carIdx) ?? 0) + 1);
        }
        this.inStall.set(car.carIdx, stall);
      }
      if (this.racing && car.classPosition > 0 && !this.startClassPosition.has(car.carIdx)) {
        this.startClassPosition.set(car.carIdx, car.classPosition);
      }
    }
    return { pitStops: this.pitStops, startClassPosition: this.startClassPosition };
  }
}
