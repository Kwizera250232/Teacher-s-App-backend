# Deploy backend API

Production: **https://studentapi.umunsi.com**

## On your server (PM2)

```bash
cd /home/umunsi/htdocs/studentapi.umunsi.com   # or /var/www/Teacher-s-App-backend
git pull origin main
npm ci --omit=dev
pm2 restart studentapi || pm2 restart student-app-api
curl -s https://studentapi.umunsi.com/api/health
```

Expect `"build":"414b474..."` (or newer) in health JSON after deploy.

### One-time: enable GitHub auto-deploy

In **Teacher-s-App-backend** → Settings → Secrets, add **one** of:

| Secret | Purpose |
|--------|---------|
| `SSH_HOST`, `SSH_USER`, `SSH_PRIVATE_KEY` | Workflow SSH pull + pm2 restart |
| `DEPLOY_HOOK_SECRET` | Same value in server `.env` — workflow calls `POST /api/hooks/redeploy` |
| `FRONTEND_DEPLOY_TOKEN` | Push `student-web` → **Teacher-s-App-frontent** (Vercel) |
| `VERCEL_TOKEN` + org/project ids | Direct Vercel deploy |

Then run workflow **Finish deploy (API + Vercel)** on `main`.

### Update student.umunsi.com (Vercel) without PAT

On any machine with push access to **Teacher-s-App-frontent**:

```bash
git clone https://github.com/Kwizera250232/Teacher-s-App-frontent.git
cd Teacher-s-App-frontent
git pull /path/to/Teacher-s-App-backend/frontend-deploy.bundle main
git push origin main
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

### Vercel still on old UI? (e.g. forgot-password still shows 6-digit code)

`student.umunsi.com` DNS points to **Vercel** (`index-Dr5jq81L.js` — old bundle). The fixed UI is already on the server:

**https://studentapi.umunsi.com/app/forgot-password** (no code field)

Pick **one** fix:

1. **Fastest (no DNS change):** Use **https://studentapi.umunsi.com/app/** for login, register, forgot-password, messages.
2. **Update Vercel:** In GitHub → **Teacher-s-App-backend** → Settings → Secrets, add `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`, then run workflow **Deploy student UI to Vercel**. Or add `FRONTEND_DEPLOY_TOKEN` and run **Push frontend (Vercel)**.
3. **Point DNS to VPS (recommended long-term):** In Namecheap/Hostinger DNS for `umunsi.com`, set **`student`** A record → **`93.127.186.217`** (remove Vercel CNAME). SSH to VPS and run:
   ```bash
   bash scripts/setup-student-domain-vps.sh
   ```
   Then open **https://student.umunsi.com/forgot-password** (served from VPS with SSL via certbot).
