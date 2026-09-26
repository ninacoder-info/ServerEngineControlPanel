import { spawn } from 'node:child_process'
import { readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'

const root = process.cwd()
const target = process.argv[2] || 'panel'
const ignored = new Set(['node_modules', 'dist', '.git', '__pycache__', '.venv'])
const watchedRoots = ['install.sh', 'docker-compose.test.yml', 'docker/test-installer.Dockerfile', 'core', 'web']
let lastSignature = ''
let running = false
let rerun = false

async function files(path) {
  const absolute = join(root, path)
  try { const info = await stat(absolute); if (info.isFile()) return [`${path}:${info.mtimeMs}:${info.size}`] } catch { return [] }
  const entries = await readdir(absolute, { withFileTypes: true })
  const nested = await Promise.all(entries.filter(entry => !ignored.has(entry.name)).map(entry => files(join(path, entry.name))))
  return nested.flat()
}

async function signature() { return (await Promise.all(watchedRoots.map(files))).flat().sort().join('|') }
function runUpdate() {
  if (running) { rerun = true; return }
  running = true
  const command = target === 'dev' ? ['compose', '-f', 'docker-compose.dev.yml', 'up', '-d'] : ['compose', '-f', 'docker-compose.test.yml', 'up', '-d', '--force-recreate', 'panel-live']
  console.log(`[serverengine] change detected; running docker ${command.join(' ')}`)
  const child = spawn('docker', command, { cwd: root, stdio: 'inherit' })
  child.on('exit', () => { running = false; if (rerun) { rerun = false; runUpdate() } })
}

console.log(`[serverengine] watching ${target}; press Ctrl+C to stop`)
lastSignature = await signature()
setInterval(async () => { const current = await signature(); if (current !== lastSignature) { lastSignature = current; runUpdate() } }, 1000)
