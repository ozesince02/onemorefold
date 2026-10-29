// One-time tokens for Done and Later on closed-app reminders (D-039). Each reminder gets 32 random
// bytes; only their SHA-256 is stored (push_actions.token_hash), and the token itself travels only
// inside the notification, which is encrypted for the person's devices. WebCrypto only, so it runs
// the same in the Edge Functions (Deno) and in Node (scripts/check-push.mjs).
import { b64u } from './webpush.js';

export const TOKEN = /^[A-Za-z0-9_-]{43}$/; // 32 bytes in base64url
export const TOKEN_HOURS = 36;              // long enough for "tomorrow morning", short enough to go stale

export const makeToken = () => b64u(crypto.getRandomValues(new Uint8Array(32)));

export async function hashToken(token) {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token)));
  return Array.from(digest, (b) => b.toString(16).padStart(2, '0')).join('');
}
