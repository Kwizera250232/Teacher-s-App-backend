# AGENTS.md

## Cursor Cloud specific instructions

### Architecture

This workspace contains two independent repos:
- **Backend** (`/agent/repos/Teacher-s-App-backend`) — Node.js/Express 5 + PostgreSQL API. Runs on port 5000.
- **Frontend** (`/agent/repos/Teacher-s-App-frontent`) — Vite + React 18 SPA. Runs on port 3000.

### Running the apps

- **Backend**: `npm run dev` (nodemon) in the backend repo. Requires PostgreSQL running and a `.env` with `DATABASE_URL`, `JWT_SECRET`, `PORT=5000`.
- **Frontend**: `npm run dev -- --host` in the frontend repo. The `.env` has `VITE_API_URL=http://localhost:5000/api`.
- **Build check**: `npm run build` in the frontend repo (Vite build).

### Database setup gotchas

- The base `schema.sql` (via `npm run init-db`) does NOT create all columns used by routes. Columns like `users.phone` and `schools.email_domain`/`schools.welcome_message` are added at runtime by route files or must be manually ALTERed. If you hit column-not-found errors on registration, run:
  ```sql
  ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT;
  ALTER TABLE schools ADD COLUMN IF NOT EXISTS email_domain TEXT;
  ALTER TABLE schools ADD COLUMN IF NOT EXISTS welcome_message TEXT;
  ```
- Many tables are created via `CREATE TABLE IF NOT EXISTS` at server startup in individual route files (not in `schema.sql`).

### Testing notes

- There is **no automated test suite** — `npm test` exits with error. Validation is done via manual API calls and UI testing.
- JWT tokens contain only `{id, role}`, not `school_id`. The `resolveSchoolForAccount` function in `routes/admin.js` looks up `school_id` from the database when not present in the JWT.
- Teachers and head teachers sign up without a school code; they link a school from the dashboard (`SchoolRequestBanner`). Optional school code at signup still supported.

### Key API patterns

- Auth: `Authorization: Bearer <jwt>` header on all authenticated requests.
- API client: `src/api.js` — single fetch-based module, no axios/React Query.
- No controllers/models layer — all business logic is in route handler files under `routes/`.

### Parent invites (UI)

- Teachers: dashboard **Parent invites (per student)** → picker modal → choose student → copy/share link.
- Also: class **Students** tab → **Parent invite** under each student.
- Students: **Parent invitation** modal shows unique **parent code** + link (`utils/parentInviteApi.js` tries GET then POST). Parent signup: `/invite?parent_token=...` (same form as staff invites).

### Composition status (C. Status)

- Student dashboard: **Add C. Status** only (no composer on dashboard). No approved composition → Profile (`?compose=composition`). Pick approved share → 7-day status with view list for owner.
- Teachers: class tab **C. Status**; **Tools** tab → school-wide list when linked to a school. HT **School** tab also lists school statuses.
- Components: `CompositionStatusPanel.jsx`, `CompositionStatusList.jsx`.

### Staff / parent communication hub

- **Teachers only** see **Join a school** (`SchoolRequestBanner`); HT approves in **School** tab.
- Teacher dashboard tabs: **Classes | Chats | Tools** (no **School** tab). **Head teacher** adds **School** tab.
- WhatsApp-style shell: `app-wa-shell` in `App.jsx`, `MobileDashboard.css`, `styles/WaAppShell.css`.
- Parents: `/parent/dashboard` — Chats, feed, school (pinned announcements), child summary with **Today / week / term** filters.
- Notify parents: in-app + optional email (`also_email` when SMTP configured). School announcements support **pin**.

### Email signup (UI)

- Staff register with a **school email username** (shown as `user@schooldomain.edu`) and log in with that address only.
- Students use Gmail or school email on the register form; backend validates on submit.
- CLI: `npm run check-email -- user@gmail.com` in the backend repo.

### Parent hub & school communication

- Parent UI: `ParentHub` at `/parent/dashboard` (tabs: Chats, Classroom feed, School, My child). Legacy feed-only UI remains at `/parent/legacy`.
- Parent API hub: `GET /api/parent/hub`, `GET /api/parent/children/:id/summary`, notifications under `/api/parent/notifications`.
- Staff: `SchoolHubPanel` on teacher/HT dashboards; `POST /api/parent/notify` and `POST /api/parent/school/announcements` deliver **in-app** notifications + chat messages (not external email).
- HT-only: `POST /api/parent/school/teachers`, `PUT /api/parent/school/profile` (district/sector).
- Parent ↔ teacher/HT messaging rules live in `lib/messagingAccess.js`.
- Hub tables/columns are ensured at startup via `lib/parentHub.js` (`school_announcements`, `parent_notifications`, `schools.district`, `schools.sector`).
- Join school / add pupils: frontend calls `/api/admin/*` (`SchoolRequestBanner`, `SchoolRequestsPanel`, `AddStudentsModal`).
- Password reset: `/forgot-password` — email + new password only (`POST /auth/reset-password`, no OTP code).
