const express  = require('express');
const cors     = require('cors');
const multer   = require('multer');
const path     = require('path');
const fs       = require('fs');
const bcrypt   = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

const app  = express();
const PORT = 3000;
const DB_PATH      = path.join(__dirname, 'database.json');
const UPLOADS_PATH = path.join(__dirname, 'uploads');
const USERS_PATH   = path.join(__dirname, 'users.json');

/* ──────────────────────────────────────────
   MIDDLEWARE
────────────────────────────────────────── */
app.use(cors({ origin: 'http://localhost:3000' }));
app.use(express.json());
app.use('/uploads', express.static(UPLOADS_PATH));

/* ──────────────────────────────────────────
   SERVE STATIC HTML FILES
────────────────────────────────────────── */
app.use(express.static(path.join(__dirname)));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin.html'));
});

/* ──────────────────────────────────────────
   DATABASE HELPERS
────────────────────────────────────────── */
function readDB()      { try { return JSON.parse(fs.readFileSync(DB_PATH,    'utf-8')); } catch { return []; } }
function writeDB(d)    { fs.writeFileSync(DB_PATH,    JSON.stringify(d, null, 2), 'utf-8'); }
function readUsers()   { try { return JSON.parse(fs.readFileSync(USERS_PATH, 'utf-8')); } catch { return []; } }
function writeUsers(d) { fs.writeFileSync(USERS_PATH, JSON.stringify(d, null, 2), 'utf-8'); }

function formatSize(bytes) {
  if (bytes < 1024)        return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/* ──────────────────────────────────────────
   ADMIN TOKEN GUARD
────────────────────────────────────────── */
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'fpk-admin-2026';
function requireAdmin(req, res, next) {
  const token = req.headers['x-admin-token'];
  if (token !== ADMIN_TOKEN)
    return res.status(403).json({ error: 'Forbidden. Admin token required.' });
  next();
}

/* ──────────────────────────────────────────
   MULTER — FILE STORAGE CONFIG
────────────────────────────────────────── */
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_PATH),
  filename:    (req, file, cb) => cb(null, `${Date.now()}-${file.originalname.replace(/\s+/g, '_')}`),
});

const ALLOWED_TYPES = /pdf|docx|doc|png|jpg|jpeg|txt|pptx|xlsx/;

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase().slice(1);
    ALLOWED_TYPES.test(ext) ? cb(null, true) : cb(new Error(`File type ".${ext}" is not allowed.`));
  },
});

/* ══════════════════════════════════════════
   AUTH ROUTES
══════════════════════════════════════════ */

