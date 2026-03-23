import { describe, it, expect } from "vitest";
import { MigrationAnalyzer } from "../migration-analyzer.js";
import type { StructuralAnalysis, CallGraphEntry } from "../../types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeStructural(overrides?: Partial<StructuralAnalysis>): StructuralAnalysis {
  return {
    functions: overrides?.functions ?? [],
    classes: overrides?.classes ?? [],
    imports: overrides?.imports ?? [],
    exports: overrides?.exports ?? [],
  };
}

// ---------------------------------------------------------------------------
// Subroutine Analysis
// ---------------------------------------------------------------------------

describe("MigrationAnalyzer", () => {
  const analyzer = new MigrationAnalyzer();

  describe("analyzeSubroutine", () => {
    it("scores easy subroutines as readiness 1", () => {
      const content = `      SUBROUTINE EASY(A, B, C)
      REAL A, B, C
      C = A + B
      RETURN
      END`;
      const structural = makeStructural({
        functions: [{ name: "EASY", lineRange: [1, 5], params: ["A", "B", "C"] }],
      });

      const result = analyzer.analyzeSubroutine("EASY", "test.f", content, structural, []);
      expect(result.readinessScore).toBe(1);
      expect(result.blockers).toHaveLength(0);
      expect(result.targets.length).toBeGreaterThanOrEqual(4);
    });

    it("scores COMMON-heavy subroutines higher", () => {
      const content = `      SUBROUTINE MEDIUM(X)
      COMMON /BLK1/ A, B
      COMMON /BLK2/ C, D
      COMMON /BLK3/ E, F
      X = A + C + E
      RETURN
      END`;
      const structural = makeStructural({
        functions: [{ name: "MEDIUM", lineRange: [1, 7], params: ["X"] }],
      });

      const result = analyzer.analyzeSubroutine("MEDIUM", "test.f", content, structural, []);
      expect(result.readinessScore).toBeGreaterThanOrEqual(3);
      expect(result.blockers.some((b) => b.includes("COMMON"))).toBe(true);
    });

    it("scores EQUIVALENCE + ENTRY as very hard (4-5)", () => {
      const content = `      SUBROUTINE HARD(A, B, C, D, E, F, G, H)
      EQUIVALENCE (A, B)
      ENTRY HARD2(A, B)
      COMMON /BLK/ X, Y
      GO TO 10
   10 CONTINUE
      RETURN
      END`;
      const structural = makeStructural({
        functions: [{ name: "HARD", lineRange: [1, 8], params: ["A", "B", "C", "D", "E", "F", "G", "H"] }],
      });

      const result = analyzer.analyzeSubroutine("HARD", "test.f", content, structural, []);
      expect(result.readinessScore).toBeGreaterThanOrEqual(4);
      expect(result.blockers.some((b) => b.includes("EQUIVALENCE"))).toBe(true);
      expect(result.blockers.some((b) => b.includes("ENTRY"))).toBe(true);
    });

    it("ranks modern-fortran first for numerical code", () => {
      const content = `      SUBROUTINE SOLVE(MATRIX, N)
      DIMENSION MATRIX(N, N)
      DO 100 I = 1, N
        MATRIX(I,I) = 1.0
  100 CONTINUE
      RETURN
      END`;
      const structural = makeStructural({
        functions: [{ name: "SOLVE", lineRange: [1, 7], params: ["MATRIX", "N"] }],
      });

      const result = analyzer.analyzeSubroutine("SOLVE", "test.f", content, structural, []);
      expect(result.targets[0].language).toBe("modern-fortran");
      expect(result.targets[0].suitability).toBeGreaterThanOrEqual(80);
    });

    it("generates modernization steps", () => {
      const content = `      SUBROUTINE OLD(X)
      COMMON /BLK/ A, B
      GO TO 10
   10 CONTINUE
      DIMENSION ARR(100)
      DATA X /3.14/
      RETURN
      END`;
      const structural = makeStructural({
        functions: [{ name: "OLD", lineRange: [1, 8], params: ["X"] }],
      });

      const result = analyzer.analyzeSubroutine("OLD", "test.f", content, structural, []);
      expect(result.modernizationSteps.length).toBeGreaterThanOrEqual(4);
      expect(result.modernizationSteps.some((s) => s.includes("IMPLICIT NONE"))).toBe(true);
      expect(result.modernizationSteps.some((s) => s.includes("COMMON"))).toBe(true);
      expect(result.modernizationSteps.some((s) => s.includes("GOTO"))).toBe(true);
    });
  });

  describe("generatePlan", () => {
    it("generates a phased plan from subroutine analyses", () => {
      const easySub = analyzer.analyzeSubroutine(
        "EASY",
        "easy.f",
        "      SUBROUTINE EASY(A, B)\n      C = A + B\n      END",
        makeStructural({ functions: [{ name: "EASY", lineRange: [1, 3], params: ["A", "B"] }] }),
        [],
      );

      const hardSub = analyzer.analyzeSubroutine(
        "HARD",
        "hard.f",
        "      SUBROUTINE HARD(A)\n      COMMON /B1/ X\n      COMMON /B2/ Y\n      COMMON /B3/ Z\n      EQUIVALENCE (A, X)\n      ENTRY HARD2(A)\n      END",
        makeStructural({ functions: [{ name: "HARD", lineRange: [1, 7], params: ["A"] }] }),
        [],
      );

      const plan = analyzer.generatePlan([easySub, hardSub], "TestProject");

      expect(plan.projectName).toBe("TestProject");
      expect(plan.totalSubroutines).toBe(2);
      expect(plan.phases.length).toBeGreaterThanOrEqual(2); // At least easy + validation
      expect(plan.recommendedStrategy).toBeTruthy();
      expect(plan.byReadiness[easySub.readinessScore]).toBeGreaterThanOrEqual(1);
    });

    it("recommends incremental strategy for easy codebases", () => {
      const subs = Array.from({ length: 5 }, (_, i) =>
        analyzer.analyzeSubroutine(
          `SUB${i}`,
          `sub${i}.f`,
          `      SUBROUTINE SUB${i}(A, B)\n      C = A + B\n      END`,
          makeStructural({ functions: [{ name: `SUB${i}`, lineRange: [1, 3], params: ["A", "B"] }] }),
          [],
        ),
      );

      const plan = analyzer.generatePlan(subs, "EasyProject");
      expect(plan.recommendedStrategy).toContain("Incremental");
      expect(plan.overallReadiness).toBeLessThanOrEqual(2);
    });

    it("recommends big bang rewrite for very hard codebases", () => {
      const hardContent = `      SUBROUTINE HARD(A, B, C, D, E, F, G, H)
      COMMON /B1/ X
      COMMON /B2/ Y
      COMMON /B3/ Z
      COMMON /B4/ W
      EQUIVALENCE (A, B)
      ENTRY HARD2(A)
      GO TO (10, 20), I
   10 CONTINUE
   20 CONTINUE
      END`;

      const subs = Array.from({ length: 5 }, (_, i) =>
        analyzer.analyzeSubroutine(
          `HARD${i}`,
          `hard${i}.f`,
          hardContent.replace(/HARD/g, `HARD${i}`),
          makeStructural({
            functions: [{ name: `HARD${i}`, lineRange: [1, 11], params: ["A", "B", "C", "D", "E", "F", "G", "H"] }],
          }),
          [],
        ),
      );

      const plan = analyzer.generatePlan(subs, "HardProject");
      expect(plan.recommendedStrategy).toContain("rewrite");
      expect(plan.overallReadiness).toBeGreaterThanOrEqual(3.5);
    });

    it("includes validation phase in every plan", () => {
      const sub = analyzer.analyzeSubroutine(
        "TEST",
        "test.f",
        "      SUBROUTINE TEST(A)\n      A = 1.0\n      END",
        makeStructural({ functions: [{ name: "TEST", lineRange: [1, 3], params: ["A"] }] }),
        [],
      );

      const plan = analyzer.generatePlan([sub], "Test");
      const lastPhase = plan.phases[plan.phases.length - 1];
      expect(lastPhase.title).toContain("Validation");
    });

    it("counts readiness distribution correctly", () => {
      const easySub = analyzer.analyzeSubroutine(
        "EASY",
        "easy.f",
        "      SUBROUTINE EASY(A, B)\n      C = A + B\n      END",
        makeStructural({ functions: [{ name: "EASY", lineRange: [1, 3], params: ["A", "B"] }] }),
        [],
      );

      const plan = analyzer.generatePlan([easySub, easySub], "Test");
      const easyCount = plan.byReadiness[easySub.readinessScore];
      expect(easyCount).toBe(2);
    });
  });
});
