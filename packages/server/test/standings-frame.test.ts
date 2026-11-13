import assert from 'node:assert/strict'
import { test } from 'node:test'

import { buildHeader, buildStandings } from '../src/frames.js'
import { PostedLaps } from '../src/posted-laps.js'
import { RaceMemory } from '../src/race-memory.js'
import { normalizeSession } from '../src/session.js'
import { tireLetter } from '../src/tire.js'
import type { CarSample, Tick } from '../src/tick.js'

test('tire letters prefer the session catalog', () => {
	assert.equal(tireLetter(0, ['Dry', 'Wet']), 'D')
	assert.equal(tireLetter(1, ['Dry', 'Wet']), 'W')
	assert.equal(tireLetter(2, ['Hard', 'Medium', 'Soft']), 'S')
	assert.equal(tireLetter(0, []), 'D')
	assert.equal(tireLetter(1, []), 'W')
	assert.equal(tireLetter(2, []), '')
	assert.equal(tireLetter(-1, ['Dry']), '')
	assert.equal(tireLetter(Number.NaN, ['Dry']), '')
})

test('class interval and laps down stay inside the class', () => {
	const session = normalizeSession(
		{
			DriverInfo: {
				DriverCarIdx: 1,
				TireCompounds: [{ Name: 'Soft' }, { CompoundName: 'Wet' }],
				Drivers: [
					{
						CarIdx: 1,
						UserName: 'Lead',
						CarNumber: '1',
						CarClassID: 1,
						CarClassShortName: 'GTP',
						TeamName: 'Alpha',
					},
					{
						CarIdx: 2,
						UserName: 'Chase',
						CarNumber: '2',
						CarClassID: 1,
						CarClassShortName: 'GTP',
						TeamName: 'Beta',
					},
					{
						CarIdx: 3,
						UserName: 'Other',
						CarNumber: '3',
						CarClassID: 2,
						CarClassShortName: 'GTD',
						TeamName: 'Gamma',
					},
				],
			},
			SessionInfo: { Sessions: [{ SessionNum: 0, SessionType: 'Race' }] },
		},
		{ sessionNum: 0, displayUnits: 1 },
	)
	const memory = new RaceMemory()
	const tick = makeTick([
		sample(1, 1, 1, 10, 0.1, 0, 0),
		sample(2, 3, 2, 9, 0.2, 1.25, 1),
		sample(3, 2, 1, 8, 0.05, 4, 1),
	])
	const note = memory.note(tick)
	const frame = buildStandings(tick, session, note)
	const lead = frame.rows.find((row) => row.carIdx === 1)
	const chase = frame.rows.find((row) => row.carIdx === 2)
	const other = frame.rows.find((row) => row.carIdx === 3)
	assert.equal(lead?.intervalSec, null)
	assert.equal(lead?.lapsDown, 0)
	assert.equal(lead?.tire, 'S')
	assert.equal(lead?.teamName, 'Alpha')
	assert.equal(lead?.startClassPosition, 1)
	assert.equal(lead?.pitStops, 0)
	assert.equal(chase?.intervalSec, null)
	assert.equal(chase?.lapsDown, 0)
	assert.equal(chase?.tire, 'W')
	assert.equal(other?.intervalSec, null)
	assert.equal(other?.lapsDown, 0)
	assert.deepEqual(session?.tires, ['Soft', 'Wet'])
})

test('crossing the start finish does not add a lap down', () => {
	const jumped = buildStandings(
		makeTick([sample(1, 1, 1, 3, 0.01, 88.5, -1, 90), sample(2, 2, 2, 2, 0.98, 1.5, -1, 90.5)]),
		null,
	)
	assert.equal(jumped.rows.find((row) => row.carIdx === 1)?.intervalSec, null)
	assert.equal(jumped.rows.find((row) => row.carIdx === 2)?.lapsDown, 0)
	assert.equal(jumped.rows.find((row) => row.carIdx === 2)?.intervalSec, null)
})

