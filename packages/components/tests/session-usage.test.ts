import { describe, expect, it } from 'vitest';
import { CODEX_SPARK_LIMIT_ID, getRateLimitEntryKey } from '@lody/shared';

import {
  canShowSubscriptionRateLimits,
  formatRateLimitWindowShortLabel,
  getAgentRateLimitWindows,
  getContextWindowUsageData,
  getRateLimitRemainingPercent,
  resolveAgentRateLimitForModel,
  type MachineRateLimits,
} from '../src/lib/session-usage';

const usage = (overrides: Partial<MachineRateLimits[string]> = {}): MachineRateLimits[string] => ({
  limitId: 'codex',
  scope: { providerId: 'codex' },
  planName: null,
  windows: [
    {
      usedPercent: 25,
      windowDurationSeconds: 5 * 60 * 60,
      resetsAtEpochSeconds: null,
    },
    {
      usedPercent: 40,
      windowDurationSeconds: 7 * 24 * 60 * 60,
      resetsAtEpochSeconds: null,
    },
  ],
  ...overrides,
});
const NOW_EPOCH_SECONDS = 1_780_000_000;

describe('session usage', () => {
  it('derives remaining context tokens and clamps over-capacity usage', () => {
    expect(getContextWindowUsageData({ size: 128_000, used: 32_000 })).toMatchObject({
      remainingTokens: 96_000,
      usedPercentage: 25,
      remainingPercentage: 75,
    });
    expect(getContextWindowUsageData({ size: 100, used: 120 })).toMatchObject({
      remainingTokens: 0,
      usedPercentage: 100,
      remainingPercentage: 0,
    });
    expect(getContextWindowUsageData({ size: 0, used: 0 })).toBeNull();
  });

  it('derives remaining quota from the normalized percentage scale', () => {
    expect(getRateLimitRemainingPercent(25)).toBe(75);
    expect(getRateLimitRemainingPercent(55)).toBe(45);
    expect(getRateLimitRemainingPercent(100)).toBe(0);
    expect(getRateLimitRemainingPercent(1)).toBe(99);
    expect(getRateLimitRemainingPercent(0.5)).toBe(99.5);
  });

  it('uses provider-reported window durations instead of positional 5h/7d labels', () => {
    const windows = getAgentRateLimitWindows(
      usage({
        windows: [
          {
            usedPercent: 29,
            windowDurationSeconds: 7 * 24 * 60 * 60,
            resetsAtEpochSeconds: 1784505071,
          },
        ],
      }),
      NOW_EPOCH_SECONDS
    );

    expect(windows).toEqual([
      {
        usedPercent: 29,
        remainingPercent: 71,
        windowDurationSeconds: 604_800,
        resetsAtEpochSeconds: 1784505071,
        stale: false,
      },
    ]);
    expect(formatRateLimitWindowShortLabel(windows[0]!.windowDurationSeconds)).toBe('7d');
  });

  it('reads canonical fixed windows without provider-specific interpretation', () => {
    expect(getAgentRateLimitWindows(usage(), NOW_EPOCH_SECONDS)).toMatchObject([
      { usedPercent: 25, windowDurationSeconds: 18_000 },
      { usedPercent: 40, windowDurationSeconds: 604_800 },
    ]);
  });

  it('preserves scoped windows even when their values match the shared quota', () => {
    const weekly = { usedPercent: 0, windowDurationSeconds: 604_800, resetsAtEpochSeconds: null };
    expect(
      getAgentRateLimitWindows(
        usage({ windows: [weekly, { ...weekly, label: ' Fable ' }] }),
        NOW_EPOCH_SECONDS
      )
    ).toEqual([
      { ...weekly, remainingPercent: 100, stale: false },
      { ...weekly, remainingPercent: 100, label: 'Fable', stale: false },
    ]);
  });

  it('keeps sub-one-percent Grok usage on the percentage scale', () => {
    expect(
      getAgentRateLimitWindows(
        usage({
          scope: { providerId: 'grok' },
          windows: [
            {
              usedPercent: 0.5,
              windowDurationSeconds: 604_800,
              resetsAtEpochSeconds: 1784505071,
            },
          ],
        }),
        NOW_EPOCH_SECONDS
      )
    ).toEqual([
      {
        usedPercent: 0.5,
        remainingPercent: 99.5,
        windowDurationSeconds: 604_800,
        resetsAtEpochSeconds: 1784505071,
        stale: false,
      },
    ]);
  });

  it('preserves an explicitly reported single weekly Codex window', () => {
    expect(
      getAgentRateLimitWindows(
        usage({
          windows: [
            {
              usedPercent: 29,
              windowDurationSeconds: 604_800,
              resetsAtEpochSeconds: 1784505071,
            },
          ],
        }),
        NOW_EPOCH_SECONDS
      )
    ).toEqual([
      {
        usedPercent: 29,
        remainingPercent: 71,
        windowDurationSeconds: 604_800,
        resetsAtEpochSeconds: 1784505071,
        stale: false,
      },
    ]);
  });

  it('keeps cached percentages while marking provider-stale and elapsed windows stale', () => {
    const providerStale = getAgentRateLimitWindows(
      usage({
        quotaRefresh: { status: 'stale', observedAt: 1_779_999_000 },
        windows: [
          {
            usedPercent: 29,
            windowDurationSeconds: 604_800,
            resetsAtEpochSeconds: NOW_EPOCH_SECONDS + 60,
          },
        ],
      }),
      NOW_EPOCH_SECONDS
    )[0];
    const elapsed = getAgentRateLimitWindows(
      usage({
        quotaRefresh: { status: 'fresh', observedAt: 1_779_999_000 },
        windows: [
          {
            usedPercent: 29,
            windowDurationSeconds: 604_800,
            resetsAtEpochSeconds: NOW_EPOCH_SECONDS,
          },
          {
            usedPercent: 12,
            windowDurationSeconds: 18_000,
            resetsAtEpochSeconds: NOW_EPOCH_SECONDS + 60,
          },
        ],
      }),
      NOW_EPOCH_SECONDS
    );

    expect(providerStale).toMatchObject({ usedPercent: 29, remainingPercent: 71, stale: true });
    expect(elapsed).toMatchObject([
      { usedPercent: 29, remainingPercent: 71, stale: true },
      { usedPercent: 12, remainingPercent: 88, stale: true },
    ]);
  });

  it('selects the quota tier that matches the current Codex model', () => {
    const rateLimits: MachineRateLimits = {
      [getRateLimitEntryKey('codex', 'codex')]: usage({ limitId: 'codex' }),
      [getRateLimitEntryKey('codex', CODEX_SPARK_LIMIT_ID)]: usage({
        limitId: CODEX_SPARK_LIMIT_ID,
        limitName: 'GPT-5.3-Codex-Spark',
        sevenDay: 88,
      }),
    };

    expect(
      resolveAgentRateLimitForModel({
        rateLimits,
        agentType: 'codex',
        modelId: 'gpt-5.3-codex-spark',
      })?.limitId
    ).toBe(CODEX_SPARK_LIMIT_ID);
    expect(
      resolveAgentRateLimitForModel({
        rateLimits,
        agentType: 'codex',
        modelId: 'gpt-5.4',
      })?.limitId
    ).toBe('codex');
  });

  it('does not show a model-specific tier beside a different selected model', () => {
    const rateLimits: MachineRateLimits = {
      [getRateLimitEntryKey('codex', CODEX_SPARK_LIMIT_ID)]: usage({
        limitId: CODEX_SPARK_LIMIT_ID,
        limitName: 'GPT-5.3-Codex-Spark',
      }),
    };

    expect(
      resolveAgentRateLimitForModel({
        rateLimits,
        agentType: 'codex',
        modelId: 'gpt-5.4',
      })
    ).toBeNull();
  });

  it('hides subscription limits for custom providers and configured endpoints', () => {
    expect(
      canShowSubscriptionRateLimits({
        cliType: 'builtin',
        agentType: 'codex',
        config: { env: {} },
      })
    ).toBe(true);
    expect(
      canShowSubscriptionRateLimits({
        cliType: 'builtin',
        agentType: 'grok',
        config: { env: {} },
      })
    ).toBe(true);
    expect(
      canShowSubscriptionRateLimits({
        cliType: 'builtin',
        agentType: 'claude',
        config: { env: { ANTHROPIC_BASE_URL: 'https://example.com' } },
      })
    ).toBe(false);
    expect(
      canShowSubscriptionRateLimits({
        cliType: 'custom',
        agentType: 'custom-agent',
      })
    ).toBe(false);
  });
});
