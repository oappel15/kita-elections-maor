import { put, get, list, del } from '@vercel/blob';
const A = { access: 'private' };
// cache=true lets the Blob CDN serve hits (cache hits are not billed as Simple Operations)
export async function readJSON(path, cache = false) {
  const r = await get(path, { ...A, useCache: cache });
  if (!r || r.statusCode !== 200) return null;
  const txt = await new Response(r.stream).text();
  return JSON.parse(txt);
}
export async function writeJSON(path, obj, overwrite = true) {
  return put(path, JSON.stringify(obj), { ...A, addRandomSuffix: false, allowOverwrite: overwrite, contentType: 'application/json', cacheControlMaxAge: 60 });
}
export async function listAll(prefix) {
  let cursor, out = [];
  do { const r = await list({ prefix, cursor, limit: 1000 }); out.push(...r.blobs); cursor = r.hasMore ? r.cursor : undefined; } while (cursor);
  return out;
}
export async function remove(urls) { if (urls.length) await del(urls); }
export const DEFAULT_CONFIG = { mode: 'boygirl', open: true, title: 'בחירות למועצת התלמידים', classes: {} };
// in-memory cache per function instance (cuts Blob reads to ~1 per instance per TTL)
const MEM = {}; const TTL = 120000;
async function cached(path, fresh) {
  const m = MEM[path];
  if (!fresh && m && Date.now() - m.t < TTL) return m.v;
  const v = await readJSON(path, false); MEM[path] = { v, t: Date.now() }; return v;
}
export function setCached(path, v) { MEM[path] = { v, t: Date.now() }; }
export async function getConfig(fresh = false) { return (await cached('config.json', fresh)) || DEFAULT_CONFIG; }
export function normCode(c) { return String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); }
export function body(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  try { return JSON.parse(req.body || '{}'); } catch { return {}; }
}
export function isAdmin(req, b) {
  const c = (b && b.adminCode) || req.headers['x-admin-code'];
  return !!process.env.ADMIN_CODE && String(c || '').trim().toUpperCase() === process.env.ADMIN_CODE.trim().toUpperCase();
}
// effective rule for a class: boygirl only if every candidate has gender and both genders exist
export function ruleFor(cfg, cls) {
  const cands = cfg.classes[cls] || [];
  if (cfg.mode === 'boygirl') {
    const ok = cands.length && cands.every(c => c.g === 'm' || c.g === 'f') && cands.some(c => c.g === 'm') && cands.some(c => c.g === 'f');
    return ok ? 'boygirl' : 'exact2';
  }
  return cfg.mode;
}
export function validatePicks(cfg, cls, picks) {
  const cands = cfg.classes[cls] || [];
  const byId = Object.fromEntries(cands.map(c => [c.id, c]));
  if (!Array.isArray(picks)) return 'בחירה לא תקינה';
  const uniq = [...new Set(picks)];
  if (uniq.length !== picks.length || !uniq.every(id => byId[id])) return 'בחירה לא תקינה';
  const rule = ruleFor(cfg, cls);
  const need = Math.min(2, cands.length);
  if (rule === 'boygirl') {
    if (uniq.length !== 2) return 'צריך לבחור מועמד אחד ומועמדת אחת';
    const gs = uniq.map(id => byId[id].g).sort().join('');
    if (gs !== 'fm') return 'צריך לבחור מועמד אחד ומועמדת אחת';
  } else if (rule === 'exact2') {
    if (uniq.length !== need) return 'צריך לבחור בדיוק ' + (need === 2 ? 'שני מועמדים' : 'מועמד אחד');
  } else {
    if (uniq.length < 1 || uniq.length > 2) return 'אפשר לבחור מועמד אחד או שניים';
  }
  return null;
}
import crypto from 'node:crypto';
export function rid(n = 9) { return crypto.randomBytes(n).toString('base64url'); }
export function newPin() { return String(crypto.randomInt(100000, 1000000)); }
export async function getPins(cfg) {
  const pins = (await cached('pins.json', true)) || {};
  let changed = false;
  for (const k of Object.keys(cfg.classes)) if (!pins[k]) { pins[k] = { token: rid(6), pin: newPin() }; changed = true; }
  if (changed) { await writeJSON('pins.json', pins); setCached('pins.json', pins); }
  return pins;
}
export async function classByToken(token) {
  if (!/^[A-Za-z0-9_-]{4,20}$/.test(token)) return null;
  let pins = (await cached('pins.json')) || {};
  let e = Object.entries(pins).find(([, v]) => v.token === token);
  if (!e && Date.now() - (MEM['pins.json']?.t || 0) > 10000) { pins = (await cached('pins.json', true)) || {}; e = Object.entries(pins).find(([, v]) => v.token === token); }
  e = e || null;
    return e ? { cls: e[0], pin: e[1].pin } : null;
}
export function sessionFor(cls, pin) { return crypto.createHmac('sha256', process.env.ADMIN_CODE || 'x').update(cls + ':' + pin).digest('base64url'); }
export function safeEq(a, b) { a = Buffer.from(String(a || '')); b = Buffer.from(String(b || '')); return a.length === b.length && crypto.timingSafeEqual(a, b); }

// stateless one-time ballot: nonce + HMAC(cls:nonce). Nothing is stored until the vote itself.
export function newBallot(cls) { const n = rid(12); return n + '.' + crypto.createHmac('sha256', process.env.ADMIN_CODE || 'x').update('ballot:' + cls + ':' + n).digest('base64url').slice(0, 22); }
export function checkBallot(cls, b) {
  const m = /^([A-Za-z0-9_-]{16})\.([A-Za-z0-9_-]{22})$/.exec(String(b || '')); if (!m) return null;
  const want = crypto.createHmac('sha256', process.env.ADMIN_CODE || 'x').update('ballot:' + cls + ':' + m[1]).digest('base64url').slice(0, 22);
  return safeEq(m[2], want) ? m[1] : null;
}
// vote record lives entirely in the pathname, so admin results need a single list() and zero reads
export function votePath(nonce, rec) { return 'v/' + nonce + '~' + Buffer.from(JSON.stringify(rec)).toString('base64url') + '.json'; }
export function parseVotePath(p) { const m = /^v\/([A-Za-z0-9_-]+)~([A-Za-z0-9_-]+)\.json$/.exec(p); if (!m) return null; try { return [m[1], JSON.parse(Buffer.from(m[2], 'base64url').toString())]; } catch { return null; } }
