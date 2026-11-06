import type { Board, BoardItem, CarView } from "./model.js";

interface ClassParts {
  kind: "class";
  root: HTMLDivElement;
  name: HTMLSpanElement;
}

interface GapParts {
  kind: "gap";
  root: HTMLDivElement;
  count: HTMLSpanElement;
}

interface CarParts {
  kind: "car";
  root: HTMLDivElement;
  pos: HTMLSpanElement;
  num: HTMLSpanElement;
  initial: HTMLSpanElement;
  tri: HTMLSpanElement;
  stops: HTMLSpanElement;
  tire: HTMLSpanElement;
  delta: HTMLSpanElement;
  deltaNum: HTMLSpanElement;
  gap: HTMLSpanElement;
  team: HTMLSpanElement;
}

type Parts = GapParts | CarParts;

interface ColumnParts {
  root: HTMLDivElement;
  head: ClassParts | null;
}

export interface StandingsView {
  setIdle(idle: boolean): void;
  setTeam(team: boolean): void;
  show(board: Board): void;
}

export function createView(root: ParentNode): StandingsView {
  const panel = document.createElement("div");
  panel.className = "panel";
  root.append(panel);

  const columns = new Map<string, ColumnParts>();
  const pool = new Map<string, Parts>();

  return {
    setIdle(idle) {
      panel.classList.toggle("is-idle", idle);
    },
    setTeam(team) {
      panel.classList.toggle("is-team", team);
    },
    show(board) {
      panel.dataset.mode = board.race ? "race" : "other";
      const seenColumns = new Set<string>();
      const seen = new Set<string>();
      for (const column of board.columns) {
        seenColumns.add(column.key);
        let col = columns.get(column.key);
        if (!col) {
          const element = document.createElement("div");
          element.className = "column";
          col = { root: element, head: null };
          columns.set(column.key, col);
        }
        if (column.showHead) {
          if (!col.head) {
            col.head = createClass();
          }
          col.head.root.style.setProperty("--class", column.color);
          col.head.name.textContent = column.name;
          col.root.appendChild(col.head.root);
        } else if (col.head) {
          col.head.root.remove();
          col.head = null;
        }
        for (const item of column.items) {
          seen.add(item.key);
          let parts = pool.get(item.key);
          if (!parts) {
            parts = createParts(item);
            pool.set(item.key, parts);
          }
          updateParts(parts, item);
          col.root.appendChild(parts.root);
        }
        panel.appendChild(col.root);
      }
      for (const [key, parts] of pool) {
        if (!seen.has(key)) {
          parts.root.remove();
          pool.delete(key);
        }
      }
      for (const [key, col] of columns) {
        if (!seenColumns.has(key)) {
          col.root.remove();
          columns.delete(key);
        }
      }
    },
  };
}

function createParts(item: BoardItem): Parts {
  if (item.kind === "gap") {
    return createGap();
  }
  return createCar();
}

function updateParts(parts: Parts, item: BoardItem): void {
  if (parts.kind === "gap" && item.kind === "gap") {
    parts.count.textContent = String(item.count);
    return;
  }
  if (parts.kind === "car" && item.kind === "car") {
    updateCar(parts, item.car);
  }
}

function createClass(): ClassParts {
  const root = document.createElement("div");
  root.className = "classhead";
  const line = document.createElement("span");
  line.className = "classline";
  const rest = document.createElement("span");
  rest.className = "classrest";
  const name = document.createElement("span");
  name.className = "classname";
  const tail = document.createElement("span");
  tail.className = "classline";
  rest.append(name, tail);
  root.append(line, rest);
  return { kind: "class", root, name };
}

function createGap(): GapParts {
  const root = document.createElement("div");
  root.className = "omit";
  const lead = document.createElement("span");
  lead.className = "omit-line";
  const count = document.createElement("span");
  count.className = "omit-count";
  const tail = document.createElement("span");
  tail.className = "omit-line";
  root.append(lead, count, tail);
  return { kind: "gap", root, count };
}

function createCar(): CarParts {
  const root = document.createElement("div");
  root.className = "row";
  const pos = span("pos");
  const num = span("num");
  const driver = span("driver");
  const initial = span("initial");
  const tri = span("tri");
  driver.append(initial, tri);
  const stops = span("stops");
  const tire = span("tire");
  const delta = span("delta");
  const mark = document.createElement("i");
  const deltaNum = span("delta-num");
  delta.append(mark, deltaNum);
  const gap = span("gap");
  const team = span("team");
  root.append(pos, num, driver, stops, tire, delta, gap, team);
  return { kind: "car", root, pos, num, initial, tri, stops, tire, delta, deltaNum, gap, team };
}

function updateCar(parts: CarParts, car: CarView): void {
  const classes = ["row"];
  if (car.player) {
    classes.push("is-player");
  }
  if (car.pits) {
    classes.push("is-pits");
  }
  if (car.plate) {
    classes.push("is-class");
    parts.root.style.setProperty("--plate", car.plate);
  } else {
    parts.root.style.removeProperty("--plate");
  }
  parts.root.className = classes.join(" ");
  parts.pos.textContent = car.position > 0 ? String(car.position) : "";
  parts.num.textContent = car.number;
  parts.initial.textContent = car.initial ? `${car.initial} ` : "";
  parts.tri.textContent = car.trigram;
  parts.stops.textContent = String(car.stops);
  parts.tire.textContent = car.tire;
  parts.tire.dataset.role = tireRole(car.tire);
  parts.gap.textContent = car.gap;
  parts.team.textContent = car.team;
  parts.delta.className = "delta";
  if (car.gained > 0) {
    parts.delta.classList.add("is-up");
    parts.deltaNum.textContent = String(car.gained);
  } else if (car.gained < 0) {
    parts.delta.classList.add("is-down");
    parts.deltaNum.textContent = String(Math.abs(car.gained));
  } else {
    parts.delta.classList.add("is-flat");
    parts.deltaNum.textContent = "\u2013";
  }
}

function tireRole(letter: string): string {
  switch (letter) {
    case "H":
      return "h";
    case "M":
      return "m";
    case "S":
      return "s";
    case "I":
      return "i";
    case "W":
      return "w";
    default:
      return "";
  }
}

function span(className: string): HTMLSpanElement {
  const node = document.createElement("span");
  node.className = className;
  return node;
}
