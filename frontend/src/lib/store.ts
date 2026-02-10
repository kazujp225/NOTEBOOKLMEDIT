/**
 * Local state management for standalone frontend
 * Images are stored in IndexedDB, metadata in localStorage
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { saveImage, getImage, deleteProjectImages } from './image-store';

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
  editMode?: 'text' | 'object';
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

// Page metadata (without image data)
export interface PageMeta {
  pageNumber: number;
  width: number;
  height: number;
  // Image keys for IndexedDB lookup
  imageKey: string;
  thumbnailKey: string;
}

// Full page data with images (for runtime use)
export interface PageData {
  pageNumber: number;
  imageDataUrl: string;
  width: number;
  height: number;
  thumbnailDataUrl: string;
}

export interface Project {
  id: string;
  name: string;
  fileName: string;
  totalPages: number;
  pages: PageMeta[]; // Changed from PageData to PageMeta
  issues: Issue[];
  status: 'uploading' | 'processing' | 'ready' | 'completed';
  createdAt: string;
  updatedAt: string;
}

// Runtime project with loaded images
export interface ProjectWithImages extends Omit<Project, 'pages'> {
  pages: PageData[];
}

interface AppState {
  // Projects (metadata only)
  projects: Project[];
  currentProjectId: string | null;

  // Actions
  addProject: (project: ProjectWithImages) => Promise<void>;
  updateProject: (id: string, updates: Partial<Project>) => void;
  deleteProject: (id: string) => Promise<void>;
  setCurrentProject: (id: string | null) => void;
  getProject: (id: string) => Project | null;
  loadProjectWithImages: (id: string) => Promise<ProjectWithImages | null>;

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

      addProject: async (projectWithImages) => {
        const { pages, ...projectMeta } = projectWithImages;

        // Save images to IndexedDB
        const pageMetas: PageMeta[] = [];
        for (const page of pages) {
          const imageKey = `${projectMeta.id}/page-${page.pageNumber}`;
          const thumbnailKey = `${projectMeta.id}/thumb-${page.pageNumber}`;

          await saveImage(imageKey, page.imageDataUrl);
          await saveImage(thumbnailKey, page.thumbnailDataUrl);

          pageMetas.push({
            pageNumber: page.pageNumber,
            width: page.width,
            height: page.height,
            imageKey,
            thumbnailKey,
          });
        }

        // Save metadata to zustand (localStorage)
        const project: Project = {
          ...projectMeta,
          pages: pageMetas,
        };

        set((state) => ({
          projects: [...state.projects, project],
        }));
      },

      updateProject: (id, updates) =>
        set((state) => ({
          projects: state.projects.map((p) =>
            p.id === id ? { ...p, ...updates, updatedAt: new Date().toISOString() } : p
          ),
        })),

      deleteProject: async (id) => {
        // Delete images from IndexedDB
        await deleteProjectImages(id);

        set((state) => ({
          projects: state.projects.filter((p) => p.id !== id),
          currentProjectId: state.currentProjectId === id ? null : state.currentProjectId,
        }));
      },

      setCurrentProject: (id) => set({ currentProjectId: id }),

      getProject: (id) => {
        const state = get();
        return state.projects.find((p) => p.id === id) || null;
      },

      loadProjectWithImages: async (id) => {
        const project = get().getProject(id);
        if (!project) return null;

        // Load all pages in parallel using stable base64 data URLs
        const pagesWithImages = await Promise.all(
          project.pages.map(async (pageMeta): Promise<PageData | null> => {
            const [imageDataUrl, thumbnailDataUrl] = await Promise.all([
              getImage(pageMeta.imageKey),
              getImage(pageMeta.thumbnailKey),
            ]);

            if (imageDataUrl && thumbnailDataUrl) {
              return {
                pageNumber: pageMeta.pageNumber,
                width: pageMeta.width,
                height: pageMeta.height,
                imageDataUrl,
                thumbnailDataUrl,
              };
            }
            return null;
          })
        );

        return {
          ...project,
          pages: pagesWithImages.filter((p): p is PageData => p !== null),
        };
      },

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
