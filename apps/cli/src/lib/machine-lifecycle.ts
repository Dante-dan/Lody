import type { ChildProcess, SpawnOptions } from 'node:child_process';
import spawn from 'cross-spawn';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { z } from 'zod';
import {
  deriveConvexSiteUrl,
  type MachineLifecycleCapability,
  normalizeBaseUrl,
  type MachineId,
  type WorkspaceId,
} from '@lody/shared';
import {
  CLI_EXIT_CODE_AUTH_FAILURE,
  CLI_EXIT_CODE_REMOTE_RESTART,
  CLI_EXIT_CODE_REMOTE_UPGRADE,
  CLI_EXIT_CODE_RETRYABLE_STARTUP,
  CLI_EXIT_CODE_SUPERVISOR_CONTRACT_MISMATCH,
} from '@lody/shared/node/local-cli-supervisor';
import { LODY_AUTH_SITE_URL, LODY_AUTH_URL } from '@/utils/const';
import { getLodyDataDir } from '@lody/shared/node/installation-profile';

// The reserved Worker exit codes are part of the shared Supervisor<->Worker
// contract; Electron consumes the same values from @lody/shared.
export const EXIT_CODE_RETRYABLE_STARTUP = CLI_EXIT_CODE_RETRYABLE_STARTUP;
export const EXIT_CODE_REMOTE_RESTART = CLI_EXIT_CODE_REMOTE_RESTART;
export const EXIT_CODE_REMOTE_UPGRADE = CLI_EXIT_CODE_REMOTE_UPGRADE;
export const EXIT_CODE_AUTH_FAILURE = CLI_EXIT_CODE_AUTH_FAILURE;
export const EXIT_CODE_SUPERVISOR_CONTRACT_MISMATCH = CLI_EXIT_CODE_SUPERVISOR_CONTRACT_MISMATCH;
export const DEFAULT_MACHINE_UPGRADE_TARGET_VERSION = 'latest';
export const MACHINE_UPGRADE_TIMEOUT_MS = 120_000;
export const LODY_DAEMON_SUPERVISED_ENV = 'LODY_DAEMON_SUPERVISED';

const LODY_NPM_PACKAGE_NAME = 'lody';
const NPM_REGISTRY_URL = 'https://registry.npmjs.org';
const SEMVER_TARGET_RE = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

export type MachineLifecycleAction = 'restart' | 'upgrade';

export type MachineProcessLifecycleAction =
  | { action: 'restart'; exitCode: typeof EXIT_CODE_REMOTE_RESTART; requestId: string }
  | { action: 'upgrade'; exitCode: typeof EXIT_CODE_REMOTE_UPGRADE; requestId: string };

export const resolveMachineLifecycleCapability = (
  launchMode: 'daemon' | 'electron' | undefined
): MachineLifecycleCapability => {
  if (launchMode === 'electron') {
    return {
      launchMode: 'electron',
      canRemoteRestart: false,
      canRemoteUpgrade: false,
      reason: 'electron',
    };
  }

  if (launchMode === 'daemon') {
    return {
      launchMode: 'daemon',
      canRemoteRestart: true,
      canRemoteUpgrade: true,
    };
  }

  return {
    launchMode: 'foreground',
    canRemoteRestart: false,
    canRemoteUpgrade: false,
    reason: 'not_daemon',
  };
};

type LifecycleLogger = {
  info?: (message: string) => void;
  warn?: (message: string) => void;
  error?: (message: string) => void;
  debug?: (message: string) => void;
};

const MachineLifecycleVerifyResponseSchema = z
  .object({
    valid: z.literal(true),
    requesterUserId: z.string().trim().min(1),
  })
  .strict();

const DaemonUpgradeIntentSchema = z
  .object({
    version: z.literal(1),
    action: z.literal('upgrade'),
    requestId: z.string().trim().min(1),
    requesterUserId: z.string().trim().min(1),
    targetVersion: z.string().trim().min(1),
    currentVersion: z.string().trim().min(1).optional(),
    requestedAtMs: z.number().finite().nonnegative(),
  })
  .strict();

