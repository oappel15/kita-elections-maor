import { readJSON, writeJSON, getConfig, normCode, body, validatePicks } from '../lib/store.js';
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const b = body(req); const code = normCode(b.code);
  const rec = code.length >= 5 && await readJSON(`codes/${code}.json`);
  if (!rec) return res.status(404).json({ error: 'הקוד לא נכון.' });
  const cfg = await getConfig();
  if (!cfg.open) return res.status(403).json({ error: 'ההצבעה סגורה כרגע.' });
  const err = validatePicks(cfg, rec.cls, b.picks);
  if (err) return res.status(400).json({ error: err });
  try {
    // allowOverwrite:false => the store itself rejects a second vote with the same code (also under a race)
    await writeJSON(`votes/${code}.json`, { cls: rec.cls, picks: b.picks, at: new Date().toISOString() }, false);
  } catch (e) {
    return res.status(409).json({ error: 'עם הקוד הזה כבר הצביעו. כל קוד עובד פעם אחת בלבד.' });
  }
  res.json({ ok: true });
}
