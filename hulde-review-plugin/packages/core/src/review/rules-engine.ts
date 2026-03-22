/**
 * Static Analysis Rules Engine
 *
 * Pure algorithmic analysis — no LLM required.
 * Language-aware and extensible via the ReviewRule interface.
 */

import type { StructuralAnalysis, CallGraphEntry } from "../types.js";
import type { ReviewFinding, FindingCategory, Severity } from "./types.js";

// ---------------------------------------------------------------------------
// Analysis Context — passed to each rule
// ---------------------------------------------------------------------------

export interface AnalysisContext {
  filePath: string;
  content: string;
  language: string;
  structural: StructuralAnalysis;
  callGraph: CallGraphEntry[];
  /** All file paths in the project, for cross-file checks */
  allFilePaths?: string[];
  /** Import map: filePath -> list of imported sources */
  importGraph?: Map<string, string[]>;
}

// ---------------------------------------------------------------------------
// Rule interface
// ---------------------------------------------------------------------------

export interface ReviewRule {
  id: string;
  name: string;
  category: FindingCategory;
  severity: Severity;
  languages: string[] | "all";
  description: string;
  check(ctx: AnalysisContext): ReviewFinding[];
}

// ---------------------------------------------------------------------------
// Utility: generate a deterministic finding ID
// ---------------------------------------------------------------------------

function findingId(category: FindingCategory, ruleId: string, filePath: string, extra?: string): string {
  const hash = simpleHash(`${ruleId}:${filePath}:${extra ?? ""}`);
  return `finding:${category}:${hash}`;
}

function simpleHash(input: string): string {
  let h = 0;
  for (let i = 0; i < input.length; i++) {
    h = ((h << 5) - h + input.charCodeAt(i)) | 0;
  }
  return Math.abs(h).toString(36).slice(0, 8);
}

// ---------------------------------------------------------------------------
// Rules Engine
// ---------------------------------------------------------------------------

export class RulesEngine {
  private rules: ReviewRule[] = [];

  register(rule: ReviewRule): void {
    this.rules.push(rule);
  }

  registerMany(rules: ReviewRule[]): void {
    for (const rule of rules) {
      this.rules.push(rule);
    }
  }

  analyze(ctx: AnalysisContext): ReviewFinding[] {
    const findings: ReviewFinding[] = [];
    const applicable = this.getRulesForLanguage(ctx.language);
    for (const rule of applicable) {
      try {
        const ruleFindings = rule.check(ctx);
        findings.push(...ruleFindings);
      } catch {
        // Rule threw — skip it, don't crash the pipeline
      }
    }
    return findings;
  }

  getRulesForLanguage(language: string): ReviewRule[] {
    return this.rules.filter(
      (r) => r.languages === "all" || r.languages.includes(language),
    );
  }

  get ruleCount(): number {
    return this.rules.length;
  }
}

// ============================================================================
// UNIVERSAL RULES (all languages)
// ============================================================================

export const largeFileRule: ReviewRule = {
  id: "large-file",
  name: "Large File",
  category: "quality",
  severity: "medium",
  languages: "all",
  description: "Files with too many lines are hard to navigate and maintain.",
  check(ctx) {
    const lines = ctx.content.split("\n").length;
    const findings: ReviewFinding[] = [];
    if (lines > 1000) {
      findings.push({
        id: findingId("quality", "large-file", ctx.filePath, "high"),
        category: "quality",
        severity: "high",
        title: `Very large file (${lines} lines)`,
        description: `This file has ${lines} lines, far exceeding the recommended maximum of 500. Files this large are difficult to navigate, review, and maintain. Consider splitting into smaller, focused modules.`,
        filePath: ctx.filePath,
        suggestion: "Break this file into smaller modules by responsibility. Extract related functions into separate files.",
        effort: "large",
        tags: ["large-file"],
      });
    } else if (lines > 500) {
      findings.push({
        id: findingId("quality", "large-file", ctx.filePath, "medium"),
        category: "quality",
        severity: "medium",
        title: `Large file (${lines} lines)`,
        description: `This file has ${lines} lines, exceeding the recommended maximum of 500. Consider splitting into smaller modules.`,
        filePath: ctx.filePath,
        suggestion: "Consider extracting logically independent sections into separate files.",
        effort: "medium",
        tags: ["large-file"],
      });
    }
    return findings;
  },
};

export const longFunctionRule: ReviewRule = {
  id: "long-function",
  name: "Long Function",
  category: "quality",
  severity: "medium",
  languages: "all",
  description: "Functions that are too long are hard to understand and test.",
  check(ctx) {
    const findings: ReviewFinding[] = [];
    for (const fn of ctx.structural.functions) {
      const length = fn.lineRange[1] - fn.lineRange[0] + 1;
      if (length > 200) {
        findings.push({
          id: findingId("quality", "long-function", ctx.filePath, fn.name + ":critical"),
          category: "quality",
          severity: "critical",
          title: `Extremely long function '${fn.name}' (${length} lines)`,
          description: `Function '${fn.name}' spans ${length} lines. Functions over 200 lines are nearly impossible to reason about, test in isolation, or review safely.`,
          filePath: ctx.filePath,
          lineRange: fn.lineRange,
          suggestion: `Decompose '${fn.name}' into smaller helper functions. Identify logical blocks and extract them.`,
          effort: "large",
          tags: ["long-function"],
        });
      } else if (length > 100) {
        findings.push({
          id: findingId("quality", "long-function", ctx.filePath, fn.name + ":high"),
          category: "quality",
          severity: "high",
          title: `Very long function '${fn.name}' (${length} lines)`,
          description: `Function '${fn.name}' spans ${length} lines. Consider breaking it into smaller, focused functions.`,
          filePath: ctx.filePath,
          lineRange: fn.lineRange,
          suggestion: `Extract logical sections of '${fn.name}' into helper functions.`,
          effort: "medium",
          tags: ["long-function"],
        });
      } else if (length > 50) {
        findings.push({
          id: findingId("quality", "long-function", ctx.filePath, fn.name + ":medium"),
          category: "quality",
          severity: "medium",
          title: `Long function '${fn.name}' (${length} lines)`,
          description: `Function '${fn.name}' spans ${length} lines. This exceeds the recommended 50-line limit.`,
          filePath: ctx.filePath,
          lineRange: fn.lineRange,
          suggestion: `Look for opportunities to simplify '${fn.name}' or extract reusable helpers.`,
          effort: "small",
          tags: ["long-function"],
        });
      }
    }
    return findings;
  },
};

