import { spawn, spawnSync } from 'child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { createServer } from 'http';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LocalProjectId, SessionId, WorkspaceId } from '@lody/shared';

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
  vi.stubEnv('LODY_GIT_CRED_CONTEXT_TOKEN', '');
  const bin = path.join(tempDir, 'bin');
  mkdirSync(bin);
  writeFileSync(
    path.join(bin, 'gh'),
    '#!/bin/sh\nif [ -n "$GH_TOKEN" ]; then printf %s "$GH_TOKEN"; else cat "$HOME/saved-gh-login"; fi\n',
    { mode: 0o755 }
  );
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
    mcpServerIds: [],
    taskToolsEnabled: false,
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
    manager as unknown as { prepareGitHubSessionConfig(config: SessionConfig): Promise<void> }
  ).prepareGitHubSessionConfig(config);
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
      'owner',
      brokerPath
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

function sessionEnv(
  config: SessionConfig,
  machineOwner = 'owner',
  trustedBrokerPath = config.env?.LODY_GIT_CRED_BROKER_STATE_FILE
): NodeJS.ProcessEnv {
  const session = new Session(
    config,
    { debug() {} } as unknown as Logger,
    tempDir,
    undefined,
    machineOwner,
    trustedBrokerPath || undefined
  );
  const overlays = {
    HOME: config.env?.HOME ?? tempDir,
    PATH: process.env.PATH ?? '',
    GH_TOKEN: 'synthetic-owner-env',
    BASH_ENV: config.env?.BASH_ENV ?? '',
    ZDOTDIR: config.env?.ZDOTDIR ?? '',
  };
  const env = (
    session as unknown as {
      buildShellEnv(extra: Record<string, string>, login: NodeJS.ProcessEnv): NodeJS.ProcessEnv;
    }
  ).buildShellEnv(overlays, overlays);
  return Object.fromEntries(
    ['HOME', 'PATH', 'BASH_ENV', 'ZDOTDIR', 'GH_TOKEN', 'LODY_GIT_CRED_CONTEXT_TOKEN'].map(
      (key) => [key, env[key]]
    )
  );
}