test('an invalidated lap keeps the race place when no best lap exists', () => {
	const session = normalizeSession(
		{
			DriverInfo: {
				DriverCarIdx: 2,
				Drivers: [
					{
						CarIdx: 1,
						UserName: 'Lead',
						CarNumber: '1',
						CarClassID: 1,
						CarClassShortName: 'GTP',
					},
					{
						CarIdx: 2,
						UserName: 'Vit Salomon',
						CarNumber: '8',
						CarClassID: 1,
						CarClassShortName: 'GTP',
					},
					{
						CarIdx: 3,
						UserName: 'Chase',
						CarNumber: '3',
						CarClassID: 1,
						CarClassShortName: 'GTP',
					},
				],
			},
			SessionInfo: { Sessions: [{ SessionNum: 0, SessionType: 'Race' }] },
		},
		{ sessionNum: 0, displayUnits: 1 },
	)
	const cars = [
		sample(1, 1, 1, 4, 0.4, 0, -1),
		sample(2, 2, 2, 4, 0.3, 1.25, -1),
		sample(3, 3, 3, 4, 0.2, 2.5, -1),
	]
	const invalid = cars[1]
	if (!invalid) {
		throw new Error('missing car')
	}
	invalid.bestLapSec = -1
	invalid.lastLapSec = -1
	const tick = makeTick(cars, { sessionState: 4, sessionNum: 0 })
	const frame = buildStandings(tick, session)
	assert.deepEqual(
		frame.rows.map((row) => row.carIdx),
		[1, 2, 3],
	)
	assert.equal(frame.rows.find((row) => row.carIdx === 2)?.bestLapSec, null)
	assert.equal(frame.rows.find((row) => row.carIdx === 2)?.classPosition, 2)
	assert.equal(frame.rows.find((row) => row.carIdx === 2)?.intervalSec, null)
	assert.equal(frame.rows.find((row) => row.carIdx === 3)?.intervalSec, null)

	const live = buildStandings(
		tick,
		session,
		undefined,
		new Map([
			[1, 1],
			[2, 2],
			[3, 3],
		]),
	)
	assert.deepEqual(
		live.rows.map((row) => row.carIdx),
		[1, 2, 3],
	)
	assert.equal(live.rows.find((row) => row.carIdx === 2)?.intervalSec, null)
})

