import assert from 'node:assert/strict'
import test from 'node:test'
import { EventEmitter } from 'node:events'
import { appWindowPath, parseAppWindowTarget } from './app-window-target.ts'
import { beginSessionWindowDrag, finishSessionWindowDrag } from './session-window-drag.ts'

void test('window targets name an exact internal conversation, not a restored child tab or arbitrary URL', () => {
  assert.equal(
    appWindowPath(parseAppWindowTarget({ workspaceSlug: 'lw_team', sessionId: 's_123' })),
    '/lw_team/sessions/s_123?tab=session%3As_123'
  )
  assert.equal(appWindowPath({ workspaceSlug: 'team' }), '/team/chat')
  assert.equal(
    appWindowPath(
      parseAppWindowTarget({ workspaceSlug: 'team', sessionId: 'parent', tabSessionId: 'child' })
    ),
    '/team/sessions/parent?tab=session%3Achild'
  )
  assert.throws(() => parseAppWindowTarget({ workspaceSlug: 'team', tabSessionId: 'child' }))
  for (const workspaceSlug of [
    'https://evil.test',
    '//evil.test',
    '../team',
    'team?pr=1',
    'team\\other',
    ''
  ]) {
    assert.throws(() => parseAppWindowTarget({ workspaceSlug }))
  }
  assert.throws(() => parseAppWindowTarget({ workspaceSlug: 'team', sessionId: 'a/b' }))
})

function fakeWindow() {
  const window = new EventEmitter()
  window.webContents = new EventEmitter()
  return window
}

void test('drag cancellation, accepted drops, stale tokens and replay never detach', () => {
  const window = fakeWindow()
  const target = { workspaceSlug: 'team', sessionId: 's_1' }
  const cancelled = beginSessionWindowDrag(window, target)
  window.webContents.emit('before-input-event', {}, { key: 'Escape' })
  assert.equal(finishSessionWindowDrag(window, cancelled, true), null)
  const accepted = beginSessionWindowDrag(window, target)
  assert.equal(finishSessionWindowDrag(window, accepted, false), null)
  const old = beginSessionWindowDrag(window, target)
  const current = beginSessionWindowDrag(window, target)
  assert.equal(finishSessionWindowDrag(window, old, true), null)
  assert.deepEqual(finishSessionWindowDrag(window, current, true), target)
  assert.equal(finishSessionWindowDrag(window, current, true), null)
  const closed = beginSessionWindowDrag(window, target)
  window.emit('closed')
  assert.equal(finishSessionWindowDrag(window, closed, true), null)
})
