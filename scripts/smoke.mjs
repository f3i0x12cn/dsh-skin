#!/usr/bin/env node
/**
 * Headless smoke test for the client bundle.
 *
 * The bundle is browser-only, so this stubs just enough DOM (and the Host
 * config fetch) to evaluate it: it proves the module registers, the boot path
 * runs without throwing, the persisted tuning is adopted, and the settings row
 * renders a tree carrying the expected controls. It cannot prove the skin
 * *looks* right — that stays a window check.
 *
 * Usage: node scripts/smoke.mjs
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(here, '..', 'lib', 'client.js'), 'utf8')

const fail = (message) => {
  console.error('FAIL', message)
  process.exitCode = 1
  throw new Error(message)
}

// ---------------------------------------------------------------- DOM fakes

const created = []
const styleTags = []

function makeElement(tag) {
  const element = {
    tag,
    dataset: {},
    style: { properties: new Map() },
    children: [],
    attributes: new Map(),
    textContent: '',
    appendChild(child) {
      this.children.push(child)
      if (tag === 'head' || tag === 'style') styleTags.push(child)
      return child
    },
    remove() {
      const index = created.indexOf(this)
      if (index >= 0) created.splice(index, 1)
    },
    setAttribute(name, value) {
      this.attributes.set(name, value ?? '')
    },
    removeAttribute(name) {
      this.attributes.delete(name)
    },
    getAttribute(name) {
      return this.attributes.get(name) ?? null
    },
    hasAttribute(name) {
      return this.attributes.has(name)
    },
    toggleAttribute(name, force) {
      const want = force === undefined ? !this.attributes.has(name) : force
      if (want) this.attributes.set(name, '')
      else this.attributes.delete(name)
      return want
    },
  }
  element.style.setProperty = (name, value) => element.style.properties.set(name, value)
  element.style.removeProperty = (name) => element.style.properties.delete(name)
  created.push(element)
  return element
}

function makeRow(key, title) {
  const node = makeElement('div')
  node.setAttribute('data-row-key', key)
  if (title !== undefined) node.querySelector = (selector) => (selector.includes('_title') ? title : null)
  return node
}

// The session tree is not rendered here: these stand in for its rows, in document
// order, with the first three workspaces carrying three sessions each.
const workspaceRows = []
const sessionTitles = []
const sidebarRows = []
for (let index = 0; index < 8; index += 1) {
  const workspace = makeRow('workspace:' + index)
  workspaceRows.push(workspace)
  sidebarRows.push(workspace)
  for (let session = 0; session < (index < 3 ? 3 : 1); session += 1) {
    const title = makeElement('span')
    sessionTitles.push(title)
    sidebarRows.push(makeRow('session:' + index + ':' + session, title))
  }
}

const head = makeElement('head')
const body = makeElement('body')
const documentElement = makeElement('html')

globalThis.document = {
  head,
  body,
  documentElement,
  createElement: (tag) => makeElement(tag),
  createElementNS: (_namespace, tag) => makeElement(tag),
  getElementById: (id) => created.find((element) => element.id === id) ?? null,
  // The React tree is not rendered here; these stand in for the workspace rows.
  querySelectorAll: (selector) => (selector.startsWith('[data-row-key^=') ? sidebarRows : []),
  querySelector: (selector) => {
    const match = /data-plugin-css="([^"]+)"/.exec(selector)
    if (match === null) return null
    return styleTags.find((tag) => tag.dataset.pluginCss === match[1]) ?? null
  },
  addEventListener() {},
  removeEventListener() {},
}

globalThis.MutationObserver = class {
  observe() {}
  disconnect() {}
}

// The Host half is not running here; answer the one boot request with a
// tuned config so the adoption path is exercised.
const persisted = {
  glass: 80,
  blur: 12,
  enabled: true,
  brand: true,
  workspaceName: false,
  markers: 'triangle',
  image: '1700000000000',
}
const calls = []
globalThis.fetch = async (url, init = {}) => {
  calls.push([String(url), init.method ?? 'GET'])
  if (String(url).endsWith('/config')) {
    return { ok: true, status: 200, json: async () => ({ ...persisted }) }
  }
  return { ok: false, status: 404, json: async () => ({}) }
}

// Minimal React stand-in: enough for createElement/hooks to run synchronously.
const react = {
  createElement: (type, props, ...children) => ({ type, props: props ?? {}, children: children.flat() }),
  useState: (initial) => [initial, () => {}],
  useEffect: () => {},
  useRef: (initial) => ({ current: initial }),
}

// --------------------------------------------------------------- load bundle

let registered
globalThis.window = {
  __ModuleLoader__: {
    load(record) {
      registered = record
    },
  },
}

new Function('window', 'document', 'MutationObserver', 'fetch', source)(
  globalThis.window,
  globalThis.document,
  globalThis.MutationObserver,
  globalThis.fetch,
)

if (registered === undefined) fail('bundle did not call __ModuleLoader__.load')
if (registered.id !== 'dsh-skin') fail(`unexpected id ${registered.id}`)

const exports = registered.factory((id) => {
  if (id === 'react') return react
  fail(`unexpected require(${JSON.stringify(id)})`)
})
if (typeof exports.apply !== 'function') fail('missing apply export')
if (!Array.isArray(exports.inject) || !exports.inject.includes('slots')) fail('missing slots injection')

// Workspace names: one solid colour per row, cycling through the spectrum.
const NAMES = ['#e5484d', '#f76b15', '#a67c00', '#30a46c', '#0d9488', '#3b82f6', '#8b5cf6']
const painted = workspaceRows.map((row) => row.style.properties.get('--dsh-skin-name-color'))
if (painted[0] !== NAMES[0]) fail(`first workspace row should be ${NAMES[0]}, got ${painted[0]}`)
if (painted[6] !== NAMES[6]) fail(`seventh workspace row should be ${NAMES[6]}, got ${painted[6]}`)
if (painted[7] !== NAMES[0]) fail(`eighth workspace row should cycle back to ${NAMES[0]}, got ${painted[7]}`)

// Sessions are numbered from 1 under each workspace: 1. 2. 3. | 1. 2. 3. | 1. 2. 3. | 1. ...
const indexes = sessionTitles.map((title) => title.attributes.get('data-dsh-skin-index'))
const firstNine = indexes.slice(0, 9).join(' ')
if (firstNine !== '1. 2. 3. 1. 2. 3. 1. 2. 3.') fail(`session numbering wrong: ${firstNine}`)
if (indexes[9] !== '1.') fail(`numbering should restart under the fourth workspace, got ${indexes[9]}`)

// ------------------------------------------------------------- scene checks

if (styleTags.length !== 1) fail(`expected one style tag, got ${styleTags.length}`)
const css = styleTags[0].textContent
for (const needle of [
  'data-dsh-skin',
  'calc(14% * var(--dsh-skin-glass, 1))',
  'blur(var(--dsh-skin-blur)',
  'var(--dsh-skin-image, url("/dsh-skin/assets/bridge.webp?v=1"))',
  // Workspace headings: code face, semibold, and the folder glyph in the same colour.
  'font-family: var(--ds-font-family-code',
  '[class*="_projectRow"] [class*="_folder"]',
]) {
  if (!css.includes(needle)) fail(`stylesheet missing ${needle}`)
}
if (!documentElement.hasAttribute('data-dsh-skin')) fail('root attribute not set by boot')

// The wordmark rainbow is a document-level paint server, installed next to the
// stylesheet rather than inside the wordmark it paints.
const rainbow = created.find((element) => element.id === 'dsh-skin/rainbow')
if (rainbow === undefined) fail('rainbow paint server not installed')
const gradient = rainbow.children[0]?.children[0]
if (gradient === undefined) fail('rainbow paint server has no gradient')
if (gradient.children.length !== 7) fail(`expected seven spectrum stops, got ${gradient.children.length}`)

// The boot request is async; let it land before asserting adoption.
await new Promise((resolve) => setTimeout(resolve, 20))

const glassVar = documentElement.style.properties.get('--dsh-skin-glass')
const blurVar = documentElement.style.properties.get('--dsh-skin-blur')
const imageVar = documentElement.style.properties.get('--dsh-skin-image')
if (glassVar !== '0.8') fail(`glass not adopted from host: ${glassVar}`)
if (blurVar !== '12px') fail(`blur not adopted from host: ${blurVar}`)
if (imageVar !== 'url("/dsh-skin/image?v=1700000000000")') fail(`image not adopted: ${imageVar}`)

// The two brand switches follow their own stored flags, not the photo switch:
// the fake Host answers with brand on and workspace-name off.
if (!documentElement.hasAttribute('data-dsh-skin-brand')) fail('brand switch attribute not adopted')
if (documentElement.hasAttribute('data-dsh-skin-workspace')) {
  fail('workspace switch attribute set although the Host flag is false')
}

// The adopted marker style is triangles, and the marker wears its workspace colour.
const markers = sessionTitles.map((title) => title.attributes.get('data-dsh-skin-index'))
if (!markers.every((glyph) => glyph === '\u25b2')) fail(`adopted marker should be ▲, got ${markers.join(' ')}`)
if (sidebarRows[1].style.properties.get('--dsh-skin-name-color') !== NAMES[0]) {
  fail('session marker colour should match its workspace')
}

if (!calls.some(([url, method]) => url === '/dsh-skin/config' && method === 'GET')) {
  fail('boot did not request /config')
}

// ------------------------------------------------------------- row rendering

let registration
const ctx = {
  effect: () => {},
  slots: {
    inject: (_name, run) => run(),
    register: (options, component) => {
      registration = { options, component }
      return () => {}
    },
  },
}
exports.apply(ctx)
if (registration === undefined) fail('apply did not register a settings row')
if (registration.options.name !== 'settings.general.item') fail('wrong slot name')

const tree = registration.component()
const texts = []
const inputs = []
const selects = []
const walk = (node) => {
  if (node === null || node === undefined) return
  if (Array.isArray(node)) return node.forEach(walk)
  if (typeof node === 'string' || typeof node === 'number') return texts.push(String(node))
  if (node.props) {
    for (const value of Object.values(node.props)) {
      if (typeof value === 'string') texts.push(value)
    }
  }
  if (node.type === 'input') inputs.push(node.props)
  if (node.type === 'select') selects.push(node.props)
  walk(node.children)
}
walk(tree)

for (const label of ['外观皮肤', '不透明度', '模糊', '选择图片…', '恢复默认', '启用', '当前：自定义图片', '品牌换色', '工作区名字']) {
  if (!texts.includes(label)) fail(`row missing label ${label}`)
}

const ranges = inputs.filter((props) => props.type === 'range')
if (ranges.length !== 2) fail(`expected two range inputs, got ${ranges.length}`)
const file = inputs.find((props) => props.type === 'file')
if (file === undefined) fail('missing file input')
if (file.accept !== 'image/*') fail('file input needs accept="image/*"')

// Sliders must render the adopted values, not the defaults.
if (!ranges.some((range) => range.value === 80 && range.max === 150)) fail('glass slider not reflecting host value')
if (!ranges.some((range) => range.value === 12 && range.max === 24)) fail('blur slider not reflecting host value')

// The marker picker adopts the Host choice, then repaints when it changes.
const markerSelect = selects[0]
if (markerSelect === undefined) fail('settings row has no marker select')
if (markerSelect.value !== 'triangle') fail(`marker select should show the adopted style, got ${markerSelect.value}`)
markerSelect.onChange({ target: { value: 'random' } })
const pool = '\u25b2\u25cf\u25a0\u25c6\u2605\u25cb'
const picked = sessionTitles.map((title) => title.attributes.get('data-dsh-skin-index'))
if (!picked.every((glyph) => pool.includes(glyph))) fail(`random markers should come from the pool, got ${picked.join(' ')}`)

console.log('ok  bundle registers, boot adopts host config, row renders', texts.length, 'labels /', inputs.length, 'inputs')
