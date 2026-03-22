import { useState } from "react";
import { useDashboardStore } from "../store";
import type { Severity, ReviewFinding } from "../store";

const severityColors: Record<Severity, string> = {
  critical: "#e05252",
  high: "#e08a52",
  medium: "#d4a030",
  low: "#4a7c9b",
  info: "#5a6b60",
};

const severityOrder: Severity[] = ["critical", "high", "medium", "low", "info"];

const effortColors: Record<string, string> = {
  trivial: "text-hulde-green",
  small: "text-node-function",
  medium: "text-[#d4a030]",
  large: "text-[#e08a52]",
  epic: "text-[#e05252]",
};

function RiskGauge({ score }: { score: number }) {
  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  const progress = (score / 100) * circumference * 0.75; // 270 degrees
  const color =
    score <= 30
      ? "#00A651"
      : score <= 60
        ? "#d4a030"
        : score <= 80
          ? "#e08a52"
          : "#e05252";

  return (
    <div className="flex flex-col items-center">
      <svg width="100" height="85" viewBox="0 0 100 85">
        {/* Background arc */}
        <circle
          cx="50"
          cy="50"
          r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.06)"
          strokeWidth="8"
          strokeDasharray={`${circumference * 0.75} ${circumference * 0.25}`}
          strokeDashoffset={0}
          strokeLinecap="round"
          transform="rotate(135 50 50)"
        />
        {/* Progress arc */}
        <circle
          cx="50"
          cy="50"
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="8"
          strokeDasharray={`${progress} ${circumference - progress}`}
          strokeDashoffset={0}
          strokeLinecap="round"
          transform="rotate(135 50 50)"
          style={{ transition: "stroke-dasharray 0.6s ease" }}
        />
        {/* Score text */}
        <text
          x="50"
          y="48"
          textAnchor="middle"
          fill={color}
          fontSize="22"
          fontWeight="600"
          fontFamily="var(--font-mono)"
        >
          {score}
        </text>
        <text
          x="50"
          y="63"
          textAnchor="middle"
          fill="var(--color-text-muted)"
          fontSize="9"
          fontFamily="var(--font-sans)"
          letterSpacing="0.08em"
          style={{ textTransform: "uppercase" }}
        >
          RISK SCORE
        </text>
      </svg>
    </div>
  );
}

