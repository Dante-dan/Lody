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

export function isLandingDocument(html) {
  return html.includes('underwater-hero__title');
}

export function isPageOnlyStylesheetHref(href) {
  return /(?:^|\/)(?:pricing|legal)-[^/]+\.css(?:\?|$)/u.test(href);
}

function stylesheetHref(tag) {
  return /(?:^|\s)href=["']([^"']+)["']/iu.exec(tag)?.[1] ?? '';
}

export function deferStylesheetTag(tag) {
  if (/media=["']print["']/iu.test(tag) || /onload=/iu.test(tag)) return tag;
  const deferred = tag
    .replace(/\smedia=["'][^"']*["']/iu, '')
    .replace(/<link\b/iu, '<link media="print" onload="this.media=\'all\'"');
  return `${deferred}<noscript>${tag}</noscript>`;
}

export function deferNonCriticalStylesheets(html) {
  const landing = isLandingDocument(html);
  return html.replace(/<link\b[^>]*\brel=["']stylesheet["'][^>]*>/giu, (tag) => {
    if (landing || isPageOnlyStylesheetHref(stylesheetHref(tag))) {
      return deferStylesheetTag(tag);
    }
    return tag;
  });
}

export function stripLandingImagePreloads(html) {
  if (!isLandingDocument(html)) return html;
  return html.replace(/<link\b[^>]*\brel=["']preload["'][^>]*>/giu, (tag) => {
    return /\bas=["']image["']/iu.test(tag) ? '' : tag;
  });
}

function minifyCss(css) {
  return css
    .replace(/\/\*[\s\S]*?\*\//gu, '')
    .replace(/\s+/gu, ' ')
    .replace(/\s*([{}:;,])\s*/gu, '$1')
    .trim();
}

export function injectLandingFirstPaintStyle(html, css) {
  if (!isLandingDocument(html) || /data-landing-first-paint/u.test(html)) return html;
  const compact = minifyCss(css);
  if (!compact) return html;
  const style = `<style data-landing-first-paint>${compact}</style>`;
  return html.replace(/<head([^>]*)>/iu, `<head$1>${style}`);
}

export function finalizePrerenderHtml(html, firstPaintCss = '') {
  let next = stripNonCriticalModulePreload(html);
  next = stripLandingImagePreloads(next);
  next = injectLandingFirstPaintStyle(next, firstPaintCss);
  next = deferNonCriticalStylesheets(next);
  return next;
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
  const firstPaintCss = readFileSync(path.join(packageRoot, 'app/landing-first-paint.css'), 'utf8');
  const files = walkHtmlFiles(clientRoot);
  for (const file of files) {
    const html = readFileSync(file, 'utf8');
    const next = finalizePrerenderHtml(html, firstPaintCss);
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
