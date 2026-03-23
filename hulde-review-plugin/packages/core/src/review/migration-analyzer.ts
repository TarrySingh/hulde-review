/**
 * Migration Analyzer
 *
 * Dedicated module for enterprise migration planning.
 * Analyzes each subroutine's readiness for migration and generates
 * phased migration plans with effort estimates and target recommendations.
 */

import type { StructuralAnalysis, CallGraphEntry } from "../types.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MigrationTarget {
  language: string;
  suitability: number;       // 0-100 score
  rationale: string;
  challenges: string[];
  estimatedEffort: string;
}

export interface SubroutineMigration {
  name: string;
  filePath: string;
  readinessScore: 1 | 2 | 3 | 4 | 5;
  readinessLabel: string;
  blockers: string[];
  targets: MigrationTarget[];
  modernizationSteps: string[];
}

export interface MigrationPlan {
  projectName: string;
  overallReadiness: number;
  totalSubroutines: number;
  byReadiness: Record<1 | 2 | 3 | 4 | 5, number>;
  recommendedStrategy: string;
  phases: Array<{
    phase: number;
    title: string;
    description: string;
    subroutines: string[];
    effort: string;
    risk: string;
  }>;
  subroutines: SubroutineMigration[];
}

// ---------------------------------------------------------------------------
// Readiness labels
// ---------------------------------------------------------------------------

const READINESS_LABELS: Record<1 | 2 | 3 | 4 | 5, string> = {
  1: "Easy — pure computation, clean interfaces",
  2: "Moderate — some legacy patterns but manageable",
  3: "Hard — COMMON blocks, GOTOs, but self-contained",
  4: "Very Hard — deep interdependencies, system-specific calls",
  5: "Requires Rewrite — ENTRY points, computed GOTOs, non-standard extensions",
};

// ---------------------------------------------------------------------------
// MigrationAnalyzer class
// ---------------------------------------------------------------------------

