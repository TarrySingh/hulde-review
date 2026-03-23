import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";
import { CobolPlugin } from "../cobol-plugin.js";
import {
  createDefaultRulesEngineWithSemanticRules,
  type AnalysisContext,
} from "../../review/rules-engine.js";

const CARDDEMO_ROOT = "/Users/tarrysingh/Documents/GitHub/aws-mainframe-modernization-carddemo";
const CBACT01C_PATH = `${CARDDEMO_ROOT}/app/cbl/CBACT01C.cbl`;
const COSGN00C_PATH = `${CARDDEMO_ROOT}/app/cbl/COSGN00C.cbl`;

const plugin = new CobolPlugin();
const engine = createDefaultRulesEngineWithSemanticRules();

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

// Skip if CardDemo repo is not available
const hasCardDemo = existsSync(CBACT01C_PATH);

describe.skipIf(!hasCardDemo)("COBOL CardDemo Real-World Integration", () => {
  describe("CBACT01C.cbl — Batch Account Processing", () => {
    const content = readFileSync(CBACT01C_PATH, "utf-8");
    const result = plugin.analyzeFile(CBACT01C_PATH, content);
    const callGraph = plugin.extractCallGraph(CBACT01C_PATH, content);

    it("extracts PROGRAM-ID CBACT01C", () => {
      const program = result.functions.find(f => f.name === "CBACT01C");
      expect(program).toBeDefined();
      expect(program!.returnType).toBe("PROGRAM");
    });

    it("extracts SELECT statements (file dependencies)", () => {
      const fileImports = result.imports.filter(i => i.source.startsWith("FILE/"));
      expect(fileImports.length).toBeGreaterThanOrEqual(3);
      const sources = fileImports.map(i => i.source);
      expect(sources).toContain("FILE/ACCTFILE");
    });

    it("extracts FD entries", () => {
      const fdClasses = result.classes.filter(c => c.name.startsWith("FD-"));
      expect(fdClasses.length).toBeGreaterThanOrEqual(1);
    });

    it("extracts WORKING-STORAGE items", () => {
      const wsItems = result.classes.filter(c => !c.name.startsWith("FD-"));
      expect(wsItems.length).toBeGreaterThanOrEqual(5);
    });

    it("extracts COPY statements", () => {
      const copyImports = result.imports.filter(
        i => !i.source.startsWith("FILE/") && i.source !== "REDEFINES"
      );
      expect(copyImports.length).toBeGreaterThanOrEqual(2);
      const copyNames = copyImports.map(i => i.source);
      expect(copyNames).toContain("CVACT01Y");
    });

    it("extracts REDEFINES", () => {
      const redefines = result.imports.filter(i => i.source === "REDEFINES");
      expect(redefines.length).toBeGreaterThanOrEqual(1);
    });

    it("extracts paragraphs from PROCEDURE DIVISION", () => {
      const paragraphs = result.functions.filter(f => f.returnType !== "PROGRAM");
      expect(paragraphs.length).toBeGreaterThanOrEqual(10);
      const names = paragraphs.map(f => f.name);
      expect(names).toContain("0000-ACCTFILE-OPEN");
      expect(names).toContain("1000-ACCTFILE-GET-NEXT");
      expect(names).toContain("9999-ABEND-PROGRAM");
    });

    it("extracts PERFORM call graph entries", () => {
      const performs = callGraph.filter(e => !e.callee.includes("'") && !e.callee.includes('"'));
      expect(performs.length).toBeGreaterThanOrEqual(10);
    });

    it("extracts CALL 'CEE3ABD' in call graph", () => {
      const cee3abd = callGraph.filter(e => e.callee === "CEE3ABD");
      expect(cee3abd.length).toBeGreaterThanOrEqual(1);
    });

    it("rules engine produces findings", () => {
      const ctx = makeContext(CBACT01C_PATH, content);
      const findings = engine.analyze(ctx);
      expect(findings.length).toBeGreaterThanOrEqual(1);
      // Should have at least migration readiness finding
      const migFindings = findings.filter(f => f.tags?.includes("migration"));
      expect(migFindings.length).toBeGreaterThanOrEqual(1);
    });

    it("88-level condition names are extracted", () => {
      // APPL-AOK and APPL-EOF are 88-levels under APPL-RESULT
      const applResult = result.classes.find(c => c.name === "APPL-RESULT");
      expect(applResult).toBeDefined();
      const has88 = applResult!.properties.some(p => p.startsWith("88:"));
      expect(has88).toBe(true);
    });
  });

  describe("COSGN00C.cbl — CICS Signon Screen", () => {
    const content = readFileSync(COSGN00C_PATH, "utf-8");
    const result = plugin.analyzeFile(COSGN00C_PATH, content);

    it("extracts PROGRAM-ID COSGN00C", () => {
      const program = result.functions.find(f => f.name === "COSGN00C");
      expect(program).toBeDefined();
    });

    it("extracts CICS-related copybooks (DFHAID, DFHBMSCA)", () => {
      const copyImports = result.imports.filter(
        i => !i.source.startsWith("FILE/") && i.source !== "REDEFINES"
      );
      const copyNames = copyImports.map(i => i.source);
      expect(copyNames).toContain("DFHAID");
      expect(copyNames).toContain("DFHBMSCA");
    });

    it("rules engine detects CICS patterns for migration scoring", () => {
      const ctx = makeContext(COSGN00C_PATH, content);
      const findings = engine.analyze(ctx);
      const migFindings = findings.filter(f => f.tags?.includes("migration"));
      expect(migFindings.length).toBeGreaterThanOrEqual(1);
      // CICS program should score > 1
      const scoreMatch = migFindings[0].title.match(/(\d)\/5/);
      expect(scoreMatch).toBeTruthy();
      const score = parseInt(scoreMatch![1], 10);
      expect(score).toBeGreaterThanOrEqual(2);
    });
  });
});
