-- NotebookLM修正ツール Supabase Setup
-- Run this SQL in Supabase Dashboard > SQL Editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- Credits table (チケット/クレジット残高)
-- ============================================
CREATE TABLE IF NOT EXISTS user_credits (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  balance INTEGER NOT NULL DEFAULT 4500,  -- 初期クレジット4,500（画像生成3回分）
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE user_credits ENABLE ROW LEVEL SECURITY;

-- Users can view their own credits
CREATE POLICY "Users can view own credits" ON user_credits
  FOR SELECT USING (auth.uid() = user_id);

-- Service role full access
CREATE POLICY "Service role full access on credits" ON user_credits
  FOR ALL USING (true);

-- ============================================
-- Credit transactions (取引履歴/台帳)
-- ============================================
CREATE TABLE IF NOT EXISTS credit_transactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  request_id UUID NOT NULL,  -- 重複防止用
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('deduct', 'refund', 'topup', 'bonus')),
  amount INTEGER NOT NULL,  -- 正の数（deductでもrefundでも）
  balance_before INTEGER NOT NULL,
  balance_after INTEGER NOT NULL,
  description TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- 同じrequest_idの重複防止
  UNIQUE(user_id, request_id, transaction_type)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_credit_transactions_user_id ON credit_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_request_id ON credit_transactions(request_id);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_created_at ON credit_transactions(created_at);

-- Enable RLS
ALTER TABLE credit_transactions ENABLE ROW LEVEL SECURITY;

-- Users can view their own transactions
CREATE POLICY "Users can view own transactions" ON credit_transactions
  FOR SELECT USING (auth.uid() = user_id);

-- Service role full access
CREATE POLICY "Service role full access on transactions" ON credit_transactions
  FOR ALL USING (true);

-- ============================================
-- Generation requests (生成リクエスト記録)
-- ============================================
CREATE TABLE IF NOT EXISTS generation_requests (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  request_id UUID NOT NULL UNIQUE,  -- クライアントが生成するUUID
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  request_type TEXT NOT NULL CHECK (request_type IN ('image_generation', 'text_generation')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'refunded')),
  cost INTEGER NOT NULL,  -- このリクエストのコスト
  result_url TEXT,  -- 成功時の結果URL（あれば）
  error_message TEXT,  -- 失敗時のエラーメッセージ
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_generation_requests_user_id ON generation_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_generation_requests_request_id ON generation_requests(request_id);
CREATE INDEX IF NOT EXISTS idx_generation_requests_status ON generation_requests(status);

-- Enable RLS
ALTER TABLE generation_requests ENABLE ROW LEVEL SECURITY;

-- Users can view their own requests
CREATE POLICY "Users can view own requests" ON generation_requests
  FOR SELECT USING (auth.uid() = user_id);

-- Service role full access
CREATE POLICY "Service role full access on requests" ON generation_requests
  FOR ALL USING (true);

