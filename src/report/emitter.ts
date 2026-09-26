/**
 * Report emitter — renders ReportData into one of three output formats.
 *
 * Formats:
 *   cli   — coloured CLI table printed to stdout (default)
 *   json  — pretty-printed JSON written to stdout
 *   html  — self-contained HTML page written to options.output path
 *
 * This is the only module allowed to write to stdout or the filesystem
 * for output purposes. All other modules are side-effect-free.
 */

import * as fs from 'fs/promises';
import Table from 'cli-table3';
import chalk, { type ChalkInstance } from 'chalk';
import type {
  ReportData,
  RiskLevel,
  ScoredFile,
} from '../types.js';

// ---------------------------------------------------------------------------
// Colour helpers for risk levels
// ---------------------------------------------------------------------------

function riskColour(level: RiskLevel): ChalkInstance {
  switch (level) {
    case 'Critical':
      return chalk.bold.red;

    case 'High':
      return chalk.red;

    case 'Medium':
      return chalk.yellow;

    case 'Low':
      return chalk.green;
  }
}

// ---------------------------------------------------------------------------
// CLI format
// ---------------------------------------------------------------------------

function emitCli(data: ReportData): void {
  const {
    diff,
    affected,
    testMatches,
    scored,
  } = data;

  const base =
    diff.baseBranch ??
    (data.options.staged
      ? '(staged)'
      : '(working tree)');

  console.log('');
  console.log(
    chalk.bold('CodePreFlight — Impact Report'),
  );

  console.log(
    chalk.dim(`Base: ${base}`),
  );

  console.log(
    chalk.dim(
      `Changed files : ${diff.changedFiles.length}`,
    ),
  );

  console.log(
    chalk.dim(
      `Affected files: ${affected.length}`,
    ),
  );

  const totalTests = new Set(
    testMatches.flatMap(
      (tm) => tm.testFiles,
    ),
  ).size;

  console.log(
    chalk.dim(`Test files    : ${totalTests}`),
  );

  console.log('');

  if (scored.length === 0) {
    console.log(
      chalk.green(
        'No affected files detected.',
      ),
    );
    return;
  }

  const table = new Table({
    head: [
      chalk.bold('File'),
      chalk.bold('Risk'),
      chalk.bold('Depth'),
      chalk.bold('Tests'),
      chalk.bold('Reasons'),
    ],
    wordWrap: true,
    colWidths: [
      40,
      10,
      7,
      6,
      40,
    ],
    style: {
      head: [],
    },
  });

  const depthMap = new Map(
    affected.map(
      (af) => [af.path, af.depth],
    ),
  );

  const testCountMap = new Map(
    testMatches.map(
      (tm) => [
        tm.affectedFile,
        tm.testFiles.length,
      ],
    ),
  );

  for (const sf of scored) {
    const colour = riskColour(sf.risk);

    const depth =
      depthMap.get(sf.path) ?? 0;

    const tests =
      testCountMap.get(sf.path) ?? 0;

    table.push([
      sf.path,
      colour(sf.risk),
      String(depth),
      String(tests),
      sf.reasons.join(', '),
    ]);
  }

  console.log(table.toString());
  console.log('');
}

// ---------------------------------------------------------------------------
// JSON format
// ---------------------------------------------------------------------------

function emitJson(data: ReportData): void {
  process.stdout.write(
    JSON.stringify(data, null, 2) + '\n',
  );
}

// ---------------------------------------------------------------------------
// HTML format
// ---------------------------------------------------------------------------

