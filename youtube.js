/* ═══════════════════════════════════════════════════════════
   DROPLY — youtube.js  v3.1
   · YouTube Data API v3 → búsqueda
   · Audio nativo (<audio>) via /api/stream  → pantalla bloqueada ✓
   · MediaSession completo
═══════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  const YT_API_KEY    = 'AIzaSyCzC3R5cZKXgFw6r4EumwIgM05bA3kKppY';
  const YT_SEARCH_URL = 'https://www.googleapis.com/youtube/v3/search';
  const MAX_RESULTS   = 10;

  const _streamCache = new Map(); // videoId → streamUrl

  function _svg() {
    return `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><rect fill="#18181d"/></svg>')}`;
  }

  /* ── Obtener URL de stream ───────────────────────────── */
  async function _getStreamUrl(videoId) {
    if (_streamCache.has(videoId)) return _streamCache.get(videoId);

    const res = await fetch(`/api/stream?id=${encodeURIComponent(videoId)}`);

    if (!res.ok) {
      // Log the actual error body for debugging
      let detail = '';
      try { const j = await res.json(); detail = j.detail || j.error || ''; } catch (_) {}
      throw new Error(`/api/stream ${res.status}${detail ? ': ' + detail : ''}`);
    }

    const data = await res.json();
    if (!data.url) throw new Error('Sin URL de stream en respuesta');

    _streamCache.set(videoId, data.url);
    return data.url;
  }

  /* ── Búsqueda YouTube ────────────────────────────────── */
  async function ytSearch(query) {
    if (!query?.trim()) return [];
    const params = new URLSearchParams({
      part: 'snippet', q: query.trim(), type: 'video',
      videoCategoryId: '10', maxResults: MAX_RESULTS, key: YT_API_KEY,
    });
    try {
      const res  = await fetch(`${YT_SEARCH_URL}?${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      return (data.items || []).map(item => {
        const snip    = item.snippet;
        const videoId = item.id?.videoId;
        if (!videoId) return null;
        const thumb = snip.thumbnails?.high?.url || snip.thumbnails?.medium?.url || _svg();
        const title = snip.title
          .replace(/\s*[\(\[].*?(official|video|audio|lyrics|lyric|music|mv|hd|4k|live|feat\.?|ft\.?|letra|oficial|versión).*?[\)\]]/gi, '')
          .replace(/\s{2,}/g, ' ').trim();
        const artist = snip.channelTitle
          .replace(/\s*-\s*Topic\s*$/i, '')
          .replace(/\s*VEVO\s*$/i, '').trim();
        return {
          type: 'music', source: 'youtube', _source: 'youtube',
          _ytId: videoId,
          title, artist, cover: thumb,
          file: `yt:${videoId}`,   // marcador; se reemplaza antes de reproducir
          stream: null,
          category: 'Online', duration: '',
          _streamResolved: false,
        };
      }).filter(Boolean);
    } catch (err) {
      console.warn('[YT] búsqueda error:', err);
      return [];
    }
  }

  /* ── Reproducir track YT con <audio> nativo ─────────── */
  async function ytPlayTrack(track) {
    if (!track?._ytId) return;

    const audioEl = document.getElementById('mainAudio');
    if (!audioEl) return;

    audioEl.pause();

    // UI inmediata
    _updateMiniUI(track);
    if (typeof showToast === 'function') showToast(`Cargando "${track.title}"…`);

    let streamUrl;
    try {
      streamUrl = await _getStreamUrl(track._ytId);
    } catch (err) {
      console.error('[YT] stream error:', err);
      if (typeof showToast === 'function')
        showToast('Error al cargar audio: ' + err.message, 'error');
      return;
    }

    // Actualizar el objeto track con la URL real
    track.stream           = streamUrl;
    track.file             = streamUrl;
    track._streamResolved  = true;

    // Delegar al loadTrack nativo (gestiona MediaSession, UI completa, queue, historial…)
    // Marcar primero _droplyYTActive = false para que el original no se intercepte a sí mismo
    window._droplyYTActive = false;
    if (typeof window._ytOriginalLoadTrack === 'function') {
      window._ytOriginalLoadTrack(track);
    } else {
      // fallback directo
      audioEl.src = streamUrl;
      audioEl.currentTime = 0;
      audioEl.volume = audioEl.volume || 1;
      audioEl.play().catch(e => { if (e.name !== 'AbortError') console.warn('[YT]', e); });
    }
  }

  /* ── Mini-player UI mientras carga ──────────────────── */
  function _updateMiniUI(track) {
    const cover = track.cover || _svg();
    const g = id => document.getElementById(id);
    if (g('miniTitle'))  g('miniTitle').textContent  = track.title;
    if (g('miniArtist')) g('miniArtist').textContent = track.artist;
    if (g('miniCover'))  { g('miniCover').src = cover; }
    if (g('miniPlayer')) g('miniPlayer').classList.add('visible');
    if (g('sheetTitle'))    g('sheetTitle').textContent    = track.title;
    if (g('sheetArtist'))   g('sheetArtist').textContent   = track.artist;
    if (g('sheetCover'))    g('sheetCover').src            = cover;
    if (g('sheetBgBlur'))   g('sheetBgBlur').style.backgroundImage = `url('${cover}')`;
    if (g('sheetCategory')) g('sheetCategory').textContent = 'YouTube · Online';
  }

  /* ── Render filas en resultados ──────────────────────── */
  function renderYTRows(tracks, container) {
    if (!tracks.length) return;
    const sep = document.createElement('div');
    sep.className = 'search-yt-separator';
    sep.innerHTML = `<span class="search-yt-sep-label">
      <svg viewBox="0 0 24 24" width="13" height="13" style="stroke:var(--accent);fill:none;stroke-width:2"><circle cx="11" cy="11" r="7"/><line x1="16.5" y1="16.5" x2="22" y2="22"/></svg>
      Resultados en YouTube</span>`;
    container.appendChild(sep);

    tracks.forEach(track => {
      const row = document.createElement('div');
      row.className = 'search-result-row yt-result-inline';
      row.dataset.ytid = track._ytId;
      row.innerHTML = `
        <img src="${track.cover}" alt="${track.title}" onerror="this.src='${_svg()}'" />
        <div class="search-result-info">
          <span class="search-result-title">${track.title}</span>
          <span class="search-result-artist">${track.artist} <span class="yt-online-badge">YT</span></span>
        </div>
        <div class="search-result-actions">
          <button class="search-result-more-btn" title="Más opciones" aria-label="Más opciones">
            <svg viewBox="0 0 24 24" width="16" height="16"><circle cx="12" cy="5" r="1.5" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="12" cy="19" r="1.5" fill="currentColor" stroke="none"/></svg>
          </button>
        </div>
        <span class="search-result-cat">Online</span>`;

      row.addEventListener('click', e => {
        if (e.target.closest('.search-result-more-btn')) return;
        ytPlayTrack(track);
        document.querySelectorAll('.yt-result-inline').forEach(r => r.classList.remove('playing'));
        row.classList.add('playing');
      });
      row.querySelector('.search-result-more-btn').addEventListener('click', e => {
        e.stopPropagation();
        if (typeof openContextMenu === 'function') openContextMenu(track);
      });
      container.appendChild(row);
    });
  }

  /* ── Estilos ─────────────────────────────────────────── */
  function injectStyles() {
    if (document.getElementById('droply-yt-styles')) return;
    const s = document.createElement('style');
    s.id = 'droply-yt-styles';
    s.textContent = `
      .search-yt-separator{display:flex;align-items:center;padding:.6rem .5rem .3rem}
      .search-yt-sep-label{display:flex;align-items:center;gap:.35rem;font-size:.72rem;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:var(--accent,#8b5cf6);opacity:.85}
      .yt-online-badge{display:inline-block;background:rgba(139,92,246,.18);color:#c4b5fd;border-radius:4px;font-size:.62rem;font-weight:600;padding:1px 5px;margin-left:4px;vertical-align:middle}
      .yt-result-inline.playing .search-result-title{color:#c4b5fd}
      .yt-search-loading{display:flex;align-items:center;gap:.5rem;padding:.6rem .5rem;color:var(--text-soft,#71717a);font-size:.8rem}
      .yt-search-spinner{width:14px;height:14px;border:2px solid rgba(139,92,246,.3);border-top-color:#8b5cf6;border-radius:50%;animation:ytSpin .7s linear infinite;flex-shrink:0}
      @keyframes ytSpin{to{transform:rotate(360deg)}}`;
    document.head.appendChild(s);
  }

  /* ── Patch búsqueda ──────────────────────────────────── */
  function patchSearchInput() {
    const input = document.getElementById('searchInput');
    if (!input) return;
    input.addEventListener('input', () => {
      const q = input.value.trim();
      if (!q) return;
      clearTimeout(input._ytTimer);
      input._ytTimer = setTimeout(async () => {
        const sr = document.getElementById('searchResults');
        if (!sr || sr.style.display === 'none') return;
        sr.querySelectorAll('.search-yt-separator, .yt-result-inline').forEach(el => el.remove());
        const loader = document.createElement('div');
        loader.className = 'yt-search-loading';
        loader.innerHTML = `<div class="yt-search-spinner"></div><span>Buscando en YouTube…</span>`;
        sr.appendChild(loader);
        const ytTracks = await ytSearch(q);
        loader.remove();
        sr.querySelectorAll('.search-yt-separator, .yt-result-inline').forEach(el => el.remove());
        if (ytTracks.length) {
          // Cache para _findTrack en script.js
          if (Array.isArray(window._ytFeatured))
            ytTracks.forEach(r => { if (!window._ytFeatured.find(t => t._ytId === r._ytId)) window._ytFeatured.push(r); });
          renderYTRows(ytTracks, sr);
        }
      }, 700);
    });
  }

  /* ── Patch loadTrack ─────────────────────────────────── */
  function patchLoadTrack() {
    const orig = window.loadTrack;
    if (!orig) return;
    window._ytOriginalLoadTrack = orig;

    window.loadTrack = function(item, autoPlay, newQueue, queueIdx) {
      const isYT = item?.source === 'youtube' || item?._source === 'youtube';
      // Si es YT pero el stream ya está resuelto (URL real), dejar pasar directo
      if (isYT && item._streamResolved) {
        window._droplyYTActive = false;
        return orig.apply(this, arguments);
      }
      // Si es YT sin resolver, extraer stream primero
      if (isYT) {
        ytPlayTrack(item);
        return;
      }
      // Cualquier otro track
      window._droplyYTActive = false;
      return orig.apply(this, arguments);
    };
  }

  /* ── Init ────────────────────────────────────────────── */
  function init() {
    injectStyles();
    const t = setInterval(() => {
      if (typeof loadTrack === 'function') {
        clearInterval(t);
        patchLoadTrack();
        patchSearchInput();
        console.info('[DROPLY YT v3.1] ✓ audio nativo — lock screen OK');
      }
    }, 150);
  }

  document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', init)
    : setTimeout(init, 50);

  window.DroplyYT = { search: ytSearch, play: ytPlayTrack };
})();
