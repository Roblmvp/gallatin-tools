// api/push-notify.js
// Vercel serverless function — sends web push notifications to all subscribers
// Called from service-to-sales-log.html on every S2S form submission

import webpush from 'web-push';

const VAPID_PUBLIC  = 'BFYqM0IN3sQtNJiq1iTFIh1Ex3LCEboUq7hB966WA5UT_Z5_q58_VPbuIUY__m36IyinsOTKlTHhg-PG5JN-JU4';
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY;
const VAPID_EMAIL   = 'mailto:rob.l@gallatincdjr.com';

webpush.setVapidDetails(VAPID_EMAIL, VAPID_PUBLIC, VAPID_PRIVATE);

// Supabase config — stores push subscriptions
const SB_URL = 'https://jbkgwtohwsbaorhvuuqb.supabase.co';
const SB_KEY = process.env.SUPABASE_SERVICE_KEY; // service role key (bypasses RLS)

const H = {
  'Content-Type': 'application/json',
  'apikey': SB_KEY,
  'Authorization': `Bearer ${SB_KEY}`,
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { entry } = req.body;
  if (!entry) return res.status(400).json({ error: 'No entry data' });

  // Build notification payload
  const customerName = `${entry.first_name || ''} ${entry.last_name || ''}`.trim() || 'Unknown';
  const vehicle = [entry.veh_year, entry.veh_make, entry.veh_model].filter(Boolean).join(' ') || 'Vehicle TBD';
  const score = entry.eng_score || '—';
  const rep = entry.submitter || 'Unknown';
  const outcome = entry.outcome || 'Logged';

  const scoreInt = parseInt(score);
  const tempLabel = scoreInt >= 8 ? '🔥 HOT' : scoreInt >= 5 ? '⚡ WARM' : '❄️ COOL';

  const payload = JSON.stringify({
    title: `New S2S Entry — ${tempLabel}`,
    body: `${customerName} · ${vehicle}\nRep: ${rep} · Score: ${score}/10 · ${outcome}`,
    icon: 'https://res.cloudinary.com/di5ujiwjp/image/upload/v1769868303/TAA062407W-GallatinLogos-Web-CDJR-2_yn1fwh.png',
    badge: 'https://res.cloudinary.com/di5ujiwjp/image/upload/v1769868303/TAA062407W-GallatinLogos-Web-CDJR-2_yn1fwh.png',
    url: 'https://servicebridge.vyaxis.com/manager-dashboard.html',
    tag: 's2s-entry',
    data: { entryId: entry.id, url: 'https://servicebridge.vyaxis.com/manager-dashboard.html' }
  });

  // Fetch all subscriptions from Supabase
  let subscriptions = [];
  try {
    const r = await fetch(`${SB_URL}/rest/v1/push_subscriptions?select=*`, { headers: H });
    subscriptions = await r.json();
    if (!Array.isArray(subscriptions)) subscriptions = [];
  } catch (err) {
    console.error('Failed to fetch subscriptions:', err);
    return res.status(500).json({ error: 'Failed to fetch subscriptions' });
  }

  if (subscriptions.length === 0) {
    return res.status(200).json({ success: true, sent: 0, message: 'No subscribers yet' });
  }

  // Send to all subscribers, remove expired ones
  const results = await Promise.allSettled(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(sub.subscription, payload);
        return { id: sub.id, ok: true };
      } catch (err) {
        if (err.statusCode === 410 || err.statusCode === 404) {
          // Subscription expired — remove from DB
          await fetch(`${SB_URL}/rest/v1/push_subscriptions?id=eq.${sub.id}`, {
            method: 'DELETE', headers: H
          });
        }
        return { id: sub.id, ok: false, error: err.message };
      }
    })
  );

  const sent = results.filter(r => r.value?.ok).length;
  return res.status(200).json({ success: true, sent, total: subscriptions.length });
}
