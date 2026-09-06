import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { deriveRepoIdFromGitHubRepo } from '@lody/shared';

import {
  ensureCredentialHelperScript,
  getCredentialHelperHostPath,
} from '../src/lib/git-credential-helper-script';

let tempDir: string;

beforeEach(() => {
  tempDir = mkdtempSync(path.join(os.tmpdir(), 'lody-credential-recovery-'));
  vi.stubEnv('LODY_DATA_DIR', tempDir);
});

afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(tempDir, { recursive: true, force: true });
});

describe('Git credential helper broker recovery', () => {
  it.each(['get', 'erase', 'reject'])(
    'retains the infrastructure bearer while refreshing the broker URL for %s',
    (action) => {
      const repoId = deriveRepoIdFromGitHubRepo('owner/repo');
      ensureCredentialHelperScript(repoId);
      const statePath = path.join(tempDir, 'broker.json');
      const requestsPath = path.join(tempDir, 'requests.jsonl');
      const preloadPath = path.join(tempDir, 'fetch-fixture.cjs');
      writeFileSync(
        statePath,
        JSON.stringify({ url: 'http://current-broker.test', token: 'session-only-bearer' })
      );
      // Run the actual generated helper. Inject the transport failure instead
      // of racing a closed port or depending on DNS/network availability.
      writeFileSync(
        preloadPath,
        `const fs = require('node:fs');
globalThis.fetch = async (url, options) => {
  fs.appendFileSync(process.env.REQUESTS_PATH, JSON.stringify({
    url, authorization: options.headers.Authorization, body: JSON.parse(options.body),
  }) + '\\n');
  if (url.startsWith('http://stale-broker.test/')) {
    throw Object.assign(new Error('stale broker'), { code: 'ECONNREFUSED' });
  }
  if (options.headers.Authorization !== 'Bearer infrastructure-bearer') {
    return new Response('{}', { status: 403 });
  }
  return new Response(JSON.stringify({ username: 'x-access-token', password: 'app-token' }));
};
`
      );

      const result = spawnSync(
        process.execPath,
        ['--require', preloadPath, getCredentialHelperHostPath(repoId), action],
        {
          env: {
            SYSTEMROOT: process.env.SYSTEMROOT,
            LODY_DATA_DIR: tempDir,
            LODY_GIT_CRED_BROKER_STATE_FILE: statePath,
            LODY_GIT_CRED_BROKER_URL: 'http://stale-broker.test',
            LODY_GIT_CRED_BROKER_TOKEN: 'infrastructure-bearer',
            REQUESTS_PATH: requestsPath,
          },
          input:
            'protocol=https\nhost=github.com\npath=owner/repo.git\npassword=rejected-token\n\n',
          encoding: 'utf8',
          timeout: 15_000,
        }
      );

      expect(result.error).toBeUndefined();
      expect(result.status).toBe(0);
      expect(result.stderr).toBe('');
      const endpoint = action === 'get' ? '/git-credential' : '/git-credential/reject';
      const body = {
        repoFullName: 'owner/repo',
        ...(action === 'get' ? {} : { invalidatedToken: 'rejected-token' }),
      };
      expect(
        readFileSync(requestsPath, 'utf8')
          .trim()
          .split('\n')
          .map((line) => JSON.parse(line))
      ).toEqual(
        ['http://stale-broker.test', 'http://current-broker.test'].map((url) => ({
          url: url + endpoint,
          authorization: 'Bearer infrastructure-bearer',
          body,
        }))
      );
      expect(result.stdout).toBe(
        action === 'get' ? 'username=x-access-token\npassword=app-token\n\n' : ''
      );
    }
  );
});
