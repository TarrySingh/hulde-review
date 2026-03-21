<p align="center">
  <img src="assets/hero.png" alt="Hulde Review — Turn any codebase into an interactive knowledge graph" width="100%" />
</p>

<h1 align="center">Hulde Review</h1>

<p align="center">
  <strong>Turn any codebase into an interactive knowledge graph you can explore, search, and learn from.</strong>
</p>

<p align="center">
  <a href="https://hulde.ai"><img src="https://img.shields.io/badge/hulde.ai-00A651?style=for-the-badge&logo=data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48Y2lyY2xlIGN4PSIxMiIgY3k9IjEyIiByPSIxMCIgZmlsbD0id2hpdGUiLz48L3N2Zz4=&logoColor=white" alt="hulde.ai" /></a>
  <a href="#installation"><img src="https://img.shields.io/badge/Claude_Code-Plugin-black?style=for-the-badge&logo=anthropic&logoColor=white" alt="Claude Code Plugin" /></a>
  <img src="https://img.shields.io/badge/version-1.1.1-00A651?style=for-the-badge" alt="Version 1.1.1" />
  <img src="https://img.shields.io/badge/license-MIT-blue?style=for-the-badge" alt="MIT License" />
</p>

<p align="center">
  <a href="#quick-start">Quick Start</a> &bull;
  <a href="#commands">Commands</a> &bull;
  <a href="#dashboard">Dashboard</a> &bull;
  <a href="#how-it-works">How It Works</a> &bull;
  <a href="#who-is-this-for">Who Is This For</a> &bull;
  <a href="#contributing">Contributing</a>
</p>

---

## What is Hulde Review?

Hulde Review is a **Claude Code plugin** that analyzes any codebase and produces an interactive knowledge graph — a living map of your project's architecture, dependencies, and patterns. It combines **LLM intelligence** with **static analysis** (tree-sitter AST parsing) to give you:

- **Visual architecture maps** — See how files, functions, classes, and modules connect
- **Plain-English summaries** — Every node in the graph gets a human-readable explanation
- **Guided tours** — Auto-generated walkthroughs ordered by dependency (start from the roots, work your way up)
- **Diff impact analysis** — Understand what a PR actually touches across the architecture
- **Fuzzy + semantic search** — Find anything in the graph by name or concept
- **Persona-adaptive UI** — Junior dev? PM? Architect? The dashboard adjusts detail level to match
- **Architectural layer detection** — API, Service, Data, UI, Utility layers auto-classified
- **12 programming patterns** explained in context

All powered by a **7-phase multi-agent pipeline** running inside Claude Code.

---

## Quick Start

### Option 1 — Install from Claude Marketplace

```bash
/plugin marketplace add tarrysingh/hulde-review
/plugin install hulde-review
```

### Option 2 — Install from GitHub

```bash
# Clone the repo
git clone https://github.com/tarrysingh/hulde-review.git

# Launch Claude Code with the plugin loaded
claude --plugin-dir ./hulde-review/hulde-review-plugin
```

### Option 3 — Shell Alias (recommended for daily use)

Add this to your `~/.zshrc` or `~/.bashrc`:

```bash
alias claude-hulde='claude --plugin-dir /path/to/hulde-review/hulde-review-plugin'
```

Then from any project:

```bash
cd your-project
claude-hulde
```

---

## Commands

Once the plugin is loaded, you get six slash commands:

| Command | What it does |
|---|---|
| `/hulde-review` | Run the full 7-phase analysis pipeline on the current codebase |
| `/hulde-dashboard` | Launch the interactive web dashboard to visualize the knowledge graph |
| `/hulde-chat [query]` | Ask natural-language questions about the codebase using the graph |
| `/hulde-diff` | Analyze staged changes or a PR against the knowledge graph |
| `/hulde-explain [path]` | Deep-dive explanation of a specific file, function, or module |
| `/hulde-onboard` | Generate a structured onboarding guide for new team members |

### Your first analysis

```
> /hulde-review
```

That's it. The pipeline will:

