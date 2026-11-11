import { standingCars } from './frames.js'
import { beginSession, emptyStamp, type SessionStamp } from './session-stamp.js'
import type { CarSample, Tick } from './tick.js'
import type { SessionResult, SessionSnapshot } from './types.js'

const STATE_RACING = 4
const STATE_CHECKERED = 5
const IN_PIT_STALL = 1
const APPROACHING_PITS = 2

interface ResultIndex {
	classPosition: Map<number, number>
	lapsComplete: Map<number, number>
	p1CarIdx: number | null
}

/**
 * Class order for a race, from laps completed plus the lap fraction.
 * Parade laps, and any session that is not a race, leave this empty.
 * A tow straight into the pit stall keeps the last progress on track.
 * After the flag, once the results leader gains a lap, finished cars
 * lock to ResultsPositions. Those results are reread every tick.
 * irDashies copies them once, on the first racing tick.
 */
export class LiveOrder {
	private stamp: SessionStamp = emptyStamp()
	private surfaces = new Map<number, number>()
	private lastProgress = new Map<number, number>()
	private p1CarIdx: number | null = null
	private p1LapAtCheckered: number | null = null
	private snapshot = new Map<number, number>()
	private snapshotActive = false

	note(tick: Tick, session: SessionSnapshot | null): ReadonlyMap<number, number> | null {
		if (beginSession(this.stamp, tick)) {
			this.surfaces = new Map()
			this.lastProgress = new Map()
			this.clearCheckered()
		}
		if (tick.sessionState !== STATE_CHECKERED) {
			this.clearCheckered()
		}
		if (
			session === null ||
			!isRace(session.session.type) ||
			(tick.sessionState !== STATE_RACING && tick.sessionState !== STATE_CHECKERED)
		) {
			this.rememberSurfaces(tick)
			return null
		}
		if (tick.sessionState === STATE_CHECKERED) {
			this.noteCheckered(tick, session)
		}
		const ranks = this.rank(tick, session)
		this.rememberSurfaces(tick)
		return ranks
	}

	private noteCheckered(tick: Tick, session: SessionSnapshot): void {
		if (this.p1CarIdx === null) {
			this.p1CarIdx = indexResults(session.session.results).p1CarIdx
		}
		const p1 = this.p1CarIdx
		const p1Lap = p1 === null ? null : lapCompletedOf(tick, p1)
		if (this.p1LapAtCheckered === null) {
			if (p1Lap !== null) {
				this.p1LapAtCheckered = p1Lap
			}
			return
		}
		if (
			p1 === null ||
			this.snapshotActive ||
			p1Lap === null ||
			p1Lap <= this.p1LapAtCheckered
		) {
			return
		}
		this.snapshot = new Map()
		for (const car of tick.cars) {
			this.snapshot.set(car.carIdx, Number.isFinite(car.lapCompleted) ? car.lapCompleted : 0)
		}
		this.snapshot.set(p1, (this.snapshot.get(p1) ?? 0) - 1)
		this.snapshotActive = true
	}

	private rank(tick: Tick, session: SessionSnapshot): ReadonlyMap<number, number> | null {
		const results = indexResults(session.session.results)
		const groups = new Map<number, CarSample[]>()
		const progress = new Map<number, number>()
		for (const car of standingCars(tick, session)) {
			progress.set(car.carIdx, this.effectiveProgress(car))
			const classId = session.drivers[String(car.carIdx)]?.classId ?? 0
			const list = groups.get(classId) ?? []
			list.push(car)
			groups.set(classId, list)
		}
		// A field with no class id stays on the official order.
		if (groups.size === 1 && groups.has(-1)) {
			return null
		}
		const ranks = new Map<number, number>()
		for (const list of groups.values()) {
			list.sort((a, b) => this.compare(a, b, progress, results, tick.sessionState))
			list.forEach((car, index) => {
				ranks.set(car.carIdx, index + 1)
			})
		}
		return ranks
	}

	private effectiveProgress(car: CarSample): number {
		const raw = rawProgress(car)
		const previous = this.surfaces.get(car.carIdx)
		const towed =
			car.trackSurface === IN_PIT_STALL &&
			previous !== undefined &&
			previous !== APPROACHING_PITS
		if (towed) {
			return this.lastProgress.get(car.carIdx) ?? raw
		}
		this.lastProgress.set(car.carIdx, raw)
		return raw
	}

	private compare(
		a: CarSample,
		b: CarSample,
		progress: ReadonlyMap<number, number>,
		results: ResultIndex,
		sessionState: number,
	): number {
		const aCompleted = completedLaps(a, results.lapsComplete)
		const bCompleted = completedLaps(b, results.lapsComplete)
		if (aCompleted !== bCompleted) {
			return bCompleted - aCompleted
		}
		if (sessionState === STATE_CHECKERED && this.snapshotActive) {
			const aFinished = aCompleted > (this.snapshot.get(a.carIdx) ?? 0)
			const bFinished = bCompleted > (this.snapshot.get(b.carIdx) ?? 0)
			if (aFinished !== bFinished) {
				return aFinished ? 1 : -1
			}
			if (aFinished) {
				const delta =
					(results.classPosition.get(a.carIdx) ?? Number.MAX_SAFE_INTEGER) -
					(results.classPosition.get(b.carIdx) ?? Number.MAX_SAFE_INTEGER)
				return delta || a.carIdx - b.carIdx
			}
		}
		const delta = (progress.get(b.carIdx) ?? 0) - (progress.get(a.carIdx) ?? 0)
		return delta || a.carIdx - b.carIdx
	}

	private rememberSurfaces(tick: Tick): void {
		for (const car of tick.cars) {
			this.surfaces.set(car.carIdx, car.trackSurface)
		}
	}

	private clearCheckered(): void {
		this.p1CarIdx = null
		this.p1LapAtCheckered = null
		this.snapshot = new Map()
		this.snapshotActive = false
	}
}

/** Same rule as the standings widget: "Race" and "Heat Race" count, "Lone Qualify" does not. */
function isRace(type: string): boolean {
	const text = type.trim().toLowerCase()
	return text === 'race' || text.endsWith(' race')
}

function indexResults(results: readonly SessionResult[]): ResultIndex {
	const classPosition = new Map<number, number>()
	const lapsComplete = new Map<number, number>()
	let p1CarIdx: number | null = null
	for (const result of results) {
		classPosition.set(result.carIdx, result.classPosition)
		lapsComplete.set(result.carIdx, result.lapsComplete)
		if (p1CarIdx === null && result.position === 1) {
			p1CarIdx = result.carIdx
		}
	}
	return { classPosition, lapsComplete, p1CarIdx }
}

function lapCompletedOf(tick: Tick, carIdx: number): number | null {
	const car = tick.cars.find((item) => item.carIdx === carIdx)
	if (!car || !Number.isFinite(car.lapCompleted)) {
		return null
	}
	return car.lapCompleted
}

function completedLaps(car: CarSample, lapsComplete: ReadonlyMap<number, number>): number {
	if (car.lapCompleted === -1) {
		return lapsComplete.get(car.carIdx) ?? -1
	}
	return car.lapCompleted
}

function rawProgress(car: CarSample): number {
	const laps = Number.isFinite(car.lapCompleted) ? car.lapCompleted : 0
	const dist = Number.isFinite(car.lapDistPct) ? car.lapDistPct : 0
	return laps + dist
}
