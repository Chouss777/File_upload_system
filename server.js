const express  = require('express');
const cors     = require('cors');
const multer   = require('multer');
const path     = require('path');
const fs       = require('fs');
const { v4: uuidv4 } = require('uuid');

const app  = express();
const PORT = 3000;
const DB_PATH      = path.join(__dirname, 'database.json');
const UPLOADS_PATH = path.join(__dirname, 'uploads');

/* ──────────────────────────────────────────
   MIDDLEWARE
────────────────────────────────────────── */
app.use(cors());               // Allow all origins — fine for local demo
app.use(express.json());

// Serve uploaded files as static assets so the frontend can link to them
app.use('/uploads', express.static(UPLOADS_PATH));

/* ──────────────────────────────────────────
   DATABASE HELPERS  (read/write database.json)
────────────────────────────────────────── */
function readDB() {
  try {
    const raw = fs.readFileSync(DB_PATH, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function writeDB(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf-8');
}

/* ──────────────────────────────────────────
   MULTER — FILE STORAGE CONFIG
────────────────────────────────────────── */
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOADS_PATH);
  },
  filename: (req, file, cb) => {
    // Prefix with timestamp to avoid name collisions
    const uniqueName = `${Date.now()}-${file.originalname.replace(/\s+/g, '_')}`;
    cb(null, uniqueName);
  },
});

const ALLOWED_TYPES = /pdf|docx|doc|png|jpg|jpeg|txt|pptx|xlsx/;

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB max
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase().slice(1);
    if (ALLOWED_TYPES.test(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`File type ".${ext}" is not allowed.`));
    }
  },
});

/* ──────────────────────────────────────────
   ROUTE 1 — GET /api/files
   Returns the full list of file metadata
────────────────────────────────────────── */
app.get('/api/files', (req, res) => {
  const files = readDB();
  // Return newest first
  res.json(files.slice().reverse());
});

/* ──────────────────────────────────────────
   ROUTE 2 — POST /api/upload
   Accepts: multipart/form-data
   Fields : title, category, course, description, author
   File   : field name "file"
────────────────────────────────────────── */
app.post('/api/upload', upload.single('file'), (req, res) => {
  try {
    const { title, category, course, description, author } = req.body;

    // Validate required text fields
    if (!title || !category) {
      // If validation fails after multer already saved the file, delete it
      if (req.file) fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: 'Title and Category are required.' });
    }

    // Build metadata record
    const record = {
      id:          uuidv4(),
      title:       title.trim(),
      category:    category.trim(),
      course:      (course || 'General').trim(),
      description: (description || '').trim(),
      author:      (author || 'Anonymous').trim(),
      // If a real file was uploaded, store its path; otherwise mark as no file
      fileName:    req.file ? req.file.filename        : null,
      filePath:    req.file ? `/uploads/${req.file.filename}` : null,
      originalName:req.file ? req.file.originalname    : null,
      fileSize:    req.file ? formatSize(req.file.size) : 'N/A',
      ext:         req.file ? path.extname(req.file.originalname).toLowerCase().slice(1) : 'pdf',
      date:        new Date().toISOString().slice(0, 10),
      downloads:   0,
    };

    // Persist to database.json
    const db = readDB();
    db.push(record);
    writeDB(db);

    console.log(`[UPLOAD] "${record.title}" by ${record.author} — ${record.fileSize}`);
    res.status(201).json({ message: 'File uploaded successfully.', file: record });

  } catch (err) {
    console.error('[UPLOAD ERROR]', err.message);
    res.status(500).json({ error: err.message });
  }
});

/* ──────────────────────────────────────────
   ROUTE 3 — DELETE /api/files/:id
   Removes the file from disk + database.json
────────────────────────────────────────── */
app.delete('/api/files/:id', (req, res) => {
  const db     = readDB();
  const index  = db.findIndex(f => f.id === req.params.id);

  if (index === -1) return res.status(404).json({ error: 'File not found.' });

  const record = db[index];

  // Delete physical file from disk if it exists
  if (record.fileName) {
    const filePath = path.join(UPLOADS_PATH, record.fileName);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      console.log(`[DELETE] Removed file: ${record.fileName}`);
    }
  }

  // Remove from database
  db.splice(index, 1);
  writeDB(db);

  res.json({ message: `"${record.title}" deleted successfully.` });
});

/* ──────────────────────────────────────────
   ROUTE 4 — PATCH /api/files/:id/download
   Increments the download counter
────────────────────────────────────────── */
app.patch('/api/files/:id/download', (req, res) => {
  const db    = readDB();
  const record = db.find(f => f.id === req.params.id);
  if (!record) return res.status(404).json({ error: 'File not found.' });

  record.downloads += 1;
  writeDB(db);
  res.json({ downloads: record.downloads });
});

/* ──────────────────────────────────────────
   HELPERS
────────────────────────────────────────── */
function formatSize(bytes) {
  if (bytes < 1024)         return `${bytes} B`;
  if (bytes < 1024 * 1024)  return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/* ──────────────────────────────────────────
   GLOBAL ERROR HANDLER (e.g. multer errors)
────────────────────────────────────────── */
app.use((err, req, res, next) => {
  console.error('[ERROR]', err.message);
  res.status(400).json({ error: err.message });
});

/* ──────────────────────────────────────────
   START SERVER
────────────────────────────────────────── */
app.listen(PORT, () => {
  console.log(`\n🚀 Lumina Archive backend running at http://localhost:${PORT}`);
  console.log(`   GET  http://localhost:${PORT}/api/files`);
  console.log(`   POST http://localhost:${PORT}/api/upload`);
  console.log(`   Uploaded files served at http://localhost:${PORT}/uploads/\n`);
});