import { spawnSync } from 'child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SessionId, WorkspaceId } from '@lody/shared';

import { getGhShimHostBinDir } from '../src/lib/gh-shim-script';
import type { LoroDocumentManager } from '../src/lib/loro/doc';
import { Session } from '../src/session/session';
import { SessionManager } from '../src/session/session-manager';
import type { SessionConfig } from '../src/session/types';
import type { Logger } from '../src/utils/logger';
import { createTestCloudPort } from './test-cloud-port';

let tempDir: string;
let brokerPath: string;
let manager: SessionManager;
const startupFiles = [
  'bashenv',
  ...['.zshenv', '.zprofile', '.zshrc', '.zlogin', '.zlogout'].map((name) => `zdotdir/${name}`),
];

beforeEach(() => {
  tempDir = mkdtempSync(path.join(os.tmpdir(), 'lody-manager-startup-'));
  brokerPath = path.join(tempDir, 'broker.json');
  vi.stubEnv('LODY_DATA_DIR', path.join(tempDir, 'data'));
  const bin = path.join(tempDir, 'bin');
  mkdirSync(bin);
  writeFileSync(path.join(bin, 'gh'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
  vi.stubEnv('PATH', `${bin}${path.delimiter}${process.env.PATH ?? ''}`);
  manager = new SessionManager(
    { debug() {} } as unknown as Logger,
    'synthetic-cli-token',
    'machine-1',
    'workspace-1',
    {} as LoroDocumentManager,
    { cloudPort: createTestCloudPort({ identity: { userId: 'owner' } }) }
  );
  Object.assign(manager, {
    getGitHubTokenManager: () => null,
    ensureGitCredentialBrokerEnv: async () => ({
      url: 'http://127.0.0.1:1',
      token: 'synthetic-broker',
    }),
    gitCredentialBroker: {
      getStateFilePath: () => brokerPath,
      activateSessionContext: () => 'synthetic-context',
    },
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(tempDir, { recursive: true, force: true });
});

function configFor(requester: string): SessionConfig {
  const sourceDir = path.join(tempDir, requester || 'unknown');
  mkdirSync(sourceDir, { recursive: true });
  const source = `export STARTUP_SOURCE=${requester || 'unknown'}\n`;
  for (const name of ['bashenv', '.zshenv', '.zprofile', '.zshrc', '.zlogin', '.zlogout']) {
    writeFileSync(path.join(sourceDir, name), source);
  }
  return {
    workspaceId: 'workspace-1' as WorkspaceId,
    sessionId: `${requester}-session` as SessionId,
    requesterUserId: requester,
    machineId: 'machine-1',
    agentCliType: 'builtin',
    agentType: 'codex',
    githubRepo: 'synthetic/repo',
    userName: 'Synthetic User',
    userEmail: 'synthetic@example.com',
    env: {
      HOME: sourceDir,
      PATH: process.env.PATH ?? '',
      BASH_ENV: path.join(sourceDir, 'bashenv'),
      ZDOTDIR: sourceDir,
    },
  };
}

function prepare(config: SessionConfig) {
  return (
    manager as unknown as { prepareGitHubRepoSessionConfig(config: SessionConfig): Promise<void> }
  ).prepareGitHubRepoSessionConfig(config);
}

const shells = ['/bin/bash', '/bin/zsh'].filter(existsSync);

describe.skipIf(process.platform === 'win32')('SessionManager startup ownership', () => {
  it.each(['owner-first', 'teammate-first'])(
    'protects owner startup files when preparing %s',
    async (order) => {
      const owner = configFor('owner');
      const teammate = configFor('teammate');
      if (order === 'teammate-first') {
        await prepare(teammate);
        expect(
          startupFiles.some((name) => existsSync(path.join(getGhShimHostBinDir(brokerPath), name)))
        ).toBe(false);
      }
      await prepare(owner);
      const ownerFiles = startupFiles.filter((name) =>
        existsSync(path.join(getGhShimHostBinDir(brokerPath), name))
      );
      const before = ownerFiles.map((name) =>
        readFileSync(path.join(getGhShimHostBinDir(brokerPath), name), 'utf8')
      );
      await prepare(teammate);
      expect(
        ownerFiles.map((name) =>
          readFileSync(path.join(getGhShimHostBinDir(brokerPath), name), 'utf8')
        )
      ).toEqual(before);
      expect(teammate.env?.BASH_ENV).not.toBe(owner.env?.BASH_ENV);
      expect(teammate.env?.ZDOTDIR).not.toBe(owner.env?.ZDOTDIR);

      for (const shell of shells) {
        // Only pass fixture values; never let runner credentials enter a child.
        const ownerEnv = owner.env ?? {};
        const result = spawnSync(shell, ['-c', 'printf %s "$STARTUP_SOURCE"'], {
          env: {
            HOME: ownerEnv.HOME,
            PATH: '/usr/bin:/bin',
            BASH_ENV: ownerEnv.BASH_ENV,
            ZDOTDIR: ownerEnv.ZDOTDIR,
            GH_TOKEN: 'synthetic-owner-token',
          },
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'pipe'],
        });
        expect(result.status, result.stderr).toBe(0);
        expect(result.stdout).toBe('owner');
      }
    }
  );

  it('cannot enable owner startup generation when machine ownership is unknown', async () => {
    Object.assign(manager, { cloudPort: createTestCloudPort({ identity: { userId: '' } }) });
    await prepare(configFor(''));
    expect(
      startupFiles.some((name) => existsSync(path.join(getGhShimHostBinDir(brokerPath), name)))
    ).toBe(false);
  });
  it('rejects late startup overlays after non-owner preparation', async () => {
    const owner = configFor('owner');
    const teammate = configFor('teammate');
    await prepare(owner);
    await prepare(teammate);
    const session = new Session(
      teammate,
      { debug() {} } as unknown as Logger,
      tempDir,
      undefined,
      'owner'
    );
    const env = (
      session as unknown as {
        buildShellEnv(
          overrides: Record<string, string>,
          login: NodeJS.ProcessEnv
        ): NodeJS.ProcessEnv;
      }
    ).buildShellEnv(owner.env ?? {}, owner.env ?? {});
    for (const shell of shells) {
      const result = spawnSync(shell, ['-c', 'printf %s "${STARTUP_SOURCE-}"'], {
        env: Object.fromEntries(
          ['HOME', 'PATH', 'BASH_ENV', 'ZDOTDIR'].map((key) => [key, env[key]])
        ),
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      expect(result.status, result.stderr).toBe(0);
      expect(result.stdout).toBe('');
    }
  });
});
