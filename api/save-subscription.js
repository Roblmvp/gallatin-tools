// api/save-subscription.js
// Saves a user's push subscription to Supabase when they enable notifications

const SB_URL = 'https://jbkgwtohwsbaorhvuuqb.supabase.co';
const SB_KEY = process.env.SUPABASE_SERVICE_KEY;

const H = {
  'Content-Type': 'application/json',
  'apikey': SB_KEY,
  'Authorization': `Bearer ${SB_KEY}`,
  'Prefer': 'resolution=merge-duplicates',
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { subscription, userId, userName } = req.body;

  if (req.method === 'POST') {
    // Save subscription
    const r = await fetch(`${SB_URL}/rest/v1/push_subscriptions`, {
      method: 'POST',
      headers: H,
      body: JSON.stringify({
        endpoint: subscription.endpoint,
        subscription: subscription,
        user_id: userId,
        user_name: userName,
        created_at: new Date().toISOString(),
      }),
    });
    if (r.ok || r.status === 409) {
      return res.status(200).json({ success: true });
    }
    return res.status(500).json({ error: 'Failed to save subscription' });
  }

  if (req.method === 'DELETE') {
    // Remove subscription (user turned off notifications)
    await fetch(`${SB_URL}/rest/v1/push_subscriptions?endpoint=eq.${encodeURIComponent(subscription.endpoint)}`, {
      method: 'DELETE', headers: H
    });
    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
