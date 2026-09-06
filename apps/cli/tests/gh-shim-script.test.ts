import { spawn } from 'child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import http from 'http';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getLodyDataDir } from '@lody/shared/node/installation-profile';

import {
  ensureGhShimScript,
  getGhShimHostBinDir,
  getGhShimHostPath,
} from '../src/lib/gh-shim-script';
import { getGhTokenFingerprint, LODY_MANAGED_GH_TOKEN_SHA256_ENV } from '../src/lib/gh-token-env';

let tempHomeDir: string | null = null;
let fakeBinDir: string | null = null;
let tokenBroker: http.Server | null = null;
let brokerRequestCount = 0;
let brokerRequests: unknown[] = [];
let endpointRequests: { endpoint: string | undefined; body: unknown }[] = [];

const originalPath = process.env.PATH ?? '';
// Full workspace test runs can heavily delay Node child startup/close on CI.
const SHIM_INTEGRATION_TIMEOUT_MS = 150_000;
const SHIM_CHILD_TIMEOUT_MS = 120_000;

beforeEach(() => {
  tempHomeDir = mkdtempSync(path.join(os.tmpdir(), 'lody-gh-shim-home-'));
  fakeBinDir = mkdtempSync(path.join(os.tmpdir(), 'lody-gh-shim-bin-'));
  vi.spyOn(os, 'homedir').mockReturnValue(tempHomeDir);
  vi.stubEnv('PATH', `${fakeBinDir}${path.delimiter}${originalPath}`);
  brokerRequestCount = 0;
  brokerRequests = [];
  endpointRequests = [];

  writeFakeGh(
    `#!/bin/sh
if [ "$1" = "auth" ] && [ "$2" = "token" ]; then
  if [ -n "$GH_TOKEN$GITHUB_TOKEN$GH_ENTERPRISE_TOKEN$GITHUB_ENTERPRISE_TOKEN" ] || [ "$FAKE_GH_AUTHED" = "1" ]; then exit 0; fi
  exit 1
fi
if [ "$1" = "api" ] && [ "$4" = "user" ]; then
  if [ -n "$FAKE_GH_PROBE_ERROR" ]; then printf '%s' "$FAKE_GH_PROBE_ERROR" >&2; exit 1; fi
  if [ "\${GH_TOKEN:-\${GITHUB_TOKEN:-}}" = "expired-token" ] || [ "$FAKE_GH_LOCAL_INVALID" = "1" ]; then
    printf 'gh: Bad credentials (HTTP 401)' >&2; exit 1
  fi
  exit 0
fi
if [ "$FAKE_GH_PRINT_HOST" = "1" ]; then printf '%s' "$GH_HOST"; exit 0; fi
if [ -n "$FAKE_GH_EXEC_LOG" ]; then printf '%s\\n' "$*" >> "$FAKE_GH_EXEC_LOG"; fi
if [ -n "$FAKE_GH_COMMAND_ERROR" ]; then printf '%s' "$FAKE_GH_COMMAND_ERROR" >&2; exit 1; fi
if [ "$FAKE_GH_PRINT_MIXED" = "1" ]; then
  printf '%s|%s|%s|%s' "$gh_token" "$GitHub_Token" "$Gh_Enterprise_Token" "$github_enterprise_token"
  exit 0
fi
if [ "$1" = "print-token" ] || { [ "$1" = "api" ] && [ "$2" = "graphql" ]; }; then
  printf 'GH_TOKEN=%s\\n' "\${GH_TOKEN:-}"
  printf 'GITHUB_TOKEN=%s\\n' "\${GITHUB_TOKEN:-}"
  printf 'MARKER=%s\\n' "\${${LODY_MANAGED_GH_TOKEN_SHA256_ENV}:-}"
  exit 0
fi
printf '%s\\n' "$*"
`
  );
});

afterEach(async () => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  if (tokenBroker) {
    await new Promise<void>((resolve) => tokenBroker?.close(() => resolve()));
    tokenBroker = null;
  }
  if (tempHomeDir) {
    rmSync(tempHomeDir, { recursive: true, force: true });
    tempHomeDir = null;
  }
  if (fakeBinDir) {
    rmSync(fakeBinDir, { recursive: true, force: true });
    fakeBinDir = null;
  }
});

