import { describe, it, expect, beforeAll } from "vitest";
import {
  RulesEngine,
  createDefaultRulesEngine,
  type AnalysisContext,
  largeFileRule,
  longFunctionRule,
  tooManyParamsRule,
  deeplyNestedRule,
  godClassRule,
  highCouplingRule,
  gotoSpaghettiRule,
  commonBlockAbuseRule,
  implicitTypingRule,
  equivalenceAliasingRule,
  fixedFormatLineLengthRule,
  obsoleteConstructsRule,
  anyTypeAbuseRule,
  consoleLogLeftRule,
  callbackHellRule,
  unsafeRegexRule,
} from "../rules-engine.js";
import { ReportGenerator } from "../report-generator.js";
import type { StructuralAnalysis, CallGraphEntry } from "../../types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCtx(overrides: Partial<AnalysisContext>): AnalysisContext {
  return {
    filePath: overrides.filePath ?? "test.ts",
    content: overrides.content ?? "",
    language: overrides.language ?? "typescript",
    structural: overrides.structural ?? { functions: [], classes: [], imports: [], exports: [] },
    callGraph: overrides.callGraph ?? [],
    allFilePaths: overrides.allFilePaths,
    importGraph: overrides.importGraph,
  };
}

function lines(n: number): string {
  return Array.from({ length: n }, (_, i) => `// line ${i + 1}`).join("\n");
}

// ---------------------------------------------------------------------------
// Universal Rules
// ---------------------------------------------------------------------------

describe("Universal Rules", () => {
  describe("large-file", () => {
    it("flags files over 500 lines as medium", () => {
      const ctx = makeCtx({ content: lines(600) });
      const findings = largeFileRule.check(ctx);
      expect(findings).toHaveLength(1);
      expect(findings[0].severity).toBe("medium");
    });

    it("flags files over 1000 lines as high", () => {
      const ctx = makeCtx({ content: lines(1100) });
      const findings = largeFileRule.check(ctx);
      expect(findings).toHaveLength(1);
      expect(findings[0].severity).toBe("high");
    });

    it("does not flag files under 500 lines", () => {
      const ctx = makeCtx({ content: lines(300) });
      const findings = largeFileRule.check(ctx);
      expect(findings).toHaveLength(0);
    });
  });

  describe("long-function", () => {
    it("flags functions over 50 lines as medium", () => {
      const ctx = makeCtx({
        structural: {
          functions: [{ name: "bigFn", lineRange: [1, 60], params: [] }],
          classes: [],
          imports: [],
          exports: [],
        },
      });
      const findings = longFunctionRule.check(ctx);
      expect(findings).toHaveLength(1);
      expect(findings[0].severity).toBe("medium");
    });

    it("flags functions over 100 lines as high", () => {
      const ctx = makeCtx({
        structural: {
          functions: [{ name: "hugeFn", lineRange: [1, 120], params: [] }],
          classes: [],
          imports: [],
          exports: [],
        },
      });
      const findings = longFunctionRule.check(ctx);
      expect(findings).toHaveLength(1);
      expect(findings[0].severity).toBe("high");
    });

    it("flags functions over 200 lines as critical", () => {
      const ctx = makeCtx({
        structural: {
          functions: [{ name: "monsterFn", lineRange: [1, 250], params: [] }],
          classes: [],
          imports: [],
          exports: [],
        },
      });
      const findings = longFunctionRule.check(ctx);
      expect(findings).toHaveLength(1);
      expect(findings[0].severity).toBe("critical");
    });
  });

  describe("too-many-params", () => {
    it("flags functions with >5 params as medium", () => {
      const ctx = makeCtx({
        structural: {
          functions: [{
            name: "manyArgs",
            lineRange: [1, 10],
            params: ["a", "b", "c", "d", "e", "f"],
          }],
          classes: [],
          imports: [],
          exports: [],
        },
      });
      const findings = tooManyParamsRule.check(ctx);
      expect(findings).toHaveLength(1);
      expect(findings[0].severity).toBe("medium");
    });

    it("flags functions with >8 params as high", () => {
      const ctx = makeCtx({
        structural: {
          functions: [{
            name: "tooManyArgs",
            lineRange: [1, 10],
            params: ["a", "b", "c", "d", "e", "f", "g", "h", "i"],
          }],
          classes: [],
          imports: [],
          exports: [],
        },
      });
      const findings = tooManyParamsRule.check(ctx);
      expect(findings).toHaveLength(1);
      expect(findings[0].severity).toBe("high");
    });
  });

  describe("god-class", () => {
    it("flags classes with >15 methods", () => {
      const methods = Array.from({ length: 18 }, (_, i) => `method${i}`);
      const ctx = makeCtx({
        structural: {
          functions: [],
          classes: [{
            name: "GodClass",
            lineRange: [1, 500],
            methods,
            properties: [],
          }],
          imports: [],
          exports: [],
        },
      });
      const findings = godClassRule.check(ctx);
      expect(findings).toHaveLength(1);
      expect(findings[0].title).toContain("God class");
    });

    it("flags classes with >20 properties", () => {
      const properties = Array.from({ length: 22 }, (_, i) => `prop${i}`);
      const ctx = makeCtx({
        structural: {
          functions: [],
          classes: [{
            name: "DataDump",
            lineRange: [1, 100],
            methods: [],
            properties,
          }],
          imports: [],
          exports: [],
        },
      });
      const findings = godClassRule.check(ctx);
      expect(findings).toHaveLength(1);
    });
  });

  describe("high-coupling", () => {
    it("flags files with >10 unique imports", () => {
      const imports = Array.from({ length: 12 }, (_, i) => ({
        source: `module${i}`,
        specifiers: ["foo"],
        lineNumber: i + 1,
      }));
      const ctx = makeCtx({
        structural: { functions: [], classes: [], imports, exports: [] },
      });
      const findings = highCouplingRule.check(ctx);
      expect(findings).toHaveLength(1);
      expect(findings[0].title).toContain("12 imports");
    });
  });

  describe("deeply-nested", () => {
    it("flags code nested >4 levels", () => {
      const content = `
function foo() {
  if (a) {
    if (b) {
      if (c) {
        if (d) {
          if (e) {
            console.log("deep");
          }
        }
      }
    }
  }
}`;
      const ctx = makeCtx({ content });
      const findings = deeplyNestedRule.check(ctx);
      expect(findings.length).toBeGreaterThanOrEqual(1);
    });
  });
});

