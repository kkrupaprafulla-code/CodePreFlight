/**
 * Unit tests for src/diff/parser.ts
 *
 * simple-git is fully mocked — no real git repository is touched.
 * All inputs are controlled fixture strings.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { CliOptions } from '../../src/types.js';

// ---------------------------------------------------------------------------
// Mock simple-git before importing the module under test.
// vi.mock is hoisted to the top of the file by Vitest's transform.
// ---------------------------------------------------------------------------

const mockDiff = vi.fn<[string[]], Promise<string>>();

vi.mock('simple-git', () => ({
  simpleGit: vi.fn(() => ({
    diff: mockDiff,
  })),
}));

// Import AFTER the mock is registered.
import { parseDiff } from '../../src/diff/parser.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeOptions(overrides: Partial<CliOptions> = {}): CliOptions {
  return {
    staged: false,
    branch: undefined,
    depth: Infinity,
    format: 'cli',
    repo: '.',
    output: 'impact-report.html',
    ...overrides,
  };
}

/**
 * Build a minimal unified diff string for a single file with the given hunk lines.
 * Lines in `addedLines` will be prefixed with `+`.
 */
function makeDiff(filePath: string, addedLines: string[]): string {
  const header = [
    `diff --git a/${filePath} b/${filePath}`,
    `--- a/${filePath}`,
    `+++ b/${filePath}`,
    '@@ -0,0 +1 @@',
  ].join('\n');

  const body = addedLines.map((l) => `+${l}`).join('\n');

  return `${header}\n${body}\n`;
}

/**
 * Build a --name-status string for a set of file changes.
 */
function makeNameStatus(
  entries: Array<{ letter: string; path: string }>,
): string {
  return entries
    .map(({ letter, path }) => `${letter}\t${path}`)
    .join('\n');
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  mockDiff.mockReset();
});