export const tooManyParamsRule: ReviewRule = {
  id: "too-many-params",
  name: "Too Many Parameters",
  category: "quality",
  severity: "medium",
  languages: "all",
  description: "Functions with too many parameters are hard to call correctly.",
  check(ctx) {
    const findings: ReviewFinding[] = [];
    for (const fn of ctx.structural.functions) {
      const count = fn.params.length;
      if (count > 8) {
        findings.push({
          id: findingId("quality", "too-many-params", ctx.filePath, fn.name + ":high"),
          category: "quality",
          severity: "high",
          title: `Function '${fn.name}' has ${count} parameters`,
          description: `Function '${fn.name}' accepts ${count} parameters. This makes it extremely difficult to call correctly and understand. Consider using an options object or restructuring.`,
          filePath: ctx.filePath,
          lineRange: fn.lineRange,
          suggestion: "Group related parameters into a configuration object or struct. Consider if the function is doing too much.",
          effort: "medium",
          tags: ["too-many-params"],
        });
      } else if (count > 5) {
        findings.push({
          id: findingId("quality", "too-many-params", ctx.filePath, fn.name + ":medium"),
          category: "quality",
          severity: "medium",
          title: `Function '${fn.name}' has ${count} parameters`,
          description: `Function '${fn.name}' accepts ${count} parameters. Consider grouping related parameters.`,
          filePath: ctx.filePath,
          lineRange: fn.lineRange,
          suggestion: "Group related parameters into an options object or struct.",
          effort: "small",
          tags: ["too-many-params"],
        });
      }
    }
    return findings;
  },
};

export const deeplyNestedRule: ReviewRule = {
  id: "deeply-nested",
  name: "Deeply Nested Code",
  category: "quality",
  severity: "medium",
  languages: "all",
  description: "Deep indentation indicates complex control flow that is hard to follow.",
  check(ctx) {
    const findings: ReviewFinding[] = [];
    const lines = ctx.content.split("\n");
    let maxDepth = 0;
    let maxDepthLine = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.trim().length === 0) continue;
      // Count leading whitespace as indentation
      const match = /^(\s*)/.exec(line);
      if (!match) continue;
      const indent = match[1];
      // Normalize: tabs = 4 spaces
      const depth = Math.floor(
        (indent.replace(/\t/g, "    ").length) / (ctx.language === "fortran" ? 3 : 2),
      );
      if (depth > maxDepth) {
        maxDepth = depth;
        maxDepthLine = i + 1;
      }
    }

    if (maxDepth > 6) {
      findings.push({
        id: findingId("quality", "deeply-nested", ctx.filePath, "critical"),
        category: "quality",
        severity: "critical",
        title: `Deeply nested code (${maxDepth} levels)`,
        description: `This file contains code nested ${maxDepth} levels deep (around line ${maxDepthLine}). This level of nesting makes code extremely difficult to follow and is a strong indicator of excessive complexity.`,
        filePath: ctx.filePath,
        lineRange: [maxDepthLine, maxDepthLine],
        suggestion: "Use early returns, guard clauses, or extract deeply nested blocks into helper functions.",
        effort: "medium",
        tags: ["deeply-nested"],
      });
    } else if (maxDepth > 4) {
      findings.push({
        id: findingId("quality", "deeply-nested", ctx.filePath, "medium"),
        category: "quality",
        severity: "medium",
        title: `Moderately nested code (${maxDepth} levels)`,
        description: `This file contains code nested ${maxDepth} levels deep (around line ${maxDepthLine}).`,
        filePath: ctx.filePath,
        lineRange: [maxDepthLine, maxDepthLine],
        suggestion: "Consider refactoring to reduce nesting depth.",
        effort: "small",
        tags: ["deeply-nested"],
      });
    }

    return findings;
  },
};