export type DaemonUpgradeIntent = z.infer<typeof DaemonUpgradeIntentSchema>;

export const DAEMON_UPGRADE_INTENT_FILE = path.join(getLodyDataDir(), 'daemon-upgrade-intent.json');

// Machine RPC requests remain replayable for 24 hours. Keep installer attempts
// beyond that window so a restarted Worker cannot reinstall for the same request.
const UPGRADE_ATTEMPT_RETENTION_MS = 25 * 60 * 60 * 1000;
const DAEMON_UPGRADE_ATTEMPTS_FILE = path.join(getLodyDataDir(), 'daemon-upgrade-attempts.json');
const UpgradeAttemptSchema = z
  .object({
    requestId: z.string().min(1),
    requesterUserId: z.string().min(1),
    targetVersion: z.string().min(1),
    attemptedAtMs: z.number().finite().nonnegative(),
    phase: z.enum(['prepared', 'attempted']),
  })
  .strict();
const UpgradeAttemptsSchema = z
  .object({
    version: z.literal(1),
    attempts: z.array(UpgradeAttemptSchema),
  })
  .strict();

const readUpgradeAttempts = async () => {
  try {
    return UpgradeAttemptsSchema.parse(
      JSON.parse(await fs.readFile(DAEMON_UPGRADE_ATTEMPTS_FILE, 'utf8'))
    ).attempts;
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return [];
    throw error;
  }
};

const hasDaemonUpgradeAttempt = async (
  request: {
    requestId: string;
    requesterUserId: string;
  },
  nowMs = Date.now(),
  attemptedOnly = false
): Promise<boolean> => {
  const attempts = await readUpgradeAttempts();
  return attempts.some(
    (attempt) =>
      (!attemptedOnly || attempt.phase === 'attempted') &&
      attempt.requestId === request.requestId &&
      attempt.requesterUserId === request.requesterUserId &&
      nowMs - attempt.attemptedAtMs < UPGRADE_ATTEMPT_RETENTION_MS
  );
};

export const resolveDaemonUpgradeReplay = async (
  request: {
    requestId: string;
    requesterUserId: string;
    targetVersion: string;
    currentVersion: string;
  },
  nowMs = Date.now()
): Promise<'complete' | 'attempted' | 'new'> => {
  if (request.targetVersion === request.currentVersion) return 'complete';
  return (await hasDaemonUpgradeAttempt(request, nowMs)) ? 'attempted' : 'new';
};

const recordDaemonUpgradeAttempt = async (
  intent: Pick<DaemonUpgradeIntent, 'requestId' | 'requesterUserId' | 'targetVersion'>,
  nowMs: number,
  phase: 'prepared' | 'attempted'
) => {
  const attempts = (await readUpgradeAttempts()).filter(
    (attempt) =>
      nowMs - attempt.attemptedAtMs < UPGRADE_ATTEMPT_RETENTION_MS &&
      !(
        attempt.requestId === intent.requestId && attempt.requesterUserId === intent.requesterUserId
      )
  );
  attempts.push({
    requestId: intent.requestId,
    requesterUserId: intent.requesterUserId,
    targetVersion: intent.targetVersion,
    attemptedAtMs: nowMs,
    phase,
  });
  await fs.mkdir(path.dirname(DAEMON_UPGRADE_ATTEMPTS_FILE), { recursive: true });
  const tmpPath = `${DAEMON_UPGRADE_ATTEMPTS_FILE}.${process.pid}.tmp`;
  await fs.writeFile(tmpPath, `${JSON.stringify({ version: 1, attempts })}\n`, { mode: 0o600 });
  await fs.rename(tmpPath, DAEMON_UPGRADE_ATTEMPTS_FILE);
};

// Persist admission before accepting a destructive operation. If receipt writes
// fail, the Worker reports an error while it is still online.
export const prepareDaemonUpgradeAttempt = async (
  intent: Pick<DaemonUpgradeIntent, 'requestId' | 'requesterUserId' | 'targetVersion'>,
  nowMs = Date.now()
) => recordDaemonUpgradeAttempt(intent, nowMs, 'prepared');

