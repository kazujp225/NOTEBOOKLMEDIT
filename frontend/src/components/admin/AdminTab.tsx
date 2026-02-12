'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Users, BarChart3, Activity, Loader2, RefreshCw,
  Plus, Minus, Search, Check, AlertCircle, X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  fetchAdminUsers, fetchUsageStats, fetchRecentActivity,
  adjustCredits, type AdminUser, type UsageStats, type RecentActivity,
} from '@/lib/admin';

type SubTab = 'users' | 'stats' | 'activity';

export function AdminTab() {
  const [subTab, setSubTab] = useState<SubTab>('users');

  const subTabs: { id: SubTab; label: string; icon: typeof Users }[] = [
    { id: 'users', label: 'ユーザー', icon: Users },
    { id: 'stats', label: '統計', icon: BarChart3 },
    { id: 'activity', label: 'アクティビティ', icon: Activity },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
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
    </div>
  );
}

// ============================================
// Users Panel
// ============================================
function UsersPanel() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  const [adjustAmount, setAdjustAmount] = useState('');
  const [adjustDesc, setAdjustDesc] = useState('');
  const [adjusting, setAdjusting] = useState(false);
  const [adjustResult, setAdjustResult] = useState<{ success: boolean; message: string } | null>(null);

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

  const handleAdjust = async (isAdd: boolean) => {
    if (!selectedUser || !adjustAmount) return;
    const amount = parseInt(adjustAmount) * (isAdd ? 1 : -1);
    if (isNaN(amount) || amount === 0) return;

    setAdjusting(true);
    setAdjustResult(null);
    try {
      const result = await adjustCredits(
        selectedUser.id,
        amount,
        adjustDesc || `管理者による${isAdd ? '付与' : '減算'}`
      );
      if (result.success) {
        setAdjustResult({
          success: true,
          message: `${isAdd ? '+' : '-'}${Math.abs(amount)}cr → 残高: ${result.balance_after}cr`,
        });
        setAdjustAmount('');
        setAdjustDesc('');
        // Refresh user list
        loadUsers();
      } else {
        setAdjustResult({ success: false, message: result.error || 'エラー' });
      }
    } catch (err) {
      setAdjustResult({
        success: false,
        message: err instanceof Error ? err.message : 'エラー',
      });
    } finally {
      setAdjusting(false);
    }
  };

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
              <th className="text-left px-4 py-2.5 font-medium">メール</th>
              <th className="text-right px-4 py-2.5 font-medium">残高</th>
              <th className="text-right px-4 py-2.5 font-medium">画像生成</th>
              <th className="text-right px-4 py-2.5 font-medium">テキスト</th>
              <th className="text-right px-4 py-2.5 font-medium">登録日</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {filteredUsers.map((user) => (
              <tr
                key={user.id}
                onClick={() => setSelectedUser(selectedUser?.id === user.id ? null : user)}
                className={cn(
                  'cursor-pointer transition-colors',
                  selectedUser?.id === user.id ? 'bg-blue-50' : 'hover:bg-gray-50'
                )}
              >
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

      {/* Credit adjustment panel */}
      {selectedUser && (
        <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-900">{selectedUser.email}</p>
              <p className="text-xs text-gray-400">
                現在の残高: <span className="font-medium text-gray-700">{selectedUser.balance}cr</span>
              </p>
            </div>
            <button onClick={() => setSelectedUser(null)} className="p-1 hover:bg-gray-100 rounded">
              <X className="w-4 h-4 text-gray-400" />
            </button>
          </div>

          <div className="flex gap-2">
            <input
              type="number"
              placeholder="数量"
              value={adjustAmount}
              onChange={(e) => setAdjustAmount(e.target.value)}
              className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-300"
              min="1"
            />
            <input
              type="text"
              placeholder="理由（任意）"
              value={adjustDesc}
              onChange={(e) => setAdjustDesc(e.target.value)}
              className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-300"
            />
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => handleAdjust(true)}
              disabled={adjusting || !adjustAmount}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50"
            >
              {adjusting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
              付与
            </button>
            <button
              onClick={() => handleAdjust(false)}
              disabled={adjusting || !adjustAmount}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
            >
              {adjusting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Minus className="w-3.5 h-3.5" />}
              減算
            </button>
          </div>

          {adjustResult && (
            <div className={cn(
              'flex items-center gap-2 px-3 py-2 rounded-lg text-sm',
              adjustResult.success ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
            )}>
              {adjustResult.success ? <Check className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
              {adjustResult.message}
            </div>
          )}
        </div>
      )}

      <div className="flex justify-end">
        <button onClick={loadUsers} className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600">
          <RefreshCw className="w-3 h-3" />
          更新
        </button>
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
