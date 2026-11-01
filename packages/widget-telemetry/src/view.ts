import type { DisplayUnits } from "./format.js";
import { gearLabel, speedReadout, steerReadout, steerUnitText } from "./format.js";
import { clamp01, pedalPaths, remember, type Pedal, type PedalSample } from "./history.js";
import type { TelemetrySample } from "./parse.js";

const SVG_NS = "http://www.w3.org/2000/svg";
const PEDALS: readonly Pedal[] = ["clutch", "brake", "throttle"];

export interface TelemetryView {
  setIdle(idle: boolean): void;
  setUnits(units: DisplayUnits): void;
  show(frame: TelemetrySample, at?: number): void;
}

export function createView(parent: ParentNode): TelemetryView {
  const panel = element("div", "panel");
  const gear = element("div", "ghost");
  gear.textContent = "N";

  const wheel = wheelSvg();
  const steerValue = element("span", "readout");
  steerValue.textContent = "0°";
  const steerUnit = element("span", "unit");
  steerUnit.textContent = steerUnitText("");
  const steerRead = element("span", "steer-read");
  steerRead.append(steerUnit, steerValue);
  const steerLock = element("div", "steer-lock");
  steerLock.append(wheel, steerRead);

  const speedValue = element("span", "readout");
  speedValue.textContent = "0";
  const speedUnit = element("span", "unit");
  speedUnit.textContent = " km/h";
  const speedLock = element("div", "speed-lock");
  speedLock.append(speedValue, speedUnit);

  const traces = element("div", "traces");
  const svg = svgElement("svg", {
    viewBox: "0 0 100 100",
    preserveAspectRatio: "none",
  });
  const areas = {} as Record<Pedal, SVGPathElement>;
  const lines = {} as Record<Pedal, SVGPathElement>;
  for (const pedal of PEDALS) {
    const area = svgElement("path", { class: `area ${pedal}` });
    const line = svgElement("path", {
      class: `line ${pedal}`,
      "vector-effect": "non-scaling-stroke",
    });
    areas[pedal] = area;
    lines[pedal] = line;
    svg.append(area, line);
  }
  traces.append(svg);

  const fills = {} as Record<Pedal, HTMLSpanElement>;
  const bars = element("div", "vbars");
  for (const pedal of PEDALS) {
    const track = element("div", `vbar ${pedal}`);
    const fill = element("span");
    fill.style.height = "0%";
    fills[pedal] = fill;
    track.append(fill);
    bars.append(track);
  }

  const traceRow = element("div", "trace-row");
  traceRow.append(traces, bars);
  panel.append(gear, steerLock, speedLock, traceRow);
  parent.append(panel);

  const history: PedalSample[] = [];
  let units: DisplayUnits = 1;
  let last: TelemetrySample | null = null;

  const paintSpeed = (): void => {
    const readout = speedReadout(last?.speedMps ?? 0, units);
    speedValue.textContent = readout.value;
    speedUnit.textContent = readout.unit;
  };

  return {
    setIdle(idle: boolean): void {
      panel.classList.toggle("is-idle", idle);
    },
    setUnits(next: DisplayUnits): void {
      units = next;
      paintSpeed();
    },
    show(frame: TelemetrySample, at = Date.now()): void {
      last = frame;
      gear.textContent = gearLabel(frame.gear);
      const steer = steerReadout(frame.steeringWheelAngleRad);
      steerValue.textContent = steer.degrees;
      steerUnit.textContent = steerUnitText(steer.side);
      wheel.style.transform = `rotate(${steer.wheelDeg.toFixed(2)}deg)`;
      paintSpeed();
      for (const pedal of PEDALS) {
        fills[pedal].style.height = `${(clamp01(frame[pedal]) * 100).toFixed(1)}%`;
      }
      remember(history, {
        at,
        clutch: frame.clutch,
        brake: frame.brake,
        throttle: frame.throttle,
      }, at);
      for (const pedal of PEDALS) {
        const paths = pedalPaths(history, at, pedal);
        areas[pedal].setAttribute("d", paths.area);
        lines[pedal].setAttribute("d", paths.line);
      }
    },
  };
}

function wheelSvg(): SVGSVGElement {
  const svg = svgElement("svg", { class: "wheel", viewBox: "-50 -50 100 100" });
  svg.append(
    svgElement("circle", { r: "40", fill: "none", stroke: "var(--fg)", "stroke-width": "3" }),
    svgElement("circle", { r: "11", fill: "none", stroke: "var(--rule)", "stroke-width": "2" }),
    spokes(),
    svgElement("rect", { x: "-3", y: "-48", width: "6", height: "12", fill: "var(--number)" }),
  );
  return svg;
}

/** Flipped so the spokes read as a Y. The orange mark stays on the top of the rim. */
function spokes(): SVGGElement {
  const group = svgElement("g", { transform: "rotate(180)" });
  group.append(svgElement("path", {
    d: "M0,-40 V-11 M-34,16 L-9,5 M34,16 L9,5",
    fill: "none",
    stroke: "var(--fg)",
    "stroke-width": "3",
    "stroke-linecap": "square",
  }));
  return group;
}

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) {
    node.className = className;
  }
  return node;
}

function svgElement<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) {
    node.setAttribute(key, value);
  }
  return node;
}
