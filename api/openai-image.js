// api/openai-image.js — CityStar Warehouse
// Finds a product image via Google CSE or OpenAI, downloads it server-side,
// returns base64 data URL directly — zero CORS issues in browser.

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const { productName } = req.body || {};
  if (!productName) return res.status(400).json({ error: 'Missing productName' });

  const openaiKey = process.env.OPENAI_API_KEY;
  const googleKey = process.env.GOOGLE_CSE_KEY;
  const googleCx  = process.env.GOOGLE_CSE_CX;

  // Download any image URL and return as base64 data URL
  async function urlToBase64(imageUrl) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 8000);
    try {
      const r = await fetch(imageUrl, {
        signal: controller.signal,
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; CityStar/1.0)' }
      });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const ct = (r.headers.get('content-type') || 'image/jpeg').split(';')[0].trim();
      if (!ct.startsWith('image/')) throw new Error('Not an image');
      const buf = await r.arrayBuffer();
      const b64 = Buffer.from(buf).toString('base64');
      return `data:${ct};base64,${b64}`;
    } finally {
      clearTimeout(id);
    }
  }

  // Strategy 1: Google Custom Search Images (100 free/day, most accurate)
  if (googleKey && googleCx) {
    try {
      const q = encodeURIComponent(productName + ' product food package');
      const url = `https://www.googleapis.com/customsearch/v1?key=${googleKey}&cx=${googleCx}&q=${q}&searchType=image&num=8&safe=active`;
      const r = await fetch(url);
      if (r.ok) {
        const data = await r.json();
        for (const item of (data.items || [])) {
          if (!item.link) continue;
          try {
            const dataUrl = await urlToBase64(item.link);
            return res.status(200).json({ dataUrl, source: 'google', title: item.title });
          } catch(e) { continue; }
        }
      }
    } catch(e) {}
  }

  // Strategy 2: OpenAI GPT-4o-mini to find a real image URL, then download it
  if (openaiKey) {
    try {
      const r = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${openaiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          max_tokens: 200,
          messages: [
            { role: 'system', content: 'Return ONLY a direct public image URL (ending .jpg/.png/.webp) for the product. No text, no markdown, just the URL.' },
            { role: 'user', content: `Direct image URL for this Myanmar food product: "${productName}"` }
          ]
        }),
      });
      if (r.ok) {
        const data = await r.json();
        const text = (data.choices?.[0]?.message?.content || '').trim();
        const m = text.match(/https?:\/\/[^\s<>"]+\.(?:jpg|jpeg|png|webp)/i);
        if (m) {
          try {
            const dataUrl = await urlToBase64(m[0]);
            return res.status(200).json({ dataUrl, source: 'openai', title: productName });
          } catch(e) {}
        }
      }
    } catch(e) {}
  }

  // Strategy 3: DALL-E 3 — generate image, returns base64 directly (no download needed)
  if (openaiKey) {
    try {
      const r = await fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${openaiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'dall-e-3',
          prompt: `Product photo of "${productName}". Myanmar canned/packaged food. White background, clear label, square crop, photorealistic.`,
          n: 1, size: '1024x1024', quality: 'standard', response_format: 'b64_json'
        }),
      });
      if (r.ok) {
        const data = await r.json();
        const b64 = data.data?.[0]?.b64_json;
        if (b64) return res.status(200).json({ dataUrl: `data:image/png;base64,${b64}`, source: 'dalle3', generated: true });
      }
    } catch(e) {}
  }

  return res.status(503).json({
    error: 'No image found. Add OPENAI_API_KEY (and optionally GOOGLE_CSE_KEY + GOOGLE_CSE_CX) to Vercel env vars.'
  });
}
