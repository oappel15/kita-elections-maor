import { readJSON, writeJSON, listAll, remove, getConfig, setCached, body, isAdmin, ruleFor, getPins, parseVotePath } from '../lib/store.js';
import crypto from 'node:crypto';
const fname = p => p.split('/').pop().replace('.json', '');
// all votes from ONE list(): new votes carry their data in the pathname; legacy votes/ files are read (few)
async function allVotes() {
  const blobs = (await listAll('')).filter(x => /^(v|votes)\//.test(x.pathname));
  const out = [];
  for (const x of blobs) { const p = parseVotePath(x.pathname); if (p) out.push({ id: p[0], url: x.url, cls: p[1].c, picks: p[1].p, at: x.uploadedAt }); }
  const legacy = blobs.filter(x => x.pathname.startsWith('votes/'));
  for (const [id, v] of await readMany(legacy)) if (v) out.push({ id, url: legacy.find(x => fname(x.pathname) === id).url, cls: v.cls, picks: v.picks, at: v.at });
  return out;
}
async function readMany(blobs) {
  const out = []; for (let i = 0; i < blobs.length; i += 25) out.push(...await Promise.all(blobs.slice(i, i + 25).map(x => readJSON(x.pathname).then(v => [fname(x.pathname), v]))));
  return out;
}
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).end();
  const b = body(req);
  if (!isAdmin(req, b)) return res.status(401).json({ error: 'קוד מנהל שגוי' });
  const cfg = await getConfig(true);
  switch (b.action) {
    case 'state': {
      const V = await allVotes();
      const pins = Object.fromEntries(Object.entries(await getPins(cfg)).map(([k, v]) => [k, { token: v.token }]));
      const tally = {}, perClass = {};
      for (const v of V) { for (const id of v.picks || []) tally[id] = (tally[id] || 0) + 1; perClass[v.cls] = (perClass[v.cls] || 0) + 1; }
      const rules = Object.fromEntries(Object.keys(cfg.classes).map(k => [k, ruleFor(cfg, k)]));
      const log = V.map(v => ({ id: v.id, cls: v.cls, at: new Date(v.at).toISOString() })).sort((a, b) => (a.at < b.at ? 1 : -1));
      return res.json({ config: cfg, rules, voted: perClass, pins, tally, votes: V.length, log });
    }
    case 'saveConfig': {
      const n = b.config || {};
      const classes = {};
      for (const [k, arr] of Object.entries(n.classes || {})) classes[k] = (arr || []).filter(c => c && String(c.name || '').trim()).map((c, i) => ({ id: c.id || (k + '-' + crypto.randomBytes(3).toString('hex')), name: String(c.name).trim().slice(0, 60), g: ['m', 'f'].includes(c.g) ? c.g : '' }));
      const next = { mode: ['boygirl', 'exact2', 'upto2'].includes(n.mode) ? n.mode : 'boygirl', open: n.open !== false, title: String(n.title || cfg.title).slice(0, 80), classes };
      await writeJSON('config.json', next); setCached('config.json', next);
      return res.json({ ok: true });
    }
    case 'deleteVotes': {
      const ids = (b.ids || []).map(x => String(x));
      let V = await allVotes();
      if (b.since) V = V.filter(x => new Date(x.at) >= new Date(b.since)); else V = V.filter(x => ids.includes(x.id));
      if (b.cls) V = V.filter(x => x.cls === b.cls);
      await remove(V.map(x => x.url)); return res.json({ ok: true, deleted: V.length });
    }
    case 'cleanup': {
      const t = await listAll('tickets/'); await remove(t.map(x => x.url)); return res.json({ ok: true, deleted: t.length });
    }
    case 'resetAll': {
      if (b.confirm !== 'אפס') return res.status(400).json({ error: 'צריך לכתוב אפס לאישור' });
      const all = [...await listAll('codes/'), ...await listAll('votes/'), ...await listAll('v/'), ...await listAll('tickets/')];
      await remove(all.map(x => x.url)); return res.json({ ok: true, deleted: all.length });
    }
  }
  res.status(400).json({ error: 'פעולה לא מוכרת' });
}
