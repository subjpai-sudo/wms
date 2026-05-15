// api/search-image.js — proxies SerpAPI Google Images search (fixes browser CORS)
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { q, key } = req.query;
  if (!q || !key) return res.status(400).json({ error: 'Missing q or key' });

  try {
    const url = 'https://serpapi.com/search.json?engine=google_images&q='
      + encodeURIComponent(q)
      + '&num=5&safe=active&api_key=' + key;

    const r = await fetch(url);
    if (!r.ok) {
      const text = await r.text();
      return res.status(502).json({ error: 'SerpAPI error ' + r.status, detail: text.slice(0, 200) });
    }
    const data = await r.json();
    // Return just the image URLs to keep response small
    const images = (data.images_results || [])
      .slice(0, 5)
      .map(img => ({ url: img.original, w: img.original_width, h: img.original_height, thumb: img.thumbnail }))
      .filter(img => img.url);

    return res.status(200).json({ images });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