function FindingDetail({ finding }: { finding: ReviewFinding }) {
  return (
    <div className="mt-2 pt-2 border-t border-border-subtle animate-fade-slide-in">
      <p className="text-[12px] text-text-secondary leading-relaxed mb-2">
        {finding.description}
      </p>

      {finding.suggestion && (
        <div className="mb-2">
          <span className="text-[10px] text-hulde-green uppercase tracking-wider font-semibold">
            Suggestion
          </span>
          <p className="text-[11px] text-text-secondary leading-relaxed mt-0.5">
            {finding.suggestion}
          </p>
        </div>
      )}

      {finding.lineRange && (
        <div className="text-[10px] text-text-muted mb-1">
          Lines {finding.lineRange[0]}–{finding.lineRange[1]}
        </div>
      )}

      {finding.cweId && (
        <div className="text-[10px] text-text-muted mb-1">
          CWE: {finding.cweId}
        </div>
      )}

      {finding.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1.5">
          {finding.tags.map((tag) => (
            <span
              key={tag}
              className="text-[9px] glass text-text-muted px-1.5 py-0.5 rounded-full"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {finding.nodeId && (
        <button
          onClick={() => {
            useDashboardStore.getState().selectNode(finding.nodeId!);
          }}
          className="mt-2 text-[10px] text-hulde-green hover:text-hulde-green-bright transition-colors"
        >
          View in Graph
        </button>
      )}
    </div>
  );
}

export default function ReviewPanel() {
  const reviewReport = useDashboardStore((s) => s.reviewReport);
  const reviewFilter = useDashboardStore((s) => s.reviewFilter);
  const selectedFindingId = useDashboardStore((s) => s.selectedFindingId);
  const setReviewFilter = useDashboardStore((s) => s.setReviewFilter);
  const selectFinding = useDashboardStore((s) => s.selectFinding);

  const [execSummaryOpen, setExecSummaryOpen] = useState(false);
  const [recsOpen, setRecsOpen] = useState(false);

  if (!reviewReport) {
    return (
      <div className="h-full w-full flex items-center justify-center">
        <p className="text-text-muted text-sm">No review report loaded</p>
      </div>
    );
  }

  const { summary, findings, executiveSummary, recommendations } = reviewReport;

  const filteredFindings =
    reviewFilter === "all"
      ? findings
      : findings.filter((f) => f.severity === reviewFilter);

  const criticalHighCount =
    (summary.bySeverity.critical ?? 0) + (summary.bySeverity.high ?? 0);

  // Count unique affected files
  const affectedFiles = new Set(findings.map((f) => f.filePath)).size;

  return (
    <div className="h-full w-full overflow-auto p-5 animate-fade-slide-in">
      {/* Risk Score */}
      <RiskGauge score={summary.riskScore} />

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-3 mb-5 mt-4">
        <div className="bg-elevated rounded-lg p-3 border border-border-subtle">
          <div className="text-2xl font-mono font-medium text-hulde-green">
            {summary.totalFindings}
          </div>
          <div className="text-[11px] text-text-muted uppercase tracking-wider mt-1">
            Findings
          </div>
        </div>
        <div className="bg-elevated rounded-lg p-3 border border-border-subtle">
          <div
            className="text-2xl font-mono font-medium"
            style={{ color: criticalHighCount > 0 ? "#e05252" : "var(--color-hulde-green)" }}
          >
            {criticalHighCount}
          </div>
          <div className="text-[11px] text-text-muted uppercase tracking-wider mt-1">
            Critical+High
          </div>
        </div>
        <div className="bg-elevated rounded-lg p-3 border border-border-subtle">
          <div className="text-2xl font-mono font-medium text-hulde-green">
            {summary.technicalDebtHours}h
          </div>
          <div className="text-[11px] text-text-muted uppercase tracking-wider mt-1">
            Tech Debt
          </div>
        </div>
        <div className="bg-elevated rounded-lg p-3 border border-border-subtle">
          <div className="text-2xl font-mono font-medium text-hulde-green">
            {affectedFiles}
          </div>
          <div className="text-[11px] text-text-muted uppercase tracking-wider mt-1">
            Files
          </div>
        </div>
      </div>

      {/* Severity filter pills */}
      <div className="flex flex-wrap gap-1.5 mb-4">
        {(["all", ...severityOrder] as const).map((sev) => {
          const isActive = reviewFilter === sev;
          const color = sev === "all" ? "var(--color-hulde-green)" : severityColors[sev];
          const count =
            sev === "all"
              ? summary.totalFindings
              : summary.bySeverity[sev] ?? 0;

          return (
            <button
              key={sev}
              onClick={() => setReviewFilter(sev)}
              className="text-[10px] font-medium px-2.5 py-1 rounded-full transition-colors capitalize"
              style={
                isActive
                  ? {
                      backgroundColor: `${color}22`,
                      color: color,
                      border: `1px solid ${color}44`,
                    }
                  : {
                      backgroundColor: "var(--color-elevated)",
                      color: "var(--color-text-secondary)",
                      border: "1px solid var(--color-border-subtle)",
                    }
              }
            >
              {sev} ({count})
            </button>
          );
        })}
      </div>

      {/* Findings list */}
      <div className="mb-5">
        <h3 className="text-[11px] font-semibold text-hulde-green uppercase tracking-wider mb-2">
          Findings
        </h3>
        <div className="space-y-1.5">
          {filteredFindings.map((finding) => {
            const isSelected = selectedFindingId === finding.id;
            return (
              <div
                key={finding.id}
                className={`rounded-lg p-2.5 border transition-colors cursor-pointer ${
                  isSelected
                    ? "bg-elevated border-border-medium"
                    : "bg-elevated/50 border-border-subtle hover:bg-elevated"
                }`}
                onClick={() =>
                  selectFinding(isSelected ? null : finding.id)
                }
              >
                <div className="flex items-start gap-2">
                  {/* Severity dot */}
                  <span
                    className="inline-block w-2 h-2 rounded-full mt-1 shrink-0"
                    style={{ backgroundColor: severityColors[finding.severity] }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span
                        className="text-[9px] font-semibold uppercase tracking-wider"
                        style={{ color: severityColors[finding.severity] }}
                      >
                        {finding.category}
                      </span>
                      <span
                        className={`text-[9px] font-mono ${effortColors[finding.effort] ?? "text-text-muted"}`}
                      >
                        {finding.effort}
                      </span>
                    </div>
                    <div className="text-[12px] text-text-primary leading-snug">
                      {finding.title}
                    </div>
                    <div className="text-[10px] text-text-muted truncate mt-0.5">
                      {finding.filePath}
                    </div>

                    {isSelected && <FindingDetail finding={finding} />}
                  </div>
                </div>
              </div>
            );
          })}
          {filteredFindings.length === 0 && (
            <p className="text-[11px] text-text-muted py-2">
              No findings match the current filter.
            </p>
          )}
        </div>
      </div>

      {/* Executive Summary */}
      {executiveSummary && (
        <div className="mb-4">
          <button
            onClick={() => setExecSummaryOpen(!execSummaryOpen)}
            className="flex items-center gap-1.5 text-[11px] font-semibold text-hulde-green uppercase tracking-wider mb-2 hover:text-hulde-green-bright transition-colors"
          >
            <span
              className="inline-block transition-transform text-[9px]"
              style={{ transform: execSummaryOpen ? "rotate(90deg)" : "rotate(0deg)" }}
            >
              ▶
            </span>
            Executive Summary
          </button>
          {execSummaryOpen && (
            <div className="text-[12px] text-text-secondary leading-relaxed animate-fade-slide-in">
              {executiveSummary}
            </div>
          )}
        </div>
      )}

      {/* Recommendations */}
      {recommendations.length > 0 && (
        <div className="mb-4">
          <button
            onClick={() => setRecsOpen(!recsOpen)}
            className="flex items-center gap-1.5 text-[11px] font-semibold text-hulde-green uppercase tracking-wider mb-2 hover:text-hulde-green-bright transition-colors"
          >
            <span
              className="inline-block transition-transform text-[9px]"
              style={{ transform: recsOpen ? "rotate(90deg)" : "rotate(0deg)" }}
            >
              ▶
            </span>
            Recommendations ({recommendations.length})
          </button>
          {recsOpen && (
            <div className="space-y-2 animate-fade-slide-in">
              {recommendations.map((rec, i) => (
                <div
                  key={i}
                  className="bg-elevated rounded-lg p-2.5 border border-border-subtle"
                >
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="text-[10px] font-mono text-hulde-green">
                      #{rec.priority}
                    </span>
                    <span className="text-[12px] text-text-primary font-medium">
                      {rec.title}
                    </span>
                  </div>
                  <p className="text-[11px] text-text-secondary leading-relaxed">
                    {rec.description}
                  </p>
                  <div className="flex gap-3 mt-1.5">
                    <span className="text-[9px] text-text-muted">
                      Effort: {rec.estimatedEffort}
                    </span>
                    <span className="text-[9px] text-text-muted">
                      Impact: {rec.impact}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
