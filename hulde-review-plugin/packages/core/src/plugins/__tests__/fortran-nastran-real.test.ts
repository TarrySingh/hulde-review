/**
 * Integration test: run FortranPlugin against real NASA NASTRAN-93 source files.
 * Validates the plugin works on production legacy code, not just synthetic samples.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { FortranPlugin } from "../fortran-plugin.js";

const NASTRAN_DIR = "/Users/tarrysingh/Documents/GitHub/NASTRAN-93";
const BTSTRP_PATH = `${NASTRAN_DIR}/mis/btstrp.f`;

const nastranAvailable = existsSync(BTSTRP_PATH);

describe.skipIf(!nastranAvailable)("FortranPlugin — real NASTRAN-93 btstrp.f", () => {
  const plugin = new FortranPlugin();
  const content = nastranAvailable ? readFileSync(BTSTRP_PATH, "utf-8") : "";
  const result = plugin.analyzeFile(BTSTRP_PATH, content);
  const callGraph = plugin.extractCallGraph!(BTSTRP_PATH, content);

  it("finds BTSTRP subroutine", () => {
    const btstrp = result.functions.find((f) => f.name === "BTSTRP");
    expect(btstrp).toBeDefined();
    expect(btstrp!.lineRange[0]).toBe(1);
  });

  it("extracts EXTERNAL declarations", () => {
    const names = result.exports.map((e) => e.name);
    expect(names).toContain("LSHIFT");
    expect(names).toContain("RSHIFT");
    expect(names).toContain("ANDF");
    expect(names).toContain("COMPLF");
  });

  it("extracts multiple COMMON blocks", () => {
    const commonImports = result.imports.filter((i) => i.source.startsWith("COMMON/"));
    const blockNames = commonImports.map((i) => i.source.replace("COMMON/", ""));
    expect(blockNames).toContain("MACHIN");
    expect(blockNames).toContain("SYSTEM");
    expect(blockNames).toContain("LHPWX");
    expect(blockNames).toContain("TWO");
  });

  it("detects EQUIVALENCE aliasing", () => {
    const equiv = result.imports.find((i) => i.source === "EQUIVALENCE");
    expect(equiv).toBeDefined();
    expect(equiv!.specifiers).toContain("ALIASING_WARNING");
  });

  it("extracts CALL graph entries", () => {
    expect(callGraph.length).toBeGreaterThan(0);
    // BTSTRP should call various routines
    const callers = [...new Set(callGraph.map((e) => e.caller))];
    expect(callers).toContain("BTSTRP");
  });

  it("handles continuation lines correctly (multi-line COMMON, INTEGER declarations)", () => {
    // The real btstrp.f has extensive continuation lines
    // If continuation handling is broken, we'd get parse errors or missing data
    expect(result.functions.length).toBeGreaterThanOrEqual(1);
    expect(result.imports.length).toBeGreaterThan(3);
  });
});
