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

`student.umunsi.com` DNS points to **Vercel** (old `student-wa-dashboard` — classes often missing). The live UI is on the API host:

**https://studentapi.umunsi.com/app/**

1. **Fastest:** Use the link above (square class cards, Dean AI, visible **My classes**).
2. **Auto-push to Vercel:** Add GitHub secret `FRONTEND_DEPLOY_TOKEN` (PAT with `repo` on `Teacher-s-App-frontent`), then run workflow **Push frontend (Vercel)** or:
   ```bash
   FRONTEND_DEPLOY_TOKEN=ghp_xxx bash scripts/push-frontend-deploy.sh
   ```
3. **Or point DNS:** `student.umunsi.com` A → `93.127.186.217` (nginx at `/home/umunsi/htdocs/student.umunsi.com/`).
4. **Or Vercel project root:** Point the Vercel project at this repo; root `vercel.json` builds `student-web/`.
