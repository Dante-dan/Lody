import { spawnSync } from 'child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SessionId, WorkspaceId } from '@lody/shared';

vi.mock('@/agent/login-shell-env', () => ({
  getCachedLoginShellEnvSync: () => ({}),
}));

import { GITHUB_CREDENTIAL_ENV_KEYS } from '../src/lib/gh-token-env';
import { ensureLodyBashEnvForGhShim } from '../src/lib/lody-bashenv';
import { ensureLodyZdotdirForGhShim } from '../src/lib/lody-zdotdir';
import { toSingleQuotedShellString } from '../src/lib/shell-file-utils';
import { getGhShimHostBinDir } from '../src/lib/gh-shim-script';
import { Session } from '../src/session/session';
import type { Logger } from '../src/utils/logger';

const logger = { debug() {} } as unknown as Logger;
let tempDir: string;
let homeDir: string;
let startupEnv: Record<string, string>;
const exportTokens = GITHUB_CREDENTIAL_ENV_KEYS.map((key) => `export ${key}=synthetic-owner`).join(
  '\n'
);
const printTokens = GITHUB_CREDENTIAL_ENV_KEYS.map((key) => `printf '%s|' "\${${key}-}"`).join(
  '; '
);

beforeEach(() => {
  tempDir = mkdtempSync(path.join(os.tmpdir(), 'lody-shell-startup-'));
  homeDir = path.join(tempDir, 'home');
  mkdirSync(homeDir);
  for (const key of GITHUB_CREDENTIAL_ENV_KEYS) vi.stubEnv(key, '');
  vi.stubEnv('LODY_DATA_DIR', path.join(tempDir, 'data'));
  const bashEnv = path.join(homeDir, 'bashenv');
  writeFileSync(bashEnv, `${exportTokens}\nexport OWNER_STARTUP_RAN=yes\n`);
  for (const name of ['.zshenv', '.zprofile', '.zshrc', '.zlogin', '.zlogout']) {
    writeFileSync(path.join(homeDir, name), `${exportTokens}\nexport OWNER_STARTUP_RAN=yes\n`);
  }
  const brokerPath = path.join(tempDir, 'broker.json');
  mkdirSync(getGhShimHostBinDir(brokerPath), { recursive: true });
  writeFileSync(path.join(getGhShimHostBinDir(brokerPath), 'gh'), '#!/bin/sh\nexit 0\n', {
    mode: 0o755,
  });
  startupEnv = {
    HOME: homeDir,
    LODY_GIT_CRED_BROKER_STATE_FILE: brokerPath,
    PATH: '/usr/bin:/bin',
    BASH_ENV: ensureLodyBashEnvForGhShim(bashEnv, brokerPath),
    ZDOTDIR: ensureLodyZdotdirForGhShim(homeDir, brokerPath),
  };
});

afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(tempDir, { recursive: true, force: true });
});

function createSession(requesterUserId: string, machineOwnerUserId: string | undefined = 'owner') {
  return new Session(
    {
      workspaceId: 'workspace-1' as WorkspaceId,
      sessionId: 'session-1' as SessionId,
      requesterUserId,
      machineId: 'machine-1',
      agentCliType: 'builtin',
      agentType: 'codex',
      userName: 'Synthetic User',
      userEmail: 'synthetic@example.com',
      env: startupEnv,
    },
    logger,
    homeDir,
    undefined,
    machineOwnerUserId,
    startupEnv.LODY_GIT_CRED_BROKER_STATE_FILE
  );
}

function buildEnv(session: Session, extraEnv = startupEnv) {
  const env = (
    session as unknown as {
      buildShellEnv(
        extraEnv: Record<string, string>,
        loginShellEnv: NodeJS.ProcessEnv
      ): NodeJS.ProcessEnv;
    }
  ).buildShellEnv(extraEnv, startupEnv);
  // Do not let the test runner's own agent/shell hooks or credentials enter fixtures.
  return Object.fromEntries(
    ['HOME', 'PATH', 'BASH_ENV', 'ZDOTDIR', ...GITHUB_CREDENTIAL_ENV_KEYS].map((key) => [
      key,
      env[key],
    ])
  );
}

// Ignore stdin as Session.runCommand does. macOS Bash treats Node's pipe
// (a socketpair) as remote-shell input and selects .bashrc instead of BASH_ENV.
const shells = [
  { shell: '/bin/bash', flags: '-c' },
  ...['-c', '-lc', '-ic', '-lic'].map((flags) => ({ shell: '/bin/zsh', flags })),
].filter(({ shell }) => existsSync(shell));

describe.skipIf(process.platform === 'win32')('Session shell startup credentials', () => {
  it.each(shells)(
    '$shell $flags does not replay owner startup files for a non-owner',
    ({ shell, flags }) => {
      const env = buildEnv(createSession('teammate'));
      const result = spawnSync(
        shell,
        [flags, `${printTokens}; printf '%s' "\${OWNER_STARTUP_RAN-}"`],
        { env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
      );
      expect(result.status, result.stderr).toBe(0);
      expect(result.stdout).toBe('|'.repeat(GITHUB_CREDENTIAL_ENV_KEYS.length));
      expect(env.HOME).toBe(homeDir);
      expect(env.PATH).toContain('/usr/bin');
      const lookup = spawnSync(shell, [flags, 'command -v gh'], {
        env,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      expect(lookup.stdout.trim()).toBe(
        path.join(getGhShimHostBinDir(startupEnv.LODY_GIT_CRED_BROKER_STATE_FILE), 'gh')
      );
    }
  );

  it.each(shells)('$shell $flags preserves owner startup configuration', ({ shell, flags }) => {
    const result = spawnSync(shell, [flags, `${printTokens}; printf '%s' "$OWNER_STARTUP_RAN"`], {
      env: buildEnv(createSession('owner')),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    expect(result.status, result.stderr).toBe(0);
    expect(
      result.stdout === 'synthetic-owner|'.repeat(GITHUB_CREDENTIAL_ENV_KEYS.length) + 'yes'
    ).toBe(true);
  });

  it('keeps owner and teammate startup policies independent across handoffs and concurrent sessions', () => {
    const owner = createSession('owner');
    const ownerEnv = buildEnv(owner);
    const teammateEnv = buildEnv(createSession('teammate'));
    expect(teammateEnv.BASH_ENV).not.toBe(ownerEnv.BASH_ENV);
    expect(teammateEnv.ZDOTDIR).not.toBe(ownerEnv.ZDOTDIR);
    buildEnv(owner);
    owner.updateGitIdentity('Teammate', 'teammate@example.com', 'teammate');
    expect(buildEnv(owner).BASH_ENV).toBe(teammateEnv.BASH_ENV);
    owner.updateGitIdentity('Owner', 'owner@example.com', 'owner');
    expect(buildEnv(owner).BASH_ENV).toBe(ownerEnv.BASH_ENV);
    const result = spawnSync(
      '/bin/bash',
      ['-c', `/bin/bash -c ${toSingleQuotedShellString(printTokens)}`],
      { env: teammateEnv, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
    );
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toBe('|'.repeat(GITHUB_CREDENTIAL_ENV_KEYS.length));
  });

  it('fails closed when the machine owner is unknown, despite startup overrides', () => {
    const env = buildEnv(createSession('owner', ''));
    expect(env.BASH_ENV).not.toBe(startupEnv.BASH_ENV);
    expect(env.ZDOTDIR).not.toBe(startupEnv.ZDOTDIR);
  });
});
