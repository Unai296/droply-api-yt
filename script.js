/* ═══════════════════════════════════════════════════════════
   DROPLY — script.js  v6 LEGAL
   Motor: Jamendo API (Creative Commons) + música local del usuario
   100% legal · Publicable en Google Play y App Store
═══════════════════════════════════════════════════════════ */

'use strict';

/* ══════════════════════════════════════════════════
   iOS / Safari AudioContext Unlock
══════════════════════════════════════════════════ */
(function iosAudioUnlock() {
  let unlocked = false;
  function unlock() {
    if (unlocked) return;
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (Ctx) {
        const ctx = new Ctx();
        const buf = ctx.createBuffer(1, 1, 22050);
        const src = ctx.createBufferSource();
        src.buffer = buf; src.connect(ctx.destination); src.start(0);
        ctx.resume().catch(() => {});
      }
    } catch (_) {}
    const a = document.getElementById('mainAudio');
    if (a && a.src && a.paused && window._droplyPendingTrack) {
      a.play().then(() => { unlocked = true; window._droplyPendingTrack = null; }).catch(() => {});
    } else { unlocked = true; }
    if (unlocked) ['touchstart','touchend','mousedown','keydown','click'].forEach(ev => document.removeEventListener(ev, unlock, true));
  }
  ['touchstart','touchend','mousedown','keydown','click'].forEach(ev => document.addEventListener(ev, unlock, { capture: true, passive: true }));
})();

/* ══════════════════════════════════════════════════
   1. CHANGELOG
══════════════════════════════════════════════════ */
const CHANGELOG = [
  {
    version: 'v7.0',
    date:    '7 de Junio 2026',
    title:   'Droply — YouTube Edition',
    emoji:   '🎵',
    changes: [
      { icon: '🎵', text: 'YouTube como fuente principal: busca cualquier canción.' },
      { icon: '🔒', text: 'Reproducción con pantalla bloqueada: audio nativo en vez de IFrame.' },
      { icon: '⚡', text: 'MediaSession completo: controles en notificación y lock screen.' },
      { icon: '📂', text: 'Añade tu propia música local desde el dispositivo.' },
      { icon: '🎚️', text: 'Cola de reproducción, shuffle, repeat y favoritos.' },
    ]
  }
];

const CHANGELOG_SEEN_KEY = 'droply_changelog_seen';
function getSeenVersion()   { return localStorage.getItem(CHANGELOG_SEEN_KEY) || ''; }
function markVersionSeen(v) { localStorage.setItem(CHANGELOG_SEEN_KEY, v); }

function initChangelog() {
  if (!CHANGELOG?.length) return;
  const latest = CHANGELOG[0];
  if (getSeenVersion() === latest.version) return;
  const modal = document.getElementById('changelogModal');
  if (!modal) return;
  const q = id => document.getElementById(id);
  if (q('clEmoji'))   q('clEmoji').textContent   = latest.emoji || '✨';
  if (q('clTitle'))   q('clTitle').textContent   = latest.title;
  if (q('clDate'))    q('clDate').textContent    = latest.date;
  if (q('clVersion')) q('clVersion').textContent = latest.version;
  if (q('clList'))    q('clList').innerHTML       = (latest.changes||[]).map(c =>
    `<li class="cl-item"><span class="cl-icon">${c.icon}</span><span class="cl-text">${c.text}</span></li>`
  ).join('');
  setTimeout(() => modal.classList.add('open'), 800);
  const close = () => { modal.classList.remove('open'); markVersionSeen(latest.version); };
  q('clClose')?.addEventListener('click', close);
  modal.addEventListener('click', e => { if (e.target === modal) close(); });
}

/* ══════════════════════════════════════════════════
   2. PERSISTENCE
══════════════════════════════════════════════════ */
const KEYS = {
  LIKED:    'droply_liked_v2',
  QUEUE:    'droply_queue_v2',
  PL:       'droply_playlists_v2',
  HIST:     'droply_history_v2',
  PLAYS:    'droply_plays_v2',
  LOCAL:    'droply_local_tracks_v1',
  SEEN_CL:  CHANGELOG_SEEN_KEY,
};

function _ls(key, def = null) {
  try { const v = localStorage.getItem(key); return v !== null ? JSON.parse(v) : def; }
  catch { return def; }
}
function _lss(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch (_) {}
}

let likedTracks   = new Set(_ls(KEYS.LIKED, []));
let queue         = _ls(KEYS.QUEUE,  []);
let playlists     = _ls(KEYS.PL,     []);
let historyTracks = _ls(KEYS.HIST,   []);
let playCounts    = _ls(KEYS.PLAYS,  {});
let localTracks   = _ls(KEYS.LOCAL,  []);  // tracks added from device

function saveLiked()    { _lss(KEYS.LIKED,   [...likedTracks]); }
function saveQueue()    { _lss(KEYS.QUEUE,   queue); }
function savePlaylists(){ _lss(KEYS.PL,      playlists); }
function saveHistory()  { _lss(KEYS.HIST,    historyTracks.slice(0,100)); }
function savePlayCounts(){ _lss(KEYS.PLAYS,  playCounts); }
function saveLocalTracks(){ _lss(KEYS.LOCAL, localTracks); }

/* ══════════════════════════════════════════════════
   3. STATE
══════════════════════════════════════════════════ */
let currentTrackIdx  = -1;
let isPlaying        = false;
let playlist         = [];
let shuffleMode      = false;
let repeatMode       = false;
let contextTarget    = null;

// YouTube search cache for home screen
let _ytFeatured      = [];
let _ytLoaded        = false;

/* ══════════════════════════════════════════════════
   4. DOM REFS
══════════════════════════════════════════════════ */
const $ = id => document.getElementById(id);
const audioEl          = $('mainAudio');
const mediaGrid        = $('mediaGrid');
const catInner         = $('catInner');
const sectionTitle     = $('sectionTitle');
const countBadge       = $('countBadge');
const nowPlayingSheet  = $('nowPlayingSheet');
const sheetBgBlur      = $('sheetBgBlur');
const sheetClose       = $('sheetClose');
const sheetCover       = $('sheetCover');
const sheetCategory    = $('sheetCategory');
const sheetTitle       = $('sheetTitle');
const sheetArtist      = $('sheetArtist');
const sheetHeart       = $('sheetHeart');
const sheetAddMenu     = $('sheetAddMenu');
const sheetPlay        = $('sheetPlay');
const sheetPrev        = $('sheetPrev');
const sheetNext        = $('sheetNext');
const sheetShuffle     = $('sheetShuffle');
const sheetRepeat      = $('sheetRepeat');
const sheetQueueBtn    = $('sheetQueueBtn');
const sheetBar         = $('sheetBar');
const sheetFill        = $('sheetFill');
const sheetThumb       = $('sheetThumb');
const sheetCurrent     = $('sheetCurrent');
const sheetDuration    = $('sheetDuration');
const volSlider        = $('volSlider');
const miniPlayer       = $('miniPlayer');
const miniPlayerExpand = $('miniPlayerExpand');
const miniCover        = $('miniCover');
const miniTitle        = $('miniTitle');
const miniArtist       = $('miniArtist');
const miniPlay         = $('miniPlay');
const miniNext         = $('miniNext');
const miniProgressFill = $('miniProgressFill');
const searchInput      = $('searchInput');
const searchClear      = $('searchClear');
const searchBrowse     = $('searchBrowse');
const searchResults    = $('searchResults');
const genreGrid        = $('genreGrid');
const favoritosList    = $('favoritosList');
const bottomNav        = $('bottomNav');
const topbarSearchBtn  = $('topbarSearchBtn');
const toastContainer   = $('toastContainer');
const queuePanel       = $('queuePanel');
const queueOverlay     = $('queueOverlay');
const queueList        = $('queueList');
const queueNowPlaying  = $('queueNowPlaying');
const queueNextLabel   = $('queueNextLabel');
const queueClearBtn    = $('queueClearBtn');
const queueCloseBtn    = $('queueCloseBtn');
const contextMenu      = $('contextMenu');
const ctxPlayNow       = $('ctxPlayNow');
const ctxAddQueue      = $('ctxAddQueue');
const ctxAddPlaylist   = $('ctxAddPlaylist');
const ctxLike          = $('ctxLike');
const playlistsGrid    = $('playlistsGrid');
const btnCreatePlaylist= $('btnCreatePlaylist');
const createPlaylistModal   = $('createPlaylistModal');
const createPlaylistClose   = $('createPlaylistClose');
const confirmCreatePlaylist = $('confirmCreatePlaylist');
const playlistNameInput     = $('playlistNameInput');
const addToPlaylistModal    = $('addToPlaylistModal');
const addToPlaylistClose    = $('addToPlaylistClose');
const addToPlaylistList     = $('addToPlaylistList');
const addNewPlaylistBtn     = $('addNewPlaylistBtn');
const playlistDetailModal   = $('playlistDetailModal');
const playlistDetailClose   = $('playlistDetailClose');
const playlistDetailCover   = $('playlistDetailCover');
const playlistDetailName    = $('playlistDetailName');
const playlistDetailCount   = $('playlistDetailCount');
const playlistDetailList    = $('playlistDetailList');
const btnPlayPlaylist       = $('btnPlayPlaylist');
const btnDeletePlaylist     = $('btnDeletePlaylist');
let openPlaylistId = null;

