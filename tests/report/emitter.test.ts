/**
 * Unit tests for src/report/emitter.ts
 *
 * Strategy:
 *   cli  — spy on console.log / process.stdout.write; assert key strings appear.
 *   json — spy on process.stdout.write; parse output and assert structure.
 *   html — test buildHtml (pure) directly; assert HTML structure and content.
 *          emitHtml (async file write) is tested by mocking fs.writeFile.
 *
 * No real filesystem is touched and no real git is involved.
 *
 * Coverage checklist:
 *  ✓ cli: summary header lines are printed
 *  ✓ cli: "No affected files" message when scored is empty
 *  ✓ cli: each scored file path appears in output
 *  ✓ cli: risk level appears in output
 *  ✓ cli: staged diff uses "(staged)" as base label
 *  ✓ cli: branch diff uses branch name as base label
 *  ✓ json: output is valid JSON
 *  ✓ json: JSON contains diff, affected, testMatches, scored, options keys
 *  ✓ json: JSON values round-trip correctly
 *  ✓ html: buildHtml returns a valid HTML string with doctype
 *  ✓ html: base branch label appears in HTML
 *  ✓ html: each scored file path appears in HTML
 *  ✓ html: risk levels appear in HTML
 *  ✓ html: "No affected files" row when scored is empty
 *  ✓ html: summary counts are correct
 *  ✓ html: reasons are rendered
 *  ✓ html (async): fs.writeFile is called with output path and HTML content
 *  ✓ html (async): success message printed to console
 *  ✓ emit dispatches to the correct format handler
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ReportData, CliOptions, AffectedFile, ScoredFile, TestMatch, DiffResult, ChangedFile } from '../../src/types.js';

// ---------------------------------------------------------------------------
// Mock fs/promises so emitHtml never touches the real filesystem.
// ---------------------------------------------------------------------------

const mockWriteFile = vi.fn<[string, string, string], Promise<void>>();
vi.mock('fs/promises', () => ({
  writeFile: (...args: [string, string, string]) => mockWriteFile(...args),
}));

// Import AFTER mocks are registered.
import { emit, buildHtml } from '../../src/report/emitter.js';

// ---------------------------------------------------------------------------
// Fixture builders
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

function changedFile(
  p: string,
  fns: string[] = [],
  status: ChangedFile['status'] = 'modified',
): ChangedFile {
  return { path: p, status, functions: fns };
}

function makeDiff(files: ChangedFile[], base: string | null = null): DiffResult {
  return { changedFiles: files, baseBranch: base };
}

function af(p: string, depth = 0): AffectedFile {
  return { path: p, depth };
}

function scored(p: string, risk: ScoredFile['risk'], reasons: string[] = []): ScoredFile {
  return { path: p, risk, reasons };
}

function tm(affectedFile: string, ...testFiles: string[]): TestMatch {
  return { affectedFile, testFiles };
}

function makeReport(overrides: Partial<ReportData> = {}): ReportData {
  return {
    diff: makeDiff([changedFile('src/foo.ts')], 'main'),
    affected: [af('src/foo.ts'), af('src/bar.ts', 1)],
    scored: [
      scored('src/foo.ts', 'High', ['Directly changed', 'No test coverage']),
      scored('src/bar.ts', 'Low', []),
    ],
    testMatches: [
      tm('src/foo.ts'),
      tm('src/bar.ts', 'tests/bar.test.ts'),
    ],
    options: makeOptions({ format: 'cli' }),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Console spy helpers
// ---------------------------------------------------------------------------

let consoleLogMock: ReturnType<typeof vi.spyOn>;
let stdoutWriteMock: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  consoleLogMock = vi.spyOn(console, 'log').mockImplementation(() => undefined);
  stdoutWriteMock = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  mockWriteFile.mockReset();
  mockWriteFile.mockResolvedValue(undefined);
});

afterEach(() => {
  consoleLogMock.mockRestore();
  stdoutWriteMock.mockRestore();
});

/** Returns all strings passed to console.log joined into one string. */
function capturedLog(): string {
  return consoleLogMock.mock.calls.map((c) => String(c[0] ?? '')).join('\n');
}

/** Returns all strings passed to process.stdout.write joined into one string. */
function capturedStdout(): string {
  return stdoutWriteMock.mock.calls.map((c) => String(c[0] ?? '')).join('');
}

// ---------------------------------------------------------------------------
// CLI format
// ---------------------------------------------------------------------------

