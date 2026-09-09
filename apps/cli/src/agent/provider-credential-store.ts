import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile, chmod } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import {
  getLodyCodexCustomProvider,
  isAllowedCredentialEndpoint,
  LODY_CODEX_API_KEY_ENV,
  type AgentConfigMeta,
  type WorkspaceId,
} from '@lody/shared';
import { getLodyDataDir } from '@lody/shared/node/installation-profile';

const CredentialRecordSchema = z
  .object({
    v: z.literal(1),
    binding: z.string().min(1),
    apiKey: z.string().min(1),
  })
  .strict();

type CredentialRecord = z.infer<typeof CredentialRecordSchema>;
type CredentialBoundConfig = Pick<
  AgentConfigMeta,
  'id' | 'cliType' | 'agentType' | 'customAcp' | 'runtimeOverrides' | 'env'
>;

function credentialBinding(config: CredentialBoundConfig): string | null {
  if (!getLodyCodexCustomProvider(config.env)) return null;
  return JSON.stringify({
    cliType: config.cliType,
    agentType: config.agentType,
    customAcp: config.customAcp ?? null,
    runtimeOverrides: config.runtimeOverrides ?? null,
    env: Object.fromEntries(
      Object.entries(config.env)
        .filter(([key]) => key !== LODY_CODEX_API_KEY_ENV)
        .sort(([left], [right]) => left.localeCompare(right))
    ),
  });
}

function recordPath(workspaceId: WorkspaceId, configId: string): string {
  const id = createHash('sha256').update(`${workspaceId}\0${configId}`).digest('hex');
  return path.join(getLodyDataDir(), 'provider-credentials', `${id}.json`);
}

async function readRecord(filePath: string): Promise<CredentialRecord | null> {
  try {
    const parsed = CredentialRecordSchema.safeParse(JSON.parse(await readFile(filePath, 'utf8')));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

async function writeRecord(filePath: string, record: CredentialRecord): Promise<void> {
  const directory = path.dirname(filePath);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  if (process.platform !== 'win32') await chmod(directory, 0o700);
  const temporaryPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(record)}\n`, { mode: 0o600 });
  if (process.platform !== 'win32') await chmod(temporaryPath, 0o600);
  await rename(temporaryPath, filePath);
  if (process.platform !== 'win32') await chmod(filePath, 0o600);
}

export async function storeCodexProviderCredential(
  workspaceId: WorkspaceId,
  config: AgentConfigMeta,
  apiKey: string
): Promise<() => Promise<void>> {
  const provider = getLodyCodexCustomProvider(config.env);
  const binding = credentialBinding(config);
  const normalizedKey = apiKey.trim();
  if (!provider || !binding || !isAllowedCredentialEndpoint(provider.baseUrl) || !normalizedKey) {
    throw new Error('Invalid Codex custom endpoint credential');
  }
  const filePath = recordPath(workspaceId, config.id);
  const previous = await readRecord(filePath);
  await writeRecord(filePath, { v: 1, binding, apiKey: normalizedKey });
  return async () => {
    if (previous) await writeRecord(filePath, previous);
    else await rm(filePath, { force: true });
  };
}

export async function hydrateCodexProviderCredential<T extends CredentialBoundConfig>(
  workspaceId: WorkspaceId,
  config: T
): Promise<T> {
  const binding = credentialBinding(config);
  if (!binding) {
    await rm(recordPath(workspaceId, config.id), { force: true });
    return config;
  }
  const record = await readRecord(recordPath(workspaceId, config.id));
  if (!record || record.binding !== binding) return config;
  return {
    ...config,
    env: { ...config.env, [LODY_CODEX_API_KEY_ENV]: record.apiKey },
  } as T;
}

export async function clearCodexProviderCredential(
  workspaceId: WorkspaceId,
  configId: string
): Promise<void> {
  await rm(recordPath(workspaceId, configId), { force: true });
}
