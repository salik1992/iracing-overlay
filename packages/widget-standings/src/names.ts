export function shortName(full: string): string {
	const words = full
		.trim()
		.split(/\s+/)
		.filter((word) => word.length > 0)
	const firstWord = words[0]
	if (!firstWord) {
		return ''
	}
	const first = firstWord[0] ?? ''
	const rest = words.slice(1)
	if (rest.length === 0) {
		return firstWord.slice(0, 3).toUpperCase()
	}
	if (rest.length <= 3) {
		const last = rest[rest.length - 1] ?? ''
		const stem =
			rest
				.slice(0, -1)
				.map((word) => word[0] ?? '')
				.join('') + last
		return `${first} ${stem.slice(0, 3)}`.toUpperCase()
	}
	const tri = rest
		.slice(-3)
		.map((word) => word[0] ?? '')
		.join('')
	return `${first} ${tri}`.toUpperCase()
}

export function splitShort(full: string): { initial: string; trigram: string } {
	const name = shortName(full)
	const space = name.indexOf(' ')
	if (space < 0) {
		return { initial: '', trigram: name }
	}
	return { initial: name.slice(0, space), trigram: name.slice(space + 1) }
}
