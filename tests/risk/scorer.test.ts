/**
 * Unit tests for src/risk/scorer.ts
 *
 * scoreFiles is a pure function — no mocking required.
 * Every test constructs its own minimal inputs inline.
 *
 * Coverage checklist:
 *  ✓ empty affected list
 *  ✓ heuristic 1: directly changed (+1)
 *  ✓ heuristic 2: no test coverage (+1)
 *  ✓ heuristic 3: barrel/index file (+1)
 *  ✓ heuristic 4: many modified functions (+1)
 *  ✓ score → bucket mapping (Low / Medium / High / Critical)
 *  ✓ all four heuristics applied simultaneously → Critical
 *  ✓ transitive dependent (not directly changed) scores independently
 *  ✓ reasons array reflects exactly which heuristics fired
 *  ✓ output order matches input order
 *  ✓ input arrays are not mutated
 *  ✓ exported weight constants are all 1
 */

import { describe, it, expect } from 'vitest';
import {
  scoreFiles,
  WEIGHT_DIRECTLY_CHANGED,
  WEIGHT_NO_TEST_MATCH,
  WEIGHT_BARREL_FILE,
  WEIGHT_MANY_FUNCTIONS,
} from '../../src/risk/scorer.js';
import type { AffectedFile, ChangedFile, DiffResult, TestMatch } from '../../src/types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function af(p: string, depth = 0): AffectedFile {
  return { path: p, depth };
}

function changedFile(
  p: string,
  functions: string[] = [],
  status: ChangedFile['status'] = 'modified',
): ChangedFile {
  return { path: p, status, functions };
}

function diff(...files: ChangedFile[]): DiffResult {
  return { changedFiles: files, baseBranch: null };
}

function testMatch(affectedFile: string, ...testFiles: string[]): TestMatch {
  return { affectedFile, testFiles };
}

/** Returns a DiffResult with no changed files. */
function emptyDiff(): DiffResult {
  return { changedFiles: [], baseBranch: null };
}

// ---------------------------------------------------------------------------
// Weight constants
// ---------------------------------------------------------------------------

