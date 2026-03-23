import { describe, it, expect } from "vitest";
import {
  deadCodeCallGraphRule,
  unusedParametersRule,
  shadowedVariablesRule,
  gotoChainAnalysisRule,
  cyclomaticComplexityRule,
  nestingDepthAnalysisRule,
  arrayBoundsRiskRule,
  numericalStabilityRule,
  commonBlockConflictRule,
  fortranModernizationMapRule,
  migrationReadinessRule,
  promiseLeakRule,
  reactRerenderRiskRule,
  typeAssertionAbuseRule,
  apiErrorContractRule,
  createSemanticRules,
} from "../semantic-rules.js";
import type { AnalysisContext } from "../rules-engine.js";
import type { StructuralAnalysis, CallGraphEntry } from "../../types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCtx(overrides: Partial<AnalysisContext>): AnalysisContext {
  return {
    filePath: overrides.filePath ?? "test.f",
    content: overrides.content ?? "",
    language: overrides.language ?? "fortran",
    structural: overrides.structural ?? { functions: [], classes: [], imports: [], exports: [] },
    callGraph: overrides.callGraph ?? [],
    allFilePaths: overrides.allFilePaths,
    importGraph: overrides.importGraph,
  };
}

// ---------------------------------------------------------------------------
// A. Data Flow Analysis
// ---------------------------------------------------------------------------

describe("Data Flow Rules", () => {
  describe("dead-code-call-graph", () => {
    it("detects functions never called from any entry point", () => {
      const ctx = makeCtx({
        content: "      SUBROUTINE MAIN\n      END\n      SUBROUTINE ORPHAN\n      END\n",
        structural: {
          functions: [
            { name: "MAIN", lineRange: [1, 2], params: [] },
            { name: "ORPHAN", lineRange: [3, 4], params: [] },
          ],
          classes: [],
          imports: [],
          exports: [{ name: "MAIN", lineNumber: 1 }],
        },
        callGraph: [], // ORPHAN is never called
      });

      const findings = deadCodeCallGraphRule.check(ctx);
      expect(findings).toHaveLength(1);
      expect(findings[0].title).toContain("unreachable");
      expect(findings[0].description).toContain("ORPHAN");
    });

    it("does not flag functions that appear in call graph", () => {
      const ctx = makeCtx({
        content: "      SUBROUTINE MAIN\n      CALL HELPER\n      END\n      SUBROUTINE HELPER\n      END\n",
        structural: {
          functions: [
            { name: "MAIN", lineRange: [1, 3], params: [] },
            { name: "HELPER", lineRange: [4, 5], params: [] },
          ],
          classes: [],
          imports: [],
          exports: [{ name: "MAIN", lineNumber: 1 }],
        },
        callGraph: [{ caller: "MAIN", callee: "HELPER", lineNumber: 2 }],
      });

      const findings = deadCodeCallGraphRule.check(ctx);
      expect(findings).toHaveLength(0);
    });
  });

  describe("unused-parameters", () => {
    it("detects parameters never used in function body", () => {
      // Use JS/TS where the parameter detection is simpler
      const content = `function foo(a, b, unused) {
  return a + b;
}`;
      const ctx = makeCtx({
        content,
        language: "javascript",
        filePath: "test.js",
        structural: {
          functions: [{ name: "foo", lineRange: [1, 3], params: ["a", "b", "unused"] }],
          classes: [],
          imports: [],
          exports: [],
        },
      });

      const findings = unusedParametersRule.check(ctx);
      expect(findings).toHaveLength(1);
      expect(findings[0].title).toContain("unused");
    });

    it("does not flag parameters that are used", () => {
      const content = `      SUBROUTINE FOO(A, B)
      REAL A, B
      X = A + B
      RETURN
      END`;
      const ctx = makeCtx({
        content,
        structural: {
          functions: [{ name: "FOO", lineRange: [1, 5], params: ["A", "B"] }],
          classes: [],
          imports: [],
          exports: [],
        },
      });

      const findings = unusedParametersRule.check(ctx);
      expect(findings).toHaveLength(0);
    });
  });

  describe("shadowed-variables", () => {
    it("detects COMMON block variables shadowed by parameters in Fortran", () => {
      const content = `      SUBROUTINE FOO(X, Y)
      COMMON /BLK/ X, Z
      REAL X, Y, Z
      END`;
      const ctx = makeCtx({
        content,
        structural: {
          functions: [{ name: "FOO", lineRange: [1, 4], params: ["X", "Y"] }],
          classes: [],
          imports: [{ source: "COMMON/BLK", specifiers: ["X", "Z"], lineNumber: 2 }],
          exports: [],
        },
      });

      const findings = shadowedVariablesRule.check(ctx);
      expect(findings).toHaveLength(1);
      expect(findings[0].title).toContain("X");
      expect(findings[0].title).toContain("shadows COMMON");
    });

    it("detects shadowed variables in JS/TS", () => {
      const content = `const x = 10;
function foo() {
  const x = 20;
  return x;
}`;
      const ctx = makeCtx({
        content,
        language: "typescript",
        filePath: "test.ts",
        structural: {
          functions: [{ name: "foo", lineRange: [2, 5], params: [] }],
          classes: [],
          imports: [],
          exports: [],
        },
      });

      const findings = shadowedVariablesRule.check(ctx);
      expect(findings).toHaveLength(1);
      expect(findings[0].description).toContain("x");
    });
  });
});

