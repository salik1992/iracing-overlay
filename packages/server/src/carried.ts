import type { CarSample } from './tick.js'
import type { SessionResult, SessionSnapshot } from './types.js'

/** Telemetry still equal to the previous server. Those fields are not from this session. */
export interface CarriedCar {
	position: number
	classPosition: number
	lap: number
	bestLapSec: number
	lastLapSec: number
}

/**
 * A fastest time brought across from the previous server.
 * `opening` is that car's time in the first YAML of the new server.
 * Null means the new server did not list the car yet.
 */
export interface BlockedTime {
	time: number
	opening: number | null
}

export function carriedCar(car: CarSample): CarriedCar {
	return {
		position: car.position,
		classPosition: car.classPosition,
		lap: car.lap,
		bestLapSec: car.bestLapSec,
		lastLapSec: car.lastLapSec,
	}
}

/** Blank a place, lap, or lap time that is still the previous server's sample. */
export function discardCarried(car: CarSample, carried: CarriedCar | undefined): CarSample {
	if (!carried) {
		return car
	}
	const position = car.position === carried.position ? 0 : car.position
	const classPosition = car.classPosition === carried.classPosition ? 0 : car.classPosition
	const lap = car.lap === carried.lap ? 0 : car.lap
	const bestLapSec = car.bestLapSec === carried.bestLapSec ? -1 : car.bestLapSec
	const lastLapSec = car.lastLapSec === carried.lastLapSec ? -1 : car.lastLapSec
	if (
		position === car.position &&
		classPosition === car.classPosition &&
		lap === car.lap &&
		bestLapSec === car.bestLapSec &&
		lastLapSec === car.lastLapSec
	) {
		return car
	}
	return { ...car, position, classPosition, lap, bestLapSec, lastLapSec }
}

export function weekendChanged(previous: SessionSnapshot, next: SessionSnapshot): boolean {
	return (
		previous.weekend.sessionId !== next.weekend.sessionId ||
		previous.weekend.subSessionId !== next.weekend.subSessionId
	)
}

/** Times from the server we just left, matched against the new server's first result list. */
export function blockCarriedTimes(
	previous: readonly SessionResult[],
	opening: readonly SessionResult[],
): Map<number, BlockedTime> {
	const openingTime = new Map<number, number>()
	for (const result of opening) {
		if (result.fastestTimeSec > 0 && Number.isFinite(result.fastestTimeSec)) {
			openingTime.set(result.carIdx, result.fastestTimeSec)
		}
	}
	const blocked = new Map<number, BlockedTime>()
	for (const result of previous) {
		if (!(result.fastestTimeSec > 0) || !Number.isFinite(result.fastestTimeSec)) {
			continue
		}
		blocked.set(result.carIdx, {
			time: result.fastestTimeSec,
			opening: openingTime.get(result.carIdx) ?? null,
		})
	}
	return blocked
}

export function withoutCarriedTimes(
	results: readonly SessionResult[],
	blocked: ReadonlyMap<number, BlockedTime>,
): readonly SessionResult[] {
	if (blocked.size === 0) {
		return results
	}
	const kept: SessionResult[] = []
	let dropped = false
	for (const result of results) {
		const block = blocked.get(result.carIdx)
		const copied =
			block !== undefined &&
			result.fastestTimeSec === block.time &&
			block.opening !== null &&
			result.fastestTimeSec === block.opening
		if (copied) {
			dropped = true
			continue
		}
		kept.push(result)
	}
	return dropped ? kept : results
}

export interface AdoptedSession {
	session: SessionSnapshot
	blocked: Map<number, BlockedTime>
	/** SessionID or SubSessionID changed. Telemetry from the previous server is stale. */
	carry: boolean
}

/**
 * Keep the new server's snapshot, minus lap times copied from the server we left.
 * A time that was not in the new server's first result list is a lap set there.
 */
export function adoptSession(
	previous: SessionSnapshot | null,
	next: SessionSnapshot,
	blocked: Map<number, BlockedTime>,
): AdoptedSession {
	const carry = previous !== null && weekendChanged(previous, next)
	if (carry) {
		const nextBlocked = blockCarriedTimes(previous.session.results, next.session.results)
		return { session: dropCarriedResults(next, nextBlocked), blocked: nextBlocked, carry }
	}
	// Qualifying and the race on this server have their own result list.
	const sameRecord = previous !== null && previous.session.number === next.session.number
	const active = sameRecord ? blocked : new Map<number, BlockedTime>()
	return { session: dropCarriedResults(next, active), blocked: active, carry: false }
}

export function dropCarriedResults(
	session: SessionSnapshot,
	blocked: ReadonlyMap<number, BlockedTime>,
): SessionSnapshot {
	const results = withoutCarriedTimes(session.session.results, blocked)
	if (results === session.session.results) {
		return session
	}
	return { ...session, session: { ...session.session, results: [...results] } }
}

/** Practice and qualifying standings. True when the posted times or places differ. */
export function standingsChanged(previous: SessionSnapshot, next: SessionSnapshot): boolean {
	const left = previous.session.results
	const right = next.session.results
	if (left.length !== right.length) {
		return true
	}
	for (let index = 0; index < left.length; index += 1) {
		const a = left[index]
		const b = right[index]
		if (
			!a ||
			!b ||
			a.carIdx !== b.carIdx ||
			a.position !== b.position ||
			a.classPosition !== b.classPosition ||
			a.fastestTimeSec !== b.fastestTimeSec
		) {
			return true
		}
	}
	return false
}
