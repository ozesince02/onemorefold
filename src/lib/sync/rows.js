// The local state as database rows, and back (D-020). Pure functions, so Node tests can check them
// against the real schema (scripts/check-sync.mjs). Row shapes match the tables in
// supabase/migrations/20261024120000_accounts.sql; user_id is added when rows are sent.
import { parseKey } from '../dates.js';

// Primary key columns per table, in the order the engine upserts parents before children.
export const TABLES = {
  habits: ['slug'],
  months: ['month'],
  habit_months: ['slug', 'month'],
  ticks: ['slug', 'day'],
  years: ['year'],
  profiles: [],
};
export const UPSERT_ORDER = ['profiles', 'habits', 'months', 'habit_months', 'ticks', 'years'];
export const DELETE_ORDER = ['ticks', 'habit_months', 'months', 'habits', 'years'];

const DEFAULT_COLOR = '#C9A57A';
const pad = (n) => String(n).padStart(2, '0');
const monthDate = (key) => `${key}-01`;
const keyOf = (table, row) => `${table}|${TABLES[table].map((c) => row[c]).join('|')}`;

// { 'ticks|german|2026-10-02': { table, row }, ... }: every row the state implies.
export function stateToRows(state) {
  const rows = {};
  const put = (table, row) => { rows[keyOf(table, row)] = { table, row }; };
  const ids = new Set(Object.keys(state.colors || {}));
  for (const month of Object.values(state.months)) month.habits.forEach((h) => ids.add(h.id));
  for (const id of [...ids].sort()) put('habits', { slug: id, color: state.colors?.[id] || DEFAULT_COLOR, private: state.private?.[id] === true, challenge_id: state.links?.[id] || null });

  for (const [key, month] of Object.entries(state.months)) {
    const { y, m } = parseKey(key);
    put('months', { month: monthDate(key) });
    month.habits.forEach((h, position) => {
      put('habit_months', {
        slug: h.id,
        month: monthDate(key),
        name: h.name,
        goal: h.goal,
        time: h.time ? `${h.time}:00` : null,
        start_day: h.start || 1,
        cadence: h.cadence || 'daily',
        weekdays: h.cadence === 'weekdays' ? h.weekdays : null,
        times_per_week: h.cadence === 'times_per_week' ? h.timesPerWeek : null,
        position,
      });
      for (const d of month.checks[h.id] || []) put('ticks', { slug: h.id, day: `${y}-${pad(m)}-${pad(d)}` });
    });
  }

  for (const [year, rec] of Object.entries(state.years || {})) {
    put('years', { year: Number(year), wish: rec.wish || '', folded_at: rec.foldedAt ? new Date(rec.foldedAt).toISOString() : null });
  }
  put('profiles', { prefs: { percentView: state.prefs?.percentView || 'days' } });
  return rows;
}

// Rows fetched from the database (one array per table) back into a state object. Local-only parts
// (reminders, meta) are taken from `local`. The result still goes through cleanState().
export function rowsToState(tables, local = {}) {
  const colors = {};
  const priv = {};
  const links = {};
  for (const h of tables.habits || []) {
    colors[h.slug] = h.color;
    if (h.private === true) priv[h.slug] = true;
    if (h.challenge_id) links[h.slug] = h.challenge_id;
  }
  const months = {};
  for (const r of tables.months || []) months[r.month.slice(0, 7)] = { habits: [], checks: {} };
  const byMonth = [...(tables.habit_months || [])].sort((a, b) => a.position - b.position || a.slug.localeCompare(b.slug));
  for (const r of byMonth) {
    const key = r.month.slice(0, 7);
    const month = months[key] || (months[key] = { habits: [], checks: {} });
    const habit = { id: r.slug, name: r.name, goal: r.goal, time: r.time ? r.time.slice(0, 5) : '', start: r.start_day };
    if (r.cadence && r.cadence !== 'daily') habit.cadence = r.cadence;
    if (r.cadence === 'weekdays') habit.weekdays = r.weekdays || [];
    if (r.cadence === 'times_per_week') habit.timesPerWeek = r.times_per_week;
    month.habits.push(habit);
    month.checks[r.slug] = [];
  }
  for (const t of tables.ticks || []) {
    const key = t.day.slice(0, 7);
    months[key]?.checks[t.slug]?.push(Number(t.day.slice(8, 10)));
  }
  for (const month of Object.values(months)) for (const list of Object.values(month.checks)) list.sort((a, b) => a - b);
  const years = {};
  for (const r of tables.years || []) {
    years[r.year] = { wish: r.wish || '', foldedAt: r.folded_at ? Date.parse(r.folded_at) : undefined };
  }
  const prefs = tables.profiles?.[0]?.prefs;
  return {
    version: 1,
    colors,
    ...(Object.keys(priv).length ? { private: priv } : {}),
    ...(Object.keys(links).length ? { links } : {}),
    months,
    years,
    prefs: { percentView: prefs?.percentView || 'days' },
    ...(local.reminders ? { reminders: local.reminders } : {}),
    ...(local.meta ? { meta: local.meta } : {}),
  };
}

// What to send to turn `before` into `after`: { key: { op: 'upsert' | 'delete', table, row } }.
export function diffRows(before, after) {
  const ops = {};
  for (const [key, { table, row }] of Object.entries(after)) {
    if (!before[key] || JSON.stringify(before[key].row) !== JSON.stringify(row)) ops[key] = { op: 'upsert', table, row };
  }
  for (const [key, { table, row }] of Object.entries(before)) {
    if (!after[key] && table !== 'profiles') ops[key] = { op: 'delete', table, row };
  }
  return ops;
}

// Something worth keeping: a habit, a tick or a wish. An empty tracker isn't.
export function hasData(state) {
  return Object.values(state.months).some((m) => m.habits.length) || Object.values(state.years || {}).some((y) => y.wish);
}

// Both sides kept (D-020): the account's version of anything that exists in both, plus everything
// only this browser has. Ticks are a union, so no fold is ever lost.
export function mergeStates(account, local) {
  const out = structuredClone(account);
  for (const [key, lm] of Object.entries(local.months)) {
    const am = out.months[key];
    if (!am) { out.months[key] = structuredClone(lm); continue; }
    for (const h of lm.habits) {
      if (!am.habits.some((x) => x.id === h.id)) { am.habits.push({ ...h }); am.checks[h.id] = []; }
      const days = new Set([...(am.checks[h.id] || []), ...(lm.checks[h.id] || [])]);
      am.checks[h.id] = [...days].sort((a, b) => a - b);
    }
  }
  for (const [id, c] of Object.entries(local.colors || {})) if (!out.colors[id]) out.colors[id] = c;
  // Private on either side stays private: the safer way to combine them.
  for (const id of Object.keys(local.private || {})) (out.private ||= {})[id] = true;
  // Gang links: the account's, plus this browser's for gangs the account has no habit for.
  const taken = new Set(Object.values(out.links || {}));
  for (const [id, gang] of Object.entries(local.links || {})) {
    if (!out.links?.[id] && !taken.has(gang)) { (out.links ||= {})[id] = gang; taken.add(gang); }
  }
  for (const [y, rec] of Object.entries(local.years || {})) {
    const a = out.years[y] || {};
    out.years[y] = { wish: a.wish || rec.wish || '', foldedAt: a.foldedAt || rec.foldedAt };
  }
  return out;
}

