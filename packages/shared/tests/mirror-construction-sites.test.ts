import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * `ignoreUnknownProperties` is passed per construction site, so a behavioural
 * test over one Mirror cannot prove the invariant holds — a new store that
 * forgets the option still passes `session-doc-forward-compat`.
 */

const repoRoot = fileURLToPath(new URL('../../..', import.meta.url));
const searchRoots = ['apps/cli/src', 'packages/components/src'];

function productionSources(dir: string): string[] {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile() && /(?<!\.test)\.tsx?$/.test(e.name))
    .map((e) => join(e.parentPath, e.name));
}

describe('Mirror construction sites', () => {
  it('tolerates unknown root keys and bypasses session whole-state validation', () => {
    const missing: string[] = [];
    const validatedSessions: string[] = [];
    const sessionRoots = new Set<string>();
    let sites = 0;

    for (const root of searchRoots) {
      for (const file of productionSources(join(repoRoot, root))) {
        const source = readFileSync(file, 'utf8');
        for (
          let at = source.indexOf('new Mirror(');
          at !== -1;
          at = source.indexOf('new Mirror(', at + 1)
        ) {
          sites++;
          // Options are top level in the call, so the first `});` ends it.
          const options = source.slice(at, source.indexOf('});', at));
          const location = `${file.slice(repoRoot.length)}:${source.slice(0, at).split('\n').length}`;
          if (!options.includes('ignoreUnknownProperties')) missing.push(location);
          if (/schema:\s*sessionDocSchema\b/.test(options)) {
            sessionRoots.add(root);
            if (!/validateUpdates:\s*false\b/.test(options)) validatedSessions.push(location);
          }
        }
      }
    }

    expect(missing).toEqual([]);
    // Temporary session-only bypass must cover both renderer and CLI entrypoints.
    expect(validatedSessions).toEqual([]);
    expect([...sessionRoots]).toEqual(searchRoots);
    // A scan that silently matched nothing would pass forever.
    expect(sites).toBeGreaterThan(0);
  });
});
