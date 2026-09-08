import { getIpcContext, IpcMethod, IpcService } from 'electron-ipc-decorator'
import { getAppWindowContext, requireAppWindow } from '../../app-windows'
import type { ShowSessionCompletionNotificationInput } from '@lody/shared/electron-ipc'
import { getIpcServiceDeps } from '../ipc-service-deps'

function isShowSessionCompletionNotificationInput(
  payload: unknown
): payload is ShowSessionCompletionNotificationInput {
  return (
    !!payload &&
    typeof payload === 'object' &&
    typeof (payload as ShowSessionCompletionNotificationInput).sessionId === 'string' &&
    typeof (payload as ShowSessionCompletionNotificationInput).title === 'string' &&
    typeof (payload as ShowSessionCompletionNotificationInput).body === 'string'
  )
}

export class NotificationsIpc extends IpcService {
  static override readonly groupName = 'notifications'

  @IpcMethod()
  async getPermissionStatus() {
    return getIpcServiceDeps().notificationService.getPermissionStatus()
  }

  @IpcMethod()
  async openSystemSettings() {
    return await getIpcServiceDeps().notificationService.openSystemSettings()
  }

  @IpcMethod()
  async showSessionCompletion(payload: ShowSessionCompletionNotificationInput) {
    if (!isShowSessionCompletionNotificationInput(payload)) {
      return { shown: false, reason: 'invalid_payload' }
    }
    if (!getAppWindowContext(requireAppWindow(getIpcContext().event))?.backgroundOwner) {
      return { shown: false, reason: 'another_window_owns_notifications' }
    }
    return getIpcServiceDeps().notificationService.showSessionCompletion(payload)
  }
}
