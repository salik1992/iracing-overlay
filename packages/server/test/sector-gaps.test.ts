import assert from 'node:assert/strict'
import { test } from 'node:test'

import { buildStandings, buildTelemetry } from '../src/frames.js'
import { LiveOrder } from '../src/live-order.js'
import { normalizeSession } from '../src/session.js'
import { SectorGaps } from '../src/sector-gaps.js'
import type { CarSample, Tick } from '../src/tick.js'
import type { SessionSnapshot } from '../src/types.js'

test('sector lines always include the start finish', () => {
	const session = raceSession(
		[{ carIdx: 1, classId: 1 }],
		[
			{ SectorNum: 2, SectorStartPct: '0.5' },
			{ SectorNum: 1, SectorStartPct: 0.25 },
			{ SectorNum: 3, SectorStartPct: 1 },
		],
	)
	assert.deepEqual(session.sectorStartPct, [0, 0.25, 0.5])

	const bare = raceSession([{ carIdx: 1, classId: 1 }], [])
	assert.deepEqual(bare.sectorStartPct, [0])
})

test('the interval is the same sector on the same lap and holds until the next line', () => {
	const session = raceSession(field(2), [0, 0.5])
	const gaps = new SectorGaps()
	note(gaps, session, [at(1, 1, 2, 0.4), at(2, 2, 2, 0.4)], 9)
	note(gaps, session, [at(1, 1, 2, 0.51), at(2, 2, 2, 0.42)], 10)
	const counted = note(gaps, session, [at(1, 1, 2, 0.6), at(2, 2, 2, 0.51)], 18)
	assert.equal(counted.get(2)?.aheadCarIdx, 1)
	assert.equal(counted.get(2)?.sec, 8)
	assert.equal(counted.get(1), undefined)

	const held = note(gaps, session, [at(1, 1, 2, 0.7), at(2, 2, 2, 0.6)], 24)
	assert.equal(held.get(2)?.sec, 8)
	const frame = buildStandings(
		makeTick([at(1, 1, 2, 0.7), at(2, 2, 2, 0.6)], 24),
		session,
		undefined,
		null,
		null,
		held,
	)
	assert.equal(frame.rows.find((row) => row.carIdx === 1)?.intervalSec, null)
	assert.equal(frame.rows.find((row) => row.carIdx === 2)?.intervalSec, 8)
})

test('a line the leader has not reached stays blank', () => {
	const session = raceSession(field(2), [0, 0.5])
	const gaps = new SectorGaps()
	note(gaps, session, [at(1, 1, 2, 0.4), at(2, 2, 2, 0.4)], 9)
	const early = note(gaps, session, [at(1, 1, 2, 0.42), at(2, 2, 2, 0.51)], 12)
	assert.equal(early.get(2), undefined)
	const later = note(gaps, session, [at(1, 1, 2, 0.51), at(2, 2, 2, 0.6)], 20)
	assert.equal(later.get(2), undefined)
})

test('the gap uses the sector the follower just finished', () => {
	const session = raceSession(field(2), [0, 0.2, 0.4, 0.6, 0.8])
	const gaps = new SectorGaps()
	const leader = [
		[0.1, 5],
		[0.21, 10],
		[0.35, 15],
		[0.45, 20],
		[0.55, 25],
		[0.65, 30],
		[0.75, 35],
		[0.85, 40],
	] as const
	for (const [pct, time] of leader) {
		note(gaps, session, [at(1, 1, 5, pct), at(2, 2, 5, 0.1)], time)
	}
	const counted = note(gaps, session, [at(1, 1, 5, 0.9), at(2, 2, 5, 0.21)], 55)
	assert.equal(counted.get(2)?.sec, 45)
})

