import { Notification, shell, systemPreferences, type BrowserWindow } from 'electron'
import type {
  GetNotificationPermissionStatusResult,
  NotificationPermissionState,
  OpenSystemNotificationSettingsResult,
  ShowSessionCompletionNotificationInput,
  ShowSessionCompletionNotificationResult
} from '../types'
import { formatUnknownError } from '../utils'
import { appWindows, getAppWindowContext } from '../app-windows'

function getNotificationSettingsUrls(platform: NodeJS.Platform): string[] {
  if (platform === 'darwin') {
    return [
      'x-apple.systempreferences:com.apple.Notifications-Settings.extension',
      'x-apple.systempreferences:com.apple.preference.notifications'
    ]
  }
  if (platform === 'win32') {
    return ['ms-settings:notifications']
  }
  return []
}

function normalizeNotificationAuthorizationStatus(
  authorizationStatus: string | undefined
): NotificationPermissionState {
  if (!authorizationStatus) {
    return 'default'
  }

  const normalized = authorizationStatus.toLowerCase()
  if (normalized === 'authorized' || normalized === 'granted') {
    return 'granted'
  }
  if (normalized === 'denied' || normalized === 'restricted') {
    return 'denied'
  }
  return 'default'
}

function focusWindow(window: BrowserWindow): void {
  if (window.isMinimized()) {
    window.restore()
  }
  if (!window.isVisible()) {
    window.show()
  }
  window.focus()
}

export class NotificationService {
  constructor(private readonly getMainWindow: () => BrowserWindow | null) {}

  getPermissionStatus(): GetNotificationPermissionStatusResult {
    const supported = Notification.isSupported()
    if (!supported) {
      return { supported: false, permission: 'default', source: 'renderer' }
    }

    const maybeGetter = (
      systemPreferences as unknown as {
        getNotificationSettings?: () => {
          authorizationStatus?: string
        }
      }
    ).getNotificationSettings

    if (typeof maybeGetter === 'function') {
      try {
        const settings = maybeGetter.call(systemPreferences)
        const permission = normalizeNotificationAuthorizationStatus(settings?.authorizationStatus)
        return {
          supported: true,
          permission,
          source: 'system'
        }
      } catch (error) {
        return {
          supported: true,
          permission: 'default',
          source: 'system',
          error: formatUnknownError(error)
        }
      }
    }

    return {
      supported: true,
      permission: 'default',
      source: 'renderer'
    }
  }

  async openSystemSettings(): Promise<OpenSystemNotificationSettingsResult> {
    const platform = process.platform
    const urls = getNotificationSettingsUrls(platform)
    if (urls.length === 0) {
      return {
        opened: false,
        platform,
        error: `Unsupported platform: ${platform}`
      }
    }

    let lastError: string | undefined
    for (const target of urls) {
      try {
        await shell.openExternal(target)
        return { opened: true, platform, target }
      } catch (error) {
        lastError = formatUnknownError(error)
      }
    }

    return {
      opened: false,
      platform,
      error: lastError ?? 'Failed to open system notification settings'
    }
  }

  showSessionCompletion(
    input: ShowSessionCompletionNotificationInput
  ): ShowSessionCompletionNotificationResult {
    if (!Notification.isSupported()) {
      return { shown: false, reason: 'notification_not_supported' }
    }

    const title = input.title.trim()
    const body = input.body.trim()
    if (!title || !body) {
      return { shown: false, reason: 'title_or_body_empty' }
    }

    const notification = new Notification({
      title,
      body
    })

    notification.on('click', () => {
      const matching = appWindows().find((window) => {
        const url = new URL(window.webContents.getURL())
        const path = url.protocol === 'file:' ? url.hash.slice(1) : url.pathname + url.search
        return path.split('?')[0] === `/${input.workspaceSlug}/sessions/${input.sessionId}`
      })
      const mainWindow =
        matching ??
        appWindows().find((window) => {
          const context = getAppWindowContext(window)
          return context?.backgroundOwner && context.workspaceSlug === input.workspaceSlug
        }) ??
        this.getMainWindow()
      if (!mainWindow || mainWindow.isDestroyed()) {
        return
      }

      focusWindow(mainWindow)
      const contents = mainWindow.webContents
      if (!contents || contents.isDestroyed()) {
        return
      }

      contents.send('app.sessionCompletionClick', {
        sessionId: input.sessionId,
        workspaceSlug: input.workspaceSlug
      })
    })

    try {
      notification.show()
    } catch (error) {
      return { shown: false, reason: formatUnknownError(error) }
    }

    return { shown: true }
  }
}
