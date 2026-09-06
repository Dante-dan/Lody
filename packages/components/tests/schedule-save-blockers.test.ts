import { beforeAll, describe, expect, it } from 'vitest';
import i18next, { type TFunction } from 'i18next';
import { CURRENT_MACHINE_PROTOCOL_CAPABILITIES } from '@lody/shared';
import en from '../../../locales/en.json';
import {
  collectScheduleSaveBlockers,
  type ScheduleSaveContext,
} from '../src/components/schedules/schedule-save-blockers';

let t: TFunction;
beforeAll(async () => {
  t = await i18next.createInstance({ lng: 'en', resources: { en: { translation: en } } }).init();
});

const agentConfig = {
  id: 'agent',
  machineId: 'machine',
  name: 'Code reviewer',
  cliType: 'claude',
  agentType: 'claude',
} as unknown as ScheduleSaveContext['agentConfig'];

const machine = {
  id: 'machine',
  ownerUserId: 'owner',
  protocolCapabilities: CURRENT_MACHINE_PROTOCOL_CAPABILITIES,
  acpCapabilities: {
    agent: {
      modes: [{ id: 'safe', name: 'Ask each time' }],
      configOptions: [],
    },
  },
} as unknown as ScheduleSaveContext['machine'];

const ready = (overrides: Partial<ScheduleSaveContext> = {}): ScheduleSaveContext => ({
  workspaceReady: true,
  userId: 'owner',
  agent: { agentConfigId: 'agent' as never, modeId: 'safe' },
  agentConfig,
  machine,
  project: null,
  machineLocalProjectIds: new Set(),
  ...overrides,
});

describe('what stops a schedule from being saved', () => {
  it('does not require a project — a chat-only schedule is complete', () => {
    expect(collectScheduleSaveBlockers(ready(), t)).toEqual([]);
  });

  it('still requires an Agent with an explicit permission mode', () => {
    expect(collectScheduleSaveBlockers(ready({ agent: null, agentConfig: null }), t)).toContain(
      en['schedules.requireAgent']
    );
    expect(
      collectScheduleSaveBlockers(ready({ agent: { agentConfigId: 'agent' as never } }), t)
    ).toContain(en['schedules.choosePermission']);
  });

  it('still requires an owned machine that supports schedules', () => {
    expect(collectScheduleSaveBlockers(ready({ machine: undefined }), t)).toContain(
      en['schedules.machineMissing']
    );
    expect(
      collectScheduleSaveBlockers(
        ready({ machine: { ...machine!, ownerUserId: 'somebody-else' } }),
        t
      )
    ).toContain(en['schedules.requireOwnedMachine']);
    expect(
      collectScheduleSaveBlockers(ready({ machine: { ...machine!, protocolCapabilities: {} } }), t)
    ).toContain(en['schedules.upgrade']);
  });

  it('requires a chosen local project to exist on the target machine', () => {
    const project = { kind: 'local', localProjectId: 'p1' } as ScheduleSaveContext['project'];
    expect(collectScheduleSaveBlockers(ready({ project }), t)).toContain(
      en['schedules.projectMachine']
    );
    expect(
      collectScheduleSaveBlockers(ready({ project, machineLocalProjectIds: new Set(['p1']) }), t)
    ).toEqual([]);
  });

  it('accepts a GitHub project without a machine-local check', () => {
    expect(
      collectScheduleSaveBlockers(
        ready({ project: { kind: 'github', repoFullName: 'loro-dev/lody', branch: 'main' } }),
        t
      )
    ).toEqual([]);
  });

  it('leads with the read-only reason and waits for the workspace', () => {
    expect(collectScheduleSaveBlockers(ready({ disabledReason: 'read only' }), t)[0]).toBe(
      'read only'
    );
    expect(collectScheduleSaveBlockers(ready({ workspaceReady: false }), t)).toContain(
      en['schedules.workspaceNotReady']
    );
  });
});
