/**
 * Local state management for standalone frontend
 * Images are stored in IndexedDB, metadata in localStorage
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { saveImage, getImage, deleteProjectImages } from './image-store';
import {
  syncProjectToCloud,
  fetchCloudProjects,
  fetchCloudProjectFull,
  downloadImageFromCloud,
  deleteCloudProject,
  syncIssue,
  syncTextOverlay,
  debouncedSyncMetadata,
} from './sync';
import { getCurrentUserId } from './supabase';

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

export interface TextOverlay {
  id: string;
  pageNumber: number;
  bbox: BBox;
  text: string;
  fontSize: number;
  fontFamily: string;
  fontWeight: 'normal' | 'bold';
  fontStyle: 'normal' | 'italic';
  textDecoration: 'none' | 'underline';
  textAlign: 'left' | 'center' | 'right';
  color: string;
  backgroundColor: string;
}

// Page metadata (without image data)
export interface PageMeta {
  pageNumber: number;
  width: number;
  height: number;
  // Image keys for IndexedDB lookup
  imageKey: string;
  thumbnailKey: string;
  // Cloud storage paths
  cloudImagePath?: string;
  cloudThumbnailPath?: string;
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
  textOverlays: TextOverlay[];
  status: 'uploading' | 'processing' | 'ready' | 'completed';
  createdAt: string;
  updatedAt: string;
  // Cloud sync fields
  userId?: string;
  syncStatus?: 'synced' | 'pending' | 'error';
  lastSyncedAt?: string;
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

  // TextOverlay actions
  addTextOverlay: (projectId: string, overlay: TextOverlay) => void;
  updateTextOverlay: (projectId: string, overlayId: string, updates: Partial<TextOverlay>) => void;
  deleteTextOverlay: (projectId: string, overlayId: string) => void;

  // Cloud sync actions
  fetchAndMergeCloudProjects: () => Promise<void>;
  syncAllProjects: () => Promise<void>;
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      projects: [],
      currentProjectId: null,

      addProject: async (projectWithImages) => {
        const { pages, ...projectMeta } = projectWithImages;

        // Get current user ID immediately
        const currentUserId = await getCurrentUserId();

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
          textOverlays: projectMeta.textOverlays || [],
          syncStatus: 'pending',
          userId: currentUserId || undefined,
        };

        set((state) => ({
          projects: [...state.projects, project],
        }));

        // Background cloud sync
        getCurrentUserId().then((userId) => {
          if (!userId) return;
          const projectToSync = { ...project, userId };
          syncProjectToCloud(projectToSync, userId)
            .then(() => {
              set((state) => ({
                projects: state.projects.map((p) =>
                  p.id === project.id
                    ? { ...p, syncStatus: 'synced' as const, lastSyncedAt: new Date().toISOString(), userId }
                    : p
                ),
              }));
            })
            .catch((err) => {
              console.warn('[sync] project upload failed:', err);
              set((state) => ({
                projects: state.projects.map((p) =>
                  p.id === project.id ? { ...p, syncStatus: 'error' as const } : p
                ),
              }));
            });
        });
      },

      updateProject: (id, updates) => {
        set((state) => ({
          projects: state.projects.map((p) =>
            p.id === id ? { ...p, ...updates, updatedAt: new Date().toISOString() } : p
          ),
        }));
        // Debounced background sync
        debouncedSyncMetadata(id, updates);
      },

      deleteProject: async (id) => {
        // Delete images from IndexedDB
        await deleteProjectImages(id);

        set((state) => ({
          projects: state.projects.filter((p) => p.id !== id),
          currentProjectId: state.currentProjectId === id ? null : state.currentProjectId,
        }));

        // Background cloud delete
        getCurrentUserId().then((userId) => {
          if (!userId) return;
          deleteCloudProject(id, userId).catch((err) =>
            console.warn('[sync] cloud delete failed:', err)
          );
        });
      },

      setCurrentProject: (id) => set({ currentProjectId: id }),

      getProject: (id) => {
        const state = get();
        return state.projects.find((p) => p.id === id) || null;
      },

      loadProjectWithImages: async (id) => {
        const project = get().getProject(id);
        if (!project) return null;

        // Load all pages in parallel, with cloud fallback
        const pagesWithImages = await Promise.all(
          project.pages.map(async (pageMeta): Promise<PageData | null> => {
            let [imageDataUrl, thumbnailDataUrl] = await Promise.all([
              getImage(pageMeta.imageKey),
              getImage(pageMeta.thumbnailKey),
            ]);

            // Cloud fallback: download from Supabase if not in IndexedDB
            if (!imageDataUrl && pageMeta.cloudImagePath) {
              imageDataUrl = await downloadImageFromCloud(pageMeta.cloudImagePath);
              if (imageDataUrl) {
                await saveImage(pageMeta.imageKey, imageDataUrl); // Cache locally
              }
            }
            if (!thumbnailDataUrl && pageMeta.cloudThumbnailPath) {
              thumbnailDataUrl = await downloadImageFromCloud(pageMeta.cloudThumbnailPath);
              if (thumbnailDataUrl) {
                await saveImage(pageMeta.thumbnailKey, thumbnailDataUrl); // Cache locally
              }
            }

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
          textOverlays: project.textOverlays || [],
          pages: pagesWithImages.filter((p): p is PageData => p !== null),
        };
      },

      addIssue: (projectId, issue) => {
        set((state) => ({
          projects: state.projects.map((p) =>
            p.id === projectId
              ? { ...p, issues: [...p.issues, issue], updatedAt: new Date().toISOString() }
              : p
          ),
        }));
        syncIssue(projectId, issue, 'upsert').catch((err) =>
          console.warn('[sync] issue sync failed:', err)
        );
      },

      updateIssue: (projectId, issueId, updates) => {
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
        }));
        // Find the full updated issue for sync
        const project = get().getProject(projectId);
        const updatedIssue = project?.issues.find((i) => i.id === issueId);
        if (updatedIssue) {
          syncIssue(projectId, updatedIssue, 'upsert').catch((err) =>
            console.warn('[sync] issue sync failed:', err)
          );
        }
      },

      deleteIssue: (projectId, issueId) => {
        const project = get().getProject(projectId);
        const issue = project?.issues.find((i) => i.id === issueId);
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
        }));
        if (issue) {
          syncIssue(projectId, issue, 'delete').catch((err) =>
            console.warn('[sync] issue delete sync failed:', err)
          );
        }
      },

      addTextOverlay: (projectId, overlay) => {
        set((state) => ({
          projects: state.projects.map((p) =>
            p.id === projectId
              ? { ...p, textOverlays: [...(p.textOverlays || []), overlay], updatedAt: new Date().toISOString() }
              : p
          ),
        }));
        syncTextOverlay(projectId, overlay, 'upsert').catch((err) =>
          console.warn('[sync] overlay sync failed:', err)
        );
      },

      updateTextOverlay: (projectId, overlayId, updates) => {
        set((state) => ({
          projects: state.projects.map((p) =>
            p.id === projectId
              ? {
                  ...p,
                  textOverlays: (p.textOverlays || []).map((o) => (o.id === overlayId ? { ...o, ...updates } : o)),
                  updatedAt: new Date().toISOString(),
                }
              : p
          ),
        }));
        const project = get().getProject(projectId);
        const updatedOverlay = (project?.textOverlays || []).find((o) => o.id === overlayId);
        if (updatedOverlay) {
          syncTextOverlay(projectId, updatedOverlay, 'upsert').catch((err) =>
            console.warn('[sync] overlay sync failed:', err)
          );
        }
      },

      deleteTextOverlay: (projectId, overlayId) => {
        const project = get().getProject(projectId);
        const overlay = (project?.textOverlays || []).find((o) => o.id === overlayId);
        set((state) => ({
          projects: state.projects.map((p) =>
            p.id === projectId
              ? {
                  ...p,
                  textOverlays: (p.textOverlays || []).filter((o) => o.id !== overlayId),
                  updatedAt: new Date().toISOString(),
                }
              : p
          ),
        }));
        if (overlay) {
          syncTextOverlay(projectId, overlay, 'delete').catch((err) =>
            console.warn('[sync] overlay delete sync failed:', err)
          );
        }
      },

      // Cloud sync: fetch cloud projects and merge into local state
      fetchAndMergeCloudProjects: async () => {
        const userId = await getCurrentUserId();
        if (!userId) return;

        const cloudProjects = await fetchCloudProjects(userId);
        const localProjects = get().projects;
        const localIds = new Set(localProjects.map((p) => p.id));

        // Find cloud-only projects (not in local)
        const cloudOnlyIds = cloudProjects.filter((cp) => !localIds.has(cp.id));

        if (cloudOnlyIds.length === 0) return;

        // Fetch full data for cloud-only projects
        const newProjects: Project[] = [];
        for (const cp of cloudOnlyIds) {
          const full = await fetchCloudProjectFull(cp.id);
          if (full) {
            newProjects.push({
              ...full,
              syncStatus: 'synced',
              lastSyncedAt: new Date().toISOString(),
            });
          }
        }

        if (newProjects.length > 0) {
          set((state) => ({
            projects: [...state.projects, ...newProjects],
          }));
        }
      },

      // Cloud sync: upload all local-only projects to cloud
      syncAllProjects: async () => {
        const userId = await getCurrentUserId();
        if (!userId) return;

        const projects = get().projects;
        const unsyncedProjects = projects.filter(
          (p) => !p.syncStatus || p.syncStatus === 'pending' || p.syncStatus === 'error'
        );

        for (const project of unsyncedProjects) {
          try {
            await syncProjectToCloud(project, userId);
            set((state) => ({
              projects: state.projects.map((p) =>
                p.id === project.id
                  ? { ...p, syncStatus: 'synced' as const, lastSyncedAt: new Date().toISOString(), userId }
                  : p
              ),
            }));
          } catch (err) {
            console.warn(`[sync] failed to sync project ${project.id}:`, err);
            set((state) => ({
              projects: state.projects.map((p) =>
                p.id === project.id ? { ...p, syncStatus: 'error' as const } : p
              ),
            }));
          }
        }
      },
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
