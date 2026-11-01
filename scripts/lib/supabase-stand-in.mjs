// Supabase as far as our database needs it, on real Postgres (PGlite, in memory): the anon and
// authenticated roles, auth.users and auth.uid(), Realtime's message table and topic(), and every
// migration in supabase/migrations. Used by check-schema.mjs and check-sync.mjs.
import { readFileSync, readdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

export async function supabaseStandIn() {
  const db = new PGlite();
  await db.exec(`
    create role anon nologin; create role authenticated nologin; create role service_role nologin;
    create schema auth;
    create table auth.users (id uuid primary key, email text);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth, public to anon, authenticated;
    grant execute on function auth.uid() to anon, authenticated;
    alter default privileges in schema public grant all on tables to anon, authenticated;
    alter default privileges in schema public grant all on functions to anon, authenticated;
    create schema realtime;
    create table realtime.messages (topic text not null, extension text not null, payload jsonb);
    alter table realtime.messages enable row level security;
    create function realtime.topic() returns text language sql stable as
      $$ select current_setting('realtime.topic', true) $$;
    grant usage on schema realtime to anon, authenticated;
    grant select, insert on realtime.messages to authenticated;
    grant execute on function realtime.topic() to anon, authenticated;
  `);
  for (const file of readdirSync('supabase/migrations').sort()) {
    await db.exec(readFileSync(`supabase/migrations/${file}`, 'utf8'));
  }

  // Run one statement as 'anon' or as a signed-in user id; always back to the owner afterwards.
  // One connection, so statements queue up: an overlapping call must never run as someone else.
  let queue = Promise.resolve();
  function as(who, sql, params = []) {
    const run = async () => {
      await db.exec('reset role');
      await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [who === 'anon' ? '' : who]);
      await db.exec(who === 'anon' ? 'set role anon' : 'set role authenticated');
      try { return await db.query(sql, params); } finally { await db.exec('reset role'); }
    };
    const result = queue.then(run, run);
    queue = result.catch(() => {});
    return result;
  }
  const addUser = (id, email = `${id.slice(-4)}@example.com`) => db.query('insert into auth.users (id, email) values ($1, $2)', [id, email]);
  return { db, as, addUser };
}
