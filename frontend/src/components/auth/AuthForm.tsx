'use client';

import { useState } from 'react';
import { Mail, Lock, Loader2, Eye, EyeOff, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { signInWithEmail, signUpWithEmail } from '@/lib/supabase';

interface AuthFormProps {
  onSuccess: () => void;
}

export function AuthForm({ onSuccess }: AuthFormProps) {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setMessage(null);

    if (!email || !password) {
      setError('メールアドレスとパスワードを入力してください');
      return;
    }

    if (mode === 'signup' && password !== confirmPassword) {
      setError('パスワードが一致しません');
      return;
    }

    if (password.length < 6) {
      setError('パスワードは6文字以上で入力してください');
      return;
    }

    setIsLoading(true);

    try {
      if (mode === 'login') {
        const { error } = await signInWithEmail(email, password);
        if (error) {
          if (error.message.includes('Invalid login credentials')) {
            setError('メールアドレスまたはパスワードが間違っています');
          } else {
            setError(error.message);
          }
        } else {
          onSuccess();
        }
      } else {
        const { data, error } = await signUpWithEmail(email, password);
        if (error) {
          if (error.message.includes('already registered')) {
            setError('このメールアドレスは既に登録されています');
          } else {
            setError(error.message);
          }
        } else if (data?.user?.identities?.length === 0) {
          setError('このメールアドレスは既に登録されています');
        } else {
          setMessage('確認メールを送信しました。メールを確認してアカウントを有効化してください。');
        }
      }
    } catch (err) {
      setError('エラーが発生しました。もう一度お試しください。');
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-white flex items-center justify-center p-4">
      <div className="relative w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-10">
          <div className="w-14 h-14 bg-[#0d0d0d] rounded-2xl mx-auto mb-5 flex items-center justify-center shadow-lg">
            <span className="text-2xl font-bold text-white">助</span>
          </div>
          <h1 className="text-xl font-semibold text-gray-900 tracking-tight">オタスケPDF</h1>
          <p className="text-sm text-gray-400 mt-1.5">PDF文字化け修正ツール</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
          {/* Tab */}
          <div className="flex border-b border-gray-200 mb-6">
            <button
              onClick={() => { setMode('login'); setError(null); setMessage(null); }}
              className={cn(
                'flex-1 pb-3 text-sm font-medium border-b-2 -mb-px transition-colors',
                mode === 'login'
                  ? 'border-gray-900 text-gray-900'
                  : 'border-transparent text-gray-400 hover:text-gray-600'
              )}
            >
              ログイン
            </button>
            <button
              onClick={() => { setMode('signup'); setError(null); setMessage(null); }}
              className={cn(
                'flex-1 pb-3 text-sm font-medium border-b-2 -mb-px transition-colors',
                mode === 'signup'
                  ? 'border-gray-900 text-gray-900'
                  : 'border-transparent text-gray-400 hover:text-gray-600'
              )}
            >
              新規登録
            </button>
          </div>

          {/* Error */}
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          {/* Success */}
          {message && (
            <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
              <p className="text-sm text-emerald-600">{message}</p>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">
                メールアドレス
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-300" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="email@example.com"
                  className="w-full bg-white border border-gray-200 rounded-lg py-2.5 pl-10 pr-3 text-sm text-gray-900 placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-300 transition-colors"
                  autoComplete="email"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">
                パスワード
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-300" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="6文字以上"
                  className="w-full bg-white border border-gray-200 rounded-lg py-2.5 pl-10 pr-10 text-sm text-gray-900 placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-300 transition-colors"
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {mode === 'signup' && (
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">
                  パスワード（確認）
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-300" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="パスワードを再入力"
                    className="w-full bg-white border border-gray-200 rounded-lg py-2.5 pl-10 pr-3 text-sm text-gray-900 placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-300 transition-colors"
                    autoComplete="new-password"
                  />
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-[#0d0d0d] hover:bg-[#1a1a1a] text-white font-medium py-2.5 px-4 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 mt-2"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  処理中...
                </>
              ) : mode === 'login' ? (
                'ログイン'
              ) : (
                '新規登録'
              )}
            </button>
          </form>
        </div>

        {/* Footer */}
        <p className="mt-8 text-xs text-center text-gray-300">
          ログインすることで利用規約に同意したものとみなされます
        </p>
      </div>
    </div>
  );
}
