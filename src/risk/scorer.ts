/**
 * Risk scorer — weighted heuristic implementation.
 *
 * Each affected file receives a numeric score based on observable signals.
 * The score is then mapped to a RiskLevel bucket.
 *
 * Heuristic weights (named constants — never hard-code these elsewhere):
 *   WEIGHT_DIRECTLY_CHANGED  +1 if the file is directly changed (depth 0)
 *   WEIGHT_NO_TEST_MATCH     +1 if the file has no associated test files
 *   WEIGHT_BARREL_FILE       +1 if the file is a barrel/index file
 *   WEIGHT_MANY_FUNCTIONS    +1 if the changed file has more than 5 modified functions
 *
 * Score → RiskLevel mapping:
 *   0–1  → Low
 *   2    → Medium
 *   3    → High
 *   4+   → Critical
 */

import type { AffectedFile, DiffResult, ScoredFile, TestMatch } from '../types.js';

// ---------------------------------------------------------------------------
// Weight constants — source of truth for all heuristic weights.
// Never hard-code numeric weights elsewhere in the codebase.
// ---------------------------------------------------------------------------

/** +1 when the file appears in the diff's changedFiles list (depth 0). */
export const WEIGHT_DIRECTLY_CHANGED = 1;

/** +1 when the file has no test match (testFiles is empty). */
export const WEIGHT_NO_TEST_MATCH = 1;

/** +1 when the file is a barrel/index file (basename is index.*). */
export const WEIGHT_BARREL_FILE = 1;

/** +1 when the directly changed file has more than 5 modified functions. */
export const WEIGHT_MANY_FUNCTIONS = 1;

/** Threshold above which a file is considered to have "many" modified functions. */
const MANY_FUNCTIONS_THRESHOLD = 5;

// ---------------------------------------------------------------------------
// Score → bucket mapping
// ---------------------------------------------------------------------------

function scoreToRiskLevel(score: number): ScoredFile['risk'] {
  if (score >= 4) return 'Critical';
  if (score === 3) return 'High';
  if (score === 2) return 'Medium';
  return 'Low';
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Score each affected file using the four heuristics defined above.
 *
 * @param affected     Files returned by the BFS traversal stage.
 * @param diff         Parsed diff — used to identify directly-changed files
 *                     and their modified function counts.
 * @param testMatches  Test-matcher output — used to detect files with no tests.
 * @returns            ScoredFile[] — one entry per affected file, in the same
 *                     order as `affected`.
 */
export function scoreFiles(
  affected: AffectedFile[],
  diff: DiffResult,
  testMatches: TestMatch[],
): ScoredFile[] {
  // Build lookup sets / maps for O(1) cross-referencing.
  const changedPathSet = new Set(diff.changedFiles.map((f) => f.path));
  const functionCountMap = new Map(
    diff.changedFiles.map((f) => [f.path, f.functions.length]),
  );
  const testMatchMap = new Map(testMatches.map((t) => [t.affectedFile, t.testFiles]));

  return affected.map((af): ScoredFile => {
    let score = 0;
    const reasons: string[] = [];

    // Heuristic 1: directly changed
    if (changedPathSet.has(af.path)) {
      score += WEIGHT_DIRECTLY_CHANGED;
      reasons.push('Directly changed');
    }

    // Heuristic 2: no test coverage
    const testFiles = testMatchMap.get(af.path) ?? [];
    if (testFiles.length === 0) {
      score += WEIGHT_NO_TEST_MATCH;
      reasons.push('No test coverage');
    }

    // Heuristic 3: barrel/index file
    const basename = af.path.replace(/\\/g, '/').split('/').pop() ?? '';
    if (/^index\.(ts|tsx|js|jsx)$/.test(basename)) {
      score += WEIGHT_BARREL_FILE;
      reasons.push('Barrel/index file');
    }

    // Heuristic 4: many modified functions (only meaningful for directly-changed files)
    const fnCount = functionCountMap.get(af.path) ?? 0;
    if (fnCount > MANY_FUNCTIONS_THRESHOLD) {
      score += WEIGHT_MANY_FUNCTIONS;
      reasons.push(`Many modified functions (${fnCount})`);
    }

    return { path: af.path, risk: scoreToRiskLevel(score), reasons };
  });
}
