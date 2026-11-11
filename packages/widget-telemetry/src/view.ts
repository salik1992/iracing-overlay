import { tokyo } from './color.js'
import {
	EMPTY_SHIFT,
	gearLabel,
	pedalPercent,
	rpmAxis,
	rpmPosition,
	rpmTicks,
	speedReadout,
	steerReadout,
	type DisplayUnits,
	type RpmAxis,
	type ShiftLightPoints,
} from './format.js'
import { clamp01, pedalPaths, remember, type Pedal, type PedalSample } from './history.js'
import type { TelemetryNeighbor, TelemetrySample } from './parse.js'

const SVG_NS = 'http://www.w3.org/2000/svg'
const PEDALS: readonly Pedal[] = ['clutch', 'brake', 'throttle']

export interface TelemetryView {
	setIdle(idle: boolean): void
	setUnits(units: DisplayUnits): void
	setShift(points: ShiftLightPoints): void
	show(frame: TelemetrySample, at?: number): void
}

interface RelativeParts {
	root: HTMLDivElement
	pos: HTMLSpanElement
	num: HTMLSpanElement
	name: HTMLSpanElement
	gap: HTMLSpanElement
}

export function createView(parent: ParentNode): TelemetryView {
	const panel = element('div', 'panel')

	const traces = element('div', 'traces')
	const svg = svgElement('svg', {
		viewBox: '0 0 100 100',
		preserveAspectRatio: 'none',
	})
	const areas = {} as Record<Pedal, SVGPathElement>
	const lines = {} as Record<Pedal, SVGPathElement>
	for (const pedal of PEDALS) {
		const area = svgElement('path', { class: `area ${pedal}` })
		const line = svgElement('path', {
			class: `line ${pedal}`,
			'vector-effect': 'non-scaling-stroke',
		})
		areas[pedal] = area
		lines[pedal] = line
		svg.append(area, line)
	}
	traces.append(svg)

	const fills = {} as Record<Pedal, HTMLSpanElement>
	const bars = element('div', 'vbars')
	for (const pedal of PEDALS) {
		const track = element('div', `vbar ${pedal}`)
		const fill = element('span')
		fill.style.height = '0%'
		fills[pedal] = fill
		track.append(fill)
		bars.append(track)
	}

	const traceRow = element('div', 'trace-row')
	traceRow.append(traces, bars)

	const throttlePct = element('span', 'pct throttle')
	const brakePct = element('span', 'pct brake')
	const clutchPct = element('span', 'pct clutch')
	const steerPct = element('span', 'pct steer')
	throttlePct.textContent = '0%'
	brakePct.textContent = '0%'
	clutchPct.textContent = '0%'
	steerPct.textContent = '0°'
	const pedals = element('div', 'pedals')
	pedals.append(throttlePct, brakePct, clutchPct, steerPct)

	const wheel = wheelSvg()
	const inputs = element('div', 'inputs')
	inputs.append(traceRow, pedals, wheel)

	const speedValue = element('span', 'speed-value')
	speedValue.textContent = '0'
	const speedUnit = element('span', 'speed-unit')
	speedUnit.textContent = 'km/h'
	const speed = element('div', 'speed')
	speed.append(speedValue, speedUnit)
	const rpm = element('div', 'rpm')
	const scale = element('div', 'rpm-scale')
	const axisLine = element('div', 'rpm-axis')
	const axisRed = element('div', 'rpm-axis-red')
	const marks = element('div', 'rpm-marks')
	const needle = element('div', 'rpm-needle')
	scale.append(axisLine, axisRed, marks, needle)
	rpm.append(scale)
	const gear = element('div', 'gear')
	gear.textContent = 'N'
	const center = element('div', 'center')
	center.append(speed, rpm, gear)

	const ahead = relativeRow()
	const behind = relativeRow()
	const relatives = element('div', 'relatives')
	relatives.append(ahead.root, behind.root)

	panel.append(inputs, center, relatives)
	parent.append(panel)

	const history: PedalSample[] = []
	let units: DisplayUnits = 1
	let shift: ShiftLightPoints = EMPTY_SHIFT
	let axis: RpmAxis = rpmAxis(EMPTY_SHIFT)
	let last: TelemetrySample | null = null

	const paintSpeed = (): void => {
		const readout = speedReadout(last?.speedMps ?? 0, units)
		speedValue.textContent = readout.value
		speedUnit.textContent = readout.unit
	}

	const paintScale = (): void => {
		axis = rpmAxis(shift)
		const nodes: HTMLSpanElement[] = []
		for (const tick of rpmTicks(axis)) {
			const mark = element('span', `rpm-tick ${tick.mark}${tick.red ? ' is-red' : ''}`)
			const at = percent(rpmPosition(tick.rpm, axis.max))
			mark.style.left = at
			nodes.push(mark)
			if (tick.label) {
				const label = element('span', `rpm-label${tick.red ? ' is-red' : ''}`)
				label.textContent = tick.label
				label.style.left = at
				nodes.push(label)
			}
		}
		marks.replaceChildren(...nodes)
		if (axis.redAt > 0) {
			axisRed.hidden = false
			axisRed.style.left = percent(rpmPosition(axis.redAt, axis.max))
		} else {
			axisRed.hidden = true
		}
	}

	const paintNeedle = (rpmValue: number): void => {
		needle.style.left = percent(rpmPosition(rpmValue, axis.max))
	}

	paintScale()

	return {
		setIdle(idle: boolean): void {
			panel.classList.toggle('is-idle', idle)
		},
		setUnits(next: DisplayUnits): void {
			units = next
			paintSpeed()
		},
		setShift(points: ShiftLightPoints): void {
			shift = points
			paintScale()
			if (last) {
				paintNeedle(last.rpm)
			}
		},
		show(frame: TelemetrySample, at = Date.now()): void {
			last = frame
			gear.textContent = gearLabel(frame.gear)
			const steer = steerReadout(frame.steeringWheelAngleRad)
			steerPct.textContent = steer.degrees
			wheel.style.transform = `rotate(${steer.wheelDeg.toFixed(2)}deg)`
			throttlePct.textContent = pedalPercent(frame.throttle)
			brakePct.textContent = pedalPercent(frame.brake)
			clutchPct.textContent = pedalPercent(frame.clutch)
			paintSpeed()
			paintNeedle(frame.rpm)
			paintRelative(ahead, frame.ahead)
			paintRelative(behind, frame.behind)
			for (const pedal of PEDALS) {
				fills[pedal].style.height = `${(clamp01(frame[pedal]) * 100).toFixed(1)}%`
			}
			remember(
				history,
				{
					at,
					clutch: frame.clutch,
					brake: frame.brake,
					throttle: frame.throttle,
				},
				at,
			)
			for (const pedal of PEDALS) {
				const paths = pedalPaths(history, at, pedal)
				areas[pedal].setAttribute('d', paths.area)
				lines[pedal].setAttribute('d', paths.line)
			}
		},
	}
}

