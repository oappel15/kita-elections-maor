import { writeJSON, getConfig, body, ruleFor, classByToken, rid } from '../lib/store.js';
async function ticket(cls) { const t = rid(12); await writeJSON(`tickets/${t}.json`, { cls, at: new Date().toISOString() }, false); return t; }
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).end();
  const b = body(req);
  const c = await classByToken(String(b.token || ''));
  if (!c) return res.status(404).json({ error: 'הקישור לא תקין.' });
  const cfg = await getConfig();
  if (b.action === 'open') {
    const cands = (cfg.classes[c.cls] || []).map(x => ({ id: x.id, name: x.name, g: x.g }));
    return res.json({ cls: c.cls, rule: ruleFor(cfg, c.cls), open: cfg.open, candidates: cands, title: cfg.title });
  }
  if (b.action === 'next') {
    // fresh one-time ballot slot (no PIN; the per-class link itself is the access)
    if (!cfg.open) return res.status(403).json({ error: 'ההצבעה סגורה כרגע.' });
    return res.json({ ticket: await ticket(c.cls) });
  }
  res.status(400).json({ error: 'פעולה לא מוכרת' });
}
