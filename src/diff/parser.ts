/**
 * Diff parser stub.
 *
 * Sub-Task 3: returns an empty DiffResult.
 * Real implementation (simple-git + hunk parsing) added in Sub-Task 4.
 */

import type { CliOptions, DiffResult } from '../types.js';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function parseDiff(_options: CliOptions): Promise<DiffResult> {
  return { changedFiles: [], baseBranch: null };
}
