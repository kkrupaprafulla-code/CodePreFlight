/**
 * Unit tests for src/graph/traversal.ts
 *
 * traverseGraph is a pure function — no mocking required.
 * Every test constructs its own graph and changed-file set inline.
 *
 * Coverage checklist (per Sub-Task 6 requirements):
 *  ✓ single dependency chain
 *  ✓ multiple branches
 *  ✓ multiple changed root files
 *  ✓ depth 0
 *  ✓ depth 1
 *  ✓ depth N (> 1)
 *  ✓ depth Infinity
 *  ✓ cycle handling
 *  ✓ deduplication when multiple paths reach the same file
 *  ✓ missing graph entries (file not in map)
 *  ✓ deterministic / minimum-depth results
 */

import { describe, it, expect } from 'vitest';
import { traverseGraph } from '../../src/graph/traversal.js';
import type { ChangedFile, ReverseImportMap } from '../../src/types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a minimal ChangedFile fixture. Only `path` is relevant to the
 * traversal; status and functions are set to benign defaults.
 */
function changed(...paths: string[]): ChangedFile[] {
  return paths.map((p) => ({ path: p, status: 'modified' as const, functions: [] }));
}

/** Extract just the paths from the result for concise assertions. */
function paths(result: ReturnType<typeof traverseGraph>): string[] {
  return result.map((f) => f.path);
}

/** Extract the depth for a specific path from the result. */
function depthOf(result: ReturnType<typeof traverseGraph>, path: string): number {
  const entry = result.find((f) => f.path === path);
  if (entry === undefined) throw new Error(`path not found in result: ${path}`);
  return entry.depth;
}

// ---------------------------------------------------------------------------
// depth 0
// ---------------------------------------------------------------------------

