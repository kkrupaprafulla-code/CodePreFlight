# AGENTS.md

This file provides guidance to agents when working with code in this repository.

## Product Vision

**CodePreFlight** — "Know what your code change could break before you make it."

An AI-assisted software change pre-flight system. Before a developer writes a single line of code, CodePreFlight analyzes the repository and produces a structured impact/risk report so the developer can make an informed decision about how to proceed.

### Intended Workflow

```
Developer proposes a change
  → CodePreFlight analyzes the repository
  → impact/risk report is produced (affected files, dependencies, tests, risk areas)
  → developer reviews and approves the plan
  → IBM Bob assists with implementation
  → tests are run
  → CodePreFlight presents the verification result
```

The system acts as a pre-flight checklist: surface all relevant evidence first, implement second, verify third.

## MVP Technical Foundation

The 48-hour hackathon MVP is a **JS/TypeScript static analysis engine** that powers the analysis step above. It is not the full product — it is the analytical core.

### Planned Stack (not yet scaffolded)

- **Language:** TypeScript (strict mode)
- **Runtime:** Node.js
- **CLI framework:** `commander` + `chalk` + `cli-table3`
- **Import graph:** `madge` (JS/TS reverse-import traversal)
- **Git integration:** `simple-git`
- **Tests:** `vitest`
- **Package manager:** `npm`

### Analysis Pipeline

```
proposed change description
  → git diff / branch comparison
  → diff parser          (changed files + function names)
  → reverse import graph (BFS traversal: who is affected)
  → test matcher         (which tests cover affected code)
  → risk scorer          (weighted heuristic per file)
  → report emitter       (CLI table + JSON + HTML)
```

Key modules (to be created):
- `src/diff/parser.ts` — parse `git diff` stdout into changed files + function names
- `src/graph/importGraph.ts` — build reverse import map using `madge`
- `src/graph/traversal.ts` — BFS over the reverse graph from changed files
- `src/tests/matcher.ts` — match affected files to test files (naming convention + import trace)
- `src/risk/scorer.ts` — weighted heuristic risk score per changed file
- `src/report/emitter.ts` — render CLI table and emit JSON/HTML

### Design Decisions

- Risk output is bucketed: **Low / Medium / High / Critical** (not a raw numeric score)
- BFS traversal depth is **configurable** (default: unlimited, flag `--depth N`)
- `--staged` flag analyzes staged changes; a branch name compares vs `HEAD`
- Output format: `--format cli|json|html` (CLI is default)
- Test matching: naming convention first (`foo.ts` → `foo.test.ts`, `foo.spec.ts`), then import-trace fallback

## Explicit Out-of-Scope for MVP

Do NOT implement these during the 48-hour MVP:
- Multi-language support (Python, Java, Go) — JS/TS only
- Dynamic/runtime call graph tracing
- Precise test coverage mapping (no `coverage.json` dependency)
- CI/CD integration (GitHub Actions, Jenkins)
- IDE plugin / VS Code extension
- Semantic breaking-change detection via TypeScript compiler API
- LLM-generated explanations of the report
- Monorepo build graph (Nx, Turborepo, Bazel)
- Real-time / watch mode
- Historical trend storage or dashboards
- Multi-agent orchestration frameworks
- Enterprise infrastructure (auth, multi-user, persistent storage)
