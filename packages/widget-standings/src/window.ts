import { HEADING_ROWS, MAX_ROWS, OTHER_TOP, TOP_N } from './constants.js'

export type WindowItem = { kind: 'car'; position: number } | { kind: 'gap'; count: number }

/**
 * Top 5 of a class that does not contain the player.
 * Fewer than 5 shows the whole class. A one-car tail is that car, so 6 shows all 6.
 */
export function otherClassWindow(count: number): WindowItem[] {
	if (count <= OTHER_TOP + 1) {
		return cars(1, count)
	}
	return [...cars(1, OTHER_TOP), { kind: 'gap', count: count - OTHER_TOP }]
}

/**
 * Player's class, for one class or many.
 * The top 5 and the player take the first rows. Other classes do not reduce this window.
 * A multiclass column keeps one row for the class heading.
 * The spare rows split above and below the player. Above rounds up, below rounds down.
 * Rows that fall inside the top 5 or before P1 move below the player.
 * Rows that fall past the last car move above the player.
 * A one-car hole is drawn as that car.
 * The player is not reserved twice when that car is already inside the top 5.
 */
export function playerClassWindow(
	count: number,
	playerPos: number,
	classCount: number,
): WindowItem[] {
	if (count <= 0) {
		return []
	}
	const player = Math.min(count, Math.max(1, playerPos))
	const top = Math.min(TOP_N, count)
	const heading = classCount > 1 ? HEADING_ROWS : 0
	const separatePlayer = player > top ? 1 : 0
	const spare = Math.max(0, MAX_ROWS - heading - top - separatePlayer)
	let above = Math.ceil(spare / 2)
	let below = spare - above

	const aboveRoom = Math.max(0, player - top - 1)
	if (above > aboveRoom) {
		below += above - aboveRoom
		above = aboveRoom
	}
	const belowRoom = count - player
	if (below > belowRoom) {
		above += below - belowRoom
		below = belowRoom
	}
	if (above > aboveRoom) {
		above = aboveRoom
	}

	const shown = new Set<number>()
	for (let position = 1; position <= top; position += 1) {
		shown.add(position)
	}
	for (let position = player - above; position < player; position += 1) {
		if (position > top) {
			shown.add(position)
		}
	}
	shown.add(player)
	let next = player + 1
	let left = below
	while (next <= count && left > 0) {
		if (!shown.has(next)) {
			shown.add(next)
			left -= 1
		}
		next += 1
	}
	return withHoles(shown, count)
}

/** A hole of one car is drawn as that car. A larger hole is an omit line. */
function withHoles(shown: ReadonlySet<number>, count: number): WindowItem[] {
	const items: WindowItem[] = []
	let cursor = 1
	while (cursor <= count) {
		if (shown.has(cursor)) {
			items.push({ kind: 'car', position: cursor })
			cursor += 1
			continue
		}
		let end = cursor
		while (end <= count && !shown.has(end)) {
			end += 1
		}
		const hole = end - cursor
		if (hole === 1) {
			items.push({ kind: 'car', position: cursor })
		} else {
			items.push({ kind: 'gap', count: hole })
		}
		cursor = end
	}
	return items
}

function cars(from: number, to: number): WindowItem[] {
	const items: WindowItem[] = []
	for (let position = from; position <= to; position += 1) {
		items.push({ kind: 'car', position })
	}
	return items
}
