import assert from 'node:assert/strict'
import { closeSync, openSync, readFileSync, readSync } from 'node:fs'
import { test } from 'node:test'

import { parseMessage } from '../src/parse.js'

test('the garage frame is a visible flag', () => {
	assert.deepEqual(
		parseMessage(JSON.stringify({ type: 'garage', tick: 4, frame: { visible: true } })),
		{ type: 'garage', visible: true },
	)
	assert.equal(
		parseMessage(JSON.stringify({ type: 'garage', tick: 4, frame: { visible: false } }))
			?.visible,
		false,
	)
	assert.equal(parseMessage(JSON.stringify({ type: 'garage', tick: 4, frame: {} })), null)
	assert.equal(parseMessage(JSON.stringify({ type: 'status', phase: 'idle' })), null)
})

test('the cover image is a png asset', () => {
	const file = openSync(new URL('../assets/cover.png', import.meta.url), 'r')
	try {
		const header = Buffer.alloc(8)
		assert.equal(readSync(file, header, 0, 8, 0), 8)
		assert.equal(header.toString('hex'), '89504e470d0a1a0a')
	} finally {
		closeSync(file)
	}
})

test('the cover stays fully opaque and fills the page', () => {
	const css = readFileSync(new URL('../style.css', import.meta.url), 'utf8')
	assert.match(css, /\.cover\.is-shown\s*\{[^}]*opacity:\s*1/)
	assert.match(css, /\.cover img\s*\{[^}]*object-fit:\s*cover/)
	assert.doesNotMatch(css, /idle-opacity/)
})