describe('ensureGhShimScript', () => {
  it.each([
    ['run', 'list', '--branch', 'main', '--limit', '5'],
    ['workflow', 'run', 'build.yml', '--field', 'url=https://other.ghe.com/owner/decoy'],
    ['release', 'upload', 'v1.0.0', 'https://other.ghe.com/owner/decoy.zip', '--clobber'],
    ['cache', 'list', '--limit', '5'],
    ['label', 'list', '--search', 'bug'],
  ])('uses the ambient repository for managed repository commands: %j', async (...args) => {
    await expectManagedTarget({ GH_REPO: 'github.com/owner/target' }, args);
  });

  it.each([
    ['run', 'list', '-R', 'github.com/owner/target', '--workflow', 'build.yml', '-L5'],
    ['repo', 'view', 'https://github.com/owner/target', '--json', 'name'],
    ['repo', 'view', 'owner/target', '--json', 'name'],
    ['repo', 'archive', 'owner/target', '--yes'],
    ['repo', 'delete', 'owner/target', '--yes'],
    ['repo', 'edit', 'owner/target', '--description', 'https://other.ghe.com/owner/decoy'],
    ['repo', 'rename', 'new-name', '-Rgithub.com/owner/target', '--yes'],
  ])('resolves explicit targets for managed repository commands: %j', async (...args) => {
    await expectManagedTarget({ GH_REPO: 'other.ghe.com/ambient/repo' }, args);
  });

  it.each([
    ['run', 'list', '-R', 'other.ghe.com/owner/target', '--branch', 'https://github.com/decoy'],
    ['repo', 'view', 'https://other.ghe.com/owner/target', '--json', 'name'],
    ['workflow', 'run', 'build.yml', '--field', 'url=https://github.com/owner/decoy'],
    ['release', 'upload', 'v1.0.0', 'https://github.com/owner/decoy.zip', '--clobber'],
  ])(
    'keeps Enterprise repository command targets ahead of URL-valued arguments: %j',
    async (...args) => {
      await expectManagedDenied(
        { GH_REPO: 'other.ghe.com/owner/target' },
        args,
        'No managed GitHub credential'
      );
    }
  );

  it.each([
    ['--help'],
    ['-h'],
    ['--help=true'],
    ['https://other.ghe.com/repos/owner/repo', '--help'],
  ])(
    'runs API help without credentials, broker access or auth probes: %j',
    async (...options) => {
      const log = path.join(tempHomeDir!, 'help-invocations');
      writeFakeGh(`#!/bin/sh
printf '%s\\n' "$*" >> "$FAKE_GH_EXEC_LOG"
if [ -n "$GH_TOKEN$GITHUB_TOKEN$GH_ENTERPRISE_TOKEN$GITHUB_ENTERPRISE_TOKEN" ]; then exit 91; fi
printf '%s\\n' "$*"
`);
      ensureGhShimScript();
      const result = await runShim(
        { LODY_GIT_CRED_CONTEXT_TOKEN: undefined, FAKE_GH_EXEC_LOG: log, GH_TOKEN: 'owner-token' },
        ['api', ...options]
      );
      expect(result.status).toBe(0);
      expect(result.stdout).toBe('api --help\n');
      expect(readFileSync(log, 'utf8')).toBe('api --help\n');
      expect(endpointRequests).toEqual([]);
    },
    SHIM_INTEGRATION_TIMEOUT_MS
  );

  it.each([
    ['--help=false'],
    ['--help', '--help=false'],
    ['-h=false'],
    ['--template', '--help'],
    ['-t--help'],
    ['--field', 'x=--help'],
    ['--', '--help'],
  ])('does not treat disabled or consumed help as an auth bypass: %j', async (...options) => {
    ensureGhShimScript();
    const result = await runShim({ LODY_GIT_CRED_CONTEXT_TOKEN: undefined }, ['api', ...options]);
    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('context is required');
    expect(endpointRequests).toEqual([]);
  });

  it.each([
    ['https://github.com/owner/target/issues/1', 'https://github.com/owner/target/issues/2'],
    ['1', 'https://github.com/owner/target/issues/2'],
    ['https://github.com/owner/target/issues/1', '2', 'https://github.com/owner/target/issues/3'],
  ])(
    'resolves all subjects of a multi-issue edit to their shared repository: %j',
    async (...subjects) => {
      await expectManagedTarget({ GH_REPO: 'other.ghe.com/ambient/repo' }, [
        'issue',
        'edit',
        ...subjects,
        '--add-label',
        'bug',
      ]);
    }
  );

  it.each([
    ['https://github.com/owner/target/issues/1', 'https://github.com/owner/other/issues/2'],
    ['https://github.com/owner/target/issues/1', 'https://other.ghe.com/owner/target/issues/2'],
  ])(
    'rejects a multi-issue edit spanning different repositories or hosts: %j',
    async (...subjects) => {
      await expectManagedDenied(
        { GH_REPO: 'github.com/owner/target' },
        ['issue', 'edit', ...subjects, '--add-label', 'bug'],
        'Cannot determine the GitHub target safely'
      );
    }
  );

  it('keeps the managed wrapper out of the ordinary CLI bin and removes its legacy copy', () => {
    ensureGhShimScript();
    const managedPath = getGhShimHostPath();
    const binDir = path.join(getLodyDataDir(), 'bin');
    const legacyPath = path.join(binDir, 'gh');
    mkdirSync(binDir, { recursive: true });
    writeFileSync(legacyPath, readFileSync(managedPath), { mode: 0o755 });
    vi.stubEnv('PATH', [binDir, fakeBinDir!, originalPath].join(path.delimiter));

    ensureGhShimScript();

    expect(existsSync(legacyPath)).toBe(false);
    expect(managedPath).toContain('gh-session-bin');
    expect(readFileSync(managedPath, 'utf8')).toContain(path.join(fakeBinDir!, 'gh'));
  });

  it('preserves user executables in the ordinary CLI bin', () => {
    const binDir = path.join(getLodyDataDir(), 'bin');
    mkdirSync(binDir, { recursive: true });
    const userGh = path.join(binDir, 'gh');
    writeFileSync(userGh, '#!/bin/sh\necho user-gh\n', { mode: 0o755 });
    ensureGhShimScript();
    expect(readFileSync(userGh, 'utf8')).toBe('#!/bin/sh\necho user-gh\n');
  });

  it('keeps workspace bindings separate and never chains through another managed wrapper', async () => {
    await startTokenBroker('app-token', { allowLocalAuth: true });
    const firstState = path.join(getLodyDataDir(), 'broker.json');
    const secondState = path.join(getLodyDataDir(), 'second-workspace.json');
    writeFileSync(secondState, readFileSync(firstState));
    ensureGhShimScript(firstState);
    vi.stubEnv(
      'PATH',
      [getGhShimHostBinDir(firstState), fakeBinDir!, originalPath].join(path.delimiter)
    );
    ensureGhShimScript(secondState);
    rmSync(firstState);

    expect(getGhShimHostPath(firstState)).not.toBe(getGhShimHostPath(secondState));
    const result = await runShim({ FAKE_GH_AUTHED: '1' }, ['print-token'], secondState);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toBe('GH_TOKEN=\nGITHUB_TOKEN=\nMARKER=\n');
  });

  it('generates a gh wrapper without PR association behavior', () => {
    ensureGhShimScript();

    const source = readFileSync(getGhShimHostPath(), 'utf8');

    expect(source).toContain('/github-token');
    expect(source).not.toContain('associatePullRequestForCli');
    expect(source).not.toContain('pr create');
  });

  it('generates a Windows gh.cmd launcher that points at the Node shim', () => {
    const restorePlatform = setPlatformForTest('win32');
    try {
      writeFakeGhNamed('gh.cmd', '@echo off\r\n');
      ensureGhShimScript();

      const launcherPath = getGhShimHostPath();
      const launcherSource = readFileSync(launcherPath, 'utf8');
      const nodeShimPath = path.join(getGhShimHostBinDir(), 'gh');
      const nodeShimSource = readFileSync(nodeShimPath, 'utf8');

      expect(launcherPath).toMatch(/gh\.cmd$/i);
      expect(launcherSource).toContain(process.execPath);
      expect(launcherSource).toContain('%~dp0gh');
      expect(nodeShimSource).toContain('/github-token');
      expect(nodeShimSource).toContain(path.join(fakeBinDir!, 'gh.cmd'));
    } finally {
      restorePlatform();
    }
  });

  it(
    'fetches a fresh installation token when the session has no gh auth',
    async () => {
      const broker = await startTokenBroker('installation-token');
      ensureGhShimScript();

      const result = await runShim({
        LODY_GIT_CRED_BROKER_URL: broker.url,
        LODY_GIT_CRED_BROKER_TOKEN: broker.authToken,
        LODY_GITHUB_REPO_FULL_NAME: 'loro-dev/lody',
      });

      expect(result.status).toBe(0);
      expect(result.stdout).toContain('GH_TOKEN=installation-token');
      expect(result.stdout).toContain('GITHUB_TOKEN=installation-token');
      expect(brokerRequestCount).toBe(1);
    },
    SHIM_INTEGRATION_TIMEOUT_MS
  );

  it(
    'preserves an authorized owner GH_TOKEN without fetching a managed token',
    async () => {
      const broker = await startTokenBroker('installation-token', { allowLocalAuth: true });
      ensureGhShimScript();

      const result = await runShim({
        GH_TOKEN: 'user-token',
        LODY_GIT_CRED_BROKER_URL: broker.url,
        LODY_GIT_CRED_BROKER_TOKEN: broker.authToken,
        LODY_GITHUB_REPO_FULL_NAME: 'loro-dev/lody',
      });

      expect(result.status).toBe(0);
      expect(result.stdout).toContain('GH_TOKEN=user-token');
      expect(result.stdout).toContain('GITHUB_TOKEN=');
      expect(brokerRequestCount).toBe(0);
    },
    SHIM_INTEGRATION_TIMEOUT_MS
  );

  it(
    'clears a managed GH_TOKEN while preserving a user-provided GITHUB_TOKEN',
    async () => {
      const broker = await startTokenBroker('installation-token', { allowLocalAuth: true });
      const managedToken = 'old-lody-token';
      ensureGhShimScript();

      const result = await runShim({
        GH_TOKEN: managedToken,
        GITHUB_TOKEN: 'user-github-token',
        [LODY_MANAGED_GH_TOKEN_SHA256_ENV]: getGhTokenFingerprint(managedToken),
        LODY_GIT_CRED_BROKER_URL: broker.url,
        LODY_GIT_CRED_BROKER_TOKEN: broker.authToken,
        LODY_GITHUB_REPO_FULL_NAME: 'loro-dev/lody',
      });

      expect(result.status).toBe(0);
      expect(result.stdout).toContain('GH_TOKEN=');
      expect(result.stdout).toContain('GITHUB_TOKEN=user-github-token');
      expect(result.stdout).not.toContain(managedToken);
      expect(brokerRequestCount).toBe(0);
    },
    SHIM_INTEGRATION_TIMEOUT_MS
  );

  it(
    'uses the broker token before ambient gh auth for managed repo sessions',
    async () => {
      const broker = await startTokenBroker('installation-token');
      const managedToken = 'old-lody-token';
      ensureGhShimScript();

      const result = await runShim({
        FAKE_GH_AUTHED: '1',
        GH_TOKEN: managedToken,
        [LODY_MANAGED_GH_TOKEN_SHA256_ENV]: getGhTokenFingerprint(managedToken),
        LODY_GIT_CRED_BROKER_URL: broker.url,
        LODY_GIT_CRED_BROKER_TOKEN: broker.authToken,
        LODY_GITHUB_REPO_FULL_NAME: 'loro-dev/lody',
      });

      expect(result.status).toBe(0);
      expect(result.stdout).toContain('GH_TOKEN=installation-token');
      expect(result.stdout).toContain('GITHUB_TOKEN=installation-token');
      expect(result.stdout).not.toContain(managedToken);
      expect(brokerRequestCount).toBe(1);
    },
    SHIM_INTEGRATION_TIMEOUT_MS
  );

  it(
    'fails closed when the broker rejects the requester context',
    async () => {
      const broker = await startTokenBroker('ignored-token', { contextStatus: 403 });
      const managedToken = 'old-lody-token';
      ensureGhShimScript();

      const result = await runShim({
        GH_TOKEN: managedToken,
        [LODY_MANAGED_GH_TOKEN_SHA256_ENV]: getGhTokenFingerprint(managedToken),
        LODY_GIT_CRED_BROKER_URL: broker.url,
        LODY_GIT_CRED_BROKER_TOKEN: broker.authToken,
        LODY_GIT_CRED_CONTEXT_TOKEN: 'stale-context',
        LODY_GITHUB_REPO_FULL_NAME: 'loro-dev/lody',
      });

      expect(result.status).toBe(1);
      expect(result.stdout).toBe('');
      expect(result.stderr).toContain('context is unavailable or expired');
      expect(brokerRequestCount).toBe(0);
    },
    SHIM_INTEGRATION_TIMEOUT_MS
  );
  it('prefers the owner local login over an inherited managed token', async () => {
    const broker = await startTokenBroker('app-token', { allowLocalAuth: true });
    ensureGhShimScript();
    const result = await runShim({
      FAKE_GH_AUTHED: '1',
      GH_TOKEN: 'stale-token',
      [LODY_MANAGED_GH_TOKEN_SHA256_ENV]: getGhTokenFingerprint('stale-token'),
      LODY_GIT_CRED_CONTEXT_TOKEN: 'owner-context',
      LODY_GIT_CRED_BROKER_URL: broker.url,
      LODY_GIT_CRED_BROKER_TOKEN: broker.authToken,
      LODY_GITHUB_REPO_FULL_NAME: 'loro-dev/lody',
    });
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toBe('GH_TOKEN=\nGITHUB_TOKEN=\nMARKER=\n');
    expect(brokerRequestCount).toBe(0);
  });

  it.each([{ GH_TOKEN: 'expired-token' }, { FAKE_GH_AUTHED: '1', FAKE_GH_LOCAL_INVALID: '1' }, {}])(
    'falls back for absent or revoked owner credentials: %j',
    async (credentials) => {
      const broker = await startTokenBroker('app-token', { allowLocalAuth: true });
      ensureGhShimScript();
      const result = await runShim({
        ...credentials,
        LODY_GIT_CRED_CONTEXT_TOKEN: 'owner-context',
        LODY_GIT_CRED_BROKER_URL: broker.url,
        LODY_GIT_CRED_BROKER_TOKEN: broker.authToken,
        LODY_GITHUB_REPO_FULL_NAME: 'loro-dev/lody',
      });
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('GH_TOKEN=app-token');
      expect(brokerRequestCount).toBe(1);
    }
  );

  it('tries GITHUB_TOKEN after a revoked GH_TOKEN without changing the parent env', async () => {
    ensureGhShimScript();
    const broker = await startTokenBroker('app-token', { allowLocalAuth: true });
    const env = {
      GH_TOKEN: 'expired-token',
      GITHUB_TOKEN: 'user-token',
      LODY_GIT_CRED_BROKER_URL: broker.url,
      LODY_GIT_CRED_BROKER_TOKEN: broker.authToken,
    };
    const result = await runShim(env);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('GH_TOKEN=\nGITHUB_TOKEN=user-token');
    expect(env.GH_TOKEN).toBe('expired-token');
  });

  it.each(['HTTP 403', 'HTTP 429', 'HTTP 500', 'network unavailable'])(
    'preserves local identity on %s and runs a failed write exactly once',
    async (error) => {
      const broker = await startTokenBroker('app-token', { allowLocalAuth: true });
      ensureGhShimScript();
      const log = path.join(tempHomeDir!, 'executed');
      const result = await runShim(
        {
          FAKE_GH_AUTHED: '1',
          FAKE_GH_PROBE_ERROR: error,
          FAKE_GH_COMMAND_ERROR: 'HTTP 401',
          FAKE_GH_EXEC_LOG: log,
          LODY_GIT_CRED_CONTEXT_TOKEN: 'owner-context',
          LODY_GIT_CRED_BROKER_URL: broker.url,
          LODY_GIT_CRED_BROKER_TOKEN: broker.authToken,
          LODY_GITHUB_REPO_FULL_NAME: 'loro-dev/lody',
        },
        ['pr', 'create']
      );
      expect(result.status).toBe(1);
      expect(result.stderr).toBe('HTTP 401');
      expect(readFileSync(log, 'utf8')).toBe('pr create\n');
      expect(brokerRequestCount).toBe(0);
    }
  );

  it('never falls back to the host login when managed credentials are unavailable', async () => {
    const broker = await startTokenBroker('ignored', { status: 403 });
    ensureGhShimScript();
    const result = await runShim({
      FAKE_GH_AUTHED: '1',
      LODY_GIT_CRED_CONTEXT_TOKEN: 'teammate-context',
      LODY_GIT_CRED_BROKER_URL: broker.url,
      LODY_GIT_CRED_BROKER_TOKEN: broker.authToken,
      LODY_GITHUB_REPO_FULL_NAME: 'loro-dev/lody',
    });
    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
  });

  it.each(['GH_TOKEN', 'GITHUB_TOKEN', 'GH_ENTERPRISE_TOKEN', 'GITHUB_ENTERPRISE_TOKEN'])(
    'does not accept a teammate inherited %s before broker authorization',
    async (key) => {
      const broker = await startTokenBroker('unused', { status: 403 });
      ensureGhShimScript();
      const result = await runShim(
        {
          [key]: 'owner-token',
          FAKE_GH_AUTHED: '1',
          LODY_GIT_CRED_CONTEXT_TOKEN: 'teammate-context',
          LODY_GIT_CRED_BROKER_URL: broker.url,
          LODY_GIT_CRED_BROKER_TOKEN: broker.authToken,
          LODY_GITHUB_REPO_FULL_NAME: 'loro-dev/lody',
        },
        [
          'api',
          '--hostname',
          key.includes('ENTERPRISE') ? 'enterprise.example' : 'github.com',
          'user',
        ]
      );
      expect(result.status).toBe(1);
      expect(result.stdout).toBe('');
      expect(result.stderr).toContain('No managed GitHub credential');
    }
  );

  it('rejects an expired context even when an explicit token is valid', async () => {
    const broker = await startTokenBroker('unused', { contextStatus: 403 });
    ensureGhShimScript();
    const result = await runShim({
      GH_TOKEN: 'owner-token',
      LODY_GIT_CRED_BROKER_URL: broker.url,
      LODY_GIT_CRED_BROKER_TOKEN: broker.authToken,
      LODY_GITHUB_REPO_FULL_NAME: 'loro-dev/lody',
    });
    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('context is unavailable or expired');
    expect(brokerRequestCount).toBe(0);
  });

  it('strips mixed-case Windows credential names before the managed child executes', async () => {
    await startTokenBroker('app-token');
    ensureGhShimScript();
    const result = await runShim(
      {
        FAKE_GH_PRINT_MIXED: '1',
        gh_token: 'owner',
        GitHub_Token: 'owner',
        Gh_Enterprise_Token: 'owner',
        github_enterprise_token: 'owner',
        LODY_GITHUB_REPO_FULL_NAME: 'loro-dev/lody',
      },
      ['api', 'graphql']
    );
    expect(result.status).toBe(0);
    expect(result.stdout).toBe('|||');
  });

  it('ignores caller-supplied broker authorities, including state and installation paths', async () => {
    await startTokenBroker('unused', { status: 403 });
    ensureGhShimScript();
    let hostileRequests = 0;
    const hostile = http.createServer((_req, res) => {
      hostileRequests++;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ allowLocalAuth: true, token: 'hostile-token' }));
    });
    await new Promise<void>((resolve) => hostile.listen(0, '127.0.0.1', resolve));
    try {
      const address = hostile.address();
      if (!address || typeof address === 'string')
        throw new Error('Missing hostile broker address');
      const url = `http://127.0.0.1:${address.port}`;
      const hostileState = path.join(tempHomeDir!, 'broker.json');
      writeFileSync(hostileState, JSON.stringify({ url, token: 'hostile-token' }));
      const result = await runShim({
        GH_TOKEN: 'owner-token',
        FAKE_GH_AUTHED: '1',
        LODY_GIT_CRED_BROKER_URL: url,
        LODY_GIT_CRED_BROKER_TOKEN: 'hostile-token',
        LODY_GIT_CRED_BROKER_STATE_FILE: hostileState,
        LODY_DATA_DIR: tempHomeDir!,
        LODY_PLATFORM: 'cloud',
        LODY_GITHUB_REPO_FULL_NAME: 'loro-dev/lody',
      });
      expect(result.status).toBe(1);
      expect(result.stdout).toBe('');
      expect(result.stderr).toContain('No managed GitHub credential');
      expect(hostileRequests).toBe(0);
      expect(brokerRequestCount).toBe(1);
    } finally {
      await new Promise<void>((resolve) => hostile.close(() => resolve()));
    }
  });

  it('does not fall back to environment authority when trusted state is unavailable', async () => {
    const broker = await startTokenBroker('app-token', { allowLocalAuth: true });
    ensureGhShimScript();
    rmSync(path.join(getLodyDataDir(), 'broker.json'));
    const result = await runShim({
      GH_TOKEN: 'owner-token',
      LODY_GIT_CRED_BROKER_URL: broker.url,
      LODY_GIT_CRED_BROKER_TOKEN: broker.authToken,
    });
    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('context is unavailable or expired');
  });

  it.each([
    ['--repo', 'enterprise.example/owner/repo'],
    ['--repo=https://enterprise.example/owner/repo'],
  ])('does not inject github.com credentials for %j', async (...args) => {
    const broker = await startTokenBroker('app-token', { allowLocalAuth: true });
    ensureGhShimScript();
    const result = await runShim(
      {
        LODY_GIT_CRED_CONTEXT_TOKEN: 'owner-context',
        LODY_GIT_CRED_BROKER_URL: broker.url,
        LODY_GIT_CRED_BROKER_TOKEN: broker.authToken,
        LODY_GITHUB_REPO_FULL_NAME: 'loro-dev/lody',
      },
      ['print-token', ...args]
    );
    expect(result.status).toBe(0);
    expect(result.stdout).not.toContain('app-token');
    expect(brokerRequestCount).toBe(0);
  });

  it.each([
    ['api', 'user'],
    ['auth', 'token'],
  ])('rejects calls with removed context and repo markers: %j', async (...args) => {
    const broker = await startTokenBroker('app-token');
    ensureGhShimScript();
    const result = await runShim(
      {
        FAKE_GH_AUTHED: '1',
        GH_TOKEN: 'owner-token',
        LODY_GIT_CRED_BROKER_URL: broker.url,
        LODY_GIT_CRED_BROKER_TOKEN: broker.authToken,
        LODY_GIT_CRED_CONTEXT_TOKEN: undefined,
        LODY_GITHUB_REPO_FULL_NAME: undefined,
      },
      args
    );
    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('context is required');
    expect(brokerRequestCount).toBe(0);
  });

  it.each([
    ['api', '--hostname', 'other.ghe.com', 'repos/owner/repo/issues'],
    ['api', 'https://other.ghe.com/repos/owner/repo/issues'],
    ['pr', 'view', 'https://other.ghe.com/owner/repo/pull/1'],
    ['issue', 'view', 'https://other.ghe.com/owner/repo/issues/1'],
  ])('keeps an explicit command host ahead of github.com repo context: %j', async (...args) => {
    const broker = await startTokenBroker('app-token', { allowLocalAuth: true });
    ensureGhShimScript();
    const result = await runShim(
      {
        GH_REPO: 'github.com/loro-dev/lody',
        LODY_GIT_CRED_CONTEXT_TOKEN: 'owner-context',
        LODY_GIT_CRED_BROKER_URL: broker.url,
        LODY_GIT_CRED_BROKER_TOKEN: broker.authToken,
        LODY_GITHUB_REPO_FULL_NAME: 'loro-dev/lody',
      },
      args
    );
    expect(result.status).toBe(0);
    expect(brokerRequestCount).toBe(0);
  });

  it.each([
    [
      '--template',
      'https://api.github.com/repos/owner/decoy',
      'https://other.ghe.com/api/v3/repos/owner/private',
    ],
    [
      '-it',
      'https://api.github.com/repos/owner/decoy',
      'https://other.ghe.com/api/v3/repos/owner/private',
    ],
    ['--template', '--hostname=github.com', '--hostname', 'other.ghe.com', 'repos/owner/private'],
    ['--hostname', 'github.com', '--hostname', 'other.ghe.com', 'repos/owner/private'],
  ])(
    'never selects API credentials from consumed values: %j',
    async (...options) => {
      await expectManagedDenied(
        { LODY_GITHUB_REPO_FULL_NAME: 'owner/ambient' },
        ['api', ...options],
        'No managed GitHub credential'
      );
    },
    SHIM_INTEGRATION_TIMEOUT_MS
  );

  it.each([
    [
      '--template',
      'https://other.ghe.com/repos/owner/decoy',
      'https://api.github.com/repos/owner/target',
    ],
    ['--template', '--hostname=other.ghe.com', 'https://api.github.com/repos/owner/target'],
    ['--hostname', 'other.ghe.com', '--hostname=github.com', 'repos/owner/target'],
    ['-itliteral', '--cache=60m', 'https://api.github.com/repos/owner/target'],
    [
      '--field',
      'url=https://other.ghe.com/repos/owner/decoy',
      '--method=GET',
      'https://api.github.com/repos/owner/target',
    ],
    ['--include=false', '--', 'https://api.github.com/repos/owner/target'],
  ])(
    'resolves the API endpoint with known option arities: %j',
    async (...options) => {
      const args = ['api', ...options];
      await expectManagedTarget({ LODY_GITHUB_REPO_FULL_NAME: 'owner/ambient' }, args);
    },
    SHIM_INTEGRATION_TIMEOUT_MS
  );

  it.each([
    [],
    ['--template', 'https://api.github.com/repos/owner/decoy'],
    ['--unknown', 'https://api.github.com/repos/owner/target'],
    ['repos/owner/target', 'https://other.ghe.com/repos/owner/private'],
    ['--include=invalid', 'repos/owner/target'],
    ['http://api.github.com/repos/owner/target'],
    ['ftp://api.github.com/repos/owner/target'],
  ])(
    'rejects ambiguous API arguments without managed credentials: %j',
    async (...options) => {
      await expectManagedDenied(
        { LODY_GITHUB_REPO_FULL_NAME: 'owner/ambient' },
        ['api', ...options],
        'Cannot determine the GitHub target safely'
      );
    },
    SHIM_INTEGRATION_TIMEOUT_MS
  );

  it.each(
    [
      ['repo', 'clone', 'https://other.ghe.com/owner/repo'],
      ['repo', 'sync', 'owner/target', '--source', 'other.ghe.com/owner/source'],
      [
        'label',
        'clone',
        'https://github.com/owner/source',
        '--repo',
        'attacker.ghe.com/owner/target',
      ],
      ['api', 'http://api.github.com/repos/owner/target'],
    ].flatMap((args) => [false, true].map((owner) => ({ args, owner })))
  )(
    'leaves unsafe managed targets to owner native auth: $args (owner=$owner)',
    async ({ args, owner }) => {
      await startTokenBroker('app-token', { allowLocalAuth: owner });
      ensureGhShimScript();
      const result = await runShim({ LODY_GITHUB_REPO_FULL_NAME: 'owner/ambient' }, args);
      expect(result.status).toBe(owner ? 0 : 1);
      expect(result.stdout).toBe(owner ? args.join(' ') + '\n' : '');
      if (!owner) expect(result.stderr).toContain('Cannot determine the GitHub target safely');
      expect(brokerRequests).toEqual([]);
    },
    SHIM_INTEGRATION_TIMEOUT_MS
  );

  it.each([
    ['pr', '--comments', 'pull'],
    ['pr', '-c', 'pull'],
    ['pr', '--web', 'pull'],
    ['pr', '-cw', 'pull'],
    ['pr', '--comments=false', 'pull'],
    ['issue', '--comments', 'issues'],
  ])(
    'resolves a teammate %s view URL after boolean flag %s',
    async (command, flag, subjectPath) => {
      const args = [command, 'view', flag, `https://github.com/owner/target/${subjectPath}/1`];
      await expectManagedTarget({ GH_REPO: 'other.ghe.com/ambient/repo' }, args);
    },
    SHIM_INTEGRATION_TIMEOUT_MS
  );

  it.each([
    ['pr', 'checkout', '--force'],
    ['pr', 'co', '--force'],
    ['pr', 'checkout', '-f', '--detach', '--recurse-submodules'],
    ['pr', 'checks', '--watch', '--required', '--fail-fast'],
    ['pr', 'diff', '--name-only', '--patch'],
    ['pr', 'diff', '--exclude', '*.lock'],
    ['pr', 'diff', '-e', '*.lock'],
    ['pr', 'diff', '-e*.lock', '--exclude=generated/*'],
    ['issue', 'close', '--duplicate-of', '2'],
    ['issue', 'delete', '--confirm'],
    ['issue', 'edit', '--type', 'Bug'],
    ['issue', 'edit', '--remove-type'],
    ['issue', 'edit', '--parent', '2'],
    ['issue', 'edit', '--remove-parent'],
    ['issue', 'edit', '--add-sub-issue', '2'],
    ['issue', 'edit', '--remove-sub-issue', '2'],
    ['issue', 'edit', '--add-blocked-by', '2'],
    ['issue', 'edit', '--remove-blocked-by', '2'],
    ['issue', 'edit', '--add-blocking', '2'],
    ['issue', 'edit', '--remove-blocking', '2'],
    ['pr', 'close', '--delete-branch'],
    ['pr', 'comment', '--edit-last', '--create-if-none', '--editor'],
    ['pr', 'edit', '--remove-milestone'],
    ['pr', 'merge', '--auto', '--squash', '--delete-branch'],
    ['pr', 'merge', '-md', '--admin=false'],
    ['pr', 'ready', '--undo'],
    ['pr', 'review', '--approve'],
    ['pr', 'review', '-c'],
    ['pr', 'revert', '--draft'],
    ['pr', 'update-branch', '--rebase'],
    ['issue', 'comment', '--delete-last', '--yes'],
    ['issue', 'delete', '--yes'],
    ['issue', 'develop', '--checkout'],
    ['issue', 'develop', '-l'],
    ['issue', 'edit', '--remove-milestone'],
    ['pr', 'view', '--json=title', '--template={{.title}}'],
    ['pr', 'view', '-ct{{.title}}'],
    ['pr', 'view', '-ct={{.title}}'],
    ['pr', 'view', '-c=false'],
    ['pr', 'checkout', '--branch', 'feature', '-f'],
    ['pr', 'view', '--'],
  ])(
    'resolves a teammate subject URL with command-specific options: %j',
    async (...prefix) => {
      const subjectPath = prefix[0] === 'pr' ? 'pull' : 'issues';
      const args = [...prefix, `https://github.com/owner/target/${subjectPath}/1`];
      await expectManagedTarget({ GH_REPO: 'other.ghe.com/ambient/repo' }, args);
    },
    SHIM_INTEGRATION_TIMEOUT_MS
  );

  it.each([
    ['--template', '-Rgithub.com/owner/repo', '1'],
    ['--template', '--repo=github.com/owner/repo', '1'],
    ['--template', '--hostname=github.com', '1'],
    ['-cRother.ghe.com/owner/repo', '1'],
  ])('keeps consumed option values out of host/repo resolution: %j', async (...options) => {
    await expectManagedDenied(
      { GH_HOST: 'other.ghe.com', GH_REPO: 'owner/repo' },
      ['pr', 'view', ...options],
      'No managed GitHub credential'
    );
  });

  it.each([
    ['pr', 'create', '--draft', '--body', 'text'],
    ['pr', 'list', '--draft=false', '--search', 'label:bug'],
    ['pr', 'status', '--conflict-status', '--json=number'],
    ['issue', 'create', '--editor', '--title', 'Bug'],
    ['issue', 'list', '--state', 'all'],
    ['issue', 'status', '--json=number'],
    ['pr', 'new', '--fill'],
    ['issue', 'ls', '--web'],
  ])(
    'resolves repository-only PR/Issue commands without scanning values: %j',
    async (...prefix) => {
      const args = [...prefix, '--repo=github.com/owner/target'];
      await expectManagedTarget({ GH_REPO: 'other.ghe.com/ambient/repo' }, args);
    }
  );

  it.each([
    ['-R', 'github.com/owner/target', 'pr', 'view', '1'],
    ['--repo=https://github.com/owner/target', 'issue', 'list'],
    ['pr', '-R', 'github.com/owner/target', 'view', '1'],
    ['issue', '--repo', 'github.com/owner/target', 'list'],
    ['pr', '--repo=https://github.com/owner/target', 'view', '1'],
    ['pr', 'view', '1', '-R', 'https://github.com/owner/target'],
    ['pr', 'comment', '1', '--body', 'https://example.com', '-Rowner/target'],
    ['pr', 'create', '--body', 'https://example.com', '--title', 'Link', '-Rowner/target'],
  ])('consumes inherited flags and URL option values without ambiguity: %j', async (...args) => {
    await expectManagedTarget({ GH_REPO: 'other.ghe.com/ambient/repo' }, args);
  });

  it.each([
    ['-Rgithub.com/ambient/repo', 'pr', 'view', 'https://other.ghe.com/owner/repo/pull/1'],
    ['pr', '-R', 'https://other.ghe.com/owner/repo', 'view', '1'],
    ['issue', 'view', '1', '--repo=https://other.ghe.com/owner/repo'],
    ['pr', '--repo', '--comments', 'view', 'https://other.ghe.com/owner/repo/pull/1'],
  ])(
    'keeps inherited and URL-form Enterprise repo flags out of managed auth: %j',
    async (...args) => {
      await expectManagedDenied(
        { GH_REPO: 'github.com/ambient/repo' },
        args,
        'No managed GitHub credential'
      );
    }
  );

  it.each([
    ['pr', 'create', '--body', '-Rgithub.com/owner/repo'],
    ['pr', 'list', '--search', '--repo=github.com/owner/repo'],
    ['pr', 'status', '--template', '--repo=github.com/owner/repo'],
    ['issue', 'create', '--body', '--repo=github.com/owner/repo'],
    ['issue', 'list', '--search', '-Rgithub.com/owner/repo'],
    ['issue', 'status', '--template', '--repo=github.com/owner/repo'],
  ])(
    'preserves the enterprise repo when a repository-only option value resembles a repo flag: %j',
    async (...args) => {
      await expectManagedDenied(
        { GH_REPO: 'other.ghe.com/ambient/repo' },
        args,
        'No managed GitHub credential'
      );
    }
  );

  it.each([
    ['--issue-repo', 'github.com/owner/target', '--repo', 'github.com/branch/repo', '1'],
    ['--repo', 'github.com/branch/repo', '-igithub.com/owner/target', '1'],
    ['--issue-repo', 'other.ghe.com/owner/repo', 'https://github.com/owner/target/issues/1'],
  ])('honors the develop issue selector and subject URL precedence: %j', async (...options) => {
    const args = ['issue', 'develop', ...options];
    await expectManagedTarget({ GH_REPO: 'other.ghe.com/ambient/repo' }, args);
  });

  it.each([
    ['--repo', 'github.com/branch/repo', '--issue-repo', 'other.ghe.com/owner/repo', '1'],
    ['-iother.ghe.com/owner/repo', '--repo', 'github.com/branch/repo', '1'],
    ['--issue-repo=github.com/owner/repo', 'https://other.ghe.com/owner/repo/issues/1'],
    ['--issue-repo=', '--repo', 'github.com/branch/repo', '1'],
  ])('keeps Enterprise develop targets out of managed auth: %j', async (...options) => {
    await expectManagedDenied(
      { GH_REPO: 'other.ghe.com/ambient/repo' },
      ['issue', 'develop', ...options],
      'No managed GitHub credential'
    );
  });

  it.each([
    [
      'issue',
      'develop',
      '--issue-repo',
      'github.com/owner/target',
      '--repo',
      'other.ghe.com/branch/repo',
      '1',
    ],
    ['issue', 'develop', '--repo', 'other.ghe.com/branch/repo', '-igithub.com/owner/target', '1'],
    [
      'issue',
      'develop',
      '--branch-repo',
      'other.ghe.com/branch/repo',
      'https://github.com/owner/target/issues/1',
    ],
    [
      'issue',
      'develop',
      '--branch-repo',
      'branch/repo',
      'https://github.com/owner/target/issues/1',
    ],
    [
      'issue',
      'close',
      '--duplicate-of',
      'https://other.ghe.com/owner/repo/issues/2',
      'https://github.com/owner/target/issues/1',
    ],
  ])('rejects managed auth for secondary Enterprise targets: %j', async (...args) => {
    await expectManagedDenied(
      { GH_HOST: 'other.ghe.com', GH_REPO: 'github.com/owner/target' },
      args,
      'Cannot determine the GitHub target safely'
    );
  });

  it.each([
    [
      'issue',
      'develop',
      '--branch-repo',
      'github.com/branch/repo',
      'https://github.com/owner/target/issues/1',
    ],
    [
      'issue',
      'close',
      '--duplicate-of',
      'https://github.com/owner/target/issues/2',
      'https://github.com/owner/target/issues/1',
    ],
  ])('allows managed auth for secondary github.com targets: %j', async (...args) => {
    await expectManagedTarget({ GH_HOST: 'other.ghe.com' }, args);
  });

  it.each([false, true])(
    'pins implicit hosts only for managed credentials (owner=%s)',
    async (owner) => {
      await startTokenBroker('app-token', { allowLocalAuth: owner });
      ensureGhShimScript();
      const result = await runShim(
        {
          FAKE_GH_PRINT_HOST: '1',
          FAKE_GH_AUTHED: owner ? '1' : '',
          GH_HOST: '',
        },
        [
          'issue',
          'develop',
          '--branch-repo',
          'branch/repo',
          'https://github.com/owner/target/issues/1',
        ]
      );
      expect(result.status).toBe(0);
      expect(result.stdout).toBe(owner ? '' : 'github.com');
      expect(brokerRequests).toEqual(
        owner ? [] : [{ repoFullName: 'owner/target', contextToken: 'test-context' }]
      );
    }
  );

  it('keeps exclude patterns out of PR diff target resolution', async () => {
    await expectManagedDenied(
      { GH_REPO: 'github.com/ambient/repo' },
      [
        'pr',
        'diff',
        '--exclude',
        'https://github.com/owner/repo/pull/1',
        'https://other.ghe.com/owner/repo/pull/2',
      ],
      'No managed GitHub credential'
    );
  });

  it('keeps an enterprise URL after a boolean flag out of managed auth', async () => {
    await expectManagedDenied(
      { GH_REPO: 'github.com/loro-dev/lody' },
      ['pr', 'view', '--comments', 'https://other.ghe.com/owner/repo/pull/1'],
      'No managed GitHub credential'
    );
  });

  it.each(['https', 'http'])('rejects a teammate PR URL after flags (%s)', async (protocol) => {
    const broker = await startTokenBroker('app-token');
    ensureGhShimScript();
    const result = await runShim(
      {
        FAKE_GH_AUTHED: '1',
        LODY_GIT_CRED_CONTEXT_TOKEN: 'teammate-context',
        LODY_GIT_CRED_BROKER_URL: broker.url,
        LODY_GIT_CRED_BROKER_TOKEN: broker.authToken,
        LODY_GITHUB_REPO_FULL_NAME: 'loro-dev/lody',
      },
      ['pr', 'view', '--json', 'title', `${protocol}://other.ghe.com/owner/repo/pull/1`]
    );
    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('No managed GitHub credential');
    expect(brokerRequestCount).toBe(0);
  });

  it.each([
    [
      'pr',
      'comment',
      '--body',
      'https://github.com/loro-dev/lody/pull/1',
      'https://other.ghe.com/owner/repo/pull/2',
    ],
    ['pr', 'comment', '--body', 'https://github.com/loro-dev/lody/pull/1', '2'],
    ['pr', 'view', '--template', 'https://github.com/loro-dev/lody/pull/1', '2'],
    ['pr', 'view', '-ct', 'https://github.com/loro-dev/lody/pull/1', '2'],
    ['pr', 'view', '--unknown', 'https://github.com/loro-dev/lody/pull/1'],
    ['pr', 'close', '-c', 'https://github.com/loro-dev/lody/pull/1', '2'],
    ['pr', 'close', '-dc', 'https://github.com/loro-dev/lody/pull/1', '2'],
    ['pr', 'edit', '-m', 'https://github.com/loro-dev/lody/pull/1', '2'],
    ['pr', 'lock', '-r', 'https://github.com/loro-dev/lody/pull/1', '2'],
    ['issue', 'close', '-c', 'https://github.com/loro-dev/lody/issues/1', '2'],
    ['pr', 'view', '--comments', '--unknown', 'value', 'https://github.com/loro-dev/lody/pull/1'],
    ['pr', 'view', '--comments=invalid', 'https://github.com/loro-dev/lody/pull/1'],
    ['pr', 'view', '--template=https://github.com/loro-dev/lody/pull/1', '2'],
    ['pr', 'comment', '-bhttps://github.com/loro-dev/lody/pull/1', '2'],
    ['pr', 'view', '-ct=https://github.com/loro-dev/lody/pull/1', '2'],
    ['pr', 'unknown', '--repo=github.com/owner/repo'],
    ['issue', 'unknown', '--repo=github.com/owner/repo'],
    ['pr', 'list', 'https://github.com/loro-dev/lody/pull/1'],
    ['issue', 'create', 'https://github.com/loro-dev/lody/issues/1'],
  ])('does not mistake a body URL for the target in a teammate session: %j', async (...args) => {
    const broker = await startTokenBroker('app-token');
    ensureGhShimScript();
    const result = await runShim(
      {
        FAKE_GH_AUTHED: '1',
        GH_REPO: 'other.ghe.com/owner/repo',
        LODY_GIT_CRED_CONTEXT_TOKEN: 'teammate-context',
        LODY_GIT_CRED_BROKER_URL: broker.url,
        LODY_GIT_CRED_BROKER_TOKEN: broker.authToken,
        LODY_GITHUB_REPO_FULL_NAME: 'loro-dev/lody',
      },
      args
    );
    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toMatch(
      /Cannot determine the GitHub target|No managed GitHub credential/
    );
    expect(brokerRequestCount).toBe(0);
  });

  it('lets native gh resolve ambiguous owner command arguments without an App token', async () => {
    const broker = await startTokenBroker('app-token', { allowLocalAuth: true });
    ensureGhShimScript();
    const args = ['pr', 'comment', '--unknown', 'https://github.com/loro-dev/lody/pull/1', '2'];
    const result = await runShim(
      {
        LODY_GIT_CRED_CONTEXT_TOKEN: 'owner-context',
        LODY_GIT_CRED_BROKER_URL: broker.url,
        LODY_GIT_CRED_BROKER_TOKEN: broker.authToken,
        LODY_GITHUB_REPO_FULL_NAME: 'loro-dev/lody',
      },
      args
    );
    expect(result.status).toBe(0);
    expect(result.stdout).toBe(args.join(' ') + '\n');
    expect(brokerRequestCount).toBe(0);
  });

  it('resolves gh api repo placeholders before requesting a managed token', async () => {
    const broker = await startTokenBroker('app-token');
    ensureGhShimScript();
    const result = await runShim(
      {
        GH_REPO: 'loro-dev/lody',
        LODY_GIT_CRED_BROKER_URL: broker.url,
        LODY_GIT_CRED_BROKER_TOKEN: broker.authToken,
        LODY_GITHUB_REPO_FULL_NAME: 'loro-dev/lody',
      },
      ['api', 'repos/{owner}/{repo}/releases']
    );
    expect(result.status).toBe(0);
    expect(brokerRequestCount).toBe(1);
    expect(brokerRequests).toEqual([
      { repoFullName: 'loro-dev/lody', contextToken: 'test-context' },
    ]);
  });

  it('allows the owner to log in without injecting managed credentials', async () => {
    const broker = await startTokenBroker('app-token', { allowLocalAuth: true });
    ensureGhShimScript();
    const result = await runShim(
      {
        LODY_GIT_CRED_CONTEXT_TOKEN: 'owner-context',
        LODY_GIT_CRED_BROKER_URL: broker.url,
        LODY_GIT_CRED_BROKER_TOKEN: broker.authToken,
        LODY_GITHUB_REPO_FULL_NAME: 'loro-dev/lody',
      },
      ['auth', 'login']
    );
    expect(result.status).toBe(0);
    expect(result.stdout).toBe('auth login\n');
    expect(brokerRequestCount).toBe(0);
  });
});

