import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
const require = createRequire(new URL('../../apps/cli/package.json', import.meta.url));
const { buildSync } = require('esbuild');
const root = fileURLToPath(new URL('../../', import.meta.url));
for (const [name, source] of [
  ['schema', 'packages/shared/src/history-content-schema.ts'],
  ['permission', 'packages/shared/src/acp/ask-user-question.ts'],
  ['scheduling', 'packages/shared/src/scheduled-tasks-from-history.ts'],
]) {
  buildSync({
    entryPoints: [join(root, source)],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    outfile: join(process.argv[2], name + '.cjs'),
    logLevel: 'warning',
  });
}
