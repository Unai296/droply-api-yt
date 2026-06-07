/* ═══════════════════════════════════════════════════════════
   DROPLY — mixes.js  v1.0
   MixesManager: Álbumes de Jamendo en la página "Albums"
═══════════════════════════════════════════════════════════ */

'use strict';

window.MixesManager = (() => {

  let _albums      = [];
  let _loaded      = false;
  let _loading     = false;

  /* ── Render grid de álbumes en pageMixes ─────────────── */
  async function renderGrid() {
    const grid = document.getElementById('mixesGrid');
    if (!grid) return;

    // Skeleton
    if (!_loaded) {
      grid.innerHTML = Array(12).fill(`
        <div class="mix-card skeleton-card" style="cursor:default">
          <div class="mix-card-cover skeleton-cover" style="aspect-ratio:1"></div>
          <div class="skeleton-line" style="width:80%;margin-top:.5rem"></div>
          <div class="skeleton-line" style="width:60%"></div>
        </div>`).join('');
    }

    if (_loading) return;
    if (_loaded) { _renderAlbums(grid, _albums); return; }

    _loading = true;
    try {
      _albums = await JamendoEngine.getAlbums(24);
      _loaded = true;
      _renderAlbums(grid, _albums);

      // Also render home row
      _renderHomeRow(_albums);
    } catch (e) {
      grid.innerHTML = '<p style="color:var(--text-soft);padding:2rem;text-align:center;grid-column:1/-1">Error cargando álbumes. Comprueba tu conexión.</p>';
    } finally {
      _loading = false;
    }
  }

  function _renderAlbums(grid, albums) {
    grid.innerHTML = '';
    albums.forEach(album => {
      const card = _buildAlbumCard(album);
      grid.appendChild(card);
    });
  }

  /* ── Home horizontal row ─────────────────────────────── */
  function _renderHomeRow(albums) {
    const row = document.getElementById('homeMixesRow');
    if (!row || row.childElementCount > 1) return; // already rendered
    row.innerHTML = '';
    albums.slice(0, 10).forEach(album => {
      const card = _buildHomeAlbumCard(album);
      row.appendChild(card);
    });
    const sec = document.getElementById('homeMixesSection');
    if (sec) sec.style.display = '';
  }

  /* ── Album card (full page) ──────────────────────────── */
  function _buildAlbumCard(album) {
    const card = document.createElement('div');
    card.className = 'mix-card';
    card.innerHTML = `
      <div class="mix-card-cover">
        <img src="${album.cover}" alt="${album.name}" loading="lazy"
          onerror="this.parentElement.innerHTML='<div class=mix-card-cover-placeholder>♪</div>'"/>
        <div class="mix-card-play-overlay">
          <svg viewBox="0 0 24 24" fill="white" stroke="none" width="22" height="22"><polygon points="5,3 19,12 5,21"/></svg>
        </div>
      </div>
      <p class="mix-card-name">${album.name}</p>
      <p class="mix-card-artist">${album.artist}</p>`;
    card.addEventListener('click', () => _openAlbumDetail(album));
    return card;
  }

  /* ── Home album card (horizontal scroll) ─────────────── */
  function _buildHomeAlbumCard(album) {
    const card = document.createElement('div');
    card.className = 'home-track-card';
    card.innerHTML = `
      <div class="home-track-cover">
        <img src="${album.cover}" alt="${album.name}" loading="lazy"
          onerror="this.src='data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><rect fill="#18181d"/></svg>')}'"/>
        <div class="home-track-play-overlay">
          <svg viewBox="0 0 24 24" fill="white" stroke="none" width="18" height="18"><polygon points="5,3 19,12 5,21"/></svg>
        </div>
      </div>
      <p class="home-track-title">${album.name}</p>
      <p class="home-track-artist">${album.artist}</p>`;
    card.addEventListener('click', () => _openAlbumDetail(album));
    return card;
  }

  /* ── Album detail modal ──────────────────────────────── */
  async function _openAlbumDetail(album) {
    const modal    = document.getElementById('mixDetailModal');
    const bgEl     = document.getElementById('mixDetailBg');
    const coverEl  = document.getElementById('mixDetailCover');
    const nameEl   = document.getElementById('mixDetailName');
    const descEl   = document.getElementById('mixDetailDesc');
    const countEl  = document.getElementById('mixDetailCount');
    const listEl   = document.getElementById('mixDetailList');
    const topTitle = document.getElementById('mixDetailTopTitle');
    const closeBtn = document.getElementById('mixDetailClose');
    const playBtn  = document.getElementById('btnPlayMix');
    const shuffBtn = document.getElementById('btnShuffleMix');

    if (!modal) return;

    // Reset
    if (nameEl)   nameEl.textContent  = album.name;
    if (descEl)   descEl.textContent  = album.artist;
    if (countEl)  countEl.textContent = 'Cargando…';
    if (topTitle) { topTitle.textContent = album.name; topTitle.classList.remove('visible'); }
    if (coverEl) {
      coverEl.innerHTML = `<img src="${album.cover}" alt="${album.name}" style="width:100%;height:100%;object-fit:cover;border-radius:inherit">`;
    }
    if (bgEl) bgEl.style.backgroundImage = `url(${album.cover})`;
    if (listEl) listEl.innerHTML = Array(6).fill(`
      <div class="playlist-detail-item skeleton-row">
        <div class="skeleton-cover" style="width:44px;height:44px;border-radius:6px;flex-shrink:0"></div>
        <div style="flex:1;padding:.2rem 0">
          <div class="skeleton-line" style="width:70%"></div>
          <div class="skeleton-line" style="width:50%"></div>
        </div>
      </div>`).join('');

    modal.classList.add('open');
    document.body.style.overflow = 'hidden';

    let tracks = [];
    try {
      tracks = await JamendoEngine.getAlbumTracks(album.jamendoId);
      if (countEl) countEl.textContent = `${tracks.length} canciones`;
      if (listEl) {
        listEl.innerHTML = '';
        tracks.forEach(item => {
          const div = _buildAlbumTrackRow(item, tracks, listEl);
          listEl.appendChild(div);
        });
      }
    } catch {
      if (listEl) listEl.innerHTML = '<p style="color:var(--text-soft);padding:2rem;text-align:center">Error cargando canciones.</p>';
    }

    // Wire buttons
    if (playBtn) {
      playBtn.onclick = () => {
        if (tracks.length && typeof loadTrack === 'function') {
          loadTrack(tracks[0], false, tracks);
          if (typeof showToast === 'function') showToast(`Reproduciendo "${album.name}"`, 'success');
        }
      };
    }
    if (shuffBtn) {
      shuffBtn.onclick = () => {
        if (tracks.length && typeof loadTrack === 'function') {
          const s = tracks.slice().sort(() => Math.random() - .5);
          loadTrack(s[0], false, s);
          if (typeof showToast === 'function') showToast('Aleatorio activado', 'success');
        }
      };
    }
    if (closeBtn) {
      closeBtn.onclick = () => { modal.classList.remove('open'); document.body.style.overflow = ''; };
    }

    // Scroll title
    const scrollEl = modal.querySelector('.playlist-page-scroll');
    if (scrollEl) {
      scrollEl.scrollTop = 0;
      scrollEl.onscroll = () => {
        const hero = modal.querySelector('.playlist-page-hero');
        if (hero && topTitle) topTitle.classList.toggle('visible', scrollEl.scrollTop > hero.offsetHeight - 60);
      };
    }
  }

  function _buildAlbumTrackRow(item, contextList, listEl) {
    const cover = item.cover || '';
    const div   = document.createElement('div');
    div.className = 'playlist-detail-item';
    div.innerHTML = `
      <img src="${cover}" alt="${item.title}" loading="lazy"
        onerror="this.src='data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><rect fill="#18181d"/></svg>')}'" >
      <div class="playlist-detail-info">
        <div class="playlist-detail-track">${item.title}</div>
        <div class="playlist-detail-artist">${item.artist}</div>
      </div>
      <span style="font-size:.72rem;color:var(--text-soft);flex-shrink:0">${item.duration || ''}</span>
      <button class="playlist-more-btn" style="flex-shrink:0;width:32px;height:32px;border-radius:50%;background:transparent;border:none;color:var(--text-soft);cursor:pointer;display:flex;align-items:center;justify-content:center">
        <svg viewBox="0 0 24 24" width="16" height="16"><circle cx="12" cy="5" r="1.5" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="12" cy="19" r="1.5" fill="currentColor" stroke="none"/></svg>
      </button>`;
    div.addEventListener('click', e => {
      if (e.target.closest('.playlist-more-btn')) return;
      if (typeof loadTrack === 'function') loadTrack(item, false, contextList);
      listEl.querySelectorAll('.playlist-detail-item').forEach(r => r.classList.remove('playing'));
      div.classList.add('playing');
    });
    div.querySelector('.playlist-more-btn').addEventListener('click', e => {
      e.stopPropagation();
      if (typeof openContextMenu === 'function') openContextMenu(item);
    });
    return div;
  }

  // Render home row immediately if albums already loaded
  function initHomeRow() {
    if (_loaded && _albums.length) _renderHomeRow(_albums);
    else if (!_loaded && !_loading) {
      // Trigger a light background load for home row
      _loading = true;
      JamendoEngine.getAlbums(12).then(albums => {
        _albums  = albums;
        _loaded  = true;
        _loading = false;
        _renderHomeRow(albums);
      }).catch(() => { _loading = false; });
    }
  }

  // Auto-init home row on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(initHomeRow, 1200));
  } else {
    setTimeout(initHomeRow, 1200);
  }

  return { renderGrid, initHomeRow };

})();