'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Users, BarChart3, Activity, Loader2, RefreshCw,
  Plus, Minus, Search, Check, AlertCircle, X,
  Ban, ShieldCheck, Key, ChevronLeft, Eye,
  Settings2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  fetchAdminUsers, fetchUsageStats, fetchRecentActivity,
  fetchUserDetail, adjustCredits, banUser, resetPassword,
  type AdminUser, type UsageStats, type RecentActivity, type UserDetail,
} from '@/lib/admin';

type SubTab = 'users' | 'stats' | 'activity' | 'settings';

export function AdminTab() {
  const [subTab, setSubTab] = useState<SubTab>('users');

  const subTabs: { id: SubTab; label: string; icon: typeof Users }[] = [
    { id: 'users', label: 'ユーザー管理', icon: Users },
    { id: 'stats', label: '統計', icon: BarChart3 },
    { id: 'activity', label: 'アクティビティ', icon: Activity },
    { id: 'settings', label: 'グローバル設定', icon: Settings2 },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        {subTabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setSubTab(tab.id)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-colors',
              subTab === tab.id
                ? 'bg-[#0d0d0d] text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            )}
          >
            <tab.icon className="w-3.5 h-3.5" />
            {tab.label}
          </button>
        ))}
      </div>

      {subTab === 'users' && <UsersPanel />}
      {subTab === 'stats' && <StatsPanel />}
      {subTab === 'activity' && <ActivityPanel />}
      {subTab === 'settings' && <SettingsPanel />}
    </div>
  );
}

