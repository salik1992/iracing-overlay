const RETRY_MIN_MS = 250
const RETRY_MAX_MS = 4000

/**
 * Open the overlay socket, say hello, and pass each text frame through `parse`.
 * A dropped socket waits 250 ms, then doubles that wait up to 4 s.
 */
export function connectWidget<T>(
	widgetId: string,
	parse: (text: string) => T | null,
	handle: (message: T) => void,
): void {
	let delay = RETRY_MIN_MS
	let active: WebSocket | null = null

	const open = (): void => {
		const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
		const socket = new WebSocket(`${protocol}//${location.host}/ws`)
		active = socket
		socket.addEventListener('open', () => {
			delay = RETRY_MIN_MS
			socket.send(JSON.stringify({ type: 'hello', widgetId }))
		})
		socket.addEventListener('message', (event) => {
			if (typeof event.data !== 'string') {
				return
			}
			const message = parse(event.data)
			if (message !== null) {
				handle(message)
			}
		})
		socket.addEventListener('close', () => {
			if (active !== socket) {
				return
			}
			window.setTimeout(open, delay)
			delay = Math.min(RETRY_MAX_MS, delay * 2)
		})
	}

	open()
}
