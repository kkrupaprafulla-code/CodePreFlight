/**
 * Test matcher stub.
 *
 * Sub-Task 3: returns an empty test-match list.
 * Real implementation (naming-convention lookup via fs.existsSync) added in Sub-Task 6.
 */

import type { AffectedFile, TestMatch } from '../types.js';

export function matchTests(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _affected: AffectedFile[],
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _repo: string,
): TestMatch[] {
  return [];
}
