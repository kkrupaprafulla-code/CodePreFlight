# CodePreFlight — MVP Foundation Plan

## Top-Level Overview

**Goal:** Establish the TypeScript/Node.js project foundation and a minimal working analysis engine that accepts a Git branch name or `--staged` flag, identifies changed files, and emits a structured report to stdout.

**Scope:** This is Milestone 1 only. It covers project scaffolding, the CLI entry point, the diff parser, a stub pipeline (graph, matcher, scorer each return pass-through no-op stubs), and the report emitter. Every subsequent module plugs into an already-wired pipeline; no pipeline rewiring is needed later.

**Approach:** Wire the full pipeline end-to-end with stubs first. Real implementations replace stubs one sub-task at a time in later milestones, with no structural changes required.

**Architectural constraints (from AGENTS.md):**
- Pipeline is strictly linear and stateless: diff parser → graph builder → traversal → test matcher → scorer → emitter.
- No module may call a downstream module.
- No shared mutable state.
- The reverse import graph is built once per run and passed through the pipeline.
- `--depth` controls how far reverse-dependency traversal expands; the scorer receives exactly the files returned by traversal (no hidden full-traversal for scoring).

---

## Proposed File Tree

```
CodePreFlight/
├── src/
│   ├── cli.ts                  # Commander entry point; parses flags, calls run()
│   ├── run.ts                  # Orchestrator: wires the pipeline in order
│   ├── diff/
│   │   └── parser.ts           # Parses git diff stdout → DiffResult
│   ├── graph/
│   │   ├── importGraph.ts      # Builds reverse import map using madge
│   │   └── traversal.ts        # BFS over reverse graph from changed files
│   ├── tests/
│   │   └── matcher.ts          # Maps affected files → test files
│   ├── risk/
│   │   └── scorer.ts           # Weighted heuristic → Low/Medium/High/Critical
│   ├── report/
│   │   └── emitter.ts          # Renders CLI table, JSON, or HTML
│   └── types.ts                # Shared TypeScript interfaces for all pipeline stages
├── tests/
│   ├── diff/
│   │   └── parser.test.ts      # Unit tests for diff parser
│   ├── graph/
│   │   ├── importGraph.test.ts
│   │   └── traversal.test.ts
│   ├── tests/
│   │   └── matcher.test.ts
│   ├── risk/
│   │   └── scorer.test.ts
│   └── report/
│       └── emitter.test.ts
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── .gitignore
├── AGENTS.md
└── PROJECT.md
```

**Why each file exists:**

| File | Reason |
|---|---|
| `src/cli.ts` | Thin Commander shell. Parses `--staged`, `--branch`, `--depth`, `--format`, `--repo`, `--output`. Calls `run()`. Nothing else. |
| `src/run.ts` | The only file that knows the pipeline order. Imports every stage and calls them in sequence. All stage modules are oblivious to each other. |
| `src/types.ts` | Single source of truth for all pipeline data shapes. Every stage imports from here. Changing a type propagates a compile error everywhere that breaks. |
| `src/diff/parser.ts` | Converts raw `git diff` text into a typed `DiffResult`. Keeps git-specific logic isolated. |
| `src/graph/importGraph.ts` | Wraps `madge` to produce a `ReverseImportMap`. Single point of change if we swap madge later. |
| `src/graph/traversal.ts` | BFS logic over the map produced by `importGraph.ts`. Depth flag is applied here. |
| `src/tests/matcher.ts` | Naming-convention lookup + import-trace fallback. Pure function, no I/O except file-existence checks. |
| `src/risk/scorer.ts` | Stateless scoring function. Takes affected files, returns scored results. |
| `src/report/emitter.ts` | Renders final output. Only file that touches stdout/filesystem for output. |
| `tests/**/*.test.ts` | Vitest unit tests, mirroring `src/` structure for easy navigation. |
| `vitest.config.ts` | Minimal Vitest config pointing at `tests/` and enabling TypeScript. |
| `tsconfig.json` | Strict TypeScript, targeting `ES2022`, module `NodeNext`, `outDir: dist`. |
| `package.json` | Declares `bin`, scripts (`build`, `test`, `dev`), and all dependencies. |

---

## Sub-Tasks

---

### Sub-Task 1 — Scaffold the project (package.json, tsconfig, vitest config)

**Status:** `[x] done`

