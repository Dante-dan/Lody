import { createRequire } from 'node:module';
import { readFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve, join } from 'node:path';

const [output, baselineRef, baselineMirror] = process.argv.slice(2);
if (!output || !baselineRef || !baselineMirror) {
  throw new Error('Usage: build-storage.mjs OUTPUT BASELINE_GIT_REF UNPATCHED_MIRROR_PACKAGE');
}
const root = fileURLToPath(new URL('../../', import.meta.url));
const cli = createRequire(join(root, 'apps/cli/package.json'));
const shared = createRequire(join(root, 'packages/shared/package.json'));
const { build } = cli('esbuild');
mkdirSync(output, { recursive: true, mode: 0o700 });
for (const legacy of [true, false]) {
  const source = legacy
    ? execFileSync('git', ['show', `${baselineRef}:packages/shared/src/schema.ts`], {
        cwd: root,
        encoding: 'utf8',
      })
    : readFileSync(join(root, 'packages/shared/src/schema.ts'), 'utf8');
  await build({
    stdin: {
      contents:
        source +
        '\nexport { Mirror } from "loro-mirror"; export { LoroDoc, isContainer } from "loro-crdt";',
      resolveDir: join(root, 'packages/shared/src'),
      loader: 'ts',
    },
    bundle: true,
    platform: 'node',
    format: 'cjs',
    outfile: join(output, legacy ? 'old.cjs' : 'new.cjs'),
    plugins: [
      {
        name: 'storage-versions',
        setup(builder) {
          builder.onResolve({ filter: /^loro-mirror$/ }, () => ({
            path: legacy
              ? join(resolve(baselineMirror), 'dist/index.js')
              : shared.resolve('loro-mirror'),
          }));
          builder.onResolve({ filter: /^loro-crdt$/ }, () => ({
            path: shared.resolve('loro-crdt'),
            external: true,
          }));
        },
      },
    ],
    logLevel: 'warning',
  });
}
