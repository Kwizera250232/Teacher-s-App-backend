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

### Email rules

- **Teachers / head teachers:** create a unique **school email** at signup (`school_email_local` → `name@schooldomain.edu`). That address is the login email.
- **Students / parents:** Gmail or the school’s `@email_domain` only. Validated on register; optional strict mailbox check via `STRICT_EMAIL_VALIDATE=true`.
- **CLI:** `npm run check-email -- user@gmail.com` (add `--school-domain school.edu` for school addresses).
