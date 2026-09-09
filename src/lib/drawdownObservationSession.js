import { investmentComparisonError } from './investmentComparisonModel.js';

// A cache hit may skip the history loader, but never the current-user check.
// Session tokens are inspected here, not copied into the drawdown cache.
export async function verifyDrawdownObservationSession({ userId, getSession } = {}) {
  try {
    if (typeof userId !== 'string' || !userId.trim()) throw new Error('missing identity');
    if (!getSession) {
      const { supabase } = await import('./supabase.js');
      if (!supabase) throw new Error('missing client');
      getSession = () => supabase.auth.getSession();
    }
    const result = await getSession();
    const session = result?.data?.session;
    if (result?.error || typeof session?.access_token !== 'string' || !session.access_token.trim() || session.user?.id !== userId) throw new Error('identity mismatch');
  } catch {
    throw investmentComparisonError('AUTH_REQUIRED', 'drawdown observation authenticated identity required');
  }
}
