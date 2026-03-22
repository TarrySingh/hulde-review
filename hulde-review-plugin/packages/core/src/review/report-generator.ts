/**
 * Report Generator
 *
 * Aggregates ReviewFindings into a complete CodeReviewReport
 * with risk scores, technical debt estimates, executive summary,
 * and prioritized recommendations.
 */

import type {
  ReviewFinding,
  ReviewSummary,
  CodeReviewReport,
  Severity,
  FindingCategory,
} from "./types.js";

// ---------------------------------------------------------------------------
// Severity & effort weights for scoring
// ---------------------------------------------------------------------------

const SEVERITY_WEIGHT: Record<Severity, number> = {
  critical: 10,
  high: 6,
  medium: 3,
  low: 1,
  info: 0,
};

const EFFORT_HOURS: Record<string, number> = {
  trivial: 0.25,
  small: 1,
  medium: 4,
  large: 16,
  epic: 40,
};

const ALL_SEVERITIES: Severity[] = ["critical", "high", "medium", "low", "info"];
const ALL_CATEGORIES: FindingCategory[] = [
  "quality",
  "security",
  "performance",
  "maintainability",
  "reliability",
  "modernization",
  "architecture",
  "compliance",
];

// ---------------------------------------------------------------------------
// Report Generation
// ---------------------------------------------------------------------------

export interface ReportInput {
  projectName: string;
  gitCommitHash: string;
  totalFiles: number;
  totalLines: number;
  languages: string[];
  findings: ReviewFinding[];
  fileLanguageMap?: Map<string, string>;
  fileLinesMap?: Map<string, number>;
}

export class ReportGenerator {
  generate(input: ReportInput): CodeReviewReport {
    const findings = input.findings;
    const summary = this.buildSummary(findings);
    const languageBreakdown = this.buildLanguageBreakdown(input);
    const executiveSummary = this.buildExecutiveSummary(input, summary);
    const recommendations = this.buildRecommendations(findings);

    return {
      version: "1.0.0",
      project: {
        name: input.projectName,
        analyzedAt: new Date().toISOString(),
        gitCommitHash: input.gitCommitHash,
        totalFiles: input.totalFiles,
        totalLines: input.totalLines,
        languages: input.languages,
      },
      summary,
      findings,
      languageBreakdown,
      executiveSummary,
      recommendations,
    };
  }

  // -------------------------------------------------------------------------
  // Summary with risk score
  // -------------------------------------------------------------------------

  buildSummary(findings: ReviewFinding[]): ReviewSummary {
    const bySeverity: Record<Severity, number> = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
    const byCategory: Record<FindingCategory, number> = {
      quality: 0, security: 0, performance: 0, maintainability: 0,
      reliability: 0, modernization: 0, architecture: 0, compliance: 0,
    };

    for (const f of findings) {
      bySeverity[f.severity]++;
      byCategory[f.category]++;
    }

    const riskScore = this.calculateRiskScore(findings);
    const technicalDebtHours = this.calculateTechnicalDebt(findings);
    const topRisks = this.extractTopRisks(findings);

    return {
      totalFindings: findings.length,
      bySeverity,
      byCategory,
      riskScore,
      technicalDebtHours,
      topRisks,
    };
  }

  /**
   * Composite risk score (0-100).
   *
   * Formula:
   *  - Sum weighted severity points for all findings
   *  - Normalize against a reference max (a project with 50 critical findings = 100)
   *  - Boost for security and reliability findings
   *  - Cap at 100
   */
  calculateRiskScore(findings: ReviewFinding[]): number {
    if (findings.length === 0) return 0;

    let rawScore = 0;
    for (const f of findings) {
      let weight = SEVERITY_WEIGHT[f.severity];
      // Boost security and reliability findings
      if (f.category === "security") weight *= 1.5;
      if (f.category === "reliability") weight *= 1.3;
      rawScore += weight;
    }

    // Normalize: 250 points = 100 risk score
    const normalized = Math.round((rawScore / 250) * 100);
    return Math.min(100, Math.max(0, normalized));
  }

