/**
 * Review Runner — runtime helper for the /hulde-review-code skill.
 *
 * Orchestrates the static analysis pipeline:
 * 1. Builds AnalysisContext for each file
 * 2. Runs the RulesEngine
 * 3. Generates the final report using ReportGenerator
 */

import {
  type AnalyzerPlugin,
  type StructuralAnalysis,
  type CallGraphEntry,
  type AnalysisContext,
  type RulesEngine,
  type ReviewFinding,
  type CodeReviewReport,
  type ReportInput,
  createDefaultRulesEngine,
  ReportGenerator,
} from "@hulde-review/core";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ReviewRunnerOptions {
  projectName: string;
  gitCommitHash: string;
  /** Only run security-related rules */
  securityOnly?: boolean;
  /** Enable all legacy language rules */
  legacy?: boolean;
  /** Treat medium findings as high */
  strict?: boolean;
  /** Scope to a specific directory or file */
  scopePath?: string;
}

export interface FileEntry {
  filePath: string;
  content: string;
  language: string;
  lines: number;
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

export class ReviewRunner {
  private engine: RulesEngine;
  private plugins: Map<string, AnalyzerPlugin> = new Map();
  private reportGenerator = new ReportGenerator();

  constructor() {
    this.engine = createDefaultRulesEngine();
  }

  registerPlugin(plugin: AnalyzerPlugin): void {
    for (const lang of plugin.languages) {
      this.plugins.set(lang, plugin);
    }
  }

  /**
   * Run the full static analysis pipeline on a set of files.
   */
  run(files: FileEntry[], options: ReviewRunnerOptions): CodeReviewReport {
    // Build import graph for cross-file checks
    const importGraph = new Map<string, string[]>();
    const allFilePaths = files.map((f) => f.filePath);

    // First pass: build structural analysis for all files
    const analysisMap = new Map<string, { structural: StructuralAnalysis; callGraph: CallGraphEntry[] }>();

    for (const file of files) {
      const plugin = this.plugins.get(file.language);
      let structural: StructuralAnalysis;
      let callGraph: CallGraphEntry[] = [];

      if (plugin) {
        structural = plugin.analyzeFile(file.filePath, file.content);
        callGraph = plugin.extractCallGraph?.(file.filePath, file.content) ?? [];
      } else {
        // Fallback: basic structural analysis from content
        structural = this.basicStructuralAnalysis(file.content);
      }

      analysisMap.set(file.filePath, { structural, callGraph });

      // Build import graph
      const importSources = structural.imports.map((i) => i.source);
      importGraph.set(file.filePath, importSources);
    }

    // Second pass: run rules on each file
    const allFindings: ReviewFinding[] = [];

    for (const file of files) {
      const analysis = analysisMap.get(file.filePath)!;

      const ctx: AnalysisContext = {
        filePath: file.filePath,
        content: file.content,
        language: file.language,
        structural: analysis.structural,
        callGraph: analysis.callGraph,
        allFilePaths,
        importGraph,
      };

      const findings = this.engine.analyze(ctx);

      // Apply options
      let filtered = findings;
      if (options.securityOnly) {
        filtered = findings.filter((f) => f.category === "security");
      }

      if (options.strict) {
        filtered = filtered.map((f) =>
          f.severity === "medium" ? { ...f, severity: "high" as const } : f,
        );
      }

      allFindings.push(...filtered);
    }

    // Generate report
    const fileLanguageMap = new Map(files.map((f) => [f.filePath, f.language]));
    const fileLinesMap = new Map(files.map((f) => [f.filePath, f.lines]));
    const languages = [...new Set(files.map((f) => f.language))];
    const totalLines = files.reduce((sum, f) => sum + f.lines, 0);

    const reportInput: ReportInput = {
      projectName: options.projectName,
      gitCommitHash: options.gitCommitHash,
      totalFiles: files.length,
      totalLines,
      languages,
      findings: allFindings,
      fileLanguageMap,
      fileLinesMap,
    };

    return this.reportGenerator.generate(reportInput);
  }

  /**
   * Basic structural analysis for languages without a dedicated plugin.
   * Uses simple regex heuristics — better than nothing.
   */
  private basicStructuralAnalysis(content: string): StructuralAnalysis {
    const functions: StructuralAnalysis["functions"] = [];
    const classes: StructuralAnalysis["classes"] = [];
    const imports: StructuralAnalysis["imports"] = [];
    const exports: StructuralAnalysis["exports"] = [];
    const lines = content.split("\n");

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // ES/TS imports
      const importMatch = /^\s*import\s+(?:\{([^}]+)\}|(\w+))\s+from\s+['"]([^'"]+)['"]/
        .exec(line);
      if (importMatch) {
        const specifiers = importMatch[1]
          ? importMatch[1].split(",").map((s) => s.trim()).filter(Boolean)
          : importMatch[2] ? [importMatch[2]] : [];
        imports.push({
          source: importMatch[3],
          specifiers,
          lineNumber: i + 1,
        });
      }

      // Function declarations
      const funcMatch = /^\s*(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\(([^)]*)\)/.exec(line);
      if (funcMatch) {
        const params = funcMatch[2] ? funcMatch[2].split(",").map((p) => p.trim().split(/[=:]/)[0].trim()).filter(Boolean) : [];
        const endLine = this.findBlockEnd(lines, i);
        functions.push({
          name: funcMatch[1],
          lineRange: [i + 1, endLine + 1],
          params,
        });
      }

      // Arrow function const
      const arrowMatch = /^\s*(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?\(([^)]*)\)\s*(?::\s*\w+)?\s*=>/.exec(line);
      if (arrowMatch) {
        const params = arrowMatch[2] ? arrowMatch[2].split(",").map((p) => p.trim().split(/[=:]/)[0].trim()).filter(Boolean) : [];
        const endLine = this.findBlockEnd(lines, i);
        functions.push({
          name: arrowMatch[1],
          lineRange: [i + 1, endLine + 1],
          params,
        });
      }

      // Class declarations
      const classMatch = /^\s*(?:export\s+)?(?:abstract\s+)?class\s+(\w+)/.exec(line);
      if (classMatch) {
        const endLine = this.findBlockEnd(lines, i);
        // Extract methods and properties (simple heuristic)
        const classBody = lines.slice(i, endLine + 1).join("\n");
        const methods = [...classBody.matchAll(/^\s+(?:async\s+)?(\w+)\s*\(/gm)]
          .map((m) => m[1])
          .filter((n) => n !== "constructor" && n !== "if" && n !== "for" && n !== "while");
        const properties = [...classBody.matchAll(/^\s+(?:readonly\s+)?(\w+)\s*[=:;]/gm)]
          .map((m) => m[1])
          .filter((n) => !n.startsWith("//"));
        classes.push({
          name: classMatch[1],
          lineRange: [i + 1, endLine + 1],
          methods,
          properties,
        });
      }

      // Exports
      const exportMatch = /^\s*export\s+(?:default\s+)?(?:class|function|const|let|var|interface|type|enum)\s+(\w+)/.exec(line);
      if (exportMatch) {
        exports.push({ name: exportMatch[1], lineNumber: i + 1 });
      }
    }

    return { functions, classes, imports, exports };
  }

  private findBlockEnd(lines: string[], startLine: number): number {
    let depth = 0;
    let foundOpen = false;
    for (let i = startLine; i < lines.length; i++) {
      for (const ch of lines[i]) {
        if (ch === "{") { depth++; foundOpen = true; }
        if (ch === "}") { depth--; }
        if (foundOpen && depth === 0) return i;
      }
    }
    return Math.min(startLine + 1, lines.length - 1);
  }
}
