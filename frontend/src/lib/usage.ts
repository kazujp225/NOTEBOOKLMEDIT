/**
 * Usage tracking and rate limiting
 * Tracks API usage per user and enforces limits
 */

import { supabase } from './supabase';

// Usage limits (can be configured)
export const USAGE_LIMITS = {
  // Daily limits
  daily: {
    imageGenerations: 50,    // AI画像生成回数/日
    textGenerations: 200,    // テキスト候補生成回数/日
  },
  // Monthly limits
  monthly: {
    imageGenerations: 500,   // AI画像生成回数/月
    textGenerations: 2000,   // テキスト候補生成回数/月
  },
};

export type UsageType = 'image_generation' | 'text_generation';

export interface UsageRecord {
  id: string;
  user_id: string;
  usage_type: UsageType;
  count: number;
  created_at: string;
}

export interface UsageSummary {
  daily: {
    imageGenerations: number;
    textGenerations: number;
  };
  monthly: {
    imageGenerations: number;
    textGenerations: number;
  };
}

/**
 * Get usage summary for a user
 */
export async function getUsageSummary(userId: string): Promise<UsageSummary> {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  // Get daily usage
  const { data: dailyData } = await supabase
    .from('usage_logs')
    .select('usage_type, count')
    .eq('user_id', userId)
    .gte('created_at', startOfDay);

  // Get monthly usage
  const { data: monthlyData } = await supabase
    .from('usage_logs')
    .select('usage_type, count')
    .eq('user_id', userId)
    .gte('created_at', startOfMonth);

  const sumByType = (data: { usage_type: string; count: number }[] | null, type: UsageType) => {
    return data?.filter(d => d.usage_type === type).reduce((sum, d) => sum + d.count, 0) || 0;
  };

  return {
    daily: {
      imageGenerations: sumByType(dailyData, 'image_generation'),
      textGenerations: sumByType(dailyData, 'text_generation'),
    },
    monthly: {
      imageGenerations: sumByType(monthlyData, 'image_generation'),
      textGenerations: sumByType(monthlyData, 'text_generation'),
    },
  };
}

/**
 * Check if user has exceeded usage limits
 */
export async function checkUsageLimit(
  userId: string,
  usageType: UsageType
): Promise<{ allowed: boolean; reason?: string; remaining?: number }> {
  const summary = await getUsageSummary(userId);

  if (usageType === 'image_generation') {
    // Check daily limit
    if (summary.daily.imageGenerations >= USAGE_LIMITS.daily.imageGenerations) {
      return {
        allowed: false,
        reason: `本日の画像生成上限（${USAGE_LIMITS.daily.imageGenerations}回）に達しました。明日また利用できます。`,
        remaining: 0,
      };
    }
    // Check monthly limit
    if (summary.monthly.imageGenerations >= USAGE_LIMITS.monthly.imageGenerations) {
      return {
        allowed: false,
        reason: `今月の画像生成上限（${USAGE_LIMITS.monthly.imageGenerations}回）に達しました。来月また利用できます。`,
        remaining: 0,
      };
    }
    return {
      allowed: true,
      remaining: Math.min(
        USAGE_LIMITS.daily.imageGenerations - summary.daily.imageGenerations,
        USAGE_LIMITS.monthly.imageGenerations - summary.monthly.imageGenerations
      ),
    };
  }

  if (usageType === 'text_generation') {
    // Check daily limit
    if (summary.daily.textGenerations >= USAGE_LIMITS.daily.textGenerations) {
      return {
        allowed: false,
        reason: `本日のテキスト生成上限（${USAGE_LIMITS.daily.textGenerations}回）に達しました。明日また利用できます。`,
        remaining: 0,
      };
    }
    // Check monthly limit
    if (summary.monthly.textGenerations >= USAGE_LIMITS.monthly.textGenerations) {
      return {
        allowed: false,
        reason: `今月のテキスト生成上限（${USAGE_LIMITS.monthly.textGenerations}回）に達しました。来月また利用できます。`,
        remaining: 0,
      };
    }
    return {
      allowed: true,
      remaining: Math.min(
        USAGE_LIMITS.daily.textGenerations - summary.daily.textGenerations,
        USAGE_LIMITS.monthly.textGenerations - summary.monthly.textGenerations
      ),
    };
  }

  return { allowed: true };
}

/**
 * Record usage
 */
export async function recordUsage(
  userId: string,
  usageType: UsageType,
  count: number = 1
): Promise<void> {
  await supabase.from('usage_logs').insert({
    user_id: userId,
    usage_type: usageType,
    count,
  });
}

/**
 * Get remaining usage for display
 */
export async function getRemainingUsage(userId: string): Promise<{
  daily: { image: number; text: number };
  monthly: { image: number; text: number };
}> {
  const summary = await getUsageSummary(userId);

  return {
    daily: {
      image: Math.max(0, USAGE_LIMITS.daily.imageGenerations - summary.daily.imageGenerations),
      text: Math.max(0, USAGE_LIMITS.daily.textGenerations - summary.daily.textGenerations),
    },
    monthly: {
      image: Math.max(0, USAGE_LIMITS.monthly.imageGenerations - summary.monthly.imageGenerations),
      text: Math.max(0, USAGE_LIMITS.monthly.textGenerations - summary.monthly.textGenerations),
    },
  };
}