1. **SCAN** — Discover project structure, languages, and entry points
2. **ANALYZE** — Parse each file with tree-sitter + LLM for summaries and relationships
3. **ASSEMBLE** — Merge all file-level graphs into a unified knowledge graph
4. **ARCHITECTURE** — Detect layers, patterns, and architectural boundaries
5. **TOUR** — Generate guided walkthroughs using topological sort
6. **REVIEW** — Validate graph completeness and fix orphan nodes
7. **SAVE** — Write `knowledge-graph.json` to `.hulde-review/`

The dashboard launches automatically when the analysis completes.

---

## Dashboard

The interactive dashboard runs locally at `localhost:5173` (or the next available port) and gives you:

### Graph View
An interactive node-link diagram powered by React Flow. Nodes represent files, functions, classes, and modules. Edges show dependencies, calls, imports, and inheritance. Drag, zoom, and click to explore.

### Search
Fuzzy search (Fuse.js) finds nodes by name, path, or description. Start typing and results appear instantly.

### Guided Tours
Auto-generated walkthroughs that start from the dependency roots and work upward. Each step includes a plain-English explanation of what the component does and why it matters.

### Layer Visualization
Toggle architectural layers on/off to focus on specific parts of the stack:
- **API** — Routes, endpoints, controllers
- **Service** — Business logic, orchestration
- **Data** — Models, repositories, database access
- **UI** — Components, views, templates
- **Utility** — Helpers, shared libraries, config

### Persona Selector
Switch between detail levels:
- **Junior** — More context, simpler language, pattern explanations
- **Senior** — Concise, architecture-focused
- **PM** — High-level system overview, no code details

### Diff Overlay
Visualize which parts of the architecture are affected by recent changes. Red = modified, yellow = impacted downstream.

---

## How It Works

```
┌──────────────────────────────────────────────────────┐
│                   Claude Code CLI                     │
│                                                       │
│  /hulde-review                                        │
│       │                                               │
│       ▼                                               │
│  ┌─────────┐  ┌──────────┐  ┌──────────┐            │
│  │  SCAN   │→ │ ANALYZE  │→ │ ASSEMBLE │            │
│  │ scanner │  │ per-file │  │  merge   │            │
│  └─────────┘  └──────────┘  └──────────┘            │
│       │                           │                   │
│       ▼                           ▼                   │
│  ┌──────────┐  ┌────────┐  ┌──────────┐            │
│  │ ARCHITECT│→ │  TOUR  │→ │  REVIEW  │→ SAVE      │
│  │  layers  │  │ guided │  │ validate │  .json      │
│  └──────────┘  └────────┘  └──────────┘            │
│                                                       │
│  /hulde-dashboard ──→ localhost:5173                  │
│  /hulde-chat ──→ graph-powered Q&A                   │
│  /hulde-diff ──→ PR impact analysis                  │
│  /hulde-explain ──→ deep-dive on any component       │
│  /hulde-onboard ──→ new-hire onboarding guide        │
└──────────────────────────────────────────────────────┘
```

### Knowledge Graph Schema

The graph contains **5 node types** and **18 edge types**:

**Nodes:**
| Type | Description |
|---|---|
| `file` | Source files with language, path, and summary |
| `function` | Functions and methods with signatures |
| `class` | Classes and interfaces with properties |
| `module` | Logical groupings (packages, namespaces) |
| `concept` | Architectural patterns and design concepts |

**Edge Categories:**
| Category | Edge Types |
|---|---|
| **Structural** | `contains`, `exports`, `declares` |
| **Dependency** | `imports`, `depends-on`, `uses` |
| **Inheritance** | `extends`, `implements`, `mixes-in` |
| **Runtime** | `calls`, `instantiates`, `emits`, `listens` |
| **Conceptual** | `related-to`, `pattern-of`, `layer-of`, `documented-by`, `tested-by`, `configured-by` |

### Tech Stack

| Layer | Technology |
|---|---|
| Analysis | Tree-sitter WASM + Claude LLM |
| Graph Schema | Zod 4 validation |
| Search | Fuse.js (fuzzy) + cosine similarity (semantic) |
| Dashboard | React 18 + React Flow + Zustand 5 |
| Styling | Tailwind CSS v4 (Hulde green `#00A651`) |
| Build | Vite + TypeScript + pnpm workspaces |
| Staleness | Git-based incremental updates |

---

## Who Is This For

### Engineers & Developers
- Visualize the architecture of any codebase before diving into code
- Understand how components connect before making changes
- Review PRs with full architectural context via `/hulde-diff`
- Onboard onto new projects in minutes instead of days

