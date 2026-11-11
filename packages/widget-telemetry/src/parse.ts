import {
	asFinite,
	asRecord,
	parseRecord,
	parseStatus,
	type Phase,
} from '@salik1992/iracing-overlay-shared/json'

import { EMPTY_SHIFT, type DisplayUnits, type ShiftLightPoints } from './format.js'

export interface TelemetryNeighbor {
	position: number
	carNumber: string
	driverName: string
	classColor: string | null
	gap: string
}

export interface TelemetrySample {
	speedMps: number
	rpm: number
	gear: number
	throttle: number
	brake: number
	clutch: number
	steeringWheelAngleRad: number
	ahead: TelemetryNeighbor | null
	behind: TelemetryNeighbor | null
}

export type Incoming =
	| { type: 'status'; phase: Phase }
	| { type: 'session'; displayUnits: DisplayUnits; shift: ShiftLightPoints }
	| { type: 'telemetry'; frame: TelemetrySample }

export function parseMessage(text: string): Incoming | null {
	const record = parseRecord(text)
	if (!record) {
		return null
	}
	if (record.type === 'status') {
		return parseStatus(record.phase)
	}
	if (record.type === 'session') {
		return parseSession(record.session)
	}
	if (record.type === 'telemetry') {
		return parseTelemetry(record.frame)
	}
	return null
}

function parseSession(session: unknown): Incoming | null {
	const record = asRecord(session)
	const player = record ? asRecord(record.player) : null
	if (!player) {
		return null
	}
	const units = player.displayUnits
	if (units !== 0 && units !== 1) {
		return null
	}
	const shift = asRecord(player.shiftLight)
	return {
		type: 'session',
		displayUnits: units,
		shift: {
			firstRpm: rpmPoint(shift?.firstRpm),
			shiftRpm: rpmPoint(shift?.shiftRpm),
			lastRpm: rpmPoint(shift?.lastRpm),
			blinkRpm: rpmPoint(shift?.blinkRpm),
		},
	}
}

function rpmPoint(value: unknown): number {
	const parsed = asFinite(value)
	if (parsed === null || parsed <= 0) {
		return EMPTY_SHIFT.firstRpm
	}
	return parsed
}

function parseTelemetry(frame: unknown): Incoming | null {
	const record = asRecord(frame)
	if (!record) {
		return null
	}
	const speedMps = asFinite(record.speedMps)
	const rpm = asFinite(record.rpm)
	const gear = asFinite(record.gear)
	const throttle = asFinite(record.throttle)
	const brake = asFinite(record.brake)
	const clutch = asFinite(record.clutch)
	const steeringWheelAngleRad = asFinite(record.steeringWheelAngleRad)
	if (
		speedMps === null ||
		rpm === null ||
		gear === null ||
		throttle === null ||
		brake === null ||
		clutch === null ||
		steeringWheelAngleRad === null
	) {
		return null
	}
	return {
		type: 'telemetry',
		frame: {
			speedMps,
			rpm,
			gear,
			throttle,
			brake,
			clutch,
			steeringWheelAngleRad,
			ahead: parseNeighbor(record.ahead),
			behind: parseNeighbor(record.behind),
		},
	}
}

function parseNeighbor(value: unknown): TelemetrySample['ahead'] {
	if (value == null) {
		return null
	}
	const record = asRecord(value)
	if (!record) {
		return null
	}
	const position = asFinite(record.position)
	if (
		position === null ||
		typeof record.carNumber !== 'string' ||
		typeof record.driverName !== 'string' ||
		typeof record.gap !== 'string'
	) {
		return null
	}
	if (record.classColor != null && typeof record.classColor !== 'string') {
		return null
	}
	return {
		position,
		carNumber: record.carNumber,
		driverName: record.driverName,
		classColor: typeof record.classColor === 'string' ? record.classColor : null,
		gap: record.gap,
	}
}
