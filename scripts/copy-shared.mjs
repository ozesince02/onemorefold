// The closed-app sender (supabase/functions) is deployed on its own, so it can't import from src/.
// It gets exact copies of the app's pure modules instead; scripts/check-push.mjs fails if a copy
// differs from its original. Run after changing any of them: npm run shared
import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

const SHARED = ['dates.js', 'schedule.js', 'reminders-core.js', 'stats.js', 'summaries.js', 'sync/rows.js'];
const root = join(import.meta.dirname, '..');

for (const file of SHARED) {
  const target = join(root, 'supabase/functions/_shared/lib', file);
  mkdirSync(dirname(target), { recursive: true });
  copyFileSync(join(root, 'src/lib', file), target);
}
console.log(`copied ${SHARED.length} modules to supabase/functions/_shared/lib`);