// ============================================
// Users Panel (ユーザー管理)
// ============================================
function UsersPanel() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchAdminUsers();
      setUsers(data.users);
    } catch (err) {
      console.error('Failed to load users:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  const filteredUsers = users.filter((u) =>
    u.email.toLowerCase().includes(search.toLowerCase())
  );

  // User detail view
  if (selectedUserId) {
    return (
      <UserDetailPanel
        userId={selectedUserId}
        onBack={() => { setSelectedUserId(null); loadUsers(); }}
      />
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          placeholder="メールアドレスで検索..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-300"
        />
      </div>

      {/* User table */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-gray-500 text-xs">
              <th className="text-left px-4 py-2.5 font-medium">ステータス</th>
              <th className="text-left px-4 py-2.5 font-medium">メール</th>
              <th className="text-right px-4 py-2.5 font-medium">残高</th>
              <th className="text-right px-4 py-2.5 font-medium">画像</th>
              <th className="text-right px-4 py-2.5 font-medium">テキスト</th>
              <th className="text-right px-4 py-2.5 font-medium">登録日</th>
              <th className="text-center px-4 py-2.5 font-medium">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {filteredUsers.map((user) => (
              <tr key={user.id} className="hover:bg-gray-50">
                <td className="px-4 py-2.5">
                  {user.is_banned ? (
                    <span className="inline-flex px-1.5 py-0.5 rounded text-xs font-medium bg-red-50 text-red-700">
                      BAN
                    </span>
                  ) : (
                    <span className="inline-flex px-1.5 py-0.5 rounded text-xs font-medium bg-emerald-50 text-emerald-700">
                      有効
                    </span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-gray-900">{user.email}</td>
                <td className="px-4 py-2.5 text-right tabular-nums font-medium">
                  {user.balance}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-gray-500">
                  {user.image_count}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-gray-500">
                  {user.text_count}
                </td>
                <td className="px-4 py-2.5 text-right text-gray-400 text-xs">
                  {new Date(user.created_at).toLocaleDateString('ja-JP')}
                </td>
                <td className="px-4 py-2.5 text-center">
                  <button
                    onClick={() => setSelectedUserId(user.id)}
                    className="inline-flex items-center gap-1 px-2 py-1 text-xs text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded transition-colors"
                  >
                    <Eye className="w-3 h-3" />
                    詳細
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filteredUsers.length === 0 && (
          <div className="text-center py-8 text-gray-400 text-sm">
            ユーザーが見つかりません
          </div>
        )}
      </div>

      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-400">{filteredUsers.length}件</p>
        <button onClick={loadUsers} className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600">
          <RefreshCw className="w-3 h-3" />
          更新
        </button>
      </div>
    </div>
  );
}

// ============================================
// User Detail Panel (個別ユーザー詳細)
// ============================================
function UserDetailPanel({ userId, onBack }: { userId: string; onBack: () => void }) {
  const [detail, setDetail] = useState<UserDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Credit adjustment
  const [adjustAmount, setAdjustAmount] = useState('');
  const [adjustDesc, setAdjustDesc] = useState('');

  // Password reset
  const [newPassword, setNewPassword] = useState('');
  const [showPasswordForm, setShowPasswordForm] = useState(false);

  const loadDetail = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchUserDetail(userId);
      setDetail(data);
    } catch (err) {
      console.error('Failed to load user detail:', err);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { loadDetail(); }, [loadDetail]);

  const showMessage = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 3000);
  };

  const handleAdjust = async (isAdd: boolean) => {
    if (!adjustAmount) return;
    const amount = parseInt(adjustAmount) * (isAdd ? 1 : -1);
    if (isNaN(amount) || amount === 0) return;

    setActionLoading(true);
    try {
      const result = await adjustCredits(userId, amount, adjustDesc || `管理者による${isAdd ? '付与' : '減算'}`);
      if (result.success) {
        showMessage('success', `${isAdd ? '+' : '-'}${Math.abs(amount)}cr → 残高: ${result.balance_after}cr`);
        setAdjustAmount('');
        setAdjustDesc('');
        loadDetail();
      } else {
        showMessage('error', result.error || 'エラー');
      }
    } catch (err) {
      showMessage('error', err instanceof Error ? err.message : 'エラー');
    } finally {
      setActionLoading(false);
    }
  };

  const handleBan = async (ban: boolean) => {
    if (!confirm(ban ? 'このユーザーをBANしますか？' : 'BAN解除しますか？')) return;
    setActionLoading(true);
    try {
      await banUser(userId, ban);
      showMessage('success', ban ? 'BANしました' : 'BAN解除しました');
      loadDetail();
    } catch (err) {
      showMessage('error', err instanceof Error ? err.message : 'エラー');
    } finally {
      setActionLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (!newPassword || newPassword.length < 6) {
      showMessage('error', 'パスワードは6文字以上必要です');
      return;
    }
    if (!confirm('パスワードを強制変更しますか？')) return;
    setActionLoading(true);
    try {
      await resetPassword(userId, newPassword);
      showMessage('success', 'パスワードを変更しました');
      setNewPassword('');
      setShowPasswordForm(false);
    } catch (err) {
      showMessage('error', err instanceof Error ? err.message : 'エラー');
    } finally {
      setActionLoading(false);
    }
  };

  if (loading || !detail) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
      </div>
    );
  }

  const isBanned = detail.user.banned_until && new Date(detail.user.banned_until) > new Date();

  // Compute stats from requests
  const imageCount = detail.requests.filter(r => r.request_type === 'image_generation').length;
  const textCount = detail.requests.filter(r => r.request_type === 'text_generation').length;
  const totalSpent = detail.transactions
    .filter(tx => tx.transaction_type === 'deduct')
    .reduce((sum, tx) => sum + tx.amount, 0);

  return (
    <div className="space-y-4">
      {/* ===== Header ===== */}
      <div className="flex items-center gap-3 pb-3 border-b border-gray-200">
        <button onClick={onBack} className="p-1 hover:bg-gray-100 rounded-lg transition-colors">
          <ChevronLeft className="w-4 h-4 text-gray-500" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-medium text-gray-900 truncate">{detail.user.email}</h3>
            {isBanned ? (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-50 text-red-600">BAN</span>
            ) : (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-50 text-emerald-600">有効</span>
            )}
          </div>
          <p className="text-xs text-gray-400 mt-0.5">
            {new Date(detail.user.created_at).toLocaleDateString('ja-JP')} 登録 &middot; {detail.user.id.substring(0, 8)}
          </p>
        </div>
        <div className="text-right">
          <div className="text-xl font-semibold tabular-nums text-gray-900">{detail.balance.toLocaleString()}<span className="text-xs font-normal text-gray-400 ml-0.5">cr</span></div>
        </div>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-gray-50 rounded-lg px-3 py-2">
          <p className="text-xs text-gray-400">画像生成</p>
          <p className="text-lg font-semibold tabular-nums text-gray-900">{imageCount}<span className="text-xs font-normal text-gray-400 ml-0.5">回</span></p>
        </div>
        <div className="bg-gray-50 rounded-lg px-3 py-2">
          <p className="text-xs text-gray-400">テキスト生成</p>
          <p className="text-lg font-semibold tabular-nums text-gray-900">{textCount}<span className="text-xs font-normal text-gray-400 ml-0.5">回</span></p>
        </div>
        <div className="bg-gray-50 rounded-lg px-3 py-2">
          <p className="text-xs text-gray-400">総消費</p>
          <p className="text-lg font-semibold tabular-nums text-gray-900">{totalSpent}<span className="text-xs font-normal text-gray-400 ml-0.5">cr</span></p>
        </div>
      </div>

      {/* Toast Message */}
      {message && (
        <div className={cn(
          'flex items-center gap-2 px-3 py-2 rounded-lg text-sm',
          message.type === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
        )}>
          {message.type === 'success' ? <Check className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          {message.text}
        </div>
      )}

      {/* ===== Actions ===== */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        {/* Credit adjustment */}
        <div className="px-4 py-3 border-b border-gray-100">
          <h4 className="text-xs font-medium text-gray-500">クレジット操作</h4>
          <div className="mt-2 flex items-center gap-2">
            <input
              type="number"
              placeholder="数量"
              value={adjustAmount}
              onChange={(e) => setAdjustAmount(e.target.value)}
              className="w-24 px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-300 tabular-nums"
              min="1"
            />
            <input
              type="text"
              placeholder="理由（任意）"
              value={adjustDesc}
              onChange={(e) => setAdjustDesc(e.target.value)}
              className="flex-1 px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-300"
            />
            <button
              onClick={() => handleAdjust(true)}
              disabled={actionLoading || !adjustAmount}
              className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium bg-[#0d0d0d] text-white rounded-lg hover:bg-gray-800 disabled:opacity-40 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" /> 付与
            </button>
            <button
              onClick={() => handleAdjust(false)}
              disabled={actionLoading || !adjustAmount}
              className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-40 transition-colors"
            >
              <Minus className="w-3.5 h-3.5" /> 減算
            </button>
          </div>
        </div>

        {/* Account management */}
        <div className="px-4 py-3 flex items-center gap-2">
          <span className="text-xs font-medium text-gray-500 mr-auto">アカウント管理</span>
          {showPasswordForm ? (
            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="新しいパスワード（6文字以上）"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-56 px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-300 font-mono"
              />
              <button
                onClick={handleResetPassword}
                disabled={actionLoading || !newPassword}
                className="px-3 py-1.5 text-sm font-medium bg-[#0d0d0d] text-white rounded-lg hover:bg-gray-800 disabled:opacity-40 transition-colors"
              >
                設定
              </button>
              <button
                onClick={() => { setShowPasswordForm(false); setNewPassword(''); }}
                className="p-1 text-gray-400 hover:text-gray-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <>
              {isBanned ? (
                <button
                  onClick={() => handleBan(false)}
                  disabled={actionLoading}
                  className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium bg-[#0d0d0d] text-white rounded-lg hover:bg-gray-800 disabled:opacity-40 transition-colors"
                >
                  <ShieldCheck className="w-3.5 h-3.5" /> BAN解除
                </button>
              ) : (
                <button
                  onClick={() => handleBan(true)}
                  disabled={actionLoading}
                  className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50 disabled:opacity-40 transition-colors"
                >
                  <Ban className="w-3.5 h-3.5" /> BAN
                </button>
              )}
              <button
                onClick={() => setShowPasswordForm(true)}
                className="flex items-center gap-1 px-3 py-1.5 text-sm border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <Key className="w-3.5 h-3.5" /> パスワード変更
              </button>
            </>
          )}
        </div>
      </div>

      {/* ===== Transaction History ===== */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50 border-b border-gray-100">
          <h4 className="text-xs font-medium text-gray-500">クレジット履歴</h4>
          <span className="text-[11px] text-gray-400 tabular-nums">{detail.transactions.length}件</span>
        </div>
        <div className="divide-y divide-gray-50 max-h-[260px] overflow-y-auto">
          {detail.transactions.length === 0 ? (
            <div className="text-center py-8 text-gray-400 text-xs">履歴なし</div>
          ) : (
            detail.transactions.map((tx, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 transition-colors">
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-gray-700 truncate">{tx.description || tx.transaction_type}</p>
                  <p className="text-[10px] text-gray-400">
                    {new Date(tx.created_at).toLocaleString('ja-JP')}
                  </p>
                </div>
                <div className="text-right">
                  <p className={cn('text-xs font-medium tabular-nums', tx.transaction_type === 'deduct' ? 'text-red-500' : 'text-emerald-600')}>
                    {tx.transaction_type === 'deduct' ? '-' : '+'}{tx.amount}
                  </p>
                  <p className="text-[10px] text-gray-400 tabular-nums">{tx.balance_after}</p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* ===== API Request History ===== */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50 border-b border-gray-100">
          <h4 className="text-xs font-medium text-gray-500">API利用履歴</h4>
          <span className="text-[11px] text-gray-400 tabular-nums">{detail.requests.length}件</span>
        </div>
        <div className="divide-y divide-gray-50 max-h-[260px] overflow-y-auto">
          {detail.requests.length === 0 ? (
            <div className="text-center py-8 text-gray-400 text-xs">履歴なし</div>
          ) : (
            detail.requests.map((req, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 transition-colors">
                <span className={cn(
                  'inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium',
                  req.request_type === 'image_generation' ? 'bg-purple-50 text-purple-700' : 'bg-blue-50 text-blue-700'
                )}>
                  {req.request_type === 'image_generation' ? '画像' : 'テキスト'}
                </span>
                <span className={cn(
                  'inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium',
                  req.status === 'completed' ? 'bg-emerald-50 text-emerald-700' :
                  req.status === 'failed' ? 'bg-red-50 text-red-700' : 'bg-yellow-50 text-yellow-700'
                )}>
                  {req.status === 'completed' ? '完了' : req.status === 'failed' ? '失敗' : req.status}
                </span>
                <div className="flex-1" />
                <span className="text-xs text-gray-500 tabular-nums">{req.cost}cr</span>
                <span className="text-[10px] text-gray-400">
                  {new Date(req.created_at).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================
// Stats Panel
// ============================================
function StatsPanel() {
  const [stats, setStats] = useState<UsageStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchUsageStats()
      .then(setStats)
      .catch((err) => console.error('Failed to load stats:', err))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
      </div>
    );
  }

  if (!stats) {
    return <div className="text-center py-8 text-gray-400 text-sm">統計を取得できませんでした</div>;
  }

  const cards = [
    { label: '総ユーザー数', value: stats.totalUsers, suffix: '人' },
    { label: '総消費クレジット', value: stats.totalCreditsConsumed, suffix: 'cr' },
    { label: '総API呼出数', value: stats.totalApiCalls, suffix: '回' },
    { label: '成功率', value: Math.round(stats.successRate * 100), suffix: '%' },
    { label: '画像生成', value: stats.imageGenerations, suffix: '回' },
    { label: 'テキスト生成', value: stats.textGenerations, suffix: '回' },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
      {cards.map((card) => (
        <div key={card.label} className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs text-gray-400 mb-1">{card.label}</p>
          <p className="text-2xl font-semibold tabular-nums text-gray-900">
            {card.value.toLocaleString()}
            <span className="text-sm font-normal text-gray-400 ml-0.5">{card.suffix}</span>
          </p>
        </div>
      ))}
    </div>
  );
}

// ============================================
// Activity Panel
// ============================================
function ActivityPanel() {
  const [activity, setActivity] = useState<RecentActivity[]>([]);
  const [loading, setLoading] = useState(true);

  const loadActivity = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchRecentActivity(50);
      setActivity(data);
    } catch (err) {
      console.error('Failed to load activity:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadActivity(); }, [loadActivity]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-gray-500 text-xs">
              <th className="text-left px-4 py-2.5 font-medium">時刻</th>
              <th className="text-left px-4 py-2.5 font-medium">ユーザー</th>
              <th className="text-left px-4 py-2.5 font-medium">種別</th>
              <th className="text-left px-4 py-2.5 font-medium">ステータス</th>
              <th className="text-right px-4 py-2.5 font-medium">コスト</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {activity.map((item) => (
              <tr key={item.request_id} className="hover:bg-gray-50">
                <td className="px-4 py-2.5 text-gray-500 text-xs whitespace-nowrap">
                  {new Date(item.created_at).toLocaleString('ja-JP', {
                    month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit',
                  })}
                </td>
                <td className="px-4 py-2.5 text-gray-900 text-xs truncate max-w-[160px]">
                  {item.user_email}
                </td>
                <td className="px-4 py-2.5">
                  <span className={cn(
                    'inline-flex px-1.5 py-0.5 rounded text-xs font-medium',
                    item.request_type === 'image_generation'
                      ? 'bg-purple-50 text-purple-700'
                      : 'bg-blue-50 text-blue-700'
                  )}>
                    {item.request_type === 'image_generation' ? '画像' : 'テキスト'}
                  </span>
                </td>
                <td className="px-4 py-2.5">
                  <span className={cn(
                    'inline-flex px-1.5 py-0.5 rounded text-xs font-medium',
                    item.status === 'completed' ? 'bg-emerald-50 text-emerald-700' :
                    item.status === 'failed' ? 'bg-red-50 text-red-700' :
                    'bg-yellow-50 text-yellow-700'
                  )}>
                    {item.status === 'completed' ? '完了' :
                     item.status === 'failed' ? '失敗' :
                     item.status === 'processing' ? '処理中' : item.status}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-gray-500">
                  {item.cost}cr
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {activity.length === 0 && (
          <div className="text-center py-8 text-gray-400 text-sm">
            アクティビティがありません
          </div>
        )}
      </div>

      <div className="flex justify-end">
        <button onClick={loadActivity} className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600">
          <RefreshCw className="w-3 h-3" />
          更新
        </button>
      </div>
    </div>
  );
}

// ============================================
// Global Settings Panel
// ============================================
function SettingsPanel() {
  return (
    <div className="space-y-4">
      <div className="bg-white border border-gray-200 rounded-xl p-6">
        <h3 className="text-sm font-medium text-gray-900 mb-4">クレジット設定</h3>
        <div className="space-y-3">
          <div className="flex items-center justify-between py-2 border-b border-gray-50">
            <span className="text-sm text-gray-600">初回登録クレジット</span>
            <span className="text-sm font-medium text-gray-900 tabular-nums">3,000 cr</span>
          </div>
          <div className="flex items-center justify-between py-2 border-b border-gray-50">
            <span className="text-sm text-gray-600">画像生成コスト</span>
            <span className="text-sm font-medium text-gray-900 tabular-nums">1,500 cr / 回</span>
          </div>
          <div className="flex items-center justify-between py-2 border-b border-gray-50">
            <span className="text-sm text-gray-600">テキスト生成コスト</span>
            <span className="text-sm font-medium text-gray-900 tabular-nums">15 cr / 回</span>
          </div>
        </div>
        <p className="text-xs text-gray-400 mt-4">
          設定値の変更はコードの修正が必要です（route.ts の COSTS定数、supabase_setup.sql の handle_new_user関数）
        </p>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-6">
        <h3 className="text-sm font-medium text-gray-900 mb-4">APIモデル</h3>
        <div className="space-y-3">
          <div className="flex items-center justify-between py-2 border-b border-gray-50">
            <span className="text-sm text-gray-600">画像生成モデル</span>
            <span className="text-xs font-mono text-gray-500">gemini-3-pro-image-preview</span>
          </div>
          <div className="flex items-center justify-between py-2 border-b border-gray-50">
            <span className="text-sm text-gray-600">テキスト生成モデル</span>
            <span className="text-xs font-mono text-gray-500">gemini-2.0-flash</span>
          </div>
          <div className="flex items-center justify-between py-2 border-b border-gray-50">
            <span className="text-sm text-gray-600">出力画像サイズ</span>
            <span className="text-sm font-medium text-gray-900">4K（デフォルト）</span>
          </div>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-6">
        <h3 className="text-sm font-medium text-gray-900 mb-4">課金ポリシー</h3>
        <div className="space-y-2 text-sm text-gray-600">
          <p>API処理実行単位課金（計算資源利用型）</p>
          <p>成功・失敗問わず、処理開始時点でクレジット消費</p>
          <p>重大不具合時のみ個別判断で補填</p>
        </div>
      </div>
    </div>
  );
}
