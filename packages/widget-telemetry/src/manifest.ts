import type { WidgetManifest } from '@salik1992/iracing-overlay-shared'

export const manifest = {
	id: 'telemetry',
	route: '/telemetry',
	hz: 60,
	session: true,
} as const satisfies WidgetManifest
