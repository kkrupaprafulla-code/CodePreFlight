/**
 * BFS traversal over a reverse import graph.
 *
 * Given the set of directly changed files and a reverse import map
 * (key = file, value = files that import/depend on that file), this
 * function expands outward hop-by-hop up to `depth` levels and returns
 * every reachable file with the minimum BFS depth at which it was reached.
 *
 * Depth semantics:
 *   depth 0  — return only the changed files themselves (no expansion).
 *   depth 1  — changed files + direct importers (one hop).
 *   depth N  — changed files + importers up to N hops out.
 *   Infinity — full reachable reverse-import subgraph (default CLI value).
 *
 * The scorer receives exactly this list; there is no hidden full-traversal
 * that bypasses the depth cap.
 */

import type { AffectedFile, ChangedFile, ReverseImportMap } from '../types.js';

/**
 * Traverse the reverse import graph using BFS.
 *
 * @param map     - Reverse import map: file → [files that import it].
 * @param changed - The set of directly changed files from the diff parser.
 * @param depth   - Maximum BFS hops from the changed set (0 = no expansion,
 *                  Infinity = unlimited).
 * @returns       AffectedFile[] sorted by (depth ASC, path ASC) for
 *                deterministic, reproducible output.
 */
export function traverseGraph(
  map: ReverseImportMap,
  changed: ChangedFile[],
  depth: number,
): AffectedFile[] {
  // visited maps each file path to the minimum BFS depth it was first seen at.
  const visited = new Map<string, number>();

  // BFS queue: each entry is [filePath, currentDepth].
  const queue: Array<[string, number]> = [];

  // Seed the queue with every directly changed file at depth 0.
  for (const file of changed) {
    if (!visited.has(file.path)) {
      visited.set(file.path, 0);
      queue.push([file.path, 0]);
    }
  }

  // BFS expansion — only expand when we haven't yet reached the depth cap.
  let head = 0;
  while (head < queue.length) {
    const [current, currentDepth] = queue[head++]!;

    // Do not expand this node if we are already at the depth limit.
    if (currentDepth >= depth) {
      continue;
    }

    // Look up which files import `current` in the reverse graph.
    const importers = map[current];
    if (importers === undefined || importers.length === 0) {
      continue;
    }

    for (const importer of importers) {
      // Only enqueue if this file has not been visited yet (first-visit wins
      // for minimum-depth tracking; cycles are naturally prevented).
      if (!visited.has(importer)) {
        const nextDepth = currentDepth + 1;
        visited.set(importer, nextDepth);
        queue.push([importer, nextDepth]);
      }
    }
  }

  // Build the output array and sort for deterministic ordering:
  // primary key = depth ascending, secondary key = path ascending.
  const result: AffectedFile[] = [];
  for (const [path, fileDepth] of visited) {
    result.push({ path, depth: fileDepth });
  }

  result.sort((a, b) => a.depth - b.depth || a.path.localeCompare(b.path));

  return result;
}