describe('broker failure contracts', () => {
  it.each([
    { contextRaw: '{' },
    { contextRaw: '{"allowLocalAuth":"true"}' },
    { contextRaw: 'null' },
    { contextStatus: 500 },
    { disconnect: '/github-auth-context' },
  ])(
    'fails closed on invalid context responses: %j',
    async (options) => {
      await startTokenBroker('managed-token', options);
      ensureGhShimScript();
      const result = await runShim({
        GH_TOKEN: 'valid-owner-token',
        LODY_GITHUB_REPO_FULL_NAME: 'loro-dev/lody',
      });
      expect(result.status).toBe(1);
      expect(result.stdout).toBe('');
      expect(result.stderr).toContain('context is unavailable or expired');
      expect(endpointRequests.map((request) => request.endpoint)).toEqual(['/github-auth-context']);
    },
    SHIM_INTEGRATION_TIMEOUT_MS
  );

  it.each([
    { tokenRaw: '{' },
    { tokenRaw: '{"token":7}' },
    { tokenRaw: '{"token":""}' },
    { status: 500 },
    { disconnect: '/github-token' },
  ])(
    'fails closed when managed token retrieval fails: %j',
    async (options) => {
      await startTokenBroker('managed-token', options);
      ensureGhShimScript();
      const result = await runShim({
        GH_TOKEN: 'valid-owner-token',
        LODY_GITHUB_REPO_FULL_NAME: 'loro-dev/lody',
      });
      expect(result.status).toBe(1);
      expect(result.stdout).toBe('');
      expect(result.stderr).toContain('No managed GitHub credential');
      expect(endpointRequests.map((request) => request.endpoint)).toEqual([
        '/github-auth-context',
        '/github-token',
      ]);
    },
    SHIM_INTEGRATION_TIMEOUT_MS
  );

  it.each([{}, { rejectStatus: 500 }, { disconnect: '/github-token/reject' }])(
    'reports managed 401 once and preserves failure after rejection: %j',
    async (options) => {
      await startTokenBroker('expired-installation-token', options);
      ensureGhShimScript();
      const commandLog = path.join(tempHomeDir!, 'commands');
      const result = await runShim({
        LODY_GITHUB_REPO_FULL_NAME: 'loro-dev/lody',
        FAKE_GH_COMMAND_ERROR: 'Bad credentials (HTTP 401)',
        FAKE_GH_EXEC_LOG: commandLog,
      });
      expect(result.status).toBe(1);
      expect(result.stderr).toBe('Bad credentials (HTTP 401)');
      expect(readFileSync(commandLog, 'utf8')).toBe('api graphql\n');
      expect(endpointRequests).toEqual([
        { endpoint: '/github-auth-context', body: { contextToken: 'test-context' } },
        {
          endpoint: '/github-token',
          body: { repoFullName: 'loro-dev/lody', contextToken: 'test-context' },
        },
        {
          endpoint: '/github-token/reject',
          body: {
            repoFullName: 'loro-dev/lody',
            contextToken: 'test-context',
            invalidatedToken: 'expired-installation-token',
          },
        },
      ]);
    },
    SHIM_INTEGRATION_TIMEOUT_MS
  );
});

