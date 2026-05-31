# WhatsApp / classic student dashboard UI (frontend sync)

Copy into [Teacher-s-App-frontent](https://github.com/Kwizera250232/Teacher-s-App-frontent) before Vercel deploy:

```bash
cd Teacher-s-App-backend
bash scripts/sync-whatsapp-dashboard-ui.sh /path/to/Teacher-s-App-frontent
cd /path/to/Teacher-s-App-frontent
git add -A && git commit -m "Deploy: square class cards, Dean AI, parent-invite fallbacks"
git push origin main
```

**Student UI after deploy**

- Square class cards (`classes-grid--square`), not a narrow chat-only list
- Same bottom shortcuts on phone and desktop (`student-desktop-quick-nav` + `MobileBottomBar`)
- Dean AI banner + FAB at the bottom
- Parent invite + C. Status use API fallbacks in `utils/parentInviteApi.js` and `CompositionStatusPanel.jsx`

**Requires API on `main` (PR #5)** — after VPS `pm2 restart`, `POST /api/auth/parent-invite` without a token must return **401**, not **404**.
