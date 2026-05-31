# AGENTS.md

## Cursor Cloud specific instructions

### Running the backend

- `npm run dev` starts nodemon on port 5000.
- Requires PostgreSQL with a `studentapp` database. Configure via `DATABASE_URL` in `.env`.
- Run `npm run init-db` once to apply `schema.sql`, then manually add missing columns (see below).

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

### Production API deploy (no GitHub SSH secrets)

Manual on VPS (`93.127.186.217`): `cd` app dir → `git pull origin main` → `npm ci --omit=dev` → `pm2 restart studentapi`. See `scripts/deploy-production.sh` and `DEPLOY.md`.

After deploy, these must return **401** without a token (not **404**): `POST /api/auth/parent-invite`, `POST /api/parent/my/parent-invite`, `GET /api/composition-status/mine`. If students see “server update” or parent invite “insufficient role”, production is still on an old build.
- Invite URLs use request `Origin` when allowed, else `FRONTEND_URL` (default `https://student.umunsi.com`).
- Signup: `/invite?parent_token=...` → `POST /auth/register` with `parent_token`; parents use Gmail/Yahoo/Outlook-style emails.

### School join & parent comms

- Teachers only: `POST /api/admin/request-school` → HT `PUT /api/admin/school-requests/:id/approve`.
- `POST /api/parent/notify` and school announcements: in-app notify + chat (`context_json` with school/child); optional `also_email`.
- Child summary: `GET /api/parent/children/:id/summary?period=today|week|term|all`.

### No test suite

`npm test` runs a small smoke script. Manual API testing or frontend UI testing is used for verification.

### Parent hub API (mounted at `/api/parent` alongside `parent_portal`)

- `routes/parent_hub.js` — hub overview, child summary, school announcements, parent notify, HT add teacher.
- Schema helpers in `lib/parentHub.js`; messaging policy in `lib/messagingAccess.js`; in-app homework reminders in `lib/parentReminders.js` (runs on `GET /parent/hub`).
- JWT is enriched with `school_id` on every authenticated request (`lib/enrichUser.js` via `middleware/auth.js`).
- School admin routes are under `/api/admin/*` (not `/api/school/*`).
- School join requests: only `teacher` role may use `POST /api/admin/request-school` (not head_teacher).
- Local Postgres: `docker compose up -d` in backend repo; `npm test` runs module smoke tests.

### Email rules

- **Teachers / head teachers:** create a unique **school email** at signup (`school_email_local` → `name@schooldomain.edu`). That address is the login email.
- **Students / parents:** Gmail or the school’s `@email_domain` only. Validated on register; optional strict mailbox check via `STRICT_EMAIL_VALIDATE=true`.
- **CLI:** `npm run check-email -- user@gmail.com` (add `--school-domain school.edu` for school addresses).
