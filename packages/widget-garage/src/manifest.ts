import type { WidgetManifest } from '@salik1992/iracing-overlay-shared'

export const manifest = {
	id: 'garage',
	route: '/garage',
	hz: 10,
	session: false,
} as const satisfies WidgetManifest
