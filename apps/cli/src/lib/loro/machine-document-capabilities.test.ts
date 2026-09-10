import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  type AgentConfigId,
  type MachineFlockKey,
  type MachineFlockWritableFlock,
  type MachineId,
  type MachineRateLimit,
  getMachineFlockRateLimits,
  machineFlockKeys,
  readMachineFlockRowsFromFlock,
  type WorkspaceId,
} from '@lody/shared';
import type { LoroRepo } from 'loro-repo';
import { MachineDocument } from './doc';

class FakeMachineFlock implements MachineFlockWritableFlock {
  readonly rows = new Map<string, { key: MachineFlockKey; value: unknown }>();
  commits = 0;

  scan(options?: { prefix?: readonly unknown[] }) {
    return [...this.rows.values()].filter((row) =>
      options?.prefix ? options.prefix.every((part, index) => row.key[index] === part) : true
    );
  }

  set(key: MachineFlockKey, value: unknown): void {
    this.rows.set(JSON.stringify(key), { key: [...key] as MachineFlockKey, value });
  }

  delete(key: MachineFlockKey): void {
    this.rows.delete(JSON.stringify(key));
  }

  commit(): void {
    this.commits += 1;
  }
}

afterEach(() => {
  vi.useRealTimers();
});

describe('MachineDocument ACP capabilities', () => {
  it('does not write or sync when only the fetch time changed', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-15T00:00:00.000Z'));
    const flock = new FakeMachineFlock();
    const flush = vi.fn(async () => undefined);
    const syncOnce = vi.fn(async () => undefined);
    const markDirty = vi.fn();
    const repo = {
      openFlockDoc: vi.fn(async () => ({ flock, syncOnce })),
      flush,
    } as unknown as LoroRepo;
    const document = new MachineDocument(
      repo,
      'workspace-1' as WorkspaceId,
      'machine-1' as MachineId,
      markDirty
    );
    const write = () =>
      document.updateAcpCapabilities(
        'config-1' as AgentConfigId,
        'builtin',
        'codex',
        [{ id: 'agent', name: 'Agent' }],
        [{ modelId: 'gpt-5', name: 'GPT-5' }],
        undefined,
        [{ name: '/help', description: 'Help' }],
        false,
        'builtin:codex:test',
        undefined,
        true
      );

    const first = await write();
    vi.setSystemTime(new Date('2026-07-15T00:01:00.000Z'));
    const second = await write();

    expect(flock.commits).toBe(1);
    expect(flush).toHaveBeenCalledTimes(1);
    expect(markDirty).toHaveBeenCalledTimes(1);
    expect(syncOnce).not.toHaveBeenCalled();
    expect(second.fetchedAt).toBe(first.fetchedAt);
    expect([...flock.rows.values()][0]?.value).toMatchObject({ acknowledgedSteer: true });
  });

  it('persists a capability change that only updates per-model reasoning efforts', async () => {
    const flock = new FakeMachineFlock();
    const flush = vi.fn(async () => undefined);
    const markDirty = vi.fn();
    const repo = {
      openFlockDoc: vi.fn(async () => ({ flock, syncOnce: vi.fn(async () => undefined) })),
      flush,
    } as unknown as LoroRepo;
    const document = new MachineDocument(
      repo,
      'workspace-1' as WorkspaceId,
      'machine-1' as MachineId,
      markDirty
    );
    const write = (efforts: string[]) =>
      document.updateAcpCapabilities(
        'config-1' as AgentConfigId,
        'registry',
        'deepseek',
        [],
        [{ modelId: 'kimi-k3', name: 'Kimi K3' }],
        undefined,
        undefined,
        false,
        'registry:deepseek:test',
        { 'kimi-k3': efforts }
      );

    await write(['low', 'high']);
    const updated = await write(['low', 'high', 'max']);

    expect(flock.commits).toBe(2);
    expect(flush).toHaveBeenCalledTimes(2);
    expect(markDirty).toHaveBeenCalledTimes(2);
    expect(updated.modelReasoningEfforts).toEqual({
      'kimi-k3': ['low', 'high', 'max'],
    });
  });

  it('does not write capabilities when cancelled while opening the Machine Flock', async () => {
    const flock = new FakeMachineFlock();
    let markOpenStarted!: () => void;
    const openStarted = new Promise<void>((resolve) => {
      markOpenStarted = resolve;
    });
    let releaseOpen!: () => void;
    const openCanFinish = new Promise<void>((resolve) => {
      releaseOpen = resolve;
    });
    const flush = vi.fn(async () => undefined);
    const repo = {
      openFlockDoc: vi.fn(async () => {
        markOpenStarted();
        await openCanFinish;
        return { flock, syncOnce: vi.fn(async () => undefined) };
      }),
      flush,
    } as unknown as LoroRepo;
    const document = new MachineDocument(
      repo,
      'workspace-1' as WorkspaceId,
      'machine-1' as MachineId,
      vi.fn()
    );
    const controller = new AbortController();

    const update = document.updateAcpCapabilities(
      'config-1' as AgentConfigId,
      'builtin',
      'codex',
      [{ id: 'agent', name: 'Agent' }],
      [{ modelId: 'gpt-5', name: 'GPT-5' }],
      undefined,
      undefined,
      false,
      'builtin:codex:test',
      undefined,
      false,
      { signal: controller.signal }
    );
    await openStarted;
    controller.abort();
    releaseOpen();

    await expect(update).rejects.toMatchObject({ name: 'AbortError' });
    expect(flock.commits).toBe(0);
    expect(flush).not.toHaveBeenCalled();
  });
});

