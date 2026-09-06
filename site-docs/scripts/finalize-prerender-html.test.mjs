import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  isCriticalModulePreloadHref,
  stripNonCriticalModulePreload,
} from './finalize-prerender-html.mjs';

const sample = `<!DOCTYPE html><html><head>
<link rel="modulepreload" href="/assets/index-abc.js"/>
<link rel="modulepreload" href="/assets/react-CUp.js"/>
<link rel="modulepreload" href="/assets/react-dom-Cye.js"/>
<link rel="modulepreload" href="/assets/jsx-runtime-CFw.js"/>
<link rel="modulepreload" href="/assets/rolldown-runtime-DAX.js"/>
<link rel="modulepreload" href="/assets/landing-DLX.js"/>
<link rel="modulepreload" href="/assets/pricing-B2h.js"/>
<link rel="modulepreload" href="/assets/docs-P5r.js"/>
<link rel="stylesheet" href="/assets/index.css"/>
<link rel="preload" href="/_docs-assets/logo-96.png" as="image"/>
</head><body>
<script type="module" async="" src="/assets/index-abc.js"></script>
</body></html>`;

await test('critical runtime chunks stay modulepreloaded', () => {
  assert.equal(isCriticalModulePreloadHref('/assets/index-abc.js'), true);
  assert.equal(isCriticalModulePreloadHref('/assets/react-CUp.js'), true);
  assert.equal(isCriticalModulePreloadHref('/assets/react-dom-Cye.js'), true);
  assert.equal(isCriticalModulePreloadHref('assets/jsx-runtime-CFw.js'), true);
});

await test('route and page chunks are not critical', () => {
  assert.equal(isCriticalModulePreloadHref('/assets/landing-DLX.js'), false);
  assert.equal(isCriticalModulePreloadHref('/assets/pricing-B2h.js'), false);
  assert.equal(isCriticalModulePreloadHref('/assets/docs-P5r.js'), false);
  assert.equal(isCriticalModulePreloadHref('/assets/search-DPN.js'), false);
});

await test('stripNonCriticalModulePreload keeps runtime and drops route chunks', () => {
  const next = stripNonCriticalModulePreload(sample);
  assert.match(next, /index-abc\.js/u);
  assert.match(next, /react-CUp\.js/u);
  assert.match(next, /react-dom-Cye\.js/u);
  assert.match(next, /index\.css/u);
  assert.match(next, /logo-96\.png/u);
  assert.match(next, /type="module"/u);
  assert.doesNotMatch(next, /landing-DLX/u);
  assert.doesNotMatch(next, /pricing-B2h/u);
  assert.doesNotMatch(next, /docs-P5r/u);
});
