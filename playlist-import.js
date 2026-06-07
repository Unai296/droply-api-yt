/* ═══════════════════════════════════════════════════════════
   DROPLY — playlist-import.js  v1.0
   
   Importador de playlists desde CSV de Exportify
   (https://exportify.net — herramienta gratuita y legal
    para exportar tus playlists de Spotify a CSV)
   
   Flujo:
   1. Usuario va a exportify.net y descarga su playlist .csv
   2. Sube el CSV a Droply
   3. Droply parsea el CSV y busca cada canción en Jamendo
   4. Las que encuentre se añaden a la playlist local
   5. Las que no se encuentren quedan como "no disponibles"
      (Droply solo reproduce CC libre, no Spotify)
═══════════════════════════════════════════════════════════ */

'use strict';

const PlaylistImporter = (() => {

  /* ── Exportify CSV columns ───────────────────────── */
  // Exportify produces: Spotify ID, Artist IDs, Artist Names, Album Artist Names,
  // Track Name, Album Name, Disc Number, Track Number, Track Duration (ms),
  // Added By, Added At, Genres, Danceability, Energy, Key, Loudness, Mode,
  // Speechiness, Acousticness, Instrumentalness, Liveness, Valence, Tempo, Time Signature
  const COL = {
    TRACK_NAME:  'Track Name',
    ARTIST:      'Artist Name(s)',
    ALBUM:       'Album Name',
    DURATION_MS: 'Track Duration (ms)',
    SPOTIFY_URL: 'Spotify URI',
    GENRES:      'Genres',
  };

  /* ── Parse CSV (RFC 4180 compliant) ─────────────── */
  function parseCSV(text) {
    const lines  = [];
    let   cur    = '';
    let   inQ    = false;
    const chars  = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    for (let i = 0; i < chars.length; i++) {
      const c = chars[i];
      if (c === '"') {
        if (inQ && chars[i+1] === '"') { cur += '"'; i++; }
        else inQ = !inQ;
      } else if (c === ',' && !inQ) {
        lines[lines.length - 1]?.push(cur.trim());
        cur = '';
        continue;
      } else if (c === '\n' && !inQ) {
        if (lines.length === 0) lines.push([]);
        lines[lines.length - 1].push(cur.trim());
        lines.push([]);
        cur = '';
        continue;
      } else {
        cur += c;
      }
    }
    if (cur || lines[lines.length-1]?.length) {
      if (lines.length === 0) lines.push([]);
      lines[lines.length-1].push(cur.trim());
    }
    // Remove empty trailing rows
    while (lines.length && lines[lines.length-1].length === 0) lines.pop();
    return lines;
  }

  /* ── Detect Exportify column indices ────────────── */
  function detectColumns(header) {
    const h = header.map(c => c.toLowerCase().trim());
    return {
      track:    h.findIndex(c => c.includes('track name') || c === 'name'),
      artist:   h.findIndex(c => c.includes('artist name') || c === 'artist'),
      album:    h.findIndex(c => c.includes('album name') || c === 'album'),
      duration: h.findIndex(c => c.includes('duration') || c.includes('ms')),
      uri:      h.findIndex(c => c.includes('uri') || c.includes('spotify')),
      genres:   h.findIndex(c => c.includes('genre')),
    };
  }

  /* ── Parse Exportify CSV into track list ─────────── */
  function parseExportifyCSV(text) {
    const rows   = parseCSV(text);
    if (rows.length < 2) throw new Error('CSV vacío o formato incorrecto');

    const header = rows[0];
    const cols   = detectColumns(header);

    if (cols.track === -1 && cols.artist === -1) {
      throw new Error('No se detectaron columnas de Track Name / Artist. ¿Es un CSV de Exportify?');
    }

    const tracks = [];
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.length === 0) continue;

      const trackName  = (cols.track  >= 0 ? row[cols.track]  : '').trim();
      const artistName = (cols.artist >= 0 ? row[cols.artist] : '').trim();
      const albumName  = (cols.album  >= 0 ? row[cols.album]  : '').trim();
      const durationMs = cols.duration >= 0 ? parseInt(row[cols.duration]) || 0 : 0;
      const spotifyUri = (cols.uri    >= 0 ? row[cols.uri]    : '').trim();
      const genres     = (cols.genres >= 0 ? row[cols.genres] : '').trim();

      if (!trackName && !artistName) continue;

      tracks.push({
        trackName,
        artistName,
        albumName,
        durationMs,
        durationFmt: durationMs ? _fmtMs(durationMs) : '',
        spotifyUri,
        genres,
        spotifyId: spotifyUri?.split(':').pop() || '',
      });
    }

    return tracks;
  }

  function _fmtMs(ms) {
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    return `${m}:${(s % 60).toString().padStart(2,'0')}`;
  }

  /* ── Match track in Jamendo ──────────────────────── */
  async function matchInJamendo(spotifyTrack) {
    if (!window.JamendoEngine) return null;
    const query = `${spotifyTrack.trackName} ${spotifyTrack.artistName}`.trim();
    try {
      const results = await window.JamendoEngine.search(query, 5);
      if (results.length === 0) return null;
      // Return best match (first result)
      return results[0];
    } catch {
      return null;
    }
  }

  /* ── Import with progress callback ──────────────── */
  async function importPlaylist(csvText, playlistName, onProgress) {
    let spotifyTracks;
    try {
      spotifyTracks = parseExportifyCSV(csvText);
    } catch (e) {
      throw new Error(`Error leyendo CSV: ${e.message}`);
    }

    if (spotifyTracks.length === 0) {
      throw new Error('No se encontraron canciones en el CSV');
    }

    const total     = spotifyTracks.length;
    const matched   = [];
    const unmatched = [];

    // Process in batches to avoid rate limiting
    const BATCH = 3;
    for (let i = 0; i < total; i += BATCH) {
      const batch = spotifyTracks.slice(i, i + BATCH);
      const results = await Promise.allSettled(
        batch.map(t => matchInJamendo(t))
      );

      results.forEach((r, bi) => {
        const orig = batch[bi];
        if (r.status === 'fulfilled' && r.value) {
          // Enhance with original Spotify metadata
          const jam = r.value;
          jam._spotifyTrackName  = orig.trackName;
          jam._spotifyArtistName = orig.artistName;
          jam._spotifyDuration   = orig.durationFmt;
          matched.push(jam);
        } else {
          unmatched.push(orig);
        }
      });

      if (onProgress) {
        onProgress({
          done:      Math.min(i + BATCH, total),
          total,
          matched:   matched.length,
          unmatched: unmatched.length,
        });
      }

      // Small delay between batches
      if (i + BATCH < total) {
        await new Promise(r => setTimeout(r, 300));
      }
    }

    return {
      playlistName,
      total,
      matched,
      unmatched,
      matchRate: Math.round((matched.length / total) * 100),
    };
  }

  /* ── Read file as text ───────────────────────────── */
  function readFileAsText(file) {
    return new Promise((resolve, reject) => {
      if (!file) { reject(new Error('No file')); return; }
      if (!file.name.match(/\.(csv|txt)$/i)) {
        reject(new Error('El archivo debe ser .csv'));
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        reject(new Error('El archivo es demasiado grande (máx 5 MB)'));
        return;
      }
      const reader = new FileReader();
      reader.onload  = e => resolve(e.target.result);
      reader.onerror = () => reject(new Error('Error al leer el archivo'));
      reader.readAsText(file, 'utf-8');
    });
  }

  return {
    parseExportifyCSV,
    matchInJamendo,
    importPlaylist,
    readFileAsText,
  };

})();

window.PlaylistImporter = PlaylistImporter;