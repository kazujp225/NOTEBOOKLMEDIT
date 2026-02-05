/**
 * API Client for NotebookLM Fixer Backend
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export interface Project {
  id: string;
  name: string;
  original_filename: string;
  total_pages: number;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface Page {
  id: string;
  page_number: number;
  thumbnail_url: string;
  image_url?: string;
  width: number;
  height: number;
  ocr_status: string;
  issue_count: number;
  has_unresolved_issues: boolean;
}

export interface BBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Issue {
  id: string;
  page_id: string;
  page_number: number;
  bbox: BBox;
  issue_type: string;
  confidence: number | null;
  ocr_text: string | null;
  detected_problems: string[];
  status: string;
  auto_correctable: boolean;
  candidates?: Candidate[];
  has_candidates?: boolean;
}

export interface Candidate {
  text: string;
  confidence: number;
  reason: string;
}

export interface Correction {
  id: string;
  issue_id: string;
  method: string;
  original_text: string | null;
  corrected_text: string | null;
  applied: boolean;
  applied_at: string | null;
}

export interface Export {
  id: string;
  project_id: string;
  export_type: string;
  status: string;
  download_url?: string;
  created_at: string;
}

class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string = API_BASE) {
    this.baseUrl = baseUrl;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
      throw new Error(error.detail || `API error: ${response.status}`);
    }

    return response.json();
  }

  // Projects
  async uploadPdf(file: File, name?: string): Promise<Project> {
    const formData = new FormData();
    formData.append('file', file);
    if (name) {
      formData.append('name', name);
    }

    const response = await fetch(`${this.baseUrl}/api/projects/upload`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Upload failed' }));
      throw new Error(error.detail);
    }

    return response.json();
  }

  async listProjects(): Promise<Project[]> {
    return this.request<Project[]>('/api/projects');
  }

  async getProject(projectId: string): Promise<Project & { pages: any[] }> {
    return this.request(`/api/projects/${projectId}`);
  }

  async deleteProject(projectId: string): Promise<void> {
    await this.request(`/api/projects/${projectId}`, { method: 'DELETE' });
  }

  // Pages
  async listPages(projectId: string): Promise<Page[]> {
    return this.request<Page[]>(`/api/projects/${projectId}/pages`);
  }

  async getPage(projectId: string, pageNumber: number): Promise<any> {
    return this.request(`/api/projects/${projectId}/pages/${pageNumber}`);
  }

  getPageImageUrl(projectId: string, pageNumber: number): string {
    return `${this.baseUrl}/api/projects/${projectId}/pages/${pageNumber}/image`;
  }

  getPageThumbnailUrl(projectId: string, pageNumber: number): string {
    return `${this.baseUrl}/api/projects/${projectId}/pages/${pageNumber}/thumbnail`;
  }

  // Issues
  async listIssues(projectId: string, status?: string): Promise<Issue[]> {
    const params = status ? `?status=${status}` : '';
    return this.request<Issue[]>(`/api/projects/${projectId}/issues${params}`);
  }

  async createIssue(
    projectId: string,
    pageNumber: number,
    bbox: BBox,
    ocrText: string = '',
    issueType: string = 'manual'
  ): Promise<Issue> {
    return this.request<Issue>(`/api/projects/${projectId}/issues`, {
      method: 'POST',
      body: JSON.stringify({
        page_number: pageNumber,
        bbox_x: bbox.x,
        bbox_y: bbox.y,
        bbox_width: bbox.width,
        bbox_height: bbox.height,
        ocr_text: ocrText,
        issue_type: issueType,
      }),
    });
  }

  async getIssue(issueId: string): Promise<Issue> {
    return this.request<Issue>(`/api/issues/${issueId}`);
  }

  async generateCandidates(issueId: string, forceRegenerate = false): Promise<{
    candidates: Candidate[];
    auto_adopt: boolean;
    selected_index: number | null;
  }> {
    return this.request(`/api/issues/${issueId}/generate-candidates`, {
      method: 'POST',
      body: JSON.stringify({ force_regenerate: forceRegenerate }),
    });
  }

  async updateIssueStatus(issueId: string, status: string): Promise<void> {
    await this.request(`/api/issues/${issueId}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status }),
    });
  }

  getIssueRoiUrl(issueId: string, margin = 40): string {
    return `${this.baseUrl}/api/issues/${issueId}/roi?margin=${margin}`;
  }

  // Corrections
  async applyCorrection(
    issueId: string,
    method: 'text_overlay' | 'nano_banana',
    selectedText?: string,
    selectedCandidateIndex?: number
  ): Promise<Correction> {
    return this.request<Correction>('/api/corrections', {
      method: 'POST',
      body: JSON.stringify({
        issue_id: issueId,
        method,
        selected_text: selectedText,
        selected_candidate_index: selectedCandidateIndex,
      }),
    });
  }

  async undoCorrection(correctionId: string): Promise<void> {
    await this.request(`/api/corrections/${correctionId}/undo`, {
      method: 'POST',
    });
  }

  async batchApplyCorrections(
    issueIds: string[],
    method: 'text_overlay' | 'nano_banana' = 'text_overlay'
  ): Promise<any> {
    return this.request('/api/corrections/batch', {
      method: 'POST',
      body: JSON.stringify({ issue_ids: issueIds, method }),
    });
  }

  // Exports
  async exportPdf(projectId: string): Promise<{ export_id: string }> {
    return this.request(`/api/projects/${projectId}/export/pdf`, {
      method: 'POST',
    });
  }

  async exportPptx(projectId: string): Promise<{ export_id: string }> {
    return this.request(`/api/projects/${projectId}/export/pptx`, {
      method: 'POST',
    });
  }

  async getExportStatus(exportId: string): Promise<Export> {
    return this.request<Export>(`/api/exports/${exportId}`);
  }

  getExportDownloadUrl(exportId: string): string {
    return `${this.baseUrl}/api/exports/${exportId}/download`;
  }

  // Health
  async healthCheck(): Promise<{ status: string }> {
    return this.request('/api/health');
  }
}

export const api = new ApiClient();
export default api;