test('a qualifying time stays when the driver leaves the car', () => {
	const session = normalizeSession(
		{
			DriverInfo: {
				DriverCarIdx: 1,
				Drivers: [1, 2, 3].map((carIdx) => ({
					CarIdx: carIdx,
					UserName: `Driver ${carIdx}`,
					CarNumber: String(carIdx),
					CarClassID: 1,
					CarClassShortName: 'GTP',
				})),
			},
			SessionInfo: {
				Sessions: [
					{
						SessionNum: 1,
						SessionType: 'Lone Qualify',
						ResultsPositions: [
							{ CarIdx: 1, Position: 1, ClassPosition: 0, FastestTime: 80.1 },
							{ CarIdx: 2, Position: 2, ClassPosition: 1, FastestTime: 81.5 },
							{ CarIdx: 3, Position: 3, ClassPosition: 2, FastestTime: 82.4 },
						],
					},
				],
			},
		},
		{ sessionNum: 1, displayUnits: 1 },
	)
	const posted = new PostedLaps()
	const leader = qualifyCar(1, 80.1, 1)
	const middle = qualifyCar(2, 79, 2)
	const back = qualifyCar(3, 82.4, 3)
	posted.note(makeTick([leader, middle, back], { sessionState: 4, sessionNum: 1 }))

	const left = leaveCar(middle)
	const exited = makeTick([leader, left, back], { sessionState: 4, sessionNum: 1 })
	const frame = buildStandings(exited, session, undefined, null, posted.note(exited))
	assert.deepEqual(
		frame.rows.map((row) => row.carIdx),
		[1, 2, 3],
	)
	assert.equal(frame.rows.find((row) => row.carIdx === 2)?.bestLapSec, 81.5)
	assert.equal(frame.rows.find((row) => row.carIdx === 2)?.classPosition, 2)
	assert.equal(frame.rows.find((row) => row.carIdx === 1)?.classPosition, 1)
	assert.equal(frame.rows.find((row) => row.carIdx === 3)?.classPosition, 3)

	back.bestLapSec = 81
	const improved = makeTick([leader, left, back], { sessionState: 4, sessionNum: 1 })
	const moved = buildStandings(improved, session, undefined, null, posted.note(improved))
	assert.equal(moved.rows.find((row) => row.carIdx === 3)?.bestLapSec, 82.4)
	assert.equal(moved.rows.find((row) => row.carIdx === 2)?.bestLapSec, 81.5)
	assert.equal(moved.rows.find((row) => row.carIdx === 2)?.classPosition, 2)
	assert.equal(moved.rows.find((row) => row.carIdx === 3)?.classPosition, 3)
	assert.equal(moved.rows.find((row) => row.carIdx === 1)?.classPosition, 1)

	const cleared = new PostedLaps()
	const runner = qualifyCar(2, 81.5, 1)
	cleared.note(makeTick([runner], { sessionState: 4, sessionNum: 1 }))
	runner.bestLapSec = -1
	cleared.note(makeTick([runner], { sessionState: 4, sessionNum: 1 }))
	const forgotten = leaveCar(runner)
	const dropped = buildStandings(
		makeTick([forgotten], { sessionState: 4, sessionNum: 1 }),
		practiceSession('Lone Qualify', [2], []),
		undefined,
		null,
		cleared.note(makeTick([forgotten], { sessionState: 4, sessionNum: 1 })),
	)
	assert.equal(dropped.rows.find((row) => row.carIdx === 2)?.bestLapSec, null)

	const race = normalizeSession(
		{
			DriverInfo: {
				DriverCarIdx: 2,
				Drivers: [
					{
						CarIdx: 2,
						UserName: 'Vit Salomon',
						CarNumber: '8',
						CarClassID: 1,
						CarClassShortName: 'GTP',
					},
				],
			},
			SessionInfo: { Sessions: [{ SessionNum: 1, SessionType: 'Race' }] },
		},
		{ sessionNum: 1, displayUnits: 1 },
	)
	const racing = buildStandings(
		makeTick([forgotten], { sessionState: 4, sessionNum: 1 }),
		race,
		undefined,
		null,
		new Map([[2, { bestLapSec: 81.5, position: 2 }]]),
	)
	assert.equal(racing.rows.find((row) => row.carIdx === 2)?.bestLapSec, null)
})

test('practice shows session times posted before the server attached', () => {
	const session = practiceSession(
		'Practice',
		[1, 2, 3, 4],
		[
			{ CarIdx: 1, Position: 4, ClassPosition: 3, FastestTime: 82 },
			{ CarIdx: 2, Position: 1, ClassPosition: 0, FastestTime: 79.5 },
			{ CarIdx: 3, Position: 2, ClassPosition: 1, FastestTime: '80.400' },
			{ CarIdx: 4, Position: 3, ClassPosition: 2, FastestTime: 81.1 },
		],
	)
	const player = qualifyCar(1, 82, 0)
	const alreadyOut = [2, 3, 4].map((carIdx) => leaveCar(qualifyCar(carIdx, -1, 0)))
	const frame = buildStandings(
		makeTick([player, ...alreadyOut], { sessionState: 4, sessionNum: 1 }),
		session,
	)
	assert.deepEqual(
		frame.rows.map((row) => row.carIdx),
		[2, 3, 4, 1],
	)
	assert.equal(frame.rows.find((row) => row.carIdx === 2)?.bestLapSec, 79.5)
	assert.equal(frame.rows.find((row) => row.carIdx === 3)?.bestLapSec, 80.4)
	assert.equal(frame.rows.find((row) => row.carIdx === 4)?.bestLapSec, 81.1)
	assert.equal(frame.rows.find((row) => row.carIdx === 1)?.bestLapSec, 82)
	assert.deepEqual(
		frame.rows.map((row) => row.classPosition),
		[1, 2, 3, 4],
	)
	assert.equal(frame.rows.find((row) => row.carIdx === 2)?.position, 1)
	assert.equal(frame.rows.find((row) => row.carIdx === 1)?.position, 4)
})