  calculateTechnicalDebt(findings: ReviewFinding[]): number {
    let hours = 0;
    for (const f of findings) {
      hours += EFFORT_HOURS[f.effort] ?? 1;
    }
    return Math.round(hours * 10) / 10;
  }

  extractTopRisks(findings: ReviewFinding[]): string[] {
    // Sort by severity weight descending, take top 5
    const sorted = [...findings]
      .sort((a, b) => SEVERITY_WEIGHT[b.severity] - SEVERITY_WEIGHT[a.severity]);

    const seen = new Set<string>();
    const risks: string[] = [];
    for (const f of sorted) {
      if (risks.length >= 5) break;
      const key = `${f.category}:${f.title}`;
      if (seen.has(key)) continue;
      seen.add(key);
      risks.push(`[${f.severity.toUpperCase()}] ${f.title} (${f.filePath})`);
    }
    return risks;
  }

  // -------------------------------------------------------------------------
  // Language breakdown
  // -------------------------------------------------------------------------

  buildLanguageBreakdown(input: ReportInput): CodeReviewReport["languageBreakdown"] {
    const { findings, fileLanguageMap, fileLinesMap, languages } = input;
    const breakdown: Map<string, { files: Set<string>; lines: number; findings: ReviewFinding[] }> = new Map();

    // Initialize known languages
    for (const lang of languages) {
      breakdown.set(lang, { files: new Set(), lines: 0, findings: [] });
    }

    for (const f of findings) {
      const lang = fileLanguageMap?.get(f.filePath) ?? this.guessLanguage(f.filePath);
      if (!breakdown.has(lang)) {
        breakdown.set(lang, { files: new Set(), lines: 0, findings: [] });
      }
      const entry = breakdown.get(lang)!;
      entry.files.add(f.filePath);
      entry.findings.push(f);
    }

    // Add line counts
    if (fileLinesMap) {
      for (const [file, lines] of fileLinesMap) {
        const lang = fileLanguageMap?.get(file) ?? this.guessLanguage(file);
        if (breakdown.has(lang)) {
          breakdown.get(lang)!.files.add(file);
          breakdown.get(lang)!.lines += lines;
        }
      }
    }

    return [...breakdown.entries()].map(([language, data]) => ({
      language,
      files: data.files.size,
      lines: data.lines,
      findingsCount: data.findings.length,
      riskScore: this.calculateRiskScore(data.findings),
    }));
  }

  private guessLanguage(filePath: string): string {
    const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
    const map: Record<string, string> = {
      ts: "typescript", tsx: "tsx", js: "javascript", jsx: "jsx",
      f: "fortran", for: "fortran", f77: "fortran", f90: "fortran",
      f95: "fortran", f03: "fortran", f08: "fortran", fpp: "fortran",
      py: "python", go: "go", rs: "rust", java: "java",
      c: "c", cpp: "cpp", h: "c", hpp: "cpp",
      rb: "ruby", php: "php", cs: "csharp",
    };
    return map[ext] ?? "unknown";
  }

  // -------------------------------------------------------------------------
  // Executive summary
  // -------------------------------------------------------------------------

