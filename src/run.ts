/**
 * Pipeline orchestrator.
 *
 * This is the only module that knows the pipeline order and calls every stage
 * in sequence. No stage module imports any other stage module.
 *
 * Pipeline order (locked):
 *   parseDiff → buildImportGraph → traverseGraph → matchTests → scoreFiles → emit
 */

import { parseDiff } from './diff/parser.js';
import { buildImportGraph } from './graph/importGraph.js';
import { traverseGraph } from './graph/traversal.js';
import { matchTests } from './tests/matcher.js';
import { scoreFiles } from './risk/scorer.js';
import { emit } from './report/emitter.js';
import type { CliOptions } from './types.js';

export async function run(options: CliOptions): Promise<void> {
  // Stage 1: determine which files changed.
  const diff = await parseDiff(options);

  // Stage 2: build the reverse import map (once per run).
  const importMap = await buildImportGraph(options.repo);

  // Stage 3: BFS traversal — who is affected by the changed files?
  const affected = traverseGraph(importMap, diff.changedFiles, options.depth);

  // Stage 4: which test files cover the affected files?
  const testMatches = matchTests(affected, options.repo);

  // Stage 5: assign risk levels to affected files.
  const scored = scoreFiles(affected, diff, testMatches);

  // Stage 6: render and emit the report.
  emit({ diff, affected, testMatches, scored, options });
}
