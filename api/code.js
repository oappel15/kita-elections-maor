import { readJSON, getConfig, normCode, body, ruleFor } from '../lib/store.js';
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const code = normCode(body(req).code);
  if (code.length < 5) return res.status(400).json({ error: 'הקוד לא נכון' });
  const rec = await readJSON(`codes/${code}.json`);
  if (!rec) return res.status(404).json({ error: 'הקוד לא נכון. נסו שוב או פנו למורה.' });
  if (await readJSON(`votes/${code}.json`)) return res.status(409).json({ error: 'עם הקוד הזה כבר הצביעו. כל קוד עובד פעם אחת בלבד.' });
  const cfg = await getConfig();
  if (!cfg.open) return res.status(403).json({ error: 'ההצבעה סגורה כרגע.' });
  const cands = (cfg.classes[rec.cls] || []).map(c => ({ id: c.id, name: c.name, g: c.g }));
  if (!cands.length) return res.status(409).json({ error: 'עדיין אין מועמדים בכיתה הזאת.' });
  res.setHeader('Cache-Control', 'no-store');
  res.json({ cls: rec.cls, rule: ruleFor(cfg, rec.cls), candidates: cands, title: cfg.title });
}
