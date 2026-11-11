import assert from 'node:assert/strict'
import { test } from 'node:test'

import { buildTelemetry } from '../src/frames.js'
import { EMPTY_NOTE } from '../src/race-memory.js'
import type { CountedGap } from '../src/sector-gaps.js'
import { normalizeSession } from '../src/session.js'
import type { CarSample, Tick } from '../src/tick.js'
import type { SessionSnapshot } from '../src/types.js'

test("practice and qualifying relatives use the gap to the player's best lap", () => {
	const session = practiceSession()
	const tick = makeTick(2, [
		car(1, 2, 1, 3, 0.4, 90),
		car(2, 3, 2, 3, 0.3, 91.2),
		car(4, 1, 1, 3, 0.8, 70),
		car(3, 4, 3, 3, 0.2, 92.5),
	])
	const frame = buildTelemetry(tick, session)
	assert.deepEqual(frame.ahead, {
		position: 1,
		carNumber: '2',
		driverName: 'A. Nielsen',
		classColor: '#e10600',
		gap: '-1.200',
	})
	assert.deepEqual(frame.behind, {
		position: 3,
		carNumber: '7',
		driverName: 'C. Berg',
		classColor: '#e10600',
		gap: '+1.300',
	})
	assert.equal(frame.rpm, 7000)

	const qualify = { ...session, session: { ...session.session, type: 'Lone Qualify' } }
	const qualifyFrame = buildTelemetry(tick, qualify)
	assert.equal(qualifyFrame.ahead?.gap, '-1.200')
	assert.equal(qualifyFrame.behind?.gap, '+1.300')
})

test('a single class uses a neutral plate and the ends of the class stay empty', () => {
	const session = practiceSession(false)
	const leader = buildTelemetry(
		makeTick(1, [car(1, 1, 1, 3, 0.4, 90), car(2, 2, 2, 3, 0.3, 91.2)]),
		session,
	)
	assert.equal(leader.ahead, null)
	assert.equal(leader.behind?.driverName, 'Vit Salomon')
	assert.equal(leader.behind?.classColor, null)
	assert.equal(leader.behind?.gap, '+1.200')

	const last = buildTelemetry(
		makeTick(2, [car(1, 1, 1, 3, 0.4, 90), car(2, 2, 2, 3, 0.3, 91.2)]),
		session,
	)
	assert.equal(last.behind, null)
	assert.equal(last.ahead?.gap, '-1.200')
	assert.equal(last.ahead?.classColor, null)
})

test('race relatives show the interval to the player', () => {
	const session = raceSession()
	const gaps = new Map<number, CountedGap>([
		[2, { aheadCarIdx: 1, sec: 0.432 }],
		[3, { aheadCarIdx: 2, sec: 1.205 }],
	])
	const cars = [
		car(1, 1, 1, 6, 0.5, 80),
		car(2, 3, 2, 6, 0.4, 81),
		car(4, 2, 1, 6, 0.9, 70),
		car(3, 4, 3, 6, 0.2, 82),
	]
	const frame = buildTelemetry(makeTick(2, cars), session, EMPTY_NOTE, null, null, gaps)
	assert.equal(frame.ahead?.driverName, 'A. Nielsen')
	assert.equal(frame.ahead?.position, 1)
	assert.equal(frame.ahead?.gap, '-0.432')
	assert.equal(frame.behind?.driverName, 'C. Berg')
	assert.equal(frame.behind?.gap, '+1.205')
	assert.notEqual(frame.ahead?.driverName, 'M. Okada')

	const lapped = cars.map((entry) => (entry.carIdx === 2 ? { ...entry, lap: 5 } : entry))
	const down = buildTelemetry(makeTick(2, lapped), session, EMPTY_NOTE, null, null, gaps)
	assert.equal(down.ahead?.gap, '-1L')
	assert.equal(down.behind?.gap, '+1.205')

	const lead = buildTelemetry(makeTick(1, cars), session, EMPTY_NOTE, null, null, gaps)
	assert.equal(lead.ahead, null)
	assert.equal(lead.behind?.gap, '+0.432')
})