/* ══════════════════════════════════════════════════
   5. HELPERS
══════════════════════════════════════════════════ */
function formatTime(sec) {
  if (!sec || isNaN(sec) || !isFinite(sec)) return '0:00';
  const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2,'0')}`;
}

function getPlaceholderCover(category = 'music') {
  const colors = { Reggaeton:'#e94f4f', Electronic:'#8b5cf6', 'Dance-Pop':'#1f77b4', Pop:'#3b82f6',
    Rock:'#ef4444', Jazz:'#10b981', 'Lo-Fi':'#6366f1', 'Hip-Hop':'#ec4899', Latino:'#f59e0b' };
  const bg  = colors[category] || '#8b5cf6';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><rect fill="${bg}" width="400" height="400"/><text x="50%" y="50%" font-size="80" text-anchor="middle" dominant-baseline="middle" fill="white" opacity=".3">♪</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function updatePlayIcons(playing) {
  [sheetPlay, miniPlay].forEach(btn => {
    if (!btn) return;
    btn.querySelector('.icon-play').style.display  = playing ? 'none' : '';
    btn.querySelector('.icon-pause').style.display = playing ? '' : 'none';
  });
  sheetCover?.classList.toggle('playing', playing);
  const hccBtn = $('hccPlayBtn');
  if (hccBtn) {
    const ip = hccBtn.querySelector('.hcc-icon-play');
    const ipa= hccBtn.querySelector('.hcc-icon-pause');
    if (ip)  ip.style.display  = playing ? 'none' : '';
    if (ipa) ipa.style.display = playing ? '' : 'none';
  }
}

function getTrackByFile(file) {
  // Check YouTube results + local
  const all = [..._ytFeatured, ...localTracks,
    ...playlists.flatMap(p => p.tracks.map(t => typeof t === 'string' ? null : t).filter(Boolean))
  ];
  return all.find(m => m && m.file === file) || null;
}

function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function hapticFeedback(style) {
  try { if (navigator.vibrate) navigator.vibrate(style === 'medium' ? 20 : style === 'heavy' ? 40 : 10); }
  catch (_) {}
}

/* ══════════════════════════════════════════════════
   6. TOAST
══════════════════════════════════════════════════ */
const TOAST_DURATION = 2800;
function showToast(msg, type = 'default') {
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.style.setProperty('--toast-duration', `${TOAST_DURATION}ms`);
  const iconMap = {
    success: `<svg viewBox="0 0 24 24" width="13" height="13" style="stroke:var(--green);stroke-width:2.5;fill:none;flex-shrink:0"><polyline points="20 6 9 17 4 12"/></svg>`,
    error:   `<svg viewBox="0 0 24 24" width="13" height="13" style="stroke:#ef4444;stroke-width:2.5;fill:none;flex-shrink:0"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
    default: `<span class="toast-dot"></span>`,
  };
  el.innerHTML = `<div class="toast-content">${iconMap[type]||iconMap.default}<span>${msg}</span></div><div class="toast-bar-wrap"><div class="toast-bar"></div></div>`;
  toastContainer.appendChild(el);
  const t = setTimeout(() => { el.classList.add('toast-out'); el.addEventListener('animationend', () => el.remove(), { once: true }); }, TOAST_DURATION);
  el.addEventListener('click', () => { clearTimeout(t); el.classList.add('toast-out'); el.addEventListener('animationend', () => el.remove(), { once: true }); });
}

/* ══════════════════════════════════════════════════
   7. PAGE NAVIGATION
══════════════════════════════════════════════════ */
function showPage(pageId) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const target = $(pageId);
  if (target) target.classList.add('active');
  bottomNav.querySelectorAll('.bnav-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.page === pageId);
  });
  if (pageId === 'pageFavoritos') renderFavoritos();
  if (pageId === 'pagePlaylists') renderPlaylists();
  if (pageId === 'pageLocal')     renderLocalPage();
  if (pageId === 'pageLocal')     renderLocalPage();
  if (pageId === 'pageDownloads') {
    if (typeof OfflineManager !== 'undefined') OfflineManager.renderDownloadsList();
    if (typeof renderOfflinePlaylist === 'function') renderOfflinePlaylist();
    if (typeof updateOfflineStatusBanner === 'function') updateOfflineStatusBanner();
  }
  closeContextMenu();
  updateBottomNavSlider();
}

function updateBottomNavSlider() {
  const slider    = $('bnavGlassSlider');
  const activeBtn = bottomNav.querySelector('.bnav-btn.active');
  if (!slider || !activeBtn) return;
  slider.style.width     = `${Math.max(activeBtn.offsetWidth, 56)}px`;
  slider.style.transform = `translateX(${activeBtn.offsetLeft}px)`;
}

bottomNav.querySelectorAll('.bnav-btn').forEach(btn => btn.addEventListener('click', () => showPage(btn.dataset.page)));
topbarSearchBtn.addEventListener('click', () => showPage('pageSearch'));
window.addEventListener('resize', updateBottomNavSlider);

/* ══════════════════════════════════════════════════
   8. CONTEXT MENU (bottom sheet)
══════════════════════════════════════════════════ */
const ctxSheet         = $('ctxSheet');
const ctxSheetOverlay  = $('ctxSheetOverlay');
const ctxSheetCover    = $('ctxSheetCover');
const ctxSheetTitle    = $('ctxSheetTitle');
const ctxSheetArtist   = $('ctxSheetArtist');
const ctxSheetPlayNow  = $('ctxSheetPlayNow');
const ctxSheetAddQueue = $('ctxSheetAddQueue');
const ctxSheetAddPlaylist = $('ctxSheetAddPlaylist');
const ctxSheetLike     = $('ctxSheetLike');
const ctxSheetLikeIcon = $('ctxSheetLikeIcon');
const ctxSheetLikeLabel= $('ctxSheetLikeLabel');
const ctxSheetOffline  = $('ctxSheetOffline');
const ctxSheetOfflineIcon  = $('ctxSheetOfflineIcon');
const ctxSheetOfflineLabel = $('ctxSheetOfflineLabel');
const ctxSheetCancel   = $('ctxSheetCancel');

let _ctxDragStartY = 0, _ctxDragCurrentY = 0, _ctxDragging = false;

function openContextMenu(item) {
  contextTarget = item;
  const liked   = likedTracks.has(item.file);
  const cover   = item.cover || getPlaceholderCover(item.category);
  ctxSheetCover.src   = cover;
  ctxSheetCover.onerror = () => { ctxSheetCover.src = getPlaceholderCover(item.category); };
  ctxSheetTitle.textContent  = item.title;
  ctxSheetArtist.textContent = item.artist;
  _updateCtxLikeState(liked);
  _updateCtxOfflineState(typeof OfflineManager !== 'undefined' && OfflineManager.isDownloaded(item.file));
  ctxSheet.classList.add('open');
  ctxSheetOverlay.classList.add('open');
  document.body.style.overflow = 'hidden';
  ctxSheet.style.transform = ''; ctxSheet.style.transition = '';
}

function _updateCtxOfflineState(dl) {
  if (!ctxSheetOffline) return;
  ctxSheetOffline.classList.toggle('downloaded', dl);
  if (ctxSheetOfflineLabel) ctxSheetOfflineLabel.textContent = dl ? 'Eliminar descarga' : 'Guardar sin conexión';
  if (ctxSheetOfflineIcon) ctxSheetOfflineIcon.innerHTML = dl
    ? `<svg viewBox="0 0 24 24" width="20" height="20" style="color:var(--green)"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>`
    : `<svg viewBox="0 0 24 24" width="20" height="20"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`;
}
function _updateCtxLikeState(liked) {
  ctxSheetLike.classList.toggle('liked', liked);
  ctxSheetLikeLabel.textContent = liked ? 'Quitar de likes' : 'Me gusta';
  ctxSheetLikeIcon.innerHTML = liked
    ? `<svg viewBox="0 0 24 24" width="20" height="20" style="fill:#e94f4f;stroke:#e94f4f"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>`
    : `<svg viewBox="0 0 24 24" width="20" height="20"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>`;
}
function closeContextMenu() {
  ctxSheet.classList.remove('open'); ctxSheetOverlay.classList.remove('open');
  document.body.style.overflow = ''; ctxSheet.style.transform = ''; ctxSheet.style.transition = '';
  contextTarget = null;
}
ctxSheetOverlay.addEventListener('click', closeContextMenu);
ctxSheetCancel.addEventListener('click', closeContextMenu);
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeContextMenu(); });

