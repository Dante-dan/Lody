export type AppWindowTarget = {
  workspaceSlug: string
  sessionId?: string
  tabSessionId?: string
}

export function parseAppWindowTarget(raw: unknown): AppWindowTarget {
  if (!raw || typeof raw !== 'object') throw new Error('Invalid window target')
  const { workspaceSlug, sessionId, tabSessionId } = raw as Record<string, unknown>
  const valid = (value: unknown): value is string =>
    typeof value === 'string' && /^[a-zA-Z0-9_-]{1,200}$/.test(value)
  if (
    !valid(workspaceSlug) ||
    (sessionId !== undefined && !valid(sessionId)) ||
    (tabSessionId !== undefined && (!valid(tabSessionId) || !sessionId))
  ) {
    throw new Error('Invalid window target')
  }
  return {
    workspaceSlug,
    ...(sessionId === undefined ? {} : { sessionId }),
    ...(tabSessionId === undefined ? {} : { tabSessionId })
  }
}

export function appWindowPath(target: AppWindowTarget): string {
  const workspace = encodeURIComponent(target.workspaceSlug)
  return target.sessionId
    ? `/${workspace}/sessions/${encodeURIComponent(target.sessionId)}?tab=${encodeURIComponent(`session:${target.tabSessionId ?? target.sessionId}`)}`
    : `/${workspace}/chat`
}

export type WindowRect = { x: number; y: number; width: number; height: number }

export function placeAppWindow(area: WindowRect, point: { x: number; y: number }): WindowRect {
  const width = Math.min(1000, area.width)
  const height = Math.min(760, area.height)
  return {
    width,
    height,
    x: Math.max(area.x, Math.min(point.x, area.x + area.width - width)),
    y: Math.max(area.y, Math.min(point.y, area.y + area.height - height))
  }
}

export function isOutsideAppWindows(
  point: { x: number; y: number },
  bounds: WindowRect[]
): boolean {
  return bounds.every(
    (b) =>
      point.x < b.x - 16 ||
      point.y < b.y - 16 ||
      point.x > b.x + b.width + 16 ||
      point.y > b.y + b.height + 16
  )
}
