'use client';

import { useState, useEffect, useMemo } from 'react';
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
  type CreditsInfo,
} from '@/lib/gemini';
import { updateUserEmail, updateUserPassword } from '@/lib/supabase';
import { checkAdminStatus } from '@/lib/admin';
import { AdminTab } from '@/components/admin/AdminTab';
import {
  FileText,
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
  Gift,
  Check,
  Zap,
  TrendingDown,
  Mail,
  Lock,
  AlertCircle,
  Plus,
  X,
  Shield,
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
      <div className="w-full aspect-[4/3] bg-gray-50 flex items-center justify-center">
        <FileText className="w-8 h-8 text-gray-200" />
      </div>
    );
  }

  return (
    <div className="w-full aspect-[4/3] bg-gray-50 overflow-hidden">
      <img src={thumbnailUrl} alt={project.name} className="w-full h-full object-cover object-top" />
    </div>
  );
}

function SyncStatusIcon({ status }: { status?: string }) {
  if (status === 'synced') return <Cloud className="w-3 h-3 text-emerald-500" />;
  if (status === 'pending') return <RefreshCw className="w-3 h-3 text-amber-500 animate-spin" />;
  if (status === 'error') return <CloudOff className="w-3 h-3 text-red-400" />;
  return null;
}

// ============================================
// Upload Modal
// ============================================

