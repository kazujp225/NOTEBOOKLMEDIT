'use client';

import { useState, useEffect } from 'react';
import { Coins, X, Loader2, RefreshCw, ArrowDown, ArrowUp, Gift } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getCreditsInfo, CreditsInfo } from '@/lib/gemini';

interface UsageSettingsProps {
  isOpen: boolean;
  onClose: () => void;
}

export function UsageSettings({ isOpen, onClose }: UsageSettingsProps) {
  const [creditsInfo, setCreditsInfo] = useState<CreditsInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setIsVisible(true);
      loadCreditsInfo();
    }
  }, [isOpen]);

  const loadCreditsInfo = async () => {
    setIsLoading(true);
    const info = await getCreditsInfo();
    setCreditsInfo(info);
    setIsLoading(false);
  };

  const handleClose = () => {
    setIsVisible(false);
    setTimeout(onClose, 150);
  };

  if (!isOpen) return null;

  return (
    <div
      className={cn(
        'fixed inset-0 z-50 flex items-center justify-center transition-all duration-150',
        isVisible ? 'bg-black/50 backdrop-blur-sm' : 'bg-transparent'
      )}
      onClick={handleClose}
    >
      <div
        className={cn(
          'bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden transition-all duration-150',
          isVisible ? 'scale-100 opacity-100' : 'scale-95 opacity-0'
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-6 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-amber-400 to-orange-500 rounded-xl flex items-center justify-center shadow-lg">
              <Coins className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">クレジット</h2>
              <p className="text-sm text-gray-500">残高と利用履歴</p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-8 h-8 text-amber-500 animate-spin" />
            </div>
          ) : creditsInfo ? (
            <div className="space-y-6">
              {/* Balance Card */}
              <div className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-2xl p-6 text-center border border-amber-200">
                <p className="text-sm text-amber-700 mb-1">残高</p>
                <p className="text-5xl font-bold text-amber-600">
                  {creditsInfo.balance}
                </p>
                <p className="text-sm text-amber-600 mt-1">クレジット</p>
              </div>

              {/* Cost Info */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-blue-50 rounded-xl p-4 text-center">
                  <p className="text-2xl font-bold text-blue-600">
                    {creditsInfo.costs.image_generation}
                  </p>
                  <p className="text-xs text-blue-600">画像生成 / 回</p>
                </div>
                <div className="bg-purple-50 rounded-xl p-4 text-center">
                  <p className="text-2xl font-bold text-purple-600">
                    {creditsInfo.costs.text_generation}
                  </p>
                  <p className="text-xs text-purple-600">テキスト生成 / 回</p>
                </div>
              </div>

              {/* Usage estimate */}
              <div className="bg-gray-50 rounded-xl p-4">
                <p className="text-sm font-medium text-gray-700 mb-2">残高で利用可能な回数</p>
                <div className="grid grid-cols-2 gap-4 text-center">
                  <div>
                    <p className="text-xl font-bold text-gray-900">
                      {Math.floor(creditsInfo.balance / creditsInfo.costs.image_generation)}
                    </p>
                    <p className="text-xs text-gray-500">画像生成</p>
                  </div>
                  <div>
                    <p className="text-xl font-bold text-gray-900">
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
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {creditsInfo.recent_transactions.map((tx, i) => (
                      <div
                        key={i}
                        className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg"
                      >
                        <div
                          className={cn(
                            'w-8 h-8 rounded-full flex items-center justify-center',
                            tx.transaction_type === 'deduct'
                              ? 'bg-red-100'
                              : tx.transaction_type === 'refund'
                              ? 'bg-blue-100'
                              : 'bg-blue-100'
                          )}
                        >
                          {tx.transaction_type === 'deduct' ? (
                            <ArrowDown className="w-4 h-4 text-red-600" />
                          ) : tx.transaction_type === 'refund' ? (
                            <ArrowUp className="w-4 h-4 text-blue-600" />
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
                          <p
                            className={cn(
                              'text-sm font-semibold',
                              tx.transaction_type === 'deduct'
                                ? 'text-red-600'
                                : 'text-green-600'
                            )}
                          >
                            {tx.transaction_type === 'deduct' ? '-' : '+'}
                            {tx.amount}
                          </p>
                          <p className="text-xs text-gray-400">
                            残高: {tx.balance_after}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Refresh Button */}
              <button
                onClick={loadCreditsInfo}
                className="btn-ghost btn-sm w-full justify-center"
              >
                <RefreshCw className="w-4 h-4" />
                更新
              </button>
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              クレジット情報を取得できませんでした
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-100 bg-gray-50">
          <p className="text-xs text-gray-500 text-center">
            初回登録時に100クレジットが付与されます。
            処理実行時にクレジットが消費されます。
          </p>
        </div>
      </div>
    </div>
  );
}