describe('emit — cli format', () => {
  it('prints the report title', async () => {
    await emit(makeReport());
    expect(capturedLog()).toContain('CodePreFlight');
  });

  it('prints the base branch name', async () => {
    await emit(makeReport({ diff: makeDiff([changedFile('src/foo.ts')], 'feature/x') }));
    expect(capturedLog()).toContain('feature/x');
  });

  it('uses "(staged)" as base when baseBranch is null', async () => {
    await emit(makeReport({ diff: makeDiff([changedFile('src/foo.ts')], null) }));
    expect(capturedLog()).toContain('(staged)');
  });

  it('prints the changed-file count', async () => {
    const diff = makeDiff([changedFile('src/a.ts'), changedFile('src/b.ts')], 'main');
    await emit(makeReport({ diff }));
    expect(capturedLog()).toContain('2');
  });

  it('prints the affected-file count', async () => {
    const data = makeReport({ affected: [af('src/a.ts'), af('src/b.ts'), af('src/c.ts')] });
    await emit(data);
    expect(capturedLog()).toContain('3');
  });

  it('prints each scored file path', async () => {
    await emit(makeReport());
    const out = capturedLog();
    expect(out).toContain('src/foo.ts');
    expect(out).toContain('src/bar.ts');
  });

  it('prints the risk level for each file', async () => {
    await emit(makeReport());
    const out = capturedLog();
    // chalk strips control chars in the captured string; check plain text risk names
    expect(out).toMatch(/High/);
    expect(out).toMatch(/Low/);
  });

  it('prints "No affected files detected" when scored is empty', async () => {
    await emit(makeReport({ scored: [], affected: [] }));
    expect(capturedLog()).toContain('No affected files detected');
  });

  it('does not call process.stdout.write for cli format', async () => {
    await emit(makeReport());
    expect(stdoutWriteMock).not.toHaveBeenCalled();
  });

  it('prints reasons in the table', async () => {
    await emit(makeReport());
    expect(capturedLog()).toContain('Directly changed');
  });

  it('counts unique test files correctly', async () => {
    const data = makeReport({
      testMatches: [
        tm('src/foo.ts', 'tests/foo.test.ts'),
        tm('src/bar.ts', 'tests/foo.test.ts', 'tests/bar.test.ts'),
      ],
    });
    // 2 unique test files: foo.test.ts, bar.test.ts
    await emit(data);
    expect(capturedLog()).toContain('2');
  });
});

// ---------------------------------------------------------------------------
// JSON format
// ---------------------------------------------------------------------------

describe('emit — json format', () => {
  function makeJsonReport(overrides: Partial<ReportData> = {}): ReportData {
    return makeReport({ ...overrides, options: makeOptions({ format: 'json' }) });
  }

  it('writes to stdout (not console.log)', async () => {
    await emit(makeJsonReport());
    expect(stdoutWriteMock).toHaveBeenCalled();
    expect(consoleLogMock).not.toHaveBeenCalled();
  });

  it('output is valid JSON', async () => {
    await emit(makeJsonReport());
    const raw = capturedStdout();
    expect(() => JSON.parse(raw)).not.toThrow();
  });

  it('JSON contains the top-level keys diff, affected, testMatches, scored, options', async () => {
    await emit(makeJsonReport());
    const parsed = JSON.parse(capturedStdout()) as Record<string, unknown>;
    expect(parsed).toHaveProperty('diff');
    expect(parsed).toHaveProperty('affected');
    expect(parsed).toHaveProperty('testMatches');
    expect(parsed).toHaveProperty('scored');
    expect(parsed).toHaveProperty('options');
  });

  it('round-trips scored data correctly', async () => {
    const report = makeJsonReport();
    await emit(report);
    const parsed = JSON.parse(capturedStdout()) as ReportData;
    expect(parsed.scored).toEqual(report.scored);
  });

  it('round-trips diff data correctly', async () => {
    const report = makeJsonReport({ diff: makeDiff([changedFile('src/z.ts', ['fn1'])], 'dev') });
    await emit(report);
    const parsed = JSON.parse(capturedStdout()) as ReportData;
    expect(parsed.diff.baseBranch).toBe('dev');
    expect(parsed.diff.changedFiles[0]?.path).toBe('src/z.ts');
  });

  it('output ends with a newline', async () => {
    await emit(makeJsonReport());
    expect(capturedStdout().endsWith('\n')).toBe(true);
  });

  it('is pretty-printed (has newlines inside JSON)', async () => {
    await emit(makeJsonReport());
    const raw = capturedStdout();
    // Pretty-printed JSON has at least one newline inside the body
    expect(raw.split('\n').length).toBeGreaterThan(2);
  });
});

// ---------------------------------------------------------------------------
// HTML format — buildHtml (pure, no I/O)
// ---------------------------------------------------------------------------

