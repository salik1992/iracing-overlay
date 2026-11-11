import type { WidgetManifest } from '@salik1992/iracing-overlay-shared'

export const manifest = {
	id: 'standings',
	route: '/standings',
	hz: 10,
	session: true,
} as const satisfies WidgetManifest
