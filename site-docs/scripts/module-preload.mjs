/**
 * Shared `build.modulePreload.resolveDependencies` policy.
 *
 * HTML hosts: keep only the hydration runtime so every prerendered document
 * does not modulepreload the whole route graph.
 *
 * JS hosts (lazy route imports): keep every dependency. Vite injects
 * extracted CSS through the same preload wrapper; dropping `pricing-*.css`
 * / `legal-*.css` here would load the route component without its sheet
 * on client-side navigation.
 */

export function isCriticalModulePreloadHref(href) {
  return /(?:^|\/)(?:index|rolldown-runtime|react-dom|react|jsx-runtime|preload-helper)-[^/]+\.js(?:\?|$)/u.test(
    href
  );
}

export function resolveModulePreloadDependencies(_filename, deps, context = {}) {
  if (context.hostType !== 'html') {
    return deps;
  }
  return deps.filter(isCriticalModulePreloadHref);
}
