import { lapsDown, raceClassAhead, standingCars } from './frames.js'
import { beginSession, emptyStamp, type SessionStamp } from './session-stamp.js'
import type { CarSample, Tick } from './tick.js'
import type { SessionSnapshot } from './types.js'

const NOT_IN_WORLD = -1
const STATE_CHECKERED = 5
const STATE_COOLDOWN = 6
/**
 * A lap-percent step larger than this is a tow or a reset.
 * A real sector crossing at the sample rate is a few thousandths of a lap.
 */
const MAX_STEP = 0.15

/** Interval counted at a sector line, valid only while that car is still ahead. */
export interface CountedGap {
	aheadCarIdx: number
	sec: number
	/** Set when the gap was frozen at the checkered start/finish line. */
	lapsDown?: number
}

interface Place {
	pct: number
	lap: number
}

/**
 * Race intervals are the session-clock gap at the last sector line the car
 * behind crossed. The stamp matches the class car ahead on that same lap.
 * The number holds until the next line. A new car ahead clears it.
 * Under the checkered flag the start/finish crossing is the last update.
 * SplitTimeInfo gives the lines. The start/finish line is one of them.
 */
export class SectorGaps {
	private stamp: SessionStamp = emptyStamp()
	private place = new Map<number, Place>()
	private stamps = new Map<number, Map<string, number>>()
	private lastHit = new Map<number, { lap: number; sector: number }>()
	private shown = new Map<number, CountedGap>()
	private frozen = new Map<number, CountedGap>()
	private done = new Set<number>()

	note(
		tick: Tick,
		session: SessionSnapshot | null,
		liveClassPosition: ReadonlyMap<number, number> | null,
	): ReadonlyMap<number, CountedGap> {
		if (beginSession(this.stamp, tick)) {
			this.place = new Map()
			this.stamps = new Map()
			this.lastHit = new Map()
			this.shown = new Map()
			this.frozen = new Map()
			this.done = new Set()
		}
		const finished =
			tick.sessionState === STATE_CHECKERED || tick.sessionState === STATE_COOLDOWN
		if (!finished) {
			this.frozen = new Map()
			this.done = new Set()
		}
		const ahead = raceClassAhead(tick, session, liveClassPosition)
		if (
			ahead === null ||
			!Number.isFinite(tick.sessionTimeSec) ||
			tick.sessionState === STATE_COOLDOWN
		) {
			return finished ? this.publish() : new Map()
		}
		const lines = session?.sectorStartPct ?? []
		const boundaries = lines.length > 0 ? lines : [0]
		const finishLine = boundaries.indexOf(0)
		const crossed = new Set<number>()
		const finishers = new Set<number>()
		for (const car of standingCars(tick, session)) {
			const hits = this.observe(car, boundaries, tick.sessionTimeSec)
			if (hits.length === 0) {
				continue
			}
			crossed.add(car.carIdx)
			if (hits.includes(finishLine)) {
				finishers.add(car.carIdx)
			}
		}
		const checkered = tick.sessionState === STATE_CHECKERED
		for (const carIdx of crossed) {
			if (this.done.has(carIdx)) {
				continue
			}
			const previous = this.shown.get(carIdx)
			this.count(carIdx, ahead)
			if (!checkered || !finishers.has(carIdx)) {
				continue
			}
			this.done.add(carIdx)
			const gap = this.shown.get(carIdx) ?? previous
			if (!gap) {
				continue
			}
			const frozen: CountedGap = {
				aheadCarIdx: gap.aheadCarIdx,
				sec: gap.sec,
				lapsDown: this.finishLaps(tick, ahead, carIdx),
			}
			this.frozen.set(carIdx, frozen)
			this.shown.set(carIdx, frozen)
		}
		for (const carIdx of [...this.shown.keys()]) {
			if (this.done.has(carIdx)) {
				continue
			}
			const gap = this.shown.get(carIdx)
			if (!gap || ahead.get(carIdx) !== gap.aheadCarIdx) {
				this.shown.delete(carIdx)
			}
		}
		return this.publish()
	}

