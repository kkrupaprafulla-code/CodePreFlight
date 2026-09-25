/**
 * Test matcher — real implementation.
 *
 * For each affected source file, identifies test files that are plausibly
 * relevant using two heuristics (applied in order):
 *
 *  1. Filename-convention matching:
 *     Derives candidate test paths by swapping the source extension for
 *     `.test.<ext>` and `.spec.<ext>`, both alongside the source file and
 *     under a `tests/` directory at the repository root.
 *
 *  2. Import-trace matching:
 *     Scans all test files in the repository for relative `import`/`require`
 *     statements that resolve to the affected source file.
 *
 * IMPORTANT — product limitation:
 *   This MVP does NOT have precise runtime coverage information.
 *   Results are "potentially related" tests, not guaranteed coverage.
 *
 * Path handling:
 *   - All input paths are treated as POSIX-style relative paths (as produced
 *     by the BFS traversal and git diff parser).
 *   - Windows backslashes are normalised to forward slashes internally.
 *   - Output paths use POSIX forward slashes, relative to the repo root.
 *
 * Testability:
 *   The `FsAdapter` parameter lets tests inject a virtual filesystem without
 *   mocking Node built-ins. Production callers pass no adapter; defaults
 *   pointing to the real `fs` module are used.
 */

import * as realFs from 'fs';
import * as path from 'path';
import type { AffectedFile, TestMatch } from '../types.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Source-file extensions we recognise. */
const SOURCE_EXTS = ['.ts', '.tsx', '.js', '.jsx'] as const;

/** The test-type suffixes we look for. */
const TEST_SUFFIXES = ['.test', '.spec'] as const;

/** Pattern that identifies a file as a test file (must match the full basename). */
const TEST_FILE_RE = /\.(test|spec)\.(ts|tsx|js|jsx)$/;

// ---------------------------------------------------------------------------
// Filesystem adapter (for testability)
// ---------------------------------------------------------------------------

/**
 * Subset of `fs` functions used by the matcher.
 * Production code uses Node's built-in `fs`; tests supply a virtual adapter.
 */
export interface FsAdapter {
  existsSync(p: string): boolean;
  readdirSync(dir: string): Array<{ name: string; isDirectory(): boolean; isFile(): boolean }>;
  readFileSync(p: string, encoding: 'utf8'): string;
}

/** Production adapter backed by Node's built-in `fs`. */
const defaultFsAdapter: FsAdapter = {
  existsSync: (p) => realFs.existsSync(p),
  readdirSync: (dir) => realFs.readdirSync(dir, { withFileTypes: true }) as Array<{
    name: string;
    isDirectory(): boolean;
    isFile(): boolean;
  }>,
  readFileSync: (p, enc) => realFs.readFileSync(p, enc),
};

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Normalise a filesystem path to a POSIX-style forward-slash string.
 * Used only for string operations; OS-native paths are still passed to fs.
 */
function toPosix(p: string): string {
  return p.replace(/\\/g, '/');
}

/**
 * Return true if the given file path looks like a test file based strictly
 * on its basename pattern — not on any path segment containing "test".
 */
function isTestFile(filePath: string): boolean {
  return TEST_FILE_RE.test(path.basename(filePath));
}

/**
 * Recursively collect all test files under `dir`.
 * Returns POSIX-style paths relative to `repoRoot`.
 */
function collectTestFiles(dir: string, repoRoot: string, fs: FsAdapter): string[] {
  const results: string[] = [];

  let entries: Array<{ name: string; isDirectory(): boolean; isFile(): boolean }>;
  try {
    entries = fs.readdirSync(dir);
  } catch {
    // Directory does not exist or is inaccessible — return nothing.
    return results;
  }

  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectTestFiles(full, repoRoot, fs));
    } else if (entry.isFile() && isTestFile(entry.name)) {
      results.push(toPosix(path.relative(repoRoot, full)));
    }
  }

  return results;
}

/**
 * Derive naming-convention candidate test paths for a source file.
 *
 * For `src/foo/bar.ts`:
 *   - `src/foo/bar.test.ts`   (alongside, .test)
 *   - `src/foo/bar.spec.ts`   (alongside, .spec)
 *   - `tests/foo/bar.test.ts` (under tests/, .test)
 *   - `tests/foo/bar.spec.ts` (under tests/, .spec)
 *
 * Returns POSIX-style paths relative to the repo root.
 */
