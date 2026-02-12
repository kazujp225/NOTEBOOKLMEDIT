/**
 * Supabase sync module
 * Handles bidirectional sync between local storage and Supabase cloud.
 * Local (localStorage/IndexedDB) is primary; Supabase is backup/sync target.
 */

import { supabase } from './supabase';
import { getImage } from './image-store';
import { dataUrlToBlob, blobToDataUrl } from './image-store';
import type { Project, PageMeta, Issue, TextOverlay } from './store';

// ============================================
// Types
// ============================================

export interface CloudProject {
  id: string;
  user_id: string;
  name: string;
  file_name: string;
  total_pages: number;
  status: string;
  created_at: string;
  updated_at: string;
}

// ============================================
// Project sync
// ============================================

/**
 * Upload a full project (metadata + images) to Supabase
 */
export async function syncProjectToCloud(project: Project, userId: string): Promise<void> {
  // 1. Upsert project metadata
  const { error: projError } = await supabase.from('projects').upsert({
    id: project.id,
    user_id: userId,
    name: project.name,
    file_name: project.fileName,
    total_pages: project.totalPages,
    status: project.status,
    created_at: project.createdAt,
    updated_at: project.updatedAt,
  });
  if (projError) throw projError;

  // 2. Upload page images and upsert page metadata
  for (const page of project.pages) {
    const imagePath = await uploadPageImage(userId, project.id, page.pageNumber, page.imageKey, 'page');
    const thumbPath = await uploadPageImage(userId, project.id, page.pageNumber, page.thumbnailKey, 'thumb');

    await supabase.from('project_pages').upsert({
      project_id: project.id,
      page_number: page.pageNumber,
      width: page.width,
      height: page.height,
      image_path: imagePath,
      thumbnail_path: thumbPath,
    }, { onConflict: 'project_id,page_number' });
  }

  // 3. Sync issues
  if (project.issues.length > 0) {
    const issueRows = project.issues.map((i) => ({
      id: i.id,
      project_id: project.id,
      page_number: i.pageNumber,
      bbox: i.bbox,
      ocr_text: i.ocrText || '',
      issue_type: i.issueType,
      edit_mode: i.editMode || 'text',
      status: i.status,
      corrected_text: i.correctedText || null,
      candidates: i.candidates || [],
      confidence: i.confidence || null,
    }));
    await supabase.from('project_issues').upsert(issueRows);
  }

  // 4. Sync text overlays
  if (project.textOverlays.length > 0) {
    const overlayRows = project.textOverlays.map((o) => ({
      id: o.id,
      project_id: project.id,
      page_number: o.pageNumber,
      bbox: o.bbox,
      text: o.text,
      font_size: o.fontSize,
      font_family: o.fontFamily,
      font_weight: o.fontWeight,
      font_style: o.fontStyle,
      text_decoration: o.textDecoration,
      text_align: o.textAlign,
      color: o.color,
      background_color: o.backgroundColor,
    }));
    await supabase.from('project_text_overlays').upsert(overlayRows);
  }
}

/**
 * Upload a single page image from IndexedDB to Supabase Storage
 */
async function uploadPageImage(
  userId: string,
  projectId: string,
  pageNumber: number,
  imageKey: string,
  type: 'page' | 'thumb'
): Promise<string> {
  const dataUrl = await getImage(imageKey);
  if (!dataUrl) throw new Error(`Image not found in IndexedDB: ${imageKey}`);

  const blob = dataUrlToBlob(dataUrl);
  const path = `${userId}/${projectId}/${type}-${pageNumber}.png`;

  const { error } = await supabase.storage
    .from('project-images')
    .upload(path, blob, {
      contentType: 'image/png',
      upsert: true,
    });
  if (error) throw error;

  return path;
}

/**
 * Re-upload a single page image (after AI edit etc.)
 */
export async function syncPageImage(
  userId: string,
  projectId: string,
  pageNumber: number,
  imageDataUrl: string
): Promise<string> {
  const blob = dataUrlToBlob(imageDataUrl);
  const path = `${userId}/${projectId}/page-${pageNumber}.png`;

  const { error } = await supabase.storage
    .from('project-images')
    .upload(path, blob, {
      contentType: 'image/png',
      upsert: true,
    });
  if (error) throw error;

  return path;
}

// ============================================
// Fetch from cloud
// ============================================

/**
 * Fetch all projects for a user from Supabase (metadata only)
 */
