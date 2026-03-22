/**
 * Fortran Analyzer Plugin — regex-based parser for FORTRAN IV/66/77/90/95/2003/2008.
 *
 * Handles both fixed-format (columns 1-72) and free-format Fortran.
 * Designed for production use on massive legacy codebases (e.g. NASA NASTRAN-93).
 *
 * This is the first legacy-language plugin in the hulde-review pipeline.
 * The pattern established here will be replicated for COBOL, Ada, Pascal, RPG, PL/I, etc.
 */

import { dirname, resolve, extname } from "node:path";
import type {
  AnalyzerPlugin,
  StructuralAnalysis,
  ImportResolution,
  CallGraphEntry,
} from "../types.js";

// ---------------------------------------------------------------------------
// Format detection
// ---------------------------------------------------------------------------

type FortranFormat = "fixed" | "free";

const FIXED_EXTENSIONS = new Set([".f", ".for", ".f77", ".fpp"]);
const FREE_EXTENSIONS = new Set([".f90", ".f95", ".f03", ".f08"]);

function detectFormat(filePath: string, content: string): FortranFormat {
  const ext = extname(filePath).toLowerCase();
  if (FIXED_EXTENSIONS.has(ext)) return "fixed";
  if (FREE_EXTENSIONS.has(ext)) return "free";

  // Heuristic: if more than 40% of non-empty lines have a character in column 1
  // that looks like a fixed-format comment (C, c, *, !) or column-6 continuation,
  // treat as fixed-format.
  const lines = content.split("\n");
  let fixedIndicators = 0;
  let nonEmpty = 0;
  for (const line of lines) {
    if (line.trim().length === 0) continue;
    nonEmpty++;
    const ch = line[0];
    if (ch === "C" || ch === "c" || ch === "*") {
      fixedIndicators++;
    } else if (line.length >= 6 && /^\s{5}\S/.test(line.slice(0, 6)) && !/^\s{5}\s/.test(line.slice(0, 7))) {
      // Column 6 continuation character
      fixedIndicators++;
    }
  }
  if (nonEmpty === 0) return "free";
  return fixedIndicators / nonEmpty > 0.15 ? "fixed" : "free";
}

// ---------------------------------------------------------------------------
// Pre-processing: join continuation lines and strip comments
// ---------------------------------------------------------------------------

interface SourceLine {
  /** The cleaned source text (trimmed of column restrictions) */
  text: string;
  /** Original 1-based line number this text starts on */
  lineNumber: number;
}

/**
 * Pre-process fixed-format Fortran:
 *  - Strip comment lines (col 1 = C, c, *, !)
 *  - Extract columns 7-72 as source text
 *  - Join continuation lines (col 6 non-blank, non-zero)
 *  - Track original line numbers
 */
function preprocessFixed(content: string): SourceLine[] {
  const rawLines = content.split("\n");
  const result: SourceLine[] = [];

  for (let i = 0; i < rawLines.length; i++) {
    const raw = rawLines[i];
    // Skip completely empty lines
    if (raw.length === 0) continue;

    const ch1 = raw[0];
    // Comment line
    if (ch1 === "C" || ch1 === "c" || ch1 === "*" || ch1 === "!") continue;

    // Extract source portion (columns 7-72, 0-indexed 6-71)
    const sourcePart = raw.length > 6 ? raw.slice(6, 72) : "";
    if (sourcePart.trim().length === 0) continue;

    // Check if this is a continuation line (col 6 is non-blank, non-zero)
    const col6 = raw.length >= 6 ? raw[5] : " ";
    const isContinuation = col6 !== " " && col6 !== "0" && col6 !== undefined;

    if (isContinuation && result.length > 0) {
      // Append to previous logical line
      result[result.length - 1].text += " " + sourcePart.trimStart();
    } else {
      result.push({
        text: sourcePart,
        lineNumber: i + 1,
      });
    }
  }

  return result;
}

/**
 * Pre-process free-format Fortran:
 *  - Strip comment portions (! to end of line, but not inside strings)
 *  - Join continuation lines (& at end of line)
 *  - Track original line numbers
 */
