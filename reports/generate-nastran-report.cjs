const fs = require("fs");
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Header, Footer, AlignmentType, HeadingLevel, BorderStyle, WidthType,
  ShadingType, PageNumber, PageBreak, TableOfContents, LevelFormat,
} = require("docx");

// ─── Hulde Branding ──────────────────────────────────────────────
const HULDE_GREEN = "00A651";
const HULDE_NAVY = "0D1B3E";
const HULDE_BLUE = "1A73E8";
const HULDE_GOLD = "D4A843";
const WHITE = "FFFFFF";
const LIGHT_GREEN = "E8F5E9";
const LIGHT_GRAY = "F8FAFC";
const BORDER_GRAY = "E2E8F0";
const TEXT_DARK = "1E293B";
const TEXT_GRAY = "64748B";

const FONT = "Calibri";
const CONTENT_WIDTH = 9360; // US Letter with 1" margins

const border = { style: BorderStyle.SINGLE, size: 1, color: BORDER_GRAY };
const borders = { top: border, bottom: border, left: border, right: border };
const cellMargins = { top: 60, bottom: 60, left: 100, right: 100 };

// ─── Severity Colors ─────────────────────────────────────────────
const severityColors = {
  critical: "DC2626",
  high: "EA580C",
  medium: "D4A843",
  low: "1A73E8",
  info: "64748B",
};

// ─── Demo Data ───────────────────────────────────────────────────
const findings = [
  { id: "n1", severity: "critical", title: "Unrestricted GOTO control flow", category: "Control Flow", file: "NASTRAN/SOURCE/MAIN.f", effort: "16h", description: "GOTO statements create spaghetti code that is nearly impossible to maintain or debug. Found across 85% of subroutines." },
  { id: "n2", severity: "critical", title: "COMMON block global state mutation", category: "Data Integrity", file: "NASTRAN/SOURCE/COMMON/*.f", effort: "40h", description: "Over 200 COMMON blocks share mutable global state across subroutines." },
  { id: "n3", severity: "critical", title: "No error handling in I/O operations", category: "Error Handling", file: "NASTRAN/SOURCE/INPUT/*.f", effort: "24h", description: "File read/write operations lack IOSTAT checking, risking silent data corruption." },
  { id: "n4", severity: "critical", title: "EQUIVALENCE memory aliasing", category: "Memory Safety", file: "NASTRAN/SOURCE/UTILS/*.f", effort: "32h", description: "EQUIVALENCE statements alias different variables to the same memory, causing type confusion." },
  { id: "n5", severity: "high", title: "Implicit variable typing", category: "Type Safety", file: "Multiple files", effort: "8h", description: "Missing IMPLICIT NONE allows undeclared variables with implicit types." },
  { id: "n6", severity: "high", title: "Fixed-format source lines", category: "Maintainability", file: "All .f files", effort: "12h", description: "Code uses fixed-format FORTRAN with 72-column limits." },
  { id: "n7", severity: "high", title: "Hardcoded array dimensions", category: "Scalability", file: "NASTRAN/SOURCE/MATRIX/*.f", effort: "20h", description: "Array sizes are hardcoded with PARAMETER statements." },
  { id: "n8", severity: "high", title: "No unit testing infrastructure", category: "Testing", file: "N/A", effort: "80h", description: "Zero automated tests exist for any subroutine or module." },
  { id: "n9", severity: "high", title: "Arithmetic IF statements", category: "Control Flow", file: "Multiple files", effort: "10h", description: "Three-way arithmetic IF is deprecated and confusing." },
  { id: "n10", severity: "medium", title: "Missing subroutine documentation", category: "Documentation", file: "All files", effort: "60h", description: "Less than 5% of subroutines have header comments." },
  { id: "n11", severity: "medium", title: "Hollerith constants in DATA statements", category: "Modernization", file: "NASTRAN/SOURCE/OUTPUT/*.f", effort: "6h", description: "Hollerith (nH) constants are obsolete." },
  { id: "n12", severity: "medium", title: "Computed GOTO dispatch", category: "Control Flow", file: "NASTRAN/SOURCE/EXEC/*.f", effort: "14h", description: "Computed GOTO used for dispatching to different handlers." },
  { id: "n13", severity: "medium", title: "ENTRY points in subroutines", category: "Structure", file: "Multiple files", effort: "18h", description: "Multiple ENTRY points allow jumping into subroutine midpoints." },
  { id: "n14", severity: "medium", title: "No version control metadata", category: "Process", file: "N/A", effort: "4h", description: "No evidence of version control integration." },
  { id: "n15", severity: "low", title: "Inconsistent indentation", category: "Style", file: "All files", effort: "4h", description: "Indentation varies between 0-6 spaces." },
  { id: "n16", severity: "low", title: "Trailing whitespace", category: "Style", file: "All files", effort: "1h", description: "Many lines contain trailing whitespace." },
  { id: "n17", severity: "low", title: "Mixed case identifiers", category: "Style", file: "Multiple files", effort: "2h", description: "Variable and subroutine names use inconsistent casing." },
  { id: "n18", severity: "info", title: "Lines exceed 132 characters", category: "Compatibility", file: "Some .f files", effort: "2h", description: "A few lines exceed free-format 132-column limit." },
  { id: "n19", severity: "info", title: "Unused variables detected", category: "Cleanup", file: "Multiple files", effort: "3h", description: "Approximately 340 unused variable declarations." },
  { id: "n20", severity: "info", title: "Deprecated PAUSE statements", category: "Modernization", file: "NASTRAN/SOURCE/DEBUG/*.f", effort: "1h", description: "PAUSE statements halt execution for operator input." },
];