// Swipe to dismiss
const _ctxHandle = ctxSheet.querySelector('.ctx-sheet-handle-wrap');
_ctxHandle.addEventListener('touchstart', e => { _ctxDragStartY = e.touches[0].clientY; _ctxDragging = true; ctxSheet.style.transition = 'none'; }, { passive: true });
document.addEventListener('touchmove', e => { if (!_ctxDragging) return; const dy = Math.max(0, e.touches[0].clientY - _ctxDragStartY); _ctxDragCurrentY = dy; ctxSheet.style.transform = `translateY(${dy}px)`; }, { passive: true });
document.addEventListener('touchend', () => { if (!_ctxDragging) return; _ctxDragging = false; ctxSheet.style.transition = ''; if (_ctxDragCurrentY > 100) closeContextMenu(); else ctxSheet.style.transform = ''; _ctxDragCurrentY = 0; }, { passive: true });

ctxSheetPlayNow.addEventListener('click', () => { if (contextTarget) { loadTrack(contextTarget); closeContextMenu(); } });
ctxSheetAddQueue.addEventListener('click', () => { if (contextTarget) { addToQueue(contextTarget); closeContextMenu(); } });
ctxSheetAddPlaylist.addEventListener('click', () => { if (contextTarget) { openAddToPlaylist(contextTarget); closeContextMenu(); } });
ctxSheetLike.addEventListener('click', () => {
  if (contextTarget) { toggleLike(contextTarget); _updateCtxLikeState(likedTracks.has(contextTarget.file)); setTimeout(closeContextMenu, 280); }
});
if (ctxSheetOffline) {
  ctxSheetOffline.addEventListener('click', async () => {
    if (!contextTarget || typeof OfflineManager === 'undefined') return;
    const track = contextTarget;
    const isDl  = OfflineManager.isDownloaded(track.file);
    closeContextMenu();
    if (isDl) { await OfflineManager.deleteDownload(track.file); showToast(`"${track.title}" eliminada de offline`); }
    else await OfflineManager.downloadTrack(track);
  });
}

/* ══════════════════════════════════════════════════
   9. HOME SCREEN — YouTube powered
══════════════════════════════════════════════════ */
async function renderHomeScreen() {
  // Continue listening
  const continueSection = $('homeContinueSection');
  if (historyTracks.length > 0) {
    const lastFile  = historyTracks[0].file;
    const lastTrack = _ytFeatured.find(t => t.file === lastFile) || localTracks.find(t => t.file === lastFile);
    if (lastTrack) {
      const cover = lastTrack.cover || getPlaceholderCover(lastTrack.category);
      const hccCover  = $('hccCover');
      const hccTitle  = $('hccTitle');
      const hccArtist = $('hccArtist');
      const hccGlow   = $('hccGlow');
      if (hccCover)  hccCover.src = cover;
      if (hccTitle)  hccTitle.textContent  = lastTrack.title;
      if (hccArtist) hccArtist.textContent = lastTrack.artist;
      if (hccGlow)   hccGlow.style.backgroundImage = `url(${cover})`;
      if (continueSection) continueSection.style.display = '';
      const hccBtn = $('hccPlayBtn');
      if (hccBtn) hccBtn.onclick = () => {
        const cur = playlist[currentTrackIdx];
        if (cur?.file === lastTrack.file) togglePlay(); else loadTrack(lastTrack);
      };
    }
  }

  // Featured tracks from Jamendo
  const featGrid = $('homeFeaturedGrid');
  if (featGrid && featGrid.innerHTML === '') {
    // Show skeleton first
    featGrid.innerHTML = Array(6).fill(`
      <div class="home-track-card skeleton-card">
        <div class="home-track-cover skeleton-cover"></div>
        <div class="skeleton-line" style="width:80%;margin-top:.4rem"></div>
        <div class="skeleton-line" style="width:60%"></div>
      </div>`).join('');

    try {
      // Load YouTube trending music via search
      let featured = _ytFeatured;
      if (!_ytLoaded && window.DroplyYT) {
        featured = await window.DroplyYT.search('trending music 2025');
        _ytFeatured = featured;
        _ytLoaded = true;
      }
      featGrid.innerHTML = '';
      const picks = shuffleArray(featured).slice(0, 12);
      picks.forEach(item => {
        featGrid.appendChild(_buildHomeTrackCard(item, featured));
      });
    } catch (e) {
      featGrid.innerHTML = '<p style="color:var(--text-soft);padding:1rem;font-size:.85rem">Busca canciones de YouTube arriba ↑</p>';
    }
  }

  // User playlists
  const plSection = $('homePlSection');
  const plGrid    = $('homePlGrid');
  if (plGrid && playlists.length > 0) {
    plGrid.innerHTML = '';
    playlists.slice(0,10).forEach(pl => {
      const imgs = pl.tracks.slice(0,4).map(t => (typeof t === 'object' ? t.cover : null)).filter(Boolean);
      const card = document.createElement('div');
      card.className = 'home-pl-card';
      const cov = imgs.length === 0
        ? `<div class="home-pl-cover home-pl-cover--empty"><svg viewBox="0 0 24 24" width="24" height="24" style="opacity:.25"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/></svg></div>`
        : `<div class="home-pl-cover${imgs.length > 1 ? ' home-pl-cover--grid' : ''}">${imgs.slice(0,4).map(s=>`<img src="${s}" alt="">`).join('')}</div>`;
      card.innerHTML = `${cov}<p class="home-pl-name">${pl.name}</p><p class="home-pl-count">${pl.tracks.length} canciones</p>`;
      card.addEventListener('click', () => openPlaylistDetail(pl.id));
      plGrid.appendChild(card);
    });
    if (plSection) plSection.style.display = '';
  }

  // Quick access event listeners
  document.querySelectorAll('.home-quick-item[data-page]').forEach(btn => {
    btn.addEventListener('click', () => showPage(btn.dataset.page));
  });
  const qdl = $('quickDownloads');
  if (qdl) qdl.addEventListener('click', () => showPage('pageDownloads'));
  const qh  = $('quickHistory');
  if (qh)  qh.addEventListener('click', () => showPage('pageSearch'));

  document.querySelectorAll('.home-section-link[data-page]').forEach(btn => {
    btn.addEventListener('click', () => showPage(btn.dataset.page));
  });
}

function _buildHomeTrackCard(item, contextList) {
  const cover = item.cover || getPlaceholderCover(item.category);
  const card  = document.createElement('div');
  card.className = 'home-track-card';
  card.innerHTML = `
    <div class="home-track-cover">
      <img src="${cover}" alt="${item.title}" onerror="this.src='${getPlaceholderCover(item.category)}'">
      <div class="home-track-play-overlay">
        <svg viewBox="0 0 24 24" fill="white" stroke="none" width="18" height="18"><polygon points="5,3 19,12 5,21"/></svg>
      </div>
      <button class="home-track-more-btn" aria-label="Más opciones">
        <svg viewBox="0 0 24 24" width="14" height="14"><circle cx="12" cy="5" r="1.3" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none"/><circle cx="12" cy="19" r="1.3" fill="currentColor" stroke="none"/></svg>
      </button>
      ${item.source === 'youtube' ? '<span class="yt-online-badge" title="YouTube">YT</span>' : ''}
    </div>
    <p class="home-track-title">${item.title}</p>
    <p class="home-track-artist">${item.artist}</p>`;
  card.addEventListener('click', e => { if (!e.target.closest('.home-track-more-btn')) loadTrack(item, false, contextList); });
  card.querySelector('.home-track-more-btn').addEventListener('click', e => { e.stopPropagation(); openContextMenu(item); });
  return card;
}

