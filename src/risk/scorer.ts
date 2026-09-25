/**
 * Risk scorer stub.
 *
 * Sub-Task 3: returns an empty scored-file list.
 * Real implementation (weighted heuristics → Low/Medium/High/Critical) added in Sub-Task 7.
 *
 * NOTE: Risk scorer weights are defined here as named constants.
 * Never hard-code numeric weights elsewhere in the codebase.
 */

import type { AffectedFile, DiffResult, ScoredFile, TestMatch } from '../types.js';

// Weight constants — real values assigned in Sub-Task 7.
export const WEIGHT_DIRECTLY_CHANGED = 1;
export const WEIGHT_NO_TEST_MATCH = 1;
export const WEIGHT_BARREL_FILE = 1;
export const WEIGHT_MANY_FUNCTIONS = 1;

export function scoreFiles(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _affected: AffectedFile[],
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _diff: DiffResult,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _testMatches: TestMatch[],
): ScoredFile[] {
  return [];
}
