import { readJSON, writeJSON, listAll, remove, getConfig, body, isAdmin, ruleFor } from '../lib/store.js';
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
      const [codes, votes] = await Promise.all([listAll('codes/'), listAll('votes/')]);
      const used = new Set(votes.map(v => fname(v.pathname)));
      const codeRecs = await readMany(codes);
      const voteRecs = await readMany(votes);
      const tally = {};
      for (const [, v] of voteRecs) if (v) for (const id of v.picks) tally[id] = (tally[id] || 0) + 1;
      const perClass = {};
      for (const [c, r] of codeRecs) if (r) (perClass[r.cls] ||= []).push({ code: c, used: used.has(c) });
      const rules = Object.fromEntries(Object.keys(cfg.classes).map(k => [k, ruleFor(cfg, k)]));
      return res.json({ config: cfg, rules, codes: perClass, tally, votes: voteRecs.length });
    }
    case 'saveConfig': {
      const n = b.config || {};
      const classes = {};
      for (const [k, arr] of Object.entries(n.classes || {})) classes[k] = (arr || []).filter(c => c && String(c.name || '').trim()).map((c, i) => ({ id: c.id || (k + '-' + crypto.randomBytes(3).toString('hex')), name: String(c.name).trim().slice(0, 60), g: ['m', 'f'].includes(c.g) ? c.g : '' }));
      const next = { mode: ['boygirl', 'exact2', 'upto2'].includes(n.mode) ? n.mode : 'boygirl', open: n.open !== false, title: String(n.title || cfg.title).slice(0, 80), classes };
      await writeJSON('config.json', next);
      return res.json({ ok: true });
    }
    case 'genCodes': {
      const cls = String(b.cls || ''); const count = Math.max(1, Math.min(60, parseInt(b.count) || 0));
      if (!(cls in cfg.classes)) return res.status(400).json({ error: 'כיתה לא קיימת' });
      const made = [];
      for (let i = 0; i < count; i++) { const c = mkCode(); await writeJSON(`codes/${c}.json`, { cls, created: new Date().toISOString() }, false); made.push(c); }
      return res.json({ ok: true, codes: made });
    }
    case 'deleteUnused': {
      const cls = String(b.cls || '');
      const [codes, votes] = await Promise.all([listAll('codes/'), listAll('votes/')]);
      const used = new Set(votes.map(v => fname(v.pathname)));
      const recs = await readMany(codes);
      const kill = codes.filter((x, i) => recs[i][1] && recs[i][1].cls === cls && !used.has(fname(x.pathname))).map(x => x.url);
      await remove(kill); return res.json({ ok: true, deleted: kill.length });
    }
    case 'resetAll': {
      if (b.confirm !== 'אפס') return res.status(400).json({ error: 'צריך לכתוב אפס לאישור' });
      const all = [...await listAll('codes/'), ...await listAll('votes/')];
      await remove(all.map(x => x.url)); return res.json({ ok: true, deleted: all.length });
    }
  }
  res.status(400).json({ error: 'פעולה לא מוכרת' });
}