// ---------------------------------------------------------------------------
// Fortran-Specific Rules
// ---------------------------------------------------------------------------

describe("Fortran-Specific Rules", () => {
  const FORTRAN_GOTO_CODE = `      SUBROUTINE MESSY(N)
C     A SUBROUTINE WITH LOTS OF GOTOS
      INTEGER N
      GO TO 10
   10 CONTINUE
      GO TO (20, 30, 40), N
   20 CONTINUE
      GO TO 30
   30 CONTINUE
      GO TO 40
   40 CONTINUE
      RETURN
      END`;

  describe("goto-spaghetti", () => {
    it("detects GOTO statements including computed GOTOs", () => {
      const ctx = makeCtx({
        filePath: "messy.f",
        content: FORTRAN_GOTO_CODE,
        language: "fortran",
      });
      const findings = gotoSpaghettiRule.check(ctx);
      expect(findings).toHaveLength(1);
      expect(findings[0].title).toContain("GOTO");
      expect(findings[0].description).toContain("computed");
      expect(findings[0].tags).toContain("goto-spaghetti");
    });
  });

  const FORTRAN_COMMON_ABUSE = `      SUBROUTINE BLOATED
      COMMON /BLK1/ A, B, C
      COMMON /BLK2/ D, E, F
      COMMON /BLK3/ G, H, I
      COMMON /BLK4/ J, K, L
      COMMON /BLK5/ M, N, O
      COMMON /BLK6/ P, Q, R
      RETURN
      END`;

  describe("common-block-abuse", () => {
    it("detects subroutines using >5 COMMON blocks", () => {
      const structural: StructuralAnalysis = {
        functions: [],
        classes: [],
        imports: [
          { source: "COMMON/BLK1", specifiers: ["A", "B", "C"], lineNumber: 2 },
          { source: "COMMON/BLK2", specifiers: ["D", "E", "F"], lineNumber: 3 },
          { source: "COMMON/BLK3", specifiers: ["G", "H", "I"], lineNumber: 4 },
          { source: "COMMON/BLK4", specifiers: ["J", "K", "L"], lineNumber: 5 },
          { source: "COMMON/BLK5", specifiers: ["M", "N", "O"], lineNumber: 6 },
          { source: "COMMON/BLK6", specifiers: ["P", "Q", "R"], lineNumber: 7 },
        ],
        exports: [],
      };
      const ctx = makeCtx({
        filePath: "bloated.f",
        content: FORTRAN_COMMON_ABUSE,
        language: "fortran",
        structural,
      });
      const findings = commonBlockAbuseRule.check(ctx);
      expect(findings).toHaveLength(1);
      expect(findings[0].title).toContain("6 blocks");
    });
  });

  describe("implicit-typing", () => {
    it("flags files without IMPLICIT NONE", () => {
      const code = `      SUBROUTINE OLDSTYLE(X)
      REAL X
      Y = X * 2.0
      RETURN
      END`;
      const ctx = makeCtx({
        filePath: "old.f",
        content: code,
        language: "fortran",
      });
      const findings = implicitTypingRule.check(ctx);
      expect(findings).toHaveLength(1);
      expect(findings[0].title).toBe("Missing IMPLICIT NONE");
      expect(findings[0].cweId).toBe("CWE-456");
    });

    it("does not flag files with IMPLICIT NONE", () => {
      const code = `      SUBROUTINE MODERN(X)
      IMPLICIT NONE
      REAL :: X
      X = X * 2.0
      RETURN
      END`;
      const ctx = makeCtx({
        filePath: "modern.f90",
        content: code,
        language: "fortran",
      });
      const findings = implicitTypingRule.check(ctx);
      expect(findings).toHaveLength(0);
    });
  });

  describe("equivalence-aliasing", () => {
    it("flags EQUIVALENCE statements", () => {
      const structural: StructuralAnalysis = {
        functions: [],
        classes: [],
        imports: [
          { source: "EQUIVALENCE", specifiers: ["ALIASING_WARNING"], lineNumber: 3 },
        ],
        exports: [],
      };
      const ctx = makeCtx({
        filePath: "alias.f",
        content: "      EQUIVALENCE (A, B)\n",
        language: "fortran",
        structural,
      });
      const findings = equivalenceAliasingRule.check(ctx);
      expect(findings).toHaveLength(1);
      expect(findings[0].cweId).toBe("CWE-843");
    });
  });

  describe("fixed-format-line-length", () => {
    it("flags lines exceeding column 72 in .f files", () => {
      const longLine = "      X = " + "A".repeat(80); // >72 columns
      const code = `${longLine}\n      Y = 1\n`;
      const ctx = makeCtx({
        filePath: "legacy.f",
        content: code,
        language: "fortran",
      });
      const findings = fixedFormatLineLengthRule.check(ctx);
      expect(findings).toHaveLength(1);
      expect(findings[0].title).toContain("exceed column 72");
    });
  });

  describe("obsolete-constructs", () => {
    it("detects Arithmetic IF", () => {
      const code = `      SUBROUTINE TEST(X)
      IF (X) 10, 20, 30
   10 CONTINUE
   20 CONTINUE
   30 CONTINUE
      RETURN
      END`;
      const ctx = makeCtx({
        filePath: "obsolete.f",
        content: code,
        language: "fortran",
      });
      const findings = obsoleteConstructsRule.check(ctx);
      expect(findings).toHaveLength(1);
      expect(findings[0].description).toContain("Arithmetic IF");
    });

    it("detects PAUSE statement", () => {
      const code = `      SUBROUTINE WAITER
      PAUSE
      RETURN
      END`;
      const ctx = makeCtx({
        filePath: "waiter.f",
        content: code,
        language: "fortran",
      });
      const findings = obsoleteConstructsRule.check(ctx);
      expect(findings).toHaveLength(1);
      expect(findings[0].description).toContain("PAUSE");
    });
  });
});