// The argument matrices share one observable contract: the actual child argv
// and the requester-bound broker request, or denial before either can run.
async function expectManagedTarget(env: NodeJS.ProcessEnv, args: string[]): Promise<void> {
  await startTokenBroker('app-token');
  ensureGhShimScript();
  const result = await runShim(env, args);
  expect(result.status).toBe(0);
  expect(result.stdout).toBe(args.join(' ') + '\n');
  expect(brokerRequests).toEqual([{ repoFullName: 'owner/target', contextToken: 'test-context' }]);
}

async function expectManagedDenied(
  env: NodeJS.ProcessEnv,
  args: string[],
  message: string
): Promise<void> {
  await startTokenBroker('app-token');
  ensureGhShimScript();
  const result = await runShim(env, args);
  expect(result.status).toBe(1);
  expect(result.stdout).toBe('');
  expect(result.stderr).toContain(message);
  expect(brokerRequests).toEqual([]);
}

const writeFakeGh = (source: string): void => {
  writeFakeGhNamed('gh', source);
};

const writeFakeGhNamed = (name: string, source: string): void => {
  if (!fakeBinDir) {
    throw new Error('fakeBinDir is not initialized');
  }
  writeFileSync(path.join(fakeBinDir, name), source, { encoding: 'utf8', mode: 0o755 });
};

