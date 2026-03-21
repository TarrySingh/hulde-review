# Hulde Review

## Project Overview
An AI-powered code review and visualization tool combining LLM intelligence + static analysis to produce interactive dashboards for understanding, reviewing, and improving codebases. Part of the hulde.ai edtech platform.

## Prerequisites
- Node.js >= 22 (developed on v24)
- pnpm >= 10 (pinned via `packageManager` field in root `package.json`)

## Architecture
- **Monorepo** with pnpm workspaces
- **hulde-review-plugin/** — Claude Code plugin containing all source code:
  - **packages/core** — Shared analysis engine (types, persistence, tree-sitter, search, schema, tours, plugins)
  - **packages/dashboard** — React + TypeScript web dashboard (React Flow, Zustand, TailwindCSS v4)
  - **src/** — Skill TypeScript source for `/hulde-chat`, `/hulde-diff`, `/hulde-explain`, `/hulde-onboard`
  - **skills/** — Skill definitions (`/hulde-review`, `/hulde-dashboard`, etc.)
  - **agents/** — Agent definitions (project-scanner, file-analyzer, architecture-analyzer, tour-builder, graph-reviewer)

## Dashboard
- Dark luxury theme with Hulde green accents (#00A651), deep blacks (#0a0a0a), DM Serif Display typography
- Graph-first layout: 75% graph + 360px right sidebar
- Sidebar: ProjectOverview (default) -> NodeInfo (node selected) -> LearnPanel (Learn persona)
- Code viewer: styled summary overlay (slides up from bottom on file node click)
- Schema validation on graph load with error banner

## Agent Pipeline
- Agents write intermediate results to `.hulde-review/intermediate/` on disk (not returned to context)
- Agent models: sonnet for simple tasks (project-scanner, graph-reviewer), opus for complex (file-analyzer, architecture-analyzer, tour-builder)
- `/hulde-review` auto-triggers `/hulde-dashboard` after completion
- Intermediate files cleaned up after graph assembly

## Key Commands
- `pnpm install` — Install all dependencies
- `pnpm --filter @hulde-review/core build` — Build the core package
- `pnpm --filter @hulde-review/core test` — Run core tests
- `pnpm --filter @hulde-review/skill build` — Build the plugin package
- `pnpm --filter @hulde-review/skill test` — Run plugin tests
- `pnpm --filter @hulde-review/dashboard build` — Build the dashboard
- `pnpm dev:dashboard` — Start dashboard dev server
- `pnpm lint` — Run ESLint across the project

## Conventions
- TypeScript strict mode everywhere
- Vitest for testing
- ESM modules (`"type": "module"`)
- Knowledge graph JSON lives in `.hulde-review/` directory of analyzed projects
- Core uses subpath exports (`./search`, `./types`, `./schema`) to avoid pulling Node.js modules into browser

## Gotchas
- **tree-sitter**: Uses `web-tree-sitter` (WASM) instead of native `tree-sitter` — native bindings fail on darwin/arm64 + Node 24
- **Dashboard imports**: Dashboard must only import from core's browser-safe subpath exports (`./search`, `./types`, `./schema`), never the main entry point which pulls in Node.js modules

## Versioning
When pushing to remote, bump the version in **both** of these files (keep them in sync):
- `hulde-review-plugin/package.json` -> `"version"` field
- `.claude-plugin/marketplace.json` -> `plugins[0].version` field

## Branding
- Part of the hulde.ai edtech platform (enterprise.hulde.ai)
- Primary color: Hulde Green (#00A651)
- Dark luxury theme with green accents instead of gold
- Font: Inter (sans), DM Serif Display (serif), JetBrains Mono (mono)
