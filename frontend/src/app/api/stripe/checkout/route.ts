/**
 * Stripe Checkout Session API
 * POST: Creates a Stripe Checkout Session for credit purchase
 * 3 plans: Light ¥1,000 / Standard ¥5,000 / Pro ¥10,000
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';

function getStripe() {
  return new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: '2026-01-28.clover',
  });
}

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

const PLANS: Record<string, { price: number; credits: number; name: string }> = {
  light:    { price: 1_000,  credits: 10_000,  name: 'Light' },
  standard: { price: 5_000,  credits: 50_000,  name: 'Standard' },
  pro:      { price: 10_000, credits: 100_000, name: 'Pro' },
};

export async function POST(request: NextRequest) {
  try {
    const stripe = getStripe();
    const supabaseAdmin = getSupabaseAdmin();

    // Authenticate user
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get plan from request body
    const body = await request.json().catch(() => ({}));
    const planId = body.plan || 'pro';
    const plan = PLANS[planId];

    if (!plan) {
      return NextResponse.json({ error: 'Invalid plan' }, { status: 400 });
    }

    // Determine URLs
    const origin = request.headers.get('origin') || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

    // Create Stripe Checkout Session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'jpy',
            product_data: {
              name: `オタスケPDF クレジット（${plan.name}）`,
              description: `${plan.credits.toLocaleString()} クレジット（画像生成 約${Math.floor(plan.credits / 1500)}回分）`,
            },
            unit_amount: plan.price,
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${origin}?payment=success`,
      cancel_url: `${origin}?payment=cancelled`,
      metadata: {
        user_id: user.id,
        user_email: user.email || '',
        credit_amount: plan.credits.toString(),
        plan_id: planId,
      },
      customer_email: user.email,
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error('Stripe checkout error:', error);
    return NextResponse.json(
      { error: 'Failed to create checkout session' },
      { status: 500 }
    );
  }
}