// ---------------------------------------------------------------------------
// B. Control Flow Complexity
// ---------------------------------------------------------------------------

describe("Control Flow Rules", () => {
  describe("goto-chain-analysis", () => {
    it("detects forward jumps", () => {
      const content = `      SUBROUTINE TEST
      GO TO 100
      X = 1
  100 CONTINUE
      END`;
      const ctx = makeCtx({
        content,
        structural: {
          functions: [{ name: "TEST", lineRange: [1, 5], params: [] }],
          classes: [],
          imports: [],
          exports: [],
        },
      });

      const findings = gotoChainAnalysisRule.check(ctx);
      expect(findings).toHaveLength(1);
      expect(findings[0].description).toContain("forward");
    });

    it("detects backward jumps as dangerous", () => {
      const content = `      SUBROUTINE TEST
   10 CONTINUE
      X = X + 1
      IF (X .LT. 10) GO TO 10
      END`;
      const ctx = makeCtx({
        content,
        structural: {
          functions: [{ name: "TEST", lineRange: [1, 5], params: [] }],
          classes: [],
          imports: [],
          exports: [],
        },
      });

      const findings = gotoChainAnalysisRule.check(ctx);
      expect(findings).toHaveLength(1);
      expect(findings[0].description).toContain("backward");
      // Backward jump to self also creates a cycle, so severity is critical
      expect(["high", "critical"]).toContain(findings[0].severity);
    });

    it("detects GOTO cycles", () => {
      const content = `      SUBROUTINE TEST
   10 CONTINUE
      GO TO 20
   20 CONTINUE
      GO TO 10
      END`;
      const ctx = makeCtx({
        content,
        structural: {
          functions: [{ name: "TEST", lineRange: [1, 6], params: [] }],
          classes: [],
          imports: [],
          exports: [],
        },
      });

      const findings = gotoChainAnalysisRule.check(ctx);
      expect(findings).toHaveLength(1);
      expect(findings[0].description).toContain("cycle");
      expect(findings[0].severity).toBe("critical");
    });
  });

  describe("cyclomatic-complexity", () => {
    it("calculates complexity for simple function", () => {
      const content = `function simple(x) {
  return x + 1;
}`;
      const ctx = makeCtx({
        content,
        language: "javascript",
        filePath: "test.js",
        structural: {
          functions: [{ name: "simple", lineRange: [1, 3], params: ["x"] }],
          classes: [],
          imports: [],
          exports: [],
        },
      });

      const findings = cyclomaticComplexityRule.check(ctx);
      expect(findings).toHaveLength(0); // complexity 1 < threshold 10
    });

    it("flags high complexity functions", () => {
      // Create a function with many decision points
      const lines = ["function complex(x) {"];
      for (let i = 0; i < 15; i++) {
        lines.push(`  if (x > ${i}) { x = x + ${i}; }`);
      }
      lines.push("  return x;");
      lines.push("}");
      const content = lines.join("\n");

      const ctx = makeCtx({
        content,
        language: "javascript",
        filePath: "test.js",
        structural: {
          functions: [{ name: "complex", lineRange: [1, lines.length], params: ["x"] }],
          classes: [],
          imports: [],
          exports: [],
        },
      });

      const findings = cyclomaticComplexityRule.check(ctx);
      expect(findings).toHaveLength(1);
      expect(findings[0].title).toContain("cyclomatic complexity");
    });

    it("calculates Fortran complexity with GOTOs", () => {
      const lines = [
        "      SUBROUTINE COMPLEX(X)",
        "      IF (X .GT. 0) THEN",
        "      IF (X .GT. 1) THEN",
        "      IF (X .GT. 2) THEN",
        "      IF (X .GT. 3) THEN",
        "      IF (X .GT. 4) THEN",
        "      IF (X .GT. 5) THEN",
        "      IF (X .GT. 6) THEN",
        "      IF (X .GT. 7) THEN",
        "      IF (X .GT. 8) THEN",
        "      IF (X .GT. 9) THEN",
        "      IF (X .GT. 10) THEN",
        "      END IF",
        "      END IF",
        "      END IF",
        "      END IF",
        "      END IF",
        "      END IF",
        "      END IF",
        "      END IF",
        "      END IF",
        "      END IF",
        "      END IF",
        "      END",
      ];
      const content = lines.join("\n");

      const ctx = makeCtx({
        content,
        structural: {
          functions: [{ name: "COMPLEX", lineRange: [1, lines.length], params: ["X"] }],
          classes: [],
          imports: [],
          exports: [],
        },
      });

      const findings = cyclomaticComplexityRule.check(ctx);
      expect(findings).toHaveLength(1);
      expect(findings[0].severity).toBe("medium");
    });
  });

  describe("nesting-depth-analysis", () => {
    it("detects deep nesting in Fortran IF blocks", () => {
      const lines = [
        "      SUBROUTINE DEEP(X)",
        "      IF (X .GT. 0) THEN",
        "        IF (X .GT. 1) THEN",
        "          IF (X .GT. 2) THEN",
        "            IF (X .GT. 3) THEN",
        "              IF (X .GT. 4) THEN",
        "                X = 0",
        "              END IF",
        "            END IF",
        "          END IF",
        "        END IF",
        "      END IF",
        "      END",
      ];
      const content = lines.join("\n");

      const ctx = makeCtx({
        content,
        structural: {
          functions: [{ name: "DEEP", lineRange: [1, lines.length], params: ["X"] }],
          classes: [],
          imports: [],
          exports: [],
        },
      });

      const findings = nestingDepthAnalysisRule.check(ctx);
      expect(findings).toHaveLength(1);
      expect(findings[0].title).toContain("5 levels deep");
    });
  });
});

