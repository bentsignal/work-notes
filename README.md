<img src="assets/icon.svg" width="64" height="64" alt="">

# work-notes

A small Apple Notes–style notes app that runs on your own machine. Notes are stored in your local Postgres, and a tiny Node server serves the UI at `http://localhost:4747`.

- **Quick capture from the address bar:** type `notes`, press <kbd>Tab</kbd>, type a title, press <kbd>Enter</kbd>. A new note opens with your cursor in the body.
- **Search by words or meaning:** full-text search plus local AI embeddings, so "money planning" finds your "Q3 budget sync" note. Everything runs on your machine.
- **Light formatting:** bullets, checklists, headings, links, and pasted screenshots/images.
- **Recently Deleted:** deleted notes stay for 30 days, then are removed automatically.
- Every note has its own URL (`/notes/<id>`), so the back button, bookmarks, and reloads work.

## Setup (Windows)

You need [Node.js](https://nodejs.org) 20.12 or newer and a running Postgres (any version 13+).

```powershell
git clone https://github.com/<you>/work-notes.git
cd work-notes
npm install
copy .env.example .env
```

Edit `.env` and set `DATABASE_URL` to your Postgres login. The `work_notes` database is created automatically on first start.

```powershell
npm run build
npm start
```

Open http://localhost:4747. On first start the server downloads a ~25 MB search model from Hugging Face into `.cache/`. If that download is blocked, search still works but matches exact words only. Once it looks right, stop it with <kbd>Ctrl</kbd>+<kbd>C</kbd>.

### Start it automatically at login

```powershell
npm run startup:install
```

This adds a hidden launcher to your Windows Startup folder (no admin rights needed) and starts the server right away. Logs go to `server.log`. To undo it: `npm run startup:uninstall`.

### Add the Edge shortcuts

In Edge, go to `edge://settings/searchEngines` (Settings → Privacy, search, and services → Address bar and search → Manage search engines) and click **Add** for each row:

| Search engine | Shortcut | URL with %s in place of query      |
| ------------- | -------- | ---------------------------------- |
| New note      | `notes`  | `http://localhost:4747/new?title=%s` |
| Search notes  | `ns`     | `http://localhost:4747/?q=%s`        |

Then in any tab (<kbd>Ctrl</kbd>+<kbd>T</kbd>), type `notes`, press <kbd>Tab</kbd>, type a title, and press <kbd>Enter</kbd>. Going to `localhost:4747` directly opens a blank note.

A new note isn't saved until you type something into it, so opening one and leaving doesn't leave empty notes behind.

## Using it

| Action                        | How                                                     |
| ----------------------------- | ------------------------------------------------------- |
| New note                      | <kbd>Alt</kbd>+<kbd>N</kbd> or the pencil button        |
| Rename                        | Edit the title at the top of the note                   |
| Bullet / numbered list        | Start a line with `- ` or `1. `                         |
| Checklist                     | Start a line with `[ ] `                                |
| Heading                       | Start a line with `# `, `## `, or `### `                |
| Bold / italic / strikethrough | <kbd>Ctrl</kbd>+<kbd>B</kbd> / <kbd>I</kbd> / <kbd>Shift</kbd>+<kbd>S</kbd> |
| Link                          | Paste a URL, or select text and press <kbd>Ctrl</kbd>+<kbd>K</kbd> |
| Open a link                   | <kbd>Ctrl</kbd>+click                                   |
| Image                         | Paste (e.g. a <kbd>Win</kbd>+<kbd>Shift</kbd>+<kbd>S</kbd> screenshot) or drag in |
| Delete                        | Trash button on the note, or hover a note in the sidebar |

Notes save automatically as you type. Search results marked ≈ matched by meaning rather than exact words.

## Updating

```powershell
git pull
npm install
npm run build
npm run startup:install   # restarts the server
```

## Backups

Everything (notes and images) is in the `work_notes` database:

```powershell
pg_dump -Fc work_notes > notes-backup.dump
```

## Development

```powershell
npm run dev   # UI on http://localhost:5173 with hot reload, API on :4747
```

Stack: React, Vite, TanStack Router + Query, and Tiptap on the front end; Hono, Drizzle, and Postgres on the server; transformers.js (`all-MiniLM-L6-v2`) for embeddings. After changing `server/schema.ts`, run `npm run db:generate` to create a migration. Migrations are applied automatically when the server starts.

Embeddings are stored as `real[]` and compared in Node, so the `pgvector` extension isn't needed. That's plenty fast for a personal notes collection.
