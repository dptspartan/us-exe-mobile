// @ts-nocheck — ported from web `NetworkUtils.js`; kept loose for parity with Supabase payloads.
import { supabase } from '../lib/supabase';
import { dataCache, cacheKeys, invalidateCoupleTableCache } from '../cache/dataCache';
import {
  getCachedSignedUrl,
  setCachedSignedUrl,
  clearSignedUrlCache,
} from '../cache/imageUrlCache';
import {
  clearCoupleKey,
  ensureCoupleKey,
  getMigrationVersion,
  migrateCoupleContent,
  MIGRATION_TARGET_VERSION,
} from '../crypto';
import {
  clearPhotoDisplayCache,
  decryptBroadcastPayload,
  encryptBroadcastPayload,
  maybeDecryptJson,
  maybeDecryptText,
  maybeEncryptJson,
  maybeEncryptText,
  decryptRowsTexts,
  decryptRowTexts,
  encryptBytes,
  resolvePhotoDisplayUrl,
} from './e2eeBoundary';

const CACHE_TTL_MS = 10 * 60 * 1000;

async function readThroughCache(key, fetcher, ttlMs = CACHE_TTL_MS) {
  let cached = dataCache.getSync(key);
  if (cached === null) cached = await dataCache.get(key);

  if (cached !== null) {
    const fresh = dataCache.isFresh(key);
    if (!fresh || dataCache.isSoftStale(key)) {
      void fetcher()
        .then((data) => dataCache.set(key, data, ttlMs))
        .catch(() => {});
    }
    return cached;
  }

  const data = await fetcher();
  await dataCache.set(key, data, ttlMs);
  return data;
}

function getActiveListenerCount(entry) {
  let count = entry.doodleListeners.size;
  for (const set of Object.values(entry.listeners)) {
    count += set.size;
  }
  return count;
}

// `supabase.channel(topic)` reuses an existing, possibly-still-subscribed
// RealtimeChannel object if one with the exact same topic string is still
// registered on the client. `removeChannel()` below is fire-and-forget
// (unsubscribe is async), so a re-subscribe for the same coupleId shortly
// after a teardown can race ahead of that cleanup and be handed back the
// old, already-`subscribe()`d channel — which then throws "cannot add
// postgres_changes callbacks ... after subscribe()" when we try to attach
// handlers to it. Suffixing the topic with a per-coupleId generation
// counter guarantees every new entry gets a brand-new topic, so it can
// never collide with a channel that's still mid-teardown.
const coupleChannelGeneration = new Map();

function nextCoupleChannelTopic(coupleId) {
  const gen = (coupleChannelGeneration.get(coupleId) ?? 0) + 1;
  coupleChannelGeneration.set(coupleId, gen);
  return `couple-sync:${coupleId}:${gen}`;
}

function teardownCoupleChannel(coupleId) {
  const entry = coupleSyncChannels.get(coupleId);
  if (!entry) return;
  if (entry.reconnectTimer) {
    clearTimeout(entry.reconnectTimer);
    entry.reconnectTimer = null;
  }
  try {
    supabase.removeChannel(entry.channel);
  } catch {
    /* channel may already be gone */
  }
  coupleSyncChannels.delete(coupleId);
}

function scheduleCoupleChannelReconnect(coupleId, entry) {
  if (entry.reconnectTimer || entry.reconnecting) return;

  const attempt = entry.reconnectAttempt ?? 0;
  const delay = Math.min(30_000, 1000 * 2 ** Math.min(attempt, 5));

  entry.reconnectTimer = setTimeout(() => {
    entry.reconnectTimer = null;
    entry.reconnecting = true;
    entry.reconnectAttempt = attempt + 1;

    try {
      supabase.removeChannel(entry.channel);
    } catch {
      /* ignore */
    }

    entry.channel = supabase.channel(nextCoupleChannelTopic(coupleId), {
      config: { broadcast: { self: false } },
    });
    attachCoupleChannelHandlers(entry, coupleId);

    for (const table of REALTIME_TABLES) {
      entry.listeners[table].forEach((fn) => fn({ __source: 'reconnect', table }));
    }
    entry.doodleListeners.forEach((fn) => fn({ event: 'reconnect', __source: 'reconnect' }));
  }, delay);
}

function attachCoupleChannelHandlers(entry, coupleId) {
  const { channel, listeners } = entry;

  for (const table of REALTIME_TABLES) {
    channel.on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table,
        filter: `couple_id=eq.${coupleId}`,
      },
      (payload) => {
        listeners[table].forEach((fn) => fn({ ...payload, __source: 'postgres' }));
      }
    );
  }

  channel.on('broadcast', { event: 'data_refresh' }, ({ payload }) => {
    const table = payload?.table;
    if (!table || !listeners[table]) return;
    listeners[table].forEach((fn) => fn({ __source: 'broadcast', table }));
  });

  for (const evt of ['doodle_stroke', 'doodle_clear', 'doodle_undo']) {
    channel.on('broadcast', { event: evt }, ({ payload }) => {
      void decryptBroadcastPayload(coupleId, payload ?? {}).then((dec) => {
        entry.doodleListeners.forEach((fn) => fn({ event: evt, ...dec }));
      });
    });
  }

  channel.subscribe((status, err) => {
    entry.status = status;
    if (__DEV__) {
      console.log(`[realtime couple-sync:${coupleId}]`, status, err?.message ?? '');
    }
    if (status === 'SUBSCRIBED') {
      entry.reconnectAttempt = 0;
      entry.reconnecting = false;
    }
    if (status === 'CHANNEL_ERROR' || status === 'CLOSED' || status === 'TIMED_OUT') {
      console.error('[realtime] channel issue:', err?.message ?? status);
      scheduleCoupleChannelReconnect(coupleId, entry);
    }
  });
}

