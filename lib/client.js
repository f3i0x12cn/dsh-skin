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
 * re-declared under `html[data-dsh-skin-photo]`, so switching the entry off
 * restores the native appearance exactly.
 *
 * @module dsh-skin-photo/client
 */
window.__ModuleLoader__.load({
  id: 'dsh-skin-photo',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })

    const react = require('react')

    /** Style element identity, mirroring the shipped plugins' data attributes. */
    const TAG_ID = 'dsh-skin-photo/skin.css'

    /** Root attributes: the skin switch, and the dark-theme mirror the veil reads. */
    const SKIN_ATTRIBUTE = 'data-dsh-skin-photo'
    const DARK_ATTRIBUTE = 'data-dsh-skin-photo-dark'

    /** Host routes (see `lib/index.js`). */
    const CONFIG_URL = '/dsh-skin-photo/config'
    const IMAGE_URL = '/dsh-skin-photo/image'

    /** Header the Host requires on mutations; it also forces a CORS preflight. */
    const MUTATION_HEADER = { 'x-dsh-skin-photo': '1' }

    /** Built-in background, served by the host half. */
    const DEFAULT_IMAGE = '/dsh-skin-photo/assets/bridge.webp?v=1'

    /** Tuning ranges, duplicated in the host half. */
    const DEFAULTS = { glass: 100, blur: 6, enabled: true }
    const RANGES = { glass: [0, 150], blur: [0, 24] }

    /**
     * The skin. Every surface alpha scales by `--dsh-skin-photo-glass`, which
     * the row sets inline on <html>; 1 is the tuned default.
     */
    const CSS = `
html[data-dsh-skin-photo] {
  --dsh-skin-photo-blur: 6px;
  --dsh-skin-photo-zoom: 16px;
  --dsh-skin-photo-satur: 108%;
  background-color: #0b1322;
}

/* Photo layer: fixed to the viewport so it never scrolls with the transcript. */
html[data-dsh-skin-photo]::before {
  content: '';
  position: fixed;
  inset: calc(-1 * var(--dsh-skin-photo-zoom));
  z-index: -2;
  pointer-events: none;
  background-image: var(--dsh-skin-photo-image, url("${DEFAULT_IMAGE}"));
  background-position: center center;
  background-repeat: no-repeat;
  background-size: cover;
  filter: blur(var(--dsh-skin-photo-blur)) saturate(var(--dsh-skin-photo-satur));
}

/* Veil layer: the legibility floor. Reads as light falloff, not as a flat wash. */
html[data-dsh-skin-photo]::after {
  content: '';
  position: fixed;
  inset: 0;
  z-index: -1;
  pointer-events: none;
  background-image: var(--dsh-skin-photo-veil);
}

html[data-dsh-skin-photo] {
  --dsh-skin-photo-veil:
    linear-gradient(180deg, rgb(255 255 255 / 18%), rgb(250 253 255 / 30%) 58%, rgb(243 249 255 / 44%) 100%),
    linear-gradient(90deg, rgb(255 255 255 / 40%), rgb(255 255 255 / 14%) 28%, rgb(255 255 255 / 0%) 62%, rgb(255 255 255 / 10%) 100%);
}

html[data-dsh-skin-photo][data-dsh-skin-photo-dark] {
  --dsh-skin-photo-veil:
    linear-gradient(180deg, rgb(2 6 14 / 32%), rgb(2 6 14 / 40%) 55%, rgb(1 4 10 / 56%) 100%),
    linear-gradient(90deg, rgb(1 4 10 / 50%), rgb(1 4 10 / 24%) 28%, rgb(1 4 10 / 14%) 62%, rgb(1 4 10 / 20%) 100%);
}

html[data-dsh-skin-photo] body:not([data-ds-dark-theme]) {
  --dsw-alias-bg-base: rgb(255 255 255 / calc(14% * var(--dsh-skin-photo-glass, 1)));
  --dsw-alias-bg-layer-1: rgb(255 255 255 / calc(26% * var(--dsh-skin-photo-glass, 1)));
  --dsw-alias-bg-layer-2: rgb(255 255 255 / calc(52% * var(--dsh-skin-photo-glass, 1)));
  --dsw-alias-bg-layer-3: rgb(255 255 255 / calc(74% * var(--dsh-skin-photo-glass, 1)));
  --dsw-alias-bg-module-platform: rgb(246 250 255 / calc(32% * var(--dsh-skin-photo-glass, 1)));
  --dsw-alias-bg-multi-select: rgb(246 250 255 / calc(34% * var(--dsh-skin-photo-glass, 1)));
  --dsw-alias-bg-overlay: rgb(240 246 254 / calc(58% * var(--dsh-skin-photo-glass, 1)));
  --dsw-alias-bg-document-preview: rgb(238 244 251 / calc(74% * var(--dsh-skin-photo-glass, 1)));
  --dsw-alias-bg-skeleton: rgb(255 255 255 / calc(26% * var(--dsh-skin-photo-glass, 1)));
  --dsw-alias-interactive-bg-hover: rgb(255 255 255 / calc(38% * var(--dsh-skin-photo-glass, 1)));
  --dsw-alias-interactive-bg-active: rgb(255 255 255 / calc(56% * var(--dsh-skin-photo-glass, 1)));
  --dsw-alias-markdown-code-block: rgb(244 248 253 / calc(46% * var(--dsh-skin-photo-glass, 1)));
  --dsw-specific-sidebar-fill: rgb(249 252 255 / calc(24% * var(--dsh-skin-photo-glass, 1)));
  --dsw-specific-bubble: rgb(226 240 255 / calc(52% * var(--dsh-skin-photo-glass, 1)));
  --dsw-specific-sidebar-nav-item-hover: rgb(255 255 255 / calc(34% * var(--dsh-skin-photo-glass, 1)));
  --dsw-specific-sidebar-nav-item-active: rgb(255 255 255 / calc(60% * var(--dsh-skin-photo-glass, 1)));
  --dsw-menu-surface-fill: rgb(249 251 254 / calc(78% * var(--dsh-skin-photo-glass, 1)));
  --dsw-specific-menu: rgb(249 251 254 / calc(78% * var(--dsh-skin-photo-glass, 1)));
}

html[data-dsh-skin-photo] body[data-ds-dark-theme] {
  --dsw-alias-bg-base: rgb(10 17 30 / calc(18% * var(--dsh-skin-photo-glass, 1)));
  --dsw-alias-bg-layer-1: rgb(13 21 37 / calc(32% * var(--dsh-skin-photo-glass, 1)));
  --dsw-alias-bg-layer-2: rgb(16 25 42 / calc(56% * var(--dsh-skin-photo-glass, 1)));
  --dsw-alias-bg-layer-3: rgb(20 30 49 / calc(76% * var(--dsh-skin-photo-glass, 1)));
  --dsw-alias-bg-module-platform: rgb(255 255 255 / calc(7% * var(--dsh-skin-photo-glass, 1)));
  --dsw-alias-bg-multi-select: rgb(255 255 255 / calc(8% * var(--dsh-skin-photo-glass, 1)));
  --dsw-alias-bg-overlay: rgb(8 14 26 / calc(64% * var(--dsh-skin-photo-glass, 1)));
  --dsw-alias-bg-document-preview: rgb(7 12 22 / calc(82% * var(--dsh-skin-photo-glass, 1)));
  --dsw-alias-bg-skeleton: rgb(255 255 255 / calc(7% * var(--dsh-skin-photo-glass, 1)));
  --dsw-alias-interactive-bg-hover: rgb(255 255 255 / calc(9% * var(--dsh-skin-photo-glass, 1)));
  --dsw-alias-interactive-bg-active: rgb(255 255 255 / calc(14% * var(--dsh-skin-photo-glass, 1)));
  --dsw-alias-markdown-code-block: rgb(255 255 255 / calc(7% * var(--dsh-skin-photo-glass, 1)));
  --dsw-specific-sidebar-fill: rgb(8 14 26 / calc(26% * var(--dsh-skin-photo-glass, 1)));
  --dsw-specific-bubble: rgb(38 59 94 / calc(52% * var(--dsh-skin-photo-glass, 1)));
  --dsw-specific-sidebar-nav-item-hover: rgb(255 255 255 / calc(9% * var(--dsh-skin-photo-glass, 1)));
  --dsw-specific-sidebar-nav-item-active: rgb(255 255 255 / calc(14% * var(--dsh-skin-photo-glass, 1)));
  --dsw-menu-surface-fill: rgb(11 18 32 / calc(82% * var(--dsh-skin-photo-glass, 1)));
  --dsw-specific-menu: rgb(11 18 32 / calc(82% * var(--dsh-skin-photo-glass, 1)));
}
`

    // ------------------------------------------------------------ host plumbing

    const log = (message, error) => console.warn('[dsh-skin-photo] ' + message, error)

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
      style.dataset.plugin = 'dsh-skin-photo'
      style.dataset.pluginCss = TAG_ID
      style.textContent = CSS
      document.head.appendChild(style)
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
     * Current tuning, the custom image revision, and whether the Host half
     * answered. `hostReady` is null until the first sync so the row can stay
     * quiet on a slow boot.
     */
    const state = {
      glass: DEFAULTS.glass,
      blur: DEFAULTS.blur,
      enabled: DEFAULTS.enabled,
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
      root.style.setProperty('--dsh-skin-photo-glass', String(state.glass / 100))
      root.style.setProperty('--dsh-skin-photo-blur', state.blur + 'px')
      if (state.enabled) root.setAttribute(SKIN_ATTRIBUTE, '')
      else root.removeAttribute(SKIN_ATTRIBUTE)
    }

    /** Point the photo layer at the custom image, or back at the built-in art. */
    function paintImage() {
      const root = document.documentElement
      if (state.image === null) root.style.removeProperty('--dsh-skin-photo-image')
      else root.style.setProperty('--dsh-skin-photo-image', `url("${IMAGE_URL}?v=${state.image}")`)
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

      return react.createElement(
        'div',
        { style: styles.row },
        react.createElement('div', { style: styles.title }, '背景图皮肤'),
        react.createElement('div', { style: styles.desc }, '照片背景加半透明玻璃面板，跟随应用的浅色/深色外观。'),
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
      )
    }

    // --------------------------------------------------------------------- boot

    // Scene first: it has to be in place before the first paint.
    installStyles()
    paint()
    const stopWatching = watchTheme()
    void sync()

    /**
     * @param ctx - Client plugin context.
     */
    function apply(ctx) {
      ctx.effect(() => () => {
        stopWatching()
        document.documentElement.removeAttribute(SKIN_ATTRIBUTE)
        document.documentElement.removeAttribute(DARK_ATTRIBUTE)
        document.querySelector('style[data-plugin-css="' + TAG_ID + '"]')?.remove()
      })
      ctx.slots.inject('settings.general.item', () =>
        ctx.slots.register(
          { name: 'settings.general.item', id: 'skin-photo', order: 12, inject: () => ({}) },
          SkinPhotoRow,
        ),
      )
    }

    exports.apply = apply
    exports.inject = ['slots']
    return module.exports
  },
})