/* ══════════════════════════════════════════════════
   10. GENRE DETAIL
══════════════════════════════════════════════════ */
(function setupGenreDetail() {
  const modal      = $('genreDetailModal');
  const closeBtn   = $('genreDetailClose');
  const bgEl       = $('genrePageBg');
  const coverEl    = $('genreDetailCover');
  const nameEl     = $('genreDetailName');
  const countEl    = $('genreDetailCount');
  const listEl     = $('genreDetailList');
  const topTitleEl = $('genrePageTopTitle');
  const playBtn    = $('btnPlayGenre');
  const shuffleBtn = $('btnShuffleGenre');
  let _currentGenreTracks = [];
  let _loading = false;

  window.openGenreDetail = async function(tag, label) {
    if (_loading) return;
    _loading = true;
    if (nameEl) nameEl.textContent = label || tag;
    if (topTitleEl) { topTitleEl.textContent = label || tag; topTitleEl.classList.remove('visible'); }
    if (countEl) countEl.textContent = 'Cargando…';
    if (listEl) listEl.innerHTML = Array(8).fill(`<div class="playlist-detail-item skeleton-row"><div class="skeleton-cover" style="width:44px;height:44px;border-radius:6px;flex-shrink:0"></div><div style="flex:1;padding:.2rem 0"><div class="skeleton-line" style="width:70%"></div><div class="skeleton-line" style="width:50%"></div></div></div>`).join('');
    if (modal) { modal.classList.add('open'); document.body.style.overflow = 'hidden'; }

    try {
      if (!window.DroplyYT) throw new Error('Motor no disponible');
      const items = await window.DroplyYT.search(tag);
      // Cache para findTrack
      items.forEach(r => { if (!_ytFeatured.find(t => t._ytId === r._ytId)) _ytFeatured.push(r); });
      _currentGenreTracks = items;
      if (countEl) countEl.textContent = `${items.length} canciones`;
      const imgs = items.slice(0,4).map(m => m.cover).filter(Boolean);
      if (coverEl) {
        coverEl.innerHTML = ''; coverEl.className = 'playlist-detail-cover';
        if (imgs.length === 0) { coverEl.innerHTML = `<div class="playlist-detail-cover-empty"><svg viewBox="0 0 24 24" width="40" height="40"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/></svg></div>`; }
        else if (imgs.length === 1) { coverEl.classList.add('single'); coverEl.innerHTML = `<img src="${imgs[0]}" alt="cover">`; }
        else { imgs.slice(0,4).forEach(s => { const i = document.createElement('img'); i.src = s; coverEl.appendChild(i); }); }
      }
      if (bgEl && imgs[0]) bgEl.style.backgroundImage = `url(${imgs[0]})`;
      if (listEl) {
        listEl.innerHTML = '';
        items.forEach(item => {
          const div = _buildDetailRow(item, items, listEl);
          listEl.appendChild(div);
        });
      }
    } catch (e) {
      if (listEl) listEl.innerHTML = `<p style="color:var(--text-soft);padding:2rem;text-align:center">Error cargando canciones</p>`;
    } finally { _loading = false; }

    // Scroll title
    const scrollEl = modal?.querySelector('.playlist-page-scroll');
    if (scrollEl) {
      scrollEl.removeEventListener('scroll', scrollEl._scroll || (() => {}));
      scrollEl._scroll = () => {
        const hero = modal.querySelector('.playlist-page-hero');
        if (!hero || !topTitleEl) return;
        topTitleEl.classList.toggle('visible', scrollEl.scrollTop > hero.offsetHeight - 60);
      };
      scrollEl.addEventListener('scroll', scrollEl._scroll, { passive: true });
      scrollEl.scrollTop = 0;
    }
  };

  closeBtn?.addEventListener('click', () => { modal?.classList.remove('open'); document.body.style.overflow = ''; });
  playBtn?.addEventListener('click', () => { if (_currentGenreTracks.length) { loadTrack(_currentGenreTracks[0], false, _currentGenreTracks); showToast(`Reproduciendo ${nameEl?.textContent||''}`, 'success'); } });
  shuffleBtn?.addEventListener('click', () => { if (_currentGenreTracks.length) { const s = shuffleArray([..._currentGenreTracks]); loadTrack(s[0], false, s); showToast('Reproducción aleatoria', 'success'); } });
})();

/* ══════════════════════════════════════════════════
   11. SEARCH — YouTube powered (via youtube.js)
══════════════════════════════════════════════════ */
let _searchTimeout;
let _searchAbort = null;

searchInput?.addEventListener('input', () => {
  const q = searchInput.value.trim();
  searchClear.style.display = q ? '' : 'none';
  clearTimeout(_searchTimeout);
  if (!q) { searchBrowse.style.display = ''; searchResults.style.display = 'none'; searchResults.innerHTML = ''; return; }
  searchBrowse.style.display = 'none'; searchResults.style.display = '';
  searchResults.innerHTML = `<div class="search-loading"><div class="search-spinner"></div><span>Buscando "${q}"…</span></div>`;
  _searchTimeout = setTimeout(async () => {
    if (_searchAbort) _searchAbort.abort();
    try {
      if (!window.DroplyYT) {
        searchResults.innerHTML = `<p style="color:var(--text-soft);padding:2rem;text-align:center">Motor de búsqueda no disponible.</p>`;
        return;
      }
      const results = await window.DroplyYT.search(q);
      if (searchInput.value.trim() !== q) return; // stale
      // Cache results for findTrack
      results.forEach(r => { if (!_ytFeatured.find(t => t._ytId === r._ytId)) _ytFeatured.push(r); });
      renderSearchResults(results, q);
    } catch (e) {
      searchResults.innerHTML = `<p style="color:var(--text-soft);padding:2rem;text-align:center">Error en la búsqueda. Comprueba tu conexión.</p>`;
    }
  }, 350);
});

function renderSearchResults(results, q) {
  searchResults.innerHTML = '';
  if (results.length === 0) {
    searchResults.innerHTML = `<div class="no-results"><p>Sin resultados para "<strong>${q}</strong>" en el catálogo libre.<br><span style="font-size:.8rem;color:var(--text-soft)">Prueba con un término diferente o explora géneros.</span></p></div>`;
    return;
  }
  // Section label
  const label = document.createElement('p');
  label.className = 'search-section-label';
  label.textContent = `${results.length} resultados en YouTube`;
  searchResults.appendChild(label);

  results.forEach(item => {
    const row = _buildSearchRow(item);
    searchResults.appendChild(row);
  });
}

function _buildSearchRow(item) {
  const cover = item.cover || getPlaceholderCover(item.category);
  const wrap  = document.createElement('div');
  wrap.className = 'search-result-row-wrap';
  const row = document.createElement('div');
  row.className = 'search-result-row';
  row.innerHTML = `
    <img src="${cover}" alt="${item.title}" onerror="this.src='${getPlaceholderCover(item.category)}'"/>
    <div class="search-result-info">
      <span class="search-result-title">${item.title}</span>
      <span class="search-result-artist">${item.artist}</span>
    </div>
    <div class="search-result-actions">
      <button class="search-result-add-btn" title="Añadir a playlist" aria-label="Añadir a playlist">
        <svg viewBox="0 0 24 24" width="18" height="18"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
      </button>
      <button class="search-result-more-btn" title="Más opciones" aria-label="Más opciones">
        <svg viewBox="0 0 24 24" width="16" height="16"><circle cx="12" cy="5" r="1.5" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="12" cy="19" r="1.5" fill="currentColor" stroke="none"/></svg>
      </button>
    </div>
    <span class="search-result-cat">${item.category}</span>`;
  row.addEventListener('click', e => {
    if (e.target.closest('.search-result-more-btn') || e.target.closest('.search-result-add-btn')) return;
    loadTrack(item);
  });
  row.querySelector('.search-result-add-btn').addEventListener('click', e => { e.stopPropagation(); openAddToPlaylist(item); });
  row.querySelector('.search-result-more-btn').addEventListener('click', e => { e.stopPropagation(); openContextMenu(item); });
  wrap.appendChild(row);
  return wrap;
}

searchClear?.addEventListener('click', () => {
  searchInput.value = ''; searchClear.style.display = 'none';
  searchBrowse.style.display = ''; searchResults.style.display = 'none'; searchResults.innerHTML = '';
});

// YouTube genre searches
const YT_GENRES = [
  { tag: 'pop music hits',      label: 'Pop',        color: 'linear-gradient(135deg,#3b82f6,#1d4ed8)' },
  { tag: 'electronic music',    label: 'Electronic', color: 'linear-gradient(135deg,#8b5cf6,#6d28d9)' },
  { tag: 'rock songs',          label: 'Rock',       color: 'linear-gradient(135deg,#ef4444,#b91c1c)' },
  { tag: 'hip hop rap',         label: 'Hip-Hop',    color: 'linear-gradient(135deg,#ec4899,#be185d)' },
  { tag: 'jazz music',          label: 'Jazz',       color: 'linear-gradient(135deg,#10b981,#065f46)' },
  { tag: 'lo-fi chill beats',   label: 'Lo-Fi',      color: 'linear-gradient(135deg,#6366f1,#312e81)' },
  { tag: 'dance music',         label: 'Dance',      color: 'linear-gradient(135deg,#f59e0b,#b45309)' },
  { tag: 'reggaeton latino',    label: 'Latino',     color: 'linear-gradient(135deg,#fbbf24,#d97706)' },
  { tag: 'classical music',     label: 'Clásica',    color: 'linear-gradient(135deg,#a78bfa,#5b21b6)' },
  { tag: 'folk acoustic',       label: 'Folk',       color: 'linear-gradient(135deg,#f97316,#c2410c)' },
  { tag: 'metal heavy',         label: 'Metal',      color: 'linear-gradient(135deg,#475569,#0f172a)' },
  { tag: 'r&b soul music',      label: 'R&B / Soul', color: 'linear-gradient(135deg,#e879f9,#86198f)' },
  { tag: 'reggae music',        label: 'Reggae',     color: 'linear-gradient(135deg,#22c55e,#15803d)' },
  { tag: 'country music',       label: 'Country',    color: 'linear-gradient(135deg,#84cc16,#3f6212)' },
  { tag: 'blues music',         label: 'Blues',      color: 'linear-gradient(135deg,#38bdf8,#075985)' },
  { tag: 'ambient relaxing',    label: 'Ambient',    color: 'linear-gradient(135deg,#67e8f9,#0e7490)' },
];

