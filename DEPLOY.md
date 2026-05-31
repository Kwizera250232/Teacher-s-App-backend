# Deploy backend API

Production: **https://studentapi.umunsi.com**

## On your server (PM2)

```bash
cd /var/www/Teacher-s-App-backend   # adjust path
git pull origin main
npm ci --omit=dev
pm2 restart studentapi
curl -s https://studentapi.umunsi.com/api/health
```

Required `.env`: `DATABASE_URL`, `JWT_SECRET`, `PORT=5000`, `FRONTEND_URL=https://student.umunsi.com`

Optional: `SMTP_*` for parent email; `STRICT_EMAIL_VALIDATE=false`

## GitHub Action (optional)

Workflow: `.github/workflows/deploy-server.yml`

Secrets: `SSH_HOST`, `SSH_USER`, `SSH_PRIVATE_KEY`, optional `BACKEND_APP_DIR`, `SSH_PORT`

## Verify parent features

```bash
curl -s "https://studentapi.umunsi.com/api/parent/invite-preview?token=test"
# Should return 400/404 JSON — not HTML 404 page
```

## Student UI at /app/ (immediate, no Vercel push)

After `git pull` and `pm2 restart studentapi`, open:

**https://studentapi.umunsi.com/app/**

This serves the built React app from `student-web-dist/` (square class cards, Dean AI, signup shell).

Rebuild locally: `bash scripts/build-student-web-dist.sh` (requires `frontend/` clone).

`student.umunsi.com` on Vercel updates only after pushing `Teacher-s-App-frontent` **or** pointing DNS to the VPS (see below).

### Vercel still on old UI?

1. **Fastest (no git):** Open **https://studentapi.umunsi.com/app/** — always matches backend `main` after VPS deploy.
2. **Update Vercel:** On a machine logged into GitHub as the repo owner:
   ```bash
   bash scripts/sync-student-web-to-frontend.sh
   ```
   Or on the VPS (commit may already exist): `cd /root/Teacher-s-App-frontent && git push origin main`
3. **Or point DNS:** Set `student.umunsi.com` A record to `93.127.186.217` (nginx serves the new build from `/home/umunsi/htdocs/student.umunsi.com/`).
