/** Cove 16 fills the same square the design study used. */
export const MATRIX_N = 16;

export interface Cell {
  row: number;
  col: number;
  /** Distance from the top-right corner, in box units. */
  dist: number;
}

/**
 * Corner cap of a square: cells outside the circle centered on the
 * bottom-left corner. That edge scoops toward the top-right.
 */
export function coveCells(n: number = MATRIX_N): Cell[] {
  const cells: Cell[] = [];
  for (let row = 0; row < n; row += 1) {
    for (let col = 0; col < n; col += 1) {
      const cx = (col + 0.5) / n;
      const cy = (row + 0.5) / n;
      const distFar = Math.hypot(cx, 1 - cy);
      if (distFar < 1) {
        continue;
      }
      cells.push({ row, col, dist: Math.hypot(1 - cx, cy) });
    }
  }
  return cells;
}

/** Largest at the corner, smallest along the scooped edge. */
export function dotScale(dist: number): number {
  return 0.62 - 0.28 * Math.min(dist, 1);
}
