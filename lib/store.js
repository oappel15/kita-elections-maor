import { put, get, list, del } from '@vercel/blob';
const A = { access: 'private' };
export async function readJSON(path) {
  const r = await get(path, { ...A, useCache: false });
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
export async function getConfig() { return (await readJSON('config.json')) || DEFAULT_CONFIG; }
export function normCode(c) { return String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); }
export function body(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  try { return JSON.parse(req.body || '{}'); } catch { return {}; }
}
export function isAdmin(req, b) {
  const c = (b && b.adminCode) || req.headers['x-admin-code'];
  return !!process.env.ADMIN_CODE && c === process.env.ADMIN_CODE;
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