export function conventionCandidates(sourcePath: string): string[] {
  const posix = toPosix(sourcePath);
  const ext = SOURCE_EXTS.find((e) => posix.endsWith(e));
  if (ext === undefined) return [];

  const withoutExt = posix.slice(0, posix.length - ext.length);
  const candidates: string[] = [];

  for (const suffix of TEST_SUFFIXES) {
    // Alongside the source file.
    candidates.push(`${withoutExt}${suffix}${ext}`);
  }

  // Under `tests/` at the repo root: strip the leading directory segment.
  // e.g. "src/foo/bar.ts" → strip "src/" → "foo/bar.ts"
  const slashIdx = posix.indexOf('/');
  if (slashIdx !== -1) {
    const relative = posix.slice(slashIdx + 1);
    const relWithoutExt = relative.slice(0, relative.length - ext.length);
    for (const suffix of TEST_SUFFIXES) {
      candidates.push(`tests/${relWithoutExt}${suffix}${ext}`);
    }
  }

  return candidates;
}

/**
 * Return true if the test file at `testAbsPath` contains an import or require
 * that resolves to `sourceAbsPath` (extension-insensitive).
 *
 * Matches:
 *   import ... from '<rel>'
 *   require('<rel>')
 * where <rel> starts with './' or '../'.
 */
export function testFileImportsSource(
  testAbsPath: string,
  sourceAbsPath: string,
  fs: FsAdapter,
): boolean {
  let content: string;
  try {
    content = fs.readFileSync(testAbsPath, 'utf8');
  } catch {
    return false;
  }

  // Strip extensions from source for comparison.
  const sourceNoExt = SOURCE_EXTS.reduce(
    (acc, e) => (acc.endsWith(e) ? acc.slice(0, acc.length - e.length) : acc),
    sourceAbsPath,
  );

  const testDir = path.dirname(testAbsPath);

  // Match relative import/require specifiers.
  const re = /(?:from\s+|require\s*\(\s*)['"](\.[^'"]+)['"]/g;
  let match: RegExpExecArray | null;

  while ((match = re.exec(content)) !== null) {
    const specifier = match[1];
    if (specifier === undefined) continue;

    const resolved = path.resolve(testDir, specifier);
    const resolvedNoExt = SOURCE_EXTS.reduce(
      (acc, e) => (acc.endsWith(e) ? acc.slice(0, acc.length - e.length) : acc),
      resolved,
    );

    if (resolvedNoExt === sourceNoExt) return true;
  }

  return false;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * For each affected source file, return the test files that are plausibly
 * related to it using naming conventions and import-trace heuristics.
 *
 * @param affected  AffectedFile list from the BFS traversal stage.
 * @param repo      Path to the repository root (absolute or CWD-relative).
 * @param fsAdapter Optional filesystem adapter; defaults to Node's real `fs`.
 * @returns         TestMatch[] — one entry per affected file; `testFiles` may
 *                  be empty when no relevant tests were found.
 */
export function matchTests(
  affected: AffectedFile[],
  repo: string,
  fsAdapter: FsAdapter = defaultFsAdapter,
): TestMatch[] {
  if (affected.length === 0) return [];

  const absRepo = path.resolve(repo);

  // Collect all test files once (shared across all affected files).
  const allTestFiles = collectTestFiles(absRepo, absRepo, fsAdapter);

  return affected.map((af) => {
    const sourcePosix = toPosix(af.path);
    const sourceAbs = path.join(absRepo, sourcePosix);

    const matched = new Set<string>();

    // ------------------------------------------------------------------
    // Heuristic 1: naming-convention candidates
    // ------------------------------------------------------------------
    for (const candidate of conventionCandidates(sourcePosix)) {
      const candidateAbs = path.join(absRepo, candidate);
      if (fsAdapter.existsSync(candidateAbs)) {
        matched.add(toPosix(candidate));
      }
    }

    // ------------------------------------------------------------------
    // Heuristic 2: import-trace — test files that import the source file
    // ------------------------------------------------------------------
    for (const testRel of allTestFiles) {
      if (matched.has(testRel)) continue; // already found via convention
      const testAbs = path.join(absRepo, testRel);
      if (testFileImportsSource(testAbs, sourceAbs, fsAdapter)) {
        matched.add(testRel);
      }
    }

    // Return sorted array for deterministic output.
    const testFiles = [...matched].sort();
    return { affectedFile: sourcePosix, testFiles };
  });
}