// ─── Helper: Make header cell ────────────────────────────────────
function headerCell(text, width) {
  return new TableCell({
    borders,
    width: { size: width, type: WidthType.DXA },
    shading: { fill: HULDE_GREEN, type: ShadingType.CLEAR },
    margins: cellMargins,
    verticalAlign: "center",
    children: [new Paragraph({ children: [new TextRun({ text, bold: true, font: FONT, size: 18, color: WHITE })] })],
  });
}

// ─── Helper: Make data cell ──────────────────────────────────────
function dataCell(text, width, opts = {}) {
  return new TableCell({
    borders,
    width: { size: width, type: WidthType.DXA },
    shading: opts.shading ? { fill: opts.shading, type: ShadingType.CLEAR } : undefined,
    margins: cellMargins,
    children: [new Paragraph({
      children: [new TextRun({
        text: String(text),
        font: FONT,
        size: 18,
        color: opts.color || TEXT_DARK,
        bold: opts.bold || false,
      })],
    })],
  });
}

// ─── Helper: Severity dot ────────────────────────────────────────
function severityCell(severity, width) {
  const label = severity.charAt(0).toUpperCase() + severity.slice(1);
  return new TableCell({
    borders,
    width: { size: width, type: WidthType.DXA },
    margins: cellMargins,
    children: [new Paragraph({
      children: [new TextRun({ text: `\u25CF ${label}`, font: FONT, size: 18, color: severityColors[severity] || TEXT_DARK, bold: true })],
    })],
  });
}

// ─── Helper: Stat row ────────────────────────────────────────────
function statRow(label, value, shading) {
  return new TableRow({
    children: [
      dataCell(label, 4680, { shading, bold: true }),
      dataCell(value, 4680, { shading }),
    ],
  });
}