test("a lap down compares that lap's line, and the lap counter still owns +1L", () => {
	const session = raceSession(field(2), [0, 0.5])
	const gaps = new SectorGaps()
	note(gaps, session, [at(1, 1, 5, 0.4), at(2, 2, 5, 0.2)], 8)
	note(gaps, session, [at(1, 1, 5, 0.51), at(2, 2, 5, 0.3)], 10)
	note(gaps, session, [at(1, 1, 5, 0.96), at(2, 2, 5, 0.4)], 16)
	note(gaps, session, [at(1, 1, 6, 0.02), at(2, 2, 5, 0.45)], 20)
	note(gaps, session, [at(1, 1, 6, 0.12), at(2, 2, 5, 0.49)], 28)
	const counted = note(gaps, session, [at(1, 1, 6, 0.2), at(2, 2, 5, 0.51)], 30)
	assert.equal(counted.get(2)?.sec, 20)

	const frame = buildStandings(
		makeTick([at(1, 1, 6, 0.8), at(2, 2, 5, 0.55)], 70),
		session,
		undefined,
		null,
		null,
		note(gaps, session, [at(1, 1, 6, 0.8), at(2, 2, 5, 0.55)], 70),
	)
	assert.equal(frame.rows.find((row) => row.carIdx === 2)?.intervalSec, 20)
	assert.equal(frame.rows.find((row) => row.carIdx === 2)?.lapsDown, 1)
})

test('the start finish line keeps the sector interval, including a lagged lap counter', () => {
	const session = raceSession(field(2), [0, 0.5])
	const gaps = new SectorGaps()
	note(gaps, session, [at(1, 1, 2, 0.4), at(2, 2, 2, 0.4)], 8)
	note(gaps, session, [at(1, 1, 2, 0.51), at(2, 2, 2, 0.42)], 10)
	note(gaps, session, [at(1, 1, 2, 0.6), at(2, 2, 2, 0.51)], 18)
	note(gaps, session, [at(1, 1, 2, 0.72), at(2, 2, 2, 0.6)], 24)
	note(gaps, session, [at(1, 1, 2, 0.84), at(2, 2, 2, 0.66)], 28)
	note(gaps, session, [at(1, 1, 2, 0.96), at(2, 2, 2, 0.7)], 32)
	const leaderCrossed = note(gaps, session, [at(1, 1, 2, 0.02), at(2, 2, 2, 0.74)], 40)
	assert.equal(leaderCrossed.get(2)?.sec, 8)

	note(gaps, session, [at(1, 1, 3, 0.08), at(2, 2, 2, 0.86)], 44)
	note(gaps, session, [at(1, 1, 3, 0.1), at(2, 2, 2, 0.96)], 46)
	const followerCrossed = note(gaps, session, [at(1, 1, 3, 0.12), at(2, 2, 3, 0.02)], 48)
	assert.equal(followerCrossed.get(2)?.sec, 8)
})

