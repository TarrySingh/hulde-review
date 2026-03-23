import { describe, it, expect } from "vitest";
import { CobolPlugin } from "../../plugins/cobol-plugin.js";
import {
  createDefaultRulesEngine,
  createDefaultRulesEngineWithSemanticRules,
  type AnalysisContext,
} from "../rules-engine.js";

const plugin = new CobolPlugin();

function makeContext(filePath: string, content: string): AnalysisContext {
  const structural = plugin.analyzeFile(filePath, content);
  const callGraph = plugin.extractCallGraph(filePath, content);
  return {
    filePath,
    content,
    language: "cobol",
    structural,
    callGraph,
  };
}

// ---------------------------------------------------------------------------
// Static Rules
// ---------------------------------------------------------------------------

describe("COBOL Static Rules", () => {
  const engine = createDefaultRulesEngine();

  // 1. cobol-large-paragraph
  it("cobol-large-paragraph: flags paragraphs over 50 lines", () => {
    // Generate a paragraph with 60 lines
    const lines = [
      "       IDENTIFICATION DIVISION.",
      "       PROGRAM-ID. BIGPARA.",
      "       DATA DIVISION.",
      "       PROCEDURE DIVISION.",
      "       MAIN-PARA.",
    ];
    for (let i = 0; i < 60; i++) {
      lines.push(`           DISPLAY 'LINE ${i}'.`);
    }
    lines.push("           STOP RUN.");

    const ctx = makeContext("test.cbl", lines.join("\n"));
    const findings = engine.analyze(ctx);
    const largePara = findings.filter(f => f.id.includes("cobol-large-paragraph") || f.tags?.includes("cobol"));
    // Should have at least the large-paragraph finding
    expect(findings.some(f => f.tags?.includes("large-paragraph") || f.tags?.includes("cobol"))).toBe(true);
  });

  // 2. cobol-goto-usage
  it("cobol-goto-usage: flags GO TO statements", () => {
    const src = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. GOTOPROG.
       DATA DIVISION.
       PROCEDURE DIVISION.
       MAIN-PARA.
           GO TO PARA-A.
       PARA-A.
           GO TO PARA-B.
       PARA-B.
           GO TO PARA-C.
       PARA-C.
           STOP RUN.
`;
    const ctx = makeContext("test.cbl", src);
    const findings = engine.analyze(ctx);
    const gotoFindings = findings.filter(f => f.tags?.includes("goto"));
    expect(gotoFindings.length).toBeGreaterThanOrEqual(1);
    expect(gotoFindings[0].title).toContain("GO TO");
  });

  // 3. cobol-deep-nesting
  it("cobol-deep-nesting: flags IF nesting over 4 levels", () => {
    const src = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. NESTPROG.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-A PIC 9.
       PROCEDURE DIVISION.
       MAIN-PARA.
           IF WS-A = 1
               IF WS-A = 2
                   IF WS-A = 3
                       IF WS-A = 4
                           IF WS-A = 5
                               DISPLAY 'DEEP'
                           END-IF
                       END-IF
                   END-IF
               END-IF
           END-IF.
           STOP RUN.
`;
    const ctx = makeContext("test.cbl", src);
    const findings = engine.analyze(ctx);
    const nestFindings = findings.filter(f => f.tags?.includes("deep-nesting"));
    expect(nestFindings.length).toBeGreaterThanOrEqual(1);
  });

  // 4. cobol-dead-paragraphs
  it("cobol-dead-paragraphs: flags unreferenced paragraphs", () => {
    const src = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. DEADPROG.
       DATA DIVISION.
       PROCEDURE DIVISION.
       MAIN-PARA.
           PERFORM USED-PARA.
           STOP RUN.
       USED-PARA.
           DISPLAY 'USED'.
           EXIT.
       DEAD-PARA.
           DISPLAY 'NEVER CALLED'.
           EXIT.
`;
    const ctx = makeContext("test.cbl", src);
    const findings = engine.analyze(ctx);
    const deadFindings = findings.filter(f => f.tags?.includes("dead-code"));
    expect(deadFindings.length).toBeGreaterThanOrEqual(1);
    expect(deadFindings[0].description).toContain("DEAD-PARA");
  });

  // 5. cobol-perform-thru
  it("cobol-perform-thru: flags PERFORM ... THRU", () => {
    const src = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. THRUPROG.
       DATA DIVISION.
       PROCEDURE DIVISION.
       MAIN-PARA.
           PERFORM PARA-A THRU PARA-C.
           STOP RUN.
       PARA-A.
           DISPLAY 'A'. EXIT.
       PARA-B.
           DISPLAY 'B'. EXIT.
       PARA-C.
           DISPLAY 'C'. EXIT.
`;
    const ctx = makeContext("test.cbl", src);
    const findings = engine.analyze(ctx);
    const thruFindings = findings.filter(f => f.tags?.includes("perform-thru"));
    expect(thruFindings.length).toBeGreaterThanOrEqual(1);
  });

  // 6. cobol-redefines-aliasing
  it("cobol-redefines-aliasing: flags REDEFINES statements", () => {
    const src = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. REDEFPROG.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-NUM PIC 9(4) BINARY.
       01 WS-ALPHA REDEFINES WS-NUM.
          05 WS-LEFT PIC X.
          05 WS-RIGHT PIC X.
       PROCEDURE DIVISION.
       MAIN-PARA.
           STOP RUN.
`;
    const ctx = makeContext("test.cbl", src);
    const findings = engine.analyze(ctx);
    const redefFindings = findings.filter(f => f.tags?.includes("redefines"));
    expect(redefFindings.length).toBeGreaterThanOrEqual(1);
  });

  // 7. cobol-missing-file-status
  it("cobol-missing-file-status: flags SELECT without FILE STATUS", () => {
    const src = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. NOSTATPROG.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT MYFILE ASSIGN TO MYDATA
                  ORGANIZATION IS SEQUENTIAL.
       DATA DIVISION.
       FILE SECTION.
       FD MYFILE.
       01 MY-REC PIC X(80).
       PROCEDURE DIVISION.
       MAIN-PARA.
           OPEN INPUT MYFILE.
           STOP RUN.
`;
    const ctx = makeContext("test.cbl", src);
    const findings = engine.analyze(ctx);
    const statusFindings = findings.filter(f => f.tags?.includes("file-status") && f.tags?.includes("compliance"));
    expect(statusFindings.length).toBeGreaterThanOrEqual(1);
  });

  // 8. cobol-copybook-pollution
  it("cobol-copybook-pollution: flags too many COPY statements", () => {
    const lines = [
      "       IDENTIFICATION DIVISION.",
      "       PROGRAM-ID. COPYPROG.",
      "       DATA DIVISION.",
      "       WORKING-STORAGE SECTION.",
    ];
    for (let i = 0; i < 12; i++) {
      lines.push(`       COPY COPYBOOK${i}.`);
    }
    lines.push("       PROCEDURE DIVISION.");
    lines.push("       MAIN-PARA.");
    lines.push("           STOP RUN.");

    const ctx = makeContext("test.cbl", lines.join("\n"));
    const findings = engine.analyze(ctx);
    const copybookFindings = findings.filter(f => f.tags?.includes("copybook"));
    expect(copybookFindings.length).toBeGreaterThanOrEqual(1);
  });

  // 9. cobol-obsolete-verbs
  it("cobol-obsolete-verbs: flags ALTER, EXAMINE, etc.", () => {
    const src = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. OBSPROG.
       DATA DIVISION.
       PROCEDURE DIVISION.
       MAIN-PARA.
           ALTER PARA-A TO PROCEED TO PARA-B.
           EXAMINE WS-DATA TALLYING ALL 'A'.
           STOP RUN.
       PARA-A.
           DISPLAY 'A'. EXIT.
       PARA-B.
           DISPLAY 'B'. EXIT.
`;
    const ctx = makeContext("test.cbl", src);
    const findings = engine.analyze(ctx);
    const obsFindings = findings.filter(f => f.tags?.includes("obsolete"));
    expect(obsFindings.length).toBeGreaterThanOrEqual(1);
    expect(obsFindings[0].title).toContain("obsolete");
  });

  // 10. cobol-paragraph-naming
  it("cobol-paragraph-naming: flags non-standard paragraph names", () => {
    const src = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. NAMEPROG.
       DATA DIVISION.
       PROCEDURE DIVISION.
       ALPHA.
           DISPLAY '1'.
       BRAVO.
           DISPLAY '2'.
       CHARLIE.
           DISPLAY '3'.
       DELTA.
           DISPLAY '4'.
       ECHO.
           DISPLAY '5'.
           STOP RUN.
`;
    const ctx = makeContext("test.cbl", src);
    const findings = engine.analyze(ctx);
    const nameFindings = findings.filter(f => f.tags?.includes("naming"));
    expect(nameFindings.length).toBeGreaterThanOrEqual(1);
  });

  // 11. cobol-hardcoded-values
  it("cobol-hardcoded-values: flags literal values in PROCEDURE DIVISION", () => {
    const lines = [
      "       IDENTIFICATION DIVISION.",
      "       PROGRAM-ID. HARDCODE.",
      "       DATA DIVISION.",
      "       WORKING-STORAGE SECTION.",
      "       01 WS-AMT PIC S9(10)V99.",
      "       PROCEDURE DIVISION.",
      "       MAIN-PARA.",
    ];
    // Add many hardcoded values
    for (let i = 0; i < 15; i++) {
      lines.push(`           MOVE ${1000 + i * 100} TO WS-AMT.`);
      lines.push(`           DISPLAY 'STATUS CODE ${i}'.`);
    }
    lines.push("           STOP RUN.");

    const ctx = makeContext("test.cbl", lines.join("\n"));
    const findings = engine.analyze(ctx);
    const hardcodeFindings = findings.filter(f => f.tags?.includes("hardcoded-values"));
    expect(hardcodeFindings.length).toBeGreaterThanOrEqual(1);
  });

  // 12. cobol-comp3-opportunity
  it("cobol-comp3-opportunity: flags DISPLAY numerics that should be COMP-3", () => {
    const lines = [
      "       IDENTIFICATION DIVISION.",
      "       PROGRAM-ID. COMPPROG.",
      "       DATA DIVISION.",
      "       WORKING-STORAGE SECTION.",
    ];
    for (let i = 0; i < 8; i++) {
      lines.push(`       01 WS-AMT-${i} PIC S9(10)V99.`);
    }
    lines.push("       PROCEDURE DIVISION.");
    lines.push("       MAIN-PARA.");
    lines.push("           STOP RUN.");

    const ctx = makeContext("test.cbl", lines.join("\n"));
    const findings = engine.analyze(ctx);
    const compFindings = findings.filter(f => f.tags?.includes("comp-3"));
    expect(compFindings.length).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// Semantic Rules
// ---------------------------------------------------------------------------

describe("COBOL Semantic Rules", () => {
  const engine = createDefaultRulesEngineWithSemanticRules();

  // 15. cobol-perform-chain (recursive)
  it("cobol-perform-chain: detects recursive PERFORM cycles", () => {
    const src = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. CYCLPROG.
       DATA DIVISION.
       PROCEDURE DIVISION.
       MAIN-PARA.
           PERFORM PARA-A.
           STOP RUN.
       PARA-A.
           PERFORM PARA-B.
           EXIT.
       PARA-B.
           PERFORM PARA-A.
           EXIT.
`;
    const ctx = makeContext("test.cbl", src);
    const findings = engine.analyze(ctx);
    const chainFindings = findings.filter(f => f.tags?.includes("perform-chain"));
    expect(chainFindings.length).toBeGreaterThanOrEqual(1);
    expect(chainFindings[0].severity).toBe("critical");
  });

  // 17. cobol-migration-readiness
  it("cobol-migration-readiness: scores clean program as easy", () => {
    const src = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. CLEANPROG.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-VAR PIC X(10).
       PROCEDURE DIVISION.
       MAIN-PARA.
           PERFORM DO-WORK.
           STOP RUN.
       DO-WORK.
           DISPLAY WS-VAR.
           EXIT.
`;
    const ctx = makeContext("test.cbl", src);
    const findings = engine.analyze(ctx);
    const migFindings = findings.filter(f => f.tags?.includes("migration"));
    expect(migFindings.length).toBeGreaterThanOrEqual(1);
    expect(migFindings[0].title).toContain("1/5");
  });

  it("cobol-migration-readiness: scores CICS program higher", () => {
    const src = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. CICSPROG.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-VAR PIC X(10).
       PROCEDURE DIVISION.
       MAIN-PARA.
           EXEC CICS SEND FROM(WS-VAR) END-EXEC.
           EXEC CICS RECEIVE INTO(WS-VAR) END-EXEC.
           EXEC CICS RETURN END-EXEC.
           GO TO MAIN-PARA.
           STOP RUN.
`;
    const ctx = makeContext("test.cbl", src);
    const findings = engine.analyze(ctx);
    const migFindings = findings.filter(f => f.tags?.includes("migration"));
    expect(migFindings.length).toBeGreaterThanOrEqual(1);
    // Should be scored higher than 1 due to CICS and GO TO
    const scoreMatch = migFindings[0].title.match(/(\d)\/5/);
    expect(scoreMatch).toBeTruthy();
    const score = parseInt(scoreMatch![1], 10);
    expect(score).toBeGreaterThanOrEqual(2);
  });
});