**Intent:** Establish the project's runtime, build, and test configuration from scratch. This is the foundation every other sub-task depends on.

**Expected Outcomes:**
- `npm install` succeeds.
- `npm run build` compiles TypeScript to `dist/`.
- `npm test` runs Vitest with zero test files (passes vacuously).
- No TypeScript errors on an empty `src/` directory.

**Todo List:**
1. Create `package.json` with `name`, `version`, `type: "module"`, `bin` pointing to `dist/cli.js`, scripts (`build`, `test`, `dev`, `lint`), and all dependencies listed below.
2. Create `tsconfig.json` with `strict: true`, `module: NodeNext`, `moduleResolution: NodeNext`, `target: ES2022`, `rootDir: src`, `outDir: dist`, `declaration: true`, `sourceMap: true`.
3. Create `vitest.config.ts` with `include: ["tests/**/*.test.ts"]` and `coverage` excluded for now.
4. Create `.gitignore` entries for `node_modules/`, `dist/`, `coverage/`.
5. Create empty placeholder `src/.gitkeep` so the `src/` directory is tracked.
6. Run `npm install` to materialise `node_modules/` and `package-lock.json`.

**Dependencies to install:**

Runtime:
- `commander` — CLI argument parsing
- `chalk` — terminal colouring
- `cli-table3` — CLI table rendering
- `madge` — import graph
- `simple-git` — git integration

Dev:
- `typescript`
- `vitest`
- `@types/node`
- `tsx` — for `npm run dev` (runs TypeScript directly without a build step)

**Relevant Context:** No existing files to reference. Pure greenfield. All dependency choices are specified in `AGENTS.md`.

---

### Sub-Task 2 — Define shared TypeScript types (`src/types.ts`)

**Status:** `[x] done`

**Intent:** Establish the data contracts between all pipeline stages before any stage is written. This prevents each stage from inventing its own shape.

**Expected Outcomes:**
- All pipeline stage input/output types are declared and exported.
- `npm run build` compiles `types.ts` with zero errors.
- No other source files exist yet (they will import from here).

**Todo List:**
1. Create `src/types.ts`.
2. Define and export `CliOptions` — the parsed CLI flags object passed to `run()`. Must include: `staged: boolean`, `branch: string | undefined`, `depth: number` (use `Infinity` for unlimited), `format: 'cli' | 'json' | 'html'`, `repo: string`, `output: string`.
3. Define and export `ChangedFile` — `{ path: string; status: 'added' | 'modified' | 'deleted'; functions: string[] }`.
4. Define and export `DiffResult` — `{ changedFiles: ChangedFile[]; baseBranch: string | null }`.
5. Define and export `ReverseImportMap` — `Record<string, string[]>` (key = file, value = files that import it).
6. Define and export `AffectedFile` — `{ path: string; depth: number }`.
7. Define and export `TestMatch` — `{ affectedFile: string; testFiles: string[] }`.
8. Define and export `RiskLevel` — `'Low' | 'Medium' | 'High' | 'Critical'`.
9. Define and export `ScoredFile` — `{ path: string; risk: RiskLevel; reasons: string[] }`.
10. Define and export `ReportData` — the final object handed to the emitter: `{ diff: DiffResult; affected: AffectedFile[]; testMatches: TestMatch[]; scored: ScoredFile[]; options: CliOptions }`.

**Relevant Context:** `AGENTS.md` — pipeline stage descriptions. These types form the contracts enforced at compile time across all future modules.

---

### Sub-Task 3 — CLI entry point (`src/cli.ts`) and orchestrator (`src/run.ts`) stubs

**Status:** `[x] done`

**Intent:** Wire the complete pipeline skeleton end-to-end. Every stage is a stub that accepts the correct input type and returns a minimal valid output. The CLI can be invoked and produce output before any real logic is written.

**Expected Outcomes:**
- `node dist/cli.js --help` prints usage.
- `node dist/cli.js --staged` runs without crashing and prints a placeholder report.
- `node dist/cli.js main` (branch name) runs without crashing.
- The pipeline order is locked in `run.ts`: diff parser → graph builder → traversal → test matcher → scorer → emitter.

