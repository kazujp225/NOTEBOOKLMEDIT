/**
 * Local state management for standalone frontend
 * Will be replaced with Supabase later
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface BBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Issue {
  id: string;
  pageNumber: number;
  bbox: BBox;
  ocrText: string;
  issueType: 'manual' | 'detected' | 'low_confidence' | 'garbled';
  status: 'detected' | 'corrected' | 'skipped';
  correctedText?: string;
  candidates?: Candidate[];
  confidence?: number;
}

export interface Candidate {
  text: string;
  confidence: number;
  reason?: string;
}

export interface PageData {
  pageNumber: number;
  imageDataUrl: string; // Base64 data URL
  width: number;
  height: number;
  thumbnailDataUrl: string;
}

export interface Project {
  id: string;
  name: string;
  fileName: string;
  totalPages: number;
  pages: PageData[];
  issues: Issue[];
  status: 'uploading' | 'processing' | 'ready' | 'completed';
  createdAt: string;
  updatedAt: string;
}

interface AppState {
  // Projects
  projects: Project[];
  currentProjectId: string | null;

  // Actions
  addProject: (project: Project) => void;
  updateProject: (id: string, updates: Partial<Project>) => void;
  deleteProject: (id: string) => void;
  setCurrentProject: (id: string | null) => void;
  getCurrentProject: () => Project | null;

  // Page actions
  addPageToProject: (projectId: string, page: PageData) => void;

  // Issue actions
  addIssue: (projectId: string, issue: Issue) => void;
  updateIssue: (projectId: string, issueId: string, updates: Partial<Issue>) => void;
  deleteIssue: (projectId: string, issueId: string) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      projects: [],
      currentProjectId: null,

      addProject: (project) =>
        set((state) => ({
          projects: [...state.projects, project],
        })),

      updateProject: (id, updates) =>
        set((state) => ({
          projects: state.projects.map((p) =>
            p.id === id ? { ...p, ...updates, updatedAt: new Date().toISOString() } : p
          ),
        })),

      deleteProject: (id) =>
        set((state) => ({
          projects: state.projects.filter((p) => p.id !== id),
          currentProjectId: state.currentProjectId === id ? null : state.currentProjectId,
        })),

      setCurrentProject: (id) => set({ currentProjectId: id }),

      getCurrentProject: () => {
        const state = get();
        return state.projects.find((p) => p.id === state.currentProjectId) || null;
      },

      addPageToProject: (projectId, page) =>
        set((state) => ({
          projects: state.projects.map((p) =>
            p.id === projectId
              ? { ...p, pages: [...p.pages, page], updatedAt: new Date().toISOString() }
              : p
          ),
        })),

      addIssue: (projectId, issue) =>
        set((state) => ({
          projects: state.projects.map((p) =>
            p.id === projectId
              ? { ...p, issues: [...p.issues, issue], updatedAt: new Date().toISOString() }
              : p
          ),
        })),

      updateIssue: (projectId, issueId, updates) =>
        set((state) => ({
          projects: state.projects.map((p) =>
            p.id === projectId
              ? {
                  ...p,
                  issues: p.issues.map((i) => (i.id === issueId ? { ...i, ...updates } : i)),
                  updatedAt: new Date().toISOString(),
                }
              : p
          ),
        })),

      deleteIssue: (projectId, issueId) =>
        set((state) => ({
          projects: state.projects.map((p) =>
            p.id === projectId
              ? {
                  ...p,
                  issues: p.issues.filter((i) => i.id !== issueId),
                  updatedAt: new Date().toISOString(),
                }
              : p
          ),
        })),
    }),
    {
      name: 'notebooklm-fixer-storage',
      partialize: (state) => ({
        projects: state.projects,
        currentProjectId: state.currentProjectId,
      }),
    }
  )
);

// Helper to generate unique IDs
export function generateId(): string {
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
}
