// @ts-nocheck — ported from web `NetworkUtils.js`; kept loose for parity with Supabase payloads.
import { supabase } from '../lib/supabase';

/** Tables that sync live across both partners */
const REALTIME_TABLES = [
  'moods',
  'todos',
  'sticky_notes',
  'photo_wall',
  'link_drops',
  'flip_letters',
  'date_diary',
];

const coupleSyncChannels = new Map();
const coupleBroadcastChannels = new Map();

function getCoupleSyncEntry(coupleId) {
  if (coupleSyncChannels.has(coupleId)) {
    return coupleSyncChannels.get(coupleId);
  }

  const listeners = Object.fromEntries(REALTIME_TABLES.map((t) => [t, new Set()]));

  const channel = supabase.channel(`couple-sync:${coupleId}`, {
    config: { broadcast: { self: false } },
  });

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

  channel.subscribe((status, err) => {
    if (__DEV__) {
      console.log(`[realtime couple-sync:${coupleId}]`, status, err?.message ?? '');
    }
    if (status === 'CHANNEL_ERROR' || err) {
      console.error('[realtime] channel error:', err?.message ?? status);
    }
  });

  const entry = { channel, listeners, refCount: 0 };
  coupleSyncChannels.set(coupleId, entry);
  return entry;
}

