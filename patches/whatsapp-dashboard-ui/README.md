# WhatsApp dashboard UI patch (frontend)

Apply these files to [Teacher-s-App-frontent](https://github.com/Kwizera250232/Teacher-s-App-frontent) under `src/`:

```bash
cd /path/to/Teacher-s-App-frontent
cp -r /path/to/Teacher-s-App-backend/patches/whatsapp-dashboard-ui/src/* src/
npm run build
```

## Summary

- **C. Status:** Only via bottom toolbar / modal — no extra “add status” bar on the main screen.
- **Student:** Parent invite banner restored; classmates use WhatsApp chat rows with avatars (`GET /classes/:id/classmates`).
- **Teacher:** WhatsApp-style hub (green header, chat background, pill actions, parent invite banner, mobile bottom nav).
