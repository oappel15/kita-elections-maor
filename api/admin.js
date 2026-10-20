import { readJSON, writeJSON, listAll, remove, getConfig, body, isAdmin, ruleFor, getPins, newPin } from '../lib/store.js';
import crypto from 'node:crypto';
const ALPH = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
function mkCode() { let s = ''; const b = crypto.randomBytes(6); for (const x of b) s += ALPH[x % ALPH.length]; return s; }
const fname = p => p.split('/').pop().replace('.json', '');
async function readMany(blobs) {
  const out = []; for (let i = 0; i < blobs.length; i += 25) out.push(...await Promise.all(blobs.slice(i, i + 25).map(x => readJSON(x.pathname).then(v => [fname(x.pathname), v]))));
  return out;
}
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).end();
  const b = body(req);
  if (!isAdmin(req, b)) return res.status(401).json({ error: 'קוד מנהל שגוי' });
  const cfg = await getConfig();
  switch (b.action) {
    case 'state': {
      const votes = await listAll('votes/');
      const voteRecs = await readMany(votes);
      const pins = await getPins(cfg);
      const tally = {};
      for (const [, v] of voteRecs) if (v) for (const id of v.picks) tally[id] = (tally[id] || 0) + 1;
      const perClass = {};
      for (const [, v] of voteRecs) if (v) perClass[v.cls] = (perClass[v.cls] || 0) + 1;
      const rules = Object.fromEntries(Object.keys(cfg.classes).map(k => [k, ruleFor(cfg, k)]));
      return res.json({ config: cfg, rules, voted: perClass, pins, tally, votes: voteRecs.length });
    }
    case 'saveConfig': {
      const n = b.config || {};
      const classes = {};
      for (const [k, arr] of Object.entries(n.classes || {})) classes[k] = (arr || []).filter(c => c && String(c.name || '').trim()).map((c, i) => ({ id: c.id || (k + '-' + crypto.randomBytes(3).toString('hex')), name: String(c.name).trim().slice(0, 60), g: ['m', 'f'].includes(c.g) ? c.g : '' }));
      const next = { mode: ['boygirl', 'exact2', 'upto2'].includes(n.mode) ? n.mode : 'boygirl', open: n.open !== false, title: String(n.title || cfg.title).slice(0, 80), classes };
      await writeJSON('config.json', next);
      return res.json({ ok: true });
    }
    case 'regenPin': {
      const cls = String(b.cls || ''); const pins = await getPins(cfg);
      if (!pins[cls]) return res.status(400).json({ error: 'כיתה לא קיימת' });
      pins[cls].pin = newPin(); await writeJSON('pins.json', pins); return res.json({ ok: true });
    }
    case 'resetAll': {
      if (b.confirm !== 'אפס') return res.status(400).json({ error: 'צריך לכתוב אפס לאישור' });
      const all = [...await listAll('codes/'), ...await listAll('votes/'), ...await listAll('tickets/')];
      await remove(all.map(x => x.url)); return res.json({ ok: true, deleted: all.length });
    }
  }
  res.status(400).json({ error: 'פעולה לא מוכרת' });
}
