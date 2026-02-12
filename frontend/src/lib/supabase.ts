/**
 * Supabase Client Configuration
 * For authentication and data storage
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://bvwsxraghycywnenkzsb.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ2d3N4cmFnaHljeXduZW5renNiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAyNzkwNjMsImV4cCI6MjA4NTg1NTA2M30.Mz5HxKvDI_FhnqMzua1v13j-8QcTivN-ku62veTrjYE';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/**
 * Authentication helpers
 */
export async function signInWithEmail(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  return { data, error };
}

export async function signUpWithEmail(email: string, password: string) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
  });
  return { data, error };
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  return { error };
}

export async function getCurrentUser() {
  const { data: { user }, error } = await supabase.auth.getUser();
  return { user, error };
}

export async function getSession() {
  const { data: { session }, error } = await supabase.auth.getSession();
  return { session, error };
}

/**
 * Listen to auth state changes
 */
export function onAuthStateChange(callback: (event: string, session: unknown) => void) {
  return supabase.auth.onAuthStateChange(callback);
}

/**
 * Get current user ID (non-React context)
 */
export async function getCurrentUserId(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.user?.id ?? null;
}
