#!/usr/bin/env node
/**
 * AWS CardDemo Full Code Review — COBOL Language Support Case Study
 * Runs the hulde-review static + semantic analysis engine against all COBOL files
 */

import { CobolPlugin } from '../hulde-review-plugin/packages/core/dist/plugins/cobol-plugin.js';
import { createDefaultRulesEngineWithSemanticRules } from '../hulde-review-plugin/packages/core/dist/review/rules-engine.js';
import { ReportGenerator } from '../hulde-review-plugin/packages/core/dist/review/report-generator.js';
import { MigrationAnalyzer } from '../hulde-review-plugin/packages/core/dist/review/migration-analyzer.js';
import { readFileSync, writeFileSync, readdirSync, statSync, mkdirSync, existsSync } from 'fs';
import { join, relative } from 'path';

const CARDDEMO_ROOT = '/Users/tarrysingh/Documents/GitHub/aws-mainframe-modernization-carddemo';
const OUTPUT_DIR = join(CARDDEMO_ROOT, '.hulde-review');

// Recursively find all COBOL files
function findCobolFiles(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === '.git' || entry === 'node_modules' || entry === '.hulde-review') continue;
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      findCobolFiles(full, files);
    } else if (
      entry.endsWith('.cbl') ||
      entry.endsWith('.cob') ||
      entry.endsWith('.cpy')
    ) {
      files.push(full);
    }
  }
  return files;
}

console.log('==============================================================');
console.log('   HULDE REVIEW — AWS CardDemo COBOL Code Review              ');
console.log('   Enterprise mainframe credit card management system         ');
console.log('==============================================================');
console.log('');

const startTime = Date.now();

// Initialize
const plugin = new CobolPlugin();
const engine = createDefaultRulesEngineWithSemanticRules();
const migrationAnalyzer = new MigrationAnalyzer();
const allFindings = [];
const allMigrations = [];
let totalLines = 0;
let filesAnalyzed = 0;
let filesWithErrors = 0;
const fileSizes = [];

// Find all files
console.log('Phase 1 — Scanning...');
const files = findCobolFiles(CARDDEMO_ROOT);
console.log(`  Found ${files.length} COBOL files (.cbl, .cob, .cpy)`);
console.log('');

// Analyze each file
console.log('Phase 2 — Static + Semantic Analysis...');

for (let i = 0; i < files.length; i++) {
  const filePath = files[i];
  const relPath = relative(CARDDEMO_ROOT, filePath);

  try {
    const content = readFileSync(filePath, 'utf-8');
    const lines = content.split('\n').length;
    totalLines += lines;
    fileSizes.push({ path: relPath, lines });

    const structural = plugin.analyzeFile(relPath, content);
    const callGraph = plugin.extractCallGraph?.(relPath, content) ?? [];

    const findings = engine.analyze({
      filePath: relPath,
      content,
      language: 'cobol',
      structural,
      callGraph,
    });

    allFindings.push(...findings);

    // Migration analysis for each program/paragraph
    for (const fn of structural.functions) {
      if (fn.returnType === 'PROGRAM') {
        try {
          const migration = migrationAnalyzer.analyzeSubroutine(
            fn.name, relPath, content, structural, callGraph,
          );
          allMigrations.push(migration);
        } catch { /* skip */ }
      }
    }

    filesAnalyzed++;
  } catch (err) {
    filesWithErrors++;
    if (filesWithErrors <= 5) {
      console.log(`  WARNING: Error analyzing ${relPath}: ${err.message}`);
    }
  }

  // Progress every 25%
  if (files.length > 10 && (i + 1) % Math.floor(files.length / 4) === 0) {
    const pct = Math.round(((i + 1) / files.length) * 100);
    console.log(`  ${pct}% — ${i + 1}/${files.length} files (${allFindings.length} findings so far)`);
  }
}

console.log(`  OK: Analyzed ${filesAnalyzed} files (${filesWithErrors} errors)`);
console.log(`  OK: Total findings: ${allFindings.length}`);
console.log('');

