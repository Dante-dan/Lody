import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Vite / TanStack prerender injects `<link rel="modulepreload">` for every
 * statically discovered route chunk. That list is identical on the homepage
 * and every docs URL, so first paint competes with landing/pricing/blog JS
 * the visitor has not asked for.
 *
 * Keep only the hydration runtime. The entry `<script type="module">` still
 * loads; the browser fetches the current route through the module graph.
 * Client navigation keeps `defaultPreload: 'intent'`.
 */
const CRITICAL_MODULEPRELOAD =
  /(?:^|\/)(?:index|rolldown-runtime|react-dom|react|jsx-runtime|preload-helper)-[^/]+\.js(?:\?|$)/u;

export function isCriticalModulePreloadHref(href) {
  return CRITICAL_MODULEPRELOAD.test(href);
}

export function stripNonCriticalModulePreload(html) {
  return html.replace(/<link\b[^>]*\brel=["']modulepreload["'][^>]*>/giu, (tag) => {
    const href = /(?:^|\s)href=["']([^"']+)["']/iu.exec(tag)?.[1] ?? '';
    return isCriticalModulePreloadHref(href) ? tag : '';
  });
}

function walkHtmlFiles(dir, files = []) {
  for (const name of readdirSync(dir)) {
    const next = path.join(dir, name);
    const info = statSync(next);
    if (info.isDirectory()) {
      walkHtmlFiles(next, files);
      continue;
    }
    if (name.endsWith('.html') && name !== '404.html') {
      files.push(next);
    }
  }
  return files;
}

export function finalizePrerenderHtmlTree(clientRoot) {
  const files = walkHtmlFiles(clientRoot);
  for (const file of files) {
    const html = readFileSync(file, 'utf8');
    const next = stripNonCriticalModulePreload(html);
    if (next !== html) {
      writeFileSync(file, next);
    }
  }
  return files.length;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const clientRoot = path.join(packageRoot, 'out', 'client');
  const count = finalizePrerenderHtmlTree(clientRoot);
  console.log(`Finalized modulepreload on ${count} prerendered HTML files`);
}
