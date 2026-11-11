import type { SourceKind } from '../config.js'
import { FixtureSource } from './fixture-source.js'
import { IRacingSource } from './iracing-source.js'
import type { TelemetrySource } from './telemetry-source.js'

export function openSource(kind: SourceKind): TelemetrySource {
	if (kind === 'fixture') {
		return new FixtureSource()
	}
	return new IRacingSource()
}
