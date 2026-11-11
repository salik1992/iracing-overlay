/**
 * The SDK publishes a compound index and no name enum.
 * A session catalog wins. Without one, only the two-compound pair is assumed:
 * 0 is dry and 1 is wet.
 */
export function tireLetter(index: number, names: readonly string[]): string {
	if (!Number.isFinite(index) || index < 0) {
		return ''
	}
	const slot = Math.trunc(index)
	const named = names[slot]
	if (named && named.trim()) {
		return named.trim().charAt(0).toUpperCase()
	}
	if (slot === 0) {
		return 'D'
	}
	if (slot === 1) {
		return 'W'
	}
	return ''
}