function runGh(env: NodeJS.ProcessEnv, command = 'gh api user', direct = false) {
  return new Promise<{ status: number | null; stdout: string; stderr: string }>(
    (resolve, reject) => {
      const child = spawn(direct ? 'gh' : '/bin/bash', direct ? ['api', 'user'] : ['-c', command], {
        env,
        cwd: tempDir,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (chunk) => {
        stdout += chunk;
      });
      child.stderr.on('data', (chunk) => {
        stderr += chunk;
      });
      child.on('error', reject);
      child.on('close', (status) => resolve({ status, stdout, stderr }));
    }
  );
}

describe.skipIf(process.platform === 'win32')('repository-less GitHub authorization', () => {
  it.each(['blank', 'local'] as const)(
    'binds a %s project to requester credentials before plain gh runs',
    async (kind) => {
      const config = configFor('teammate');
      delete config.githubRepo;
      if (kind === 'local')
        config.project = { kind: 'local', localProjectId: 'local-1' as LocalProjectId };
      writeFileSync(
        path.join(config.env?.HOME ?? tempDir, 'saved-gh-login'),
        'synthetic-owner-login'
      );
      const requests: Array<{ endpoint: string | undefined; body: unknown }> = [];
      const server = createServer((req, res) => {
        let raw = '';
        req.on('data', (chunk) => {
          raw += String(chunk);
        });
        req.on('end', () => {
          const body: unknown = JSON.parse(raw);
          requests.push({ endpoint: req.url, body });
          res.setHeader('content-type', 'application/json');
          res.end(
            JSON.stringify(
              req.url === '/github-auth-context'
                ? { allowLocalAuth: false }
                : { token: 'synthetic-requester-token' }
            )
          );
        });
      });
      await new Promise<void>((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', resolve);
      });
      try {
        const address = server.address();
        if (!address || typeof address === 'string') throw new Error('Missing broker address');
        writeFileSync(
          brokerPath,
          JSON.stringify({ url: `http://127.0.0.1:${address.port}`, token: 'synthetic-broker' })
        );
        await prepare(config);
        expect(config.env?.GIT_CONFIG_COUNT).toBeUndefined();
        const env = sessionEnv(config);
        const denied = await runGh(env);
        expect(denied.status, denied.stderr).toBe(1);
        expect(denied.stdout).toBe('');
        expect(denied.stderr).toContain('No managed GitHub credential');
        const allowed = await runGh(env, 'gh api repos/synthetic/explicit/issues');
        expect(allowed.status, allowed.stderr).toBe(0);
        expect(allowed.stdout).toBe('synthetic-requester-token');
        expect(requests).toEqual([
          { endpoint: '/github-auth-context', body: { contextToken: 'synthetic-context' } },
          { endpoint: '/github-auth-context', body: { contextToken: 'synthetic-context' } },
          {
            endpoint: '/github-token',
            body: { contextToken: 'synthetic-context', repoFullName: 'synthetic/explicit' },
          },
        ]);
      } finally {
        await new Promise<void>((resolve, reject) =>
          server.close((error) => (error ? reject(error) : resolve()))
        );
      }
    },
    15000
  );

  it.each([
    { requester: 'teammate', owner: 'owner' },
    { requester: 'owner', owner: '' },
  ])(
    'blocks saved native login without a broker for $requester / owner=$owner',
    async ({ requester, owner }) => {
      const config = configFor(requester);
      delete config.githubRepo;
      writeFileSync(
        path.join(config.env?.HOME ?? tempDir, 'saved-gh-login'),
        'synthetic-owner-login'
      );
      Object.assign(manager, { ensureGitCredentialBrokerEnv: async () => null });
      await prepare(config);
      const result = await runGh(sessionEnv(config, owner));
      expect(result.status, result.stderr).toBe(1);
      expect(result.stdout).toBe('');
      expect(result.stderr).toContain('GitHub credential context is required');
    },
    15000
  );

  it('discards caller-selected broker authority when the trusted broker is unavailable', async () => {
    const config = configFor('teammate');
    delete config.githubRepo;
    writeFileSync(
      path.join(config.env?.HOME ?? tempDir, 'saved-gh-login'),
      'synthetic-owner-login'
    );
    let forgedRequests = 0;
    const server = createServer((_req, res) => {
      forgedRequests += 1;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ allowLocalAuth: true }));
    });
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    try {
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('Missing fake broker address');
      const url = `http://127.0.0.1:${address.port}`;
      writeFileSync(brokerPath, JSON.stringify({ url, token: 'synthetic-forged-broker' }));
      config.env = {
        ...config.env,
        LODY_GIT_CRED_BROKER_STATE_FILE: brokerPath,
        LODY_GIT_CRED_BROKER_URL: url,
        LODY_GIT_CRED_BROKER_TOKEN: 'synthetic-forged-broker',
        LODY_GIT_CRED_CONTEXT_TOKEN: 'synthetic-forged-context',
      };
      const unprepared = await runGh(sessionEnv(config, 'owner', ''));
      expect(unprepared.status, unprepared.stderr).toBe(1);
      expect(unprepared.stdout).toBe('');
      Object.assign(manager, { ensureGitCredentialBrokerEnv: async () => null });
      await prepare(config);
      const result = await runGh(sessionEnv(config));
      expect(result.status, result.stderr).toBe(1);
      expect(result.stdout).toBe('');
      expect(result.stderr).toContain('GitHub credential context is required');
      expect(forgedRequests).toBe(0);
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve()))
      );
    }
  }, 15000);

  it('keeps the shim before default ACP paths for direct gh execution', async () => {
    const config = configFor('teammate');
    delete config.githubRepo;
    const home = config.env?.HOME ?? tempDir;
    vi.stubEnv('HOME', home);
    const nativeBin = path.join(home, '.local', 'bin');
    mkdirSync(nativeBin, { recursive: true });
    writeFileSync(path.join(nativeBin, 'gh'), '#!/bin/sh\nprintf synthetic-owner-login\n', {
      mode: 0o755,
    });
    Object.assign(manager, { ensureGitCredentialBrokerEnv: async () => null });
    await prepare(config);
    const result = await runGh(sessionEnv(config), undefined, true);
    expect(result.status, result.stderr).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('GitHub credential context is required');
  });

  it('preserves native owner login in a local session without a broker', async () => {
    const config = configFor('owner');
    delete config.githubRepo;
    writeFileSync(
      path.join(config.env?.HOME ?? tempDir, 'saved-gh-login'),
      'synthetic-owner-login'
    );
    Object.assign(manager, { ensureGitCredentialBrokerEnv: async () => null });
    await prepare(config);
    const env = sessionEnv(config);
    delete env.GH_TOKEN;
    const result = await runGh(env);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toBe('synthetic-owner-login');
  });
});