/** Tables that sync live across both partners */
const REALTIME_TABLES = [
  'moods',
  'todos',
  'sticky_notes',
  'photo_wall',
  'link_drops',
  'flip_letters',
  'date_diary',
  'doodle_canvas',
];

const coupleSyncChannels = new Map();
const coupleBroadcastChannels = new Map();

function getCoupleSyncEntry(coupleId) {
  if (coupleSyncChannels.has(coupleId)) {
    return coupleSyncChannels.get(coupleId);
  }

  const listeners = Object.fromEntries(REALTIME_TABLES.map((t) => [t, new Set()]));

  const entry = {
    channel: supabase.channel(nextCoupleChannelTopic(coupleId), {
      config: { broadcast: { self: false } },
    }),
    listeners,
    doodleListeners: new Set(),
    reconnectAttempt: 0,
    reconnecting: false,
    reconnectTimer: null,
    status: 'idle',
  };

  attachCoupleChannelHandlers(entry, coupleId);
  coupleSyncChannels.set(coupleId, entry);
  return entry;
}

function broadcastDataRefresh(coupleId, table) {
  if (!coupleId || !REALTIME_TABLES.includes(table)) return;
  void invalidateCoupleTableCache(coupleId, table);
  if (table === 'photo_wall') clearSignedUrlCache();

  const entry = getCoupleSyncEntry(coupleId);
  const transmit = () =>
    entry.channel.send({
      type: 'broadcast',
      event: 'data_refresh',
      payload: { table },
    });

  if (entry.channel.state === 'joined') {
    transmit();
    return;
  }

  entry.channel.subscribe((status) => {
    if (status === 'SUBSCRIBED') transmit();
  });
}

/** Edge functions return structured JSON error bodies (e.g. `{ error: 'email_already_registered' }`) on non-2xx responses; unwrap them into a normal Error with `.code`/`.details` so screens can branch on it. */
async function resolveFunctionError(error) {
  try {
    if (error?.context?.json) {
      const body = await error.context.json();
      const wrapped = new Error(body?.error ?? error.message ?? 'Request failed');
      wrapped.code = body?.error;
      wrapped.details = body;
      return wrapped;
    }
  } catch {
    /* fall through to generic error below */
  }
  return error instanceof Error ? error : new Error('Request failed');
}