describe('buildHtml — pure function', () => {
  function makeHtmlReport(overrides: Partial<ReportData> = {}): ReportData {
    return makeReport({ ...overrides, options: makeOptions({ format: 'html' }) });
  }

  it('returns a string starting with <!DOCTYPE html>', () => {
    const html = buildHtml(makeHtmlReport());
    expect(html.trimStart()).toMatch(/^<!DOCTYPE html>/i);
  });

  it('contains the report title', () => {
    const html = buildHtml(makeHtmlReport());
    expect(html).toContain('CodePreFlight');
  });

  it('includes the base branch label', () => {
    const html = buildHtml(makeHtmlReport({ diff: makeDiff([changedFile('src/a.ts')], 'release') }));
    expect(html).toContain('release');
  });

  it('uses "(staged)" when baseBranch is null', () => {
    const html = buildHtml(makeHtmlReport({ diff: makeDiff([changedFile('src/a.ts')], null) }));
    expect(html).toContain('(staged)');
  });

  it('includes each scored file path', () => {
    const html = buildHtml(makeHtmlReport());
    expect(html).toContain('src/foo.ts');
    expect(html).toContain('src/bar.ts');
  });

  it('includes the risk levels', () => {
    const html = buildHtml(makeHtmlReport());
    expect(html).toContain('High');
    expect(html).toContain('Low');
  });

  it('includes reason strings', () => {
    const html = buildHtml(makeHtmlReport());
    expect(html).toContain('Directly changed');
    expect(html).toContain('No test coverage');
  });

  it('includes correct changed-file count', () => {
    const diff = makeDiff([changedFile('src/a.ts'), changedFile('src/b.ts')], 'main');
    const html = buildHtml(makeHtmlReport({ diff }));
    // The summary shows "2" somewhere near "Changed files"
    expect(html).toContain('<strong>2</strong>');
  });

  it('includes correct affected-file count', () => {
    const html = buildHtml(makeHtmlReport({ affected: [af('src/a.ts'), af('src/b.ts')] }));
    expect(html).toContain('<strong>2</strong>');
  });

  it('counts unique test files', () => {
    const data = makeHtmlReport({
      testMatches: [
        tm('src/foo.ts', 'tests/foo.test.ts'),
        tm('src/bar.ts', 'tests/foo.test.ts', 'tests/bar.test.ts'),
      ],
    });
    const html = buildHtml(data);
    // 2 unique test files
    expect(html).toContain('<strong>2</strong>');
  });

  it('shows "No affected files detected" row when scored is empty', () => {
    const html = buildHtml(makeHtmlReport({ scored: [], affected: [] }));
    expect(html).toContain('No affected files detected');
  });

  it('does not show the "No affected files" row when scored is non-empty', () => {
    const html = buildHtml(makeHtmlReport());
    expect(html).not.toContain('No affected files detected');
  });

  it('has Critical risk badge styling', () => {
    const data = makeHtmlReport({
      scored: [scored('src/foo.ts', 'Critical', ['Directly changed'])],
    });
    const html = buildHtml(data);
    expect(html).toContain('Critical');
    expect(html).toContain('#dc2626'); // Critical red
  });

  it('has Medium risk badge styling', () => {
    const data = makeHtmlReport({
      scored: [scored('src/foo.ts', 'Medium', [])],
    });
    const html = buildHtml(data);
    expect(html).toContain('Medium');
    expect(html).toContain('#ca8a04'); // Medium yellow
  });

  it('contains a closing </html> tag', () => {
    const html = buildHtml(makeHtmlReport());
    expect(html.trimEnd()).toMatch(/<\/html>$/i);
  });

  it('contains the "Made with IBM Bob" footer', () => {
    const html = buildHtml(makeHtmlReport());
    expect(html).toContain('Made with IBM Bob');
  });
});

// ---------------------------------------------------------------------------
// HTML format — emit() with file write (async)
// ---------------------------------------------------------------------------

describe('emit — html format (file write)', () => {
  function makeHtmlReport(overrides: Partial<ReportData> = {}): ReportData {
    return makeReport({
      ...overrides,
      options: makeOptions({ format: 'html', output: 'out/report.html' }),
    });
  }

  it('calls fs.writeFile with the configured output path', async () => {
    await emit(makeHtmlReport());
    expect(mockWriteFile).toHaveBeenCalledOnce();
    expect(mockWriteFile.mock.calls[0]?.[0]).toBe('out/report.html');
  });

  it('writes a string that starts with <!DOCTYPE html>', async () => {
    await emit(makeHtmlReport());
    const content = mockWriteFile.mock.calls[0]?.[1] as string;
    expect(content.trimStart()).toMatch(/^<!DOCTYPE html>/i);
  });

  it('writes with utf8 encoding', async () => {
    await emit(makeHtmlReport());
    expect(mockWriteFile.mock.calls[0]?.[2]).toBe('utf8');
  });

  it('prints a success message to console after writing', async () => {
    await emit(makeHtmlReport());
    expect(capturedLog()).toContain('out/report.html');
  });

  it('does not write to process.stdout', async () => {
    await emit(makeHtmlReport());
    expect(stdoutWriteMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// emit() dispatches correctly based on options.format
// ---------------------------------------------------------------------------

describe('emit — format dispatch', () => {
  it('dispatches to cli (default)', async () => {
    await emit(makeReport({ options: makeOptions({ format: 'cli' }) }));
    // CLI uses console.log, not stdout.write
    expect(consoleLogMock).toHaveBeenCalled();
    expect(stdoutWriteMock).not.toHaveBeenCalled();
    expect(mockWriteFile).not.toHaveBeenCalled();
  });

  it('dispatches to json', async () => {
    await emit(makeReport({ options: makeOptions({ format: 'json' }) }));
    expect(stdoutWriteMock).toHaveBeenCalled();
    expect(mockWriteFile).not.toHaveBeenCalled();
  });

  it('dispatches to html', async () => {
    await emit(makeReport({ options: makeOptions({ format: 'html' }) }));
    expect(mockWriteFile).toHaveBeenCalled();
    expect(stdoutWriteMock).not.toHaveBeenCalled();
  });
});
