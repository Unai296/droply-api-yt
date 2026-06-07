/* ═══════════════════════════════════════════════════════════
   DROPLY — api/stream.js  (Vercel Serverless)
   Extrae URL de audio directo de YouTube
   Estrategia: yt-dlp-exec (incluye binario) con fallback ytdl-core
   GET /api/stream?id=<videoId>
   Retorna: { url, title, duration }
═══════════════════════════════════════════════════════════ */

const _cache   = new Map();
const CACHE_TTL = 4 * 60 * 1000; // 4 min

function getCached(id) {
  const e = _cache.get(id);
  if (!e) return null;
  if (Date.now() - e.ts > CACHE_TTL) { _cache.delete(id); return null; }
  return e;
}

/* ── Intento 1: yt-dlp-exec ──────────────────────────── */
async function tryYtDlpExec(videoId) {
  const ytDlp = require('yt-dlp-exec');
  const result = await ytDlp(`https://www.youtube.com/watch?v=${videoId}`, {
    noPlaylist:   true,
    format:       'bestaudio[ext=m4a]/bestaudio[acodec!=none]/bestaudio/best[acodec!=none]',
    getUrl:       true,
    noWarnings:   true,
    quiet:        true,
  });
  // yt-dlp-exec returns stdout as string when using get-url
  const url = (typeof result === 'string' ? result : String(result)).trim().split('\n')[0];
  if (!url || !url.startsWith('http')) throw new Error('No URL from yt-dlp-exec');
  return { url, title: '', duration: '' };
}

/* ── Intento 2: ytdl-core ────────────────────────────── */
async function tryYtdlCore(videoId) {
  const ytdl = require('ytdl-core');
  const info  = await ytdl.getInfo(`https://www.youtube.com/watch?v=${videoId}`);
  const title = info.videoDetails.title || '';
  const dur   = info.videoDetails.lengthSeconds || 0;
  const fmt   = ytdl.chooseFormat(info.formats, {
    quality:  'highestaudio',
    filter:   'audioonly',
  });
  if (!fmt?.url) throw new Error('No audio format from ytdl-core');
  const m = Math.floor(dur / 60), s = dur % 60;
  return {
    url:      fmt.url,
    title,
    duration: dur ? `${m}:${String(s).padStart(2,'0')}` : '',
  };
}

/* ── Handler ─────────────────────────────────────────── */
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const { id } = req.query;
  if (!id || !/^[a-zA-Z0-9_-]{11}$/.test(id)) {
    res.status(400).json({ error: 'Invalid video ID' });
    return;
  }

  const cached = getCached(id);
  if (cached) {
    res.setHeader('Cache-Control', 'public, max-age=180');
    return res.json({ ...cached, cached: true });
  }

  let result;
  let lastErr;

  // Intento 1: yt-dlp-exec
  try {
    result = await tryYtDlpExec(id);
  } catch (e) {
    lastErr = e;
    console.warn('[stream] yt-dlp-exec failed:', e.message);
  }

  // Intento 2: ytdl-core
  if (!result) {
    try {
      result = await tryYtdlCore(id);
    } catch (e) {
      lastErr = e;
      console.warn('[stream] ytdl-core failed:', e.message);
    }
  }

  if (!result) {
    return res.status(500).json({
      error:  'Could not extract audio stream',
      detail: lastErr?.message || 'All methods failed',
    });
  }

  _cache.set(id, { ...result, ts: Date.now() });
  res.setHeader('Cache-Control', 'public, max-age=180');
  res.json(result);
};