test('a pass clears both gaps until the next sector, even if the order returns', () => {
	const session = raceSession(field(3), [0, 0.4, 0.7])
	const gaps = new SectorGaps()
	const ranks = new Map([
		[1, 1],
		[2, 2],
		[3, 3],
	])
	note(gaps, session, [at(1, 1, 4, 0.3), at(2, 2, 4, 0.2), at(3, 3, 4, 0.1)], 8, ranks)
	note(gaps, session, [at(1, 1, 4, 0.41), at(2, 2, 4, 0.3), at(3, 3, 4, 0.2)], 10, ranks)
	note(gaps, session, [at(1, 1, 4, 0.5), at(2, 2, 4, 0.41), at(3, 3, 4, 0.3)], 15, ranks)
	const before = note(
		gaps,
		session,
		[at(1, 1, 4, 0.55), at(2, 2, 4, 0.5), at(3, 3, 4, 0.41)],
		18,
		ranks,
	)
	assert.equal(before.get(2)?.sec, 5)
	assert.equal(before.get(2)?.aheadCarIdx, 1)
	assert.equal(before.get(3)?.sec, 3)
	assert.equal(before.get(3)?.aheadCarIdx, 2)

	const passed = new Map([
		[1, 1],
		[3, 2],
		[2, 3],
	])
	const cleared = note(
		gaps,
		session,
		[at(1, 1, 4, 0.58), at(3, 2, 4, 0.52), at(2, 3, 4, 0.48)],
		19,
		passed,
	)
	assert.equal(cleared.get(2), undefined)
	assert.equal(cleared.get(3), undefined)

	const restored = note(
		gaps,
		session,
		[at(1, 1, 4, 0.6), at(2, 2, 4, 0.5), at(3, 3, 4, 0.45)],
		20,
		ranks,
	)
	assert.equal(restored.get(2), undefined)
	assert.equal(restored.get(3), undefined)

	note(gaps, session, [at(1, 1, 4, 0.71), at(3, 2, 4, 0.6), at(2, 3, 4, 0.5)], 30, passed)
	const next = note(
		gaps,
		session,
		[at(1, 1, 4, 0.8), at(3, 2, 4, 0.71), at(2, 3, 4, 0.55)],
		36,
		passed,
	)
	assert.equal(next.get(3)?.aheadCarIdx, 1)
	assert.equal(next.get(3)?.sec, 6)
	assert.equal(next.get(2), undefined)
})

test('live class order picks the car ahead, including another class between them', () => {
	const session = raceSession(
		[
			{ carIdx: 1, classId: 1 },
			{ carIdx: 2, classId: 2 },
			{ carIdx: 3, classId: 1 },
		],
		[0, 0.5],
	)
	const gaps = new SectorGaps()
	const live = new Map([
		[1, 1],
		[3, 2],
		[2, 1],
	])
	note(gaps, session, [at(1, 1, 3, 0.4), at(2, 1, 3, 0.35), at(3, 3, 3, 0.2)], 8, live)
	note(gaps, session, [at(1, 1, 3, 0.51), at(2, 1, 3, 0.4), at(3, 3, 3, 0.3)], 10, live)
	note(gaps, session, [at(1, 1, 3, 0.6), at(2, 1, 3, 0.51), at(3, 3, 3, 0.4)], 14, live)
	const counted = note(
		gaps,
		session,
		[at(1, 1, 3, 0.7), at(2, 1, 3, 0.6), at(3, 2, 3, 0.51)],
		22,
		live,
	)
	assert.equal(counted.get(3)?.aheadCarIdx, 1)
	assert.equal(counted.get(3)?.sec, 12)
	assert.equal(counted.get(2), undefined)

	const slow = at(3, 2, 3, 0.51)
	slow.bestLapSec = -1
	const frame = buildStandings(
		makeTick([at(1, 1, 3, 0.7), at(2, 1, 3, 0.6), slow], 22),
		session,
		undefined,
		live,
		null,
		counted,
	)
	assert.equal(frame.rows.find((row) => row.carIdx === 3)?.intervalSec, 12)
	assert.equal(frame.rows.find((row) => row.carIdx === 3)?.bestLapSec, null)
	assert.equal(frame.rows.find((row) => row.carIdx === 3)?.classPosition, 2)
})

test('the pre-green grid is the car ahead', () => {
	const session = raceSession(
		[
			{ carIdx: 1, classId: 1 },
			{ carIdx: 3, classId: 1 },
		],
		[0, 0.5],
		[
			{ Position: 0, ClassPosition: 0, CarIdx: 3 },
			{ Position: 1, ClassPosition: 1, CarIdx: 1 },
		],
	)
	const gaps = new SectorGaps()
	note(gaps, session, [at(3, 1, 1, 0.4), at(1, 2, 1, 0.4)], 4, null, 3)
	note(gaps, session, [at(3, 1, 1, 0.51), at(1, 2, 1, 0.42)], 6, null, 3)
	const counted = note(gaps, session, [at(3, 1, 1, 0.6), at(1, 2, 1, 0.51)], 11, null, 3)
	assert.equal(counted.get(1)?.aheadCarIdx, 3)
	assert.equal(counted.get(1)?.sec, 5)
})