describe('exported weight constants', () => {
  it('WEIGHT_DIRECTLY_CHANGED is 1', () => {
    expect(WEIGHT_DIRECTLY_CHANGED).toBe(1);
  });

  it('WEIGHT_NO_TEST_MATCH is 1', () => {
    expect(WEIGHT_NO_TEST_MATCH).toBe(1);
  });

  it('WEIGHT_BARREL_FILE is 1', () => {
    expect(WEIGHT_BARREL_FILE).toBe(1);
  });

  it('WEIGHT_MANY_FUNCTIONS is 1', () => {
    expect(WEIGHT_MANY_FUNCTIONS).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Empty input
// ---------------------------------------------------------------------------

describe('empty affected list', () => {
  it('returns an empty array when affected is empty', () => {
    const result = scoreFiles([], emptyDiff(), []);
    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Heuristic 1: directly changed
// ---------------------------------------------------------------------------

describe('heuristic 1 — directly changed', () => {
  it('adds "Directly changed" reason when file is in the diff', () => {
    const result = scoreFiles(
      [af('src/foo.ts')],
      diff(changedFile('src/foo.ts')),
      [testMatch('src/foo.ts', 'tests/foo.test.ts')],
    );
    expect(result[0]!.reasons).toContain('Directly changed');
  });

  it('does not add "Directly changed" for a transitive dependent', () => {
    const result = scoreFiles(
      [af('src/consumer.ts', 1)],
      diff(changedFile('src/foo.ts')),         // consumer is NOT in the diff
      [testMatch('src/consumer.ts', 'tests/consumer.test.ts')],
    );
    expect(result[0]!.reasons).not.toContain('Directly changed');
  });

  it('contributes +1 to score', () => {
    // Only heuristic 1 fires: directly changed, has tests, not a barrel, ≤5 fns
    const result = scoreFiles(
      [af('src/foo.ts')],
      diff(changedFile('src/foo.ts', ['a', 'b'])),
      [testMatch('src/foo.ts', 'tests/foo.test.ts')],
    );
    // score = 1 → Low
    expect(result[0]!.risk).toBe('Low');
  });
});

// ---------------------------------------------------------------------------
// Heuristic 2: no test coverage
// ---------------------------------------------------------------------------

describe('heuristic 2 — no test coverage', () => {
  it('adds "No test coverage" reason when testFiles is empty', () => {
    const result = scoreFiles(
      [af('src/foo.ts')],
      emptyDiff(),
      [testMatch('src/foo.ts')],           // empty testFiles
    );
    expect(result[0]!.reasons).toContain('No test coverage');
  });

  it('adds "No test coverage" when the file has no TestMatch entry at all', () => {
    const result = scoreFiles(
      [af('src/bar.ts')],
      emptyDiff(),
      [],                                  // no entry for bar.ts
    );
    expect(result[0]!.reasons).toContain('No test coverage');
  });

  it('does not add "No test coverage" when at least one test file exists', () => {
    const result = scoreFiles(
      [af('src/foo.ts')],
      emptyDiff(),
      [testMatch('src/foo.ts', 'tests/foo.test.ts')],
    );
    expect(result[0]!.reasons).not.toContain('No test coverage');
  });

  it('contributes +1 to score', () => {
    // Only heuristic 2 fires: not directly changed, no tests, not a barrel, 0 fns
    const result = scoreFiles(
      [af('src/foo.ts', 1)],
      emptyDiff(),
      [testMatch('src/foo.ts')],
    );
    // score = 1 → Low
    expect(result[0]!.risk).toBe('Low');
  });
});

// ---------------------------------------------------------------------------
// Heuristic 3: barrel/index file
// ---------------------------------------------------------------------------

describe('heuristic 3 — barrel/index file', () => {
  const barrelPaths = [
    'src/index.ts',
    'src/index.tsx',
    'src/index.js',
    'src/index.jsx',
    'src/foo/index.ts',
  ];

  for (const p of barrelPaths) {
    it(`adds "Barrel/index file" reason for ${p}`, () => {
      const result = scoreFiles(
        [af(p)],
        emptyDiff(),
        [testMatch(p, 'tests/index.test.ts')],
      );
      expect(result[0]!.reasons).toContain('Barrel/index file');
    });
  }

  it('does not add "Barrel/index file" reason for a non-index file', () => {
    const result = scoreFiles(
      [af('src/foo.ts')],
      emptyDiff(),
      [testMatch('src/foo.ts', 'tests/foo.test.ts')],
    );
    expect(result[0]!.reasons).not.toContain('Barrel/index file');
  });

  it('does not add reason for a file with "index" mid-path but non-index basename', () => {
    const result = scoreFiles(
      [af('src/index-utils.ts')],
      emptyDiff(),
      [testMatch('src/index-utils.ts', 'tests/index-utils.test.ts')],
    );
    expect(result[0]!.reasons).not.toContain('Barrel/index file');
  });

  it('contributes +1 to score', () => {
    // Only heuristic 3 fires: not directly changed, has tests, is a barrel, 0 fns
    const result = scoreFiles(
      [af('src/index.ts', 1)],
      emptyDiff(),
      [testMatch('src/index.ts', 'tests/index.test.ts')],
    );
    // score = 1 → Low
    expect(result[0]!.risk).toBe('Low');
  });
});

// ---------------------------------------------------------------------------
// Heuristic 4: many modified functions
// ---------------------------------------------------------------------------

describe('heuristic 4 — many modified functions', () => {
  it('adds reason when changed file has > 5 functions', () => {
    const fns = ['a', 'b', 'c', 'd', 'e', 'f']; // 6 functions
    const result = scoreFiles(
      [af('src/foo.ts')],
      diff(changedFile('src/foo.ts', fns)),
      [testMatch('src/foo.ts', 'tests/foo.test.ts')],
    );
    expect(result[0]!.reasons.some((r) => r.startsWith('Many modified functions'))).toBe(true);
  });

  it('includes the function count in the reason string', () => {
    const fns = Array.from({ length: 7 }, (_, i) => `fn${i}`);
    const result = scoreFiles(
      [af('src/foo.ts')],
      diff(changedFile('src/foo.ts', fns)),
      [testMatch('src/foo.ts', 'tests/foo.test.ts')],
    );
    expect(result[0]!.reasons.some((r) => r.includes('7'))).toBe(true);
  });

  it('does not add reason when file has exactly 5 functions', () => {
    const fns = ['a', 'b', 'c', 'd', 'e']; // exactly 5
    const result = scoreFiles(
      [af('src/foo.ts')],
      diff(changedFile('src/foo.ts', fns)),
      [testMatch('src/foo.ts', 'tests/foo.test.ts')],
    );
    expect(result[0]!.reasons.some((r) => r.startsWith('Many modified functions'))).toBe(false);
  });

  it('does not add reason for transitive dependent with 0 functions in diff', () => {
    // src/consumer.ts is NOT in the diff; only src/foo.ts is.
    const result = scoreFiles(
      [af('src/consumer.ts', 1)],
      diff(changedFile('src/foo.ts', ['a', 'b', 'c', 'd', 'e', 'f'])),
      [testMatch('src/consumer.ts', 'tests/consumer.test.ts')],
    );
    expect(result[0]!.reasons.some((r) => r.startsWith('Many modified functions'))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Score → RiskLevel bucket mapping
// ---------------------------------------------------------------------------

describe('score to risk level mapping', () => {
  it('score 0 → Low', () => {
    // No heuristics fire: not changed, has tests, not barrel, 0 fns
    const result = scoreFiles(
      [af('src/foo.ts', 1)],
      emptyDiff(),
      [testMatch('src/foo.ts', 'tests/foo.test.ts')],
    );
    expect(result[0]!.risk).toBe('Low');
  });

  it('score 1 → Low', () => {
    // Only heuristic 1 fires
    const result = scoreFiles(
      [af('src/foo.ts')],
      diff(changedFile('src/foo.ts')),
      [testMatch('src/foo.ts', 'tests/foo.test.ts')],
    );
    expect(result[0]!.risk).toBe('Low');
  });

  it('score 2 → Medium', () => {
    // Heuristics 1 + 2: directly changed, no tests
    const result = scoreFiles(
      [af('src/foo.ts')],
      diff(changedFile('src/foo.ts')),
      [testMatch('src/foo.ts')],             // empty testFiles
    );
    expect(result[0]!.risk).toBe('Medium');
  });

  it('score 3 → High', () => {
    // Heuristics 1 + 2 + 3: directly changed, no tests, barrel file
    const result = scoreFiles(
      [af('src/index.ts')],
      diff(changedFile('src/index.ts')),
      [testMatch('src/index.ts')],
    );
    expect(result[0]!.risk).toBe('High');
  });

  it('score 4 → Critical', () => {
    // All four heuristics fire
    const fns = Array.from({ length: 6 }, (_, i) => `fn${i}`);
    const result = scoreFiles(
      [af('src/index.ts')],
      diff(changedFile('src/index.ts', fns)),
      [testMatch('src/index.ts')],
    );
    expect(result[0]!.risk).toBe('Critical');
  });

  it('score > 4 → Critical (does not exceed the bucket)', () => {
    // All four heuristics fire on an affected file — still Critical, not beyond
    const fns = Array.from({ length: 10 }, (_, i) => `fn${i}`);
    const result = scoreFiles(
      [af('src/index.ts')],
      diff(changedFile('src/index.ts', fns)),
      [testMatch('src/index.ts')],
    );
    expect(result[0]!.risk).toBe('Critical');
  });
});

// ---------------------------------------------------------------------------
// Multiple files — output order and independence
// ---------------------------------------------------------------------------

describe('multiple affected files', () => {
  it('returns one ScoredFile per affected file', () => {
    const result = scoreFiles(
      [af('src/a.ts'), af('src/b.ts'), af('src/c.ts')],
      emptyDiff(),
      [],
    );
    expect(result).toHaveLength(3);
  });

  it('output order matches input order', () => {
    const result = scoreFiles(
      [af('src/a.ts'), af('src/b.ts')],
      emptyDiff(),
      [],
    );
    expect(result[0]!.path).toBe('src/a.ts');
    expect(result[1]!.path).toBe('src/b.ts');
  });

  it('scores each file independently', () => {
    // a.ts: directly changed + no tests → Medium
    // b.ts: transitive dependent + has tests → Low
    const result = scoreFiles(
      [af('src/a.ts'), af('src/b.ts', 1)],
      diff(changedFile('src/a.ts')),
      [
        testMatch('src/a.ts'),                             // no tests
        testMatch('src/b.ts', 'tests/b.test.ts'),
      ],
    );
    expect(result[0]!.risk).toBe('Medium');
    expect(result[1]!.risk).toBe('Low');
  });
});

// ---------------------------------------------------------------------------
// Input immutability
// ---------------------------------------------------------------------------

describe('input immutability', () => {
  it('does not mutate the affected array', () => {
    const affected = [af('src/foo.ts')];
    const snapshot = JSON.stringify(affected);
    scoreFiles(affected, emptyDiff(), []);
    expect(JSON.stringify(affected)).toBe(snapshot);
  });

  it('does not mutate the DiffResult', () => {
    const d = diff(changedFile('src/foo.ts', ['fn1']));
    const snapshot = JSON.stringify(d);
    scoreFiles([af('src/foo.ts')], d, []);
    expect(JSON.stringify(d)).toBe(snapshot);
  });

  it('does not mutate the testMatches array', () => {
    const matches = [testMatch('src/foo.ts', 'tests/foo.test.ts')];
    const snapshot = JSON.stringify(matches);
    scoreFiles([af('src/foo.ts')], emptyDiff(), matches);
    expect(JSON.stringify(matches)).toBe(snapshot);
  });
});

// ---------------------------------------------------------------------------
// Scorer only scores what it receives
// ---------------------------------------------------------------------------

describe('scorer boundary — only scores received files', () => {
  it('does not include files from the diff that are not in the affected list', () => {
    // diff has src/a.ts and src/b.ts, but affected only contains src/a.ts
    const result = scoreFiles(
      [af('src/a.ts')],
      diff(changedFile('src/a.ts'), changedFile('src/b.ts')),
      [],
    );
    expect(result).toHaveLength(1);
    expect(result[0]!.path).toBe('src/a.ts');
  });
});
