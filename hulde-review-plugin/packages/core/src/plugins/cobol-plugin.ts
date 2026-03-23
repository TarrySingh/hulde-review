/**
 * COBOL Analyzer Plugin — regex-based parser for COBOL-74/85/2002/2014.
 *
 * Handles both fixed-format (traditional mainframe) and free-format COBOL.
 * Designed for production use on enterprise banking, insurance, and government
 * mainframe codebases (e.g., AWS CardDemo).
 *
 * Pattern follows the Fortran plugin — implements AnalyzerPlugin interface.
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

type CobolFormat = "fixed" | "free";

const KNOWN_EXTENSIONS = new Set([".cbl", ".cob", ".cpy", ".ccp"]);

function detectFormat(filePath: string, content: string): CobolFormat {
  const ext = extname(filePath).toLowerCase();

  // Check for free-format indicators first (even with .cbl extension)
  const freeComments = (content.match(/\*>/g) || []).length;
  if (freeComments > 2) return "free";

  // Check if content has no sequence numbers and no column-7 indicators (free-format)
  const lines = content.split("\n").filter(l => l.trim().length > 0);
  if (lines.length > 0) {
    let hasCol7Indicators = 0;
    let hasSeqNumbers = 0;
    for (const line of lines.slice(0, 30)) {
      if (line.length >= 7 && /^\d{6}/.test(line)) hasSeqNumbers++;
      if (line.length >= 7 && (line[6] === "*" || line[6] === "/" || line[6] === "-")) hasCol7Indicators++;
      // Check if the line starts at column 1 with a COBOL keyword (free-format indicator)
      if (/^[A-Za-z]/.test(line) && /^(IDENTIFICATION|PROGRAM-ID|DATA|PROCEDURE|WORKING-STORAGE|ENVIRONMENT)/i.test(line.trim())) {
        return "free";
      }
    }
    if (hasSeqNumbers > 0 || hasCol7Indicators > 0) return "fixed";
  }

  // Default: known extensions default to fixed
  if (KNOWN_EXTENSIONS.has(ext)) return "fixed";

  // Default heuristic
  return "fixed";
}

// ---------------------------------------------------------------------------
// Pre-processing: join continuation lines and strip comments
// ---------------------------------------------------------------------------

interface SourceLine {
  /** The cleaned source text */
  text: string;
  /** Original 1-based line number */
  lineNumber: number;
}

/**
 * Pre-process fixed-format COBOL:
 *  - Columns 1-6: sequence numbers (ignored)
 *  - Column 7: indicator (* or / = comment, D/d = debug, - = continuation)
 *  - Columns 8-72: source text (Area A: 8-11, Area B: 12-72)
 *  - Columns 73-80: identification (ignored)
 */
