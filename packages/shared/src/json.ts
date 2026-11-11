export type Phase = 'idle' | 'live' | 'replay'

export interface StatusMessage {
	type: 'status'
	phase: Phase
}

/** Parse a JSON object. Arrays, malformed text, and other values are dropped. */
export function parseRecord(text: string): Record<string, unknown> | null {
	let value: unknown
	try {
		value = JSON.parse(text)
	} catch {
		return null
	}
	return asRecord(value)
}

export function parseStatus(phase: unknown): StatusMessage | null {
	if (phase === 'idle' || phase === 'live' || phase === 'replay') {
		return { type: 'status', phase }
	}
	return null
}

export function asRecord(value: unknown): Record<string, unknown> | null {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		return null
	}
	return value as Record<string, unknown>
}

export function asText(value: unknown): string {
	return typeof value === 'string' ? value : ''
}

export function asFinite(value: unknown): number | null {
	return typeof value === 'number' && Number.isFinite(value) ? value : null
}

export function asFiniteOr(value: unknown, fallback: number): number {
	return asFinite(value) ?? fallback
}
