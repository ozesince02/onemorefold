// send-reminders (D-028): Supabase Cron calls this every 30 minutes. It finds the habits due in
// each person's next half hour (in their own time zone), sends one encrypted Web Push to each of
// their devices, and remembers what it sent so nothing goes out twice. Each reminder carries a
// one-time token for its Done and Later buttons (D-039, act-reminder), and reminders someone put
// off with Later are sent once more if they're still due.
//
// Secrets (Supabase → Edge Functions → Secrets, never in git):
//   CRON_SECRET         the cron job sends it as "Authorization: Bearer ..."; anything else is refused
//   VAPID_PUBLIC_KEY    the same public key the site has in .env (VITE_VAPID_PUBLIC_KEY)
//   VAPID_PRIVATE_KEY   its private half
//   VAPID_SUBJECT       mailto: address the push services can reach us at
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase. If the project's legacy API
// keys are switched off, make a secret key (sb_secret_...) and set it as SENDER_SECRET_KEY instead.
//
// Deployed with --no-verify-jwt, because the caller is the cron job, not a signed-in person; the
// CRON_SECRET check below takes the place of that. It never logs habit names or addresses.
import { createClient } from 'npm:@supabase/supabase-js@2.117.3';
import { sendPush } from '../_shared/webpush.js';
import { clocks, planReminders, logCutoff } from '../_shared/plan.js';
import { makeToken, hashToken, TOKEN_HOURS } from '../_shared/tokens.js';

const PAGE = 1000;  // the API's most rows per request
const BATCH = 100;  // people per round

const env = (name: string) => {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`missing secret ${name}`);
  return value;
};

// Compares hashes, so the time it takes says nothing about how much of the secret matched.
async function sameSecret(given: string, expected: string) {
  const hash = async (s: string) => new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
  const [a, b] = await Promise.all([hash(given), hash(expected)]);
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

async function run(now: Date) {
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || env('SENDER_SECRET_KEY');
  const db = createClient(env('SUPABASE_URL'), key, { auth: { persistSession: false } });
  const vapid = { publicKey: env('VAPID_PUBLIC_KEY'), privateKey: env('VAPID_PRIVATE_KEY'), subject: env('VAPID_SUBJECT') };
  const check = <T>({ data, error }: { data: T | null; error: unknown }) => { if (error) throw error; return data as T; };

  // The API returns at most PAGE rows per request, even to the service role, and drops the rest
  // without saying so. Every list is read page by page, in a fixed order so pages don't overlap.
  const all = async (page: (from: number, to: number) => PromiseLike<{ data: any; error: unknown }>) => {
    const rows: any[] = [];
    for (let from = 0; ; from += PAGE) {
      const got = check(await page(from, from + PAGE - 1)) as any[];
      rows.push(...got);
      if (got.length < PAGE) return rows;
    }
  };

  // Where the notification's Done and Later buttons send their token (D-039).
  const actUrl = `${env('SUPABASE_URL')}/functions/v1/act-reminder`;

  const settings = await all((a, b) => db.from('push_settings').select('user_id, off, time_zone')
    .eq('reminders', true).order('user_id').range(a, b));
  const total = { people: 0, reminders: 0, delivered: 0, gone: 0, failed: 0 };

  // A hundred people at a time keeps every request (and its list of ids) small.
  for (let at = 0; at < settings.length; at += BATCH) {
    const batch = settings.slice(at, at + BATCH);
    const subs = await all((a, b) => db.from('push_subscriptions').select('id, user_id, endpoint, p256dh, auth')
      .in('user_id', batch.map((s) => s.user_id)).order('id').range(a, b));
    const people = clocks(batch.filter((s) => subs.some((d) => d.user_id === s.user_id)), now);
    if (!people.length) continue;

    const ids = people.map((p) => p.user_id);
    const months = [...new Set(people.map((p) => p.month))];
    const days = [...new Set(people.map((p) => p.day))];
    const [habitMonths, ticks, sent] = await Promise.all([
      all((a, b) => db.from('habit_months').select('user_id, slug, month, name, goal, time, start_day, cadence, weekdays, times_per_week, position')
        .in('user_id', ids).in('month', months).not('time', 'is', null).order('user_id').order('month').order('slug').range(a, b)),
      all((a, b) => db.from('ticks').select('user_id, slug, day')
        .in('user_id', ids).in('month', months).order('user_id').order('slug').order('day').range(a, b)),
      all((a, b) => db.from('push_log').select('user_id, slug, day, remind_again_at, sends')
        .in('user_id', ids).in('day', days).eq('kind', 'remind').order('user_id').order('day').order('slug').range(a, b)),
    ]);

    const plan = planReminders({ people, habitMonths, ticks, sent });
    total.people += people.length;
    total.reminders += plan.length;
    for (const item of plan) {
      // Claim it first: if another run got there, nothing is returned. A new reminder claims a new
      // log row; one put off with Later claims its "remind again" mark.
      const claimed = item.again
        ? check(await db.from('push_log').update({ remind_again_at: null, sends: (sent.find((r) => r.user_id === item.user_id && r.slug === item.slug && r.day === item.day)?.sends || 1) + 1 })
          .match({ user_id: item.user_id, kind: 'remind', slug: item.slug, day: item.day }).not('remind_again_at', 'is', null).lt('sends', 3).select('slug')) as any[]
        : check(await db.from('push_log')
          .upsert({ user_id: item.user_id, kind: 'remind', slug: item.slug, day: item.day }, { onConflict: 'user_id,kind,slug,day', ignoreDuplicates: true })
          .select('slug')) as any[];
      if (!claimed.length) continue;
      // The buttons' one-time token: only its hash is kept; the token travels encrypted. If it can't
      // be saved, this reminder goes out without buttons rather than not at all, and the run goes on.
      try {
        const token = makeToken();
        check(await db.from('push_actions').insert({
          token_hash: await hashToken(token), user_id: item.user_id, slug: item.slug, day: item.day,
          expires_at: new Date(now.getTime() + TOKEN_HOURS * 3600000).toISOString(),
        }));
        item.payload = { ...item.payload, token, act: actUrl };
      } catch {
        total.failed++;
      }
      await Promise.all(subs.filter((d) => d.user_id === item.user_id).map(async (device) => {
        try {
          const status = await sendPush(device, item.payload, vapid);
          if (status === 404 || status === 410) {
            total.gone++;
            await db.from('push_subscriptions').delete().eq('id', device.id);
          } else if (status >= 200 && status < 300) {
            total.delivered++;
            await db.from('push_subscriptions').update({ last_ok_at: now.toISOString() }).eq('id', device.id);
          } else {
            total.failed++;
          }
        } catch {
          total.failed++; // includes a push service that didn't answer within sendPush's timeout
        }
      }));
    }
  }
  await db.from('push_log').delete().lt('day', logCutoff(now));
  await db.from('push_actions').delete().lt('expires_at', now.toISOString());
  return total;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  if (!(await sameSecret(req.headers.get('authorization') || '', `Bearer ${env('CRON_SECRET')}`))) {
    return new Response('Unauthorized', { status: 401 });
  }
  try {
    const result = await run(new Date());
    console.log(JSON.stringify(result));
    return Response.json(result);
  } catch (err) {
    console.error('send-reminders failed:', err instanceof Error ? err.message : 'unknown error');
    return new Response('Failed', { status: 500 });
  }
});
