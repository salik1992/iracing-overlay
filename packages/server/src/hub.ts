import type { RawData, WebSocket } from 'ws'

import { buildGarage, buildHeader, buildStandings, buildTelemetry } from './frames.js'
import { LiveOrder } from './live-order.js'
import { PostedLaps, type PostedLap } from './posted-laps.js'
import { EMPTY_NOTE, RaceMemory, type RaceNote } from './race-memory.js'
import { SectorGaps, type CountedGap } from './sector-gaps.js'
import type { TelemetrySource } from './sources/telemetry-source.js'
import type { Tick } from './tick.js'
import type { ServerMessage, SessionSnapshot, SourceStatus, WidgetServe } from './types.js'

interface Client {
	socket: WebSocket
	widget: WidgetServe | null
}

export class Hub {
	private readonly clients = new Set<Client>()
	private status: SourceStatus = { phase: 'idle', simMode: null }
	private session: SessionSnapshot | null = null
	private sessionVersion = 0
	private tick: Tick | null = null
	private readonly race = new RaceMemory()
	private raceNote: RaceNote = EMPTY_NOTE
	private readonly live = new LiveOrder()
	private liveRanks: ReadonlyMap<number, number> | null = null
	private readonly posted = new PostedLaps()
	private postedLaps: ReadonlyMap<number, PostedLap> = new Map()
	private readonly sectors = new SectorGaps()
	private sectorGaps: ReadonlyMap<number, CountedGap> = new Map()
	private delivered = 0

	constructor(private readonly widgets: readonly WidgetServe[]) {}

	get clientCount(): number {
		return this.clients.size
	}

	get phase(): SourceStatus['phase'] {
		return this.status.phase
	}

	connect(socket: WebSocket): void {
		const client: Client = { socket, widget: null }
		this.clients.add(client)
		socket.on('message', (data) => {
			this.onMessage(client, data)
		})
		socket.on('close', () => {
			this.clients.delete(client)
		})
		socket.on('error', () => {
			this.clients.delete(client)
		})
	}

	closeClients(): void {
		for (const client of this.clients) {
			client.socket.close()
		}
		this.clients.clear()
	}

	publishStatus(status: SourceStatus): void {
		this.status = status
		const message: ServerMessage = {
			type: 'status',
			phase: status.phase,
			simMode: status.simMode,
		}
		for (const client of this.clients) {
			if (client.widget) {
				this.send(client.socket, message)
			}
		}
	}

	publishSession(session: SessionSnapshot, version: number): void {
		this.session = session
		this.sessionVersion = version
		const message: ServerMessage = { type: 'session', version, session }
		for (const client of this.clients) {
			if (client.widget?.session) {
				this.send(client.socket, message)
			}
		}
	}

	publishTick(tick: Tick): void {
		this.tick = tick
		this.raceNote = this.race.note(tick)
		this.liveRanks = this.live.note(tick, this.session)
		this.postedLaps = this.posted.note(tick)
		this.sectorGaps = this.sectors.note(tick, this.session, this.liveRanks)
		this.delivered += 1
		for (const client of this.clients) {
			const widget = client.widget
			if (!widget) {
				continue
			}
			const every = Math.max(1, Math.round(60 / widget.hz))
			if (this.delivered % every !== 0) {
				continue
			}
			const message = frameMessage(
				widget,
				tick,
				this.session,
				this.raceNote,
				this.liveRanks,
				this.postedLaps,
				this.sectorGaps,
			)
			if (message) {
				this.send(client.socket, message)
			}
		}
	}

	private onMessage(client: Client, data: RawData): void {
		if (client.widget) {
			return
		}
		const hello = parseHello(rawText(data))
		if (!hello) {
			this.reject(client, 'expected a hello message')
			return
		}
		const widget = this.widgets.find((item) => item.id === hello.widgetId)
		if (!widget) {
			this.reject(client, `unknown widget ${hello.widgetId}`)
			return
		}
		client.widget = widget
		this.send(client.socket, {
			type: 'status',
			phase: this.status.phase,
			simMode: this.status.simMode,
		})
		if (widget.session && this.session) {
			this.send(client.socket, {
				type: 'session',
				version: this.sessionVersion,
				session: this.session,
			})
		}
		if (this.tick) {
			const message = frameMessage(
				widget,
				this.tick,
				this.session,
				this.raceNote,
				this.liveRanks,
				this.postedLaps,
				this.sectorGaps,
			)
			if (message) {
				this.send(client.socket, message)
			}
		}
	}

	private reject(client: Client, message: string): void {
		this.send(client.socket, { type: 'error', message })
		client.socket.close(1008, message)
		this.clients.delete(client)
	}

	private send(socket: WebSocket, message: ServerMessage): void {
		if (socket.readyState !== socket.OPEN) {
			return
		}
		socket.send(JSON.stringify(message))
	}
}

export function attachSource(hub: Hub, source: TelemetrySource): void {
	source.onStatus((status) => {
		hub.publishStatus(status)
	})
	source.onSession((session, version) => {
		hub.publishSession(session, version)
	})
	source.onTick((tick) => {
		hub.publishTick(tick)
	})
}

function frameMessage(
	widget: WidgetServe,
	tick: Tick,
	session: SessionSnapshot | null,
	note: RaceNote,
	liveClassPosition: ReadonlyMap<number, number> | null,
	postedLaps: ReadonlyMap<number, PostedLap>,
	sectorGaps: ReadonlyMap<number, CountedGap>,
): ServerMessage | null {
	if (widget.id === 'telemetry') {
		return {
			type: 'telemetry',
			tick: tick.sessionTick,
			frame: buildTelemetry(tick, session, note, liveClassPosition, postedLaps, sectorGaps),
		}
	}
	if (widget.id === 'standings') {
		return {
			type: 'standings',
			tick: tick.sessionTick,
			frame: buildStandings(tick, session, note, liveClassPosition, postedLaps, sectorGaps),
		}
	}
	if (widget.id === 'header') {
		return {
			type: 'header',
			tick: tick.sessionTick,
			frame: buildHeader(tick, session, note, liveClassPosition, postedLaps, sectorGaps),
		}
	}
	if (widget.id === 'garage') {
		return { type: 'garage', tick: tick.sessionTick, frame: buildGarage(tick) }
	}
	return null
}

function parseHello(raw: string): { widgetId: string } | null {
	let value: unknown
	try {
		value = JSON.parse(raw)
	} catch {
		return null
	}
	if (typeof value !== 'object' || value === null) {
		return null
	}
	if (!('type' in value) || value.type !== 'hello') {
		return null
	}
	if (!('widgetId' in value) || typeof value.widgetId !== 'string' || value.widgetId === '') {
		return null
	}
	return { widgetId: value.widgetId }
}

function rawText(data: RawData): string {
	if (typeof data === 'string') {
		return data
	}
	if (Buffer.isBuffer(data)) {
		return data.toString('utf8')
	}
	if (Array.isArray(data)) {
		return Buffer.concat(data).toString('utf8')
	}
	return Buffer.from(data).toString('utf8')
}
