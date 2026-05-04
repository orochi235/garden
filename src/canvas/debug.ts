/**
 * Parses `?debug=foo,bar,baz` from the current URL into a Set of tokens.
 * Tokens enable corresponding debug RenderLayers (see ./layers/debugLayers.ts).
 *
 * Evaluated once at module load — to change tokens at runtime, reload the page.
 */
const DEBUG_TOKENS: ReadonlySet<string> = (() => {
  if (typeof window === 'undefined') return new Set<string>();
  const raw = new URLSearchParams(window.location.search).get('debug');
  if (!raw) return new Set<string>();
  return new Set(raw.split(',').map((s) => s.trim()).filter(Boolean));
})();

export function debugTokens(): ReadonlySet<string> {
  return DEBUG_TOKENS;
}

export function isDebugEnabled(token: string): boolean {
  return DEBUG_TOKENS.has(token);
}

/** Test-only: parse arbitrary input. Production code uses `debugTokens()`. */
export function parseDebugTokens(raw: string | null | undefined): Set<string> {
  if (!raw) return new Set<string>();
  return new Set(raw.split(',').map((s) => s.trim()).filter(Boolean));
}
