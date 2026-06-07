/* ═══════════════════════════════════════════════════════════
   DROPLY — api/stream.js  (Vercel Serverless)
   Extrae URL de audio directo de YouTube via yt-dlp
   GET /api/stream?id=<videoId>
   Retorna: { url: "<audio_stream_url>", title, duration }
═══════════════════════════════════════════════════════════ */

const { execFile } = require('child_process');
const path          = require('path');
const os            = require('os');

// Ruta al binario yt-dlp en Vercel (se sube como archivo binario en /api/bin/)
// o se instala en runtime si se usa el exec approach
const YT_DLP_PATH = process.env.YT_DLP_PATH || path.join(__dirname, 'bin', 'yt-dlp');

// Cache simple en memoria (dura lo que dure la instancia serverless, ~5 min)
const _cache = new Map();
const CACHE_TTL = 4 * 60 * 1000; // 4 min (las URLs de YT duran ~6h pero serverless reinicia)

function getCached(id) {
  const entry = _cache.get(id);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL) { _cache.delete(id); return null; }
  return entry;
}

function runYtDlp(videoId) {
  return new Promise((resolve, reject) => {
    const url  = `https://www.youtube.com/watch?v=${videoId}`;
    const args = [
      '--no-playlist',
      '--format', 'bestaudio[ext=m4a]/bestaudio/best',
      '--get-url',
      '--get-title',
      '--get-duration',
      '--no-warnings',
      '--quiet',
      url,
    ];

    execFile(YT_DLP_PATH, args, { timeout: 20000 }, (err, stdout, stderr) => {
      if (err) { reject(new Error(stderr || err.message)); return; }
      const lines = stdout.trim().split('\n');
      // yt-dlp --get-url --get-title --get-duration outputs: title, duration, url
      // order depends on yt-dlp version; URL is the one starting with https
      const streamUrl = lines.find(l => l.startsWith('http'));
      const title     = lines.find(l => !l.startsWith('http') && !/^\d+:\d+/.test(l)) || '';
      const duration  = lines.find(l => /^\d+:\d+/.test(l)) || '';
      if (!streamUrl) { reject(new Error('No stream URL found')); return; }
      resolve({ url: streamUrl, title, duration });
    });
  });
}

module.exports = async (req, res) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.status(200).end();
    return;
  }

  const { id } = req.query;
  if (!id || !/^[a-zA-Z0-9_-]{11}$/.test(id)) {
    res.status(400).json({ error: 'Invalid video ID' });
    return;
  }

  // Check cache
  const cached = getCached(id);
  if (cached) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'public, max-age=180');
    res.json({ url: cached.url, title: cached.title, duration: cached.duration, cached: true });
    return;
  }

  try {
    const result = await runYtDlp(id);
    _cache.set(id, { ...result, ts: Date.now() });
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'public, max-age=180');
    res.json(result);
  } catch (err) {
    console.error('[stream] yt-dlp error:', err.message);
    res.status(500).json({ error: 'Could not extract audio stream', detail: err.message });
  }
};
