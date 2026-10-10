import { setTimeout as delay } from 'node:timers/promises';
import { startLocalAcpAgent, shutdownLocalAcpAgent } from './acp-runner';
import type { BuiltinRuntimeOverrides, RuntimeCapabilitiesRequest } from '@lody/shared';
import type { Logger } from '@/utils/logger';

/** Keep the owning runtime alive until its asynchronous installation finishes. */
export async function manageRuntimeCapabilities(options: {
  agentType: string;
  env?: Record<string, string>;
  runtimeOverrides?: BuiltinRuntimeOverrides;
  logger: Logger;
  request: RuntimeCapabilitiesRequest;
}) {
  const terminalManager = {
    createTerminal: async () => {
      throw new Error('Interactive terminal is unavailable in capability setup');
    },
    terminalOutput: async () => {
      throw new Error('Interactive terminal is unavailable in capability setup');
    },
    releaseTerminal: async () => {},
    waitForTerminalExit: async () => ({ exitCode: null, signal: null }),
    killTerminal: async () => {},
  };
  const { agentProcess, client, acpSessionId } = await startLocalAcpAgent({
    cliType: 'builtin',
    agentType: options.agentType,
    env: options.env,
    runtimeOverrides: options.runtimeOverrides,
    logger: options.logger,
    workdir: process.cwd(),
    terminalManager,
    terminalEnabled: false,
    onUpdateMessage: () => {},
    onRequestPermission: async () => ({ outcome: { outcome: 'cancelled' } }),
  });
  try {
    let result = await client.runtimeCapabilities(options.request);
    while (
      options.request.action === 'install' &&
      result.capabilities.some((item) => item.install.running)
    ) {
      await delay(500);
      result = await client.runtimeCapabilities({ action: 'get', id: options.request.id });
    }
    return result;
  } finally {
    await shutdownLocalAcpAgent({
      agentProcess,
      client,
      acpSessionId,
      logger: options.logger,
      sessionLabel: 'runtime-capabilities',
    });
  }
}