const resolveConvexSiteUrl = (): string | null => {
  if (LODY_AUTH_SITE_URL) {
    return normalizeBaseUrl(LODY_AUTH_SITE_URL);
  }
  if (LODY_AUTH_URL) {
    return normalizeBaseUrl(deriveConvexSiteUrl(normalizeBaseUrl(LODY_AUTH_URL)));
  }
  return null;
};

export const normalizeMachineUpgradeTargetVersion = (targetVersion?: string): string => {
  const target = targetVersion?.trim() || DEFAULT_MACHINE_UPGRADE_TARGET_VERSION;
  if (target === DEFAULT_MACHINE_UPGRADE_TARGET_VERSION || SEMVER_TARGET_RE.test(target)) {
    return target;
  }
  throw new Error('Upgrade target must be "latest" or an exact semver version.');
};

export const verifyMachineLifecycleRequest = async (args: {
  token: string;
  workspaceId: WorkspaceId;
  machineId: MachineId;
  action: MachineLifecycleAction;
  requesterUserId: string;
  requestId: string;
  requestToken: string;
  targetVersion?: string;
  fetchImpl?: typeof fetch;
}): Promise<{ ok: true } | { ok: false; error: string; status?: number; retriable?: boolean }> => {
  const siteUrl = resolveConvexSiteUrl();
  if (!siteUrl) {
    return { ok: false, error: 'Lody auth URL is not configured on this machine.' };
  }

  try {
    const response = await (args.fetchImpl ?? fetch)(`${siteUrl}/api/machine-lifecycle/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${args.token}`,
      },
      body: JSON.stringify({
        workspaceId: args.workspaceId,
        machineId: args.machineId,
        action: args.action,
        requesterUserId: args.requesterUserId,
        requestId: args.requestId,
        requestToken: args.requestToken,
        ...(args.action === 'upgrade'
          ? { targetVersion: normalizeMachineUpgradeTargetVersion(args.targetVersion) }
          : {}),
      }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      return {
        ok: false,
        error: `Machine lifecycle verification failed with status ${response.status}${detail ? `: ${detail.slice(0, 200)}` : ''}`,
        status: response.status,
        retriable: response.status >= 500,
      };
    }

    const parsed = MachineLifecycleVerifyResponseSchema.safeParse(await response.json());
    if (!parsed.success) {
      return { ok: false, error: 'Machine lifecycle verification returned an invalid response.' };
    }
    if (parsed.data.requesterUserId !== args.requesterUserId) {
      return { ok: false, error: 'Machine lifecycle verification requester mismatch.' };
    }
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      retriable: true,
    };
  }
};

