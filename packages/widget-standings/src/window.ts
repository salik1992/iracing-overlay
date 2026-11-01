import { MAX_ROWS, TOP_N } from "./constants.js";

export type WindowItem = { kind: "car"; position: number } | { kind: "gap"; count: number };

export interface Trimmable {
  player: boolean;
  count: number;
  items: WindowItem[];
}

/**
 * Top 5, plus a window of `radius` around the player.
 * Overlap fills from P1 up to MAX_ROWS when `fillOnOverlap` is set.
 * A 1-car hole is drawn as that car. A larger hole is an omit line.
 */
export function windowPositions(
  count: number,
  playerPos: number,
  radius: number,
  fillOnOverlap: boolean,
): WindowItem[] {
  if (count <= MAX_ROWS && radius >= count) {
    return range(1, count).map((position) => ({ kind: "car", position }));
  }
  if (count <= TOP_N) {
    return range(1, count).map((position) => ({ kind: "car", position }));
  }

  const start = Math.max(1, playerPos - radius);
  const end = Math.min(count, playerPos + radius);
  const mid = start - TOP_N - 1;
  if (fillOnOverlap && mid <= 0) {
    let shown = Math.min(count, MAX_ROWS);
    if (count - shown === 1) {
      shown = count;
    }
    const items: WindowItem[] = range(1, shown).map((position) => ({ kind: "car", position }));
    if (count > shown) {
      items.push({ kind: "gap", count: count - shown });
    }
    return items;
  }

  const items: WindowItem[] = range(1, Math.min(TOP_N, count)).map((position) => ({ kind: "car", position }));
  if (radius === 0) {
    pushTail(items, TOP_N, count);
    return items;
  }
  if (mid === 1) {
    items.push({ kind: "car", position: TOP_N + 1 });
  } else if (mid > 1) {
    items.push({ kind: "gap", count: mid });
  }
  if (end >= start) {
    for (const position of range(Math.max(start, TOP_N + 1), end)) {
      if (!items.some((item) => item.kind === "car" && item.position === position)) {
        items.push({ kind: "car", position });
      }
    }
  }
  pushTail(items, end, count);
  return items;
}

/**
 * Drop cars from the last non-player class until the driver rows fit.
 * A one-car omit is drawn as that car, so a cut that would leave one car
 * omitted removes two and the row count actually falls.
 */
export function trimOthers(groups: readonly Trimmable[]): void {
  const order = groups.map((_, index) => index).filter((index) => !groups[index]?.player).reverse();
  let guard = 0;
  while (carTotal(groups) > MAX_ROWS && guard < 1000) {
    guard += 1;
    let cut = false;
    for (const index of order) {
      if (carTotal(groups) <= MAX_ROWS) {
        return;
      }
      const group = groups[index];
      if (group && cutOne(group)) {
        cut = true;
      }
    }
    if (!cut) {
      return;
    }
  }
}

function cutOne(group: Trimmable): boolean {
  const shown = group.items.filter((item) => item.kind === "car").length;
  if (shown === 0) {
    return false;
  }
  let keep = shown - 1;
  if (group.count - keep === 1) {
    keep -= 1;
  }
  if (keep <= 0) {
    group.items = [];
    return shown > 0;
  }
  const omitted = group.count - keep;
  if (omitted <= 1) {
    group.items = range(1, group.count).map((position) => ({ kind: "car", position }));
    return false;
  }
  group.items = [
    ...range(1, keep).map((position) => ({ kind: "car" as const, position })),
    { kind: "gap", count: omitted },
  ];
  return true;
}

function carTotal(groups: readonly Trimmable[]): number {
  return groups.reduce((sum, group) => sum + group.items.filter((item) => item.kind === "car").length, 0);
}

function pushTail(items: WindowItem[], shownEnd: number, count: number): void {
  const tail = count - shownEnd;
  if (tail === 1) {
    items.push({ kind: "car", position: count });
  } else if (tail > 1) {
    items.push({ kind: "gap", count: tail });
  }
}

function range(from: number, to: number): number[] {
  const out: number[] = [];
  for (let value = from; value <= to; value += 1) {
    out.push(value);
  }
  return out;
}
