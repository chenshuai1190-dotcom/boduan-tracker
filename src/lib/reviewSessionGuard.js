import { reviewJournalError } from './reviewJournalModel.js';

// One synchronous observer per Supabase client, shared by all review repositories.
// Keep identity/generation only: session tokens and response data are never cached.
const clientStates = new WeakMap();
const validId = value => typeof value === 'string' && Boolean(value.trim());
const authRequired = () => reviewJournalError('REVIEW_AUTH_REQUIRED', '登录状态已失效，请重新登录。');
const accountChanged = () => reviewJournalError('REVIEW_ACCOUNT_CHANGED', '账户已切换，请重新打开动态。');

function observeIdentity(state, userId, event) {
  // SIGNED_OUT is a boundary even if the same user immediately signs back in.
  // Repeated SIGNED_IN/INITIAL_SESSION and same-user token refreshes are not.
  if (event === 'SIGNED_OUT' || state.userId !== undefined && state.userId !== userId) state.generation++;
  state.userId = userId;
}

function sessionState(client) {
  const auth = client?.auth;
  if (typeof auth?.getSession !== 'function' || typeof auth?.onAuthStateChange !== 'function') return null;
  const previous = clientStates.get(client);
  if (previous?.auth === auth) return previous;
  if (previous) {
    previous.generation++;
    previous.subscription.unsubscribe();
  }
  const state = { auth, generation: 0, userId: undefined, subscription: null };
  let result;
  try {
    result = auth.onAuthStateChange((event, session) => {
      // Never call/await auth methods inside Supabase's locked event callback.
      observeIdentity(state, validId(session?.user?.id) ? session.user.id : null, event);
    });
  } catch { return null; }
  if (typeof result?.data?.subscription?.unsubscribe !== 'function') return null;
  state.subscription = result.data.subscription;
  clientStates.set(client, state);
  return state;
}

/** Local session checks protect result delivery; they are not authorization.
 * Every RPC must still send p_expected_user_id and rely on the server JWT/RLS.
 * Older clients without both session and event APIs retain remote getUser checks.
 */
export function createReviewSessionGuard(client, { isValidUserId = validId, requestError = authRequired } = {}) {
  async function legacyAuthenticate(userId) {
    if (typeof client?.auth?.getUser !== 'function') throw authRequired();
    let result;
    try { result = await client.auth.getUser(); } catch { throw requestError(); }
    if (result?.error || !validId(result?.data?.user?.id)) throw authRequired();
    if (result.data.user.id !== userId) throw accountChanged();
  }

  async function readSession(state, userId, generation) {
    let result;
    try { result = await state.auth.getSession(); } catch {
      if (state.generation !== generation || client?.auth !== state.auth) throw accountChanged();
      throw requestError();
    }
    if (state.generation !== generation || client?.auth !== state.auth) throw accountChanged();
    const session = result?.data?.session;
    // A broken/missing session on a supported client fails closed, not through a
    // remote-auth fallback that could accidentally accept a different session.
    if (result?.error || !validId(session?.user?.id) || typeof session?.access_token !== 'string' || !session.access_token.trim()) {
      observeIdentity(state, null);
      throw authRequired();
    }
    observeIdentity(state, session.user.id);
    if (session.user.id !== userId) throw accountChanged();
    return state.generation;
  }

  function assertCurrent(ticket) {
    if (!ticket || !isValidUserId(ticket.userId)) throw authRequired();
    if (client?.auth !== ticket.auth) throw accountChanged();
    if (ticket.state && (clientStates.get(client) !== ticket.state || ticket.state.generation !== ticket.generation)) throw accountChanged();
  }

  return {
    async begin(userId) {
      if (!isValidUserId(userId)) throw authRequired();
      const state = sessionState(client);
      if (!state) {
        const auth = client?.auth;
        await legacyAuthenticate(userId);
        if (client?.auth !== auth) throw accountChanged();
        return { userId, state: null, auth };
      }
      const generation = await readSession(state, userId, state.generation);
      const ticket = { userId, state, generation, auth: state.auth };
      assertCurrent(ticket);
      return ticket;
    },
    assertCurrent,
    async verify(ticket) {
      assertCurrent(ticket);
      if (!ticket.state) {
        await legacyAuthenticate(ticket.userId);
        if (client?.auth !== ticket.auth) throw accountChanged();
        return;
      }
      const { state, generation, userId } = ticket;
      await readSession(state, userId, generation);
      assertCurrent(ticket);
    },
  };
}
