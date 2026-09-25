/**
 * Shared TypeScript contracts for the CodePreFlight analysis pipeline.
 *
 * Every pipeline stage imports its input/output types from this file.
 * Changing a type here propagates a compile error to every stage that breaks.
 * No analysis logic belongs here — types only.
 */

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

/** Parsed CLI flags passed to run() and carried through the entire pipeline. */
export interface CliOptions {
  /** Analyse staged (index) changes instead of a branch diff. */
  staged: boolean;
  /** Branch name to compare against HEAD. Mutually exclusive with staged. */
  branch: string | undefined;
  /**
   * Maximum BFS depth for reverse-dependency traversal.
   * - 0 = directly changed files only.
   * - 1 = changed files + direct dependents.
   * - N = changed files + dependents up to N hops out.
   * - Infinity (default) = full traversal with no cap.
   */
  depth: number;
  /** Output format for the report. */
  format: 'cli' | 'json' | 'html';
  /** Path to the repository root (default: '.'). */
  repo: string;
  /** Output path for HTML reports (default: 'impact-report.html'). */
  output: string;
}

// ---------------------------------------------------------------------------
// Diff parser  →  DiffResult
// ---------------------------------------------------------------------------

/** A single file touched by the diff. */
export interface ChangedFile {
  /** File path relative to the repository root. */
  path: string;
  status: 'added' | 'modified' | 'deleted';
  /**
   * Best-effort list of function names added or modified in this file.
   * Extracted via regex heuristics — NOT AST-level semantic analysis.
   * Class methods and default exports are not captured.
   */
  functions: string[];
}

/** Output of the diff parser stage. */
export interface DiffResult {
  changedFiles: ChangedFile[];
  /** The base branch/ref used for comparison, or null when using --staged. */
  baseBranch: string | null;
}

// ---------------------------------------------------------------------------
// Import graph  →  ReverseImportMap
// ---------------------------------------------------------------------------

/**
 * Reverse import map produced by the graph builder.
 * Key   = a file path (relative to repo root).
 * Value = list of files that import this file.
 *
 * Built once per run and passed through the pipeline; never rebuilt mid-run.
 */
export type ReverseImportMap = Record<string, string[]>;

// ---------------------------------------------------------------------------
// Graph traversal  →  AffectedFile[]
// ---------------------------------------------------------------------------

/** A file reachable from the changed set via reverse-import BFS. */
export interface AffectedFile {
  /** File path relative to the repository root. */
  path: string;
  /**
   * BFS depth at which this file was first reached.
   * 0 = directly changed; 1 = one hop out; etc.
   */
  depth: number;
}

// ---------------------------------------------------------------------------
// Test matcher  →  TestMatch[]
// ---------------------------------------------------------------------------

/** Maps one affected file to the test files that cover it. */
export interface TestMatch {
  /** Path of the affected source file. */
  affectedFile: string;
  /** Paths of discovered test files (may be empty). */
  testFiles: string[];
}

// ---------------------------------------------------------------------------
// Risk scorer  →  ScoredFile[]
// ---------------------------------------------------------------------------

/** Risk bucket assigned to each affected file. */
export type RiskLevel = 'Low' | 'Medium' | 'High' | 'Critical';

/** An affected file with its computed risk level and supporting reasons. */
export interface ScoredFile {
  /** File path relative to the repository root. */
  path: string;
  risk: RiskLevel;
  /** Human-readable labels for each heuristic that contributed to the score. */
  reasons: string[];
}

// ---------------------------------------------------------------------------
// Report emitter  →  ReportData (terminal type)
// ---------------------------------------------------------------------------

/**
 * The complete dataset handed to the report emitter.
 * JSON schema is the source of truth — the HTML template is rendered from this.
 */
export interface ReportData {
  diff: DiffResult;
  affected: AffectedFile[];
  testMatches: TestMatch[];
  scored: ScoredFile[];
  options: CliOptions;
}