describe('parseDiff — file detection', () => {
  it(
    'detects unstaged working-tree changes when neither --staged nor branch is set',
    async () => {
      const nameStatus = makeNameStatus([
        { letter: 'M', path: 'src/foo.ts' },
      ]);

      const hunk = makeDiff('src/foo.ts', ['const x = () => 1;']);

      mockDiff
        .mockResolvedValueOnce(nameStatus) // --name-status call
        .mockResolvedValueOnce(hunk); // hunk call

      const result = await parseDiff(makeOptions());

      expect(result).toEqual({
        changedFiles: [
          {
            path: 'src/foo.ts',
            status: 'modified',
            functions: ['x'],
          },
        ],
        baseBranch: null,
      });

      expect(mockDiff).toHaveBeenCalledTimes(2);
    },
  );

  it('detects a modified file via --staged', async () => {
    const nameStatus = makeNameStatus([
      { letter: 'M', path: 'src/foo.ts' },
    ]);

    const hunk = makeDiff('src/foo.ts', ['const x = 1;']);

    mockDiff
      .mockResolvedValueOnce(nameStatus) // --name-status call
      .mockResolvedValueOnce(hunk); // hunk call

    const result = await parseDiff(makeOptions({ staged: true }));

    expect(result.baseBranch).toBeNull();
    expect(result.changedFiles).toHaveLength(1);
    expect(result.changedFiles[0].path).toBe('src/foo.ts');
    expect(result.changedFiles[0].status).toBe('modified');
  });

  it('detects an added file via --staged', async () => {
    const nameStatus = makeNameStatus([
      { letter: 'A', path: 'src/new.ts' },
    ]);

    const hunk = makeDiff('src/new.ts', [
      'export const hello = () => console.log("hi");',
    ]);

    mockDiff
      .mockResolvedValueOnce(nameStatus)
      .mockResolvedValueOnce(hunk);

    const result = await parseDiff(makeOptions({ staged: true }));

    expect(result.changedFiles[0].status).toBe('added');
  });

  it('detects a deleted file via --staged', async () => {
    const nameStatus = makeNameStatus([
      { letter: 'D', path: 'src/old.ts' },
    ]);

    // Deleted files produce no +++ header — splitDiffByFile returns no section.
    mockDiff
      .mockResolvedValueOnce(nameStatus)
      .mockResolvedValueOnce('');

    const result = await parseDiff(makeOptions({ staged: true }));

    expect(result.changedFiles[0].status).toBe('deleted');
    expect(result.changedFiles[0].functions).toEqual([]);
  });

  it('detects multiple files in a single diff', async () => {
    const nameStatus = makeNameStatus([
      { letter: 'M', path: 'src/a.ts' },
      { letter: 'A', path: 'src/b.ts' },
      { letter: 'D', path: 'src/c.ts' },
    ]);

    const hunk =
      makeDiff('src/a.ts', ['function alpha() {}']) +
      makeDiff('src/b.ts', ['function beta() {}']);

    mockDiff
      .mockResolvedValueOnce(nameStatus)
      .mockResolvedValueOnce(hunk);

    const result = await parseDiff(makeOptions({ staged: true }));

    expect(result.changedFiles).toHaveLength(3);

    const paths = result.changedFiles.map((f) => f.path);

    expect(paths).toContain('src/a.ts');
    expect(paths).toContain('src/b.ts');
    expect(paths).toContain('src/c.ts');
  });

  it('sets baseBranch to the branch name when comparing branches', async () => {
    const nameStatus = makeNameStatus([
      { letter: 'M', path: 'src/foo.ts' },
    ]);

    const hunk = makeDiff('src/foo.ts', ['const x = 1;']);

    mockDiff
      .mockResolvedValueOnce(nameStatus)
      .mockResolvedValueOnce(hunk);

    const result = await parseDiff(
      makeOptions({ branch: 'feature/abc' }),
    );

    expect(result.baseBranch).toBe('feature/abc');
  });

  it('passes the correct args to git.diff for --staged', async () => {
    mockDiff
      .mockResolvedValueOnce('')
      .mockResolvedValueOnce('');

    await parseDiff(makeOptions({ staged: true }));

    expect(mockDiff).toHaveBeenCalledWith([
      '--staged',
      '--name-status',
    ]);

    expect(mockDiff).toHaveBeenCalledWith(['--staged']);
  });

  it('passes the correct args to git.diff for branch comparison', async () => {
    mockDiff
      .mockResolvedValueOnce('')
      .mockResolvedValueOnce('');

    await parseDiff(makeOptions({ branch: 'main' }));

    expect(mockDiff).toHaveBeenCalledWith([
      'main',
      'HEAD',
      '--name-status',
    ]);

    expect(mockDiff).toHaveBeenCalledWith([
      'main',
      'HEAD',
    ]);
  });

  it('returns empty result when diff output is empty', async () => {
    mockDiff
      .mockResolvedValueOnce('')
      .mockResolvedValueOnce('');

    const result = await parseDiff(makeOptions({ staged: true }));

    expect(result.changedFiles).toEqual([]);
    expect(result.baseBranch).toBeNull();
  });
});