// ---------------------------------------------------------------------------
// JavaScript/TypeScript-Specific Rules
// ---------------------------------------------------------------------------

describe("JavaScript/TypeScript Rules", () => {
  describe("any-type-abuse", () => {
    it("detects 'any' type usage", () => {
      const code = `
const x: any = 5;
const y = foo as any;
function bar(z: any): any {
  return z;
}`;
      const ctx = makeCtx({
        filePath: "sloppy.ts",
        content: code,
        language: "typescript",
      });
      const findings = anyTypeAbuseRule.check(ctx);
      expect(findings).toHaveLength(1);
      // 4 usages: `: any` (x), `as any`, `: any` (z), `: any` (return)
      expect(findings[0].title).toContain("any");
    });

    it("does not flag files without any", () => {
      const code = `const x: string = "hello";\n`;
      const ctx = makeCtx({ filePath: "clean.ts", content: code, language: "typescript" });
      const findings = anyTypeAbuseRule.check(ctx);
      expect(findings).toHaveLength(0);
    });
  });

  describe("console-log-left", () => {
    it("detects console statements in production code", () => {
      const code = `console.log("debug");\nconsole.warn("oops");\nconsole.error("bad");\n`;
      const ctx = makeCtx({
        filePath: "src/utils.ts",
        content: code,
        language: "typescript",
      });
      const findings = consoleLogLeftRule.check(ctx);
      expect(findings).toHaveLength(1);
      expect(findings[0].title).toContain("3 console");
    });

    it("skips test files", () => {
      const code = `console.log("debug");\n`;
      const ctx = makeCtx({
        filePath: "src/utils.test.ts",
        content: code,
        language: "typescript",
      });
      const findings = consoleLogLeftRule.check(ctx);
      expect(findings).toHaveLength(0);
    });
  });

  describe("callback-hell", () => {
    it("detects deeply nested callbacks", () => {
      const code = `
fetch(url).then((res) => {
  res.json().then((data) => {
    process(data, function(result) {
      save(result, function(err) {
        if (err) console.log(err);
      })
    })
  })
})`;
      const ctx = makeCtx({
        filePath: "api.js",
        content: code,
        language: "javascript",
      });
      const findings = callbackHellRule.check(ctx);
      expect(findings).toHaveLength(1);
      expect(findings[0].title).toContain("Callback nesting");
    });
  });

  describe("unsafe-regex", () => {
    it("detects regex with nested quantifiers", () => {
      const code = `const re = /^(a+)+$/;\n`;
      const ctx = makeCtx({
        filePath: "validator.ts",
        content: code,
        language: "typescript",
      });
      const findings = unsafeRegexRule.check(ctx);
      expect(findings).toHaveLength(1);
      expect(findings[0].cweId).toBe("CWE-1333");
    });
  });
});