function preprocessFree(content: string): SourceLine[] {
  const rawLines = content.split("\n");
  const result: SourceLine[] = [];

  let pendingLine: SourceLine | null = null;

  for (let i = 0; i < rawLines.length; i++) {
    let line = rawLines[i];

    // Strip inline comments (simple: find ! outside of quotes)
    line = stripFreeComment(line);

    if (line.trim().length === 0) continue;

    // Check for continuation: & at end of line
    const trimmed = line.trimEnd();
    const hasContinuation = trimmed.endsWith("&");

    const cleanText = hasContinuation ? trimmed.slice(0, -1) : trimmed;

    if (pendingLine) {
      // This line continues the previous one; strip leading &
      let appendText = cleanText.trimStart();
      if (appendText.startsWith("&")) {
        appendText = appendText.slice(1).trimStart();
      }
      pendingLine.text += " " + appendText;
      if (!hasContinuation) {
        result.push(pendingLine);
        pendingLine = null;
      }
    } else if (hasContinuation) {
      pendingLine = { text: cleanText, lineNumber: i + 1 };
    } else {
      result.push({ text: cleanText, lineNumber: i + 1 });
    }
  }

  // Flush any pending continuation
  if (pendingLine) {
    result.push(pendingLine);
  }

  return result;
}

function stripFreeComment(line: string): string {
  let inString: string | null = null;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inString) {
      if (ch === inString) {
        inString = null;
      }
    } else {
      if (ch === "'" || ch === '"') {
        inString = ch;
      } else if (ch === "!") {
        return line.slice(0, i);
      }
    }
  }
  return line;
}

// ---------------------------------------------------------------------------
// Regex patterns (case-insensitive)
// ---------------------------------------------------------------------------

// SUBROUTINE name(args)
const RE_SUBROUTINE = /^\s*SUBROUTINE\s+(\w+)\s*(?:\(([^)]*)\))?/i;

// [type] FUNCTION name(args) [RESULT(r)]
const RE_FUNCTION = /^\s*(?:(INTEGER|REAL|DOUBLE\s+PRECISION|COMPLEX|LOGICAL|CHARACTER(?:\s*\*\s*\w+)?)\s+)?FUNCTION\s+(\w+)\s*(?:\(([^)]*)\))?/i;

// PROGRAM name
const RE_PROGRAM = /^\s*PROGRAM\s+(\w+)/i;

// MODULE name (but not MODULE PROCEDURE or MODULE FUNCTION or MODULE SUBROUTINE)
const RE_MODULE = /^\s*MODULE\s+(?!PROCEDURE\b|FUNCTION\b|SUBROUTINE\b)(\w+)/i;

// END [SUBROUTINE|FUNCTION|PROGRAM|MODULE] [name]
const RE_END = /^\s*END\s*(SUBROUTINE|FUNCTION|PROGRAM|MODULE|BLOCK\s*DATA)?\s*(\w*)/i;

// COMMON /blockname/ variables
const RE_COMMON = /COMMON\s+\/(\w+)\//ig;

// INCLUDE 'filename'
const RE_INCLUDE = /^\s*INCLUDE\s+['"]([^'"]+)['"]/i;

// USE module [, ONLY: ...]
const RE_USE = /^\s*USE\s+(\w+)(?:\s*,\s*ONLY\s*:\s*(.+))?/i;

// CALL subroutine(args)
const RE_CALL = /\bCALL\s+(\w+)/ig;

// EXTERNAL name1, name2, ...
const RE_EXTERNAL = /^\s*EXTERNAL\s+(.+)/i;

// ENTRY name(args)
const RE_ENTRY = /^\s*ENTRY\s+(\w+)\s*(?:\(([^)]*)\))?/i;

// BLOCK DATA [name]
const RE_BLOCK_DATA = /^\s*BLOCK\s*DATA\s*(\w*)/i;