function buildGenreGrid() {
  if (!genreGrid) return;
  genreGrid.innerHTML = '';
  YT_GENRES.forEach(g => {
    const btn = document.createElement('button');
    btn.className = 'genre-pill';
    btn.style.background = g.color;
    btn.innerHTML = `<span>${g.label}</span>`;
    btn.addEventListener('click', () => { openGenreDetail(g.tag, g.label); });
    genreGrid.appendChild(btn);
  });
}

/* ══════════════════════════════════════════════════
   12. AUDIO ENGINE
══════════════════════════════════════════════════ */
window.audioEl = audioEl;
let _playToken = 0;
let _rafPending = false;

audioEl.addEventListener('timeupdate', function() {
  if (_rafPending) return;
  _rafPending = true;
  requestAnimationFrame(() => {
    _rafPending = false;
    const dur = audioEl.duration, cur = audioEl.currentTime;
    if (!dur || isNaN(dur) || !isFinite(dur)) return;
    const pct = Math.max(0, Math.min(100, (cur / dur) * 100));
    sheetFill.style.width = pct + '%'; sheetThumb.style.left = pct + '%';
    sheetCurrent.textContent = formatTime(cur); sheetDuration.textContent = formatTime(dur);
    miniProgressFill.style.width = pct + '%';
    _updateMediaSessionPosition();
  });
}, { passive: true });

audioEl.addEventListener('ended', function() {
  if (window._droplyYTActive) return; // YT is in control, ignore native audio events
  isPlaying = false;
  if (repeatMode) { this.currentTime = 0; this.play().then(() => { isPlaying = true; updatePlayIcons(true); }).catch(() => { updatePlayIcons(false); }); }
  else { updatePlayIcons(false); playNext(); }
}, { passive: true });

audioEl.addEventListener('play', function() {
  isPlaying = true; updatePlayIcons(true);
  if ('mediaSession' in navigator) {
    try { navigator.mediaSession.playbackState = 'playing'; } catch (_) {}
    try {
      navigator.mediaSession.setActionHandler('play',  () => { audioEl.play().then(() => { isPlaying = true; updatePlayIcons(true); }).catch(() => {}); });
      navigator.mediaSession.setActionHandler('pause', () => { audioEl.pause(); isPlaying = false; updatePlayIcons(false); });
    } catch (_) {}
  }
}, { passive: true });

audioEl.addEventListener('loadedmetadata', function() {
  _updateMediaSessionPosition();
  const dur = this.duration;
  if (dur && isFinite(dur)) sheetDuration.textContent = formatTime(dur);
}, { passive: true });

audioEl.addEventListener('playing', function() {
  _updateMediaSessionPosition();
  if ('mediaSession' in navigator) try { navigator.mediaSession.playbackState = 'playing'; } catch (_) {}
}, { passive: true });

audioEl.addEventListener('pause', function() {
  if (!this.paused) return;
  isPlaying = false; updatePlayIcons(false);
  if ('mediaSession' in navigator) try { navigator.mediaSession.playbackState = 'paused'; } catch (_) {}
}, { passive: true });

function animateBackgroundTransition(newCover) {
  sheetBgBlur.style.transition = 'opacity .4s ease'; sheetBgBlur.style.opacity = '0';
  setTimeout(() => { sheetBgBlur.style.backgroundImage = `url(${newCover})`; sheetBgBlur.style.opacity = '1'; }, 200);
}

/* ══════════════════════════════════════════════════
   13. LOAD TRACK
══════════════════════════════════════════════════ */
function loadTrack(item, fromQueue = false, newPlaylistContext = null) {
  if (!item?.file) return;
  const cover = item.cover || getPlaceholderCover(item.category);

  // History
  historyTracks.unshift({ file: item.file, timestamp: Date.now() });
  historyTracks = historyTracks.filter((v,i,a) => a.findIndex(x => x.file === v.file) === i).slice(0,100);
  saveHistory();

  // Play counts
  playCounts[item.file] = (playCounts[item.file] || 0) + 1;
  savePlayCounts();

  // Playlist context
  if (!fromQueue) {
    playlist = newPlaylistContext || _ytFeatured.filter(Boolean);
    currentTrackIdx = playlist.findIndex(p => p.file === item.file);
    if (currentTrackIdx < 0) { playlist = [item, ...playlist]; currentTrackIdx = 0; }
  } else {
    const idx = playlist.findIndex(p => p.file === item.file);
    if (idx >= 0) currentTrackIdx = idx;
  }

  // UI — mini player
  if (miniCover) miniCover.src = cover;
  if (miniTitle) miniTitle.textContent  = item.title;
  if (miniArtist) miniArtist.textContent = item.artist;
  miniPlayer?.classList.add('visible');

  // UI — sheet
  if (sheetCover) sheetCover.src = cover;
  if (sheetCategory) sheetCategory.textContent = (item.source === 'youtube' || item._source === 'youtube') ? 'YouTube · Online' : (item.category || '');
  if (sheetTitle) sheetTitle.textContent  = item.title;
  if (sheetArtist) sheetArtist.textContent = item.artist;
  animateBackgroundTransition(cover);
  sheetHeart?.classList.toggle('liked', likedTracks.has(item.file));

  document.querySelectorAll('.media-card').forEach(c => c.classList.remove('is-playing'));

  renderQueueNowPlaying(item);
  setupMediaSession(item);

  // Continue card
  const hccCoverEl = $('hccCover');
  if (hccCoverEl) {
    hccCoverEl.src = cover;
    const hccTitleEl  = $('hccTitle');
    const hccArtistEl = $('hccArtist');
    const hccGlowEl   = $('hccGlow');
    const contSec     = $('homeContinueSection');
    if (hccTitleEl)  hccTitleEl.textContent  = item.title;
    if (hccArtistEl) hccArtistEl.textContent = item.artist;
    if (hccGlowEl)   hccGlowEl.style.backgroundImage = `url(${cover})`;
    if (contSec)     contSec.style.display = '';
    const hccBtn = $('hccPlayBtn');
    if (hccBtn) hccBtn.onclick = () => {
      const cur = playlist[currentTrackIdx];
      if (cur?.file === item.file) togglePlay(); else loadTrack(item);
    };
  }

  // Audio: hard switch
  const myToken = ++_playToken;
  sheetFill.style.width = '0%'; sheetThumb.style.left = '0%';
  sheetCurrent.textContent = '0:00'; sheetDuration.textContent = '0:00';
  miniProgressFill.style.width = '0%';

  if ('mediaSession' in navigator) {
    try { navigator.mediaSession.setPositionState({ duration: 0, playbackRate: 1, position: 0 }); } catch (_) {}
  }

  audioEl.pause();

  function _doPlay(src) {
    if (myToken !== _playToken) return;
    audioEl.src = src;
    audioEl.currentTime = 0;
    audioEl.muted = false;
    if (audioEl.volume === 0) audioEl.volume = 1;
    audioEl.play()
      .then(() => { if (myToken !== _playToken) return; isPlaying = true; updatePlayIcons(true); })
      .catch(err => {
        if (myToken !== _playToken) return;
        isPlaying = false; updatePlayIcons(false);
        if (err.name === 'NotAllowedError') window._droplyPendingTrack = true;
        else if (err.name !== 'AbortError') console.warn('[DROPLY] play error:', err);
      });
  }

  // Check offline IDB first
  if (typeof OfflineManager !== 'undefined' && OfflineManager.isDownloaded(item.file)) {
    OfflineManager.getOfflineSrc(item.file).then(blob => _doPlay(blob || item.file)).catch(() => _doPlay(item.file));
  } else {
    _doPlay(item.stream || item.file);
  }
}

/* Seek / Volume */
volSlider?.addEventListener('input', () => { audioEl.volume = parseFloat(volSlider.value); });

function seekToPercent(pct) {
  if (audioEl.duration && isFinite(audioEl.duration))
    audioEl.currentTime = Math.max(0, Math.min(1, pct)) * audioEl.duration;
}
sheetBar?.addEventListener('click', e => { const r = sheetBar.getBoundingClientRect(); seekToPercent((e.clientX - r.left) / r.width); });
let _barDragging = false;
sheetBar?.addEventListener('touchstart', e => { _barDragging = true; const r = sheetBar.getBoundingClientRect(); seekToPercent((e.touches[0].clientX - r.left) / r.width); }, { passive: true });
sheetBar?.addEventListener('touchmove',  e => { if (!_barDragging) return; const r = sheetBar.getBoundingClientRect(); seekToPercent((e.touches[0].clientX - r.left) / r.width); }, { passive: true });
sheetBar?.addEventListener('touchend',   () => { _barDragging = false; }, { passive: true });

// Swipe down to close sheet
let _sheetStartY = 0;
nowPlayingSheet?.addEventListener('touchstart', e => { _sheetStartY = e.touches[0].clientY; }, { passive: true });
nowPlayingSheet?.addEventListener('touchend',   e => { if (e.changedTouches[0].clientY - _sheetStartY > 80) nowPlayingSheet.classList.remove('open'); }, { passive: true });

