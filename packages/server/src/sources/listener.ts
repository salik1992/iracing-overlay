export class ListenerList<T> {
	private readonly listeners = new Set<(value: T) => void>()

	add(listener: (value: T) => void): void {
		this.listeners.add(listener)
	}

	emit(value: T): void {
		for (const listener of this.listeners) {
			listener(value)
		}
	}
}
