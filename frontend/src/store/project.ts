import { create } from 'zustand';
import type { Project, Page, Issue, Candidate } from '@/lib/api';

interface ProjectState {
  // Current project
  project: Project | null;
  pages: Page[];
  issues: Issue[];

  // Selection state
  currentPageNumber: number;
  currentIssueIndex: number;
  selectedIssue: Issue | null;

  // UI state
  isLoading: boolean;
  error: string | null;
  zoom: number;
  panOffset: { x: number; y: number };
  viewMode: 'select' | 'pan';

  // Correction state
  candidates: Candidate[];
  selectedCandidateIndex: number | null;
  isGeneratingCandidates: boolean;
  isApplyingCorrection: boolean;

  // Actions
  setProject: (project: Project | null) => void;
  setPages: (pages: Page[]) => void;
  setIssues: (issues: Issue[]) => void;
  setCurrentPageNumber: (pageNumber: number) => void;
  setCurrentIssueIndex: (index: number) => void;
  selectIssue: (issue: Issue | null) => void;
  selectNextIssue: () => void;
  selectPreviousIssue: () => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setZoom: (zoom: number) => void;
  setPanOffset: (offset: { x: number; y: number }) => void;
  setViewMode: (mode: 'select' | 'pan') => void;
  setCandidates: (candidates: Candidate[]) => void;
  setSelectedCandidateIndex: (index: number | null) => void;
  setIsGeneratingCandidates: (generating: boolean) => void;
  setIsApplyingCorrection: (applying: boolean) => void;
  updateIssueStatus: (issueId: string, status: string) => void;
  reset: () => void;
}

const initialState = {
  project: null,
  pages: [],
  issues: [],
  currentPageNumber: 1,
  currentIssueIndex: 0,
  selectedIssue: null,
  isLoading: false,
  error: null,
  zoom: 1,
  panOffset: { x: 0, y: 0 },
  viewMode: 'select' as const,
  candidates: [],
  selectedCandidateIndex: null,
  isGeneratingCandidates: false,
  isApplyingCorrection: false,
};

export const useProjectStore = create<ProjectState>((set, get) => ({
  ...initialState,

  setProject: (project) => set({ project }),

  setPages: (pages) => set({ pages }),

  setIssues: (issues) => set({ issues }),

  setCurrentPageNumber: (pageNumber) => {
    set({ currentPageNumber: pageNumber });
    // Reset pan when changing pages
    set({ panOffset: { x: 0, y: 0 } });
  },

  setCurrentIssueIndex: (index) => {
    const { issues } = get();
    if (index >= 0 && index < issues.length) {
      set({
        currentIssueIndex: index,
        selectedIssue: issues[index],
        candidates: issues[index].candidates || [],
        selectedCandidateIndex: null,
      });
    }
  },

  selectIssue: (issue) => {
    if (issue) {
      const { issues } = get();
      const index = issues.findIndex((i) => i.id === issue.id);
      set({
        selectedIssue: issue,
        currentIssueIndex: index >= 0 ? index : 0,
        currentPageNumber: issue.page_number,
        candidates: issue.candidates || [],
        selectedCandidateIndex: null,
      });
    } else {
      set({
        selectedIssue: null,
        candidates: [],
        selectedCandidateIndex: null,
      });
    }
  },

  selectNextIssue: () => {
    const { currentIssueIndex, issues } = get();
    if (currentIssueIndex < issues.length - 1) {
      const nextIndex = currentIssueIndex + 1;
      const nextIssue = issues[nextIndex];
      set({
        currentIssueIndex: nextIndex,
        selectedIssue: nextIssue,
        currentPageNumber: nextIssue.page_number,
        candidates: nextIssue.candidates || [],
        selectedCandidateIndex: null,
      });
    }
  },

  selectPreviousIssue: () => {
    const { currentIssueIndex, issues } = get();
    if (currentIssueIndex > 0) {
      const prevIndex = currentIssueIndex - 1;
      const prevIssue = issues[prevIndex];
      set({
        currentIssueIndex: prevIndex,
        selectedIssue: prevIssue,
        currentPageNumber: prevIssue.page_number,
        candidates: prevIssue.candidates || [],
        selectedCandidateIndex: null,
      });
    }
  },

  setLoading: (isLoading) => set({ isLoading }),

  setError: (error) => set({ error }),

  setZoom: (zoom) => set({ zoom: Math.max(0.25, Math.min(4, zoom)) }),

  setPanOffset: (panOffset) => set({ panOffset }),

  setViewMode: (viewMode) => set({ viewMode }),

  setCandidates: (candidates) => set({ candidates }),

  setSelectedCandidateIndex: (selectedCandidateIndex) =>
    set({ selectedCandidateIndex }),

  setIsGeneratingCandidates: (isGeneratingCandidates) =>
    set({ isGeneratingCandidates }),

  setIsApplyingCorrection: (isApplyingCorrection) =>
    set({ isApplyingCorrection }),

  updateIssueStatus: (issueId, status) => {
    const { issues, selectedIssue } = get();
    const updatedIssues = issues.map((issue) =>
      issue.id === issueId ? { ...issue, status } : issue
    );
    set({ issues: updatedIssues });

    if (selectedIssue?.id === issueId) {
      set({ selectedIssue: { ...selectedIssue, status } });
    }
  },

  reset: () => set(initialState),
}));