/* ══════════════════════════════════════════════════
   14. PLAYER CONTROLS
══════════════════════════════════════════════════ */
function togglePlay() {
  if (!audioEl.src && !audioEl.currentSrc) return;
  if (audioEl.paused) {
    audioEl.play().then(() => { isPlaying = true; updatePlayIcons(true); }).catch(err => { if (err.name === 'NotAllowedError') window._droplyPendingTrack = true; });
  } else {
    audioEl.pause(); isPlaying = false; updatePlayIcons(false);
  }
}

function playNext() {
  if (queue.length > 0) {
    const nextFile = queue.shift(); saveQueue();
    const item = _findTrack(nextFile);
    if (item) { loadTrack(item, true); renderQueueList(); return; }
  }
  if (!playlist.length) return;
  let nextIdx = currentTrackIdx;
  if (shuffleMode) nextIdx = Math.floor(Math.random() * playlist.length);
  else nextIdx = (nextIdx + 1) % playlist.length;
  currentTrackIdx = nextIdx;
  loadTrack(playlist[nextIdx], true);
}

function playPrev() {
  if (audioEl.currentTime > 3) { audioEl.currentTime = 0; return; }
  if (!playlist.length) return;
  currentTrackIdx = (currentTrackIdx - 1 + playlist.length) % playlist.length;
  loadTrack(playlist[currentTrackIdx], true);
}

function _findTrack(file) {
  return _ytFeatured.find(t => t.file === file)
    || localTracks.find(t => t.file === file)
    || playlists.flatMap(p => p.tracks).find(t => t?.file === file)
    || null;
}

function addToQueue(item) {
  if (!item?.file) return;
  queue.push(item.file); saveQueue(); renderQueueList();
  showToast(`"${item.title}" añadida a la cola`, 'success');
}

/* Wire player buttons */
sheetPlay?.addEventListener('click', togglePlay);
sheetNext?.addEventListener('click', playNext);
sheetPrev?.addEventListener('click', playPrev);
miniPlay?.addEventListener('click',  togglePlay);
miniNext?.addEventListener('click',  playNext);
miniPlayerExpand?.addEventListener('click', () => nowPlayingSheet.classList.add('open'));
sheetClose?.addEventListener('click', () => nowPlayingSheet.classList.remove('open'));
sheetHeart?.addEventListener('click', () => { const c = playlist[currentTrackIdx]; if (c) toggleLike(c); });
sheetAddMenu?.addEventListener('click', () => { const c = playlist[currentTrackIdx]; if (c) openContextMenu(c); });
sheetShuffle?.addEventListener('click', () => { shuffleMode = !shuffleMode; sheetShuffle.classList.toggle('active', shuffleMode); showToast(shuffleMode ? 'Aleatorio activado' : 'Aleatorio desactivado'); });
sheetRepeat?.addEventListener('click', () => { repeatMode = !repeatMode; sheetRepeat.classList.toggle('active', repeatMode); showToast(repeatMode ? 'Repetición activada' : 'Repetición desactivada'); });
sheetQueueBtn?.addEventListener('click', openQueuePanel);
queueCloseBtn?.addEventListener('click', closeQueuePanel);
queueOverlay?.addEventListener('click', closeQueuePanel);
queueClearBtn?.addEventListener('click', () => { queue = []; saveQueue(); renderQueueList(); showToast('Cola vaciada'); });
ctxPlayNow?.addEventListener('click',     () => { if (contextTarget) { loadTrack(contextTarget); closeContextMenu(); } });
ctxAddQueue?.addEventListener('click',    () => { if (contextTarget) { addToQueue(contextTarget); closeContextMenu(); } });
ctxAddPlaylist?.addEventListener('click', () => { if (contextTarget) { openAddToPlaylist(contextTarget); closeContextMenu(); } });
ctxLike?.addEventListener('click',        () => { if (contextTarget) { toggleLike(contextTarget); closeContextMenu(); } });

/* Queue panel */
function openQueuePanel()  { queuePanel?.classList.add('open'); queueOverlay?.classList.add('open'); document.body.style.overflow = 'hidden'; }
function closeQueuePanel() { queuePanel?.classList.remove('open'); queueOverlay?.classList.remove('open'); document.body.style.overflow = ''; }

function renderQueueNowPlaying(item) {
  if (!queueNowPlaying) return;
  const cover = item.cover || getPlaceholderCover(item.category);
  queueNowPlaying.innerHTML = `
    <p class="queue-now-label">Reproduciendo ahora</p>
    <div class="queue-now-card">
      <div class="queue-now-cover-wrap">
        <img class="queue-now-img" src="${cover}" alt="${item.title}"/>
        <div class="queue-now-bars"><div class="queue-now-bar"></div><div class="queue-now-bar"></div><div class="queue-now-bar"></div></div>
      </div>
      <div class="queue-now-info">
        <div class="queue-now-title">${item.title}</div>
        <div class="queue-now-artist">${item.artist}</div>
        <div class="queue-now-progress"><div class="queue-now-progress-fill" id="queueProgressFill"></div></div>
      </div>
    </div>`;
}

function renderQueueList() {
  if (!queueList) return;
  if (queue.length === 0) {
    if (queueNextLabel) queueNextLabel.style.display = 'none';
    queueList.innerHTML = `<div class="queue-empty"><div class="queue-empty-icon"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg></div><p><strong>Cola vacía</strong><br>Añade canciones con ⋯</p></div>`;
    return;
  }
  if (queueNextLabel) queueNextLabel.style.display = '';
  const cb = $('queueCountBadge'); if (cb) cb.textContent = queue.length;
  queueList.innerHTML = '';
  queue.forEach((file, i) => {
    const item  = _findTrack(file);
    if (!item) return;
    const cover = item.cover || getPlaceholderCover(item.category);
    const row   = document.createElement('div');
    row.className = 'queue-item'; row.dataset.file = file; row.dataset.index = i;
    row.innerHTML = `
      <div class="queue-item-drag"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="8" y1="6" x2="16" y2="6"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="8" y1="18" x2="16" y2="18"/></svg></div>
      <div class="queue-item-cover"><img src="${cover}" alt="" loading="lazy"/><div class="queue-item-num">${i+1}</div></div>
      <div class="queue-item-info"><div class="queue-item-title">${item.title}</div><div class="queue-item-artist">${item.artist}</div></div>
      <div class="queue-item-actions">
        <button class="queue-item-btn" data-action="remove" title="Quitar">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>`;
    row.addEventListener('click', e => {
      if (e.target.closest('[data-action="remove"]')) { queue.splice(i,1); saveQueue(); renderQueueList(); return; }
      loadTrack(item, true);
    });
    queueList.appendChild(row);
  });
}

/* ══════════════════════════════════════════════════
   15. LIKES
══════════════════════════════════════════════════ */
function toggleLike(item) {
  const key = item.file, was = likedTracks.has(key);
  if (was) { likedTracks.delete(key); showToast(`"${item.title}" eliminada de Likes`); }
  else { likedTracks.add(key); showToast(`"${item.title}" añadida a Likes`, 'success'); }
  saveLiked();
  const cur = playlist[currentTrackIdx];
  if (cur?.file === key) sheetHeart?.classList.toggle('liked', !was);
  if ($('pageFavoritos')?.classList.contains('active')) renderFavoritos();
}

function renderFavoritos() {
  if (!favoritosList) return;
  favoritosList.innerHTML = '';
  // Collect liked tracks from all sources
  const allKnown = [..._ytFeatured, ...localTracks,
    ...playlists.flatMap(p => p.tracks.filter(t => typeof t === 'object'))
  ];
  const seen = new Set();
  const liked = allKnown.filter(m => m && likedTracks.has(m.file) && !seen.has(m.file) && seen.add(m.file));

  if (liked.length === 0) {
    favoritosList.innerHTML = `<div class="fav-empty"><svg viewBox="0 0 24 24" width="48" height="48" style="margin:0 auto 1rem;display:block;color:#e94f4f;opacity:.4"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg><p style="color:var(--text-mid);text-align:center;font-size:.9rem">Aún no tienes canciones favoritas.<br>Pulsa ❤ en cualquier canción.</p></div>`;
    return;
  }
  liked.forEach((item, i) => {
    const row = _buildLibraryRow(item, i+1, () => loadTrack(item, false, liked), item);
    favoritosList.appendChild(row);
  });
}

