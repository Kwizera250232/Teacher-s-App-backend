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

### No test suite

`npm test` is a placeholder. Manual API testing or frontend UI testing is used for verification.

### Email confirmation

- New accounts need `email_verified` before homework, quizzes, messages, and most class APIs (`403` + `code: EMAIL_NOT_VERIFIED`).
- Configure SMTP in `.env` (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, `APP_PUBLIC_URL`).
- Without SMTP, links are logged in dev only when resend returns `dev_verify_url`.
- Daily reminder emails run at most once per 24h on login and `GET /auth/me`.