export async function fetchCloudProjects(userId: string): Promise<CloudProject[]> {
  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

/**
 * Fetch a full project with pages, issues, overlays from cloud
 */
export async function fetchCloudProjectFull(projectId: string): Promise<Project | null> {
  // Fetch project
  const { data: proj, error: projError } = await supabase
    .from('projects')
    .select('*')
    .eq('id', projectId)
    .single();
  if (projError || !proj) return null;

  // Fetch pages
  const { data: pages } = await supabase
    .from('project_pages')
    .select('*')
    .eq('project_id', projectId)
    .order('page_number');

  // Fetch issues
  const { data: issues } = await supabase
    .from('project_issues')
    .select('*')
    .eq('project_id', projectId);

  // Fetch overlays
  const { data: overlays } = await supabase
    .from('project_text_overlays')
    .select('*')
    .eq('project_id', projectId);

  return {
    id: proj.id,
    name: proj.name,
    fileName: proj.file_name,
    totalPages: proj.total_pages,
    status: proj.status,
    createdAt: proj.created_at,
    updatedAt: proj.updated_at,
    userId: proj.user_id,
    syncStatus: 'synced' as const,
    pages: (pages || []).map((p: Record<string, unknown>) => ({
      pageNumber: p.page_number as number,
      width: p.width as number,
      height: p.height as number,
      imageKey: `${projectId}/page-${p.page_number}`,
      thumbnailKey: `${projectId}/thumb-${p.page_number}`,
      cloudImagePath: p.image_path as string,
      cloudThumbnailPath: p.thumbnail_path as string,
    })),
    issues: (issues || []).map((i: Record<string, unknown>) => ({
      id: i.id as string,
      pageNumber: i.page_number as number,
      bbox: i.bbox as { x: number; y: number; width: number; height: number },
      ocrText: (i.ocr_text as string) || '',
      issueType: i.issue_type as Issue['issueType'],
      editMode: (i.edit_mode as Issue['editMode']) || 'text',
      status: i.status as Issue['status'],
      correctedText: i.corrected_text as string | undefined,
      candidates: (i.candidates as Issue['candidates']) || [],
      confidence: i.confidence as number | undefined,
    })),
    textOverlays: (overlays || []).map((o: Record<string, unknown>) => ({
      id: o.id as string,
      pageNumber: o.page_number as number,
      bbox: o.bbox as { x: number; y: number; width: number; height: number },
      text: (o.text as string) || '',
      fontSize: (o.font_size as number) || 16,
      fontFamily: (o.font_family as string) || 'sans-serif',
      fontWeight: (o.font_weight as TextOverlay['fontWeight']) || 'normal',
      fontStyle: (o.font_style as TextOverlay['fontStyle']) || 'normal',
      textDecoration: (o.text_decoration as TextOverlay['textDecoration']) || 'none',
      textAlign: (o.text_align as TextOverlay['textAlign']) || 'left',
      color: (o.color as string) || '#000000',
      backgroundColor: (o.background_color as string) || 'transparent',
    })),
  };
}

/**
 * Download an image from Supabase Storage to a data URL
 */
export async function downloadImageFromCloud(storagePath: string): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from('project-images')
    .download(storagePath);

  if (error || !data) return null;
  return blobToDataUrl(data);
}

/**
 * Get a public/signed URL for a storage path (for thumbnails)
 */
export function getCloudImageUrl(storagePath: string): string {
  const { data } = supabase.storage
    .from('project-images')
    .getPublicUrl(storagePath);
  return data.publicUrl;
}

// ============================================
// Delete from cloud
// ============================================

/**
 * Delete a project and all its data from Supabase
 */
export async function deleteCloudProject(projectId: string, userId: string): Promise<void> {
  // Delete storage files (list + remove)
  const folder = `${userId}/${projectId}`;
  const { data: files } = await supabase.storage
    .from('project-images')
    .list(folder);

  if (files && files.length > 0) {
    const paths = files.map((f) => `${folder}/${f.name}`);
    await supabase.storage.from('project-images').remove(paths);
  }

  // Delete project (cascades to pages, issues, overlays)
  await supabase.from('projects').delete().eq('id', projectId);
}

// ============================================
// Granular sync (for individual changes)
// ============================================

/**
 * Sync project metadata only (no images)
 */
export async function syncProjectMetadata(
  projectId: string,
  updates: Partial<Project>
): Promise<void> {
  const dbUpdates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (updates.name !== undefined) dbUpdates.name = updates.name;
  if (updates.status !== undefined) dbUpdates.status = updates.status;
  if (updates.totalPages !== undefined) dbUpdates.total_pages = updates.totalPages;

  await supabase.from('projects').update(dbUpdates).eq('id', projectId);
}

/**
 * Sync a single issue (upsert or delete)
 */
export async function syncIssue(
  projectId: string,
  issue: Issue,
  action: 'upsert' | 'delete'
): Promise<void> {
  if (action === 'delete') {
    await supabase.from('project_issues').delete().eq('id', issue.id);
    return;
  }

  await supabase.from('project_issues').upsert({
    id: issue.id,
    project_id: projectId,
    page_number: issue.pageNumber,
    bbox: issue.bbox,
    ocr_text: issue.ocrText || '',
    issue_type: issue.issueType,
    edit_mode: issue.editMode || 'text',
    status: issue.status,
    corrected_text: issue.correctedText || null,
    candidates: issue.candidates || [],
    confidence: issue.confidence || null,
    updated_at: new Date().toISOString(),
  });
}

/**
 * Sync a single text overlay (upsert or delete)
 */
export async function syncTextOverlay(
  projectId: string,
  overlay: TextOverlay,
  action: 'upsert' | 'delete'
): Promise<void> {
  if (action === 'delete') {
    await supabase.from('project_text_overlays').delete().eq('id', overlay.id);
    return;
  }

  await supabase.from('project_text_overlays').upsert({
    id: overlay.id,
    project_id: projectId,
    page_number: overlay.pageNumber,
    bbox: overlay.bbox,
    text: overlay.text,
    font_size: overlay.fontSize,
    font_family: overlay.fontFamily,
    font_weight: overlay.fontWeight,
    font_style: overlay.fontStyle,
    text_decoration: overlay.textDecoration,
    text_align: overlay.textAlign,
    color: overlay.color,
    background_color: overlay.backgroundColor,
    updated_at: new Date().toISOString(),
  });
}

// ============================================
// Debounced sync helper
// ============================================

const syncTimers = new Map<string, ReturnType<typeof setTimeout>>();

export function debouncedSyncMetadata(projectId: string, updates: Partial<Project>): void {
  const existing = syncTimers.get(projectId);
  if (existing) clearTimeout(existing);

  syncTimers.set(projectId, setTimeout(() => {
    syncProjectMetadata(projectId, updates).catch((err) =>
      console.warn('[sync] metadata sync failed:', err)
    );
    syncTimers.delete(projectId);
  }, 500));
}
