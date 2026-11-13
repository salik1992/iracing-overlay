export interface HeaderSession {
	type: string
	laps: string
	time: string
}

export interface HeaderWire {
	sessionState?: string
	sessionTimeRemainSec: number
	/** Lap of the standings row at overall position 1. -1 while the field is gridding. */
	leaderLap: number
	/** CarIdxLap of the player. Qualifying counts this. 0 when the player is absent. */
	playerLap: number
	/**
	 * Fastest posted lap in the field, in seconds.
	 * Null until someone sets one. Used when a session publishes both limits.
	 */
	bestLapSec: number | null
	/** AirTemp. Celsius. Null when the sim did not publish it. */
	airTempC: number | null
	/** Track surface temperature. Celsius. */
	trackTempC: number | null
	/** Wind speed. Meters per second. */
	windVelMps: number | null
	/** Wind direction. Radians. */
	windDirRad: number | null
	/** SessionFlags names for the two lamps beside the counter. */
	flags: string[]
}
