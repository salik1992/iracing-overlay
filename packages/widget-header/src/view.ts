export interface HeaderFields {
  type: string;
  weather: string;
  counter: string;
}

export interface HeaderView {
  setIdle(idle: boolean): void;
  show(fields: HeaderFields): void;
}

export function createView(root: ParentNode): HeaderView {
  const panel = document.createElement("div");
  panel.className = "panel";
  const type = document.createElement("div");
  type.className = "type";
  const counter = document.createElement("div");
  counter.className = "counter";
  const weather = document.createElement("div");
  weather.className = "weather";
  panel.append(type, counter, weather);
  root.append(panel);

  return {
    setIdle(idle) {
      panel.classList.toggle("is-idle", idle);
    },
    show(fields) {
      type.textContent = fields.type;
      counter.textContent = fields.counter;
      weather.textContent = fields.weather;
    },
  };
}
