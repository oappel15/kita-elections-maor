import { writeJSON, getConfig, body, validatePicks, classByToken, checkBallot, votePath } from '../lib/store.js';
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).end();
  const b = body(req);
  const c = await classByToken(String(b.token || ''));
  if (!c) return res.status(404).json({ error: 'הקישור לא תקין.' });
  const nonce = checkBallot(c.cls, b.ticket);
  if (!nonce) return res.status(423).json({ error: 'צריך ללחוץ "תלמיד הבא" כדי לפתוח פתק חדש.' });
  const cfg = await getConfig();
  if (!cfg.open) return res.status(403).json({ error: 'ההצבעה סגורה כרגע.' });
  const err = validatePicks(cfg, c.cls, b.picks);
  if (err) return res.status(400).json({ error: err });
  // one blob per ballot nonce; the Blob store refuses a second write to the same name
  try { await writeJSON(votePath(nonce, { c: c.cls, p: b.picks }), 1, false); }
  catch { return res.status(409).json({ error: 'ההצבעה הזאת כבר נקלטה. המורה צריך ללחוץ "תלמיד הבא".' }); }
  res.json({ ok: true });
}