### Tech Leads & Architects
- Validate that the actual architecture matches the intended design
- Identify orphaned modules, circular dependencies, and structural debt
- Generate architecture documentation that stays in sync with the code

### Product Managers & Designers
- Understand how systems work without reading source code
- See the scope and impact of proposed changes
- Get plain-English explanations of technical components

### Educators & Students
- Learn real-world architecture patterns from actual codebases
- Follow guided tours that explain systems from the ground up
- Explore 12 programming patterns identified in context

---

## Project Structure

```
hulde-review/
├── .claude-plugin/
│   ├── plugin.json              # Plugin manifest
│   └── marketplace.json         # Marketplace listing
├── hulde-review-plugin/
│   ├── skills/
│   │   ├── hulde-review/        # Main analysis pipeline (7 phases)
│   │   ├── hulde-chat/          # Graph-powered Q&A
│   │   ├── hulde-dashboard/     # Dashboard launcher
│   │   ├── hulde-diff/          # Diff impact analysis
│   │   ├── hulde-explain/       # Deep-dive explanations
│   │   └── hulde-onboard/       # Onboarding guide generator
│   ├── agents/
│   │   └── knowledge-graph-guide.md
│   ├── packages/
│   │   ├── core/                # Graph types, schema, search, persistence
│   │   └── dashboard/           # React + Vite interactive visualization
│   └── src/                     # Skill runtime helpers
├── CLAUDE.md                    # Project instructions for Claude Code
└── README.md                    # You are here
```

---

## Configuration

### Incremental Updates

Hulde Review is **incremental by default**. After the first full analysis, subsequent runs only re-analyze files that changed (detected via `git diff`). Force a full rebuild with:

```
/hulde-review --full
```

### Scoped Analysis

Analyze a specific subdirectory:

```
/hulde-review src/api
```

### Output Location

All analysis artifacts are written to `.hulde-review/` in the project root:

```
.hulde-review/
├── knowledge-graph.json    # The full knowledge graph
├── hr-scan-*.json          # Phase 1 scan results
├── hr-analysis-*.json      # Phase 2 per-file analysis
└── hr-tour-*.json          # Phase 5 guided tours
```

Add `.hulde-review/` to your `.gitignore` — it's generated output.

---

## Development

### Prerequisites

- [Node.js](https://nodejs.org/) 20+
- [pnpm](https://pnpm.io/) 9+
- [Claude Code](https://claude.ai/code) CLI

### Building from Source

```bash
git clone https://github.com/tarrysingh/hulde-review.git
cd hulde-review

# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run the dashboard dev server standalone
pnpm dashboard:dev
```

### Running Tests

```bash
pnpm test
```

---

## Marketplace Distribution

### For Teams (Custom Marketplace)

Add the marketplace to your Claude Code config:

```bash
/plugin marketplace add tarrysingh/hulde-review
/plugin install hulde-review
```

Or add it to your project's `.claude/settings.json` so every team member gets it automatically:

```json
{
  "extraKnownMarketplaces": {
    "hulde-review": {
      "source": {
        "source": "github",
        "repo": "tarrysingh/hulde-review"
      }
    }
  },
  "enabledPlugins": {
    "hulde-review@hulde-review": true
  }
}
```

### For Everyone (Official Marketplace)

Hulde Review is also available on the [Claude Plugin Marketplace](https://claude.com/plugins):

```bash
/plugin install hulde-review
```

---

## Part of the Hulde Platform

Hulde Review is a module of **[hulde.ai](https://hulde.ai)** — an agentic AI-powered edtech platform for developers and engineers. The platform includes:

- **Hulde Learn** — AI-driven personalized learning paths
- **Hulde Review** — Codebase analysis and visualization (this plugin)
- **Hulde Agent** — Autonomous coding assistants

Visit [enterprise.hulde.ai](https://enterprise.hulde.ai) for the full platform experience.

---

## Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## License

MIT License — see [LICENSE](LICENSE) for details.

---

<p align="center">
  <strong>Built with 💚 by <a href="https://hulde.ai">Hulde AI</a></strong>
  <br />
  <sub>Powered by Claude &bull; Visualized with React Flow &bull; Analyzed with Tree-sitter</sub>
</p>
