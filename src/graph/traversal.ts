/**
 * Graph traversal stub.
 *
 * Sub-Task 3: returns an empty affected-file list.
 * Real implementation (BFS over reverse import map with depth cap) added in Sub-Task 5.
 */

import type { AffectedFile, ChangedFile, ReverseImportMap } from '../types.js';

export function traverseGraph(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _map: ReverseImportMap,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _changed: ChangedFile[],
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _depth: number,
): AffectedFile[] {
  return [];
}