function UploadModal({ isOpen, onClose, onUploadComplete }: {
  isOpen: boolean;
  onClose: () => void;
  onUploadComplete: (id: string) => void;
}) {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 p-8"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <X className="w-4 h-4 text-gray-400" />
        </button>
        <h2 className="text-lg font-semibold text-gray-900 mb-6">新規プロジェクト</h2>
        <Uploader onUploadComplete={(id) => { onClose(); onUploadComplete(id); }} />
      </div>
    </div>
  );
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
  const [showUploadModal, setShowUploadModal] = useState(false);

  return (
    <div>
      {/* Header with New Project button */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">プロジェクト</h2>
          <p className="text-sm text-gray-400 mt-0.5">{projects.length} 件</p>
        </div>
        <button
          onClick={() => setShowUploadModal(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-[#0d0d0d] hover:bg-[#1a1a1a] text-white text-sm font-medium rounded-lg transition-colors shadow-sm"
        >
          <Plus className="w-4 h-4" />
          新規プロジェクト
        </button>
      </div>

      {/* Project Grid - 3 columns */}
      {isLoadingProjects ? (
        <div className="grid grid-cols-3 gap-5">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-56 rounded-xl bg-gray-100 animate-pulse" />
          ))}
        </div>
      ) : projects.length === 0 ? (
        <div className="border border-dashed border-gray-200 rounded-xl p-16 text-center">
          <div className="w-14 h-14 bg-gray-50 rounded-xl mx-auto mb-4 flex items-center justify-center">
            <FileText className="w-7 h-7 text-gray-300" />
          </div>
          <p className="text-sm font-medium text-gray-500 mb-1">まだプロジェクトがありません</p>
          <p className="text-xs text-gray-400 mb-5">PDFやPPTXをアップロードして始めましょう</p>
          <button
            onClick={() => setShowUploadModal(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 hover:border-gray-300 rounded-lg transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            新規作成
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-5">
          {projects.map((project) => (
            <div
              key={project.id}
              className="bg-white border border-gray-100 rounded-xl overflow-hidden cursor-pointer hover:shadow-lg hover:border-gray-200 transition-all group"
              onClick={() => onOpenProject(project.id)}
            >
              <div className="relative">
                <ProjectThumbnail project={project} />
                <button
                  onClick={(e) => onDeleteProject(project.id, e)}
                  className="absolute top-2.5 right-2.5 p-1.5 bg-white/90 hover:bg-white rounded-lg opacity-0 group-hover:opacity-100 transition-all shadow-sm"
                >
                  <Trash2 className="w-3.5 h-3.5 text-gray-400 hover:text-red-500" />
                </button>
              </div>
              <div className="p-4">
                <h3 className="font-medium text-gray-900 truncate text-sm">{project.name}</h3>
                <div className="flex items-center justify-between mt-2.5">
                  <div className="flex items-center gap-1.5 text-xs text-gray-400">
                    <SyncStatusIcon status={project.syncStatus} />
                    <span className="tabular-nums">{project.pages.length}p</span>
                    <span className="text-gray-200">·</span>
                    <span>{formatDate(project.createdAt)}</span>
                  </div>
                  <Badge
                    variant={
                      project.status === 'completed' || project.status === 'ready' ? 'success' :
                      project.status === 'processing' ? 'primary' : 'default'
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

      {/* Upload Modal */}
      <UploadModal
        isOpen={showUploadModal}
        onClose={() => setShowUploadModal(false)}
        onUploadComplete={onUploadComplete}
      />
    </div>
  );
}

// ============================================
// Tab: Usage
// ============================================

function BalanceChart({ transactions }: { transactions: CreditsInfo['recent_transactions'] }) {
  if (!transactions || transactions.length < 2) return null;

  // Build data points: reverse to chronological, deduplicate by time
  const points = [...transactions].reverse().map((tx) => ({
    date: new Date(tx.created_at),
    balance: tx.balance_after,
  }));

  const maxBalance = Math.max(...points.map((p) => p.balance), 1);
  const W = 600;
  const H = 160;
  const padX = 0;
  const padY = 16;

  const xScale = (i: number) => padX + (i / (points.length - 1)) * (W - padX * 2);
  const yScale = (v: number) => H - padY - ((v / maxBalance) * (H - padY * 2));

  const linePath = points.map((p, i) =>
    `${i === 0 ? 'M' : 'L'} ${xScale(i).toFixed(1)} ${yScale(p.balance).toFixed(1)}`
  ).join(' ');

  const areaPath = `${linePath} L ${xScale(points.length - 1).toFixed(1)} ${H} L ${xScale(0).toFixed(1)} ${H} Z`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-[160px]" preserveAspectRatio="none">
      <defs>
        <linearGradient id="balanceGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.15" />
          <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill="url(#balanceGrad)" />
      <path d={linePath} fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      {/* End dot */}
      <circle cx={xScale(points.length - 1)} cy={yScale(points[points.length - 1].balance)} r="4" fill="#3b82f6" />
      <circle cx={xScale(points.length - 1)} cy={yScale(points[points.length - 1].balance)} r="7" fill="#3b82f6" opacity="0.2" />
    </svg>
  );
}

function UsageDonut({ imageCount, textCount }: { imageCount: number; textCount: number }) {
  const total = imageCount + textCount;
  if (total === 0) return null;

  const r = 40;
  const cx = 50;
  const cy = 50;
  const circumference = 2 * Math.PI * r;
  const imageRatio = imageCount / total;
  const imageDash = circumference * imageRatio;
  const textDash = circumference - imageDash;

  return (
    <svg viewBox="0 0 100 100" className="w-28 h-28">
      {/* Text generation arc */}
      <circle
        cx={cx} cy={cy} r={r}
        fill="none" stroke="#8b5cf6" strokeWidth="10"
        strokeDasharray={`${textDash} ${circumference}`}
        strokeDashoffset={-imageDash}
        transform={`rotate(-90 ${cx} ${cy})`}
        strokeLinecap="round"
      />
      {/* Image generation arc */}
      <circle
        cx={cx} cy={cy} r={r}
        fill="none" stroke="#3b82f6" strokeWidth="10"
        strokeDasharray={`${imageDash} ${circumference}`}
        transform={`rotate(-90 ${cx} ${cy})`}
        strokeLinecap="round"
      />
      <text x={cx} y={cy - 4} textAnchor="middle" className="text-[11px] font-semibold fill-gray-900">{total}</text>
      <text x={cx} y={cy + 9} textAnchor="middle" className="text-[7px] fill-gray-400">total</text>
    </svg>
  );
}

function UsageTab() {
  const [creditsInfo, setCreditsInfo] = useState<CreditsInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadCredits = async () => {
    setIsLoading(true);
    const info = await getCreditsInfo();
    setCreditsInfo(info);
    setIsLoading(false);
  };

  useEffect(() => { loadCredits(); }, []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
      </div>
    );
  }

  if (!creditsInfo) {
    return <div className="text-center py-24 text-sm text-gray-500">クレジット情報を取得できませんでした</div>;
  }

  // Compute usage breakdown
  const txs = creditsInfo.recent_transactions || [];
  const imageUsed = txs.filter((t) => t.transaction_type === 'deduct' && t.amount >= 10).length;
  const textUsed = txs.filter((t) => t.transaction_type === 'deduct' && t.amount < 10).length;
  const totalSpent = txs.filter((t) => t.transaction_type === 'deduct').reduce((s, t) => s + t.amount, 0);

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <h2 className="text-lg font-semibold text-gray-900">Usage</h2>
        <button
          onClick={loadCredits}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700 border border-gray-200 hover:border-gray-300 rounded-md transition-colors"
        >
          <RefreshCw className="w-3 h-3" />
          更新
        </button>
      </div>

      {/* Top row: Balance + Donut */}
      <div className="grid grid-cols-3 gap-4 mb-4">
        {/* Balance card */}
        <div className="col-span-2 bg-white border border-gray-200 rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wider font-medium mb-1">Credit Balance</p>
              <p className="text-4xl font-semibold text-gray-900 tracking-tight tabular-nums">{creditsInfo.balance}</p>
            </div>
            <div className="flex gap-4">
              <div className="text-right">
                <p className="text-xs text-gray-400 mb-0.5">画像生成</p>
                <p className="text-lg font-semibold text-gray-900 tabular-nums">
                  {Math.floor(creditsInfo.balance / creditsInfo.costs.image_generation)}
                  <span className="text-xs font-normal text-gray-400 ml-0.5">回</span>
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs text-gray-400 mb-0.5">テキスト</p>
                <p className="text-lg font-semibold text-gray-900 tabular-nums">
                  {Math.floor(creditsInfo.balance / creditsInfo.costs.text_generation)}
                  <span className="text-xs font-normal text-gray-400 ml-0.5">回</span>
                </p>
              </div>
            </div>
          </div>
          {/* Balance chart */}
          <div className="border-t border-gray-100 pt-4 -mx-2">
            <BalanceChart transactions={txs} />
          </div>
          {/* X-axis labels */}
          {txs.length >= 2 && (
            <div className="flex justify-between px-1 mt-1">
              <span className="text-[10px] text-gray-300 tabular-nums">
                {new Date(txs[txs.length - 1].created_at).toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' })}
              </span>
              <span className="text-[10px] text-gray-300 tabular-nums">
                {new Date(txs[0].created_at).toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' })}
              </span>
            </div>
          )}
        </div>

        {/* Usage breakdown donut */}
        <div className="bg-white border border-gray-200 rounded-xl p-5 flex flex-col items-center justify-center">
          <p className="text-xs text-gray-400 uppercase tracking-wider font-medium mb-3">Breakdown</p>
          <UsageDonut imageCount={imageUsed} textCount={textUsed} />
          <div className="mt-3 space-y-1.5 w-full">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 bg-blue-500 rounded-full" />
                <span className="text-xs text-gray-500">画像生成</span>
              </div>
              <span className="text-xs font-medium text-gray-900 tabular-nums">{imageUsed}回</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 bg-violet-500 rounded-full" />
                <span className="text-xs text-gray-500">テキスト</span>
              </div>
              <span className="text-xs font-medium text-gray-900 tabular-nums">{textUsed}回</span>
            </div>
          </div>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-4 mb-4">
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs text-gray-400 mb-1">合計使用量</p>
          <p className="text-2xl font-semibold text-gray-900 tabular-nums">{totalSpent}<span className="text-sm font-normal text-gray-400 ml-1">cr</span></p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="flex items-center gap-1.5 mb-1">
            <div className="w-2 h-2 bg-blue-500 rounded-full" />
            <p className="text-xs text-gray-400">Image Generation</p>
          </div>
          <p className="text-2xl font-semibold text-gray-900 tabular-nums">{creditsInfo.costs.image_generation}<span className="text-sm font-normal text-gray-400 ml-1">cr/回</span></p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="flex items-center gap-1.5 mb-1">
            <div className="w-2 h-2 bg-violet-500 rounded-full" />
            <p className="text-xs text-gray-400">Text Generation</p>
          </div>
          <p className="text-2xl font-semibold text-gray-900 tabular-nums">{creditsInfo.costs.text_generation}<span className="text-sm font-normal text-gray-400 ml-1">cr/回</span></p>
        </div>
      </div>

      {/* Activity */}
      {txs.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <h3 className="text-sm font-medium text-gray-900">Activity</h3>
            <span className="text-xs text-gray-400 tabular-nums">{txs.length}件</span>
          </div>
          <div className="divide-y divide-gray-50 max-h-[320px] overflow-y-auto">
            {txs.map((tx, i) => (
              <div key={i} className="flex items-center gap-3 px-5 py-3">
                <div className={cn(
                  'w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0',
                  tx.transaction_type === 'deduct' ? 'bg-red-50' : 'bg-emerald-50'
                )}>
                  {tx.transaction_type === 'deduct' ? (
                    <TrendingDown className="w-3.5 h-3.5 text-red-500" />
                  ) : (
                    <Gift className="w-3.5 h-3.5 text-emerald-500" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-900">{tx.description || tx.transaction_type}</p>
                  <p className="text-xs text-gray-400">{new Date(tx.created_at).toLocaleString('ja-JP')}</p>
                </div>
                <div className="text-right">
                  <p className={cn('text-sm font-medium tabular-nums', tx.transaction_type === 'deduct' ? 'text-red-500' : 'text-emerald-500')}>
                    {tx.transaction_type === 'deduct' ? '-' : '+'}{tx.amount}
                  </p>
                  <p className="text-xs text-gray-400 tabular-nums">{tx.balance_after}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="text-xs text-gray-400 mt-4">
        初回登録時に10,000クレジット付与。処理開始時にクレジットが消費されます。
      </p>
    </div>
  );
}

// ============================================
// Tab: Settings
// ============================================

function SettingsTab() {
  const { user } = useAuth();
  const [newEmail, setNewEmail] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);
  const [settingsMessage, setSettingsMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const showSettingsMessage = (type: 'success' | 'error', text: string) => {
    setSettingsMessage({ type, text });
    setTimeout(() => setSettingsMessage(null), 5000);
  };

  const handleEmailChange = async () => {
    if (!newEmail.trim()) return;
    setIsUpdating(true);
    try {
      const { error } = await updateUserEmail(newEmail.trim());
      if (error) {
        showSettingsMessage('error', error.message);
      } else {
        showSettingsMessage('success', '確認メールを送信しました。新しいメールアドレスに届いたリンクをクリックして変更を完了してください。');
        setNewEmail('');
      }
    } catch {
      showSettingsMessage('error', 'エラーが発生しました');
    } finally {
      setIsUpdating(false);
    }
  };

  const handlePasswordChange = async () => {
    if (!newPassword || !confirmNewPassword) return;
    if (newPassword !== confirmNewPassword) {
      showSettingsMessage('error', 'パスワードが一致しません');
      return;
    }
    if (newPassword.length < 6) {
      showSettingsMessage('error', 'パスワードは6文字以上必要です');
      return;
    }
    setIsUpdating(true);
    try {
      const { error } = await updateUserPassword(newPassword);
      if (error) {
        showSettingsMessage('error', error.message);
      } else {
        showSettingsMessage('success', 'パスワードを変更しました');
        setCurrentPassword('');
        setNewPassword('');
        setConfirmNewPassword('');
      }
    } catch {
      showSettingsMessage('error', 'エラーが発生しました');
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div>
      <h2 className="text-lg font-semibold text-gray-900 mb-8">Settings</h2>

      {/* Message */}
      {settingsMessage && (
        <div className={cn(
          'mb-6 flex items-start gap-2 px-4 py-3 rounded-lg text-sm',
          settingsMessage.type === 'success' ? 'bg-emerald-50 border border-emerald-200 text-emerald-700' : 'bg-red-50 border border-red-200 text-red-700'
        )}>
          {settingsMessage.type === 'success' ? <Check className="w-4 h-4 flex-shrink-0 mt-0.5" /> : <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />}
          {settingsMessage.text}
        </div>
      )}

      {/* Email Change */}
      <div className="bg-white border border-gray-200 rounded-xl mb-6">
        <div className="px-6 py-4 border-b border-gray-100">
          <h3 className="text-sm font-medium text-gray-900">メールアドレス</h3>
          <p className="text-xs text-gray-400 mt-0.5">現在: {user?.email}</p>
        </div>
        <div className="p-6">
          <div className="flex items-center gap-3">
            <div className="relative flex-1">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-300" />
              <input
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="新しいメールアドレス"
                className="w-full pl-10 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-300"
              />
            </div>
            <button
              onClick={handleEmailChange}
              disabled={isUpdating || !newEmail.trim()}
              className="px-4 py-2 text-sm font-medium text-white bg-[#0d0d0d] hover:bg-[#1a1a1a] disabled:opacity-40 rounded-lg transition-colors flex items-center gap-1.5"
            >
              {isUpdating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
              変更
            </button>
          </div>
          <p className="text-xs text-gray-400 mt-2">変更後、新しいメールアドレスに確認メールが届きます</p>
        </div>
      </div>

      {/* Password Change */}
      <div className="bg-white border border-gray-200 rounded-xl mb-6">
        <div className="px-6 py-4 border-b border-gray-100">
          <h3 className="text-sm font-medium text-gray-900">パスワード変更</h3>
        </div>
        <div className="p-6 space-y-3">
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-300" />
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="新しいパスワード（6文字以上）"
              className="w-full pl-10 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-300"
              autoComplete="new-password"
            />
          </div>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-300" />
            <input
              type="password"
              value={confirmNewPassword}
              onChange={(e) => setConfirmNewPassword(e.target.value)}
              placeholder="新しいパスワード（確認）"
              className="w-full pl-10 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-300"
              autoComplete="new-password"
            />
          </div>
          <button
            onClick={handlePasswordChange}
            disabled={isUpdating || !newPassword || !confirmNewPassword}
            className="px-4 py-2 text-sm font-medium text-white bg-[#0d0d0d] hover:bg-[#1a1a1a] disabled:opacity-40 rounded-lg transition-colors flex items-center gap-1.5"
          >
            {isUpdating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
            パスワードを変更
          </button>
        </div>
      </div>

      {/* API Configuration */}
      <div className="bg-white border border-gray-200 rounded-xl mb-6">
        <div className="px-6 py-4 border-b border-gray-100">
          <h3 className="text-sm font-medium text-gray-900">API設定</h3>
        </div>
        <div className="p-6">
          <div className="flex items-start gap-3 p-3 bg-emerald-50/50 border border-emerald-100 rounded-lg">
            <Check className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-medium text-emerald-700">サーバー管理のAPIキーを使用中</p>
              <p className="text-xs text-emerald-600 mt-0.5">
                APIキーはサーバー側で安全に管理されています。個別の設定は不要です。
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Models */}
      <div className="bg-white border border-gray-200 rounded-xl">
        <div className="px-6 py-4 border-b border-gray-100">
          <h3 className="text-sm font-medium text-gray-900">Models</h3>
          <p className="text-xs text-gray-400 mt-0.5">使用中のAIモデルと料金</p>
        </div>
        <div className="divide-y divide-gray-50">
          <div className="px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-blue-50 rounded-lg flex items-center justify-center">
                <Zap className="w-4 h-4 text-blue-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900">Gemini 3.0 Pro</p>
                <p className="text-xs text-gray-400">画像生成・インペイント</p>
              </div>
            </div>
            <span className="text-xs text-gray-400 font-mono tabular-nums">13cr / 回</span>
          </div>
          <div className="px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-violet-50 rounded-lg flex items-center justify-center">
                <Zap className="w-4 h-4 text-violet-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900">Gemini 2.0 Flash</p>
                <p className="text-xs text-gray-400">OCR・テキスト候補生成</p>
              </div>
            </div>
            <span className="text-xs text-gray-400 font-mono tabular-nums">1cr / 回</span>
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
  const sections: { title: string; content?: string; items?: string[]; subsections?: { title: string; content?: string; items?: string[] }[] }[] = [
    {
      title: '第1条（サービス概要）',
      content: 'オタスケPDF（以下「本サービス」）は、PDF・PPTXファイルのスライドに含まれるテキストや画像の修正を支援するAIツールです。本サービスはGoogle Gemini APIを活用し、画像のインペイント修正、テキストのOCR（光学文字認識）および候補生成を行います。本サービスの利用にあたり、ユーザーは本規約のすべてに同意したものとみなします。',
    },
    {
      title: '第2条（定義）',
      items: [
        '「ユーザー」とは、本サービスにアカウント登録を行い、本サービスを利用するすべての個人または法人を指します。',
        '「クレジット」とは、本サービス内のAPI機能を利用するために消費される内部通貨単位を指します。',
        '「コンテンツ」とは、ユーザーが本サービスにアップロードまたは生成したファイル、画像、テキストその他一切のデータを指します。',
        '「AI生成物」とは、本サービスのAI機能により生成された画像、テキストその他の成果物を指します。',
      ],
    },
    {
      title: '第3条（アカウント登録・管理）',
      items: [
        'ユーザーは正確かつ最新の情報を提供してアカウント登録を行うものとします。',
        'アカウントの認証情報（パスワード等）の管理はユーザーの責任とし、第三者への譲渡・貸与はできません。',
        'アカウントの不正利用により生じた損害について、運営者は一切の責任を負いません。',
        '1人のユーザーが複数のアカウントを作成し、初回クレジットを不正に取得する行為は禁止します。',
      ],
    },
    {
      title: '第4条（クレジットシステム）',
      subsections: [
        {
          title: '4-1. クレジットの付与',
          items: [
            '新規アカウント登録時に10,000クレジットが無償で付与されます。',
            '運営者は、キャンペーン等により追加クレジットを付与する場合があります。',
            'クレジットの付与条件・数量は、運営者の裁量により予告なく変更されることがあります。',
          ],
        },
        {
          title: '4-2. クレジットの消費',
          items: [
            '画像生成（AI修正・インペイント）: 13クレジット / 回',
            'テキスト生成（OCR・候補生成）: 1クレジット / 回',
            '一括編集: 対象ページ数 × 13クレジット / 回',
            'クレジットは各API呼び出しの実行前に即時差し引かれます。',
          ],
        },
        {
          title: '4-3. 課金ポリシー',
          content: '本サービスは生成AI APIを利用したインフラ型サービスです。課金は成果保証型ではなく、計算資源利用型（API処理実行単位課金）となります。',
          items: [
            '処理が開始された時点でクレジットが消費されます。',
            '生成結果の成功・失敗、品質満足度に関わらず、API実行分のクレジットは消費されます。',
            '通信エラー・再試行が発生した場合も、API呼び出しごとに課金対象となります。',
            '同一リクエストID（request_id）による重複課金は発生しません。重複検知された場合、2回目以降の課金は自動的にブロックされます。',
          ],
        },
        {
          title: '4-4. 再生成について',
          items: [
            'ユーザーが再生成を実行した場合、新規API処理として扱われ、別途クレジットが消費されます。',
            '同一内容の再実行であっても、別処理として課金対象となります。',
          ],
        },
        {
          title: '4-5. 例外的な補填',
          items: [
            '当社システムの重大な不具合により明らかに処理が完了していない場合のみ、個別判断で補填対応を行う場合があります。',
            '補填の有無および内容は運営者の裁量により決定され、ユーザーに対する補填義務を負うものではありません。',
          ],
        },
        {
          title: '4-6. クレジットの譲渡・換金',
          items: [
            'クレジットの第三者への譲渡・売買・交換はできません。',
            'クレジットの現金・その他の通貨への換金はできません。',
            'アカウント削除時に残存するクレジットは失効します。補填・払い戻しは行いません。',
          ],
        },
      ],
    },
    {
      title: '第5条（API利用・外部サービスとの連携）',
      items: [
        '本サービスはサーバー側でGoogle Gemini APIを使用しています。Google Gemini APIの利用にはGoogleの利用規約が別途適用されます。',
        'ユーザーが自身のAPIキーを設定した場合、当該キーはブラウザのローカルストレージにのみ保存され、運営者のサーバーには一切送信されません。',
        'ユーザー自身のAPIキー使用時の料金はユーザーが直接Googleに支払うものとし、運営者は一切関与しません。',
        '外部APIの仕様変更・障害・サービス終了等により本サービスの機能が制限または停止した場合、運営者は責任を負いません。',
      ],
    },
    {
      title: '第6条（データの取り扱い・プライバシー）',
      subsections: [
        {
          title: '6-1. データの保存',
          items: [
            'アップロードされたファイル（PDF・PPTX）および変換後の画像データは、ユーザーのブラウザのIndexedDBにローカル保存されます。',
            'ログイン状態のユーザーのプロジェクトメタデータ（ファイル名、ページ情報、修正履歴等）は、Supabaseクラウドに同期されます。',
            '画像データのクラウド保存時には暗号化が施されます。',
          ],
        },
        {
          title: '6-2. データのアクセス制御',
          items: [
            'ユーザーデータには行レベルセキュリティ（RLS）が適用され、本人以外のユーザーからはアクセスできません。',
            '運営者は、法令に基づく開示請求またはサービス運営上必要な場合を除き、ユーザーデータにアクセスしません。',
          ],
        },
        {
          title: '6-3. データの削除',
          items: [
            'プロジェクト削除時には、ローカル（IndexedDB）およびクラウド（Supabase Storage・Database）の両方からデータが完全に削除されます。',
            'アカウント削除を希望する場合は運営者にご連絡ください。アカウントに紐づくすべてのデータが削除されます。',
            '削除されたデータの復元はできません。',
          ],
        },
        {
          title: '6-4. AI処理におけるデータ利用',
          items: [
            'AI修正・OCR処理のため、ユーザーがアップロードした画像はGoogle Gemini APIに送信されます。',
            '送信されたデータのGoogle側での取り扱いは、Googleのプライバシーポリシーおよび利用規約に準じます。',
            '運営者は、ユーザーのコンテンツをAIモデルの学習データとして使用しません。',
          ],
        },
      ],
    },
    {
      title: '第7条（知的財産権）',
      items: [
        'ユーザーがアップロードしたコンテンツの著作権はユーザーに帰属します。',
        'AI生成物の著作権については、適用される法令に従います。現行法上、AI生成物に著作権が認められない場合があることをユーザーは了承します。',
        '本サービスのUI・ソースコード・ロゴ等の著作権は運営者に帰属します。',
        'ユーザーは、第三者の著作権・商標権その他の知的財産権を侵害するコンテンツをアップロードしてはなりません。',
      ],
    },
    {
      title: '第8条（禁止事項）',
      content: 'ユーザーは以下の行為を行ってはなりません。',
      items: [
        '複数アカウントの作成によるクレジットの不正取得',
        '自動化ツール（Bot・スクリプト等）による大量リクエストの送信',
        '本サービスのリバースエンジニアリング、逆コンパイルまたは逆アセンブル',
        'APIエンドポイントへの不正アクセスまたは脆弱性の悪用',
        '違法・公序良俗に反するコンテンツの処理（児童ポルノ、ヘイトスピーチ、詐欺目的の文書偽造等）',
        '第三者の権利（著作権・肖像権・プライバシー権等）を侵害するコンテンツの処理',
        '本サービスを利用した営利目的の無断再配布・転売',
        'その他、運営者が不適切と判断する行為',
      ],
    },
    {
      title: '第9条（サービスの中断・変更・終了）',
      items: [
        '運営者は、以下の場合に本サービスの全部または一部を事前の通知なく中断することがあります: システム保守、天災・障害等の不可抗力、セキュリティ上の緊急対応。',
        '運営者は、本サービスの機能・仕様・料金体系を予告なく変更する権利を有します。',
        '運営者は、運営上の判断により本サービスを終了する権利を有します。サービス終了時は、可能な限り事前に通知を行い、ユーザーがデータをエクスポートするための合理的な猶予期間を設けます。',
      ],
    },
    {
      title: '第10条（免責事項・保証の否認）',
      items: [
        '本サービスは「現状のまま（AS IS）」で提供され、明示・黙示を問わず、商品性、特定目的への適合性、正確性、完全性、信頼性について一切の保証をしません。',
        'AI生成結果の正確性・品質・適合性は保証されません。重要な文書への適用時には必ず人間による確認を行ってください。',
        '本サービスの利用または利用不能により生じた直接的・間接的・偶発的・特別・懲罰的損害について、運営者は一切の責任を負いません。',
        '外部サービス（Google Gemini API、Supabase等）の障害に起因する本サービスの不具合について、運営者は責任を負いません。',
        'ユーザー間またはユーザーと第三者間の紛争について、運営者は一切関与せず責任を負いません。',
      ],
    },
    {
      title: '第11条（アカウントの停止・削除）',
      items: [
        '運営者は、ユーザーが本規約に違反した場合、または違反のおそれがあると判断した場合、事前通知なくアカウントの利用を停止または削除できます。',
        '停止・削除時に残存するクレジットは失効します。補填・払い戻しは行いません。',
        '運営者の判断に対する異議申し立ては受け付けますが、最終的な判断は運営者に帰属します。',
      ],
    },
    {
      title: '第12条（損害賠償の制限）',
      content: '運営者がユーザーに対して損害賠償責任を負う場合であっても、その賠償額は当該ユーザーが過去12か月間に本サービスに対して支払った総額を上限とします。無償利用のユーザーに対する賠償額の上限は0円とします。',
    },
    {
      title: '第13条（規約の変更）',
      items: [
        '運営者は、本規約を随時変更できるものとします。',
        '重要な変更を行う場合は、本サービス上での告知またはメール等により通知します。',
        '変更後に本サービスを継続利用した場合、変更後の規約に同意したものとみなします。',
      ],
    },
    {
      title: '第14条（準拠法・管轄裁判所）',
      items: [
        '本規約は日本法に準拠し、日本法に従って解釈されます。',
        '本サービスに関する一切の紛争は、東京地方裁判所を第一審の専属的合意管轄裁判所とします。',
      ],
    },
    {
      title: '第15条（連絡先）',
      content: '本規約に関するお問い合わせは、本サービス内のお問い合わせフォームまたは運営者が指定する連絡先までご連絡ください。',
    },
  ];

  return (
    <div>
      <h2 className="text-lg font-semibold text-gray-900 mb-2">利用規約</h2>
      <p className="text-xs text-gray-400 mb-6">本サービスをご利用いただく前に、以下の利用規約を必ずお読みください。</p>

      <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100">
        {sections.map((section, i) => (
          <div key={i} className="px-6 py-5">
            <h3 className="text-sm font-semibold text-gray-900 mb-2">{section.title}</h3>
            {section.content && (
              <p className="text-sm text-gray-500 leading-relaxed">{section.content}</p>
            )}
            {section.items && (
              <ul className="space-y-1.5 mt-1">
                {section.items.map((item, j) => (
                  <li key={j} className="text-sm text-gray-500 flex items-start gap-2">
                    <span className="text-gray-300 mt-1.5 flex-shrink-0">•</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            )}
            {section.subsections && (
              <div className="mt-3 space-y-4">
                {section.subsections.map((sub, k) => (
                  <div key={k} className="pl-3 border-l-2 border-gray-100">
                    <h4 className="text-xs font-semibold text-gray-700 mb-1.5">{sub.title}</h4>
                    {sub.content && (
                      <p className="text-sm text-gray-500 leading-relaxed">{sub.content}</p>
                    )}
                    {sub.items && (
                      <ul className="space-y-1">
                        {sub.items.map((item, l) => (
                          <li key={l} className="text-sm text-gray-500 flex items-start gap-2">
                            <span className="text-gray-300 mt-1.5 flex-shrink-0">-</span>
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      <p className="text-xs text-gray-400 mt-4 text-right">制定日: 2026年2月12日 ｜ 最終更新: 2026年2月12日</p>
    </div>
  );
}

// ============================================
// Main Page
// ============================================

type TabId = 'home' | 'usage' | 'settings' | 'terms' | 'admin';

const tabs: { id: TabId; label: string; icon: typeof Home }[] = [
  { id: 'home', label: 'ホーム', icon: Home },
  { id: 'usage', label: 'Usage', icon: BarChart3 },
  { id: 'settings', label: 'Settings', icon: Settings },
  { id: 'terms', label: 'Terms', icon: FileCheck },
];

export default function HomePage() {
  const router = useRouter();
  const { user, isLoading: authLoading, signOut } = useAuth();
  const allProjects = useAppStore((state) => state.projects);
  const projects = useMemo(
    () => user ? allProjects.filter((p) => p.userId === user.id) : allProjects,
    [allProjects, user]
  );
  const deleteProject = useAppStore((state) => state.deleteProject);
  const [isLoadingProjects, setIsLoadingProjects] = useState(true);
  const [activeTab, setActiveTab] = useState<TabId>('home');
  const [creditBalance, setCreditBalance] = useState<number | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  useSync(user?.id);

  useEffect(() => { setIsLoadingProjects(false); }, []);

  useEffect(() => {
    if (!user) { setIsAdmin(false); return; }
    getCreditsInfo().then((info) => { if (info) setCreditBalance(info.balance); });
    checkAdminStatus().then(({ isAdmin }) => setIsAdmin(isAdmin));
  }, [user]);

  const handleUploadComplete = (projectId: string) => router.push(`/projects/${projectId}`);

  const handleDeleteProject = (projectId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('このプロジェクトを削除しますか？')) deleteProject(projectId);
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <Loader2 className="w-5 h-5 text-gray-300 animate-spin" />
      </div>
    );
  }

  if (!user) {
    return <AuthForm onSuccess={() => {}} />;
  }

  return (
    <div className="min-h-screen bg-[#fafafa] flex">
      {/* Sidebar */}
      <aside className="w-[220px] bg-white border-r border-gray-200 flex flex-col flex-shrink-0">
        {/* Logo */}
        <div className="px-4 py-5">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-[#0d0d0d] rounded-lg flex items-center justify-center">
              <span className="text-sm font-bold text-white">助</span>
            </div>
            <span className="text-sm font-medium text-gray-900 tracking-tight">オタスケPDF</span>
          </div>
        </div>

        {/* Credit Badge */}
        <div className="px-3 mb-2">
          <button
            onClick={() => setActiveTab('usage')}
            className="w-full flex items-center gap-2 px-3 py-2 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-lg transition-colors"
          >
            <Coins className="w-3.5 h-3.5 text-emerald-500" />
            <span className="text-xs text-gray-500">Credits</span>
            <span className="ml-auto text-sm font-semibold text-gray-900 tabular-nums">
              {creditBalance !== null ? creditBalance : '—'}
            </span>
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-2 space-y-0.5">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] transition-colors',
                  isActive
                    ? 'bg-gray-100 text-gray-900 font-medium'
                    : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50'
                )}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
          {isAdmin && (
            <button
              onClick={() => setActiveTab('admin')}
              className={cn(
                'w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] transition-colors',
                activeTab === 'admin'
                  ? 'bg-gray-100 text-gray-900 font-medium'
                  : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50'
              )}
            >
              <Shield className="w-4 h-4" />
              Admin
            </button>
          )}
        </nav>

        {/* User */}
        <div className="p-3 border-t border-gray-200">
          <div className="px-3 py-1.5">
            <p className="text-[11px] text-gray-400 truncate">{user.email}</p>
          </div>
          <button
            onClick={() => signOut()}
            className="w-full flex items-center gap-2 px-3 py-2 text-[13px] text-gray-400 hover:text-gray-600 hover:bg-gray-50 rounded-lg transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" />
            Log out
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-5xl mx-auto px-8 py-8">
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
          {activeTab === 'admin' && isAdmin && <AdminTab />}
        </div>
      </main>
    </div>
  );
}
