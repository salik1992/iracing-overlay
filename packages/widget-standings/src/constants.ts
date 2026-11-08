export const TOP_N = 5;
/** Cars kept at the front of a class that does not contain the player. */
export const OTHER_TOP = 5;
/**
 * Car rows in the 640px panel. Padding and the bottom border take 11px,
 * and one omit line takes 18px. A 19px row leaves 31 cars beside that line,
 * and a multiclass board still has room for a second omit line.
 */
export const MAX_ROWS = 31;
/** A multiclass column spends one row on its class heading so the omit line still fits. */
export const HEADING_ROWS = 1;
export const TEAM_MS = 10_000;
/** Race columns: the gap stays up, then stops, tyre, and place change. */
export const GAP_MS = 20_000;
export const DETAIL_MS = 7_000;

export type RaceSlot = "gap" | "detail";

/** The gap holds for 20s. Stops, the tyre, and the place change then hold for 7s. */
export function advanceSlot(slot: RaceSlot): { slot: RaceSlot; afterMs: number } {
  if (slot === "gap") {
    return { slot: "detail", afterMs: GAP_MS };
  }
  return { slot: "gap", afterMs: DETAIL_MS };
}
