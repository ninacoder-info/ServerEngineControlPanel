import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { join, normalize, extname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(fileURLToPath(new URL('.', import.meta.url)), 'dist')
const port = Number(process.env.PORT || 8080)
const apiUrl = process.env.API_URL || 'http://127.0.0.1:8000'
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json; charset=utf-8', '.ico': 'image/x-icon' }

async function fileFor(pathname) {
  const requested = pathname === '/' ? '/index.html' : decodeURIComponent(pathname)
  const candidate = normalize(join(root, requested))
  if (candidate !== root && !candidate.startsWith(`${root}/`)) return null
  try { const info = await stat(candidate); return info.isFile() ? candidate : null } catch { return null }
}

async function readBody(request) {
  const chunks = []
  for await (const chunk of request) chunks.push(chunk)
  return Buffer.concat(chunks)
}

createServer(async (request, response) => {
  try {
    const incoming = new URL(request.url, 'http://localhost')
    if (incoming.pathname.startsWith('/api/')) {
      const upstream = await fetch(`${apiUrl}${incoming.pathname}${incoming.search}`, { method: request.method, headers: { 'content-type': request.headers['content-type'] || '', cookie: request.headers.cookie || '' }, body: ['GET', 'HEAD'].includes(request.method) ? undefined : await readBody(request) });
      const headers = { 'content-type': upstream.headers.get('content-type') || 'application/json' }
      const setCookie = upstream.headers.get('set-cookie'); if (setCookie) headers['set-cookie'] = setCookie
      response.writeHead(upstream.status, headers); response.end(Buffer.from(await upstream.arrayBuffer())); return
    }
    let file = await fileFor(incoming.pathname)
    if (!file && request.method === 'GET') file = join(root, 'index.html')
    if (!file) { response.writeHead(404); response.end('Not found'); return }
    const body = await readFile(file)
    response.writeHead(200, { 'content-type': types[extname(file)] || 'application/octet-stream', 'cache-control': file.endsWith('index.html') ? 'no-cache' : 'public, max-age=31536000, immutable' })
    response.end(body)
  } catch { response.writeHead(500); response.end('Internal server error') }
}).listen(port, '0.0.0.0', () => console.log(`Server Engine web runtime listening on ${port}`))
