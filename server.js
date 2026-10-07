const express = require('express');
const { Pool } = require('pg');
const path = require('path');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL is not set. Paste your Postgres connection string into it.');
  process.exit(1);
}

// Hosted databases need SSL; a local one on your own machine does not
const isLocal = /localhost|127\.0\.0\.1/.test(DATABASE_URL);
const pool = new Pool({ connectionString: DATABASE_URL, ssl: isLocal ? false : true });

const app = express();
// Render sits behind one proxy; without this every visitor looks like the same IP
app.set('trust proxy', 1);
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const star = v => {
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 && n <= 5 ? n : null;
};
const text = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '') || null;

// Allowed values for the dropdown / choice fields
const LEVELS = ['y1', 'y2', 'y3', 'y4', 'graduate', 'postgrad', 'other'];
const SOURCES = ['social', 'friend', 'university', 'event', 'other'];
const RECOMMEND = ['yes', 'maybe', 'no'];

// ---------- Spam protection ----------
// Max 10 ratings per IP per hour (a shared campus IP still has room)
const ratingLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'too many ratings, try again later' }
});

// Max 10 FAILED admin logins per IP per 15 minutes (stops password guessing)
const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: 'Too many failed logins. Try again later.'
});

// ---------- Public: submit a rating ----------
const bad = (res, field) => res.status(400).json({ error: 'invalid ' + field, field });

app.post('/api/ratings', ratingLimiter, async (req, res) => {
  const b = req.body || {};
  // Honeypot: real people never see this hidden field, bots fill it in
  if (typeof b.website === 'string' && b.website.trim() !== '') {
    return res.status(201).json({ ok: true });   // pretend success, save nothing
  }

  // Full name: three names or more (الاسم الثلاثي)
  const name = text(b.name, 120);
  if (!name || name.split(/\s+/).length < 3) return bad(res, 'name');

  // Phone: digits with an optional leading +, spaces/dashes/brackets are removed
  const phone = typeof b.phone === 'string' ? b.phone.replace(/[\s\-().]/g, '') : '';
  if (!/^\+?\d{7,15}$/.test(phone)) return bad(res, 'phone');

  // Email is optional, but must look right if given
  const email = text(b.email, 254);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return bad(res, 'email');

  const university = text(b.university, 120);
  if (!university) return bad(res, 'university');

  if (!LEVELS.includes(b.study_level)) return bad(res, 'study_level');

  const overall = star(b.overall);
  if (!overall) return bad(res, 'overall');

  if (b.consent !== true) return bad(res, 'consent');

  try {
    await pool.query(
      `INSERT INTO ratings
         (name, phone, email, university, major, study_level, heard_about,
          overall, study_zone, courses, recommend, comment, consent, lang)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,true,$13)`,
      [
        name, phone, email, university, text(b.major, 120), b.study_level,
        SOURCES.includes(b.heard_about) ? b.heard_about : null,
        overall, star(b.study_zone), star(b.courses),
        RECOMMEND.includes(b.recommend) ? b.recommend : null,
        text(b.comment, 1000),
        b.lang === 'ar' ? 'ar' : 'en'
      ]
    );
    res.status(201).json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'could not save rating' });
  }
});

const STATS_SQL = `
  SELECT COUNT(*)::int AS count,
         ROUND(AVG(overall)::numeric, 2)::float AS overall,
         ROUND(AVG(study_zone)::numeric, 2)::float AS study_zone,
         ROUND(AVG(courses)::numeric, 2)::float AS courses
  FROM ratings`;

app.get('/api/stats', async (req, res) => {
  try {
    res.json((await pool.query(STATS_SQL)).rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'could not load stats' });
  }
});

// ---------- Admin dashboard (password protected) ----------
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

function safeEqual(a, b) {
  const x = crypto.createHash('sha256').update(a).digest();
  const y = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(x, y);
}

function requireAdmin(req, res, next) {
  if (!ADMIN_PASSWORD) return res.status(503).send('Admin disabled: ADMIN_PASSWORD is not set');
  const [scheme, encoded] = (req.headers.authorization || '').split(' ');
  if (scheme === 'Basic' && encoded) {
    const decoded = Buffer.from(encoded, 'base64').toString();
    if (safeEqual(decoded.slice(decoded.indexOf(':') + 1), ADMIN_PASSWORD)) return next();
  }
  res.set('WWW-Authenticate', 'Basic realm="Domains admin"');
  res.status(401).send('Login required');
}

app.use('/admin', adminLimiter, requireAdmin);

app.get('/admin/api/ratings', async (req, res) => {
  try {
    res.json((await pool.query('SELECT * FROM ratings ORDER BY id DESC')).rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'could not load ratings' });
  }
});

app.get('/admin/api/stats', async (req, res) => {
  try {
    res.json((await pool.query(STATS_SQL)).rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'could not load stats' });
  }
});

app.use('/admin', express.static(path.join(__dirname, 'admin')));

// ---------- Start: make sure the table exists, then listen ----------
async function start() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ratings (
      id SERIAL PRIMARY KEY,
      name TEXT,
      university TEXT,
      overall INTEGER NOT NULL CHECK (overall BETWEEN 1 AND 5),
      study_zone INTEGER CHECK (study_zone BETWEEN 1 AND 5),
      courses INTEGER CHECK (courses BETWEEN 1 AND 5),
      comment TEXT,
      lang TEXT,
      created_at TIMESTAMPTZ DEFAULT now()
    )`);
  // Add the newer columns to an existing table (safe to run on every start;
  // old rows simply have empty values in these columns)
  await pool.query(`
    ALTER TABLE ratings
      ADD COLUMN IF NOT EXISTS phone TEXT,
      ADD COLUMN IF NOT EXISTS email TEXT,
      ADD COLUMN IF NOT EXISTS major TEXT,
      ADD COLUMN IF NOT EXISTS study_level TEXT,
      ADD COLUMN IF NOT EXISTS heard_about TEXT,
      ADD COLUMN IF NOT EXISTS recommend TEXT,
      ADD COLUMN IF NOT EXISTS consent BOOLEAN DEFAULT false`);
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log(`Running on http://localhost:${PORT}`));
}

start().catch(err => {
  console.error('Could not start:', err.message);
  process.exit(1);
});
