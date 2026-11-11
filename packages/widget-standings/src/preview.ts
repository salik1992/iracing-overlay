import { buildBoard, type Board } from './model.js'
import type { SessionFields, StandingWire } from './types.js'

const TEAMS = [
	'Cadillac Racing',
	'Porsche Penske Motorsport',
	'United Autosports',
	'Wayne Taylor Racing',
	'Action Express Racing',
	'JDC Miller Motorsports',
	'Proton Competition',
	'AF Corse',
]

interface Seed {
	number: string
	name: string
	stops: number
	tire: string
	gained: number
	interval: number | null
	lapsDown: number
	player: boolean
	pitLane: boolean
}

export function previewBoard(): Board {
	const cursor = { next: 1 }
	const rows = [
		...klass(cursor, 1, 'GTP', '#ff2d2d', [
			car('7', 'Nick Tandy', 2, 'S', 1, null, 0),
			car('31', 'Earl Bamber', 1, 'M', -1, 0.612, 0),
			car('01', 'Sebastien Bourdais', 2, 'H', 0, 1.44, 0),
			car('888', 'Filipe Albuquerque', 1, 'S', 3, 3.208, 0),
			car('10', 'Renger van der Zande', 2, 'I', -1, 8.114, 0),
			car('24', 'Tom Blomqvist', 1, 'W', 0, null, 1, false, true),
			car('59', 'Alex Lynn', 0, 'M', 2, null, 1),
			car('85', 'Richard Westbrook', 1, 'H', -1, null, 2),
			car('93', 'Sheldon van der Linde', 2, 'S', 1, null, 2),
		]),
		...klass(cursor, 2, 'LMP2', '#1c6bff', [
			car('22', 'Job van Uitert', 1, 'M', 2, null, 0),
			car('11', 'Nyck de Vries', 1, 'S', 0, 0.388, 0),
			car('43', 'Pete van der Kirk', 2, 'H', -1, 1.102, 0),
			car('8', 'Vit Salomon', 1, 'S', 4, 1.64, 0, true),
			car('52', 'Charles Leclerc', 0, 'I', 1, 2.915, 0),
			car('74', 'Oliver Jarvis', 1, 'W', -1, 6.33, 0),
			car('18', 'Ben Hanley', 2, 'M', 0, null, 1),
			car('47', 'Louis Deletraz', 1, 'H', 1, null, 1),
			car('65', 'Antonio Felix da Costa', 1, 'S', -1, null, 1),
			car('99', 'Ferdinand Habsburg', 0, 'M', 2, null, 2),
		]),
		...klass(cursor, 3, 'GTD', '#14c96a', [
			car('27', 'Ross Gunn', 1, 'S', 1, null, 0),
			car('32', 'Daniel Juncadella', 0, 'M', -1, 0.274, 0),
			car('70', 'Klaus Bachler', 1, 'H', 0, 1.055, 0),
			car('4', 'Alessandro Pier Guidi', 1, 'I', 2, 1.883, 0),
			car('63', 'Jules Gounon', 2, 'W', -1, 4.42, 0),
			car('14', 'Mikkel Pedersen', 1, 'D', 1, 9.006, 0),
		]),
	]
	const session: SessionFields = {
		type: 'Race',
		laps: '48',
		time: 'unlimited',
		teamRacing: false,
	}
	return buildBoard(session, { sessionTimeRemainSec: 0, rows })
}

function klass(
	cursor: { next: number },
	classId: number,
	className: string,
	classColor: string,
	seeds: Seed[],
): StandingWire[] {
	return seeds.map((entry, index) => {
		const classPosition = index + 1
		const position = cursor.next
		cursor.next += 1
		const start = classPosition + entry.gained
		return {
			carIdx: classId * 100 + index + 1,
			position,
			classPosition,
			classId,
			className,
			classColor,
			carNumber: entry.number,
			driverName: entry.name,
			lap: position === 1 ? 23 : 22,
			bestLapSec: 80 + index,
			teamName: TEAMS[Number(entry.number) % TEAMS.length] ?? '',
			tire: entry.tire,
			pitStops: entry.stops,
			startClassPosition: start > 0 ? start : 1,
			intervalSec: entry.interval,
			lapsDown: entry.lapsDown,
			onPitRoad: entry.pitLane,
			trackSurface: 3,
			isPlayer: entry.player,
		}
	})
}

function car(
	number: string,
	name: string,
	stops: number,
	tire: string,
	gained: number,
	interval: number | null,
	lapsDown: number,
	player = false,
	pitLane = false,
): Seed {
	return { number, name, stops, tire, gained, interval, lapsDown, player, pitLane }
}
