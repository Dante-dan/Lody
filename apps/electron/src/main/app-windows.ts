import { BrowserWindow, type IpcMainInvokeEvent } from 'electron'
import type { AppWindowTarget } from './app-window-target'

export type AppWindowContext = {
  id: number
  secondary: boolean
  workspaceSlug: string | null
  sessionId?: string
  tabSessionId?: string
  backgroundOwner: boolean
}

const windows = new Map<BrowserWindow, AppWindowContext>()
let lastFocused: BrowserWindow | null = null

export function appWindows(): BrowserWindow[] {
  return [...windows.keys()].filter((window) => !window.isDestroyed())
}

export function getAppWindowContext(window: BrowserWindow): AppWindowContext | undefined {
  return windows.get(window)
}

function publishOwners(): void {
  const owners = new Set<string>()
  for (const [window, context] of windows) {
    const slug = context.workspaceSlug
    context.backgroundOwner = slug !== null && !owners.has(slug)
    if (slug) owners.add(slug)
    if (!window.isDestroyed()) window.webContents.send('app.windowContext', context)
  }
}

export function registerAppWindow(window: BrowserWindow, target?: AppWindowTarget): void {
  windows.set(window, {
    id: window.id,
    secondary: Boolean(target),
    workspaceSlug: target?.workspaceSlug ?? null,
    sessionId: target?.sessionId,
    tabSessionId: target?.tabSessionId,
    backgroundOwner: false
  })
  window.on('focus', () => {
    lastFocused = window
  })
  window.once('closed', () => {
    windows.delete(window)
    if (lastFocused === window) lastFocused = null
    publishOwners()
  })
  publishOwners()
}

export function updateAppWindowWorkspace(window: BrowserWindow, slug: string | null): void {
  const context = windows.get(window)
  if (!context || context.workspaceSlug === slug) return
  context.workspaceSlug = slug
  publishOwners()
}

export function getFocusedAppWindow(): BrowserWindow | null {
  const focused = BrowserWindow.getFocusedWindow()
  if (focused && windows.has(focused)) return focused
  return lastFocused && !lastFocused.isDestroyed() ? lastFocused : null
}

export function requireAppWindow(event: IpcMainInvokeEvent): BrowserWindow {
  const window = BrowserWindow.fromWebContents(event.sender)
  if (!window || !windows.has(window) || event.senderFrame !== event.sender.mainFrame) {
    throw new Error('Untrusted app window')
  }
  return window
}