export class MigrationAnalyzer {
  /**
   * Analyze a single subroutine for migration readiness.
   */
  analyzeSubroutine(
    name: string,
    filePath: string,
    content: string,
    structural: StructuralAnalysis,
    callGraph: CallGraphEntry[],
  ): SubroutineMigration {
    const fn = structural.functions.find(
      (f) => f.name.toUpperCase() === name.toUpperCase(),
    );
    const bodyLines = fn
      ? content.split("\n").slice(fn.lineRange[0] - 1, fn.lineRange[1])
      : content.split("\n");
    const body = bodyLines.join("\n").toUpperCase();

    // --- Score calculation ---
    let score = 2.0;
    const blockers: string[] = [];

    // COMMON blocks
    const commonCount = (body.match(/\bCOMMON\s*\//g) || []).length;
    score += commonCount * 0.5;
    if (commonCount > 0) blockers.push(`${commonCount} COMMON block${commonCount > 1 ? "s" : ""} (shared mutable state)`);

    // GOTOs
    const gotoCount = (body.match(/\bGO\s*TO\b/g) || []).length;
    score += gotoCount * 0.1;
    if (gotoCount > 5) blockers.push(`${gotoCount} GOTO statements (spaghetti control flow)`);

    // EQUIVALENCE
    const hasEquivalence = /\bEQUIVALENCE\s*\(/.test(body);
    if (hasEquivalence) {
      score += 1.0;
      blockers.push("EQUIVALENCE statements (memory aliasing)");
    }

    // ENTRY points
    const hasEntry = /\bENTRY\s+\w+/.test(body);
    if (hasEntry) {
      score += 1.5;
      blockers.push("ENTRY points (alternative subroutine entries)");
    }

    // Computed GOTO
    const computedGotoCount = (body.match(/\bGO\s*TO\s*\(/g) || []).length;
    score += computedGotoCount * 0.5;
    if (computedGotoCount > 0) blockers.push(`${computedGotoCount} computed GOTO${computedGotoCount > 1 ? "s" : ""}`);

    // Hollerith constants
    const hasHollerith = /\d+H[A-Z\s]/i.test(body);
    if (hasHollerith) {
      score += 0.5;
      blockers.push("Hollerith constants (archaic string encoding)");
    }

    // System-specific calls
    const systemCalls = (body.match(/\b(LSHIFT|RSHIFT|LOC|CRAY|IBITS|ISHFT)\b/gi) || []).length;
    if (systemCalls > 0) {
      score += systemCalls * 0.5;
      blockers.push(`${systemCalls} system-specific intrinsic${systemCalls > 1 ? "s" : ""}`);
    }

    // Ease factors
    const paramCount = fn ? fn.params.length : 0;
    if (commonCount === 0 && gotoCount === 0 && paramCount > 0 && paramCount <= 6) {
      score -= 1.0;
    }

    // Clamp
    const readinessScore = Math.max(1, Math.min(5, Math.round(score))) as 1 | 2 | 3 | 4 | 5;

    // --- Migration targets ---
    const targets = this.rankTargets(readinessScore, body, blockers);

    // --- Modernization steps ---
    const modernizationSteps = this.generateModernizationSteps(body, readinessScore, blockers);

    return {
      name,
      filePath,
      readinessScore,
      readinessLabel: READINESS_LABELS[readinessScore],
      blockers,
      targets,
      modernizationSteps,
    };
  }

  /**
   * Generate a complete migration plan from analyzed subroutines.
   */
  generatePlan(
    subroutines: SubroutineMigration[],
    projectName: string,
  ): MigrationPlan {
    const total = subroutines.length;
    const byReadiness: Record<1 | 2 | 3 | 4 | 5, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (const sub of subroutines) {
      byReadiness[sub.readinessScore]++;
    }

    const avg = total > 0
      ? subroutines.reduce((sum, s) => sum + s.readinessScore, 0) / total
      : 0;

    // Determine strategy
    let strategy: string;
    if (avg <= 2.0) {
      strategy = "Incremental modernization — most code is migration-ready, proceed module by module";
    } else if (avg <= 3.5) {
      strategy = "Wrap and extend — modernize interfaces first, refactor internals incrementally";
    } else {
      strategy = "Big bang rewrite — code is too coupled for incremental migration, plan a full rewrite";
    }

    // Generate phases
    const phases = this.generatePhases(subroutines);

    return {
      projectName,
      overallReadiness: Math.round(avg * 10) / 10,
      totalSubroutines: total,
      byReadiness,
      recommendedStrategy: strategy,
      phases,
      subroutines,
    };
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private rankTargets(
    readiness: 1 | 2 | 3 | 4 | 5,
    body: string,
    blockers: string[],
  ): MigrationTarget[] {
    const isNumerical = /\b(MATRIX|VECTOR|EIGEN|SOLVE|FACTOR|DECOMP|INTEGRAT|DERIV|GRADIENT)\b/.test(body);
    const hasIO = /\b(READ|WRITE|OPEN|CLOSE|PRINT)\b/.test(body);
    const isLarge = body.split("\n").length > 200;

    const targets: MigrationTarget[] = [];

    // 1. Modern Fortran — always first for numerical code
    targets.push({
      language: "modern-fortran",
      suitability: isNumerical ? 95 : 80,
      rationale: "Keeps performance parity. Adds IMPLICIT NONE, modules, allocatables, and compiler safety checks. Minimal rewrite needed.",
      challenges: blockers.map((b) => `Resolve: ${b}`),
      estimatedEffort: readiness <= 2 ? "1-2 days per subroutine" : readiness <= 3 ? "3-5 days per subroutine" : "1-2 weeks per subroutine",
    });

    // 2. Python + NumPy/SciPy
    targets.push({
      language: "python",
      suitability: isNumerical ? 70 : hasIO ? 85 : 60,
      rationale: "Excellent for prototyping, visualization, and testing. NumPy/SciPy cover most numerical routines. 10-100x slower for raw loops.",
      challenges: [
        "Performance: Python loops are 10-100x slower than Fortran",
        isNumerical ? "Must vectorize with NumPy — do not translate loops directly" : "",
        "Memory model differs — no COMMON blocks, use module globals or class state",
      ].filter(Boolean),
      estimatedEffort: readiness <= 2 ? "2-3 days per subroutine" : "1-2 weeks per subroutine",
    });

    // 3. C++
    targets.push({
      language: "c++",
      suitability: isLarge ? 75 : 65,
      rationale: "Performance parity with Fortran. Better tooling, debugging, and ecosystem. Good for interfacing with modern systems.",
      challenges: [
        "Array semantics differ (row-major vs column-major)",
        "Manual memory management (use smart pointers)",
        "Template complexity for generic algorithms",
      ],
      estimatedEffort: readiness <= 2 ? "3-5 days per subroutine" : "1-3 weeks per subroutine",
    });

    // 4. Rust
    targets.push({
      language: "rust",
      suitability: blockers.length > 3 ? 60 : 50,
      rationale: "Memory safety without garbage collection. Ideal for safety-critical numerical code. Steep learning curve but prevents entire classes of bugs.",
      challenges: [
        "Steep learning curve for team",
        "Borrow checker requires rethinking data ownership",
        "Scientific computing ecosystem less mature than Fortran/Python",
      ],
      estimatedEffort: readiness <= 2 ? "1-2 weeks per subroutine" : "2-4 weeks per subroutine",
    });

    // Sort by suitability descending
    targets.sort((a, b) => b.suitability - a.suitability);

    return targets;
  }

  private generateModernizationSteps(
    body: string,
    readiness: 1 | 2 | 3 | 4 | 5,
    blockers: string[],
  ): string[] {
    const steps: string[] = [];

    // Always first: add IMPLICIT NONE
    if (!/\bIMPLICIT\s+NONE\b/.test(body)) {
      steps.push("Add IMPLICIT NONE and explicitly declare all variables");
    }

    // Convert fixed format to free format
    steps.push("Convert from fixed-format to free-format source (.f90)");

    // COMMON blocks -> modules
    if (/\bCOMMON\s*\//.test(body)) {
      steps.push("Replace COMMON blocks with MODULE variables using USE statements");
    }

    // GOTO -> structured control flow
    if (/\bGO\s*TO\b/.test(body)) {
      steps.push("Replace GOTO statements with IF/THEN/ELSE, DO loops, EXIT, and CYCLE");
    }

    // EQUIVALENCE
    if (/\bEQUIVALENCE\s*\(/.test(body)) {
      steps.push("Remove EQUIVALENCE — use TRANSFER() for type punning or separate variables");
    }

    // Arithmetic IF
    if (/\bIF\s*\([^)]+\)\s*\d+\s*,\s*\d+\s*,\s*\d+/.test(body)) {
      steps.push("Replace arithmetic IF statements with IF/THEN/ELSE IF/ELSE/END IF");
    }

    // Computed GOTO
    if (/\bGO\s*TO\s*\(/.test(body)) {
      steps.push("Replace computed GOTOs with SELECT CASE");
    }

    // DATA -> PARAMETER
    if (/\bDATA\s+\w+/.test(body)) {
      steps.push("Convert DATA statements to PARAMETER declarations or module initialization");
    }

    // Fixed-size arrays -> allocatable
    if (/\bDIMENSION\s+\w+\(\d+\)/.test(body)) {
      steps.push("Convert fixed-size arrays to ALLOCATABLE arrays where appropriate");
    }

    // Add interface blocks
    steps.push("Add explicit INTERFACE blocks for all external subroutine/function calls");

    // Add intent declarations
    steps.push("Add INTENT(IN/OUT/INOUT) to all dummy arguments");

    return steps;
  }

  private generatePhases(subroutines: SubroutineMigration[]): MigrationPlan["phases"] {
    const easy = subroutines.filter((s) => s.readinessScore <= 2);
    const medium = subroutines.filter((s) => s.readinessScore === 3);
    const hard = subroutines.filter((s) => s.readinessScore >= 4);

    const phases: MigrationPlan["phases"] = [];

    if (easy.length > 0) {
      phases.push({
        phase: 1,
        title: "Quick Wins — Easy Migration Targets",
        description: `Modernize ${easy.length} subroutines with readiness score 1-2. These have clean interfaces, no COMMON blocks, and structured control flow. Start here to build momentum and validate the migration process.`,
        subroutines: easy.map((s) => s.name),
        effort: `${Math.ceil(easy.length * 2)} developer-days`,
        risk: "Low — isolated changes with clear boundaries",
      });
    }

    if (medium.length > 0) {
      phases.push({
        phase: phases.length + 1,
        title: "Core Modernization — Moderate Complexity",
        description: `Refactor ${medium.length} subroutines with readiness score 3. These have COMMON blocks or GOTOs but are self-contained. Requires careful testing of shared state.`,
        subroutines: medium.map((s) => s.name),
        effort: `${Math.ceil(medium.length * 5)} developer-days`,
        risk: "Medium — COMMON block changes may affect other subroutines",
      });
    }

    if (hard.length > 0) {
      phases.push({
        phase: phases.length + 1,
        title: "Deep Refactoring — High Complexity",
        description: `Tackle ${hard.length} subroutines with readiness score 4-5. These have deep interdependencies, ENTRY points, or non-standard extensions. May require partial or full rewrites.`,
        subroutines: hard.map((s) => s.name),
        effort: `${Math.ceil(hard.length * 10)} developer-days`,
        risk: "High — systemic changes, requires comprehensive regression testing",
      });
    }

    // Always add a validation phase
    phases.push({
      phase: phases.length + 1,
      title: "Validation & Regression Testing",
      description: "Run comprehensive numerical validation against original code. Compare outputs for representative test cases to ensure migration preserves correctness within acceptable tolerances.",
      subroutines: [],
      effort: `${Math.ceil(subroutines.length * 0.5)} developer-days`,
      risk: "Critical — numerical differences must be within tolerance",
    });

    return phases;
  }
}
