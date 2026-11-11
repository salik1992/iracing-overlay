import type { Tick } from './tick.js'

/** The ids that mean "this is a different session" for latched standings. */
export interface SessionStamp {
	sessionNum: number
	uniqueId: number
	sessionId: number
	subSessionId: number
}

export function emptyStamp(): SessionStamp {
	return { sessionNum: -1, uniqueId: -1, sessionId: -1, subSessionId: -1 }
}

/** True when the tick belongs to a session this stamp has not seen. Updates the stamp. */
export function beginSession(stamp: SessionStamp, tick: Tick): boolean {
	if (
		stamp.sessionNum === tick.sessionNum &&
		stamp.uniqueId === tick.uniqueId &&
		stamp.sessionId === tick.sessionId &&
		stamp.subSessionId === tick.subSessionId
	) {
		return false
	}
	stamp.sessionNum = tick.sessionNum
	stamp.uniqueId = tick.uniqueId
	stamp.sessionId = tick.sessionId
	stamp.subSessionId = tick.subSessionId
	return true
}