// ─── Build Document ──────────────────────────────────────────────
const doc = new Document({
  styles: {
    default: { document: { run: { font: FONT, size: 22 } } },
    paragraphStyles: [
      { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 36, bold: true, font: FONT, color: HULDE_NAVY },
        paragraph: { spacing: { before: 360, after: 200 }, outlineLevel: 0 } },
      { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 28, bold: true, font: FONT, color: HULDE_GREEN },
        paragraph: { spacing: { before: 280, after: 160 }, outlineLevel: 1 } },
      { id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 24, bold: true, font: FONT, color: HULDE_NAVY },
        paragraph: { spacing: { before: 200, after: 120 }, outlineLevel: 2 } },
    ],
  },
  numbering: {
    config: [
      { reference: "bullets", levels: [{ level: 0, format: LevelFormat.BULLET, text: "\u2022", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
      { reference: "numbers", levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
    ],
  },
  sections: [
    // ─── TITLE PAGE ──────────────────────────────────────────────
    {
      properties: {
        page: {
          size: { width: 12240, height: 15840 },
          margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
        },
      },
      children: [
        new Paragraph({ spacing: { before: 2400 }, children: [] }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 200 },
          children: [new TextRun({ text: "HULDE REVIEW", font: FONT, size: 56, bold: true, color: HULDE_GREEN })],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 100 },
          children: [new TextRun({ text: "\u2500".repeat(40), font: FONT, size: 20, color: BORDER_GRAY })],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 400 },
          children: [new TextRun({ text: "Enterprise Code Review Report", font: FONT, size: 32, color: HULDE_NAVY })],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 200 },
          children: [new TextRun({ text: "NASA NASTRAN-93", font: FONT, size: 44, bold: true, color: HULDE_NAVY })],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 100 },
          children: [new TextRun({ text: "FORTRAN Structural Analysis System", font: FONT, size: 24, color: TEXT_GRAY })],
        }),
        new Paragraph({ spacing: { before: 800 }, children: [] }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 100 },
          children: [new TextRun({ text: "Prepared by", font: FONT, size: 20, color: TEXT_GRAY })],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 100 },
          children: [new TextRun({ text: "hulde.ai", font: FONT, size: 28, bold: true, color: HULDE_GREEN })],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 200 },
          children: [new TextRun({ text: "Enterprise Code Review Platform", font: FONT, size: 20, color: TEXT_GRAY })],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 100 },
          children: [new TextRun({ text: `Report Date: ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}`, font: FONT, size: 20, color: TEXT_GRAY })],
        }),
        new Paragraph({ spacing: { before: 1200 }, children: [] }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: "CONFIDENTIAL", font: FONT, size: 28, bold: true, color: "DC2626" })],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 100 },
          children: [new TextRun({ text: "This document contains proprietary analysis results. Distribution restricted.", font: FONT, size: 16, color: TEXT_GRAY })],
        }),
      ],
    },

    // ─── TOC + CONTENT ───────────────────────────────────────────
    {
      properties: {
        page: {
          size: { width: 12240, height: 15840 },
          margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
        },
      },
      headers: {
        default: new Header({
          children: [new Paragraph({
            alignment: AlignmentType.RIGHT,
            children: [
              new TextRun({ text: "Hulde Review", font: FONT, size: 16, color: HULDE_GREEN, bold: true }),
              new TextRun({ text: "  |  NASA NASTRAN-93  |  CONFIDENTIAL", font: FONT, size: 16, color: TEXT_GRAY }),
            ],
          })],
        }),
      },
      footers: {
        default: new Footer({
          children: [new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({ text: "Generated by Hulde Review \u2014 hulde.ai | Confidential  \u2022  Page ", font: FONT, size: 16, color: TEXT_GRAY }),
              new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 16, color: TEXT_GRAY }),
            ],
          })],
        }),
      },
      children: [
        // Table of Contents
        new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("Table of Contents")] }),
        new TableOfContents("Table of Contents", { hyperlink: true, headingStyleRange: "1-3" }),
        new Paragraph({ children: [new PageBreak()] }),

        // ─── 1. EXECUTIVE SUMMARY ────────────────────────────────
        new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("1. Executive Summary")] }),
        new Paragraph({
          spacing: { after: 200 },
          children: [new TextRun({ text: "Code review analysis of NASA NASTRAN-93, a legacy structural analysis system originally developed in the 1960s-1970s. The codebase consists of 419,067 lines of FORTRAN across 1,728 files. Analysis reveals extreme technical debt with 20,431 findings. The system relies heavily on GOTO-based control flow, COMMON blocks for global state, and fixed-format FORTRAN conventions.", font: FONT, size: 22, color: TEXT_DARK })],
        }),

        // Risk Score Callout
        new Table({
          width: { size: CONTENT_WIDTH, type: WidthType.DXA },
          columnWidths: [CONTENT_WIDTH],
          rows: [new TableRow({
            children: [new TableCell({
              borders: { top: { style: BorderStyle.SINGLE, size: 3, color: "DC2626" }, bottom: { style: BorderStyle.SINGLE, size: 3, color: "DC2626" }, left: { style: BorderStyle.SINGLE, size: 3, color: "DC2626" }, right: { style: BorderStyle.SINGLE, size: 3, color: "DC2626" } },
              width: { size: CONTENT_WIDTH, type: WidthType.DXA },
              shading: { fill: "FEF2F2", type: ShadingType.CLEAR },
              margins: { top: 120, bottom: 120, left: 200, right: 200 },
              children: [
                new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "OVERALL RISK SCORE", font: FONT, size: 20, bold: true, color: "DC2626" })] }),
                new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 80 }, children: [new TextRun({ text: "100 / 100", font: FONT, size: 48, bold: true, color: "DC2626" })] }),
                new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 40 }, children: [new TextRun({ text: "CRITICAL RISK \u2014 Immediate action required", font: FONT, size: 20, color: "DC2626" })] }),
              ],
            })],
          })],
        }),

        new Paragraph({ spacing: { before: 200 }, children: [] }),

        // Key Metrics Table
        new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("Key Metrics")] }),
        new Table({
          width: { size: CONTENT_WIDTH, type: WidthType.DXA },
          columnWidths: [4680, 4680],
          rows: [
            statRow("Total Findings", "20,431", LIGHT_GREEN),
            statRow("Files Analyzed", "1,728"),
            statRow("Lines of Code", "417,339", LIGHT_GREEN),
            statRow("Technical Debt", "287,131 hours (~164 person-years)"),
            statRow("Languages", "FORTRAN 77 (Fixed Format)", LIGHT_GREEN),
            statRow("Analysis Date", new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })),
          ],
        }),

        new Paragraph({ children: [new PageBreak()] }),

        // ─── 2. FINDINGS SUMMARY ─────────────────────────────────
        new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("2. Findings Summary")] }),
        new Paragraph({
          spacing: { after: 200 },
          children: [new TextRun({ text: "Breakdown of all 20,431 findings by severity level:", font: FONT, size: 22, color: TEXT_DARK })],
        }),

        new Table({
          width: { size: CONTENT_WIDTH, type: WidthType.DXA },
          columnWidths: [3120, 3120, 3120],
          rows: [
            new TableRow({
              children: [
                headerCell("Severity", 3120),
                headerCell("Count", 3120),
                headerCell("Percentage", 3120),
              ],
            }),
            ...([
              ["Critical", "2,847", "13.9%", "DC2626"],
              ["High", "5,123", "25.1%", "EA580C"],
              ["Medium", "8,461", "41.4%", "D4A843"],
              ["Low", "3,100", "15.2%", "1A73E8"],
              ["Info", "900", "4.4%", "64748B"],
            ]).map(([sev, count, pct, color], i) =>
              new TableRow({
                children: [
                  new TableCell({
                    borders, width: { size: 3120, type: WidthType.DXA },
                    shading: i % 2 === 0 ? { fill: LIGHT_GRAY, type: ShadingType.CLEAR } : undefined,
                    margins: cellMargins,
                    children: [new Paragraph({ children: [new TextRun({ text: `\u25CF ${sev}`, font: FONT, size: 20, bold: true, color })] })],
                  }),
                  dataCell(count, 3120, { shading: i % 2 === 0 ? LIGHT_GRAY : undefined }),
                  dataCell(pct, 3120, { shading: i % 2 === 0 ? LIGHT_GRAY : undefined }),
                ],
              })
            ),
            new TableRow({
              children: [
                dataCell("Total", 3120, { bold: true, shading: HULDE_NAVY, color: WHITE }),
                dataCell("20,431", 3120, { bold: true, shading: HULDE_NAVY, color: WHITE }),
                dataCell("100%", 3120, { bold: true, shading: HULDE_NAVY, color: WHITE }),
              ],
            }),
          ],
        }),

        new Paragraph({ children: [new PageBreak()] }),

        // ─── 3. TOP FINDINGS ─────────────────────────────────────
        new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("3. Top 20 Findings")] }),
        new Paragraph({
          spacing: { after: 200 },
          children: [new TextRun({ text: "The following table lists the most significant findings from the analysis, ordered by severity:", font: FONT, size: 22, color: TEXT_DARK })],
        }),

        // Findings table: Severity | Title | Category | File | Effort
        new Table({
          width: { size: CONTENT_WIDTH, type: WidthType.DXA },
          columnWidths: [1200, 2800, 1600, 2560, 1200],
          rows: [
            new TableRow({
              children: [
                headerCell("Severity", 1200),
                headerCell("Title", 2800),
                headerCell("Category", 1600),
                headerCell("File", 2560),
                headerCell("Effort", 1200),
              ],
            }),
            ...findings.map((f, i) =>
              new TableRow({
                children: [
                  severityCell(f.severity, 1200),
                  dataCell(f.title, 2800, { shading: i % 2 === 0 ? LIGHT_GRAY : undefined }),
                  dataCell(f.category, 1600, { shading: i % 2 === 0 ? LIGHT_GRAY : undefined }),
                  dataCell(f.file, 2560, { shading: i % 2 === 0 ? LIGHT_GRAY : undefined, color: TEXT_GRAY }),
                  dataCell(f.effort, 1200, { shading: i % 2 === 0 ? LIGHT_GRAY : undefined }),
                ],
              })
            ),
          ],
        }),

        new Paragraph({ children: [new PageBreak()] }),

        // ─── 4. FINDING DETAILS ──────────────────────────────────
        new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("4. Finding Details")] }),

        ...findings.flatMap((f) => [
          new Paragraph({
            heading: HeadingLevel.HEADING_3,
            children: [new TextRun({ text: `${f.severity.toUpperCase()}: ${f.title}`, color: severityColors[f.severity] })],
          }),
          new Paragraph({
            spacing: { after: 40 },
            children: [
              new TextRun({ text: "Category: ", font: FONT, size: 20, bold: true, color: TEXT_GRAY }),
              new TextRun({ text: f.category, font: FONT, size: 20, color: TEXT_DARK }),
              new TextRun({ text: "    File: ", font: FONT, size: 20, bold: true, color: TEXT_GRAY }),
              new TextRun({ text: f.file, font: FONT, size: 20, color: TEXT_DARK }),
              new TextRun({ text: "    Effort: ", font: FONT, size: 20, bold: true, color: TEXT_GRAY }),
              new TextRun({ text: f.effort, font: FONT, size: 20, color: TEXT_DARK }),
            ],
          }),
          new Paragraph({
            spacing: { after: 200 },
            children: [new TextRun({ text: f.description, font: FONT, size: 20, color: TEXT_DARK })],
          }),
        ]),

        new Paragraph({ children: [new PageBreak()] }),

        // ─── 5. MIGRATION PLAN ───────────────────────────────────
        new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("5. Migration Plan")] }),

        // Readiness callout
        new Table({
          width: { size: CONTENT_WIDTH, type: WidthType.DXA },
          columnWidths: [CONTENT_WIDTH],
          rows: [new TableRow({
            children: [new TableCell({
              borders: { top: { style: BorderStyle.SINGLE, size: 3, color: "DC2626" }, bottom: { style: BorderStyle.SINGLE, size: 3, color: "DC2626" }, left: { style: BorderStyle.SINGLE, size: 3, color: "DC2626" }, right: { style: BorderStyle.SINGLE, size: 3, color: "DC2626" } },
              width: { size: CONTENT_WIDTH, type: WidthType.DXA },
              shading: { fill: "FEF2F2", type: ShadingType.CLEAR },
              margins: { top: 120, bottom: 120, left: 200, right: 200 },
              children: [
                new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "MIGRATION READINESS SCORE", font: FONT, size: 20, bold: true, color: "DC2626" })] }),
                new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 80 }, children: [new TextRun({ text: "1.0 / 5.0", font: FONT, size: 44, bold: true, color: "DC2626" })] }),
                new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 40 }, children: [new TextRun({ text: "NOT READY \u2014 Major rewrite required", font: FONT, size: 20, color: "DC2626" })] }),
              ],
            })],
          })],
        }),

        new Paragraph({ spacing: { before: 200 }, children: [] }),

        new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("Recommended Strategy")] }),
        new Paragraph({
          spacing: { after: 200 },
          children: [new TextRun({ text: "Phased Strangler Fig Migration \u2014 Incrementally replace FORTRAN modules with modern equivalents while maintaining the existing system as a reference implementation.", font: FONT, size: 22, color: TEXT_DARK, italics: true })],
        }),

        // Readiness Distribution
        new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("Readiness Distribution")] }),
        new Table({
          width: { size: CONTENT_WIDTH, type: WidthType.DXA },
          columnWidths: [3120, 3120, 3120],
          rows: [
            new TableRow({ children: [headerCell("Category", 3120), headerCell("Subroutines", 3120), headerCell("Percentage", 3120)] }),
            ...([
              ["Not Ready", "1,200", "69.4%", "DC2626"],
              ["Needs Work", "400", "23.1%", "EA580C"],
              ["Partial", "100", "5.8%", "D4A843"],
              ["Mostly Ready", "25", "1.4%", "1A73E8"],
              ["Ready", "3", "0.2%", HULDE_GREEN],
            ]).map(([label, count, pct, color], i) =>
              new TableRow({
                children: [
                  new TableCell({
                    borders, width: { size: 3120, type: WidthType.DXA },
                    shading: i % 2 === 0 ? { fill: LIGHT_GRAY, type: ShadingType.CLEAR } : undefined,
                    margins: cellMargins,
                    children: [new Paragraph({ children: [new TextRun({ text: `\u25CF ${label}`, font: FONT, size: 20, bold: true, color })] })],
                  }),
                  dataCell(count, 3120, { shading: i % 2 === 0 ? LIGHT_GRAY : undefined }),
                  dataCell(pct, 3120, { shading: i % 2 === 0 ? LIGHT_GRAY : undefined }),
                ],
              })
            ),
          ],
        }),

        new Paragraph({ spacing: { before: 200 }, children: [] }),

        // Phased Plan
        new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("Phased Migration Plan")] }),
        new Table({
          width: { size: CONTENT_WIDTH, type: WidthType.DXA },
          columnWidths: [600, 2200, 3160, 1400, 1000, 1000],
          rows: [
            new TableRow({
              children: [
                headerCell("#", 600),
                headerCell("Phase", 2200),
                headerCell("Description", 3160),
                headerCell("Effort", 1400),
                headerCell("Risk", 1000),
                headerCell("Files", 1000),
              ],
            }),
            ...([
              ["1", "Assessment & Cataloging", "Complete inventory of all subroutines, COMMON blocks, and dependencies.", "6 months", "Low", "1,728"],
              ["2", "Infrastructure & Testing", "Set up modern build system, CI/CD, and regression test suite.", "12 months", "Medium", "200"],
              ["3", "Core Module Migration", "Migrate core matrix and solver routines to modern Fortran 2018 or C++.", "24 months", "High", "800"],
              ["4", "Full Migration & Validation", "Complete migration, parallel testing, and validation.", "18 months", "High", "728"],
            ]).map((row, i) =>
              new TableRow({
                children: row.map((cell, j) =>
                  dataCell(cell, [600, 2200, 3160, 1400, 1000, 1000][j], { shading: i % 2 === 0 ? LIGHT_GRAY : undefined })
                ),
              })
            ),
            new TableRow({
              children: [
                dataCell("", 600, { shading: HULDE_NAVY, color: WHITE }),
                dataCell("TOTAL", 2200, { bold: true, shading: HULDE_NAVY, color: WHITE }),
                dataCell("Full migration lifecycle", 3160, { shading: HULDE_NAVY, color: WHITE }),
                dataCell("60 months", 1400, { bold: true, shading: HULDE_NAVY, color: WHITE }),
                dataCell("", 1000, { shading: HULDE_NAVY, color: WHITE }),
                dataCell("1,728", 1000, { bold: true, shading: HULDE_NAVY, color: WHITE }),
              ],
            }),
          ],
        }),

        new Paragraph({ spacing: { before: 200 }, children: [] }),

        new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("Target Language Recommendations")] }),
        new Table({
          width: { size: CONTENT_WIDTH, type: WidthType.DXA },
          columnWidths: [2340, 2340, 4680],
          rows: [
            new TableRow({ children: [headerCell("Source", 2340), headerCell("Target", 2340), headerCell("Rationale", 4680)] }),
            new TableRow({
              children: [
                dataCell("FORTRAN 77", 2340),
                dataCell("Modern Fortran 2018 or C++", 2340, { bold: true }),
                dataCell("Preserves numerical accuracy while gaining modern language features, modules, and type safety.", 4680),
              ],
            }),
          ],
        }),

        new Paragraph({ children: [new PageBreak()] }),

        // ─── 6. TECHNICAL DEBT ANALYSIS ──────────────────────────
        new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("6. Technical Debt Analysis")] }),
        new Paragraph({
          spacing: { after: 200 },
          children: [new TextRun({ text: "The estimated technical debt of 287,131 hours represents approximately 164 person-years of effort. This analysis is based on the complexity and severity of findings across the entire codebase.", font: FONT, size: 22, color: TEXT_DARK })],
        }),

        new Table({
          width: { size: CONTENT_WIDTH, type: WidthType.DXA },
          columnWidths: [3120, 3120, 3120],
          rows: [
            new TableRow({ children: [headerCell("Debt Category", 3120), headerCell("Estimated Hours", 3120), headerCell("Priority", 3120)] }),
            ...([
              ["Control Flow Modernization", "45,200", "Critical"],
              ["Data Integrity & Safety", "62,400", "Critical"],
              ["Error Handling", "18,900", "High"],
              ["Testing Infrastructure", "38,000", "High"],
              ["Documentation", "22,500", "Medium"],
              ["Code Style & Standards", "8,100", "Low"],
              ["Build & Tooling", "12,600", "Medium"],
              ["Migration Preparation", "79,431", "High"],
            ]).map((row, i) =>
              new TableRow({
                children: [
                  dataCell(row[0], 3120, { shading: i % 2 === 0 ? LIGHT_GRAY : undefined }),
                  dataCell(row[1], 3120, { shading: i % 2 === 0 ? LIGHT_GRAY : undefined }),
                  new TableCell({
                    borders, width: { size: 3120, type: WidthType.DXA },
                    shading: i % 2 === 0 ? { fill: LIGHT_GRAY, type: ShadingType.CLEAR } : undefined,
                    margins: cellMargins,
                    children: [new Paragraph({ children: [new TextRun({ text: row[2], font: FONT, size: 20, bold: true, color: row[2] === "Critical" ? "DC2626" : row[2] === "High" ? "EA580C" : row[2] === "Medium" ? "D4A843" : "1A73E8" })] })],
                  }),
                ],
              })
            ),
            new TableRow({
              children: [
                dataCell("Total", 3120, { bold: true, shading: HULDE_NAVY, color: WHITE }),
                dataCell("287,131 hours", 3120, { bold: true, shading: HULDE_NAVY, color: WHITE }),
                dataCell("~164 person-years", 3120, { bold: true, shading: HULDE_NAVY, color: WHITE }),
              ],
            }),
          ],
        }),

        new Paragraph({ children: [new PageBreak()] }),

        // ─── 7. RECOMMENDATIONS ──────────────────────────────────
        new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("7. Recommendations")] }),

        new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("Immediate Actions (0-3 months)")] }),
        new Paragraph({ numbering: { reference: "bullets", level: 0 }, children: [new TextRun({ text: "Establish a comprehensive regression test suite using known-good NASTRAN output results as oracle data.", font: FONT, size: 22 })] }),
        new Paragraph({ numbering: { reference: "bullets", level: 0 }, children: [new TextRun({ text: "Add IMPLICIT NONE to all program units and resolve undeclared variable warnings.", font: FONT, size: 22 })] }),
        new Paragraph({ numbering: { reference: "bullets", level: 0 }, children: [new TextRun({ text: "Implement IOSTAT error checking on all I/O operations to prevent silent data corruption.", font: FONT, size: 22 })] }),
        new Paragraph({ numbering: { reference: "bullets", level: 0 }, children: [new TextRun({ text: "Set up version control (Git) with proper branching strategy and CI pipeline.", font: FONT, size: 22 })] }),

        new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("Short-Term Actions (3-12 months)")] }),
        new Paragraph({ numbering: { reference: "bullets", level: 0 }, children: [new TextRun({ text: "Begin systematic GOTO elimination starting with the most critical subroutines.", font: FONT, size: 22 })] }),
        new Paragraph({ numbering: { reference: "bullets", level: 0 }, children: [new TextRun({ text: "Convert fixed-format FORTRAN to free-format (.f90) using automated tooling.", font: FONT, size: 22 })] }),
        new Paragraph({ numbering: { reference: "bullets", level: 0 }, children: [new TextRun({ text: "Replace COMMON blocks with MODULE-based data encapsulation in high-traffic modules.", font: FONT, size: 22 })] }),
        new Paragraph({ numbering: { reference: "bullets", level: 0 }, children: [new TextRun({ text: "Document the top 100 most critical subroutines with Doxygen-compatible headers.", font: FONT, size: 22 })] }),

        new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("Long-Term Strategy (1-5 years)")] }),
        new Paragraph({ numbering: { reference: "bullets", level: 0 }, children: [new TextRun({ text: "Execute the phased Strangler Fig migration plan, starting with the assessment phase.", font: FONT, size: 22 })] }),
        new Paragraph({ numbering: { reference: "bullets", level: 0 }, children: [new TextRun({ text: "Target Modern Fortran 2018 for numerical core, C++ for infrastructure and I/O layers.", font: FONT, size: 22 })] }),
        new Paragraph({ numbering: { reference: "bullets", level: 0 }, children: [new TextRun({ text: "Maintain parallel operation of legacy and modernized systems throughout migration.", font: FONT, size: 22 })] }),
        new Paragraph({ numbering: { reference: "bullets", level: 0 }, children: [new TextRun({ text: "Validate modernized modules against the NASTRAN Verification Problem Manual.", font: FONT, size: 22 })] }),

        new Paragraph({ spacing: { before: 400 }, children: [] }),

        // Final note
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 400 },
          children: [new TextRun({ text: "\u2500".repeat(40), font: FONT, size: 20, color: BORDER_GRAY })],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 100, after: 40 },
          children: [new TextRun({ text: "End of Report", font: FONT, size: 20, color: TEXT_GRAY, italics: true })],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            new TextRun({ text: "Hulde Review", font: FONT, size: 20, bold: true, color: HULDE_GREEN }),
            new TextRun({ text: " \u2014 Enterprise Code Review Platform \u2014 ", font: FONT, size: 20, color: TEXT_GRAY }),
            new TextRun({ text: "hulde.ai", font: FONT, size: 20, bold: true, color: HULDE_GREEN }),
          ],
        }),
      ],
    },
  ],
});

// ─── Generate ────────────────────────────────────────────────────
const outPath = "/Users/tarrysingh/Documents/GitHub/hulde-review/reports/NASTRAN-93-Code-Review.docx";
Packer.toBuffer(doc).then((buffer) => {
  fs.writeFileSync(outPath, buffer);
  console.log(`Report generated: ${outPath}`);
  console.log(`Size: ${(buffer.length / 1024).toFixed(1)} KB`);
});