function preprocessFixed(content: string): SourceLine[] {
  const rawLines = content.split("\n");
  const result: SourceLine[] = [];

  for (let i = 0; i < rawLines.length; i++) {
    const raw = rawLines[i];
    if (raw.length === 0) continue;

    // Column 7 indicator (0-indexed position 6)
    const indicator = raw.length >= 7 ? raw[6] : " ";

    // Comment or page eject
    if (indicator === "*" || indicator === "/" || indicator === "D" || indicator === "d") continue;

    // Extract source portion (columns 8-72, 0-indexed 7-71)
    const sourcePart = raw.length > 7 ? raw.slice(7, 72) : "";
    if (sourcePart.trim().length === 0) continue;

    // Continuation line: column 7 is '-'
    if (indicator === "-" && result.length > 0) {
      // Append to previous logical line (strip leading spaces up to the first non-space)
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
 * Pre-process free-format COBOL:
 *  - *> starts inline comments
 *  - Lines starting with >> are compiler directives (skip)
 *  - No column restrictions
 */
function preprocessFree(content: string): SourceLine[] {
  const rawLines = content.split("\n");
  const result: SourceLine[] = [];

  for (let i = 0; i < rawLines.length; i++) {
    let line = rawLines[i];

    // Strip inline comments (*> to end of line)
    const commentIdx = line.indexOf("*>");
    if (commentIdx >= 0) {
      line = line.slice(0, commentIdx);
    }

    const trimmed = line.trim();
    if (trimmed.length === 0) continue;
    // Skip compiler directives
    if (trimmed.startsWith(">>")) continue;

    result.push({ text: trimmed, lineNumber: i + 1 });
  }

  return result;
}

// ---------------------------------------------------------------------------
// Regex patterns (case-insensitive)
// ---------------------------------------------------------------------------

// IDENTIFICATION DIVISION
const RE_IDENTIFICATION_DIV = /^\s*IDENTIFICATION\s+DIVISION\s*\./i;

// PROGRAM-ID. name.
const RE_PROGRAM_ID = /^\s*PROGRAM-ID\s*\.\s*(\S+?)[\s.]/i;

// ENVIRONMENT DIVISION
const RE_ENVIRONMENT_DIV = /^\s*ENVIRONMENT\s+DIVISION\s*\./i;

// DATA DIVISION
const RE_DATA_DIV = /^\s*DATA\s+DIVISION\s*\./i;

// PROCEDURE DIVISION
const RE_PROCEDURE_DIV = /^\s*PROCEDURE\s+DIVISION/i;

// SELECT file-name ASSIGN TO device
const RE_SELECT = /^\s*SELECT\s+(\S+)\s+ASSIGN\s+TO\s+(\S+)/i;

// FILE STATUS IS variable
const RE_FILE_STATUS = /FILE\s+STATUS\s+(?:IS\s+)?(\S+)/i;

// FD file-name
const RE_FD = /^\s*FD\s+(\S+)/i;

// COPY copybook-name [OF|IN library].
const RE_COPY = /^\s*COPY\s+(\S+?)(?:\s+(?:OF|IN)\s+(\S+?))?\s*\./i;

// 01-level items (top-level data structures)
const RE_01_LEVEL = /^\s*01\s+(\S+)/i;

// Level numbers: 02-49 with names
const RE_SUB_LEVEL = /^\s*(0[2-9]|[1-4][0-9])\s+(\S+)/i;

// 66 RENAMES
const RE_66_LEVEL = /^\s*66\s+(\S+)/i;

// 77 independent items
const RE_77_LEVEL = /^\s*77\s+(\S+)/i;

// 88 condition names
const RE_88_LEVEL = /^\s*88\s+(\S+)/i;

// PICTURE / PIC clause
const RE_PIC = /\bPIC(?:TURE)?\s+(?:IS\s+)?(\S+)/i;

// REDEFINES
const RE_REDEFINES = /\bREDEFINES\s+(\S+)/i;

// OCCURS
const RE_OCCURS = /\bOCCURS\s+(\d+)/i;

// COMP-3 / COMP / BINARY / PACKED-DECIMAL
const RE_COMP = /\b(COMP-3|COMP|BINARY|PACKED-DECIMAL|COMPUTATIONAL-3|COMPUTATIONAL)\b/i;

// SECTION name
const RE_SECTION = /^\s*(\S+)\s+SECTION\s*\./i;

// PARAGRAPH name (a name ending with a period at the start of a line, in PROCEDURE DIVISION)
const RE_PARAGRAPH = /^\s*([A-Za-z0-9][\w-]*)\s*\.\s*$/;

// PERFORM statement
const RE_PERFORM = /\bPERFORM\s+([A-Za-z0-9][\w-]*)/i;

// PERFORM ... THRU/THROUGH
const RE_PERFORM_THRU = /\bPERFORM\s+([A-Za-z0-9][\w-]*)\s+(?:THRU|THROUGH)\s+([A-Za-z0-9][\w-]*)/i;

// CALL 'program-name' or CALL "program-name"
const RE_CALL = /\bCALL\s+['"]([^'"]+)['"]/i;

// CALL identifier
const RE_CALL_ID = /\bCALL\s+([A-Za-z0-9][\w-]+)/i;

// GO TO paragraph-name
const RE_GOTO = /\bGO\s*TO\s+([A-Za-z0-9][\w-]*)/i;

// EVALUATE (switch)
const RE_EVALUATE = /\bEVALUATE\b/i;

// END-EVALUATE
const RE_END_EVALUATE = /\bEND-EVALUATE\b/i;

// IF statement
const RE_IF = /\bIF\b/i;

// END-IF
const RE_END_IF = /\bEND-IF\b/i;

// EXIT PROGRAM / STOP RUN / GOBACK
const RE_EXIT_PROGRAM = /\b(EXIT\s+PROGRAM|STOP\s+RUN|GOBACK)\b/i;

// EXEC CICS
const RE_EXEC_CICS = /\bEXEC\s+CICS\b/i;

// EXEC SQL
const RE_EXEC_SQL = /\bEXEC\s+SQL\b/i;

// Obsolete verbs
const RE_OBSOLETE = /\b(ALTER|EXAMINE|EXHIBIT|NOTE|TRANSFORM)\b/i;

// ---------------------------------------------------------------------------
// The plugin
// ---------------------------------------------------------------------------

export class CobolPlugin implements AnalyzerPlugin {
  readonly name = "cobol";
  readonly languages = ["cobol"];

  analyzeFile(filePath: string, content: string): StructuralAnalysis {
    const format = detectFormat(filePath, content);
    const lines = format === "fixed"
      ? preprocessFixed(content)
      : preprocessFree(content);

    const functions: StructuralAnalysis["functions"] = [];
    const classes: StructuralAnalysis["classes"] = [];
    const imports: StructuralAnalysis["imports"] = [];
    const exports: StructuralAnalysis["exports"] = [];

    let inProcedureDivision = false;
    let inDataDivision = false;
    let programId: string | null = null;

    // Track current 01-level data structure
    let current01: {
      name: string;
      startLine: number;
      properties: string[];
      isFD: boolean;
    } | null = null;

    // Track sections and paragraphs for function extraction
    let currentSection: {
      name: string;
      startLine: number;
    } | null = null;

    let currentParagraph: {
      name: string;
      startLine: number;
    } | null = null;

    // Process all lines
    for (let idx = 0; idx < lines.length; idx++) {
      const { text, lineNumber } = lines[idx];
      const upperText = text.toUpperCase().trim();

      // --- Division detection ---
      if (RE_IDENTIFICATION_DIV.test(text)) {
        continue;
      }

      if (RE_ENVIRONMENT_DIV.test(text)) {
        inDataDivision = false;
        continue;
      }

      if (RE_DATA_DIV.test(text)) {
        inDataDivision = true;
        inProcedureDivision = false;
        continue;
      }

      if (RE_PROCEDURE_DIV.test(text)) {
        // Flush any pending 01-level
        if (current01) {
          classes.push({
            name: current01.name,
            lineRange: [current01.startLine, lineNumber - 1],
            methods: [],
            properties: current01.properties,
          });
          current01 = null;
        }
        inProcedureDivision = true;
        inDataDivision = false;
        continue;
      }

      // --- PROGRAM-ID ---
      const pidMatch = RE_PROGRAM_ID.exec(text);
      if (pidMatch) {
        programId = pidMatch[1].replace(/\.$/, "").toUpperCase();
        // PROGRAM-ID maps to an entry point function; we'll add it after we know the range
        continue;
      }

      // --- SELECT ... ASSIGN ---
      if (!inProcedureDivision) {
        const selectMatch = RE_SELECT.exec(text);
        if (selectMatch) {
          const fileName = selectMatch[1].replace(/\.$/, "");
          const assignTo = selectMatch[2].replace(/\.$/, "");
          imports.push({
            source: `FILE/${assignTo}`,
            specifiers: [fileName],
            lineNumber,
          });

          // Check for FILE STATUS in the same or next lines
          const fullSelectText = lines.slice(idx, Math.min(idx + 5, lines.length))
            .map(l => l.text).join(" ");
          const statusMatch = RE_FILE_STATUS.exec(fullSelectText);
          if (statusMatch) {
            // FILE STATUS is present — this is tracked for rules later
          }
          continue;
        }
      }

      // --- FD entries ---
      if (inDataDivision) {
        const fdMatch = RE_FD.exec(text);
        if (fdMatch) {
          // Flush previous 01
          if (current01) {
            classes.push({
              name: current01.name,
              lineRange: [current01.startLine, lineNumber - 1],
              methods: [],
              properties: current01.properties,
            });
          }
          current01 = {
            name: `FD-${fdMatch[1].replace(/\.$/, "").toUpperCase()}`,
            startLine: lineNumber,
            properties: [],
            isFD: true,
          };
          continue;
        }
      }

      // --- COPY statements ---
      const copyMatch = RE_COPY.exec(text);
      if (copyMatch) {
        const copybookName = copyMatch[1].replace(/\.$/, "");
        const library = copyMatch[2]?.replace(/\.$/, "");
        imports.push({
          source: library ? `${copybookName}/${library}` : copybookName,
          specifiers: [],
          lineNumber,
        });
        continue;
      }

      // --- DATA DIVISION items ---
      if (inDataDivision || (!inProcedureDivision && !inDataDivision)) {
        // 01-level items
        const level01Match = RE_01_LEVEL.exec(text);
        if (level01Match && /^\s*01\s/i.test(text)) {
          const name = level01Match[1].replace(/\.$/, "").toUpperCase();
          if (name !== "FILLER") {
            // Flush previous
            if (current01) {
              classes.push({
                name: current01.name,
                lineRange: [current01.startLine, lineNumber - 1],
                methods: [],
                properties: current01.properties,
              });
            }
            current01 = {
              name,
              startLine: lineNumber,
              properties: [],
              isFD: false,
            };

            // Check for REDEFINES at the 01 level
            const redefinesMatch01 = RE_REDEFINES.exec(text);
            if (redefinesMatch01) {
              imports.push({
                source: "REDEFINES",
                specifiers: [name, redefinesMatch01[1].replace(/\.$/, "").toUpperCase()],
                lineNumber,
              });
            }
          }
          continue;
        }

        // Sub-level items (02-49): add as properties of current 01
        const subLevelMatch = RE_SUB_LEVEL.exec(text);
        if (subLevelMatch && current01) {
          const propName = subLevelMatch[2].replace(/\.$/, "").toUpperCase();
          if (propName !== "FILLER") {
            current01.properties.push(propName);
          }

          // Track REDEFINES as a special import
          const redefinesMatch = RE_REDEFINES.exec(text);
          if (redefinesMatch) {
            imports.push({
              source: "REDEFINES",
              specifiers: [propName, redefinesMatch[1].replace(/\.$/, "").toUpperCase()],
              lineNumber,
            });
          }
          continue;
        }

        // 77-level independent items
        const level77Match = RE_77_LEVEL.exec(text);
        if (level77Match) {
          if (current01) {
            current01.properties.push(level77Match[1].replace(/\.$/, "").toUpperCase());
          }
          continue;
        }

        // 88-level condition names
        const level88Match = RE_88_LEVEL.exec(text);
        if (level88Match && current01) {
          current01.properties.push(`88:${level88Match[1].replace(/\.$/, "").toUpperCase()}`);
          continue;
        }

        // 66-level RENAMES
        if (RE_66_LEVEL.test(text)) {
          continue;
        }
      }

      // --- PROCEDURE DIVISION ---
      if (inProcedureDivision) {
        // SECTION
        const sectionMatch = RE_SECTION.exec(text);
        if (sectionMatch) {
          // Flush paragraph
          if (currentParagraph) {
            functions.push({
              name: currentParagraph.name,
              lineRange: [currentParagraph.startLine, lineNumber - 1],
              params: [],
            });
            currentParagraph = null;
          }
          // Flush section
          if (currentSection) {
            functions.push({
              name: currentSection.name,
              lineRange: [currentSection.startLine, lineNumber - 1],
              params: [],
              returnType: "SECTION",
            });
          }
          currentSection = {
            name: sectionMatch[1].toUpperCase(),
            startLine: lineNumber,
          };
          continue;
        }

        // Paragraph: a name followed by a period on its own line
        // Must not be a keyword
        const paragraphMatch = RE_PARAGRAPH.exec(text);
        if (paragraphMatch) {
          const pName = paragraphMatch[1].toUpperCase();
          // Skip known COBOL keywords that might match
          const keywords = new Set([
            "IF", "ELSE", "END-IF", "EVALUATE", "WHEN", "END-EVALUATE",
            "PERFORM", "MOVE", "ADD", "SUBTRACT", "MULTIPLY", "DIVIDE",
            "COMPUTE", "DISPLAY", "READ", "WRITE", "OPEN", "CLOSE",
            "STOP", "EXIT", "GOBACK", "CALL", "GO", "STRING", "UNSTRING",
            "INSPECT", "ACCEPT", "INITIALIZE", "SET", "NOT", "AND", "OR",
            "CONTINUE", "RETURN", "EXEC", "END-EXEC",
          ]);
          if (!keywords.has(pName) && !pName.startsWith("END-")) {
            // Flush previous paragraph
            if (currentParagraph) {
              functions.push({
                name: currentParagraph.name,
                lineRange: [currentParagraph.startLine, lineNumber - 1],
                params: [],
              });
            }
            currentParagraph = {
              name: pName,
              startLine: lineNumber,
            };
            continue;
          }
        }
      }
    }

    // Flush pending structures
    if (current01) {
      const lastLine = lines.length > 0 ? lines[lines.length - 1].lineNumber : 1;
      classes.push({
        name: current01.name,
        lineRange: [current01.startLine, lastLine],
        methods: [],
        properties: current01.properties,
      });
    }

    if (currentParagraph) {
      const lastLine = lines.length > 0 ? lines[lines.length - 1].lineNumber : 1;
      functions.push({
        name: currentParagraph.name,
        lineRange: [currentParagraph.startLine, lastLine],
        params: [],
      });
    }

    if (currentSection) {
      const lastLine = lines.length > 0 ? lines[lines.length - 1].lineNumber : 1;
      functions.push({
        name: currentSection.name,
        lineRange: [currentSection.startLine, lastLine],
        params: [],
        returnType: "SECTION",
      });
    }

    // Add PROGRAM-ID as the main entry point function
    if (programId) {
      const firstLine = 1;
      const lastLine = lines.length > 0 ? lines[lines.length - 1].lineNumber : 1;
      functions.unshift({
        name: programId,
        lineRange: [firstLine, lastLine],
        params: [],
        returnType: "PROGRAM",
      });

      // Export the program ID
      exports.push({
        name: programId,
        lineNumber: 1,
      });
    }

    return { functions, classes, imports, exports };
  }

  resolveImports(filePath: string, content: string): ImportResolution[] {
    const analysis = this.analyzeFile(filePath, content);
    const dir = dirname(filePath);

    return analysis.imports.map((imp) => {
      let resolvedPath: string;
      if (imp.source.startsWith("FILE/") || imp.source === "REDEFINES") {
        // Virtual — not file references
        resolvedPath = imp.source;
      } else if (imp.source.includes("/") || imp.source.includes("\\") || imp.source.includes(".")) {
        // File path or copybook with library
        resolvedPath = resolve(dir, imp.source);
      } else {
        // COPY copybook-name — resolved as copybook reference
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
    let inProcedureDivision = false;
    let currentCaller: string | null = null;

    // First pass: find PROGRAM-ID for default caller
    let programId: string | null = null;
    for (const { text } of lines) {
      const pidMatch = RE_PROGRAM_ID.exec(text);
      if (pidMatch) {
        programId = pidMatch[1].replace(/\.$/, "").toUpperCase();
        break;
      }
    }

    for (const { text, lineNumber } of lines) {
      const upperText = text.toUpperCase().trim();

      if (RE_PROCEDURE_DIV.test(text)) {
        inProcedureDivision = true;
        currentCaller = programId || "MAIN";
        continue;
      }

      if (!inProcedureDivision) continue;

      // Track current section/paragraph as caller
      const sectionMatch = RE_SECTION.exec(text);
      if (sectionMatch) {
        currentCaller = sectionMatch[1].toUpperCase();
        continue;
      }

      const paragraphMatch = RE_PARAGRAPH.exec(text);
      if (paragraphMatch) {
        const pName = paragraphMatch[1].toUpperCase();
        const keywords = new Set([
          "IF", "ELSE", "END-IF", "EVALUATE", "WHEN", "END-EVALUATE",
          "PERFORM", "MOVE", "ADD", "SUBTRACT", "MULTIPLY", "DIVIDE",
          "COMPUTE", "DISPLAY", "READ", "WRITE", "OPEN", "CLOSE",
          "STOP", "EXIT", "GOBACK", "CALL", "GO", "STRING", "UNSTRING",
          "INSPECT", "ACCEPT", "INITIALIZE", "SET", "NOT", "AND", "OR",
          "CONTINUE", "RETURN", "EXEC", "END-EXEC",
        ]);
        if (!keywords.has(pName) && !pName.startsWith("END-")) {
          currentCaller = pName;
          continue;
        }
      }

      if (!currentCaller) continue;

      // PERFORM ... THRU ...
      const performThruMatch = RE_PERFORM_THRU.exec(text);
      if (performThruMatch) {
        entries.push({
          caller: currentCaller,
          callee: `${performThruMatch[1].toUpperCase()} THRU ${performThruMatch[2].toUpperCase()}`,
          lineNumber,
        });
        continue;
      }

      // PERFORM paragraph/section
      const performMatch = RE_PERFORM.exec(text);
      if (performMatch) {
        const target = performMatch[1].toUpperCase();
        // Skip PERFORM UNTIL, PERFORM VARYING, PERFORM TIMES etc.
        const skipKeywords = new Set(["UNTIL", "VARYING", "TIMES", "WITH", "TEST"]);
        if (!skipKeywords.has(target)) {
          entries.push({
            caller: currentCaller,
            callee: target,
            lineNumber,
          });
        }
        continue;
      }

      // CALL 'literal'
      const callMatch = RE_CALL.exec(text);
      if (callMatch) {
        entries.push({
          caller: currentCaller,
          callee: callMatch[1].toUpperCase(),
          lineNumber,
        });
        continue;
      }

      // CALL identifier (dynamic call)
      if (/\bCALL\s+[A-Za-z]/i.test(text) && !RE_CALL.test(text)) {
        const callIdMatch = RE_CALL_ID.exec(text);
        if (callIdMatch) {
          entries.push({
            caller: currentCaller,
            callee: callIdMatch[1].toUpperCase(),
            lineNumber,
          });
        }
        continue;
      }

      // GO TO
      const gotoMatch = RE_GOTO.exec(text);
      if (gotoMatch) {
        entries.push({
          caller: currentCaller,
          callee: gotoMatch[1].toUpperCase(),
          lineNumber,
        });
      }
    }

    return entries;
  }
}
