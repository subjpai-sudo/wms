// api/send-login.js — CityStar Warehouse
// Vercel serverless — sends SMS via Twilio
// Supports: login links AND order alert messages

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({error: 'Method not allowed'});

  const body = req.body || {};

  // Ping request — confirm API is reachable
  if (body._ping) {
    return res.status(400).json({error: 'Missing required fields', hint: 'API is reachable'});
  }

  const { to, userId, userName, token, message } = body;
  if (!to) return res.status(400).json({error: 'Missing: to'});

  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken  = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_FROM_NUMBER;
  const appUrl     = (process.env.APP_URL || '').replace(/\/$/, '');

  if (!accountSid || !authToken || !fromNumber) {
    return res.status(500).json({
      error: 'Twilio env vars not configured',
      missing: [!accountSid&&'TWILIO_ACCOUNT_SID',!authToken&&'TWILIO_AUTH_TOKEN',!fromNumber&&'TWILIO_FROM_NUMBER'].filter(Boolean)
    });
  }

  // Build SMS — custom message OR login link
  let smsBody = message;
  if (!smsBody) {
    if (!token || !userId) return res.status(400).json({error: 'Missing token or userId'});
    const loginUrl = `${appUrl}?token=${token}&uid=${userId}`;
    smsBody = `CityStar Warehouse\nHi ${userName || 'there'}! Tap to log in:\n${loginUrl}\n\nLink expires in 24 hours. Do not share.`;
  }

  try {
    const auth = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
    const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
      method: 'POST',
      headers: {'Authorization': `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded'},
      body: new URLSearchParams({From: fromNumber, To: to, Body: smsBody}).toString(),
    });
    const data = await r.json();
    if (!r.ok || data.error_code) return res.status(502).json({error: data.message||'Twilio failed', code: data.error_code});
    return res.status(200).json({success: true, sid: data.sid});
  } catch(err) {
    return res.status(500).json({error: err.message});
  }
}
