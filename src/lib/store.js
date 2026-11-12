// The whole tracker lives in one state object, kept by an adapter (localStorage today).
// No formulas: every number on screen is computed from `months[key].checks` by stats.js.
import { monthKey, parseKey, shiftMonth, daysIn } from './dates.js';
import { cleanState, parseBackup, isId, safeColor, safeTime, safeName, cleanSchedule, LIMITS } from './sanitize.js';
import { defaultGoal } from './schedule.js';
import { closingHabits } from './years.js';
import { localAdapter, STORE_KEY } from './adapters/local.js';

export { STORE_KEY };
const adapter = localAdapter;
import { BACKUP_EVERY_DAYS } from '../config.js';

export { BACKUP_EVERY_DAYS };
const DAY = 86400000;
const PALETTE = ['#C8302C', '#24496B', '#8EA46B', '#E9B33F', '#C9A57A', '#A9CBD6', '#E8C3BC', '#6E8C8A', '#B98A5E', '#D98E73'];

// A new visitor starts with an empty tracker (D-016): nobody else's habits.
const emptyState = () => ({ version: 1, colors: {}, months: {}, years: {} });

// Stored data is validated like an imported file: it may have been edited by hand or by
// another script on this origin. Data that can't be read is kept aside, never thrown away.
function read() {
  const raw = adapter.load();
  if (!raw) return emptyState();
  try {
    return cleanState(JSON.parse(raw));
  } catch {
    adapter.keepAside(raw);
    return emptyState();
  }
}

let state = read();
let synced = false; // set by the sync engine while this browser is in step with an account

function draftMonth(key) {
  const { y, m } = parseKey(key);
  let prev = null;
  for (let back = 1; back <= 12 && !prev; back++) {
    const p = shiftMonth(y, m, -back);
    prev = state.months[monthKey(p.y, p.m)];
  }
  const habits = prev ? prev.habits.map((h) => ({ ...h, start: 1 })) : [];
  return { habits, checks: Object.fromEntries(habits.map((h) => [h.id, []])) };
}
const listeners = new Set();
let saveFailed = false;

// A save the browser refused (storage full, blocked, private mode) is reported, not swallowed:
// listeners get { saveFailed: true } once, and again only after a save succeeds in between.
function save() {
  const ok = adapter.save(JSON.stringify(state));
  const firstFailure = !ok && !saveFailed;
  saveFailed = !ok;
  listeners.forEach((fn) => fn(state, { saveFailed: firstFailure }));
}

const clampInt = (v, min, max, fallback) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

export const DEFAULT_REMINDERS = { enabled: false, lead: 0, off: {}, log: {} };

