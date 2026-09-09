import { describe, expect, it } from 'vitest';
import {
  buildLodyCodexCustomProviderEnv,
  CODEX_API_KEY_ENV,
  CODEX_CONFIG_ENV,
  getLodyCodexCustomProvider,
  LODY_CODEX_MODEL_PROVIDER_ID,
  removeLodyCodexCustomProviderEnv,
} from '../src/codex-provider-config';

describe('Lody Codex custom provider config', () => {
  it('stores the secret separately from the generated Codex provider config', () => {
    const env = buildLodyCodexCustomProviderEnv(
      { HTTPS_PROXY: 'http://127.0.0.1:7890' },
      { apiKey: '  sk-test  ', baseUrl: '  https://relay.example.com/v1  ' }
    );

    expect(env[CODEX_API_KEY_ENV]).toBe('sk-test');
    expect(env[CODEX_CONFIG_ENV]).not.toContain('sk-test');
    expect(JSON.parse(env[CODEX_CONFIG_ENV]!)).toEqual({
      model_provider: LODY_CODEX_MODEL_PROVIDER_ID,
      model_providers: {
        [LODY_CODEX_MODEL_PROVIDER_ID]: {
          name: 'Custom OpenAI-compatible endpoint',
          base_url: 'https://relay.example.com/v1',
          env_key: CODEX_API_KEY_ENV,
          wire_api: 'responses',
          requires_openai_auth: false,
        },
      },
    });
    expect(env.HTTPS_PROXY).toBe('http://127.0.0.1:7890');
    expect(getLodyCodexCustomProvider(env)).toEqual({
      apiKey: 'sk-test',
      baseUrl: 'https://relay.example.com/v1',
    });
  });

  it('preserves unrelated Codex config fields when adding and removing its provider', () => {
    const original = {
      EXTRA_FLAG: '1',
      [CODEX_CONFIG_ENV]: JSON.stringify({
        model: 'gpt-custom',
        model_providers: { existing: { base_url: 'https://existing.example.com' } },
      }),
    };
    const configured = buildLodyCodexCustomProviderEnv(original, {
      apiKey: 'sk-test',
      baseUrl: 'https://relay.example.com',
    });

    expect(removeLodyCodexCustomProviderEnv(configured)).toEqual({
      EXTRA_FLAG: '1',
      [CODEX_CONFIG_ENV]: JSON.stringify({
        model: 'gpt-custom',
        model_providers: { existing: { base_url: 'https://existing.example.com' } },
      }),
    });
  });

  it('does not claim or rewrite arbitrary CODEX_CONFIG overrides', () => {
    const env = {
      [CODEX_API_KEY_ENV]: 'sk-manual',
      [CODEX_CONFIG_ENV]: JSON.stringify({
        model_provider: 'manual',
        model_providers: { manual: { base_url: 'https://manual.example.com' } },
      }),
    };

    expect(getLodyCodexCustomProvider(env)).toBeNull();
    expect(removeLodyCodexCustomProviderEnv(env)).toEqual(env);
  });
});