// 2. Network Utility Wrapper Functions
export const networkUtility = {
  /**
   * Quick check to see if a user session exists.
   * @returns {Promise<Object|null>} The authenticated user object or null.
   */
  async getCurrentUser() {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error) {
      console.error("Error fetching current user:", error.message);
      return null;
    }
    return user;
  },

  /**
   * Fetches the unique couple profile row for the logged-in user.
   * @param {string} userId - Pass the current authenticated user's ID
   */
  async getCoupleProfile(userId) {
    if (!userId) return null;
    return readThroughCache(cacheKeys.coupleProfile(userId), async () => {
      try {
        const { data, error } = await supabase
          .from('couples')
          .select('*')
          .or(`partner_1_id.eq.${userId},partner_2_id.eq.${userId}`)
          .maybeSingle();

        if (error) throw error;
        return data;
      } catch (error) {
        console.error('NetworkUtility [getCoupleProfile] failed:', error.message);
        return null;
      }
    });
  },

  /**
   * Helper utility to grab just the raw couple_id UUID string cleanly.
   * @param {string} userId - Pass the current authenticated user's ID
   * @returns {Promise<string|null>} The couple UUID string.
   */
  async getCoupleId(userId) {
    // ✨ FIX: Properly pass the userId argument down through the profile getter!
    const coupleProfile = await this.getCoupleProfile(userId);
    return coupleProfile ? coupleProfile.id : null;
  },

  async signIn(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password: password
    });
    if (error) throw error;
    return data.user;
  },

  /**
   * Clears the current user token session entirely.
   */
  async signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) console.error("Error signing out:", error.message);
    clearCoupleKey();
    clearPhotoDisplayCache();
    clearSignedUrlCache();
    await dataCache.clearAll();
    for (const coupleId of [...coupleSyncChannels.keys()]) {
      teardownCoupleChannel(coupleId);
    }
  },

  // ---------------------------------------------------------------------
  // Onboarding + subscription pipeline
  // ---------------------------------------------------------------------

  /** Kicks off onboarding: creates a pending couple + subscription + invites. No emails sent yet. */
  async startOnboarding({ ownerEmail, ownerName, partnerEmail, partnerName, shipName }) {
    const { data, error } = await supabase.functions.invoke('start-onboarding', {
      body: { ownerEmail, ownerName, partnerEmail, partnerName, shipName },
    });
    if (error) throw await resolveFunctionError(error);
    return data;
  },

  /** Dummy checkout completion. Swap this single call for a real Stripe flow later. */
  async completeDummyPayment({ coupleId, checkoutToken, simulate }) {
    const { data, error } = await supabase.functions.invoke('complete-dummy-payment', {
      body: { couple_id: coupleId, checkout_token: checkoutToken, simulate },
    });
    if (error) throw await resolveFunctionError(error);
    return data;
  },

  /**
   * Establishes a session for an invited user from the emailed deep link's
   * token_hash. `type` must match whatever the backend used to mint the
   * link — 'invite' for a brand-new account, 'magiclink' when resend-invite
   * regenerated a link for an already-created (but still password-less) user.
   */
  async verifyInviteToken({ email, tokenHash, type = 'invite' }) {
    const { data, error } = await supabase.auth.verifyOtp({ email, token: tokenHash, type });
    if (error) throw error;
    return data;
  },

  /** Sets the invited user's password — they had none until this point. */
  async setNewPassword(password) {
    const { error } = await supabase.auth.updateUser({ password });
    if (error) throw error;
  },

  /** Confirms invite acceptance server-side; backfills couples.partner_x_id. */
  async finishAccountSetup() {
    const { data, error } = await supabase.functions.invoke('finish-account-setup', { body: {} });
    if (error) throw await resolveFunctionError(error);
    return data;
  },

  /**
   * Fixes a typo'd/lost invite email. Works pre-auth via { coupleId, checkoutToken }
   * (e.g. the owner's own invite never arrived), or authenticated once the owner
   * has already set up their own account (fixing the partner's email/link).
   */
  async resendInvite({ role, newEmail, coupleId, checkoutToken }) {
    const { data, error } = await supabase.functions.invoke('resend-invite', {
      body: { role, newEmail, couple_id: coupleId, checkout_token: checkoutToken },
    });
    if (error) throw await resolveFunctionError(error);
    return data;
  },

  /** The single access gateway — call after login/session-restore, before ever rendering the Dashboard. */
  async getAccessStatus() {
    const { data, error } = await supabase.rpc('get_my_access_status');
    if (error) {
      console.error('Error fetching access status:', error.message);
      return null;
    }
    return Array.isArray(data) ? data[0] ?? null : data;
  },

  /** Whether new onboarding is currently allowed — backend-controlled kill-switch, anon-readable. */
  async isOnboardingEnabled() {
    const { data, error } = await supabase
      .from('app_config')
      .select('onboarding_enabled')
      .eq('id', true)
      .maybeSingle();
    if (error) {
      console.error('Error fetching app_config:', error.message);
      return true; // fail open — a transient error shouldn't hide onboarding entirely
    }
    return data?.onboarding_enabled !== false;
  },

  /** Read-only view of both invite rows for the caller's own couple (the `invites` table itself has no client access). */
  async getOnboardingInvites() {
    const { data, error } = await supabase.rpc('get_my_onboarding_invites');
    if (error) {
      console.error('Error fetching onboarding invites:', error.message);
      return [];
    }
    return data ?? [];
  },

  /**
   * Dummy "renew"/retry-payment action for a couple whose subscription has
   * lapsed (past the grace period) or was manually canceled. Under the hood
   * this calls the same shared state-transition helper a real Stripe retry
   * webhook would — swap this one call out when Stripe lands.
   */
  async reactivateSubscription() {
    return this.simulateSubscriptionEvent('success');
  },

  /** Dev/test-only: force the couple's subscription into past_due (with a 7-day grace period) or back to active. */
  async simulateSubscriptionEvent(outcome) {
    const { data, error } = await supabase.functions.invoke('simulate-subscription-event', {
      body: { outcome },
    });
    if (error) throw await resolveFunctionError(error);
    return data;
  },

  /** Updates the caller's own display name and/or the shared, cosmetic ship name. */
  async updateMyProfile({ displayName, shipName } = {}) {
    const { error } = await supabase.rpc('update_my_profile', {
      p_display_name: displayName ?? null,
      p_ship_name: shipName ?? null,
    });
    if (error) throw error;
  },

  /** Change-password flow (Settings screen) — re-authenticates with the current password first. */
  async changePassword({ email, currentPassword, newPassword }) {
    const { error: reauthError } = await supabase.auth.signInWithPassword({
      email,
      password: currentPassword,
    });
    if (reauthError) throw new Error('Current password is incorrect.');
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) throw error;
  },

  /**
   * Updates or inserts (Upserts) the current user's flip letter.
   */
  async updateFlipLetter(coupleId, authorId, textContent) {
    const cek = await ensureCoupleKey(coupleId);
    const content = maybeEncryptText(cek, textContent);
    const { data, error } = await supabase
      .from('flip_letters')
      .upsert(
        { couple_id: coupleId, author_id: authorId, content, updated_at: new Date() },
        { onConflict: 'couple_id,author_id' }
      )
      .select();
    if (error) console.error("Error saving letter:", error.message);
    else broadcastDataRefresh(coupleId, 'flip_letters');
    return data;
  },

  /**
   * Updates or inserts the current user's mood.
   */
  async updateMood(coupleId, userId, newMood) {
    const { data, error } = await supabase
      .from('moods')
      .upsert(
        { couple_id: coupleId, user_id: userId, mood_type: newMood, updated_at: new Date().toISOString() },
        { onConflict: 'user_id' }
      )
      .select();
    if (error) {
      const retry = await supabase
        .from('moods')
        .upsert(
          { couple_id: coupleId, user_id: userId, mood_type: newMood, updated_at: new Date().toISOString() },
          { onConflict: 'couple_id,user_id' }
        )
        .select();
      if (retry.error) {
        console.error("Error setting mood:", retry.error.message);
        throw retry.error;
      }
      broadcastDataRefresh(coupleId, 'moods');
      return retry.data;
    }
    broadcastDataRefresh(coupleId, 'moods');
    return data;
  },

  async getMoods(coupleId) {
    return readThroughCache(cacheKeys.moods(coupleId), async () => {
      const { data, error } = await supabase
        .from('moods')
        .select('*')
        .eq('couple_id', coupleId);
      if (error) {
        console.error("Error fetching moods:", error.message);
        return [];
      }
      return data || [];
    });
  },
  
  async getNamesFromCouple(coupleId, currentUserId) {
    return readThroughCache(cacheKeys.names(coupleId, currentUserId), async () => {
      try {
        const { data, error } = await supabase
          .from('couples')
          .select('partner_1_id, partner_2_id, partner_1_name, partner_2_name')
          .eq('id', coupleId)
          .single();
  
        if (error) throw error;
        if (!data) return 'Partner';
  
        const isUser1 = data.partner_1_id === currentUserId;
        const partnerName = isUser1 ? data.partner_2_name : data.partner_1_name;
        const myName = isUser1 ? data.partner_1_name : data.partner_2_name;
        return { partnerName: partnerName, myName: myName };
      } catch (error) {
        console.error("Error fetching partner name from couples:", error.message);
        return { partnerName: 'Partner', myName: 'You' };
      }
    });
  },

  async getFlipLetters(coupleId) {
    return readThroughCache(cacheKeys.flipLetters(coupleId), async () => {
      const cek = await ensureCoupleKey(coupleId);
      const { data, error } = await supabase
        .from('flip_letters')
        .select('*')
        .eq('couple_id', coupleId);
      if (error) {
        console.error("Error fetching flip letters:", error.message);
        return [];
      }
      return decryptRowsTexts(cek, data || [], ['content']);
    });
  },

  async createTodo(coupleId, task) {
    const cek = await ensureCoupleKey(coupleId);
    const { data, error } = await supabase
      .from('todos')
      .insert({ couple_id: coupleId, task: maybeEncryptText(cek, task), is_completed: false })
      .select()
      .single();
    if (error) {
      console.error("Error creating todo:", error.message);
      throw error;
    }
    broadcastDataRefresh(coupleId, 'todos');
    return decryptRowTexts(cek, data, ['task']);
  },

  async toggleTodo(todoId, isCompleted) {
    const { data, error } = await supabase
      .from('todos')
      .update({ is_completed: isCompleted })
      .eq('id', todoId)
      .select()
      .single();
    if (error) {
      console.error("Error updating todo:", error.message);
      throw error;
    }
    if (data?.couple_id) broadcastDataRefresh(data.couple_id, 'todos');
    return data;
  },

  async deleteTodo(todoId, coupleId) {
    const { error } = await supabase.from('todos').delete().eq('id', todoId);
    if (error) {
      console.error("Error deleting todo:", error.message);
      throw error;
    }
    if (coupleId) broadcastDataRefresh(coupleId, 'todos');
  },

  async sendStickyNote(coupleId, authorId, content) {
    const cek = await ensureCoupleKey(coupleId);
    const { data, error } = await supabase
      .from('sticky_notes')
      .insert({
        couple_id: coupleId,
        author_id: authorId,
        content: maybeEncryptText(cek, content),
        is_cleared: false,
      })
      .select()
      .single();
    if (error) {
      console.error("Error sending sticky note:", error.message);
      throw error;
    }
    // Remote push: Supabase webhook on sticky_notes INSERT → send-sticky-note-push
    broadcastDataRefresh(coupleId, 'sticky_notes');
    return data;
  },

  async getPhotos(coupleId) {
    return readThroughCache(cacheKeys.photos(coupleId), async () => {
      const cek = await ensureCoupleKey(coupleId);
      const { data, error } = await supabase
        .from('photo_wall')
        .select('*')
        .eq('couple_id', coupleId)
        .order('created_at', { ascending: false });
      if (error) {
        console.error("Error fetching photos:", error.message);
        return [];
      }
      return decryptRowsTexts(cek, data || [], ['caption']);
    });
  },

  async getPhotosWithUrls(coupleId, expiresIn = 3600) {
    return readThroughCache(cacheKeys.photosWithUrls(coupleId), async () => {
      const photos = await this.getPhotos(coupleId);
      const withUrls = await Promise.all(
        photos.map(async (photo) => {
          const url = await resolvePhotoDisplayUrl(
            coupleId,
            photo.storage_path,
            photo.encryption_meta,
            expiresIn,
          );
          return { ...photo, imageUrl: url };
        })
      );
      return withUrls.filter((p) => p.imageUrl);
    });
  },

  async getPhotoSignedUrl(storagePath, expiresIn = 3600, coupleId = null, encryptionMeta = null) {
    if (coupleId && encryptionMeta) {
      return resolvePhotoDisplayUrl(coupleId, storagePath, encryptionMeta, expiresIn);
    }
    const cached = getCachedSignedUrl(storagePath);
    if (cached) return cached;

    const { data, error } = await supabase.storage
      .from('memories')
      .createSignedUrl(storagePath, expiresIn);
    if (error) {
      console.error("Error creating signed URL:", error.message);
      return null;
    }
    setCachedSignedUrl(storagePath, data.signedUrl, expiresIn);
    return data.signedUrl;
  },

  /**
   * Subscribe to postgres_changes for a couple-scoped table.
   * Multiple listeners can share one channel (avoids "cannot add callbacks after subscribe").
   * @returns {() => void} unsubscribe
   */
  subscribeToCoupleTable(coupleId, table, onChange) {
    if (!REALTIME_TABLES.includes(table)) {
      console.warn(`[realtime] Unknown table "${table}"`);
      return () => {};
    }

    const entry = getCoupleSyncEntry(coupleId);
    entry.listeners[table].add(onChange);

    return () => {
      entry.listeners[table].delete(onChange);
      if (getActiveListenerCount(entry) === 0) {
        teardownCoupleChannel(coupleId);
      }
    };
  },

  /** Push a live refresh to the partner when postgres replication is off or delayed */
  notifyPartnerRefresh(coupleId, table) {
    broadcastDataRefresh(coupleId, table);
  },

  /**
   * Fetches all active, uncleared sticky notes left by the OTHER partner.
   */
  async getActiveIncomingNotes(coupleId, currentUserId) {
    return readThroughCache(cacheKeys.stickyNotes(coupleId, currentUserId), async () => {
      const cek = await ensureCoupleKey(coupleId);
      const { data, error } = await supabase
        .from('sticky_notes')
        .select('*')
        .eq('couple_id', coupleId)
        .neq('author_id', currentUserId)
        .eq('is_cleared', false)
        .order('created_at', { ascending: true });

      if (error) console.error("Error fetching sticky notes:", error.message);
      return decryptRowsTexts(cek, data || [], ['content']);
    });
  },

  /**
   * Dismisses a note so it stops populating on login.
   */
  async clearStickyNote(noteId) {
    const { data, error } = await supabase
      .from('sticky_notes')
      .update({ is_cleared: true })
      .eq('id', noteId)
      .select();

    if (error) console.error("Error clearing sticky note:", error.message);
    else if (data?.[0]?.couple_id) broadcastDataRefresh(data[0].couple_id, 'sticky_notes');
    return data;
  },

  /**
   * Fetches all current items on the shared to-do list.
   */
  async getTodos(coupleId) {
    return readThroughCache(cacheKeys.todos(coupleId), async () => {
      const cek = await ensureCoupleKey(coupleId);
      const { data, error } = await supabase
        .from('todos')
        .select('*')
        .eq('couple_id', coupleId)
        .order('created_at', { ascending: false });

      if (error) console.error("Error fetching to-dos:", error.message);
      return decryptRowsTexts(cek, data || [], ['task']);
    });
  },

  /**
   * Uploads an image file to the private storage bucket and logs it to the photo wall.
   */
  async uploadPhotoToWall(coupleId, userId, file, caption = "", sourceType = "photo") {
    try {
      const cek = await ensureCoupleKey(coupleId);
      const isRnPick =
        file &&
        typeof file === 'object' &&
        'uri' in file &&
        typeof file.uri === 'string';
      const isArrayBuffer = file instanceof ArrayBuffer;

      let filePath;
      /** @type {Blob | ArrayBuffer | File} */
      let uploadPayload;
      /** @type {{ contentType?: string }} */
      let uploadOpts = {};

      if (isArrayBuffer) {
        uploadOpts.contentType = 'image/png';
        uploadPayload = file;
        filePath = `${coupleId}/${Date.now()}.png`;
      } else if (isRnPick) {
        const mime =
          file.mimeType ||
          (typeof file.uri === 'string' && file.uri.endsWith('.png')
            ? 'image/png'
            : 'image/jpeg');
        uploadOpts.contentType = mime;
        uploadPayload = await fetch(file.uri).then((r) => r.arrayBuffer());
        const guessExt = mime.includes('png')
          ? 'png'
          : mime.includes('webp')
          ? 'webp'
          : 'jpeg';
        filePath = `${coupleId}/${Date.now()}.${guessExt}`;
      } else {
        const fileExtension = file.name.split('.').pop();
        filePath = `${coupleId}/${Date.now()}.${fileExtension}`;
        uploadPayload = file;
      }

      let encryptionMeta = null;
      if (cek && uploadPayload) {
        const raw =
          uploadPayload instanceof ArrayBuffer
            ? new Uint8Array(uploadPayload)
            : uploadPayload instanceof Uint8Array
            ? uploadPayload
            : new Uint8Array(await uploadPayload.arrayBuffer?.() ?? uploadPayload);
        const mime = uploadOpts.contentType || 'image/jpeg';
        uploadPayload = encryptBytes(cek, raw);
        // Keep image/* content-type — memories bucket rejects application/octet-stream.
        uploadOpts.contentType = mime;
        encryptionMeta = { v: 1, mime };
      }

      const { error: storageError } = await supabase.storage
        .from('memories')
        .upload(filePath, uploadPayload, {
          upsert: false,
          ...uploadOpts,
        });

      if (storageError) {
        throw new Error(
          storageError.message?.includes('row-level security')
            ? 'Storage blocked by policy — allow authenticated uploads on the memories bucket.'
            : storageError.message
        );
      }

      const { data: dbData, error: dbError } = await supabase
        .from('photo_wall')
        .insert({
          couple_id: coupleId,
          uploaded_by: userId,
          storage_path: filePath,
          caption: maybeEncryptText(cek, caption),
          source_type: sourceType,
          encryption_meta: encryptionMeta,
        })
        .select();

      if (dbError) throw dbError;
      broadcastDataRefresh(coupleId, 'photo_wall');
      return dbData;
    } catch (error) {
      console.error("Failed to add photo to wall:", error.message);
      throw error;
    }
  },

  /**
   * Complete Ephemeral Wipe: Permanently removes the file from storage and drops the data row.
   */
  async wipePhotoFromServer(photoId, storagePath, coupleId) {
    try {
      const { error: storageError } = await supabase.storage
        .from('memories')
        .remove([storagePath]);

      if (storageError) throw storageError;

      const { error: dbError } = await supabase
        .from('photo_wall')
        .delete()
        .eq('id', photoId);

      if (dbError) throw dbError;
      if (coupleId) broadcastDataRefresh(coupleId, 'photo_wall');
      return true;
    } catch (error) {
      console.error("Wipe operation failed:", error.message);
      return false;
    }
  },

  /**
   * Active jam sessions (meet / teleparty / spotify) — one open row per type.
   */
  async getActiveJamSessions(coupleId) {
    return readThroughCache(cacheKeys.jamSessions(coupleId), async () => {
      const cek = await ensureCoupleKey(coupleId);
      const { data, error } = await supabase
        .from('link_drops')
        .select('*')
        .eq('couple_id', coupleId)
        .eq('is_open', true)
        .order('created_at', { ascending: false });

      if (error) {
        console.error("Error fetching jam sessions:", error.message);
        return [];
      }
      return (data || []).map((row) =>
        decryptRowTexts(cek, row, ['title', 'url']),
      );
    });
  },

  async closeJamSessionsOfType(coupleId, sessionType) {
    let query = supabase
      .from('link_drops')
      .update({ is_open: false })
      .eq('couple_id', coupleId)
      .eq('is_open', true);

    const { error } = await query.eq('session_type', sessionType);
    if (!error) return;

    const { data: open } = await supabase
      .from('link_drops')
      .select('id, title')
      .eq('couple_id', coupleId)
      .eq('is_open', true);

    const cek = await ensureCoupleKey(coupleId);
    const tag = `[${sessionType}]`;
    const toClose = (open || [])
      .map((r) => decryptRowTexts(cek, r, ['title']))
      .filter((r) => String(r.title ?? '').startsWith(tag))
      .map((r) => r.id as string);
    if (toClose.length === 0) return;

    await supabase.from('link_drops').update({ is_open: false }).in('id', toClose);
  },

  async startJamSession(coupleId, userId, sessionType, title, url) {
    await this.closeJamSessionsOfType(coupleId, sessionType);
    const cek = await ensureCoupleKey(coupleId);

    const encodedTitle = `[${sessionType}] ${title}`;
    const row = {
      couple_id: coupleId,
      creator_id: userId,
      title: maybeEncryptText(cek, encodedTitle),
      url: maybeEncryptText(cek, url.trim()),
      is_open: true,
      session_type: sessionType,
    };

    let { data, error } = await supabase.from('link_drops').insert(row).select().single();

    if (error?.message?.includes('session_type')) {
      const { session_type: _s, ...withoutType } = row;
      ({ data, error } = await supabase.from('link_drops').insert(withoutType).select().single());
    }

    if (error) {
      console.error("Error starting jam session:", error.message);
      throw error;
    }
    broadcastDataRefresh(coupleId, 'link_drops');
    return data;
  },

  async endJamSession(linkId) {
    const { data, error } = await supabase
      .from('link_drops')
      .update({ is_open: false })
      .eq('id', linkId)
      .select();

    if (error) console.error("Error closing link drop:", error.message);
    else if (data?.[0]?.couple_id) broadcastDataRefresh(data[0].couple_id, 'link_drops');
    return data;
  },

  /**
   * Configures or updates the user's custom trigger settings in the database.
   */
  async saveTriggerConfig(coupleId, userId, type, payloadObj) {
    const cek = await ensureCoupleKey(coupleId);
    const { data, error } = await supabase
      .from('dynamic_triggers')
      .upsert(
        {
          couple_id: coupleId,
          creator_id: userId,
          trigger_type: type,
          payload: maybeEncryptJson(cek, payloadObj),
        },
        { onConflict: 'couple_id,creator_id' }
      )
      .select();

    if (error) console.error("Error saving trigger configuration:", error.message);
    return data;
  },

  async getTriggerConfigs(coupleId) {
    const cek = await ensureCoupleKey(coupleId);
    const { data, error } = await supabase
      .from('dynamic_triggers')
      .select('*')
      .eq('couple_id', coupleId);

    if (error) console.error("Error fetching trigger configurations:", error.message);
    return (data || []).map((row) => ({
      ...row,
      payload: maybeDecryptJson(cek, row.payload) ?? {},
    }));
  },

  _getCoupleBroadcastEntry(coupleId) {
    const topic = `couple_room:${coupleId}`;
    if (!coupleBroadcastChannels.has(topic)) {
      const listeners = new Set();
      const channel = supabase
        .channel(topic, { config: { broadcast: { self: false } } })
        .on('broadcast', { event: 'signal_pulse' }, ({ payload }) => {
          listeners.forEach((fn) => {
            void decryptBroadcastPayload(coupleId, payload).then(fn);
          });
        })
        .subscribe();
      coupleBroadcastChannels.set(topic, { channel, listeners });
    }
    return coupleBroadcastChannels.get(topic);
  },

  /**
   * Broadcasts an instant, live signal to the partner's screen.
   */
  sendLiveSignal(coupleId, payload) {
    const { channel } = this._getCoupleBroadcastEntry(coupleId);
    const transmit = () =>
      void encryptBroadcastPayload(coupleId, payload).then((encPayload) =>
        channel.send({
          type: 'broadcast',
          event: 'signal_pulse',
          payload: encPayload,
        }),
      );

    if (channel.state === 'joined') {
      transmit();
      return;
    }

    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') transmit();
    });
  },

  /**
   * Listen for partner trigger pulses over WebSocket broadcast.
   * @returns {() => void} unsubscribe
   */
  listenForIncomingSignals(coupleId, onSignalReceived) {
    const topic = `couple_room:${coupleId}`;
    const entry = this._getCoupleBroadcastEntry(coupleId);
    entry.listeners.add(onSignalReceived);

    return () => {
      entry.listeners.delete(onSignalReceived);
      if (entry.listeners.size === 0) {
        supabase.removeChannel(entry.channel);
        coupleBroadcastChannels.delete(topic);
      }
    };
  },
  
  async getDiaryDates(coupleId) {
    return readThroughCache(cacheKeys.diaryDates(coupleId), async () => {
      const cek = await ensureCoupleKey(coupleId);
      const { data, error } = await supabase
        .from('date_diary')
        .select(`
        *,
        date_diary_notes (
          id,
          user_id,
          notes,
          rating,
          created_at
        ),
        date_diary_photos (
          id,
          photo_id,
          photo_wall (
            id,
            storage_path,
            caption,
            uploaded_by,
            created_at
          )
        )
      `)
        .eq('couple_id', coupleId)
        .order('scheduled_date', { ascending: false });

      if (error) {
        console.error('Error fetching diary dates:', error.message);
        throw error;
      }

      const rows = data || [];
      const enriched = await Promise.all(
        rows.map(async (date) => {
          const photos = await Promise.all(
            (date.date_diary_photos || []).map(async (link) => {
              const wall = link.photo_wall;
              if (!wall) return null;
              const imageUrl = await resolvePhotoDisplayUrl(
                coupleId,
                wall.storage_path,
                wall.encryption_meta,
              );
              if (!imageUrl) return null;
              return {
                ...link,
                photo_wall: {
                  ...decryptRowTexts(cek, wall, ['caption']),
                  imageUrl,
                },
              };
            })
          );
          return {
            ...decryptRowTexts(cek, date, ['title', 'location']),
            notes: (date.date_diary_notes || [])
              .map((n) => decryptRowTexts(cek, n, ['notes']))
              .sort((a, b) => new Date(a.created_at) - new Date(b.created_at)),
            photos: photos.filter(Boolean),
          };
        })
      );

      return enriched;
    });
  },

  async createDiaryDate(coupleId, payload) {
    const cek = await ensureCoupleKey(coupleId);
    const { data, error } = await supabase
      .from('date_diary')
      .insert({
        couple_id: coupleId,
        title: maybeEncryptText(cek, payload.title.trim()),
        scheduled_date: payload.scheduled_date,
        location: payload.location?.trim()
          ? maybeEncryptText(cek, payload.location.trim())
          : null,
        is_completed: false,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating diary date:', error.message);
      throw error;
    }
    broadcastDataRefresh(coupleId, 'date_diary');
    return data;
  },

  async updateDiaryDate(dateId, coupleId, updates) {
    const cek = await ensureCoupleKey(coupleId);
    const encUpdates = { ...updates };
    if (typeof encUpdates.title === 'string') {
      encUpdates.title = maybeEncryptText(cek, encUpdates.title);
    }
    if (typeof encUpdates.location === 'string') {
      encUpdates.location = maybeEncryptText(cek, encUpdates.location);
    }
    const { data, error } = await supabase
      .from('date_diary')
      .update(encUpdates)
      .eq('id', dateId)
      .select()
      .single();

    if (error) {
      console.error('Error updating diary date:', error.message);
      throw error;
    }
    if (coupleId) broadcastDataRefresh(coupleId, 'date_diary');
    return data;
  },

  async toggleDateCompletion(dateId, isCompleted, coupleId) {
    const { data, error } = await supabase
      .from('date_diary')
      .update({ is_completed: isCompleted })
      .eq('id', dateId)
      .select()
      .single();

    if (error) {
      console.error('Error toggling date completion:', error.message);
      throw error;
    }
    if (coupleId) broadcastDataRefresh(coupleId, 'date_diary');
    return data;
  },

  async deleteDiaryDate(dateId, coupleId) {
    const { error } = await supabase.from('date_diary').delete().eq('id', dateId);
    if (error) {
      console.error('Error deleting diary date:', error.message);
      throw error;
    }
    if (coupleId) broadcastDataRefresh(coupleId, 'date_diary');
  },

  async saveDiaryNote(dateId, userId, notes, rating = null, coupleId = null) {
    const cek = coupleId ? await ensureCoupleKey(coupleId) : null;
    const { data, error } = await supabase
      .from('date_diary_notes')
      .upsert(
        {
          date_diary_id: dateId,
          user_id: userId,
          notes: maybeEncryptText(cek, notes.trim()),
          rating: rating || null,
        },
        { onConflict: 'date_diary_id,user_id' }
      )
      .select()
      .single();

    if (error) {
      console.error('Error saving diary note:', error.message);
      throw error;
    }
    return data;
  },

  /** Appends a new reflection (schema allows one row per user — we thread with timestamps). */
  async appendDiaryNote(dateId, userId, newNote, rating = null, coupleId) {
    const cek = coupleId ? await ensureCoupleKey(coupleId) : null;
    const { data: existing } = await supabase
      .from('date_diary_notes')
      .select('notes, rating')
      .eq('date_diary_id', dateId)
      .eq('user_id', userId)
      .maybeSingle();

    const stamp = new Date().toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
    const prior = existing?.notes ? maybeDecryptText(cek, existing.notes) : '';
    const combined = prior
      ? `${prior}\n\n— ${stamp}\n${newNote.trim()}`
      : newNote.trim();

    const data = await this.saveDiaryNote(
      dateId,
      userId,
      combined,
      rating ?? existing?.rating ?? null,
      coupleId,
    );
    if (coupleId) broadcastDataRefresh(coupleId, 'date_diary');
    return data;
  },

  async linkPhotoToDiaryDate(dateDiaryId, photoId, coupleId) {
    const { error } = await supabase
      .from('date_diary_photos')
      .insert({ date_diary_id: dateDiaryId, photo_id: photoId });

    if (error) {
      console.error('Error linking photo to date:', error.message);
      throw error;
    }
    if (coupleId) {
      broadcastDataRefresh(coupleId, 'date_diary');
      broadcastDataRefresh(coupleId, 'photo_wall');
    }
  },

  async uploadPhotoToDiaryDate(coupleId, userId, dateDiaryId, file, caption = '') {
    const inserted = await this.uploadPhotoToWall(coupleId, userId, file, caption);
    const photoRow = Array.isArray(inserted) ? inserted[0] : inserted;
    if (!photoRow?.id) throw new Error('Photo upload did not return an id');
    await this.linkPhotoToDiaryDate(dateDiaryId, photoRow.id, coupleId);
    return photoRow;
  },

  /** Map photo_wall id → date label for polaroid pins on the wall. */
  async getPhotoDateTags(coupleId) {
    return readThroughCache(cacheKeys.photoDateTags(coupleId), async () => {
      const cek = await ensureCoupleKey(coupleId);
      const { data, error } = await supabase
        .from('date_diary')
        .select(
          `
        title,
        scheduled_date,
        date_diary_photos ( photo_id )
      `
        )
        .eq('couple_id', coupleId);

      if (error) {
        console.error('Error fetching photo date tags:', error.message);
        return {};
      }

      const map = {};
      for (const diary of data || []) {
        const title = maybeDecryptText(cek, diary.title);
        for (const link of diary.date_diary_photos || []) {
          map[link.photo_id] = {
            title,
            scheduled_date: diary.scheduled_date,
          };
        }
      }
      return map;
    });
  },

  async getDoodleCanvas(coupleId, userId) {
    return readThroughCache(cacheKeys.doodleCanvas(coupleId), async () => {
      const cek = await ensureCoupleKey(coupleId);
      const { data, error } = await supabase
        .from('doodle_canvas')
        .select('*')
        .eq('couple_id', coupleId)
        .maybeSingle();

      if (error) {
        console.error('Error fetching doodle canvas:', error.message);
        return null;
      }

      const normalize = (row) => {
        if (!row) return row;
        const strokes = maybeDecryptJson(cek, row.strokes);
        return { ...row, strokes: Array.isArray(strokes) ? strokes : [] };
      };

      if (data) return normalize(data);

      const { data: inserted, error: insertError } = await supabase
        .from('doodle_canvas')
        .insert({
          couple_id: coupleId,
          strokes: [],
          version: 1,
          updated_by: userId,
        })
        .select()
        .single();

      if (insertError) {
        if (insertError.code === '23505') {
          const { data: existing } = await supabase
            .from('doodle_canvas')
            .select('*')
            .eq('couple_id', coupleId)
            .single();
          return normalize(existing);
        }
        console.error('Error creating doodle canvas:', insertError.message);
        return null;
      }
      return normalize(inserted);
    });
  },

  async persistDoodleCanvas(coupleId, userId, strokes, expectedVersion) {
    const cek = await ensureCoupleKey(coupleId);
    const encStrokes = strokes?.length ? maybeEncryptJson(cek, strokes) : [];
    const { data: current } = await supabase
      .from('doodle_canvas')
      .select('*')
      .eq('couple_id', coupleId)
      .maybeSingle();

    if (!current) {
      const { data, error } = await supabase
        .from('doodle_canvas')
        .insert({
          couple_id: coupleId,
          strokes: encStrokes,
          version: 1,
          updated_by: userId,
          updated_at: new Date().toISOString(),
        })
        .select()
        .single();
      if (error) throw error;
      broadcastDataRefresh(coupleId, 'doodle_canvas');
      return { data, conflict: false };
    }

    if (current.version !== expectedVersion) {
      return { data: { ...current, strokes: maybeDecryptJson(cek, current.strokes) ?? [] }, conflict: true };
    }

    const { data, error } = await supabase
      .from('doodle_canvas')
      .update({
        strokes: encStrokes,
        version: expectedVersion + 1,
        updated_by: userId,
        updated_at: new Date().toISOString(),
      })
      .eq('couple_id', coupleId)
      .eq('version', expectedVersion)
      .select()
      .single();

    if (error) throw error;
    if (!data) {
      const { data: remote } = await supabase
        .from('doodle_canvas')
        .select('*')
        .eq('couple_id', coupleId)
        .single();
      return { data: { ...remote, strokes: maybeDecryptJson(cek, remote?.strokes) ?? [] }, conflict: true };
    }

    broadcastDataRefresh(coupleId, 'doodle_canvas');
    return { data: { ...data, strokes: maybeDecryptJson(cek, data.strokes) ?? [] }, conflict: false };
  },

  broadcastDoodleEvent(coupleId, event, payload) {
    const entry = getCoupleSyncEntry(coupleId);
    const transmit = () =>
      void encryptBroadcastPayload(coupleId, payload).then((encPayload) =>
        entry.channel.send({
          type: 'broadcast',
          event,
          payload: encPayload,
        }),
      );

    if (entry.channel.state === 'joined') {
      transmit();
      return;
    }

    entry.channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') transmit();
    });
  },

  subscribeToDoodleEvents(coupleId, onEvent) {
    const entry = getCoupleSyncEntry(coupleId);
    entry.doodleListeners.add(onEvent);

    return () => {
      entry.doodleListeners.delete(onEvent);
      if (getActiveListenerCount(entry) === 0) {
        teardownCoupleChannel(coupleId);
      }
    };
  },

  async saveDoodleSnapshot(coupleId, userId, pngBytes, caption = '') {
    return this.uploadPhotoToWall(coupleId, userId, pngBytes, caption, 'doodle');
  },

  async getSavedDoodles(coupleId, expiresIn = 3600) {
    return readThroughCache(cacheKeys.savedDoodles(coupleId), async () => {
      const photos = await this.getPhotos(coupleId);
      const doodles = photos.filter((p) => p.source_type === 'doodle');
      const withUrls = await Promise.all(
        doodles.map(async (row) => {
          const url = await resolvePhotoDisplayUrl(
            coupleId,
            row.storage_path,
            row.encryption_meta,
            expiresIn,
          );
          return url ? { ...row, imageUrl: url } : null;
        })
      );
      return withUrls.filter(Boolean);
    });
  },

  /** Warm common couple reads after login so modules render from cache first. */
  async prefetchCoupleData(coupleId, userId) {
    if (!coupleId || !userId) return;
    await ensureCoupleKey(coupleId);
    if (getMigrationVersion() < MIGRATION_TARGET_VERSION) {
      void migrateCoupleContent(coupleId);
    }
    await Promise.allSettled([
      this.getMoods(coupleId),
      this.getTodos(coupleId),
      this.getFlipLetters(coupleId),
      this.getPhotosWithUrls(coupleId),
      this.getDiaryDates(coupleId),
      this.getActiveJamSessions(coupleId),
      this.getNamesFromCouple(coupleId, userId),
      this.getActiveIncomingNotes(coupleId, userId),
      this.getPhotoDateTags(coupleId),
      this.getDoodleCanvas(coupleId, userId),
    ]);
  },

  async getUserDisplayName(coupleId, userId) {
    const names = await this.getNamesFromCouple(coupleId, userId);
    if (typeof names === 'object' && names !== null) {
      return names.myName || 'You';
    }
    return 'Partner';
  },

  async getPartnerDisplayName(coupleId, userId) {
    const names = await this.getNamesFromCouple(coupleId, userId);
    if (typeof names === 'object' && names !== null) {
      return names.partnerName || 'Partner';
    }
    return 'Partner';
  },

  resolveSaverName(coupleId, currentUserId, uploadedBy, names) {
    if (uploadedBy === currentUserId) return names.myName || 'You';
    return names.partnerName || 'Partner';
  },
};