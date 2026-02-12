'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Uploader } from '@/components/Uploader';
import { Badge } from '@/components/ui/Badge';
import { AuthForm } from '@/components/auth/AuthForm';
import { useAuth } from '@/components/auth/AuthProvider';
import { useAppStore, type Project } from '@/lib/store';
import { getImage } from '@/lib/image-store';
import { downloadImageFromCloud } from '@/lib/sync';
import { useSync } from '@/hooks/useSync';
import { formatDate, cn } from '@/lib/utils';
import {
  getCreditsInfo,
  getGeminiApiKey,
  setGeminiApiKey,
  removeGeminiApiKey,
  validateApiKey,
  type CreditsInfo,
} from '@/lib/gemini';
import {
  FileText,
  Clock,
  Trash2,
  LogOut,
  Loader2,
  Cloud,
  CloudOff,
  RefreshCw,
  Home,
  BarChart3,
  Settings,
  FileCheck,
  Coins,
  ArrowDown,
  ArrowUp,
  Gift,
  Key,
  Eye,
  EyeOff,
  Check,
  AlertCircle,
  ExternalLink,
} from 'lucide-react';

// ============================================
// Sub-components
// ============================================

function ProjectThumbnail({ project }: { project: Project }) {
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);

  useEffect(() => {
    const firstPage = project.pages[0];
    if (!firstPage) return;

    getImage(firstPage.imageKey).then(async (url) => {
      if (url) {
        setThumbnailUrl(url);
      } else if (firstPage.cloudImagePath) {
        const cloudUrl = await downloadImageFromCloud(firstPage.cloudImagePath);
        if (cloudUrl) setThumbnailUrl(cloudUrl);
      }
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
      <img src={thumbnailUrl} alt={project.name} className="w-full h-full object-cover object-top" />
    </div>
  );
}

function SyncStatusIcon({ status }: { status?: string }) {
  if (status === 'synced') return <Cloud className="w-3.5 h-3.5 text-green-500" />;
  if (status === 'pending') return <RefreshCw className="w-3.5 h-3.5 text-yellow-500 animate-spin" />;
  if (status === 'error') return <CloudOff className="w-3.5 h-3.5 text-red-400" />;
  return null;
}

// ============================================
// Tab: Home
// ============================================

function HomeTab({
  projects,
  isLoadingProjects,
  onUploadComplete,
  onDeleteProject,
  onOpenProject,
}: {
  projects: Project[];
  isLoadingProjects: boolean;
  onUploadComplete: (id: string) => void;
  onDeleteProject: (id: string, e: React.MouseEvent) => void;
  onOpenProject: (id: string) => void;
}) {
  return (
    <div>
      <div className="mb-12">
        <Uploader onUploadComplete={onUploadComplete} />
      </div>

      <div>
        <h2 className="text-xl font-semibold text-gray-900 mb-6 flex items-center gap-3">
          <Clock className="w-5 h-5 text-gray-400" />
          最近のプロジェクト
        </h2>

        {isLoadingProjects ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-32 rounded-xl bg-gray-200 animate-pulse" />
            ))}
          </div>
        ) : projects.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-xl p-8 text-center text-gray-500">
            まだプロジェクトがありません。PDFをアップロードして始めましょう。
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {projects.map((project) => (
              <div
                key={project.id}
                className="bg-white border border-gray-200 rounded-xl overflow-hidden cursor-pointer hover:border-gray-300 hover:shadow-md transition-all group"
                onClick={() => onOpenProject(project.id)}
              >
                <div className="relative">
                  <ProjectThumbnail project={project} />
                  <button
                    onClick={(e) => onDeleteProject(project.id, e)}
                    className="absolute top-2 right-2 p-1.5 bg-white/80 backdrop-blur-sm hover:bg-white rounded-lg opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
                  >
                    <Trash2 className="w-4 h-4 text-gray-400 hover:text-red-500" />
                  </button>
                </div>
                <div className="p-4">
                  <h3 className="font-semibold text-gray-900 truncate mb-2 text-sm">{project.name}</h3>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      <SyncStatusIcon status={project.syncStatus} />
                      <span>{project.pages.length}ページ</span>
                      <span>•</span>
                      <span>{formatDate(project.createdAt)}</span>
                    </div>
                    <Badge
                      variant={
                        project.status === 'completed' || project.status === 'ready'
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
    </div>
  );
}

// ============================================
// Tab: Usage
// ============================================

function UsageTab() {
  const [creditsInfo, setCreditsInfo] = useState<CreditsInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadCredits = async () => {
    setIsLoading(true);
    const info = await getCreditsInfo();
    setCreditsInfo(info);
    setIsLoading(false);
  };

  useEffect(() => {
    loadCredits();
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-8 h-8 text-amber-500 animate-spin" />
      </div>
    );
  }

  if (!creditsInfo) {
    return (
      <div className="text-center py-16 text-gray-500">
        クレジット情報を取得できませんでした
      </div>
    );
  }

  return (
    <div className="max-w-2xl">
      <h2 className="text-xl font-semibold text-gray-900 mb-6 flex items-center gap-3">
        <BarChart3 className="w-5 h-5 text-gray-400" />
        API使用量
      </h2>

      <div className="space-y-6">
        {/* Balance Card */}
        <div className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-2xl p-8 text-center border border-amber-200">
          <p className="text-sm text-amber-700 mb-1">クレジット残高</p>
          <p className="text-6xl font-bold text-amber-600">{creditsInfo.balance}</p>
          <p className="text-sm text-amber-600 mt-2">クレジット</p>
        </div>

        {/* Cost Info */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-blue-50 rounded-xl p-5 text-center border border-blue-100">
            <p className="text-3xl font-bold text-blue-600">{creditsInfo.costs.image_generation}</p>
            <p className="text-sm text-blue-600 mt-1">画像生成 / 回</p>
          </div>
          <div className="bg-purple-50 rounded-xl p-5 text-center border border-purple-100">
            <p className="text-3xl font-bold text-purple-600">{creditsInfo.costs.text_generation}</p>
            <p className="text-sm text-purple-600 mt-1">テキスト生成 / 回</p>
          </div>
        </div>

        {/* Usage Estimate */}
        <div className="bg-gray-50 rounded-xl p-5 border border-gray-200">
          <p className="text-sm font-medium text-gray-700 mb-3">残高で利用可能な回数</p>
          <div className="grid grid-cols-2 gap-4 text-center">
            <div>
              <p className="text-2xl font-bold text-gray-900">
                {Math.floor(creditsInfo.balance / creditsInfo.costs.image_generation)}
              </p>
              <p className="text-xs text-gray-500">画像生成</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">
                {Math.floor(creditsInfo.balance / creditsInfo.costs.text_generation)}
              </p>
              <p className="text-xs text-gray-500">テキスト生成</p>
            </div>
          </div>
        </div>

        {/* Recent Transactions */}
        {creditsInfo.recent_transactions && creditsInfo.recent_transactions.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-3">最近の利用履歴</h3>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {creditsInfo.recent_transactions.map((tx, i) => (
                <div key={i} className="flex items-center gap-3 p-3 bg-white rounded-lg border border-gray-100">
                  <div
                    className={cn(
                      'w-8 h-8 rounded-full flex items-center justify-center',
                      tx.transaction_type === 'deduct' ? 'bg-red-100' :
                      tx.transaction_type === 'refund' ? 'bg-green-100' : 'bg-blue-100'
                    )}
                  >
                    {tx.transaction_type === 'deduct' ? (
                      <ArrowDown className="w-4 h-4 text-red-600" />
                    ) : tx.transaction_type === 'refund' ? (
                      <ArrowUp className="w-4 h-4 text-green-600" />
                    ) : (
                      <Gift className="w-4 h-4 text-blue-600" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {tx.description || tx.transaction_type}
                    </p>
                    <p className="text-xs text-gray-500">
                      {new Date(tx.created_at).toLocaleString('ja-JP')}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className={cn('text-sm font-semibold', tx.transaction_type === 'deduct' ? 'text-red-600' : 'text-green-600')}>
                      {tx.transaction_type === 'deduct' ? '-' : '+'}{tx.amount}
                    </p>
                    <p className="text-xs text-gray-400">残高: {tx.balance_after}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Refresh */}
        <button
          onClick={loadCredits}
          className="flex items-center justify-center gap-2 w-full py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          更新
        </button>

        {/* Info */}
        <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
          <p className="text-xs text-gray-500">
            初回登録時に100クレジットが付与されます。API呼び出しが失敗した場合、クレジットは自動的に返金されます。
          </p>
        </div>
      </div>
    </div>
  );
}

// ============================================
// Tab: Settings
// ============================================

function SettingsTab() {
  const [apiKey, setApiKeyState] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [validationStatus, setValidationStatus] = useState<'idle' | 'valid' | 'invalid'>('idle');
  const [hasExistingKey, setHasExistingKey] = useState(false);

  useEffect(() => {
    const existingKey = getGeminiApiKey();
    if (existingKey) {
      setApiKeyState(existingKey);
      setHasExistingKey(true);
      setValidationStatus('valid');
    }
  }, []);

  const handleSave = async () => {
    if (!apiKey.trim()) {
      setValidationStatus('invalid');
      return;
    }
    setIsValidating(true);
    setValidationStatus('idle');
    const isValid = await validateApiKey(apiKey.trim());
    if (isValid) {
      setGeminiApiKey(apiKey.trim());
      setValidationStatus('valid');
      setHasExistingKey(true);
    } else {
      setValidationStatus('invalid');
    }
    setIsValidating(false);
  };

  const handleRemove = () => {
    removeGeminiApiKey();
    setApiKeyState('');
    setHasExistingKey(false);
    setValidationStatus('idle');
  };

  return (
    <div className="max-w-2xl">
      <h2 className="text-xl font-semibold text-gray-900 mb-6 flex items-center gap-3">
        <Settings className="w-5 h-5 text-gray-400" />
        設定
      </h2>

      <div className="space-y-6">
        {/* API Key Section */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
              <Key className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-gray-900">Gemini API キー</h3>
              <p className="text-sm text-gray-500">画像・テキスト生成に使用</p>
            </div>
          </div>

          <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl mb-4">
            <div className="flex gap-3">
              <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-amber-800">
                APIキーはお使いのブラウザにのみ保存され、サーバーには送信されません。API使用料は各自のGoogleアカウントに請求されます。
              </p>
            </div>
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">API Key</label>
            <div className="relative">
              <input
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => { setApiKeyState(e.target.value); setValidationStatus('idle'); }}
                placeholder="AIza..."
                className={cn(
                  'w-full px-4 py-2.5 border rounded-lg text-sm focus:outline-none focus:ring-2 pr-20',
                  validationStatus === 'valid' ? 'border-green-500 focus:ring-green-500' :
                  validationStatus === 'invalid' ? 'border-red-500 focus:ring-red-500' :
                  'border-gray-300 focus:ring-blue-500'
                )}
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600"
              >
                {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {validationStatus === 'valid' && (
              <p className="mt-2 text-sm text-green-600 flex items-center gap-1">
                <Check className="w-4 h-4" /> APIキーが有効です
              </p>
            )}
            {validationStatus === 'invalid' && (
              <p className="mt-2 text-sm text-red-600 flex items-center gap-1">
                <AlertCircle className="w-4 h-4" /> 無効なAPIキーです
              </p>
            )}
          </div>

          <a
            href="https://aistudio.google.com/app/apikey"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700 mb-4"
          >
            Google AI StudioでAPIキーを取得 <ExternalLink className="w-3 h-3" />
          </a>

          <div className="flex gap-3">
            {hasExistingKey && (
              <button
                onClick={handleRemove}
                className="px-4 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors"
              >
                キーを削除
              </button>
            )}
            <div className="flex-1" />
            <button
              onClick={handleSave}
              disabled={isValidating || !apiKey.trim()}
              className="px-6 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg transition-colors flex items-center gap-2"
            >
              {isValidating ? <><Loader2 className="w-4 h-4 animate-spin" /> 検証中...</> : '保存'}
            </button>
          </div>
        </div>

        {/* Model Info */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="text-base font-semibold text-gray-900 mb-3">使用モデル・料金目安</h3>
          <div className="text-sm text-gray-600 space-y-2">
            <div className="flex items-start gap-2">
              <span className="text-blue-500 mt-0.5">●</span>
              <div>
                <p className="font-medium">画像生成: Gemini 3.0 Pro</p>
                <p className="text-xs text-gray-400">約$0.134/枚 - 高品質な画像編集</p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-purple-500 mt-0.5">●</span>
              <div>
                <p className="font-medium">テキスト候補生成: Gemini 2.0 Flash</p>
                <p className="text-xs text-gray-400">約$0.075/100万トークン - 高速・低コスト</p>
              </div>
            </div>
            <p className="text-xs text-gray-400 mt-2 pt-2 border-t border-gray-100">
              ※ 料金は変更される可能性があります。最新情報はGoogleの公式ドキュメントをご確認ください。
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================
// Tab: Terms
// ============================================

function TermsTab() {
  return (
    <div className="max-w-2xl">
      <h2 className="text-xl font-semibold text-gray-900 mb-6 flex items-center gap-3">
        <FileCheck className="w-5 h-5 text-gray-400" />
        利用規約
      </h2>

      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-6">
        {/* Service Overview */}
        <section>
          <h3 className="text-base font-semibold text-gray-900 mb-2">サービス概要</h3>
          <p className="text-sm text-gray-600 leading-relaxed">
            オタスケPDFは、PDF・PPTXファイルのスライドに含まれるテキストや画像の修正を支援するAIツールです。
            Google Gemini APIを活用し、画像のインペイント修正やテキストのOCR・候補生成を行います。
          </p>
        </section>

        {/* Credit System */}
        <section>
          <h3 className="text-base font-semibold text-gray-900 mb-2">クレジットシステム</h3>
          <div className="text-sm text-gray-600 leading-relaxed space-y-2">
            <p>本サービスではクレジット制を採用しています。</p>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li>新規登録時に <strong>100クレジット</strong> が付与されます</li>
              <li>画像生成（AI修正）: <strong>10クレジット / 回</strong></li>
              <li>テキスト生成（OCR・候補生成）: <strong>1クレジット / 回</strong></li>
              <li>API呼び出しが失敗した場合、消費されたクレジットは <strong>自動的に返金</strong> されます</li>
              <li>同一リクエストの重複課金は発生しません（冪等性保証）</li>
            </ul>
          </div>
        </section>

        {/* API Usage */}
        <section>
          <h3 className="text-base font-semibold text-gray-900 mb-2">API利用について</h3>
          <p className="text-sm text-gray-600 leading-relaxed">
            本サービスはサーバー側でGoogle Gemini APIを使用しています。
            ユーザーが自身のAPIキーを設定した場合、そのキーはブラウザのローカルストレージにのみ保存され、
            サーバーには送信されません。APIの利用料金はユーザー自身のGoogleアカウントに請求されます。
          </p>
        </section>

        {/* Data Handling */}
        <section>
          <h3 className="text-base font-semibold text-gray-900 mb-2">データの取り扱い</h3>
          <div className="text-sm text-gray-600 leading-relaxed space-y-2">
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li>アップロードされたファイルはブラウザのIndexedDBに保存されます</li>
              <li>ログイン時はSupabaseクラウドにプロジェクトデータが同期されます</li>
              <li>画像データはSupabase Storageに暗号化して保存されます</li>
              <li>ユーザーデータは他のユーザーからアクセスできません（RLS適用済み）</li>
              <li>プロジェクトを削除すると、ローカルおよびクラウドの両方からデータが完全に削除されます</li>
            </ul>
          </div>
        </section>

        {/* Disclaimer */}
        <section>
          <h3 className="text-base font-semibold text-gray-900 mb-2">免責事項</h3>
          <div className="text-sm text-gray-600 leading-relaxed space-y-2">
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li>AI生成結果の正確性は保証されません。必ず人間の目で最終確認をしてください</li>
              <li>本サービスの利用により生じた損害について、運営者は責任を負いません</li>
              <li>サービスの仕様・料金は予告なく変更される場合があります</li>
              <li>不正利用が確認された場合、アカウントを停止する場合があります</li>
            </ul>
          </div>
        </section>

        {/* Footer */}
        <div className="pt-4 border-t border-gray-100">
          <p className="text-xs text-gray-400 text-center">最終更新: 2026年2月</p>
        </div>
      </div>
    </div>
  );
}

// ============================================
// Main Page
// ============================================

type TabId = 'home' | 'usage' | 'settings' | 'terms';

const tabs: { id: TabId; label: string; icon: typeof Home }[] = [
  { id: 'home', label: 'ホーム', icon: Home },
  { id: 'usage', label: 'API使用量', icon: BarChart3 },
  { id: 'settings', label: '設定', icon: Settings },
  { id: 'terms', label: '利用規約', icon: FileCheck },
];

export default function HomePage() {
  const router = useRouter();
  const { user, isLoading: authLoading, signOut } = useAuth();
  const projects = useAppStore((state) => state.projects);
  const deleteProject = useAppStore((state) => state.deleteProject);
  const [isLoadingProjects, setIsLoadingProjects] = useState(true);
  const [activeTab, setActiveTab] = useState<TabId>('home');
  const [creditBalance, setCreditBalance] = useState<number | null>(null);

  useSync(user?.id);

  useEffect(() => {
    setIsLoadingProjects(false);
  }, []);

  // Load credit balance for sidebar badge
  useEffect(() => {
    if (!user) return;
    getCreditsInfo().then((info) => {
      if (info) setCreditBalance(info.balance);
    });
  }, [user]);

  const handleUploadComplete = (projectId: string) => {
    router.push(`/projects/${projectId}`);
  };

  const handleDeleteProject = (projectId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('このプロジェクトを削除しますか？')) {
      deleteProject(projectId);
    }
  };

  const handleAuthSuccess = () => {};

  if (authLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
      </div>
    );
  }

  if (!user) {
    return <AuthForm onSuccess={handleAuthSuccess} />;
  }

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar */}
      <aside className="w-56 bg-white border-r border-gray-200 flex flex-col flex-shrink-0">
        {/* Logo */}
        <div className="p-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-gray-900 rounded-xl flex items-center justify-center">
              <span className="text-base font-bold text-white">助</span>
            </div>
            <span className="text-sm font-semibold text-gray-900">オタスケPDF</span>
          </div>
        </div>

        {/* Credit Badge */}
        <div className="px-3 py-3">
          <button
            onClick={() => setActiveTab('usage')}
            className="w-full flex items-center gap-2 px-3 py-2 bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-lg hover:from-amber-100 hover:to-orange-100 transition-colors"
          >
            <Coins className="w-4 h-4 text-amber-600" />
            <span className="text-xs text-amber-700">クレジット</span>
            <span className="ml-auto text-sm font-bold text-amber-600">
              {creditBalance !== null ? creditBalance : '...'}
            </span>
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-2 space-y-1">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-gray-900 text-white'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                )}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </nav>

        {/* User Info */}
        <div className="p-3 border-t border-gray-100">
          <div className="px-3 py-2">
            <p className="text-xs text-gray-500 truncate">{user.email}</p>
          </div>
          <button
            onClick={() => signOut()}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <LogOut className="w-4 h-4" />
            ログアウト
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto">
        <div className="px-8 py-10">
          {activeTab === 'home' && (
            <HomeTab
              projects={projects}
              isLoadingProjects={isLoadingProjects}
              onUploadComplete={handleUploadComplete}
              onDeleteProject={handleDeleteProject}
              onOpenProject={(id) => router.push(`/projects/${id}`)}
            />
          )}
          {activeTab === 'usage' && <UsageTab />}
          {activeTab === 'settings' && <SettingsTab />}
          {activeTab === 'terms' && <TermsTab />}
        </div>
      </main>
    </div>
  );
}