// ---------------------------------------------------------------------------
// C. Fortran-Specific Deep Rules
// ---------------------------------------------------------------------------

describe("Fortran Deep Rules", () => {
  describe("array-bounds-risk", () => {
    it("detects loop bounds exceeding array dimensions", () => {
      const content = `      SUBROUTINE TEST
      DIMENSION A(10)
      DO 100 I = 1, 20
        A(I) = 0.0
  100 CONTINUE
      END`;
      const ctx = makeCtx({
        content,
        structural: {
          functions: [{ name: "TEST", lineRange: [1, 6], params: [] }],
          classes: [],
          imports: [],
          exports: [],
        },
      });

      const findings = arrayBoundsRiskRule.check(ctx);
      expect(findings).toHaveLength(1);
      expect(findings[0].severity).toBe("critical");
      expect(findings[0].title).toContain("array bounds");
    });

    it("does not flag when bounds match", () => {
      const content = `      SUBROUTINE TEST
      DIMENSION A(10)
      DO 100 I = 1, 10
        A(I) = 0.0
  100 CONTINUE
      END`;
      const ctx = makeCtx({
        content,
        structural: {
          functions: [{ name: "TEST", lineRange: [1, 6], params: [] }],
          classes: [],
          imports: [],
          exports: [],
        },
      });

      const findings = arrayBoundsRiskRule.check(ctx);
      expect(findings).toHaveLength(0);
    });
  });

  describe("numerical-stability", () => {
    it("detects exact float comparison with .EQ.", () => {
      const content = `      SUBROUTINE TEST
      REAL A, B
      IF (A .EQ. B) THEN
        X = 1.0
      END IF
      END`;
      const ctx = makeCtx({
        content,
        structural: {
          functions: [{ name: "TEST", lineRange: [1, 6], params: [] }],
          classes: [],
          imports: [],
          exports: [],
        },
      });

      const findings = numericalStabilityRule.check(ctx);
      const floatFindings = findings.filter((f) => f.title.includes("floating-point"));
      expect(floatFindings).toHaveLength(1);
    });

    it("detects unguarded division", () => {
      const content = `      SUBROUTINE TEST
      REAL A, B, C
      A = 1.0
      B = 2.0
      C = 3.0
      X = A / B
      Y = A / C
      Z = A / B
      END`;
      const ctx = makeCtx({
        content,
        structural: {
          functions: [{ name: "TEST", lineRange: [1, 8], params: [] }],
          classes: [],
          imports: [],
          exports: [],
        },
      });

      const findings = numericalStabilityRule.check(ctx);
      const divFindings = findings.filter((f) => f.title.includes("division"));
      expect(divFindings).toHaveLength(1);
    });
  });

  describe("common-block-conflict", () => {
    it("detects same COMMON block with different layouts", () => {
      const content = `      SUBROUTINE A
      COMMON /BLK/ X, Y, Z
      END
      SUBROUTINE B
      COMMON /BLK/ A, B
      END`;
      const ctx = makeCtx({
        content,
        structural: {
          functions: [
            { name: "A", lineRange: [1, 3], params: [] },
            { name: "B", lineRange: [4, 6], params: [] },
          ],
          classes: [],
          imports: [],
          exports: [],
        },
      });

      const findings = commonBlockConflictRule.check(ctx);
      expect(findings).toHaveLength(1);
      expect(findings[0].severity).toBe("critical");
      expect(findings[0].title).toContain("different layouts");
    });

    it("allows consistent COMMON block declarations", () => {
      const content = `      SUBROUTINE A
      COMMON /BLK/ X, Y, Z
      END
      SUBROUTINE B
      COMMON /BLK/ X, Y, Z
      END`;
      const ctx = makeCtx({
        content,
        structural: {
          functions: [
            { name: "A", lineRange: [1, 3], params: [] },
            { name: "B", lineRange: [4, 6], params: [] },
          ],
          classes: [],
          imports: [],
          exports: [],
        },
      });

      const findings = commonBlockConflictRule.check(ctx);
      expect(findings).toHaveLength(0);
    });
  });

  describe("fortran-modernization-map", () => {
    it("provides modernization mapping with code examples", () => {
      const content = `      SUBROUTINE OLD
      COMMON /BLK/ X, Y
      GO TO 100
  100 CONTINUE
      DIMENSION A(100)
      DATA X /3.14/
      END`;
      const ctx = makeCtx({
        content,
        structural: {
          functions: [{ name: "OLD", lineRange: [1, 7], params: [] }],
          classes: [],
          imports: [],
          exports: [],
        },
      });

      const findings = fortranModernizationMapRule.check(ctx);
      expect(findings).toHaveLength(1);
      expect(findings[0].suggestion).toContain("MODULE");
      expect(findings[0].suggestion).toContain("ALLOCATABLE");
    });
  });

  describe("migration-readiness", () => {
    it("scores easy subroutine low (1-2)", () => {
      const content = `      SUBROUTINE EASY(A, B, C)
      REAL A, B, C
      C = A + B
      RETURN
      END`;
      const ctx = makeCtx({
        content,
        structural: {
          functions: [{ name: "EASY", lineRange: [1, 5], params: ["A", "B", "C"] }],
          classes: [],
          imports: [],
          exports: [],
        },
      });

      const findings = migrationReadinessRule.check(ctx);
      expect(findings).toHaveLength(1);
      expect(findings[0].title).toContain("1/5");
    });

    it("scores complex subroutine high (4-5)", () => {
      const content = `      SUBROUTINE HARD(A, B, C, D, E, F, G, H)
      COMMON /BLK1/ X, Y, Z
      COMMON /BLK2/ P, Q, R
      COMMON /BLK3/ U, V, W
      EQUIVALENCE (A, B)
      GO TO (10, 20, 30), I
   10 CONTINUE
      GO TO 40
   20 CONTINUE
      GO TO 40
   30 CONTINUE
   40 CONTINUE
      ENTRY HARD2(A, B)
      RETURN
      END`;
      const ctx = makeCtx({
        content,
        structural: {
          functions: [{ name: "HARD", lineRange: [1, 15], params: ["A", "B", "C", "D", "E", "F", "G", "H"] }],
          classes: [],
          imports: [],
          exports: [],
        },
      });

      const findings = migrationReadinessRule.check(ctx);
      expect(findings).toHaveLength(1);
      const score = parseInt(findings[0].title.match(/(\d)\/5/)?.[1] ?? "0", 10);
      expect(score).toBeGreaterThanOrEqual(4);
    });
  });
});