describe('depth 0', () => {
  it('returns only the changed file when depth is 0', () => {
    const map: ReverseImportMap = {
      'src/c.ts': ['src/b.ts'],
    };
    const result = traverseGraph(map, changed('src/c.ts'), 0);

    expect(paths(result)).toEqual(['src/c.ts']);
    expect(depthOf(result, 'src/c.ts')).toBe(0);
  });

  it('returns all changed files (no expansion) when depth is 0 and multiple changed', () => {
    const map: ReverseImportMap = {
      'src/a.ts': ['src/x.ts'],
      'src/b.ts': ['src/y.ts'],
    };
    const result = traverseGraph(map, changed('src/a.ts', 'src/b.ts'), 0);

    expect(paths(result)).toContain('src/a.ts');
    expect(paths(result)).toContain('src/b.ts');
    expect(paths(result)).not.toContain('src/x.ts');
    expect(paths(result)).not.toContain('src/y.ts');
    expect(result).toHaveLength(2);
  });

  it('returns an empty array when changed list is empty', () => {
    const map: ReverseImportMap = { 'src/c.ts': ['src/b.ts'] };
    const result = traverseGraph(map, changed(), 0);
    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// depth 1
// ---------------------------------------------------------------------------

describe('depth 1', () => {
  it('returns changed file plus direct importers', () => {
    // C is changed; B imports C; A imports B.
    // Reverse graph: C→[B], B→[A]
    // depth 1 should give: C (depth 0), B (depth 1)
    const map: ReverseImportMap = {
      'src/c.ts': ['src/b.ts'],
      'src/b.ts': ['src/a.ts'],
    };
    const result = traverseGraph(map, changed('src/c.ts'), 1);

    expect(paths(result)).toContain('src/c.ts');
    expect(paths(result)).toContain('src/b.ts');
    expect(paths(result)).not.toContain('src/a.ts');
    expect(result).toHaveLength(2);
    expect(depthOf(result, 'src/c.ts')).toBe(0);
    expect(depthOf(result, 'src/b.ts')).toBe(1);
  });

  it('returns only the changed file when it has no importers', () => {
    const map: ReverseImportMap = {}; // no entries at all
    const result = traverseGraph(map, changed('src/leaf.ts'), 1);

    expect(result).toHaveLength(1);
    expect(depthOf(result, 'src/leaf.ts')).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// single dependency chain
// ---------------------------------------------------------------------------

describe('single dependency chain', () => {
  // A imports B, B imports C → reverse: C→[B], B→[A]
  // If C changes with depth Infinity, expect C, B, A.
  it('traverses a full linear chain with depth Infinity', () => {
    const map: ReverseImportMap = {
      'src/c.ts': ['src/b.ts'],
      'src/b.ts': ['src/a.ts'],
    };
    const result = traverseGraph(map, changed('src/c.ts'), Infinity);

    expect(paths(result)).toContain('src/c.ts');
    expect(paths(result)).toContain('src/b.ts');
    expect(paths(result)).toContain('src/a.ts');
    expect(result).toHaveLength(3);
    expect(depthOf(result, 'src/c.ts')).toBe(0);
    expect(depthOf(result, 'src/b.ts')).toBe(1);
    expect(depthOf(result, 'src/a.ts')).toBe(2);
  });

  it('respects depth cap on a chain', () => {
    // Four-file chain: D→C→B→A (reverse: D changed, C at 1, B at 2, A at 3)
    const map: ReverseImportMap = {
      'src/d.ts': ['src/c.ts'],
      'src/c.ts': ['src/b.ts'],
      'src/b.ts': ['src/a.ts'],
    };
    const result = traverseGraph(map, changed('src/d.ts'), 2);

    expect(paths(result)).toContain('src/d.ts');
    expect(paths(result)).toContain('src/c.ts');
    expect(paths(result)).toContain('src/b.ts');
    expect(paths(result)).not.toContain('src/a.ts'); // beyond depth 2
    expect(result).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// depth N (arbitrary integer)
// ---------------------------------------------------------------------------

describe('depth N', () => {
  it('depth 2 returns two hops from the changed file', () => {
    // reverse: c→[b], b→[a], a→[root]
    const map: ReverseImportMap = {
      'src/c.ts': ['src/b.ts'],
      'src/b.ts': ['src/a.ts'],
      'src/a.ts': ['src/root.ts'],
    };
    const result = traverseGraph(map, changed('src/c.ts'), 2);

    expect(result).toHaveLength(3); // c, b, a
    expect(paths(result)).not.toContain('src/root.ts');
    expect(depthOf(result, 'src/a.ts')).toBe(2);
  });

  it('depth 3 reaches the end of a 4-level chain', () => {
    const map: ReverseImportMap = {
      'src/d.ts': ['src/c.ts'],
      'src/c.ts': ['src/b.ts'],
      'src/b.ts': ['src/a.ts'],
    };
    const result = traverseGraph(map, changed('src/d.ts'), 3);

    expect(result).toHaveLength(4);
    expect(depthOf(result, 'src/a.ts')).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// depth Infinity
// ---------------------------------------------------------------------------

describe('depth Infinity', () => {
  it('exhausts the entire reachable graph', () => {
    const map: ReverseImportMap = {
      'src/leaf.ts': ['src/mid1.ts', 'src/mid2.ts'],
      'src/mid1.ts': ['src/top.ts'],
      'src/mid2.ts': ['src/top.ts'], // top reachable via two paths
    };
    const result = traverseGraph(map, changed('src/leaf.ts'), Infinity);

    expect(paths(result)).toContain('src/leaf.ts');
    expect(paths(result)).toContain('src/mid1.ts');
    expect(paths(result)).toContain('src/mid2.ts');
    expect(paths(result)).toContain('src/top.ts');
    expect(result).toHaveLength(4); // each file exactly once
  });
});

// ---------------------------------------------------------------------------
// multiple branches
// ---------------------------------------------------------------------------

describe('multiple branches', () => {
  it('follows all branches from a shared dependency', () => {
    // Both consumerA and consumerB import shared; shared imports base.
    // Reverse: base→[shared], shared→[consumerA, consumerB]
    // base changes → base(0), shared(1), consumerA(2), consumerB(2)
    const map: ReverseImportMap = {
      'src/base.ts': ['src/shared.ts'],
      'src/shared.ts': ['src/consumerA.ts', 'src/consumerB.ts'],
    };
    const result = traverseGraph(map, changed('src/base.ts'), Infinity);

    expect(result).toHaveLength(4);
    expect(depthOf(result, 'src/base.ts')).toBe(0);
    expect(depthOf(result, 'src/shared.ts')).toBe(1);
    expect(depthOf(result, 'src/consumerA.ts')).toBe(2);
    expect(depthOf(result, 'src/consumerB.ts')).toBe(2);
  });

  it('depth 1 from a shared dependency includes only immediate importers', () => {
    const map: ReverseImportMap = {
      'src/base.ts': ['src/shared.ts'],
      'src/shared.ts': ['src/consumerA.ts', 'src/consumerB.ts'],
    };
    const result = traverseGraph(map, changed('src/base.ts'), 1);

    expect(result).toHaveLength(2); // base, shared
    expect(paths(result)).toContain('src/base.ts');
    expect(paths(result)).toContain('src/shared.ts');
    expect(paths(result)).not.toContain('src/consumerA.ts');
    expect(paths(result)).not.toContain('src/consumerB.ts');
  });
});

// ---------------------------------------------------------------------------
// multiple changed root files
// ---------------------------------------------------------------------------

describe('multiple changed root files', () => {
  it('seeds BFS from all changed files simultaneously', () => {
    // c1→[b1], c2→[b2]; both c1 and c2 change.
    const map: ReverseImportMap = {
      'src/c1.ts': ['src/b1.ts'],
      'src/c2.ts': ['src/b2.ts'],
    };
    const result = traverseGraph(map, changed('src/c1.ts', 'src/c2.ts'), Infinity);

    expect(result).toHaveLength(4);
    for (const p of ['src/c1.ts', 'src/c2.ts', 'src/b1.ts', 'src/b2.ts']) {
      expect(paths(result)).toContain(p);
    }
    expect(depthOf(result, 'src/c1.ts')).toBe(0);
    expect(depthOf(result, 'src/c2.ts')).toBe(0);
    expect(depthOf(result, 'src/b1.ts')).toBe(1);
    expect(depthOf(result, 'src/b2.ts')).toBe(1);
  });

  it('does not duplicate a shared importer when two changed files feed into it', () => {
    // Both c1 and c2 are imported by shared.
    // Reverse: c1→[shared], c2→[shared]
    const map: ReverseImportMap = {
      'src/c1.ts': ['src/shared.ts'],
      'src/c2.ts': ['src/shared.ts'],
    };
    const result = traverseGraph(map, changed('src/c1.ts', 'src/c2.ts'), Infinity);

    // shared should appear exactly once
    const sharedEntries = result.filter((f) => f.path === 'src/shared.ts');
    expect(sharedEntries).toHaveLength(1);
    expect(result).toHaveLength(3); // c1, c2, shared
  });

  it('assigns minimum depth when a file is reachable from two changed roots at different depths', () => {
    // c1 directly imports shared (depth 1 from c1).
    // c2 is shared itself (depth 0 from c2).
    // shared should appear at depth 0 (the minimum).
    const map: ReverseImportMap = {
      'src/c1.ts': ['src/shared.ts'],
    };
    // c2 IS shared — so shared appears as a root at depth 0.
    const result = traverseGraph(map, changed('src/c1.ts', 'src/shared.ts'), Infinity);

    expect(depthOf(result, 'src/shared.ts')).toBe(0); // depth 0 wins
    expect(result).toHaveLength(2); // c1, shared
  });
});

// ---------------------------------------------------------------------------
// deduplication — multiple paths to the same file
// ---------------------------------------------------------------------------

describe('deduplication', () => {
  it('includes a file only once when reachable via multiple paths', () => {
    // Diamond: leaf→[mid1, mid2], mid1→[top], mid2→[top]
    // Reverse graph (already given as ReverseImportMap):
    //   leaf→[mid1, mid2], mid1→[top], mid2→[top]
    const map: ReverseImportMap = {
      'src/leaf.ts': ['src/mid1.ts', 'src/mid2.ts'],
      'src/mid1.ts': ['src/top.ts'],
      'src/mid2.ts': ['src/top.ts'],
    };
    const result = traverseGraph(map, changed('src/leaf.ts'), Infinity);

    const topEntries = result.filter((f) => f.path === 'src/top.ts');
    expect(topEntries).toHaveLength(1);
    expect(result).toHaveLength(4); // leaf, mid1, mid2, top
  });

  it('records the minimum BFS depth for a diamond-reachable file', () => {
    // leaf(0) → mid1(1) → top(2)
    //        → mid2(1) → top(2)
    // top should be at depth 2, not 3 or anything else.
    const map: ReverseImportMap = {
      'src/leaf.ts': ['src/mid1.ts', 'src/mid2.ts'],
      'src/mid1.ts': ['src/top.ts'],
      'src/mid2.ts': ['src/top.ts'],
    };
    const result = traverseGraph(map, changed('src/leaf.ts'), Infinity);
    expect(depthOf(result, 'src/top.ts')).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// missing graph entries
// ---------------------------------------------------------------------------

describe('missing graph entries', () => {
  it('handles a changed file that has no entry in the reverse map', () => {
    const map: ReverseImportMap = {}; // completely empty
    const result = traverseGraph(map, changed('src/orphan.ts'), Infinity);

    expect(result).toHaveLength(1);
    expect(depthOf(result, 'src/orphan.ts')).toBe(0);
  });

  it('handles a node whose importers list is empty', () => {
    const map: ReverseImportMap = {
      'src/leaf.ts': [], // exists but has no importers
    };
    const result = traverseGraph(map, changed('src/leaf.ts'), Infinity);

    expect(result).toHaveLength(1);
    expect(depthOf(result, 'src/leaf.ts')).toBe(0);
  });

  it('handles a partial graph where some intermediate nodes have no entry', () => {
    // mid is in the importers list of leaf but has no entry itself.
    const map: ReverseImportMap = {
      'src/leaf.ts': ['src/mid.ts'],
      // 'src/mid.ts' deliberately absent
    };
    const result = traverseGraph(map, changed('src/leaf.ts'), Infinity);

    expect(paths(result)).toContain('src/leaf.ts');
    expect(paths(result)).toContain('src/mid.ts');
    expect(depthOf(result, 'src/mid.ts')).toBe(1);
    expect(result).toHaveLength(2); // no crash, no extra files
  });
});

// ---------------------------------------------------------------------------
// cycle handling
// ---------------------------------------------------------------------------

describe('cycle handling', () => {
  it('does not loop infinitely on a direct self-cycle', () => {
    // A imports A (self-loop in reverse graph).
    const map: ReverseImportMap = {
      'src/a.ts': ['src/a.ts'],
    };
    const result = traverseGraph(map, changed('src/a.ts'), Infinity);

    // Should terminate and return a exactly once.
    expect(result).toHaveLength(1);
    expect(depthOf(result, 'src/a.ts')).toBe(0);
  });

  it('does not loop on a two-node cycle', () => {
    // A→B, B→A in the reverse graph (mutual import).
    const map: ReverseImportMap = {
      'src/a.ts': ['src/b.ts'],
      'src/b.ts': ['src/a.ts'],
    };
    const result = traverseGraph(map, changed('src/a.ts'), Infinity);

    // Both files should appear exactly once.
    expect(result).toHaveLength(2);
    const pset = new Set(paths(result));
    expect(pset.has('src/a.ts')).toBe(true);
    expect(pset.has('src/b.ts')).toBe(true);
  });

  it('does not loop on a three-node cycle', () => {
    const map: ReverseImportMap = {
      'src/a.ts': ['src/b.ts'],
      'src/b.ts': ['src/c.ts'],
      'src/c.ts': ['src/a.ts'],
    };
    const result = traverseGraph(map, changed('src/a.ts'), Infinity);

    expect(result).toHaveLength(3);
    const pset = new Set(paths(result));
    expect(pset.has('src/a.ts')).toBe(true);
    expect(pset.has('src/b.ts')).toBe(true);
    expect(pset.has('src/c.ts')).toBe(true);
  });

  it('cycle combined with a depth cap still terminates correctly', () => {
    const map: ReverseImportMap = {
      'src/a.ts': ['src/b.ts'],
      'src/b.ts': ['src/a.ts'],
    };
    const result = traverseGraph(map, changed('src/a.ts'), 1);

    expect(result).toHaveLength(2); // a(0), b(1)
    expect(depthOf(result, 'src/a.ts')).toBe(0);
    expect(depthOf(result, 'src/b.ts')).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// deterministic output ordering
// ---------------------------------------------------------------------------

describe('deterministic output ordering', () => {
  it('sorts output by depth ascending, then path ascending', () => {
    const map: ReverseImportMap = {
      'src/z.ts': ['src/m.ts', 'src/a.ts'],
    };
    const result = traverseGraph(map, changed('src/z.ts'), Infinity);

    // depth 0: z; depth 1: a, m (alphabetical)
    expect(result[0]!.path).toBe('src/z.ts');
    expect(result[1]!.path).toBe('src/a.ts');
    expect(result[2]!.path).toBe('src/m.ts');
  });

  it('produces the same output regardless of the insertion order in the map', () => {
    const map1: ReverseImportMap = {
      'src/root.ts': ['src/b.ts', 'src/a.ts'],
    };
    const map2: ReverseImportMap = {
      'src/root.ts': ['src/a.ts', 'src/b.ts'],
    };
    const r1 = traverseGraph(map1, changed('src/root.ts'), Infinity);
    const r2 = traverseGraph(map2, changed('src/root.ts'), Infinity);

    // After sorting, both results should be identical.
    expect(paths(r1)).toEqual(paths(r2));
  });

  it('does not mutate the input map', () => {
    const map: ReverseImportMap = {
      'src/c.ts': ['src/b.ts'],
      'src/b.ts': ['src/a.ts'],
    };
    const mapSnapshot = JSON.stringify(map);
    traverseGraph(map, changed('src/c.ts'), Infinity);
    expect(JSON.stringify(map)).toBe(mapSnapshot);
  });

  it('does not mutate the changed-files array', () => {
    const files = changed('src/c.ts');
    const snapshot = JSON.stringify(files);
    traverseGraph({}, files, Infinity);
    expect(JSON.stringify(files)).toBe(snapshot);
  });
});
