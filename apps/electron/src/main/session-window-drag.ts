import { randomUUID } from 'node:crypto'
import type { BrowserWindow, Input, Event } from 'electron'
import type { AppWindowTarget } from './app-window-target'

type Drag = { token: string; target: AppWindowTarget; cancelled: boolean; dispose(): void }
const drags = new WeakMap<BrowserWindow, Drag>()

export function beginSessionWindowDrag(window: BrowserWindow, target: AppWindowTarget): string {
  drags.get(window)?.dispose()
  const contents = window.webContents
  const onInput = (_event: Event, input: Input) => {
    if (input.key === 'Escape') drag.cancelled = true
  }
  const onClosed = () => drag.dispose()
  const drag: Drag = {
    token: randomUUID(),
    target,
    cancelled: false,
    dispose: () => {
      contents.removeListener('before-input-event', onInput)
      window.removeListener('closed', onClosed)
      drags.delete(window)
    }
  }
  drags.set(window, drag)
  window.webContents.on('before-input-event', onInput)
  window.once('closed', onClosed)
  return drag.token
}

export function finishSessionWindowDrag(
  window: BrowserWindow,
  token: string,
  released: boolean
): AppWindowTarget | null {
  const drag = drags.get(window)
  if (!drag || drag.token !== token) return null
  drag.dispose()
  return released && !drag.cancelled ? drag.target : null
}
