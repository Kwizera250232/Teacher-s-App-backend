# Deploy to Teacher-s-App-frontent (Vercel)

The UI is synced from `student-web/` in this repo. To update https://student.umunsi.com:

```bash
git clone https://github.com/Kwizera250232/Teacher-s-App-frontent.git
cd Teacher-s-App-frontent
git pull ../Teacher-s-App-backend/patches/frontend-vercel-deploy/frontend-deploy.bundle main
git push origin main
```

Or from backend repo path:

```bash
git pull "$(pwd)/patches/frontend-vercel-deploy/frontend-deploy.bundle" main
```

Vercel project: https://vercel.com/kwizera-jean-de-dieus-projects/teacher-s-app-frontent

Connect Git in Vercel → Settings → Git → `Teacher-s-App-frontent` if not already linked.