  buildExecutiveSummary(input: ReportInput, summary: ReviewSummary): string {
    const { projectName, totalFiles, totalLines, languages } = input;
    const { totalFindings, bySeverity, riskScore, technicalDebtHours } = summary;

    const riskLabel = riskScore >= 70 ? "HIGH" : riskScore >= 40 ? "MODERATE" : riskScore >= 15 ? "LOW" : "MINIMAL";

    let para1 = `Code review analysis of ${projectName} covering ${totalFiles} files (${totalLines.toLocaleString()} lines) across ${languages.join(", ")}. `;
    para1 += `The analysis identified ${totalFindings} findings with a composite risk score of ${riskScore}/100 (${riskLabel} risk). `;
    if (bySeverity.critical > 0) {
      para1 += `There ${bySeverity.critical === 1 ? "is" : "are"} ${bySeverity.critical} critical finding${bySeverity.critical > 1 ? "s" : ""} that should be addressed immediately. `;
    }

    let para2 = `The estimated technical debt is ${technicalDebtHours} hours. `;
    if (bySeverity.critical > 0 || bySeverity.high > 0) {
      para2 += `Priority attention should be given to ${bySeverity.critical} critical and ${bySeverity.high} high-severity issues. `;
    }

    // Add language-specific notes
    if (languages.includes("fortran")) {
      const fortranFindings = input.findings.filter((f) => f.tags.includes("fortran"));
      if (fortranFindings.length > 0) {
        para2 += `Legacy Fortran code accounts for ${fortranFindings.length} finding${fortranFindings.length > 1 ? "s" : ""}, including issues with implicit typing, GOTO usage, and COMMON block patterns that are typical of pre-Fortran 90 codebases. `;
      }
    }

    let para3 = "Recommended next steps: ";
    if (bySeverity.critical > 0) {
      para3 += "Address all critical findings first, focusing on security and reliability issues. ";
    }
    if (summary.byCategory.security > 0) {
      para3 += `Conduct a security-focused review of the ${summary.byCategory.security} security finding${summary.byCategory.security > 1 ? "s" : ""}. `;
    }
    if (summary.byCategory.modernization > 0) {
      para3 += `Consider a modernization initiative for the ${summary.byCategory.modernization} legacy-code finding${summary.byCategory.modernization > 1 ? "s" : ""}. `;
    }
    para3 += "See prioritized recommendations below for a phased improvement plan.";

    return `${para1}\n\n${para2}\n\n${para3}`;
  }

  // -------------------------------------------------------------------------
  // Prioritized recommendations
  // -------------------------------------------------------------------------

  buildRecommendations(findings: ReviewFinding[]): CodeReviewReport["recommendations"] {
    // Group findings by category + severity to produce actionable recommendations
    const groups = new Map<string, ReviewFinding[]>();
    for (const f of findings) {
      const key = `${f.category}:${f.severity}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(f);
    }

    // Sort groups by severity weight
    const sorted = [...groups.entries()].sort((a, b) => {
      const aSev = a[1][0].severity;
      const bSev = b[1][0].severity;
      return SEVERITY_WEIGHT[bSev] - SEVERITY_WEIGHT[aSev];
    });

    const recommendations: CodeReviewReport["recommendations"] = [];
    let priority = 1;

    for (const [key, groupFindings] of sorted) {
      if (priority > 10) break; // Cap at 10 recommendations
      const [category, severity] = key.split(":");
      const totalEffort = groupFindings.reduce((sum, f) => sum + (EFFORT_HOURS[f.effort] ?? 1), 0);

      const effortLabel = totalEffort <= 2 ? "< 1 day" :
        totalEffort <= 8 ? "1-2 days" :
        totalEffort <= 40 ? "1-2 weeks" :
        totalEffort <= 160 ? "1-2 months" : "> 2 months";

      const impactLabel = severity === "critical" ? "Prevents potential outages or security breaches" :
        severity === "high" ? "Significantly improves code quality and reduces risk" :
        severity === "medium" ? "Improves maintainability and developer experience" :
        "Nice-to-have cleanup that improves consistency";

      recommendations.push({
        priority,
        title: `Address ${groupFindings.length} ${severity}-severity ${category} finding${groupFindings.length > 1 ? "s" : ""}`,
        description: groupFindings.slice(0, 3).map((f) => f.title).join("; ") +
          (groupFindings.length > 3 ? `; and ${groupFindings.length - 3} more` : ""),
        estimatedEffort: effortLabel,
        impact: impactLabel,
      });
      priority++;
    }

    return recommendations;
  }
}
