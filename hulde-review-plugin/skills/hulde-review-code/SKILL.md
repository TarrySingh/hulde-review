---
name: hulde-review-code
description: Run a deep code review on the current codebase — quality, security, performance, maintainability, and modernization analysis
argument-hint: [options]
---

# /hulde-review-code

Run a production-grade code review engine against the current codebase. Produces actionable findings across quality, security, performance, maintainability, reliability, modernization, architecture, and compliance.

## Options

- `$ARGUMENTS` may contain:
  - `--security-only` — Only run security-related rules
  - `--legacy` — Enable all legacy language rules (Fortran, COBOL, etc.)
  - `--strict` — Treat medium findings as high
  - A path — Scope to a specific directory or file

---

## Phase 0 — Pre-flight

1. Set `PROJECT_ROOT` to the current working directory.
2. Check if `$PROJECT_ROOT/.hulde-review/knowledge-graph.json` exists. If it does, read it and store as `$KNOWLEDGE_GRAPH`. If not, inform the user: "No knowledge graph found. Consider running `/hulde-review` first for architecture-level analysis. Proceeding with static and deep review only."
3. Get the current git commit hash:
   ```bash
   git rev-parse HEAD
   ```
   Store as `$COMMIT_HASH`.
4. Create the output directory:
   ```bash
   mkdir -p $PROJECT_ROOT/.hulde-review
   ```
5. Detect languages present in the project by scanning file extensions:
   ```bash
   find $PROJECT_ROOT -type f \( -name '*.ts' -o -name '*.tsx' -o -name '*.js' -o -name '*.jsx' -o -name '*.f' -o -name '*.f90' -o -name '*.for' -o -name '*.f77' -o -name '*.py' -o -name '*.go' -o -name '*.rs' -o -name '*.java' -o -name '*.c' -o -name '*.cpp' \) -not -path '*/node_modules/*' -not -path '*/.git/*' -not -path '*/dist/*' -not -path '*/build/*' | head -500
   ```
   Store the file list as `$SOURCE_FILES`.
6. Parse `$ARGUMENTS` for options:
   - `--security-only` → `$SECURITY_ONLY = true`
   - `--legacy` → `$LEGACY = true`
   - `--strict` → `$STRICT = true`
   - Any path argument → `$SCOPE_PATH`
7. If `$SCOPE_PATH` is set, filter `$SOURCE_FILES` to only include files under that path.

---

## Phase 1 — Static Analysis

For each file in `$SOURCE_FILES`:

1. Read the file content.
2. Determine the language from the file extension:
   - `.ts` → typescript, `.tsx` → tsx, `.js` → javascript, `.jsx` → jsx
   - `.f`, `.for`, `.f77`, `.fpp` → fortran (fixed-format)
   - `.f90`, `.f95`, `.f03`, `.f08` → fortran (free-format)
   - `.py` → python, `.go` → go, `.rs` → rust, `.java` → java
3. Run the `RulesEngine` from `@hulde-review/core/review/rules-engine.js`:
   - Build an `AnalysisContext` for each file
   - For Fortran files, use the `FortranPlugin` to generate `StructuralAnalysis` and `CallGraphEntry[]`
   - For JS/TS files, use the `TreeSitterPlugin` or the basic structural analysis fallback
   - Apply all applicable rules for the file's language
4. Collect all `ReviewFinding` objects.

**If `$SECURITY_ONLY` is set**, filter findings to only `category === "security"`.
**If `$STRICT` is set**, upgrade all `severity === "medium"` findings to `"high"`.

**Gate check:** If >500 files, inform the user and suggest scoping with a path argument. Proceed only if user confirms.

Store all findings as `$STATIC_FINDINGS`.

---

## Phase 2 — LLM-Powered Deep Review

Identify files that need deep review:
- Files with >3 static findings from Phase 1
- Files with `complexity === "complex"` in the knowledge graph (if available)
- Files with any `critical` or `high` severity findings from static analysis

For up to 10 such files (prioritized by finding count and severity), dispatch subagents for deep review. Run up to **3 subagents concurrently**.

For each file, read the deep review prompt template at `./deep-review-prompt.md` and dispatch a subagent with:

