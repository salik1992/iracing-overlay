import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { theme } from '../src/theme/tokens.js'

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..')

test('tokens.css carries the same roles as tokens.ts', () => {
	const css = readFileSync(join(packageRoot, 'src/theme/tokens.css'), 'utf8')
	const declared = declarations(css)
	const expected = new Map<string, string>([
		['bg', theme.bg],
		['fg', theme.fg],
		['muted', theme.muted],
		['dim', theme.dim],
		['border', theme.border],
		['rule', theme.rule],
		['accent', theme.accent],
		['good', theme.good],
		['bad', theme.bad],
		['caution', theme.caution],
		['info', theme.info],
		['number', theme.number],
		['panel-alpha', String(theme.panelAlpha)],
		['panel', panelFill(theme.bg)],
		['idle-opacity', String(theme.idleOpacity)],
		['font-family', theme.fontFamily],
		['font-size', `${theme.fontSizePx}px`],
		['line-height', String(theme.lineHeight)],
		['font-weight', String(theme.fontWeight)],
		['font-weight-strong', String(theme.fontWeightStrong)],
	])
	assert.deepEqual(declared, expected)
})

test('base stylesheet uses the token file and the vendored font', () => {
	const css = readFileSync(join(packageRoot, 'src/theme/base.css'), 'utf8')
	assert.match(css, /@import\s+'\.\/tokens\.css'/)
	assert.match(css, /url\('\/fonts\/FiraCode-VF\.woff2'\)\s+format\('woff2'\)/)
	assert.match(css, /\.panel\.is-idle\s*\{[^}]*opacity:\s*var\(--idle-opacity\)/)
	const font = readFileSync(join(packageRoot, 'fonts/FiraCode-VF.woff2'))
	assert.equal(font.subarray(0, 4).toString('ascii'), 'wOF2')
	const license = readFileSync(join(packageRoot, 'fonts/OFL.txt'), 'utf8')
	assert.match(license, /SIL Open Font License/)
})

function declarations(css: string): Map<string, string> {
	const body = css.match(/:root\s*\{([^}]*)\}/)
	assert.ok(body?.[1], 'tokens.css needs a :root block')
	const declared = new Map<string, string>()
	for (const line of body[1].split(';')) {
		const match = line.match(/^\s*--([\w-]+)\s*:\s*(.+?)\s*$/)
		if (match?.[1] && match[2]) {
			declared.set(match[1], match[2])
		}
	}
	return declared
}

function panelFill(hex: string): string {
	const value = Number.parseInt(hex.slice(1), 16)
	const red = (value >> 16) & 0xff
	const green = (value >> 8) & 0xff
	const blue = value & 0xff
	return `rgb(${red} ${green} ${blue} / var(--panel-alpha))`
}