export const deadImportsRule: ReviewRule = {
  id: "dead-imports",
  name: "Dead Imports",
  category: "maintainability",
  severity: "low",
  languages: "all",
  description: "Imports whose specifiers are never referenced in the file body.",
  check(ctx) {
    const findings: ReviewFinding[] = [];
    for (const imp of ctx.structural.imports) {
      // Skip wildcard or namespace imports (no specifiers)
      if (imp.specifiers.length === 0) continue;
      // For Fortran COMMON blocks and EQUIVALENCE, skip
      if (imp.source.startsWith("COMMON/") || imp.source === "EQUIVALENCE") continue;

      const deadSpecifiers: string[] = [];
      for (const spec of imp.specifiers) {
        // Clean up aliased imports: "Foo as Bar" -> check for Bar
        const localName = spec.includes(" as ") ? spec.split(" as ")[1].trim() : spec.trim();
        if (!localName) continue;
        // Check if the specifier appears in the file content (outside the import line)
        const linesBefore = ctx.content.split("\n").slice(0, imp.lineNumber - 1).join("\n");
        const linesAfter = ctx.content.split("\n").slice(imp.lineNumber).join("\n");
        const body = linesBefore + "\n" + linesAfter;
        // Use word boundary check
        const re = new RegExp(`\\b${escapeRegex(localName)}\\b`);
        if (!re.test(body)) {
          deadSpecifiers.push(spec);
        }
      }

      if (deadSpecifiers.length > 0) {
        findings.push({
          id: findingId("maintainability", "dead-imports", ctx.filePath, imp.source + ":" + deadSpecifiers.join(",")),
          category: "maintainability",
          severity: "low",
          title: `Unused import${deadSpecifiers.length > 1 ? "s" : ""} from '${imp.source}'`,
          description: `The following imported specifier${deadSpecifiers.length > 1 ? "s are" : " is"} never referenced: ${deadSpecifiers.join(", ")}`,
          filePath: ctx.filePath,
          lineRange: [imp.lineNumber, imp.lineNumber],
          suggestion: `Remove unused import${deadSpecifiers.length > 1 ? "s" : ""}: ${deadSpecifiers.join(", ")}`,
          effort: "trivial",
          tags: ["dead-imports", "cleanup"],
        });
      }
    }
    return findings;
  },
};

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export const circularDependencyRiskRule: ReviewRule = {
  id: "circular-dependency-risk",
  name: "Circular Dependency Risk",
  category: "architecture",
  severity: "high",
  languages: "all",
  description: "When file A imports B and B imports A, this creates a circular dependency.",
  check(ctx) {
    const findings: ReviewFinding[] = [];
    if (!ctx.importGraph) return findings;

    const myImports = ctx.importGraph.get(ctx.filePath) ?? [];
    for (const importedPath of myImports) {
      const theirImports = ctx.importGraph.get(importedPath) ?? [];
      if (theirImports.includes(ctx.filePath)) {
        findings.push({
          id: findingId("architecture", "circular-dependency-risk", ctx.filePath, importedPath),
          category: "architecture",
          severity: "high",
          title: `Circular dependency with '${importedPath}'`,
          description: `This file imports '${importedPath}', which in turn imports this file. Circular dependencies can cause initialization bugs, make refactoring dangerous, and increase coupling.`,
          filePath: ctx.filePath,
          suggestion: "Extract shared code into a third module that both files can import. Or invert the dependency using dependency injection.",
          effort: "medium",
          tags: ["circular-dependency", "architecture"],
        });
      }
    }
    return findings;
  },
};