/* REGISTER — POST /api/auth/register */
app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, password, role, display } = req.body;
    if (!username || !password)
      return res.status(400).json({ error: 'Username and password are required.' });

    const strongPwd = /^(?=.*[A-Za-z])(?=.*\d).{6,}$/;
    if (!strongPwd.test(password))
      return res.status(400).json({ error: 'Password must be at least 6 characters and include a letter and a number.' });

    const users = readUsers();
    if (users.find(u => u.username === username.trim().toLowerCase()))
      return res.status(409).json({ error: 'Username already exists.' });

    const hashed  = await bcrypt.hash(password, 10);
    const newUser = {
      id:        uuidv4(),
      username:  username.trim().toLowerCase(),
      password:  hashed,
      role:      role === 'admin' ? 'admin' : 'student',
      display:   (display || username).trim(),
      createdAt: new Date().toISOString(),
    };
    users.push(newUser);
    writeUsers(users);
    console.log(`[REGISTER] ${newUser.username} (${newUser.role})`);
    res.status(201).json({
      message: 'Account created successfully.',
      user: { id: newUser.id, username: newUser.username, role: newUser.role, display: newUser.display },
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* LOGIN — POST /api/auth/login */
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password, role } = req.body;
    if (!username || !password)
      return res.status(400).json({ error: 'Username and password are required.' });

    const users = readUsers();
    const user  = users.find(u => u.username === username.trim().toLowerCase());
    if (!user)
      return res.status(401).json({ error: 'Invalid username or password.' });

    const match = await bcrypt.compare(password, user.password);
    if (!match)
      return res.status(401).json({ error: 'Invalid username or password.' });

    if (role === 'admin' && user.role !== 'admin')
      return res.status(403).json({ error: 'Access denied. Not an admin account.' });

    console.log(`[LOGIN] ${user.username} (${user.role})`);
    res.json({
      message: 'Login successful.',
      user: { id: user.id, username: user.username, role: user.role, display: user.display },
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* LIST USERS — GET /api/auth/users  [admin only] */
app.get('/api/auth/users', requireAdmin, (req, res) => {
  const users = readUsers().map(u => ({
    id: u.id, username: u.username, role: u.role, display: u.display, createdAt: u.createdAt,
  }));
  res.json(users);
});

/* ══════════════════════════════════════════
   FILE ROUTES
══════════════════════════════════════════ */

/* GET ALL FILES — GET /api/files */
app.get('/api/files', (req, res) => {
  res.json(readDB().slice().reverse());
});

/* UPLOAD FILE — POST /api/upload */
app.post('/api/upload', (req, res, next) => {
  upload.single('file')(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE')
        return res.status(413).json({ error: 'File too large. Maximum allowed size is 20 MB.' });
      return res.status(400).json({ error: err.message });
    }
    next();
  });
}, (req, res) => {
  try {
    const { title, category, course, description, author } = req.body;
    if (!title || !category) {
      if (req.file) fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: 'Title and Category are required.' });
    }
    const record = {
      id:           uuidv4(),
      title:        title.trim(),
      category:     category.trim(),
      course:       (course || 'General').trim(),
      description:  (description || '').trim(),
      author:       (author || 'Anonymous').trim(),
      fileName:     req.file ? req.file.filename : null,
      filePath:     req.file ? `/uploads/${req.file.filename}` : null,
      originalName: req.file ? req.file.originalname : null,
      fileSize:     req.file ? formatSize(req.file.size) : 'N/A',
      ext:          req.file ? path.extname(req.file.originalname).toLowerCase().slice(1) : 'pdf',
      date:         new Date().toISOString().slice(0, 10),
      downloads:    0,
    };
    const db = readDB();
    db.push(record);
    writeDB(db);
    console.log(`[UPLOAD] "${record.title}" by ${record.author} — ${record.fileSize}`);
    res.status(201).json({ message: 'File uploaded successfully.', file: record });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* UPDATE FILE METADATA — PUT /api/files/:id */
app.put('/api/files/:id', (req, res) => {
  const db  = readDB();
  const idx = db.findIndex(f => f.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'File not found.' });
  const { title, category, course, description, author } = req.body;
  db[idx] = { ...db[idx], title, category, course, description, author };
  writeDB(db);
  res.json({ message: 'Updated.', file: db[idx] });
});

/* DELETE FILE — DELETE /api/files/:id */
app.delete('/api/files/:id', (req, res) => {
  const db    = readDB();
  const index = db.findIndex(f => f.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: 'File not found.' });
  const record = db[index];
  if (record.fileName) {
    const fp = path.join(UPLOADS_PATH, record.fileName);
    if (fs.existsSync(fp)) fs.unlinkSync(fp);
  }
  db.splice(index, 1);
  writeDB(db);
  res.json({ message: `"${record.title}" deleted successfully.` });
});

/* INCREMENT DOWNLOADS — PATCH /api/files/:id/download */
app.patch('/api/files/:id/download', (req, res) => {
  const db     = readDB();
  const record = db.find(f => f.id === req.params.id);
  if (!record) return res.status(404).json({ error: 'File not found.' });
  record.downloads += 1;
  writeDB(db);
  res.json({ downloads: record.downloads });
});

/* ══════════════════════════════════════════
   STATS ROUTE  ← NEW
══════════════════════════════════════════ */

/* GET STATS — GET /api/stats */
app.get('/api/stats', (req, res) => {
  try {
    const files          = readDB();
    const users          = readUsers();
    const totalDownloads = files.reduce((sum, f) => sum + (f.downloads || 0), 0);
    res.json({
      files:     files.length,
      users:     users.length,
      downloads: totalDownloads,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ──────────────────────────────────────────
   GLOBAL ERROR HANDLER
────────────────────────────────────────── */
app.use((err, req, res, next) => {
  console.error('[ERROR]', err.message);
  res.status(400).json({ error: err.message });
});

/* ──────────────────────────────────────────
   START SERVER
────────────────────────────────────────── */
app.listen(PORT, () => {
  console.log(`\n🚀 FPK Archive backend running at http://localhost:${PORT}`);
  console.log(`   POST http://localhost:${PORT}/api/auth/register`);
  console.log(`   POST http://localhost:${PORT}/api/auth/login`);
  console.log(`   GET  http://localhost:${PORT}/api/files`);
  console.log(`   POST http://localhost:${PORT}/api/upload`);
  console.log(`   GET  http://localhost:${PORT}/api/stats`);
  console.log(`   GET  http://localhost:${PORT}/api/auth/users  [admin token required]\n`);
});