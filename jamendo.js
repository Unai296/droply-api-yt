/* ═══════════════════════════════════════════════════════════
   DROPLY — jamendo.js  v2.0
   Motor de música Creative Commons vía Jamendo API pública
   100% legal · Catálogo >600.000 canciones CC
═══════════════════════════════════════════════════════════ */

'use strict';

window.JamendoEngine = (() => {

  /* ── Config ──────────────────────────────────────────── */
  const CLIENT_ID = '99daaf40'; // Jamendo public demo client_id (free, CC only)
  const BASE      = 'https://api.jamendo.com/v3.0';
  const CACHE_TTL = 10 * 60 * 1000; // 10 min
  const _cache    = new Map();

  /* ── Genres / Tags ───────────────────────────────────── */
  const GENRES = [
    { tag: 'pop',           label: 'Pop',          color: 'linear-gradient(135deg,#3b82f6,#1d4ed8)' },
    { tag: 'electronic',    label: 'Electronic',   color: 'linear-gradient(135deg,#8b5cf6,#6d28d9)' },
    { tag: 'rock',          label: 'Rock',         color: 'linear-gradient(135deg,#ef4444,#b91c1c)' },
    { tag: 'hiphop',        label: 'Hip-Hop',      color: 'linear-gradient(135deg,#ec4899,#be185d)' },
    { tag: 'jazz',          label: 'Jazz',         color: 'linear-gradient(135deg,#10b981,#065f46)' },
    { tag: 'ambient',       label: 'Ambient',      color: 'linear-gradient(135deg,#6366f1,#312e81)' },
    { tag: 'dance',         label: 'Dance',        color: 'linear-gradient(135deg,#f59e0b,#b45309)' },
    { tag: 'reggae',        label: 'Reggae',       color: 'linear-gradient(135deg,#22c55e,#15803d)' },
    { tag: 'classical',     label: 'Clásica',      color: 'linear-gradient(135deg,#a78bfa,#5b21b6)' },
    { tag: 'folk',          label: 'Folk',         color: 'linear-gradient(135deg,#f97316,#c2410c)' },
    { tag: 'metal',         label: 'Metal',        color: 'linear-gradient(135deg,#475569,#0f172a)' },
    { tag: 'soul',          label: 'Soul',         color: 'linear-gradient(135deg,#e879f9,#86198f)' },
    { tag: 'lounge',        label: 'Lo-Fi',        color: 'linear-gradient(135deg,#67e8f9,#0e7490)' },
    { tag: 'latin',         label: 'Latino',       color: 'linear-gradient(135deg,#fbbf24,#d97706)' },
    { tag: 'country',       label: 'Country',      color: 'linear-gradient(135deg,#84cc16,#3f6212)' },
    { tag: 'blues',         label: 'Blues',        color: 'linear-gradient(135deg,#38bdf8,#075985)' },
  ];

  /* ── Cache helpers ───────────────────────────────────── */
  function _getCached(key) {
    const entry = _cache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.ts > CACHE_TTL) { _cache.delete(key); return null; }
    return entry.data;
  }
  function _setCached(key, data) { _cache.set(key, { ts: Date.now(), data }); }

  /* ── Map Jamendo track → Droply track ────────────────── */
  function _mapTrack(t) {
    if (!t?.audio) return null;
    return {
      type:     'music',
      source:   'jamendo',
      file:     t.audio,          // direct MP3 stream
      stream:   t.audio,
      title:    t.name     || 'Sin título',
      artist:   t.artist_name || 'Artista desconocido',
      album:    t.album_name  || '',
      cover:    t.album_image || t.image || '',
      duration: _fmtSec(t.duration),
      category: _guessCategory(t),
      license:  t.license_ccurl ? _shortLicense(t.license_ccurl) : 'CC',
      jamendoId: t.id,
      artistUrl: t.artist_idstr ? `https://www.jamendo.com/artist/${t.artist_idstr}` : '',
    };
  }

  function _fmtSec(sec) {
    if (!sec || isNaN(sec)) return '';
    const s = Math.floor(sec), m = Math.floor(s / 60);
    return `${m}:${(s % 60).toString().padStart(2, '0')}`;
  }

  function _guessCategory(t) {
    const tags = (t.musicinfo?.tags?.genres || []).join(' ').toLowerCase();
    if (tags.includes('electronic') || tags.includes('techno') || tags.includes('house')) return 'Electronic';
    if (tags.includes('hip') || tags.includes('rap'))     return 'Hip-Hop';
    if (tags.includes('jazz'))                            return 'Jazz';
    if (tags.includes('rock') || tags.includes('metal'))  return 'Rock';
    if (tags.includes('pop'))                             return 'Pop';
    if (tags.includes('dance'))                           return 'Dance-Pop';
    if (tags.includes('reggae') || tags.includes('latin'))return 'Latino';
    if (tags.includes('ambient') || tags.includes('lounge')) return 'Lo-Fi';
    if (tags.includes('folk') || tags.includes('country'))return 'Folk';
    if (tags.includes('classical'))                       return 'Clásica';
    if (tags.includes('soul') || tags.includes('rnb'))    return 'Soul';
    return 'Música';
  }

  function _shortLicense(url = '') {
    if (url.includes('by-nc-nd')) return 'BY-NC-ND';
    if (url.includes('by-nc-sa')) return 'BY-NC-SA';
    if (url.includes('by-nc'))    return 'BY-NC';
    if (url.includes('by-nd'))    return 'BY-ND';
    if (url.includes('by-sa'))    return 'BY-SA';
    if (url.includes('by'))       return 'BY';
    return 'CC';
  }

  /* ── Core fetch ──────────────────────────────────────── */
  async function _fetch(endpoint, params = {}) {
    const p = new URLSearchParams({
      client_id: CLIENT_ID,
      format:    'json',
      limit:     params.limit || 20,
      imagesize: 500,
      audioformat: 'mp32',
      include: 'musicinfo',
      ...params,
    });
    // Remove our pseudo-param
    if (!params.limit) p.delete('limit');

    const url = `${BASE}${endpoint}?${p}`;
    const cached = _getCached(url);
    if (cached) return cached;

    const res  = await fetch(url);
    if (!res.ok) throw new Error(`Jamendo HTTP ${res.status}`);
    const json = await res.json();
    if (json.headers?.status !== 'success') throw new Error(json.headers?.error_message || 'Error Jamendo');
    _setCached(url, json.results || []);
    return json.results || [];
  }

  /* ── Public API ──────────────────────────────────────── */

  /** Get featured / popular tracks */
  async function getFeatured(limit = 30) {
    const raw = await _fetch('/tracks/', {
      order:  'popularity_week',
      limit,
      include: 'musicinfo',
    });
    return raw.map(_mapTrack).filter(Boolean);
  }

  /** Search tracks by text */
  async function search(query, limit = 30) {
    if (!query?.trim()) return [];
    const raw = await _fetch('/tracks/', {
      namesearch: query.trim(),
      order:      'relevance',
      limit,
      include:    'musicinfo',
    });
    return raw.map(_mapTrack).filter(Boolean);
  }

  /** Get tracks by genre tag */
  async function getByTag(tag, limit = 40) {
    const raw = await _fetch('/tracks/', {
      tags:    tag,
      order:   'popularity_month',
      limit,
      include: 'musicinfo',
    });
    return raw.map(_mapTrack).filter(Boolean);
  }

  /** Get tracks for a radio stream (infinite feel, random offset) */
  async function getRadio(tag, limit = 20) {
    const offset = Math.floor(Math.random() * 200);
    const raw = await _fetch('/tracks/', {
      tags:    tag,
      order:   'popularity_month',
      limit,
      offset,
      include: 'musicinfo',
    });
    return raw.map(_mapTrack).filter(Boolean);
  }

  /** Get albums (for MixesManager) */
  async function getAlbums(limit = 24) {
    const raw = await _fetch('/albums/', {
      order:     'popularity_week',
      limit,
      imagesize: 500,
    });
    return (raw || []).map(a => ({
      id:       a.id,
      name:     a.name,
      artist:   a.artist_name,
      cover:    a.image || '',
      releaseDate: a.releasedate || '',
      jamendoId:  a.id,
      artistIdStr: a.artist_idstr,
    })).filter(a => a.cover);
  }

  /** Get tracks of a specific album */
  async function getAlbumTracks(albumId) {
    const raw = await _fetch('/tracks/', {
      album_id: albumId,
      order:    'track_position',
      limit:    50,
      include:  'musicinfo',
    });
    return raw.map(_mapTrack).filter(Boolean);
  }

  /** Return genre list (static) */
  function getGenres() { return GENRES; }

  return { getFeatured, search, getByTag, getRadio, getAlbums, getAlbumTracks, getGenres };

})();