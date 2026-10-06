const express = require('express');      // found in the parent folder's node_modules
const Database = require('better-sqlite3');
const crypto = require('crypto');
const path = require('path');

const PASSWORD = process.env.DASH_PASSWORD;
if (!PASSWORD) {
  console.error('Set DASH_PASSWORD first, e.g.  DASH_PASSWORD=mysecret node server.js');
  process.exit(1);
}

// Open the SAME database file as the rating site, read-only
const db = new Database(path.join(__dirname, '..', 'ratings.db'), {
  readonly: true,
  fileMustExist: true
});

const app = express();

// Password protection (HTTP Basic Auth): the browser shows a login popup
function safeEqual(a, b) {
  const x = crypto.createHash('sha256').update(a).digest();
  const y = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(x, y);
}
app.use((req, res, next) => {
  const header = req.headers.authorization || '';
  const [scheme, encoded] = header.split(' ');
  if (scheme === 'Basic' && encoded) {
    const decoded = Buffer.from(encoded, 'base64').toString();
    const pass = decoded.slice(decoded.indexOf(':') + 1);
    if (safeEqual(pass, PASSWORD)) return next();
  }
  res.set('WWW-Authenticate', 'Basic realm="Domains dashboard"');
  res.status(401).send('Login required');
});

app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/ratings', (req, res) => {
  res.json(db.prepare('SELECT * FROM ratings ORDER BY id DESC').all());
});

app.get('/api/stats', (req, res) => {
  res.json(db.prepare(`
    SELECT COUNT(*) AS count,
           ROUND(AVG(overall), 2) AS overall,
           ROUND(AVG(study_zone), 2) AS study_zone,
           ROUND(AVG(courses), 2) AS courses
    FROM ratings`).get());
});

const PORT = process.env.DASH_PORT || 4000;
app.listen(PORT, () => console.log(`Dashboard on http://localhost:${PORT}`));
