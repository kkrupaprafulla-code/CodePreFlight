/**
 * Diff parser — real implementation.
 *
 * Uses simple-git to obtain raw git diff output, then parses it into the
 * DiffResult type defined in src/types.ts.
 *
 * Function-name extraction is HEURISTIC, not AST-level semantic analysis.
 * It will correctly identify top-level `function` declarations and
 * arrow-function const assignments, but intentionally does NOT capture:
 *   - Class methods
 *   - Default exports (`export default function`)
 *   - Generator functions
 *   - Object-literal methods
 *   - Deeply nested function expressions
 * These limitations are documented, expected, and acceptable for the MVP.
 */

import { simpleGit } from 'simple-git';
import type { CliOptions, ChangedFile, DiffResult } from '../types.js';

// ---------------------------------------------------------------------------
// Status parsing
// ---------------------------------------------------------------------------

/**
 * Maps a single git --name-status letter to our ChangedFile status union.
 * Letters not in this map (e.g. 'R' for renamed, 'C' for copied) are
 * treated as 'modified' to avoid silent omissions.
 */
function parseStatus(letter: string): ChangedFile['status'] {
  switch (letter.toUpperCase()) {
    case 'A': return 'added';
    case 'D': return 'deleted';
    default:  return 'modified';
  }
}

/**
 * Parse the output of `git diff --name-status` into a map of
 * path → status letter.  Lines look like:
 *   M\tsrc/foo.ts
 *   A\tsrc/bar.ts
 *   D\tsrc/baz.ts
 */
function parseNameStatus(raw: string): Map<string, ChangedFile['status']> {
  const result = new Map<string, ChangedFile['status']>();
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const [letter, ...rest] = trimmed.split('\t');
    // Renamed/copied lines have two paths; take the destination (last token).
    const filePath = rest[rest.length - 1];
    if (letter && filePath) {
      result.set(filePath.trim(), parseStatus(letter.trim()));
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Function-name extraction
// ---------------------------------------------------------------------------

/**
 * Regex for a named `function` declaration on an added diff line.
 * Matches:  [export] [async] function <name>(
 *
 * HEURISTIC — does not handle class methods or default exports.
 */
const FUNCTION_DECL_RE =
  /^\+\s*(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*[(<]/;

/**
 * Regex for an arrow-function const assignment on an added diff line.
 * Matches:  [export] const <name> = [async] (
 *
 * HEURISTIC — does not handle class methods or default exports.
 */
const ARROW_FN_RE =
  /^\+\s*(?:export\s+)?const\s+(\w+)\s*=\s*(?:async\s+)?\(/;

/**
 * Extract function names from the hunk lines of a unified diff string.
 *
 * Only lines starting with `+` (but not `+++` file-header lines) are
 * examined.  Returns a deduplicated array of matched function names.
 *
 * This is HEURISTIC extraction — see module-level documentation for
 * known limitations.
 */
function extractFunctionNames(hunkText: string): string[] {
  const names = new Set<string>();
  for (const line of hunkText.split('\n')) {
    // Skip file-header lines ("+++ b/path/to/file")
    if (line.startsWith('+++')) continue;

    const declMatch = FUNCTION_DECL_RE.exec(line);
    if (declMatch) {
      names.add(declMatch[1]);
      continue;
    }

    const arrowMatch = ARROW_FN_RE.exec(line);
    if (arrowMatch) {
      names.add(arrowMatch[1]);
    }
  }
  return [...names];
}

// ---------------------------------------------------------------------------
// Hunk extraction: isolate the diff section for a specific file
// ---------------------------------------------------------------------------

/**
 * Split a full unified diff into per-file sections.
 * Returns a map of file path → hunk text for that file.
 */
function splitDiffByFile(rawDiff: string): Map<string, string> {
  const sections = new Map<string, string>();
  // Each file section starts with "diff --git a/<path> b/<path>"
  const fileSections = rawDiff.split(/^(?=diff --git )/m);
  for (const section of fileSections) {
    // Extract the destination file path from the "+++ b/<path>" header.
    const match = /^\+\+\+ b\/(.+)$/m.exec(section);
    if (match) {
      sections.set(match[1].trim(), section);
    }
  }
  return sections;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function parseDiff(options: CliOptions): Promise<DiffResult> {
  const git = simpleGit(options.repo);

  let nameStatusArgs: string[];
  let hunkArgs: string[];
  let baseBranch: string | null;

  if (options.staged) {
    nameStatusArgs = ['--staged', '--name-status'];
    hunkArgs = ['--staged'];
    baseBranch = null;
  } else if (options.branch) {
    nameStatusArgs = [options.branch, 'HEAD', '--name-status'];
    hunkArgs = [options.branch, 'HEAD'];
    baseBranch = options.branch;
  }  else {
    nameStatusArgs = ['--name-status'];
    hunkArgs = [];
    baseBranch = null;
  }

  const [nameStatusOutput, hunkOutput] = await Promise.all([
    git.diff(nameStatusArgs),
    git.diff(hunkArgs),
  ]);

  const statusMap = parseNameStatus(nameStatusOutput);
  const hunksByFile = splitDiffByFile(hunkOutput);

  const changedFiles: ChangedFile[] = [];
  for (const [filePath, status] of statusMap) {
    const hunkText = hunksByFile.get(filePath) ?? '';
    const functions = extractFunctionNames(hunkText);
    changedFiles.push({ path: filePath, status, functions });
  }

  return { changedFiles, baseBranch };
}