function percent(value: number): string {
	return `${(value * 100).toFixed(2)}%`
}

function relativeRow(): RelativeParts {
	const root = element('div', 'relative')
	const pos = element('span', 'pos')
	const num = element('span', 'num')
	const name = element('span', 'name')
	const gap = element('span', 'gap')
	root.append(pos, num, name, gap)
	return { root, pos, num, name, gap }
}

function paintRelative(parts: RelativeParts, neighbor: TelemetryNeighbor | null): void {
	if (!neighbor) {
		parts.pos.textContent = ''
		parts.num.textContent = ''
		parts.name.textContent = ''
		parts.gap.textContent = ''
		parts.num.style.removeProperty('--plate')
		parts.root.classList.remove('is-class')
		return
	}
	parts.pos.textContent = neighbor.position > 0 ? String(Math.trunc(neighbor.position)) : ''
	parts.num.textContent = neighbor.carNumber
	parts.name.textContent = neighbor.driverName
	parts.gap.textContent = neighbor.gap
	if (neighbor.classColor) {
		parts.num.style.setProperty('--plate', tokyo(neighbor.classColor))
		parts.root.classList.add('is-class')
	} else {
		parts.num.style.removeProperty('--plate')
		parts.root.classList.remove('is-class')
	}
}

function wheelSvg(): SVGSVGElement {
	const svg = svgElement('svg', { class: 'wheel', viewBox: '-50 -50 100 100' })
	svg.append(
		svgElement('circle', { r: '44', fill: 'none', stroke: 'var(--fg)', 'stroke-width': '8' }),
		svgElement('circle', { r: '11', fill: 'none', stroke: 'var(--rule)', 'stroke-width': '2' }),
		spokes(),
		svgElement('rect', { x: '-4', y: '-49', width: '8', height: '12', fill: 'var(--number)' }),
	)
	return svg
}

/** Flipped so the spokes read as a Y. The orange mark stays on the top of the rim. */
function spokes(): SVGGElement {
	const group = svgElement('g', { transform: 'rotate(180)' })
	group.append(
		svgElement('path', {
			d: 'M0,-44 V-11 M-40,19 L-9,5 M40,19 L9,5',
			fill: 'none',
			stroke: 'var(--fg)',
			'stroke-width': '6',
			'stroke-linecap': 'square',
		}),
	)
	return group
}

function element<K extends keyof HTMLElementTagNameMap>(
	tag: K,
	className?: string,
): HTMLElementTagNameMap[K] {
	const node = document.createElement(tag)
	if (className) {
		node.className = className
	}
	return node
}

function svgElement<K extends keyof SVGElementTagNameMap>(
	tag: K,
	attrs: Record<string, string>,
): SVGElementTagNameMap[K] {
	const node = document.createElementNS(SVG_NS, tag)
	for (const [key, value] of Object.entries(attrs)) {
		node.setAttribute(key, value)
	}
	return node
}
