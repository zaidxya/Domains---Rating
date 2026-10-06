const express = require('express');
const { Pool } = require('pg');
const path = require('path');
const crypto = require('crypto');

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL is not set. Paste your Postgres connection string into it.');
  process.exit(1);
}

// Hosted databases need SSL; a local one on your own machine does not
const isLocal = /localhost|127\.0\.0\.1/.test(DATABASE_URL);
const pool = new Pool({ connectionString: DATABASE_URL, ssl: isLocal ? false : true });

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const star = v => {
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 && n <= 5 ? n : null;
};
const text = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '') || null;

// ---------- Public: submit a rating ----------
app.post('/api/ratings', async (req, res) => {
  const b = req.body || {};
  const overall = star(b.overall);
  if (!overall) return res.status(400).json({ error: 'overall rating (1-5) is required' });

  try {
    await pool.query(
      `INSERT INTO ratings (name, university, overall, study_zone, courses, comment, lang)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        text(b.name, 80), text(b.university, 120), overall,
        star(b.study_zone), star(b.courses), text(b.comment, 1000),
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

app.use('/admin', requireAdmin);

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
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log(`Running on http://localhost:${PORT}`));
}

start().catch(err => {
  console.error('Could not start:', err.message);
  process.exit(1);
});
