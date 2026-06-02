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
| `SSH_HOST`, `SSH_USER`, `SSH_PRIVATE_KEY` | Workflow SSH pull + pm2 restart (`SSH_HOST` = `93.127.186.217` only — not `ssh root@…`) |
| `DEPLOY_HOOK_SECRET` | Same value in server `.env` — workflow calls `POST /api/hooks/redeploy` |
| `FRONTEND_DEPLOY_TOKEN` | GitHub PAT with push access to `Teacher-s-App-frontent` (updates student.umunsi.com) |
| `VERCEL_TOKEN` + org/project IDs | Optional — `scripts/deploy-vercel-frontend.sh` |

### One-command deploy (Hostinger SSH terminal)

If GitHub Actions cannot SSH (missing `SSH_PRIVATE_KEY`), open **Hostinger → VPS → SSH** and run:

```bash
curl -fsSL https://raw.githubusercontent.com/Kwizera250232/Teacher-s-App-backend/main/scripts/hostinger-terminal-deploy.sh | bash
```

This updates the API and **https://studentapi.umunsi.com/app/** (latest UI with Class Now + reactions).

For **https://student.umunsi.com** (Vercel), also push `student-web` to `Teacher-s-App-frontent` or add `FRONTEND_DEPLOY_TOKEN` to GitHub secrets.

Then run workflow **Finish deploy (API + Vercel)** on `main`.

### SSH fingerprints (do not paste these into GitHub Secrets)

A line like `SHA256:jYsWizDft9Sm+…` is a **fingerprint** (thumbprint) for checking identity — it is **not** the private key. GitHub secret `SSH_PRIVATE_KEY` must be the full PEM file (`-----BEGIN OPENSSH PRIVATE KEY-----` …).

**VPS `93.127.186.217` host keys** (verify when SSH warns “authenticity of host”):

| Type | SHA256 fingerprint |
|------|-------------------|
| ED25519 | `SHA256:xoSMmuoeTK+wi2q3t+s1Q3+xhfD8BCuMNn+E2xMgmyc` |
| RSA | `SHA256:UKTrE1yKO7Q9KSj/wPuDP3Bm3pHcJy1advJtEy3LMgg` |

If Hostinger shows `SHA256:jYsWizDft9Sm+hAuCTR9zWtpWeehF5XLunkPQPf/IBo`, it does **not** match this server today — confirm the IP is `93.127.186.217` or refresh keys in hPanel.

**GitHub Actions deploy key** (installed on VPS `authorized_keys`):

- Public key comment: `github-actions-uclass-deploy`
- Fingerprint: `SHA256:QHVXtjaCd/iUdfnwna2gY2Tl0qC5HRwznbq8CLy8Y7s`

Add the matching **private key** (entire file) to repo secret `SSH_PRIVATE_KEY`, plus `SSH_HOST=93.127.186.217`, `SSH_USER=root`. Regenerate locally with `bash scripts/create-github-deploy-key.sh` if you need a new pair.

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

### Real school email (`@schoolslug.mail.umunsi.com`)

Staff sign up with a **real** address (usable on Cursor, Google, etc.). Inbound mail is **forwarded** to their verified personal Gmail/Yahoo/Outlook.

1. In `.env` on the VPS:
   - `SCHOOL_MAIL_ENABLED=true`
   - `SCHOOL_MAIL_BASE_DOMAIN=mail.umunsi.com`
   - `SMTP_*` (sends verification codes + forwards)
   - `MAILGUN_API_KEY`, `MAILGUN_DOMAIN=mail.umunsi.com`, `MAILGUN_WEBHOOK_SIGNING_KEY` (inbound)
2. **DNS** for `mail.umunsi.com` (Mailgun): MX + SPF + DKIM per Mailgun dashboard.
3. Mailgun route: forward `*@*.mail.umunsi.com` → `https://studentapi.umunsi.com/api/mail/inbound`
4. After deploy, `GET https://studentapi.umunsi.com/api/mail/status` should show `"enabled": true`.

## GitHub Action (optional)

Workflow: `.github/workflows/deploy-server.yml`

Secrets: `SSH_HOST` (use `93.127.186.217` for root password SSH), `SSH_USER` (`root`), `SSH_PRIVATE_KEY`, optional `BACKEND_APP_DIR`, `SSH_PORT`

PM2 process on VPS is usually **`school-api`** (not `studentapi`): `pm2 restart school-api`

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
