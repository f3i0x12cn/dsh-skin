/**
 * Host half of the photo-background skin.
 *
 * The browser sees one route for the built-in art and a small config API;
 * everything durable lives beside the profile, because the desktop app binds a
 * new port on every launch and localStorage/IndexedDB are origin-scoped.
 *
 * Routes, all under {@link PREFIX}:
 *   GET    /assets/<file>   built-in art shipped in `assets/` (immutable)
 *   GET    /config          current tuning + the custom image revision
 *   PUT    /config          merge validated tuning fields
 *   GET    /image           the custom image, 404 when none is set
 *   POST   /image           replace the custom image (raw WebP body)
 *   DELETE /image           drop the custom image
 *
 * Mutations require an `x-dsh-skin-photo: 1` header. That is not authentication
 * — these routes sit outside the Host's browser-cookie gate — it forces a CORS
 * preflight for any cross-origin page, which stops a drive-by site from
 * rewriting the skin through a plain form post or image tag.
 *
 * @module dsh-skin-photo
 */
import { createReadStream } from 'node:fs'
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Cordis plugin name; the Loader row id in `cordis.patch.yml` may differ. */
export const name = 'skin-photo'

/** The Host web server owns the route table this plugin writes into. */
export const inject = ['webServer']

/** Route prefix; the client half references the same string (see `lib/client.js`). */
export const PREFIX = '/dsh-skin-photo'

/** Request header that mutations require (see the note above). */
const MUTATION_HEADER = 'x-dsh-skin-photo'

/** Package root; only its `assets/` subtree is reachable through the route. */
const ASSET_ROOT = fileURLToPath(new URL('../', import.meta.url))

/** The one subdirectory the built-in art route exposes. */
const ASSET_PREFIX = '/assets/'

/** Durable state, kept with the other profile data rather than in the package. */
const STATE_DIR =
  process.env.DSH_SKIN_PHOTO_STATE ?? join(homedir(), '.dsh', 'skins', 'skin-photo')
const CONFIG_FILE = join(STATE_DIR, 'config.json')
const IMAGE_FILE = join(STATE_DIR, 'current.webp')

/** Tuning bounds, duplicated in the client half. */
const DEFAULTS = { glass: 100, blur: 6, enabled: true }
const RANGES = { glass: [0, 150], blur: [0, 24] }

/** Refuse an upload larger than this: the client re-encodes to a few hundred KB. */
const MAX_IMAGE_BYTES = 8 * 1024 * 1024

/** Refuse a config document larger than this. */
const MAX_CONFIG_BYTES = 8 * 1024

/** Only the formats a built-in background can legitimately be saved as. */
const MIME_TYPES = new Map([
  ['.webp', 'image/webp'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.avif', 'image/avif'],
  ['.gif', 'image/gif'],
])

/** Serialize writes so two quick slider flushes cannot interleave. */
let writeQueue = Promise.resolve()

/** Run a filesystem mutation after every earlier one. */
function enqueue(run) {
  const next = writeQueue.then(run, run)
  writeQueue = next.catch(() => {})
  return next
}

/** Clamp one tuning value, falling back when it is not a number. */
function clampSetting(key, value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULTS[key]
  const [min, max] = RANGES[key]
  return Math.round(Math.min(max, Math.max(min, value)))
}

/** Modification time of the custom image, used as its cache-busting revision. */
async function imageVersion() {
  try {
    const stats = await stat(IMAGE_FILE)
    return stats.isFile() ? String(Math.round(stats.mtimeMs)) : null
  } catch {
    return null
  }
}

/** Read the stored tuning, tolerating a missing or unreadable file. */
async function readConfig() {
  let stored = {}
  try {
    stored = JSON.parse(await readFile(CONFIG_FILE, 'utf8'))
  } catch {
    stored = {}
  }
  return {
    glass: clampSetting('glass', stored.glass),
    blur: clampSetting('blur', stored.blur),
    enabled: typeof stored.enabled === 'boolean' ? stored.enabled : DEFAULTS.enabled,
    image: await imageVersion(),
  }
}

/** Write JSON atomically so a crash cannot truncate the config. */
async function writeConfig(config) {
  await mkdir(STATE_DIR, { recursive: true })
  const temporary = CONFIG_FILE + '.tmp'
  await writeFile(temporary, JSON.stringify(config, null, 2) + '\n')
  await rename(temporary, CONFIG_FILE)
}

/** Collect a request body, failing when it exceeds `limit`. */
function readBody(request, limit) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    request.on('data', (chunk) => {
      size += chunk.length
      if (size > limit) {
        reject(new Error('body too large'))
        request.destroy()
        return
      }
      chunks.push(chunk)
    })
    request.on('end', () => resolve(Buffer.concat(chunks)))
    request.on('error', reject)
  })
}

/** Reply with JSON. */
function sendJson(response, status, body) {
  const payload = Buffer.from(JSON.stringify(body))
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': payload.length,
    'cache-control': 'no-store',
  })
  response.end(payload)
}

