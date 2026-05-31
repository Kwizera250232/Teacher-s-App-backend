# Deploy to Teacher-s-App-frontent (Vercel)

Latest UI from `student-web/` in this repo, for [Teacher-s-App-frontent](https://github.com/Kwizera250232/Teacher-s-App-frontent) → [Vercel project](https://vercel.com/kwizera-jean-de-dieus-projects/teacher-s-app-frontent) → `student.umunsi.com`.

## Push to GitHub (triggers Vercel if Git is connected)

```bash
git clone https://github.com/Kwizera250232/Teacher-s-App-frontent.git
cd Teacher-s-App-frontent
git pull /path/to/Teacher-s-App-backend/patches/frontend-vercel-deploy/frontend-deploy.bundle f4391eea3ce171087162c070b50873ca1217bf50
git push origin main
```

In Vercel: **Settings → Git → Connect** `Kwizera250232/Teacher-s-App-frontent` if not linked yet.

## Or deploy with Vercel CLI

```bash
VERCEL_TOKEN=your_token bash scripts/deploy-vercel-frontend.sh
```

Get a token: https://vercel.com/account/tokens
