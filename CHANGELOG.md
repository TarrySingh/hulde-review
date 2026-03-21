# Changelog

All notable changes to Hulde Review will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.1.1] — 2026-03-22

### Initial Release

The first public release of Hulde Review — a Claude Code plugin that turns any codebase into an interactive knowledge graph for code review, architecture understanding, and developer onboarding.

Replicated and rebranded from the [Understand-Anything](https://github.com/Lum1104/Understand-Anything) plugin, with full Hulde AI platform branding, Hulde Green (`#00A651`) dark luxury theme, and integration-ready architecture for [enterprise.hulde.ai](https://enterprise.hulde.ai).

---

### Added

#### Plugin Infrastructure
- `.claude-plugin/plugin.json` — Plugin manifest (name, version, author, homepage, license)
- `.claude-plugin/marketplace.json` — Custom marketplace definition for team distribution
- `CLAUDE.md` — Project instructions for Claude Code context
- `pnpm-workspace.yaml` — Monorepo workspace configuration
- Root `package.json` with workspace scripts (`build`, `test`, `lint`, `dashboard:dev`)
- `.gitignore` configured for Node.js, `.hulde-review/` output, and macOS artifacts

#### 7-Phase Multi-Agent Analysis Pipeline (`/hulde-review`)
- **Phase 0 — Pre-flight**: Detects existing graph, checks for staleness via git diff
- **Phase 1 — SCAN**: Project inventory using `project-scanner-prompt.md` agent
- **Phase 2 — ANALYZE**: Per-file analysis with tree-sitter AST parsing + LLM summaries via `file-analyzer-prompt.md` agent (batched, 10 files per batch)
- **Phase 3 — ASSEMBLE**: Merges all file-level partial graphs into a unified knowledge graph
- **Phase 4 — ARCHITECTURE**: Layer detection (API, Service, Data, UI, Utility) and pattern recognition via `architecture-analyzer-prompt.md` agent
- **Phase 5 — TOUR**: Guided walkthrough generation using Kahn's topological sort via `tour-builder-prompt.md` agent
- **Phase 6 — REVIEW**: Graph validation, orphan node detection, and edge completeness via `graph-reviewer-prompt.md` agent
- **Phase 7 — SAVE**: Writes final `knowledge-graph.json` to `.hulde-review/` directory
- Incremental analysis by default (only re-analyzes changed files)
- `--full` flag to force complete rebuild
- Subdirectory scoping support

#### Slash Commands (6 total)
- `/hulde-review [options]` — Run the full 7-phase analysis pipeline
- `/hulde-dashboard [project-path]` — Launch the interactive web dashboard
- `/hulde-chat [query]` — Natural-language Q&A powered by the knowledge graph
- `/hulde-diff` — Analyze staged changes or PRs against the architecture graph
- `/hulde-explain [file-path]` — Deep-dive explanation of a specific file, function, or module
- `/hulde-onboard` — Generate structured onboarding guide for new team members

#### Core Package (`@hulde-review/core`)
- **Type system** (`types.ts`): 5 node types (file, function, class, module, concept), 18 edge types across 5 categories (structural, dependency, inheritance, runtime, conceptual), `KnowledgeGraph`, `Layer`, `TourStep`, `AnalyzerPlugin` interfaces
- **Schema validation** (`schema.ts`): Zod 4 schemas for full graph validation with `validateGraph()` function
- **Search engine** (`search.ts`): Fuzzy text search using Fuse.js with configurable thresholds
- **Semantic search** (`embedding-search.ts`): Cosine similarity-based search engine for concept matching
- **Persistence** (`persistence/index.ts`): File I/O for `.hulde-review/` directory with `loadGraph()`, `saveGraph()`, `loadIntermediate()`, `saveIntermediate()`
- **Staleness detection** (`staleness.ts`): Git-based change detection with `getChangedFiles()`, `isStale()`, `mergeGraphUpdate()`
- **Graph builder** (`analyzer/graph-builder.ts`): `GraphBuilder` class for constructing knowledge graphs programmatically
- **LLM analyzer** (`analyzer/llm-analyzer.ts`): Prompt builders and response parsers for LLM-powered analysis
- **Layer detector** (`analyzer/layer-detector.ts`): Heuristic + LLM-based architectural layer classification
- **Tour generator** (`analyzer/tour-generator.ts`): Guided tour generation using Kahn's algorithm for topological ordering
- **Language lessons** (`analyzer/language-lesson.ts`): Detection and explanation of 12 programming patterns in context
- **Tree-sitter plugin** (`plugins/tree-sitter-plugin.ts`): TypeScript/JavaScript AST parsing via `web-tree-sitter` (WASM, not native bindings)
- **Plugin registry** (`plugins/registry.ts`): Language-to-analyzer-plugin mapping
- **Plugin discovery** (`plugins/discovery.ts`): Default plugin configuration
- Subpath exports (`./search`, `./types`, `./schema`) to keep Node.js modules out of browser bundles

#### Dashboard Package (`@hulde-review/dashboard`)
- **React 18 + TypeScript** single-page application
- **React Flow (@xyflow/react 12)** interactive graph visualization with Dagre layout
- **Zustand 5** state management store
- **Tailwind CSS v4** with CSS-based theme configuration
- **Vite** dev server with custom middleware to serve `knowledge-graph.json` from `GRAPH_DIR` env var
- **Dark luxury theme** with Hulde green accents:
  - `--color-hulde-green: #00A651` (primary)
  - `--color-hulde-green-dark: #004D2B` (deep accent)
  - `--color-hulde-green-bright: #33B873` (highlight)
  - `animate-hulde-pulse` custom animation
  - Deep black backgrounds (`#0a0a0a`, `#111111`)
- **10 components**:
  - `App.tsx` — Main app shell with tab navigation (Overview, Learn, Deep Dive)
  - `GraphView.tsx` — Interactive node-link diagram with green edge colors
  - `CustomNode.tsx` — Node renderer with type icons, complexity badges, and green ring highlights
  - `SearchBar.tsx` — Fuzzy/Semantic search toggle with instant results
  - `NodeInfo.tsx` — Node detail sidebar with metadata, connections, and tags
  - `LearnPanel.tsx` — Tour/learning interface with step-by-step walkthrough
  - `ProjectOverview.tsx` — Project stats (nodes, edges, layers, types, languages, frameworks)
  - `LayerLegend.tsx` — Layer toggle for filtering graph by architectural layer
  - `CodeViewer.tsx` — Code summary overlay (slides up from bottom on file node click)
  - `DiffToggle.tsx` — Diff overlay toggle (red = modified, yellow = impacted downstream)
  - `PersonaSelector.tsx` — Junior/Senior/PM persona toggle
- **Layout utility** (`utils/layout.ts`): Dagre-based automatic graph layout
- Google Fonts: Inter (sans), DM Serif Display (serif), JetBrains Mono (mono)

#### Skill Runtime Helpers
- `context-builder.ts` — Chat context builder with 1-hop graph expansion for `/hulde-chat`
- `diff-analyzer.ts` — Diff impact analysis for `/hulde-diff`
- `explain-builder.ts` — Component explanation context builder for `/hulde-explain`
- `onboard-builder.ts` — Onboarding guide generation for `/hulde-onboard` (footer: "Hulde Review" + hulde.ai)
- `hulde-chat.ts` — Chat prompt builder
- `index.ts` — Barrel exports

#### Agent Definitions
- `knowledge-graph-guide.md` — `hulde-review-guide` agent definition for graph-powered assistance

#### Test Suite
- `context-builder.test.ts` — Unit tests for chat context building
- `diff-analyzer.test.ts` — Unit tests for diff impact analysis
- `explain-builder.test.ts` — Unit tests for component explanations
- `onboard-builder.test.ts` — Unit tests for onboarding guide generation

#### Documentation
- `README.md` — Complete how-to guide with badges, quick start (3 install methods), command reference, dashboard features, architecture diagram, knowledge graph schema, tech stack, project structure, and marketplace distribution instructions
- `LICENSE` — MIT License (Tarry Singh / Hulde AI)
- `CHANGELOG.md` — This file

#### DevEx
- Shell alias `claude-hulde` added to `~/.zshrc` for quick plugin loading from any repo
- Launch config in `.claude/launch.json` for dashboard dev server preview
- GitHub repo created as **private** at `github.com/TarrySingh/hulde-review`

### Technical Decisions

| Decision | Rationale |
|---|---|
| `web-tree-sitter` (WASM) over native `tree-sitter` | Native bindings fail on darwin/arm64 + Node 24; WASM is portable |
| Subpath exports in core package | Prevents Node.js modules (fs, path, child_process) from leaking into browser bundle |
| Zod 4 for schema validation | Runtime validation of LLM-generated JSON with detailed error messages |
| Zustand 5 over Redux | Minimal boilerplate, perfect for single-store dashboard state |
| Tailwind CSS v4 (CSS-based config) | No `tailwind.config.js` needed; cleaner, faster |
| pnpm workspaces | Strict dependency isolation, faster installs, workspace protocol |
| Dagre layout | Hierarchical graph layout that naturally shows dependency trees |
| Intermediate files on disk | Keeps LLM context windows small; agents write to `.hulde-review/intermediate/` |
| `GRAPH_DIR` env var for dashboard | Decouples dashboard location from analyzed project location |

### Known Issues
- Dashboard graph layout renders as a wide horizontal band for large graphs (133+ nodes) — needs viewport auto-fit tuning
- React Flow watermark ("React Flow") visible in bottom-right corner (pro license removes it)
- Vite dev server may auto-increment port (5174, 5175...) if previous instance is still running

---

## [Unreleased]

### Planned
- **Phase 2**: Integration into enterprise.hulde.ai (agentify repo) as a platform module
- Official Claude Marketplace submission
- Additional language support (Python, Go, Rust, Java) via tree-sitter plugins
- Graph diff visualization (compare two analysis snapshots)
- Export to Mermaid/PlantUML diagrams
- Collaborative annotations (team comments on graph nodes)
- CI/CD integration (auto-analyze on PR open)
- Performance optimization for large monorepos (1000+ files)

---

[1.1.1]: https://github.com/TarrySingh/hulde-review/releases/tag/v1.1.1
[Unreleased]: https://github.com/TarrySingh/hulde-review/compare/v1.1.1...HEAD
