import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

import { formatRemain, formatWeather, sessionCounter } from '../src/format.js'
import { parseMessage } from '../src/parse.js'
import type { HeaderSession, HeaderWire } from '../src/types.js'

test('remain clocks drop a negative reading', () => {
	assert.equal(formatRemain(47 * 60 + 12), '47:12')
	assert.equal(formatRemain(3661), '1:01:01')
	assert.equal(formatRemain(1800), '30:00')
	assert.equal(formatRemain(-1), '')
})

test('the counter follows the session limit', () => {
	assert.equal(
		sessionCounter(
			session({ laps: '48', time: 'unlimited' }),
			frame({ leaderLap: 23, remain: 10 }),
		),
		'23/48',
	)
	assert.equal(
		sessionCounter(session({ laps: '48', time: 'unlimited' }), frame({ leaderLap: -1 })),
		'0/48',
	)
	assert.equal(
		sessionCounter(session({ laps: '48', time: 'unlimited' }), frame({ leaderLap: 0 })),
		'0/48',
	)
	assert.equal(
		sessionCounter(
			session({ laps: '25', time: 'unlimited' }),
			frame({ leaderLap: 26, state: 'racing' }),
		),
		'25/25',
	)
	assert.equal(
		sessionCounter(
			session({ laps: '25', time: 'unlimited' }),
			frame({ leaderLap: -1, state: 'checkered' }),
		),
		'25/25',
	)
	assert.equal(
		sessionCounter(
			session({ laps: '25', time: 'unlimited' }),
			frame({ leaderLap: 0, state: 'coolDown' }),
		),
		'25/25',
	)
	assert.equal(
		sessionCounter(
			session({ laps: 'unlimited', time: '1800.000 sec' }),
			frame({ leaderLap: 23, remain: 2832 }),
		),
		'47:12',
	)
	assert.equal(
		sessionCounter(
			session({ laps: 'unlimited', time: 'unlimited' }),
			frame({ leaderLap: 23, remain: 99999 }),
		),
		'',
	)
	assert.equal(
		sessionCounter(
			session({ laps: '32767', time: '1200.000 sec' }),
			frame({ leaderLap: 3, remain: 600 }),
		),
		'10:00',
	)
})

test('both limits follow the one the best lap says arrives first', () => {
	const dual = session({ laps: '20', time: '1200.000 sec' })
	assert.equal(sessionCounter(dual, frame({ leaderLap: 14, remain: 754 })), '14/20 (12:34)')
	assert.equal(
		sessionCounter(dual, frame({ leaderLap: 14, remain: 650, bestLapSec: 100 })),
		'14/20 (10:50)',
	)
	assert.equal(
		sessionCounter(dual, frame({ leaderLap: 14, remain: 501, bestLapSec: 100 })),
		'14/20 (8:21)',
	)
	assert.equal(
		sessionCounter(dual, frame({ leaderLap: 14, remain: 500, bestLapSec: 100 })),
		'8:20',
	)
	assert.equal(
		sessionCounter(dual, frame({ leaderLap: 14, remain: 699, bestLapSec: 100 })),
		'14/20 (11:39)',
	)
	assert.equal(
		sessionCounter(dual, frame({ leaderLap: 14, remain: 700, bestLapSec: 100 })),
		'14/20',
	)
	assert.equal(
		sessionCounter(
			session({ laps: '99', time: '1200.000 sec' }),
			frame({ leaderLap: 5, remain: 900, bestLapSec: 90 }),
		),
		'15:00',
	)
	assert.equal(
		sessionCounter(
			session({ laps: '20', time: '3600.000 sec' }),
			frame({ leaderLap: 14, remain: 3600, bestLapSec: 80 }),
		),
		'14/20',
	)
	assert.equal(
		sessionCounter(
			session({ laps: '99', time: '1200.000 sec' }),
			frame({ leaderLap: 12, remain: 30, bestLapSec: 90, state: 'checkered' }),
		),
		'0:30',
	)
	assert.equal(
		sessionCounter(
			session({ laps: '99', time: '1200.000 sec' }),
			frame({ leaderLap: 12, remain: 400, bestLapSec: 90, state: 'checkered' }),
		),
		'12/99 (6:40)',
	)
	assert.equal(
		sessionCounter(
			session({ laps: '20', time: '3600.000 sec' }),
			frame({ leaderLap: -1, remain: 480, bestLapSec: 80, state: 'checkered' }),
		),
		'20/20',
	)
	assert.equal(
		sessionCounter(
			dual,
			frame({ leaderLap: -1, remain: 40, bestLapSec: 80, state: 'coolDown' }),
		),
		'20/20 (0:40)',
	)
})