test('a tow across the lap does not invent a sector time', () => {
	const session = raceSession(field(2), [0, 0.5])
	const gaps = new SectorGaps()
	note(gaps, session, [at(1, 1, 2, 0.1), at(2, 2, 2, 0.4)], 5)
	note(gaps, session, [at(1, 1, 2, 0.9), at(2, 2, 2, 0.45)], 6)
	const counted = note(gaps, session, [at(1, 1, 2, 0.92), at(2, 2, 2, 0.51)], 12)
	assert.equal(counted.get(2), undefined)
})

test('backing across a line does not replace the interval', () => {
	const session = raceSession(field(2), [0, 0.5])
	const gaps = new SectorGaps()
	note(gaps, session, [at(1, 1, 2, 0.4), at(2, 2, 2, 0.4)], 8)
	note(gaps, session, [at(1, 1, 2, 0.51), at(2, 2, 2, 0.42)], 10)
	note(gaps, session, [at(1, 1, 2, 0.6), at(2, 2, 2, 0.51)], 18)
	note(gaps, session, [at(1, 1, 2, 0.62), at(2, 2, 2, 0.48)], 19)
	const again = note(gaps, session, [at(1, 1, 2, 0.64), at(2, 2, 2, 0.52)], 21)
	assert.equal(again.get(2)?.sec, 8)
})

test('checkered freezes each gap at the start finish line', () => {
	const session = raceSession(field(2), [0, 0.5])
	const gaps = new SectorGaps()
	const see = (leader: CarSample, follower: CarSample, time: number, state = 4) =>
		note(gaps, session, [leader, follower], time, null, state)

	see(at(1, 1, 8, 0.96), at(2, 2, 8, 0.4), 5)
	see(at(1, 1, 9, 0.02), at(2, 2, 8, 0.5), 10)
	see(at(1, 1, 9, 0.9), at(2, 2, 8, 0.9), 20)
	see(at(1, 1, 9, 0.96), at(2, 2, 8, 0.96), 26)
	see(at(1, 1, 10, 0.02), at(2, 2, 8, 0.97), 30, 5)
	const finished = see(at(1, 1, 10, 0.3), at(2, 2, 9, 0.02), 40, 5)
	assert.equal(finished.get(2)?.sec, 30)
	assert.equal(finished.get(2)?.lapsDown, 1)

	see(at(1, 1, 10, 0.4), at(2, 2, 9, 0.1), 44, 5)
	see(at(1, 1, 10, 0.48), at(2, 2, 9, 0.46), 50, 5)
	const later = see(at(1, 1, 10, 0.55), at(2, 2, 9, 0.51), 55, 5)
	assert.equal(later.get(2)?.sec, 30)
	assert.equal(later.get(2)?.lapsDown, 1)

	const exited = at(1, 1, -1, -1)
	exited.trackSurface = -1
	const held = see(exited, at(2, 2, 9, 0.6), 70, 5)
	assert.equal(held.get(2)?.sec, 30)
	assert.equal(held.get(2)?.lapsDown, 1)

	const cool = see(exited, at(2, 2, 9, 0.6), 80, 6)
	assert.equal(cool.get(2)?.sec, 30)
	assert.equal(cool.get(2)?.lapsDown, 1)

	const frame = buildStandings(
		makeTick([exited, at(2, 2, -1, -1)], 80, 6),
		session,
		undefined,
		null,
		null,
		cool,
	)
	assert.equal(frame.rows.find((row) => row.carIdx === 2)?.intervalSec, 30)
	assert.equal(frame.rows.find((row) => row.carIdx === 2)?.lapsDown, 1)
})

