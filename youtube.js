/* ═══════════════════════════════════════════════════════════
   DROPLY — youtube.js  v2.0
   · Búsqueda integrada en el buscador principal
   · Sin tab "Online" — resultados mezclados con la búsqueda
   · Reproducción oculta vía IFrame API
═══════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  const YT_API_KEY = 'AIzaSyCzC3R5cZKXgFw6r4EumwIgM05bA3kKppY';
  const YT_SEARCH_URL = 'https://www.googleapis.com/youtube/v3/search';
  const MAX_RESULTS = 10;

  let ytPlayer = null;
  let ytReady = false;
  let ytCurrentTrack = null;
  let ytQueue = [];
  let ytQueueIndex = 0;
  let ytIsPlaying = false;
  let ytProgressTimer = null;
  let ytDuration = 0;
  let ytCurrentTime = 0;
  let ytSearchLoading = false;
  let ytLastQuery = '';

  /* ── Inyectar IFrame oculto ─────────────────────────── */
  function injectHiddenPlayer() {
    if (document.getElementById('yt-hidden-player')) return;
    const wrap = document.createElement('div');
    wrap.id = 'yt-player-wrap';
    wrap.setAttribute('aria-hidden', 'true');
    wrap.style.cssText = 'position:fixed;left:-9999px;top:-9999px;width:1px;height:1px;overflow:hidden;pointer-events:none;opacity:0;z-index:-1;';
    const div = document.createElement('div');
    div.id = 'yt-hidden-player';
    wrap.appendChild(div);
    document.body.appendChild(wrap);
  }

  function loadYTIframeAPI() {
    if (window.YT && window.YT.Player) { ytReady = true; return; }
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(tag);
  }

  window.onYouTubeIframeAPIReady = function () {
    ytReady = true;
    if (ytCurrentTrack) _createPlayer(ytCurrentTrack._ytId);
  };

  function _createPlayer(videoId, startSeconds = 0) {
    return new Promise((resolve) => {
      if (!ytReady) {
        const check = setInterval(() => {
          if (ytReady) { clearInterval(check); _createPlayer(videoId, startSeconds).then(resolve); }
        }, 200);
        return;
      }
      if (ytPlayer) { try { ytPlayer.destroy(); } catch (_) {} ytPlayer = null; }
      ytPlayer = new window.YT.Player('yt-hidden-player', {
        height: '1', width: '1', videoId,
        playerVars: { autoplay: 1, controls: 0, disablekb: 1, enablejsapi: 1, fs: 0, modestbranding: 1, playsinline: 1, rel: 0, showinfo: 0, iv_load_policy: 3, start: Math.floor(startSeconds) },
        events: {
          onReady: (e) => {
            e.target.setVolume(100);
            e.target.playVideo();
            ytIsPlaying = true;
            ytDuration = e.target.getDuration() || 0;
            _startProgressTimer();
            _updateUI();
            _updateMediaSession();
            resolve(ytPlayer);
          },
          onStateChange: _onPlayerStateChange,
          onError: _onPlayerError,
        },
      });
    });
  }

  function _onPlayerStateChange(event) {
    const S = window.YT.PlayerState;
    switch (event.data) {
      case S.PLAYING:
        ytIsPlaying = true;
        ytDuration = ytPlayer.getDuration() || 0;
        _startProgressTimer(); _updateUI(); _updateMediaSession();
        break;
      case S.PAUSED:
        ytIsPlaying = false;
        _stopProgressTimer(); _updateUI(); _updateMediaSession();
        break;
      case S.ENDED:
        ytIsPlaying = false;
        _stopProgressTimer();
        _playNextYT();
        break;
      case -1:
        try { ytPlayer.playVideo(); } catch (_) {}
        break;
    }
  }

  function _onPlayerError(e) {
    const msg = { 2:'ID inválido', 5:'Error HTML5', 100:'Vídeo no encontrado', 101:'No permite embed', 150:'No permite embed' }[e.data] || 'Error de reproducción';
    if (typeof showToast === 'function') showToast(msg, 'error');
    setTimeout(_playNextYT, 1200);
  }

  function _startProgressTimer() {
    _stopProgressTimer();
    ytProgressTimer = setInterval(() => {
      if (!ytPlayer || !ytIsPlaying) return;
      try {
        ytCurrentTime = ytPlayer.getCurrentTime() || 0;
        ytDuration = ytPlayer.getDuration() || 0;
        _updateProgress();
      } catch (_) {}
    }, 500);
  }

  function _stopProgressTimer() {
    if (ytProgressTimer) { clearInterval(ytProgressTimer); ytProgressTimer = null; }
  }

  function _updateMediaSession() {
    if (!('mediaSession' in navigator) || !ytCurrentTrack) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: ytCurrentTrack.title,
      artist: ytCurrentTrack.artist,
      artwork: ytCurrentTrack.cover ? [{ src: ytCurrentTrack.cover, sizes: '512x512', type: 'image/jpeg' }] : [],
    });
    navigator.mediaSession.playbackState = ytIsPlaying ? 'playing' : 'paused';
    navigator.mediaSession.setActionHandler('play', () => ytTogglePlay());
    navigator.mediaSession.setActionHandler('pause', () => ytTogglePlay());
    navigator.mediaSession.setActionHandler('nexttrack', () => _playNextYT());
    navigator.mediaSession.setActionHandler('previoustrack', () => _playPrevYT());
    navigator.mediaSession.setActionHandler('seekto', (d) => {
      if (ytPlayer && d.seekTime != null) { ytPlayer.seekTo(d.seekTime, true); ytCurrentTime = d.seekTime; }
    });
    if (navigator.mediaSession.setPositionState && ytDuration > 0) {
      try { navigator.mediaSession.setPositionState({ duration: ytDuration, playbackRate: 1, position: Math.min(ytCurrentTime, ytDuration) }); } catch (_) {}
    }
  }

  function _updateUI() {
    if (!ytCurrentTrack) return;
    const miniTitle  = document.getElementById('miniTitle');
    const miniArtist = document.getElementById('miniArtist');
    const miniCover  = document.getElementById('miniCover');
    const miniPlayer = document.getElementById('miniPlayer');
    if (miniTitle)  miniTitle.textContent  = ytCurrentTrack.title;
    if (miniArtist) miniArtist.textContent = ytCurrentTrack.artist;
    if (miniCover)  { miniCover.src = ytCurrentTrack.cover; miniCover.onerror = () => { miniCover.src = _placeholderSVG(); }; }
    if (miniPlayer) miniPlayer.classList.add('visible');

    const sheetTitle  = document.getElementById('sheetTitle');
    const sheetArtist = document.getElementById('sheetArtist');
    const sheetCover  = document.getElementById('sheetCover');
    const sheetBgBlur = document.getElementById('sheetBgBlur');
    const sheetCategory = document.getElementById('sheetCategory');
    if (sheetTitle)    sheetTitle.textContent    = ytCurrentTrack.title;
    if (sheetArtist)   sheetArtist.textContent   = ytCurrentTrack.artist;
    if (sheetCover)    { sheetCover.src = ytCurrentTrack.cover; sheetCover.onerror = () => { sheetCover.src = _placeholderSVG(); }; }
    if (sheetBgBlur)   sheetBgBlur.style.backgroundImage = `url('${ytCurrentTrack.cover}')`;
    if (sheetCategory) sheetCategory.textContent = 'Online';

    const sheetDur = document.getElementById('sheetDuration');
    if (sheetDur && ytDuration > 0) sheetDur.textContent = _formatTime(ytDuration);

    _syncPlayPauseButtons();

    const hccCover  = document.getElementById('hccCover');
    const hccTitle  = document.getElementById('hccTitle');
    const hccArtist = document.getElementById('hccArtist');
    const hccGlow   = document.getElementById('hccGlow');
    const contSec   = document.getElementById('homeContinueSection');
    if (hccCover)  hccCover.src = ytCurrentTrack.cover;
    if (hccTitle)  hccTitle.textContent  = ytCurrentTrack.title;
    if (hccArtist) hccArtist.textContent = ytCurrentTrack.artist;
    if (hccGlow)   hccGlow.style.backgroundImage = `url('${ytCurrentTrack.cover}')`;
    if (contSec)   contSec.style.display = '';
  }

  function _syncPlayPauseButtons() {
    ['miniPlay', 'sheetPlay'].forEach(id => {
      const btn = document.getElementById(id);
      if (!btn) return;
      const ip  = btn.querySelector('.icon-play');
      const ipa = btn.querySelector('.icon-pause');
      if (ip)  ip.style.display  = ytIsPlaying ? 'none' : '';
      if (ipa) ipa.style.display = ytIsPlaying ? '' : 'none';
    });
    const sheetCover = document.getElementById('sheetCover');
    if (sheetCover) sheetCover.classList.toggle('playing', ytIsPlaying);
  }

  function _updateProgress() {
    if (!ytDuration) return;
    const pct = (ytCurrentTime / ytDuration) * 100;
    const miniFill  = document.getElementById('miniProgressFill');
    const sheetFill = document.getElementById('sheetFill');
    const sheetThumb = document.getElementById('sheetThumb');
    const sheetCur  = document.getElementById('sheetCurrent');
    const sheetDur  = document.getElementById('sheetDuration');
    const hccFill   = document.getElementById('hccProgressFill');
    if (miniFill)   miniFill.style.width  = `${pct}%`;
    if (sheetFill)  sheetFill.style.width = `${pct}%`;
    if (sheetThumb) sheetThumb.style.left = `${pct}%`;
    if (sheetCur)   sheetCur.textContent  = _formatTime(ytCurrentTime);
    if (sheetDur)   sheetDur.textContent  = _formatTime(ytDuration);
    if (hccFill)    hccFill.style.width   = `${pct}%`;
    _updateMediaSession();
  }

  function _formatTime(sec) {
    if (!sec || isNaN(sec) || !isFinite(sec)) return '0:00';
    const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  function _placeholderSVG() {
    return `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><rect fill="#18181d"/></svg>')}`;
  }

  /* ── Búsqueda ───────────────────────────────────────── */
  async function ytSearch(query) {
    if (ytSearchLoading || !query) return [];
    ytSearchLoading = true;
    ytLastQuery = query;

    const params = new URLSearchParams({
      part: 'snippet', q: query, type: 'video',
      videoCategoryId: '10', maxResults: MAX_RESULTS, key: YT_API_KEY,
    });

    try {
      const res = await fetch(`${YT_SEARCH_URL}?${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      return (data.items || []).map((item) => {
        const snippet = item.snippet;
        const videoId = item.id?.videoId;
        if (!videoId) return null;
        const thumb = snippet.thumbnails?.high?.url || snippet.thumbnails?.medium?.url || snippet.thumbnails?.default?.url || _placeholderSVG();
        let title = snippet.title
          .replace(/\s*[\(\[].*?(official|video|audio|lyrics|lyric|music|mv|hd|4k|live|feat\.?|ft\.?|letra|oficial|versión).*?[\)\]]/gi, '')
          .replace(/\s{2,}/g, ' ').trim();
        let artist = snippet.channelTitle.replace(/\s*-\s*Topic\s*$/i, '').replace(/\s*VEVO\s*$/i, '').trim();
        return { type: 'music', _source: 'youtube', _ytId: videoId, title, artist, cover: thumb, file: `yt:${videoId}`, category: 'Online', duration: '' };
      }).filter(Boolean);

    } catch (err) {
      console.warn('[DROPLY YT] Error búsqueda:', err);
      return [];
    } finally {
      ytSearchLoading = false;
    }
  }

  /* ── Reproducir track YT ────────────────────────────── */
  async function ytPlayTrack(track, queue = null, queueIndex = 0) {
    if (!track?._ytId) return;
    const mainAudio = document.getElementById('mainAudio');
    if (mainAudio && !mainAudio.paused) { mainAudio.pause(); mainAudio.src = ''; }

    ytCurrentTrack = track;
    ytQueue = queue || [track];
    ytQueueIndex = queueIndex;

    _updateUI();
    if (!ytReady) { loadYTIframeAPI(); return; }
    await _createPlayer(track._ytId);
  }

  function ytTogglePlay() {
    if (!ytPlayer) return;
    try { ytIsPlaying ? ytPlayer.pauseVideo() : ytPlayer.playVideo(); } catch (_) {}
  }

  function _playNextYT() {
    if (!ytQueue.length) return;
    ytQueueIndex = (ytQueueIndex + 1) % ytQueue.length;
    const next = ytQueue[ytQueueIndex];
    if (next) ytPlayTrack(next, ytQueue, ytQueueIndex);
  }

  function _playPrevYT() {
    if (!ytPlayer) return;
    if (ytCurrentTime > 3) { ytPlayer.seekTo(0, true); return; }
    if (!ytQueue.length) return;
    ytQueueIndex = (ytQueueIndex - 1 + ytQueue.length) % ytQueue.length;
    const prev = ytQueue[ytQueueIndex];
    if (prev) ytPlayTrack(prev, ytQueue, ytQueueIndex);
  }

  /* ── Render filas YT en los resultados del buscador ─── */
  function renderYTRows(tracks, container, allResults) {
    if (!tracks.length) return;

    // Separador
    const sep = document.createElement('div');
    sep.className = 'search-yt-separator';
    sep.innerHTML = `
      <span class="search-yt-sep-label">
        <svg viewBox="0 0 24 24" width="13" height="13" style="stroke:var(--accent);fill:none;stroke-width:2"><circle cx="11" cy="11" r="7"/><line x1="16.5" y1="16.5" x2="22" y2="22"/></svg>
        Más resultados online
      </span>`;
    container.appendChild(sep);

    tracks.forEach((track, i) => {
      const isActive = ytCurrentTrack && ytCurrentTrack._ytId === track._ytId;
      const row = document.createElement('div');
      row.className = 'search-result-row yt-result-inline' + (isActive ? ' playing' : '');
      row.dataset.ytid = track._ytId;
      row.innerHTML = `
        <img src="${track.cover}" alt="${track.title}" onerror="this.src='${_placeholderSVG()}'" />
        <div class="search-result-info">
          <span class="search-result-title">${track.title}</span>
          <span class="search-result-artist">${track.artist} <span class="yt-online-badge">Online</span></span>
        </div>
        <div class="search-result-actions">
          <button class="search-result-more-btn library-action-more" title="Más opciones" aria-label="Más opciones">
            <svg viewBox="0 0 24 24" width="16" height="16"><circle cx="12" cy="5" r="1.5" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="12" cy="19" r="1.5" fill="currentColor" stroke="none"/></svg>
          </button>
        </div>
        <span class="search-result-cat">Online</span>`;

      row.addEventListener('click', e => {
        if (e.target.closest('.search-result-more-btn')) return;
        ytPlayTrack(track, tracks, i);
        // Marcar activo
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

  /* ── CSS inline para el separador y badge ───────────── */
  function injectStyles() {
    if (document.getElementById('droply-yt-styles')) return;
    const style = document.createElement('style');
    style.id = 'droply-yt-styles';
    style.textContent = `
      .search-yt-separator {
        display: flex;
        align-items: center;
        padding: .6rem .5rem .3rem;
      }
      .search-yt-sep-label {
        display: flex;
        align-items: center;
        gap: .35rem;
        font-size: .72rem;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: .06em;
        color: var(--accent, #8b5cf6);
        opacity: .85;
      }
      .yt-online-badge {
        display: inline-block;
        background: rgba(139,92,246,.18);
        color: #c4b5fd;
        border-radius: 4px;
        font-size: .62rem;
        font-weight: 600;
        padding: 1px 5px;
        margin-left: 4px;
        vertical-align: middle;
        letter-spacing: .04em;
      }
      .yt-result-inline.playing .search-result-title { color: #c4b5fd; }
      .yt-search-loading {
        display: flex;
        align-items: center;
        gap: .5rem;
        padding: .6rem .5rem;
        color: var(--text-soft, #71717a);
        font-size: .8rem;
      }
      .yt-search-spinner {
        width: 14px; height: 14px;
        border: 2px solid rgba(139,92,246,.3);
        border-top-color: #8b5cf6;
        border-radius: 50%;
        animation: ytSpin .7s linear infinite;
        flex-shrink: 0;
      }
      @keyframes ytSpin { to { transform: rotate(360deg); } }
    `;
    document.head.appendChild(style);
  }

  /* ── Patch del buscador de Droply ───────────────────── */
  function patchSearchInput() {
    const input = document.getElementById('searchInput');
    if (!input) return;

    // Escuchamos el mismo evento 'input' que usa script.js
    // Esperamos 600ms extra para que script.js renderice primero, luego añadimos YT
    input.addEventListener('input', () => {
      const q = input.value.trim();
      if (!q) return;

      // Mostrar spinner mientras buscamos
      clearTimeout(input._ytTimer);
      input._ytTimer = setTimeout(async () => {
        const searchResults = document.getElementById('searchResults');
        if (!searchResults || searchResults.style.display === 'none') return;

        // Eliminar resultados YT anteriores si los hay
        searchResults.querySelectorAll('.search-yt-separator, .yt-result-inline').forEach(el => el.remove());

        // Indicador de carga
        const loader = document.createElement('div');
        loader.className = 'yt-search-loading';
        loader.innerHTML = `<div class="yt-search-spinner"></div><span>Buscando en online…</span>`;
        searchResults.appendChild(loader);

        const ytTracks = await ytSearch(q);
        loader.remove();

        // Volver a eliminar por si acaso llegaron durante la carga
        searchResults.querySelectorAll('.search-yt-separator, .yt-result-inline').forEach(el => el.remove());

        if (ytTracks.length > 0) {
          renderYTRows(ytTracks, searchResults, ytTracks);
        }
      }, 700); // 700ms: script.js tarda ~220ms, le damos margen
    });
  }

  /* ── Patch loadTrack para tracks YT ────────────────── */
  function patchLoadTrack() {
    const originalLoadTrack = window.loadTrack;
    if (!originalLoadTrack) return;
    window.loadTrack = function (item, autoPlay, newQueue, queueIdx) {
      if (item?._source === 'youtube') {
        const queue = newQueue || [item];
        const idx   = queueIdx != null ? queueIdx : queue.indexOf(item);
        ytPlayTrack(item, queue, Math.max(0, idx));
        return;
      }
      if (ytCurrentTrack) {
        try { if (ytPlayer) ytPlayer.pauseVideo(); } catch (_) {}
        ytIsPlaying = false; ytCurrentTrack = null; _syncPlayPauseButtons();
      }
      return originalLoadTrack.apply(this, arguments);
    };
  }

  /* ── Hook controles del reproductor nativo ──────────── */
  function hookNativePlayerControls() {
    const sheetBar = document.getElementById('sheetBar');
    if (sheetBar) {
      sheetBar.addEventListener('click', (e) => {
        if (!ytCurrentTrack || !ytPlayer || !ytDuration) return;
        const rect = sheetBar.getBoundingClientRect();
        const pct  = (e.clientX - rect.left) / rect.width;
        ytPlayer.seekTo(pct * ytDuration, true);
        ytCurrentTime = pct * ytDuration;
      });
    }
  }

  /* ── Init ───────────────────────────────────────────── */
  function init() {
    injectStyles();
    injectHiddenPlayer();
    loadYTIframeAPI();

    const waitForDroply = setInterval(() => {
      if (typeof loadTrack === 'function') {
        clearInterval(waitForDroply);
        patchLoadTrack();
        hookNativePlayerControls();
        patchSearchInput();
        console.info('[DROPLY YT] ✓ Integrado en buscador');
      }
    }, 150);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    setTimeout(init, 50);
  }

  window.DroplyYT = { search: ytSearch, play: ytPlayTrack, toggle: ytTogglePlay, next: _playNextYT, prev: _playPrevYT, isPlaying: () => ytIsPlaying, currentTrack: () => ytCurrentTrack };
})();