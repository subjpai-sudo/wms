// api/openai-image.js — CityStar Warehouse
// Uses OpenAI GPT-4o to find the best product image URL via web browsing / image generation
// Falls back to Google Custom Search if GOOGLE_CSE_KEY and GOOGLE_CSE_CX are set

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

  // ── Strategy 1: Google Custom Search Images (fast, accurate, free tier = 100/day) ──
  if (googleKey && googleCx) {
    try {
      const q = encodeURIComponent(productName + ' product food package');
      const url = `https://www.googleapis.com/customsearch/v1?key=${googleKey}&cx=${googleCx}&q=${q}&searchType=image&num=5&imgSize=medium&safe=active`;
      const r = await fetch(url);
      if (r.ok) {
        const data = await r.json();
        const items = data.items || [];
        // Pick highest resolution image
        const best = items
          .filter(i => i.link && i.image)
          .sort((a, b) => (b.image.width * b.image.height) - (a.image.width * a.image.height))[0];
        if (best) {
          return res.status(200).json({
            imageUrl: best.link,
            thumb: best.image.thumbnailLink,
            source: 'google',
            width: best.image.width,
            height: best.image.height,
            title: best.title,
          });
        }
      }
    } catch(e) { /* fall through */ }
  }

  // ── Strategy 2: OpenAI GPT-4o with web search tool to find image URL ──
  if (openaiKey) {
    try {
      const r = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openaiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4o',
          tools: [{ type: 'web_search_preview' }],
          input: `Find a clear, high-quality product photo URL for: "${productName}". 
This is a Myanmar grocery / food product. Search for the exact product name.
Reply with ONLY a JSON object like: {"imageUrl":"https://...","description":"brief description"}
The URL must be a direct image link (ending in .jpg, .png, .webp, or from a CDN).
Pick the clearest, most zoomed-in product shot — not lifestyle photos.`,
        }),
      });
      if (r.ok) {
        const data = await r.json();
        const text = (data.output || [])
          .filter(o => o.type === 'message')
          .flatMap(o => o.content)
          .filter(c => c.type === 'output_text')
          .map(c => c.text)
          .join('');
        // Parse JSON from response
        const match = text.match(/\{[^}]+\}/s);
        if (match) {
          try {
            const parsed = JSON.parse(match[0]);
            if (parsed.imageUrl) {
              return res.status(200).json({
                imageUrl: parsed.imageUrl,
                description: parsed.description,
                source: 'openai',
              });
            }
          } catch(e) { /* parse failed */ }
        }
        // Try to extract any URL from the text
        const urlMatch = text.match(/https?:\/\/[^\s"')]+\.(?:jpg|jpeg|png|webp|gif)[^\s"')']*/i);
        if (urlMatch) {
          return res.status(200).json({ imageUrl: urlMatch[0], source: 'openai-extract' });
        }
      }
    } catch(e) { /* fall through */ }
  }

  // ── Strategy 3: OpenAI DALL-E 3 — generate a product image ──
  if (openaiKey) {
    try {
      const r = await fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openaiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'dall-e-3',
          prompt: `Product photography of "${productName}" - Myanmar canned/packaged food product. Clean white background, professional product shot, showing the actual package/can/box clearly. Photorealistic, high detail, square crop.`,
          n: 1,
          size: '1024x1024',
          quality: 'standard',
          response_format: 'url',
        }),
      });
      if (r.ok) {
        const data = await r.json();
        const imgUrl = data.data?.[0]?.url;
        if (imgUrl) {
          return res.status(200).json({ imageUrl: imgUrl, source: 'dalle3', generated: true });
        }
      }
    } catch(e) { /* fall through */ }
  }

  return res.status(503).json({
    error: 'No image source available',
    hint: 'Set OPENAI_API_KEY or GOOGLE_CSE_KEY+GOOGLE_CSE_CX in Vercel environment variables',
  });
}
