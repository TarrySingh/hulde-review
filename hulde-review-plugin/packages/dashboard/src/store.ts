import { create } from "zustand";
import { SearchEngine } from "@hulde-review/core/search";
import type { SearchResult } from "@hulde-review/core/search";
import type {
  KnowledgeGraph,
  TourStep,
} from "@hulde-review/core/types";

export type Persona = "non-technical" | "junior" | "experienced";

// Review types (mirrors @hulde-review/core review types)
export type Severity = "critical" | "high" | "medium" | "low" | "info";
export type FindingCategory = "quality" | "security" | "performance" | "maintainability" | "reliability" | "modernization" | "architecture" | "compliance";

export interface ReviewFinding {
  id: string;
  category: FindingCategory;
  severity: Severity;
  title: string;
  description: string;
  filePath: string;
  lineRange?: [number, number];
  nodeId?: string;
  suggestion?: string;
  effort: string;
  tags: string[];
  cweId?: string;
}

export interface ReviewSummary {
  totalFindings: number;
  bySeverity: Record<Severity, number>;
  byCategory: Record<FindingCategory, number>;
  riskScore: number;
  technicalDebtHours: number;
  topRisks: string[];
}

export interface CodeReviewReport {
  version: string;
  project: { name: string; analyzedAt: string; totalFiles: number; totalLines: number; languages: string[] };
  summary: ReviewSummary;
  findings: ReviewFinding[];
  executiveSummary: string;
  recommendations: Array<{ priority: number; title: string; description: string; estimatedEffort: string; impact: string }>;
}

interface DashboardStore {
  graph: KnowledgeGraph | null;
  selectedNodeId: string | null;
  searchQuery: string;
  searchResults: SearchResult[];
  searchEngine: SearchEngine | null;
  searchMode: "fuzzy" | "semantic";
  setSearchMode: (mode: "fuzzy" | "semantic") => void;

  showLayers: boolean;

  codeViewerOpen: boolean;
  codeViewerNodeId: string | null;

  tourActive: boolean;
  currentTourStep: number;
  tourHighlightedNodeIds: string[];

  persona: Persona;

  diffMode: boolean;
  changedNodeIds: Set<string>;
  affectedNodeIds: Set<string>;

  reviewReport: CodeReviewReport | null;
  reviewMode: boolean;
  reviewFilter: Severity | "all";
  selectedFindingId: string | null;

  setGraph: (graph: KnowledgeGraph) => void;
  selectNode: (nodeId: string | null) => void;
  setSearchQuery: (query: string) => void;
  toggleLayers: () => void;
  setPersona: (persona: Persona) => void;
  openCodeViewer: (nodeId: string) => void;
  closeCodeViewer: () => void;

  setDiffOverlay: (changed: string[], affected: string[]) => void;
  toggleDiffMode: () => void;
  clearDiffOverlay: () => void;

  setReviewReport: (report: CodeReviewReport) => void;
  toggleReviewMode: () => void;
  setReviewFilter: (filter: Severity | "all") => void;
  selectFinding: (findingId: string | null) => void;
  clearReview: () => void;

  startTour: () => void;
  stopTour: () => void;
  setTourStep: (step: number) => void;
  nextTourStep: () => void;
  prevTourStep: () => void;
}

function getSortedTour(graph: KnowledgeGraph): TourStep[] {
  const tour = graph.tour ?? [];
  return [...tour].sort((a, b) => a.order - b.order);
}