test('a slower live lap does not outrank a faster session time', () => {
	const session = practiceSession(
		'Practice',
		[1, 2],
		[
			{ CarIdx: 1, Position: 1, ClassPosition: 0, FastestTime: 80.1 },
			{ CarIdx: 2, Position: 2, ClassPosition: 1, FastestTime: 81 },
		],
	)
	const frame = buildStandings(
		makeTick([qualifyCar(1, 82, 2), qualifyCar(2, 81, 1)], { sessionState: 4, sessionNum: 1 }),
		session,
	)
	assert.equal(frame.rows.find((row) => row.carIdx === 1)?.bestLapSec, 80.1)
	assert.equal(frame.rows.find((row) => row.carIdx === 1)?.classPosition, 1)
	assert.equal(frame.rows.find((row) => row.carIdx === 2)?.classPosition, 2)
})

test('a live lap the standings have not accepted does not count', () => {
	const session = practiceSession(
		'Lone Qualify',
		[1, 2],
		[
			{ CarIdx: 1, Position: 2, ClassPosition: 1, FastestTime: 81 },
			{ CarIdx: 2, Position: 1, ClassPosition: 0, FastestTime: 80 },
		],
	)
	const frame = buildStandings(
		makeTick([qualifyCar(1, 79.2, 2), qualifyCar(2, 80, 1)], {
			sessionState: 4,
			sessionNum: 1,
		}),
		session,
	)
	assert.equal(frame.rows.find((row) => row.carIdx === 1)?.bestLapSec, 81)
	assert.equal(frame.rows.find((row) => row.carIdx === 1)?.classPosition, 2)
	assert.equal(frame.rows.find((row) => row.carIdx === 2)?.bestLapSec, 80)
	assert.equal(frame.rows.find((row) => row.carIdx === 2)?.classPosition, 1)

	const practice = practiceSession(
		'Practice',
		[1, 2],
		[{ CarIdx: 1, Position: 1, ClassPosition: 0, FastestTime: 82 }],
	)
	const onlyInvalid = buildStandings(
		makeTick([qualifyCar(1, 82, 1), qualifyCar(2, 77.4, 2)], {
			sessionState: 4,
			sessionNum: 1,
		}),
		practice,
	)
	assert.equal(onlyInvalid.rows.find((row) => row.carIdx === 1)?.bestLapSec, 82)
	assert.equal(onlyInvalid.rows.find((row) => row.carIdx === 2)?.bestLapSec, null)
	assert.deepEqual(
		onlyInvalid.rows.map((row) => row.carIdx),
		[1, 2],
	)
	assert.equal(onlyInvalid.rows.find((row) => row.carIdx === 1)?.classPosition, 1)
})

