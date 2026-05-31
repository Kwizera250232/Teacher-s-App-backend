# Deploy frontend (Vercel)

Production: **https://student.umunsi.com**

## Auto-deploy from GitHub

1. Vercel → Import `Teacher-s-App-frontent` from GitHub.
2. Build: `npm run build` · Output: `dist` · Framework: Vite.
3. Env: `VITE_API_URL=https://studentapi.umunsi.com/api`
4. Domain: `student.umunsi.com`
5. Push to **`main`** triggers deploy.

## GitHub Action (optional)

Workflow: `.github/workflows/deploy-vercel.yml`

Secrets: `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`

Run manually: Actions → **Deploy frontend (Vercel)** → Run workflow.

## Local production build check

```bash
npm ci
npm run build
```
