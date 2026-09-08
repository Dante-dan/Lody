import { getIpcContext, IpcMethod, IpcService } from 'electron-ipc-decorator'
import {
  ElectronAuthCallbackInputSchema,
  ElectronDevEmailPasswordSignInInputSchema,
  type ElectronAuthCallbackInput,
  type ElectronDevEmailPasswordSignInInput
} from '@lody/shared/electron-ipc'
import { assertMainWindowSender } from '../assert-sender'
import { getIpcServiceDeps } from '../ipc-service-deps'
import {
  appWindows,
  getAppWindowContext,
  requireAppWindow,
  updateAppWindowWorkspace
} from '../../app-windows'

function assertAuthSender(): void {
  const { event } = getIpcContext()
  assertMainWindowSender(event, getIpcServiceDeps().getMainWindow)
}

export class AuthIpc extends IpcService {
  static override readonly groupName = 'auth'

  @IpcMethod()
  async completeCallback(payload: ElectronAuthCallbackInput) {
    assertAuthSender()
    const input = ElectronAuthCallbackInputSchema.parse(payload)
    return await getIpcServiceDeps().authService.completeCallback(input)
  }

  @IpcMethod()
  async signInWithDevEmailPassword(payload: ElectronDevEmailPasswordSignInInput) {
    assertAuthSender()
    const input = ElectronDevEmailPasswordSignInInputSchema.parse(payload)
    return await getIpcServiceDeps().authService.signInWithDevEmailPassword(input)
  }

  @IpcMethod()
  async signOut() {
    assertAuthSender()
    const source = requireAppWindow(getIpcContext().event)
    await getIpcServiceDeps().authService.signOut()
    for (const window of appWindows()) if (window !== source) window.destroy()
    updateAppWindowWorkspace(source, null)
  }

  @IpcMethod()
  async getSession(options?: unknown) {
    assertAuthSender()
    return await getIpcServiceDeps().authService.getSession(options)
  }

  @IpcMethod()
  async listOrganizations(options?: unknown) {
    assertAuthSender()
    return await getIpcServiceDeps().authService.listOrganizations(options)
  }

  @IpcMethod()
  async getActiveOrganization(options?: unknown) {
    assertAuthSender()
    const slug = getAppWindowContext(requireAppWindow(getIpcContext().event))?.workspaceSlug
    return await getIpcServiceDeps().authService.getActiveOrganization(
      options,
      slug ? { organizationSlug: slug } : undefined
    )
  }

  @IpcMethod()
  async changeEmail(payload: unknown) {
    assertAuthSender()
    return await getIpcServiceDeps().authService.changeEmail(payload)
  }

  @IpcMethod()
  async listAccounts(options?: unknown) {
    assertAuthSender()
    return await getIpcServiceDeps().authService.listAccounts(options)
  }

  @IpcMethod()
  async updateUser(payload: unknown) {
    assertAuthSender()
    return await getIpcServiceDeps().authService.updateUser(payload)
  }

  @IpcMethod()
  async changePassword(payload: unknown) {
    assertAuthSender()
    return await getIpcServiceDeps().authService.changePassword(payload)
  }

  @IpcMethod()
  async requestPasswordReset(payload: unknown) {
    assertAuthSender()
    return await getIpcServiceDeps().authService.requestPasswordReset(payload)
  }

  @IpcMethod()
  async convexToken(options?: unknown) {
    assertAuthSender()
    return await getIpcServiceDeps().authService.convexToken(options)
  }

  @IpcMethod()
  async crossDomainVerifyOneTimeToken(payload: unknown) {
    assertAuthSender()
    return await getIpcServiceDeps().authService.crossDomainVerifyOneTimeToken(payload)
  }

  @IpcMethod()
  async getInvitation(payload: unknown) {
    assertAuthSender()
    return await getIpcServiceDeps().authService.organizationGetInvitation(payload)
  }

  @IpcMethod()
  async acceptInvitation(payload: unknown) {
    assertAuthSender()
    return await getIpcServiceDeps().authService.organizationAcceptInvitation(payload)
  }

  @IpcMethod()
  async listInvitations(payload?: unknown) {
    assertAuthSender()
    return await getIpcServiceDeps().authService.organizationListInvitations(payload)
  }

  @IpcMethod()
  async inviteMember(payload: unknown) {
    assertAuthSender()
    return await getIpcServiceDeps().authService.organizationInviteMember(payload)
  }

  @IpcMethod()
  async cancelInvitation(payload: unknown) {
    assertAuthSender()
    return await getIpcServiceDeps().authService.organizationCancelInvitation(payload)
  }

  @IpcMethod()
  async removeMember(payload: unknown) {
    assertAuthSender()
    return await getIpcServiceDeps().authService.organizationRemoveMember(payload)
  }

  @IpcMethod()
  async updateMemberRole(payload: unknown) {
    assertAuthSender()
    return await getIpcServiceDeps().authService.organizationUpdateMemberRole(payload)
  }

  @IpcMethod()
  async setActive(payload: unknown) {
    assertAuthSender()
    const source = requireAppWindow(getIpcContext().event)
    const organizationId =
      payload && typeof payload === 'object' && 'organizationId' in payload
        ? payload.organizationId
        : null
    if (typeof organizationId !== 'string' || !organizationId)
      throw new Error('Invalid organization id')
    const result = await getIpcServiceDeps().authService.getActiveOrganization(payload, {
      organizationId
    })
    if (result.data && !Array.isArray(result.data) && result.data.slug && !result.error)
      updateAppWindowWorkspace(source, result.data.slug)
    return result
  }

  @IpcMethod()
  async updateOrganization(payload: unknown) {
    assertAuthSender()
    return await getIpcServiceDeps().authService.organizationUpdate(payload)
  }

  @IpcMethod()
  async createOrganization(payload: unknown) {
    assertAuthSender()
    return await getIpcServiceDeps().authService.organizationCreate(payload)
  }

  @IpcMethod()
  async deleteOrganization(payload: unknown) {
    assertAuthSender()
    return await getIpcServiceDeps().authService.organizationDelete(payload)
  }

  @IpcMethod()
  async leaveOrganization(payload: unknown) {
    assertAuthSender()
    return await getIpcServiceDeps().authService.organizationLeave(payload)
  }
}
