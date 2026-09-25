/**
 * Import graph builder — real implementation.
 *
 * Uses madge to walk the repository source tree and build a FORWARD dependency
 * map, then inverts it into a REVERSE import map so callers can ask:
 * "which files are affected when this file changes?"
 *
 * The graph is intended to be built once per analysis run and passed downstream.
 * Never rebuild it mid-run or call this function more than once per invocation.
 *
 * Path format:
 *   Keys and values are POSIX-style paths relative to the repository root,
 *   matching the format produced by git diff (e.g. "src/utils/helper.ts").
 *   Madge normalises Windows backslashes to forward slashes internally.
 *
 * Unresolved imports:
 *   Madge records imports it cannot resolve in `.warnings().skipped`.
 *   These are logged to stderr and silently dropped from the graph rather
 *   than crashing the analysis — partial information is better than none.
 */

// madge has no bundled TypeScript declarations; we type the subset we use.
type MadgeInstance = { obj(): Record<string, string[]>; warnings(): { skipped: string[] } };
type MadgeFactory = (path: string, config: Record<string, unknown>) => Promise<MadgeInstance>;

// eslint-disable-next-line @typescript-eslint/no-var-requires
import { createRequire } from 'module';
import type { ReverseImportMap } from '../types.js';

// madge is a CJS-only package with no type declarations.
// We load it via createRequire so TypeScript does not complain about the
// missing module types, and we cast it to our locally-defined MadgeFactory.
const _require = createRequire(import.meta.url);
// Vitest intercepts this via the __mocks__ mechanism or by reassigning in tests.
// For unit tests, use vi.mock('madge') — see tests/graph/importGraph.test.ts.
let _madge: MadgeFactory = _require('madge') as MadgeFactory;

/** @internal — exposed only for testing; do not call directly in production code. */
export function _setMadgeForTesting(mock: MadgeFactory): void {
  _madge = mock;
}

// ---------------------------------------------------------------------------
// Map inversion
// ---------------------------------------------------------------------------

/**
 * Invert a forward dependency map into a reverse import map.
 *
 * Forward:  { "src/a.ts": ["src/b.ts"] }   ("a imports b")
 * Reverse:  { "src/b.ts": ["src/a.ts"] }   ("b is imported by a")
 */
export function invertForwardMap(forward: Record<string, string[]>): ReverseImportMap {
  const reverse: ReverseImportMap = {};

  for (const [importer, dependencies] of Object.entries(forward)) {
    // Ensure every node that appears as an importer is present in the map,
    // even if nothing imports it (so callers can reliably iterate all nodes).
    if (!(importer in reverse)) {
      reverse[importer] = [];
    }

    for (const dep of dependencies) {
      if (!(dep in reverse)) {
        reverse[dep] = [];
      }
      reverse[dep].push(importer);
    }
  }

  return reverse;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Build the reverse import map for the repository at `repoPath`.
 *
 * @param repoPath  Absolute or CWD-relative path to the repository root.
 * @returns         ReverseImportMap — key = file, value = files that import it.
 */
export async function buildImportGraph(repoPath: string): Promise<ReverseImportMap> {
  const instance = await _madge(repoPath, {
    // Include all JS/TS file extensions in the scan.
    fileExtensions: ['ts', 'tsx', 'js', 'jsx'],
    // ts: true is the shorthand documented in AGENTS.md; in madge v8 this is
    // achieved by passing the tsConfig option. We set fileExtensions instead,
    // which is sufficient for import resolution without a tsconfig.json path.
  });

  // Log any unresolvable imports to stderr but continue — partial graph is
  // still useful and better than crashing the entire analysis run.
  const { skipped } = instance.warnings();
  if (skipped.length > 0) {
    for (const s of skipped) {
      process.stderr.write(`[codepreflight] unresolved import skipped: ${s}\n`);
    }
  }

  const forwardMap = instance.obj();
  return invertForwardMap(forwardMap);
}
