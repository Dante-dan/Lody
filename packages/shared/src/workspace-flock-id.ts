import type { WorkspaceId } from './ids';

export const WORKSPACE_FLOCK_DOC_STREAM_SEGMENT = 'wf';
const WORKSPACE_FLOCK_DOC_NAME = 'workspace';

export const getWorkspaceFlockDocId = (workspaceId: WorkspaceId): string =>
  `${workspaceId}:${WORKSPACE_FLOCK_DOC_STREAM_SEGMENT}:${WORKSPACE_FLOCK_DOC_NAME}`;
