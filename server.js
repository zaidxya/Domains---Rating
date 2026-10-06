const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');

const app = express();
const db = new Database(path.join(__dirname, 'ratings.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS ratings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    university TEXT,
    overall INTEGER NOT NULL CHECK (overall BETWEEN 1 AND 5),
    study_zone INTEGER CHECK (study_zone BETWEEN 1 AND 5),
    courses INTEGER CHECK (courses BETWEEN 1 AND 5),
    comment TEXT,
    lang TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )
`);

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const insert = db.prepare(`
  INSERT INTO ratings (name, university, overall, study_zone, courses, comment, lang)
  VALUES (@name, @university, @overall, @study_zone, @courses, @comment, @lang)
`);

const star = v => {
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 && n <= 5 ? n : null;
};
const text = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '') || null;

app.post('/api/ratings', (req, res) => {
  const b = req.body || {};
  const overall = star(b.overall);
  if (!overall) return res.status(400).json({ error: 'overall rating (1-5) is required' });

  insert.run({
    name: text(b.name, 80),
    university: text(b.university, 120),
    overall,
    study_zone: star(b.study_zone),
    courses: star(b.courses),
    comment: text(b.comment, 1000),
    lang: b.lang === 'ar' ? 'ar' : 'en'
  });
  res.status(201).json({ ok: true });
});

app.get('/api/stats', (req, res) => {
  const row = db.prepare(`
    SELECT COUNT(*) AS count,
           ROUND(AVG(overall), 2) AS overall,
           ROUND(AVG(study_zone), 2) AS study_zone,
           ROUND(AVG(courses), 2) AS courses
    FROM ratings
  `).get();
  res.json(row);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Running on http://localhost:${PORT}`));
