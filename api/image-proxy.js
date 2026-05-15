// api/image-proxy.js — proxies external images to fix CORS for browser fetch
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'Missing url param' });

  try {
    const r = await fetch(decodeURIComponent(url), {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    if (!r.ok) return res.status(502).json({ error: 'Upstream ' + r.status });

    const ct = r.headers.get('content-type') || 'image/jpeg';
    const buf = await r.arrayBuffer();
    res.setHeader('Content-Type', ct);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.status(200).send(Buffer.from(buf));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
