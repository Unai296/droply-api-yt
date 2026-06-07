/* ═══════════════════════════════════════════════════════════
   DROPLY — youtube.js  v3.0
   · YouTube Data API v3 para búsqueda
   · Audio nativo (<audio>) via /api/stream (Vercel + yt-dlp)
   · SIN IFrame API → funciona en pantalla bloqueada 100%
   · MediaSession completo (portada, controles, seek)
═══════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  const YT_API_KEY    = 'AIzaSyCzC3R5cZKXgFw6r4EumwIgM05bA3kKppY';
  const YT_SEARCH_URL = 'https://www.googleapis.com/youtube/v3/search';
  const MAX_RESULTS   = 10;

  // Cache de URLs de stream para no volver a pedirlas
  const _streamCache = new Map();

  /* ── Placeholder SVG ─────────────────────────────────── */
  function _placeholderSVG() {
    return `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><rect fill="#18181d"/></svg>')}`;
  }

  /* ── Formatear tiempo ────────────────────────────────── */
  function _fmt(sec) {
    if (!sec || isNaN(sec) || !isFinite(sec)) return '0:00';
    const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  /* ── Obtener URL de stream de audio via backend ──────── */
  async function _getStreamUrl(videoId) {
    if (_streamCache.has(videoId)) return _streamCache.get(videoId);
    const res = await fetch(`/api/stream?id=${videoId}`);
    if (!res.ok) throw new Error(`Stream HTTP ${res.status}`);
    const data = await res.json();
    if (!data.url) throw new Error('Sin URL de stream');
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
        const snippet = item.snippet;
        const videoId = item.id?.videoId;
        if (!videoId) return null;
        const thumb = snippet.thumbnails?.high?.url
          || snippet.thumbnails?.medium?.url
          || snippet.thumbnails?.default?.url
          || _placeholderSVG();
        let title = snippet.title
          .replace(/\s*[\(\[].*?(official|video|audio|lyrics|lyric|music|mv|hd|4k|live|feat\.?|ft\.?|letra|oficial|versión).*?[\)\]]/gi, '')
          .replace(/\s{2,}/g, ' ').trim();
        let artist = snippet.channelTitle
          .replace(/\s*-\s*Topic\s*$/i, '')
          .replace(/\s*VEVO\s*$/i, '').trim();
        return {
          type:     'music',
          source:   'youtube',
          _source:  'youtube',
          _ytId:    videoId,
          title,
          artist,
          cover:    thumb,
          file:     `yt:${videoId}`,
          stream:   null,          // se rellena al reproducir
          category: 'Online',
          duration: '',
        };
      }).filter(Boolean);
    } catch (err) {
      console.warn('[DROPLY YT] Búsqueda error:', err);
      return [];
    }
  }

  /* ── Reproducir track YT con <audio> nativo ─────────── */
  async function ytPlayTrack(track) {
    if (!track?._ytId) return;

    const audioEl = document.getElementById('mainAudio');
    if (!audioEl) return;

    // Detener lo que suene ahora
    audioEl.pause();
    window._droplyYTActive = true;

    // Mostrar UI inmediatamente (sin esperar al stream)
    _updateUI(track, false);

    if (typeof showToast === 'function') showToast('Cargando audio…');

    let streamUrl;
    try {
      streamUrl = await _getStreamUrl(track._ytId);
    } catch (err) {
      console.warn('[DROPLY YT] Stream error:', err);
      if (typeof showToast === 'function') showToast('Error cargando audio. Intenta otra canción.', 'error');
      window._droplyYTActive = false;
      return;
    }

    // Guardar URL en el track para que loadTrack nativo también funcione
    track.stream = streamUrl;
    track.file   = streamUrl;   // permitir que el sistema de offline y _findTrack lo reconozca

    // Usar el loadTrack nativo de script.js (gestiona MediaSession, UI, queue…)
    if (typeof window._ytOriginalLoadTrack === 'function') {
      window._droplyYTActive = false;
      window._ytOriginalLoadTrack(track);
    } else {
      // Fallback directo
      audioEl.src = streamUrl;
      audioEl.currentTime = 0;
      audioEl.muted = false;
      if (audioEl.volume === 0) audioEl.volume = 1;
      audioEl.play().catch(err => {
        if (err.name !== 'AbortError') console.warn('[DROPLY YT] play error:', err);
      });
      _updateUI(track, true);
    }
  }

  /* ── Actualizar UI (mini-player + sheet) ─────────────── */
  function _updateUI(track, playing) {
    const ids = {
      miniTitle: 'miniTitle', miniArtist: 'miniArtist', miniCover: 'miniCover',
      miniPlayer: 'miniPlayer', sheetTitle: 'sheetTitle', sheetArtist: 'sheetArtist',
      sheetCover: 'sheetCover', sheetBgBlur: 'sheetBgBlur', sheetCategory: 'sheetCategory',
      hccCover: 'hccCover', hccTitle: 'hccTitle', hccArtist: 'hccArtist',
      hccGlow: 'hccGlow', homeContinueSection: 'homeContinueSection',
    };
    const g = id => document.getElementById(id);
    const cover = track.cover || _placeholderSVG();
    if (g('miniTitle'))   g('miniTitle').textContent  = track.title;
    if (g('miniArtist'))  g('miniArtist').textContent = track.artist;
    if (g('miniCover'))   { g('miniCover').src = cover; g('miniCover').onerror = () => { g('miniCover').src = _placeholderSVG(); }; }
    if (g('miniPlayer'))  g('miniPlayer').classList.add('visible');
    if (g('sheetTitle'))    g('sheetTitle').textContent    = track.title;
    if (g('sheetArtist'))   g('sheetArtist').textContent   = track.artist;
    if (g('sheetCover'))  { g('sheetCover').src = cover; g('sheetCover').onerror = () => { g('sheetCover').src = _placeholderSVG(); }; }
    if (g('sheetBgBlur'))   g('sheetBgBlur').style.backgroundImage = `url('${cover}')`;
    if (g('sheetCategory')) g('sheetCategory').textContent = 'YouTube · Online';
    if (g('hccCover'))    g('hccCover').src = cover;
    if (g('hccTitle'))    g('hccTitle').textContent  = track.title;
    if (g('hccArtist'))   g('hccArtist').textContent = track.artist;
    if (g('hccGlow'))     g('hccGlow').style.backgroundImage = `url('${cover}')`;
    if (g('homeContinueSection')) g('homeContinueSection').style.display = '';
  }

  /* ── Renderizar filas YT en resultados de búsqueda ───── */
  function renderYTRows(tracks, container) {
    if (!tracks.length) return;

    const sep = document.createElement('div');
    sep.className = 'search-yt-separator';
    sep.innerHTML = `
      <span class="search-yt-sep-label">
        <svg viewBox="0 0 24 24" width="13" height="13" style="stroke:var(--accent);fill:none;stroke-width:2"><circle cx="11" cy="11" r="7"/><line x1="16.5" y1="16.5" x2="22" y2="22"/></svg>
        Más resultados en YouTube
      </span>`;
    container.appendChild(sep);

    tracks.forEach((track, i) => {
      const row = document.createElement('div');
      row.className = 'search-result-row yt-result-inline';
      row.dataset.ytid = track._ytId;
      row.innerHTML = `
        <img src="${track.cover}" alt="${track.title}" onerror="this.src='${_placeholderSVG()}'" />
        <div class="search-result-info">
          <span class="search-result-title">${track.title}</span>
          <span class="search-result-artist">${track.artist} <span class="yt-online-badge">YouTube</span></span>
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

  /* ── Estilos inline ──────────────────────────────────── */
  function injectStyles() {
    if (document.getElementById('droply-yt-styles')) return;
    const style = document.createElement('style');
    style.id = 'droply-yt-styles';
    style.textContent = `
      .search-yt-separator{display:flex;align-items:center;padding:.6rem .5rem .3rem}
      .search-yt-sep-label{display:flex;align-items:center;gap:.35rem;font-size:.72rem;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:var(--accent,#8b5cf6);opacity:.85}
      .yt-online-badge{display:inline-block;background:rgba(139,92,246,.18);color:#c4b5fd;border-radius:4px;font-size:.62rem;font-weight:600;padding:1px 5px;margin-left:4px;vertical-align:middle;letter-spacing:.04em}
      .yt-result-inline.playing .search-result-title{color:#c4b5fd}
      .yt-search-loading{display:flex;align-items:center;gap:.5rem;padding:.6rem .5rem;color:var(--text-soft,#71717a);font-size:.8rem}
      .yt-search-spinner{width:14px;height:14px;border:2px solid rgba(139,92,246,.3);border-top-color:#8b5cf6;border-radius:50%;animation:ytSpin .7s linear infinite;flex-shrink:0}
      @keyframes ytSpin{to{transform:rotate(360deg)}}
    `;
    document.head.appendChild(style);
  }

  /* ── Patch del buscador ──────────────────────────────── */
  function patchSearchInput() {
    const input = document.getElementById('searchInput');
    if (!input) return;
    input.addEventListener('input', () => {
      const q = input.value.trim();
      if (!q) return;
      clearTimeout(input._ytTimer);
      input._ytTimer = setTimeout(async () => {
        const searchResults = document.getElementById('searchResults');
        if (!searchResults || searchResults.style.display === 'none') return;
        searchResults.querySelectorAll('.search-yt-separator, .yt-result-inline').forEach(el => el.remove());
        const loader = document.createElement('div');
        loader.className = 'yt-search-loading';
        loader.innerHTML = `<div class="yt-search-spinner"></div><span>Buscando en YouTube…</span>`;
        searchResults.appendChild(loader);
        const ytTracks = await ytSearch(q);
        loader.remove();
        searchResults.querySelectorAll('.search-yt-separator, .yt-result-inline').forEach(el => el.remove());
        if (ytTracks.length > 0) renderYTRows(ytTracks, searchResults);
      }, 700);
    });
  }

  /* ── Patch loadTrack para interceptar tracks YT ─────── */
  function patchLoadTrack() {
    const orig = window.loadTrack;
    if (!orig) return;
    window._ytOriginalLoadTrack = orig;
    window.loadTrack = function(item, autoPlay, newQueue, queueIdx) {
      if (item?._source === 'youtube' || item?.source === 'youtube') {
        // Si ya tiene stream URL (ya resuelta), dejar pasar al original
        if (item.stream && !item.stream.startsWith('yt:') && item.file && !item.file.startsWith('yt:')) {
          window._droplyYTActive = false;
          return orig.apply(this, arguments);
        }
        // Si no, resolver primero
        ytPlayTrack(item);
        return;
      }
      window._droplyYTActive = false;
      return orig.apply(this, arguments);
    };
  }

  /* ── Init ────────────────────────────────────────────── */
  function init() {
    injectStyles();
    const waitForDroply = setInterval(() => {
      if (typeof loadTrack === 'function') {
        clearInterval(waitForDroply);
        patchLoadTrack();
        patchSearchInput();
        console.info('[DROPLY YT v3] ✓ Audio nativo activo — pantalla bloqueada compatible');
      }
    }, 150);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    setTimeout(init, 50);
  }

  window.DroplyYT = { search: ytSearch, play: ytPlayTrack };
})();