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
