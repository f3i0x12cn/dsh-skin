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

const head = makeElement('head')
const body = makeElement('body')
const documentElement = makeElement('html')

globalThis.document = {
  head,
  body,
  documentElement,
  createElement: (tag) => makeElement(tag),
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
const persisted = { glass: 80, blur: 12, enabled: true, image: '1700000000000' }
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
if (registered.id !== 'dsh-skin-photo') fail(`unexpected id ${registered.id}`)

const exports = registered.factory((id) => {
  if (id === 'react') return react
  fail(`unexpected require(${JSON.stringify(id)})`)
})
if (typeof exports.apply !== 'function') fail('missing apply export')
if (!Array.isArray(exports.inject) || !exports.inject.includes('slots')) fail('missing slots injection')

// ------------------------------------------------------------- scene checks

if (styleTags.length !== 1) fail(`expected one style tag, got ${styleTags.length}`)
const css = styleTags[0].textContent
for (const needle of [
  'data-dsh-skin-photo',
  'calc(14% * var(--dsh-skin-photo-glass, 1))',
  'blur(var(--dsh-skin-photo-blur)',
  'var(--dsh-skin-photo-image, url("/dsh-skin-photo/assets/bridge.webp?v=1"))',
]) {
  if (!css.includes(needle)) fail(`stylesheet missing ${needle}`)
}
if (!documentElement.hasAttribute('data-dsh-skin-photo')) fail('root attribute not set by boot')

// The boot request is async; let it land before asserting adoption.
await new Promise((resolve) => setTimeout(resolve, 20))

const glassVar = documentElement.style.properties.get('--dsh-skin-photo-glass')
const blurVar = documentElement.style.properties.get('--dsh-skin-photo-blur')
const imageVar = documentElement.style.properties.get('--dsh-skin-photo-image')
if (glassVar !== '0.8') fail(`glass not adopted from host: ${glassVar}`)
if (blurVar !== '12px') fail(`blur not adopted from host: ${blurVar}`)
if (imageVar !== 'url("/dsh-skin-photo/image?v=1700000000000")') fail(`image not adopted: ${imageVar}`)
if (!calls.some(([url, method]) => url === '/dsh-skin-photo/config' && method === 'GET')) {
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
  walk(node.children)
}
walk(tree)

for (const label of ['背景图皮肤', '不透明度', '模糊', '选择图片…', '恢复默认', '启用', '当前：自定义图片']) {
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

console.log('ok  bundle registers, boot adopts host config, row renders', texts.length, 'labels /', inputs.length, 'inputs')
