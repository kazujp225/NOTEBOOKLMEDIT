/**
 * Local state management for standalone frontend
 * Images are stored in IndexedDB, metadata in localStorage
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { saveImage, getImage, deleteImage, deleteProjectImages } from './image-store';
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

// Metadata for a single embedded image extracted from a PDF page
export interface ExtractedImageMeta {
  id: string;          // stable UUID, used as part of the IndexedDB key
  imageKey: string;    // IndexedDB key under which the image blob is stored
  width: number;
  height: number;
  sourceName?: string; // PDF XObject name (for debugging)
}

// Runtime form: image data + (optional) persisted meta.
// id/imageKey are absent at upload time and populated after addProject saves to IndexedDB.
export interface ExtractedImageData {
  id?: string;
  imageKey?: string;
  width: number;
  height: number;
  sourceName?: string;
  dataUrl: string;
}

// Page metadata (without image data)
export interface PageMeta {
  pageNumber: number;
  width: number;
  height: number;
  // Image keys for IndexedDB lookup
  imageKey: string;
  thumbnailKey: string;
  // Embedded images extracted from the source PDF page
  extractedImages?: ExtractedImageMeta[];
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
  extractedImages?: ExtractedImageData[];
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

  // Page actions
  deletePage: (projectId: string, pageNumber: number) => Promise<void>;
  movePage: (projectId: string, fromPageNumber: number, toPageNumber: number) => Promise<void>;
  importPagesFromProject: (
    targetProjectId: string,
    sourceProjectId: string,
    sourcePageNumbers: number[]
  ) => Promise<void>;

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

          // Persist embedded extracted images, if any, under stable UUID keys
          let extractedMetas: ExtractedImageMeta[] | undefined;
          if (page.extractedImages && page.extractedImages.length > 0) {
            extractedMetas = [];
            for (const ex of page.extractedImages) {
              const id = generateId();
              const exKey = `${projectMeta.id}/extracted/${id}`;
              try {
                await saveImage(exKey, ex.dataUrl);
                extractedMetas.push({
                  id,
                  imageKey: exKey,
                  width: ex.width,
                  height: ex.height,
                  sourceName: ex.sourceName,
                });
              } catch (err) {
                console.warn('[addProject] failed to save extracted image', err);
              }
            }
            if (extractedMetas.length === 0) extractedMetas = undefined;
          }

          pageMetas.push({
            pageNumber: page.pageNumber,
            width: page.width,
            height: page.height,
            imageKey,
            thumbnailKey,
            extractedImages: extractedMetas,
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
        if (!project) {
          console.warn('[loadProjectWithImages] project not found in store:', id);
          return null;
        }

        const missingKeys: string[] = [];

        // Load all pages in parallel, with cloud fallback
        const pagesWithImages = await Promise.all(
          project.pages.map(async (pageMeta): Promise<PageData | null> => {
            let [imageDataUrl, thumbnailDataUrl] = await Promise.all([
              getImage(pageMeta.imageKey),
              getImage(pageMeta.thumbnailKey),
            ]);

            if (!imageDataUrl) missingKeys.push(pageMeta.imageKey);
            if (!thumbnailDataUrl) missingKeys.push(pageMeta.thumbnailKey);

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
              // Load any extracted images attached to this page
              let extractedImages: ExtractedImageData[] | undefined;
              if (pageMeta.extractedImages && pageMeta.extractedImages.length > 0) {
                const loaded = await Promise.all(
                  pageMeta.extractedImages.map(async (m): Promise<ExtractedImageData | null> => {
                    const dataUrl = await getImage(m.imageKey);
                    if (!dataUrl) return null;
                    return {
                      id: m.id,
                      imageKey: m.imageKey,
                      width: m.width,
                      height: m.height,
                      sourceName: m.sourceName,
                      dataUrl,
                    };
                  })
                );
                extractedImages = loaded.filter((x): x is ExtractedImageData => x !== null);
                if (extractedImages.length === 0) extractedImages = undefined;
              }

              return {
                pageNumber: pageMeta.pageNumber,
                width: pageMeta.width,
                height: pageMeta.height,
                imageDataUrl,
                thumbnailDataUrl,
                extractedImages,
              };
            }
            return null;
          })
        );

        const loadedPages = pagesWithImages.filter((p): p is PageData => p !== null);
        if (loadedPages.length !== project.pages.length) {
          console.warn(
            `[loadProjectWithImages] project ${id} (${project.name}): metadata has ${project.pages.length} pages but only ${loadedPages.length} loaded from IndexedDB. Missing keys:`,
            missingKeys
          );
        }

        return {
          ...project,
          textOverlays: project.textOverlays || [],
          pages: loadedPages,
        };
      },

      deletePage: async (projectId, pageNumber) => {
        const project = get().getProject(projectId);
        if (!project) return;
        if (project.pages.length <= 1) {
          console.warn('[deletePage] cannot delete the last remaining page');
          return;
        }

        // 1. Delete the target page's images from IndexedDB
        await deleteImage(`${projectId}/page-${pageNumber}`);
        await deleteImage(`${projectId}/thumb-${pageNumber}`);

        // 1b. Delete any extracted images attached to the deleted page
        const targetPage = project.pages.find((p) => p.pageNumber === pageNumber);
        if (targetPage?.extractedImages) {
          for (const ex of targetPage.extractedImages) {
            await deleteImage(ex.imageKey).catch(() => {});
          }
        }

        // 2. Renumber subsequent pages: rename their IndexedDB keys (page N → page N-1)
        const subsequent = project.pages
          .filter((p) => p.pageNumber > pageNumber)
          .sort((a, b) => a.pageNumber - b.pageNumber);

        for (const p of subsequent) {
          const oldImageKey = `${projectId}/page-${p.pageNumber}`;
          const newImageKey = `${projectId}/page-${p.pageNumber - 1}`;
          const oldThumbKey = `${projectId}/thumb-${p.pageNumber}`;
          const newThumbKey = `${projectId}/thumb-${p.pageNumber - 1}`;

          const imageData = await getImage(oldImageKey);
          if (imageData) {
            await saveImage(newImageKey, imageData);
            await deleteImage(oldImageKey);
          }
          const thumbData = await getImage(oldThumbKey);
          if (thumbData) {
            await saveImage(newThumbKey, thumbData);
            await deleteImage(oldThumbKey);
          }
        }

        // 3. Update the project state — remove deleted page, renumber rest, drop/renumber issues & overlays
        set((state) => ({
          projects: state.projects.map((p) => {
            if (p.id !== projectId) return p;

            const newPages: PageMeta[] = p.pages
              .filter((pg) => pg.pageNumber !== pageNumber)
              .map((pg) => {
                if (pg.pageNumber > pageNumber) {
                  const newNum = pg.pageNumber - 1;
                  return {
                    ...pg,
                    pageNumber: newNum,
                    imageKey: `${projectId}/page-${newNum}`,
                    thumbnailKey: `${projectId}/thumb-${newNum}`,
                  };
                }
                return pg;
              });

            const newIssues: Issue[] = p.issues
              .filter((i) => i.pageNumber !== pageNumber)
              .map((i) => (i.pageNumber > pageNumber ? { ...i, pageNumber: i.pageNumber - 1 } : i));

            const newOverlays: TextOverlay[] = (p.textOverlays || [])
              .filter((o) => o.pageNumber !== pageNumber)
              .map((o) => (o.pageNumber > pageNumber ? { ...o, pageNumber: o.pageNumber - 1 } : o));

            return {
              ...p,
              pages: newPages,
              issues: newIssues,
              textOverlays: newOverlays,
              totalPages: newPages.length,
              updatedAt: new Date().toISOString(),
            };
          }),
        }));

        // Background metadata sync (best-effort; cloud-side issues/overlays cleanup is not fully handled)
        debouncedSyncMetadata(projectId, {});
      },

      movePage: async (projectId, fromPageNumber, toPageNumber) => {
        const project = get().getProject(projectId);
        if (!project) return;
        if (fromPageNumber === toPageNumber) return;

        const sortedPages = [...project.pages].sort((a, b) => a.pageNumber - b.pageNumber);
        const fromIdx = sortedPages.findIndex((p) => p.pageNumber === fromPageNumber);
        if (fromIdx === -1) return;

        // Compute target index. toPageNumber is the desired post-move position (1-indexed).
        const desiredIdx = Math.max(0, Math.min(sortedPages.length - 1, toPageNumber - 1));

        // Reorder
        const [moved] = sortedPages.splice(fromIdx, 1);
        sortedPages.splice(desiredIdx, 0, moved);

        // Build old→new pageNumber map
        const renames: { oldNum: number; newNum: number }[] = [];
        sortedPages.forEach((p, i) => {
          const newNum = i + 1;
          if (p.pageNumber !== newNum) {
            renames.push({ oldNum: p.pageNumber, newNum });
          }
        });

        // Two-pass IndexedDB rename via temporary keys to avoid collisions:
        // 1) old key → tmp key
        // 2) tmp key → new key
        // (Including extracted images is unnecessary because their keys are stable UUIDs.)
        for (const r of renames) {
          const oldImage = `${projectId}/page-${r.oldNum}`;
          const tmpImage = `${projectId}/__tmp__-page-${r.oldNum}`;
          const oldThumb = `${projectId}/thumb-${r.oldNum}`;
          const tmpThumb = `${projectId}/__tmp__-thumb-${r.oldNum}`;

          const imgData = await getImage(oldImage);
          if (imgData) {
            await saveImage(tmpImage, imgData);
            await deleteImage(oldImage);
          }
          const thumbData = await getImage(oldThumb);
          if (thumbData) {
            await saveImage(tmpThumb, thumbData);
            await deleteImage(oldThumb);
          }
        }
        for (const r of renames) {
          const tmpImage = `${projectId}/__tmp__-page-${r.oldNum}`;
          const newImage = `${projectId}/page-${r.newNum}`;
          const tmpThumb = `${projectId}/__tmp__-thumb-${r.oldNum}`;
          const newThumb = `${projectId}/thumb-${r.newNum}`;

          const imgData = await getImage(tmpImage);
          if (imgData) {
            await saveImage(newImage, imgData);
            await deleteImage(tmpImage);
          }
          const thumbData = await getImage(tmpThumb);
          if (thumbData) {
            await saveImage(newThumb, thumbData);
            await deleteImage(tmpThumb);
          }
        }

        // Build a quick lookup
        const oldToNew = new Map<number, number>();
        sortedPages.forEach((p, i) => oldToNew.set(p.pageNumber, i + 1));

        set((state) => ({
          projects: state.projects.map((p) => {
            if (p.id !== projectId) return p;

            const newPages: PageMeta[] = sortedPages.map((pm, i) => {
              const newNum = i + 1;
              return {
                ...pm,
                pageNumber: newNum,
                imageKey: `${projectId}/page-${newNum}`,
                thumbnailKey: `${projectId}/thumb-${newNum}`,
              };
            });

            const newIssues: Issue[] = p.issues.map((iss) => {
              const newNum = oldToNew.get(iss.pageNumber);
              return newNum !== undefined && newNum !== iss.pageNumber
                ? { ...iss, pageNumber: newNum }
                : iss;
            });

            const newOverlays: TextOverlay[] = (p.textOverlays || []).map((o) => {
              const newNum = oldToNew.get(o.pageNumber);
              return newNum !== undefined && newNum !== o.pageNumber
                ? { ...o, pageNumber: newNum }
                : o;
            });

            return {
              ...p,
              pages: newPages,
              issues: newIssues,
              textOverlays: newOverlays,
              updatedAt: new Date().toISOString(),
            };
          }),
        }));

        debouncedSyncMetadata(projectId, {});
      },

      importPagesFromProject: async (targetProjectId, sourceProjectId, sourcePageNumbers) => {
        const target = get().getProject(targetProjectId);
        const source = get().getProject(sourceProjectId);
        if (!target || !source) return;
        if (sourcePageNumbers.length === 0) return;

        const sourcePages = source.pages
          .filter((p) => sourcePageNumbers.includes(p.pageNumber))
          .sort((a, b) => {
            // Preserve order according to user selection
            return sourcePageNumbers.indexOf(a.pageNumber) - sourcePageNumbers.indexOf(b.pageNumber);
          });

        const startNum = target.pages.length + 1;
        const newPageMetas: PageMeta[] = [];

        for (let i = 0; i < sourcePages.length; i++) {
          const src = sourcePages[i];
          const newNum = startNum + i;
          const newImageKey = `${targetProjectId}/page-${newNum}`;
          const newThumbKey = `${targetProjectId}/thumb-${newNum}`;

          // Copy page image
          const srcImage = await getImage(src.imageKey);
          if (!srcImage) {
            console.warn('[importPagesFromProject] missing source image for page', src.pageNumber);
            continue;
          }
          await saveImage(newImageKey, srcImage);

          // Copy thumbnail
          const srcThumb = await getImage(src.thumbnailKey);
          if (srcThumb) {
            await saveImage(newThumbKey, srcThumb);
          }

          // Copy extracted images with FRESH UUIDs (so source and target stay independent)
          let newExtracted: ExtractedImageMeta[] | undefined;
          if (src.extractedImages && src.extractedImages.length > 0) {
            newExtracted = [];
            for (const ex of src.extractedImages) {
              const exData = await getImage(ex.imageKey);
              if (!exData) continue;
              const newId = generateId();
              const newExKey = `${targetProjectId}/extracted/${newId}`;
              await saveImage(newExKey, exData);
              newExtracted.push({
                id: newId,
                imageKey: newExKey,
                width: ex.width,
                height: ex.height,
                sourceName: ex.sourceName,
              });
            }
            if (newExtracted.length === 0) newExtracted = undefined;
          }

          newPageMetas.push({
            pageNumber: newNum,
            width: src.width,
            height: src.height,
            imageKey: newImageKey,
            thumbnailKey: newThumbKey,
            extractedImages: newExtracted,
          });
        }

        if (newPageMetas.length === 0) return;

        set((state) => ({
          projects: state.projects.map((p) => {
            if (p.id !== targetProjectId) return p;
            const merged = [...p.pages, ...newPageMetas];
            return {
              ...p,
              pages: merged,
              totalPages: merged.length,
              updatedAt: new Date().toISOString(),
            };
          }),
        }));

        debouncedSyncMetadata(targetProjectId, {});
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
  return crypto.randomUUID();
}
