import assert from 'node:assert/strict'
import { mock, test } from 'node:test'

import { connectWidget } from '../src/connect.js'

class FakeSocket extends EventTarget {
	static sockets: FakeSocket[] = []
	readonly sent: string[] = []

	constructor(readonly url: string) {
		super()
		FakeSocket.sockets.push(this)
	}

	send(data: string): void {
		this.sent.push(data)
	}
}

test('the socket says hello, parses text frames, and reconnects', () => {
	FakeSocket.sockets = []
	Object.assign(globalThis, {
		location: { protocol: 'http:', host: '127.0.0.1:8080' },
		WebSocket: FakeSocket,
		window: globalThis,
	})
	mock.timers.enable({ apis: ['setTimeout'] })

	const seen: string[] = []
	connectWidget(
		'telemetry',
		(text) => (text === 'ok' ? text : null),
		(message) => {
			seen.push(message)
		},
	)

	const first = FakeSocket.sockets[0]
	assert.ok(first)
	assert.equal(first.url, 'ws://127.0.0.1:8080/ws')
	first.dispatchEvent(new Event('open'))
	assert.deepEqual(first.sent, [JSON.stringify({ type: 'hello', widgetId: 'telemetry' })])

	first.dispatchEvent(messageEvent('ok'))
	first.dispatchEvent(messageEvent('nope'))
	first.dispatchEvent(messageEvent(1))
	assert.deepEqual(seen, ['ok'])

	first.dispatchEvent(new Event('close'))
	assert.equal(FakeSocket.sockets.length, 1)
	mock.timers.tick(250)
	const second = FakeSocket.sockets[1]
	assert.ok(second)
	second.dispatchEvent(new Event('open'))

	first.dispatchEvent(new Event('close'))
	mock.timers.tick(4000)
	assert.equal(FakeSocket.sockets.length, 2)

	second.dispatchEvent(new Event('close'))
	mock.timers.tick(249)
	assert.equal(FakeSocket.sockets.length, 2)
	mock.timers.tick(1)
	assert.equal(FakeSocket.sockets.length, 3)

	mock.timers.reset()
})

function messageEvent(data: unknown): Event {
	const event = new Event('message')
	Object.defineProperty(event, 'data', { value: data })
	return event
}
