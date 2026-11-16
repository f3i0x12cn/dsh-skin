/**
 * Client half of the photo-background skin.
 *
 * Three responsibilities, in load order:
 *   1. Scene  — a stylesheet plus two attributes; the photo and veil are fixed
 *               pseudo-elements on <html>, and the surface tokens are
 *               re-declared translucent. Runs in the factory body so the skin
 *               paints before the first frame.
 *   2. Tuning — glass opacity, blur, enable, and the chosen image. The browser
 *               keeps no durable copy: the Host stores it, because the desktop
 *               app binds a new port on every launch and anything origin-scoped
 *               would be empty by the next start.
 *   3. Row    — one `settings.general.item` registration, so the knobs live in
 *               Settings → General instead of a config file.
 *
 * The skin is additive: no shipped rule is replaced, only token values are
 * re-declared under `html[data-dsh-skin]`, so switching the entry off
 * restores the native appearance exactly.
 *
 * @module dsh-skin/client
 */
window.__ModuleLoader__.load({
  id: 'dsh-skin',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })

    const react = require('react')

    /** Style element identity, mirroring the shipped plugins' data attributes. */
    const TAG_ID = 'dsh-skin/skin.css'

    /** Root attributes: the skin switch, and the dark-theme mirror the veil reads. */
    const SKIN_ATTRIBUTE = 'data-dsh-skin'
    const DARK_ATTRIBUTE = 'data-dsh-skin-dark'

    /** Independent switches for the two brand recolours (see `FLAGS` in the host half). */
    const BRAND_ATTRIBUTE = 'data-dsh-skin-brand'
    const WORKSPACE_ATTRIBUTE = 'data-dsh-skin-workspace'
    const SESSIONS_ATTRIBUTE = 'data-dsh-skin-sessions'

    /** Paint-server id and its holder, so the wordmark rainbow resolves once per document. */
    const GRADIENT_ID = 'dsh-skin-rainbow'
    const GRADIENT_HOLDER_ID = 'dsh-skin/rainbow'

    /** The spectrum both rainbows share: the wordmark reads it left to right, the workspace list row by row. */
    const SPECTRUM = ['#e5484d', '#f76b15', '#a67c00', '#30a46c', '#0d9488', '#3b82f6', '#8b5cf6']

    /** Per-row colour variable the workspace-name rule reads. */
    const NAME_COLOR_PROPERTY = '--dsh-skin-name-color'

    /** Attribute the session-title rule reads through `attr()`, holding the row's marker. */
    const SESSION_INDEX_ATTRIBUTE = 'data-dsh-skin-index'

    /**
     * Session markers. `number` is the default; the rest are single glyphs, and
     * `random` picks one by hashing the session id, so a row keeps its glyph
     * across re-renders and reorders instead of flickering on every repaint.
     */
    const MARKERS = {
      number: null,
      dot: '●',
      ring: '○',
      square: '■',
      triangle: '▲',
      diamond: '◆',
      star: '★',
      arrow: '→',
      dash: '–',
      random: '▲●■◆★○',
    }
    const DEFAULT_MARKER = 'number'

    /** Options the settings select offers, in display order. */
    const MARKER_CHOICES = [
      ['number', '数字（1. 2. 3.）'],
      ['dot', '圆点 ●'],
      ['ring', '空心圆 ○'],
      ['square', '方块 ■'],
      ['triangle', '三角 ▲'],
      ['diamond', '菱形 ◆'],
      ['star', '星号 ★'],
      ['arrow', '箭头 →'],
      ['dash', '短横 –'],
      ['random', '随机符号'],
    ]

    /** Host routes (see `lib/index.js`). */
    const CONFIG_URL = '/dsh-skin/config'
    const IMAGE_URL = '/dsh-skin/image'

    /** Header the Host requires on mutations; it also forces a CORS preflight. */
    const MUTATION_HEADER = { 'x-dsh-skin': '1' }

    /** Built-in background, served by the host half. */
    const DEFAULT_IMAGE = '/dsh-skin/assets/bridge.webp?v=1'

    /** Tuning ranges, duplicated in the host half. */
    const DEFAULTS = { glass: 100, blur: 6, enabled: true, brand: true, workspaceName: true, sessions: true, markers: DEFAULT_MARKER }
    const RANGES = { glass: [0, 150], blur: [0, 24] }

    /**
     * The skin. Every surface alpha scales by `--dsh-skin-glass`, which
     * the row sets inline on <html>; 1 is the tuned default.
     */
    const CSS = `
html[data-dsh-skin] {
  --dsh-skin-blur: 6px;
  --dsh-skin-zoom: 16px;
  --dsh-skin-satur: 108%;
  background-color: #0b1322;
}

/* Photo layer: fixed to the viewport so it never scrolls with the transcript. */
html[data-dsh-skin]::before {
  content: '';
  position: fixed;
  inset: calc(-1 * var(--dsh-skin-zoom));
  z-index: -2;
  pointer-events: none;
  background-image: var(--dsh-skin-image, url("${DEFAULT_IMAGE}"));
  background-position: center center;
  background-repeat: no-repeat;
  background-size: cover;
  filter: blur(var(--dsh-skin-blur)) saturate(var(--dsh-skin-satur));
}

/* Veil layer: the legibility floor. Reads as light falloff, not as a flat wash. */
html[data-dsh-skin]::after {
  content: '';
  position: fixed;
  inset: 0;
  z-index: -1;
  pointer-events: none;
  background-image: var(--dsh-skin-veil);
}

html[data-dsh-skin] {
  --dsh-skin-veil:
    linear-gradient(180deg, rgb(255 255 255 / 18%), rgb(250 253 255 / 30%) 58%, rgb(243 249 255 / 44%) 100%),
    linear-gradient(90deg, rgb(255 255 255 / 40%), rgb(255 255 255 / 14%) 28%, rgb(255 255 255 / 0%) 62%, rgb(255 255 255 / 10%) 100%);
}

html[data-dsh-skin][data-dsh-skin-dark] {
  --dsh-skin-veil:
    linear-gradient(180deg, rgb(2 6 14 / 32%), rgb(2 6 14 / 40%) 55%, rgb(1 4 10 / 56%) 100%),
    linear-gradient(90deg, rgb(1 4 10 / 50%), rgb(1 4 10 / 24%) 28%, rgb(1 4 10 / 14%) 62%, rgb(1 4 10 / 20%) 100%);
}

html[data-dsh-skin] body:not([data-ds-dark-theme]) {
  --dsw-alias-bg-base: rgb(255 255 255 / calc(14% * var(--dsh-skin-glass, 1)));
  --dsw-alias-bg-layer-1: rgb(255 255 255 / calc(26% * var(--dsh-skin-glass, 1)));
  --dsw-alias-bg-layer-2: rgb(255 255 255 / calc(52% * var(--dsh-skin-glass, 1)));
  --dsw-alias-bg-layer-3: rgb(255 255 255 / calc(74% * var(--dsh-skin-glass, 1)));
  --dsw-alias-bg-module-platform: rgb(246 250 255 / calc(32% * var(--dsh-skin-glass, 1)));
  --dsw-alias-bg-multi-select: rgb(246 250 255 / calc(34% * var(--dsh-skin-glass, 1)));
  --dsw-alias-bg-overlay: rgb(240 246 254 / calc(58% * var(--dsh-skin-glass, 1)));
  --dsw-alias-bg-document-preview: rgb(238 244 251 / calc(74% * var(--dsh-skin-glass, 1)));
  --dsw-alias-bg-skeleton: rgb(255 255 255 / calc(26% * var(--dsh-skin-glass, 1)));
  --dsw-alias-interactive-bg-hover: rgb(255 255 255 / calc(38% * var(--dsh-skin-glass, 1)));
  --dsw-alias-interactive-bg-active: rgb(255 255 255 / calc(56% * var(--dsh-skin-glass, 1)));
  --dsw-alias-markdown-code-block: rgb(244 248 253 / calc(46% * var(--dsh-skin-glass, 1)));
  --dsw-specific-sidebar-fill: rgb(249 252 255 / calc(24% * var(--dsh-skin-glass, 1)));
  --dsw-specific-bubble: rgb(226 240 255 / calc(52% * var(--dsh-skin-glass, 1)));
  --dsw-specific-sidebar-nav-item-hover: rgb(255 255 255 / calc(34% * var(--dsh-skin-glass, 1)));
  --dsw-specific-sidebar-nav-item-active: rgb(255 255 255 / calc(60% * var(--dsh-skin-glass, 1)));
  --dsw-menu-surface-fill: rgb(249 251 254 / calc(78% * var(--dsh-skin-glass, 1)));
  --dsw-specific-menu: rgb(249 251 254 / calc(78% * var(--dsh-skin-glass, 1)));
}

html[data-dsh-skin] body[data-ds-dark-theme] {
  --dsw-alias-bg-base: rgb(10 17 30 / calc(18% * var(--dsh-skin-glass, 1)));
  --dsw-alias-bg-layer-1: rgb(13 21 37 / calc(32% * var(--dsh-skin-glass, 1)));
  --dsw-alias-bg-layer-2: rgb(16 25 42 / calc(56% * var(--dsh-skin-glass, 1)));
  --dsw-alias-bg-layer-3: rgb(20 30 49 / calc(76% * var(--dsh-skin-glass, 1)));
  --dsw-alias-bg-module-platform: rgb(255 255 255 / calc(7% * var(--dsh-skin-glass, 1)));
  --dsw-alias-bg-multi-select: rgb(255 255 255 / calc(8% * var(--dsh-skin-glass, 1)));
  --dsw-alias-bg-overlay: rgb(8 14 26 / calc(64% * var(--dsh-skin-glass, 1)));
  --dsw-alias-bg-document-preview: rgb(7 12 22 / calc(82% * var(--dsh-skin-glass, 1)));
  --dsw-alias-bg-skeleton: rgb(255 255 255 / calc(7% * var(--dsh-skin-glass, 1)));
  --dsw-alias-interactive-bg-hover: rgb(255 255 255 / calc(9% * var(--dsh-skin-glass, 1)));
  --dsw-alias-interactive-bg-active: rgb(255 255 255 / calc(14% * var(--dsh-skin-glass, 1)));
  --dsw-alias-markdown-code-block: rgb(255 255 255 / calc(7% * var(--dsh-skin-glass, 1)));
  --dsw-specific-sidebar-fill: rgb(8 14 26 / calc(26% * var(--dsh-skin-glass, 1)));
  --dsw-specific-bubble: rgb(38 59 94 / calc(52% * var(--dsh-skin-glass, 1)));
  --dsw-specific-sidebar-nav-item-hover: rgb(255 255 255 / calc(9% * var(--dsh-skin-glass, 1)));
  --dsw-specific-sidebar-nav-item-active: rgb(255 255 255 / calc(14% * var(--dsh-skin-glass, 1)));
  --dsw-menu-surface-fill: rgb(11 18 32 / calc(82% * var(--dsh-skin-glass, 1)));
  --dsw-specific-menu: rgb(11 18 32 / calc(82% * var(--dsh-skin-glass, 1)));
}

/* Two switches that do not depend on the photo layer: the brand recolour and the
   workspace-name rainbow. Each attribute is toggled on its own, so the photo
   skin can be off while these stay on (and the other way round). */

/* Whale marks: sidebar (expanded and collapsed rail) and the home headline fish.
   Each is one <path fill="currentColor">, so the colour alone does it. */
html[data-dsh-skin-brand] [class*="_brandMark"] svg,
html[data-dsh-skin-brand] [class*="_railMark"] svg,
html[data-dsh-skin-brand] [class*="_fishHitbox"] svg {
  color: var(--dsh-skin-whale, #2F6BFF);
}

/* The deepseek logotype: one horizontal spectrum across the whole word. The
   HARNESS badge paints its glyphs with the inverted label colour, so it does not
   match this selector and keeps its original look. */
html[data-dsh-skin-brand] [class*="_brandName"] svg path[fill="currentColor"] {
  fill: url(#dsh-skin-rainbow);
}

/* Workspace names in the sidebar session list: one solid colour per workspace,
   cycling through the spectrum, so the list reads as a rainbow while every name
   stays a single colour. The client half writes the row's colour into
   --dsh-skin-name-color; .title is shared with session rows, so the rule is
   scoped to .projectText.

   The name also takes the code face at semibold: it is a group heading, and the
   list otherwise runs session titles in the UI face at the same size. */
html[data-dsh-skin-workspace] [class*="_projectText"] > [class*="_title"] {
  color: var(--dsh-skin-name-color, inherit);
  font-family: var(--ds-font-family-code, ui-monospace, SFMono-Regular, Menlo, monospace);
  font-weight: 600;
  letter-spacing: 0.01em;
}

/* The folder glyph in front of that name wears the same colour. .slot paints it
   with the tertiary label colour, so this rule needs the project-row scope to win. */
html[data-dsh-skin-workspace] [class*="_projectRow"] [class*="_folder"] {
  color: var(--dsh-skin-name-color, inherit);
}

/* Session titles under a workspace: the same code face at regular weight, plus the
   row's position inside its workspace. The number arrives as the attribute's own
   text (including the dot) because attr() has no reliable fallback: a missing
   attribute then renders nothing instead of a stray dot. */
html[data-dsh-skin-sessions] [class*="_sessionRow"] [class*="_title"] {
  font-family: var(--ds-font-family-code, ui-monospace, SFMono-Regular, Menlo, monospace);
  font-weight: 400;
}

html[data-dsh-skin-sessions] [class*="_sessionRow"] [class*="_title"]::before {
  content: attr(data-dsh-skin-index);
  margin-right: 6px;
  color: var(--dsh-skin-name-color, var(--dsw-alias-label-tertiary));
  font-variant-numeric: tabular-nums;
}
`

    // ------------------------------------------------------------ host plumbing

    const log = (message, error) => console.warn('[dsh-skin] ' + message, error)

    /** Read the persisted tuning from the Host. */
    async function loadConfig() {
      const response = await fetch(CONFIG_URL, { cache: 'no-store' })
      if (!response.ok) throw new Error('GET /config -> ' + response.status)
      return response.json()
    }

    /** Persist one tuning patch. */
    async function saveConfig(patch) {
      const response = await fetch(CONFIG_URL, {
        method: 'PUT',
        headers: { ...MUTATION_HEADER, 'content-type': 'application/json' },
        body: JSON.stringify(patch),
      })
      if (!response.ok) throw new Error('PUT /config -> ' + response.status)
      return response.json()
    }

    /** Replace the custom image. */
    async function uploadImage(blob) {
      const response = await fetch(IMAGE_URL, { method: 'POST', headers: MUTATION_HEADER, body: blob })
      if (!response.ok) throw new Error('POST /image -> ' + response.status)
      return response.json()
    }

    /** Drop the custom image. */
    async function removeImage() {
      const response = await fetch(IMAGE_URL, { method: 'DELETE', headers: MUTATION_HEADER })
      if (!response.ok) throw new Error('DELETE /image -> ' + response.status)
      return response.json()
    }

    // -------------------------------------------------------------------- scene

    /** Inject the stylesheet once for this document. */
    function installStyles() {
      if (document.querySelector('style[data-plugin-css="' + TAG_ID + '"]') !== null) return
      const style = document.createElement('style')
      style.dataset.plugin = 'dsh-skin'
      style.dataset.pluginCss = TAG_ID
      style.textContent = CSS
      document.head.appendChild(style)
    }

    /**
     * Publish the wordmark's paint server.
     *
     * CSS `fill: url(#id)` resolves against the document, so the gradient lives in
     * a zero-size SVG instead of inside the wordmark it paints. `userSpaceOnUse`
     * keeps one spectrum across the whole word: the wordmark's viewBox is
     * `26 0 156 24`, and its letterforms span 23 → 124.
     */
    function installGradient() {
      if (document.getElementById(GRADIENT_HOLDER_ID) !== null) return
      const NS = 'http://www.w3.org/2000/svg'
      const holder = document.createElementNS(NS, 'svg')
      holder.id = GRADIENT_HOLDER_ID
      holder.setAttribute('aria-hidden', 'true')
      holder.setAttribute('width', '0')
      holder.setAttribute('height', '0')
      holder.style.position = 'absolute'
      holder.style.width = '0'
      holder.style.height = '0'
      holder.style.overflow = 'hidden'

      const defs = document.createElementNS(NS, 'defs')
      const gradient = document.createElementNS(NS, 'linearGradient')
      gradient.id = GRADIENT_ID
      gradient.setAttribute('gradientUnits', 'userSpaceOnUse')
      gradient.setAttribute('x1', '23')
      gradient.setAttribute('y1', '0')
      gradient.setAttribute('x2', '124')
      gradient.setAttribute('y2', '0')
      SPECTRUM.forEach((color, index) => {
        const stop = document.createElementNS(NS, 'stop')
        stop.setAttribute('offset', String(Math.round((index / (SPECTRUM.length - 1)) * 100)) + '%')
        stop.setAttribute('stop-color', color)
        gradient.appendChild(stop)
      })
      defs.appendChild(gradient)
      holder.appendChild(defs)
      document.body.appendChild(holder)
    }

    /** Mirror the theme's dark flag onto the root, where the veil selectors live. */
    function syncDark() {
      const dark = document.body?.hasAttribute('data-ds-dark-theme') === true
      document.documentElement.toggleAttribute(DARK_ATTRIBUTE, dark)
    }

    /** Watch the theme flag; `immediately` modules may run before <body> exists. */
    function watchTheme() {
      const observer = new MutationObserver(syncDark)
      const observe = () => {
        syncDark()
        observer.observe(document.body, { attributes: true, attributeFilter: ['data-ds-dark-theme'] })
      }
      if (document.body === null) {
        document.addEventListener('DOMContentLoaded', observe, { once: true })
      } else {
        observe()
      }
      return () => {
        document.removeEventListener('DOMContentLoaded', observe)
        observer.disconnect()
      }
    }

    /**
     * Re-colour the workspace rows whenever the session list changes: expanding a
     * group, filtering, reordering, or React replacing a row all invalidate the
     * per-row colours. Only childList changes are observed, so the inline custom
     * properties written here cannot retrigger the observer.
     */
    function watchWorkspaceRows() {
      let frame = 0
      const schedule = () => {
        if (frame !== 0) return
        frame = requestAnimationFrame(() => {
          frame = 0
          paintSidebarRows()
        })
      }
      const observer = new MutationObserver(schedule)
      const observe = () => {
        paintSidebarRows()
        observer.observe(document.body, { childList: true, subtree: true })
      }
      if (document.body === null) {
        document.addEventListener('DOMContentLoaded', observe, { once: true })
      } else {
        observe()
      }
      return () => {
        if (frame !== 0) cancelAnimationFrame(frame)
        document.removeEventListener('DOMContentLoaded', observe)
        observer.disconnect()
      }
    }

    /**
     * Current tuning, the custom image revision, and whether the Host half
     * answered. `hostReady` is null until the first sync so the row can stay
     * quiet on a slow boot.
     */
    const state = {
      glass: DEFAULTS.glass,
      blur: DEFAULTS.blur,
      enabled: DEFAULTS.enabled,
      brand: DEFAULTS.brand,
      workspaceName: DEFAULTS.workspaceName,
      sessions: DEFAULTS.sessions,
      markers: DEFAULTS.markers,
      image: null,
      hostReady: null,
    }

    const listeners = new Set()

    /** Notify the settings row that state changed. */
    function notify() {
      for (const listener of listeners) listener()
    }

    /** Push the tuning onto the root element as inline custom properties. */
    function paint() {
      const root = document.documentElement
      root.style.setProperty('--dsh-skin-glass', String(state.glass / 100))
      root.style.setProperty('--dsh-skin-blur', state.blur + 'px')
      if (state.enabled) root.setAttribute(SKIN_ATTRIBUTE, '')
      else root.removeAttribute(SKIN_ATTRIBUTE)
      if (state.brand) root.setAttribute(BRAND_ATTRIBUTE, '')
      else root.removeAttribute(BRAND_ATTRIBUTE)
      if (state.workspaceName) root.setAttribute(WORKSPACE_ATTRIBUTE, '')
      else root.removeAttribute(WORKSPACE_ATTRIBUTE)
      if (state.sessions) root.setAttribute(SESSIONS_ATTRIBUTE, '')
      else root.removeAttribute(SESSIONS_ATTRIBUTE)
      paintSidebarRows()
    }

    /** Marker text for one session row: its position, or a stable glyph. */
    function markerText(position, key) {
      const marker = state.markers
      if (marker === DEFAULT_MARKER) return position + '.'
      if (marker === 'random') {
        const pool = MARKERS.random
        let hash = 0
        for (const character of key) hash = (hash * 31 + character.codePointAt(0)) >>> 0
        return pool[hash % pool.length]
      }
      return MARKERS[marker] ?? position + '.'
    }

    /**
     * Decorate the sidebar list in one document-order pass.
     *
     * Workspace rows take one solid colour each, so the list reads as a rainbow
     * while every name stays a single colour. Session rows are numbered from 1
     * again under each workspace, written as an attribute the title rule reads
     * through `attr()`, because CSS counters cannot restart at a sibling marker
     * when every row is a flat sibling of the same tree.
     *
     * Rows are matched by `data-row-key`, which React keeps on both row kinds.
     */
    function paintSidebarRows() {
      let workspace = -1
      let session = 0
      for (const row of document.querySelectorAll('[data-row-key^="workspace:"], [data-row-key^="session:"]')) {
        const key = row.getAttribute('data-row-key') ?? ''
        if (key.startsWith('workspace:')) {
          workspace += 1
          session = 0
          if (state.workspaceName) row.style.setProperty(NAME_COLOR_PROPERTY, SPECTRUM[workspace % SPECTRUM.length])
          else row.style.removeProperty(NAME_COLOR_PROPERTY)
          continue
        }
        session += 1
        // The marker wears the workspace's colour: the row is a sibling of the
        // workspace row, not a child, so the colour has to be copied down.
        if (state.sessions) row.style.setProperty(NAME_COLOR_PROPERTY, SPECTRUM[Math.max(workspace, 0) % SPECTRUM.length])
        else row.style.removeProperty(NAME_COLOR_PROPERTY)
        const title = row.querySelector('[class*="_title"]')
        if (title === null) continue
        if (state.sessions) title.setAttribute(SESSION_INDEX_ATTRIBUTE, markerText(session, key))
        else title.removeAttribute(SESSION_INDEX_ATTRIBUTE)
      }
    }

    /** Point the photo layer at the custom image, or back at the built-in art. */
    function paintImage() {
      const root = document.documentElement
      if (state.image === null) root.style.removeProperty('--dsh-skin-image')
      else root.style.setProperty('--dsh-skin-image', `url("${IMAGE_URL}?v=${state.image}")`)
    }

    /** Pending patch, so dragging a slider sends one request instead of forty. */
    let pendingPatch = {}
    let flushTimer

    /** Apply a change now and persist it shortly after. */
    function setSetting(key, value) {
      state[key] = value
      paint()
      notify()
      pendingPatch[key] = value
      clearTimeout(flushTimer)
      flushTimer = setTimeout(() => {
        const patch = pendingPatch
        pendingPatch = {}
        void saveConfig(patch).catch((error) => log('save failed', error))
      }, 200)
    }

    /** Downscale + re-encode a picked file so a 12 MP photo stays a few hundred KB. */
    async function prepareImage(file) {
      const bitmap = await createImageBitmap(file)
      try {
        const scale = Math.min(1, 2560 / Math.max(bitmap.width, bitmap.height))
        const canvas = document.createElement('canvas')
        canvas.width = Math.max(1, Math.round(bitmap.width * scale))
        canvas.height = Math.max(1, Math.round(bitmap.height * scale))
        canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height)
        const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', 0.82))
        if (blob === null) throw new Error('浏览器无法编码这张图片')
        return blob
      } finally {
        bitmap.close()
      }
    }

    /** Pull the persisted tuning from the Host and adopt it. */
    async function sync() {
      try {
        const config = await loadConfig()
        state.glass = config.glass
        state.blur = config.blur
        state.enabled = config.enabled
        state.brand = config.brand ?? DEFAULTS.brand
        state.workspaceName = config.workspaceName ?? DEFAULTS.workspaceName
        state.sessions = config.sessions ?? DEFAULTS.sessions
        state.markers = MARKER_CHOICES.some(([value]) => value === config.markers) ? config.markers : DEFAULTS.markers
        state.image = config.image ?? null
        state.hostReady = true
        paint()
        paintImage()
        notify()
      } catch (error) {
        state.hostReady = false
        log('config unavailable (Host half not loaded yet?)', error)
      }
    }

    // ------------------------------------------------------------- settings row

    const styles = {
      row: {
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        padding: '16px 0',
        borderBottom: '.5px solid var(--dsw-alias-border-l2)',
      },
      title: { color: 'var(--dsw-alias-label-primary)', fontSize: '14px', lineHeight: '22px' },
      subTitle: { color: 'var(--dsw-alias-label-primary)', fontSize: '13px', lineHeight: '20px', fontWeight: '500' },
      group: {
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
        paddingTop: '12px',
        marginTop: '4px',
        borderTop: '.5px dashed var(--dsw-alias-border-l2)',
      },
      desc: { color: 'var(--dsw-alias-label-tertiary)', fontSize: '12px', lineHeight: '18px' },
      control: { display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' },
      label: { color: 'var(--dsw-alias-label-secondary)', fontSize: '12px', lineHeight: '18px', minWidth: '56px' },
      value: {
        color: 'var(--dsw-alias-label-tertiary)',
        fontSize: '12px',
        lineHeight: '18px',
        fontVariantNumeric: 'tabular-nums',
        minWidth: '44px',
      },
      slider: {
        flex: '1 1 160px',
        minWidth: '120px',
        maxWidth: '280px',
        accentColor: 'var(--dsw-alias-brand-primary, #4176e6)',
      },
      select: {
        height: '28px',
        padding: '0 8px',
        fontSize: '12px',
        borderRadius: 'var(--dsw-radius-sm, 6px)',
        border: '.5px solid var(--dsw-alias-border-l3)',
        background: 'transparent',
        color: 'var(--dsw-alias-label-primary)',
        cursor: 'pointer',
      },
      button: {
        height: '28px',
        padding: '0 10px',
        fontSize: '12px',
        borderRadius: 'var(--dsw-radius-sm, 6px)',
        border: '.5px solid var(--dsw-alias-border-l3)',
        background: 'transparent',
        color: 'var(--dsw-alias-label-primary)',
        cursor: 'pointer',
      },
    }

    /**
     * Settings → General → the skin row: enable, glass opacity, blur, and image.
     *
     * @returns the row element tree.
     */
    function SkinPhotoRow() {
      const [, force] = react.useState(0)
      const [status, setStatus] = react.useState('')
      const fileRef = react.useRef(null)

      react.useEffect(() => {
        const listener = () => force((count) => count + 1)
        listeners.add(listener)
        return () => listeners.delete(listener)
      }, [])

      const onPick = async (event) => {
        const file = event.target.files?.[0]
        event.target.value = ''
        if (file === undefined) return
        setStatus('正在处理图片…')
        try {
          const result = await uploadImage(await prepareImage(file))
          state.image = result.image
          paintImage()
          setStatus('已应用')
          notify()
        } catch (error) {
          setStatus('图片应用失败：' + (error instanceof Error ? error.message : String(error)))
        }
      }

      const onReset = async () => {
        setStatus('')
        state.glass = DEFAULTS.glass
        state.blur = DEFAULTS.blur
        state.enabled = DEFAULTS.enabled
        state.brand = DEFAULTS.brand
        state.workspaceName = DEFAULTS.workspaceName
        state.sessions = DEFAULTS.sessions
        state.markers = DEFAULTS.markers
        state.image = null
        paint()
        paintImage()
        notify()
        try {
          await saveConfig({ ...DEFAULTS })
          await removeImage()
        } catch (error) {
          log('reset failed', error)
        }
      }

      const slider = (key, text, format) =>
        react.createElement(
          'div',
          { style: { display: 'contents' } },
          react.createElement('span', { style: styles.label }, text),
          react.createElement('input', {
            type: 'range',
            style: styles.slider,
            min: RANGES[key][0],
            max: RANGES[key][1],
            step: 1,
            value: state[key],
            disabled: !state.enabled,
            onChange: (event) => setSetting(key, Number(event.target.value)),
          }),
          react.createElement('span', { style: styles.value }, format(state[key])),
        )

      /** One switch block: heading, explanation, checkbox, and any extra control. */
      const toggle = (key, title, description, extra) =>
        react.createElement(
          'div',
          { style: styles.group },
          react.createElement('div', { style: styles.subTitle }, title),
          react.createElement('div', { style: styles.desc }, description),
          react.createElement(
            'div',
            { style: styles.control },
            react.createElement('input', {
              type: 'checkbox',
              checked: state[key],
              onChange: (event) => setSetting(key, event.target.checked),
            }),
            react.createElement('span', { style: styles.label }, '启用'),
          ),
          extra === undefined ? null : extra,
        )

      /** Marker picker for the session rows. */
      const markerPicker = react.createElement(
        'div',
        { style: styles.control },
        react.createElement('span', { style: styles.label }, '标记'),
        react.createElement(
          'select',
          {
            style: styles.select,
            value: state.markers,
            disabled: !state.sessions,
            onChange: (event) => setSetting('markers', event.target.value),
          },
          MARKER_CHOICES.map(([value, text]) =>
            react.createElement('option', { key: value, value }, text),
          ),
        ),
      )

      return react.createElement(
        'div',
        { style: styles.row },
        react.createElement('div', { style: styles.title }, '外观皮肤'),
        react.createElement('div', { style: styles.desc }, '照片背景、品牌换色、工作区名字配色，三个开关互不影响。'),
        react.createElement(
          'div',
          { style: styles.control },
          react.createElement('input', {
            type: 'checkbox',
            checked: state.enabled,
            onChange: (event) => setSetting('enabled', event.target.checked),
          }),
          react.createElement('span', { style: styles.label }, '启用'),
          react.createElement(
            'span',
            { style: styles.desc },
            state.image === null ? '当前：内置栈桥' : '当前：自定义图片',
          ),
        ),
        react.createElement('div', { style: styles.control }, slider('glass', '不透明度', (value) => value + '%')),
        react.createElement('div', { style: styles.control }, slider('blur', '模糊', (value) => value + 'px')),
        state.hostReady === false
          ? react.createElement(
              'div',
              { style: styles.desc },
              '宿主端还没加载新代码：改动只在本页生效，重启应用后会写进配置文件。',
            )
          : null,
        react.createElement(
          'div',
          { style: styles.control },
          react.createElement('input', {
            ref: fileRef,
            type: 'file',
            accept: 'image/*',
            style: { display: 'none' },
            onChange: onPick,
          }),
          react.createElement(
            'button',
            { type: 'button', style: styles.button, onClick: () => fileRef.current?.click() },
            '选择图片…',
          ),
          react.createElement('button', { type: 'button', style: styles.button, onClick: onReset }, '恢复默认'),
          status === '' ? null : react.createElement('span', { style: styles.desc }, status),
        ),
        toggle('brand', '品牌换色', '鲸鱼改成蓝色，deepseek 字标换成横向彩虹；HARNESS 徽标不动。'),
        toggle(
          'workspaceName',
          '工作区名字',
          '左侧会话列表里的工作区名字逐个纯色，合起来是彩虹；前面的小文件夹同色。',
        ),
        toggle(
          'sessions',
          '会话标题',
          '工作区下面的会话改用等宽字体，前面加标记（默认按工作区从 1 编号），标记颜色跟工作区一致。',
          markerPicker,
        ),
      )
    }

    // --------------------------------------------------------------------- boot

    // Scene first: it has to be in place before the first paint.
    installStyles()
    paint()
    if (document.body === null) {
      document.addEventListener('DOMContentLoaded', installGradient, { once: true })
    } else {
      installGradient()
    }
    const stopWatching = watchTheme()
    const stopWatchingRows = watchWorkspaceRows()
    void sync()

    /**
     * @param ctx - Client plugin context.
     */
    function apply(ctx) {
      ctx.effect(() => () => {
        stopWatching()
        stopWatchingRows()
        document.documentElement.removeAttribute(SKIN_ATTRIBUTE)
        document.documentElement.removeAttribute(DARK_ATTRIBUTE)
        document.documentElement.removeAttribute(BRAND_ATTRIBUTE)
        document.documentElement.removeAttribute(WORKSPACE_ATTRIBUTE)
        document.documentElement.removeAttribute(SESSIONS_ATTRIBUTE)
        for (const row of document.querySelectorAll('[data-row-key^="workspace:"], [data-row-key^="session:"]')) {
          row.style.removeProperty(NAME_COLOR_PROPERTY)
          row.querySelector('[class*="_title"]')?.removeAttribute(SESSION_INDEX_ATTRIBUTE)
        }
        document.querySelector('style[data-plugin-css="' + TAG_ID + '"]')?.remove()
        document.getElementById(GRADIENT_HOLDER_ID)?.remove()
      })
      ctx.slots.inject('settings.general.item', () =>
        ctx.slots.register(
          { name: 'settings.general.item', id: 'skin', order: 12, inject: () => ({}) },
          SkinPhotoRow,
        ),
      )
    }

    exports.apply = apply
    exports.inject = ['slots']
    return module.exports
  },
})
