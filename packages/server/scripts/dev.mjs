import { spawn } from 'node:child_process'

const child = spawn(process.execPath, ['--import', 'tsx', 'src/index.ts'], {
	stdio: 'inherit',
	env: { ...process.env, IRACING_SOURCE: 'fixture' },
})

for (const signal of ['SIGINT', 'SIGTERM']) {
	process.on(signal, () => {
		child.kill(signal)
	})
}

child.on('error', (error) => {
	console.error(error)
	process.exit(1)
})

child.on('exit', (code) => {
	process.exit(code ?? 1)
})
