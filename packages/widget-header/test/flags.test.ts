import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

import {
	BLINK_HALF_MS,
	CELL_PX,
	FADE_MS,
	FLAG_GAP,
	FLAG_H,
	FLAG_NAMES,
	FLAG_W,
	flagPaint,
	MEATBALL_PX,
	motionOf,
	shownFlag,
	SWAP_HOLD_MS,
	SWAP_TRANSITION_MS,
} from '../src/flags.js'
import { LED } from '../src/leds.js'

test('flag names match the server decoder', () => {
	const source = readFileSync(new URL('../../server/src/flags.ts', import.meta.url), 'utf8')
	const declared = [...source.matchAll(/0x[0-9a-fA-F]+, '([A-Za-z]+)'/g)].map((match) => match[1])
	assert.deepEqual(declared, [...FLAG_NAMES])
})

test('one lamp wins, and non-flag bits stay dark', () => {
	assert.equal(shownFlag(['green', 'serviceable', 'startHidden']), 'green')
	assert.equal(shownFlag(['green', 'blue']), 'blue')
	assert.equal(shownFlag(['yellow', 'yellowWaving']), 'yellowWaving')
	assert.equal(shownFlag(['green', 'checkered']), 'checkered')
	assert.equal(shownFlag(['debris', 'caution']), 'caution')
	assert.equal(shownFlag(['serviceable']), null)
	assert.equal(shownFlag(['dqScoringInvalid', 'startHidden']), null)
	assert.equal(
		shownFlag(['green', 'startReady', 'startSet', 'fiveToGo', 'tenToGo', 'oneLapToGreen']),
		null,
	)
	assert.equal(shownFlag(['green', 'greenHeld', 'startReady']), null)
	assert.equal(shownFlag(['green', 'startSet']), null)
	assert.equal(shownFlag(['greenHeld']), null)
	assert.equal(shownFlag(['green', 'greenHeld']), 'greenHeld')
	assert.equal(shownFlag(['startGo', 'green', 'oneLapToGreen']), 'startGo')
	assert.equal(shownFlag(['startGo', 'greenHeld', 'green']), 'greenHeld')
	assert.equal(
		shownFlag(['startReady', 'startSet', 'fiveToGo', 'tenToGo', 'oneLapToGreen']),
		null,
	)
	assert.equal(shownFlag([]), null)
})

test('waving and warning lamps blink, debris and checkered swap', () => {
	for (const name of [
		'blue',
		'yellowWaving',
		'cautionWaving',
		'randomWaving',
		'furled',
		'disqualify',
	] as const) {
		assert.equal(motionOf(name), 'blink')
	}
	assert.equal(motionOf('checkered'), 'swap')
	assert.equal(motionOf('debris'), 'swap')
	assert.equal(motionOf('green'), 'static')
	assert.equal(motionOf('yellow'), 'static')
	assert.equal(motionOf('repair'), 'static')
	assert.equal(motionOf('white'), 'static')
})

test('checkers and stripes are 4px, and the lamps flank the counter', () => {
	assert.equal(CELL_PX, 4)
	assert.equal(FLAG_W, 48)
	assert.equal(FLAG_H, 16)
	assert.equal(FLAG_GAP, 32)
	const checkered = flagPaint('checkered')
	assert.equal(
		checkered.image,
		`repeating-conic-gradient(${LED.black} 0% 25%, ${LED.white} 0% 50%)`,
	)
	assert.equal(checkered.size, `${CELL_PX * 2}px ${CELL_PX * 2}px`)
	assert.equal(
		checkered.swapImage,
		`repeating-conic-gradient(${LED.white} 0% 25%, ${LED.black} 0% 50%)`,
	)
	assert.equal(checkered.dark, false)
	const debris = flagPaint('debris')
	assert.equal(
		debris.image,
		`repeating-linear-gradient(90deg, ${LED.yellow} 0 ${CELL_PX}px, ${LED.red} 0 ${CELL_PX * 2}px)`,
	)
	assert.equal(
		debris.swapImage,
		`repeating-linear-gradient(90deg, ${LED.red} 0 ${CELL_PX}px, ${LED.yellow} 0 ${CELL_PX * 2}px)`,
	)
	const repair = flagPaint('repair')
	assert.equal(repair.color, LED.black)
	assert.equal(repair.dark, true)
	assert.match(repair.image, new RegExp(`circle ${MEATBALL_PX / 2}px at center, ${LED.orange}`))
	const crossed = flagPaint('crossed')
	assert.equal(crossed.color, LED.white)
	assert.equal(crossed.slash, true)
	assert.equal(crossed.slashColor, LED.black)
	assert.equal(flagPaint('green').color, LED.green)
	assert.equal(flagPaint('black').dark, true)
	assert.equal(flagPaint('furled').dark, true)
})

test('fade, hold, and blink timings are the ones on the stylesheet', () => {
	const css = readFileSync(new URL('../style.css', import.meta.url), 'utf8')
	const period = (SWAP_HOLD_MS + SWAP_TRANSITION_MS) * 2
	assert.equal(FADE_MS, 200)
	assert.equal(SWAP_HOLD_MS, 800)
	assert.equal(SWAP_TRANSITION_MS, 200)
	assert.equal(BLINK_HALF_MS, 500)
	assert.match(css, new RegExp(`transition: opacity ${FADE_MS}ms linear`))
	assert.match(css, new RegExp(`flag-swap ${period}ms linear infinite`))
	assert.match(css, new RegExp(`flag-blink ${BLINK_HALF_MS * 2}ms linear infinite`))
	assert.match(css, /0%,\s*40%/)
	assert.match(css, /50%,\s*90%/)
	assert.match(
		css,
		new RegExp(`\\.mid\\s*\\{[^}]*grid-template-columns:\\s*${FLAG_W}px auto ${FLAG_W}px`),
	)
	assert.match(css, new RegExp(`\\.mid\\s*\\{[^}]*column-gap:\\s*${FLAG_GAP}px`))
	assert.match(css, new RegExp(`\\.flag\\s*\\{[^}]*width:\\s*${FLAG_W}px`))
	assert.match(css, new RegExp(`\\.flag\\s*\\{[^}]*height:\\s*${FLAG_H}px`))
})
