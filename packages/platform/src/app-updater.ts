import type { ReadonlyStore } from './store';

export type AppUpdaterAction = 'download' | 'install' | 'open' | 'retry';

/** Host-owned snapshot; no artifact URLs, credentials or native paths enter shared UI. */
export interface AppUpdaterState {
  phase: 'idle' | 'checking' | 'up_to_date' | 'available' | 'downloading' | 'downloaded' | 'error';
  currentVersion?: string;
  availableVersion?: string;
  /** Percentage in [0, 100]; omit when the host cannot measure progress. */
  percent?: number;
  /** The host chooses the next explicit user action, including retry after failure. */
  action?: AppUpdaterAction;
}

/** Optional capability, installed by the host before mounting shared About UI. */
export interface AppUpdaterPort {
  state: ReadonlyStore<AppUpdaterState>;
  checkForUpdates(): Promise<void>;
  /** Reject an action that no longer matches the authoritative snapshot. */
  performAction(action: AppUpdaterAction): Promise<void>;
}