function _buildLibraryRow(item, num, onClick, itemForCtx) {
  const cover = item.cover || getPlaceholderCover(item.category);
  const row   = document.createElement('div');
  row.className = 'library-item fade-in';
  if (playlist[currentTrackIdx]?.file === item.file) row.classList.add('playing');
  row.innerHTML = `
    <span class="library-item-num">${num}</span>
    <div class="library-thumb"><img src="${cover}" alt="${item.title}" onerror="this.src='${getPlaceholderCover(item.category)}'"/></div>
    <div class="library-info"><span class="library-track-title">${item.title}</span><span class="library-track-artist">${item.artist}</span></div>
    <div class="library-item-actions">
      <button class="library-action-btn library-action-more" data-action="more" aria-label="Más opciones">
        <svg viewBox="0 0 24 24" width="16" height="16"><circle cx="12" cy="5" r="1.5" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="12" cy="19" r="1.5" fill="currentColor" stroke="none"/></svg>
      </button>
    </div>
    <span class="library-item-dur">${item.duration || ''}</span>`;
  row.addEventListener('click', e => { if (!e.target.closest('.library-item-actions')) onClick(); });
  row.querySelector('[data-action="more"]').addEventListener('click', e => { e.stopPropagation(); openContextMenu(itemForCtx || item); });
  return row;
}

/* ══════════════════════════════════════════════════
   16. PLAYLISTS
══════════════════════════════════════════════════ */
function createPlaylist(name) {
  const pl = { id: Date.now().toString(), name: name.trim(), tracks: [], importedFrom: null };
  playlists.push(pl); savePlaylists(); renderPlaylists();
  showToast(`Playlist "${pl.name}" creada`, 'success');
  return pl;
}
function deletePlaylist(id) {
  playlists = playlists.filter(p => p.id !== id); savePlaylists(); renderPlaylists();
  showToast('Playlist eliminada');
}
function addTrackToPlaylist(plId, track) {
  const pl = playlists.find(p => p.id === plId); if (!pl) return;
  const file = typeof track === 'string' ? track : track.file;
  if (pl.tracks.some(t => (typeof t === 'string' ? t : t.file) === file)) { showToast('Ya está en la playlist'); return; }
  pl.tracks.push(typeof track === 'object' ? track : file);
  savePlaylists(); showToast(`Añadida a "${pl.name}"`, 'success');
}
function removeTrackFromPlaylist(plId, file) {
  const pl = playlists.find(p => p.id === plId); if (!pl) return;
  pl.tracks = pl.tracks.filter(t => (typeof t === 'string' ? t : t.file) !== file);
  savePlaylists(); openPlaylistDetail(plId); showToast('Eliminada de la playlist');
}

function renderPlaylists() {
  if (!playlistsGrid) return;
  playlistsGrid.innerHTML = '';
  if (playlists.length === 0) {
    playlistsGrid.innerHTML = `<div class="playlists-empty" style="grid-column:1/-1"><p>No tienes playlists aún.<br>Crea una o importa desde Spotify ↓</p><button class="btn-create-playlist" id="plImportSpotifyBtn" style="margin-top:1rem"><svg viewBox="0 0 24 24" width="14" height="14"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> Importar de Spotify</button></div>`;

    return;
  }
  playlists.forEach(pl => {
    const card  = document.createElement('div');
    card.className = 'playlist-card fade-in';
    const imgs  = pl.tracks.slice(0,4).map(t => typeof t === 'object' ? t.cover : null).filter(Boolean);
    const cov   = _buildPlaylistCoverHTML(imgs, 'playlist-card-cover');
    const badge = pl.importedFrom === 'spotify' ? '<span class="import-badge">Spotify</span>' : '';
    card.innerHTML = `${cov}<div class="playlist-card-body"><div class="playlist-card-name">${pl.name}${badge}</div><div class="playlist-card-count">${pl.tracks.length} canción${pl.tracks.length !== 1 ? 'es' : ''}</div></div>`;
    card.addEventListener('click', () => openPlaylistDetail(pl.id));
    playlistsGrid.appendChild(card);
  });
}

function _buildPlaylistCoverHTML(imgs, cls) {
  if (!imgs.length) return `<div class="${cls} single"><div class="playlist-card-cover-placeholder"><svg viewBox="0 0 24 24" width="60" height="60" style="opacity:.25"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/></svg></div></div>`;
  if (imgs.length === 1) return `<div class="${cls} single"><img src="${imgs[0]}" alt="cover"/></div>`;
  return `<div class="${cls}">${imgs.slice(0,4).map(s => `<img src="${s}" alt="cover"/>`).join('')}</div>`;
}

function openPlaylistDetail(id) {
  const pl = playlists.find(p => p.id === id); if (!pl) return;
  openPlaylistId = id;
  const topTitle = $('playlistPageTopTitle');
  if (topTitle) { topTitle.textContent = pl.name; topTitle.classList.remove('visible'); }
  playlistDetailName.textContent = pl.name;
  playlistDetailCount.textContent = `${pl.tracks.length} canción${pl.tracks.length !== 1 ? 'es' : ''}`;
  const imgs = pl.tracks.slice(0,4).map(t => typeof t === 'object' ? t.cover : null).filter(Boolean);
  playlistDetailCover.innerHTML = ''; playlistDetailCover.className = 'playlist-detail-cover';
  if (!imgs.length) { playlistDetailCover.innerHTML = `<div class="playlist-detail-cover-empty"><svg viewBox="0 0 24 24" width="40" height="40"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/></svg></div>`; }
  else if (imgs.length === 1) { playlistDetailCover.classList.add('single'); playlistDetailCover.innerHTML = `<img src="${imgs[0]}" alt="cover"/>`; }
  else { imgs.slice(0,4).forEach(s => { const img = document.createElement('img'); img.src = s; playlistDetailCover.appendChild(img); }); }
  const bgEl = $('playlistPageBg'); if (bgEl && imgs[0]) bgEl.style.backgroundImage = `url(${imgs[0]})`;
  playlistDetailList.innerHTML = '';
  if (pl.tracks.length === 0) {
    playlistDetailList.innerHTML = `<p style="color:var(--text-soft);text-align:center;padding:2.5rem 1rem">Sin canciones.<br><span style="font-size:.8rem">Añade con el menú ⋯</span></p>`;
  } else {
    const resolved = pl.tracks.map(t => typeof t === 'object' ? t : _findTrack(t)).filter(Boolean);
    resolved.forEach(item => {
      const div = _buildDetailRow(item, resolved, playlistDetailList, id);
      playlistDetailList.appendChild(div);
    });
  }
  const scrollEl = playlistDetailModal.querySelector('.playlist-page-scroll');
  if (scrollEl) {
    scrollEl.removeEventListener('scroll', scrollEl._plScroll || (() => {}));
    scrollEl._plScroll = () => { const hero = playlistDetailModal.querySelector('.playlist-page-hero'); if (!hero || !topTitle) return; topTitle.classList.toggle('visible', scrollEl.scrollTop > hero.offsetHeight - 60); };
    scrollEl.addEventListener('scroll', scrollEl._plScroll, { passive: true });
    scrollEl.scrollTop = 0;
  }
  playlistDetailModal.classList.add('open'); document.body.style.overflow = 'hidden';
}

function _buildDetailRow(item, contextList, listEl, plId) {
  const cover  = item.cover || getPlaceholderCover(item.category);
  const isPlaying = playlist[currentTrackIdx]?.file === item.file;
  const div    = document.createElement('div');
  div.className = 'playlist-detail-item' + (isPlaying ? ' playing' : '');
  div.innerHTML = `
    <img src="${cover}" alt="${item.title}" onerror="this.src='${getPlaceholderCover(item.category)}'">
    <div class="playlist-detail-info">
      <div class="playlist-detail-track">${item.title}</div>
      <div class="playlist-detail-artist">${item.artist}</div>
    </div>
    <span style="font-size:.72rem;color:var(--text-soft);flex-shrink:0">${item.duration || ''}</span>
    <button class="playlist-more-btn" style="flex-shrink:0;width:32px;height:32px;border-radius:50%;background:transparent;border:none;color:var(--text-soft);cursor:pointer;display:flex;align-items:center;justify-content:center">
      <svg viewBox="0 0 24 24" width="16" height="16"><circle cx="12" cy="5" r="1.5" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="12" cy="19" r="1.5" fill="currentColor" stroke="none"/></svg>
    </button>
    ${plId ? `<button class="playlist-detail-remove" title="Eliminar"><svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>` : ''}`;
  div.addEventListener('click', e => {
    if (e.target.closest('.playlist-detail-remove') || e.target.closest('.playlist-more-btn')) return;
    loadTrack(item, false, contextList);
    listEl.querySelectorAll('.playlist-detail-item').forEach(r => r.classList.remove('playing'));
    div.classList.add('playing');
  });
  div.querySelector('.playlist-more-btn').addEventListener('click', e => { e.stopPropagation(); openContextMenu(item); });
  const rmBtn = div.querySelector('.playlist-detail-remove');
  if (rmBtn) rmBtn.addEventListener('click', e => { e.stopPropagation(); removeTrackFromPlaylist(plId, item.file); });
  return div;
}

