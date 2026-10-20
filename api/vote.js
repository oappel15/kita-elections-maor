import { readJSON, writeJSON, remove, getConfig, body, validatePicks, classByToken, sessionFor, safeEq } from '../lib/store.js';
import { head } from '@vercel/blob';
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).end();
  const b = body(req);
  const c = await classByToken(String(b.token || ''));
  if (!c || !b.session || !safeEq(b.session, sessionFor(c.cls, c.pin))) return res.status(401).json({ error: 'אין הרשאה. המורה צריך להיכנס עם הקוד.' });
  const t = String(b.ticket || '').replace(/[^A-Za-z0-9_-]/g, '');
  const tk = t && await readJSON(`tickets/${t}.json`);
  if (!tk || tk.cls !== c.cls) return res.status(423).json({ error: 'המסך נעול. המורה צריך ללחוץ "תלמיד הבא".' });
  const cfg = await getConfig();
  if (!cfg.open) return res.status(403).json({ error: 'ההצבעה סגורה כרגע.' });
  const err = validatePicks(cfg, c.cls, b.picks);
  if (err) return res.status(400).json({ error: err });
  try { await writeJSON(`votes/${t}.json`, { cls: c.cls, picks: b.picks, at: new Date().toISOString() }, false); }
  catch { return res.status(409).json({ error: 'ההצבעה הזאת כבר נקלטה. המורה צריך ללחוץ "תלמיד הבא".' }); }
  try { const h = await head(`tickets/${t}.json`); await remove([h.url]); } catch {}
  res.json({ ok: true });
}
