/**
 * Language Profile System
 *
 * Pluggable language profiles for deep, language-aware code review.
 * Each profile defines what deep analysis means for THAT specific language:
 * static rules, semantic capabilities, migration targets, and test requirements.
 *
 * To add a new language:
 * 1. Create a LanguageProfile object
 * 2. Add it to ALL_PROFILES
 * 3. Write tests meeting the profile's testRequirements
 * 4. Only then will getReadyProfiles() include it
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SemanticCapabilities {
  controlFlowAnalysis: boolean;
  dataFlowAnalysis: boolean;
  callGraphExtraction: boolean;
  migrationScoring: boolean;
  numericalAnalysis: boolean;
  memoryAnalysis: boolean;
  concurrencyAnalysis: boolean;
  typeSystemAnalysis: boolean;
}

export interface MigrationTargetProfile {
  language: string;
  suitability: "excellent" | "good" | "possible" | "poor";
  rationale: string;
}

export interface ProfileTestRequirements {
  minStaticRuleTests: number;
  minSemanticTests: number;
  minMigrationTests: number;
  requireRealWorldTest: boolean;
  realWorldRepo?: string;
}

export interface LanguageProfile {
  id: string;
  name: string;
  fileExtensions: string[];
  category: "legacy" | "modern";
  industries: string[];
  staticRules: string[];
  semanticCapabilities: SemanticCapabilities;
  migrationTargets: MigrationTargetProfile[];
  deepReviewContext: string;
  testRequirements: ProfileTestRequirements;
}

// ---------------------------------------------------------------------------
// Fortran Profile — COMPLETE (all rules and tests exist)
// ---------------------------------------------------------------------------

export const fortranProfile: LanguageProfile = {
  id: "fortran",
  name: "FORTRAN IV/77/90",
  fileExtensions: [".f", ".for", ".f77", ".fpp", ".f90", ".f95", ".f03", ".f08"],
  category: "legacy",
  industries: ["aerospace", "oil-gas", "defense", "energy", "nuclear", "weather"],
  staticRules: [
    // Fortran-specific static rules
    "goto-spaghetti",
    "common-block-abuse",
    "implicit-typing",
    "equivalence-aliasing",
    "magic-numbers",
    "missing-save",
    "fixed-format-line-length",
    "obsolete-constructs",
    // Universal rules that apply
    "large-file",
    "long-function",
    "too-many-params",
    "deeply-nested",
  ],
  semanticCapabilities: {
    controlFlowAnalysis: true,
    dataFlowAnalysis: true,
    callGraphExtraction: true,
    migrationScoring: true,
    numericalAnalysis: true,
    memoryAnalysis: false,
    concurrencyAnalysis: false,
    typeSystemAnalysis: false,
  },
  migrationTargets: [
    {
      language: "Modern Fortran (F2008+)",
      suitability: "excellent",
      rationale:
        "Preserves performance parity. Adds IMPLICIT NONE, modules, allocatables, and compiler safety. Minimal rewrite needed.",
    },
    {
      language: "Python + NumPy/SciPy",
      suitability: "good",
      rationale:
        "Excellent for prototyping and visualization. NumPy/SciPy cover most numerical routines. 10-100x slower for raw loops.",
    },
    {
      language: "C++",
      suitability: "good",
      rationale:
        "Performance parity with Fortran. Better tooling and ecosystem. Array semantics differ (row-major vs column-major).",
    },
    {
      language: "Rust",
      suitability: "possible",
      rationale:
        "Memory safety without GC. Ideal for safety-critical numerical code. Steep learning curve; scientific ecosystem less mature.",
    },
  ],
  deepReviewContext: `Fortran uses fixed-format (columns 1-6 reserved) or free-format source. Key legacy patterns:
- COMMON blocks for shared mutable state between subroutines
- EQUIVALENCE for memory aliasing (type punning)
- GOTO (simple, computed, assigned) for control flow
- ENTRY points for alternate subroutine entries
- Hollerith constants for archaic string encoding
- Implicit typing (variables I-N are INTEGER, others REAL)
- DATA and BLOCK DATA for initialization
- SAVE to preserve local state between calls
Column 6 continuation character in fixed-format. Labels in columns 1-5.
Numerical stability is critical: watch for catastrophic cancellation, accumulated rounding errors, and ill-conditioned matrices.`,
  testRequirements: {
    minStaticRuleTests: 8,
    minSemanticTests: 5,
    minMigrationTests: 3,
    requireRealWorldTest: true,
    realWorldRepo: "nasa/NASTRAN-93",
  },
};

// ---------------------------------------------------------------------------
// TypeScript/JavaScript Profile — PARTIAL (has some rules)
// ---------------------------------------------------------------------------

export const typescriptProfile: LanguageProfile = {
  id: "typescript",
  name: "TypeScript / JavaScript",
  fileExtensions: [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"],
  category: "modern",
  industries: ["fintech", "saas", "ecommerce", "telecom"],
  staticRules: [
    // TS/JS-specific static rules
    "any-type-abuse",
    "console-log-left",
    "no-error-boundary",
    "callback-hell",
    "unsafe-regex",
    // Universal rules
    "large-file",
    "long-function",
    "too-many-params",
    "deeply-nested",
    "dead-imports",
    "circular-dependency-risk",
    "missing-error-handling",
    "god-class",
    "high-coupling",
    "duplicate-function-names",
  ],
  semanticCapabilities: {
    controlFlowAnalysis: true,
    dataFlowAnalysis: true,
    callGraphExtraction: true,
    migrationScoring: false,
    numericalAnalysis: false,
    memoryAnalysis: false,
    concurrencyAnalysis: true,
    typeSystemAnalysis: true,
  },
  migrationTargets: [],
  deepReviewContext: `TypeScript/JavaScript review focuses on:
- Type safety: any-type abuse, missing return types, unsafe assertions
- Async patterns: promise leaks, unhandled rejections, race conditions
- React patterns: unnecessary re-renders, missing keys, effect dependencies
- Module structure: circular imports, barrel file bloat, tree-shaking issues
- Error handling: uncaught promise rejections, missing error boundaries
- Security: prototype pollution, ReDoS, XSS via dangerouslySetInnerHTML`,
  testRequirements: {
    minStaticRuleTests: 5,
    minSemanticTests: 4,
    minMigrationTests: 0,
    requireRealWorldTest: true,
  },
};

// ---------------------------------------------------------------------------
// COBOL Profile — STUB (future)
// ---------------------------------------------------------------------------

export const cobolProfile: LanguageProfile = {
  id: "cobol",
  name: "COBOL",
  fileExtensions: [".cob", ".cbl", ".cpy", ".ccp"],
  category: "legacy",
  industries: ["banking", "insurance", "government", "healthcare"],
  staticRules: [
    // COBOL-specific static rules
    "cobol-large-paragraph",
    "cobol-goto-usage",
    "cobol-deep-nesting",
    "cobol-dead-paragraphs",
    "cobol-perform-thru",
    "cobol-data-division-bloat",
    "cobol-redefines-aliasing",
    "cobol-hardcoded-values",
    "cobol-file-status-unchecked",
    "cobol-missing-file-status",
    "cobol-paragraph-naming",
    "cobol-copybook-pollution",
    "cobol-obsolete-verbs",
    "cobol-comp3-opportunity",
    // Semantic rules
    "cobol-perform-chain",
    "cobol-data-flow-through-copy",
    "cobol-migration-readiness",
    // Universal rules that apply
    "large-file",
    "long-function",
    "deeply-nested",
  ],
  semanticCapabilities: {
    controlFlowAnalysis: true,
    dataFlowAnalysis: true,
    callGraphExtraction: true,
    migrationScoring: true,
    numericalAnalysis: false,
    memoryAnalysis: false,
    concurrencyAnalysis: false,
    typeSystemAnalysis: false,
  },
  migrationTargets: [
    {
      language: "Java",
      suitability: "excellent",
      rationale:
        "Mature enterprise ecosystem. Strong COBOL-to-Java migration tooling (Micro Focus, IBM). Record structures map well to classes.",
    },
    {
      language: "C#",
      suitability: "good",
      rationale:
        "Modern .NET platform with strong typing. COBOL PICTURE clauses map to formatted strings and decimal types.",
    },
    {
      language: "Python",
      suitability: "possible",
      rationale:
        "Good for batch processing replacement. Weaker for high-throughput transaction processing COBOL excels at.",
    },
  ],
  deepReviewContext: `COBOL uses PICTURE clauses for data formatting, PERFORM THRU for control flow, COPY for code reuse, REDEFINES for memory aliasing (like Fortran EQUIVALENCE), 88-level condition names for boolean flags, and VSAM/ISAM for file organization. Divisions: IDENTIFICATION, ENVIRONMENT, DATA, PROCEDURE.
Key patterns: paragraph-based control flow with PERFORM, nested EVALUATE (switch), STRING/UNSTRING for text manipulation, COMPUTE for arithmetic, and MOVE CORRESPONDING for bulk field assignment.
Watch for: implicit decimal scaling via PIC 9(5)V99, REDEFINES aliasing bugs, PERFORM THRU fall-through, and COPY REPLACING macro expansion issues.`,
  testRequirements: {
    minStaticRuleTests: 8,
    minSemanticTests: 5,
    minMigrationTests: 3,
    requireRealWorldTest: true,
    realWorldRepo: "aws-samples/aws-mainframe-modernization-carddemo",
  },
};

// ---------------------------------------------------------------------------
// C/C++ Profile — STUB (future)
// ---------------------------------------------------------------------------

export const cCppProfile: LanguageProfile = {
  id: "c-cpp",
  name: "C / C++",
  fileExtensions: [".c", ".h", ".cpp", ".hpp", ".cc", ".cxx", ".hxx", ".hh"],
  category: "legacy",
  industries: ["manufacturing", "automotive", "telecom", "embedded", "scada"],
  staticRules: [],
  semanticCapabilities: {
    controlFlowAnalysis: false,
    dataFlowAnalysis: false,
    callGraphExtraction: false,
    migrationScoring: false,
    numericalAnalysis: false,
    memoryAnalysis: false,
    concurrencyAnalysis: false,
    typeSystemAnalysis: false,
  },
  migrationTargets: [
    {
      language: "Rust",
      suitability: "excellent",
      rationale:
        "Memory safety without GC. Eliminates use-after-free, buffer overflows, data races. C FFI for incremental migration.",
    },
    {
      language: "Modern C++ (C++20/23)",
      suitability: "good",
      rationale:
        "Gradual modernization path. Smart pointers, ranges, concepts, modules. Same toolchain and ecosystem.",
    },
    {
      language: "Go",
      suitability: "possible",
      rationale:
        "Good for network services and CLI tools. GC overhead makes it unsuitable for hard real-time or embedded.",
    },
  ],
  deepReviewContext: `C/C++ review focuses on memory safety and undefined behavior:
- Buffer overflows, use-after-free, double-free, dangling pointers
- Integer overflow/underflow, signed/unsigned mismatch
- Null pointer dereference, uninitialized variables
- Race conditions in multi-threaded code (mutex, atomics)
- Resource leaks (file handles, sockets, memory)
- Macro pitfalls, include-order dependencies
- ABI compatibility, alignment issues
- C++ specific: RAII violations, exception safety, template metaprogramming complexity, virtual destructor omission`,
  testRequirements: {
    minStaticRuleTests: 10,
    minSemanticTests: 6,
    minMigrationTests: 3,
    requireRealWorldTest: true,
  },
};

// ---------------------------------------------------------------------------
// Python Profile — STUB (future)
// ---------------------------------------------------------------------------

export const pythonProfile: LanguageProfile = {
  id: "python",
  name: "Python",
  fileExtensions: [".py", ".pyi", ".pyw"],
  category: "modern",
  industries: ["fintech", "data-science", "ml-ai", "automation"],
  staticRules: [],
  semanticCapabilities: {
    controlFlowAnalysis: false,
    dataFlowAnalysis: false,
    callGraphExtraction: false,
    migrationScoring: false,
    numericalAnalysis: false,
    memoryAnalysis: false,
    concurrencyAnalysis: false,
    typeSystemAnalysis: false,
  },
  migrationTargets: [],
  deepReviewContext: `Python review focuses on:
- Type safety: missing type hints, Any abuse, runtime type errors
- Performance: GIL contention, unnecessary copies, N+1 queries
- Security: pickle deserialization, eval/exec injection, SQL injection
- Async patterns: mixed sync/async, blocking in event loop, unawaited coroutines
- Package hygiene: pinned versions, circular imports, __init__.py bloat
- Data science: pandas anti-patterns, memory-inefficient operations, non-vectorized loops`,
  testRequirements: {
    minStaticRuleTests: 6,
    minSemanticTests: 4,
    minMigrationTests: 0,
    requireRealWorldTest: true,
  },
};

// ---------------------------------------------------------------------------
// Java Profile — STUB (future)
// ---------------------------------------------------------------------------

export const javaProfile: LanguageProfile = {
  id: "java",
  name: "Java",
  fileExtensions: [".java"],
  category: "modern",
  industries: ["banking", "enterprise", "telecom", "government"],
  staticRules: [],
  semanticCapabilities: {
    controlFlowAnalysis: false,
    dataFlowAnalysis: false,
    callGraphExtraction: false,
    migrationScoring: false,
    numericalAnalysis: false,
    memoryAnalysis: false,
    concurrencyAnalysis: false,
    typeSystemAnalysis: false,
  },
  migrationTargets: [
    {
      language: "Kotlin",
      suitability: "excellent",
      rationale:
        "100% Java interop. Null safety, coroutines, data classes. Incremental migration file-by-file.",
    },
    {
      language: "Go",
      suitability: "good",
      rationale:
        "Excellent for microservices. Simpler deployment (single binary). Less suitable for complex domain models.",
    },
  ],
  deepReviewContext: `Java review focuses on:
- Null safety: NullPointerException risks, Optional misuse
- Concurrency: synchronized blocks, thread safety, CompletableFuture patterns
- Memory: GC pressure, object allocation in hot loops, finalize() anti-pattern
- Design: God classes, anemic domain models, over-abstraction
- Spring: circular bean dependencies, N+1 queries, missing @Transactional
- Security: deserialization attacks, SQL injection, SSRF`,
  testRequirements: {
    minStaticRuleTests: 6,
    minSemanticTests: 4,
    minMigrationTests: 2,
    requireRealWorldTest: true,
  },
};

// ---------------------------------------------------------------------------
// Ada Profile — STUB (future)
// ---------------------------------------------------------------------------

export const adaProfile: LanguageProfile = {
  id: "ada",
  name: "Ada",
  fileExtensions: [".adb", ".ads", ".ada"],
  category: "legacy",
  industries: ["defense", "aerospace", "rail", "nuclear", "air-traffic"],
  staticRules: [],
  semanticCapabilities: {
    controlFlowAnalysis: false,
    dataFlowAnalysis: false,
    callGraphExtraction: false,
    migrationScoring: false,
    numericalAnalysis: false,
    memoryAnalysis: false,
    concurrencyAnalysis: false,
    typeSystemAnalysis: false,
  },
  migrationTargets: [
    {
      language: "Rust",
      suitability: "excellent",
      rationale:
        "Same safety guarantees (memory, concurrency, type). Ownership model maps well to Ada's access types and SPARK contracts.",
    },
    {
      language: "Modern Ada (Ada 2022)",
      suitability: "good",
      rationale:
        "Incremental modernization within the same language. Adds contracts, iterators, parallel blocks.",
    },
    {
      language: "C++",
      suitability: "possible",
      rationale:
        "Wider talent pool but loses Ada's safety guarantees. Only suitable with strict coding standards (MISRA C++).",
    },
  ],
  deepReviewContext: `Ada review focuses on safety-critical patterns:
- Tasking: rendezvous, protected objects, entry barriers, priority inversion
- Strong typing: subtypes, range constraints, discriminated records
- SPARK subset: formal verification annotations, proof obligations
- Exception handling: propagation rules, last-chance handler
- Representation clauses: memory layout, endianness, bit-level packing
- Generic instantiation: constrained generics, formal packages
- Ravenscar/Jorvik profiles: restricted tasking for real-time systems`,
  testRequirements: {
    minStaticRuleTests: 8,
    minSemanticTests: 5,
    minMigrationTests: 3,
    requireRealWorldTest: true,
  },
};

// ---------------------------------------------------------------------------
// RPG Profile — STUB (future)
// ---------------------------------------------------------------------------

export const rpgProfile: LanguageProfile = {
  id: "rpg",
  name: "RPG (AS/400)",
  fileExtensions: [".rpg", ".rpgle", ".sqlrpgle"],
  category: "legacy",
  industries: ["banking", "insurance", "logistics", "manufacturing"],
  staticRules: [],
  semanticCapabilities: {
    controlFlowAnalysis: false,
    dataFlowAnalysis: false,
    callGraphExtraction: false,
    migrationScoring: false,
    numericalAnalysis: false,
    memoryAnalysis: false,
    concurrencyAnalysis: false,
    typeSystemAnalysis: false,
  },
  migrationTargets: [
    {
      language: "Java",
      suitability: "excellent",
      rationale:
        "IBM's recommended path. RPG data structures map to POJOs. DB2/400 access via JDBC. Mature migration tooling.",
    },
    {
      language: "C#",
      suitability: "good",
      rationale:
        "Strong typing, LINQ for data access. .NET ecosystem for enterprise. ASNA Visual RPG as bridge.",
    },
    {
      language: "Python",
      suitability: "possible",
      rationale:
        "Good for batch processing and reporting. Less suitable for high-throughput OLTP that RPG handles natively.",
    },
  ],
  deepReviewContext: `RPG review focuses on AS/400-specific patterns:
- Fixed-format vs free-format RPG (RPG III vs RPG IV/ILE)
- Indicator-based logic (*INxx flags for screen I/O and control flow)
- Embedded SQL (EXEC SQL) vs native file I/O (READ, WRITE, CHAIN, SETLL)
- Data areas and data queues for inter-program communication
- Program-described vs externally-described files
- Subroutine-based (BEGSR/ENDSR) vs procedure-based (DCL-PROC) structure
- MOVE and MOVEL for data conversion (implicit casting)
- Cycle-based processing (RPG program cycle) vs linear-main`,
  testRequirements: {
    minStaticRuleTests: 6,
    minSemanticTests: 3,
    minMigrationTests: 3,
    requireRealWorldTest: true,
  },
};

// ---------------------------------------------------------------------------
// ALL_PROFILES — Master registry
// ---------------------------------------------------------------------------

export const ALL_PROFILES: LanguageProfile[] = [
  fortranProfile,
  typescriptProfile,
  cobolProfile,
  cCppProfile,
  pythonProfile,
  javaProfile,
  adaProfile,
  rpgProfile,
];

// ---------------------------------------------------------------------------
// Extension-to-profile lookup (built once, cached)
// ---------------------------------------------------------------------------

const extensionMap = new Map<string, LanguageProfile>();
for (const profile of ALL_PROFILES) {
  for (const ext of profile.fileExtensions) {
    extensionMap.set(ext.toLowerCase(), profile);
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Get a language profile by its ID.
 */
