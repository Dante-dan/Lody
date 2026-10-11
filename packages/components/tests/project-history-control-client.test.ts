import { describe, expect, it, vi } from 'vitest';

import {
  autoImportAvailableProjectHistory,
  canAutoImportCodexProjectHistory,
  importProjectHistoryForLocalProject,
} from '../src/lib/project-history-control-client';
import type { WorkspaceRuntime } from '../src/atoms/runtime';
import type {
  AgentConfigId,
  LocalProjectControlRequest,
  LocalProjectControlResponse,
  LocalProjectHistoryCatalogResult,
  LocalProjectHistoryImportResult,
  LocalProjectId,
  MachineId,
  WorkspaceId,
} from '@lody/shared';

describe('Codex automatic history admission', () => {
  const config = {
    id: 'native-codex' as AgentConfigId,
    machineId: 'local' as MachineId,
    cliType: 'builtin' as const,
    agentType: 'codex',
  };
  const args = {
    config,
    provider: { cliType: 'builtin' as const, agentType: 'codex', agentConfigId: config.id },
    machineId: config.machineId,
    localMachineId: config.machineId,
    isElectron: true,
  };

  it('admits only the explicitly selected local native Codex Provider', () => {
    expect(canAutoImportCodexProjectHistory(args)).toBe(true);
    expect(canAutoImportCodexProjectHistory({ ...args, isElectron: false })).toBe(false);
    expect(canAutoImportCodexProjectHistory({ ...args, localMachineId: null })).toBe(false);
    expect(canAutoImportCodexProjectHistory({ ...args, config: undefined })).toBe(false);
    expect(
      canAutoImportCodexProjectHistory({
        ...args,
        provider: { ...args.provider, agentConfigId: undefined },
      })
    ).toBe(false);
    expect(
      canAutoImportCodexProjectHistory({ ...args, config: { ...config, agentType: 'claude' } })
    ).toBe(false);
    expect(
      canAutoImportCodexProjectHistory({
        ...args,
        config: {
          ...config,
          codexAuth: { mode: 'chatgpt', profileId: '00000000-0000-0000-0000-000000000001' },
        },
      })
    ).toBe(false);
  });

  it('imports available chats while preserving imported and conflicting sessions', async () => {
    const catalog: LocalProjectHistoryCatalogResult = {
      listed: 4,
      lastListedAt: 1,
      sessions: [
        { acpSessionId: 'new', title: 'New', status: 'available' },
        { acpSessionId: 'legacy', title: 'Legacy' },
        { acpSessionId: 'existing', title: 'Existing', status: 'imported' },
        { acpSessionId: 'conflict', title: 'Conflict', status: 'sync_conflict' },
      ],
    };
    const { runtime } = makeRuntime((request) =>
      makeImportResult(
        { imported: request.acpSessionIds.length },
        {
          ...catalog,
          sessions: catalog.sessions.map((session) =>
            request.acpSessionIds.includes(session.acpSessionId)
              ? { ...session, status: 'imported' }
              : session
          ),
        }
      )
    );
    const result = await autoImportAvailableProjectHistory({ ...baseArgs, runtime }, catalog);
    expect(result?.summary.imported).toBe(2);
    expect(
      result?.catalog.sessions.map((session) => [session.acpSessionId, session.status])
    ).toEqual([
      ['new', 'imported'],
      ['legacy', 'imported'],
      ['existing', 'imported'],
      ['conflict', 'sync_conflict'],
    ]);
  });

  it('keeps completed batches and stops admitting work after consent is revoked', async () => {
    let enabled = true;
    const catalog: LocalProjectHistoryCatalogResult = {
      listed: 7,
      lastListedAt: 1,
      sessions: Array.from({ length: 7 }, (_, id) => ({
        acpSessionId: String(id),
        title: String(id),
        status: 'available',
      })),
    };
    const { runtime } = makeRuntime((request) =>
      makeImportResult(
        { imported: request.acpSessionIds.length },
        {
          ...catalog,
          sessions: catalog.sessions.map((session) =>
            request.acpSessionIds.includes(session.acpSessionId)
              ? { ...session, status: 'imported' }
              : session
          ),
        }
      )
    );
    const result = await autoImportAvailableProjectHistory(
      {
        ...baseArgs,
        runtime,
        shouldContinue: () => enabled,
        onBatchComplete: () => {
          enabled = false;
        },
      },
      catalog
    );
    expect(result?.summary.imported).toBe(5);
    expect(
      result?.catalog.sessions
        .filter((session) => session.status === 'available')
        .map((session) => session.acpSessionId)
    ).toEqual(['5', '6']);
    expect(
      await autoImportAvailableProjectHistory(
        { ...baseArgs, runtime, shouldContinue: () => false },
        catalog
      )
    ).toBeNull();
  });
});