// Generate report
console.log('Phase 3 — Report Generation...');
const generator = new ReportGenerator();

const fileLinesMap = new Map();
for (const { path, lines } of fileSizes) {
  fileLinesMap.set(path, lines);
}

const report = generator.generate({
  projectName: 'AWS CardDemo',
  gitCommitHash: 'aws-samples/aws-mainframe-modernization-carddemo@main',
  totalFiles: filesAnalyzed,
  totalLines,
  languages: ['cobol'],
  findings: allFindings,
  fileLinesMap,
});

// Generate migration plan
console.log('Phase 4 — Migration Analysis...');
const migrationPlan = migrationAnalyzer.generatePlan(allMigrations, 'AWS CardDemo');
console.log(`  OK: Analyzed ${allMigrations.length} programs for migration readiness`);
console.log(`  OK: Overall readiness: ${migrationPlan.overallReadiness}/5`);
console.log(`  OK: Strategy: ${migrationPlan.recommendedStrategy.split(' — ')[0]}`);
console.log('');

// Write output
if (!existsSync(OUTPUT_DIR)) {
  mkdirSync(OUTPUT_DIR, { recursive: true });
}

writeFileSync(
  join(OUTPUT_DIR, 'review-report.json'),
  JSON.stringify(report, null, 2),
);

writeFileSync(
  join(OUTPUT_DIR, 'migration-plan.json'),
  JSON.stringify(migrationPlan, null, 2),
);

// Generate markdown report
const md = [];
md.push('# AWS CardDemo — COBOL Code Review Report');
md.push('');
md.push(`*Generated by [Hulde Review](https://hulde.ai) on ${new Date().toLocaleDateString()}*`);
md.push('');
md.push('## Executive Summary');
md.push('');
md.push(report.executiveSummary);
md.push('');
md.push('## Risk Score');
md.push('');
md.push(`**${report.summary.riskScore}/100** ${report.summary.riskScore > 70 ? 'HIGH RISK' : report.summary.riskScore > 40 ? 'MODERATE RISK' : 'LOW RISK'}`);
md.push('');
md.push('## Summary');
md.push('');
md.push(`| Metric | Value |`);
md.push(`|---|---|`);
md.push(`| Total Files | ${filesAnalyzed} |`);
md.push(`| Total Lines | ${totalLines.toLocaleString()} |`);
md.push(`| Total Findings | ${report.summary.totalFindings} |`);
md.push(`| Technical Debt | ${report.summary.technicalDebtHours.toLocaleString()} hours |`);
md.push(`| Critical | ${report.summary.bySeverity.critical} |`);
md.push(`| High | ${report.summary.bySeverity.high} |`);
md.push(`| Medium | ${report.summary.bySeverity.medium} |`);
md.push(`| Low | ${report.summary.bySeverity.low} |`);
md.push(`| Info | ${report.summary.bySeverity.info} |`);
md.push('');
md.push('## Findings by Category');
md.push('');
md.push(`| Category | Count |`);
md.push(`|---|---|`);
for (const [cat, count] of Object.entries(report.summary.byCategory).sort((a, b) => b[1] - a[1])) {
  if (count > 0) md.push(`| ${cat} | ${count} |`);
}
md.push('');
md.push('## Top Risks');
md.push('');
for (const risk of report.summary.topRisks) {
  md.push(`- ${risk}`);
}
md.push('');
md.push('## Prioritized Recommendations');
md.push('');
for (const rec of report.recommendations) {
  md.push(`### ${rec.priority}. ${rec.title}`);
  md.push('');
  md.push(rec.description);
  md.push('');
  md.push(`- **Effort**: ${rec.estimatedEffort}`);
  md.push(`- **Impact**: ${rec.impact}`);
  md.push('');
}