// ---------------------------------------------------------------------------
// D. JS/TS Deep Rules
// ---------------------------------------------------------------------------

describe("JS/TS Deep Rules", () => {
  describe("promise-leak", () => {
    it("detects floating promises", () => {
      const content = `async function main() {
  const x = 1;
}
fetch("/api/data")
console.log("done");`;
      const ctx = makeCtx({
        content,
        language: "javascript",
        filePath: "test.js",
        structural: { functions: [], classes: [], imports: [], exports: [] },
      });

      const findings = promiseLeakRule.check(ctx);
      expect(findings).toHaveLength(1);
      expect(findings[0].title).toContain("floating promise");
    });
  });

  describe("react-rerender-risk", () => {
    it("detects inline object/function creation in JSX", () => {
      const content = `function Component() {
  return (
    <div>
      <Child style={{ color: 'red' }} />
      <Child onClick={() => doSomething()} />
      <Child data={[1, 2, 3]} />
      <Child style={{ border: '1px' }} />
    </div>
  );
}`;
      const ctx = makeCtx({
        content,
        language: "tsx",
        filePath: "component.tsx",
        structural: { functions: [], classes: [], imports: [], exports: [] },
      });

      const findings = reactRerenderRiskRule.check(ctx);
      expect(findings).toHaveLength(1);
      expect(findings[0].title).toContain("inline reference");
    });
  });

  describe("type-assertion-abuse", () => {
    it("detects excessive type assertions", () => {
      const content = `const a = foo as Bar;
const b = baz as Qux;
const c = x as Yolo;
const d = y as Something;
const e = z as Whatever;`;
      const ctx = makeCtx({
        content,
        language: "typescript",
        filePath: "test.ts",
        structural: { functions: [], classes: [], imports: [], exports: [] },
      });

      const findings = typeAssertionAbuseRule.check(ctx);
      expect(findings).toHaveLength(1);
      expect(findings[0].title).toContain("type assertion");
    });
  });

  describe("api-error-contract", () => {
    it("flags API handlers without validation or error handling", () => {
      const content = `export default async function POST(request) {
  const data = await request.json();
  return Response.json({ ok: true });
}`;
      const ctx = makeCtx({
        content,
        language: "typescript",
        filePath: "route.ts",
        structural: { functions: [], classes: [], imports: [], exports: [] },
      });

      const findings = apiErrorContractRule.check(ctx);
      expect(findings).toHaveLength(1);
      expect(findings[0].title).toContain("error contract");
    });
  });
});

// ---------------------------------------------------------------------------
// Integration
// ---------------------------------------------------------------------------

describe("createSemanticRules", () => {
  it("returns all semantic rules", () => {
    const rules = createSemanticRules();
    expect(rules.length).toBeGreaterThanOrEqual(15);
  });

  it("all rules have required fields", () => {
    const rules = createSemanticRules();
    for (const rule of rules) {
      expect(rule.id).toBeTruthy();
      expect(rule.name).toBeTruthy();
      expect(rule.category).toBeTruthy();
      expect(rule.severity).toBeTruthy();
      expect(rule.languages).toBeTruthy();
      expect(rule.description).toBeTruthy();
      expect(typeof rule.check).toBe("function");
    }
  });
});
