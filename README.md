# CodePreFlight

> Know what your code change could break before you make it.

CodePreFlight is a TypeScript static analysis CLI built for the IBM Bob hackathon. It analyzes a Git repository and produces a structured impact/risk report so a developer can understand the potential blast radius of a proposed change **before writing a single line of code**.

---

## The Problem

Developers routinely start implementing a change before understanding its full scope. A modification to one file can:

- silently break files that import it
- leave dependent call sites untested
- touch barrel/index files that re-export to much of the codebase
- cascade through a transitive dependency chain that isn't obvious from reading the diff alone

The result is unexpected regressions, surprised reviewers, and wasted debugging time.

## What CodePreFlight Does

Given a branch name or the staged index, CodePreFlight:

1. **Parses the git diff** to identify which files changed and which named functions were added or modified.
2. **Builds a reverse import graph** of the repository so it can answer "who depends on this file?"
3. **Traverses that graph with BFS** to find every file transitively affected, up to a configurable depth.
4. **Matches affected files to test files** using naming conventions and import tracing.
5. **Scores each affected file** with a four-heuristic risk model (Low / Medium / High / Critical).
6. **Emits a report** as a colour-coded CLI table, machine-readable JSON, or a self-contained HTML page.

The analysis runs in seconds on a local repository and requires no external services, no CI pipeline, and no coverage data.

## Why Pre-Flight Analysis?

Pre-flight checklists exist in aviation because the cost of discovering a problem in the air is catastrophically higher than discovering it on the ground. The same principle applies to software: the earlier a developer understands the impact of a change, the lower the cost of adjusting the approach.

CodePreFlight moves that discovery to the very start of the development cycle — before any code is written.

## How IBM Bob Fits In

