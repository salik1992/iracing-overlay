import { CELL_PX, FADE_MS, flagPaint, shownFlag, type FlagName } from "./flags.js";

export interface HeaderFields {
  type: string;
  weather: string;
  counter: string;
  flags: readonly string[];
}

export interface HeaderView {
  setIdle(idle: boolean): void;
  show(fields: HeaderFields): void;
  showFlags(flags: readonly string[]): void;
}

interface FlagNodes {
  root: HTMLElement;
  face: HTMLElement;
  swap: HTMLElement;
  slash: HTMLElement;
}

export function createView(root: ParentNode): HeaderView {
  const panel = document.createElement("div");
  panel.className = "panel";
  const type = document.createElement("div");
  type.className = "type";
  const mid = document.createElement("div");
  mid.className = "mid";
  const left = createFlag();
  const counter = document.createElement("div");
  counter.className = "counter";
  const right = createFlag();
  const weather = document.createElement("div");
  weather.className = "weather";
  mid.append(left.root, counter, right.root);
  panel.append(type, mid, weather);
  root.append(panel);

  const lamps = [left, right];
  let displayed: FlagName | null = null;
  let generation = 0;

  const paintLamps = (flag: FlagName | null): void => {
    for (const lamp of lamps) {
      applyFlag(lamp, flag);
    }
    void left.root.offsetWidth;
    if (flag) {
      for (const lamp of lamps) {
        lamp.root.classList.add("is-shown");
      }
    }
  };

  return {
    setIdle(idle) {
      panel.classList.toggle("is-idle", idle);
    },
    show(fields) {
      type.textContent = fields.type;
      counter.textContent = fields.counter;
      weather.textContent = fields.weather;
      this.showFlags(fields.flags);
    },
    showFlags(flags) {
      const next = shownFlag(flags);
      if (next === displayed) {
        return;
      }
      const generationNow = ++generation;
      const leaving = displayed !== null;
      displayed = next;
      const apply = (): void => {
        if (generationNow !== generation) {
          return;
        }
        paintLamps(next);
      };
      if (leaving) {
        for (const lamp of lamps) {
          lamp.root.classList.remove("is-shown");
        }
        window.setTimeout(apply, FADE_MS);
      } else {
        apply();
      }
    },
  };
}

function createFlag(): FlagNodes {
  const flag = document.createElement("div");
  flag.className = "flag";
  const motion = document.createElement("div");
  motion.className = "flag-motion";
  const face = document.createElement("span");
  face.className = "flag-face";
  const swap = document.createElement("span");
  swap.className = "flag-swap";
  const slash = document.createElement("span");
  slash.className = "flag-slash";
  motion.append(face, swap, slash);
  flag.append(motion);
  return { root: flag, face, swap, slash };
}

function applyFlag(nodes: FlagNodes, flag: FlagName | null): void {
  nodes.root.className = "flag";
  nodes.swap.classList.remove("is-swap");
  if (!flag) {
    nodes.face.style.backgroundImage = "none";
    nodes.swap.style.backgroundImage = "none";
    return;
  }
  const paint = flagPaint(flag);
  nodes.root.classList.add(`is-${flag}`);
  if (paint.motion === "blink") {
    nodes.root.classList.add("is-blink");
  }
  if (paint.dark) {
    nodes.root.classList.add("is-dark");
  }
  nodes.face.style.backgroundColor = paint.color;
  nodes.face.style.backgroundImage = paint.image;
  nodes.face.style.backgroundSize = paint.size;
  nodes.face.style.backgroundPosition = paint.position;
  nodes.face.style.backgroundRepeat = paint.repeat;
  nodes.swap.style.backgroundImage = paint.swapImage;
  nodes.swap.style.backgroundSize = paint.swapSize;
  nodes.swap.style.backgroundPosition = paint.position;
  nodes.swap.style.backgroundRepeat = paint.repeat;
  if (paint.motion === "swap") {
    nodes.swap.classList.add("is-swap");
  }
  nodes.slash.style.background = paint.slashColor;
  nodes.slash.style.height = `${CELL_PX}px`;
}
