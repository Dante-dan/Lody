import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const fixture = vi.hoisted(() => ({ home: '' }));

vi.mock('node:os', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:os')>()),
  homedir: () => fixture.home,
}));

describe('daemon upgrade command execution', () => {
  let lifecycle: typeof import('./machine-lifecycle');
  let argsFile: string;
  let cliEntryPath: string;

  beforeAll(async () => {
    fixture.home = await mkdtemp(path.join(tmpdir(), 'lody upgrade test '));
    argsFile = path.join(fixture.home, 'npm-args.txt');
    cliEntryPath = path.join(fixture.home, 'cli.cjs');
    await writeFile(
      cliEntryPath,
      "process.stdout.write(process.env.LODY_TEST_CLI_VERSION ?? '1.2.3')"
    );
    vi.stubEnv('LODY_DATA_DIR', path.join(fixture.home, 'data'));
    const windows = process.platform === 'win32';
    // Exercise a real .cmd shim on Windows, without invoking the installed npm.
    await writeFile(
      path.join(fixture.home, windows ? 'npm.cmd' : 'npm'),
      windows
        ? '@echo off\r\n> "%LODY_TEST_NPM_ARGS_FILE%" (for %%A in (%*) do @echo %%~A)\r\nexit /b %LODY_TEST_NPM_EXIT_CODE%\r\n'
        : '#!/bin/sh\nprintf "%s\\n" "$@" > "$LODY_TEST_NPM_ARGS_FILE"\nexit "$LODY_TEST_NPM_EXIT_CODE"\n',
      { mode: 0o755 }
    );
    lifecycle = await import('./machine-lifecycle');
  }, 60_000);

  beforeEach(() => vi.stubEnv('LODY_DATA_DIR', path.join(fixture.home, 'data')));

  afterEach(async () => {
    vi.unstubAllEnvs();
    await rm(
      path.join(path.dirname(lifecycle.DAEMON_UPGRADE_INTENT_FILE), 'daemon-upgrade-attempts.json'),
      { force: true }
    );
  });
  afterAll(async () => {
    await rm(fixture.home, { recursive: true, force: true });
  });

  it.each([0, 1])('handles npm shim exit code %i and consumes the intent', async (exitCode) => {
    // An isolated PATH makes accidentally running a real global install impossible.
    vi.stubEnv('PATH', fixture.home);
    vi.stubEnv('LODY_TEST_NPM_ARGS_FILE', argsFile);
    vi.stubEnv('LODY_TEST_NPM_EXIT_CODE', String(exitCode));
    await lifecycle.writeDaemonUpgradeIntent({
      action: 'upgrade',
      requestId: 'synthetic-upgrade',
      requesterUserId: 'synthetic-user',
      targetVersion: '1.2.3',
      requestedAtMs: 0,
    });
    const errors: string[] = [];

    const upgraded = await lifecycle.runDaemonUpgradeFromIntent({
      logger: { error: (message) => errors.push(message) },
      cliEntryPath,
    });

    expect(upgraded).toBe(exitCode === 0);
    expect((await readFile(argsFile, 'utf8')).trim().split(/\s+/)).toEqual([
      'install',
      '-g',
      'lody@1.2.3',
      '--registry=https://registry.npmjs.org',
    ]);
    expect(await lifecycle.readDaemonUpgradeIntent()).toBeNull();
    expect(errors).toEqual(
      exitCode === 0 ? [] : ['[daemon-upgrade] npm install failed with code 1: no output']
    );
  });

  it.each([0, 1])('retains an attempt across module reload after npm exit %i', async (exitCode) => {
    vi.stubEnv('PATH', fixture.home);
    vi.stubEnv('LODY_TEST_NPM_ARGS_FILE', argsFile);
    vi.stubEnv('LODY_TEST_NPM_EXIT_CODE', String(exitCode));
    const intent = {
      action: 'upgrade' as const,
      requestId: 'replayed-upgrade',
      requesterUserId: 'synthetic-user',
      targetVersion: '1.2.3',
      requestedAtMs: 0,
    };
    await lifecycle.prepareDaemonUpgradeAttempt(intent, 1_000);
    expect(
      await lifecycle.resolveDaemonUpgradeReplay({ ...intent, currentVersion: '1.2.2' }, 1_000)
    ).toBe('attempted');
    await lifecycle.writeDaemonUpgradeIntent(intent);
    await lifecycle.runDaemonUpgradeFromIntent({ logger: {}, cliEntryPath, nowMs: 1_000 });
    expect(await lifecycle.readDaemonUpgradeIntent()).toBeNull();
    vi.resetModules();
    const restarted = await import('./machine-lifecycle');
    expect(
      await restarted.resolveDaemonUpgradeReplay({ ...intent, currentVersion: '1.2.3' }, 2_000)
    ).toBe('complete');
    expect(
      await restarted.resolveDaemonUpgradeReplay({ ...intent, currentVersion: '1.2.2' }, 2_000)
    ).toBe('attempted');
    expect(
      await restarted.resolveDaemonUpgradeReplay(
        { ...intent, targetVersion: 'latest', currentVersion: '1.2.3' },
        2_000
      )
    ).toBe('attempted');
    expect(
      await restarted.resolveDaemonUpgradeReplay(
        { ...intent, requestId: 'fresh-request', currentVersion: '1.2.2' },
        2_000
      )
    ).toBe('new');
    expect(
      await restarted.resolveDaemonUpgradeReplay(
        { ...intent, requesterUserId: 'different-user', currentVersion: '1.2.2' },
        2_000
      )
    ).toBe('new');
    expect(
      await restarted.resolveDaemonUpgradeReplay(
        { ...intent, currentVersion: '1.2.2' },
        1_000 + 25 * 60 * 60 * 1000
      )
    ).toBe('new');
    await rm(argsFile, { force: true });
    await restarted.writeDaemonUpgradeIntent(intent);
    const errors: string[] = [];
    expect(
      await restarted.runDaemonUpgradeFromIntent({
        logger: { error: (message) => errors.push(message) },
        cliEntryPath,
        nowMs: 2_000,
      })
    ).toBe(false);
    expect(errors[0]).toMatch(/already attempted/);
    await expect(readFile(argsFile, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
    expect(await restarted.readDaemonUpgradeIntent()).toBeNull();
  });

  it('updates the npm global prefix owning the launch entry', async () => {
    const prefix = path.join(fixture.home, 'actual-prefix');
    const entry = path.join(
      prefix,
      ...(process.platform === 'win32' ? [] : ['lib']),
      'node_modules',
      'lody',
      'dist',
      'index.cjs'
    );
    await mkdir(path.dirname(entry), { recursive: true });
    await writeFile(entry, "process.stdout.write('1.2.3')");
    vi.stubEnv('PATH', fixture.home);
    vi.stubEnv('NPM_CONFIG_PREFIX', path.join(fixture.home, 'wrong-prefix'));
    vi.stubEnv('LODY_TEST_NPM_ARGS_FILE', argsFile);
    vi.stubEnv('LODY_TEST_NPM_EXIT_CODE', '0');
    await lifecycle.writeDaemonUpgradeIntent({
      action: 'upgrade',
      requestId: 'actual-prefix',
      requesterUserId: 'synthetic-user',
      targetVersion: '1.2.3',
      requestedAtMs: 0,
    });
    expect(await lifecycle.runDaemonUpgradeFromIntent({ logger: {}, cliEntryPath: entry })).toBe(
      true
    );
    expect((await readFile(argsFile, 'utf8')).trim().split(/\r?\n/)).toEqual([
      'install',
      '-g',
      'lody@1.2.3',
      '--registry=https://registry.npmjs.org',
      '--prefix',
      await realpath(prefix),
    ]);
    expect(await lifecycle.readDaemonUpgradeIntent()).toBeNull();
  });

  it('does not hand off when npm succeeds but the launch entry is still old', async () => {
    vi.stubEnv('PATH', fixture.home);
    vi.stubEnv('LODY_TEST_NPM_ARGS_FILE', argsFile);
    vi.stubEnv('LODY_TEST_NPM_EXIT_CODE', '0');
    vi.stubEnv('LODY_TEST_CLI_VERSION', '1.2.2');
    await lifecycle.writeDaemonUpgradeIntent({
      action: 'upgrade',
      requestId: 'wrong-prefix',
      requesterUserId: 'synthetic-user',
      targetVersion: '1.2.3',
      requestedAtMs: 0,
    });
    const errors: string[] = [];
    expect(
      await lifecycle.runDaemonUpgradeFromIntent({
        logger: { error: (message) => errors.push(message) },
        cliEntryPath,
      })
    ).toBe(false);
    expect(errors[0]).toContain('daemon entry point did not verify target 1.2.3 (reported 1.2.2)');
    expect(await lifecycle.readDaemonUpgradeIntent()).toBeNull();
    expect(
      await lifecycle.resolveDaemonUpgradeReplay({
        requestId: 'wrong-prefix',
        requesterUserId: 'synthetic-user',
        targetVersion: '1.2.3',
        currentVersion: '1.2.2',
      })
    ).toBe('attempted');
  });

  it('does not install when the retained attempt file is corrupt', async () => {
    vi.stubEnv('PATH', fixture.home);
    vi.stubEnv('LODY_TEST_NPM_ARGS_FILE', argsFile);
    vi.stubEnv('LODY_TEST_NPM_EXIT_CODE', '0');
    await rm(argsFile, { force: true });
    await lifecycle.writeDaemonUpgradeIntent({
      action: 'upgrade',
      requestId: 'new-upgrade',
      requesterUserId: 'synthetic-user',
      targetVersion: '1.2.3',
      requestedAtMs: 0,
    });
    await writeFile(
      path.join(path.dirname(lifecycle.DAEMON_UPGRADE_INTENT_FILE), 'daemon-upgrade-attempts.json'),
      '{invalid'
    );
    const errors: string[] = [];
    expect(
      await lifecycle.runDaemonUpgradeFromIntent({
        logger: { error: (message) => errors.push(message) },
        cliEntryPath,
        nowMs: 1_000,
      })
    ).toBe(false);
    expect(errors[0]).toMatch(/could not retain upgrade attempt/);
    await expect(readFile(argsFile, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
    expect(await lifecycle.readDaemonUpgradeIntent()).toBeNull();
  });
});