CodePreFlight and [IBM Bob](https://www.ibm.com/products/watson-code-assistant) are designed to work together as a development loop:

```
Developer proposes a change
        ↓
CodePreFlight analyzes the repository
        ↓
Impact / Risk Report
        ↓
Developer reviews the evidence
        ↓
IBM Bob assists with implementation
        ↓
Tests run
        ↓
Verification result
```

CodePreFlight provides the evidence. IBM Bob provides the implementation assistance. Together they form a plan-first, implement-second workflow that reduces the risk of unintended side effects.

---

## MVP Scope

This is a 48-hour hackathon MVP. It is a JS/TS static analysis engine — not a full product. The analytical core is complete and functional.

**What is implemented:**

- Git diff parsing (staged changes or branch comparison)
- Reverse import graph construction using [madge](https://github.com/pahen/madge)
- BFS traversal of the reverse import graph with a configurable depth cap
- Test file discovery via naming conventions and import-trace analysis
- Weighted heuristic risk scoring (Low / Medium / High / Critical)
- Three output formats: CLI table, JSON, self-contained HTML

**What is explicitly out of scope for this MVP:**

- Multi-language support (JS/TS only)
- Runtime/dynamic call graph tracing
- Precise test coverage mapping (no `coverage.json` dependency)
- CI/CD integration
- IDE or VS Code extension
- Semantic breaking-change detection via the TypeScript compiler API
- LLM-generated explanations
- Monorepo build graph support (Nx, Turborepo, Bazel)
- Real-time / watch mode
- Historical trend storage or dashboards

---

## Installation

Requires **Node.js 18+** and **npm**.

```bash
git clone https://github.com/kkrupaprafulla-code/CodePreFlight.git
cd CodePreFlight
npm install
npm run build
```

---

## Usage

```
codepreflight [branch] [options]
```

| Argument / Flag       | Description                                                  | Default              |
|-----------------------|--------------------------------------------------------------|----------------------|
| `[branch]`            | Compare HEAD against this branch name                        | —                    |
| `--staged`            | Analyse staged (index) changes instead of a branch diff      | `false`              |
| `--depth <n>`         | BFS traversal depth (0 = changed files only, omit = unlimited) | unlimited (∞)      |
| `--format <fmt>`      | Output format: `cli`, `json`, or `html`                      | `cli`                |
| `--repo <path>`       | Path to the repository root                                  | `.`                  |
| `--output <path>`     | Output file path for HTML reports                            | `impact-report.html` |

> **Constraint:** `--staged` and a positional `[branch]` argument are mutually exclusive.

### Examples

```bash
# Analyse staged changes, print a CLI table
npx codepreflight --staged

# Compare HEAD to the main branch
npx codepreflight main

# Limit traversal to 3 hops
npx codepreflight main --depth 3

# Emit a JSON report to stdout
npx codepreflight main --format json

# Write a self-contained HTML report
npx codepreflight main --format html --output ./reports/impact.html

# Analyse a different repository
npx codepreflight main --repo /path/to/other-repo

# Development mode (no build step required)
npm run dev -- --staged
npm run dev -- main --format json
```

---

## Output Formats

### `cli` (default)

A colour-coded terminal table with columns:

| Column    | Content                                                         |
|-----------|-----------------------------------------------------------------|
| **File**  | Path relative to the repository root                           |
| **Risk**  | `Low` (green) · `Medium` (yellow) · `High` / `Critical` (red)  |
| **Depth** | BFS hops from the directly-changed set (0 = directly changed)  |
| **Tests** | Number of test files associated with this file                 |
| **Reasons** | Human-readable labels for each heuristic that fired          |

A summary line above the table reports: base branch/ref, changed file count, affected file count, and total distinct test files found.

### `json`

Pretty-printed JSON written to stdout containing the full [`ReportData`](src/types.ts) object:

```json
{
  "diff": { "changedFiles": [...], "baseBranch": "main" },
  "affected": [{ "path": "src/foo.ts", "depth": 0 }],
  "testMatches": [{ "affectedFile": "src/foo.ts", "testFiles": ["tests/foo.test.ts"] }],
  "scored": [{ "path": "src/foo.ts", "risk": "High", "reasons": ["Directly changed", "No associated test match"] }],
  "options": { ... }
}
```

### `html`

A self-contained HTML file (inline CSS, no external dependencies) written to `--output`. Opens in any browser. Contains the same table as the CLI view with colour-coded risk badges.

---

## Architecture

```
src/
├── cli.ts              CLI entry point — Commander shell, validates flags, calls run()
├── run.ts              Pipeline orchestrator — sequences all stages in order
├── types.ts            Shared TypeScript contracts for the entire pipeline
├── diff/
│   └── parser.ts       Parses git diff output → DiffResult (changed files + function names)
├── graph/
│   ├── importGraph.ts  Builds a reverse import map using madge (forward → inverted)
│   └── traversal.ts    BFS traversal over the reverse map → AffectedFile[]
├── tests/
│   └── matcher.ts      Maps affected files to test files (convention + import-trace)
├── risk/
│   └── scorer.ts       Weighted heuristic scoring → Low / Medium / High / Critical
└── report/
    └── emitter.ts      Renders CLI table, JSON, or HTML from the final ReportData
```

### Pipeline

```
parseDiff(options)          → DiffResult
buildImportGraph(repo)      → ReverseImportMap
traverseGraph(map, diff)    → AffectedFile[]
matchTests(affected, repo)  → TestMatch[]
scoreFiles(affected, diff)  → ScoredFile[]
emit({ diff, affected,
       testMatches, scored,
       options })           → void  (stdout / file)
```

Each function is a pure transformation on its inputs. [`run.ts`](src/run.ts) is the only file that sequences them. No stage module imports any other stage module.

### Diff Parser

Uses `simple-git` to obtain `git diff --name-status` (for file statuses) and a unified diff (for hunk content). Function names are extracted from added lines using **regex heuristics** — not AST-level analysis. Top-level `function` declarations and `const` arrow-function assignments are captured. Class methods, default exports, generator functions, and nested function expressions are not captured. This is a documented and intentional MVP limitation.

### Import Graph

`madge` walks the repository and produces a forward dependency map (`file → [imports]`). This is **inverted** into a reverse import map (`file → [files that import it]`) so the traversal can answer "who is affected when this file changes?". The graph is built once per run. Unresolvable imports are logged to stderr and silently dropped rather than aborting the run.

### BFS Traversal

Standard breadth-first search over the reverse import map seeded with the directly-changed files at depth 0. The `--depth` flag caps expansion:

- `--depth 0` — changed files only
- `--depth 1` — changed files + direct importers
- `--depth N` — changed files + importers up to N hops out
- (default) — full traversal with no cap

Output is sorted by depth ascending, then path ascending, for deterministic results.

### Test Matcher

For each affected source file, two heuristics are applied in order:

1. **Naming convention** — derives candidate paths by swapping the extension to `.test.<ext>` and `.spec.<ext>`, both alongside the source file and under a `tests/` directory at the repo root.
2. **Import trace** — scans all test files for `import`/`require` statements that resolve to the affected source file.

Results are "potentially related" tests, not guaranteed coverage — the MVP has no runtime coverage data.

### Risk Scorer

Each affected file receives a numeric score based on four heuristics, then the score is bucketed:

| Heuristic                          | Weight |
|------------------------------------|--------|
| Directly changed (depth 0)         | +1     |
| No associated test match           | +1     |
| Barrel / index file                | +1     |
| More than 5 modified functions     | +1     |

| Score | Risk Level |
|-------|------------|
| 0–1   | Low        |
| 2     | Medium     |
| 3     | High       |
| 4+    | Critical   |

Weight constants are defined as named exports in [`src/risk/scorer.ts`](src/risk/scorer.ts) and must never be hard-coded elsewhere.

---

## Development

```bash
# Type-check without emitting (lint)
npm run lint

# Build TypeScript → dist/
npm run build

# Run all unit tests
npm test

# Run CLI directly via tsx (no build step)
npm run dev -- --staged
npm run dev -- main --format json
```

---

## Testing

Unit tests live in `tests/` and mirror the `src/` directory structure. All tests are written with [Vitest](https://vitest.dev/).

```
tests/
├── diff/parser.test.ts
├── graph/importGraph.test.ts
├── graph/traversal.test.ts
├── tests/matcher.test.ts
├── risk/scorer.test.ts
└── report/emitter.test.ts
```

- `simple-git` and `madge` are mocked in their respective test files — no real git repository or filesystem is needed.
- The test matcher and scorer are pure functions with no I/O; their tests use inline fixtures.
- The emitter tests use a fixed `ReportData` fixture to assert CLI output, JSON structure, and HTML file content.

---

## Project Structure

```
CodePreFlight/
├── src/                    Source modules (TypeScript, strict mode)
├── tests/                  Vitest unit tests mirroring src/
├── dist/                   Compiled output (generated by npm run build)
├── package.json
├── tsconfig.json           strict, ES2022, NodeNext modules
├── vitest.config.ts
├── AGENTS.md               Agent coding rules and architectural constraints
├── PROJECT.md              Product vision and workflow description
└── mvp-foundation-plan.md  Implementation plan and sub-task log
```

---

## Known Limitations

- **JS/TS only.** The import graph is built with `madge`, which supports JS and TS source trees. Python, Java, Go, and other languages are not analyzed.
- **Heuristic function extraction.** The diff parser captures top-level named functions and arrow-function const assignments via regex. Class methods, default exports, generator functions, and deeply nested function expressions are not captured.
- **No runtime coverage.** Test matching is based on naming conventions and import tracing. It reports *potentially related* tests, not tests that are provably executed by the changed code.
- **No semantic analysis.** Breaking-change detection (e.g. type signature changes, removed exports) is not performed. This would require the TypeScript compiler API and is explicitly out of scope.
- **`--staged` and branch are mutually exclusive.** Passing both is an error at the CLI level.
- **Single repository.** Monorepo build graphs (Nx, Turborepo, Bazel) are not traversed; only the JS/TS import graph within the target repository is analyzed.

---

## IBM Bob's Role in This Hackathon

[IBM Bob](https://www.ibm.com/products/watson-code-assistant) served as the primary development assistant throughout this hackathon. Its role was practical and hands-on across all phases of the project:

- **Planning** — Bob helped draft and refine the implementation plan captured in [`mvp-foundation-plan.md`](mvp-foundation-plan.md), breaking the project into ordered sub-tasks with explicit contracts between stages.
- **Implementation** — Bob wrote source modules in agent mode, operating under the coding rules and architectural constraints defined in [`AGENTS.md`](AGENTS.md) (e.g. never walking `madge`'s forward map without inverting it first, enforcing `--staged`/branch mutual exclusion at the CLI layer).
- **Debugging** — When implementation details were unclear (such as `madge`'s CJS/ESM loading behaviour in a `"type": "module"` package), Bob investigated and resolved the integration without manual intervention.
- **Testing** — Bob wrote Vitest unit tests for each pipeline stage, including mock strategies for `simple-git` and `madge`, pure-function fixture tests for the scorer and traversal, and filesystem adapter injection for the test matcher.
- **Verification** — Bob ran `npm run build`, `npm test`, and `npm run lint` after each stage and confirmed zero errors before marking work complete.

The project rules in [`AGENTS.md`](AGENTS.md) were written specifically to constrain Bob's behaviour — preventing common pitfalls such as forward-walking a reverse graph, hard-coding weight constants, or diverging the JSON schema from the HTML template.
