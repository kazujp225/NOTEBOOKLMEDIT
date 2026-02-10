'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Uploader } from '@/components/Uploader';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { AuthForm } from '@/components/auth/AuthForm';
import { useAuth } from '@/components/auth/AuthProvider';
import { useAppStore, type Project } from '@/lib/store';
import { getImage } from '@/lib/image-store';
import { formatDate } from '@/lib/utils';
import {
  FileText,
  Clock,
  Trash2,
  ChevronRight,
  LogOut,
  Loader2,
} from 'lucide-react';

function ProjectThumbnail({ project }: { project: Project }) {
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);

  useEffect(() => {
    const firstPage = project.pages[0];
    if (!firstPage) return;

    getImage(firstPage.imageKey).then((url) => {
      if (url) setThumbnailUrl(url);
    }).catch(() => {});
  }, [project.id, project.pages]);

  if (!thumbnailUrl) {
    return (
      <div className="w-full aspect-[4/3] bg-gray-100 flex items-center justify-center">
        <FileText className="w-8 h-8 text-gray-300" />
      </div>
    );
  }

  return (
    <div className="w-full aspect-[4/3] bg-gray-100 overflow-hidden">
      <img
        src={thumbnailUrl}
        alt={project.name}
        className="w-full h-full object-cover object-top"
      />
    </div>
  );
}

export default function HomePage() {
  const router = useRouter();
  const { user, isLoading: authLoading, signOut } = useAuth();
  const projects = useAppStore((state) => state.projects);
  const deleteProject = useAppStore((state) => state.deleteProject);
  const [isLoadingProjects, setIsLoadingProjects] = useState(true);

  useEffect(() => {
    // Projects are loaded from localStorage via Zustand
    setIsLoadingProjects(false);
  }, []);

  const handleUploadComplete = (projectId: string) => {
    router.push(`/projects/${projectId}`);
  };

  const handleDeleteProject = async (projectId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('このプロジェクトを削除しますか？')) {
      deleteProject(projectId);
    }
  };

  const handleAuthSuccess = () => {
    // Auth state will be updated automatically via AuthProvider
  };

  // Show loading while checking auth state
  if (authLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
      </div>
    );
  }

  // Show login form if not authenticated
  if (!user) {
    return <AuthForm onSuccess={handleAuthSuccess} />;
  }

  // Main app content (after login)
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gray-900 rounded-xl flex items-center justify-center">
              <span className="text-lg font-bold text-white">助</span>
            </div>
            <span className="text-base font-semibold text-gray-900">オタスケPDF</span>
          </div>
          <div className="flex items-center gap-6">
            <span className="text-sm text-gray-600">{user.email}</span>
            <button
              onClick={() => signOut()}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <LogOut className="w-4 h-4" />
              ログアウト
            </button>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="px-8 py-12">
        {/* Uploader - Google style clean card */}
        <div className="mb-16">
          <Uploader onUploadComplete={handleUploadComplete} />
        </div>

        {/* Recent projects */}
        <div>
          <h2 className="text-xl font-semibold text-gray-900 mb-6 flex items-center gap-3">
            <Clock className="w-5 h-5 text-gray-400" />
            最近のプロジェクト
          </h2>

          {isLoadingProjects ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-32 rounded-xl bg-gray-200 animate-pulse"
                />
              ))}
            </div>
          ) : projects.length === 0 ? (
            <div className="bg-white border border-gray-200 rounded-xl p-8 text-center text-gray-500">
              まだプロジェクトがありません。PDFをアップロードして始めましょう。
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {projects.slice(0, 6).map((project) => (
                <div
                  key={project.id}
                  className="bg-white border border-gray-200 rounded-xl overflow-hidden cursor-pointer hover:border-gray-300 hover:shadow-md transition-all group"
                  onClick={() => router.push(`/projects/${project.id}`)}
                >
                  {/* Thumbnail */}
                  <div className="relative">
                    <ProjectThumbnail project={project} />
                    <button
                      onClick={(e) => handleDeleteProject(project.id, e)}
                      className="absolute top-2 right-2 p-1.5 bg-white/80 backdrop-blur-sm hover:bg-white rounded-lg opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
                    >
                      <Trash2 className="w-4 h-4 text-gray-400 hover:text-red-500" />
                    </button>
                  </div>

                  {/* Info */}
                  <div className="p-4">
                    <h3 className="font-semibold text-gray-900 truncate mb-2 text-sm">
                      {project.name}
                    </h3>

                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-xs text-gray-500">
                        <span>{project.pages.length}ページ</span>
                        <span>•</span>
                        <span>{formatDate(project.createdAt)}</span>
                      </div>
                      <Badge
                        variant={
                          project.status === 'completed' ||
                          project.status === 'ready'
                            ? 'success'
                            : project.status === 'processing'
                            ? 'primary'
                            : 'default'
                        }
                        size="sm"
                      >
                        {project.status === 'ready' ? '編集可能' : project.status}
                      </Badge>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