/** Resolve one request path to a file inside the package's `assets/`. */
function resolveAsset(pathname) {
  const relative = pathname.slice(PREFIX.length)
  if (!relative.startsWith(ASSET_PREFIX)) return undefined
  const file = join(ASSET_ROOT, relative)
  // `join` normalizes `..` away; re-check the result stays under assets/ and
  // out of dot-directories.
  const assets = join(ASSET_ROOT, 'assets') + '/'
  if (!file.startsWith(assets) || file.includes('/.')) return undefined
  if (!MIME_TYPES.has(extname(file).toLowerCase())) return undefined
  return file
}

/** Stream one file with long-lived immutable caching. */
async function serveFile(request, response, file, type) {
  let stats
  try {
    stats = await stat(file)
  } catch {
    response.writeHead(404, { 'cache-control': 'no-store' })
    response.end()
    return
  }
  if (!stats.isFile()) {
    response.writeHead(404, { 'cache-control': 'no-store' })
    response.end()
    return
  }
  response.writeHead(200, {
    'content-type': type,
    'content-length': stats.size,
    'cache-control': 'public, max-age=31536000, immutable',
    'x-content-type-options': 'nosniff',
  })
  if (request.method === 'HEAD') {
    response.end()
    return
  }
  const stream = createReadStream(file)
  stream.on('error', () => response.destroy())
  response.on('close', () => stream.destroy())
  stream.pipe(response)
}

/** Answer 404 with no body, the shape the static route uses. */
function notFound(response) {
  response.writeHead(404, { 'cache-control': 'no-store' })
  response.end()
}

/**
 * Serve one request: art, config, or the custom image.
 *
 * @param request - Host request.
 * @param response - Host response.
 */
async function handle(request, response) {
  const readMethod = request.method === 'GET' || request.method === 'HEAD'
  if (!readMethod && request.headers[MUTATION_HEADER] !== '1') {
    sendJson(response, 403, { error: 'missing ' + MUTATION_HEADER + ' header' })
    return
  }

  let pathname
  try {
    pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname)
  } catch {
    response.writeHead(400, { 'cache-control': 'no-store' })
    response.end()
    return
  }

  if (pathname === PREFIX + '/config') {
    if (readMethod) {
      sendJson(response, 200, await readConfig())
      return
    }
    if (request.method !== 'PUT') {
      response.writeHead(405, { allow: 'GET, HEAD, PUT', 'cache-control': 'no-store' })
      response.end()
      return
    }
    let incoming
    try {
      incoming = JSON.parse((await readBody(request, MAX_CONFIG_BYTES)).toString('utf8'))
    } catch {
      sendJson(response, 400, { error: 'invalid config body' })
      return
    }
    const current = await readConfig()
    const merged = {
      glass: 'glass' in incoming ? clampSetting('glass', incoming.glass) : current.glass,
      blur: 'blur' in incoming ? clampSetting('blur', incoming.blur) : current.blur,
      enabled:
        'enabled' in incoming && typeof incoming.enabled === 'boolean' ? incoming.enabled : current.enabled,
    }
    await enqueue(() => writeConfig(merged))
    sendJson(response, 200, { ...merged, image: await imageVersion() })
    return
  }

  if (pathname === PREFIX + '/image') {
    if (readMethod) {
      await serveFile(request, response, IMAGE_FILE, 'image/webp')
      return
    }
    if (request.method === 'POST') {
      let body
      try {
        body = await readBody(request, MAX_IMAGE_BYTES)
      } catch {
        sendJson(response, 413, { error: 'image too large' })
        return
      }
      // Only a real WebP container is accepted; the client always re-encodes.
      const isWebp =
        body.length > 12 &&
        body.toString('ascii', 0, 4) === 'RIFF' &&
        body.toString('ascii', 8, 12) === 'WEBP'
      if (!isWebp) {
        sendJson(response, 415, { error: 'expected a WebP body' })
        return
      }
      await enqueue(async () => {
        await mkdir(STATE_DIR, { recursive: true })
        const temporary = IMAGE_FILE + '.tmp'
        await writeFile(temporary, body)
        await rename(temporary, IMAGE_FILE)
      })
      sendJson(response, 200, { image: await imageVersion() })
      return
    }
    if (request.method === 'DELETE') {
      await enqueue(() => rm(IMAGE_FILE, { force: true }))
      sendJson(response, 200, { image: null })
      return
    }
    response.writeHead(405, { allow: 'GET, HEAD, POST, DELETE', 'cache-control': 'no-store' })
    response.end()
    return
  }

  const asset = resolveAsset(pathname)
  if (asset !== undefined && readMethod) {
    await serveFile(request, response, asset, MIME_TYPES.get(extname(asset).toLowerCase()))
    return
  }

  notFound(response)
}

/**
 * Register the route for the plugin's lifetime.
 *
 * @param ctx - Host plugin context.
 */
export function apply(ctx) {
  ctx.effect(() =>
    ctx.webServer.register({
      kind: 'prefix',
      path: PREFIX,
      handler: handle,
    }),
  )
}
