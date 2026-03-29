# FPK Archive — Academic File Sharing System

A full-stack academic file archive built for the MSc Data Science program at FPK.

## Features

- 🔐 User registration & login (bcrypt hashed passwords)
- 🎓 Role-based access (Student / Admin)
- 📁 File upload with drag & drop (PDF, DOCX, PPTX, PNG, XLSX, TXT)
- 🔍 Search & filter by category, course, author
- 🗑️ Admin panel: manage files, edit metadata, bulk delete
- 📊 Dashboard with stats, category breakdown, top downloads
- 🌙 Dark theme UI

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | HTML, CSS, JavaScript (Vanilla) |
| Backend | Node.js, Express.js |
| Auth | bcryptjs (hashed passwords) |
| Storage | JSON flat files (database.json, users.json) |
| File Upload | Multer |

## Getting Started

```bash
# Install dependencies
npm install

# Start the server
node server.js
```

Then open `login.html` in your browser. The backend runs on `http://localhost:3000`.

## Project Structure

```
File_upload_system/
├── index.html       # Student dashboard
├── login.html       # Login page
├── register.html    # Registration page
├── admin.html       # Admin control panel
├── style.css        # Shared dark theme
├── server.js        # Express backend
├── database.json    # File metadata storage
├── users.json       # User accounts storage
└── uploads/         # Uploaded files directory
```

## API Endpoints

| Method | Route | Description |
|---|---|---|
| POST | /api/auth/register | Register a new user |
| POST | /api/auth/login | Login |
| GET | /api/files | Get all files |
| POST | /api/upload | Upload a file |
| PUT | /api/files/:id | Update file metadata |
| DELETE | /api/files/:id | Delete a file |
| PATCH | /api/files/:id/download | Increment download count |

## Authors

MSc SIIA — Polydisciplinary Faculty of Khouribga, 2025/2026
