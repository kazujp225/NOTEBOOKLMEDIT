'use client';

import { useState, useEffect } from 'react';
import { Key, Eye, EyeOff, Check, AlertCircle, Loader2, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  getGeminiApiKey,
  setGeminiApiKey,
  removeGeminiApiKey,
  validateApiKey,
} from '@/lib/gemini';

interface ApiKeySettingsProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ApiKeySettings({ isOpen, onClose }: ApiKeySettingsProps) {
  const [apiKey, setApiKeyState] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [validationStatus, setValidationStatus] = useState<'idle' | 'valid' | 'invalid'>('idle');
  const [hasExistingKey, setHasExistingKey] = useState(false);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setIsVisible(true);
      const existingKey = getGeminiApiKey();
      if (existingKey) {
        setApiKeyState(existingKey);
        setHasExistingKey(true);
        setValidationStatus('valid');
      }
    }
  }, [isOpen]);

  const handleClose = () => {
    setIsVisible(false);
    setTimeout(onClose, 150);
  };

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
        <div className="p-6 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
              <Key className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">API設定</h2>
              <p className="text-sm text-gray-500">Gemini APIキーを設定</p>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl">
            <div className="flex gap-3">
              <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-amber-800">
                <p className="font-medium mb-1">APIキーについて</p>
                <p>
                  このツールはGemini APIを使用します。APIキーはお使いのブラウザにのみ保存され、
                  サーバーには送信されません。API使用料は各自のGoogleアカウントに請求されます。
                </p>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Gemini API Key
            </label>
            <div className="relative">
              <input
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => {
                  setApiKeyState(e.target.value);
                  setValidationStatus('idle');
                }}
                placeholder="AIza..."
                className={cn(
                  'input-field pr-20',
                  validationStatus === 'valid' && 'border-green-500 focus:ring-green-500',
                  validationStatus === 'invalid' && 'border-red-500 focus:ring-red-500'
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
                <Check className="w-4 h-4" />
                APIキーが有効です
              </p>
            )}
            {validationStatus === 'invalid' && (
              <p className="mt-2 text-sm text-red-600 flex items-center gap-1">
                <AlertCircle className="w-4 h-4" />
                無効なAPIキーです
              </p>
            )}
          </div>

          <a
            href="https://aistudio.google.com/app/apikey"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700"
          >
            Google AI StudioでAPIキーを取得
            <ExternalLink className="w-3 h-3" />
          </a>

          <div className="pt-2 border-t border-gray-100">
            <h3 className="text-sm font-medium text-gray-700 mb-2">使用モデル・料金目安</h3>
            <div className="text-sm text-gray-500 space-y-1">
              <p>• <strong>画像生成: Gemini 3.0 Pro</strong> (gemini-3-pro-image-preview)</p>
              <p className="ml-4 text-xs">約$0.134/枚 - 高品質な画像編集</p>
              <p>• テキスト候補生成: Gemini 2.0 Flash</p>
              <p className="ml-4 text-xs">約$0.075/100万トークン - 高速・低コスト</p>
              <p className="text-xs text-gray-400 mt-2">
                ※ 料金は変更される可能性があります。最新情報はGoogleの公式ドキュメントをご確認ください。
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-100 bg-gray-50 flex gap-3">
          {hasExistingKey && (
            <button
              onClick={handleRemove}
              className="btn-ghost btn-sm text-red-600 hover:bg-red-50"
            >
              キーを削除
            </button>
          )}
          <div className="flex-1" />
          <button onClick={handleClose} className="btn-secondary">
            キャンセル
          </button>
          <button
            onClick={handleSave}
            disabled={isValidating || !apiKey.trim()}
            className="btn-primary"
          >
            {isValidating ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                検証中...
              </>
            ) : (
              '保存'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