test('a new session clears sector intervals', () => {
	const session = raceSession(field(2), [0, 0.5])
	const gaps = new SectorGaps()
	note(gaps, session, [at(1, 1, 2, 0.4), at(2, 2, 2, 0.4)], 8)
	note(gaps, session, [at(1, 1, 2, 0.51), at(2, 2, 2, 0.42)], 10)
	note(gaps, session, [at(1, 1, 2, 0.6), at(2, 2, 2, 0.51)], 18)
	const reset = gaps.note(
		makeTick([at(1, 1, 2, 0.6), at(2, 2, 2, 0.55)], 19, 4, 2),
		session,
		null,
	)
	assert.equal(reset.get(2), undefined)
})

test('checkered holds the cars beside the finish line', () => {
	const session = raceSession(field(3), [0, 0.5])
	const gaps = new SectorGaps()
	const live = new LiveOrder()
	const see = (cars: CarSample[], time: number, state = 4) => {
		const tick = makeTick(cars, time, state)
		const ranks = live.note(tick, session)
		const counted = gaps.note(tick, session, ranks)
		return { tick, ranks, counted }
	}
	// cars[0] is the player. Car 2 runs between car 1 and car 3.
	const row = (carIdx: number, lap: number, pct: number) => at(carIdx, carIdx, lap, pct)

	see([row(2, 5, 0.4), row(1, 5, 0.4), row(3, 5, 0.4)], 8)
	see([row(2, 5, 0.42), row(1, 5, 0.51), row(3, 5, 0.4)], 10)
	see([row(2, 5, 0.51), row(1, 5, 0.6), row(3, 5, 0.42)], 18)
	see([row(2, 5, 0.6), row(1, 5, 0.7), row(3, 5, 0.51)], 24)
	assert.equal(gaps.finishNeighbors().size, 0)
	assert.equal(
		see([row(2, 5, 0.9), row(1, 5, 0.96), row(3, 5, 0.8)], 30, 5).counted.get(2)?.sec,
		8,
	)

	const leader = see([row(2, 5, 0.96), row(1, 6, 0.02), row(3, 5, 0.9)], 40, 5)
	assert.deepEqual(gaps.finishNeighbors().get(1), { aheadCarIdx: null, behindCarIdx: 2 })
	assert.equal(gaps.finishNeighbors().has(2), false)
	const before = buildTelemetry(
		leader.tick,
		session,
		undefined,
		leader.ranks,
		null,
		leader.counted,
		gaps.finishNeighbors(),
	)
	assert.equal(before.ahead?.driverName, 'Driver 1')
	assert.equal(before.ahead?.gap, '-8.000')
	assert.equal(before.behind?.driverName, 'Driver 3')
	assert.equal(before.behind?.gap, '+6.000')

	const finished = see([row(2, 6, 0.02), row(1, 6, 0.2), row(3, 5, 0.96)], 52, 5)
	assert.deepEqual(gaps.finishNeighbors().get(2), { aheadCarIdx: 1, behindCarIdx: 3 })
	assert.equal(finished.counted.get(2)?.sec, 12)
	assert.equal(finished.counted.get(2)?.lapsDown, 0)
	const atLine = buildTelemetry(
		finished.tick,
		session,
		undefined,
		finished.ranks,
		null,
		finished.counted,
		gaps.finishNeighbors(),
	)
	assert.equal(atLine.ahead?.driverName, 'Driver 1')
	assert.equal(atLine.ahead?.gap, '-12.000')
	assert.equal(atLine.behind?.driverName, 'Driver 3')
	assert.equal(atLine.behind?.gap, '+6.000')

	// The player jumps ahead of the leader. The finish-line cars stay put.
	const swapped = see([row(2, 6, 0.4), row(1, 6, 0.05), row(3, 6, 0.2)], 60, 5)
	const held = buildTelemetry(
		swapped.tick,
		session,
		undefined,
		swapped.ranks,
		null,
		swapped.counted,
		gaps.finishNeighbors(),
	)
	assert.equal(held.ahead?.driverName, 'Driver 1')
	assert.equal(held.ahead?.gap, '-12.000')
	assert.equal(held.behind?.driverName, 'Driver 3')
	assert.equal(held.behind?.gap, '+6.000')
	const shuffled = buildTelemetry(
		swapped.tick,
		session,
		undefined,
		swapped.ranks,
		null,
		swapped.counted,
		null,
	)
	assert.equal(shuffled.ahead, null)

	const coolCars = [row(2, 6, 0.4), row(1, 6, 0.05), row(3, 6, 0.2)]
	const player = coolCars[0]
	const leaderCar = coolCars[1]
	const trailer = coolCars[2]
	if (!player || !leaderCar || !trailer) {
		throw new Error('cars')
	}
	player.bestLapSec = 80
	leaderCar.bestLapSec = 90
	trailer.bestLapSec = 70
	const cool = see(coolCars, 80, 6)
	assert.deepEqual(gaps.finishNeighbors().get(2), { aheadCarIdx: 1, behindCarIdx: 3 })
	const cooled = buildTelemetry(
		cool.tick,
		session,
		undefined,
		cool.ranks,
		null,
		cool.counted,
		gaps.finishNeighbors(),
	)
	assert.equal(cooled.ahead?.driverName, 'Driver 1')
	assert.equal(cooled.ahead?.gap, '-12.000')
	assert.equal(cooled.behind?.driverName, 'Driver 3')

	see([row(2, 6, 0.45), row(1, 6, 0.1), row(3, 6, 0.25)], 90, 4)
	assert.equal(gaps.finishNeighbors().size, 0)

	const reset = gaps.note(makeTick([row(2, 6, 0.45), row(1, 6, 0.1)], 91, 5, 2), session, null)
	assert.equal(reset.get(2), undefined)
	assert.equal(gaps.finishNeighbors().size, 0)
})