function practiceSession(multi = true): SessionSnapshot {
	const drivers = [
		driver(1, 'A. Nielsen', '2', 100, 'GTP', 14747136),
		driver(2, 'Vit Salomon', '22', 100, 'GTP', 14747136),
		driver(3, 'C. Berg', '7', 100, 'GTP', 14747136),
	]
	if (multi) {
		drivers.push(driver(4, 'M. Okada', '45', 200, 'LMP2', 37072))
	}
	const results = [
		{ CarIdx: 1, Position: 1, ClassPosition: 0, FastestTime: 90 },
		{ CarIdx: 2, Position: 2, ClassPosition: 1, FastestTime: 91.2 },
		{ CarIdx: 3, Position: 4, ClassPosition: 2, FastestTime: 92.5 },
	]
	if (multi) {
		results.push({ CarIdx: 4, Position: 3, ClassPosition: 0, FastestTime: 70 })
	}
	const session = normalizeSession(
		{
			DriverInfo: { DriverCarIdx: 2, Drivers: drivers },
			SessionInfo: {
				Sessions: [{ SessionNum: 0, SessionType: 'Practice', ResultsPositions: results }],
			},
		},
		{ sessionNum: 0, displayUnits: 1 },
	)
	if (!session) {
		throw new Error('session')
	}
	return session
}

function raceSession(): SessionSnapshot {
	const session = normalizeSession(
		{
			DriverInfo: {
				DriverCarIdx: 2,
				Drivers: [
					driver(1, 'A. Nielsen', '2', 100, 'GTP', 14747136),
					driver(2, 'Vit Salomon', '22', 100, 'GTP', 14747136),
					driver(3, 'C. Berg', '7', 100, 'GTP', 14747136),
					driver(4, 'M. Okada', '45', 200, 'LMP2', 37072),
				],
			},
			SessionInfo: { Sessions: [{ SessionNum: 0, SessionType: 'Race' }] },
		},
		{ sessionNum: 0, displayUnits: 1 },
	)
	if (!session) {
		throw new Error('session')
	}
	return session
}

function driver(
	carIdx: number,
	name: string,
	carNumber: string,
	classId: number,
	className: string,
	classColor: number,
): Record<string, unknown> {
	return {
		CarIdx: carIdx,
		UserName: name,
		CarNumber: carNumber,
		CarClassID: classId,
		CarClassShortName: className,
		CarClassColor: classColor,
	}
}

function makeTick(playerCarIdx: number, cars: CarSample[]): Tick {
	return {
		sessionTick: 1,
		sessionTimeSec: 10,
		sessionNum: 0,
		uniqueId: 0,
		sessionId: 0,
		subSessionId: 0,
		sessionState: 4,
		sessionTimeRemainSec: 100,
		sessionLapsRemain: 10,
		sessionFlags: 0,
		displayUnits: 1,
		replay: false,
		playerCarIdx,
		playerEstTimeSec: 0,
		speedMps: 50,
		rpm: 7000,
		gear: 4,
		throttle: 0.8,
		brake: 0,
		clutch: 0.25,
		steeringWheelAngleRad: 0.1,
		steeringWheelAngleMaxRad: 4,
		lap: 3,
		lapCurrentSec: 12,
		lapLastSec: -1,
		lapBestSec: 91.2,
		onTrack: true,
		garageVisible: false,
		airTempC: null,
		trackTempC: null,
		windVelMps: null,
		windDirRad: null,
		cars,
	}
}

function car(
	carIdx: number,
	position: number,
	classPosition: number,
	lap: number,
	lapDistPct: number,
	bestLapSec: number,
): CarSample {
	return {
		carIdx,
		position,
		classPosition,
		lap,
		lapCompleted: lap,
		lapDistPct,
		estTimeSec: 0,
		lastLapSec: -1,
		bestLapSec,
		onPitRoad: false,
		trackSurface: 3,
		tireCompound: 0,
	}
}
