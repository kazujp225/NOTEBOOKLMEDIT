/**
 * Stripe Webhook Handler
 * Processes checkout.session.completed events to add credits
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

export async function POST(request: NextRequest) {
  const stripe = getStripe();
  const supabaseAdmin = getSupabaseAdmin();

  const body = await request.text();
  const sig = request.headers.get('stripe-signature');

  if (!sig) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 });
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err) {
    console.error('Webhook signature verification failed:', err);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;

    const userId = session.metadata?.user_id;
    const creditAmount = parseInt(session.metadata?.credit_amount || '0', 10);

    if (!userId || !creditAmount) {
      console.error('Missing metadata in checkout session:', session.id);
      return NextResponse.json({ error: 'Missing metadata' }, { status: 400 });
    }

    // Prevent duplicate processing using payment_intent as request_id
    const paymentIntent = typeof session.payment_intent === 'string'
      ? session.payment_intent
      : session.payment_intent?.id || session.id;

    try {
      // Get current balance
      const { data: currentCredits } = await supabaseAdmin
        .from('user_credits')
        .select('balance')
        .eq('user_id', userId)
        .single();

      const balanceBefore = currentCredits?.balance || 0;
      const balanceAfter = balanceBefore + creditAmount;

      // Update balance
      const { error: updateError } = await supabaseAdmin
        .from('user_credits')
        .upsert({
          user_id: userId,
          balance: balanceAfter,
          updated_at: new Date().toISOString(),
        });

      if (updateError) {
        console.error('Failed to update credits:', updateError);
        return NextResponse.json({ error: 'Failed to update credits' }, { status: 500 });
      }

      // Record transaction
      const { error: txError } = await supabaseAdmin
        .from('credit_transactions')
        .insert({
          user_id: userId,
          request_id: paymentIntent,
          transaction_type: 'topup',
          amount: creditAmount,
          balance_before: balanceBefore,
          balance_after: balanceAfter,
          description: `Stripe決済: ¥${(session.amount_total || 0).toLocaleString()} → ${creditAmount.toLocaleString()}cr`,
          metadata: {
            stripe_session_id: session.id,
            stripe_payment_intent: paymentIntent,
            amount_total: session.amount_total,
            currency: session.currency,
          },
        });

      if (txError) {
        console.error('Failed to record transaction:', txError);
      }

      console.log(`Credits added: user=${userId}, amount=${creditAmount}, new_balance=${balanceAfter}`);
    } catch (error) {
      console.error('Webhook processing error:', error);
      return NextResponse.json({ error: 'Processing failed' }, { status: 500 });
    }
  }

  return NextResponse.json({ received: true });
}