export function getProfile(languageId: string): LanguageProfile | undefined {
  return ALL_PROFILES.find((p) => p.id === languageId);
}

/**
 * Get the language profile for a file based on its extension.
 */
export function getProfileForFile(filePath: string): LanguageProfile | undefined {
  const lastDot = filePath.lastIndexOf(".");
  if (lastDot === -1) return undefined;
  const ext = filePath.slice(lastDot).toLowerCase();
  return extensionMap.get(ext);
}

/**
 * Return profiles that meet their test requirements.
 *
 * A profile is considered "ready" if it has static rules defined
 * AND at least some semantic capabilities enabled. Stub profiles
 * (no static rules, all capabilities false) are never ready.
 */
export function getReadyProfiles(): LanguageProfile[] {
  return ALL_PROFILES.filter((p) => isProfileReady(p));
}

/**
 * Get detailed readiness status for a specific profile.
 */
export function getProfileStatus(languageId: string): {
  ready: boolean;
  missingTests: string[];
  coverage: { static: number; semantic: number; migration: number };
} | undefined {
  const profile = getProfile(languageId);
  if (!profile) return undefined;

  const missingTests: string[] = [];

  // Static rule coverage: % of staticRules that are non-empty
  const staticCount = profile.staticRules.length;
  const staticRequired = profile.testRequirements.minStaticRuleTests;
  const staticCoverage = staticRequired > 0 ? Math.min(1, staticCount / staticRequired) : 1;
  if (staticCount < staticRequired) {
    missingTests.push(
      `Need ${staticRequired - staticCount} more static rules (have ${staticCount}, need ${staticRequired})`,
    );
  }

  // Semantic coverage: count of enabled capabilities vs minimum tests
  const enabledCapabilities = Object.values(profile.semanticCapabilities).filter(Boolean).length;
  const semanticRequired = profile.testRequirements.minSemanticTests;
  const semanticCoverage = semanticRequired > 0 ? Math.min(1, enabledCapabilities / semanticRequired) : 1;
  if (enabledCapabilities < semanticRequired) {
    missingTests.push(
      `Need ${semanticRequired - enabledCapabilities} more semantic capabilities (have ${enabledCapabilities}, need ${semanticRequired})`,
    );
  }

  // Migration coverage: migration targets vs minimum tests
  const migrationCount = profile.migrationTargets.length;
  const migrationRequired = profile.testRequirements.minMigrationTests;
  const migrationCoverage = migrationRequired > 0 ? Math.min(1, migrationCount / migrationRequired) : 1;
  if (migrationCount < migrationRequired) {
    missingTests.push(
      `Need ${migrationRequired - migrationCount} more migration targets (have ${migrationCount}, need ${migrationRequired})`,
    );
  }

  const ready = isProfileReady(profile);

  return {
    ready,
    missingTests,
    coverage: {
      static: Math.round(staticCoverage * 100),
      semantic: Math.round(semanticCoverage * 100),
      migration: Math.round(migrationCoverage * 100),
    },
  };
}

// ---------------------------------------------------------------------------
// Internal helper
// ---------------------------------------------------------------------------

function isProfileReady(profile: LanguageProfile): boolean {
  // Must have static rules defined
  if (profile.staticRules.length === 0) return false;

  // Must meet minimum static rule count
  if (profile.staticRules.length < profile.testRequirements.minStaticRuleTests) return false;

  // Must have at least some semantic capabilities
  const enabledCapabilities = Object.values(profile.semanticCapabilities).filter(Boolean).length;
  if (enabledCapabilities === 0) return false;

  // Must meet minimum migration target count (if required)
  if (
    profile.testRequirements.minMigrationTests > 0 &&
    profile.migrationTargets.length < profile.testRequirements.minMigrationTests
  ) {
    return false;
  }

  return true;
}
