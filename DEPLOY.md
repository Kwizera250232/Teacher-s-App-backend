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
