import { useDashboardStore } from "../store";

export default function ReviewToggle() {
  const reviewMode = useDashboardStore((s) => s.reviewMode);
  const toggleReviewMode = useDashboardStore((s) => s.toggleReviewMode);
  const reviewReport = useDashboardStore((s) => s.reviewReport);

  const hasReview = reviewReport !== null;
  const findingCount = reviewReport?.summary.totalFindings ?? 0;

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={toggleReviewMode}
        disabled={!hasReview}
        className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
          reviewMode && hasReview
            ? "bg-[rgba(224,82,82,0.15)] text-[#e05252]"
            : hasReview
              ? "bg-elevated text-text-secondary hover:bg-surface"
              : "bg-elevated text-text-muted cursor-not-allowed"
        }`}
        title={
          hasReview
            ? reviewMode
              ? "Hide review overlay"
              : "Show review overlay"
            : "No review data loaded"
        }
      >
        Review {reviewMode && hasReview ? "ON" : "OFF"}
      </button>

      {reviewMode && hasReview && (
        <span className="text-[11px] text-text-secondary">
          {findingCount}
          <span className="text-text-muted ml-0.5">findings</span>
        </span>
      )}
    </div>
  );
}