// ---------------------------------------------------------------------------
// RulesEngine integration
// ---------------------------------------------------------------------------

describe("RulesEngine", () => {
  let engine: RulesEngine;

  beforeAll(() => {
    engine = createDefaultRulesEngine();
  });

  it("creates default engine with all rules", () => {
    expect(engine.ruleCount).toBe(37);
  });

  it("returns only applicable rules for a language", () => {
    const fortranRules = engine.getRulesForLanguage("fortran");
    // Universal (10) + Fortran-specific (8) = 18
    expect(fortranRules.length).toBe(18);

    const tsRules = engine.getRulesForLanguage("typescript");
    // Universal (10) + TS-specific (2: any-type-abuse, — console and callback are for JS/TS/JSX/TSX but not just "typescript")
    // Actually console-log-left and callback-hell list ["javascript","typescript","jsx","tsx"]
    // and unsafe-regex lists ["javascript","typescript","jsx","tsx"]
    // So TS gets: 10 universal + 2 (any-type) + 3 (console, callback, unsafe-regex) = we need to check
    // any-type: ["typescript", "tsx"]
    // console-log: ["javascript", "typescript", "jsx", "tsx"]
    // callback-hell: ["javascript", "typescript", "jsx", "tsx"]
    // unsafe-regex: ["javascript", "typescript", "jsx", "tsx"]
    // So TS: 10 + 1 (any-type) + 3 (console, callback, unsafe) = 14
    expect(tsRules.length).toBe(14);
  });

  it("analyzes a TypeScript file end-to-end", () => {
    const code = lines(600) + `
const x: any = 5;
console.log("debug");
`;
    const ctx = makeCtx({
      filePath: "src/big-file.ts",
      content: code,
      language: "typescript",
      structural: { functions: [], classes: [], imports: [], exports: [] },
    });

    const findings = engine.analyze(ctx);
    // Should find at least: large-file (medium), any-type (info/low), console-log (low)
    expect(findings.length).toBeGreaterThanOrEqual(3);

    const categories = new Set(findings.map((f) => f.id.split(":")[1]));
    expect(categories.has("quality")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// ReportGenerator
// ---------------------------------------------------------------------------

describe("ReportGenerator", () => {
  const generator = new ReportGenerator();

  it("generates a complete report", () => {
    const engine = createDefaultRulesEngine();
    const code = lines(700) + "\nconst x: any = 5;\nconsole.log('test');\n";
    const ctx = makeCtx({
      filePath: "src/big.ts",
      content: code,
      language: "typescript",
      structural: { functions: [], classes: [], imports: [], exports: [] },
    });
    const findings = engine.analyze(ctx);

    const report = generator.generate({
      projectName: "test-project",
      gitCommitHash: "abc123",
      totalFiles: 1,
      totalLines: 702,
      languages: ["typescript"],
      findings,
    });

    expect(report.version).toBe("1.0.0");
    expect(report.project.name).toBe("test-project");
    expect(report.summary.totalFindings).toBeGreaterThan(0);
    expect(report.summary.riskScore).toBeGreaterThanOrEqual(0);
    expect(report.summary.riskScore).toBeLessThanOrEqual(100);
    expect(report.summary.technicalDebtHours).toBeGreaterThan(0);
    expect(report.executiveSummary.length).toBeGreaterThan(0);
    expect(report.recommendations.length).toBeGreaterThan(0);
  });

  it("calculates risk score correctly", () => {
    // 0 findings = 0 risk
    expect(generator.calculateRiskScore([])).toBe(0);

    // A few medium findings = low risk
    const mediumFindings = Array.from({ length: 5 }, (_, i) => ({
      id: `f${i}`,
      category: "quality" as const,
      severity: "medium" as const,
      title: "test",
      description: "test",
      filePath: "test.ts",
      effort: "small" as const,
      tags: [],
    }));
    const mediumScore = generator.calculateRiskScore(mediumFindings);
    expect(mediumScore).toBeGreaterThan(0);
    expect(mediumScore).toBeLessThan(50);

    // Critical security findings = high risk
    const criticalFindings = Array.from({ length: 10 }, (_, i) => ({
      id: `f${i}`,
      category: "security" as const,
      severity: "critical" as const,
      title: "test",
      description: "test",
      filePath: "test.ts",
      effort: "large" as const,
      tags: [],
    }));
    const criticalScore = generator.calculateRiskScore(criticalFindings);
    expect(criticalScore).toBeGreaterThan(50);
  });

  it("generates executive summary", () => {
    const summary = generator.buildSummary([
      {
        id: "f1",
        category: "security",
        severity: "critical",
        title: "SQL Injection",
        description: "test",
        filePath: "test.ts",
        effort: "medium",
        tags: [],
      },
    ]);

    const exec = generator.buildExecutiveSummary(
      {
        projectName: "TestApp",
        gitCommitHash: "abc",
        totalFiles: 10,
        totalLines: 5000,
        languages: ["typescript"],
        findings: [],
      },
      summary,
    );

    expect(exec).toContain("TestApp");
    expect(exec).toContain("10 files");
    expect(exec).toContain("1 critical finding");
  });
});
