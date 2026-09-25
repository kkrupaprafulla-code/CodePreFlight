#!/usr/bin/env node
/**
 * CLI entry point.
 *
 * Thin Commander shell: parses flags, builds CliOptions, calls run().
 * No analysis logic belongs here.
 *
 * Flags:
 *   --staged            Analyse staged (index) changes.
 *   [branch]            Compare HEAD to this branch name (positional).
 *   --depth <n>         BFS traversal depth (default: Infinity = unlimited).
 *   --format <fmt>      Output format: cli | json | html  (default: cli).
 *   --repo <path>       Path to the repository root (default: .).
 *   --output <path>     Output path for HTML reports (default: impact-report.html).
 *
 * Constraints enforced here:
 *   --staged and a positional branch argument are mutually exclusive.
 */

import { Command } from 'commander';
import { run } from './run.js';
import type { CliOptions } from './types.js';

const program = new Command();

program
  .name('codepreflight')
  .description('Know what your code change could break before you make it.')
  .version('0.1.0')
  .argument('[branch]', 'Compare HEAD to this branch name')
  .option('--staged', 'Analyse staged (index) changes', false)
  .option('--depth <n>', 'BFS traversal depth (0 = changed files only; default: unlimited)', '')
  .option('--format <fmt>', 'Output format: cli | json | html', 'cli')
  .option('--repo <path>', 'Path to the repository root', '.')
  .option('--output <path>', 'Output path for HTML reports', 'impact-report.html')
  .action((branch: string | undefined, opts: {
    staged: boolean;
    depth: string;
    format: string;
    repo: string;
    output: string;
  }) => {
    // Enforce mutual exclusion: --staged and a branch argument cannot both be set.
    if (opts.staged && branch !== undefined) {
      console.error('Error: --staged and a branch argument are mutually exclusive.');
      process.exit(1);
    }

    // Resolve depth: empty string means "not provided" → Infinity.
    const depth = opts.depth === '' ? Infinity : Number(opts.depth);
    if (Number.isNaN(depth) || depth < 0) {
      console.error('Error: --depth must be a non-negative integer.');
      process.exit(1);
    }

    // Validate format.
    const validFormats = ['cli', 'json', 'html'] as const;
    if (!validFormats.includes(opts.format as typeof validFormats[number])) {
      console.error(`Error: --format must be one of: ${validFormats.join(', ')}.`);
      process.exit(1);
    }

    const options: CliOptions = {
      staged: opts.staged,
      branch,
      depth,
      format: opts.format as CliOptions['format'],
      repo: opts.repo,
      output: opts.output,
    };

    run(options).catch((err: unknown) => {
      console.error(err);
      process.exit(1);
    });
  });

program.parse();
