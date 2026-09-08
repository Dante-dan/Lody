import { getIpcContext, IpcMethod, IpcService } from 'electron-ipc-decorator'
import {
  ElectronPublicBrowserBoundsInputSchema,
  ElectronPublicBrowserCreateInputSchema,
  ElectronPublicBrowserIdInputSchema,
  ElectronPublicBrowserNavigateInputSchema,
  ElectronPublicBrowserVisibilityInputSchema,
  type ElectronPublicBrowserBoundsInput,
  type ElectronPublicBrowserCreateInput,
  type ElectronPublicBrowserIdInput,
  type ElectronPublicBrowserNavigateInput,
  type ElectronPublicBrowserVisibilityInput
} from '@lody/shared/electron-ipc'
import { getIpcServiceDeps } from '../ipc-service-deps'
import type { BrowserWindow } from 'electron'
import { PublicBrowserService } from '../../services/public-browser-service'
import { requireAppWindow } from '../../app-windows'

const windowServices = new WeakMap<BrowserWindow, PublicBrowserService>()
function getWindowBrowserService(): PublicBrowserService {
  const window = requireAppWindow(getIpcContext().event)
  if (window === getIpcServiceDeps().getMainWindow())
    return getIpcServiceDeps().publicBrowserService
  let service = windowServices.get(window)
  if (!service) {
    service = new PublicBrowserService(() => window)
    windowServices.set(window, service)
    const owned = service
    window.once('closed', () => owned.destroyAll())
  }
  return service
}

function assertTrustedSender(): void {
  requireAppWindow(getIpcContext().event)
}

export class PublicBrowserIpc extends IpcService {
  static override readonly groupName = 'publicBrowser'

  @IpcMethod()
  async create(raw: ElectronPublicBrowserCreateInput) {
    assertTrustedSender()
    const input = ElectronPublicBrowserCreateInputSchema.parse(raw)
    return getWindowBrowserService().create(input.browserId, input.bounds)
  }

  @IpcMethod()
  async navigate(raw: ElectronPublicBrowserNavigateInput) {
    assertTrustedSender()
    const input = ElectronPublicBrowserNavigateInputSchema.parse(raw)
    return await getWindowBrowserService().navigate(input.browserId, input.url)
  }

  @IpcMethod()
  async back(raw: ElectronPublicBrowserIdInput) {
    assertTrustedSender()
    const input = ElectronPublicBrowserIdInputSchema.parse(raw)
    return getWindowBrowserService().goBack(input.browserId)
  }

  @IpcMethod()
  async forward(raw: ElectronPublicBrowserIdInput) {
    assertTrustedSender()
    const input = ElectronPublicBrowserIdInputSchema.parse(raw)
    return getWindowBrowserService().goForward(input.browserId)
  }

  @IpcMethod()
  async reload(raw: ElectronPublicBrowserIdInput) {
    assertTrustedSender()
    const input = ElectronPublicBrowserIdInputSchema.parse(raw)
    return getWindowBrowserService().reload(input.browserId)
  }

  @IpcMethod()
  async stop(raw: ElectronPublicBrowserIdInput) {
    assertTrustedSender()
    const input = ElectronPublicBrowserIdInputSchema.parse(raw)
    return getWindowBrowserService().stop(input.browserId)
  }

  @IpcMethod()
  async setBounds(raw: ElectronPublicBrowserBoundsInput) {
    assertTrustedSender()
    const input = ElectronPublicBrowserBoundsInputSchema.parse(raw)
    return getWindowBrowserService().setBounds(input.browserId, input.bounds)
  }

  @IpcMethod()
  async setVisible(raw: ElectronPublicBrowserVisibilityInput) {
    assertTrustedSender()
    const input = ElectronPublicBrowserVisibilityInputSchema.parse(raw)
    return getWindowBrowserService().setVisible(input.browserId, input.visible)
  }

  @IpcMethod()
  async destroy(raw: ElectronPublicBrowserIdInput) {
    assertTrustedSender()
    const input = ElectronPublicBrowserIdInputSchema.parse(raw)
    return getWindowBrowserService().destroy(input.browserId)
  }
}