export const useDashboardStore = create<DashboardStore>()((set, get) => ({
  graph: null,
  selectedNodeId: null,
  searchQuery: "",
  searchResults: [],
  searchEngine: null,
  searchMode: "fuzzy",

  showLayers: false,

  codeViewerOpen: false,
  codeViewerNodeId: null,

  tourActive: false,
  currentTourStep: 0,
  tourHighlightedNodeIds: [],

  persona: "junior",

  diffMode: false,
  changedNodeIds: new Set<string>(),
  affectedNodeIds: new Set<string>(),

  reviewReport: null,
  reviewMode: false,
  reviewFilter: "all",
  selectedFindingId: null,

  setGraph: (graph) => {
    const searchEngine = new SearchEngine(graph.nodes);
    const query = get().searchQuery;
    const searchResults = query.trim() ? searchEngine.search(query) : [];
    set({ graph, searchEngine, searchResults });
  },
  selectNode: (nodeId) => set({ selectedNodeId: nodeId }),
  setSearchMode: (mode) => set({ searchMode: mode }),
  setSearchQuery: (query) => {
    const engine = get().searchEngine;
    const mode = get().searchMode;
    if (!engine || !query.trim()) {
      set({ searchQuery: query, searchResults: [] });
      return;
    }
    // Currently both modes use the same fuzzy engine
    // When embeddings are available, "semantic" mode will use SemanticSearchEngine
    void mode;
    const searchResults = engine.search(query);
    set({ searchQuery: query, searchResults });
  },

  toggleLayers: () => set((state) => ({ showLayers: !state.showLayers })),

  setPersona: (persona) => set({ persona }),

  openCodeViewer: (nodeId) => set({ codeViewerOpen: true, codeViewerNodeId: nodeId }),
  closeCodeViewer: () => set({ codeViewerOpen: false, codeViewerNodeId: null }),

  setDiffOverlay: (changed, affected) =>
    set({
      diffMode: true,
      changedNodeIds: new Set(changed),
      affectedNodeIds: new Set(affected),
    }),

  toggleDiffMode: () => set((state) => ({ diffMode: !state.diffMode })),

  clearDiffOverlay: () =>
    set({
      diffMode: false,
      changedNodeIds: new Set<string>(),
      affectedNodeIds: new Set<string>(),
    }),

  setReviewReport: (report) =>
    set({ reviewReport: report, reviewMode: true }),

  toggleReviewMode: () =>
    set((state) => ({ reviewMode: !state.reviewMode })),

  setReviewFilter: (filter) =>
    set({ reviewFilter: filter }),

  selectFinding: (findingId) =>
    set({ selectedFindingId: findingId }),

  clearReview: () =>
    set({
      reviewReport: null,
      reviewMode: false,
      reviewFilter: "all",
      selectedFindingId: null,
    }),

  startTour: () => {
    const { graph } = get();
    if (!graph || !graph.tour || graph.tour.length === 0) return;
    const sorted = getSortedTour(graph);
    set({
      tourActive: true,
      currentTourStep: 0,
      tourHighlightedNodeIds: sorted[0].nodeIds,
      selectedNodeId: null,
    });
  },

  stopTour: () =>
    set({
      tourActive: false,
      currentTourStep: 0,
      tourHighlightedNodeIds: [],
    }),

  setTourStep: (step) => {
    const { graph } = get();
    if (!graph || !graph.tour || graph.tour.length === 0) return;
    const sorted = getSortedTour(graph);
    if (step < 0 || step >= sorted.length) return;
    set({
      currentTourStep: step,
      tourHighlightedNodeIds: sorted[step].nodeIds,
    });
  },

  nextTourStep: () => {
    const { graph, currentTourStep } = get();
    if (!graph || !graph.tour || graph.tour.length === 0) return;
    const sorted = getSortedTour(graph);
    if (currentTourStep < sorted.length - 1) {
      const next = currentTourStep + 1;
      set({
        currentTourStep: next,
        tourHighlightedNodeIds: sorted[next].nodeIds,
      });
    }
  },

  prevTourStep: () => {
    const { graph, currentTourStep } = get();
    if (!graph || !graph.tour || graph.tour.length === 0) return;
    if (currentTourStep > 0) {
      const sorted = getSortedTour(graph);
      const prev = currentTourStep - 1;
      set({
        currentTourStep: prev,
        tourHighlightedNodeIds: sorted[prev].nodeIds,
      });
    }
  },
}));