test('an exited car keeps the session time when a faster live lap was rejected', () => {
	const fasterLatch = practiceSession(
		'Practice',
		[1],
		[{ CarIdx: 1, Position: 2, ClassPosition: 0, FastestTime: 82 }],
	)
	const posted = new PostedLaps()
	const quick = qualifyCar(1, 79, 1)
	posted.note(makeTick([quick], { sessionState: 4, sessionNum: 1 }))
	const left = leaveCar(quick)
	const frame = buildStandings(
		makeTick([left], { sessionState: 4, sessionNum: 1 }),
		fasterLatch,
		undefined,
		null,
		posted.note(makeTick([left], { sessionState: 4, sessionNum: 1 })),
	)
	assert.equal(frame.rows.find((row) => row.carIdx === 1)?.bestLapSec, 82)
	assert.equal(frame.rows.find((row) => row.carIdx === 1)?.position, 1)

	const fasterResult = practiceSession(
		'Practice',
		[1],
		[{ CarIdx: 1, Position: 1, ClassPosition: 0, FastestTime: 78 }],
	)
	const older = new PostedLaps()
	const slow = qualifyCar(1, 82, 0)
	older.note(makeTick([slow], { sessionState: 4, sessionNum: 1 }))
	const gone = leaveCar(slow)
	const updated = buildStandings(
		makeTick([gone], { sessionState: 4, sessionNum: 1 }),
		fasterResult,
		undefined,
		null,
		older.note(makeTick([gone], { sessionState: 4, sessionNum: 1 })),
	)
	assert.equal(updated.rows.find((row) => row.carIdx === 1)?.bestLapSec, 78)
	assert.equal(updated.rows.find((row) => row.carIdx === 1)?.position, 1)
})

test('a lap cleared on track stays while the session result still lists it', () => {
	const session = practiceSession(
		'Practice',
		[1],
		[{ CarIdx: 1, Position: 1, ClassPosition: 0, FastestTime: 81.5 }],
	)
	const posted = new PostedLaps()
	const car = qualifyCar(1, 81.5, 1)
	posted.note(makeTick([car], { sessionState: 4, sessionNum: 1 }))
	car.bestLapSec = -1
	const stillOut = makeTick([car], { sessionState: 4, sessionNum: 1 })
	const frame = buildStandings(stillOut, session, undefined, null, posted.note(stillOut))
	assert.equal(frame.rows.find((row) => row.carIdx === 1)?.bestLapSec, 81.5)
})

test('a race does not restore a best lap from the session result', () => {
	const session = practiceSession(
		'Race',
		[1, 2],
		[
			{ CarIdx: 1, Position: 1, ClassPosition: 0, FastestTime: 80, LapsComplete: 4 },
			{ CarIdx: 2, Position: 2, ClassPosition: 1, FastestTime: 70, LapsComplete: 4 },
		],
	)
	const leader = sample(1, 1, 1, 4, 0.4, 0, -1)
	leader.bestLapSec = 90
	const behind = sample(2, 2, 2, 4, 0.2, 1.5, -1)
	behind.bestLapSec = -1
	const frame = buildStandings(
		makeTick([leader, behind], { sessionState: 4, sessionNum: 1 }),
		session,
	)
	assert.equal(frame.rows.find((row) => row.carIdx === 1)?.bestLapSec, 90)
	assert.equal(frame.rows.find((row) => row.carIdx === 2)?.bestLapSec, null)
	assert.equal(frame.rows.find((row) => row.carIdx === 2)?.classPosition, 2)
	assert.equal(frame.rows.find((row) => row.carIdx === 1)?.classPosition, 1)
})

test('a car two laps behind the car ahead reports two laps down', () => {
	const tick = makeTick([sample(1, 1, 1, 10, 0.1, 0, -1), sample(2, 2, 2, 8, 0.05, 2, -1)])
	const frame = buildStandings(tick, null)
	assert.equal(frame.rows.find((row) => row.carIdx === 2)?.lapsDown, 2)
})

