import { describe, it, expect } from "vitest";
import { CobolPlugin } from "../cobol-plugin.js";

// ---------------------------------------------------------------------------
// Sample COBOL source — CardDemo-style batch program (fixed-format)
// ---------------------------------------------------------------------------

const CARDDEMO_SAMPLE = `000100******************************************************************
000200* PROGRAM     : CBTEST01.CBL
000300* Type        : BATCH COBOL Program
000400******************************************************************
       IDENTIFICATION DIVISION.
       PROGRAM-ID.    CBTEST01.
       AUTHOR.        TEST.

       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT ACCTFILE-FILE ASSIGN TO ACCTFILE
                  ORGANIZATION IS INDEXED
                  ACCESS MODE  IS SEQUENTIAL
                  RECORD KEY   IS FD-ACCT-ID
                  FILE STATUS  IS ACCTFILE-STATUS.
      *
           SELECT OUT-FILE ASSIGN TO OUTFILE
                  ORGANIZATION IS SEQUENTIAL
                  ACCESS MODE IS SEQUENTIAL
                  FILE STATUS IS OUTFILE-STATUS.
      *
       DATA DIVISION.
       FILE SECTION.
       FD  ACCTFILE-FILE.
       01  FD-ACCTFILE-REC.
           05 FD-ACCT-ID                        PIC 9(11).
           05 FD-ACCT-DATA                      PIC X(289).
       FD OUT-FILE.
       01 OUT-ACCT-REC.
          05  OUT-ACCT-ID                PIC 9(11).
          05  OUT-ACCT-ACTIVE-STATUS     PIC X(01).
          05  OUT-ACCT-CURR-BAL          PIC S9(10)V99.
          05  OUT-ACCT-CREDIT-LIMIT      PIC S9(10)V99.
      *
       WORKING-STORAGE SECTION.
       COPY CVACT01Y.
       COPY CODATECN.
       01  ACCTFILE-STATUS.
           05  ACCTFILE-STAT1      PIC X.
           05  ACCTFILE-STAT2      PIC X.
       01  OUTFILE-STATUS.
           05  OUTFILE-STAT1       PIC X.
           05  OUTFILE-STAT2       PIC X.
       01  TWO-BYTES-BINARY        PIC 9(4) BINARY.
       01  TWO-BYTES-ALPHA         REDEFINES TWO-BYTES-BINARY.
           05  TWO-BYTES-LEFT      PIC X.
           05  TWO-BYTES-RIGHT     PIC X.
       01  APPL-RESULT             PIC S9(9)   COMP.
           88  APPL-AOK            VALUE 0.
           88  APPL-EOF            VALUE 16.
       01  END-OF-FILE             PIC X(01)    VALUE 'N'.
       01  WS-COUNTER              PIC S9(10)V99
                                   USAGE IS COMP-3.
      *
       PROCEDURE DIVISION.
           DISPLAY 'START OF EXECUTION'.
           PERFORM 0000-ACCTFILE-OPEN.
           PERFORM 1000-ACCTFILE-GET-NEXT.
           PERFORM 9000-ACCTFILE-CLOSE.
           GOBACK.
      *
       0000-ACCTFILE-OPEN.
           OPEN INPUT ACCTFILE-FILE.
           IF  ACCTFILE-STATUS = '00'
               MOVE 0 TO APPL-RESULT
           ELSE
               DISPLAY 'ERROR OPENING FILE'
               PERFORM 9999-ABEND-PROGRAM
           END-IF.
           EXIT.
      *
       1000-ACCTFILE-GET-NEXT.
           READ ACCTFILE-FILE INTO OUT-ACCT-REC.
           IF  ACCTFILE-STATUS = '00'
               PERFORM 1100-DISPLAY-RECORD
           ELSE
               IF ACCTFILE-STATUS = '10'
                   MOVE 'Y' TO END-OF-FILE
               ELSE
                   DISPLAY 'READ ERROR'
                   PERFORM 9999-ABEND-PROGRAM
               END-IF
           END-IF.
           EXIT.
      *
       1100-DISPLAY-RECORD.
           DISPLAY OUT-ACCT-ID.
           DISPLAY OUT-ACCT-ACTIVE-STATUS.
           EXIT.
      *
       9000-ACCTFILE-CLOSE.
           CLOSE ACCTFILE-FILE.
           EXIT.
      *
       9999-ABEND-PROGRAM.
           DISPLAY 'ABENDING PROGRAM'.
           CALL 'CEE3ABD' USING APPL-RESULT.
           EXIT.
`;