export const store = {
  get: () => state,
  subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },

  mode: () => (synced ? 'synced' : adapter.mode),
  setSynced(on) { synced = Boolean(on); },
  protection: () => adapter.protection(),
  protect: () => adapter.protect(),

  // Backups matter only while the data lives on one device. meta.firstUsedAt starts the clock
  // for someone who has never saved a backup.
  meta() {
    state.meta = { ...state.meta };
    return state.meta;
  },
  startClock() {
    if (!this.meta().firstUsedAt) { state.meta.firstUsedAt = Date.now(); save(); }
  },
  markBackedUp() { Object.assign(this.meta(), { lastBackupAt: Date.now(), backupSnoozedUntil: undefined }); save(); },
  snoozeBackup(days = 1) { this.meta().backupSnoozedUntil = Date.now() + days * DAY; save(); },
  // Days since the last backup when one is due, otherwise 0. Never due once data is synced.
  backupDue(now = Date.now()) {
    if (adapter.mode !== 'local' || synced) return 0;
    const { lastBackupAt, firstUsedAt, backupSnoozedUntil } = this.meta();
    const since = lastBackupAt || firstUsedAt;
    if (!since || (backupSnoozedUntil && now < backupSnoozedUntil)) return 0;
    const days = Math.floor((now - since) / DAY);
    return days >= BACKUP_EVERY_DAYS ? days : 0;
  },

  // Another tab changed the data: take its copy instead of reloading the page.
  reloadFromStorage() {
    state = read();
    listeners.forEach((fn) => fn(state));
  },

  // Display preferences. percentView: 'days' | 'goal' | 'both', the view the tracker opens with.
  prefs() {
    state.prefs = { percentView: 'days', ...state.prefs };
    return state.prefs;
  },
  setPref(key, value) {
    if (key === 'percentView' && ['days', 'goal', 'both'].includes(value)) { this.prefs().percentView = value; save(); }
  },

  // Reminder settings: on/off, minutes of warning, habits switched off, and what fired today.
  reminders() {
    state.reminders = { ...DEFAULT_REMINDERS, ...state.reminders };
    return state.reminders;
  },
  setReminders(patch) { Object.assign(this.reminders(), patch); save(); },
  setHabitReminder(id, on) {
    const off = this.reminders().off;
    if (on) delete off[id]; else off[id] = true;
    save();
  },
  // log keys are "YYYY-MM-DD:habitId"; anything older than three days is dropped.
  logReminder(key, patch) {
    const log = this.reminders().log;
    log[key] = { ...log[key], ...patch };
    const cutoff = new Date(Date.now() - 3 * 86400000).toISOString().slice(0, 10);
    for (const k of Object.keys(log)) if (k.slice(0, 10) < cutoff) delete log[k];
    save();
  },

  month(key) { return state.months[key] || null; },

  // A month that hasn't been written to yet is shown as a draft: last month's habits and an empty
  // grid, the way copying a tab worked in the sheet. It's saved only when something changes in it,
  // so browsing ahead or back never leaves empty months behind (D-017).
  view(key) { return state.months[key] || draftMonth(key); },

  ensureMonth(key) {
    if (state.months[key]) return state.months[key];
    state.months[key] = draftMonth(key);
    save();
    return state.months[key];
  },

  isChecked(key, id, day) {
    return !!state.months[key]?.checks[id]?.includes(day);
  },

  toggle(key, id, day, value) {
    const { y, m } = parseKey(key);
    if (!isId(id) || !Number.isInteger(day) || day < 1 || day > daysIn(y, m)) return false;
    const month = this.ensureMonth(key);
    if (!month.habits.some((h) => h.id === id)) return false;
    const list = month.checks[id] || (month.checks[id] = []);
    const has = list.includes(day);
    const want = value === undefined ? !has : value;
    if (want === has) return has;
    if (want) { list.push(day); list.sort((a, b) => a - b); } else list.splice(list.indexOf(day), 1);
    save();
    return want;
  },

  color(id) {
    if (!state.colors[id]) {
      state.colors[id] = PALETTE[Object.keys(state.colors).length % PALETTE.length];
    }
    return safeColor(state.colors[id]);
  },
  setColor(id, color) {
    if (!isId(id) || safeColor(color, null) === null) return;
    state.colors[id] = color;
    save();
  },

  // A habit that is your part of a gang (D-046): { habitId: gangId }. The database keeps the link
  // only while you're in that gang.
  challengeOf: (id) => state.links?.[id] || null,
  linkChallenge(id, gang) {
    if (!isId(id) || (gang && !/^[0-9a-f-]{36}$/.test(gang))) return;
    state.links ||= {};
    if (gang) {
      for (const [other, g] of Object.entries(state.links)) if (g === gang && other !== id) delete state.links[other];
      state.links[id] = gang;
    } else delete state.links[id];
    if (!Object.keys(state.links).length) delete state.links;
    save();
  },

  // A private habit is never shown to any buddy (D-029), whatever level they're at.
  isPrivate: (id) => state.private?.[id] === true,
  setPrivate(id, on) {
    if (!isId(id)) return;
    state.private ||= {};
    if (on) state.private[id] = true; else delete state.private[id];
    if (!Object.keys(state.private).length) delete state.private;
    save();
  },

  // schedule: { cadence, weekdays, timesPerWeek } (D-013). A non-daily schedule sets its own goal.
  addHabit(key, { name, goal = 20, time = '', start = 1, cadence = 'daily', weekdays, timesPerWeek }) {
    const clean = safeName(name);
    const month = this.ensureMonth(key);
    if (!clean || month.habits.length >= LIMITS.habitsPerMonth) return null;
    const { y, m } = parseKey(key);
    const base = clean.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'habit';
    const slug = `${base}-${Date.now().toString(36).slice(-4)}`;
    const habit = { id: slug, name: clean, goal: clampInt(goal, 0, 31, 20), time: safeTime(time), start: clampInt(start, 1, daysIn(y, m), 1) };
    Object.assign(habit, cleanSchedule({ cadence, weekdays: cadence === 'weekdays' && !weekdays?.length ? [1, 2, 3, 4, 5] : weekdays, timesPerWeek }));
    if (habit.cadence) habit.goal = defaultGoal(habit, y, m);
    month.habits.push(habit);
    month.checks[slug] = month.checks[slug] || [];
    this.color(slug);
    save();
    return slug;
  },

  updateHabit(key, id, patch) {
    const habit = this.ensureMonth(key).habits.find((h) => h.id === id);
    if (!habit) return;
    const { y, m } = parseKey(key);
    if ('name' in patch && safeName(patch.name)) habit.name = safeName(patch.name);
    if ('time' in patch) habit.time = safeTime(patch.time);
    // A schedule change replaces the old schedule and recalculates the goal; the goal can still be
    // edited afterwards. Choosing "on chosen days" with none picked starts with Monday to Friday.
    if ('cadence' in patch || 'weekdays' in patch || 'timesPerWeek' in patch) {
      const next = { ...habit, ...patch };
      if (next.cadence === 'weekdays' && !next.weekdays?.length) next.weekdays = [1, 2, 3, 4, 5];
      if (next.cadence === 'times_per_week' && !next.timesPerWeek) next.timesPerWeek = 3;
      delete habit.cadence; delete habit.weekdays; delete habit.timesPerWeek;
      Object.assign(habit, cleanSchedule(next));
      habit.goal = defaultGoal(habit, y, m);
    }
    if ('goal' in patch) habit.goal = clampInt(patch.goal, 0, 31, habit.goal);
    if ('start' in patch) habit.start = clampInt(patch.start, 1, daysIn(y, m), habit.start);
    save();
  },

  removeHabit(key, id) {
    const month = this.ensureMonth(key);
    month.habits = month.habits.filter((h) => h.id !== id);
    delete month.checks[id];
    save();
  },

  // A new order for the month's habits (D-049): `ids` must be exactly the month's habits.
  reorderHabits(key, ids) {
    const month = this.ensureMonth(key);
    if (!Array.isArray(ids) || ids.length !== month.habits.length) return;
    const byId = new Map(month.habits.map((h) => [h.id, h]));
    if (new Set(ids).size !== ids.length || !ids.every((id) => byId.has(id))) return;
    month.habits = ids.map((id) => byId.get(id));
    save();
  },

  moveHabit(key, id, delta) {
    const list = this.ensureMonth(key).habits;
    const i = list.findIndex((h) => h.id === id);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    save();
  },

  // One wish per year: crane 1,000 of 2026 is for something, crane 1,000 of 2027 for something else.
  setWish(y, text) {
    if (!Number.isInteger(y)) return;
    state.years = { ...state.years, [y]: { ...state.years?.[y], wish: String(text ?? '').trim().slice(0, LIMITS.wish) } };
    save();
  },

  // Fold the year (D-017): mark year y done, set up January of the next year with the habits you
  // keep, and write next year's wish. If January already has ticks for a habit you let go, that
  // habit stays (its ticks are never thrown away) and its name is returned.
  foldYear(y, { keep, wish }) {
    if (!Number.isInteger(y)) return [];
    const keepIds = new Set(Array.isArray(keep) ? keep.filter(isId) : []);
    const janKey = monthKey(y + 1, 1);
    let jan = state.months[janKey];
    if (!jan) {
      const habits = closingHabits(state, y).map((h) => ({ ...h, start: 1 }));
      jan = state.months[janKey] = { habits, checks: Object.fromEntries(habits.map((h) => [h.id, []])) };
    }
    const kept = [];
    jan.habits = jan.habits.filter((h) => {
      if (keepIds.has(h.id)) return true;
      if (jan.checks[h.id]?.length) { kept.push(h.name); return true; }
      delete jan.checks[h.id];
      return false;
    });
    const years = { ...state.years };
    years[y] = { ...years[y], foldedAt: Date.now() };
    const next = String(wish ?? '').trim().slice(0, LIMITS.wish);
    if (next) years[y + 1] = { ...years[y + 1], wish: next };
    state.years = years;
    save();
    return kept;
  },

  exportJSON: () => JSON.stringify(state, null, 2),
  // Throws a readable error when the file is not a valid backup; nothing changes in that case.
  importJSON(text) {
    const meta = state.meta;
    state = parseBackup(text);
    state.meta = { ...meta, lastBackupAt: Date.now() }; // the loaded file is itself a backup
    save();
  },
  // The account's copy replaces what's here (sync, D-020). Reminders and backup times belong to
  // this device and stay.
  replaceState(next) {
    const { reminders, meta } = state;
    state = cleanState(next);
    if (reminders) state.reminders = reminders;
    if (meta) state.meta = meta;
    save();
  },
  // Where the sync queue lives (the adapter owns storage).
  syncStorage: { read: () => adapter.loadSync(), write: (obj) => adapter.saveSync(obj) },
  // Park a copy of this browser's data under a dated key before it's replaced; never delete it.
  keepAsideCopy() { adapter.keepAside(JSON.stringify(state)); },
  // Changes made here that haven't reached the account yet (the sync queue, D-020).
  unsentChanges() { return Object.keys(adapter.loadSync().ops || {}).length; },
  // Signing out on a shared computer: remove everything One More Fold stored in this browser and show
  // an empty tracker. Only after signing out, so the account still has the folds. True if removed.
  forgetDevice() {
    const ok = adapter.clearAll();
    state = emptyState();
    listeners.forEach((fn) => fn(state));
    return ok;
  },
};