test('a follower keeps the interval when the leader takes the flag and the order moves', () => {
	const session = raceSession(field(2), [0, 0.5])
	const gaps = new SectorGaps()
	const live = new LiveOrder()
	const see = (leader: CarSample, follower: CarSample, time: number, state = 4) => {
		const tick = makeTick([follower, leader], time, state)
		const ranks = live.note(tick, session)
		return gaps.note(tick, session, ranks)
	}

	see(at(1, 1, 5, 0.4), at(2, 2, 5, 0.4), 8)
	see(at(1, 1, 5, 0.51), at(2, 2, 5, 0.42), 10)
	const counted = see(at(1, 1, 5, 0.6), at(2, 2, 5, 0.51), 18)
	assert.equal(counted.get(2)?.sec, 8)
	see(at(1, 1, 5, 0.96), at(2, 2, 5, 0.8), 26, 5)

	// The lap counter lags, so the finished leader sorts behind the car still running.
	const lagged = see(at(1, 1, 5, 0.02), at(2, 2, 5, 0.84), 30, 5)
	assert.equal(lagged.get(2)?.sec, 8)
	assert.equal(lagged.get(2)?.aheadCarIdx, 1)
	assert.deepEqual(gaps.finishNeighbors().get(1), { aheadCarIdx: null, behindCarIdx: 2 })
	assert.equal(gaps.finishNeighbors().has(2), false)

	see(at(1, 1, 6, 0.1), at(2, 2, 5, 0.96), 34, 5)
	const restored = see(at(1, 1, 6, 0.16), at(2, 2, 5, 0.97), 36, 5)
	assert.equal(restored.get(2)?.sec, 8)
	const frame = buildStandings(
		makeTick([at(2, 2, 5, 0.97), at(1, 1, 6, 0.16)], 36, 5),
		session,
		undefined,
		live.note(makeTick([at(2, 2, 5, 0.97), at(1, 1, 6, 0.16)], 36, 5), session),
		null,
		restored,
	)
	assert.equal(frame.rows.find((row) => row.carIdx === 2)?.intervalSec, 8)

	const finished = see(at(1, 1, 6, 0.2), at(2, 2, 6, 0.02), 42, 5)
	assert.equal(finished.get(2)?.sec, 12)
	assert.equal(finished.get(2)?.lapsDown, 0)
	assert.deepEqual(gaps.finishNeighbors().get(2), { aheadCarIdx: 1, behindCarIdx: null })
})