export const writeDaemonUpgradeIntent = async (intent: Omit<DaemonUpgradeIntent, 'version'>) => {
  const value: DaemonUpgradeIntent = { version: 1, ...intent };
  const parsed = DaemonUpgradeIntentSchema.parse(value);
  const dir = path.dirname(DAEMON_UPGRADE_INTENT_FILE);
  await fs.mkdir(dir, { recursive: true });
  const tmpPath = path.join(
    dir,
    `.${path.basename(DAEMON_UPGRADE_INTENT_FILE)}.${process.pid}.tmp`
  );
  await fs.writeFile(tmpPath, `${JSON.stringify(parsed, null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
  });
  await fs.rename(tmpPath, DAEMON_UPGRADE_INTENT_FILE);
};

export const readDaemonUpgradeIntent = async (): Promise<DaemonUpgradeIntent | null> => {
  try {
    const raw = await fs.readFile(DAEMON_UPGRADE_INTENT_FILE, 'utf8');
    const parsed = DaemonUpgradeIntentSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
};

export const clearDaemonUpgradeIntent = async (): Promise<void> => {
  try {
    await fs.unlink(DAEMON_UPGRADE_INTENT_FILE);
  } catch {
    // best effort
  }
};

export const resolveNpmExecutable = (platform: NodeJS.Platform = process.platform): string =>
  platform === 'win32' ? 'npm.cmd' : 'npm';

export const buildLodyUpgradeInstallArgs = (targetVersion: string): string[] => [
  'install',
  '-g',
  `${LODY_NPM_PACKAGE_NAME}@${normalizeMachineUpgradeTargetVersion(targetVersion)}`,
  `--registry=${NPM_REGISTRY_URL}`,
];

type SpawnLike = (command: string, args: readonly string[], options: SpawnOptions) => ChildProcess;

const runCommand = async (args: {
  command: string;
  commandArgs: readonly string[];
  timeoutMs: number;
  spawnImpl: SpawnLike;
  signal?: AbortSignal;
}): Promise<{
  code: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  aborted: boolean;
}> => {
  if (args.signal?.aborted) {
    throw new DOMException('Daemon upgrade canceled', 'AbortError');
  }
  const child = args.spawnImpl(args.command, args.commandArgs, {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: process.env,
  });
  let stdout = '';
  let stderr = '';
  const append = (current: string, chunk: Buffer): string =>
    `${current}${chunk.toString()}`.slice(-64 * 1024);
  child.stdout?.on('data', (chunk: Buffer) => {
    stdout = append(stdout, chunk);
  });
  child.stderr?.on('data', (chunk: Buffer) => {
    stderr = append(stderr, chunk);
  });

  return await new Promise((resolve, reject) => {
    let timedOut = false;
    let aborted = false;
    let processError: Error | null = null;
    let terminationStarted = false;
    let forceKillTimer: ReturnType<typeof setTimeout> | null = null;
    let exitConfirmationTimer: ReturnType<typeof setTimeout> | null = null;
    const requestTermination = () => {
      if (terminationStarted) return;
      terminationStarted = true;
      child.kill('SIGTERM');
      forceKillTimer = setTimeout(() => child.kill('SIGKILL'), 2_000);
      forceKillTimer.unref?.();
      exitConfirmationTimer = setTimeout(() => {
        cleanup();
        reject(new Error('Upgrade process did not confirm exit after SIGKILL'));
      }, 7_000);
      exitConfirmationTimer.unref?.();
    };
    const onAbort = () => {
      if (aborted) return;
      aborted = true;
      requestTermination();
    };
    args.signal?.addEventListener('abort', onAbort, { once: true });
    if (args.signal?.aborted) onAbort();
    const timeout = setTimeout(() => {
      timedOut = true;
      requestTermination();
    }, args.timeoutMs);
    timeout.unref?.();

    const cleanup = () => {
      clearTimeout(timeout);
      if (forceKillTimer) clearTimeout(forceKillTimer);
      if (exitConfirmationTimer) clearTimeout(exitConfirmationTimer);
      args.signal?.removeEventListener('abort', onAbort);
    };
    child.once('error', (error) => {
      processError = error;
    });
    child.once('close', (code) => {
      cleanup();
      if (processError) {
        reject(processError);
        return;
      }
      resolve({ code, stdout, stderr, timedOut, aborted });
    });
  });
};

/** Returns true only when the upgrade intent existed and npm install succeeded. */
export const runDaemonUpgradeFromIntent = async (args: {
  logger: LifecycleLogger;
  timeoutMs?: number;
  spawnImpl?: SpawnLike;
  signal?: AbortSignal;
  nowMs?: number;
  cliEntryPath?: string;
}): Promise<boolean> => {
  const intent = await readDaemonUpgradeIntent();
  if (!intent) {
    args.logger.warn?.('[daemon-upgrade] no upgrade intent found; respawning without upgrade');
    return false;
  }

  try {
    const nowMs = args.nowMs ?? Date.now();
    try {
      if (await hasDaemonUpgradeAttempt(intent, nowMs, true)) {
        args.logger.error?.(
          '[daemon-upgrade] this request was already attempted; send a new upgrade request after checking the installation'
        );
        return false;
      }
      // Record before npm starts, including attempts interrupted by a crash or a
      // failed install. A fresh request is required to explicitly retry them.
      await recordDaemonUpgradeAttempt(intent, nowMs, 'attempted');
    } catch (error) {
      args.logger.error?.(
        `[daemon-upgrade] could not retain upgrade attempt: ${error instanceof Error ? error.message : String(error)}`
      );
      return false;
    }
    const targetVersion = normalizeMachineUpgradeTargetVersion(intent.targetVersion);
    const npmExecutable = resolveNpmExecutable();
    const cliEntryPath = args.cliEntryPath ?? process.argv[1];
    if (!cliEntryPath) {
      args.logger.error?.('[daemon-upgrade] cannot verify the daemon CLI entry point');
      return false;
    }
    let launchEntry: string;
    try {
      launchEntry = await fs.realpath(cliEntryPath);
    } catch (error) {
      args.logger.error?.(
        `[daemon-upgrade] cannot resolve daemon entry point: ${error instanceof Error ? error.message : String(error)}`
      );
      return false;
    }
    const installArgs = buildLodyUpgradeInstallArgs(targetVersion);
    // Only conventional npm global layouts prove which prefix owns this entry.
    // Do not infer a prefix for npx caches, source trees, or custom layouts.
    const packageRoot = path.dirname(path.dirname(launchEntry));
    const modulesDir = path.dirname(packageRoot);
    const parentDir = path.dirname(modulesDir);
    if (
      path.basename(packageRoot) === LODY_NPM_PACKAGE_NAME &&
      path.basename(modulesDir) === 'node_modules' &&
      path.basename(path.dirname(launchEntry)) === 'dist' &&
      (process.platform === 'win32' || path.basename(parentDir) === 'lib')
    ) {
      const prefix = process.platform === 'win32' ? parentDir : path.dirname(parentDir);
      installArgs.push('--prefix', prefix);
    }
    args.logger.info?.(
      `[daemon-upgrade] installing ${LODY_NPM_PACKAGE_NAME}@${targetVersion} for request ${intent.requestId}`
    );
    const result = await runCommand({
      command: npmExecutable,
      commandArgs: installArgs,
      timeoutMs: args.timeoutMs ?? MACHINE_UPGRADE_TIMEOUT_MS,
      spawnImpl: args.spawnImpl ?? spawn,
      signal: args.signal,
    });
    if (result.aborted) {
      throw new DOMException('Daemon upgrade canceled', 'AbortError');
    }
    if (result.timedOut) {
      args.logger.error?.(
        `[daemon-upgrade] npm install timed out after ${args.timeoutMs ?? MACHINE_UPGRADE_TIMEOUT_MS}ms`
      );
      return false;
    }
    if (result.code !== 0) {
      const detail = (result.stderr || result.stdout || 'no output').replace(/\s+/g, ' ').trim();
      args.logger.error?.(
        `[daemon-upgrade] npm install failed with code ${result.code}: ${detail.slice(0, 500)}`
      );
      return false;
    }
    const launchVersion = await runCommand({
      command: process.execPath,
      commandArgs: [launchEntry, '--version'],
      timeoutMs: args.timeoutMs ?? MACHINE_UPGRADE_TIMEOUT_MS,
      spawnImpl: args.spawnImpl ?? spawn,
      signal: args.signal,
    }).catch((error: unknown) => {
      if (args.signal?.aborted) throw error;
      args.logger.error?.(
        `[daemon-upgrade] could not verify daemon entry point: ${error instanceof Error ? error.message : String(error)}`
      );
      return null;
    });
    if (!launchVersion) return false;
    if (launchVersion.aborted) {
      throw new DOMException('Daemon upgrade canceled', 'AbortError');
    }
    const installedVersion = launchVersion.stdout.trim();
    if (
      launchVersion.timedOut ||
      launchVersion.code !== 0 ||
      !SEMVER_TARGET_RE.test(installedVersion) ||
      (targetVersion !== DEFAULT_MACHINE_UPGRADE_TARGET_VERSION &&
        installedVersion !== targetVersion)
    ) {
      args.logger.error?.(
        `[daemon-upgrade] npm succeeded but the daemon entry point did not verify target ${targetVersion} (reported ${installedVersion || 'no version'}). Check the daemon installation path and npm prefix before sending a new upgrade request.`
      );
      return false;
    }
    args.logger.info?.(
      `[daemon-upgrade] npm install completed; daemon entry point verified ${installedVersion}`
    );
    return true;
  } finally {
    await clearDaemonUpgradeIntent();
  }
};