test('cars a lap down to the leader keep the gap while they share a lap', () => {
	const session = practiceSession('Race', [1, 2, 3, 4], [])
	const tick = makeTick(
		[
			sample(1, 1, 1, 10, 0.4, 0, -1),
			sample(2, 2, 2, 9, 0.3, 0, -1),
			sample(3, 3, 3, 9, 0.12, 0, -1),
			sample(4, 4, 4, 7, 0.05, 0, -1),
		],
		{ sessionState: 4 },
	)
	const gaps = new Map([
		[2, { aheadCarIdx: 1, sec: 48.2 }],
		[3, { aheadCarIdx: 2, sec: 1.42 }],
		[4, { aheadCarIdx: 3, sec: 90 }],
	])
	const frame = buildStandings(tick, session, undefined, null, null, gaps)
	const row = (carIdx: number) => frame.rows.find((item) => item.carIdx === carIdx)
	assert.equal(row(1)?.lapsDown, 0)
	assert.equal(row(1)?.intervalSec, null)
	assert.equal(row(2)?.lapsDown, 1)
	assert.equal(row(3)?.lapsDown, 0)
	assert.equal(row(3)?.intervalSec, 1.42)
	assert.equal(row(4)?.lapsDown, 2)
})

test('a car within a lap of the car ahead keeps the time gap across the start line', () => {
	const session = practiceSession('Race', [1, 2, 3], [])
	const tick = makeTick(
		[
			sample(1, 1, 1, 10, 0.5, 0, -1),
			sample(2, 2, 2, 9, 0.02, 0, -1),
			sample(3, 3, 3, 8, 0.97, 0, -1),
		],
		{ sessionState: 4 },
	)
	const gaps = new Map([[3, { aheadCarIdx: 2, sec: 0.8 }]])
	const frame = buildStandings(tick, session, undefined, null, null, gaps)
	const second = frame.rows.find((row) => row.carIdx === 2)
	const third = frame.rows.find((row) => row.carIdx === 3)
	assert.equal(second?.lapsDown, 1)
	assert.equal(third?.lapsDown, 0)
	assert.equal(third?.intervalSec, 0.8)
})

test('pit stops count stall entries after the car has been seen', () => {
	const memory = new RaceMemory()
	const first = memory.note(
		makeTick([sample(7, 4, 2, 3, 0.4, 0, -1)], { sessionState: 4, surface: 1 }),
	)
	assert.equal(first.pitStops.get(7), undefined)
	assert.equal(first.startClassPosition.get(7), 2)

	const left = memory.note(
		makeTick([sample(7, 4, 2, 3, 0.4, 0, -1)], { sessionState: 4, surface: 3 }),
	)
	assert.equal(left.pitStops.get(7), undefined)

	const back = memory.note(
		makeTick([sample(7, 4, 2, 3, 0.4, 0, -1)], { sessionState: 4, surface: 1 }),
	)
	assert.equal(back.pitStops.get(7), 1)

	const again = memory.note(
		makeTick([sample(7, 4, 2, 3, 0.4, 0, -1)], { sessionState: 4, surface: 1 }),
	)
	assert.equal(again.pitStops.get(7), 1)
})

test('the start position waits for racing and resets with the session', () => {
	const memory = new RaceMemory()
	const parade = memory.note(
		makeTick([sample(4, 3, 6, 1, 0.2, 0, -1)], { sessionState: 3, sessionNum: 1 }),
	)
	assert.equal(parade.startClassPosition.has(4), false)

	const green = memory.note(
		makeTick([sample(4, 3, 6, 1, 0.2, 0, -1)], { sessionState: 4, sessionNum: 1 }),
	)
	assert.equal(green.startClassPosition.get(4), 6)

	const later = memory.note(
		makeTick([sample(4, 1, 2, 2, 0.2, 0, -1)], { sessionState: 4, sessionNum: 1 }),
	)
	assert.equal(later.startClassPosition.get(4), 6)

	const joined = memory.note(
		makeTick([sample(4, 1, 2, 2, 0.2, 0, -1), sample(8, 5, 9, 2, 0.2, 0, -1)], {
			sessionState: 4,
			sessionNum: 1,
		}),
	)
	assert.equal(joined.startClassPosition.get(8), 9)

	const reset = memory.note(
		makeTick([sample(4, 1, 1, 0, 0, 0, -1)], { sessionState: 4, sessionNum: 2, surface: 1 }),
	)
	assert.equal(reset.pitStops.get(7), undefined)
	assert.equal(reset.startClassPosition.get(4), 1)
	assert.equal(reset.pitStops.get(4), undefined)
})