**Todo List:**
1. Create `src/cli.ts`:
   - Import `Command` from `commander`.
   - Declare flags: `--staged`, `--branch <name>`, `--depth <n>` (default: unlimited), `--format <cli|json|html>` (default: `cli`), `--repo <path>` (default: `.`), `--output <path>` (default: `impact-report.html`).
   - Positional argument: optional `[branch]` (compare HEAD to this branch).
   - On action, build a `CliOptions` object and call `run(options)`.
   - `--output` is passed through in `CliOptions`; the emitter reads it from there. The default is set at the CLI layer, not hardcoded inside the emitter.
2. Create `src/run.ts`:
   - Import stub functions from each stage module (they don't exist yet; create the imports as forward references).
   - Export `async function run(options: CliOptions): Promise<void>`.
   - Call each stage in order, passing its input and piping its output to the next stage.
   - Do not add error handling beyond letting Node.js surface the stack trace naturally.
3. Create stub `src/diff/parser.ts` — export `async function parseDiff(options: CliOptions): Promise<DiffResult>` returning `{ changedFiles: [], baseBranch: null }`.
4. Create stub `src/graph/importGraph.ts` — export `async function buildImportGraph(repo: string): Promise<ReverseImportMap>` returning `{}`.
5. Create stub `src/graph/traversal.ts` — export `function traverseGraph(map: ReverseImportMap, changed: ChangedFile[], depth: number): AffectedFile[]` returning `[]`.
6. Create stub `src/tests/matcher.ts` — export `function matchTests(affected: AffectedFile[], repo: string): TestMatch[]` returning `[]`.
7. Create stub `src/risk/scorer.ts` — export `function scoreFiles(affected: AffectedFile[], diff: DiffResult): ScoredFile[]` returning `[]`.
8. Create stub `src/report/emitter.ts` — export `function emit(data: ReportData): void` printing `"No changes detected."` to stdout.
9. Build and verify `npm run build` succeeds with zero errors.

**Relevant Context:** `AGENTS.md` — "pipeline is strictly linear and stateless". `src/types.ts` (Sub-Task 2) must be complete before this runs.

---

### Sub-Task 4 — Implement `src/diff/parser.ts` (real implementation)

**Status:** `[x] done`

**Intent:** Replace the stub with a real implementation that uses `simple-git` to obtain a `git diff` and parses it into the `DiffResult` shape.

**Expected Outcomes:**
- When run against this repository with `--staged` or a branch name, `parseDiff()` returns a populated `DiffResult`.
- Changed file paths and statuses are accurate.
- Function-name extraction is best-effort (regex over diff hunks, not a full AST).
- Unit tests pass covering: empty diff, single-file change, multi-file change, added file, deleted file.

**Todo List:**
1. In `src/diff/parser.ts`, import `simpleGit` from `simple-git`.
2. Implement `parseDiff(options)`:
   - If `options.staged`, call `git.diff(['--staged', '--name-status'])` for file list and `git.diff(['--staged'])` for hunk content.
   - If `options.branch`, call `git.diff([options.branch, 'HEAD', '--name-status'])` and corresponding hunk diff.
   - Parse `--name-status` output into `ChangedFile[]` with `status` field.
   - Extract function names from added lines (`+` prefix, excluding `+++` file headers) using best-effort regex heuristics. Document clearly in a code comment that this is **heuristic extraction, not AST-level semantic analysis** — it will miss some patterns (e.g. class methods, default exports) and is intentionally kept simple for the MVP.
   - Regex patterns to apply: `function` declarations matching `^+\s*(export\s+)?(async\s+)?function\s+(\w+)`, and arrow-function assignments matching `^+\s*(export\s+)?const\s+(\w+)\s*=\s*(async\s+)?\(`.
3. Write `tests/diff/parser.test.ts`:
   - Mock `simple-git` using Vitest's `vi.mock`.
   - Test each case from the expected outcomes list.
   - Include a test that verifies class methods and default exports are NOT extracted (confirming and documenting the known limitation).

**Relevant Context:** `src/types.ts` — `DiffResult`, `ChangedFile`. AGENTS.md — "diff parser: changed files + function names".

---

### Sub-Task 5 — Implement `src/graph/importGraph.ts` and `src/graph/traversal.ts`

**Status:** `[ ] pending`

**Intent:** Replace graph stubs with a real `madge`-powered reverse import map and a BFS traversal. This is the core dependency analysis.

**Expected Outcomes:**
- `buildImportGraph(repo)` returns a non-empty map for any real JS/TS repo.
- `traverseGraph(map, changedFiles, depth)` returns the correct transitive dependents at each depth level.
- `madge` is called with `{ ts: true }` so TypeScript barrel re-exports are visible.
- The reverse graph is built once per run (enforced by the orchestrator in `run.ts` — `buildImportGraph` is called once and the result is passed to `traverseGraph`).
- Unit tests pass covering: no changed files, single changed file with one dependent, chain of depth > 1, depth cap.

**Todo List:**
1. Implement `buildImportGraph(repo)` in `src/graph/importGraph.ts`:
   - Call `madge(repo, { ts: true })`.
   - Invert the forward map to build a `ReverseImportMap` (for each file → who imports it).
   - Return the map.
2. Implement `traverseGraph(map, changed, depth)` in `src/graph/traversal.ts`:
   - Seed the BFS queue with the paths from `changed` at depth `0`.
   - Track visited set to avoid cycles.
   - Collect each visited file with its BFS depth level as `AffectedFile.depth`.
   - `depth 0` = directly changed files only (no expansion into dependents).
   - `depth 1` = changed files + their direct dependents (one hop).
   - `depth N` = changed files + dependents up to N hops out.
   - `depth Infinity` (the default) = full BFS with no cap.
   - Stop expanding a node when `node.depth >= depth`.
   - The scorer receives exactly this list — there is no separate hidden full traversal.
   - Return `AffectedFile[]`.
3. Write tests for both modules (mock `madge` in `importGraph` tests; `traversal` tests are pure — no mocking needed).
   - Traversal tests must cover: `depth 0` returns only changed files, `depth 1` returns one hop, `depth 2` returns two hops, `Infinity` exhausts the graph, cycle detection.

**Relevant Context:** AGENTS.md — "madge operates on built JS output by default — use `{ ts: true }`". AGENTS.md — "reverse import graph must be built once per run". `src/types.ts` — `ReverseImportMap`, `AffectedFile`.

---

### Sub-Task 6 — Implement `src/tests/matcher.ts`

**Status:** `[ ] pending`

**Intent:** Replace the stub with a real naming-convention matcher that maps each affected file to its likely test file(s).

**Expected Outcomes:**
- For `src/foo/bar.ts`, the matcher looks for `tests/foo/bar.test.ts`, `tests/foo/bar.spec.ts`, `src/foo/bar.test.ts`, `src/foo/bar.spec.ts`.
- Files that have no test match return an empty array (not an error).
- Unit tests pass covering: file with test, file without test, multiple affected files.

**Todo List:**
1. Implement `matchTests(affected, repo)` in `src/tests/matcher.ts`:
   - For each `AffectedFile`, derive candidate test file paths using naming conventions.
   - Use `fs.existsSync` to check which candidates actually exist.
   - Return `TestMatch[]`.
   - Do NOT add import-trace fallback in this milestone (deferred to later).
2. Write `tests/tests/matcher.test.ts`:
   - Mock `fs.existsSync` using Vitest.
   - Test: match found, no match, multiple files.

**Relevant Context:** AGENTS.md — "Test matching: naming convention first, then import-trace fallback". Import-trace fallback is explicitly deferred.

---

### Sub-Task 7 — Implement `src/risk/scorer.ts`

**Status:** `[ ] pending`

**Intent:** Replace the stub with a heuristic scorer that assigns a `RiskLevel` to each affected file based on observable signals.

**Expected Outcomes:**
- Each affected file receives a `RiskLevel` of `Low`, `Medium`, `High`, or `Critical`.
- Scores are based on a small, documented set of heuristics (no ML, no external calls).
- Unit tests validate each heuristic independently.

**Todo List:**
1. Define the initial heuristic set in `src/risk/scorer.ts` (inline comments document each weight):
   - `+1` if the file is directly changed (not just a transitive dependent).
   - `+1` if the file has no test match.
   - `+1` if the file is a barrel/index file (`index.ts`, `index.js`).
   - `+1` if the changed file has > 5 modified functions.
   - Map total score → bucket: `0–1 = Low`, `2 = Medium`, `3 = High`, `4+ = Critical`.
2. Implement `scoreFiles(affected, diff, testMatches)`:
   - `affected` is exactly the list returned by `traverseGraph` — the scorer does not traverse further.
   - Cross-reference `affected` with `diff.changedFiles` to determine which are directly changed.
   - Cross-reference with `testMatches` to determine which have no test coverage.
   - Apply heuristics. Each applied heuristic is recorded in `ScoredFile.reasons`.
   - Return `ScoredFile[]`.
3. Write `tests/risk/scorer.test.ts`:
   - Test each heuristic in isolation with minimal inputs.
   - Confirm that the scorer only scores the files it receives; it does not fetch additional files.

**Relevant Context:** AGENTS.md — "Risk output is bucketed: Low/Medium/High/Critical". The scorer scores exactly the files returned by traversal — `--depth` determines which files those are.

---

### Sub-Task 8 — Implement `src/report/emitter.ts`

**Status:** `[ ] pending`

**Intent:** Replace the stub emitter with a real renderer that supports `--format cli|json|html`.

**Expected Outcomes:**
- `--format cli` prints a coloured table with columns: File, Risk, Depth, Test Coverage.
- `--format json` prints a formatted JSON object of `ReportData`.
- `--format html` writes a self-contained HTML file to the path in `data.options.output` (default `impact-report.html`) and prints the resolved file path.
- Unit tests cover each format with a fixed `ReportData` fixture.

**Todo List:**
1. Implement `emit(data)` in `src/report/emitter.ts`:
   - Branch on `data.options.format`.
   - For `cli`: use `cli-table3` for the table, `chalk` for risk-level colour coding (green/yellow/red/magenta).
   - For `json`: `JSON.stringify(data, null, 2)` to stdout.
   - For `html`: write a self-contained HTML string (inline styles, no external dependencies) to `data.options.output`. Print the resolved absolute path. Do not hardcode a filename inside the emitter — always read from `data.options.output`.
2. Write `tests/report/emitter.test.ts`:
   - Use a fixed `ReportData` fixture.
   - For `cli`: assert stdout contains expected file paths and risk levels.
   - For `json`: assert output is valid JSON with correct structure.
   - For `html`: assert output file is written and contains expected content.

**Relevant Context:** AGENTS.md — "report emitter depends on the JSON schema produced by the scorer — any change to scorer output type must propagate here". `src/types.ts` — `ReportData`.

---

## What We Do NOT Build in Milestone 1

These are explicitly deferred. Do not add them:

- Real import graph traversal (stub only in Sub-Task 3; real implementation in Sub-Task 5 which is still within Milestone 1 scope — but monorepo graph support is deferred forever per AGENTS.md).
- Import-trace fallback in test matching (Sub-Task 6 uses naming convention only).
- HTML template with external CSS/JS frameworks.
- `--watch` mode.
- CI/CD integration.
- Coverage-based test matching.
- Multi-language support.
- LLM-generated report summaries.
- TypeScript compiler API for semantic analysis.

---

## Exact Commands

```bash
# Install all dependencies
npm install

# Build TypeScript → dist/
npm run build

# Run tests
npm test

# Run CLI without building (dev mode via tsx)
npm run dev -- --staged
npm run dev -- main

# Run the compiled CLI
node dist/cli.js --help
node dist/cli.js --staged
node dist/cli.js main --depth 3 --format json
node dist/cli.js main --format html --output ./reports/impact.html
```

`package.json` scripts:
```json
{
  "build": "tsc",
  "test": "vitest run",
  "dev": "tsx src/cli.ts",
  "lint": "tsc --noEmit"
}
```

---

## How Git Information Flows Into the Pipeline

```
CLI flags (--staged | branch name)
         │
         ▼
  src/run.ts calls parseDiff(options)
         │
         ▼  simple-git
  git.diff() stdout
         │
         ▼
  DiffResult { changedFiles[], baseBranch }
         │
         ▼
  passed to traverseGraph() + scoreFiles()
```

`simple-git` is called exclusively inside `src/diff/parser.ts`. No other module touches git. This keeps the git integration behind a single seam — swapping git providers or adding cache later only requires changes in one file.

---

## Pipeline Data Flow (Reference)

```
parseDiff(options)          → DiffResult
buildImportGraph(repo)      → ReverseImportMap
traverseGraph(map, diff)    → AffectedFile[]
matchTests(affected, repo)  → TestMatch[]
scoreFiles(affected, diff)  → ScoredFile[]
emit({ diff, affected,
       testMatches, scored,
       options })           → void (stdout / file)
```

Each function is a pure transformation on its inputs. `run.ts` is the only file that sequences them. No module imports another module in the pipeline.
