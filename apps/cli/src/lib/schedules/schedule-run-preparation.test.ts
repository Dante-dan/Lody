import { describe, expect, it } from 'vitest';
import type { AgentConfigMeta, MachineMeta, ProjectRef, SessionId } from '@lody/shared';

import {
  buildScheduleRunTarget,
  buildScheduleSessionCreateOptions,
  scheduleRequiredLocalProjectId,
} from './schedule-run-preparation';

const run = (project?: ProjectRef) => ({
  sessionId: 'session' as SessionId,
  userTurnId: 'turn',
  agentConfigId: 'agent',
  title: 'Daily review',
  project,
});

/** Every selector that can put a run in a working directory. */
const WORKSPACE_SELECTORS = ['repo', 'branch', 'localProject', 'worktree'] as const;

const machine = { id: 'machine', ownerUserId: 'owner' } as unknown as MachineMeta;
const agentConfig = { id: 'agent', machineId: 'machine' } as unknown as AgentConfigMeta;

describe('Session inputs for one scheduled run', () => {
  it('carries a GitHub project onto the create selectors', () => {
    expect(
      buildScheduleSessionCreateOptions(
        run({ kind: 'github', repoFullName: 'loro-dev/lody', branch: 'main' })
      )
    ).toMatchObject({ repo: 'loro-dev/lody', branch: 'main' });
  });

  it('carries a local project and its worktree choice', () => {
    expect(
      buildScheduleSessionCreateOptions(
        run({ kind: 'local', localProjectId: 'p1' as never, useWorktree: true })
      )
    ).toMatchObject({ localProject: 'p1', worktree: true });
    expect(
      buildScheduleSessionCreateOptions(
        run({ kind: 'local', localProjectId: 'p1' as never, useWorktree: false })
      )
    ).not.toHaveProperty('worktree');
  });

  it('sends no workspace selector at all for a chat-only run', () => {
    const options = buildScheduleSessionCreateOptions(run());
    for (const selector of WORKSPACE_SELECTORS) expect(options).not.toHaveProperty(selector);
    // The rest of the run identity is still there, so this is "no project",
    // not "no options".
    expect(options).toEqual({
      agentConfig: 'agent',
      sessionId: 'session',
      userTurnId: 'turn',
      title: 'Daily review',
      workspaceMetaPrewriteSatisfied: true,
    });
  });

  it('freezes the identity the engine planned, not a fresh one', () => {
    expect(buildScheduleSessionCreateOptions(run())).toMatchObject({
      sessionId: 'session',
      userTurnId: 'turn',
      agentConfig: 'agent',
    });
  });
});

describe('Target for one scheduled run', () => {
  it('omits the project key entirely for a chat-only run', () => {
    const target = buildScheduleRunTarget({ targetMachine: machine, agentConfig });
    expect(Object.keys(target).sort()).toEqual(['agentConfig', 'targetMachine']);
    expect('project' in target).toBe(false);
  });

  it('passes a chosen project through unchanged', () => {
    const project: ProjectRef = { kind: 'github', repoFullName: 'loro-dev/lody', branch: 'main' };
    expect(buildScheduleRunTarget({ targetMachine: machine, agentConfig, project })).toEqual({
      targetMachine: machine,
      agentConfig,
      project,
    });
  });
});

describe('What a run requires from the owning machine', () => {
  it('asks for a local project ledger entry only when one was chosen', () => {
    expect(scheduleRequiredLocalProjectId(undefined)).toBeUndefined();
    expect(
      scheduleRequiredLocalProjectId({
        kind: 'github',
        repoFullName: 'loro-dev/lody',
        branch: 'main',
      })
    ).toBeUndefined();
    expect(scheduleRequiredLocalProjectId({ kind: 'local', localProjectId: 'p1' as never })).toBe(
      'p1'
    );
  });
});