const setPlatformForTest = (platform: NodeJS.Platform): (() => void) => {
  const originalPlatform = process.platform;
  Object.defineProperty(process, 'platform', { value: platform });
  return () => {
    Object.defineProperty(process, 'platform', { value: originalPlatform });
  };
};

const runShim = async (
  env: Record<string, string | undefined>,
  args: string[] = ['api', 'graphql'],
  brokerStateFilePath?: string
): Promise<{ status: number | null; stdout: string; stderr: string }> => {
  const shimPath = getGhShimHostPath(brokerStateFilePath);
  const shimBinDir = getGhShimHostBinDir(brokerStateFilePath);
  if (!fakeBinDir) {
    throw new Error('fakeBinDir is not initialized');
  }
  if (!tempHomeDir) {
    throw new Error('tempHomeDir is not initialized');
  }

  const childEnv: NodeJS.ProcessEnv = {
    HOME: tempHomeDir,
    // Managed invocation fixtures carry a broker context unless a test removes it.
    LODY_GIT_CRED_CONTEXT_TOKEN: 'test-context',
    PATH: [shimBinDir, fakeBinDir, path.dirname(process.execPath)].join(path.delimiter),
  };
  if (process.platform === 'win32') {
    childEnv.USERPROFILE = tempHomeDir;
    childEnv.SystemRoot = process.env.SystemRoot;
    childEnv.ComSpec = process.env.ComSpec;
    childEnv.PATHEXT = process.env.PATHEXT;
  }
  Object.assign(childEnv, env);

  const child = spawn(process.execPath, [shimPath, ...args], {
    env: childEnv,
  });

  let stdout = '';
  let stderr = '';
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk: string) => {
    stdout += chunk;
  });
  child.stderr.on('data', (chunk: string) => {
    stderr += chunk;
  });

  const status = await new Promise<number | null>((resolve, reject) => {
    let settled = false;
    const finish = (callback: () => void): void => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      callback();
    };
    const timeout = setTimeout(() => {
      child.kill('SIGTERM');
      finish(() =>
        reject(
          new Error(
            `gh shim did not exit within ${SHIM_CHILD_TIMEOUT_MS}ms\nstdout:\n${stdout}\nstderr:\n${stderr}`
          )
        )
      );
    }, SHIM_CHILD_TIMEOUT_MS);

    child.on('error', (error) => finish(() => reject(error)));
    child.on('close', (code) => finish(() => resolve(code)));
  });
  return { status, stdout, stderr };
};