describe('MachineDocument subscription quota refresh', () => {
  it('normalizes legacy rows in place before marking them stale or replacing them', async () => {
    const flock = new FakeMachineFlock();
    flock.set(machineFlockKeys.rateLimit('codex', 'codex'), {
      fiveHour: 29,
      sevenDay: null,
      fiveHourResetAt: 1_900_000_000,
    });
    const document = new MachineDocument(
      {
        openFlockDoc: async () => ({ flock, syncOnce: async () => {} }),
        flush: async () => {},
      } as unknown as LoroRepo,
      'workspace-1' as WorkspaceId,
      'machine-1' as MachineId,
      () => {}
    );
    const read = () =>
      getMachineFlockRateLimits(readMachineFlockRowsFromFlock(flock))['codex::codex'];

    await document.refreshRateLimits('codex', undefined, 2000);
    expect(read()).toMatchObject({
      limitId: 'codex',
      windows: [{ usedPercent: 29 }],
      quotaRefresh: { status: 'stale', observedAt: 2000 },
    });
    await document.refreshRateLimits(
      'codex',
      [
        {
          limitId: 'codex',
          scope: { providerId: 'codex' },
          windows: [
            {
              usedPercent: 12,
              windowDurationSeconds: 604800,
              resetsAtEpochSeconds: 1_900_000_100,
            },
          ],
        },
      ],
      3000
    );
    expect(read()).toMatchObject({
      limitId: 'codex',
      windows: [{ usedPercent: 12 }],
      quotaRefresh: { status: 'fresh', observedAt: 3000 },
    });
    expect([...flock.rows.keys()]).toEqual([
      JSON.stringify(machineFlockKeys.rateLimit('codex', 'codex')),
    ]);
  });

  it('preserves fresh live data against older queries and failures, without clearing cached usage', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(2000);
    const flock = new FakeMachineFlock();
    const repo = {
      openFlockDoc: async () => ({ flock, syncOnce: async () => {} }),
      flush: async () => {},
    } as unknown as LoroRepo;
    const document = new MachineDocument(
      repo,
      'workspace-1' as WorkspaceId,
      'machine-1' as MachineId,
      () => {}
    );
    const quota = (usedPercent: number): MachineRateLimit => ({
      limitId: 'codex',
      scope: { providerId: 'codex' },
      windows: [{ usedPercent, windowDurationSeconds: 18000, resetsAtEpochSeconds: 1900000000 }],
    });
    const read = () =>
      getMachineFlockRateLimits(readMachineFlockRowsFromFlock(flock))['codex::codex'];
    await document.updateRateLimits('codex', quota(42));
    await document.refreshRateLimits('codex', [quota(10)], 1000);
    await document.refreshRateLimits('codex', undefined, 1500);
    expect(read()).toMatchObject({
      windows: [{ usedPercent: 42 }],
      quotaRefresh: { status: 'fresh', observedAt: 2000 },
    });
    await document.refreshRateLimits('codex', undefined, 3000);
    expect(read()).toMatchObject({
      windows: [{ usedPercent: 42 }],
      quotaRefresh: { status: 'stale', observedAt: 3000 },
    });
    await document.refreshRateLimits('codex', [quota(7)], 4000);
    expect(read()).toMatchObject({
      windows: [{ usedPercent: 7 }],
      quotaRefresh: { status: 'fresh', observedAt: 4000 },
    });
    vi.setSystemTime(5000);
    await document.updateRateLimits('codex', quota(55));
    await document.refreshRateLimits('codex', [quota(3)], 5000);
    expect(read()).toMatchObject({
      windows: [{ usedPercent: 55 }],
      quotaRefresh: { status: 'fresh', observedAt: 5000 },
    });
    await document.updateRateLimits('codex', quota(56));
    expect(read()).toMatchObject({
      windows: [{ usedPercent: 56 }],
      quotaRefresh: { status: 'fresh', observedAt: 5000 },
    });
    const controller = new AbortController();
    controller.abort();
    await expect(
      document.refreshRateLimits('codex', [quota(0)], 5000, controller.signal)
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(read()?.windows[0]?.usedPercent).toBe(56);
    await document.refreshRateLimits('claude', [quota(0)], 6000);
    expect(Object.keys(getMachineFlockRateLimits(readMachineFlockRowsFromFlock(flock)))).toEqual([
      'codex::codex',
    ]);
  });
});
