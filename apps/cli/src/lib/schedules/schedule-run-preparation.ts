import type {
  AgentConfigMeta,
  LocalProjectId,
  MachineMeta,
  ProjectRef,
  SessionId,
} from '@lody/shared';

import { buildProjectOptions } from '../task-automation/task-automation-start';

/**
 * The two decisions that turn a Schedule definition into one Session's inputs:
 * which selectors describe its workspace, and which target owns it.
 *
 * They are pure and separate from `schedule-workspace.ts` because this is where
 * "no project" has to hold: a chat-only schedule must reach `prepareSessionInput`
 * with no repository, local project, branch or worktree selector at all, and
 * with no `project` on the target — not with a default filled in behind it.
 */
export type ScheduleRunIdentity = {
  sessionId: SessionId;
  userTurnId: string;
  agentConfigId: string;
  title: string;
  project?: ProjectRef;
};

export function buildScheduleSessionCreateOptions(
  run: ScheduleRunIdentity
): Record<string, unknown> {
  return {
    agentConfig: run.agentConfigId,
    sessionId: run.sessionId,
    userTurnId: run.userTurnId,
    title: run.title,
    // The Schedule engine has already refreshed workspace meta for this run.
    workspaceMetaPrewriteSatisfied: true,
    ...buildProjectOptions(run.project),
  };
}

export function buildScheduleRunTarget(target: {
  targetMachine: MachineMeta;
  agentConfig: AgentConfigMeta;
  project?: ProjectRef;
}): { targetMachine: MachineMeta; agentConfig: AgentConfigMeta; project?: ProjectRef } {
  return {
    targetMachine: target.targetMachine,
    agentConfig: target.agentConfig,
    ...(target.project ? { project: target.project } : {}),
  };
}

/**
 * The local project id a run requires on its owning machine before handoff, or
 * `undefined` when there is nothing to look up.
 */
export function scheduleRequiredLocalProjectId(
  project: ProjectRef | undefined
): LocalProjectId | undefined {
  return project?.kind === 'local' ? project.localProjectId : undefined;
}