> **File to review:** `<filePath>`
>
> **Language:** `<language>`
>
> **Static findings already detected:**
> ```json
> [list of static findings for this file]
> ```
>
> **File content:**
> ```
> <file content>
> ```
>
> **Instructions:** Follow the deep review prompt template. Return findings as a JSON array of ReviewFinding objects.
> Write output to: `$PROJECT_ROOT/.hulde-review/intermediate/deep-review-<fileIndex>.json`

After all subagents complete, read each `deep-review-<N>.json` file and merge with `$STATIC_FINDINGS`. Deduplicate by checking if a deep review finding overlaps with an existing static finding (same file, similar line range, same category).

Store merged findings as `$ALL_FINDINGS`.

---

## Phase 3 — Architecture Review (if knowledge graph exists)

**Skip this phase if `$KNOWLEDGE_GRAPH` is not available.**

If the knowledge graph exists, analyze it for architecture-level issues:

1. **Circular dependencies:** Walk the edges of type `imports` and `depends_on`. If A→B→A exists, create a finding.
2. **Layer violations:** If layers are defined, check if any edges cross layers in unexpected ways (e.g., a "UI" layer node importing directly from a "Data" layer node, bypassing "Service" layer).
3. **Orphaned modules:** Find nodes with zero incoming AND zero outgoing edges. These are dead code or missing connections.
4. **God modules:** Find nodes with >15 connected edges (high fan-in + fan-out). These are central bottlenecks.

Generate architecture findings and merge with `$ALL_FINDINGS`.

---

## Phase 4 — Report Generation

1. Aggregate all findings from Phases 1-3.
2. Use the `ReportGenerator` from `@hulde-review/core/review/report-generator.js` to produce a `CodeReviewReport`:
   - Calculate composite risk score (0-100)
   - Estimate technical debt in hours
   - Group by severity and category
   - Generate executive summary text
   - Produce prioritized recommendations
   - Calculate per-language breakdown
3. Write the full report to `$PROJECT_ROOT/.hulde-review/review-report.json`.
4. Generate a human-readable Markdown report at `$PROJECT_ROOT/.hulde-review/review-report.md` with:
   - Header with project name, date, commit hash
   - Risk score with visual indicator
   - Executive summary
   - Findings table grouped by severity
   - Language breakdown
   - Recommendations list
5. Clean up intermediate files:
   ```bash
   rm -rf $PROJECT_ROOT/.hulde-review/intermediate
   ```
6. Print a summary to the user:

   ```
   ╔══════════════════════════════════════════════════════════════╗
   ║  HULDE CODE REVIEW COMPLETE                                 ║
   ╠══════════════════════════════════════════════════════════════╣
   ║  Project: <projectName>                                     ║
   ║  Files analyzed: <totalFiles>                               ║
   ║  Risk Score: <riskScore>/100 [<riskLabel>]                  ║
   ║  Total Findings: <totalFindings>                            ║
   ║    Critical: <n>  High: <n>  Medium: <n>  Low: <n>          ║
   ║  Technical Debt: <hours> hours                              ║
   ╠══════════════════════════════════════════════════════════════╣
   ║  TOP FINDINGS:                                              ║
   ║  1. <finding title> (<severity>) — <filePath>               ║
   ║  2. <finding title> (<severity>) — <filePath>               ║
   ║  3. <finding title> (<severity>) — <filePath>               ║
   ║  4. <finding title> (<severity>) — <filePath>               ║
   ║  5. <finding title> (<severity>) — <filePath>               ║
   ╠══════════════════════════════════════════════════════════════╣
   ║  EXECUTIVE SUMMARY:                                         ║
   ║  <executive summary>                                        ║
   ╠══════════════════════════════════════════════════════════════╣
   ║  Reports saved to:                                          ║
   ║    .hulde-review/review-report.json                         ║
   ║    .hulde-review/review-report.md                           ║
   ║                                                             ║
   ║  Run `/hulde-dashboard` to visualize findings in the graph  ║
   ╚══════════════════════════════════════════════════════════════╝
   ```

---

## Error Handling

- If a subagent dispatch fails during deep review, skip that file and continue. Log the failure.
- If structural analysis throws for a file, skip it and continue. Log the failure.
- ALWAYS save partial results — a partial report is better than no report.
- Report any skipped files or errors in the final summary.
- NEVER silently drop errors. Every failure must be visible in the final report.
