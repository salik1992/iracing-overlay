const METERS_PER_MILE = 1609.344

const TRACK_LENGTH = /^\s*([0-9]*\.?[0-9]+)\s*(km|mi|m)\s*$/i

/** Parse WeekendInfo.TrackLength, for example "1.60 km" or "2.50 mi", into meters. */
export function parseTrackLengthMeters(raw: string): number | null {
	const match = TRACK_LENGTH.exec(raw)
	const valueText = match?.[1]
	const unit = match?.[2]?.toLowerCase()
	if (valueText === undefined || unit === undefined) {
		return null
	}
	const value = Number(valueText)
	if (!Number.isFinite(value)) {
		return null
	}
	if (unit === 'km') {
		return value * 1000
	}
	if (unit === 'mi') {
		return value * METERS_PER_MILE
	}
	return value
}
