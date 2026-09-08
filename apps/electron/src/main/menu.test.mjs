import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'

// Exercise the actual menu template without launching Electron. Only native
// window/menu adapters are replaced, so the click wiring is part of the test.
const source = ts.transpileModule(readFileSync(new URL('./menu.ts', import.meta.url), 'utf8'), {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    esModuleInterop: true,
    target: ts.ScriptTarget.ES2022
  }
}).outputText
const locales = Object.fromEntries(
  ['en', 'zh_CN'].map((locale) => [
    locale,
    JSON.parse(readFileSync(new URL(`../../../../locales/${locale}.json`, import.meta.url), 'utf8'))
  ])
)

function windowFixture() {
  return {
    closed: false,
    isDestroyed() {
      return this.closed
    },
    close() {
      this.closed = true
    }
  }
}

function closeMenu(platform, primary, focused) {
  let template
  const exports = {}
  runInNewContext(source, {
    exports,
    process: { platform },
    require(id) {
      if (id === 'electron')
        return {
          app: { name: 'Lody' },
          BrowserWindow: { getFocusedWindow: () => focused },
          Menu: {
            buildFromTemplate(value) {
              template = value
              return value
            },
            setApplicationMenu() {}
          },
          shell: {}
        }
      if (id === './app-windows')
        return {
          getFocusedAppWindow: () => focused,
          getAppWindowContext: () => ({ secondary: true })
        }
      if (id === './close-focused-tab-or-window') return {}
      if (id.endsWith('/en.json')) return locales.en
      if (id.endsWith('/zh_CN.json')) return locales.zh_CN
      throw new Error(`Unexpected menu dependency: ${id}`)
    }
  })
  exports.setupApplicationMenu({
    getMainWindow: () => primary,
    openOrFocusMainWindow: () => primary,
    appUpdaterService: {}
  })
  return template
    .find((item) => item.label === locales.en['menu.window'])
    .submenu.find((item) => item.label === locales.en['menu.closeWindow'])
}

for (const platform of ['linux', 'win32']) {
  void test(`${platform}: Close Window closes its target, not the primary or another focused window`, () => {
    const primary = windowFixture()
    const target = windowFixture()
    const focused = windowFixture()
    closeMenu(platform, primary, focused).click({}, target)
    assert.equal(target.closed, true)
    assert.equal(primary.closed, false)
    assert.equal(focused.closed, false)
  })

  void test(`${platform}: missing menu target uses current focus, not primary or last focus`, () => {
    const primary = windowFixture()
    const focused = windowFixture()
    closeMenu(platform, primary, focused).click({})
    assert.equal(focused.closed, true)
    assert.equal(primary.closed, false)
    closeMenu(platform, primary, null).click({})
    assert.equal(primary.closed, false)
  })
}
