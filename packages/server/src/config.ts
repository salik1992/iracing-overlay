export type SourceKind = 'iracing' | 'fixture'

export interface ServerConfig {
	host: '127.0.0.1'
	port: number
	source: SourceKind
}

export function resolveSourceKind(
	envValue: string | undefined,
	platform: NodeJS.Platform,
): SourceKind {
	if (envValue === undefined || envValue === '') {
		return platform === 'win32' ? 'iracing' : 'fixture'
	}
	if (envValue === 'iracing' || envValue === 'fixture') {
		return envValue
	}
	throw new Error(
		`IRACING_SOURCE must be "iracing" or "fixture", got ${JSON.stringify(envValue)}`,
	)
}

export function resolvePort(value: string | undefined): number {
	if (value === undefined || value === '') {
		return 8080
	}
	if (!/^\d+$/.test(value)) {
		throw new Error(`PORT must be an integer from 0 to 65535, got ${JSON.stringify(value)}`)
	}
	const port = Number(value)
	if (port > 65535) {
		throw new Error(`PORT must be an integer from 0 to 65535, got ${JSON.stringify(value)}`)
	}
	return port
}

export function loadConfig(env: NodeJS.ProcessEnv, platform: NodeJS.Platform): ServerConfig {
	return {
		host: '127.0.0.1',
		port: resolvePort(env['PORT']),
		source: resolveSourceKind(env['IRACING_SOURCE'], platform),
	}
}
