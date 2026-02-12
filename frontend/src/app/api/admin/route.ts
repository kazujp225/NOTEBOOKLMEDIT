/**
 * Admin API Route
 * - Verifies admin status via app_metadata.role
 * - Uses service_role key to bypass RLS
 * - Provides user management, credit adjustment, usage stats
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _supabase: any = null;
function getSupabase() {
  if (!_supabase) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    if (!url || !key) throw new Error('Supabase環境変数が設定されていません');
    _supabase = createClient(url, key);
  }
  return _supabase;
}

async function verifyAdmin(request: NextRequest): Promise<{
  userId: string;
  email: string;
} | null> {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;

  const token = authHeader.substring(7);
  const { data: { user }, error } = await getSupabase().auth.getUser(token);
  if (error || !user) return null;

  // Check app_metadata for admin role
  if (user.app_metadata?.role !== 'admin') return null;

  return { userId: user.id, email: user.email || '' };
}

export async function GET(request: NextRequest) {
  try {
    const admin = await verifyAdmin(request);
    if (!admin) {
      return NextResponse.json({ error: '管理者権限が必要です' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');

    if (action === 'check_admin') {
      return NextResponse.json({ isAdmin: true, role: 'admin', email: admin.email });
    }

    if (action === 'list_users') {
      const page = parseInt(searchParams.get('page') || '1');
      const perPage = parseInt(searchParams.get('limit') || '50');

      // Get all auth users
      const { data: { users }, error: usersError } = await getSupabase().auth.admin.listUsers({
        page,
        perPage,
      });

      if (usersError) {
        return NextResponse.json({ error: usersError.message }, { status: 500 });
      }

      const userIds = users.map((u: { id: string }) => u.id);

      // Get credits for all users
      const { data: credits } = await getSupabase()
        .from('user_credits')
        .select('user_id, balance')
        .in('user_id', userIds);

      // Get usage counts per user
      const { data: requests } = await getSupabase()
        .from('generation_requests')
        .select('user_id, request_type, status')
        .in('user_id', userIds);

      const creditMap = new Map((credits || []).map((c: { user_id: string; balance: number }) => [c.user_id, c.balance]));
      const usageMap = new Map<string, { image: number; text: number }>();

      for (const req of requests || []) {
        const current = usageMap.get(req.user_id) || { image: 0, text: 0 };
        if (req.request_type === 'image_generation') current.image++;
        else current.text++;
        usageMap.set(req.user_id, current);
      }

      const result = users.map((u: { id: string; email?: string; created_at: string }) => {
        const usage = usageMap.get(u.id) || { image: 0, text: 0 };
        return {
          id: u.id,
          email: u.email || '',
          created_at: u.created_at,
          balance: creditMap.get(u.id) ?? 0,
          image_count: usage.image,
          text_count: usage.text,
          total_usage: usage.image + usage.text,
        };
      });

      return NextResponse.json({ users: result, total: users.length });
    }

    if (action === 'usage_stats') {
      // Total users
      const { count: totalUsers } = await getSupabase()
        .from('user_credits')
        .select('*', { count: 'exact', head: true });

      // Total credits consumed
      const { data: deductTxs } = await getSupabase()
        .from('credit_transactions')
        .select('amount')
        .eq('transaction_type', 'deduct');

      const totalCreditsConsumed = (deductTxs || []).reduce(
        (sum: number, tx: { amount: number }) => sum + tx.amount, 0
      );

      // Generation requests stats
      const { data: allRequests } = await getSupabase()
        .from('generation_requests')
        .select('request_type, status');

      const totalApiCalls = (allRequests || []).length;
      const imageGenerations = (allRequests || []).filter(
        (r: { request_type: string }) => r.request_type === 'image_generation'
      ).length;
      const textGenerations = (allRequests || []).filter(
        (r: { request_type: string }) => r.request_type === 'text_generation'
      ).length;
      const completedCount = (allRequests || []).filter(
        (r: { status: string }) => r.status === 'completed'
      ).length;
      const successRate = totalApiCalls > 0 ? completedCount / totalApiCalls : 0;

      return NextResponse.json({
        totalUsers: totalUsers || 0,
        totalCreditsConsumed,
        totalApiCalls,
        imageGenerations,
        textGenerations,
        successRate,
      });
    }

    if (action === 'recent_activity') {
      const limit = parseInt(searchParams.get('limit') || '50');

      const { data: requests } = await getSupabase()
        .from('generation_requests')
        .select('request_id, user_id, request_type, status, cost, error_message, created_at')
        .order('created_at', { ascending: false })
        .limit(limit);

      // Get emails for all user_ids
      const userIdSet = new Set<string>();
      for (const r of requests || []) {
        userIdSet.add((r as { user_id: string }).user_id);
      }
      const userIds = Array.from(userIdSet);
      const emailMap = new Map<string, string>();

      for (const uid of userIds) {
        const { data: { user } } = await getSupabase().auth.admin.getUserById(uid);
        if (user) emailMap.set(uid, user.email || '');
      }

      const result = (requests || []).map((r: {
        request_id: string;
        user_id: string;
        request_type: string;
        status: string;
        cost: number;
        error_message: string | null;
        created_at: string;
      }) => ({
        ...r,
        user_email: emailMap.get(r.user_id) || '',
      }));

      return NextResponse.json({ activity: result });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('Admin API error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const admin = await verifyAdmin(request);
    if (!admin) {
      return NextResponse.json({ error: '管理者権限が必要です' }, { status: 403 });
    }

    const body = await request.json();
    const { action } = body;

    if (action === 'adjust_credits') {
      const { user_id, amount, description } = body;

      if (!user_id || typeof amount !== 'number' || amount === 0) {
        return NextResponse.json({ error: 'user_id と amount が必要です' }, { status: 400 });
      }

      // Get current balance
      const { data: currentCredits, error: fetchError } = await getSupabase()
        .from('user_credits')
        .select('balance')
        .eq('user_id', user_id)
        .single();

      if (fetchError || !currentCredits) {
        return NextResponse.json({ error: 'ユーザーが見つかりません' }, { status: 404 });
      }

      const currentBalance = currentCredits.balance;
      const newBalance = currentBalance + amount;

      if (newBalance < 0) {
        return NextResponse.json({
          error: '残高がマイナスになります',
          current_balance: currentBalance,
        }, { status: 400 });
      }

      // Update balance
      const { error: updateError } = await getSupabase()
        .from('user_credits')
        .update({ balance: newBalance, updated_at: new Date().toISOString() })
        .eq('user_id', user_id);

      if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 500 });
      }

      // Record transaction
      const txType = amount > 0 ? 'topup' : 'deduct';
      await getSupabase().from('credit_transactions').insert({
        user_id,
        request_id: crypto.randomUUID(),
        transaction_type: txType,
        amount: Math.abs(amount),
        balance_before: currentBalance,
        balance_after: newBalance,
        description: description || `管理者による${amount > 0 ? '付与' : '減算'}`,
      });

      return NextResponse.json({
        success: true,
        balance_before: currentBalance,
        balance_after: newBalance,
        adjusted: amount,
      });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('Admin API error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