function broadcastDataRefresh(coupleId, table) {
  if (!coupleId || !REALTIME_TABLES.includes(table)) return;
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

// 2. Network Utility Wrapper Functions
export const networkUtility = {
  /**
   * Quick check to see if a user session exists.
   * @returns {Promise<Object|null>} The authenticated user object or null.
   */
  async getCurrentUser() {
    const { data: { user }, error } = await supabase.auth.getUser();
    console.log("Session check result:", { user, error });
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
    try {
      if (!userId) throw new Error("User ID parameter is missing.");

      // Explicitly check both columns inside the query itself
      const { data, error } = await supabase
        .from('couples')
        .select('*')
        .or(`partner_1_id.eq.${userId},partner_2_id.eq.${userId}`)
        .maybeSingle(); // Cleanly returns null if not paired yet

      if (error) throw error;
      return data;
    } catch (error) {
      console.error("NetworkUtility [getCoupleProfile] failed:", error.message);
      return null;
    }
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
  },

  /**
   * Updates or inserts (Upserts) the current user's flip letter.
   */
  async updateFlipLetter(coupleId, authorId, textContent) {
    const { data, error } = await supabase
      .from('flip_letters')
      .upsert(
        { couple_id: coupleId, author_id: authorId, content: textContent, updated_at: new Date() },
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
    const { data, error } = await supabase
      .from('moods')
      .select('*')
      .eq('couple_id', coupleId);
    if (error) {
      console.error("Error fetching moods:", error.message);
      return [];
    }
    return data || [];
  },
  
  async getNamesFromCouple(coupleId, currentUserId) {
    try {
      const { data, error } = await supabase
        .from('couples')
        .select('partner_1_id, partner_2_id, partner_1_name, partner_2_name') // <-- Swap these with your exact column names if different
        .eq('id', coupleId)
        .single();
  
      if (error) throw error;
      if (!data) return 'Partner';
  
      // If you are user 1, return user 2's name. Otherwise, return user 1's name.
      const isUser1 = data.partner_1_id === currentUserId;
      const partnerName = isUser1 ? data.partner_2_name : data.partner_1_name;
      const myName = isUser1 ? data.partner_1_name : data.partner_2_name;
      return {partnerName: partnerName, myName: myName};
      
      
    } catch (error) {
      console.error("Error fetching partner name from couples:", error.message);
      return {partnerName: 'Partner', myName: 'You'}; // Safe fallback so your UI doesn't crash if the network hiccups
    }
  },

  async getFlipLetters(coupleId) {
    const { data, error } = await supabase
      .from('flip_letters')
      .select('*')
      .eq('couple_id', coupleId);
    if (error) {
      console.error("Error fetching flip letters:", error.message);
      return [];
    }
    return data || [];
  },

  async createTodo(coupleId, task) {
    const { data, error } = await supabase
      .from('todos')
      .insert({ couple_id: coupleId, task, is_completed: false })
      .select()
      .single();
    if (error) {
      console.error("Error creating todo:", error.message);
      throw error;
    }
    broadcastDataRefresh(coupleId, 'todos');
    return data;
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
    const { data, error } = await supabase
      .from('sticky_notes')
      .insert({
        couple_id: coupleId,
        author_id: authorId,
        content,
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
    const { data, error } = await supabase
      .from('photo_wall')
      .select('*')
      .eq('couple_id', coupleId)
      .order('created_at', { ascending: false });
    if (error) {
      console.error("Error fetching photos:", error.message);
      return [];
    }
    return data || [];
  },

  async getPhotosWithUrls(coupleId, expiresIn = 3600) {
    const photos = await this.getPhotos(coupleId);
    const withUrls = await Promise.all(
      photos.map(async (photo) => {
        const url = await this.getPhotoSignedUrl(photo.storage_path, expiresIn);
        return { ...photo, imageUrl: url };
      })
    );
    return withUrls.filter((p) => p.imageUrl);
  },

  async getPhotoSignedUrl(storagePath, expiresIn = 3600) {
    const { data, error } = await supabase.storage
      .from('memories')
      .createSignedUrl(storagePath, expiresIn);
    if (error) {
      console.error("Error creating signed URL:", error.message);
      return null;
    }
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
    entry.refCount += 1;

    return () => {
      entry.listeners[table].delete(onChange);
      entry.refCount -= 1;
      if (entry.refCount <= 0) {
        supabase.removeChannel(entry.channel);
        coupleSyncChannels.delete(coupleId);
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
    const { data, error } = await supabase
      .from('sticky_notes')
      .select('*')
      .eq('couple_id', coupleId)
      .neq('author_id', currentUserId)
      .eq('is_cleared', false)
      .order('created_at', { ascending: true });

    if (error) console.error("Error fetching sticky notes:", error.message);
    return data || [];
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
    const { data, error } = await supabase
      .from('todos')
      .select('*')
      .eq('couple_id', coupleId)
      .order('created_at', { ascending: false });

    if (error) console.error("Error fetching to-dos:", error.message);
    return data || [];
  },

  /**
   * Uploads an image file to the private storage bucket and logs it to the photo wall.
   */
  async uploadPhotoToWall(coupleId, userId, file, caption = "") {
    try {
      const isRnPick =
        file &&
        typeof file === 'object' &&
        'uri' in file &&
        typeof file.uri === 'string';

      let filePath;
      /** @type {Blob | ArrayBuffer | File} */
      let uploadPayload;
      /** @type {{ contentType?: string }} */
      let uploadOpts = {};

      if (isRnPick) {
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
          caption: caption
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
    return data || [];
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

    const tag = `[${sessionType}]`;
    const toClose = (open || []).filter((r) => r.title?.startsWith(tag)).map((r) => r.id);
    if (toClose.length === 0) return;

    await supabase.from('link_drops').update({ is_open: false }).in('id', toClose);
  },

  async startJamSession(coupleId, userId, sessionType, title, url) {
    await this.closeJamSessionsOfType(coupleId, sessionType);

    const encodedTitle = `[${sessionType}] ${title}`;
    const row = {
      couple_id: coupleId,
      creator_id: userId,
      title: encodedTitle,
      url: url.trim(),
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
    const { data, error } = await supabase
      .from('dynamic_triggers')
      .upsert(
        { couple_id: coupleId, creator_id: userId, trigger_type: type, payload: payloadObj },
        { onConflict: 'couple_id,creator_id' }
      )
      .select();

    if (error) console.error("Error saving trigger configuration:", error.message);
    return data;
  },

  /**
   * Fetches the current configurations for both partners' buttons.
   */
  async getTriggerConfigs(coupleId) {
    const { data, error } = await supabase
      .from('dynamic_triggers')
      .select('*')
      .eq('couple_id', coupleId);

    if (error) console.error("Error fetching trigger configurations:", error.message);
    return data || [];
  },

  _getCoupleBroadcastEntry(coupleId) {
    const topic = `couple_room:${coupleId}`;
    if (!coupleBroadcastChannels.has(topic)) {
      const listeners = new Set();
      const channel = supabase
        .channel(topic, { config: { broadcast: { self: false } } })
        .on('broadcast', { event: 'signal_pulse' }, ({ payload }) => {
          listeners.forEach((fn) => fn(payload));
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
      channel.send({
        type: 'broadcast',
        event: 'signal_pulse',
        payload,
      });

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
            const imageUrl = await this.getPhotoSignedUrl(wall.storage_path);
            if (!imageUrl) return null;
            return { ...link, photo_wall: { ...wall, imageUrl } };
          })
        );
        return {
          ...date,
          notes: (date.date_diary_notes || []).sort(
            (a, b) => new Date(a.created_at) - new Date(b.created_at)
          ),
          photos: photos.filter(Boolean),
        };
      })
    );

    return enriched;
  },

  async createDiaryDate(coupleId, payload) {
    const { data, error } = await supabase
      .from('date_diary')
      .insert({
        couple_id: coupleId,
        title: payload.title.trim(),
        scheduled_date: payload.scheduled_date,
        location: payload.location?.trim() || null,
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
    const { data, error } = await supabase
      .from('date_diary')
      .update(updates)
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

  async saveDiaryNote(dateId, userId, notes, rating = null) {
    const { data, error } = await supabase
      .from('date_diary_notes')
      .upsert(
        {
          date_diary_id: dateId,
          user_id: userId,
          notes: notes.trim(),
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
    const combined = existing?.notes
      ? `${existing.notes}\n\n— ${stamp}\n${newNote.trim()}`
      : newNote.trim();

    const data = await this.saveDiaryNote(
      dateId,
      userId,
      combined,
      rating ?? existing?.rating ?? null
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
      for (const link of diary.date_diary_photos || []) {
        map[link.photo_id] = {
          title: diary.title,
          scheduled_date: diary.scheduled_date,
        };
      }
    }
    return map;
  },
};