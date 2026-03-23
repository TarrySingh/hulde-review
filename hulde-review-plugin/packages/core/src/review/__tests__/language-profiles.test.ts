import { describe, it, expect } from "vitest";
import {
  ALL_PROFILES,
  getProfile,
  getProfileForFile,
  getReadyProfiles,
  getProfileStatus,
  fortranProfile,
  typescriptProfile,
  cobolProfile,
  cCppProfile,
  pythonProfile,
  javaProfile,
  adaProfile,
  rpgProfile,
  type LanguageProfile,
} from "../language-profiles.js";
import {
  checkProfileReadiness,
  checkAllProfiles,
  getProfileSummary,
} from "../profile-checker.js";

// ---------------------------------------------------------------------------
// Profile structure validation
// ---------------------------------------------------------------------------

describe("LanguageProfile structure", () => {
  it("ALL_PROFILES contains all 8 profiles", () => {
    expect(ALL_PROFILES).toHaveLength(8);
    const ids = ALL_PROFILES.map((p) => p.id);
    expect(ids).toContain("fortran");
    expect(ids).toContain("typescript");
    expect(ids).toContain("cobol");
    expect(ids).toContain("c-cpp");
    expect(ids).toContain("python");
    expect(ids).toContain("java");
    expect(ids).toContain("ada");
    expect(ids).toContain("rpg");
  });

  it("every profile has all required fields", () => {
    for (const profile of ALL_PROFILES) {
      expect(profile.id).toBeTruthy();
      expect(profile.name).toBeTruthy();
      expect(profile.fileExtensions.length).toBeGreaterThan(0);
      expect(["legacy", "modern"]).toContain(profile.category);
      expect(profile.industries.length).toBeGreaterThan(0);
      expect(profile.semanticCapabilities).toBeDefined();
      expect(profile.deepReviewContext).toBeTruthy();
      expect(profile.testRequirements).toBeDefined();
      expect(typeof profile.testRequirements.minStaticRuleTests).toBe("number");
      expect(typeof profile.testRequirements.minSemanticTests).toBe("number");
      expect(typeof profile.testRequirements.minMigrationTests).toBe("number");
      expect(typeof profile.testRequirements.requireRealWorldTest).toBe("boolean");
    }
  });

  it("every profile has unique id", () => {
    const ids = ALL_PROFILES.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every profile has unique file extensions (no overlaps between profiles)", () => {
    const seen = new Map<string, string>();
    for (const profile of ALL_PROFILES) {
      for (const ext of profile.fileExtensions) {
        const lower = ext.toLowerCase();
        if (seen.has(lower)) {
          // Only fail if a different profile claims the same extension
          // This should not happen in a well-designed system
          expect(seen.get(lower)).toBe(profile.id);
        }
        seen.set(lower, profile.id);
      }
    }
  });

  it("legacy profiles have migration targets", () => {
    const legacyProfiles = ALL_PROFILES.filter((p) => p.category === "legacy");
    for (const profile of legacyProfiles) {
      expect(profile.migrationTargets.length).toBeGreaterThan(0);
    }
  });

  it("legacy profiles have valid suitability ratings", () => {
    const validRatings = ["excellent", "good", "possible", "poor"];
    for (const profile of ALL_PROFILES) {
      for (const target of profile.migrationTargets) {
        expect(validRatings).toContain(target.suitability);
        expect(target.language).toBeTruthy();
        expect(target.rationale).toBeTruthy();
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Fortran profile specifics
// ---------------------------------------------------------------------------

describe("Fortran profile", () => {
  it("is categorized as legacy", () => {
    expect(fortranProfile.category).toBe("legacy");
  });

  it("covers all Fortran file extensions", () => {
    const exts = fortranProfile.fileExtensions;
    expect(exts).toContain(".f");
    expect(exts).toContain(".for");
    expect(exts).toContain(".f77");
    expect(exts).toContain(".f90");
    expect(exts).toContain(".f95");
  });

  it("targets the right industries", () => {
    expect(fortranProfile.industries).toContain("aerospace");
    expect(fortranProfile.industries).toContain("defense");
    expect(fortranProfile.industries).toContain("energy");
  });

  it("has at least 8 static rules defined", () => {
    expect(fortranProfile.staticRules.length).toBeGreaterThanOrEqual(8);
  });

  it("has key Fortran-specific static rules", () => {
    expect(fortranProfile.staticRules).toContain("goto-spaghetti");
    expect(fortranProfile.staticRules).toContain("common-block-abuse");
    expect(fortranProfile.staticRules).toContain("implicit-typing");
    expect(fortranProfile.staticRules).toContain("equivalence-aliasing");
    expect(fortranProfile.staticRules).toContain("obsolete-constructs");
  });

  it("has semantic capabilities enabled", () => {
    expect(fortranProfile.semanticCapabilities.controlFlowAnalysis).toBe(true);
    expect(fortranProfile.semanticCapabilities.dataFlowAnalysis).toBe(true);
    expect(fortranProfile.semanticCapabilities.callGraphExtraction).toBe(true);
    expect(fortranProfile.semanticCapabilities.migrationScoring).toBe(true);
    expect(fortranProfile.semanticCapabilities.numericalAnalysis).toBe(true);
  });

  it("has 4 migration targets", () => {
    expect(fortranProfile.migrationTargets).toHaveLength(4);
    const targetLangs = fortranProfile.migrationTargets.map((t) => t.language);
    expect(targetLangs.some((l) => l.includes("Fortran"))).toBe(true);
    expect(targetLangs.some((l) => l.includes("Python"))).toBe(true);
    expect(targetLangs.some((l) => l.includes("C++"))).toBe(true);
    expect(targetLangs.some((l) => l.includes("Rust"))).toBe(true);
  });

  it("has a real-world test repo defined", () => {
    expect(fortranProfile.testRequirements.requireRealWorldTest).toBe(true);
    expect(fortranProfile.testRequirements.realWorldRepo).toBe("nasa/NASTRAN-93");
  });
});

// ---------------------------------------------------------------------------
// TypeScript profile specifics
// ---------------------------------------------------------------------------

describe("TypeScript profile", () => {
  it("is categorized as modern", () => {
    expect(typescriptProfile.category).toBe("modern");
  });

  it("covers TS, TSX, JS, JSX extensions", () => {
    const exts = typescriptProfile.fileExtensions;
    expect(exts).toContain(".ts");
    expect(exts).toContain(".tsx");
    expect(exts).toContain(".js");
    expect(exts).toContain(".jsx");
  });

  it("has static rules defined", () => {
    expect(typescriptProfile.staticRules.length).toBeGreaterThanOrEqual(5);
  });

  it("has no migration targets (it IS the modern target)", () => {
    expect(typescriptProfile.migrationTargets).toHaveLength(0);
  });

  it("has type system analysis enabled", () => {
    expect(typescriptProfile.semanticCapabilities.typeSystemAnalysis).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Stub profiles
// ---------------------------------------------------------------------------

describe("Stub profiles (COBOL, C/C++, Python, Java, Ada, RPG)", () => {
  const stubs = [cobolProfile, cCppProfile, pythonProfile, javaProfile, adaProfile, rpgProfile];

  it("all have empty staticRules (no rules implemented yet)", () => {
    for (const stub of stubs) {
      expect(stub.staticRules).toHaveLength(0);
    }
  });

  it("all have all semantic capabilities disabled", () => {
    for (const stub of stubs) {
      const caps = Object.values(stub.semanticCapabilities);
      expect(caps.every((c) => c === false)).toBe(true);
    }
  });

  it("all have non-empty deepReviewContext", () => {
    for (const stub of stubs) {
      expect(stub.deepReviewContext.length).toBeGreaterThan(50);
    }
  });
});

// ---------------------------------------------------------------------------
// getProfile()
// ---------------------------------------------------------------------------

describe("getProfile()", () => {
  it("returns fortran profile by id", () => {
    const p = getProfile("fortran");
    expect(p).toBeDefined();
    expect(p!.id).toBe("fortran");
  });

  it("returns typescript profile by id", () => {
    const p = getProfile("typescript");
    expect(p).toBeDefined();
    expect(p!.id).toBe("typescript");
  });

  it("returns undefined for unknown id", () => {
    expect(getProfile("brainfuck")).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// getProfileForFile()
// ---------------------------------------------------------------------------

describe("getProfileForFile()", () => {
  it("maps .f to fortran", () => {
    expect(getProfileForFile("test.f")?.id).toBe("fortran");
  });

  it("maps .f90 to fortran", () => {
    expect(getProfileForFile("solver.f90")?.id).toBe("fortran");
  });

  it("maps .for to fortran", () => {
    expect(getProfileForFile("legacy.for")?.id).toBe("fortran");
  });

  it("maps .ts to typescript", () => {
    expect(getProfileForFile("app.ts")?.id).toBe("typescript");
  });

  it("maps .tsx to typescript", () => {
    expect(getProfileForFile("Component.tsx")?.id).toBe("typescript");
  });

  it("maps .js to typescript", () => {
    expect(getProfileForFile("index.js")?.id).toBe("typescript");
  });

  it("maps .jsx to typescript", () => {
    expect(getProfileForFile("App.jsx")?.id).toBe("typescript");
  });

  it("maps .cob to cobol", () => {
    expect(getProfileForFile("payroll.cob")?.id).toBe("cobol");
  });

  it("maps .c to c-cpp", () => {
    expect(getProfileForFile("main.c")?.id).toBe("c-cpp");
  });

  it("maps .cpp to c-cpp", () => {
    expect(getProfileForFile("engine.cpp")?.id).toBe("c-cpp");
  });

  it("maps .py to python", () => {
    expect(getProfileForFile("script.py")?.id).toBe("python");
  });

  it("maps .java to java", () => {
    expect(getProfileForFile("Service.java")?.id).toBe("java");
  });

  it("maps .adb to ada", () => {
    expect(getProfileForFile("controller.adb")?.id).toBe("ada");
  });

  it("maps .rpgle to rpg", () => {
    expect(getProfileForFile("program.rpgle")?.id).toBe("rpg");
  });

  it("returns undefined for unknown extension", () => {
    expect(getProfileForFile("file.xyz")).toBeUndefined();
  });

  it("handles path with directories", () => {
    expect(getProfileForFile("/src/modules/solver.f90")?.id).toBe("fortran");
  });

  it("is case-insensitive for extensions", () => {
    expect(getProfileForFile("TEST.F90")?.id).toBe("fortran");
    expect(getProfileForFile("app.TS")?.id).toBe("typescript");
  });
});

// ---------------------------------------------------------------------------
// getReadyProfiles()
// ---------------------------------------------------------------------------

describe("getReadyProfiles()", () => {
  it("returns only profiles that meet their test requirements", () => {
    const ready = getReadyProfiles();
    const readyIds = ready.map((p) => p.id);

    // Fortran has all rules, capabilities, and migration targets
    expect(readyIds).toContain("fortran");

    // TypeScript has rules and capabilities but no migration requirement
    expect(readyIds).toContain("typescript");

    // Stubs should NOT be ready
    expect(readyIds).not.toContain("cobol");
    expect(readyIds).not.toContain("c-cpp");
    expect(readyIds).not.toContain("python");
    expect(readyIds).not.toContain("java");
    expect(readyIds).not.toContain("ada");
    expect(readyIds).not.toContain("rpg");
  });

  it("returns non-empty array", () => {
    expect(getReadyProfiles().length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// getProfileStatus()
// ---------------------------------------------------------------------------

describe("getProfileStatus()", () => {
  it("returns ready=true for fortran", () => {
    const status = getProfileStatus("fortran");
    expect(status).toBeDefined();
    expect(status!.ready).toBe(true);
    expect(status!.coverage.static).toBe(100);
  });

  it("returns ready=true for typescript", () => {
    const status = getProfileStatus("typescript");
    expect(status).toBeDefined();
    expect(status!.ready).toBe(true);
  });

  it("returns ready=false for cobol (stub)", () => {
    const status = getProfileStatus("cobol");
    expect(status).toBeDefined();
    expect(status!.ready).toBe(false);
    expect(status!.missingTests.length).toBeGreaterThan(0);
  });

  it("returns ready=false for c-cpp (stub)", () => {
    const status = getProfileStatus("c-cpp");
    expect(status).toBeDefined();
    expect(status!.ready).toBe(false);
  });

  it("returns undefined for unknown language", () => {
    expect(getProfileStatus("haskell")).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Profile Checker
// ---------------------------------------------------------------------------

describe("checkProfileReadiness()", () => {
  it("fortran profile is ready", () => {
    const status = checkProfileReadiness(fortranProfile);
    expect(status.ready).toBe(true);
    expect(status.profileId).toBe("fortran");
    expect(status.staticRuleCoverage).toBe(100);
    expect(status.message).toContain("READY");
  });

  it("typescript profile is ready", () => {
    const status = checkProfileReadiness(typescriptProfile);
    expect(status.ready).toBe(true);
    expect(status.profileId).toBe("typescript");
    expect(status.message).toContain("READY");
  });

  it("cobol profile is not ready", () => {
    const status = checkProfileReadiness(cobolProfile);
    expect(status.ready).toBe(false);
    expect(status.profileId).toBe("cobol");
    expect(status.missingCapabilities.length).toBeGreaterThan(0);
    expect(status.message).toContain("NOT READY");
  });

  it("stub profiles have 0% static rule coverage", () => {
    const status = checkProfileReadiness(cCppProfile);
    expect(status.staticRuleCoverage).toBe(0);
  });

  it("stub profiles have 0% semantic coverage", () => {
    const status = checkProfileReadiness(pythonProfile);
    expect(status.semanticRuleCoverage).toBe(0);
  });
});

describe("checkAllProfiles()", () => {
  it("returns a status for every profile", () => {
    const statuses = checkAllProfiles();
    expect(statuses).toHaveLength(ALL_PROFILES.length);
  });

  it("exactly 2 profiles are ready (fortran, typescript)", () => {
    const statuses = checkAllProfiles();
    const readyCount = statuses.filter((s) => s.ready).length;
    expect(readyCount).toBe(2);
  });
});

describe("getProfileSummary()", () => {
  it("categorizes profiles into ready, partial, and stub", () => {
    const summary = getProfileSummary();
    expect(summary.ready.length).toBeGreaterThan(0);
    expect(summary.stub.length).toBeGreaterThan(0);
    // Fortran and TypeScript should be ready
    expect(summary.ready.some((n) => n.includes("FORTRAN") || n.includes("Fortran"))).toBe(true);
    expect(summary.ready.some((n) => n.includes("TypeScript"))).toBe(true);
  });
});
