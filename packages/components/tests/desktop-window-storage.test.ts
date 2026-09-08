// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import type { SessionId } from '@lody/shared';
import { setDesktopWindowContext } from '../src/lib/desktop-window-context';
import { getSessionDetailInitialTabState } from '../src/lib/session-detail-initial-state';
import { writeStoredLastActiveTabState } from '../src/lib/session-draft-tabs';
import { readLastAppRoutePath, writeLastAppRoutePath } from '../src/lib/last-app-route';

afterEach(() => {
  setDesktopWindowContext(null);
  localStorage.clear();
  sessionStorage.clear();
});

describe('auxiliary window state isolation', () => {
  it('starts on the conversation without inheriting or overwriting another window’s panels', () => {
    const id = 'synthetic-session' as SessionId;
    writeStoredLastActiveTabState(id, {
      sessionTabId: id,
      viewerTab: null,
      sidePanel: { open: true, tab: 'browser', tabs: ['browser'], sideSessionId: null },
    });
    writeLastAppRoutePath('/team/sessions/source');
    setDesktopWindowContext({
      id: 2,
      secondary: true,
      workspaceSlug: 'team',
      sessionId: id,
      backgroundOwner: false,
    });
    expect(getSessionDetailInitialTabState(id).sidePanel.open).toBe(false);
    writeStoredLastActiveTabState(id, {
      sessionTabId: id,
      viewerTab: null,
      sidePanel: { open: true, tab: 'files', tabs: ['files'], sideSessionId: null },
    });
    writeLastAppRoutePath('/team/sessions/other');
    expect(getSessionDetailInitialTabState(id).sidePanel.tab).toBe('files');
    expect(readLastAppRoutePath()).toBe('/team/sessions/source');
    setDesktopWindowContext(null);
    expect(getSessionDetailInitialTabState(id).sidePanel.tab).toBe('browser');
  });
});