test('practice does not count a race interval', () => {
	const session = normalizeSession(
		{
			DriverInfo: {
				DriverCarIdx: 1,
				Drivers: [1, 2].map((carIdx) => ({
					CarIdx: carIdx,
					UserName: `Driver ${carIdx}`,
					CarNumber: String(carIdx),
					CarClassID: 1,
					CarClassShortName: 'GTP',
				})),
			},
			SessionInfo: { Sessions: [{ SessionNum: 1, SessionType: 'Practice' }] },
		},
		{ sessionNum: 1, displayUnits: 1 },
	)
	assert.ok(session)
	const gaps = new SectorGaps()
	note(gaps, session, [at(1, 1, 2, 0.4), at(2, 2, 2, 0.4)], 8)
	const counted = note(gaps, session, [at(1, 1, 2, 0.51), at(2, 2, 2, 0.51)], 12)
	assert.equal(counted.size, 0)
})

function note(
	gaps: SectorGaps,
	session: SessionSnapshot,
	cars: CarSample[],
	sessionTimeSec: number,
	live: ReadonlyMap<number, number> | null = null,
	sessionState = 4,
) {
	return gaps.note(makeTick(cars, sessionTimeSec, sessionState), session, live)
}

function field(count: number): Array<{ carIdx: number; classId: number }> {
	return Array.from({ length: count }, (_, index) => ({ carIdx: index + 1, classId: 1 }))
}

function raceSession(
	drivers: Array<{ carIdx: number; classId: number }>,
	sectors: Array<number | string | { SectorNum: number; SectorStartPct: number | string }>,
	grid: Array<Record<string, unknown>> = [],
): SessionSnapshot {
	const session = normalizeSession(
		{
			SplitTimeInfo: {
				Sectors: sectors.map((sector, index) =>
					typeof sector === 'object'
						? sector
						: { SectorNum: index, SectorStartPct: sector },
				),
			},
			QualifyResultsInfo: { Results: grid },
			DriverInfo: {
				DriverCarIdx: drivers[0]?.carIdx ?? 0,
				Drivers: drivers.map((driver) => ({
					CarIdx: driver.carIdx,
					UserName: `Driver ${driver.carIdx}`,
					CarNumber: String(driver.carIdx),
					CarClassID: driver.classId,
					CarClassShortName: driver.classId === 1 ? 'GTP' : 'GT3',
				})),
			},
			SessionInfo: { Sessions: [{ SessionNum: 1, SessionType: 'Race' }] },
		},
		{ sessionNum: 1, displayUnits: 1 },
	)
	if (!session) {
		throw new Error('session')
	}
	return session
}

function at(carIdx: number, classPosition: number, lap: number, lapDistPct: number): CarSample {
	return {
		carIdx,
		position: classPosition,
		classPosition,
		lap,
		lapCompleted: Math.max(0, lap - 1),
		lapDistPct,
		estTimeSec: 0,
		lastLapSec: -1,
		bestLapSec: 80,
		onPitRoad: false,
		trackSurface: 3,
		tireCompound: -1,
	}
}

function makeTick(
	cars: CarSample[],
	sessionTimeSec: number,
	sessionState = 4,
	sessionNum = 1,
): Tick {
	return {
		sessionTick: 1,
		sessionTimeSec,
		sessionNum,
		uniqueId: 0,
		sessionId: 0,
		subSessionId: 0,
		sessionState,
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