// Migration Readiness section
md.push('## Migration Readiness');
md.push('');
md.push(`**Overall Readiness Score: ${migrationPlan.overallReadiness}/5**`);
md.push('');
md.push(`**Recommended Strategy**: ${migrationPlan.recommendedStrategy}`);
md.push('');
md.push(`| Readiness | Count | Description |`);
md.push(`|---|---|---|`);
md.push(`| 1 (Easy) | ${migrationPlan.byReadiness[1]} | Clean structured COBOL |`);
md.push(`| 2 (Moderate) | ${migrationPlan.byReadiness[2]} | Some legacy patterns |`);
md.push(`| 3 (Hard) | ${migrationPlan.byReadiness[3]} | GO TO, PERFORM THRU, REDEFINES |`);
md.push(`| 4 (Very Hard) | ${migrationPlan.byReadiness[4]} | CICS, DB2, deep dependencies |`);
md.push(`| 5 (Rewrite) | ${migrationPlan.byReadiness[5]} | Too entangled for migration |`);
md.push('');

// Top worst files
md.push('## Highest-Risk Files');
md.push('');
md.push(`| File | Findings | Worst Severity |`);
md.push(`|---|---|---|`);

const findingsByFile = {};
for (const f of allFindings) {
  if (!findingsByFile[f.filePath]) findingsByFile[f.filePath] = [];
  findingsByFile[f.filePath].push(f);
}

const severityOrder = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
const worstFiles = Object.entries(findingsByFile)
  .map(([path, findings]) => ({
    path,
    count: findings.length,
    worstSeverity: findings.reduce((worst, f) =>
      severityOrder[f.severity] < severityOrder[worst] ? f.severity : worst, 'info'),
  }))
  .sort((a, b) => {
    const sevDiff = severityOrder[a.worstSeverity] - severityOrder[b.worstSeverity];
    return sevDiff !== 0 ? sevDiff : b.count - a.count;
  })
  .slice(0, 20);

for (const f of worstFiles) {
  md.push(`| \`${f.path}\` | ${f.count} | ${f.worstSeverity} |`);
}
md.push('');

// Critical findings detail
md.push('## Critical Findings Detail');
md.push('');
const criticals = allFindings.filter(f => f.severity === 'critical').slice(0, 30);
for (const f of criticals) {
  md.push(`### ${f.title}`);
  md.push('');
  md.push(`**File**: \`${f.filePath}\`${f.lineRange ? ` (lines ${f.lineRange[0]}-${f.lineRange[1]})` : ''}`);
  md.push('');
  md.push(f.description);
  if (f.suggestion) {
    md.push('');
    md.push(`**Suggestion**: ${f.suggestion}`);
  }
  md.push('');
}

md.push('---');
md.push('');
md.push('*Powered by [Hulde Review](https://hulde.ai) — AI-powered code review for enterprise codebases*');

writeFileSync(join(OUTPUT_DIR, 'review-report.md'), md.join('\n'));

const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

console.log('');
console.log('==============================================================');
console.log('                       RESULTS                                ');
console.log('--------------------------------------------------------------');
console.log(`  Risk Score:      ${report.summary.riskScore} / 100`);
console.log(`  Total Findings:  ${report.summary.totalFindings}`);
console.log(`  Critical:        ${report.summary.bySeverity.critical}`);
console.log(`  High:            ${report.summary.bySeverity.high}`);
console.log(`  Medium:          ${report.summary.bySeverity.medium}`);
console.log(`  Low:             ${report.summary.bySeverity.low}`);
console.log(`  Info:            ${report.summary.bySeverity.info}`);
console.log(`  Tech Debt:       ${report.summary.technicalDebtHours.toLocaleString()} hours`);
console.log(`  Time:            ${elapsed}s`);
console.log('--------------------------------------------------------------');
console.log(`  Migration:       ${allMigrations.length} programs analyzed`);
console.log(`  Readiness:       ${migrationPlan.overallReadiness}/5`);
console.log('--------------------------------------------------------------');
console.log('  Output:');
console.log('  -> .hulde-review/review-report.json');
console.log('  -> .hulde-review/review-report.md');
console.log('  -> .hulde-review/migration-plan.json');
console.log('==============================================================');
