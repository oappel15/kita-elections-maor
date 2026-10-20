import { readJSON, writeJSON, listAll, remove, getConfig, body, isAdmin, ruleFor, getPins } from '../lib/store.js';
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
      const pins = Object.fromEntries(Object.entries(await getPins(cfg)).map(([k, v]) => [k, { token: v.token }]));
      const tally = {};
      for (const [, v] of voteRecs) if (v) for (const id of v.picks) tally[id] = (tally[id] || 0) + 1;
      const perClass = {};
      for (const [, v] of voteRecs) if (v) perClass[v.cls] = (perClass[v.cls] || 0) + 1;
      const rules = Object.fromEntries(Object.keys(cfg.classes).map(k => [k, ruleFor(cfg, k)]));
      const log = voteRecs.filter(([, v]) => v).map(([id, v]) => ({ id, cls: v.cls, at: v.at })).sort((a, b) => (a.at < b.at ? 1 : -1));
      return res.json({ config: cfg, rules, voted: perClass, pins, tally, votes: voteRecs.length, log });
    }
    case 'saveConfig': {
      const n = b.config || {};
      const classes = {};
      for (const [k, arr] of Object.entries(n.classes || {})) classes[k] = (arr || []).filter(c => c && String(c.name || '').trim()).map((c, i) => ({ id: c.id || (k + '-' + crypto.randomBytes(3).toString('hex')), name: String(c.name).trim().slice(0, 60), g: ['m', 'f'].includes(c.g) ? c.g : '' }));
      const next = { mode: ['boygirl', 'exact2', 'upto2'].includes(n.mode) ? n.mode : 'boygirl', open: n.open !== false, title: String(n.title || cfg.title).slice(0, 80), classes };
      await writeJSON('config.json', next);
      return res.json({ ok: true });
    }
    case 'deleteVotes': {
      const ids = (b.ids || []).map(x => String(x).replace(/[^A-Za-z0-9_-]/g, '')).filter(Boolean);
      let v = await listAll('votes/');
      if (b.since) v = v.filter(x => new Date(x.uploadedAt) >= new Date(b.since) && (!b.cls || true));
      else v = v.filter(x => ids.includes(fname(x.pathname)));
      if (b.cls) { const recs = await readMany(v); v = v.filter((x, i) => recs[i][1] && recs[i][1].cls === b.cls); }
      await remove(v.map(x => x.url)); return res.json({ ok: true, deleted: v.length });
    }
    case 'resetAll': {
      if (b.confirm !== 'אפס') return res.status(400).json({ error: 'צריך לכתוב אפס לאישור' });
      const all = [...await listAll('codes/'), ...await listAll('votes/'), ...await listAll('tickets/')];
      await remove(all.map(x => x.url)); return res.json({ ok: true, deleted: all.length });
    }
  }
  res.status(400).json({ error: 'פעולה לא מוכרת' });
}