const startTokenBroker = async (
  token: string,
  options?: {
    status?: number;
    allowLocalAuth?: boolean;
    contextStatus?: number;
    contextRaw?: string;
    tokenRaw?: string;
    disconnect?: string;
    rejectStatus?: number;
  }
): Promise<{ url: string; authToken: string }> => {
  const authToken = 'broker-auth-token';
  tokenBroker = http.createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => {
      body += String(chunk);
    });
    req.on('end', () => {
      endpointRequests.push({ endpoint: req.url, body: JSON.parse(body) });
      if (options?.disconnect === req.url) {
        req.socket.destroy();
        return;
      }
      res.setHeader('Connection', 'close');
      if (
        req.url === '/github-auth-context' &&
        req.headers.authorization === `Bearer ${authToken}`
      ) {
        res.writeHead(options?.contextStatus ?? 200, { 'Content-Type': 'application/json' });
        res.end(
          options?.contextRaw ??
            JSON.stringify({ allowLocalAuth: options?.allowLocalAuth ?? false })
        );
        return;
      }
      if (
        req.url === '/github-token/reject' &&
        req.headers.authorization === `Bearer ${authToken}`
      ) {
        res.writeHead(options?.rejectStatus ?? 204);
        res.end();
        return;
      }
      if (req.method !== 'POST' || req.url !== '/github-token') {
        res.writeHead(404);
        res.end();
        return;
      }
      if (req.headers.authorization !== `Bearer ${authToken}`) {
        res.writeHead(401);
        res.end();
        return;
      }
      brokerRequestCount += 1;
      brokerRequests.push(JSON.parse(body));
      if (options?.status && options.status !== 200) {
        res.writeHead(options.status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'invalid_context' }));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(options?.tokenRaw ?? JSON.stringify({ token }));
    });
  });

  await new Promise<void>((resolve, reject) => {
    tokenBroker?.once('error', reject);
    tokenBroker?.listen(0, '127.0.0.1', () => resolve());
  });

  const address = tokenBroker.address();
  if (!address || typeof address === 'string') {
    throw new Error('broker did not bind to a TCP port');
  }
  const url = `http://127.0.0.1:${address.port}`;
  mkdirSync(getLodyDataDir(), { recursive: true });
  writeFileSync(
    path.join(getLodyDataDir(), 'broker.json'),
    JSON.stringify({ url, token: authToken })
  );
  return { url, authToken };
};