test('the header keeps the leader lap and the player lap apart', () => {
	const session = practiceSession('Lone Qualify', [1, 2], [])
	const player = sample(1, 2, 2, 1, 0.2, 0, 0)
	player.bestLapSec = 90
	const leader = sample(2, 1, 1, 4, 0.5, 0, 0)
	leader.bestLapSec = 70
	const tick = makeTick([player, leader])
	const frame = buildHeader(tick, session)
	assert.equal(frame.leaderLap, 4)
	assert.equal(frame.playerLap, 1)

	const missing = makeTick([leader])
	missing.playerCarIdx = 99
	missing.lap = 3
	assert.equal(buildHeader(missing, session).playerLap, 3)
})

function makeTick(
	cars: CarSample[],
	options: { sessionState?: number; sessionNum?: number; surface?: number } = {},
): Tick {
	if (options.surface !== undefined) {
		for (const car of cars) {
			car.trackSurface = options.surface
		}
	}
	return {
		sessionTick: 1,
		sessionTimeSec: 0,
		sessionNum: options.sessionNum ?? 1,
		uniqueId: 0,
		sessionId: 0,
		subSessionId: 0,
		sessionState: options.sessionState ?? 4,
		sessionTimeRemainSec: 100,
		sessionLapsRemain: 10,
		sessionFlags: 0,
		displayUnits: 1,
		replay: false,
		playerCarIdx: cars[0]?.carIdx ?? 0,
		playerEstTimeSec: 0,
		speedMps: 40,
		rpm: 7000,
		gear: 4,
		throttle: 1,
		brake: 0,
		clutch: 0,
		steeringWheelAngleRad: 0,
		steeringWheelAngleMaxRad: 4,
		lap: 1,
		lapCurrentSec: 1,
		lapLastSec: -1,
		lapBestSec: -1,
		onTrack: true,
		garageVisible: false,
		airTempC: null,
		trackTempC: null,
		windVelMps: null,
		windDirRad: null,
		cars,
	}
}

function practiceSession(type: string, drivers: number[], results: Array<Record<string, unknown>>) {
	const session = normalizeSession(
		{
			DriverInfo: {
				DriverCarIdx: drivers[0] ?? 0,
				Drivers: drivers.map((carIdx) => ({
					CarIdx: carIdx,
					UserName: `Driver ${carIdx}`,
					CarNumber: String(carIdx),
					CarClassID: 1,
					CarClassShortName: 'GTP',
				})),
			},
			SessionInfo: {
				Sessions: [{ SessionNum: 1, SessionType: type, ResultsPositions: results }],
			},
		},
		{ sessionNum: 1, displayUnits: 1 },
	)
	if (!session) {
		throw new Error('session')
	}
	return session
}

function qualifyCar(carIdx: number, bestLapSec: number, classPosition: number): CarSample {
	const car = sample(carIdx, classPosition, classPosition, 2, 0.4, 0, -1)
	car.bestLapSec = bestLapSec
	return car
}

function leaveCar(car: CarSample): CarSample {
	return {
		...car,
		bestLapSec: -1,
		classPosition: 0,
		position: 0,
		trackSurface: -1,
		lapDistPct: -1,
	}
}

function sample(
	carIdx: number,
	position: number,
	classPosition: number,
	lap: number,
	lapDistPct: number,
	estTimeSec: number,
	tireCompound: number,
	lastLapSec = -1,
): CarSample {
	return {
		carIdx,
		position,
		classPosition,
		lap,
		lapCompleted: lap,
		lapDistPct,
		estTimeSec,
		lastLapSec,
		bestLapSec: 80,
		onPitRoad: false,
		trackSurface: 3,
		tireCompound,
	}
}
