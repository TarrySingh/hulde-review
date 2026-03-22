/**
 * Code Review Engine Types
 *
 * Enterprise-grade code review findings for legacy and modern codebases.
 * Designed to serve banks, oil & gas, manufacturing, telecom.
 */

export type Severity = "critical" | "high" | "medium" | "low" | "info";

export type FindingCategory =
  | "quality"         // Code quality: complexity, duplication, readability
  | "security"        // Security: buffer overflows, injection, auth issues
  | "performance"     // Performance: memory leaks, inefficient algorithms, blocking I/O
  | "maintainability" // Maintainability: dead code, tight coupling, missing abstractions
  | "reliability"     // Reliability: error handling, race conditions, resource leaks
  | "modernization"   // Legacy-specific: deprecated APIs, migration opportunities
  | "architecture"    // Architecture: layer violations, circular dependencies
  | "compliance";     // Compliance: coding standards, naming conventions, documentation

export interface ReviewFinding {
  id: string;                        // Unique finding ID: `finding:<category>:<hash>`
  category: FindingCategory;
  severity: Severity;
  title: string;                     // Short title: "Deeply nested GOTO chain"
  description: string;               // Detailed explanation
  filePath: string;                  // File where finding was detected
  lineRange?: [number, number];      // Line range if applicable
  nodeId?: string;                   // Link to knowledge graph node
  suggestion?: string;               // Actionable fix suggestion
  effort: "trivial" | "small" | "medium" | "large" | "epic";  // Estimated fix effort
  tags: string[];                    // e.g., ["fortran", "goto-spaghetti", "legacy"]
  cweId?: string;                    // CWE ID for security findings (e.g., "CWE-120")
  references?: string[];             // Links to relevant docs/standards
}

export interface ReviewSummary {
  totalFindings: number;
  bySeverity: Record<Severity, number>;
  byCategory: Record<FindingCategory, number>;
  riskScore: number;                 // 0-100 composite risk score
  technicalDebtHours: number;        // Estimated hours to address all findings
  topRisks: string[];                // Top 5 risk descriptions
}

export interface CodeReviewReport {
  version: string;
  project: {
    name: string;
    analyzedAt: string;
    gitCommitHash: string;
    totalFiles: number;
    totalLines: number;
    languages: string[];
  };
  summary: ReviewSummary;
  findings: ReviewFinding[];
  languageBreakdown: Array<{
    language: string;
    files: number;
    lines: number;
    findingsCount: number;
    riskScore: number;
  }>;
  // For enterprise reporting
  executiveSummary: string;          // 2-3 paragraph executive summary
  recommendations: Array<{
    priority: number;
    title: string;
    description: string;
    estimatedEffort: string;
    impact: string;
  }>;
}
