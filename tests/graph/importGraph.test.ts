/**
 * Unit tests for src/graph/importGraph.ts
 *
 * Strategy:
 *  - invertForwardMap is a pure function — tested directly with no mocks.
 *  - buildImportGraph wraps madge via an injectable dependency (_setMadgeForTesting)
 *    so tests never perform a real filesystem walk and remain fast/deterministic.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { invertForwardMap, buildImportGraph, _setMadgeForTesting } from '../../src/graph/importGraph.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type MadgeInstance = { obj(): Record<string, string[]>; warnings(): { skipped: string[] } };
type MadgeFactory = (path: string, config: Record<string, unknown>) => Promise<MadgeInstance>;

function makeMockMadge(forwardMap: Record<string, string[]>, skipped: string[] = []): MadgeFactory {
  return vi.fn().mockResolvedValue({
    obj: () => forwardMap,
    warnings: () => ({ skipped }),
  } as MadgeInstance);
}

beforeEach(() => {
  // Reset to a safe no-op mock between tests so no test bleeds into another.
  _setMadgeForTesting(makeMockMadge({}));
});

// ---------------------------------------------------------------------------
// invertForwardMap — pure function tests (no mocking required)
// ---------------------------------------------------------------------------

describe('invertForwardMap', () => {
  it('returns an empty map for an empty forward map', () => {
    expect(invertForwardMap({})).toEqual({});
  });

  it('simple A→B relationship: B is imported by A', () => {
    const forward = { 'src/a.ts': ['src/b.ts'] };
    const result = invertForwardMap(forward);

    // b is imported by a
    expect(result['src/b.ts']).toEqual(['src/a.ts']);
    // a has no importers
    expect(result['src/a.ts']).toEqual([]);
  });

  it('multiple files importing the same file', () => {
    const forward = {
      'src/a.ts': ['src/shared.ts'],
      'src/b.ts': ['src/shared.ts'],
      'src/c.ts': ['src/shared.ts'],
    };
    const result = invertForwardMap(forward);

    expect(result['src/shared.ts']).toHaveLength(3);
    expect(result['src/shared.ts']).toContain('src/a.ts');
    expect(result['src/shared.ts']).toContain('src/b.ts');
    expect(result['src/shared.ts']).toContain('src/c.ts');
  });

  it('file with no importers appears in the map with an empty array', () => {
    const forward = { 'src/standalone.ts': [] };
    const result = invertForwardMap(forward);

    expect('src/standalone.ts' in result).toBe(true);
    expect(result['src/standalone.ts']).toEqual([]);
  });

  it('dependency that is not listed as a top-level key still appears in the reverse map', () => {
    // src/b.ts is only referenced as a dep of a — it may not have its own key
    // in the forward map (e.g. leaf file with no imports of its own).
    const forward = { 'src/a.ts': ['src/b.ts'] };
    const result = invertForwardMap(forward);

    expect('src/b.ts' in result).toBe(true);
  });

  it('chain of three files (A→B→C)', () => {
    const forward = {
      'src/a.ts': ['src/b.ts'],
      'src/b.ts': ['src/c.ts'],
    };
    const result = invertForwardMap(forward);

    expect(result['src/b.ts']).toContain('src/a.ts');
    expect(result['src/c.ts']).toContain('src/b.ts');
    expect(result['src/a.ts']).toEqual([]);
  });

  it('uses forward-slash path separators (POSIX normalisation)', () => {
    // Paths must always use / to match git diff output on all platforms.
    const forward = { 'src/utils/helper.ts': ['src/components/widget.ts'] };
    const result = invertForwardMap(forward);

    const keys = Object.keys(result);
    for (const k of keys) {
      expect(k).not.toContain('\\');
    }
    const values = Object.values(result).flat();
    for (const v of values) {
      expect(v).not.toContain('\\');
    }
  });

  it('does not lose importers when same dep appears twice in forward list', () => {
    // Even if madge emits duplicates defensively, a should still be in b's importers.
    const forward = { 'src/a.ts': ['src/b.ts', 'src/b.ts'] };
    const result = invertForwardMap(forward);
    expect(result['src/b.ts']).toContain('src/a.ts');
  });
});

// ---------------------------------------------------------------------------
// buildImportGraph — integration of invertForwardMap + madge call
// ---------------------------------------------------------------------------

describe('buildImportGraph', () => {
  it('calls madge with the repo path and expected config', async () => {
    const mockFactory = makeMockMadge({});
    _setMadgeForTesting(mockFactory);

    await buildImportGraph('/some/repo');

    expect(mockFactory).toHaveBeenCalledWith('/some/repo', expect.objectContaining({
      fileExtensions: expect.arrayContaining(['ts', 'js']),
    }));
  });

  it('returns an empty reverse map when the forward map is empty', async () => {
    _setMadgeForTesting(makeMockMadge({}));

    const result = await buildImportGraph('.');
    expect(result).toEqual({});
  });

  it('returns a correct reverse map for a simple forward map from madge', async () => {
    _setMadgeForTesting(makeMockMadge({
      'src/consumer.ts': ['src/utils.ts'],
    }));

    const result = await buildImportGraph('.');

    expect(result['src/utils.ts']).toContain('src/consumer.ts');
    expect(result['src/consumer.ts']).toEqual([]);
  });

  it('handles unresolved imports gracefully — does not throw', async () => {
    _setMadgeForTesting(makeMockMadge({}, ['some/unresolved-module']));

    await expect(buildImportGraph('.')).resolves.toBeDefined();
  });

  it('writes unresolved import warnings to stderr', async () => {
    _setMadgeForTesting(makeMockMadge({}, ['missing/dep']));

    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    try {
      await buildImportGraph('.');
      expect(stderrSpy).toHaveBeenCalledWith(
        expect.stringContaining('missing/dep'),
      );
    } finally {
      stderrSpy.mockRestore();
    }
  });

  it('does not write to stderr when there are no unresolved imports', async () => {
    _setMadgeForTesting(makeMockMadge({ 'src/a.ts': [] }));

    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    try {
      await buildImportGraph('.');
      expect(stderrSpy).not.toHaveBeenCalled();
    } finally {
      stderrSpy.mockRestore();
    }
  });
});
