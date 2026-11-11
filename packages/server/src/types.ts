/**
 * Wire types for the overlay protocol.
 * These move to @salik1992/iracing-overlay-shared when that package exists.
 */

export type SourcePhase = 'idle' | 'live' | 'replay'

export type DisplayUnits = 0 | 1

export interface SourceStatus {
	phase: SourcePhase
	simMode: string | null
}

export interface DriverSnapshot {
	carIdx: number
	name: string
	carNumber: string
	carPath: string
	classId: number
	className: string
	classColor: string
	iRating: number
	license: string
	teamName: string
	spectator: boolean
	paceCar: boolean
	ai: boolean
}

/**
 * One result entry from ResultsPositions or QualifyResultsInfo.
 * Class position is 0-based, as the sim publishes it. Position on
 * ResultsPositions is 1-based; on the qualifying grid it is 0-based.
 */
export interface SessionResult {
	carIdx: number
	position: number
	classPosition: number
	lapsComplete: number
	/** FastestTime in seconds from the YAML list this entry came from. -1 when absent. */
	fastestTimeSec: number
}

export interface SessionSnapshot {
	weekend: {
		trackDisplayName: string
		trackConfigName: string
		trackLengthMeters: number
		seriesId: number
		/** WeekendInfo.SessionID. 0 when the YAML does not publish one. */
		sessionId: number
		/** WeekendInfo.SubSessionID. A new launched server has a new one. 0 when absent. */
		subSessionId: number
		eventType: string
		simMode: string
		teamRacing: boolean
		official: boolean
	}
	player: {
		carIdx: number
		carNumber: string
		driverName: string
		shiftLight: {
			firstRpm: number
			shiftRpm: number
			lastRpm: number
			blinkRpm: number
		}
		redlineRpm: number
		idleRpm: number
		maxFuelLiters: number
		displayUnits: DisplayUnits
	}
	/** Keyed by car index. JSON object keys arrive as strings. */
	drivers: Record<string, DriverSnapshot>
	/** Compound names indexed by CarIdxTireCompound, when the session publishes them. */
	tires: string[]
	/**
	 * SplitTimeInfo sector start positions, as a fraction of the lap.
	 * Always contains 0, the start/finish line. Sorted ascending.
	 */
	sectorStartPct: number[]
	/**
	 * QualifyResultsInfo.Results. Position and ClassPosition are 0-based.
	 * Empty when the weekend has no qualifying classification.
	 */
	grid: SessionResult[]
	session: {
		number: number
		name: string
		type: string
		laps: string
		time: string
		/** Official classification. Empty until the sim publishes ResultsPositions. */
		results: SessionResult[]
	}
}

/** Same-class car next to the player on the standings tower. */
export interface TelemetryNeighbor {
	/** Class position. Overall position when the class place is unset. */
	position: number
	carNumber: string
	driverName: string
	/** Class color when more than one class is on the tower. Null for a single class. */
	classColor: string | null
	/**
	 * Gap text from the standings column.
	 * In a race this is the interval between this car and the player.
	 * Otherwise it is this car's own best-lap gap.
	 */
	gap: string
}

export interface TelemetryFrame {
	speedMps: number
	rpm: number
	gear: number
	throttle: number
	brake: number
	clutch: number
	steeringWheelAngleRad: number
	steeringWheelAngleMaxRad: number
	lap: number
	lapCurrentSec: number
	lapLastSec: number | null
	lapBestSec: number | null
	onTrack: boolean
	/** Same-class car immediately ahead. Null when the player leads the class. */
	ahead: TelemetryNeighbor | null
	/** Same-class car immediately behind. Null when the player is last in class. */
	behind: TelemetryNeighbor | null
}

export type SessionStateName =
	'invalid' | 'getInCar' | 'warmup' | 'paradeLaps' | 'racing' | 'checkered' | 'coolDown'

export interface StandingRow {
	carIdx: number
	position: number
	/**
	 * Class place on the row. Live rank while racing or checkered.
	 * Qualifying place, starting at 1, before the green. Official class position otherwise.
	 */
	classPosition: number
	classId: number
	className: string
	classColor: string
	carNumber: string
	driverName: string
	teamName: string
	/** One letter, or empty when the compound is unknown. */
	tire: string
	/** Stall entries observed since the server attached to this session. */
	pitStops: number
	/**
	 * iRacing's class position on the first racing tick.
	 * The arrow compares the row's class position with this.
	 */
	startClassPosition: number
	/** Gap to the class car ahead. Null for the class leader. */
	intervalSec: number | null
	/** Whole laps behind the class car ahead, after the lap-distance correction. */
	lapsDown: number
	lap: number
	lastLapSec: number | null
	bestLapSec: number | null
	/** Positive means the car is behind the player. Negative means ahead. */
	gapToPlayerSec: number | null
	onPitRoad: boolean
	trackSurface: number
	isPlayer: boolean
}

export interface StandingsFrame {
	sessionState: SessionStateName
	sessionTimeRemainSec: number
	sessionLapsRemain: number
	flags: string[]
	rows: StandingRow[]
}

export interface HeaderFrame {
	sessionState: SessionStateName
	sessionTimeRemainSec: number
	/** Lap of the standings row at overall position 1. 0 when that row is absent. */
	leaderLap: number
	/** Fastest posted lap in the standings, in seconds. Null when nobody has one. */
	bestLapSec: number | null
	/** AirTemp. Celsius. Null when the sim did not publish it. */
	airTempC: number | null
	/** TrackTempCrew, the live track-surface temperature. Celsius. */
	trackTempC: number | null
	/** WindVel. Meters per second. */
	windVelMps: number | null
	/** WindDir. Radians. */
	windDirRad: number | null
	/** Lamp names. Pace-lap green stays off until start go. */
	flags: string[]
}

export interface FlagsFrame {
	flags: string[]
}

export interface GarageFrame {
	visible: boolean
}

export type ServerMessage =
	| { type: 'status'; phase: SourcePhase; simMode: string | null }
	| { type: 'session'; version: number; session: SessionSnapshot }
	| { type: 'telemetry'; tick: number; frame: TelemetryFrame }
	| { type: 'standings'; tick: number; frame: StandingsFrame }
	| { type: 'header'; tick: number; frame: HeaderFrame }
	| { type: 'garage'; tick: number; frame: GarageFrame }
	| { type: 'error'; message: string }

export interface ClientHello {
	type: 'hello'
	widgetId: string
}

export interface WidgetServe {
	id: 'telemetry' | 'standings' | 'garage' | 'header'
	route: string
	hz: number
	session: boolean
	staticDir: string
}