// EQUIVALENCE (a, b), (c, d) — we just flag it
const RE_EQUIVALENCE = /^\s*EQUIVALENCE\s/i;

// CONTAINS (F90+) — marks start of module procedures
const RE_CONTAINS = /^\s*CONTAINS\s*$/i;

// ---------------------------------------------------------------------------
// The plugin
// ---------------------------------------------------------------------------

export class FortranPlugin implements AnalyzerPlugin {
  readonly name = "fortran";
  readonly languages = ["fortran"];

  analyzeFile(filePath: string, content: string): StructuralAnalysis {
    const format = detectFormat(filePath, content);
    const lines = format === "fixed"
      ? preprocessFixed(content)
      : preprocessFree(content);

    const functions: StructuralAnalysis["functions"] = [];
    const classes: StructuralAnalysis["classes"] = [];
    const imports: StructuralAnalysis["imports"] = [];
    const exports: StructuralAnalysis["exports"] = [];

    // Track current scope for MODULE → class mapping
    let currentModule: {
      name: string;
      startLine: number;
      methods: string[];
      properties: string[];
    } | null = null;

    // Track current function/subroutine for line range tracking
    let currentUnit: {
      name: string;
      startLine: number;
      params: string[];
      returnType?: string;
      kind: "subroutine" | "function" | "program" | "block_data";
    } | null = null;

    // Track whether we're in the CONTAINS section of a module
    let inContains = false;

    for (let idx = 0; idx < lines.length; idx++) {
      const { text, lineNumber } = lines[idx];
      const upperText = text.toUpperCase().trim();

      // --- END statement ---
      const endMatch = RE_END.exec(text);
      if (endMatch && upperText.startsWith("END")) {
        const endKind = (endMatch[1] || "").toUpperCase().trim();

        if (endKind.startsWith("BLOCK") || (!endKind && currentUnit?.kind === "block_data")) {
          // End of BLOCK DATA
          if (currentUnit) {
            functions.push({
              name: currentUnit.name,
              lineRange: [currentUnit.startLine, lineNumber],
              params: currentUnit.params,
              returnType: currentUnit.returnType,
            });
            currentUnit = null;
          }
        } else if (endKind === "MODULE" || (!endKind && currentModule && !currentUnit)) {
          // End of MODULE
          if (currentModule) {
            classes.push({
              name: currentModule.name,
              lineRange: [currentModule.startLine, lineNumber],
              methods: currentModule.methods,
              properties: currentModule.properties,
            });
            currentModule = null;
            inContains = false;
          }
        } else if (
          endKind === "SUBROUTINE" ||
          endKind === "FUNCTION" ||
          endKind === "PROGRAM" ||
          (!endKind && currentUnit)
        ) {
          // End of subprogram
          if (currentUnit) {
            functions.push({
              name: currentUnit.name,
              lineRange: [currentUnit.startLine, lineNumber],
              params: currentUnit.params,
              returnType: currentUnit.returnType,
            });
            // If inside a module CONTAINS, add as module method
            if (currentModule && inContains) {
              currentModule.methods.push(currentUnit.name);
            }
            currentUnit = null;
          }
        }
        continue;
      }

      // --- CONTAINS ---
      if (RE_CONTAINS.test(text)) {
        inContains = true;
        continue;
      }

      // --- BLOCK DATA ---
      const blockDataMatch = RE_BLOCK_DATA.exec(text);
      if (blockDataMatch && upperText.startsWith("BLOCK")) {
        const name = blockDataMatch[1] || "BLOCK_DATA";
        currentUnit = {
          name: name.toUpperCase(),
          startLine: lineNumber,
          params: [],
          kind: "block_data",
        };
        continue;
      }

      // --- MODULE ---
      const moduleMatch = RE_MODULE.exec(text);
      if (moduleMatch) {
        currentModule = {
          name: moduleMatch[1].toUpperCase(),
          startLine: lineNumber,
          methods: [],
          properties: [],
        };
        inContains = false;
        continue;
      }

      // --- PROGRAM ---
      const programMatch = RE_PROGRAM.exec(text);
      if (programMatch) {
        currentUnit = {
          name: programMatch[1].toUpperCase(),
          startLine: lineNumber,
          params: [],
          kind: "program",
        };
        continue;
      }

      // --- SUBROUTINE ---
      const subMatch = RE_SUBROUTINE.exec(text);
      if (subMatch) {
        const params = subMatch[2]
          ? subMatch[2].split(",").map((p) => p.trim()).filter(Boolean)
          : [];
        currentUnit = {
          name: subMatch[1].toUpperCase(),
          startLine: lineNumber,
          params,
          kind: "subroutine",
        };
        continue;
      }

      // --- FUNCTION ---
      const funcMatch = RE_FUNCTION.exec(text);
      if (funcMatch) {
        const returnType = funcMatch[1]?.toUpperCase();
        const name = funcMatch[2].toUpperCase();
        const params = funcMatch[3]
          ? funcMatch[3].split(",").map((p) => p.trim()).filter(Boolean)
          : [];
        currentUnit = {
          name,
          startLine: lineNumber,
          params,
          returnType,
          kind: "function",
        };
        continue;
      }

      // --- ENTRY ---
      const entryMatch = RE_ENTRY.exec(text);
      if (entryMatch) {
        const params = entryMatch[2]
          ? entryMatch[2].split(",").map((p) => p.trim()).filter(Boolean)
          : [];
        // ENTRY creates an additional entry point; record it as a function at this line
        functions.push({
          name: entryMatch[1].toUpperCase(),
          lineRange: [lineNumber, lineNumber],
          params,
        });
        continue;
      }

      // --- COMMON blocks ---
      // Use a copy of the regex to avoid lastIndex issues
      const commonRe = /COMMON\s+\/\s*(\w+)\s*\//ig;
      let commonMatch: RegExpExecArray | null;
      while ((commonMatch = commonRe.exec(text)) !== null) {
        const blockName = commonMatch[1].toUpperCase();
        // Extract variables after the block name
        const afterBlock = text.slice(commonMatch.index + commonMatch[0].length);
        const vars = afterBlock.split(/[,/]/)
          .map((v) => v.trim().split(/\s/)[0])
          .filter((v) => v && /^\w+$/.test(v));
        imports.push({
          source: `COMMON/${blockName}`,
          specifiers: vars.map((v) => v.toUpperCase()),
          lineNumber,
        });
      }

      // --- INCLUDE ---
      const includeMatch = RE_INCLUDE.exec(text);
      if (includeMatch) {
        imports.push({
          source: includeMatch[1],
          specifiers: [],
          lineNumber,
        });
        continue;
      }

      // --- USE ---
      const useMatch = RE_USE.exec(text);
      if (useMatch) {
        const moduleName = useMatch[1].toUpperCase();
        const specifiers = useMatch[2]
          ? useMatch[2].split(",").map((s) => s.trim()).filter(Boolean)
          : [];
        imports.push({
          source: moduleName,
          specifiers,
          lineNumber,
        });
        continue;
      }

      // --- EXTERNAL ---
      const externalMatch = RE_EXTERNAL.exec(text);
      if (externalMatch) {
        const names = externalMatch[1]
          .split(",")
          .map((n) => n.trim())
          .filter((n) => n && /^\w+$/.test(n));
        for (const name of names) {
          exports.push({
            name: name.toUpperCase(),
            lineNumber,
          });
        }
        continue;
      }

      // --- EQUIVALENCE (flag only — dangerous aliasing) ---
      if (RE_EQUIVALENCE.test(text)) {
        // Record as a special import so downstream tools can flag it
        imports.push({
          source: "EQUIVALENCE",
          specifiers: ["ALIASING_WARNING"],
          lineNumber,
        });
        continue;
      }

      // --- Module-level variable declarations (when inside a module, before CONTAINS) ---
      if (currentModule && !inContains && !currentUnit) {
        // Simple heuristic: lines with :: are variable declarations (F90+)
        if (/::/.test(text)) {
          const afterColons = text.split("::")[1];
          if (afterColons) {
            const vars = afterColons.split(",").map((v) => {
              const name = v.trim().split(/[\s(=]/)[0];
              return name;
            }).filter((v) => v && /^\w+$/.test(v));
            for (const v of vars) {
              currentModule.properties.push(v.toUpperCase());
            }
          }
        }
      }
    }

    // Flush any unclosed unit (malformed code or file without END)
    if (currentUnit) {
      const lastLine = lines.length > 0 ? lines[lines.length - 1].lineNumber : 1;
      functions.push({
        name: currentUnit.name,
        lineRange: [currentUnit.startLine, lastLine],
        params: currentUnit.params,
        returnType: currentUnit.returnType,
      });
    }
    if (currentModule) {
      const lastLine = lines.length > 0 ? lines[lines.length - 1].lineNumber : 1;
      classes.push({
        name: currentModule.name,
        lineRange: [currentModule.startLine, lastLine],
        methods: currentModule.methods,
        properties: currentModule.properties,
      });
    }

    return { functions, classes, imports, exports };
  }

  resolveImports(filePath: string, content: string): ImportResolution[] {
    const analysis = this.analyzeFile(filePath, content);
    const dir = dirname(filePath);

    return analysis.imports.map((imp) => {
      let resolvedPath: string;
      if (imp.source.startsWith("COMMON/") || imp.source === "EQUIVALENCE") {
        // COMMON blocks and EQUIVALENCE are virtual — not file references
        resolvedPath = imp.source;
      } else if (imp.source.includes("/") || imp.source.includes("\\")) {
        // File path (INCLUDE)
        resolvedPath = resolve(dir, imp.source);
      } else if (imp.source.endsWith(".f") || imp.source.endsWith(".inc") || imp.source.includes(".")) {
        // INCLUDE with just a filename
        resolvedPath = resolve(dir, imp.source);
      } else {
        // USE module — module name, not a file path
        resolvedPath = imp.source;
      }
      return {
        source: imp.source,
        resolvedPath,
        specifiers: imp.specifiers,
      };
    });
  }

  extractCallGraph(filePath: string, content: string): CallGraphEntry[] {
    const format = detectFormat(filePath, content);
    const lines = format === "fixed"
      ? preprocessFixed(content)
      : preprocessFree(content);

    const entries: CallGraphEntry[] = [];
    let currentCaller: string | null = null;

    for (const { text, lineNumber } of lines) {
      // Track current subprogram
      const subMatch = RE_SUBROUTINE.exec(text);
      if (subMatch) {
        currentCaller = subMatch[1].toUpperCase();
        continue;
      }

      const funcMatch = RE_FUNCTION.exec(text);
      if (funcMatch) {
        currentCaller = funcMatch[2].toUpperCase();
        continue;
      }

      const programMatch = RE_PROGRAM.exec(text);
      if (programMatch) {
        currentCaller = programMatch[1].toUpperCase();
        continue;
      }

      const blockDataMatch = RE_BLOCK_DATA.exec(text);
      if (blockDataMatch && text.toUpperCase().trim().startsWith("BLOCK")) {
        currentCaller = (blockDataMatch[1] || "BLOCK_DATA").toUpperCase();
        continue;
      }

      const endMatch = RE_END.exec(text);
      if (endMatch && text.toUpperCase().trim().startsWith("END")) {
        currentCaller = null;
        continue;
      }

      // Extract CALL statements
      if (currentCaller) {
        const callRe = /\bCALL\s+(\w+)/ig;
        let callMatch: RegExpExecArray | null;
        while ((callMatch = callRe.exec(text)) !== null) {
          entries.push({
            caller: currentCaller,
            callee: callMatch[1].toUpperCase(),
            lineNumber,
          });
        }

        // Also detect function calls in expressions (heuristic: WORD(...) where WORD
        // is not a keyword). This is imprecise but useful for call graph completeness.
        // We skip this for now to avoid false positives — CALL is the primary mechanism.
      }
    }

    return entries;
  }
}
