# AGENTS.md

## Cursor Cloud specific instructions

### Running the backend

- `npm run dev` starts nodemon on port 5000.
- Requires PostgreSQL with a `studentapp` database. Configure via `DATABASE_URL` in `.env`.
- Run `npm run init-db` once to apply `schema.sql`, then manually add missing columns (see below).
- **Cursor Cloud VM (no Docker):** PostgreSQL 16 is installed on the host. Start it with `sudo service postgresql start` (this environment has no systemd). Use `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/studentapp` if you create `.env` from `.env.example`. Copy `.env.example` → `.env` and set `EXPOSE_RESET_CODE=true` / `SCHOOL_MAIL_ENABLED=false` for frictionless local dev.

### Database schema fragmentation

The schema is split between `schema.sql` and runtime `CREATE TABLE IF NOT EXISTS` / `ALTER TABLE` in route files. After `init-db`, you may need:
```sql
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE schools ADD COLUMN IF NOT EXISTS email_domain TEXT;
ALTER TABLE schools ADD COLUMN IF NOT EXISTS welcome_message TEXT;
```

### Auth

- JWT payload: `{id, role}` — does NOT include `school_id`.
- `resolveSchoolForAccount` in `routes/admin.js` fetches `school_id` from the DB when not in the JWT.
- Roles: `student`, `teacher`, `head_teacher`, `admin`, `parent`.

### Parent invites

- Teachers/HT: `POST /api/parent/students/:studentId/parent-link` (requires manage access to a class the student is in).
- `GET /api/parent/invitable-students` — student list for dashboard picker.
- Students: **GET or POST** `/api/auth/parent-invite`, `/api/student/parent-invite`, `/api/parent/my/parent-invite` (returns `invite_link`, `token`, `student_name`).
- Production (`studentapi.umunsi.com`) must match `main`; after VPS deploy, `POST /api/auth/parent-invite` without token should return **401**, not **404**.

### Composition status (7-day “C. Status”)

- `GET /api/composition-status/mine` — student active status + viewers.
- `GET /api/composition-status/pickable-shares` — approved compositions to publish.
- `POST /api/composition-status` body `{ share_id }` — publish (requires approved `student_shares` composition).
- `GET /api/composition-status/class/:classId` — teachers; `GET /api/composition-status/school` — staff with `school_id`.
- `POST /api/composition-status/:id/view` — record view (not owner).

### Production API deploy (VPS)

**Guest marks / Class Now / parent invite** need current `main` on the VPS. If `GET /api/classes/1/guest-marks` returns **404**, run `scripts/hostinger-terminal-deploy.sh` on the server — **not** only `pm2 restart studentapi` (see `scripts/restart-production-api.sh`).

### Production API deploy (no GitHub SSH secrets)

Manual on VPS (`93.127.186.217`): Hostinger one-liner (pull + `restart-production-api.sh` + verify): `curl -fsSL https://raw.githubusercontent.com/Kwizera250232/Teacher-s-App-backend/main/scripts/hostinger-terminal-deploy.sh | bash`. See `scripts/deploy-production.sh` and `DEPLOY.md`. Do **not** use only `pm2 restart studentapi`.

**Vercel** (`student.umunsi.com`): deploys from `Teacher-s-App-frontent` `main` (or `bash scripts/sync-student-web-to-frontend.sh` from backend repo). **API VPS** must be updated separately; GitHub Actions needs `SSH_PRIVATE_KEY` or run the Hostinger script above.

**Class Moments upload:** `POST /api/class-moments` requires `momentPhotosMiddleware()` (with `()`) in `routes/class_moments.js` — without it uploads hang.

After deploy, these must return **401** without a token (not **404**): `POST /api/auth/parent-invite`, `POST /api/parent/my/parent-invite`, `GET /api/composition-status/mine`. If students see “server update” or parent invite “insufficient role”, production is still on an old build.
- Invite URLs use request `Origin` when allowed, else `FRONTEND_URL` (default `https://student.umunsi.com`).
- Signup: `/invite?parent_token=...` → `POST /auth/register` with `parent_token`; parents use Gmail/Yahoo/Outlook-style emails.

### School join & parent comms

- Teachers only: `POST /api/admin/request-school` → HT `PUT /api/admin/school-requests/:id/approve`.
- `POST /api/parent/notify` and school announcements: in-app notify + chat (`context_json` with school/child); optional `also_email`.
- Child summary: `GET /api/parent/children/:id/summary?period=today|week|term|all`.

### Quiz share & guest accounts

- Teachers/HT: `POST /api/classes/:classId/quizzes/:quizId/share` → `share_url` on `FRONTEND_URL` (`/quiz/share/:token`).
- Public preview: `GET /api/public/quizzes/:token`.
- Guest signup: `role: guest`, `guest_email_local` → `name@guest.umunsi.com`; optional `quiz_share_token` grants `guest_class_access`.
- Guest API: `/api/guest/hub`, `/api/guest/profile`, `/api/guest/classes/:classId/{announcements,notes,homework,quizzes}`, `/api/guest/claim-share`; take quiz via class quiz routes; `is_guest` attempts excluded from leaderboards.
- Claiming a share unlocks **all classes** owned by that class’s teacher (all their quizzes). Admin: `GET /admin/guests`, suspend/delete guests.

### No test suite

`npm test` runs a small smoke script. Manual API testing or frontend UI testing is used for verification.

### Today's Class Moments (Class Now)

- Teachers/HT: dashboard tab **Class Now** — post 1–10 photos + description per class (`POST /api/class-moments`, multipart `photos`).
- Parents/students: home hero card + feed (`GET /api/class-moments/feed`, `GET /api/class-moments/preview`).
- Notifications: `parent_notifications` (type `class_moment`) + `user_notifications` for students; browser alerts via polling preview.
- Tables: `class_moments`, `class_moment_images`, `class_moment_reads`, `user_notifications` (`lib/classMomentsSchema.js`).
- Mark parent notifs read: `PUT /api/parent/notifications/read-by-moment/:momentId`.

### Parent hub API (mounted at `/api/parent` alongside `parent_portal`)

- `routes/parent_hub.js` — hub overview, child summary, school announcements, parent notify, HT add teacher.
- Schema helpers in `lib/parentHub.js`; messaging policy in `lib/messagingAccess.js`; in-app homework reminders in `lib/parentReminders.js` (runs on `GET /parent/hub`).
- JWT is enriched with `school_id` on every authenticated request (`lib/enrichUser.js` via `middleware/auth.js`).
- School admin routes are under `/api/admin/*` (not `/api/school/*`).
- School join requests: only `teacher` role may use `POST /api/admin/request-school` (not head_teacher).
- Local Postgres: `docker compose up -d` in backend repo; `npm test` runs module smoke tests.

### Email rules

- **Teachers / head teachers:** `school_email_local` → `name@schoolslug.mail.umunsi.com` (when `SCHOOL_MAIL_ENABLED=true`). Real address for **UClass login**, **in-app Chats**, and **external sites** (Cursor, etc.). Inbound mail forwards to verified personal Gmail/Yahoo/Outlook (`POST /api/auth/school-mail/send-code` + `confirm-code`).
- **Mail:** `lib/schoolMail.js`, `routes/mail.js` (Mailgun inbound `POST /api/mail/inbound`). Requires SMTP + Mailgun DNS on `SCHOOL_MAIL_BASE_DOMAIN`.
- **Students:** Gmail or school domain; **Parents:** personal providers only.
- **CLI:** `npm run check-email -- user@gmail.com`
