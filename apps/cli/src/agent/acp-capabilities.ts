import {
  type AgentConfigCliType,
  type BuiltinRuntimeOverrides,
  type CustomAcpLaunchSpec,
} from '@lody/shared';
import type { Logger } from '@/utils/logger';
import type { RateLimit, RateLimitsSnapshot } from 'acp-extension-core';
import { shutdownLocalAcpAgent, startLocalAcpAgent } from '@/agent/acp-runner';
import { scrubInheritedClaudeAuthEnv, shouldScrubClaudeAuthEnv } from '@/agent/claude-env-conflict';
import type { ManagedRuntimeProgressCallback } from '@/agent/managed-agent-runtime';
import { AcpAuthenticationRequiredError } from '@/agent/agent-client';
import { probeBuiltinAuthentication } from '@/agent/acp-authentication';
import {
  normalizeAcpSessionCapabilities,
  type AcpCapabilitiesResult,
} from '@/agent/acp-capability-normalization';

export { normalizeConfigOptions } from '@/agent/acp-capability-normalization';
export type { AcpCapabilitiesResult } from '@/agent/acp-capability-normalization';

export type FetchAcpCapabilitiesOptions = {
  onManagedRuntimeProgress?: ManagedRuntimeProgressCallback;
  signal?: AbortSignal;
};

export type FetchedAcpCapabilities = AcpCapabilitiesResult & {
  capabilitySourceVersion?: string;
  rateLimits?: RateLimitsSnapshot;
};

/**
 * Spawns a temporary ACP agent to discover the capabilities returned by session/new.
 * Also queries advertised subscription quota before shutting the temporary agent down.
 */
export async function fetchAcpCapabilities(
  cliType: AgentConfigCliType,
  agentType: string,
  logger: Logger,
  env?: Record<string, string>,
  customAcp?: CustomAcpLaunchSpec,
  runtimeOverrides?: BuiltinRuntimeOverrides,
  options: FetchAcpCapabilitiesOptions = {}
): Promise<FetchedAcpCapabilities> {
  options.signal?.throwIfAborted();
  const workdir = process.cwd();
  const mergedProbeEnv: NodeJS.ProcessEnv = env ? { ...process.env, ...env } : process.env;
  const probeEnv: NodeJS.ProcessEnv =
    shouldScrubClaudeAuthEnv(cliType, agentType) && env
      ? scrubInheritedClaudeAuthEnv(mergedProbeEnv, env)
      : mergedProbeEnv;
  const authentication = await probeBuiltinAuthentication({
    cliType,
    agentType,
    runtimeOverrides,
    env: probeEnv,
    onManagedRuntimeProgress: options.onManagedRuntimeProgress,
    signal: options.signal,
    logger,
  });
  options.signal?.throwIfAborted();
  if (authentication.status === 'unauthenticated') {
    throw new AcpAuthenticationRequiredError(authentication.authMethods);
  }
  const noopTerminalManager = {
    createTerminal: async () => {
      throw new Error('Terminal not supported in ACP capability refresh');
    },
    terminalOutput: async () => {
      throw new Error('Terminal not supported in ACP capability refresh');
    },
    releaseTerminal: async () => {},
    waitForTerminalExit: async () => ({ exitCode: null, signal: null }),
    killTerminal: async () => {},
  };
  const notifiedLimits = new Map<string, RateLimit>();
  const { agentProcess, client, acpSessionId, sessionResponse, capabilitySourceVersion } =
    await startLocalAcpAgent({
      cliType,
      agentType,
      customAcp,
      runtimeOverrides,
      workdir,
      env: probeEnv,
      onManagedRuntimeProgress: options.onManagedRuntimeProgress,
      signal: options.signal,
      logger,
      terminalManager: noopTerminalManager,
      terminalEnabled: false,
      onUpdateMessage: () => {},
      onRateLimitUpdate: (limits) => notifiedLimits.set(limits.limitId, limits),
      onRequestPermission: async () => ({ outcome: { outcome: 'cancelled' } }),
    });

  try {
    let rateLimits: RateLimitsSnapshot | undefined;
    if (client.supportsRateLimitsQuery()) {
      // Quota is optional: a slow provider must not hold up capability discovery.
      let timer: ReturnType<typeof setTimeout> | undefined;
      let abort: (() => void) | undefined;
      try {
        rateLimits = await Promise.race([
          client.getRateLimits({ sessionId: acpSessionId }),
          new Promise<never>((_, reject) => {
            abort = () => reject(new Error('Quota refresh cancelled'));
            timer = setTimeout(() => reject(new Error('Quota refresh timed out')), 5_000);
            timer.unref?.();
            options.signal?.addEventListener('abort', abort, { once: true });
            if (options.signal?.aborted) abort();
          }),
        ]);
      } catch {
        logger.debug('[acp-capabilities] Subscription quota is unavailable');
      } finally {
        if (timer) clearTimeout(timer);
        if (abort) options.signal?.removeEventListener('abort', abort);
      }
    } else if (notifiedLimits.size > 0) {
      rateLimits = { rateLimits: [...notifiedLimits.values()] };
    }
    options.signal?.throwIfAborted();
    return {
      ...normalizeAcpSessionCapabilities(sessionResponse, {
        sessionFork: client.supportsSessionFork?.() === true,
        acknowledgedSteer: client.supportsAcknowledgedSteer(),
        agent: { cliType, agentType },
      }),
      capabilitySourceVersion,
      rateLimits,
    };
  } finally {
    await shutdownLocalAcpAgent({
      agentProcess,
      client,
      acpSessionId,
      logger,
      sessionLabel: `acp-capabilities:${cliType}/${agentType}`,
    });
  }
}
