import { readJSON, writeJSON, getConfig, body, ruleFor, classByToken, sessionFor, safeEq, rid } from '../lib/store.js';
async function ticket(cls) { const t = rid(12); await writeJSON(`tickets/${t}.json`, { cls, at: new Date().toISOString() }, false); return t; }
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).end();
  const b = body(req);
  const c = await classByToken(String(b.token || ''));
  if (!c) return res.status(404).json({ error: 'הקישור לא תקין.' });
  const pinOk = b.pin && safeEq(b.pin, c.pin);
  const sessOk = b.session && safeEq(b.session, sessionFor(c.cls, c.pin));
  if (b.action === 'open') {
    if (!pinOk && !sessOk) return res.status(401).json({ error: 'קוד המורה שגוי.' });
    const cfg = await getConfig();
    const cands = (cfg.classes[c.cls] || []).map(x => ({ id: x.id, name: x.name, g: x.g }));
    return res.json({ cls: c.cls, rule: ruleFor(cfg, c.cls), open: cfg.open, candidates: cands, session: sessionFor(c.cls, c.pin), title: cfg.title });
  }
  if (b.action === 'next') {
    // unlocking the next student always needs the teacher PIN
    if (!pinOk) return res.status(401).json({ error: 'קוד המורה שגוי.' });
    const cfg = await getConfig();
    if (!cfg.open) return res.status(403).json({ error: 'ההצבעה סגורה כרגע.' });
    return res.json({ ticket: await ticket(c.cls) });
  }
  res.status(400).json({ error: 'פעולה לא מוכרת' });
}
