/**
 * Admin API Client
 */

import { supabase } from './supabase';

async function getAuthToken(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token || null;
}

async function adminFetch(url: string, options?: RequestInit) {
  const token = await getAuthToken();
  if (!token) throw new Error('認証が必要です');

  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      ...options?.headers,
    },
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `API error: ${response.status}`);
  }

  return response.json();
}

export async function checkAdminStatus(): Promise<{ isAdmin: boolean; role?: string }> {
  try {
    return await adminFetch('/api/admin?action=check_admin');
  } catch {
    return { isAdmin: false };
  }
}

export interface AdminUser {
  id: string;
  email: string;
  created_at: string;
  balance: number;
  total_usage: number;
  image_count: number;
  text_count: number;
}

export interface UsageStats {
  totalUsers: number;
  totalCreditsConsumed: number;
  totalApiCalls: number;
  imageGenerations: number;
  textGenerations: number;
  successRate: number;
}

export interface RecentActivity {
  request_id: string;
  user_id: string;
  user_email: string;
  request_type: string;
  status: string;
  cost: number;
  error_message: string | null;
  created_at: string;
}

export async function fetchAdminUsers(page = 1, limit = 50): Promise<{
  users: AdminUser[];
  total: number;
}> {
  return adminFetch(`/api/admin?action=list_users&page=${page}&limit=${limit}`);
}

export async function fetchUsageStats(): Promise<UsageStats> {
  return adminFetch('/api/admin?action=usage_stats');
}

export async function fetchRecentActivity(limit = 50): Promise<RecentActivity[]> {
  const data = await adminFetch(`/api/admin?action=recent_activity&limit=${limit}`);
  return data.activity;
}

export async function adjustCredits(
  userId: string,
  amount: number,
  description: string
): Promise<{ success: boolean; balance_after?: number; error?: string }> {
  return adminFetch('/api/admin', {
    method: 'POST',
    body: JSON.stringify({
      action: 'adjust_credits',
      user_id: userId,
      amount,
      description,
    }),
  });
}
