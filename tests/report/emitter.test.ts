import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('fs/promises', () => ({
  writeFile: vi.fn(),
}));

import { writeFile } from 'fs/promises';

import { buildHtml, emit } from '../../src/report/emitter.js';

import type {
  CliOptions,
  DiffResult,
  ReportData,
} from '../../src/types.js';

const mockedWriteFile = vi.mocked(writeFile);

describe('report emitter', () => {
  const makeOptions = (
    overrides: Partial<CliOptions> = {},
  ): CliOptions => ({
    staged: false,
    branch: undefined,
    depth: Infinity,
    format: 'cli',
    repo: '.',
    output: 'impact-report.html',
    ...overrides,
  });

  const makeReport = (
    overrides: Partial<ReportData> = {},
  ): ReportData => {
    const diff: DiffResult = {
      changedFiles: [
        {
          path: 'src/pricing.ts',
          status: 'modified',
          functions: ['calculateTax'],
        },
      ],
      baseBranch: null,
    };

    return {
      diff,

      affected: [
        {
          path: 'src/pricing.ts',
          depth: 0,
        },
        {
          path: 'src/cart.ts',
          depth: 1,
        },
      ],

      testMatches: [
        {
          affectedFile: 'src/pricing.ts',
          testFiles: ['tests/cart.test.ts'],
        },
        {
          affectedFile: 'src/cart.ts',
          testFiles: ['tests/cart.test.ts'],
        },
      ],

      scored: [
        {
          path: 'src/pricing.ts',
          risk: 'Medium',
          reasons: [
            'Directly changed',
            'No associated test match',
          ],
        },
        {
          path: 'src/cart.ts',
          risk: 'Low',
          reasons: [],
        },
      ],

      options: makeOptions(),

      ...overrides,
    };
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockedWriteFile.mockResolvedValue(undefined);
  });

  // -------------------------------------------------------------------------
  // buildHtml
  // -------------------------------------------------------------------------

  describe('buildHtml', () => {
    it('builds a complete HTML document', () => {
      const html = buildHtml(makeReport());

      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('<html');
      expect(html).toContain('</html>');
    });

    it('includes the CodePreFlight title', () => {
      const html = buildHtml(makeReport());

      expect(html).toContain(
        'CodePreFlight — Impact Report',
      );
    });

    it('includes the base branch', () => {
      const html = buildHtml(
        makeReport({
          diff: {
            changedFiles: [],
            baseBranch: 'main',
          },
        }),
      );

      expect(html).toContain('Base:');
      expect(html).toContain('<strong>main</strong>');
    });

    it('shows staged as the base when staged mode is enabled', () => {
      const html = buildHtml(
        makeReport({
          options: makeOptions({
            staged: true,
          }),
        }),
      );

      expect(html).toContain(
        '<strong>(staged)</strong>',
      );
    });

    it('shows working tree when normal working-tree mode is used', () => {
      const html = buildHtml(
        makeReport({
          options: makeOptions({
            staged: false,
          }),
        }),
      );

      expect(html).toContain(
        '<strong>(working tree)</strong>',
      );
    });

    it('includes changed file count', () => {
      const html = buildHtml(makeReport());

      expect(html).toContain(
        'Changed files: <strong>1</strong>',
      );
    });

    it('includes affected file count', () => {
      const html = buildHtml(makeReport());

      expect(html).toContain(
        'Affected files: <strong>2</strong>',
      );
    });

    it('includes test file count', () => {
      const html = buildHtml(makeReport());

      expect(html).toContain(
        'Test files: <strong>1</strong>',
      );
    });

    it('includes affected file paths', () => {
      const html = buildHtml(makeReport());

      expect(html).toContain('src/pricing.ts');
      expect(html).toContain('src/cart.ts');
    });

    it('includes risk levels', () => {
      const html = buildHtml(makeReport());

      expect(html).toContain('Medium');
      expect(html).toContain('Low');
    });

    it('includes depth values', () => {
      const html = buildHtml(makeReport());

      expect(html).toContain(
        '<td style="text-align:center">0</td>',
      );

      expect(html).toContain(
        '<td style="text-align:center">1</td>',
      );
    });

    it('includes test counts for affected files', () => {
      const html = buildHtml(makeReport());

      expect(html).toContain(
        '<td style="text-align:center">1</td>',
      );
    });

    it('includes risk reasons', () => {
      const html = buildHtml(makeReport());

      expect(html).toContain(
        'Directly changed',
      );

      expect(html).toContain(
        'No associated test match',
      );
    });

    it('renders Critical risk', () => {
      const html = buildHtml(
        makeReport({
          scored: [
            {
              path: 'src/critical.ts',
              risk: 'Critical',
              reasons: ['High impact'],
            },
          ],
        }),
      );

      expect(html).toContain('Critical');
      expect(html).toContain(
        'background:#dc2626;color:#fff',
      );
    });

    it('renders High risk', () => {
      const html = buildHtml(
        makeReport({
          scored: [
            {
              path: 'src/high.ts',
              risk: 'High',
              reasons: ['High impact'],
            },
          ],
        }),
      );

      expect(html).toContain('High');
      expect(html).toContain(
        'background:#ea580c;color:#fff',
      );
    });

    it('renders Medium risk', () => {
      const html = buildHtml(
        makeReport({
          scored: [
            {
              path: 'src/medium.ts',
              risk: 'Medium',
              reasons: ['Medium impact'],
            },
          ],
        }),
      );

      expect(html).toContain('Medium');
      expect(html).toContain(
        'background:#ca8a04;color:#fff',
      );
    });

    it('renders Low risk', () => {
      const html = buildHtml(
        makeReport({
          scored: [
            {
              path: 'src/low.ts',
              risk: 'Low',
              reasons: [],
            },
          ],
        }),
      );

      expect(html).toContain('Low');
      expect(html).toContain(
        'background:#16a34a;color:#fff',
      );
    });

    it('renders the no-data message', () => {
      const html = buildHtml(
        makeReport({
          affected: [],
          scored: [],
          testMatches: [],
        }),
      );

      expect(html).toContain(
        'No affected files detected.',
      );
    });

    it('includes the IBM Bob footer', () => {
      const html = buildHtml(makeReport());

      expect(html).toContain(
        'Made with IBM Bob',
      );
    });
  });

  // -------------------------------------------------------------------------
  // CLI
  // -------------------------------------------------------------------------

  describe('CLI output', () => {
    it('prints the report title', () => {
      const spy = vi
        .spyOn(console, 'log')
        .mockImplementation(() => {});

      emit({
        ...makeReport(),
        options: makeOptions({
          format: 'cli',
        }),
      });

      expect(spy).toHaveBeenCalledWith(
        expect.stringContaining(
          'CodePreFlight — Impact Report',
        ),
      );
    });

    it('prints the staged base', () => {
      const spy = vi
        .spyOn(console, 'log')
        .mockImplementation(() => {});

      emit({
        ...makeReport(),
        options: makeOptions({
          staged: true,
          format: 'cli',
        }),
      });

      const output = spy.mock.calls
        .flat()
        .join('\n');

      expect(output).toContain(
        'Base: (staged)',
      );
    });

    it('prints the working-tree base', () => {
      const spy = vi
        .spyOn(console, 'log')
        .mockImplementation(() => {});

      emit({
        ...makeReport(),
        options: makeOptions({
          staged: false,
          format: 'cli',
        }),
      });

      const output = spy.mock.calls
        .flat()
        .join('\n');

      expect(output).toContain(
        'Base: (working tree)',
      );
    });

    it('prints a branch base when provided', () => {
      const spy = vi
        .spyOn(console, 'log')
        .mockImplementation(() => {});

      emit({
        ...makeReport({
          diff: {
            changedFiles: [],
            baseBranch: 'main',
          },
        }),
        options: makeOptions({
          format: 'cli',
        }),
      });

      const output = spy.mock.calls
        .flat()
        .join('\n');

      expect(output).toContain(
        'Base: main',
      );
    });

    it('prints changed file count', () => {
      const spy = vi
        .spyOn(console, 'log')
        .mockImplementation(() => {});

      emit(makeReport());

      const output = spy.mock.calls
        .flat()
        .join('\n');

      expect(output).toContain(
        'Changed files : 1',
      );
    });

    it('prints affected file count', () => {
      const spy = vi
        .spyOn(console, 'log')
        .mockImplementation(() => {});

      emit(makeReport());

      const output = spy.mock.calls
        .flat()
        .join('\n');

      expect(output).toContain(
        'Affected files: 2',
      );
    });

    it('prints total test file count', () => {
      const spy = vi
        .spyOn(console, 'log')
        .mockImplementation(() => {});

      emit(makeReport());

      const output = spy.mock.calls
        .flat()
        .join('\n');

      expect(output).toContain(
        'Test files    : 1',
      );
    });

    it('prints affected file paths', () => {
      const spy = vi
        .spyOn(console, 'log')
        .mockImplementation(() => {});

      emit(makeReport());

      const output = spy.mock.calls
        .flat()
        .join('\n');

      expect(output).toContain(
        'src/pricing.ts',
      );

      expect(output).toContain(
        'src/cart.ts',
      );
    });

    it('prints risk levels', () => {
      const spy = vi
        .spyOn(console, 'log')
        .mockImplementation(() => {});

      emit(makeReport());

      const output = spy.mock.calls
        .flat()
        .join('\n');

      expect(output).toContain('Medium');
      expect(output).toContain('Low');
    });

    it('prints the no-data message', () => {
      const spy = vi
        .spyOn(console, 'log')
        .mockImplementation(() => {});

      emit(
        makeReport({
          affected: [],
          scored: [],
          testMatches: [],
        }),
      );

      const output = spy.mock.calls
        .flat()
        .join('\n');

      expect(output).toContain(
        'No affected files detected.',
      );
    });
  });

  // -------------------------------------------------------------------------
  // JSON
  // -------------------------------------------------------------------------

  describe('JSON output', () => {
    it('writes valid JSON to stdout', () => {
      const writeSpy = vi
        .spyOn(process.stdout, 'write')
        .mockImplementation(() => true);

      emit({
        ...makeReport(),
        options: makeOptions({
          format: 'json',
        }),
      });

      expect(writeSpy).toHaveBeenCalled();

      const output = writeSpy.mock.calls
        .map(([chunk]) => String(chunk))
        .join('');

      expect(() => JSON.parse(output)).not.toThrow();
    });

    it('includes the complete report data', () => {
      const writeSpy = vi
        .spyOn(process.stdout, 'write')
        .mockImplementation(() => true);

      emit({
        ...makeReport(),
        options: makeOptions({
          format: 'json',
        }),
      });

      const output = writeSpy.mock.calls
        .map(([chunk]) => String(chunk))
        .join('');

      const parsed = JSON.parse(output);

      expect(parsed.diff).toBeDefined();
      expect(parsed.affected).toBeDefined();
      expect(parsed.testMatches).toBeDefined();
      expect(parsed.scored).toBeDefined();
      expect(parsed.options).toBeDefined();
    });

    it('preserves risk levels in JSON', () => {
      const writeSpy = vi
        .spyOn(process.stdout, 'write')
        .mockImplementation(() => true);

      emit({
        ...makeReport({
          scored: [
            {
              path: 'src/a.ts',
              risk: 'Critical',
              reasons: ['High impact'],
            },
          ],
        }),
        options: makeOptions({
          format: 'json',
        }),
      });

      const output = writeSpy.mock.calls
        .map(([chunk]) => String(chunk))
        .join('');

      const parsed = JSON.parse(output);

      expect(parsed.scored[0].risk).toBe(
        'Critical',
      );
    });
  });

  // -------------------------------------------------------------------------
  // HTML file output
  // -------------------------------------------------------------------------

  describe('HTML file output', () => {
    it('writes HTML to the configured output path', async () => {
      const report = makeReport({
        options: makeOptions({
          format: 'html',
          output: 'out/report.html',
        }),
      });

      await emit(report);

      expect(mockedWriteFile).toHaveBeenCalledWith(
        'out/report.html',
        expect.stringContaining(
          '<!DOCTYPE html>',
        ),
        'utf8',
      );
    });

    it('prints the output path after writing', async () => {
      const consoleSpy = vi
        .spyOn(console, 'log')
        .mockImplementation(() => {});

      await emit(
        makeReport({
          options: makeOptions({
            format: 'html',
            output: 'out/report.html',
          }),
        }),
      );

      expect(mockedWriteFile).toHaveBeenCalled();

      expect(consoleSpy).toHaveBeenCalledWith(
        'Report written to out/report.html',
      );
    });

    it('uses the staged label in HTML output', async () => {
      await emit(
        makeReport({
          options: makeOptions({
            staged: true,
            format: 'html',
            output: 'out/report.html',
          }),
        }),
      );

      const html =
        mockedWriteFile.mock.calls[0]?.[1];

      expect(String(html)).toContain(
        '<strong>(staged)</strong>',
      );
    });
  });
});