describe('parseDiff — function-name extraction', () => {
  /**
   * Helper: run parseDiff with a synthetic staged diff and return the
   * function names extracted for the given file.
   */
  async function extractedNames(
    hunkLines: string[],
    filePath = 'src/test.ts',
  ): Promise<string[]> {
    const nameStatus = makeNameStatus([
      { letter: 'M', path: filePath },
    ]);

    const hunk = makeDiff(filePath, hunkLines);

    mockDiff
      .mockResolvedValueOnce(nameStatus)
      .mockResolvedValueOnce(hunk);

    const result = await parseDiff(
      makeOptions({ staged: true }),
    );

    return result.changedFiles[0]?.functions ?? [];
  }

  it('extracts a plain function declaration', async () => {
    const names = await extractedNames([
      'function greet() { return "hi"; }',
    ]);

    expect(names).toContain('greet');
  });

  it('extracts an exported function declaration', async () => {
    const names = await extractedNames([
      'export function calculate(x: number) {}',
    ]);

    expect(names).toContain('calculate');
  });

  it('extracts an async function declaration', async () => {
    const names = await extractedNames([
      'async function fetchData() {}',
    ]);

    expect(names).toContain('fetchData');
  });

  it('extracts an exported async function declaration', async () => {
    const names = await extractedNames([
      'export async function loadUser() {}',
    ]);

    expect(names).toContain('loadUser');
  });

  it('extracts a const arrow-function assignment', async () => {
    const names = await extractedNames([
      'const handler = (req, res) => {}',
    ]);

    expect(names).toContain('handler');
  });

  it('extracts an exported const arrow-function assignment', async () => {
    const names = await extractedNames([
      'export const transform = (x) => x * 2;',
    ]);

    expect(names).toContain('transform');
  });

  it('extracts an async const arrow-function assignment', async () => {
    const names = await extractedNames([
      'const fetchAll = async () => {}',
    ]);

    expect(names).toContain('fetchAll');
  });

  it('deduplicates function names that appear more than once', async () => {
    const names = await extractedNames([
      'function process() {}',
      'function process() {}',
    ]);

    expect(names.filter((n) => n === 'process')).toHaveLength(1);
  });

  it('does not extract names from removed lines (- prefix)', async () => {
    // makeDiff prefixes lines with +; we inject a raw - line via a custom diff.
    const nameStatus = makeNameStatus([
      { letter: 'M', path: 'src/test.ts' },
    ]);

    const rawDiff = [
      'diff --git a/src/test.ts b/src/test.ts',
      '--- a/src/test.ts',
      '+++ b/src/test.ts',
      '@@ -1,1 +1,0 @@',
      '-function deleted() {}',
    ].join('\n');

    mockDiff
      .mockResolvedValueOnce(nameStatus)
      .mockResolvedValueOnce(rawDiff);

    const result = await parseDiff(
      makeOptions({ staged: true }),
    );

    expect(result.changedFiles[0].functions).toEqual([]);
  });

  it('does not extract from +++ file header lines', async () => {
    // The +++ line looks like it starts with + but must be ignored.
    const nameStatus = makeNameStatus([
      { letter: 'M', path: 'src/test.ts' },
    ]);

    const rawDiff = [
      'diff --git a/src/test.ts b/src/test.ts',
      '--- a/src/test.ts',
      '+++ b/src/test.ts',
      '@@ -0,0 +1 @@',
    ].join('\n');

    mockDiff
      .mockResolvedValueOnce(nameStatus)
      .mockResolvedValueOnce(rawDiff);

    const result = await parseDiff(
      makeOptions({ staged: true }),
    );

    expect(result.changedFiles[0].functions).toEqual([]);
  });

  // ---------------------------------------------------------------------------
  // Known limitations — documented and intentional
  // These tests confirm that heuristic extraction does NOT capture these patterns.
  // If these tests ever start failing, it means the extractor was enhanced to handle
  // them, which is acceptable — but the change should be intentional and reviewed.
  // ---------------------------------------------------------------------------

  it('LIMITATION: does not extract class methods', async () => {
    const names = await extractedNames([
      '  myMethod() { return 42; }',
    ]);

    expect(names).not.toContain('myMethod');
  });

  it('LIMITATION: does not extract default-exported functions', async () => {
    const names = await extractedNames([
      'export default function() { return 1; }',
    ]);

    // Anonymous default export — no name to capture; should be empty.
    expect(names).toEqual([]);
  });

  it('LIMITATION: does not extract named default-exported functions', async () => {
    // `export default function namedDefault()` — not captured by our regex.
    const names = await extractedNames([
      'export default function namedDefault() {}',
    ]);

    expect(names).not.toContain('namedDefault');
  });

  it('LIMITATION: does not extract object-literal methods', async () => {
    const names = await extractedNames([
      '  render: function() { return null; }',
    ]);

    expect(names).not.toContain('render');
  });
});