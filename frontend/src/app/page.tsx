'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Uploader } from '@/components/Uploader';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import api, { type Project } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import {
  FileText,
  Clock,
  Trash2,
  ChevronRight,
  Sparkles,
  Zap,
  Shield,
} from 'lucide-react';

export default function HomePage() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoadingProjects, setIsLoadingProjects] = useState(true);

  useEffect(() => {
    loadProjects();
  }, []);

  const loadProjects = async () => {
    try {
      const data = await api.listProjects();
      setProjects(data);
    } catch (error) {
      console.error('Failed to load projects:', error);
    } finally {
      setIsLoadingProjects(false);
    }
  };

  const handleUploadComplete = (projectId: string) => {
    router.push(`/projects/${projectId}`);
  };

  const handleDeleteProject = async (projectId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('このプロジェクトを削除しますか？')) {
      try {
        await api.deleteProject(projectId);
        setProjects((prev) => prev.filter((p) => p.id !== projectId));
      } catch (error) {
        console.error('Failed to delete project:', error);
      }
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50">
      {/* Hero section */}
      <div className="max-w-5xl mx-auto px-4 pt-16 pb-24">
        {/* Logo & Title */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-white/80 backdrop-blur rounded-full shadow-sm mb-6">
            <Sparkles className="w-4 h-4 text-blue-500" />
            <span className="text-sm font-medium text-gray-600">
              AI-Powered PDF Correction
            </span>
          </div>

          <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">
            NotebookLM
            <span className="bg-gradient-to-r from-blue-500 to-purple-500 bg-clip-text text-transparent">
              {' '}修正ツール
            </span>
          </h1>

          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            PDF内の文字化け・ぼやけ文字を
            <span className="font-semibold text-gray-900">AIが自動検出</span>
            して修正。
            <br />
            修正済みPDF/PPTXをワンクリックで出力。
          </p>
        </div>

        {/* Features */}
        <div className="grid grid-cols-3 gap-4 max-w-2xl mx-auto mb-12">
          <div className="text-center">
            <div className="w-12 h-12 mx-auto mb-2 bg-blue-100 rounded-xl flex items-center justify-center">
              <Zap className="w-6 h-6 text-blue-600" />
            </div>
            <p className="text-sm font-medium text-gray-900">自動検出</p>
            <p className="text-xs text-gray-500">OCR + AI分析</p>
          </div>
          <div className="text-center">
            <div className="w-12 h-12 mx-auto mb-2 bg-purple-100 rounded-xl flex items-center justify-center">
              <Sparkles className="w-6 h-6 text-purple-600" />
            </div>
            <p className="text-sm font-medium text-gray-900">AI修正</p>
            <p className="text-xs text-gray-500">Gemini画像編集</p>
          </div>
          <div className="text-center">
            <div className="w-12 h-12 mx-auto mb-2 bg-green-100 rounded-xl flex items-center justify-center">
              <Shield className="w-6 h-6 text-green-600" />
            </div>
            <p className="text-sm font-medium text-gray-900">ROI限定</p>
            <p className="text-xs text-gray-500">ページ全体は再生成しない</p>
          </div>
        </div>

        {/* Uploader */}
        <Uploader onUploadComplete={handleUploadComplete} />
      </div>

      {/* Recent projects */}
      <div className="max-w-5xl mx-auto px-4 pb-16">
        <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
          <Clock className="w-5 h-5 text-gray-400" />
          最近のプロジェクト
        </h2>

        {isLoadingProjects ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-32 rounded-xl bg-gray-200 animate-pulse"
              />
            ))}
          </div>
        ) : projects.length === 0 ? (
          <Card padding="lg" className="text-center text-gray-500">
            まだプロジェクトがありません。PDFをアップロードして始めましょう。
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {projects.slice(0, 6).map((project) => (
              <Card
                key={project.id}
                variant="elevated"
                className="cursor-pointer group"
                onClick={() => router.push(`/projects/${project.id}`)}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center group-hover:bg-blue-200 transition-colors">
                    <FileText className="w-5 h-5 text-blue-600" />
                  </div>
                  <button
                    onClick={(e) => handleDeleteProject(project.id, e)}
                    className="p-1.5 hover:bg-gray-100 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <Trash2 className="w-4 h-4 text-gray-400 hover:text-red-500" />
                  </button>
                </div>

                <h3 className="font-semibold text-gray-900 truncate mb-1 group-hover:text-blue-600 transition-colors">
                  {project.name}
                </h3>

                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <span>{project.total_pages}ページ</span>
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
                  {formatDate(project.created_at)}
                </p>

                <div className="mt-3 flex justify-end">
                  <ChevronRight className="w-5 h-5 text-gray-300 group-hover:text-blue-500 group-hover:translate-x-1 transition-all" />
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