export const missingErrorHandlingRule: ReviewRule = {
  id: "missing-error-handling",
  name: "Missing Error Handling",
  category: "reliability",
  severity: "medium",
  languages: "all",
  description: "Functions that call other functions but have no try/catch or error return.",
  check(ctx) {
    const findings: ReviewFinding[] = [];
    // Check for functions that have calls but no try/catch
    const hasTryCatch = /\btry\s*\{/i.test(ctx.content) || /\bcatch\s*\(/i.test(ctx.content);
    const hasThrows = /\bthrow\s/i.test(ctx.content);
    const hasErrorReturn = /return\s+(?:err|error|new\s+Error)/i.test(ctx.content);

    // Only flag if there are function calls (from call graph) but no error handling
    if (ctx.callGraph.length > 3 && !hasTryCatch && !hasThrows && !hasErrorReturn) {
      // For Fortran, check for STATUS/IOSTAT/ERR= patterns
      if (ctx.language === "fortran") {
        const hasErrHandling = /\b(IOSTAT|ERR\s*=|STATUS\s*=)/i.test(ctx.content);
        if (hasErrHandling) return findings;
      }

      findings.push({
        id: findingId("reliability", "missing-error-handling", ctx.filePath),
        category: "reliability",
        severity: "medium",
        title: "No error handling detected",
        description: `This file makes ${ctx.callGraph.length} function calls but contains no visible error handling (try/catch, error returns, or throw statements). Unhandled errors can crash the application or corrupt data silently.`,
        filePath: ctx.filePath,
        suggestion: "Add try/catch blocks around operations that can fail. Consider a centralized error handling strategy.",
        effort: "medium",
        tags: ["error-handling", "reliability"],
      });
    }
    return findings;
  },
};

export const godClassRule: ReviewRule = {
  id: "god-class",
  name: "God Class",
  category: "maintainability",
  severity: "high",
  languages: "all",
  description: "Classes with too many methods or properties are doing too much.",
  check(ctx) {
    const findings: ReviewFinding[] = [];
    for (const cls of ctx.structural.classes) {
      const methodCount = cls.methods.length;
      const propCount = cls.properties.length;
      if (methodCount > 15 || propCount > 20) {
        findings.push({
          id: findingId("maintainability", "god-class", ctx.filePath, cls.name),
          category: "maintainability",
          severity: "high",
          title: `God class '${cls.name}' (${methodCount} methods, ${propCount} properties)`,
          description: `Class '${cls.name}' has ${methodCount} methods and ${propCount} properties. This violates the Single Responsibility Principle and makes the class hard to test, understand, and modify.`,
          filePath: ctx.filePath,
          lineRange: cls.lineRange,
          suggestion: `Split '${cls.name}' into smaller, focused classes. Group related methods and properties by responsibility.`,
          effort: "large",
          tags: ["god-class", "srp-violation"],
        });
      }
    }
    return findings;
  },
};

export const highCouplingRule: ReviewRule = {
  id: "high-coupling",
  name: "High Coupling",
  category: "architecture",
  severity: "medium",
  languages: "all",
  description: "Files that import too many other files are highly coupled.",
  check(ctx) {
    const findings: ReviewFinding[] = [];
    // Count unique import sources
    const uniqueSources = new Set(ctx.structural.imports.map((i) => i.source));
    const count = uniqueSources.size;
    if (count > 10) {
      findings.push({
        id: findingId("architecture", "high-coupling", ctx.filePath),
        category: "architecture",
        severity: count > 15 ? "high" : "medium",
        title: `High coupling: ${count} imports`,
        description: `This file imports from ${count} different sources. High coupling makes the file fragile — changes in any dependency could break it.`,
        filePath: ctx.filePath,
        suggestion: "Consider introducing a facade or mediator pattern to reduce direct dependencies. Group related imports behind a single module.",
        effort: "medium",
        tags: ["high-coupling", "architecture"],
      });
    }
    return findings;
  },
};

export const duplicateFunctionNamesRule: ReviewRule = {
  id: "duplicate-function-names",
  name: "Duplicate Function Names",
  category: "maintainability",
  severity: "low",
  languages: "all",
  description: "Same function name appearing multiple times in the same file.",
  check(ctx) {
    const findings: ReviewFinding[] = [];
    const nameCount = new Map<string, number>();
    for (const fn of ctx.structural.functions) {
      const lower = fn.name.toLowerCase();
      nameCount.set(lower, (nameCount.get(lower) ?? 0) + 1);
    }
    for (const [name, count] of nameCount) {
      if (count > 1) {
        findings.push({
          id: findingId("maintainability", "duplicate-function-names", ctx.filePath, name),
          category: "maintainability",
          severity: "low",
          title: `Duplicate function name '${name}' (${count} times)`,
          description: `The function name '${name}' appears ${count} times in this file. This can cause confusion and may indicate copy-paste issues.`,
          filePath: ctx.filePath,
          suggestion: "Rename the duplicate functions to clearly distinguish their purpose.",
          effort: "small",
          tags: ["duplicate-names"],
        });
      }
    }
    return findings;
  },
};

// ============================================================================
// FORTRAN-SPECIFIC RULES
// ============================================================================

export const gotoSpaghettiRule: ReviewRule = {
  id: "goto-spaghetti",
  name: "GOTO Spaghetti",
  category: "quality",
  severity: "high",
  languages: ["fortran"],
  description: "Detect GOTO statements, especially computed GOTOs and deeply nested GOTO chains.",
  check(ctx) {
    const findings: ReviewFinding[] = [];
    const lines = ctx.content.split("\n");

    let gotoCount = 0;
    let computedGotoCount = 0;
    const gotoLines: number[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const upper = line.toUpperCase();
      // Skip comment lines
      if (/^[Cc*!]/.test(line)) continue;

      // Computed GOTO: GO TO (10, 20, 30), expr
      if (/\bGO\s*TO\s*\(/.test(upper)) {
        computedGotoCount++;
        gotoCount++;
        gotoLines.push(i + 1);
      }
      // Assigned GOTO: GO TO var, (10, 20, 30)
      else if (/\bGO\s*TO\s+\w+\s*,\s*\(/.test(upper)) {
        computedGotoCount++;
        gotoCount++;
        gotoLines.push(i + 1);
      }
      // Simple GOTO: GO TO label
      else if (/\bGO\s*TO\s+\d+/.test(upper)) {
        gotoCount++;
        gotoLines.push(i + 1);
      }
    }

    if (gotoCount > 0) {
      let severity: Severity = "medium";
      if (computedGotoCount > 0 || gotoCount > 5) severity = "high";
      if (gotoCount > 10) severity = "critical";

      findings.push({
        id: findingId("quality", "goto-spaghetti", ctx.filePath),
        category: "quality",
        severity,
        title: `${gotoCount} GOTO statement${gotoCount > 1 ? "s" : ""} detected${computedGotoCount > 0 ? ` (${computedGotoCount} computed)` : ""}`,
        description: `This file contains ${gotoCount} GOTO statement${gotoCount > 1 ? "s" : ""}${computedGotoCount > 0 ? `, including ${computedGotoCount} computed GOTO${computedGotoCount > 1 ? "s" : ""}` : ""}. GOTO-based control flow creates "spaghetti code" that is extremely difficult to follow, debug, and modify. Lines: ${gotoLines.slice(0, 10).join(", ")}${gotoLines.length > 10 ? "..." : ""}`,
        filePath: ctx.filePath,
        suggestion: "Replace GOTO statements with structured control flow (IF/THEN/ELSE, DO loops, SELECT CASE). For computed GOTOs, use SELECT CASE instead.",
        effort: gotoCount > 10 ? "epic" : "large",
        tags: ["fortran", "goto-spaghetti", "legacy"],
        references: ["https://fortranwiki.org/fortran/show/Modernizing+Old+Fortran"],
      });
    }

    return findings;
  },
};

export const commonBlockAbuseRule: ReviewRule = {
  id: "common-block-abuse",
  name: "COMMON Block Abuse",
  category: "maintainability",
  severity: "medium",
  languages: ["fortran"],
  description: "Subroutines using too many COMMON blocks (excessive shared mutable state).",
  check(ctx) {
    const findings: ReviewFinding[] = [];
    const commonImports = ctx.structural.imports.filter((i) => i.source.startsWith("COMMON/"));
    const uniqueBlocks = new Set(commonImports.map((i) => i.source));

    if (uniqueBlocks.size > 5) {
      findings.push({
        id: findingId("maintainability", "common-block-abuse", ctx.filePath),
        category: "maintainability",
        severity: uniqueBlocks.size > 8 ? "high" : "medium",
        title: `Excessive COMMON block usage (${uniqueBlocks.size} blocks)`,
        description: `This file references ${uniqueBlocks.size} COMMON blocks: ${[...uniqueBlocks].map((b) => b.replace("COMMON/", "")).join(", ")}. COMMON blocks are global mutable state — excessive use makes it nearly impossible to understand data flow or refactor safely.`,
        filePath: ctx.filePath,
        suggestion: "Convert COMMON blocks to MODULE variables with explicit USE statements. This provides better scoping and compiler checking.",
        effort: "large",
        tags: ["fortran", "common-block", "legacy", "global-state"],
      });
    }

    return findings;
  },
};

export const implicitTypingRule: ReviewRule = {
  id: "implicit-typing",
  name: "Missing IMPLICIT NONE",
  category: "reliability",
  severity: "high",
  languages: ["fortran"],
  description: "Detect when IMPLICIT NONE is missing — variables get implicit types by first letter.",
  check(ctx) {
    const findings: ReviewFinding[] = [];
    const upper = ctx.content.toUpperCase();

    // Check if IMPLICIT NONE is present
    const hasImplicitNone = /\bIMPLICIT\s+NONE\b/i.test(ctx.content);

    if (!hasImplicitNone) {
      // Check if there are any program units (SUBROUTINE, FUNCTION, PROGRAM, MODULE)
      const hasUnits = /\b(SUBROUTINE|FUNCTION|PROGRAM|MODULE)\s+\w+/i.test(ctx.content);
      if (hasUnits) {
        findings.push({
          id: findingId("reliability", "implicit-typing", ctx.filePath),
          category: "reliability",
          severity: "high",
          title: "Missing IMPLICIT NONE",
          description: "This file does not contain IMPLICIT NONE. Without it, undeclared variables are implicitly typed based on their first letter (I-N = INTEGER, everything else = REAL). Typos become silent bugs — a misspelled variable name creates a new, zero-initialized variable instead of causing a compilation error.",
          filePath: ctx.filePath,
          suggestion: "Add IMPLICIT NONE to every program unit. Then explicitly declare all variables. The compiler will catch any undeclared variables (including typos).",
          effort: "medium",
          tags: ["fortran", "implicit-typing", "legacy", "safety"],
          cweId: "CWE-456",
          references: ["https://fortranwiki.org/fortran/show/IMPLICIT+NONE"],
        });
      }
    }

    return findings;
  },
};

export const equivalenceAliasingRule: ReviewRule = {
  id: "equivalence-aliasing",
  name: "EQUIVALENCE Aliasing",
  category: "security",
  severity: "high",
  languages: ["fortran"],
  description: "EQUIVALENCE statements create dangerous memory aliasing.",
  check(ctx) {
    const findings: ReviewFinding[] = [];
    const equivImports = ctx.structural.imports.filter((i) => i.source === "EQUIVALENCE");

    if (equivImports.length > 0) {
      findings.push({
        id: findingId("security", "equivalence-aliasing", ctx.filePath),
        category: "security",
        severity: "high",
        title: `${equivImports.length} EQUIVALENCE statement${equivImports.length > 1 ? "s" : ""} detected`,
        description: `EQUIVALENCE forces two or more variables to share the same memory location. This is a form of dangerous aliasing: modifying one variable silently changes another. It defeats type safety, makes optimization impossible, and is a known source of subtle data corruption bugs.`,
        filePath: ctx.filePath,
        lineRange: [equivImports[0].lineNumber, equivImports[equivImports.length - 1].lineNumber],
        suggestion: "Replace EQUIVALENCE with TRANSFER() for type punning, or use separate variables with explicit conversions. In Fortran 90+, use derived types instead.",
        effort: "medium",
        tags: ["fortran", "equivalence", "memory-aliasing", "legacy"],
        cweId: "CWE-843",
      });
    }

    return findings;
  },
};

export const magicNumbersRule: ReviewRule = {
  id: "magic-numbers",
  name: "Magic Numbers",
  category: "compliance",
  severity: "low",
  languages: ["fortran"],
  description: "Numeric literals in computations (not in DATA/PARAMETER statements).",
  check(ctx) {
    const findings: ReviewFinding[] = [];
    const lines = ctx.content.split("\n");
    let magicCount = 0;
    const magicLines: number[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const upper = line.toUpperCase().trim();
      // Skip comments
      if (/^[Cc*!]/.test(line)) continue;
      // Skip DATA, PARAMETER, and declaration lines
      if (/^\s*(DATA|PARAMETER|INTEGER|REAL|DOUBLE|COMPLEX|LOGICAL|CHARACTER|DIMENSION|IMPLICIT)/i.test(line)) continue;
      // Skip blank lines
      if (upper.length === 0) continue;

      // Find numeric literals that are not 0, 1, or -1 (common idioms)
      const numMatches = upper.match(/\b\d+\.?\d*(?:E[+-]?\d+)?(?:D[+-]?\d+)?\b/g);
      if (numMatches) {
        for (const num of numMatches) {
          const val = parseFloat(num);
          if (!isNaN(val) && val !== 0 && val !== 1 && val !== -1 && val !== 2) {
            magicCount++;
            if (!magicLines.includes(i + 1)) magicLines.push(i + 1);
          }
        }
      }
    }

    if (magicCount > 5) {
      findings.push({
        id: findingId("compliance", "magic-numbers", ctx.filePath),
        category: "compliance",
        severity: magicCount > 15 ? "medium" : "low",
        title: `${magicCount} magic numbers detected`,
        description: `This file contains ${magicCount} numeric literals used directly in computations rather than named constants. Magic numbers make code hard to understand and dangerous to modify.`,
        filePath: ctx.filePath,
        suggestion: "Replace magic numbers with named PARAMETER constants (Fortran 77) or named constants in a module (Fortran 90+).",
        effort: "small",
        tags: ["fortran", "magic-numbers", "compliance"],
      });
    }

    return findings;
  },
};

export const missingSaveRule: ReviewRule = {
  id: "missing-save",
  name: "Missing SAVE Statement",
  category: "reliability",
  severity: "medium",
  languages: ["fortran"],
  description: "Local variables in subroutines that may lose state without SAVE.",
  check(ctx) {
    const findings: ReviewFinding[] = [];
    const upper = ctx.content.toUpperCase();

    // Check for DATA statements without SAVE (DATA implies SAVE in F90+, but not in F77)
    const hasData = /\bDATA\s+\w+/.test(upper);
    const hasSave = /\bSAVE\b/.test(upper);

    if (hasData && !hasSave) {
      // Only flag for fixed-format (likely F77)
      const isFixed = /^[Cc*]/.test(ctx.content);
      if (isFixed) {
        findings.push({
          id: findingId("reliability", "missing-save", ctx.filePath),
          category: "reliability",
          severity: "medium",
          title: "DATA without SAVE in Fortran 77 code",
          description: "This file uses DATA statements to initialize local variables but does not use SAVE. In Fortran 77, local variables may lose their values between calls unless explicitly SAVEd. While some compilers default to static allocation, this is not guaranteed.",
          filePath: ctx.filePath,
          suggestion: "Add SAVE statements for variables initialized with DATA, or add a blanket SAVE statement to the subroutine.",
          effort: "trivial",
          tags: ["fortran", "save", "legacy"],
        });
      }
    }

    return findings;
  },
};

export const fixedFormatLineLengthRule: ReviewRule = {
  id: "fixed-format-line-length",
  name: "Fixed-Format Line Length",
  category: "reliability",
  severity: "high",
  languages: ["fortran"],
  description: "Lines exceeding column 72 in fixed-format Fortran are silently truncated.",
  check(ctx) {
    const findings: ReviewFinding[] = [];
    // Only check fixed-format files
    const ext = ctx.filePath.toLowerCase();
    const isFixed = ext.endsWith(".f") || ext.endsWith(".for") || ext.endsWith(".f77") || ext.endsWith(".fpp");
    if (!isFixed && !/^[Cc*]/.test(ctx.content)) return findings;

    const lines = ctx.content.split("\n");
    const longLines: number[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Skip comment lines
      if (/^[Cc*!]/.test(line)) continue;
      if (line.length > 72) {
        longLines.push(i + 1);
      }
    }

    if (longLines.length > 0) {
      findings.push({
        id: findingId("reliability", "fixed-format-line-length", ctx.filePath),
        category: "reliability",
        severity: "high",
        title: `${longLines.length} lines exceed column 72`,
        description: `In fixed-format Fortran, columns beyond 72 are SILENTLY IGNORED by the compiler. This means code that appears to be there is actually not compiled. This is one of the most insidious bugs in legacy Fortran. Lines: ${longLines.slice(0, 10).join(", ")}${longLines.length > 10 ? "..." : ""}`,
        filePath: ctx.filePath,
        suggestion: "Use continuation lines (character in column 6) for long statements. Or migrate to free-format (.f90) where line length is 132 characters.",
        effort: "small",
        tags: ["fortran", "fixed-format", "silent-truncation", "legacy"],
      });
    }

    return findings;
  },
};

export const obsoleteConstructsRule: ReviewRule = {
  id: "obsolete-constructs",
  name: "Obsolete Constructs",
  category: "modernization",
  severity: "medium",
  languages: ["fortran"],
  description: "ARITHMETIC IF, COMPUTED GOTO, ASSIGNED GOTO, PAUSE, and other obsolete constructs.",
  check(ctx) {
    const findings: ReviewFinding[] = [];
    const lines = ctx.content.split("\n");
    const obsolete: Array<{ kind: string; line: number }> = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const upper = line.toUpperCase().trim();
      // Skip comments
      if (/^[Cc*!]/.test(line)) continue;

      // Arithmetic IF: IF (expr) label1, label2, label3
      if (/\bIF\s*\([^)]+\)\s*\d+\s*,\s*\d+\s*,\s*\d+/.test(upper)) {
        obsolete.push({ kind: "Arithmetic IF", line: i + 1 });
      }

      // PAUSE statement
      if (/^\s*PAUSE\b/.test(upper)) {
        obsolete.push({ kind: "PAUSE", line: i + 1 });
      }

      // ASSIGN label TO var (assigned GOTO setup)
      if (/\bASSIGN\s+\d+\s+TO\s+\w+/.test(upper)) {
        obsolete.push({ kind: "ASSIGN", line: i + 1 });
      }

      // ENTRY statement (still valid but considered poor practice)
      if (/^\s*ENTRY\s+\w+/.test(upper)) {
        obsolete.push({ kind: "ENTRY", line: i + 1 });
      }
    }

    if (obsolete.length > 0) {
      const kinds = [...new Set(obsolete.map((o) => o.kind))];
      findings.push({
        id: findingId("modernization", "obsolete-constructs", ctx.filePath),
        category: "modernization",
        severity: obsolete.length > 5 ? "high" : "medium",
        title: `${obsolete.length} obsolete construct${obsolete.length > 1 ? "s" : ""} detected`,
        description: `This file uses obsolete Fortran constructs: ${kinds.join(", ")}. These have been removed or deprecated in modern Fortran standards and make the code extremely difficult to maintain.`,
        filePath: ctx.filePath,
        suggestion: "Replace Arithmetic IF with IF/THEN/ELSE or SELECT CASE. Replace PAUSE with STOP or READ. Replace ASSIGN/assigned GOTO with SELECT CASE. Replace ENTRY with separate module procedures.",
        effort: "medium",
        tags: ["fortran", "obsolete", "modernization", "legacy"],
        references: ["https://fortranwiki.org/fortran/show/Modernizing+Old+Fortran"],
      });
    }

    return findings;
  },
};

// ============================================================================
// JAVASCRIPT/TYPESCRIPT-SPECIFIC RULES
// ============================================================================

export const anyTypeAbuseRule: ReviewRule = {
  id: "any-type-abuse",
  name: "TypeScript 'any' Type Abuse",
  category: "quality",
  severity: "medium",
  languages: ["typescript", "tsx"],
  description: "Excessive use of TypeScript 'any' type defeats the purpose of type safety.",
  check(ctx) {
    const findings: ReviewFinding[] = [];
    // Match `: any`, `as any`, `<any>`, generic `any` in type positions
    const anyMatches = ctx.content.match(/\b(?::\s*any\b|as\s+any\b|<any>)/g);
    const count = anyMatches?.length ?? 0;

    if (count > 0) {
      let severity: Severity = "info";
      if (count >= 3) severity = "low";
      if (count >= 5) severity = "medium";
      if (count >= 10) severity = "high";

      findings.push({
        id: findingId("quality", "any-type-abuse", ctx.filePath),
        category: "quality",
        severity,
        title: `${count} 'any' type usage${count > 1 ? "s" : ""}`,
        description: `This file uses the 'any' type ${count} time${count > 1 ? "s" : ""}. Each 'any' creates a hole in type safety where bugs can hide. TypeScript's value comes from its type system — 'any' opts out of it.`,
        filePath: ctx.filePath,
        suggestion: "Replace 'any' with specific types, 'unknown' (for truly unknown types), or generic type parameters. Use type guards for runtime narrowing.",
        effort: count > 5 ? "medium" : "small",
        tags: ["typescript", "any-type", "type-safety"],
      });
    }

    return findings;
  },
};

export const consoleLogLeftRule: ReviewRule = {
  id: "console-log-left",
  name: "Console Statements in Production Code",
  category: "quality",
  severity: "low",
  languages: ["javascript", "typescript", "jsx", "tsx"],
  description: "console.log/warn/error left in production code.",
  check(ctx) {
    const findings: ReviewFinding[] = [];
    // Skip test files
    if (/\.(test|spec|__tests__)\./i.test(ctx.filePath)) return findings;

    const matches = ctx.content.match(/\bconsole\.(log|warn|error|debug|info|trace)\s*\(/g);
    const count = matches?.length ?? 0;

    if (count > 0) {
      findings.push({
        id: findingId("quality", "console-log-left", ctx.filePath),
        category: "quality",
        severity: count > 5 ? "medium" : "low",
        title: `${count} console statement${count > 1 ? "s" : ""} in production code`,
        description: `This file contains ${count} console statement${count > 1 ? "s" : ""}. Console output should not leak into production — it can expose sensitive data, clutter logs, and impact performance.`,
        filePath: ctx.filePath,
        suggestion: "Replace console statements with a proper logging library that supports log levels and can be configured per environment.",
        effort: "trivial",
        tags: ["console", "cleanup", "logging"],
      });
    }

    return findings;
  },
};

export const noErrorBoundaryRule: ReviewRule = {
  id: "no-error-boundary",
  name: "React Component Without Error Boundary",
  category: "reliability",
  severity: "low",
  languages: ["jsx", "tsx"],
  description: "React components without error boundaries can crash the entire UI.",
  check(ctx) {
    const findings: ReviewFinding[] = [];
    // Check if this looks like a React component file
    const hasJSX = /<[A-Z]\w+[\s/>]/.test(ctx.content);
    const hasReact = /\bReact\b|from\s+['"]react['"]/.test(ctx.content);
    if (!hasJSX && !hasReact) return findings;

    // Check for ErrorBoundary pattern
    const hasErrorBoundary = /ErrorBoundary|componentDidCatch|getDerivedStateFromError/.test(ctx.content);
    const usesErrorBoundary = /\bErrorBoundary\b/.test(ctx.content);

    // Only flag top-level pages/layouts, not every component
    const isPage = /\b(page|layout|app)\.(tsx|jsx)$/i.test(ctx.filePath) ||
                   /\/pages\//.test(ctx.filePath) ||
                   /\/app\//.test(ctx.filePath);

    if (isPage && !hasErrorBoundary && !usesErrorBoundary) {
      findings.push({
        id: findingId("reliability", "no-error-boundary", ctx.filePath),
        category: "reliability",
        severity: "low",
        title: "Page/layout component without error boundary",
        description: "This appears to be a page or layout component without an error boundary. A rendering error in any child component will crash the entire page instead of showing a fallback UI.",
        filePath: ctx.filePath,
        suggestion: "Wrap critical sections with an ErrorBoundary component. Consider using react-error-boundary for a convenient implementation.",
        effort: "small",
        tags: ["react", "error-boundary", "resilience"],
      });
    }

    return findings;
  },
};

export const callbackHellRule: ReviewRule = {
  id: "callback-hell",
  name: "Callback Hell",
  category: "quality",
  severity: "medium",
  languages: ["javascript", "typescript", "jsx", "tsx"],
  description: "Nested callbacks more than 3 levels deep.",
  check(ctx) {
    const findings: ReviewFinding[] = [];
    // Heuristic: count consecutive opening of callbacks: `, function(` or `=> {` nested within each other
    const lines = ctx.content.split("\n");
    let callbackDepth = 0;
    let maxCallbackDepth = 0;
    let maxCallbackLine = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Count callback-like openings
      if (/(?:function\s*\(|=>\s*\{|\.\s*then\s*\()/.test(line)) {
        callbackDepth++;
        if (callbackDepth > maxCallbackDepth) {
          maxCallbackDepth = callbackDepth;
          maxCallbackLine = i + 1;
        }
      }
      // Count closings
      const closings = (line.match(/\}\s*\)/g) || []).length;
      callbackDepth = Math.max(0, callbackDepth - closings);
    }

    if (maxCallbackDepth > 3) {
      findings.push({
        id: findingId("quality", "callback-hell", ctx.filePath),
        category: "quality",
        severity: maxCallbackDepth > 5 ? "high" : "medium",
        title: `Callback nesting ${maxCallbackDepth} levels deep`,
        description: `Callbacks are nested ${maxCallbackDepth} levels deep around line ${maxCallbackLine}. Deeply nested callbacks ("callback hell") make code extremely hard to read, debug, and maintain.`,
        filePath: ctx.filePath,
        lineRange: [maxCallbackLine, maxCallbackLine],
        suggestion: "Refactor to use async/await, Promise chains, or extract nested callbacks into named functions.",
        effort: "medium",
        tags: ["callback-hell", "async"],
      });
    }

    return findings;
  },
};

export const unsafeRegexRule: ReviewRule = {
  id: "unsafe-regex",
  name: "Potentially Unsafe Regex",
  category: "security",
  severity: "medium",
  languages: ["javascript", "typescript", "jsx", "tsx"],
  description: "Regex patterns that could cause catastrophic backtracking (ReDoS).",
  check(ctx) {
    const findings: ReviewFinding[] = [];
    // Detect regex patterns with nested quantifiers: (a+)+ , (a*)*  , (a|b|c)+ repeated
    const regexLiteralPattern = /\/([^/\n]+)\//g;
    const newRegexPattern = /new\s+RegExp\(\s*['"]([^'"]+)['"]/g;

    const regexes: Array<{ pattern: string; pos: number }> = [];
    let match: RegExpExecArray | null;

    while ((match = regexLiteralPattern.exec(ctx.content)) !== null) {
      regexes.push({ pattern: match[1], pos: match.index });
    }
    while ((match = newRegexPattern.exec(ctx.content)) !== null) {
      regexes.push({ pattern: match[1], pos: match.index });
    }

    for (const { pattern, pos } of regexes) {
      // Dangerous patterns: nested quantifiers, alternation with overlap
      const hasNestedQuantifier = /(\([^)]*[+*][^)]*\))[+*]/.test(pattern) ||
                                   /([+*])\1/.test(pattern) ||
                                   /\([^)]*\|[^)]*\)[+*]/.test(pattern);
      if (hasNestedQuantifier) {
        // Find the line number
        const upToPos = ctx.content.slice(0, pos);
        const lineNum = upToPos.split("\n").length;

        findings.push({
          id: findingId("security", "unsafe-regex", ctx.filePath, pattern),
          category: "security",
          severity: "medium",
          title: "Potentially unsafe regex pattern (ReDoS risk)",
          description: `Regex pattern /${pattern}/ contains nested quantifiers or overlapping alternation that could cause catastrophic backtracking. An attacker can craft input that takes exponential time to match, causing a denial of service.`,
          filePath: ctx.filePath,
          lineRange: [lineNum, lineNum],
          suggestion: "Rewrite the regex to avoid nested quantifiers. Use atomic groups or possessive quantifiers where supported. Consider using a regex analysis tool like safe-regex.",
          effort: "small",
          tags: ["regex", "redos", "security"],
          cweId: "CWE-1333",
        });
      }
    }

    return findings;
  },
};

// ============================================================================
// Default Rules Collection
// ============================================================================

export function createDefaultRulesEngine(): RulesEngine {
  const engine = new RulesEngine();
  engine.registerMany([
    // Universal
    largeFileRule,
    longFunctionRule,
    tooManyParamsRule,
    deeplyNestedRule,
    deadImportsRule,
    circularDependencyRiskRule,
    missingErrorHandlingRule,
    godClassRule,
    highCouplingRule,
    duplicateFunctionNamesRule,
    // Fortran
    gotoSpaghettiRule,
    commonBlockAbuseRule,
    implicitTypingRule,
    equivalenceAliasingRule,
    magicNumbersRule,
    missingSaveRule,
    fixedFormatLineLengthRule,
    obsoleteConstructsRule,
    // JavaScript/TypeScript
    anyTypeAbuseRule,
    consoleLogLeftRule,
    noErrorBoundaryRule,
    callbackHellRule,
    unsafeRegexRule,
  ]);
  return engine;
}