btnPlayPlaylist?.addEventListener('click', () => {
  if (!openPlaylistId) return;
  const pl = playlists.find(p => p.id === openPlaylistId); if (!pl || !pl.tracks.length) { showToast('Playlist vacía'); return; }
  const items = pl.tracks.map(t => typeof t === 'object' ? t : _findTrack(t)).filter(Boolean);
  if (items.length) { loadTrack(items[0], false, items); showToast(`Reproduciendo "${pl.name}"`, 'success'); }
});
const btnShufflePlaylist = $('btnShufflePlaylist');
btnShufflePlaylist?.addEventListener('click', () => {
  if (!openPlaylistId) return;
  const pl = playlists.find(p => p.id === openPlaylistId); if (!pl || !pl.tracks.length) return;
  const items = shuffleArray(pl.tracks.map(t => typeof t === 'object' ? t : _findTrack(t)).filter(Boolean));
  if (items.length) { loadTrack(items[0], false, items); showToast('Aleatorio activado', 'success'); }
});
btnDeletePlaylist?.addEventListener('click', () => {
  if (!openPlaylistId) return;
  deletePlaylist(openPlaylistId); playlistDetailModal.classList.remove('open'); document.body.style.overflow = ''; openPlaylistId = null;
});
playlistDetailClose?.addEventListener('click', () => { playlistDetailModal.classList.remove('open'); document.body.style.overflow = ''; });

btnCreatePlaylist?.addEventListener('click', () => { playlistNameInput.value = ''; createPlaylistModal.classList.add('open'); setTimeout(() => playlistNameInput.focus(), 100); });
createPlaylistClose?.addEventListener('click', () => createPlaylistModal.classList.remove('open'));
createPlaylistModal?.addEventListener('click', e => { if (e.target === createPlaylistModal) createPlaylistModal.classList.remove('open'); });
confirmCreatePlaylist?.addEventListener('click', () => { const n = playlistNameInput.value.trim(); if (!n) { playlistNameInput.focus(); return; } createPlaylist(n); createPlaylistModal.classList.remove('open'); });
playlistNameInput?.addEventListener('keydown', e => { if (e.key === 'Enter') confirmCreatePlaylist.click(); });

function openAddToPlaylist(item) {
  addToPlaylistList.innerHTML = '';
  if (!playlists.length) {
    addToPlaylistList.innerHTML = `<p style="color:var(--text-soft);font-size:.85rem;padding:.5rem">No tienes playlists.</p>`;
  } else {
    playlists.forEach(pl => {
      const imgs = pl.tracks.slice(0,4).map(t => typeof t === 'object' ? t.cover : null).filter(Boolean);
      const div  = document.createElement('div');
      div.className = 'add-pl-item';
      div.innerHTML = `
        ${_buildAddPlCover(imgs)}
        <div class="add-pl-info"><div class="add-pl-name">${pl.name}</div><div class="add-pl-count">${pl.tracks.length} canciones</div></div>`;
      div.addEventListener('click', () => { addTrackToPlaylist(pl.id, item); addToPlaylistModal.classList.remove('open'); });
      addToPlaylistList.appendChild(div);
    });
  }
  addToPlaylistModal.classList.add('open');
}
function _buildAddPlCover(imgs) {
  if (!imgs.length) return `<div class="add-pl-cover single"><div class="add-pl-cover-empty"><svg viewBox="0 0 24 24" width="16" height="16" style="opacity:.3"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/></svg></div></div>`;
  if (imgs.length === 1) return `<div class="add-pl-cover single"><img src="${imgs[0]}" alt=""></div>`;
  return `<div class="add-pl-cover">${imgs.slice(0,4).map(s => `<img src="${s}" alt="">`).join('')}</div>`;
}
addToPlaylistClose?.addEventListener('click', () => addToPlaylistModal.classList.remove('open'));
addToPlaylistModal?.addEventListener('click', e => { if (e.target === addToPlaylistModal) addToPlaylistModal.classList.remove('open'); });
addNewPlaylistBtn?.addEventListener('click', () => { addToPlaylistModal.classList.remove('open'); playlistNameInput.value = ''; createPlaylistModal.classList.add('open'); setTimeout(() => playlistNameInput.focus(), 100); });

/* ══════════════════════════════════════════════════
   17. LOCAL MUSIC (device files)
══════════════════════════════════════════════════ */
function renderLocalPage() {
  const page = $('pageLocal'); if (!page) return;
  const list = page.querySelector('.local-track-list'); if (!list) return;
  list.innerHTML = '';
  if (!localTracks.length) {
    list.innerHTML = `<div class="local-empty"><svg viewBox="0 0 24 24" width="40" height="40" style="opacity:.3;margin:0 auto 1rem;display:block"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg><p>No hay música local añadida.</p><p style="font-size:.8rem;color:var(--text-soft)">Toca el botón + para añadir archivos de tu dispositivo.</p></div>`;
    return;
  }
  localTracks.forEach((item, i) => {
    const row = _buildLibraryRow(item, i+1, () => loadTrack(item, false, localTracks), item);
    list.appendChild(row);
  });
}

function addLocalFiles(files) {
  let added = 0;
  Array.from(files).forEach(file => {
    if (!file.type.startsWith('audio/')) return;
    const url  = URL.createObjectURL(file);
    const name = file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');
    const parts = name.split(' - ');
    const title  = parts[1]?.trim() || name;
    const artist = parts[0]?.trim() || 'Artista desconocido';
    const track  = {
      type:     'music',
      source:   'local',
      title,
      artist,
      cover:    getPlaceholderCover('Música'),
      file:     url,
      stream:   url,
      category: 'Música local',
      duration: '',
      _localFileName: file.name,
    };
    if (localTracks.some(t => t._localFileName === file.name)) return; // duplicate
    localTracks.push(track);
    added++;
  });
  if (added > 0) {
    saveLocalTracks();
    showToast(`${added} canción${added > 1 ? 'es' : ''} añadida${added > 1 ? 's' : ''}`, 'success');
    renderLocalPage();
  } else {
    showToast('No se añadieron canciones (formato no soportado o duplicadas)');
  }
}

/* ══════════════════════════════════════════════════
   18. IMPORT PLAYLIST (Exportify CSV)
   19. MEDIA SESSION
══════════════════════════════════════════════════ */
function setupMediaSession(item) {
  if (!('mediaSession' in navigator)) return;
  const cover   = item.cover || getPlaceholderCover(item.category);
  const imgType = cover.startsWith('data:') ? 'image/svg+xml' : 'image/jpeg';
  navigator.mediaSession.metadata = new MediaMetadata({
    title:  item.title,
    artist: item.artist,
    album:  item.category || 'Droply',
    artwork: [96,128,192,256,384,512].map(s => ({ src: cover, sizes: `${s}x${s}`, type: imgType }))
  });
  navigator.mediaSession.setActionHandler('play',          () => { audioEl.play().then(() => { isPlaying = true; updatePlayIcons(true); }).catch(() => {}); });
  navigator.mediaSession.setActionHandler('pause',         () => { audioEl.pause(); isPlaying = false; updatePlayIcons(false); });
  navigator.mediaSession.setActionHandler('previoustrack', () => playPrev());
  navigator.mediaSession.setActionHandler('nexttrack',     () => playNext());
  try { navigator.mediaSession.setActionHandler('seekbackward', null); navigator.mediaSession.setActionHandler('seekforward', null); } catch (_) {}
  try { navigator.mediaSession.setActionHandler('seekto', ({ seekTime }) => { const d = audioEl.duration; if (d && isFinite(d)) audioEl.currentTime = Math.max(0, Math.min(d, seekTime)); }); } catch (_) {}
  _updateMediaSessionPosition();
}

function _updateMediaSessionPosition() {
  if (!('mediaSession' in navigator)) return;
  try {
    const dur = audioEl.duration, cur = audioEl.currentTime;
    if (!dur || !isFinite(dur) || dur <= 0) return;
    navigator.mediaSession.setPositionState({ duration: dur, playbackRate: audioEl.playbackRate || 1, position: Math.max(0, Math.min(cur, dur - 0.01)) });
  } catch (_) {}
}

/* ══════════════════════════════════════════════════
   20. KEYBOARD
══════════════════════════════════════════════════ */
document.addEventListener('keydown', e => {
  if (document.activeElement.tagName === 'INPUT') return;
  if (e.key === ' ')          { e.preventDefault(); togglePlay(); }
  if (e.key === 'Escape')     { nowPlayingSheet.classList.remove('open'); closeContextMenu(); closeQueuePanel(); }
  if (e.key === 'ArrowRight') playNext();
  if (e.key === 'ArrowLeft')  playPrev();
});
window.addEventListener('scroll', () => {
  $('topbar')?.classList.toggle('scrolled', window.scrollY > 20);
}, { passive: true });

/* ══════════════════════════════════════════════════
   21. INIT
══════════════════════════════════════════════════ */
(function init() {
  buildGenreGrid();
  renderQueueList();
  renderHomeScreen();
  initChangelog();
  updateBottomNavSlider();

  audioEl?.addEventListener('timeupdate', () => {
    const fill = $('hccProgressFill');
    if (!fill || !audioEl.duration || !isPlaying) return;
    fill.style.width = ((audioEl.currentTime / audioEl.duration) * 100) + '%';
  }, { passive: true });
})();