'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Uploader } from '@/components/Uploader';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { AuthForm } from '@/components/auth/AuthForm';
import { useAuth } from '@/components/auth/AuthProvider';
import { useAppStore } from '@/lib/store';
import { formatDate } from '@/lib/utils';
import {
  FileText,
  Clock,
  Trash2,
  ChevronRight,
  LogOut,
  Loader2,
} from 'lucide-react';

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
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-gray-900 rounded-lg flex items-center justify-center">
              <span className="text-sm font-bold text-white">N</span>
            </div>
            <span className="text-sm font-medium text-gray-900">NotebookLM 修正ツール</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-500">{user.email}</span>
            <button
              onClick={() => signOut()}
              className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors"
            >
              <LogOut className="w-4 h-4" />
              ログアウト
            </button>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-4xl mx-auto px-4 py-8">
        {/* Title */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            PDF文字修正
          </h1>
          <p className="text-gray-600">
            PDFをアップロードして、文字化けやぼやけた文字を修正できます。
          </p>
        </div>

        {/* Uploader */}
        <div className="mb-12">
          <Uploader onUploadComplete={handleUploadComplete} />
        </div>

        {/* Recent projects */}
        <div>
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Clock className="w-4 h-4 text-gray-400" />
            最近のプロジェクト
          </h2>

          {isLoadingProjects ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-28 rounded-lg bg-gray-200 animate-pulse"
                />
              ))}
            </div>
          ) : projects.length === 0 ? (
            <div className="bg-white border border-gray-200 rounded-lg p-6 text-center text-gray-500">
              まだプロジェクトがありません。PDFをアップロードして始めましょう。
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {projects.slice(0, 6).map((project) => (
                <div
                  key={project.id}
                  className="bg-white border border-gray-200 rounded-lg p-4 cursor-pointer hover:border-gray-300 transition-colors group"
                  onClick={() => router.push(`/projects/${project.id}`)}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="w-9 h-9 bg-gray-100 rounded-lg flex items-center justify-center">
                      <FileText className="w-4 h-4 text-gray-600" />
                    </div>
                    <button
                      onClick={(e) => handleDeleteProject(project.id, e)}
                      className="p-1.5 hover:bg-gray-100 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <Trash2 className="w-4 h-4 text-gray-400 hover:text-red-500" />
                    </button>
                  </div>

                  <h3 className="font-medium text-gray-900 truncate mb-1">
                    {project.name}
                  </h3>

                  <div className="flex items-center gap-2 text-sm text-gray-500">
                    <span>{project.pages.length}ページ</span>
                    <span>•</span>
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
                      {project.status}
                    </Badge>
                  </div>

                  <p className="text-xs text-gray-400 mt-2">
                    {formatDate(project.createdAt)}
                  </p>

                  <div className="mt-2 flex justify-end">
                    <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-gray-500 transition-colors" />
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
