import { FADE_MS, motionOf, paintDot, shownFlag, type FlagName } from "./flags.js";
import { coveCells, dotScale, MATRIX_N } from "./geometry.js";

export interface FlagView {
  setIdle(idle: boolean): void;
  show(flags: readonly string[]): void;
}

export function createView(parent: HTMLElement): FlagView {
  const cells = coveCells();
  const matrix = document.createElement("div");
  matrix.className = "matrix";
  const dots = cells.map((cell) => {
    const dot = document.createElement("div");
    dot.className = "dot";
    const cellPct = 100 / MATRIX_N;
    const size = cellPct * dotScale(cell.dist);
    const origin = (cellPct - size) / 2;
    dot.style.left = `${cell.col * cellPct + origin}%`;
    dot.style.top = `${cell.row * cellPct + origin}%`;
    dot.style.width = `${size}%`;
    dot.style.height = `${size}%`;
    matrix.append(dot);
    return dot;
  });
  parent.append(matrix);

  let displayed: FlagName | null = null;
  let generation = 0;

  const applyPaint = (flag: FlagName | null): void => {
    matrix.classList.toggle("is-blink", flag !== null && motionOf(flag) === "blink");
    const swap = flag !== null && motionOf(flag) === "swap";
    for (const dot of dots) {
      dot.classList.remove("is-swap");
    }
    if (swap) {
      void matrix.offsetWidth;
    }
    cells.forEach((cell, index) => {
      const dot = dots[index];
      if (!dot || !flag) {
        return;
      }
      const paint = paintDot(flag, cell);
      dot.style.setProperty("--led-a", paint.a);
      dot.style.setProperty("--led-b", paint.b);
      dot.style.backgroundColor = paint.a;
      dot.classList.toggle("dark", paint.dark);
      dot.classList.toggle("is-swap", swap);
    });
  };

  return {
    setIdle(idle: boolean): void {
      matrix.classList.toggle("is-idle", idle);
    },
    show(flags: readonly string[]): void {
      const next = shownFlag(flags);
      if (next === displayed) {
        return;
      }
      const generationNow = ++generation;
      const leaving = displayed !== null;
      displayed = next;
      matrix.classList.remove("is-shown");
      const apply = (): void => {
        if (generationNow !== generation) {
          return;
        }
        applyPaint(next);
        // Layout once at opacity 0 so the fade runs even on the first frame.
        void matrix.offsetWidth;
        matrix.classList.toggle("is-shown", next !== null);
      };
      if (leaving) {
        window.setTimeout(apply, FADE_MS);
      } else {
        apply();
      }
    },
  };
}