function makeCatalog(listed: number): LocalProjectHistoryCatalogResult {
  return { listed, lastListedAt: listed, sessions: [] };
}

function makeImportResult(
  overrides: Partial<LocalProjectHistoryImportResult['summary']>,
  catalog: LocalProjectHistoryCatalogResult
): LocalProjectHistoryImportResult {
  return {
    summary: {
      listed: 0,
      imported: 0,
      refreshed: 0,
      skipped: 0,
      conflicted: 0,
      failed: 0,
      failures: [],
      ...overrides,
    },
    catalog,
  };
}

function makeRuntime(
  handler: (
    request: Extract<LocalProjectControlRequest, { type: 'local-project/import-history' }>
  ) => LocalProjectHistoryImportResult
): { runtime: WorkspaceRuntime; calls: string[][] } {
  const calls: string[][] = [];
  const requestLocalProjectControl = vi.fn(
    async (request: LocalProjectControlRequest): Promise<LocalProjectControlResponse | null> => {
      if (request.type !== 'local-project/import-history') {
        throw new Error(`unexpected request type: ${request.type}`);
      }
      calls.push(request.acpSessionIds);
      return {
        ok: true,
        type: 'local-project/import-history',
        result: handler(request),
      };
    }
  );
  const runtime = { requestLocalProjectControl } as unknown as WorkspaceRuntime;
  return { runtime, calls };
}

const baseArgs = {
  provider: 'claude-code' as never,
  localMachineId: 'machine-1' as MachineId,
  machineId: 'machine-1' as MachineId,
  workspaceId: 'workspace-1' as WorkspaceId,
  localProjectId: 'project-1' as LocalProjectId,
  requestedByUserId: 'user-1',
};

describe('importProjectHistoryForLocalProject batching', () => {
  it('splits the selection into batches of at most 5 RPC calls', async () => {
    const ids = Array.from({ length: 12 }, (_, i) => `session-${i}`);
    const { runtime, calls } = makeRuntime((request) =>
      makeImportResult(
        { imported: request.acpSessionIds.length },
        makeCatalog(request.acpSessionIds.length)
      )
    );

    await importProjectHistoryForLocalProject({ ...baseArgs, runtime, acpSessionIds: ids });

    expect(calls.map((batch) => batch.length)).toEqual([5, 5, 2]);
    expect(calls.flat()).toEqual(ids);
  });

  it('merges per-batch summaries and keeps the last catalog', async () => {
    const ids = Array.from({ length: 7 }, (_, i) => `session-${i}`);
    let call = 0;
    const { runtime } = makeRuntime((request) => {
      call += 1;
      // First batch: all imported. Second batch: one failure + one refreshed.
      if (call === 1) {
        return makeImportResult({ imported: 5 }, makeCatalog(100));
      }
      return makeImportResult(
        {
          refreshed: 1,
          failed: 1,
          failures: [{ acpSessionId: request.acpSessionIds[1] ?? 'x', message: 'boom' }],
        },
        makeCatalog(200)
      );
    });

    const result = await importProjectHistoryForLocalProject({
      ...baseArgs,
      runtime,
      acpSessionIds: ids,
    });

    expect(result.summary.imported).toBe(5);
    expect(result.summary.refreshed).toBe(1);
    expect(result.summary.failed).toBe(1);
    expect(result.summary.failures).toHaveLength(1);
    // Last batch's catalog wins (it is the most complete snapshot).
    expect(result.catalog.listed).toBe(200);
  });

  it('reports cumulative progress after each batch', async () => {
    const ids = Array.from({ length: 7 }, (_, i) => `session-${i}`);
    const { runtime } = makeRuntime((request) =>
      makeImportResult({ imported: request.acpSessionIds.length }, makeCatalog(0))
    );

    const progress: Array<{ completed: number; total: number; imported: number }> = [];
    await importProjectHistoryForLocalProject({
      ...baseArgs,
      runtime,
      acpSessionIds: ids,
      onBatchComplete: (cumulative, p) => {
        progress.push({ ...p, imported: cumulative.summary.imported });
      },
    });

    expect(progress).toEqual([
      { completed: 5, total: 7, imported: 5 },
      { completed: 7, total: 7, imported: 7 },
    ]);
  });

  it('dedupes selected ids before batching', async () => {
    const { runtime, calls } = makeRuntime((request) =>
      makeImportResult({ imported: request.acpSessionIds.length }, makeCatalog(0))
    );

    await importProjectHistoryForLocalProject({
      ...baseArgs,
      runtime,
      acpSessionIds: ['a', 'a', 'b', 'b', 'b'],
    });

    expect(calls).toEqual([['a', 'b']]);
  });
});
