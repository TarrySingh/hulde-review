/**
 * Deep Semantic Analysis Rules
 *
 * Beyond surface-level pattern matching — true semantic code understanding.
 * Data flow analysis, control flow tracing, migration readiness scoring,
 * and language-specific deep rules that justify enterprise-grade pricing.
 */

import type { StructuralAnalysis, CallGraphEntry } from "../types.js";
import type { ReviewFinding, FindingCategory, Severity } from "./types.js";
import type { AnalysisContext, ReviewRule } from "./rules-engine.js";

// ---------------------------------------------------------------------------
// Utility: deterministic finding ID (mirrors rules-engine.ts)
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
// Helper: parse Fortran lines (skip comments, handle continuation)
// ---------------------------------------------------------------------------

function isFortranComment(line: string): boolean {
  return /^[Cc*!]/.test(line) || line.trim().length === 0;
}

function parseFortranLabelsAndGotos(content: string): {
  labels: Map<number, number>; // label number -> line number
  gotos: Array<{ label: number; line: number; raw: string }>;
} {
  const lines = content.split("\n");
  const labels = new Map<number, number>();
  const gotos: Array<{ label: number; line: number; raw: string }> = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (isFortranComment(line)) continue;
    const upper = line.toUpperCase();

    // Labels: numeric prefix in columns 1-5
    const labelMatch = /^\s*(\d+)\s+/.exec(line);
    if (labelMatch) {
      labels.set(parseInt(labelMatch[1], 10), i + 1);
    }

    // Simple GOTO: GO TO label
    const simpleGoto = /\bGO\s*TO\s+(\d+)/.exec(upper);
    if (simpleGoto && !/\bGO\s*TO\s*\(/.test(upper)) {
      gotos.push({ label: parseInt(simpleGoto[1], 10), line: i + 1, raw: line.trim() });
    }
  }

  return { labels, gotos };
}

// ============================================================================
// A. DATA FLOW ANALYSIS RULES (All languages)
// ============================================================================