test('qualifying shows both limits and counts the player lap', () => {
	const both = { laps: '2', time: '480.000 sec' }
	assert.equal(
		sessionCounter(
			session({ type: 'Lone Qualify', ...both }),
			frame({ leaderLap: 2, playerLap: 1, remain: 300, bestLapSec: 90 }),
		),
		'1/2 (5:00)',
	)
	assert.equal(
		sessionCounter(
			session({ type: 'Open Qualify', laps: '99', time: '1200.000 sec' }),
			frame({ leaderLap: 8, playerLap: 1, remain: 900, bestLapSec: 90 }),
		),
		'1/99 (15:00)',
	)
	assert.equal(
		sessionCounter(
			session({ type: 'open qualify', laps: '20', time: '3600.000 sec' }),
			frame({ leaderLap: 14, playerLap: 3, remain: 3600, bestLapSec: 80 }),
		),
		'3/20 (1:00:00)',
	)
	assert.equal(
		sessionCounter(
			session({ type: 'Lone Qualify', ...both }),
			frame({ leaderLap: 2, playerLap: 5, remain: 12 }),
		),
		'2/2 (0:12)',
	)
	assert.equal(
		sessionCounter(
			session({ type: 'Lone Qualify', ...both }),
			frame({ leaderLap: 2, playerLap: -1, remain: -1, state: 'checkered' }),
		),
		'0/2 (0:00)',
	)
	assert.equal(
		sessionCounter(
			session({ type: 'Qualify', laps: '2', time: 'unlimited' }),
			frame({ leaderLap: 2, playerLap: 1 }),
		),
		'1/2',
	)
	assert.equal(
		sessionCounter(
			session({ type: 'Qualify', laps: '2', time: 'unlimited' }),
			frame({ leaderLap: 1, playerLap: 1, state: 'checkered' }),
		),
		'2/2',
	)
	assert.equal(
		sessionCounter(
			session({ type: 'Lone Qualify', laps: 'unlimited', time: '480.000 sec' }),
			frame({ leaderLap: 4, playerLap: 1, remain: 120 }),
		),
		'2:00',
	)
})

test('weather prints air, track, and wind', () => {
	const direction = (241 * Math.PI) / 180
	assert.equal(
		formatWeather(
			frame({
				leaderLap: 1,
				airTempC: 27,
				trackTempC: 41,
				windVelMps: 4,
				windDirRad: direction,
			}),
		),
		'AT: 27°C, TT: 41°C, WIND: 4m/s @ 241°',
	)
	assert.equal(
		formatWeather(
			frame({
				leaderLap: 1,
				airTempC: 26.6,
				trackTempC: 41.4,
				windVelMps: 3.5,
				windDirRad: direction,
			}),
		),
		'AT: 27°C, TT: 41°C, WIND: 4m/s @ 241°',
	)
	assert.equal(
		formatWeather(frame({ leaderLap: 1, windDirRad: -0.1 })),
		'AT: —°C, TT: —°C, WIND: —m/s @ 354°',
	)
	assert.equal(formatWeather(frame({ leaderLap: 1 })), 'AT: —°C, TT: —°C, WIND: —m/s @ —°')
})

