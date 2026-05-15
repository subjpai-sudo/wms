// api/send-login.js
// Vercel serverless function — sends SMS login link via Twilio
// Deploy: push to your Vercel-connected GitHub repo
// Env vars to set in Vercel dashboard:
//   TWILIO_ACCOUNT_SID
//   TWILIO_AUTH_TOKEN
//   TWILIO_FROM_NUMBER   (your Twilio phone number, e.g. +12345678901)
//   APP_URL              (your Vercel app URL, e.g. https://wms-xxx.vercel.app)

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({error: 'Method not allowed'});

  const { to, userId, userName, token } = req.body || {};

  if (!to || !userId || !token) {
    return res.status(400).json({error: 'Missing required fields: to, userId, token'});
  }

  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken  = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_FROM_NUMBER;
  const appUrl     = (process.env.APP_URL || '').replace(/\/$/, '');

  if (!accountSid || !authToken || !fromNumber) {
    return res.status(500).json({error: 'Twilio env vars not configured'});
  }

  const loginUrl = `${appUrl}?token=${token}&uid=${userId}`;
  const message  = `StockFlow WMS\nHi ${userName}! Tap to log in:\n${loginUrl}\n\nThis link expires in 24 hours. Do not share it.`;

  try {
    const basicAuth = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
    const twilioRes = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${basicAuth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          From: fromNumber,
          To:   to,
          Body: message,
        }).toString(),
      }
    );

    const data = await twilioRes.json();

    if (!twilioRes.ok || data.error_code) {
      console.error('Twilio error:', data);
      return res.status(502).json({
        error: data.message || 'Twilio SMS failed',
        code: data.error_code,
      });
    }

    return res.status(200).json({success: true, sid: data.sid});

  } catch (err) {
    console.error('Send SMS error:', err);
    return res.status(500).json({error: err.message});
  }
}
