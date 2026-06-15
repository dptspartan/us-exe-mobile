export const JAM_SESSION_TYPES = [
  {
    id: 'meet',
    label: 'Meet',
    icon: '📹',
    hint: 'Zoom, Meet, FaceTime…',
    placeholder: 'https://meet.google.com/...',
  },
  {
    id: 'teleparty',
    label: 'Teleparty',
    icon: '🎬',
    hint: 'Watch-together link',
    placeholder: 'https://…',
  },
  {
    id: 'spotify',
    label: 'Spotify',
    icon: '🎧',
    hint: 'Jam or playlist link',
    placeholder: 'https://open.spotify.com/...',
  },
] as const;

const SESSION_TAG = /^\[(meet|teleparty|spotify)\]\s*(.*)$/i;

export function normalizeJamRow(row: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!row) return null;
  const r = row as Record<string, unknown>;
  if (r.session_type) {
    return {
      ...r,
      session_type: String(r.session_type).toLowerCase(),
      displayTitle:
        String(r.title || '')
          .replace(SESSION_TAG, '$2')
          .trim() || String(r.title),
    };
  }
  const match = String(r.title || '').match(SESSION_TAG);
  if (match) {
    return {
      ...r,
      session_type: match[1].toLowerCase(),
      displayTitle: match[2].trim() || 'Shared session',
    };
  }
  return { ...r, session_type: 'spotify', displayTitle: r.title };
}

export function groupSessionsByType(rows: unknown[]) {
  const map: Record<string, Record<string, unknown> | null> = Object.fromEntries(
    JAM_SESSION_TYPES.map((t) => [t.id, null])
  );
  for (const row of rows || []) {
    const normalized = normalizeJamRow(row as Record<string, unknown>);
    if (
      normalized &&
      normalized.is_open !== false &&
      normalized.session_type &&
      map[String(normalized.session_type)] === null
    ) {
      map[String(normalized.session_type)] = normalized;
    }
  }
  return map;
}