test('the bar is 1280 by 28 and centers the counter', () => {
	const css = readFileSync(new URL('../style.css', import.meta.url), 'utf8')
	assert.match(css, /\.panel\s*\{[^}]*box-sizing:\s*border-box/)
	assert.match(css, /\.panel\s*\{[^}]*width:\s*1280px/)
	assert.match(css, /\.panel\s*\{[^}]*height:\s*28px/)
	assert.match(
		css,
		/\.panel\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s*auto\s*minmax\(0,\s*1fr\)/,
	)
	assert.match(css, /\.type\s*\{[^}]*text-align:\s*start/)
	assert.match(css, /\.type\s*\{[^}]*text-transform:\s*uppercase/)
	assert.match(css, /\.type\s*\{[^}]*color:\s*var\(--fg\)/)
	assert.match(css, /\.counter\s*\{[^}]*text-align:\s*center/)
	assert.match(css, /\.counter\s*\{[^}]*color:\s*var\(--number\)/)
	assert.match(css, /\.weather\s*\{[^}]*text-align:\s*end/)
	assert.match(css, /\.weather\s*\{[^}]*color:\s*var\(--fg\)/)
	assert.match(css, /\.panel\s*\{[^}]*border:\s*none/)
	assert.match(css, /\.panel\s*\{[^}]*border-bottom:\s*1px solid var\(--border\)/)
	assert.doesNotMatch(css, /--panel-alpha/)
})

test('the page reads the session and the weather', () => {
	assert.equal(parseMessage('{'), null)
	assert.equal(parseMessage(JSON.stringify({ type: 'standings', frame: { rows: [] } })), null)
	const sessionMessage = parseMessage(
		JSON.stringify({
			type: 'session',
			session: {
				weekend: { teamRacing: false },
				session: {
					type: 'Practice',
					name: 'PRACTICE',
					laps: 'unlimited',
					time: '1800.000 sec',
				},
			},
		}),
	)
	assert.deepEqual(sessionMessage, {
		type: 'session',
		session: { type: 'Practice', laps: 'unlimited', time: '1800.000 sec' },
	})
	const direction = (241 * Math.PI) / 180
	const header = parseMessage(
		JSON.stringify({
			type: 'header',
			frame: {
				sessionState: 'racing',
				sessionTimeRemainSec: 12,
				leaderLap: 23,
				playerLap: 7,
				airTempC: 27,
				trackTempC: 41,
				windVelMps: 4,
				windDirRad: direction,
				bestLapSec: 80.5,
				flags: ['green', 'blue'],
			},
		}),
	)
	assert.deepEqual(header, {
		type: 'header',
		frame: {
			sessionState: 'racing',
			sessionTimeRemainSec: 12,
			leaderLap: 23,
			playerLap: 7,
			bestLapSec: 80.5,
			airTempC: 27,
			trackTempC: 41,
			windVelMps: 4,
			windDirRad: direction,
			flags: ['green', 'blue'],
		},
	})
	const missing = parseMessage(JSON.stringify({ type: 'header', frame: {} }))
	assert.equal(missing?.type, 'header')
	if (missing?.type === 'header') {
		assert.equal(missing.frame.leaderLap, 0)
		assert.equal(missing.frame.playerLap, 0)
		assert.equal(missing.frame.bestLapSec, null)
		assert.equal(missing.frame.sessionState, '')
		assert.equal(missing.frame.airTempC, null)
		assert.equal(missing.frame.windDirRad, null)
		assert.deepEqual(missing.frame.flags, [])
	}
	assert.equal(parseMessage(JSON.stringify({ type: 'header', frame: { flags: [1] } })), null)
})

function session(patch: Partial<HeaderSession>): HeaderSession {
	return {
		type: patch.type ?? 'Practice',
		laps: patch.laps ?? 'unlimited',
		time: patch.time ?? 'unlimited',
	}
}

function frame(patch: {
	leaderLap: number
	playerLap?: number
	remain?: number
	state?: string
	bestLapSec?: number | null
	airTempC?: number | null
	trackTempC?: number | null
	windVelMps?: number | null
	windDirRad?: number | null
}): HeaderWire {
	return {
		...(patch.state === undefined ? {} : { sessionState: patch.state }),
		sessionTimeRemainSec: patch.remain ?? 0,
		leaderLap: patch.leaderLap,
		playerLap: patch.playerLap ?? 0,
		bestLapSec: patch.bestLapSec === undefined ? null : patch.bestLapSec,
		airTempC: patch.airTempC ?? null,
		trackTempC: patch.trackTempC ?? null,
		windVelMps: patch.windVelMps ?? null,
		windDirRad: patch.windDirRad ?? null,
		flags: [],
	}
}
