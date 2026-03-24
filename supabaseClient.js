// ============================================================
// LIFE OS — SHARED SUPABASE CLIENT v2
// supabaseClient.js
//
// Fixes from v1:
// — Safe import.meta.env detection (typeof import !== 'undefined' was invalid)
// — updateUser() for anonymous upgrade (not signInWithOtp)
// — Clean export shape for both Vite and vanilla JS tools
//
// Usage:
//   Pulse (Vite):      import { supabase, getAccess, ... } from './supabaseClient'
//   Orienteering/PP:   <script src="/supabaseClient.js"> then window.LifeOS.supabase
// ============================================================

import { createClient } from '@supabase/supabase-js';

// ─── Safe env detection ───────────────────────────────────────────────────────
// Vite exposes import.meta.env. Vanilla JS reads from window globals.
// Never use `typeof import` — that is not a valid runtime check.

const viteEnv = (typeof import.meta !== 'undefined' && import.meta.env)
  ? import.meta.env
  : {};

const supabaseUrl =
  viteEnv.VITE_SUPABASE_URL ||
  (typeof window !== 'undefined' ? window.SUPABASE_URL : '') ||
  '';

const supabaseKey =
  viteEnv.VITE_SUPABASE_ANON_KEY ||
  (typeof window !== 'undefined' ? window.SUPABASE_ANON_KEY : '') ||
  '';

export const supabase = (supabaseUrl && supabaseKey)
  ? createClient(supabaseUrl, supabaseKey)
  : null;

// ─── Auth helpers ─────────────────────────────────────────────────────────────

export async function getCurrentUser() {
  if (!supabase) return null;
  try {
    const { data: { user } } = await supabase.auth.getUser();
    return user || null;
  } catch {
    return null;
  }
}

// Start anonymous session — silent, no email required.
// Call on tool load before the user has provided their email.
export async function signInAnonymously() {
  if (!supabase) return { user: null, error: 'Supabase not configured' };
  try {
    const { data, error } = await supabase.auth.signInAnonymously();
    return { user: data?.user || null, error };
  } catch (err) {
    return { user: null, error: err.message };
  }
}

// Upgrade anonymous user to identified.
// IMPORTANT: use updateUser, NOT signInWithOtp.
// updateUser preserves the anonymous user's existing data.
// signInWithOtp may create a separate auth flow and lose the anonymous record.
// Ref: https://supabase.com/docs/guides/auth/auth-anonymous
export async function upgradeToEmail(email) {
  if (!supabase) return { error: 'Supabase not configured' };
  try {
    const { error } = await supabase.auth.updateUser({ email });
    return { error };
  } catch (err) {
    return { error: err.message };
  }
}

// ─── Access check ─────────────────────────────────────────────────────────────
// Returns: 'full' | 'beta' | 'preview' | 'none'
// Call on tool load to determine what to show.
//
// Example:
//   const access = await getAccess('pulse')
//   if (access === 'none') showPaywall()

export async function getAccess(product) {
  if (!supabase) return 'none';
  try {
    const user = await getCurrentUser();
    if (!user) return 'none';

    const { data, error } = await supabase
      .from('access')
      .select('tier, expires_at')
      .eq('user_id', user.id)
      .eq('product', product)
      .single();

    if (error || !data) return 'none';

    // Check expiry (used for Pulse trial)
    if (data.expires_at && new Date(data.expires_at) < new Date()) return 'none';

    return data.tier || 'full';
  } catch {
    return 'none';
  }
}

// ─── Pulse trial grant ────────────────────────────────────────────────────────
// Call when a new user signs up for Pulse.
// Grants 7 days of full access automatically — no card required.

export async function grantPulseTrial(userId) {
  if (!supabase || !userId) return { error: 'Missing supabase or userId' };
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  try {
    const { error } = await supabase
      .from('access')
      .upsert({
        user_id:    userId,
        product:    'pulse',
        tier:       'full',
        source:     'trial',
        expires_at: expiresAt
      }, { onConflict: 'user_id,product' });
    return { error };
  } catch (err) {
    return { error: err.message };
  }
}

// ─── Foundation signed URL ────────────────────────────────────────────────────
// Returns a time-limited URL for a Foundation audio file.
// Only works if user has 'foundation' access.

export async function getFoundationAudioUrl(storagePath, expiresInSeconds = 3600) {
  if (!supabase) return { url: null, error: 'Supabase not configured' };
  try {
    const { data, error } = await supabase.storage
      .from('foundation-audio')
      .createSignedUrl(storagePath, expiresInSeconds);
    return { url: data?.signedUrl || null, error };
  } catch (err) {
    return { url: null, error: err.message };
  }
}

export default supabase;