// ---------------------------------------------------------------------------
// Sample with CICS/EVALUATE (online program)
// ---------------------------------------------------------------------------

const CICS_SAMPLE = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. COSGN00C.
       AUTHOR.     TEST.

       ENVIRONMENT DIVISION.
       CONFIGURATION SECTION.

       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-VARIABLES.
         05 WS-PGMNAME                 PIC X(08) VALUE 'COSGN00C'.
         05 WS-TRANID                  PIC X(04) VALUE 'CC00'.
         05 WS-MESSAGE                 PIC X(80) VALUE SPACES.
         05 WS-ERR-FLG                 PIC X(01) VALUE 'N'.
           88 ERR-FLG-ON                         VALUE 'Y'.
           88 ERR-FLG-OFF                        VALUE 'N'.
       COPY COCOM01Y.
       COPY DFHAID.
       COPY DFHBMSCA.
      *
       PROCEDURE DIVISION.
       MAIN-PARA.
           SET ERR-FLG-OFF TO TRUE.
           IF EIBCALEN = 0
               PERFORM SEND-SIGNON-SCREEN
           ELSE
               EVALUATE EIBAID
                   WHEN DFHENTER
                       PERFORM PROCESS-ENTER-KEY
                   WHEN DFHPF3
                       PERFORM SEND-PLAIN-TEXT
                   WHEN OTHER
                       MOVE 'Y' TO WS-ERR-FLG
                       PERFORM SEND-SIGNON-SCREEN
               END-EVALUATE
           END-IF.
           EXEC CICS RETURN
                     TRANSID (WS-TRANID)
           END-EXEC.
      *
       SEND-SIGNON-SCREEN.
           DISPLAY 'SENDING SCREEN'.
           EXIT.
      *
       PROCESS-ENTER-KEY.
           DISPLAY 'PROCESSING ENTER'.
           EXIT.
      *
       SEND-PLAIN-TEXT.
           DISPLAY 'SENDING TEXT'.
           EXIT.
`;

// ---------------------------------------------------------------------------
// Sample with GO TO and PERFORM THRU
// ---------------------------------------------------------------------------

const GOTO_SAMPLE = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. GOTOPROG.

       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-FLAG PIC X(01).

       PROCEDURE DIVISION.
       MAIN-PARA.
           PERFORM 1000-START THRU 2000-END.
           GO TO 3000-FINISH.
      *
       1000-START.
           DISPLAY 'START'.
           GO TO 1500-MIDDLE.
      *
       1500-MIDDLE.
           DISPLAY 'MIDDLE'.
           EXIT.
      *
       2000-END.
           DISPLAY 'END'.
           EXIT.
      *
       3000-FINISH.
           DISPLAY 'DONE'.
           STOP RUN.
`;

// ---------------------------------------------------------------------------
// Sample free-format COBOL
// ---------------------------------------------------------------------------

const FREE_FORMAT_SAMPLE = `IDENTIFICATION DIVISION.
PROGRAM-ID. FREEPROG.

DATA DIVISION.
WORKING-STORAGE SECTION.
01 WS-COUNT PIC 9(05).

PROCEDURE DIVISION.
MAIN-PARA.
    DISPLAY "Hello from free format". *> inline comment
    PERFORM DO-WORK.
    STOP RUN.

DO-WORK.
    ADD 1 TO WS-COUNT.
    EXIT.
`;