function buildHtml(data: ReportData): string {
  const {
    diff,
    affected,
    scored,
    testMatches,
  } = data;

  const base =
    diff.baseBranch ??
    (data.options.staged
      ? '(staged)'
      : '(working tree)');

  const totalTests = new Set(
    testMatches.flatMap(
      (tm) => tm.testFiles,
    ),
  ).size;

  const depthMap = new Map(
    affected.map(
      (af) => [af.path, af.depth],
    ),
  );

  const testCountMap = new Map(
    testMatches.map(
      (tm) => [
        tm.affectedFile,
        tm.testFiles.length,
      ],
    ),
  );

  const riskBadgeStyle: Record<
    RiskLevel,
    string
  > = {
    Critical:
      'background:#dc2626;color:#fff',

    High:
      'background:#ea580c;color:#fff',

    Medium:
      'background:#ca8a04;color:#fff',

    Low:
      'background:#16a34a;color:#fff',
  };

  function badge(sf: ScoredFile): string {
    return `<span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:12px;font-weight:600;${riskBadgeStyle[sf.risk]}">${sf.risk}</span>`;
  }

  const rows = scored
    .map((sf) => {
      const depth =
        depthMap.get(sf.path) ?? 0;

      const tests =
        testCountMap.get(sf.path) ?? 0;

      const reasons = sf.reasons
        .map(
          (reason) => `<li>${reason}</li>`,
        )
        .join('');

      return `
      <tr>
        <td style="font-family:monospace;font-size:13px;word-break:break-all">${sf.path}</td>
        <td style="text-align:center">${badge(sf)}</td>
        <td style="text-align:center">${depth}</td>
        <td style="text-align:center">${tests}</td>
        <td>
          <ul style="margin:0;padding-left:16px">
            ${reasons}
          </ul>
        </td>
      </tr>`;
    })
    .join('');

  const noDataRow =
    scored.length === 0
      ? `<tr>
          <td colspan="5" style="text-align:center;color:#57606a;padding:24px">
            No affected files detected.
          </td>
        </tr>`
      : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>CodePreFlight — Impact Report</title>

<style>
  body {
    font-family: -apple-system, "Segoe UI", system-ui, sans-serif;
    font-size: 14px;
    line-height: 1.6;
    background: #fff;
    color: #1f2328;
    margin: 0;
    padding: 24px;
  }

  h1 {
    font-size: 20px;
    font-weight: 700;
    margin: 0 0 4px;
  }

  .meta {
    color: #57606a;
    font-size: 13px;
    margin-bottom: 24px;
  }

  .meta span {
    margin-right: 16px;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
  }

  th {
    background: #f7f8fa;
    border: 1px solid #e5e7eb;
    padding: 8px 12px;
    text-align: left;
    font-weight: 600;
    white-space: nowrap;
  }

  td {
    border: 1px solid #e5e7eb;
    padding: 8px 12px;
    vertical-align: top;
  }

  tr:hover td {
    background: #f7f8fa;
  }

  footer {
    margin-top: 32px;
    padding-top: 12px;
    border-top: 1px solid #e5e7eb;
    text-align: center;
    font-size: 12px;
    color: #57606a;
  }
</style>
</head>

<body>

<h1>CodePreFlight — Impact Report</h1>

<div class="meta">
  <span>Base: <strong>${base}</strong></span>
  <span>Changed files: <strong>${diff.changedFiles.length}</strong></span>
  <span>Affected files: <strong>${affected.length}</strong></span>
  <span>Test files: <strong>${totalTests}</strong></span>
</div>

<table>
  <thead>
    <tr>
      <th>File</th>
      <th>Risk</th>
      <th>Depth</th>
      <th>Tests</th>
      <th>Reasons</th>
    </tr>
  </thead>

  <tbody>
    ${rows}
    ${noDataRow}
  </tbody>
</table>

<footer>
  Made with IBM Bob
</footer>

</body>
</html>`;
}

export { buildHtml };

// ---------------------------------------------------------------------------
// HTML file output
// ---------------------------------------------------------------------------

async function emitHtml(
  data: ReportData,
): Promise<void> {
  const html = buildHtml(data);

  await fs.writeFile(
    data.options.output,
    html,
    'utf8',
  );

  console.log(
    `Report written to ${data.options.output}`,
  );
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Render and emit the report in the format requested by options.format.
 *
 * @param data The fully computed report dataset from the pipeline.
 */
export async function emit(
  data: ReportData,
): Promise<void> {
  switch (data.options.format) {
    case 'json':
      emitJson(data);
      return;

    case 'html':
      await emitHtml(data);
      return;

    default:
      emitCli(data);
  }
}