	private publish(): ReadonlyMap<number, CountedGap> {
		for (const [carIdx, gap] of this.frozen) {
			this.shown.set(carIdx, gap)
		}
		return this.shown
	}

	private finishLaps(
		tick: Tick,
		ahead: ReadonlyMap<number, number | null>,
		carIdx: number,
	): number {
		const aheadIdx = ahead.get(carIdx)
		if (aheadIdx === undefined || aheadIdx === null) {
			return 0
		}
		const aheadCar = tick.cars.find((car) => car.carIdx === aheadIdx)
		const car = tick.cars.find((item) => item.carIdx === carIdx)
		if (!aheadCar || !car) {
			return 0
		}
		return lapsDown(aheadCar, car)
	}

	private observe(car: CarSample, lines: readonly number[], time: number): number[] {
		if (!onTrackPct(car)) {
			this.place.delete(car.carIdx)
			return []
		}
		const pct = car.lapDistPct >= 1 ? 0 : car.lapDistPct
		const prev = this.place.get(car.carIdx)
		this.place.set(car.carIdx, { pct, lap: car.lap })
		if (!prev) {
			return []
		}
		const wrapped = wrap(prev.pct, pct)
		if (wrapped === null) {
			return []
		}
		const hits = boundariesCrossed(lines, prev.pct, pct, wrapped)
		const counted: number[] = []
		for (const sector of hits) {
			const line = lines[sector] ?? 0
			const lap = wrapped ? (line <= pct ? lapAfter(prev.lap, car.lap) : prev.lap) : car.lap
			const bag = this.stamps.get(car.carIdx) ?? new Map<string, number>()
			const key = `${lap}:${sector}`
			if (bag.has(key)) {
				this.stamps.set(car.carIdx, bag)
				continue
			}
			bag.set(key, time)
			this.stamps.set(car.carIdx, bag)
			this.lastHit.set(car.carIdx, { lap, sector })
			counted.push(sector)
		}
		return counted
	}

	private count(carIdx: number, ahead: ReadonlyMap<number, number | null>): void {
		const hit = this.lastHit.get(carIdx)
		const leader = ahead.get(carIdx)
		if (!hit || leader === undefined || leader === null) {
			this.shown.delete(carIdx)
			return
		}
		const mine = this.stamps.get(carIdx)?.get(`${hit.lap}:${hit.sector}`)
		const theirs = this.stamps.get(leader)?.get(`${hit.lap}:${hit.sector}`)
		if (mine === undefined || theirs === undefined) {
			this.shown.delete(carIdx)
			return
		}
		const sec = Math.round((mine - theirs) * 1000) / 1000
		if (sec < 0) {
			this.shown.delete(carIdx)
			return
		}
		this.shown.set(carIdx, { aheadCarIdx: leader, sec })
	}
}

function onTrackPct(car: CarSample): boolean {
	return (
		car.trackSurface !== NOT_IN_WORLD && Number.isFinite(car.lapDistPct) && car.lapDistPct >= 0
	)
}

/** True when the step wraps forward across the start/finish line. Null when it is not a crossing. */
function wrap(prev: number, pct: number): boolean | null {
	if (pct >= prev) {
		const forward = pct - prev
		if (forward === 0 || forward > MAX_STEP) {
			return null
		}
		return false
	}
	if (prev - pct < 0.5) {
		return null
	}
	const forward = pct + 1 - prev
	if (forward > MAX_STEP) {
		return null
	}
	return true
}

function boundariesCrossed(
	lines: readonly number[],
	prev: number,
	pct: number,
	wrapped: boolean,
): number[] {
	const before: number[] = []
	const after: number[] = []
	for (let index = 0; index < lines.length; index += 1) {
		const line = lines[index]
		if (line === undefined) {
			continue
		}
		if (!wrapped) {
			if (line > prev && line <= pct) {
				before.push(index)
			}
			continue
		}
		if (line > prev) {
			before.push(index)
		} else if (line <= pct) {
			after.push(index)
		}
	}
	return wrapped ? [...before, ...after] : before
}

function lapAfter(prevLap: number, currentLap: number): number {
	return currentLap > prevLap ? currentLap : prevLap + 1
}
