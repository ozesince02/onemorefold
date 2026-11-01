// act-reminder (D-039): the Done and Later buttons on a reminder sent with the app closed. The
// service worker posts { token, act } here; the token came inside that one notification, encrypted
// for the person's device, and works once. Done ticks that habit for that day; Later puts the
// reminder back in the queue for the next send-reminders run.
//
// Deployed with --no-verify-jwt: the caller is a service worker with no session. The one-time
// token takes the place of signing in, and it can only ever do the one thing it was made for. The
// database function act_on_reminder() checks and uses it; nothing here is logged but the outcome.
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or SENDER_SECRET_KEY) are provided as for send-reminders.
import { createClient } from 'npm:@supabase/supabase-js@2.117.3';
import { TOKEN, hashToken } from '../_shared/tokens.js';

// Only our own pages' service workers call this: the live site, the preview site and the dev server.
const ORIGIN = /^(https:\/\/onemorefold\.com|https:\/\/preview-onemorefold\.[a-z0-9-]+\.workers\.dev|http:\/\/localhost:5173)$/;

const cors = (origin: string | null) => (origin && ORIGIN.test(origin)
  ? { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'content-type', 'Access-Control-Max-Age': '86400', Vary: 'Origin' }
  : { Vary: 'Origin' });

const reply = (status: number, result: string, origin: string | null) =>
  new Response(JSON.stringify({ result }), { status, headers: { 'Content-Type': 'application/json', ...cors(origin) } });

Deno.serve(async (req) => {
  const origin = req.headers.get('origin');
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origin) });
  if (req.method !== 'POST') return reply(405, 'method', origin);

  let body: { token?: unknown; act?: unknown };
  try {
    const text = await req.text();
    if (text.length > 512) return reply(400, 'bad', origin);
    body = JSON.parse(text);
  } catch {
    return reply(400, 'bad', origin);
  }
  const { token, act } = body || {};
  if (typeof token !== 'string' || !TOKEN.test(token) || (act !== 'done' && act !== 'later')) return reply(400, 'bad', origin);

  try {
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SENDER_SECRET_KEY');
    const url = Deno.env.get('SUPABASE_URL');
    if (!key || !url) throw new Error('missing settings');
    const db = createClient(url, key, { auth: { persistSession: false } });
    const { data, error } = await db.rpc('act_on_reminder', { p_hash: await hashToken(token), p_act: act });
    if (error) throw error;
    console.log(JSON.stringify({ act, result: data }));
    return reply(data === 'gone' ? 410 : 200, String(data), origin);
  } catch (err) {
    console.error('act-reminder failed:', err instanceof Error ? err.message : 'unknown error');
    return reply(500, 'failed', origin);
  }
});