export const deadCodeCallGraphRule: ReviewRule = {
  id: "data-flow-dead-code",
  name: "Dead Code (Call Graph)",
  category: "maintainability",
  severity: "medium",
  languages: "all",
  description: "Functions/subroutines never called from any entry point — dead code via call graph analysis.",
  check(ctx) {
    const findings: ReviewFinding[] = [];
    const fns = ctx.structural.functions;
    if (fns.length <= 1) return findings;

    // Build set of all callee names from the call graph
    const calledNames = new Set<string>();
    for (const entry of ctx.callGraph) {
      calledNames.add(entry.callee.toUpperCase());
    }

    // For Fortran, PROGRAM units are entry points; for others, exported functions
    const exportedNames = new Set<string>();
    for (const exp of ctx.structural.exports) {
      exportedNames.add(exp.name.toUpperCase());
    }

    // Also, the first function or any PROGRAM unit is an entry point
    const isEntryPoint = (name: string): boolean => {
      const upper = name.toUpperCase();
      if (exportedNames.has(upper)) return true;
      if (calledNames.has(upper)) return true;
      // For Fortran: if it's a PROGRAM unit (usually first function)
      if (ctx.language === "fortran") {
        const content = ctx.content.toUpperCase();
        if (new RegExp(`\\bPROGRAM\\s+${upper.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(content)) return true;
      }
      return false;
    };

    const deadFunctions: string[] = [];
    for (const fn of fns) {
      if (!isEntryPoint(fn.name)) {
        deadFunctions.push(fn.name);
      }
    }

    if (deadFunctions.length > 0) {
      findings.push({
        id: findingId("maintainability", "data-flow-dead-code", ctx.filePath),
        category: "maintainability",
        severity: deadFunctions.length > 5 ? "high" : "medium",
        title: `${deadFunctions.length} potentially unreachable function${deadFunctions.length > 1 ? "s" : ""}`,
        description: `The following function${deadFunctions.length > 1 ? "s are" : " is"} never called from any visible entry point or by any other function in this file: ${deadFunctions.join(", ")}. This is likely dead code that increases maintenance burden and confuses readers.`,
        filePath: ctx.filePath,
        suggestion: `Verify these are truly unreachable (check cross-file callers). If confirmed dead, remove: ${deadFunctions.join(", ")}`,
        effort: deadFunctions.length > 5 ? "medium" : "small",
        tags: ["dead-code", "call-graph", "semantic"],
      });
    }

    return findings;
  },
};

export const unusedParametersRule: ReviewRule = {
  id: "unused-parameters",
  name: "Unused Parameters",
  category: "reliability",
  severity: "medium",
  languages: "all",
  description: "Parameters declared in function signatures but never referenced in the body — real bug indicator.",
  check(ctx) {
    const findings: ReviewFinding[] = [];
    const lines = ctx.content.split("\n");

    for (const fn of ctx.structural.functions) {
      if (fn.params.length === 0) continue;
      // Extract function body
      const bodyStart = fn.lineRange[0] - 1;
      const bodyEnd = Math.min(fn.lineRange[1], lines.length);
      const body = lines.slice(bodyStart, bodyEnd).join("\n");

      const unusedParams: string[] = [];
      for (const param of fn.params) {
        const cleaned = param.replace(/^[^:=\s]+\s*[:=]\s*/, "").trim().split(/\s/)[0];
        if (!cleaned || cleaned.length < 2) continue;
        // Escape for regex
        const escaped = cleaned.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const re = new RegExp(`\\b${escaped}\\b`, ctx.language === "fortran" ? "i" : "");
        // Count occurrences — must appear more than once (the declaration itself)
        const matches = body.match(new RegExp(re.source, re.flags + "g"));
        const count = matches ? matches.length : 0;
        if (count <= 1) {
          unusedParams.push(cleaned);
        }
      }

      if (unusedParams.length > 0) {
        findings.push({
          id: findingId("reliability", "unused-parameters", ctx.filePath, fn.name),
          category: "reliability",
          severity: unusedParams.length > 2 ? "high" : "medium",
          title: `Unused parameter${unusedParams.length > 1 ? "s" : ""} in '${fn.name}': ${unusedParams.join(", ")}`,
          description: `Function '${fn.name}' declares parameter${unusedParams.length > 1 ? "s" : ""} ${unusedParams.join(", ")} but never references ${unusedParams.length > 1 ? "them" : "it"} in the body. This often indicates a bug — the function may be using a different variable than intended, or the parameter was left over from a refactor.`,
          filePath: ctx.filePath,
          lineRange: fn.lineRange,
          suggestion: `Either use the parameter${unusedParams.length > 1 ? "s" : ""} or remove ${unusedParams.length > 1 ? "them" : "it"} from the signature. If kept for API compatibility, add a comment explaining why.`,
          effort: "small",
          tags: ["unused-parameter", "bug-risk", "semantic"],
        });
      }
    }

    return findings;
  },
};

export const shadowedVariablesRule: ReviewRule = {
  id: "shadowed-variables",
  name: "Shadowed Variables",
  category: "reliability",
  severity: "medium",
  languages: "all",
  description: "Variables that shadow outer scope or COMMON block variables.",
  check(ctx) {
    const findings: ReviewFinding[] = [];

    if (ctx.language === "fortran") {
      // Detect COMMON block variables shadowed by local declarations
      const commonVars = new Set<string>();
      const lines = ctx.content.split("\n");

      for (const line of lines) {
        if (isFortranComment(line)) continue;
        const upper = line.toUpperCase();
        const commonMatch = /\bCOMMON\s*\/\w+\/\s*(.+)/i.exec(upper);
        if (commonMatch) {
          const vars = commonMatch[1].split(",").map((v) => v.trim().split("(")[0].trim());
          for (const v of vars) {
            if (v) commonVars.add(v);
          }
        }
      }

      if (commonVars.size > 0) {
        // Check function parameters that shadow COMMON variables
        for (const fn of ctx.structural.functions) {
          for (const param of fn.params) {
            const paramUpper = param.toUpperCase().trim();
            if (commonVars.has(paramUpper)) {
              findings.push({
                id: findingId("reliability", "shadowed-variables", ctx.filePath, fn.name + ":" + param),
                category: "reliability",
                severity: "high",
                title: `Parameter '${param}' in '${fn.name}' shadows COMMON variable`,
                description: `The parameter '${param}' in subroutine/function '${fn.name}' has the same name as a variable in a COMMON block. This creates confusion about which variable is being accessed and is a frequent source of bugs in legacy Fortran.`,
                filePath: ctx.filePath,
                lineRange: fn.lineRange,
                suggestion: `Rename either the parameter or the COMMON variable to make the scope unambiguous.`,
                effort: "small",
                tags: ["fortran", "shadowed-variable", "common-block", "semantic"],
              });
            }
          }
        }
      }
    } else {
      // JS/TS: detect let/const/var that shadows outer scope names
      const lines = ctx.content.split("\n");
      const outerDecls = new Set<string>();
      const innerShadows: Array<{ name: string; line: number }> = [];
      let scopeDepth = 0;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // Track brace depth
        const opens = (line.match(/\{/g) || []).length;
        const closes = (line.match(/\}/g) || []).length;

        // Declarations
        const declMatch = /\b(?:let|const|var|function)\s+([a-zA-Z_$][\w$]*)/g;
        let m: RegExpExecArray | null;
        while ((m = declMatch.exec(line)) !== null) {
          const name = m[1];
          if (scopeDepth === 0) {
            outerDecls.add(name);
          } else if (outerDecls.has(name)) {
            innerShadows.push({ name, line: i + 1 });
          }
        }

        scopeDepth += opens - closes;
      }

      if (innerShadows.length > 0) {
        const names = [...new Set(innerShadows.map((s) => s.name))];
        findings.push({
          id: findingId("reliability", "shadowed-variables", ctx.filePath),
          category: "reliability",
          severity: "medium",
          title: `${innerShadows.length} shadowed variable${innerShadows.length > 1 ? "s" : ""}`,
          description: `The following variables shadow outer-scope declarations: ${names.join(", ")}. Shadowed variables are a common source of bugs where the wrong value is accidentally used.`,
          filePath: ctx.filePath,
          suggestion: `Rename the inner variables to avoid shadowing: ${names.join(", ")}`,
          effort: "small",
          tags: ["shadowed-variable", "semantic"],
        });
      }
    }

    return findings;
  },
};

// ============================================================================
// B. CONTROL FLOW COMPLEXITY RULES
// ============================================================================

export const gotoChainAnalysisRule: ReviewRule = {
  id: "goto-chain-analysis",
  name: "GOTO Chain Analysis",
  category: "quality",
  severity: "high",
  languages: ["fortran"],
  description: "Traces GOTO label graph: forward/backward jumps, cross-branch jumps, and GOTO cycles.",
  check(ctx) {
    const findings: ReviewFinding[] = [];
    const { labels, gotos } = parseFortranLabelsAndGotos(ctx.content);

    if (gotos.length === 0) return findings;

    let forwardJumps = 0;
    let backwardJumps = 0;
    const backwardJumpLines: number[] = [];
    const forwardJumpLines: number[] = [];

    // Build adjacency for cycle detection: label -> [target labels reachable from that label's location]
    // Simplified: we track which labels jump to which labels
    const labelToGotos = new Map<number, number[]>(); // source label -> [target labels]

    for (const g of gotos) {
      const targetLine = labels.get(g.label);
      if (targetLine === undefined) continue;

      if (targetLine > g.line) {
        forwardJumps++;
        forwardJumpLines.push(g.line);
      } else {
        backwardJumps++;
        backwardJumpLines.push(g.line);
      }

      // For cycle detection: find what label (if any) the GOTO source is inside
      for (const [lbl, lblLine] of labels) {
        if (lblLine <= g.line) {
          const targets = labelToGotos.get(lbl) ?? [];
          targets.push(g.label);
          labelToGotos.set(lbl, targets);
        }
      }
    }

    // Cycle detection via DFS
    const cycles: number[][] = [];
    const visited = new Set<number>();
    const path: number[] = [];

    function detectCycles(label: number): void {
      if (path.includes(label)) {
        const cycleStart = path.indexOf(label);
        cycles.push([...path.slice(cycleStart), label]);
        return;
      }
      if (visited.has(label)) return;
      visited.add(label);
      path.push(label);
      const targets = labelToGotos.get(label) ?? [];
      for (const t of targets) {
        detectCycles(t);
      }
      path.pop();
    }

    for (const lbl of labels.keys()) {
      visited.clear();
      path.length = 0;
      detectCycles(lbl);
    }

    // Report
    const parts: string[] = [];
    if (forwardJumps > 0) {
      parts.push(`${forwardJumps} forward jump${forwardJumps > 1 ? "s" : ""} (relatively safe — like early returns)`);
    }
    if (backwardJumps > 0) {
      parts.push(`${backwardJumps} backward jump${backwardJumps > 1 ? "s" : ""} (DANGEROUS — loops disguised as GOTOs, lines: ${backwardJumpLines.slice(0, 5).join(", ")})`);
    }
    if (cycles.length > 0) {
      const cycleStr = cycles.slice(0, 3).map((c) => c.join(" -> ")).join("; ");
      parts.push(`${cycles.length} GOTO cycle${cycles.length > 1 ? "s" : ""} detected (infinite loop risk): ${cycleStr}`);
    }

    let severity: Severity = "medium";
    if (backwardJumps > 3 || cycles.length > 0) severity = "critical";
    else if (backwardJumps > 0) severity = "high";

    findings.push({
      id: findingId("quality", "goto-chain-analysis", ctx.filePath),
      category: "quality",
      severity,
      title: `GOTO flow analysis: ${gotos.length} jumps traced`,
      description: `Deep GOTO chain analysis reveals: ${parts.join(". ")}. Total: ${gotos.length} GOTOs targeting ${labels.size} labels.`,
      filePath: ctx.filePath,
      suggestion: backwardJumps > 0
        ? `Replace ${backwardJumps} backward GOTOs with DO/DO WHILE loops. Forward GOTOs can often become IF-THEN-ELSE or EXIT statements.`
        : "Forward-only GOTOs can be replaced with IF-THEN-ELSE blocks or EXIT/CYCLE statements in DO loops.",
      effort: gotos.length > 10 ? "epic" : "large",
      tags: ["fortran", "goto-analysis", "control-flow", "semantic"],
    });

    return findings;
  },
};

export const cyclomaticComplexityRule: ReviewRule = {
  id: "cyclomatic-complexity",
  name: "Cyclomatic Complexity",
  category: "quality",
  severity: "medium",
  languages: "all",
  description: "McCabe cyclomatic complexity — the real metric enterprises use for testability.",
  check(ctx) {
    const findings: ReviewFinding[] = [];

    for (const fn of ctx.structural.functions) {
      const lines = ctx.content.split("\n");
      const start = fn.lineRange[0] - 1;
      const end = Math.min(fn.lineRange[1], lines.length);
      const body = lines.slice(start, end).join("\n");
      const upper = body.toUpperCase();

      let complexity = 1; // Base complexity

      if (ctx.language === "fortran") {
        // Count decision points
        const ifCount = (upper.match(/\bIF\s*\(/g) || []).length;
        const elseifCount = (upper.match(/\bELSE\s*IF\b/g) || []).length;
        const doCount = (upper.match(/\bDO\s+(?:\d+\s+)?\w+\s*=/g) || []).length;
        const doWhileCount = (upper.match(/\bDO\s+WHILE\b/g) || []).length;
        const selectCount = (upper.match(/\bSELECT\s+CASE\b/g) || []).length;
        const caseCount = (upper.match(/\bCASE\s*\(/g) || []).length;
        const gotoCount = (upper.match(/\bGO\s*TO\s+\d+/g) || []).length;

        complexity += ifCount + elseifCount + doCount + doWhileCount + selectCount + caseCount + gotoCount;
      } else {
        // JS/TS/general
        const ifCount = (body.match(/\bif\s*\(/g) || []).length;
        const elseIfCount = (body.match(/\belse\s+if\s*\(/g) || []).length;
        const forCount = (body.match(/\bfor\s*\(/g) || []).length;
        const whileCount = (body.match(/\bwhile\s*\(/g) || []).length;
        const switchCount = (body.match(/\bswitch\s*\(/g) || []).length;
        const caseCount = (body.match(/\bcase\s+/g) || []).length;
        const catchCount = (body.match(/\bcatch\s*\(/g) || []).length;
        const ternaryCount = (body.match(/\?[^?:]*:/g) || []).length;
        const andOrCount = (body.match(/&&|\|\|/g) || []).length;

        complexity += ifCount + elseIfCount + forCount + whileCount + switchCount + caseCount + catchCount + ternaryCount + andOrCount;
      }

      let severity: Severity = "info";
      let label = "simple";
      if (complexity > 50) { severity = "critical"; label = "untestable"; }
      else if (complexity > 20) { severity = "high"; label = "complex"; }
      else if (complexity > 10) { severity = "medium"; label = "moderate"; }

      if (complexity > 10) {
        findings.push({
          id: findingId("quality", "cyclomatic-complexity", ctx.filePath, fn.name),
          category: "quality",
          severity,
          title: `'${fn.name}' has cyclomatic complexity ${complexity} (${label})`,
          description: `McCabe cyclomatic complexity of ${complexity} means this function has ${complexity} independent execution paths. ${
            complexity > 50
              ? "This function is virtually untestable — you would need 50+ test cases for full branch coverage. It almost certainly contains latent bugs."
              : complexity > 20
                ? "This function requires 20+ test cases for full branch coverage. Refactoring is strongly recommended."
                : "This function is becoming difficult to test thoroughly. Consider splitting decision logic."
          }`,
          filePath: ctx.filePath,
          lineRange: fn.lineRange,
          suggestion: `Decompose '${fn.name}' into smaller functions, each handling one decision branch. Target complexity under 10 per function.`,
          effort: complexity > 50 ? "epic" : complexity > 20 ? "large" : "medium",
          tags: ["cyclomatic-complexity", "testability", "semantic"],
        });
      }
    }

    return findings;
  },
};

export const nestingDepthAnalysisRule: ReviewRule = {
  id: "nesting-depth-analysis",
  name: "Structural Nesting Depth",
  category: "quality",
  severity: "medium",
  languages: "all",
  description: "Tracks actual nesting depth through control flow blocks, not just indentation.",
  check(ctx) {
    const findings: ReviewFinding[] = [];

    for (const fn of ctx.structural.functions) {
      const lines = ctx.content.split("\n");
      const start = fn.lineRange[0] - 1;
      const end = Math.min(fn.lineRange[1], lines.length);
      const fnLines = lines.slice(start, end);

      let depth = 0;
      let maxDepth = 0;
      let maxDepthLine = 0;
      const nestingStack: string[] = [];

      for (let i = 0; i < fnLines.length; i++) {
        const line = fnLines[i];
        if (ctx.language === "fortran") {
          if (isFortranComment(line)) continue;
          const upper = line.toUpperCase();

          // Opening blocks
          if (/\bIF\s*\(.+\)\s*THEN\b/.test(upper)) { depth++; nestingStack.push("IF"); }
          else if (/\bDO\s/.test(upper) && !/\bDO\s+WHILE\b/.test(upper)) { depth++; nestingStack.push("DO"); }
          else if (/\bDO\s+WHILE\b/.test(upper)) { depth++; nestingStack.push("DO WHILE"); }
          else if (/\bSELECT\s+CASE\b/.test(upper)) { depth++; nestingStack.push("SELECT CASE"); }

          // Closing blocks
          if (/\bEND\s*IF\b/.test(upper) || /\bENDIF\b/.test(upper)) { depth = Math.max(0, depth - 1); nestingStack.pop(); }
          else if (/\bEND\s*DO\b/.test(upper) || /\bENDDO\b/.test(upper)) { depth = Math.max(0, depth - 1); nestingStack.pop(); }
          else if (/\bEND\s*SELECT\b/.test(upper)) { depth = Math.max(0, depth - 1); nestingStack.pop(); }
        } else {
          // JS/TS: track { and }
          for (const ch of line) {
            if (ch === "{") depth++;
            else if (ch === "}") depth = Math.max(0, depth - 1);
          }
        }

        if (depth > maxDepth) {
          maxDepth = depth;
          maxDepthLine = start + i + 1;
        }
      }

      if (maxDepth > 4) {
        let severity: Severity = "medium";
        if (maxDepth > 7) severity = "critical";
        else if (maxDepth > 5) severity = "high";

        findings.push({
          id: findingId("quality", "nesting-depth-analysis", ctx.filePath, fn.name),
          category: "quality",
          severity,
          title: `'${fn.name}' has control flow nested ${maxDepth} levels deep`,
          description: `Function '${fn.name}' contains control flow blocks nested ${maxDepth} levels deep at line ${maxDepthLine}. The nesting stack at the deepest point suggests deeply interleaved conditional and loop logic. Humans can reliably track about 3 levels of nesting.`,
          filePath: ctx.filePath,
          lineRange: [maxDepthLine, maxDepthLine],
          suggestion: "Extract deeply nested blocks into helper functions. Use early returns/EXIT/CYCLE to reduce nesting. Flatten nested IF chains into guard clauses.",
          effort: maxDepth > 7 ? "large" : "medium",
          tags: ["nesting-depth", "control-flow", "semantic"],
        });
      }
    }

    return findings;
  },
};

// ============================================================================
// C. FORTRAN-SPECIFIC DEEP RULES
// ============================================================================

export const arrayBoundsRiskRule: ReviewRule = {
  id: "array-bounds-risk",
  name: "Array Bounds Risk",
  category: "security",
  severity: "high",
  languages: ["fortran"],
  description: "Detect array access patterns where loop bounds may exceed array dimensions.",
  check(ctx) {
    const findings: ReviewFinding[] = [];
    const lines = ctx.content.split("\n");
    const upper = ctx.content.toUpperCase();

    // Parse array declarations: DIMENSION A(N), REAL A(100), INTEGER B(10,20)
    const arrayDecls = new Map<string, number[]>(); // name -> dimensions
    const dimPatterns = [
      /\bDIMENSION\s+(\w+)\(([^)]+)\)/gi,
      /\b(?:REAL|INTEGER|DOUBLE\s*PRECISION|COMPLEX|LOGICAL)\s+(\w+)\(([^)]+)\)/gi,
    ];

    for (const pattern of dimPatterns) {
      let m: RegExpExecArray | null;
      while ((m = pattern.exec(ctx.content)) !== null) {
        const name = m[1].toUpperCase();
        const dims = m[2].split(",").map((d) => {
          const num = parseInt(d.trim(), 10);
          return isNaN(num) ? -1 : num; // -1 means dynamic/parameter-based
        });
        arrayDecls.set(name, dims);
      }
    }

    if (arrayDecls.size === 0) return findings;

    // Find DO loops and check array accesses
    const risks: Array<{ array: string; loopVar: string; loopBound: string; arrayBound: number; line: number }> = [];

    for (let i = 0; i < lines.length; i++) {
      if (isFortranComment(lines[i])) continue;
      const lineUpper = lines[i].toUpperCase();

      // DO label var = start, end
      const doMatch = /\bDO\s+(?:\d+\s+)?(\w+)\s*=\s*\d+\s*,\s*(\w+|\d+)/.exec(lineUpper);
      if (doMatch) {
        const loopVar = doMatch[1];
        const endBound = doMatch[2];
        const endNum = parseInt(endBound, 10);

        // Scan next ~50 lines for array accesses using this loop variable
        for (let j = i + 1; j < Math.min(i + 50, lines.length); j++) {
          if (isFortranComment(lines[j])) continue;
          const accessLine = lines[j].toUpperCase();
          // Check for ARRAY(loopVar) patterns
          for (const [arrName, dims] of arrayDecls) {
            const accessPattern = new RegExp(`\\b${arrName}\\s*\\(\\s*${loopVar}\\b`);
            if (accessPattern.test(accessLine) && dims[0] > 0 && !isNaN(endNum)) {
              if (endNum > dims[0]) {
                risks.push({
                  array: arrName,
                  loopVar,
                  loopBound: endBound,
                  arrayBound: dims[0],
                  line: j + 1,
                });
              }
            }
          }
          // Stop at END DO or next DO
          if (/\bEND\s*DO\b/.test(accessLine) || /\bENDDO\b/.test(accessLine)) break;
        }
      }
    }

    if (risks.length > 0) {
      const details = risks.slice(0, 5).map((r) =>
        `${r.array}(${r.loopVar}) at line ${r.line}: loop goes to ${r.loopBound} but array dimension is ${r.arrayBound}`
      ).join("; ");

      findings.push({
        id: findingId("security", "array-bounds-risk", ctx.filePath),
        category: "security",
        severity: "critical",
        title: `${risks.length} potential array bounds violation${risks.length > 1 ? "s" : ""}`,
        description: `Loop index variables may exceed array dimensions: ${details}. In Fortran, array bounds violations cause silent memory corruption — they do NOT raise exceptions unless bounds checking is enabled at compile time. This is equivalent to a buffer overflow in C.`,
        filePath: ctx.filePath,
        suggestion: "Add compile-time bounds checking (-fbounds-check for gfortran, -check bounds for ifort). Consider using allocatable arrays with bounds checking. Verify loop bounds match array dimensions.",
        effort: "medium",
        tags: ["fortran", "array-bounds", "buffer-overflow", "security", "semantic"],
        cweId: "CWE-120",
      });
    }

    return findings;
  },
};

export const numericalStabilityRule: ReviewRule = {
  id: "numerical-stability",
  name: "Numerical Stability",
  category: "reliability",
  severity: "high",
  languages: ["fortran"],
  description: "Detect floating-point comparison, catastrophic cancellation, and division-by-zero risk.",
  check(ctx) {
    const findings: ReviewFinding[] = [];
    const lines = ctx.content.split("\n");
    const issues: Array<{ kind: string; line: number; detail: string }> = [];

    for (let i = 0; i < lines.length; i++) {
      if (isFortranComment(lines[i])) continue;
      const upper = lines[i].toUpperCase();

      // Float comparison with .EQ. or .NE.
      if (/\.\s*EQ\s*\./.test(upper) || /\.\s*NE\s*\./.test(upper)) {
        // Check if it's comparing real variables (not integers)
        const isLikelyFloat = /(?:REAL|DOUBLE|FLOAT|[A-HO-Z]\w*)\s*\.\s*(?:EQ|NE)\s*\./.test(upper) ||
                              /\.\s*(?:EQ|NE)\s*\.\s*(?:REAL|DOUBLE|FLOAT|[A-HO-Z]\w*)/.test(upper) ||
                              /\d+\.\d+\s*\.\s*(?:EQ|NE)\s*\./.test(upper);
        // Also trigger if no integer indicators
        const hasIntegerHint = /\b(?:INT|IFIX|NINT|MOD|[I-N]\w*)\s*\.\s*(?:EQ|NE)/.test(upper);
        if (!hasIntegerHint) {
          issues.push({
            kind: "float-comparison",
            line: i + 1,
            detail: "Exact floating-point comparison (.EQ./.NE.) — use tolerance: ABS(A-B) .LT. EPSILON",
          });
        }
      }

      // Division where divisor could be zero — simple heuristic: division in computation
      if (/\/\s*[A-Z]\w*\b/.test(upper) && !/^\s*[Cc*!]/.test(lines[i])) {
        // Check if there's a zero-guard nearby (within 5 lines above)
        let hasGuard = false;
        for (let j = Math.max(0, i - 5); j < i; j++) {
          const guardLine = lines[j].toUpperCase();
          if (/\.NE\.\s*0|\.GT\.\s*0|\.LT\.\s*0|\.NE\.\s*0\.0|IF\s*\(.*0/.test(guardLine)) {
            hasGuard = true;
            break;
          }
        }
        if (!hasGuard) {
          issues.push({
            kind: "division-risk",
            line: i + 1,
            detail: "Division by variable without visible zero-guard — potential division by zero",
          });
        }
      }
    }

    // Group by kind
    const floatComparisons = issues.filter((i) => i.kind === "float-comparison");
    const divisionRisks = issues.filter((i) => i.kind === "division-risk");

    if (floatComparisons.length > 0) {
      findings.push({
        id: findingId("reliability", "numerical-stability-float", ctx.filePath),
        category: "reliability",
        severity: floatComparisons.length > 3 ? "critical" : "high",
        title: `${floatComparisons.length} exact floating-point comparison${floatComparisons.length > 1 ? "s" : ""}`,
        description: `This file compares floating-point numbers using .EQ./.NE. at line${floatComparisons.length > 1 ? "s" : ""} ${floatComparisons.slice(0, 5).map((i) => i.line).join(", ")}. Due to IEEE 754 rounding, 0.1 + 0.2 ≠ 0.3 in floating-point arithmetic. These comparisons will produce wrong results for non-integer values.`,
        filePath: ctx.filePath,
        suggestion: "Replace exact comparison:\n  ! Instead of: IF (A .EQ. B) THEN\n  ! Use:        IF (ABS(A - B) .LT. 1.0D-12) THEN\nUse a relative tolerance for large values: ABS(A-B)/MAX(ABS(A),ABS(B),1.0D-30) .LT. TOL",
        effort: "small",
        tags: ["fortran", "numerical-stability", "floating-point", "semantic"],
      });
    }

    if (divisionRisks.length > 2) {
      findings.push({
        id: findingId("reliability", "numerical-stability-div", ctx.filePath),
        category: "reliability",
        severity: "medium",
        title: `${divisionRisks.length} unguarded division${divisionRisks.length > 1 ? "s" : ""} detected`,
        description: `${divisionRisks.length} division operations without visible zero-checks at lines ${divisionRisks.slice(0, 5).map((i) => i.line).join(", ")}. Division by zero in Fortran produces Inf or NaN, which propagate silently through computations and produce meaningless results.`,
        filePath: ctx.filePath,
        suggestion: "Add zero-guards before division:\n  IF (DENOM .NE. 0.0D0) THEN\n    RESULT = NUMER / DENOM\n  ELSE\n    ! Handle error\n  END IF",
        effort: "medium",
        tags: ["fortran", "numerical-stability", "division-by-zero", "semantic"],
      });
    }

    return findings;
  },
};

export const commonBlockConflictRule: ReviewRule = {
  id: "common-block-conflict",
  name: "COMMON Block Layout Conflict Risk",
  category: "security",
  severity: "critical",
  languages: ["fortran"],
  description: "Same COMMON block name with potentially different variable layouts across compilation units.",
  check(ctx) {
    const findings: ReviewFinding[] = [];
    const lines = ctx.content.split("\n");

    // Parse all COMMON block declarations in this file
    const commonBlocks = new Map<string, Array<{ vars: string; line: number }>>();

    for (let i = 0; i < lines.length; i++) {
      if (isFortranComment(lines[i])) continue;
      const upper = lines[i].toUpperCase();
      const match = /\bCOMMON\s*\/\s*(\w+)\s*\/\s*(.+)/i.exec(upper);
      if (match) {
        const blockName = match[1].trim();
        const vars = match[2].trim().replace(/\s+/g, " ");
        const entries = commonBlocks.get(blockName) ?? [];
        entries.push({ vars, line: i + 1 });
        commonBlocks.set(blockName, entries);
      }
    }

    // Check for same block name with different layouts within the same file
    for (const [blockName, entries] of commonBlocks) {
      if (entries.length > 1) {
        const uniqueLayouts = new Set(entries.map((e) => e.vars));
        if (uniqueLayouts.size > 1) {
          findings.push({
            id: findingId("security", "common-block-conflict", ctx.filePath, blockName),
            category: "security",
            severity: "critical",
            title: `COMMON block /${blockName}/ has ${uniqueLayouts.size} different layouts`,
            description: `The COMMON block /${blockName}/ is declared ${entries.length} times in this file with different variable layouts (lines ${entries.map((e) => e.line).join(", ")}). When COMMON blocks have mismatched layouts across compilation units, variables silently alias different memory offsets — this causes SILENT MEMORY CORRUPTION. The compiler CANNOT detect this.`,
            filePath: ctx.filePath,
            lineRange: [entries[0].line, entries[entries.length - 1].line],
            suggestion: `Replace COMMON /${blockName}/ with a MODULE:\n\n  MODULE ${blockName}_data\n    IMPLICIT NONE\n    ! Declare all shared variables here\n  END MODULE\n\nThen USE ${blockName}_data in each subroutine. The compiler will enforce consistent types and layouts.`,
            effort: "large",
            tags: ["fortran", "common-block", "memory-corruption", "critical", "semantic"],
            cweId: "CWE-843",
          });
        }
      }
    }

    return findings;
  },
};

export const fortranModernizationMapRule: ReviewRule = {
  id: "fortran-modernization-map",
  name: "Fortran Modernization Map",
  category: "modernization",
  severity: "medium",
  languages: ["fortran"],
  description: "For each obsolete construct, provides SPECIFIC modern equivalent with code examples.",
  check(ctx) {
    const findings: ReviewFinding[] = [];
    const lines = ctx.content.split("\n");
    const upper = ctx.content.toUpperCase();

    interface ModernMapping {
      pattern: RegExp;
      kind: string;
      oldExample: string;
      newExample: string;
      effort: "trivial" | "small" | "medium" | "large" | "epic";
    }

    const mappings: ModernMapping[] = [
      {
        pattern: /\bGO\s*TO\s+\d+/i,
        kind: "GOTO",
        oldExample: "GO TO 100",
        newExample: "! Replace with structured control flow:\n  IF (condition) THEN\n    ! code for label 100\n  END IF\n  ! Or for loop exits: EXIT / CYCLE",
        effort: "medium",
      },
      {
        pattern: /\bCOMMON\s*\/\s*(\w+)\s*\//i,
        kind: "COMMON block",
        oldExample: "COMMON /MYDATA/ X, Y, Z",
        newExample: "MODULE mydata_mod\n  IMPLICIT NONE\n  REAL :: X, Y, Z\nEND MODULE mydata_mod\n! Then in each subroutine:\n  USE mydata_mod, ONLY: X, Y, Z",
        effort: "large",
      },
      {
        pattern: /\bEQUIVALENCE\s*\(/i,
        kind: "EQUIVALENCE",
        oldExample: "EQUIVALENCE (A, B)",
        newExample: "! If type punning: B = TRANSFER(A, B)\n! If memory saving: use separate variables (memory is cheap now)\n! If union-like: use a derived type with SELECT TYPE",
        effort: "medium",
      },
      {
        pattern: /\bIF\s*\([^)]+\)\s*\d+\s*,\s*\d+\s*,\s*\d+/i,
        kind: "Arithmetic IF",
        oldExample: "IF (X) 10, 20, 30",
        newExample: "IF (X < 0) THEN\n  ! code for label 10\nELSE IF (X == 0) THEN\n  ! code for label 20\nELSE\n  ! code for label 30\nEND IF",
        effort: "small",
      },
      {
        pattern: /\bGO\s*TO\s*\([^)]+\)/i,
        kind: "Computed GOTO",
        oldExample: "GO TO (10, 20, 30), I",
        newExample: "SELECT CASE (I)\n  CASE (1)\n    ! code for label 10\n  CASE (2)\n    ! code for label 20\n  CASE (3)\n    ! code for label 30\nEND SELECT",
        effort: "small",
      },
      {
        pattern: /\bDATA\s+\w+/i,
        kind: "DATA statement",
        oldExample: "DATA X /3.14/, Y /2.71/",
        newExample: "! Use PARAMETER for constants:\n  REAL, PARAMETER :: X = 3.14, Y = 2.71\n! Or module-level initialization:\n  REAL :: X = 3.14, Y = 2.71",
        effort: "trivial",
      },
      {
        pattern: /\bDIMENSION\s+\w+\(\d+\)/i,
        kind: "Fixed-size DIMENSION",
        oldExample: "DIMENSION A(100)",
        newExample: "! Modern allocatable array:\n  REAL, ALLOCATABLE :: A(:)\n  ALLOCATE(A(n))  ! n determined at runtime\n  ! ... use A ...\n  DEALLOCATE(A)",
        effort: "medium",
      },
    ];

    const found: Array<{ kind: string; oldExample: string; newExample: string; count: number; effort: ModernMapping["effort"] }> = [];

    for (const mapping of mappings) {
      const matches = upper.match(new RegExp(mapping.pattern.source, "gi"));
      if (matches && matches.length > 0) {
        found.push({
          kind: mapping.kind,
          oldExample: mapping.oldExample,
          newExample: mapping.newExample,
          count: matches.length,
          effort: mapping.effort,
        });
      }
    }

    if (found.length > 0) {
      const totalCount = found.reduce((sum, f) => sum + f.count, 0);
      const suggestionParts = found.map(
        (f) => `--- ${f.kind} (${f.count}x) ---\nOld: ${f.oldExample}\nNew:\n${f.newExample}`
      );

      findings.push({
        id: findingId("modernization", "fortran-modernization-map", ctx.filePath),
        category: "modernization",
        severity: totalCount > 20 ? "high" : "medium",
        title: `${totalCount} modernizable constructs across ${found.length} categories`,
        description: `This file contains ${found.length} categories of obsolete Fortran constructs (${found.map((f) => `${f.count} ${f.kind}`).join(", ")}). Each has a direct modern Fortran equivalent that improves safety, readability, and tooling support.`,
        filePath: ctx.filePath,
        suggestion: `Modernization guide with code examples:\n\n${suggestionParts.join("\n\n")}`,
        effort: totalCount > 20 ? "epic" : "large",
        tags: ["fortran", "modernization", "migration-map", "semantic"],
        references: ["https://fortranwiki.org/fortran/show/Modernizing+Old+Fortran"],
      });
    }

    return findings;
  },
};

export const migrationReadinessRule: ReviewRule = {
  id: "migration-readiness",
  name: "Migration Readiness Score",
  category: "modernization",
  severity: "info",
  languages: ["fortran"],
  description: "Scores each subroutine's readiness for migration on a 1-5 scale with migration path.",
  check(ctx) {
    const findings: ReviewFinding[] = [];
    const upper = ctx.content.toUpperCase();

    for (const fn of ctx.structural.functions) {
      const bodyLines = ctx.content.split("\n").slice(fn.lineRange[0] - 1, fn.lineRange[1]);
      const body = bodyLines.join("\n").toUpperCase();

      let score = 2.0; // Base: moderate difficulty

      // Difficulty factors
      const commonCount = (body.match(/\bCOMMON\s*\//g) || []).length;
      score += commonCount * 0.5;

      const gotoCount = (body.match(/\bGO\s*TO\b/g) || []).length;
      score += gotoCount * 0.1;

      if (/\bEQUIVALENCE\s*\(/.test(body)) score += 1.0;
      if (/\bENTRY\s+\w+/.test(body)) score += 1.5;

      const computedGotoCount = (body.match(/\bGO\s*TO\s*\(/g) || []).length;
      score += computedGotoCount * 0.5;

      if (/\d+H[A-Z\s]/i.test(body)) score += 0.5; // Hollerith

      const systemCalls = (body.match(/\b(LSHIFT|RSHIFT|LOC|CRAY|IBITS|ISHFT)\b/g) || []).length;
      score += systemCalls * 0.5;

      // Ease factors
      const hasNoCommon = commonCount === 0;
      const hasNoGoto = gotoCount === 0;
      const hasCleanParams = fn.params.length > 0 && fn.params.length <= 6;
      if (hasNoCommon && hasNoGoto && hasCleanParams) score -= 1.0;

      // Clamp to 1-5
      const finalScore = Math.max(1, Math.min(5, Math.round(score))) as 1 | 2 | 3 | 4 | 5;

      const labels: Record<number, string> = {
        1: "Easy — pure computation, clean interfaces",
        2: "Moderate — some legacy patterns but manageable",
        3: "Hard — COMMON blocks, GOTOs, but self-contained",
        4: "Very Hard — deep interdependencies, system-specific calls",
        5: "Requires Rewrite — ENTRY points, computed GOTOs, non-standard extensions",
      };

      const targets: Record<number, string> = {
        1: "Modern Fortran (F2018) or Python+NumPy — straightforward port",
        2: "Modern Fortran (F2018) recommended — keep performance, add safety",
        3: "Modern Fortran first, then consider Python/C++ wrapper",
        4: "Modern Fortran with significant refactoring — plan 2-3 sprints",
        5: "Full rewrite needed — consider C++/Rust for safety-critical, Python for prototyping",
      };

      findings.push({
        id: findingId("modernization", "migration-readiness", ctx.filePath, fn.name),
        category: "modernization",
        severity: finalScore >= 4 ? "high" : finalScore >= 3 ? "medium" : "info",
        title: `'${fn.name}' migration readiness: ${finalScore}/5 — ${labels[finalScore].split(" — ")[0]}`,
        description: `${labels[finalScore]}. Score factors: ${commonCount} COMMON blocks, ${gotoCount} GOTOs, ${computedGotoCount} computed GOTOs, ${fn.params.length} parameters.`,
        filePath: ctx.filePath,
        lineRange: fn.lineRange,
        suggestion: targets[finalScore],
        effort: finalScore >= 4 ? "epic" : finalScore >= 3 ? "large" : "medium",
        tags: ["fortran", "migration-readiness", "modernization", "semantic"],
      });
    }

    return findings;
  },
};

// ============================================================================
// D. JS/TS DEEP RULES
// ============================================================================

export const promiseLeakRule: ReviewRule = {
  id: "promise-leak",
  name: "Floating Promise",
  category: "reliability",
  severity: "high",
  languages: ["javascript", "typescript", "jsx", "tsx"],
  description: "Promises created but never awaited or caught — floating promises that swallow errors.",
  check(ctx) {
    const findings: ReviewFinding[] = [];
    const lines = ctx.content.split("\n");
    const floatingLines: number[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      // Pattern: function call that returns a promise but is not awaited, assigned, or returned
      // Heuristic: line starts with a function call (not assigned, not returned, not awaited)
      if (
        /^[a-zA-Z_$][\w$.]*\s*\(/.test(line) &&
        !line.startsWith("return ") &&
        !line.startsWith("await ") &&
        !line.startsWith("const ") &&
        !line.startsWith("let ") &&
        !line.startsWith("var ") &&
        !line.startsWith("if ") &&
        !line.startsWith("for ") &&
        !line.startsWith("while ") &&
        !line.includes("=") &&
        !line.startsWith("//") &&
        !line.startsWith("*") &&
        !line.startsWith("function ") &&
        !line.startsWith("class ") &&
        !line.startsWith("export ") &&
        !line.startsWith("import ")
      ) {
        // Check if it's likely async — calling .then(), or function name suggests async
        const isLikelyAsync =
          /\.then\s*\(/.test(line) ||
          /fetch\s*\(/.test(line) ||
          /Promise\./.test(line) ||
          /async/.test(lines.slice(Math.max(0, i - 5), i).join("\n"));

        if (isLikelyAsync) {
          floatingLines.push(i + 1);
        }
      }
    }

    if (floatingLines.length > 0) {
      findings.push({
        id: findingId("reliability", "promise-leak", ctx.filePath),
        category: "reliability",
        severity: floatingLines.length > 3 ? "critical" : "high",
        title: `${floatingLines.length} floating promise${floatingLines.length > 1 ? "s" : ""} detected`,
        description: `Promise${floatingLines.length > 1 ? "s" : ""} created but never awaited or caught at line${floatingLines.length > 1 ? "s" : ""} ${floatingLines.slice(0, 5).join(", ")}. Errors from these promises are silently swallowed — they will never be caught, logged, or handled.`,
        filePath: ctx.filePath,
        suggestion: "Either await the promise, chain .catch(), or explicitly void it with void promise.then(...) if intentionally fire-and-forget.",
        effort: "small",
        tags: ["promise", "async", "error-handling", "semantic"],
      });
    }

    return findings;
  },
};

export const reactRerenderRiskRule: ReviewRule = {
  id: "react-rerender-risk",
  name: "React Re-render Risk",
  category: "performance",
  severity: "medium",
  languages: ["jsx", "tsx"],
  description: "Components creating new object/array/function references on every render — missing useMemo/useCallback.",
  check(ctx) {
    const findings: ReviewFinding[] = [];
    const lines = ctx.content.split("\n");
    const risks: Array<{ kind: string; line: number }> = [];

    // Check for inline object/array creation in JSX props
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Style={{ }} — inline object in JSX
      if (/\w+=\{\{/.test(line) && !line.trim().startsWith("//")) {
        risks.push({ kind: "inline object prop", line: i + 1 });
      }
      // onClick={() => } — inline arrow function in JSX
      if (/\w+=\{\s*\(\s*\)\s*=>/.test(line) || /\w+=\{\s*\([^)]*\)\s*=>/.test(line)) {
        risks.push({ kind: "inline arrow function prop", line: i + 1 });
      }
      // prop={[...]} — inline array
      if (/\w+=\{\[/.test(line)) {
        risks.push({ kind: "inline array prop", line: i + 1 });
      }
    }

    if (risks.length > 2) {
      findings.push({
        id: findingId("performance", "react-rerender-risk", ctx.filePath),
        category: "performance",
        severity: risks.length > 5 ? "high" : "medium",
        title: `${risks.length} inline reference creation${risks.length > 1 ? "s" : ""} in JSX — re-render risk`,
        description: `This component creates new object/array/function references on every render at lines ${risks.slice(0, 5).map((r) => r.line).join(", ")}. Each creates a new reference, causing child components to re-render unnecessarily even with React.memo.`,
        filePath: ctx.filePath,
        suggestion: "Use useMemo for objects/arrays and useCallback for functions:\n  const style = useMemo(() => ({ color: 'red' }), []);\n  const handleClick = useCallback(() => { ... }, [deps]);",
        effort: "small",
        tags: ["react", "performance", "rerender", "semantic"],
      });
    }

    return findings;
  },
};

export const typeAssertionAbuseRule: ReviewRule = {
  id: "type-assertion-abuse",
  name: "Type Assertion Abuse",
  category: "quality",
  severity: "medium",
  languages: ["typescript", "tsx"],
  description: "TypeScript 'as' type assertions that bypass type safety.",
  check(ctx) {
    const findings: ReviewFinding[] = [];
    const lines = ctx.content.split("\n");
    let assertionCount = 0;
    const assertionLines: number[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.trim().startsWith("//") || line.trim().startsWith("*")) continue;
      // Match 'as Type' but not 'as const', import aliases, etc.
      const asMatches = line.match(/\bas\s+(?!const\b)[A-Z][\w<>,\s|&[\]]*(?=[;,)\]\s}])/g);
      if (asMatches) {
        assertionCount += asMatches.length;
        assertionLines.push(i + 1);
      }
    }

    if (assertionCount > 3) {
      findings.push({
        id: findingId("quality", "type-assertion-abuse", ctx.filePath),
        category: "quality",
        severity: assertionCount > 10 ? "high" : "medium",
        title: `${assertionCount} type assertion${assertionCount > 1 ? "s" : ""} — type safety bypass`,
        description: `This file uses ${assertionCount} 'as Type' assertions at lines ${assertionLines.slice(0, 5).join(", ")}. Type assertions tell the compiler "trust me, I know better" — but they bypass all type checking. If the assertion is wrong, you get runtime errors that TypeScript was supposed to prevent.`,
        filePath: ctx.filePath,
        suggestion: "Replace type assertions with type guards (if/typeof/instanceof), generic type parameters, or proper type narrowing. Use 'satisfies' operator when you want to validate a type without widening.",
        effort: "medium",
        tags: ["typescript", "type-assertion", "type-safety", "semantic"],
      });
    }

    return findings;
  },
};

export const apiErrorContractRule: ReviewRule = {
  id: "api-error-contract",
  name: "API Error Contract",
  category: "reliability",
  severity: "medium",
  languages: ["javascript", "typescript", "jsx", "tsx"],
  description: "API route handlers that lack input validation or consistent error format.",
  check(ctx) {
    const findings: ReviewFinding[] = [];

    // Detect API route handlers
    const isApiRoute =
      /\bexport\s+(?:default\s+)?(?:async\s+)?function\s+(?:GET|POST|PUT|DELETE|PATCH|handler)\b/.test(ctx.content) ||
      /\brouter\.(get|post|put|delete|patch)\s*\(/.test(ctx.content) ||
      /\bapp\.(get|post|put|delete|patch)\s*\(/.test(ctx.content);

    if (!isApiRoute) return findings;

    const issues: string[] = [];

    // Check for input validation
    const hasValidation =
      /\b(z\.object|yup\.object|joi\.object|validate|schema\.parse|schema\.safeParse)\b/.test(ctx.content) ||
      /\brequest\.body\b.*\bif\s*\(/.test(ctx.content);
    if (!hasValidation) {
      issues.push("No input validation detected (consider zod, yup, or joi)");
    }

    // Check for consistent error responses
    const hasTryCatch = /\btry\s*\{/.test(ctx.content);
    const hasErrorResponse = /\bstatus\s*\(\s*[45]\d\d\s*\)/.test(ctx.content) ||
                             /\bNextResponse\.json\s*\([^)]*\bstatus\s*:\s*[45]\d\d/.test(ctx.content);
    if (!hasTryCatch || !hasErrorResponse) {
      issues.push("Missing try/catch or error status codes (400/500)");
    }

    if (issues.length > 0) {
      findings.push({
        id: findingId("reliability", "api-error-contract", ctx.filePath),
        category: "reliability",
        severity: issues.length > 1 ? "high" : "medium",
        title: `API handler missing ${issues.length} error contract element${issues.length > 1 ? "s" : ""}`,
        description: `This API route handler has gaps in its error contract: ${issues.join("; ")}. Without input validation, attackers can send malformed data. Without consistent error responses, clients cannot handle failures gracefully.`,
        filePath: ctx.filePath,
        suggestion: "Add:\n1. Input validation with schema library (zod recommended)\n2. try/catch around all logic\n3. Consistent error response format: { error: string, code: number }",
        effort: "medium",
        tags: ["api", "error-handling", "validation", "semantic"],
      });
    }

    return findings;
  },
};

// ============================================================================
// EXPORTS
// ============================================================================

export function createSemanticRules(): ReviewRule[] {
  return [
    // Data flow
    deadCodeCallGraphRule,
    unusedParametersRule,
    shadowedVariablesRule,
    // Control flow
    gotoChainAnalysisRule,
    cyclomaticComplexityRule,
    nestingDepthAnalysisRule,
    // Fortran deep
    arrayBoundsRiskRule,
    numericalStabilityRule,
    commonBlockConflictRule,
    fortranModernizationMapRule,
    migrationReadinessRule,
    // JS/TS deep
    promiseLeakRule,
    reactRerenderRiskRule,
    typeAssertionAbuseRule,
    apiErrorContractRule,
  ];
}