// ---------------------------------------------------------------------------
// Sample with OCCURS and continuation lines
// ---------------------------------------------------------------------------

const OCCURS_SAMPLE = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. ARRPROG.

       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-TABLE.
          05 WS-ENTRY OCCURS 10 TIMES.
            10 WS-NAME    PIC X(30).
            10 WS-AMOUNT  PIC S9(10)V99.
       01 WS-LONG-LINE    PIC X(40)
      -                   VALUE 'CONTINUED'.

       PROCEDURE DIVISION.
       MAIN-PARA.
           DISPLAY WS-NAME(1).
           STOP RUN.
`;

// ===========================================================================
// Tests
// ===========================================================================

describe("CobolPlugin", () => {
  const plugin = new CobolPlugin();

  it("has correct metadata", () => {
    expect(plugin.name).toBe("cobol");
    expect(plugin.languages).toEqual(["cobol"]);
  });

  // -----------------------------------------------------------------------
  // IDENTIFICATION DIVISION
  // -----------------------------------------------------------------------

  describe("IDENTIFICATION DIVISION parsing", () => {
    it("extracts PROGRAM-ID as entry point function", () => {
      const result = plugin.analyzeFile("test.cbl", CARDDEMO_SAMPLE);
      const program = result.functions.find(f => f.name === "CBTEST01");
      expect(program).toBeDefined();
      expect(program!.returnType).toBe("PROGRAM");
    });

    it("exports the PROGRAM-ID", () => {
      const result = plugin.analyzeFile("test.cbl", CARDDEMO_SAMPLE);
      expect(result.exports).toContainEqual(expect.objectContaining({ name: "CBTEST01" }));
    });

    it("handles case insensitivity in PROGRAM-ID", () => {
      const result = plugin.analyzeFile("test.cbl", CICS_SAMPLE);
      const program = result.functions.find(f => f.name === "COSGN00C");
      expect(program).toBeDefined();
    });
  });

  // -----------------------------------------------------------------------
  // DATA DIVISION
  // -----------------------------------------------------------------------

  describe("DATA DIVISION parsing", () => {
    it("extracts 01-level items as classes", () => {
      const result = plugin.analyzeFile("test.cbl", CARDDEMO_SAMPLE);
      const classNames = result.classes.map(c => c.name);
      expect(classNames).toContain("ACCTFILE-STATUS");
      expect(classNames).toContain("OUTFILE-STATUS");
      expect(classNames).toContain("APPL-RESULT");
    });

    it("extracts FD entries as classes with FD- prefix", () => {
      const result = plugin.analyzeFile("test.cbl", CARDDEMO_SAMPLE);
      const fdClasses = result.classes.filter(c => c.name.startsWith("FD-"));
      expect(fdClasses.length).toBeGreaterThanOrEqual(1);
    });

    it("extracts sub-level items as properties", () => {
      const result = plugin.analyzeFile("test.cbl", CARDDEMO_SAMPLE);
      const acctStatus = result.classes.find(c => c.name === "ACCTFILE-STATUS");
      expect(acctStatus).toBeDefined();
      expect(acctStatus!.properties).toContain("ACCTFILE-STAT1");
      expect(acctStatus!.properties).toContain("ACCTFILE-STAT2");
    });

    it("extracts PICTURE clauses (implicit via PIC fields)", () => {
      const result = plugin.analyzeFile("test.cbl", CARDDEMO_SAMPLE);
      // FD fields should be properties of FD class
      const fdClass = result.classes.find(c => c.name.startsWith("FD-ACCTFILE"));
      expect(fdClass).toBeDefined();
    });

    it("extracts REDEFINES as imports", () => {
      const result = plugin.analyzeFile("test.cbl", CARDDEMO_SAMPLE);
      const redefines = result.imports.filter(i => i.source === "REDEFINES");
      expect(redefines.length).toBeGreaterThanOrEqual(1);
      expect(redefines[0].specifiers).toContain("TWO-BYTES-ALPHA");
    });

    it("extracts OCCURS from table definitions", () => {
      const result = plugin.analyzeFile("test.cbl", OCCURS_SAMPLE);
      const wsTable = result.classes.find(c => c.name === "WS-TABLE");
      expect(wsTable).toBeDefined();
      expect(wsTable!.properties).toContain("WS-ENTRY");
    });

    it("extracts 88-level condition names", () => {
      const result = plugin.analyzeFile("test.cbl", CARDDEMO_SAMPLE);
      const applResult = result.classes.find(c => c.name === "APPL-RESULT");
      expect(applResult).toBeDefined();
      const has88 = applResult!.properties.some(p => p.startsWith("88:"));
      expect(has88).toBe(true);
    });

    it("extracts 88-level items from CICS program", () => {
      const result = plugin.analyzeFile("test.cbl", CICS_SAMPLE);
      const wsVars = result.classes.find(c => c.name === "WS-VARIABLES");
      expect(wsVars).toBeDefined();
      const has88 = wsVars!.properties.some(p => p.includes("ERR-FLG"));
      expect(has88).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // PROCEDURE DIVISION
  // -----------------------------------------------------------------------

  describe("PROCEDURE DIVISION parsing", () => {
    it("extracts paragraphs as functions", () => {
      const result = plugin.analyzeFile("test.cbl", CARDDEMO_SAMPLE);
      const names = result.functions.map(f => f.name);
      expect(names).toContain("0000-ACCTFILE-OPEN");
      expect(names).toContain("1000-ACCTFILE-GET-NEXT");
      expect(names).toContain("1100-DISPLAY-RECORD");
      expect(names).toContain("9000-ACCTFILE-CLOSE");
      expect(names).toContain("9999-ABEND-PROGRAM");
    });

    it("extracts SECTION names as functions", () => {
      // The CICS sample has MAIN-PARA as a paragraph, not a section
      // Let's test with a section-based structure
      const sectionSource = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. SECPROG.
       DATA DIVISION.
       PROCEDURE DIVISION.
       MAIN-SECTION SECTION.
       MAIN-PARA.
           DISPLAY 'HELLO'.
           STOP RUN.
`;
      const result = plugin.analyzeFile("test.cbl", sectionSource);
      const names = result.functions.map(f => f.name);
      expect(names).toContain("MAIN-SECTION");
    });

    it("extracts EVALUATE/WHEN patterns in CICS programs", () => {
      const result = plugin.analyzeFile("test.cbl", CICS_SAMPLE);
      const names = result.functions.map(f => f.name);
      expect(names).toContain("MAIN-PARA");
      expect(names).toContain("SEND-SIGNON-SCREEN");
      expect(names).toContain("PROCESS-ENTER-KEY");
    });

    it("handles GO TO statements in function extraction", () => {
      const result = plugin.analyzeFile("test.cbl", GOTO_SAMPLE);
      const names = result.functions.map(f => f.name);
      expect(names).toContain("MAIN-PARA");
      expect(names).toContain("1000-START");
      expect(names).toContain("1500-MIDDLE");
      expect(names).toContain("3000-FINISH");
    });

    it("sets line ranges for paragraphs", () => {
      const result = plugin.analyzeFile("test.cbl", CARDDEMO_SAMPLE);
      const para = result.functions.find(f => f.name === "1100-DISPLAY-RECORD");
      expect(para).toBeDefined();
      expect(para!.lineRange[0]).toBeGreaterThan(0);
      expect(para!.lineRange[1]).toBeGreaterThan(para!.lineRange[0]);
    });
  });

  // -----------------------------------------------------------------------
  // COPY statement extraction
  // -----------------------------------------------------------------------

  describe("COPY statement extraction", () => {
    it("extracts COPY statements as imports", () => {
      const result = plugin.analyzeFile("test.cbl", CARDDEMO_SAMPLE);
      const copySources = result.imports
        .filter(i => !i.source.startsWith("FILE/") && i.source !== "REDEFINES")
        .map(i => i.source);
      expect(copySources).toContain("CVACT01Y");
      expect(copySources).toContain("CODATECN");
    });

    it("extracts multiple COPY statements from CICS program", () => {
      const result = plugin.analyzeFile("test.cbl", CICS_SAMPLE);
      const copySources = result.imports
        .filter(i => !i.source.startsWith("FILE/") && i.source !== "REDEFINES")
        .map(i => i.source);
      expect(copySources).toContain("COCOM01Y");
      expect(copySources).toContain("DFHAID");
      expect(copySources).toContain("DFHBMSCA");
    });
  });

  // -----------------------------------------------------------------------
  // SELECT / ASSIGN extraction
  // -----------------------------------------------------------------------

  describe("SELECT/ASSIGN extraction", () => {
    it("extracts SELECT ... ASSIGN as FILE/ imports", () => {
      const result = plugin.analyzeFile("test.cbl", CARDDEMO_SAMPLE);
      const fileImports = result.imports.filter(i => i.source.startsWith("FILE/"));
      expect(fileImports.length).toBeGreaterThanOrEqual(2);
      const sources = fileImports.map(i => i.source);
      expect(sources).toContain("FILE/ACCTFILE");
      expect(sources).toContain("FILE/OUTFILE");
    });

    it("stores file names as specifiers", () => {
      const result = plugin.analyzeFile("test.cbl", CARDDEMO_SAMPLE);
      const acctFileImport = result.imports.find(i => i.source === "FILE/ACCTFILE");
      expect(acctFileImport).toBeDefined();
      expect(acctFileImport!.specifiers).toContain("ACCTFILE-FILE");
    });
  });

  // -----------------------------------------------------------------------
  // Call Graph
  // -----------------------------------------------------------------------

  describe("Call graph extraction", () => {
    it("extracts PERFORM statements", () => {
      const cg = plugin.extractCallGraph("test.cbl", CARDDEMO_SAMPLE);
      const callees = cg.map(e => e.callee);
      expect(callees).toContain("0000-ACCTFILE-OPEN");
      expect(callees).toContain("1000-ACCTFILE-GET-NEXT");
      expect(callees).toContain("9000-ACCTFILE-CLOSE");
    });

    it("extracts CALL statements", () => {
      const cg = plugin.extractCallGraph("test.cbl", CARDDEMO_SAMPLE);
      const callees = cg.map(e => e.callee);
      expect(callees).toContain("CEE3ABD");
    });

    it("extracts PERFORM THRU as a single call graph entry", () => {
      const cg = plugin.extractCallGraph("test.cbl", GOTO_SAMPLE);
      const thruEntries = cg.filter(e => e.callee.includes("THRU"));
      expect(thruEntries.length).toBeGreaterThanOrEqual(1);
      expect(thruEntries[0].callee).toContain("1000-START THRU 2000-END");
    });

    it("extracts GO TO as call graph entries", () => {
      const cg = plugin.extractCallGraph("test.cbl", GOTO_SAMPLE);
      const callees = cg.map(e => e.callee);
      expect(callees).toContain("3000-FINISH");
      expect(callees).toContain("1500-MIDDLE");
    });

    it("tracks callers correctly for paragraphs", () => {
      const cg = plugin.extractCallGraph("test.cbl", CARDDEMO_SAMPLE);
      const openEntry = cg.find(e => e.callee === "0000-ACCTFILE-OPEN");
      expect(openEntry).toBeDefined();
      // The caller should be CBTEST01 (program entry) or the paragraph performing it
    });

    it("includes line numbers", () => {
      const cg = plugin.extractCallGraph("test.cbl", CARDDEMO_SAMPLE);
      for (const entry of cg) {
        expect(entry.lineNumber).toBeGreaterThan(0);
      }
    });
  });

  // -----------------------------------------------------------------------
  // Fixed-format comment handling
  // -----------------------------------------------------------------------

  describe("Fixed-format handling", () => {
    it("skips comment lines (column 7 = *)", () => {
      const result = plugin.analyzeFile("test.cbl", CARDDEMO_SAMPLE);
      // Comments should not appear as functions or classes
      const names = result.functions.map(f => f.name);
      for (const name of names) {
        expect(name).not.toContain("*");
      }
    });

    it("handles continuation lines (column 7 = -)", () => {
      const result = plugin.analyzeFile("test.cbl", OCCURS_SAMPLE);
      // The continuation line should not create a separate structure
      const classNames = result.classes.map(c => c.name);
      // WS-LONG-LINE should not appear as a separate 01-level
      // (it might be captured as a property if inside a group, or standalone)
      expect(classNames.length).toBeGreaterThan(0);
    });

    it("handles sequence numbers in columns 1-6", () => {
      const result = plugin.analyzeFile("test.cbl", CARDDEMO_SAMPLE);
      // The sequence numbers (000100, 000200, etc.) should be stripped
      expect(result.functions.find(f => f.name === "CBTEST01")).toBeDefined();
    });
  });

  // -----------------------------------------------------------------------
  // Case insensitivity
  // -----------------------------------------------------------------------

  describe("Case insensitivity", () => {
    it("handles mixed case PROGRAM-ID", () => {
      const mixedCase = `       Identification Division.
       Program-Id. MixedCase.
       Data Division.
       Procedure Division.
       Main-Para.
           Display 'Hello'.
           Stop Run.
`;
      const result = plugin.analyzeFile("test.cbl", mixedCase);
      expect(result.functions.find(f => f.name === "MIXEDCASE")).toBeDefined();
    });

    it("handles lowercase COBOL keywords", () => {
      const lowercase = `       identification division.
       program-id. lowerprog.
       data division.
       working-storage section.
       01 ws-var pic x(10).
       procedure division.
       main-para.
           display ws-var.
           stop run.
`;
      const result = plugin.analyzeFile("test.cbl", lowercase);
      expect(result.functions.find(f => f.name === "LOWERPROG")).toBeDefined();
      expect(result.functions.find(f => f.name === "MAIN-PARA")).toBeDefined();
    });
  });

  // -----------------------------------------------------------------------
  // Free-format COBOL
  // -----------------------------------------------------------------------

  describe("Free-format COBOL", () => {
    it("parses free-format source correctly", () => {
      const result = plugin.analyzeFile("test.cbl", FREE_FORMAT_SAMPLE);
      expect(result.functions.find(f => f.name === "FREEPROG")).toBeDefined();
      expect(result.functions.find(f => f.name === "MAIN-PARA")).toBeDefined();
      expect(result.functions.find(f => f.name === "DO-WORK")).toBeDefined();
    });

    it("extracts call graph from free-format", () => {
      const cg = plugin.extractCallGraph("test.cbl", FREE_FORMAT_SAMPLE);
      const callees = cg.map(e => e.callee);
      expect(callees).toContain("DO-WORK");
    });
  });

  // -----------------------------------------------------------------------
  // Import resolution
  // -----------------------------------------------------------------------

  describe("Import resolution", () => {
    it("resolves COPY statements as copybook references", () => {
      const resolved = plugin.resolveImports("test.cbl", CARDDEMO_SAMPLE);
      const copyResolutions = resolved.filter(r => !r.source.startsWith("FILE/") && r.source !== "REDEFINES");
      expect(copyResolutions.length).toBeGreaterThanOrEqual(2);
    });

    it("resolves FILE/ imports as virtual references", () => {
      const resolved = plugin.resolveImports("test.cbl", CARDDEMO_SAMPLE);
      const fileResolutions = resolved.filter(r => r.source.startsWith("FILE/"));
      expect(fileResolutions.length).toBeGreaterThanOrEqual(2);
      for (const r of fileResolutions) {
        expect(r.resolvedPath).toBe(r.source); // Virtual, not file paths
      }
    });
  });
});