-- ============================================
-- Function: 原子的クレジット減算
-- ============================================
CREATE OR REPLACE FUNCTION deduct_credits(
  p_user_id UUID,
  p_request_id UUID,
  p_amount INTEGER,
  p_description TEXT DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
  v_current_balance INTEGER;
  v_new_balance INTEGER;
  v_result JSON;
BEGIN
  -- 既存のトランザクションをチェック（重複防止）
  IF EXISTS (
    SELECT 1 FROM credit_transactions
    WHERE user_id = p_user_id
    AND request_id = p_request_id
    AND transaction_type = 'deduct'
  ) THEN
    RETURN json_build_object(
      'success', false,
      'error', 'duplicate_request',
      'message', 'This request has already been processed'
    );
  END IF;

  -- 原子的に残高を減算（残高が足りる場合のみ）
  UPDATE user_credits
  SET
    balance = balance - p_amount,
    updated_at = NOW()
  WHERE user_id = p_user_id AND balance >= p_amount
  RETURNING balance + p_amount, balance INTO v_current_balance, v_new_balance;

  -- 更新できなかった場合（残高不足 or ユーザーが存在しない）
  IF NOT FOUND THEN
    -- ユーザーの残高を確認
    SELECT balance INTO v_current_balance FROM user_credits WHERE user_id = p_user_id;

    IF v_current_balance IS NULL THEN
      RETURN json_build_object(
        'success', false,
        'error', 'user_not_found',
        'message', 'User credits not found'
      );
    ELSE
      RETURN json_build_object(
        'success', false,
        'error', 'insufficient_credits',
        'message', 'Not enough credits',
        'current_balance', v_current_balance,
        'required', p_amount
      );
    END IF;
  END IF;

  -- トランザクション記録
  INSERT INTO credit_transactions (
    user_id, request_id, transaction_type, amount,
    balance_before, balance_after, description
  ) VALUES (
    p_user_id, p_request_id, 'deduct', p_amount,
    v_current_balance, v_new_balance, p_description
  );

  RETURN json_build_object(
    'success', true,
    'balance_before', v_current_balance,
    'balance_after', v_new_balance,
    'deducted', p_amount
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- Function: クレジット返金
-- ============================================
CREATE OR REPLACE FUNCTION refund_credits(
  p_user_id UUID,
  p_request_id UUID,
  p_amount INTEGER,
  p_description TEXT DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
  v_current_balance INTEGER;
  v_new_balance INTEGER;
BEGIN
  -- 既存の返金をチェック（二重返金防止）
  IF EXISTS (
    SELECT 1 FROM credit_transactions
    WHERE user_id = p_user_id
    AND request_id = p_request_id
    AND transaction_type = 'refund'
  ) THEN
    RETURN json_build_object(
      'success', false,
      'error', 'already_refunded',
      'message', 'This request has already been refunded'
    );
  END IF;

  -- 減算記録があるか確認
  IF NOT EXISTS (
    SELECT 1 FROM credit_transactions
    WHERE user_id = p_user_id
    AND request_id = p_request_id
    AND transaction_type = 'deduct'
  ) THEN
    RETURN json_build_object(
      'success', false,
      'error', 'no_deduction_found',
      'message', 'No deduction found for this request'
    );
  END IF;

  -- 残高を加算
  UPDATE user_credits
  SET
    balance = balance + p_amount,
    updated_at = NOW()
  WHERE user_id = p_user_id
  RETURNING balance - p_amount, balance INTO v_current_balance, v_new_balance;

  IF NOT FOUND THEN
    RETURN json_build_object(
      'success', false,
      'error', 'user_not_found',
      'message', 'User credits not found'
    );
  END IF;

  -- トランザクション記録
  INSERT INTO credit_transactions (
    user_id, request_id, transaction_type, amount,
    balance_before, balance_after, description
  ) VALUES (
    p_user_id, p_request_id, 'refund', p_amount,
    v_current_balance, v_new_balance, p_description
  );

  RETURN json_build_object(
    'success', true,
    'balance_before', v_current_balance,
    'balance_after', v_new_balance,
    'refunded', p_amount
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- Function: 新規ユーザーにクレジットを付与
-- ============================================
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO user_credits (user_id, balance)
  VALUES (NEW.id, 4500)  -- 初期クレジット4,500（画像生成3回分）
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger: 新規ユーザー作成時に自動でクレジット付与
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================
-- Function: ユーザーのクレジット情報取得
-- ============================================
CREATE OR REPLACE FUNCTION get_user_credits(p_user_id UUID)
RETURNS JSON AS $$
DECLARE
  v_balance INTEGER;
  v_recent_transactions JSON;
BEGIN
  -- 残高取得
  SELECT balance INTO v_balance FROM user_credits WHERE user_id = p_user_id;

  IF v_balance IS NULL THEN
    -- ユーザーが存在しない場合は作成
    INSERT INTO user_credits (user_id, balance) VALUES (p_user_id, 4500)
    ON CONFLICT (user_id) DO NOTHING
    RETURNING balance INTO v_balance;

    IF v_balance IS NULL THEN
      SELECT balance INTO v_balance FROM user_credits WHERE user_id = p_user_id;
    END IF;
  END IF;

  -- 最近のトランザクション取得
  SELECT json_agg(t) INTO v_recent_transactions
  FROM (
    SELECT
      transaction_type,
      amount,
      balance_after,
      description,
      created_at
    FROM credit_transactions
    WHERE user_id = p_user_id
    ORDER BY created_at DESC
    LIMIT 10
  ) t;

  RETURN json_build_object(
    'balance', v_balance,
    'recent_transactions', COALESCE(v_recent_transactions, '[]'::json)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- Grants
-- ============================================
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT ON user_credits TO authenticated;
GRANT SELECT ON credit_transactions TO authenticated;
GRANT SELECT ON generation_requests TO authenticated;
GRANT EXECUTE ON FUNCTION deduct_credits TO service_role;
GRANT EXECUTE ON FUNCTION refund_credits TO service_role;
GRANT EXECUTE ON FUNCTION get_user_credits TO authenticated;

-- ============================================
-- Admin: 管理者設定
-- ============================================
-- 管理者はauth.usersのapp_metadata.role = 'admin'で判定
-- 設定方法（service_role keyで実行）:
-- curl -X PUT "https://<ref>.supabase.co/auth/v1/admin/users/<user_id>" \
--   -H "apikey: <service_role_key>" \
--   -H "Authorization: Bearer <service_role_key>" \
--   -H "Content-Type: application/json" \
--   -d '{"app_metadata": {"role": "admin"}}'
--
-- クレジット調整はAPI route (/api/admin) 内で
-- service_role clientを使い直接user_credits + credit_transactionsを操作

-- ============================================
-- Projects table (プロジェクト)
-- ============================================
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  file_name TEXT NOT NULL,
  total_pages INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'ready',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_projects_user_id ON projects(user_id);
CREATE INDEX IF NOT EXISTS idx_projects_updated_at ON projects(updated_at DESC);

ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can CRUD own projects" ON projects
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

GRANT ALL ON projects TO authenticated;

-- ============================================
-- Project pages table (ページ情報)
-- ============================================
CREATE TABLE IF NOT EXISTS project_pages (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  page_number INTEGER NOT NULL,
  width INTEGER NOT NULL,
  height INTEGER NOT NULL,
  image_path TEXT NOT NULL,
  thumbnail_path TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(project_id, page_number)
);

CREATE INDEX IF NOT EXISTS idx_project_pages_project_id ON project_pages(project_id);

ALTER TABLE project_pages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can CRUD own pages" ON project_pages
  FOR ALL USING (
    EXISTS (SELECT 1 FROM projects WHERE projects.id = project_pages.project_id AND projects.user_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM projects WHERE projects.id = project_pages.project_id AND projects.user_id = auth.uid())
  );

GRANT ALL ON project_pages TO authenticated;

-- ============================================
-- Project issues table (修正対象)
-- ============================================
CREATE TABLE IF NOT EXISTS project_issues (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  page_number INTEGER NOT NULL,
  bbox JSONB NOT NULL,
  ocr_text TEXT DEFAULT '',
  issue_type TEXT NOT NULL DEFAULT 'manual',
  edit_mode TEXT DEFAULT 'text',
  status TEXT NOT NULL DEFAULT 'detected',
  corrected_text TEXT,
  candidates JSONB DEFAULT '[]',
  confidence REAL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_project_issues_project_id ON project_issues(project_id);

ALTER TABLE project_issues ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can CRUD own issues" ON project_issues
  FOR ALL USING (
    EXISTS (SELECT 1 FROM projects WHERE projects.id = project_issues.project_id AND projects.user_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM projects WHERE projects.id = project_issues.project_id AND projects.user_id = auth.uid())
  );

GRANT ALL ON project_issues TO authenticated;

-- ============================================
-- Project text overlays table (テキストオーバーレイ)
-- ============================================
CREATE TABLE IF NOT EXISTS project_text_overlays (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  page_number INTEGER NOT NULL,
  bbox JSONB NOT NULL,
  text TEXT NOT NULL DEFAULT '',
  font_size INTEGER DEFAULT 16,
  font_family TEXT DEFAULT 'sans-serif',
  font_weight TEXT DEFAULT 'normal',
  font_style TEXT DEFAULT 'normal',
  text_decoration TEXT DEFAULT 'none',
  text_align TEXT DEFAULT 'left',
  color TEXT DEFAULT '#000000',
  background_color TEXT DEFAULT 'transparent',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_project_text_overlays_project_id ON project_text_overlays(project_id);

ALTER TABLE project_text_overlays ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can CRUD own overlays" ON project_text_overlays
  FOR ALL USING (
    EXISTS (SELECT 1 FROM projects WHERE projects.id = project_text_overlays.project_id AND projects.user_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM projects WHERE projects.id = project_text_overlays.project_id AND projects.user_id = auth.uid())
  );

GRANT ALL ON project_text_overlays TO authenticated;

-- ============================================
-- Storage bucket for project images
-- ============================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('project-images', 'project-images', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Users can read own images" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'project-images' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users can upload own images" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'project-images' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users can update own images" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'project-images' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users can delete own images" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'project-images' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );
